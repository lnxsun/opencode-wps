/**
 * handler ↔ governance 的**结果信封契约**（Issue #401 W-2 · 真实链路）
 *
 * 本 Issue 的缺口：治理层据 handler 结果判「成功/失败」，但该判定所依赖的**信封形态**
 * 与**真实链路**不一致 —— 且此前只由 e2e 自带 stub 承担（stub 自己造形态 ⇒ 改字段名照样绿）。
 *
 * 本测试把契约钉在**真实代码**上（不是重写一份 stub）：
 *   ① 用真实 `enableTrackChangesHandler` 走两条路径（成功 / 回读不一致）；
 *   ② 用**从 `mcp-server.ts` 源码派生的投影公式**做投影（不手写第二份 `{content,isError}`）；
 *   ③ 断言「投影后信封上仍然存在」的键 = 治理层消费点允许读的键（唯一来源 = 根仓守卫的
 *      `ENVELOPE_ALLOWED_KEYS`，经 JSON 子进程读取，**不在本文件重抄常量**）；
 *   ④ 变异自证：handler 返回体加一个治理层读不到的键 ⇒ 断言仍成立（不是靠键名巧合）；
 *      反向 —— 若把治理层的消费键改成 `success`，则「该键在投影后不存在」被断言抓住。
 *
 * ⚠️ 自限（显式披露）：本测试**不启动 WPS**（handler 的 COM 通道被 mock），属「服务端整链（桩数据）」；
 *    真实 WPS 端到端见 Issue #395 登记的条件项。
 */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../client/wps-client', () => ({
  wpsClient: { executeMethod: jest.fn() },
  WpsAppType: { WRITER: 'writer', SPREADSHEET: 'spreadsheet', PRESENTATION: 'presentation' },
}));

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { wpsClient } from '../../client/wps-client';
import { enableTrackChangesHandler } from '../../tools/word/proofread';

const mockExec = wpsClient.executeMethod as jest.Mock;

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const MCP_SERVER = path.join(REPO_ROOT, 'wps-office-mcp', 'src', 'server', 'mcp-server.ts');

/** 从 mcp-server.ts 源码派生「投影公式」用到的键（唯一来源 = 源码，不手写）。 */
function deriveProjectionKeys(): { contentKey: string; isErrorKey: string } {
  const src = fs.readFileSync(MCP_SERVER, 'utf8');
  const call =
    /return\s*\{\s*([A-Za-z_]+)\s*:\s*result\.content\s*,\s*([A-Za-z_]+)\s*:\s*!result\.success\s*,?\s*\}/.exec(
      src
    );
  if (!call) throw new Error('未能从 mcp-server.ts 派生结果投影公式（源已变？）');
  return { contentKey: call[1], isErrorKey: call[2] };
}

/** 允许读的信封顶层键：唯一来源 = 根仓守卫（子进程读取，不在本文件重抄常量）。 */
function readAllowedEnvelopeKeys(): string[] {
  const out = execFileSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts', 'validate-tool-result-payload.js'), '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  return JSON.parse(out).allowedKeys as string[];
}

function dispatch(enableResp: unknown, statusResp: unknown) {
  mockExec.mockImplementation((method: string) =>
    method === 'enableTrackChanges' ? Promise.resolve(enableResp) : Promise.resolve(statusResp)
  );
}

describe('handler ↔ governance 结果信封契约（Issue #401 W-2）', () => {
  beforeEach(() => mockExec.mockReset());

  it('投影后的信封**不含** `success`（它是 TS 返回体的键，非治理层可读的键）', async () => {
    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: true, data: { trackChanges: true } }
    );
    const r = (await enableTrackChangesHandler({ enable: true })) as unknown as Record<
      string,
      unknown
    >;
    // 前置：handler 返回体确实带 success（TS 契约）
    expect(r.success).toBe(true);
    const { contentKey, isErrorKey } = deriveProjectionKeys();
    const envelope: Record<string, unknown> = { [contentKey]: r.content, [isErrorKey]: !r.success };
    // 断言：投影公式产出的键集**不含** success ⇒ 治理层若读 success 必然读到 undefined。
    expect(Object.keys(envelope)).not.toContain('success');
    expect(Object.keys(envelope)).toEqual(expect.arrayContaining([contentKey, isErrorKey]));
  });

  it('成功路径：投影后 isError=false；失败路径：投影后 isError=true（且失败仍带可读文案）', async () => {
    const { contentKey, isErrorKey } = deriveProjectionKeys();
    const textOf = (r: { content?: Array<{ text?: string }> }) => r.content?.[0]?.text || '';

    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: true, data: { trackChanges: true } }
    );
    const ok = (await enableTrackChangesHandler({ enable: true })) as unknown as {
      success: boolean;
      content: Array<{ text: string }>;
    };
    const okEnv: Record<string, unknown> = { [contentKey]: ok.content, [isErrorKey]: !ok.success };
    expect(okEnv[isErrorKey]).toBe(false);
    expect(String(textOf(ok))).toMatch(/已开启/);

    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: true, data: { trackChanges: false } }
    );
    const bad = (await enableTrackChangesHandler({ enable: true })) as unknown as {
      success: boolean;
      content: Array<{ text: string }>;
    };
    const badEnv: Record<string, unknown> = {
      [contentKey]: bad.content,
      [isErrorKey]: !bad.success,
    };
    expect(badEnv[isErrorKey]).toBe(true);
    // 失败文案是人类可读中文（治理层的**文案兜底**才有东西可兜）；不得依赖字段名字面量。
    expect(String(textOf(bad))).toMatch(/未生效|读取失败/);
    expect(String(textOf(bad))).not.toMatch(/\b(isError|success)\b\s*:/);
  });

  it('治理层允许读的键 ⊆ 投影后真实存在的键（唯一键名闭合，键集不手抄）', () => {
    const { contentKey, isErrorKey } = deriveProjectionKeys();
    const projectedKeys = new Set([contentKey, isErrorKey]);
    const allowed = readAllowedEnvelopeKeys();
    expect(allowed.length).toBeGreaterThan(0);
    for (const k of allowed) expect(projectedKeys.has(k)).toBe(true);
  });

  it('变异自证：handler 返回体新增一个未投影的键 → 该键仍不可被治理层读（契约不因加键而放宽）', async () => {
    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: true, data: { trackChanges: true } }
    );
    const r = (await enableTrackChangesHandler({ enable: true })) as unknown as Record<
      string,
      unknown
    >;
    const mutated = { ...r, brandNewKey: 'x' } as Record<string, unknown>;
    const { contentKey, isErrorKey } = deriveProjectionKeys();
    const envelope: Record<string, unknown> = {
      [contentKey]: mutated.content,
      [isErrorKey]: !mutated.success,
    };
    expect(Object.keys(envelope)).not.toContain('brandNewKey');
    const allowed = readAllowedEnvelopeKeys();
    expect(allowed).not.toContain('brandNewKey');
  });
});
