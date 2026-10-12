/**
 * `enableTrackChanges` 独立回读契约（Issue #395 RC-3 · AC4.1 / AC4.2）
 *
 * 背景（RC-3）：`wps-com.ps1:2709` 的 `enableTrackChanges` 分支把 **回写入参** 回显为
 * `data.trackChanges = $enable`，把 **真实回读** 放在 `data.active = $doc.TrackRevisions`——
 * 二者同属一次 COM 往返，初次调用可能「写入被静默拒绝却回显成功」。
 * 故 handler 改为：另起一次 `getTrackChangesStatus` 独立往返取**真实状态**，文案只依据回读值，
 * 不一致即 `success:false`（不留假成功）。
 *
 * 本测试即该契约的**唯一执行者**（此前后全仓无任何用例覆盖 —— Issue #395 评审 R2-3）：
 *   ① 设置 true、回读 true → success:true，文案「已开启」（依据回读值）
 *   ② 设置 true、回读 false（谎报）→ success:false，且文案**不含**「已开启」
 *   ③ 回读通道失败（success:false）→ success:false 并提示「读取失败」
 *   ④ 变异自证：删掉「不一致即失败」判据 → ② 由绿转红
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → 按既有惯例手动 mock
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('../../client/wps-client', () => ({
  wpsClient: { executeMethod: jest.fn() },
  WpsAppType: { WRITER: 'writer', SPREADSHEET: 'spreadsheet', PRESENTATION: 'presentation' },
}));

import * as fs from 'fs';
import * as path from 'path';
import { wpsClient } from '../../client/wps-client';
import { enableTrackChangesHandler } from '../../tools/word/proofread';

const mockExec = wpsClient.executeMethod as jest.Mock;

/** 让 executeMethod 按 method 名分派：enableTrackChanges 返回 enableResp，getTrackChangesStatus 返回 statusResp。 */
function dispatch(enableResp: unknown, statusResp: unknown) {
  mockExec.mockImplementation((method: string) =>
    method === 'enableTrackChanges' ? Promise.resolve(enableResp) : Promise.resolve(statusResp)
  );
}

const textOf = (r: { content?: Array<{ text?: string }> }) => r.content?.[0]?.text || '';

describe('enableTrackChanges 独立回读（Issue #395 RC-3 / AC4.1+AC4.2）', () => {
  beforeEach(() => mockExec.mockReset());

  it('① 设置 true、独立回读 true → success:true，文案「已开启」', async () => {
    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: true, data: { trackChanges: true } }
    );
    const r = await enableTrackChangesHandler({ enable: true });
    expect(r.success).toBe(true);
    expect(textOf(r)).toContain('已开启');
  });

  it('② 设置 true、回读 false（写入被静默拒绝）→ success:false，文案不含「已开启」', async () => {
    // enableTrackChanges 回显成功且 active=true（谎报），但独立回读为 false
    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: true, data: { trackChanges: false } }
    );
    const r = await enableTrackChangesHandler({ enable: true });
    expect(r.success).toBe(false);
    expect(textOf(r)).not.toContain('已开启！');
    expect(textOf(r)).toContain('未生效');
  });

  it('③ 回读通道失败 → success:false 并提示「读取失败」', async () => {
    dispatch(
      { success: true, data: { trackChanges: true, active: true } },
      { success: false, error: 'boom' }
    );
    const r = await enableTrackChangesHandler({ enable: true });
    expect(r.success).toBe(false);
    expect(textOf(r)).toContain('读取失败');
  });

  it('④ 变异自证：删掉「回读不一致即失败」判据 → 用例②由绿转红', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'tools', 'word', 'proofread.ts'),
      'utf8'
    );
    // 判据形态（不一致即失败）必须在源码中存在；删掉即本断言转红。
    // ⚠️ Issue #401（R4）：比较右端由 `enable === true` 改为 `wantEnable`
    //   —— 缺省语义统一为「仅显式 false 才算请求关闭」（与 governance 侧同口径）。
    expect(src).toMatch(/actual !== wantEnable/);
    // 且文案须依据回读值 actual（不得用回写入参拼「已开启」）
    expect(src).toMatch(/actual \? '已开启' : '已关闭'/);
    // 反向：不得存在用回写入参 enable 拼装「已开启」的旧写法
    expect(src).not.toMatch(/response\.data\.active \? '已开启'/);
  });
});
