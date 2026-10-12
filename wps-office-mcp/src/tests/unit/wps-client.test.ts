/**
 * WPS客户端单元测试
 *
 * 测试Windows PowerShell和Mac轮询两种模式的调用逻辑
 */

// Mock mac-poll-server - 直接在工厂函数内定义，避免 hoisting 问题
jest.mock('../../client/mac-poll-server', () => ({
  macPollServer: {
    isRunning: false,
    start: jest.fn().mockResolvedValue(undefined),
    executeCommand: jest.fn(),
  },
}));

// Mock linux-poll-server（Linux 复用 MacPollServer 类，需一并 mock）
jest.mock('../../client/linux-poll-server', () => ({
  linuxPollServer: {
    isRunning: false,
    start: jest.fn().mockResolvedValue(undefined),
    executeCommand: jest.fn(),
  },
}));

jest.mock('os', () => ({
  platform: jest.fn(() => 'win32'),
}));

// 简单 mock child_process，不使用工厂函数
jest.mock('child_process');

jest.mock('../../utils/logger', () => ({
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logRequest: jest.fn(),
  logResponse: jest.fn(),
}));

jest.mock('../../utils/error', () => ({
  WpsConnectionError: class WpsConnectionError extends Error {
    constructor(
      message: string,
      public details?: unknown
    ) {
      super(message);
      this.name = 'WpsConnectionError';
    }
  },
  WpsApiError: class WpsApiError extends Error {
    constructor(
      message: string,
      public details?: unknown
    ) {
      super(message);
      this.name = 'WpsApiError';
    }
  },
  TimeoutError: class TimeoutError extends Error {
    constructor(operation: string, timeout: number) {
      super(`Operation '${operation}' timed out after ${timeout}ms`);
      this.name = 'TimeoutError';
    }
  },
  errorUtils: {
    wrap: jest.fn((error: unknown, message: string) => {
      const err = error instanceof Error ? error : new Error(String(error));
      err.message = `${message}: ${err.message}`;
      return err;
    }),
  },
}));

import { WpsClient, resolvePowerShellPath } from '../../client/wps-client';
import { WpsAppType, WpsApiRequest } from '../../types/wps';
import * as os from 'os';
import * as child_process from 'child_process';

// 导入被 mock 的模块以操控它
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockMacModule = require('../../client/mac-poll-server');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockLinuxModule = require('../../client/linux-poll-server');

// 获取 mock 函数 - 使用类型断言
const mockedOs = os as jest.Mocked<typeof os>;
const mockedSpawn = child_process.spawn as jest.Mock;

function mockPsProcess(stdoutData: string, exitCode: number = 0, stderrData: string = '') {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const mockProcess = {
    stdout: {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers['stdout.' + event] = cb;
      }),
    },
    stderr: {
      on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers['stderr.' + event] = cb;
      }),
    },
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
    }),
    // 超时路径需要 kill 方法（wps-client.ts 超时时调用 ps.kill('SIGTERM')）
    kill: jest.fn(),
    pid: 12345,
  };

  mockedSpawn.mockImplementation(() => {
    // 延迟到下一轮事件循环再触发事件，确保 spawn 返回后 ps.on('close') 等监听器已注册。
    // 之前用 Promise.resolve().then()（微任务）在监听器注册前就执行了检查，
    // 导致 close 事件从未触发、result 永远 pending，最终 10s 超时。
    setImmediate(() => {
      if (stdoutData && handlers['stdout.data']) {
        handlers['stdout.data'](Buffer.from(stdoutData));
      }
      if (stderrData && handlers['stderr.data']) {
        handlers['stderr.data'](Buffer.from(stderrData));
      }
      if (exitCode !== undefined && handlers['close']) {
        handlers['close'](exitCode);
      }
    });
    return mockProcess;
  });
}

describe('WpsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedOs.platform.mockReturnValue('win32');
    mockMacModule.macPollServer.isRunning = false;
    mockMacModule.macPollServer.executeCommand.mockReset();
    mockLinuxModule.linuxPollServer.isRunning = false;
    mockLinuxModule.linuxPollServer.executeCommand.mockReset();
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建客户端', () => {
      const client = new WpsClient();
      expect(client).toBeDefined();
    });

    it('应该接受自定义配置', () => {
      const customConfig = { baseUrl: 'http://custom:8080', timeout: 5000 };
      const client = new WpsClient(customConfig);
      expect(client).toBeDefined();
    });

    it('Mac平台应该记录正确的方法', () => {
      mockedOs.platform.mockReturnValue('darwin');
      const client = new WpsClient();
      expect(client).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('应该返回当前状态的副本', () => {
      const client = new WpsClient();
      const status = client.getStatus();
      expect(status).toHaveProperty('connected');
      expect(status.connected).toBe(false);
    });
  });

  describe('checkConnection', () => {
    it('连接成功时应该返回true', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.checkConnection();
      expect(result).toBe(true);
    });

    it('连接失败时应该返回false', async () => {
      mockPsProcess('Connection refused', 1);
      const client = new WpsClient();
      const result = await client.checkConnection();
      expect(result).toBe(false);
    });
  });

  describe('表格操作（Windows模式）', () => {
    it('getCellValue应该返回单元格值', async () => {
      mockPsProcess(JSON.stringify({ success: true, data: { value: 42 } }), 0);
      const client = new WpsClient();
      const result = await client.getCellValue('Sheet1', 1, 1);
      expect(result).toBe(42);
    });

    it('setCellValue应该设置单元格值', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.setCellValue('Sheet1', 1, 1, 'Test Value');
      expect(result).toBe(true);
    });

    it('getRangeData应该返回范围数据', async () => {
      const mockData = [
        [1, 2, 3],
        [4, 5, 6],
      ];
      mockPsProcess(JSON.stringify({ success: true, data: { data: mockData } }), 0);
      const client = new WpsClient();
      const result = await client.getRangeData('Sheet1', 'A1:C2');
      expect(result).toEqual(mockData);
    });

    it('setRangeData应该写入范围数据', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.setRangeData('Sheet1', 'A1:B2', [
        ['A', 'B'],
        ['C', 'D'],
      ]);
      expect(result).toBe(true);
    });
  });

  describe('文档操作（Windows模式）', () => {
    it('getActiveDocument应该返回当前文档信息', async () => {
      const mockDoc = { name: 'test.docx', path: '/path/to', saved: true, readOnly: false };
      mockPsProcess(JSON.stringify({ success: true, data: mockDoc }), 0);
      const client = new WpsClient();
      const result = await client.getActiveDocument();
      expect(result).toEqual(mockDoc);
    });

    it('createDocument应该创建新文档', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.createDocument();
      expect(result).toBe(true);
    });

    it('insertText应该在文档中插入文本', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.insertText('Hello World', 100);
      expect(result).toBe(true);
    });
  });

  describe('演示操作（Windows模式）', () => {
    it('getActivePresentation应该返回演示文稿信息', async () => {
      const mockPresentation = {
        name: 'test.pptx',
        path: '/path/to',
        slideCount: 10,
        currentSlideIndex: 1,
      };
      mockPsProcess(JSON.stringify({ success: true, data: mockPresentation }), 0);
      const client = new WpsClient();
      const result = await client.getActivePresentation();
      expect(result).toEqual(mockPresentation);
    });

    it('addSlide应该添加新幻灯片', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.addSlide('title');
      expect(result).toBe(true);
    });
  });

  describe('通用操作（Windows模式）', () => {
    it('openFile应该打开文件', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.openFile('/path/to/file.xlsx', WpsAppType.SPREADSHEET);
      expect(result).toBe(true);
    });

    it('saveFile应该保存文件', async () => {
      mockPsProcess(JSON.stringify({ success: true }), 0);
      const client = new WpsClient();
      const result = await client.saveFile(WpsAppType.WRITER);
      expect(result).toBe(true);
    });

    it('executeMethod应该执行自定义方法', async () => {
      mockPsProcess(JSON.stringify({ success: true, data: { custom: 'result' } }), 0);
      const client = new WpsClient();
      const result = await client.executeMethod('custom.method', { arg: 1 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ custom: 'result' });
    });
  });

  describe('callApi', () => {
    it('应该通过invokeAction调用API', async () => {
      mockPsProcess(JSON.stringify({ success: true, data: { test: 'value' } }), 0);
      const request: WpsApiRequest = { method: 'ping', params: { key: 'value' } };
      const client = new WpsClient();
      const result = await client.callApi(request);
      expect(result.success).toBe(true);
    });

    it('应该在请求失败时抛出错误', async () => {
      mockPsProcess('', 1, 'Network Error');
      const request: WpsApiRequest = { method: 'ping' };
      const client = new WpsClient();
      await expect(client.callApi(request)).rejects.toThrow();
    });
  });

  describe('Mac模式', () => {
    beforeEach(() => {
      mockedOs.platform.mockReturnValue('darwin');
      mockMacModule.macPollServer.isRunning = true;
    });

    it('Mac模式应该使用轮询模式', async () => {
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { value: 42 },
      });
      const client = new WpsClient();
      const result = await client.getCellValue('Sheet1', 1, 1);
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenCalledWith(
        'getCellValue',
        {
          sheet: 'Sheet1',
          row: 1,
          col: 1,
        },
        30000
      );
      expect(result).toBe(42);
    });

    it('Mac模式createDocument应该调用轮询', async () => {
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({ success: true });
      const client = new WpsClient();
      const result = await client.createDocument();
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenCalledWith(
        'createDocument',
        {},
        30000
      );
      expect(result).toBe(true);
    });

    it('getDocumentParagraphs 前段批次（<=500段）用基础 60s 超时（session_ff63 问题三）', async () => {
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { paragraphs: [], totalCount: 9652, returnedCount: 0 },
      });
      const client = new WpsClient();
      const result = await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 1, endParagraph: 100 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 1, endParagraph: 100 },
        60000
      );
      expect(result).toBeDefined();
    });

    it('getDocumentParagraphs 后段批次（>8000段）动态放大到 150s（session_ff63 问题三）', async () => {
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { paragraphs: [], totalCount: 9652, returnedCount: 0 },
      });
      const client = new WpsClient();
      const result = await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 9500, endParagraph: 9600 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 9500, endParagraph: 9600 },
        150000
      );
      expect(result).toBeDefined();
    });

    it('getDocumentParagraphs 中段批次（3001-8000段）动态放大到 120s（session_ff63 问题三）', async () => {
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { paragraphs: [], totalCount: 9652, returnedCount: 0 },
      });
      const client = new WpsClient();
      const result = await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 5000, endParagraph: 5100 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 5000, endParagraph: 5100 },
        120000
      );
      expect(result).toBeDefined();
    });
    it('getDocumentParagraphs 边界值：正好 500/3000/8000 段归属正确档位（session_ff63 问题三）', async () => {
      const client = new WpsClient();
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { paragraphs: [], totalCount: 9652, returnedCount: 0 },
      });
      // 500 段 → 基础 60s
      await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 500, endParagraph: 500 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenLastCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 500, endParagraph: 500 },
        60000
      );
      // 3000 段 → 90s
      await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 3000, endParagraph: 3000 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenLastCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 3000, endParagraph: 3000 },
        90000
      );
      // 8000 段 → 120s
      await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 8000, endParagraph: 8000 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenLastCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 8000, endParagraph: 8000 },
        120000
      );
      // 8001 段 → 150s
      await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: 8001, endParagraph: 8001 },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenLastCalledWith(
        'getDocumentParagraphs',
        { startParagraph: 8001, endParagraph: 8001 },
        150000
      );
    });

    it('getDocumentParagraphs 字符串数字参数（"9500"）也能正确动态放大超时（第2轮 W1 容错回归）', async () => {
      mockMacModule.macPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { paragraphs: [], totalCount: 9652, returnedCount: 0 },
      });
      const client = new WpsClient();
      const result = await client.executeMethod(
        'getDocumentParagraphs',
        { startParagraph: '9500', endParagraph: '9600' },
        WpsAppType.WRITER
      );
      expect(mockMacModule.macPollServer.executeCommand).toHaveBeenCalledWith(
        'getDocumentParagraphs',
        { startParagraph: '9500', endParagraph: '9600' },
        150000
      );
      expect(result).toBeDefined();
    });
  });

  describe('Linux模式', () => {
    beforeEach(() => {
      mockedOs.platform.mockReturnValue('linux');
      mockLinuxModule.linuxPollServer.isRunning = true;
    });

    it('Linux模式应该使用轮询模式（复用Mac轮询协议）', async () => {
      mockLinuxModule.linuxPollServer.executeCommand.mockResolvedValue({
        success: true,
        data: { value: 42 },
      });
      const client = new WpsClient();
      const result = await client.getCellValue('Sheet1', 1, 1);
      expect(mockLinuxModule.linuxPollServer.executeCommand).toHaveBeenCalledWith(
        'getCellValue',
        {
          sheet: 'Sheet1',
          row: 1,
          col: 1,
        },
        30000
      );
      expect(result).toBe(42);
    });

    it('Linux模式createDocument应该调用轮询', async () => {
      mockLinuxModule.linuxPollServer.executeCommand.mockResolvedValue({ success: true });
      const client = new WpsClient();
      const result = await client.createDocument();
      expect(mockLinuxModule.linuxPollServer.executeCommand).toHaveBeenCalledWith(
        'createDocument',
        {},
        30000
      );
      expect(result).toBe(true);
    });

    it('Linux模式下超时重试不触发 kill（isWin=false 走轮询快速失败）', async () => {
      // 首次调用抛超时，第二次成功 -> 验证重试路径且不 spawn PowerShell
      mockLinuxModule.linuxPollServer.executeCommand
        .mockRejectedValueOnce(new Error('COM 调用超时（30000ms）'))
        .mockResolvedValueOnce({ success: true, data: { value: 7 } });
      const client = new WpsClient();
      const result = await client.getCellValue('Sheet1', 1, 1);
      expect(mockLinuxModule.linuxPollServer.executeCommand).toHaveBeenCalledTimes(2);
      expect(mockedSpawn).not.toHaveBeenCalled();
      expect(result).toBe(7);
    });

    it('Linux模式下 executeCommand 永挂起时有安全兜底超时（不无限等待）', async () => {
      // 模拟 executeCommand 永不 resolve（WPS 加载项未连接/前置环节挂起）——
      // 外层 Promise.race 的 180s 安全兜底必须在合理时间内 reject，避免整个调用链无限等待
      jest.useFakeTimers();
      mockLinuxModule.linuxPollServer.executeCommand.mockReturnValue(new Promise(() => {}));
      const client = new WpsClient();
      const pending = client.getCellValue('Sheet1', 1, 1);
      // 先挂断言（避免推进 timers 时 rejection 未处理导致 unhandled rejection）
      const assertion = expect(pending).rejects.toThrow(/轮询调用安全兜底超时/);
      // 兜底超时 180s × 3 次重试 + 重试间隔 500ms/1000ms，全部推进后应抛错（而非无限挂起）
      await jest.advanceTimersByTimeAsync(180000 + 500);
      await jest.advanceTimersByTimeAsync(180000 + 1000);
      await jest.advanceTimersByTimeAsync(180000);
      await assertion;
      // 重试 3 次（不 spawn PowerShell，走轮询）
      expect(mockLinuxModule.linuxPollServer.executeCommand).toHaveBeenCalledTimes(3);
      expect(mockedSpawn).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});

describe('resolvePowerShellPath 路径解析（Issue #247 spawn powershell ENOENT）', () => {
  it('非 win32 平台（如 CI/Linux/Mac）返回裸 powershell，不改历史行为', () => {
    expect(resolvePowerShellPath('linux', () => true)).toBe('powershell');
    expect(resolvePowerShellPath('darwin', () => true)).toBe('powershell');
  });

  it('win32 且 SystemRoot 下 System32 存在 powershell.exe 时返回绝对路径', () => {
    process.env.SystemRoot = 'C:\\Windows';
    try {
      const result = resolvePowerShellPath(
        'win32',
        p =>
          typeof p === 'string' && p.includes('System32\\WindowsPowerShell\\v1.0\\powershell.exe')
      );
      expect(result).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
      expect(result).not.toBe('powershell');
    } finally {
      delete process.env.SystemRoot;
    }
  });

  it('win32 且探测不到任何 powershell.exe 时回退裸 powershell（PATH 兜底）', () => {
    expect(resolvePowerShellPath('win32', () => false)).toBe('powershell');
  });
});
