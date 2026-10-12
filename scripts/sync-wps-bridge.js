#!/usr/bin/env node
/**
 * WPS 桥接共享层同步脚本
 *
 * 将 `shared/wps-bridge/` 下的单一来源（single source of truth）文件同步到
 * `opencode-wps-assistant/` 与 `opencode-wps-linux/` 两个平台目录。
 *
 * 设计动机：macOS 与 Linux 反向轮询桥存在大量同构 handler 代码，
 * 改 bug 需在两平台各改一遍，极易漏改。本脚本将公共逻辑收敛到
 * `shared/wps-bridge/`，平台目录文件作为「生成产物」由本脚本产出，
 * CI 用 `--check` 模式校验漂移（防止手工改动平台文件导致单源失效）。
 *
 * 同步规则：
 *  1. response.js / registry.js —— 逐字节复制（两平台原已完全相同）
 *  2. common-core.js —— 生成平台化的 common-handler.js（注入 BRIDGE_PLATFORM）
 *  3. excel/ppt/word-handler-core.js —— 生成平台化的对应 handler
 *     （三份大 handler 无平台差异，仅头部注释标记平台；源用 mac 硬化版，
 *      linux 继承同套安全护栏）
 *
 * 用法：
 *  node scripts/sync-wps-bridge.js            # 同步（写回平台目录）
 *  node scripts/sync-wps-bridge.js --check    # 只校验不写回（CI 用）
 *  node scripts/sync-wps-bridge.js --report   # 输出单源化覆盖 + 动作数基线（不写回）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHARED_DIR = path.join(ROOT, 'shared', 'wps-bridge');
const PLATFORMS = [
  { dir: 'opencode-wps-assistant', name: 'mac' },
  { dir: 'opencode-wps-linux', name: 'linux' },
];

// 三份大 handler（原为两平台双份拷贝，现已单源化到 shared）
// 无平台差异：源以 mac（硬化版）为唯一事实源，linux 继承相同安全护栏
const BIG_HANDLERS = ['excel', 'ppt', 'word'];

const isCheck = process.argv.includes('--check');
const isReport = process.argv.includes('--report');
let driftDetected = false;

function warn(msg) {
  console.error('[sync-wps-bridge] ' + msg);
}

/**
 * 生成平台化的 common-handler.js。
 * 以 shared 的 common-core.js 为单一来源，注入平台标记头后产出
 * 平台目录自包含的 common-handler.js（适配 script-tag 沙箱加载）。
 */
function buildCommonHandler(platformName) {
  const core = fs.readFileSync(path.join(SHARED_DIR, 'common-core.js'), 'utf-8');
  const header = `/**\n * 通用操作处理器（${platformName === 'mac' ? 'macOS' : 'Linux'} 入口 · 生成产物）\n *\n * ⚠️ 本文件由 scripts/sync-wps-bridge.js 从 shared/wps-bridge/common-core.js\n * 自动生成，请勿手工编辑——改动请修改 shared/wps-bridge/common-core.js 后\n * 重新运行：node scripts/sync-wps-bridge.js\n * 平台差异仅通过下方注入的 BRIDGE_PLATFORM 标记隔离。\n */\n\nvar BRIDGE_PLATFORM = '${platformName}';\n\n`;
  return header + core;
}

/**
 * 生成平台化的大 handler（excel/ppt/word）。
 * 以 shared 的 *-handler-core.js 为单一来源，仅注入平台头部注释。
 *
 * ⚠️ 去重前提核实（Issue #270）：三份 handler 均不含平台条件逻辑（零 BRIDGE_PLATFORM / 零 OS 判断），
 * 但两平台文件并非逐字节相同——存在少量内容分歧，本次统一到 mac（参考 Windows 契约的硬化版）为准：
 *   1) getActiveWorkbook：linux 原多返回 `activeSheet` 字段，已统一为不含该字段（Windows/mac 参考实现均无，且无任何下游消费方读取）。
 *   2) getOpenWorkbooks/getOpenPresentations 等列表获取：linux 原用 `fail()`（success:false），已统一为 mac 的 `ok({..., error})`（success:true + error 字段）。
 * 二者均为低影响行为对齐（mac/Windows 参考一致），非功能回归；详见 docs/DEVELOPMENT_GUIDE.md。
 */
function buildBigHandler(platformName, handlerName) {
  const core = fs.readFileSync(path.join(SHARED_DIR, handlerName + '-handler-core.js'), 'utf-8');
  const header = `/**\n * ${handlerName === 'ppt' ? 'PPT' : handlerName === 'excel' ? 'Excel' : 'Word'} 操作处理器（${platformName === 'mac' ? 'macOS' : 'Linux'} 入口 · 生成产物）\n *\n * ⚠️ 本文件由 scripts/sync-wps-bridge.js 从 shared/wps-bridge/${handlerName}-handler-core.js\n * 自动生成，请勿手工编辑——改动请修改 shared/wps-bridge/${handlerName}-handler-core.js 后\n * 重新运行：node scripts/sync-wps-bridge.js\n * 本文件由 shared core 派生（mac 硬化版为唯一事实源），不含平台条件逻辑。\n */\n\n`;
  return header + core;
}

/**
 * 平台目录 handler 文件名映射：handlerName -> 平台文件 basename
 * （excel-handler / ppt-handler / word-handler）
 */
function bigHandlerPlatformFile(handlerName) {
  return path.join('handlers', handlerName + '-handler.js');
}

/**
 * 将文件同步到平台目录；返回 true 表示发生变更（或 --check 模式下检测到漂移）。
 */
function syncFile(platformDir, sharedRelPath, platformRelPath, content) {
  const targetAbs = path.join(ROOT, platformDir, platformRelPath);
  if (content === null) {
    content = fs.readFileSync(path.join(SHARED_DIR, sharedRelPath), 'utf-8');
  }
  if (fs.existsSync(targetAbs) && fs.readFileSync(targetAbs, 'utf-8') === content) {
    return false; // 已同步
  }
  driftDetected = true;
  if (!isCheck) {
    // 确保目标父目录存在（平台目录结构缺失时避免 writeFileSync 抛 ENOENT）
    fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
    fs.writeFileSync(targetAbs, content);
    warn('已同步 ' + platformDir + '/' + platformRelPath);
  } else {
    warn('漂移: ' + platformDir + '/' + platformRelPath + ' 与 shared 不一致，请运行同步');
  }
  return true;
}

/**
 * 归一化一行代码：去除首尾空白、空行、纯注释/空块行，并剥离平台注入标记
 * （BRIDGE_PLATFORM 声明、生成产物头部注释等），用于跨平台重复率对比。
 * 注：大 handler 单源化后 mac/linux 产物除头部注释外一致，此归一化为
 * --report 复核单源状态服务。
 */
function normalizeLine(line) {
  const t = line.trim();
  if (!t) return null; // 空行
  if (/^\/\//.test(t) || /^\/\*/.test(t) || /^\*/.test(t) || /^\*\/$/.test(t)) return null; // 注释行
  if (t === '{' || t === '}' || t === ';') return null; // 空块/分号
  return t
    .replace(/var BRIDGE_PLATFORM = '[a-z]+';/, "var BRIDGE_PLATFORM = '<p>';") // 平台注入标记
    .replace(/BRIDGE_PLATFORM\.([A-Z_]+)/g, 'BRIDGE_PLATFORM.<p>'); // 平台差异引用
}

/**
 * 计算单文件的行指纹集合（去重后的非空归一化行）。
 * @returns {Set<string>}
 */
function lineFingerprintSet(fileAbs) {
  const src = fs.readFileSync(fileAbs, 'utf-8');
  const set = new Set();
  for (const raw of src.split(/\r?\n/)) {
    const n = normalizeLine(raw);
    if (n !== null) set.add(n);
  }
  return set;
}

/**
 * --report 模式：输出单源化覆盖基线。
 * 三份大 handler 已在 Issue #270 去重重构中单源化（shared 为唯一事实源），
 * 本报告复核：mac 与 linux 产物是否与 shared 一致（除头部注释/平台标记外，
 * 实质行应完全重叠），匹配率应达 100%。
 */
function runReport() {
  console.log('\n=== WPS bridge 单源化覆盖基线（Issue #270 去重重构）===');
  console.log('说明：剔除空行/注释/平台注入标记后，按行指纹复核两平台产物与 shared 一致。\n');

  const macDir = PLATFORMS.find(p => p.name === 'mac').dir;
  const linuxDir = PLATFORMS.find(p => p.name === 'linux').dir;

  const rows = [];
  for (const handler of BIG_HANDLERS) {
    const sharedAbs = path.join(SHARED_DIR, handler + '-handler-core.js');
    const macAbs = path.join(ROOT, macDir, bigHandlerPlatformFile(handler));
    const linuxAbs = path.join(ROOT, linuxDir, bigHandlerPlatformFile(handler));
    if (!fs.existsSync(sharedAbs) || !fs.existsSync(macAbs) || !fs.existsSync(linuxAbs)) {
      warn('跳过（文件缺失）: ' + handler);
      continue;
    }
    const sharedSet = lineFingerprintSet(sharedAbs);
    const macSet = lineFingerprintSet(macAbs);
    const linuxSet = lineFingerprintSet(linuxAbs);
    // 单源后：mac/linux 实质行应全等于 shared（头部注释/平台标记剔除后）
    const macMatch = [...sharedSet].filter(l => macSet.has(l)).length;
    const linuxMatch = [...sharedSet].filter(l => linuxSet.has(l)).length;
    const macPct = sharedSet.size ? Math.round((macMatch / sharedSet.size) * 1000) / 10 : 0;
    const linuxPct = sharedSet.size ? Math.round((linuxMatch / sharedSet.size) * 1000) / 10 : 0;
    rows.push({ handler, shared: sharedSet.size, macPct, linuxPct });
  }

  if (rows.length === 0) {
    warn('未找到任何可统计的 handler（请确认共享 core 文件存在），跳过基线输出');
    return;
  }

  console.log('| handler | shared 实质行 | mac 与 shared 匹配率 | linux 与 shared 匹配率 |');
  console.log('|---------|--------------|---------------------|----------------------|');
  for (const r of rows) {
    console.log(
      `| ${r.handler}-handler | ${r.shared} | ${r.macPct.toFixed(1)}% | ${r.linuxPct.toFixed(1)}% |`
    );
  }
  console.log('\n说明：匹配率越接近 100% 说明单源化越完整（两平台均从 shared 派生）。\n');
}

function main() {
  if (isReport && isCheck) {
    warn(
      '--report 与 --check 同时指定，优先执行 --report（本次不进行漂移校验）；如要校验请仅用 --check'
    );
  }
  if (isReport) {
    runReport();
    return;
  }
  if (!fs.existsSync(SHARED_DIR)) {
    warn('共享目录不存在: ' + SHARED_DIR);
    process.exit(1);
  }

  // 1. 逐字节复制的共享文件
  const copyFiles = [
    { shared: 'response.js', platform: 'utils/response.js' },
    { shared: 'registry.js', platform: 'handlers/registry.js' },
    { shared: 'handler-utils.js', platform: 'handlers/handler-utils.js' },
  ];

  // 2. 生成的 common-handler.js（按平台注入 BRIDGE_PLATFORM）
  const generated = { platform: 'handlers/common-handler.js' };

  // 3. 生成的三份大 handler（excel/ppt/word，按平台注入头部注释）
  const generatedBig = BIG_HANDLERS.map(h => ({ handler: h, platform: bigHandlerPlatformFile(h) }));

  for (const p of PLATFORMS) {
    for (const f of copyFiles) {
      syncFile(p.dir, f.shared, f.platform, null);
    }
    const handlerContent = buildCommonHandler(p.name);
    syncFile(p.dir, 'common-core.js', generated.platform, handlerContent);
    for (const g of generatedBig) {
      const bigContent = buildBigHandler(p.name, g.handler);
      syncFile(p.dir, g.handler + '-handler-core.js', g.platform, bigContent);
    }
  }

  if (driftDetected) {
    if (isCheck) {
      warn('存在漂移，请先运行 node scripts/sync-wps-bridge.js');
      process.exit(1);
    }
  } else {
    console.log('[sync-wps-bridge] 全部平台文件与 shared 一致，无需变更。');
  }
}

main();
