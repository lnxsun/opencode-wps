/**
 * 活动文档取用与「通道自检」的诚实性（Issue #373）
 *
 * 背景（实测 Issue #373 ses_f3d6）：`getActiveDocument` 在 COM 失败时回退读 launcher 心跳缓存
 * （`docinfo.cache.json`，插件每 500ms 推送），并把缓存包成 `success: true` —— 该缓存只证明
 * 「WPS 里开过文档」，**不证明 COM 通道可用**。于是同轮对话里出现自相矛盾的两个信号：
 *   · `getActiveDocument` → 「总段数: 24324 / 字数: 129168」（看起来成功）
 *   · 其余全部工具 → `No active document`
 * AI 据此认定「文档健在、只是这些工具挑食」，盲试 30 余次、整轮零产出。
 *
 * 本测试守护两件事（**行为级**，非源码字符串检查）：
 *   A. 通道未就绪时的输出**恒为 success:false**，且缓存信息只作「诊断线索·非成功」；
 *   B. 新增的通道自检 `whoami` 在「有文档 / 无文档」两种输入下输出**可机读**的 next-step
 *      （`channelReady` + `hint`），使 AI 不必重复同一个失败调用。
 */
import { WpsMcpServer } from '../../server/mcp-server';
import { toolRegistry } from '../../server/tool-registry';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-373') }));

jest.mock('../../client/wps-client', () => ({
  wpsClient: {
    checkConnection: jest.fn(),
    getStatus: jest.fn(() => ({ connected: true })),
    getActiveDocument: jest.fn(),
    callApi: jest.fn(),
    invokeAction: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../tools/gateway', () => ({
  searchTools: jest.fn(),
  executeTool: jest.fn(),
}));

jest.mock('../../utils/launcher', () => ({
  fetchDocInfoFromLauncher: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wpsClient } = require('../../client/wps-client');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchDocInfoFromLauncher } = require('../../utils/launcher');

describe('通道自检 whoami 与内置工具数量的真值源（Issue #373）', () => {
  let server: WpsMcpServer;

  beforeEach(() => {
    jest.clearAllMocks();
    server = new WpsMcpServer({ name: 'test', version: '0.0.0' });
    server.registerBuiltinTools();
  });

  const findTool = (name: string) => {
    const t = toolRegistry.getTool(name);
    if (!t) throw new Error(`tool not found: ${name}`);
    return t;
  };

  it('内置工具注册清单以 mcp-server 为准（含 whoami，数量与源码精确相等）', () => {
    const names = toolRegistry
      .listTools()
      .tools.map((t: { name: string }) => t.name)
      .filter((n: string) => n.startsWith('wps_'));
    expect(names).toContain('wps_whoami');
    // ⚠️ Issue #373 第 6 轮 CR6-3：原为 `toBeGreaterThan(12)` —— 对真值 15 几乎无判别力
    //   （只要 >12 都过），属「看起来测了其实没测」。改为与**唯一定义者**精确相等：
    //   从 mcp-server.ts 的注册调用处派生真值（与 validate-tool-counts.js 同一口径）。
    const declared = (
      require('fs')
        .readFileSync(require('path').join(__dirname, '../../server/mcp-server.ts'), 'utf8')
        .match(/name:\s*'wps_[a-z0-9_]+'/g) || []
    ).length;
    expect(declared).toBeGreaterThan(12); // 真值源本身不得退化到空集
    // ⚠️ Issue #382：注册面 = 内置工具（mcp-server.ts）+ 注册工具（allTools）——
    //   DECISION-1 后 registerBuiltinTools() 末尾真实 registerAll(allTools)，
    //   故此处口径同步为「内置 + 注册」（与 validate-gateway-membership 的直连注册口径一致）。
    const { allTools } = require('../../tools');
    expect(names.length).toBe(declared + allTools.length);
  });

  it('whoami：COM 有活动文档 → channelReady:true 且建议直接调用内置工具', async () => {
    wpsClient.getActiveDocument.mockResolvedValue({ name: 'a.docx', path: '/tmp/a.docx' });
    const res = await findTool('wps_whoami').handler({});
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(res.success).toBe(true);
    // RES1-1/CR2-3：通道就绪由**独立字段** channelReady 承载（success 只表「自检已执行」）；
    // whoami 为新工具，无旧消费者 ⇒ 不保留已废弃的 ready 别名（口径唯一，CR2-3）
    expect(body.channelReady).toBe(true);
    expect(body.ready).toBeUndefined();
    expect(body.activeDocument).toEqual({ name: 'a.docx', path: '/tmp/a.docx' });
    expect(body.hint).not.toMatch(/不要重复/);
  });

  it('whoami：COM 取不到文档（抛错）→ channelReady:false 且给出「先自检、别盲试」的下一步', async () => {
    wpsClient.getActiveDocument.mockRejectedValue(new Error('No active document'));
    const res = await findTool('wps_whoami').handler({});
    const body = JSON.parse((res.content[0] as { text: string }).text);
    // ⚠️ 自检执行成功（success 语义）与通道就绪（channelReady 语义）分离 —— RES1-1 防回归
    expect(res.success).toBe(true);
    expect(body.channelReady).toBe(false);
    expect(body.ready).toBeUndefined();
    expect(body.activeDocument).toBeNull();
    expect(body.hint).toMatch(/不要重复/);
  });

  it('whoami：COM 返回 null（Word 在跑但无活动文档）→ channelReady:false（不伪装成功）', async () => {
    wpsClient.getActiveDocument.mockResolvedValue(null);
    const res = await findTool('wps_whoami').handler({});
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body.channelReady).toBe(false);
    expect(body.ready).toBeUndefined();
    expect(body.hint).toMatch(/不要重复/);
  });

  it('getActiveDocument：COM 失败 + 缓存可读 → success 恒为 false，缓存降级为「诊断线索·非成功」', async () => {
    wpsClient.getActiveDocument.mockResolvedValue(null);
    fetchDocInfoFromLauncher.mockResolvedValue({ name: 'stale.docx', path: '/tmp/stale.docx' });
    const res = await findTool('wps_get_active_document').handler({});
    expect(res.success).toBe(false);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toMatch(/诊断线索·非成功/);
    expect(text).toMatch(/stale\.docx/);
    // 真值：不得把缓存包成成功体（字段名与 whoami 统一为 channelReady —— 第 8 轮 CR8-1）
    expect(text).toMatch(/"channelReady":false|"channelReady": false/);
  });

  it('getActiveDocument：COM 成功 → success:true 且 channelReady 与失败侧对称', async () => {
    wpsClient.getActiveDocument.mockResolvedValue({ name: 'ok.docx', path: '/tmp/ok.docx' });
    const res = await findTool('wps_get_active_document').handler({});
    expect(res.success).toBe(true);
    // 第 9 轮 CR9-1：成功/失败两侧字段集合须对称 —— 消费方统一读 channelReady 不得读到 undefined
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body.channelReady).toBe(true);
    expect(body.name).toBe('ok.docx');
  });
});
