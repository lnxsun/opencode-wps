/**
 * Input: 平台信息与WPS调用参数
 * Output: WPS API 调用结果
 * Pos: 跨平台 WPS 客户端。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * WPS通信客户端 - 老王的跨平台版
 * Windows: 通过PowerShell调用WPS COM接口
 * Mac: 通过反向轮询服务器（MCP Server当服务端，WPS加载项来轮询）
 *
 * 丢，为了兼容Mac老王可是费了老大劲了
 * WPS Mac加载项在沙箱里启动不了HTTP服务器，只能反过来搞！
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import {
  WpsEndpointConfig,
  WpsApiRequest,
  WpsApiResponse,
  WpsAppType,
  WpsClientStatus,
  DocumentInfo,
  WorkbookInfo,
  PresentationInfo,
} from '../types/wps';
import { log, logRequest, logResponse } from '../utils/logger';
import { errorUtils } from '../utils/error';
import { macPollServer } from './mac-poll-server';
import { linuxPollServer } from './linux-poll-server';

// 平台通道类型：win32(PowerShell COM) / darwin(Mac 轮询桥) / linux(Linux 轮询桥)
type WpsChannel = 'win32' | 'darwin' | 'linux';

// 平台判断
function getWpsChannel(): WpsChannel {
  const p = os.platform();
  if (p === 'darwin') return 'darwin';
  if (p === 'linux') return 'linux';
  return 'win32';
}

// PowerShell脚本路径 (Windows)
const PS_SCRIPT_PATH = path.join(__dirname, '../../scripts/wps-com.ps1');

// 轮询服务器端口（Mac/Linux 共用同一反向轮询协议）
const POLL_PORT = Number(process.env.WPS_POLL_PORT) || 58891;

/**
 * 执行Mac轮询调用
 * 通过轮询服务器发送命令，等待WPS加载项取走并返回结果
 */
async function execMacPoll(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  log.debug('Executing Mac Poll', { action, params });

  try {
    // 确保轮询服务器已启动
    if (!macPollServer.isRunning) {
      log.info('[Mac] Starting poll server...');
      await macPollServer.start(POLL_PORT);
    }

    // 通过轮询服务器执行命令
    // 传 getTimeout(action) 与 Windows 分支的超时契约一致（findReplace=10s/getActiveDocument=10s 等），
    // 避免同一命令 Windows 10s vs Mac/Linux 30s 的跨平台漂移（第 21 轮终审 warning）。
    // 注意：该超时从命令入队后计时，不含切换耗时（第 11 轮修复语义）。
    const result = await macPollServer.executeCommand(action, params, getTimeout(action));
    return result;
  } catch (error) {
    log.error('Mac Poll call failed', { action, error });
    throw error;
  }
}

/**
 * 执行Linux轮询调用（与Mac同架构，复用MacPollServer，仅注入Linux切换脚本）
 * 通过轮询服务器发送命令，等待WPS加载项取走并返回结果
 */
async function execLinuxPoll(
  action: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  log.debug('Executing Linux Poll', { action, params });

  try {
    // 确保轮询服务器已启动
    if (!linuxPollServer.isRunning) {
      log.info('[Linux] Starting poll server...');
      await linuxPollServer.start(POLL_PORT);
    }

    // 通过轮询服务器执行命令（超时与 Windows 契约一致，见 execMacPoll 注释）
    const result = await linuxPollServer.executeCommand(action, params, getTimeout(action));
    return result;
  } catch (error) {
    log.error('Linux Poll call failed', { action, error });
    throw error;
  }
}

/**
 * 执行PowerShell命令 (Windows)
 * 返回进程引用以便调用方在超时时终止
 */
function spawnPowerShell(
  action: string,
  params: Record<string, unknown> = {}
): {
  process: import('child_process').ChildProcess;
  result: Promise<unknown>;
} {
  const paramsJson = JSON.stringify(params);
  const args = [
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    PS_SCRIPT_PATH,
    '-Action',
    action,
    '-Params',
    paramsJson,
  ];

  log.debug('Executing PowerShell', { action, params });

  const ps = spawn('powershell', args, {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  ps.stdout.on('data', data => {
    stdout += data.toString();
  });

  ps.stderr.on('data', data => {
    stderr += data.toString();
  });

  const result = new Promise<unknown>((resolve, reject) => {
    ps.on('close', code => {
      if (code !== 0) {
        if (stderr) {
          log.error('PowerShell error', { stderr, code, pid: ps.pid, action });
          reject(new Error(stderr));
        } else {
          log.error('PowerShell exited with non-zero code', { code, stdout, pid: ps.pid, action });
          reject(new Error(`PowerShell 退出码: ${code}, 输出: ${stdout || '(空)'}`));
        }
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        log.error('Failed to parse PowerShell output', { stdout, pid: ps.pid, action });
        reject(new Error(`Invalid JSON output: ${stdout}`));
      }
    });

    ps.on('error', err => {
      reject(err);
    });
  });

  return { process: ps, result };
}

/** @deprecated 保留兼容，新代码请使用 spawnPowerShell */
async function execPowerShell(
  action: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  return spawnPowerShell(action, params).result;
}

/**
 * 统一执行接口 - 根据平台选择调用方式
 * Windows: PowerShell调用COM接口
 * Mac/Linux: 反向轮询模式（MCP Server是服务端，WPS加载项来取命令）
 */
async function execWpsAction(
  action: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const channel = getWpsChannel();
  if (channel === 'darwin') {
    return execMacPoll(action, params);
  } else if (channel === 'linux') {
    return execLinuxPoll(action, params);
  } else {
    return execPowerShell(action, params);
  }
}

// 超时时间（毫秒）— 按工具类型区分
const COM_TIMEOUT_DEFAULT = 30000;
const COM_TIMEOUTS: Record<string, number> = {
  getDocumentParagraphs: 60000, // #116 问题八：大批段落 WPS COM 处理慢 + PowerShell 开销，30s 不够，提至 60s
  getDocumentTextByRange: 30000, // #116 问题八：同样提至 30s
  proofreadBasic: 15000,
  replaceInParagraph: 10000,
  findReplace: 10000,
  enableTrackChanges: 5000,
  getTrackChangesStatus: 5000,
  confirmBatchAiProofread: 5000,
  getActiveDocument: 10000,
};
function getTimeout(action: string): number {
  return COM_TIMEOUTS[action] ?? COM_TIMEOUT_DEFAULT;
}

/**
 * 带超时和重试的WPS调用
 * Windows: 超时时主动 kill PowerShell 进程并记录 PID
 * Mac/Linux: Promise.race 快速失败（无法取消轮询）
 */
async function execWpsActionWithRetry(
  action: string,
  params: Record<string, unknown> = {},
  maxRetries: number = 3
): Promise<unknown> {
  let lastError: Error | null = null;
  const isWin = os.platform() === 'win32';
  // 轮询安全兜底 timer 句柄（函数级共享，命令完成后清理，避免泄漏）
  let timeoutGuard: NodeJS.Timeout | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let actionPromise: Promise<unknown>;

      if (isWin) {
        // Windows: 通过 spawnPowerShell 拿到进程引用，超时时 kill
        const { process: ps, result } = spawnPowerShell(action, params);
        const timeout = getTimeout(action);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            ps.kill('SIGTERM');
            log.warn(`COM 调用超时，已终止 PowerShell 进程 (PID: ${ps.pid})`, { action });
            reject(new Error('COM 调用超时（' + timeout + 'ms）'));
          }, timeout);
        });
        actionPromise = Promise.race([result, timeoutPromise]);
      } else {
        // Mac/Linux: 轮询桥命令超时由 executeCommand 内部管理（从命令入队后开始计时，不含切换耗时），
        // 因此不用短命令超时（5-15s）race——否则首次跨应用切换（最坏 22s+2s）时短超时命令在切换完成前就被 reject，
        // 且重试 3 次每次重新切换，必然失败（第 11 轮评审 critical）。
        // 但仍需一个宽松的**安全兜底**（远大于最坏路径：切换 60s+2s + 命令 30s ≈ 92s，故取 180s）：
        // 防止 start()/switchApp() 等前置环节异常挂起（永不 resolve/reject）导致整个调用链无限等待。
        // 兜底超时只防死锁，正常路径不会触发。
        actionPromise = Promise.race([
          execWpsAction(action, params),
          new Promise((_, reject) => {
            // 用可清理的 timer：命令正常 resolve 后 clearTimeout，避免每次调用都累积一个 180s 空转 timer（泄漏）
            timeoutGuard = setTimeout(() => {
              reject(new Error(`轮询调用安全兜底超时（180s）: ${action}`));
            }, 180000);
          }),
        ]);
        // 命令完成后清理兜底 timer（无论成功/失败），避免 timer 泄漏累积
        actionPromise = actionPromise.finally(() => {
          if (timeoutGuard) {
            clearTimeout(timeoutGuard);
            timeoutGuard = null;
          }
        });
      }

      return await actionPromise;
    } catch (error) {
      lastError = error as Error;
      const errMsg = error instanceof Error ? error.stack || error.message : String(error);

      if (errMsg.includes('超时')) {
        log.info(`WPS call timeout, attempt ${attempt}/${maxRetries}`, { action });
      } else {
        log.warn(`WPS call failed, attempt ${attempt}/${maxRetries}`, { action, error: errMsg });
      }

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  throw lastError || new Error('WPS call failed after retries');
}

/**
 * WPS客户端类 - 跨平台通信
 * Windows: PowerShell COM桥接
 * Mac: HTTP调用WPS加载项
 */
export class WpsClient {
  private status: WpsClientStatus;

  constructor(_config?: Partial<WpsEndpointConfig>) {
    this.status = { connected: false };
    const channel = getWpsChannel();
    const method =
      channel === 'win32'
        ? 'PowerShell COM'
        : channel === 'darwin'
          ? 'HTTP (Mac Addon)'
          : 'HTTP (Linux Addon)';
    log.info('WPS Client initialized', { method, platform: os.platform() });
  }

  /**
   * 调用WPS接口（跨平台）
   */
  async invokeAction<T = unknown>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<WpsApiResponse<T>> {
    const startTime = Date.now();
    logRequest(action, params);

    try {
      const result = (await execWpsActionWithRetry(action, params, 3)) as WpsApiResponse<T>;
      const duration = Date.now() - startTime;
      logResponse(action, result.success, duration);

      if (result.success) {
        this.status.connected = true;
        this.status.lastHeartbeat = new Date();
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logResponse(action, false, duration);
      this.status.connected = false;
      throw errorUtils.wrap(error, `WPS COM call failed: ${action}`);
    }
  }

  /**
   * 兼容旧API
   */
  async callApi<T = unknown>(request: WpsApiRequest): Promise<WpsApiResponse<T>> {
    const actionMap: Record<string, string> = {
      'workbook.getActive': 'getActiveWorkbook',
      'cell.getValue': 'getCellValue',
      'cell.setValue': 'setCellValue',
      'range.getData': 'getRangeData',
      'range.setData': 'setRangeData',
      'file.save': 'save',
      ping: 'ping',
    };
    const action = actionMap[request.method] || request.method;
    return this.invokeAction<T>(action, request.params || {});
  }

  /**
   * 检查WPS连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.invokeAction('ping');
      this.status.connected = result.success;
      return result.success;
    } catch {
      this.status.connected = false;
      this.status.error = 'Connection check failed';
      return false;
    }
  }

  /**
   * 获取客户端状态
   */
  getStatus(): WpsClientStatus {
    return { ...this.status };
  }

  // ==================== 表格操作 (WPS表格) ====================

  async getActiveWorkbook(): Promise<WorkbookInfo | null> {
    const response = await this.invokeAction<WorkbookInfo>('getActiveWorkbook');
    return response.success ? response.data || null : null;
  }

  async getCellValue(sheet: string | number, row: number, col: number): Promise<unknown> {
    const response = await this.invokeAction<{ value: unknown }>('getCellValue', {
      sheet,
      row,
      col,
    });
    return response.data?.value;
  }

  async setCellValue(
    sheet: string | number,
    row: number,
    col: number,
    value: unknown
  ): Promise<boolean> {
    const response = await this.invokeAction('setCellValue', { sheet, row, col, value });
    return response.success;
  }

  async getRangeData(sheet: string | number, range: string): Promise<unknown[][]> {
    const response = await this.invokeAction<{ data: unknown[][] }>('getRangeData', {
      sheet,
      range,
    });
    return response.data?.data || [];
  }

  async setRangeData(sheet: string | number, range: string, data: unknown[][]): Promise<boolean> {
    const response = await this.invokeAction('setRangeData', { sheet, range, data });
    return response.success;
  }

  async setFormula(
    sheet: string | number,
    row: number,
    col: number,
    formula: string
  ): Promise<boolean> {
    const response = await this.invokeAction('setFormula', { sheet, row, col, formula });
    return response.success;
  }

  // ==================== 文档操作 (WPS文字) ====================

  async getActiveDocument(): Promise<DocumentInfo | null> {
    const response = await this.invokeAction<DocumentInfo>('getActiveDocument');
    return response.success ? response.data || null : null;
  }

  async createDocument(): Promise<boolean> {
    const response = await this.invokeAction('createDocument');
    return response.success;
  }

  async insertText(text: string, position?: number): Promise<boolean> {
    const response = await this.invokeAction('insertText', { text, position });
    return response.success;
  }

  async getDocumentText(): Promise<string> {
    const response = await this.invokeAction<{ text: string }>('getDocumentText');
    return response.data?.text || '';
  }

  // ==================== 演示操作 (WPS演示) ====================

  async getActivePresentation(): Promise<PresentationInfo | null> {
    const response = await this.invokeAction<PresentationInfo>('getActivePresentation');
    return response.success ? response.data || null : null;
  }

  async createPresentation(): Promise<boolean> {
    const response = await this.invokeAction('createPresentation');
    return response.success;
  }

  async addSlide(layout?: string): Promise<boolean> {
    const response = await this.invokeAction('addSlide', { layout });
    return response.success;
  }

  // ==================== 通用操作 ====================

  async executeMethod<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    _appType?: WpsAppType
  ): Promise<WpsApiResponse<T>> {
    return this.invokeAction<T>(method, params);
  }

  async openFile(filePath: string, _appType?: WpsAppType): Promise<boolean> {
    const response = await this.invokeAction('openFile', { path: filePath });
    return response.success;
  }

  async saveFile(_appType?: WpsAppType): Promise<boolean> {
    const response = await this.invokeAction('save');
    return response.success;
  }

  async saveFileAs(filePath: string, _appType?: WpsAppType): Promise<boolean> {
    const response = await this.invokeAction('saveAs', { path: filePath });
    return response.success;
  }
}

// 导出单例
export const wpsClient = new WpsClient();

export default WpsClient;
