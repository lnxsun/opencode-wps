/**
 * MacPollServer 轮询服务器单元测试
 *
 * 重点覆盖：
 * - getRequiredApp 动态映射（openFile/saveAs 按扩展名推断应用）
 * - 通用动作不切应用（ping/save/getSelectedText 等返回空映射）
 * - COMMAND_APP_MAP 键与 handler 无实现键清理（回归防护）
 */

// Mock child_process（mac-poll-server 的 switchApp 使用 execFile）
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

import MacPollServer from '../../client/mac-poll-server';

describe('MacPollServer.getRequiredApp', () => {
  const server = new MacPollServer('/fake/path/wps-auto.sh');

  it('openFile 按 .xls 扩展名推断 excel', () => {
    expect(server['getRequiredApp']('openFile', { path: '/home/u/data.xlsx' })).toBe('excel');
  });

  it('openFile 按 .doc 扩展名推断 word', () => {
    expect(server['getRequiredApp']('openFile', { filePath: '/home/u/report.docx' })).toBe('word');
  });

  it('openFile 按 .ppt 扩展名推断 ppt', () => {
    expect(server['getRequiredApp']('openFile', { path: '/home/u/deck.pptx' })).toBe('ppt');
  });

  it('saveAs 按扩展名推断应用', () => {
    expect(server['getRequiredApp']('saveAs', { path: '/home/u/sheet.xls' })).toBe('excel');
  });

  it('openFile 无路径参数时不切应用（返回空）', () => {
    expect(server['getRequiredApp']('openFile', {})).toBe('');
  });

  it('通用动作 ping/save/getSelectedText 不切应用', () => {
    expect(server['getRequiredApp']('ping', {})).toBe('');
    expect(server['getRequiredApp']('save', {})).toBe('');
    expect(server['getRequiredApp']('getSelectedText', {})).toBe('');
  });

  it('普通命令查映射表（getCellValue → excel）', () => {
    expect(server['getRequiredApp']('getCellValue', {})).toBe('excel');
  });

  it('未知动作返回空', () => {
    expect(server['getRequiredApp']('nonexistentAction', {})).toBe('');
  });
});

// 验证 switchApp 切换失败时不更新 currentApp（保持旧值），并返回 false + 记录 lastSwitchError
// 验证切换成功时更新 currentApp，返回 true 并清空 lastSwitchError
// 验证 handleResult 对超大请求体拒绝 413
// 验证 handleResult 对非法 JSON 返回 400
// 验证 handleResult 成功路径附加 _switchWarning（当存在 lastSwitchError 时）
describe('MacPollServer.switchApp 失败语义', () => {
  it('切换失败时不更新 currentApp（避免后续命令跳过切换）且返回 false', async () => {
    const server = new MacPollServer('/fake/path/wps-auto.sh');
    // 直接调用私有方法获取 Promise，然后模拟 execFile 失败
    const { execFile } = require('child_process');
    const origExecFile = execFile;
    execFile.mockImplementation(
      (_bin: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
        cb(new Error('spawn ENOENT'));
      }
    );
    try {
      const result = await server['switchApp']('excel');
      expect(result).toBe(false);
      expect(server.getCurrentApp()).toBe('');
      expect(server.getLastSwitchError()).toContain('应用切换失败');
    } finally {
      execFile.mockImplementation(origExecFile);
    }
  });

  it('切换成功时更新 currentApp 且返回 true，并清空 lastSwitchError', async () => {
    const server = new MacPollServer('/fake/path/wps-auto.sh');
    const { execFile } = require('child_process');
    const origExecFile = execFile;
    execFile.mockImplementation(
      (
        _bin: string,
        _args: string[],
        _opts: object,
        cb: (err: Error | null, stdout?: string, stderr?: string) => void
      ) => {
        cb(null, 'switched', '');
      }
    );
    try {
      const result = await server['switchApp']('excel');
      expect(result).toBe(true);
      expect(server.getCurrentApp()).toBe('excel');
      expect(server.getLastSwitchError()).toBeNull();
    } finally {
      execFile.mockImplementation(origExecFile);
    }
  });
});

// handleResult 请求体安全：超大 body 413 / 非法 JSON 400 / 切换失败附加提示
describe('MacPollServer.handleResult 请求体安全', () => {
  const { EventEmitter } = require('events');

  function makeRes() {
    const res: any = {
      _status: 200,
      _body: '',
      headersSent: false,
      writeHead(status: number) {
        res._status = status;
        res.headersSent = true;
      },
      end(body: string) {
        res._body = body;
      },
    };
    return res;
  }

  it('超大请求体（>10MB）返回 413 并结束连接', () => {
    const server = new MacPollServer('/fake/path/wps-auto.sh');
    const req = new EventEmitter();
    req.destroy = jest.fn();
    const res = makeRes();
    server['handleResult'](req, res);

    // 模拟发送超过 10MB 的数据
    const chunk = Buffer.alloc(1024 * 1024, 'a'); // 1MB
    for (let i = 0; i < 11; i++) {
      req.emit('data', chunk);
    }
    expect(res._status).toBe(413);
    expect(req.destroy).toHaveBeenCalled();
    expect(res._body).toContain('Payload Too Large');
  });

  it('非法 JSON 返回 400', () => {
    const server = new MacPollServer('/fake/path/wps-auto.sh');
    const req = new EventEmitter();
    req.destroy = jest.fn();
    const res = makeRes();
    server['handleResult'](req, res);

    req.emit('data', Buffer.from('not-json{{{'));
    req.emit('end');
    expect(res._status).toBe(400);
    expect(res._body).toContain('Invalid JSON');
  });

  it('存在 lastSwitchError 时给结果对象附加 _switchWarning', async () => {
    const server = new MacPollServer('/fake/path/wps-auto.sh');
    const { execFile } = require('child_process');
    const origExecFile = execFile;
    execFile.mockImplementation(
      (_bin: string, _args: string[], _opts: object, cb: (err: Error | null) => void) => {
        cb(new Error('spawn ENOENT'));
      }
    );
    try {
      await server['switchApp']('excel');
      expect(server.getLastSwitchError()).toContain('应用切换失败');

      // 入队一个命令并模拟 WPS 返回结果（用 ping 避免再次触发切换）
      const resultPromise = server['executeCommand']('ping', {}, 30000);
      // 等待命令入队
      await new Promise(r => setTimeout(r, 50));
      const pending = server['pendingCommand'];
      expect(pending).toBeTruthy();
      if (!pending) throw new Error('pending command should exist');

      const req = new EventEmitter();
      req.destroy = jest.fn();
      const res = makeRes();
      server['handleResult'](req, res);
      req.emit(
        'data',
        Buffer.from(
          JSON.stringify({ requestId: pending.requestId, result: { success: true, value: 1 } })
        )
      );
      req.emit('end');

      const result: any = await resultPromise;
      expect(result._switchWarning).toContain('应用切换失败');
    } finally {
      execFile.mockImplementation(origExecFile);
    }
  });

  it('无 lastSwitchError 时不附加 _switchWarning', async () => {
    const server = new MacPollServer('/fake/path/wps-auto.sh');
    // 直接入队命令（用 ping，不触发切换），模拟正常结果返回
    const resultPromise = server['executeCommand']('ping', {}, 30000);
    await new Promise(r => setTimeout(r, 50));
    const pending = server['pendingCommand'];
    expect(pending).toBeTruthy();
    if (!pending) throw new Error('pending command should exist');
    const req = new EventEmitter();
    req.destroy = jest.fn();
    const res = makeRes();
    server['handleResult'](req, res);
    req.emit(
      'data',
      Buffer.from(
        JSON.stringify({ requestId: pending.requestId, result: { success: true, value: 2 } })
      )
    );
    req.emit('end');

    const result: any = await resultPromise;
    expect(result._switchWarning).toBeUndefined();
  });
});
