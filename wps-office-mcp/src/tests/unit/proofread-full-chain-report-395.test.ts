/**
 * 校对**整链**报告环回归（Issue #395 收口：让「整链」名副其实）
 *
 * 背景（用户 09-28 追问的落点）：7/13 交付的 `runFullChain()` 只串到 `proofreadAccumulate`，
 * **从未调用 `generateProofreadReport`** ⇒ 原始症状「8 处问题 / 六维全 10.0」的**产生环节**
 * （报告生成）压根不在那条「整链」里。本文件把报告环接进真实链路并补一条**链路级对账断言**：
 *
 *   六维计数合计 + 未分类数 == 上报总数
 *
 * 与既有测试的边界（**不重复造第二份**）：
 *   · `proofread-normalize-contract.test.ts` 断言的是 `computeReportData`（纯函数、内存对象）；
 *   · 本文件断言的是**用户可见的报告文本**，且喂入路径为真实 `proofreadAccumulateHandler`
 *     （过归一化 / 去重 / 进度门禁）→ 真实 `generateProofreadReportHandler`（过完整性门禁 / 渲染）。
 *     ⇒ 「六维计数」以**报告渲染出的数字**为准，而非内部对象（形态即用户拿到的结论）。
 *
 * 自限（显式披露）：仍为**桩数据**（不触真实 WPS / 不落盘），属「治理层 + 服务端整链（桩数据）」，
 * 真实 WPS 端到端见 Issue #395 登记的条件项。
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → 按既有惯例手动 mock
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import {
  proofreadAccumulateHandler,
  generateProofreadReportHandler,
} from '../../tools/word/proofread-report';
import { sessionIssues } from '../../tools/word/proofread-session';
import { PROOFREAD_METRICS } from '../../tools/word/proofread-types';

const DOC = {
  fileName: 'c.docx',
  filePath: '/p/chain395.docx',
  totalParagraphs: 56,
  totalWords: 900,
};

/** 从报告文本解析三组数字（唯一解析点）：发现问题总数 / 六维计数合计 / 未分类数。 */
function parseReportCounts(text: string) {
  const issueMatch = text.match(/^- \*\*发现问题\*\*: (\d+) 处/m);
  if (!issueMatch) throw new Error('报告缺少「发现问题」行，无法对账');
  const issueTotal = Number(issueMatch[1]);
  // 六维计数：从**六维评分表**逐行取「维度 (key) | count」，key 由 PROOFREAD_METRICS 单源派生
  let sixDimTotal = 0;
  for (const { key } of PROOFREAD_METRICS) {
    const row = text.match(new RegExp(`^\\| [^|]+ \\(${key}\\) \\| (\\d+) \\|`, 'm'));
    if (!row) throw new Error(`六维评分表缺少维度 ${key} 行`);
    sixDimTotal += Number(row[1]);
  }
  const unknownMatch = text.match(/^- \*\*⚠️ 未分类问题\*\*: (\d+) 处/m);
  const unknownTypeCount = unknownMatch ? Number(unknownMatch[1]) : 0;
  return { issueTotal, sixDimTotal, unknownTypeCount };
}

afterEach(() => sessionIssues.clear());

describe('Issue #395 整链报告环：六维计数 + 未分类数 == 上报总数（链路级对账）', () => {
  it('parser 的维度清单来自真实 PROOFREAD_METRICS 单源（维度集漂移即报红，不手抄第二份）', () => {
    // 六维 key 集合必须与生产单源一致；若某维被删/改名而 parser 未同步，parseReportCounts 会抛错。
    expect(PROOFREAD_METRICS.length).toBe(6);
    const keys = PROOFREAD_METRICS.map(m => m.key);
    expect(new Set(keys).size).toBe(keys.length); // 无重复
    // 用一份**真实渲染**的报告文本（走 first 用例链路产出的形态）反证 parser 能逐一取到全部维度行
    const realLikeRow = keys.map(k => `| 维度 (${k}) | 1 | 4.0 | 1.2 | 8.0/10 |`).join('\n');
    const text = '- **发现问题**: 6 处\n' + realLikeRow + '\n';
    const { sixDimTotal } = parseReportCounts(text);
    expect(sixDimTotal).toBe(6); // 6 维各 1 条 == 6
  });

  it('真实 accumulate → 真实 generate：报告渲染出的三组数字自洽（防「8 处问题 / 六维全 10.0」）', async () => {
    // 上报 5 条：3 条合法 type（进六维）+ 2 条非法/缺失 type（落未分类）—— 刻意混合以触发对账口径
    const acc = await proofreadAccumulateHandler({
      doc_info: DOC,
      issues: [
        {
          offset: 0,
          length: 2,
          original: '的的',
          suggestion: '的',
          type: '重复字符',
          source: 'ai',
          fix_action: 'fix',
        },
        {
          offset: 10,
          length: 3,
          original: '杂糅a',
          suggestion: 'b',
          type: '句式杂糅',
          source: 'ai',
          fix_action: 'fix',
        },
        {
          offset: 20,
          length: 3,
          original: ' 双空格',
          suggestion: '空格',
          type: '异常空格',
          source: 'mcp',
          fix_action: 'report_only',
        },
        // 非法 type（英文，不在 TYPE_METRIC_MAP）→ 归一后落「未分类」
        {
          offset: 30,
          length: 4,
          original: 'punc',
          suggestion: 'c',
          type: 'punctuation',
          source: 'ai',
          fix_action: 'fix',
        },
        // 完全缺 type → 兜底推断；推断不出 → 「未分类」
        {
          offset: 40,
          length: 4,
          original: 'zzzz',
          suggestion: 'zzzz',
          source: 'ai',
          fix_action: 'fix',
        },
      ],
      _processed_to_paragraph: 56,
      total_revisions: 8,
    });
    expect(acc.success).toBe(true);

    const rep = await generateProofreadReportHandler({ doc_info: DOC });
    expect(rep.success).toBe(true);
    const text = rep.content[0].text!;
    const { issueTotal, sixDimTotal, unknownTypeCount } = parseReportCounts(text);

    // ── 链路级断言：六维计数合计 + 未分类数 == 上报总数 ──
    expect(sixDimTotal + unknownTypeCount).toBe(issueTotal);
    // 断言数字真值（不只看等式）：3 合法 + 2 未分类
    expect(issueTotal).toBe(5);
    expect(unknownTypeCount).toBe(2);
    expect(sixDimTotal).toBe(3);
    // 「八处问题却六维全 0」的自相矛盾形态：有问题时六维不得全为 0
    expect(sixDimTotal).toBeGreaterThan(0);
  });

  it('全部为合法 type：未分类数 == 0，六维计数合计 == 上报总数（等式右端退化仍成立）', async () => {
    await proofreadAccumulateHandler({
      doc_info: DOC,
      issues: [
        {
          offset: 0,
          length: 2,
          original: '的的',
          suggestion: '的',
          type: '重复字符',
          source: 'ai',
          fix_action: 'fix',
        },
        {
          offset: 10,
          length: 3,
          original: '杂糅a',
          suggestion: 'b',
          type: '句式杂糅',
          source: 'ai',
          fix_action: 'fix',
        },
      ],
      _processed_to_paragraph: 56,
      total_revisions: 4,
    });
    const rep = await generateProofreadReportHandler({ doc_info: DOC });
    const text = rep.content[0].text!;
    const { issueTotal, sixDimTotal, unknownTypeCount } = parseReportCounts(text);
    expect(unknownTypeCount).toBe(0);
    expect(sixDimTotal + unknownTypeCount).toBe(issueTotal);
    expect(text).not.toContain('未分类问题');
  });

  // 自限（显式披露，评审 CR1-5）：等式 `sixDimTotal + unknownTypeCount == issueTotal`
  //   在真实链路里是 `computeReportData` **按构造**保证的恒等式（未命中 type 的条目必然进 unknownTypeIssues，
  //   故正常代码路径无法打破它）。因此本用例**不声称**是「生产渲染链路的变异注入」，
  //   而是校验**断言机制本身**（parser 能识别漏计）；生产侧的六维计数来源另由
  //   「parseReportCounts 维度清单 = 真实 PROOFREAD_METRICS 单源」锁定（见本文件下一个用例）。
  it('断言机制自证：若报告文本六维漏计一条（对账破口）⇒ parser 必须识别并打红', () => {
    // 构造一份「六维漏计 1 条」的报告文本（模拟渲染回归：某维度 count 被少写 1）
    const broken =
      '- **发现问题**: 5 处（按 AI 累计 issue 条数计）\n' +
      '- **⚠️ 未分类问题**: 2 处\n' +
      '| 维度 | 问题数 | 原始分 (1-5) |\n' +
      '|---|---|---|\n' +
      '| 流畅度 (fluency) | 1 | 4.8 |\n' +
      '| 简洁度 (conciseness) | 0 | 5.0 |\n' + // ← 少 1（应 1）
      '| 准确性 (accuracy) | 0 | 5.0 |\n' +
      '| 一致性 (consistency) | 0 | 5.0 |\n' +
      '| 完整度 (completeness) | 0 | 5.0 |\n' +
      '| 格式 (format) | 1 | 4.5 |\n';
    const { issueTotal, sixDimTotal, unknownTypeCount } = parseReportCounts(broken);
    expect(sixDimTotal + unknownTypeCount).not.toBe(issueTotal); // 1+0+0+0+0+1 + 2 = 4 ≠ 5
  });
});
