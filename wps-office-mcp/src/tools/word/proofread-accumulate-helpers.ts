/** Input: proofreadAccumulate 原始参数（issues / suspected_issues / 进度 / 跳过声明）
 * Output: 校验结果 / 去重结果 / 进度门禁判定 / 批次区间与跳过归属判定
 * Pos: 校对累加侧纯函数层（不触会话存储）——「累加侧校验与归并口径」的唯一定义者。 */

import { ProofreadIssueEntry } from './proofread-types';
import {
  dedupKey,
  normalizeIssueType,
  normalizeIssueSource,
  normalizeIssueFixAction,
  normalizeIssueLocation,
  normalizeSkippedSegmentsDetailed,
} from './proofread-normalize';

/** 必填字段：只拒「不存在/非字符串/空串」——空白字符是合法校对发现（异常空格），不 trim */
const missingFields = (i: ProofreadIssueEntry): string[] => {
  const blank = (v: unknown) => typeof v !== 'string' || v === '';
  return [...(blank(i.original) ? ['original'] : []), ...(blank(i.suggestion) ? ['suggestion'] : [])];
};

export interface EntryValidation {
  valid: ProofreadIssueEntry[];
  invalid: Array<{ i: ProofreadIssueEntry; reason: string }>;
}

/** 必填字段校验（部分成功语义）：只累加有效条目，避免一条坏数据丢整批结果 */
export function validateEntries(entries: ProofreadIssueEntry[]): EntryValidation {
  const valid: ProofreadIssueEntry[] = [];
  const invalid: EntryValidation['invalid'] = [];
  for (const i of entries) {
    const missing = missingFields(i);
    if (missing.length > 0) invalid.push({ i, reason: `缺 ${missing.join('/')}` });
    else valid.push(i);
  }
  return { valid, invalid };
}

/** 疑似问题过滤计数（部分成功语义，与正式 issues 对称） */
export const filterSuspected = (entries: ProofreadIssueEntry[]): { valid: ProofreadIssueEntry[]; skippedCount: number } => {
  const { valid, invalid } = validateEntries(entries);
  return { valid, skippedCount: invalid.length };
};

/** 归一化链（type / source / location / fix_action）：累加侧唯一入口 */
export const normalizeEntries = (entries: ProofreadIssueEntry[]): ProofreadIssueEntry[] =>
  entries.map(i => normalizeIssueFixAction(normalizeIssueLocation(normalizeIssueSource(normalizeIssueType(i)))));

export interface DedupResult {
  deduped: ProofreadIssueEntry[];
  /** 本批内部重复被去重的条数（不含与历史重复的部分） */
  batchDedupedCount: number;
}

/** 全量去重：仅对带绝对 offset 的条目按 dedupKey 去重（同键 ai 覆盖 mcp）；缺失 offset 保守不去重 */
export function dedupAll(
  existing: ProofreadIssueEntry[],
  batch: ProofreadIssueEntry[]
): DedupResult {
  const seen = new Map<string, number>();
  const deduped: ProofreadIssueEntry[] = [];
  for (const entry of existing) {
    if (entry.offset === undefined) {
      deduped.push(entry);
      continue;
    }
    const key = dedupKey(entry.offset, entry.original);
    const existingIdx = seen.get(key);
    if (existingIdx === undefined) {
      seen.set(key, deduped.length);
      deduped.push(entry);
    } else if (entry.source === 'ai' && deduped[existingIdx].source !== 'ai') {
      const prev = deduped[existingIdx];
      // AI 条目 type 兜底为「未分类」时保留 MCP 的具体 type（否则报告漏计该问题）
      const merged =
        entry.type === '未分类' && prev.type && prev.type !== '未分类'
          ? { ...entry, type: prev.type }
          : entry;
      deduped[existingIdx] = merged;
    } else if (
      entry.source === 'mcp' &&
      deduped[existingIdx].source === 'ai' &&
      deduped[existingIdx].type === '未分类' &&
      entry.type &&
      entry.type !== '未分类'
    ) {
      // 跨批边缘：保留 AI 条目主体，但用 MCP 的具体 type 提升其「未分类」
      deduped[existingIdx] = { ...deduped[existingIdx], type: entry.type };
    }
  }

  // 只统计本批新增导致的去重，避免把跨批重复计为去重
  const batchSeen = new Set<string>();
  let batchDedupedCount = 0;
  for (const entry of batch) {
    if (entry.offset === undefined) continue;
    const key = dedupKey(entry.offset, entry.original);
    if (batchSeen.has(key)) batchDedupedCount++;
    else batchSeen.add(key);
  }
  return { deduped, batchDedupedCount };
}

/** 疑似问题去重累加（与正式 issues 同口径：仅对带 offset 的条目去重） */
export function dedupSuspected(
  existing: ProofreadIssueEntry[] | undefined,
  batch: ProofreadIssueEntry[]
): ProofreadIssueEntry[] {
  const base = existing ? [...existing] : [];
  const existingKeys = new Set(
    base.filter(i => i.offset !== undefined).map(i => dedupKey(i.offset!, i.original))
  );
  for (const entry of batch) {
    if (entry.offset === undefined) {
      base.push(entry);
      continue;
    }
    const key = dedupKey(entry.offset, entry.original);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    base.push(entry);
  }
  return base;
}

export type ProgressGateResult = { ok: true } | { ok: false; error: string; text: string };

/** 门禁拒绝结果的唯一构造（形状 + 文案口径单一来源） */
function gateFail(error: string, text: string): ProgressGateResult {
  return { ok: false, error, text };
}

/** 进度门禁（超界 / 回退重复 / 单批增量超限）；前置到会话变更之前，被拒调用无副作用 */
export function checkProgressGate(input: {
  processedTo: number;
  prevProgress: number;
  totalParagraphs: number;
  batchMax: number;
}): ProgressGateResult {
  const { processedTo, prevProgress, totalParagraphs, batchMax } = input;
  if (processedTo > totalParagraphs)
    return gateFail(
      `进度超界: 新进度 ${processedTo} > 总段数 ${totalParagraphs}`,
      `【进度校验】_processed_to_paragraph（${processedTo}）超出文档总段数 ${totalParagraphs}。\n` +
        `请上报真实已校对到的最末段落索引（≤ ${totalParagraphs}）。`
    );
  if (processedTo <= prevProgress)
    return gateFail(
      `进度回退/重复: 新进度 ${processedTo} ≤ 已上报 ${prevProgress}`,
      `【进度校验】_processed_to_paragraph 必须严格递增（本批新值 ${processedTo} ≤ 已上报进度 ${prevProgress}）。\n` +
        `可能原因：重复上报同一批次，或进度回退。请每批校对完成后上报其真实最末段落索引（> 上一批 ${prevProgress}）。`
    );
  const increment = processedTo - prevProgress;
  if (increment > batchMax)
    return gateFail(
      `进度增量超限: ${increment} > ${batchMax}（疑似跳号）`,
      `【进度校验】单批进度增量（${increment} 段）超过单批上限 ${batchMax} 段，疑似跳号假进度。\n` +
        `每批 getDocumentParagraphs 最多取 ${batchMax} 段，单批校对进度不应超过 ${batchMax} 段。\n` +
        `请按批次逐批上报真实进度（上一批 ${prevProgress} → 本批 ≤ ${prevProgress + batchMax}）。`
    );
  return { ok: true };
}

export type BatchRange = [number, number] | undefined;

/** 本批区间：未推进进度时以「已覆盖上界」为归属上界（不推断起点），仍拒绝越界区间 */
export function resolveBatchRange(processedTo: number | undefined, prevCovered: number): BatchRange {
  if (typeof processedTo !== 'number' || !Number.isFinite(processedTo) || processedTo < 1) return undefined;
  const coveredUpper = Math.max(prevCovered, processedTo);
  if (coveredUpper < 1) return undefined;
  return processedTo > prevCovered ? [prevCovered + 1, processedTo] : [1, coveredUpper];
}

export interface SkipAccumulation {
  /** 跳过声明归一化结果（越界/不完整批次的丢弃计数由 normalization 自带） */
  normalization: ReturnType<typeof normalizeSkippedSegmentsDetailed>;
  /** 本批区间（用于披露文案） */
  batchRange: BatchRange;
  /** 是否为「合法整块跳过」（区间并集无缺口覆盖本批且 count 等于本批段数） */
  isLegitWholeBatchSkip: boolean;
  /** 是否接受本次跳过披露累加（合法整块跳过，或本批区间不可得时退化为仅格式校验） */
  acceptDisclosure: boolean;
}

/** 跳过声明归属判定：只做几何一致性校验，不解析段落内容（服务端零推断） */
export function evaluateSkipDeclaration(
  skippedSegments: unknown,
  batchRange: BatchRange,
  unionCovers: (ranges: Array<[number, number]>, target: [number, number]) => boolean
): SkipAccumulation {
  const normalization = normalizeSkippedSegmentsDetailed(skippedSegments, batchRange);
  const normalized = normalization.entries;
  const flatRanges = normalized.flatMap(e => e.ranges);
  const coversWholeBatch = !!batchRange && unionCovers(flatRanges, batchRange);
  const batchParaCount = batchRange ? batchRange[1] - batchRange[0] + 1 : 0;
  const declaredCount = normalized.reduce((sum, e) => sum + e.count, 0);
  const isLegitWholeBatchSkip = coversWholeBatch && declaredCount === batchParaCount;
  return {
    normalization,
    batchRange,
    isLegitWholeBatchSkip,
    acceptDisclosure: isLegitWholeBatchSkip || batchRange === undefined,
  };
}

/** 进度追踪更新（单调递增：取历史最大值，天然幂等） */
export function nextProgress(input: { prev: number; processedTo: number; totalPara: number }): {
  processedToParagraph: number; totalParagraphs: number; allBatchesComplete?: boolean; history: number[];
} {
  const { prev, processedTo, totalPara } = input, max = Math.max(prev, processedTo);
  return {
    processedToParagraph: max,
    totalParagraphs: totalPara,
    allBatchesComplete: totalPara > 0 ? max >= totalPara : undefined,
    history: [max],
  };
}

export interface AccumulateSummaryInput {
  batchIssueCount: number;
  sessionIssueCount: number;
  progress?: {
    processedToParagraph: number;
    totalParagraphs: number;
    allBatchesComplete?: boolean;
  };
  skippedInvalidCount: number;
  skippedSuspectedCount: number;
  dedupedCount: number;
  missingOffsetCount: number;
  suspectedTotal: number;
  skippedSegments?: { totalCount: number; ranges: Array<[number, number]> };
  droppedOutOfBoundCount: number;
  droppedIncompleteBatchCount: number;
  batchRange?: [number, number];
}

/** 累加结果可读摘要（纯函数：输入全为已算好的值，便于单测文案口径） */
export function renderAccumulateSummary(i: AccumulateSummaryInput): string {
  const parts: string[] = [
    `已累加 ${i.batchIssueCount} 条问题到本会话（文档派生 key）。\n当前会话累计: ${i.sessionIssueCount} 条问题`,
  ];
  const p = i.progress, range = i.batchRange ? ` [${i.batchRange[0]},${i.batchRange[1]}]` : '';
  if (p && typeof p.processedToParagraph === 'number')
    parts.push(`\n已校对进度: ${p.processedToParagraph} / ${p.totalParagraphs} 段` +
      (p.allBatchesComplete ? '（已覆盖全文 ✅，可生成报告）' : '（未覆盖全文，生成报告会被完整性门禁拒绝）'));
  else if (i.sessionIssueCount > 0)
    parts.push(`\n⚠️ 已累加问题但尚未上报校对进度（_processed_to_paragraph），报告将显示「覆盖状态未确认完整」；请后续批次携带真实进度`);
  if (i.skippedInvalidCount > 0)
    parts.push(`\n⚠️ 本批 ${i.skippedInvalidCount} 条因缺 original/suggestion 被跳过（有效条目已累加）；请 AI 补充缺失字段后重新累加这些被跳过的问题`);
  if (i.skippedSuspectedCount > 0)
    parts.push(`\n⚠️ 疑似问题 ${i.skippedSuspectedCount} 条因缺 original/suggestion 被跳过`);
  if (i.dedupedCount > 0) parts.push(`（本批去重 ${i.dedupedCount} 条）`);
  const sk = i.skippedSegments;
  if (sk && sk.totalCount > 0)
    parts.push(`\n本批跳过披露: 累计跳过 ${sk.totalCount} 段（表格密集非正文区），范围 ${sk.ranges.map(([a, b]) => `[${a},${b}]`).join(' ')}（已计入覆盖进度，报告将如实披露）`);
  if (i.droppedOutOfBoundCount > 0)
    parts.push(`\n⚠️ ${i.droppedOutOfBoundCount} 条跳过区间越出本批上报区间${range}已丢弃：跳过区间必须完全落在本批区间内（跳过段须同时计入 _processed_to_paragraph），请核对后重报`);
  if (i.droppedIncompleteBatchCount > 0)
    parts.push(`\n⚠️ ${i.droppedIncompleteBatchCount} 条跳过声明因**未完整覆盖本批区间**${range}已丢弃（不计入披露）：只承认「整批跳过」（100% 完整覆盖），「批内跳一半留一半」属反面清单。请改为：要么区间完整覆盖本批且 count 等于本批段数，要么本批逐段照常校对（不传 skipped_segments）。`);
  if (i.suspectedTotal > 0) parts.push(`；疑似问题 ${i.suspectedTotal} 条（待确认）`);
  if (i.missingOffsetCount > 0)
    parts.push(`；其中 ${i.missingOffsetCount} 条未携带绝对 offset，未参与去重（报告位置列显示「位置未知」）`);
  return parts.join('') + '。';
}
