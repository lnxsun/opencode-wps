/**
 * proofread-normalize.ts 契约回归（唯一执行者）
 *
 * 背景：本模块是「AI 输出 → 下游可计算形态」的规范层，`report__only` 变体族漏判会
 * 让 P1-1 门禁（「仅报告未修」）与 `fix_action_inferred` 披露口径**静默失效**（历史 R1-4 / R9-1）。
 * 旧单测随 d2114ea 整体删除后本文件曾长期零覆盖（改动无人拦），本测试即为此补的最小回归网。
 *
 * 覆盖范围（与 docs/FEATURES.md 整改表条目一一对应）：
 *   ① fix_action 变体族（含 R9-1 多下划线/混合分隔符）与推断归因（R9-2）
 *   ② skipped_segments 半跳丢弃 + 越界丢弃 + 并集覆盖（R11-1 / #294）
 *   ③ type/source 兜底（未分类 / TC-13）
 *   ④ 用户可读裁决（resolveFixAction 的 kind/inferred 与内部态 {fix_action, fix_action_inferred} 的一致性）
 *      —— Issue #352 压缩方案 B：原 describeFixAction / isFixActionInferred 投影已合并，测试改锚 resolveFixAction。
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → 按既有惯例手动 mock（proofread-report.ts 依赖它）
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { computeReportData } from '../../tools/word/proofread-report';
import {
  normalizeIssueFixAction,
  resolveFixAction,
  isReportOnly,
  classifyFixActionInference,
  normalizeSkippedSegmentsDetailed,
  normalizeToTwoPointScale,
  normalizeIssueType,
  normalizeIssueSource,
} from '../../tools/word/proofread-normalize';
import { ProofreadIssueEntry } from '../../tools/word/proofread-types';

/** 构造一条最小 issue（只许 overrides 覆盖，避免与生产类型漂移） */
function issue(over: Partial<ProofreadIssueEntry> & Record<string, unknown> = {}) {
  const base = {
    offset: 0,
    length: 2,
    original: '的的',
    suggestion: '的',
    type: '重复字符',
    context: '...',
    source: 'ai' as const,
  };
  return { ...base, ...over } as ProofreadIssueEntry;
}

describe('① fix_action 归一化变体族（P1-1 门禁唯一来源）', () => {
  // R9-1：分隔符收敛不完整会让门禁静默失效（report__only 被判成已修、少计 1 处）
  const reportOnlyVariants = [
    'report_only',
    'report-only',
    'report only',
    'REPORT_ONLY',
    'reportOnly', // 驼峰（R1-4 同源缺陷）
    'report__only', // R9-1 主案例
    'report  _  only',
    'report_-_only',
    '  report_only  ',
    'report _ only',
  ];

  it.each(reportOnlyVariants)('变体 %s → report_only（不得兜底成已修）', variant => {
    const out = normalizeIssueFixAction(issue({ fix_action: variant as never }));
    expect(out.fix_action).toBe('report_only');
    expect(out.fix_action_inferred).toBeUndefined();
    expect(isReportOnly(out)).toBe(true);
  });

  it('显式 fix / 驼峰 fixAction → fix，且不置推断标记', () => {
    for (const value of ['fix', 'FIX', ' fix ', undefined] as Array<string | undefined>) {
      const out = normalizeIssueFixAction(issue({ fix_action: value as never }));
      expect(out.fix_action).toBe('fix');
      if (value === undefined) {
        // 漏传 → 保守兜底为已修，但**必须**留痕「这是推断」
        expect(out.fix_action_inferred).toBe(true);
      } else {
        expect(out.fix_action_inferred).toBeUndefined();
      }
    }
    expect(normalizeIssueFixAction(issue({ fixAction: 'report_only' })).fix_action).toBe(
      'report_only'
    );
  });

  it('两字段同时存在时以 fix_action 为准（R7-4 优先级契约唯一确定）', () => {
    const out = normalizeIssueFixAction(issue({ fix_action: 'report_only', fixAction: 'fix' }));
    expect(out.fix_action).toBe('report_only');
  });

  it('注意：显式 fix 归一化会剥离 fix_action_inferred（防「已核实」被旧标记污染）', () => {
    const out = normalizeIssueFixAction(
      issue({ fix_action: 'fix', fix_action_inferred: true } as never)
    );
    expect(out.fix_action_inferred).toBeUndefined();
  });
});

describe('① 推断归因分类（R9-2：不得把「取值未识别」误述为「未标注」）', () => {
  it('missing / unknown / null 三态判定', () => {
    expect(classifyFixActionInference(issue({ fix_action: 'pending' as never }))).toBe('unknown');
    expect(classifyFixActionInference(issue({ fix_action: 'fixed' as never }))).toBe('unknown');
    expect(classifyFixActionInference(issue())).toBe('missing');
    expect(classifyFixActionInference(issue({ fix_action: null } as never))).toBe('missing');
    expect(classifyFixActionInference(issue({ fix_action: 'report_only' }))).toBeNull();
    expect(classifyFixActionInference(issue({ fix_action: 'fix' }))).toBeNull();
  });

  it('classify 是「是否推断 / 为何推断」的唯一投影（Issue #352 压缩方案 B：原 isFixActionInferred 已合并）', () => {
    for (const i of [
      issue({ fix_action: 'pending' as never }),
      issue(),
      issue({ fix_action: 'fix' }),
      issue({ fix_action: 'report_only' }),
    ]) {
      // 「是否为推断」= classify ≠ null；「为何推断」= classify 的值 —— 同一函数两个视角，不得两套口径
      const inferredByKind = resolveFixAction(i).inferred !== undefined;
      expect(inferredByKind).toBe(classifyFixActionInference(i) !== null);
    }
  });

  it('空值/非对象输入不抛异常（读取侧防御）', () => {
    for (const bad of [null, undefined, 0, 'x'] as unknown as ProofreadIssueEntry[]) {
      expect(isReportOnly(bad)).toBe(false);
      expect(classifyFixActionInference(bad)).toBeNull();
    }
  });
});

describe('① 用户可读裁决（resolveFixAction 的 fixAction/inferred）', () => {
  it('显式 fix / report_only 直接映射，不另写第二套识别规则', () => {
    expect(resolveFixAction(issue({ fix_action: 'fix' }))).toEqual({ fixAction: 'fix' });
    expect(resolveFixAction(issue({ fix_action: 'report__only' as never }))).toEqual({
      fixAction: 'report_only',
    });
  });

  it('推断态区分 missing / unknown，且与内部字段不矛盾', () => {
    expect(resolveFixAction(issue())).toEqual({ fixAction: 'fix', inferred: 'missing' });
    expect(resolveFixAction(issue({ fix_action: 'pending' as never }))).toEqual({
      fixAction: 'fix',
      inferred: 'unknown',
    });
  });

  it('契约：kind / inferred 必须与 {fix_action, fix_action_inferred} 一致（防两套口径分叉）', () => {
    for (const i of [
      issue({ fix_action: 'fix' }),
      issue({ fix_action: 'report_only' }),
      issue({ fix_action: 'report__only' as never }),
      issue({ fix_action: 'pending' as never }),
      issue(),
    ]) {
      const out = normalizeIssueFixAction(i);
      const verdict = resolveFixAction(i);
      expect(verdict.fixAction).toBe(out.fix_action);
      if (out.fix_action_inferred === true) {
        expect(verdict.inferred).toBe(classifyFixActionInference(i));
      } else {
        expect(verdict.inferred).toBeUndefined();
      }
    }
  });
});

describe('② skipped_segments 归属归一化（#294 / R11-1 半跳丢弃）', () => {
  it('本批内但未铺满本批（半跳）→ 整条丢弃并计数（不得假披露为整批跳过）', () => {
    const r = normalizeSkippedSegmentsDetailed({ count: 100, ranges: [[201, 300]] }, [201, 400]);
    expect(r.entries).toHaveLength(0);
    expect(r.droppedIncompleteBatchCount).toBe(1);
    expect(r.droppedOutOfBoundCount).toBe(0);
  });

  it('越界区间（上界超出）→ 丢弃并计数（不留「有段数无区间」的半真披露）', () => {
    const r = normalizeSkippedSegmentsDetailed({ count: 100, ranges: [[9999, 9999]] }, [1, 200]);
    expect(r.entries).toEqual([]);
    expect(r.droppedOutOfBoundCount).toBe(1);
  });

  it('多条目合计覆盖本批 → 保留（不误伤正解）', () => {
    const r = normalizeSkippedSegmentsDetailed(
      [
        { count: 100, ranges: [[201, 300]] },
        { count: 100, ranges: [[301, 400]] },
      ],
      [201, 400]
    );
    expect(r.entries).toHaveLength(2);
    expect(r.droppedIncompleteBatchCount).toBe(0);
  });

  it('单条完整覆盖本批 → 保留', () => {
    const r = normalizeSkippedSegmentsDetailed({ count: 200, ranges: [[201, 400]] }, [201, 400]);
    expect(r.entries[0].ranges).toEqual([[201, 400]]);
    expect(r.droppedIncompleteBatchCount).toBe(0);
  });

  it('未上报本批区间 → 退化为仅格式校验（不误杀合法区间）', () => {
    const r = normalizeSkippedSegmentsDetailed({ count: 200, ranges: [[1, 200]] }, undefined);
    expect(r.entries).toHaveLength(1);
    expect(r.droppedOutOfBoundCount).toBe(0);
  });

  it('裸区间数组属非法形态 → 丢弃', () => {
    expect(normalizeSkippedSegmentsDetailed([[1, 200]] as never)).toEqual({
      entries: [],
      droppedOutOfBoundCount: 0,
      droppedIncompleteBatchCount: 0,
    });
    expect(normalizeSkippedSegmentsDetailed([1, 200] as never).entries).toEqual([]);
  });

  it('缺 count 时由 ranges 求和推算；count 非法且无法推算 → 整条作废', () => {
    const inferred = normalizeSkippedSegmentsDetailed({ ranges: [[1, 3]] }, [1, 3]);
    expect(inferred.entries[0].count).toBe(3);
    expect(
      normalizeSkippedSegmentsDetailed({ count: 0, ranges: [[5, 10]] }, [5, 10]).entries[0].count
    ).toBe(6);
    expect(normalizeSkippedSegmentsDetailed({ count: 'x' } as never, [1, 10]).entries).toEqual([]);
  });

  it('null 入参 → 空结果（不猜测、不补数）', () => {
    expect(normalizeSkippedSegmentsDetailed(null)).toEqual({
      entries: [],
      droppedOutOfBoundCount: 0,
      droppedIncompleteBatchCount: 0,
    });
  });
});

describe('③ type / source 兜底（六维评分与来源统计不落空）', () => {
  it('带前后空格的 type 被 trim（否则 === 查表落「未分类」）', () => {
    expect(normalizeIssueType(issue({ type: '  的得混淆  ' })).type).toBe('的得混淆');
  });

  it('type 缺失 / 为 ai 占位 → 由文本推断；仍不能推断 → 未分类', () => {
    expect(
      normalizeIssueType(issue({ type: '', original: '存在着问题', suggestion: 'x' })).type
    ).toBe('搭配冗余');
    expect(normalizeIssueType(issue({ type: 'ai', original: 'abc', suggestion: 'def' })).type).toBe(
      '未分类'
    );
  });

  it('Issue #395 CR1-2：给了 type 但不在词表内（如英文）→ 不被静默改判到合法维度，落「未分类」', () => {
    // 反例：'numbering' 的 original 命中兜底规则（句式杂糅）—— 旧实现会静默改判到「通顺」维，
    // 污染六维评分且不可辨识。现须落「未分类」（报告单列 + 告警），使非法 type 可见。
    const r = normalizeIssueType(
      issue({ type: 'numbering', original: '通过该方案使效率提升', suggestion: '改' })
    );
    expect(r.type).toBe('未分类');
    // 对照：type 缺失时**仍**走兜底推断（不被本次改动误伤）
    const r2 = normalizeIssueType(
      issue({ type: '', original: '通过该方案使效率提升', suggestion: '改' })
    );
    expect(r2.type).toBe('句式杂糅');
  });

  it('Issue #395 CR1-3：normalizeIssueType 幂等（连续归一结果稳定）', () => {
    for (const t of ['重复字符', '未分类', 'punctuation', 'ai', '']) {
      const once = normalizeIssueType(issue({ type: t, original: 'abc', suggestion: 'def' }));
      const twice = normalizeIssueType(once);
      expect(twice.type).toBe(once.type);
    }
  });

  it('AC5.3（评审 CR5-2）：六维计数 + 未分类数 == 上报问题总数（对账自洽，防「8 处问题 / 六维全 0」）', () => {
    // 混合合法/非法 type：合法进六维、非法进 unknownTypeIssues；两者之和必须等于条目总数。
    const items = [
      normalizeIssueType(issue({ type: '重复字符' })),
      normalizeIssueType(issue({ type: '句式杂糅' })),
      normalizeIssueType(issue({ type: 'punctuation', original: '通过x使y', suggestion: '改' })),
      normalizeIssueType(issue({ type: '未分类', original: 'zzz', suggestion: 'zzz' })),
    ];
    const data = computeReportData(items);
    const sixDim = Object.values(data.metricIssues).reduce((n, l) => n + l.length, 0);
    expect(sixDim + data.unknownTypeIssues.length).toBe(items.length);
  });

  it('Issue #395 CR2-2：非法 type 经归一 → 落 unknownTypeIssues，六维计数不被它污染（端到端对账）', () => {
    // 走真实链路：normalizeIssueType → computeReportData，确认「发现问题 N 处」与「六维计数」自洽：
    // 非法 type 条目单列 unknownTypeIssues（报告单列 + 告警），六维 count 不含它。
    const illegal = normalizeIssueType(
      issue({ type: 'punctuation', original: '通过该方案使效率提升', suggestion: '改' })
    );
    const legal = normalizeIssueType(issue({ type: '重复字符' }));
    const data = computeReportData([illegal, legal]);
    expect(data.unknownTypeIssues.length).toBe(1);
    expect(data.unknownTypeIssues[0].type).toBe('未分类');
    // 六维计数合计只含合法条目（= 1），不含未分类
    const sixDimTotal = Object.values(data.metricIssues).reduce((n, l) => n + l.length, 0);
    expect(sixDimTotal).toBe(1);
  });

  it('Issue #395 CR2-1：source 未识别值 → 保守落 mcp（二值枚举的保守缺省，非「静默改判到错误维度」）', () => {
    // 与 type 不同：source 只有 mcp/ai 两值且无「类型维度」语义，未识别值落保守 mcp **不污染任何评分**
    // （报告里表现为「正则基础校对」，且 AI_ONLY_PATTERN 命中时仍归 ai）。此为设计缺省，故锁其稳定性。
    expect(normalizeIssueSource(issue({ source: 'manual' as never })).source).toBe('mcp');
    // 但 AI 专属模式仍须优先归 ai（不得被保守缺省覆盖）
    expect(
      normalizeIssueSource(issue({ source: 'manual' as never, original: '存在着问题' })).source
    ).toBe('ai');
  });

  it('source 大小写归一化 + 缺省兜底（TC-13 来源统计不落「未标注」）', () => {
    expect(normalizeIssueSource(issue({ source: 'MCP' as never })).source).toBe('mcp');
    expect(normalizeIssueSource(issue({ source: 'AI' as never })).source).toBe('ai');
    // F11–F15 属 AI 专属模式（Layer 1 不检出）→ 兜底 ai
    expect(
      normalizeIssueSource(issue({ source: '' as never, original: '存在着问题' })).source
    ).toBe('ai');
    // Layer 1 规则可命中 → 兜底 mcp
    expect(
      normalizeIssueSource(issue({ source: '' as never, original: '通过研究使效果提升' })).source
    ).toBe('mcp');
  });

  it('normalizeToTwoPointScale：1-5 原始分 → [0,2] 且钳位', () => {
    expect(normalizeToTwoPointScale(5)).toBe(2);
    expect(normalizeToTwoPointScale(3)).toBe(1);
    expect(normalizeToTwoPointScale(1)).toBe(0);
    expect(normalizeToTwoPointScale(0)).toBe(0);
    expect(normalizeToTwoPointScale(99)).toBe(2);
  });
});
