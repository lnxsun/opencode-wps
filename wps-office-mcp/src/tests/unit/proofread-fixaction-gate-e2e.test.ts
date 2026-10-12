/**
 * P1-1 门禁端到端回归：`report__only` 变体族 + 推断归因必须如实落进报告
 *
 * 背景：`proofread-normalize.ts` 的变体族漏判会让「N 处仅报告未修」静默变成「全部已修复 ✅」，
 * 历史 R1-4 / R9-1 两次复发均因分隔符列举不全。本测试直接打报告 handler，锁住**用户可见结论**，
 * 而非只锁归一化函数的返回值（后者由 proofread-normalize-contract.test.ts 覆盖）。
 *
 * 说明：本文件不 mock 任何存储 —— `sessionIssues` 是进程内 Map，按定义即「磁盘恢复的裸数据」形态
 * （未过 accumulate 归一化），正好复现真实漏判路径。
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → 按既有惯例手动 mock
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { generateProofreadReportHandler } from '../../tools/word/proofread-report';
import { sessionIssues, deriveSessionKey } from '../../tools/word/proofread-session';

/** 注入一份「覆盖完整」的裸会话（字段刻意不归一化，模拟磁盘恢复 / 测试直注）。
 * ⚠️ Issue #382：会话 key 不再是 AI 传的 `id`，而是**文档派生 key**（deriveSessionKey(docInfo.filePath)）——
 * 本 helper 用「同一条文档路径」派生 key，使 seed 与 handler 查的是同一会话（无需 mock 活动文档）。 */
const TEST_DOC = {
  fileName: 'd.docx',
  filePath: '/p/d.docx',
  totalParagraphs: 100,
  totalWords: 500,
};
function seedSession(
  id: string,
  issues: Array<Record<string, unknown>>,
  over: Record<string, unknown> = {}
) {
  void id; // 历史签名保留（用例可读性）；真实 key 由 TEST_DOC.filePath 派生
  const docInfo = (over.docInfo as Record<string, unknown>) || TEST_DOC;
  sessionIssues.set(
    deriveSessionKey(docInfo as { filePath?: string }) as string,
    {
      issues,
      docInfo,
      createdAt: new Date().toISOString(),
      totalRevisions: 0,
      progress: { processedToParagraph: 100, totalParagraphs: 100, allBatchesComplete: true },
      ...over,
    } as never
  );
}

const rawIssue = (i: number, over: Record<string, unknown> = {}) => ({
  offset: i * 10,
  length: 2,
  original: `原${i}`,
  suggestion: `改${i}`,
  type: '重复字符',
  source: 'ai',
  context: '...',
  ...over,
});

describe('P1-1 门禁：report_only 变体族（R9-1 防复发）', () => {
  const variants = [
    'report_only',
    'report__only',
    'report  _  only',
    'report_-_only',
    'REPORT_ONLY',
    'reportOnly',
  ];

  it('全为未被识别的变体 → 报告必须显示「N 处仅报告未修」，不得显示「全部已修复 ✅」', async () => {
    const sid = 'gate-variants';
    seedSession(
      sid,
      variants.map((v, i) => rawIssue(i, { fix_action: v }))
    );
    const text = (await generateProofreadReportHandler({ doc_info: TEST_DOC })).content[0].text!;
    expect(text).not.toContain('| 全部已修复 | ✅ |');
    expect(text).toContain(`| 全部已修复 | ❌ 未达成（${variants.length} 处仅报告未修） |`);
  });

  it('混合 fix + report__only → 只计未修项，不把已修算成未修', async () => {
    const sid = 'gate-variants-mixed';
    seedSession(sid, [
      rawIssue(0, { fix_action: 'fix' }),
      rawIssue(1, { fix_action: 'FIX' }),
      rawIssue(2, { fix_action: 'report__only' }),
      rawIssue(3, { fix_action: 'report_only' }),
    ]);
    const text = (await generateProofreadReportHandler({ doc_info: TEST_DOC })).content[0].text!;
    // 未修 2 处必须被如实归类（形态为「N 处仅报告未修」或状态行中的同义计数）
    expect(text).toMatch(/2 处仅报告未修|2 处标记为「仅报告未修」/);
    expect(text).not.toContain('| 全部已修复 | ✅ |');
  });
});

describe('P1-1 门禁：推断归因披露（R6-1 / R9-2 防复发）', () => {
  it('漏传 fix_action → 按已修计入但必须披露「服务端推断 / AI 漏传」', async () => {
    const sid = 'gate-inferred-missing';
    seedSession(sid, [rawIssue(0), rawIssue(1)], { totalRevisions: 4 }); // 均未传 fix_action
    // 修订数给足，保证走到「全部已修复 ✅」分支（推断归因的披露只在该分支出现）
    const text = (await generateProofreadReportHandler({ doc_info: TEST_DOC })).content[0].text!;
    expect(text).toContain('| 全部已修复 | ✅ |');
    expect(text).toContain('2 处修复归因来自服务端推断');
    expect(text).toContain('2 处未标注 fix_action（AI 漏传）');
  });

  it('传入未被识别的取值（pending）→ 归因为「取值未被识别」，不得误述为「未标注」', async () => {
    const sid = 'gate-inferred-unknown';
    seedSession(sid, [rawIssue(0, { fix_action: 'pending' })], { totalRevisions: 2 });
    const text = (await generateProofreadReportHandler({ doc_info: TEST_DOC })).content[0].text!;
    expect(text).toContain('| 全部已修复 | ✅ |');
    expect(text).toContain('1 处 fix_action 取值未被识别');
    expect(text).not.toContain('1 处未标注 fix_action');
  });
});

describe('跳过披露：半跳/越界在报告中不得成为「如实披露」', () => {
  it('回归锚点：合法整块跳过（区间并集覆盖本批 + count = 本批段数）→ 报告出现披露节', async () => {
    const sid = 'gate-skip-legit';
    // 起始进度 0 → 本批 = [1,100]，声明覆盖整批且 count 等于本批段数
    seedSession(sid, [rawIssue(0, { fix_action: 'fix' })], {
      totalRevisions: 2,
      progress: { processedToParagraph: 0, totalParagraphs: 100, allBatchesComplete: false },
    });
    const { proofreadAccumulateHandler } = require('../../tools/word/proofread-report');
    const acc = await proofreadAccumulateHandler({
      issues: [],
      doc_info: TEST_DOC,
      _processed_to_paragraph: 100,
      skipped_segments: { count: 100, ranges: [[1, 100]] },
    });
    expect(acc.success).toBe(true);
    const text = (await generateProofreadReportHandler({ doc_info: TEST_DOC })).content[0].text!;
    expect(text).toContain('跳过范围披露');
    expect(text).toContain('累计跳过段数 | 100 段');
  });

  it('半跳声明（区间落在本批内但未铺满）→ 不得产生披露记录', async () => {
    const sid = 'gate-skip-half';
    // 批次推进：先 [1,200] 再 [201,400]，本批 = [201,400]；本批 0 问题（贴合真实链路）
    seedSession(sid, [], {
      totalRevisions: 2,
      docInfo: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 400, totalWords: 500 },
      progress: { processedToParagraph: 200, totalParagraphs: 400, allBatchesComplete: false },
    });
    const DOC400 = {
      fileName: 'd.docx',
      filePath: '/p/d.docx',
      totalParagraphs: 400,
      totalWords: 500,
    };
    const { proofreadAccumulateHandler } = require('../../tools/word/proofread-report');
    // 声明仅跳过 [201,300]（半跳）
    const acc = await proofreadAccumulateHandler({
      issues: [],
      doc_info: { ...TEST_DOC, totalParagraphs: 400 },
      _processed_to_paragraph: 400,
      skipped_segments: { count: 100, ranges: [[201, 300]] },
    });
    expect(acc.success).toBe(true);
    const text = (await generateProofreadReportHandler({ doc_info: DOC400 })).content[0].text!;
    expect(text).not.toContain('跳过范围披露');
  });
});
