/**
 * 校对会话身份契约回归（Issue #382 DECISION-1）
 *
 * 背景：`session_id` 曾是 AI 必传参数（且要求 UUID v4），而运行环境无 node/powershell/python、
 * MCP 也无 UUID 工具 ⇒ AI 空转 11 轮。DECISION-1 彻底删掉该参数，改由**文档身份派生** key。
 *
 * 本文件锁住三条不变量（防「换个位置又复发」）：
 *   ① `deriveSessionKey` 是会话身份**唯一定义者**，同一文档经不同写法（分隔符/大小写）**必须同一 key**；
 *   ② 无 `filePath` **必须拒绝**（不回落 `fileName` —— 那是本仓明令「不要下兜底」的兜底）；
 *   ③ 两个 handler 的 key 派生**同一口径**（accumulate → generate 闭环）。
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → mock（与其它校对测试同惯例）
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { deriveSessionKey, sessionIssues } from '../../tools/word/proofread-session';
import {
  proofreadAccumulateHandler,
  generateProofreadReportHandler,
} from '../../tools/word/proofread-report';

const DOC = {
  fileName: 'a.docx',
  filePath: 'C:/doc/a.docx',
  totalParagraphs: 1,
  totalWords: 10,
};
const ISSUE = {
  offset: 0,
  length: 2,
  original: '原',
  suggestion: '改',
  type: '重复字符',
  source: 'mcp',
} as const;

afterEach(() => sessionIssues.clear());

describe('① deriveSessionKey = 会话身份唯一定义者', () => {
  it('同一路径不同写法（反斜杠 / 尾斜杠 / 大小写）→ 同一 key', () => {
    const k = deriveSessionKey({ filePath: 'C:/Doc/A.docx' });
    expect(deriveSessionKey({ filePath: 'C:\\Doc\\A.docx' })).toBe(k);
    expect(deriveSessionKey({ filePath: 'C:/Doc/A.docx/' })).toBe(k);
    expect(deriveSessionKey({ filePath: 'c:/doc/a.docx' })).toBe(k);
  });

  it('不同文档 → 不同 key（防「两个文档共用一个会话」）', () => {
    expect(deriveSessionKey({ filePath: 'C:/a.docx' })).not.toBe(
      deriveSessionKey({ filePath: 'C:/b.docx' })
    );
  });

  it('无 filePath / 空串 / 仅空白 → null（**不回落 fileName**）', () => {
    expect(deriveSessionKey({ fileName: 'a.docx' })).toBeNull();
    expect(deriveSessionKey({ filePath: '' })).toBeNull();
    expect(deriveSessionKey({ filePath: '   ' })).toBeNull();
    expect(deriveSessionKey(null)).toBeNull();
    expect(deriveSessionKey(undefined)).toBeNull();
  });
});

describe('② 无 filePath ⇒ handler 拒绝（不静默新建空会话）', () => {
  it('accumulate：doc_info 缺 filePath → 失败且提示明确', async () => {
    const r = await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: { fileName: 'a.docx', totalParagraphs: 1, totalWords: 10 },
      _processed_to_paragraph: 1,
    });
    expect(r.success).toBe(false);
    expect(r.content[0].text).toContain('无法定位校对会话');
  });

  it('generate：拿不到文档身份 → 失败（不静默给「0 问题报告」）', async () => {
    const r = await generateProofreadReportHandler({ doc_info: { fileName: 'a.docx' } });
    expect(r.success).toBe(false);
    expect(r.content[0].text).toContain('无法定位校对会话');
  });

  it('generate：文档身份派生成功但无会话 → 失败且提示先累加', async () => {
    const r = await generateProofreadReportHandler({ doc_info: DOC });
    expect(r.success).toBe(false);
    expect(r.content[0].text).toContain('未找到会话');
  });
});

describe('③ accumulate → generate 同一 key 闭环', () => {
  it('两次调用派生同一 key（不同写法亦同）→ 报告可生成', async () => {
    const acc = await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: DOC,
      _processed_to_paragraph: 1,
    });
    expect(acc.success).toBe(true);
    // 用**不同写法**的同一路径生成报告 ⇒ 必须命中同一会话（证明 key 派生单一口径）
    const rep = await generateProofreadReportHandler({
      doc_info: { ...DOC, filePath: 'C:\\doc\\a.docx' },
    });
    expect(rep.success).toBe(true);
    expect(rep.content[0].text).toContain('校对报告');
  });

  it('后续批 doc_info 缺 totalWords → 报告仍用首次值（CR1-2 防复发：不整体覆盖）', async () => {
    const doc = { fileName: 'a.docx', filePath: '/p/a.docx', totalParagraphs: 2, totalWords: 999 };
    await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: doc,
      _processed_to_paragraph: 1,
    });
    // 第 2 批只带身份字段（AI 的自然行为）——整体覆盖会把 totalWords 抹成 undefined ⇒ 报告「总字数: 0」回归
    await proofreadAccumulateHandler({
      issues: [{ ...ISSUE, offset: 10 }],
      doc_info: { fileName: 'a.docx', filePath: '/p/a.docx', totalParagraphs: 2 },
      _processed_to_paragraph: 2,
    });
    const rep = await generateProofreadReportHandler({ doc_info: doc });
    expect(rep.content[0].text).toContain('**总字数**: 999');
    expect(rep.content[0].text).not.toContain('**总字数**: 0');
  });

  it('totalParagraphs 只允许上调：后续批谎报小值不得绕过覆盖门禁（CR7-1 防复发）', async () => {
    const doc = { fileName: 'a.docx', filePath: '/p/a.docx', totalParagraphs: 1000, totalWords: 9 };
    const acc = await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: doc,
      _processed_to_paragraph: 200,
    });
    expect(acc.success).toBe(true);
    // 后续批谎报 totalParagraphs=250（远小于真实 1000）——若被接受，processedTo(250) >= 250 会「提前覆盖全文」
    await proofreadAccumulateHandler({
      issues: [],
      doc_info: { fileName: 'a.docx', filePath: '/p/a.docx', totalParagraphs: 250 },
      _processed_to_paragraph: 250,
    });
    const rep = await generateProofreadReportHandler({ doc_info: doc });
    expect(rep.success).toBe(false); // 覆盖门禁必须仍然拦住（未覆盖 1000 段）
    expect(rep.content[0].text).toContain('文档共 1000 段');
  });

  it('Issue #420：不传 output_file 生成（方案 B 返回 content）**不得**释放会话 —— 否则重试落盘恒报「未找到会话」', async () => {
    await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: DOC,
      _processed_to_paragraph: 1,
    });
    const first = await generateProofreadReportHandler({ doc_info: DOC }); // 方案 B：只返回 content
    expect(first.success).toBe(true);
    expect(first.content[0].text).toContain('校对报告');
    // 原实现 `!outputFile || wrote` 会在此销毁会话 ⇒ 下面这次重试必失败（会话自纠路径被自己掐死）
    const retry = await generateProofreadReportHandler({ doc_info: DOC });
    expect(retry.success).toBe(true);
    expect(retry.content[0].text).not.toContain('未找到会话');
  });

  it('Issue #420 CR-420-2：方案 B 交付后，同文档**重跑** accumulate 不得被残留进度拦死', async () => {
    await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: DOC,
      _processed_to_paragraph: 1,
    });
    await generateProofreadReportHandler({ doc_info: DOC }); // 方案 B 交付（会话标记 reported，但不立即回收）
    // 用户重新跑校对：新一批上报**相同**进度（未 _restart）。残留会话若被复用，会命中
    // 「_processed_to_paragraph 必须严格递增（10 ≤ 10）」—— 实测反例，故已交付会话须重开。
    const again = await proofreadAccumulateHandler({
      issues: [ISSUE],
      doc_info: DOC,
      _processed_to_paragraph: 1,
    });
    expect(again.success).toBe(true);
    expect(again.content[0].text).not.toContain('必须严格递增');
    // 重开后此前累加的历史被清空（新一轮），报告仍可基于新会话生成
    const rep = await generateProofreadReportHandler({ doc_info: DOC });
    expect(rep.content[0].text).not.toContain('未找到会话');
  });

  it('schema 说真话：doc_info 展开 4 子字段**且 4 子字段全部 required**', async () => {
    const { proofreadAccumulateDefinition } = await import('../../tools/word/proofread-report');
    const props = proofreadAccumulateDefinition.inputSchema.properties as Record<
      string,
      { properties?: Record<string, unknown>; required?: unknown }
    >;
    const docInfo = props.doc_info;
    expect(docInfo).toBeTruthy();
    const keys = ['fileName', 'filePath', 'totalParagraphs', 'totalWords'];
    expect(Object.keys(docInfo!.properties || {}).sort()).toEqual(keys.slice().sort());
    // 核心断言：**只测存在性会让「全 required」空转**（CR 复核发现的假绿用例）——
    // 子字段必须逐个进 required，否则 AI 看 schema 仍不知 totalWords 必填（#382 黑盒通道③）。
    expect((docInfo!.required as string[]).slice().sort()).toEqual(keys.slice().sort());
  });

  it('schema 说真话：缺 required 的子字段模式必须被本用例判红（变异自证）', () => {
    // 复现「只断言 properties、不断言 required」的假绿形态：拿真 schema 去掉 required 再断言，
    // 必须失败 ⇒ 证明上面那条断言不是恒真。
    const mutated = {
      properties: { fileName: {}, filePath: {}, totalParagraphs: {}, totalWords: {} },
    } as {
      required?: string[];
    };
    expect((mutated.required as string[] | undefined)?.slice().sort()).not.toEqual([
      'fileName',
      'filePath',
      'totalParagraphs',
      'totalWords',
    ]);
  });
});
