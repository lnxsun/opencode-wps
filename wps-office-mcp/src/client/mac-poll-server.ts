/**
 * Input: WPS 指令与HTTP请求
 * Output: 轮询执行结果
 * Pos: macOS 轮询服务器实现。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * Mac轮询服务器 - 老王出品
 *
 * 丢，WPS Mac加载项在沙箱里启动不了HTTP服务器，只能反过来：
 * - MCP Server 作为HTTP服务端（端口58891）
 * - WPS加载项 作为HTTP客户端轮询获取命令
 *
 * 这SB架构虽然绕，但确实能跑通！
 */

import * as http from 'http';
import { execFile } from 'child_process';
import * as path from 'path';
import { log } from '../utils/logger';

// 命令→应用类型映射（完整版，覆盖所有 SKILL.md 动作）
const COMMAND_APP_MAP: Record<string, string> = {
  // ==================== Excel 命令 ====================
  getActiveWorkbook: 'excel',
  getCellValue: 'excel',
  setCellValue: 'excel',
  getRangeData: 'excel',
  setRangeData: 'excel',
  setFormula: 'excel',
  sortRange: 'excel',
  autoFilter: 'excel',
  createChart: 'excel',
  removeDuplicates: 'excel',
  addCellComment: 'excel',
  addConditionalFormat: 'excel',
  addDataValidation: 'excel',
  autoFitAll: 'excel',
  autoFitColumn: 'excel',
  autoFitRow: 'excel',
  calculateSheet: 'excel',
  cleanData: 'excel',
  clearFormats: 'excel',
  clearRange: 'excel',
  closeWorkbook: 'excel',
  consolidate: 'excel',
  copyFormat: 'excel',
  copyRange: 'excel',
  copySheet: 'excel',
  createNamedRange: 'excel',
  createPivotTable: 'excel',
  createSheet: 'excel',
  createWorkbook: 'excel',
  deleteCellComment: 'excel',
  deleteColumns: 'excel',
  deleteNamedRange: 'excel',
  deleteRows: 'excel',
  deleteSheet: 'excel',
  diagnoseFormula: 'excel',
  fillSeries: 'excel',
  findInSheet: 'excel',
  freezePanes: 'excel',
  getCellComments: 'excel',
  getContext: 'excel',
  getFormula: 'excel',
  getNamedRanges: 'excel',
  getOpenWorkbooks: 'excel',
  getSelection: 'excel',
  getSheetList: 'excel',
  groupColumns: 'excel',
  groupRows: 'excel',
  hideColumns: 'excel',
  hideRows: 'excel',
  insertColumns: 'excel',
  insertExcelImage: 'excel',
  insertRows: 'excel',
  lockCells: 'excel',
  mergeCells: 'excel',
  moveSheet: 'excel',
  openWorkbook: 'excel',
  pasteRange: 'excel',
  protectSheet: 'excel',
  protectWorkbook: 'excel',
  renameSheet: 'excel',
  replaceInSheet: 'excel',
  setArrayFormula: 'excel',
  setBorder: 'excel',
  setCellFormat: 'excel',
  setCellStyle: 'excel',
  setColumnWidth: 'excel',
  setHyperlink: 'excel',
  setNumberFormat: 'excel',
  setPrintArea: 'excel',
  setRowHeight: 'excel',
  showColumns: 'excel',
  showRows: 'excel',
  subtotal: 'excel',
  switchSheet: 'excel',
  switchWorkbook: 'excel',
  textToColumns: 'excel',
  transpose: 'excel',
  unfreezePanes: 'excel',
  unmergeCells: 'excel',
  unprotectSheet: 'excel',
  updateChart: 'excel',
  updatePivotTable: 'excel',
  wrapText: 'excel',
  setZoom: 'excel',
  evaluateFormula: 'excel',
  autoSum: 'excel',
  exportChartAsImage: 'excel',
  exportRangeAsImage: 'excel',
  // ==================== Word 命令 ====================
  getActiveDocument: 'word',
  getDocumentText: 'word',
  insertText: 'word',
  findReplace: 'word',
  setFont: 'word',
  setTextColor: 'word',
  applyStyle: 'word',
  insertTable: 'word',
  generateTOC: 'word',
  addComment: 'word',
  getBookmarks: 'word',
  getComments: 'word',
  getDocumentStats: 'word',
  getOpenDocuments: 'word',
  insertBookmark: 'word',
  insertFooter: 'word',
  insertHeader: 'word',
  insertHyperlink: 'word',
  insertImage: 'word',
  insertPageBreak: 'word',
  openDocument: 'word',
  setPageSetup: 'word',
  setParagraph: 'word',
  setLineSpacing: 'word',
  insertSectionBreak: 'word',
  createDocument: 'word',
  switchDocument: 'word',
  // ==================== PPT 命令 ====================
  getActivePresentation: 'ppt',
  addSlide: 'ppt',
  unifyFont: 'ppt',
  beautifySlide: 'ppt',
  addAnimation: 'ppt',
  addArrow: 'ppt',
  addConnector: 'ppt',
  addPptHyperlink: 'ppt',
  addShape: 'ppt',
  addTextBox: 'ppt',
  alignShapes: 'ppt',
  applyColorScheme: 'ppt',
  applyTransitionToAll: 'ppt',
  autoBeautifySlide: 'ppt',
  autoLayout: 'ppt',
  beautifyAllSlides: 'ppt',
  closePresentation: 'ppt',
  createPresentation: 'ppt',
  deletePptImage: 'ppt',
  deleteShape: 'ppt',
  deleteSlide: 'ppt',
  deleteTextBox: 'ppt',
  distributeShapes: 'ppt',
  duplicateShape: 'ppt',
  duplicateSlide: 'ppt',
  endSlideShow: 'ppt',
  findPptText: 'ppt',
  getOpenPresentations: 'ppt',
  getPptTableCell: 'ppt',
  getShapes: 'ppt',
  getSlideCount: 'ppt',
  getSlideInfo: 'ppt',
  getSlideMaster: 'ppt',
  getSlideNotes: 'ppt',
  getSlideTitle: 'ppt',
  getTextBoxes: 'ppt',
  groupShapes: 'ppt',
  insertPptImage: 'ppt',
  insertPptTable: 'ppt',
  moveSlide: 'ppt',
  openPresentation: 'ppt',
  removeAnimation: 'ppt',
  removePptHyperlink: 'ppt',
  removeSlideTransition: 'ppt',
  replacePptText: 'ppt',
  setBackgroundColor: 'ppt',
  setBackgroundGradient: 'ppt',
  setBackgroundImage: 'ppt',
  setImageStyle: 'ppt',
  setMasterBackground: 'ppt',
  setPptDateTime: 'ppt',
  setPptFooter: 'ppt',
  setPptTableCell: 'ppt',
  setShapeBorder: 'ppt',
  setShapeFullStyle: 'ppt',
  setShapeGradient: 'ppt',
  setShapePosition: 'ppt',
  setShapeRoundness: 'ppt',
  setShapeShadow: 'ppt',
  setShapeStyle: 'ppt',
  setShapeText: 'ppt',
  setShapeTransparency: 'ppt',
  setShapeZOrder: 'ppt',
  setSlideBackground: 'ppt',
  setSlideContent: 'ppt',
  setSlideSize: 'ppt',
  setSlideTheme: 'ppt',
  setFontColor: 'ppt',
  setShapeFill: 'ppt',
  setSlideLayout: 'ppt',
  setSlideNotes: 'ppt',
  setSlideNumber: 'ppt',
  setSlideSubtitle: 'ppt',
  setSlideTitle: 'ppt',
  exportSlideAsImage: 'ppt',
  setSlideTransition: 'ppt',
  setTextBoxStyle: 'ppt',
  setTextBoxText: 'ppt',
  smartDistribute: 'ppt',
  startSlideShow: 'ppt',
  switchPresentation: 'ppt',
  switchSlide: 'ppt',
};

interface PendingCommand {
  action: string;
  params: Record<string, unknown>;
  requestId: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Mac轮询服务器类
 * 处理WPS加载项的轮询请求，实现命令的发送和结果接收
 *
 * 平台复用：Linux 版复用本类（通过构造函数传入 Linux 的 wps-auto.sh 路径），
 * 轮询协议（/poll、/result）与命令分发表完全一致，仅应用切换脚本不同。
 */
class MacPollServer {
  private server: http.Server | null = null;
  private pendingCommand: PendingCommand | null = null;
  private currentApp: string = '';
  private _isRunning: boolean = false;
  private lastSwitchError: string | null = null;
  private port: number = 58891;
  private switchScriptPath: string;
  // 启动中的 Promise 缓存：并发 start() 共享同一启动流程，避免双 server 创建竞态（第 19 轮评审 critical）
  private startingPromise: Promise<void> | null = null;

  /**
   * @param switchScriptPath 应用切换脚本路径（wps-auto.sh）。
   *                         默认指向 Mac 版 opencode-wps-assistant/wps-auto.sh；
   *                         Linux 版传入 opencode-wps-linux/wps-auto.sh。
   */
  constructor(switchScriptPath?: string) {
    this.switchScriptPath =
      switchScriptPath || path.join(__dirname, '../../../opencode-wps-assistant/wps-auto.sh');
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * 获取最近一次应用切换失败的原因（无失败返回 null）
   * 供上层在命令失败时关联「可能因切换失败导致」的提示
   */
  getLastSwitchError(): string | null {
    return this.lastSwitchError;
  }

  /**
   * 启动轮询服务器
   * 丢，这个服务器要处理三种请求：
   * 1. GET /poll - WPS加载项来轮询获取命令
   * 2. POST /result - WPS加载项返回执行结果
   * 3. OPTIONS - 该死的CORS预检请求
   */
  async start(listenPort: number = 58891): Promise<void> {
    if (this._isRunning) {
      log.debug('[Mac] Poll server already running');
      return;
    }
    // 并发 start() 竞态：两个调用都看到 _isRunning=false 会创建双 server，
    // 后创建者 EADDRINUSE 时 error handler 会置 this.server=null 清掉先创建者已 listen 成功的引用。
    // 用 startingPromise 缓存：并发调用共享同一个启动 Promise（第 19 轮评审 critical）
    if (this.startingPromise) {
      return this.startingPromise;
    }

    this.port = listenPort;

    this.startingPromise = new Promise<void>((resolve, reject) => {
      // 启动完成（成功/失败）后清理 startingPromise，允许后续重新启动
      const settle = (fn: () => void) => {
        this.startingPromise = null;
        fn();
      };
      this.server = http.createServer((req, res) => {
        // CORS头 - 必须加，不然WPS加载项的请求会被拦截
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Content-Type', 'application/json');

        // 处理OPTIONS预检请求，这SB浏览器每次POST前都要发一个
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const url = req.url || '';

        if (url === '/poll' && req.method === 'GET') {
          this.handlePoll(res);
        } else if (url === '/result' && req.method === 'POST') {
          this.handleResult(req, res);
        } else if (url === '/status') {
          // 状态检查接口
          res.end(
            JSON.stringify({
              status: 'running',
              currentApp: this.currentApp,
              hasPendingCommand: !!this.pendingCommand,
            })
          );
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        // listen 失败：无论哪种错误都不再持有 server（避免 stop() 对未监听实例 close 抛错 / 状态残留）
        this.server = null;
        if (err.code === 'EADDRINUSE') {
          // 端口被占用：**不复用**——新实例的 pendingCommand 是自身的，残留实例永远看不到，
          // 复用必然导致所有命令 30s 超时且 stop() 无法重置状态（双实例状态分裂）。
          // 探测仅用于生成清晰的错误信息（区分「残留同构服务」与「其他占用」），
          // 无论结果如何都 reject，提示用户清理残留进程后重试。
          log.warn(`[Poll] Port ${this.port} already in use, probing existing service...`);
          const http = require('http');
          const probe = http.get(
            { host: '127.0.0.1', port: this.port, path: '/status', timeout: 2000 },
            (res: any) => {
              let body = '';
              let size = 0;
              // 探测响应体上限 1MB（异常服务可能返回超大响应）
              const MAX_PROBE_BODY = 1024 * 1024;
              let tooBig = false;
              res.on('data', (chunk: any) => {
                size += chunk.length;
                if (size > MAX_PROBE_BODY) {
                  tooBig = true;
                  res.destroy();
                  return;
                }
                body += chunk;
              });
              res.on('end', () => {
                if (tooBig) {
                  settle(() =>
                    reject(new Error(`Port ${this.port} already in use by oversized service`))
                  );
                  return;
                }
                try {
                  const st = JSON.parse(body);
                  if (st.status === 'running') {
                    // 残留的是同构轮询服务——不复用，明确提示清理（避免双实例 pendingCommand 分裂）
                    settle(() =>
                      reject(
                        new Error(
                          `Port ${this.port} 已被残留的 WPS 轮询服务占用，请清理残留进程后重试（launcher 会自动清理孤儿进程）`
                        )
                      )
                    );
                    return;
                  }
                } catch (e) {
                  // 非 JSON 响应，视为不可用
                }
                settle(() =>
                  reject(new Error(`Port ${this.port} already in use by non-poll service`))
                );
              });
            }
          );
          probe.on('error', () => {
            settle(() => reject(new Error(`Port ${this.port} already in use and unresponsive`)));
          });
          probe.on('timeout', () => {
            probe.destroy();
            settle(() => reject(new Error(`Port ${this.port} already in use and timeout`)));
          });
        } else {
          settle(() => reject(err));
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this._isRunning = true;
        log.info(`[Mac] Poll server started on port ${this.port}`);
        settle(() => resolve());
      });
    });
  }

  /**
   * 处理轮询请求
   * WPS加载项每500ms来问一次：有活干不？
   */
  private handlePoll(res: http.ServerResponse): void {
    // 禁止缓存：轮询接口响应（尤其空响应）若被 WPS 侧 Chromium 缓存，命令到达会延迟甚至丢失
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (this.pendingCommand) {
      const cmd = {
        action: this.pendingCommand.action,
        params: this.pendingCommand.params,
        requestId: this.pendingCommand.requestId,
      };
      log.debug('[Mac] Sending command to addon', { action: cmd.action, requestId: cmd.requestId });
      res.end(JSON.stringify({ command: cmd }));
    } else {
      // 没活，回个空的
      res.end(JSON.stringify({}));
    }
  }

  /**
   * 处理结果返回
   * WPS加载项执行完命令后把结果POST回来
   */
  private handleResult(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    let size = 0;
    // 请求体上限 10MB：WPS 加载项返回结果通常远小于此，超限视为异常客户端，直接 413 拒绝
    const MAX_BODY = 10 * 1024 * 1024;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        aborted = true;
        log.warn('[Mac] Result body exceeds limit, rejecting with 413');
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload Too Large' }));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('error', err => {
      if (aborted) return;
      aborted = true;
      log.error('[Mac] Error reading result body', { error: err });
      if (!res.headersSent) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Bad Request' }));
      }
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        const data = JSON.parse(body);
        log.debug('[Mac] Received result', {
          requestId: data.requestId,
          success: data.result?.success,
        });

        if (this.pendingCommand && data.requestId === this.pendingCommand.requestId) {
          // 清除超时定时器
          clearTimeout(this.pendingCommand.timeout);

          // 空结果归一化：WPS 返回 null/undefined/非对象时，归一化为标准 fail 结构，
          // 避免上层 invokeAction 对 result.success 访问 null 抛 TypeError
          const result =
            data.result && typeof data.result === 'object'
              ? data.result
              : {
                  success: false,
                  data: null,
                  error: 'WPS 返回空结果（result 为空）',
                };

          // 切换失败时给结果附加提示，便于上层/日志定位「命令在未切换的应用上执行」
          if (this.lastSwitchError) {
            const hint = `（注意：应用切换可能失败：${this.lastSwitchError}）`;
            if (result && typeof result === 'object') {
              result._switchWarning = hint;
            } else {
              log.warn(`[Mac] Command executed with possible switch failure: ${hint}`);
            }
          }

          // 返回结果
          this.pendingCommand.resolve(result);
          this.pendingCommand = null;
          res.end(JSON.stringify({ ok: true }));
        } else {
          // 未知 requestId：可能是 WPS 侧重试（第 5 轮加的 3 次重试在响应丢失时重发），
          // 此时命令可能已处理（pendingCommand 已消费）——响应 alreadyHandled 让 WPS 侧停止无谓重试（第 20 轮评审 info）
          log.warn('[Mac] Received result for unknown request', { requestId: data.requestId });
          res.end(JSON.stringify({ ok: true, alreadyHandled: true }));
        }
      } catch (e) {
        log.error('[Mac] Failed to parse result', { error: e, body });
        if (!res.headersSent) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      }
    });
  }

  /**
   * 执行WPS命令
   * 这是对外的主要接口，调用后会：
   * 1. 检查是否需要切换应用
   * 2. 把命令放到队列里等WPS加载项来取
   * 3. 等待结果返回
   */
  async executeCommand(
    action: string,
    params: Record<string, unknown> = {},
    timeout: number = 30000
  ): Promise<unknown> {
    // 确定需要的应用类型
    const requiredApp = this.getRequiredApp(action, params);

    // 如果需要切换应用
    if (requiredApp && requiredApp !== this.currentApp) {
      log.info(`[Mac] Switching app from ${this.currentApp || 'none'} to ${requiredApp}`);
      const switched = await this.switchApp(requiredApp);
      if (!switched) {
        // 切换失败：命令仍继续尝试（用户可能已手动打开），但记录上下文便于上层定位
        log.error(
          `[Poll] Command ${action} will run despite switch failure to ${requiredApp}: ${this.lastSwitchError}`
        );
      }
    }

    // 发送命令并等待结果
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 单槽位保护：若已有未完成的命令（前一个命令超时/泄漏/并发），先拒绝旧命令并清理定时器，
      // 避免旧命令静默丢失、新命令覆盖后旧命令永远等不到结果
      if (this.pendingCommand) {
        log.warn('[Poll] Superseding pending command', {
          oldRequestId: this.pendingCommand.requestId,
          newRequestId: requestId,
          oldAction: this.pendingCommand.action,
          newAction: action,
        });
        if (this.pendingCommand.timeout) clearTimeout(this.pendingCommand.timeout);
        this.pendingCommand.reject(new Error(`Command superseded by newer command: ${action}`));
        this.pendingCommand = null;
      }

      // 超时处理
      const timeoutHandle = setTimeout(() => {
        if (this.pendingCommand?.requestId === requestId) {
          this.pendingCommand = null;
          // 含「超时」关键字（上层 execWpsActionWithRetry 用 errMsg.includes('超时') 分类重试日志）
          // 若此前切换失败，附加提示，让上层/日志能定位「命令可能发往了未切换的应用」
          const switchHint = this.lastSwitchError
            ? `（切换失败提示: ${this.lastSwitchError}）`
            : '';
          reject(new Error(`命令超时 Command timeout after ${timeout}ms: ${action}${switchHint}`));
        }
      }, timeout);

      this.pendingCommand = {
        action,
        params,
        requestId,
        resolve,
        reject,
        timeout: timeoutHandle,
      };

      log.debug('[Mac] Command queued', { action, requestId });
    });
  }

  /**
   * 根据命令获取需要的应用类型
   * 通用动作（openFile/save 等）按参数内容动态推断，其余查映射表
   */
  private getRequiredApp(action: string, params: Record<string, unknown> = {}): string {
    // 通用动作：按文件路径扩展名推断目标应用（跨应用打开时轮询桥必须切换应用，否则单应用沙箱内必然失败）
    // 用正则边界匹配（\.xlsx?$ 等），避免 includes('.xls') 误匹配 .xlss/.document 等非标准后缀（第 17 轮评审 info）
    if (action === 'openFile' || action === 'saveAs') {
      const filePath = String(params.path || params.filePath || '').toLowerCase();
      if (/\.xlsx?$/.test(filePath)) return 'excel';
      if (/\.docx?$/.test(filePath)) return 'word';
      if (/\.pptx?$/.test(filePath)) return 'ppt';
    }
    // save/getSelectedText/getAppInfo/ping/wireCheck/setSelectedText/convertToPDF 等通用动作：不切应用，跟随当前环境
    return COMMAND_APP_MAP[action] || '';
  }

  /**
   * 切换WPS应用
   * 调用wps-auto.sh脚本自动关闭当前应用并启动目标应用
   * @returns true=切换成功；false=切换失败（不更新 currentApp，命令继续尝试，
   *          但 lastSwitchError 会记录失败原因供 executeCommand/handleResult 关联提示）
   */
  private async switchApp(app: string): Promise<boolean> {
    // wps-auto.sh脚本路径 - 构造时注入（Mac: opencode-wps-assistant；Linux: opencode-wps-linux）
    const scriptPath = this.switchScriptPath;

    return new Promise(resolve => {
      log.info(`[Poll] Executing switch script: ${scriptPath} switch ${app}`);

      // 用 execFile 参数数组传递（不经 shell），避免脚本路径/应用名中的特殊字符被 shell 解释（命令注入）
      execFile(scriptPath, ['switch', app], { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          this.lastSwitchError = `应用切换失败: ${error.message}${stderr ? ` (${String(stderr).trim()})` : ''}`;
          log.error('[Mac] Switch app failed', { error, stderr });
          // 切换失败不要reject，让命令继续尝试
          // 可能用户已经手动打开了正确的应用
          log.warn('[Mac] Continuing despite switch failure');
          // 切换失败时不更新 currentApp，保持旧值，让下次命令重试切换（避免命令发往错误应用）
        } else {
          this.lastSwitchError = null;
          log.info(`[Mac] Switched to ${app}`, { stdout: stdout.trim() });
          this.currentApp = app;
        }

        // 等待一下让WPS加载项有时间连接
        setTimeout(() => resolve(!error), 2000);
      });
    });
  }

  /**
   * 停止服务器
   */
  stop(): void {
    if (this.pendingCommand) {
      clearTimeout(this.pendingCommand.timeout);
      this.pendingCommand.reject(new Error('Server stopped'));
      this.pendingCommand = null;
    }

    if (this.server) {
      if (this.server.listening) {
        this.server.close();
      }
      this.server = null;
      this._isRunning = false;
      log.info('[Mac] Poll server stopped');
    }
  }

  /**
   * 获取当前连接的应用类型
   */
  getCurrentApp(): string {
    return this.currentApp;
  }

  /**
   * 设置当前应用（用于外部更新状态）
   */
  setCurrentApp(app: string): void {
    this.currentApp = app;
  }
}

// 导出单例 - 整个应用共用一个服务器实例
export const macPollServer = new MacPollServer();

export default MacPollServer;
