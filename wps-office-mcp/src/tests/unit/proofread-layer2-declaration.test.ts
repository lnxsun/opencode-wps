/**
 * Issue #382 C2 回归：`confirmBatchAiProofread` 的「必须产出可核对」
 *
 * 病灶（#382 P1-A）：该确认原为**空签到**——恒返回「已确认完成」，Layer 2（AI 语义）产出
 * **无人验收**，于是报告里「AI 智能校对 0 处」与 AI thinking「其实看出了病句」并存。
 *
 * 本次把它从「必填一个数」升级为「**申报 + 服务端 Layer 1 实测交叉核对 + 报告披露**」：
 *   · `proofreadBasic` 捕获本批 Layer 1 实测条数（服务端，AI 不可伪造）；
 *   · `confirmBatchAiProofread` 把 `ai_issue_count` 与该实测值**一并入队**；
 *   · `proofreadAccumulate` 出队并入会话；报告披露「Layer 2 合计产出」并标出漂移批次。
 *
 * 本文件打**真实 handler 链路**（confirm → accumulate → report），锁住用户可见结论。
 */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { confirmBatchAiProofreadHandler, proofreadBasicHandler } from '../../tools/word/proofread';
import {
  proofreadAccumulateHandler,
  generateProofreadReportHandler,
} from '../../tools/word/proofread-report';
import { sessionIssues } from '../../tools/word/proofread-session';

const DOC = { fileName: 'd.docx', filePath: '/p/l2.docx', totalParagraphs: 10, totalWords: 100 };

// Issue #420：`generate` **只在真正落盘后**回收会话（原先「不传 output_file 也回收」是缺陷，
// 会让「重试落盘」恒报「未找到会话」）⇒ 用例必须**显式**清理会话，不得再依赖「generate 顺手清场」。
afterEach(() => sessionIssues.clear());

describe('C2：confirmBatchAiProofread 申报 + 报告披露（Issue #382）', () => {
  it('非整数 / 负数 / 缺省 ai_issue_count 一律拒绝（必填契约）', async () => {
    for (const bad of [undefined, -1, 1.5, '2', null]) {
      const r = await confirmBatchAiProofreadHandler({ ai_issue_count: bad } as Record<
        string,
        unknown
      >);
      expect(r.success).toBe(false);
    }
  });

  it('合法整数通过，且回执不含「Layer 1 未捕获」提示时即视为已交叉核对', async () => {
    const r = await confirmBatchAiProofreadHandler({ ai_issue_count: 0 } as Record<
      string,
      unknown
    >);
    expect(r.success).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain('Layer 2 产出 0 条');
  });

  it('申报并入会话后，报告披露「Layer 2 产出」节（合计与逐批明细）', async () => {
    await confirmBatchAiProofreadHandler({ ai_issue_count: 3 } as Record<string, unknown>);
    await proofreadAccumulateHandler({
      issues: [],
      doc_info: DOC,
      _processed_to_paragraph: 10,
    } as Record<string, unknown>);
    const rep = await generateProofreadReportHandler({ doc_info: DOC } as Record<string, unknown>);
    expect(rep.success).toBe(true);
    const t = (rep.content[0] as { text: string }).text;
    expect(t).toContain('Layer 2（AI 语义）产出');
    expect(t).toContain('Layer 2 合计产出 3 条');
  });

  it('漂移检测：Layer 1 实测命中 >0 而申报 Layer 2 = 0 ⇒ 报告显式标出该批（#382 症状）', async () => {
    // 先真实跑一次 proofreadBasic（Layer 1 捕获实测条数）——用一段确定会被正则命中的文本
    const basic = await proofreadBasicHandler({ text: '进行研究后记部分。', start_offset: 0 });
    expect(basic.success).toBe(true);
    const layer1Hit = /发现 (\d+) 个问题/.exec((basic.content[0] as { text: string }).text);
    expect(layer1Hit).not.toBeNull();
    expect(Number(layer1Hit![1])).toBeGreaterThan(0);

    // 申报 Layer 2 = 0（AI 声称「逐句已核未命中」）——服务端 Layer 1 实测 >0，应触发漂移披露
    await confirmBatchAiProofreadHandler({ ai_issue_count: 0 } as Record<string, unknown>);
    await proofreadAccumulateHandler({
      issues: [],
      doc_info: DOC,
      _processed_to_paragraph: 10,
    } as Record<string, unknown>);
    const rep = await generateProofreadReportHandler({ doc_info: DOC } as Record<string, unknown>);
    const t = (rep.content[0] as { text: string }).text;
    expect(t).toContain('批申报 0 但 Layer 1 实测命中 >0');
    expect(t).toContain('请人工复核其 AI 语义分析是否逐句已核');
  });

  it('零申报批次并入会话：明细表中该批 Layer 2 记 0（未被静默吞掉）', async () => {
    await confirmBatchAiProofreadHandler({ ai_issue_count: 0 } as Record<string, unknown>);
    await proofreadAccumulateHandler({
      issues: [],
      doc_info: DOC,
      _processed_to_paragraph: 10,
    } as Record<string, unknown>);
    const rep = await generateProofreadReportHandler({ doc_info: DOC } as Record<string, unknown>);
    const t = (rep.content[0] as { text: string }).text;
    expect(t).toContain('Layer 2 合计产出 0 条');
    // 明细表存在（逐批一行），证明 0 是被记录而非被丢弃
    expect(t).toMatch(/\|\s*1\s*\|/);
  });
});
