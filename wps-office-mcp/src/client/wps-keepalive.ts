/**
 * Input: WPS 服务地址与保活间隔
 * Output: 服务保活状态
 * Pos: WPS 服务保活器。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * WPS服务保活器 - 老王的保活神器
 * 定期检查WPS服务，断了就自动重启
 * Windows/macOS：探测内置 RelayHttpServer（:58890）
 * Linux：探测 WPS 主进程（wps/et/wpp/wpsoffice，轮询桥无 :58890 服务）
 */

import axios from 'axios';
import { exec } from 'child_process';
import { log } from '../utils/logger';

const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

// Windows/macOS 通过内置 RelayHttpServer（:58890）暴露 HTTP 服务；
// Linux 无 RelayHttpServer，WPS 加载项走反向轮询桥（MCP 侧 :58891），因此保活探测方式按平台区分。
const WPS_SERVICE_URL = 'http://127.0.0.1:58890';
const CHECK_INTERVAL = 5000; // 5秒检查一次
const STARTUP_PROTOCOL = 'ksoWPSCloudSvr://start=RelayHttpServer';

let keepaliveTimer: NodeJS.Timeout | null = null;
let isStarting = false;

/**
 * 检查Linux下WPS是否在运行
 * Linux 版 WPS 没有 RelayHttpServer（:58890），加载项是轮询 MCP 侧 :58891 的轮询服务器；
 * 因此改为探测 WPS 主进程（wps/et/wpp/wpsoffice）是否存活，避免每 5 秒误判"未运行"反复拉起。
 */
function checkLinuxWpsRunning(): boolean {
  // 用 /proc 扫描（非阻塞，与 launcher 一致），避免 execSync 同步阻塞主线程每 5s 一次
  // （MCP 是单线程进程，execSync 最长阻塞 3s 会卡顿所有正在轮询的命令）
  try {
    const procs = require('fs').readdirSync('/proc');
    // 保活判定只针对主程序（wps/et/wpp/wpsoffice）：wpspdf 是 PDF 组件进程，
    // 即使它存活也不能代表文字/表格/演示主程序在运行（轮询桥命令依赖主程序），
    // 且拉起命令也只拉起主程序——若把 wpspdf 计入，会出现「wpspdf 存活即误判 WPS 在运行、
    // 主程序未跑时轮询桥命令仍失败」的状态分裂（第 16 轮评审 info）
    const targets = new Set(['wps', 'et', 'wpp', 'wpsoffice']);
    for (const p of procs) {
      const pid = parseInt(p, 10);
      if (!pid || isNaN(pid)) continue;
      try {
        const cmdline = require('fs')
          .readFileSync('/proc/' + pid + '/cmdline', 'utf8')
          .replace(/\0/g, ' ');
        const trimmed = cmdline.trim();
        // 取第一个 token 的**文件名部分**（去掉目录）：
        // - 相对路径启动：wps → wps
        // - 绝对路径启动（.desktop/autostart）：/opt/kingsoft/wps-office/wps → wps
        // - 子进程：wpspdf → wpspdf
        const base = trimmed.split(/[\s/]+/).filter(Boolean)[0] || '';
        // 去掉路径前缀取文件名（如 /opt/kingsoft/wps-office/wps → wps）
        const name = base.split('/').pop() || '';
        if (!name) continue;
        // 精确匹配优先：wps/et/wpp/wpsoffice/wpspdf
        if (targets.has(name)) return true;
        // 兼容带版本后缀的进程名变体（如 wps-12.1.2 / et-office6 / wpspdf-6.0），
        // 但必须用**边界前缀**匹配（name === target 或以 target + '-' 开头），
        // 避免 wpscan/wpspdfx 等无关进程被误判为 WPS 在运行
        for (const t of targets) {
          if (name === t || name.startsWith(t + '-')) return true;
        }
      } catch {
        // 进程可能已退出，跳过
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 检查WPS服务是否在运行
 */
async function checkService(): Promise<boolean> {
  try {
    const res = await axios.post(`${WPS_SERVICE_URL}/version`, {}, { timeout: 2000 });
    return !!res.data;
  } catch {
    return false;
  }
}

/**
 * 启动WPS内置HTTP服务
 */
function startService(): Promise<void> {
  return new Promise(resolve => {
    if (isStarting) {
      resolve();
      return;
    }
    isStarting = true;
    log.info('[Keepalive] Starting WPS relay service...');

    if (IS_MAC) {
      // Mac下通过open命令启动WPS
      exec(`open "${STARTUP_PROTOCOL}"`, error => {
        if (error) {
          log.error('[Keepalive] Failed to start WPS service on Mac', error);
        }
        setTimeout(() => {
          isStarting = false;
          resolve();
        }, 3000);
      });
      return;
    }

    if (IS_LINUX) {
      // Linux 下按可用性拉起 WPS 家族（优先 wps，回退 et/wpp/wpsoffice），避免只装 et/wpp 时 nohup wps 失败
      // 注意：不能用 `cmd && nohup x & || ...` 链式写法（`&` 与 `||` 组合是非法 shell 语法，bash -n 直接报错）
      // 不用 break：command -v 只证明命令存在，不证明启动成功（如无 DISPLAY）——不 break 让后续命令
      // 也尝试拉起，由就绪确认阶段判断哪个真正存活（第 17 轮评审 warning）
      exec(
        'for c in wps et wpp wpsoffice; do command -v "$c" >/dev/null 2>&1 && { nohup "$c" >/dev/null 2>&1 & }; done',
        () => {
          // 就绪确认：拉起后轮询等待进程存活（最多 5s），避免固定 3s 在慢速启动场景不足导致重复拉起
          let waited = 0;
          const checkReady = () => {
            if (checkLinuxWpsRunning()) {
              isStarting = false;
              resolve();
              return;
            }
            waited += 1000;
            if (waited >= 5000) {
              log.warn('[Keepalive] WPS start timed out after 5s, continuing anyway');
              isStarting = false;
              resolve();
              return;
            }
            setTimeout(checkReady, 1000);
          };
          checkReady();
        }
      );
      return;
    }

    // Windows下通过start命令启动自定义协议
    exec(`start "" "${STARTUP_PROTOCOL}"`, error => {
      if (error) {
        log.error('[Keepalive] Failed to start WPS service', error);
      }
      // 等待服务启动
      setTimeout(() => {
        isStarting = false;
        resolve();
      }, 3000);
    });
  });
}

/**
 * 保活循环
 */
async function keepaliveLoop(): Promise<void> {
  const isRunning = IS_LINUX ? checkLinuxWpsRunning() : await checkService();
  if (!isRunning) {
    log.warn('[Keepalive] WPS service not running, restarting...');
    await startService();
  }
}

/**
 * 启动保活服务
 */
export function startKeepalive(): void {
  if (keepaliveTimer) {
    return;
  }
  log.info('[Keepalive] Starting WPS keepalive service');

  // 立即检查一次
  keepaliveLoop();

  // 定期检查
  keepaliveTimer = setInterval(keepaliveLoop, CHECK_INTERVAL);
}

/**
 * 停止保活服务
 */
export function stopKeepalive(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
    log.info('[Keepalive] Stopped WPS keepalive service');
  }
}

/**
 * 确保WPS服务可用（调用前先确保服务启动）
 */
export async function ensureService(): Promise<boolean> {
  let retries = 3;
  while (retries > 0) {
    if (IS_LINUX ? checkLinuxWpsRunning() : await checkService()) {
      return true;
    }
    await startService();
    retries--;
  }
  return false;
}

export { checkService };
