/* Input: 校对会话数据（sessionIssues + docInfo）/ 工具参数 Output: 会话累加回执 + 六维校对报告（落盘）
   Pos: 校对报告**全部生成逻辑的唯一文件**（编排 + 统计 + 渲染 + 文案）。体量由
   scripts/validate-proofread-report-size.js 以「只降不升」棘轮硬约束（校对线全层合计）。
   ⚠️ Issue #382 DECISION-1：本文件的 2 个工具**直连注册**（不再 GATEWAY_ONLY）——定义与 handler
   同居于此（唯一来源），不再由 `gateway/com-actions.ts` 提供第二份。 */
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ToolHandler, ToolCallResult, RegisteredTool, ToolCategory, ToolDefinition } from '../../types/tools';
import { validateFilePath, buildWriteRootsWithDocDir } from '../../utils/path-safety';
import { wpsClient } from '../../client/wps-client';
import { PROOFREAD_BATCH_MAX } from './proofread-types';
import { sessionIssues, releaseSession, deriveSessionKey } from './proofread-session';
import { drainLayer2Declarations } from './proofread';
import { ProofreadIssueEntry, DocInfo, ProofreadMetric, SessionData, PROOFREAD_METRICS, SkippedSegmentEntry, SkippedSegmentsSummary, Layer2BatchDeclaration } from './proofread-types';
import { RawSkippedSegmentInput, unionCoversRange, TYPE_METRIC_MAP, METRIC_WEIGHT_FORMULA, normalizeToTwoPointScale, isReportOnly, classifyFixActionInference } from './proofread-normalize';
import { checkProgressGate, validateEntries, filterSuspected, normalizeEntries, dedupAll, dedupSuspected, nextProgress, resolveBatchRange, evaluateSkipDeclaration, renderAccumulateSummary } from './proofread-accumulate-helpers';
import { GATE_PARTIAL, GATE_NO_TRACE, CROSS_MISSING, CROSS_EXTRA, SKIP_TITLE, SKIP_NOTE, SKIP_TAIL, EMPTY_SUSPECTED, EMPTY_WITH_REVS, ALL_FIXED_REVS, EMPTY_CLEAN, EMPTY_BASELINE_ZERO, SUSPECT_NOTE, UNKNOWN_NOTE, ALL_FIXED, INFERRED, NO_EVIDENCE, NOT_ALL_FIXED, COVERAGE_UNKNOWN, DATA_MISSING, TC12_HEAD, TC12_REVS, TC12_ODD, TC12_MATCH, TC12_NONE, TC12_MISMATCH, suspectedHeading, unknownHeading } from './proofread-report-copy';
export const PROOFREAD_ACCUMULATE = 'wps_word_proofread_accumulate';
export const GENERATE_PROOFREAD_REPORT = 'wps_word_generate_proofread_report';
/* 纯 TS 逻辑工具（PS1 无同名分支）⇒ 按 DECISION-1 直连注册：此处是它们 schema 的**唯一来源**
   （曾由 `gateway/com-actions.ts` 定义，已整体迁出，不留第二份）。`S` 仅为压缩物理行数的本地简写。 */
const S = (type: 'string' | 'number' | 'boolean' | 'object' | 'array', description: string) => ({ type, description });
/** 剔除值为 undefined 的键（供 doc_info 合并式更新：只覆盖显式提供的字段）。 */
const pruneUndefined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
export const proofreadAccumulateDefinition: ToolDefinition = {
  name: PROOFREAD_ACCUMULATE,
  description: '累加本批校对问题到会话（六维评分报告用）。会话身份由 doc_info.filePath 派生，无需 session_id（Issue #382）。',
  category: ToolCategory.DOCUMENT,
  inputSchema: { type: 'object', required: ['issues', 'doc_info', '_processed_to_paragraph'], properties: {
    issues: S('array', '本批问题列表。每条至少含 original/suggestion；另可带 paragraphIndex/offset/length（文档绝对偏移）、type（禁写 "ai"）、metric、fix_action。自洽：original === slice(offset, offset+length)，UTF-16 计。'),
    doc_info: { type: 'object', description: '**会话身份来源**（必传；filePath 为派生 key）。4 子字段**全部必填**，schema 说真话（Issue #382）', required: ['fileName', 'filePath', 'totalParagraphs', 'totalWords'], properties: {
      fileName: S('string', '文档名（wps_get_active_document.name）'),
      filePath: S('string', '文档绝对路径（wps_get_active_document.path）——**会话派生 key**，缺失即拒绝'),
      totalParagraphs: S('number', '文档总段数（报告覆盖门禁用）'),
      totalWords: S('number', '文档总字数（wps_get_active_document.wordCount）——不传报告显示「未提供」') } },
    _processed_to_paragraph: S('number', '本批校对到的末段。**必传**：服务端据此派生下一批起点 + 严格递增校验（回退/重复/增量超限即拒），报告覆盖门禁亦据此判定。'),
    total_revisions: S('number', '本次**新增**修订数差值（扣开工基线；每次替换 = 2 条修订）。'),
    skipped_segments: S('object', '整块跳过声明 { count, ranges, reason }。仅当区间完整覆盖本批且 count = 本批段数时被承认；否则丢弃并如实披露。'),
    suspected_issues: S('array', '待确认的疑似问题列表（与 issues 分开披露，字段同源）。') } },
};
export const generateProofreadReportDefinition: ToolDefinition = {
  name: GENERATE_PROOFREAD_REPORT,
  description: '生成六维评分校对报告（会话身份由文档路径派生，无需 session_id，Issue #382）。',
  category: ToolCategory.DOCUMENT,
  inputSchema: { type: 'object', required: [], properties: {
    output_file: S('string', '报告输出路径（可选；不传则只返回内容，须由 AI 用 writeFile 落盘）') } },
};
const result = (text: string, error?: string): ToolCallResult => error ? { id: uuidv4(), success: false, content: [{ type: 'text', text }], error } : { id: uuidv4(), success: true, content: [{ type: 'text', text }] };
const fail = (text: string, error: string) => result(text, error);
const now = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

const { isInteger } = Number;
const meta = (o: { fileName?: string; filePath?: string; at: string; totalParagraphs?: number; totalWords?: number }) => `- **文档**: ${o.fileName ?? '未知'}\n- **路径**: \`${o.filePath ?? '未知'}\`\n- **校对时间**: ${o.at}\n- **总段数**: ${typeof o.totalParagraphs === 'number' ? o.totalParagraphs : '未提供'}\n- **总字数**: ${typeof o.totalWords === 'number' ? o.totalWords : '未提供'}\n`;
const revisions = (n: number) => `- **修订总数**: ${n}（修订模式实际记录数；每次替换 = 删除 + 插入 2 条修订，仅当全部为替换类修复时 修订数 ÷ 2 ≈ 问题数` + (isInteger(n / 2) ? `）\n` : `；⚠️ 修订数为奇数（删除类修复只产生 1 条修订），修订数 ÷ 2 不整除，请人工核对）\n`);

export interface MetricScore { count: number; rawScore: number; normalizedScore: number; displayScore: string; }
export interface ReportData { metricIssues: Record<ProofreadMetric, ProofreadIssueEntry[]>; unknownTypeIssues: ProofreadIssueEntry[]; scores: Record<ProofreadMetric, MetricScore>; }
export function computeReportData(issues: ProofreadIssueEntry[]): ReportData { // 按维度分组 + 评分（维度清单由 PROOFREAD_METRICS 单源派生）
  const metricIssues = {} as ReportData['metricIssues'], counts = {} as Record<ProofreadMetric, number>, unknownTypeIssues: ProofreadIssueEntry[] = [];
  for (const { key } of PROOFREAD_METRICS) { metricIssues[key] = []; counts[key] = 0; }
  for (const issue of issues) { const metric = TYPE_METRIC_MAP[issue.type]; if (metric) { metricIssues[metric].push(issue); counts[metric]++; } else unknownTypeIssues.push(issue); }
  // completeness 有 blocker（占位符类问题）时直接 0 分；其余维度按权重公式 → [0,2] 归一化
  const hasPlaceholder = counts.completeness > 0, scores = {} as ReportData['scores'];
  for (const { key } of PROOFREAD_METRICS) {
    const count = counts[key], rawScore = key === 'completeness' ? METRIC_WEIGHT_FORMULA[key](count, hasPlaceholder) : METRIC_WEIGHT_FORMULA[key](count);
    const normalized = key === 'completeness' && rawScore === 0 ? 0 : normalizeToTwoPointScale(rawScore);
    scores[key] = { count, rawScore, normalizedScore: Math.round(normalized * 100) / 100, displayScore: (normalized * 5).toFixed(1) };
  }
  return { metricIssues, unknownTypeIssues, scores };
}
export interface CoverageAnalysis { coverageGaps: Array<{ start: number; end: number }>; hasCoverageGap: boolean; }
export function analyzeBatches(input: { totalParagraphs: number; processedTo: number | undefined }): CoverageAnalysis {
  const gaps: CoverageAnalysis['coverageGaps'] = input.totalParagraphs > 0 && typeof input.processedTo === 'number' && input.processedTo < input.totalParagraphs ? [{ start: input.processedTo + 1, end: input.totalParagraphs }] : [];
  return { coverageGaps: gaps, hasCoverageGap: gaps.length > 0 };
}
export interface SourceSummary { mcpCount: number; aiCount: number; unknownSourceCount: number; formatCount: number; formatAndReportOnlyCount: number; } // 来源与格式分布
// 「纯格式问题」类型集 = `TYPE_METRIC_MAP` 的 format 维度（单源；原静态字面量是第二份定义，曾与其分叉）。
const FORMAT_TYPES = Object.keys(TYPE_METRIC_MAP).filter(t => TYPE_METRIC_MAP[t] === 'format');
export function computeSourceSummary(issues: ProofreadIssueEntry[]): SourceSummary {
  const s: SourceSummary = { mcpCount: 0, aiCount: 0, unknownSourceCount: 0, formatCount: 0, formatAndReportOnlyCount: 0 };
  for (const i of issues) {
    if (i.source === 'mcp') s.mcpCount++; else if (i.source === 'ai') s.aiCount++; else s.unknownSourceCount++;
    if (FORMAT_TYPES.indexOf(i.type) !== -1) { s.formatCount++; if (isReportOnly(i)) s.formatAndReportOnlyCount++; }
  }
  return s;
}
/* 修订记录 ↔ 问题清单交叉校验：分母一律用「**声称已修**」条目数（issues − report_only，后者不产生修订） */
export interface CrossCheckResult { claimedFixCount: number; reportOnlyCount: number; warning: string | null; }
export function computeCrossCheck(issues: ProofreadIssueEntry[], totalRevisions?: number): CrossCheckResult {
  const reportOnlyCount = issues.filter(isReportOnly).length, claimedFixCount = issues.length - reportOnlyCount;
  let warning: string | null = null; // 分母 = 「声称已修」条目数（report_only 不产生修订，计入必误判）
  if (typeof totalRevisions === 'number' && totalRevisions > 0 && claimedFixCount > 0) {
    if (claimedFixCount > totalRevisions) warning = CROSS_MISSING(issues.length, totalRevisions, claimedFixCount - totalRevisions);
    else if (totalRevisions > claimedFixCount * 3) warning = CROSS_EXTRA(totalRevisions, claimedFixCount, reportOnlyCount);
  }
  return { claimedFixCount, reportOnlyCount, warning };
}
export interface FixStatus { allFixed: boolean; revisionEvidenceMissing: boolean; revisionDataMissing: boolean; inferredFixCount: number; inferredMissingCount: number; inferredUnknownCount: number; } // 修复状态（覆盖完整性 × 归因 × 修订证据 三者正交）
export function computeFixStatus(o: { issues: ProofreadIssueEntry[]; reportOnlyCount: number; claimedFixCount: number; totalRevisions?: number }): FixStatus {
  const { issues, reportOnlyCount, claimedFixCount, totalRevisions } = o, hasClaimedFix = claimedFixCount > 0;
  let inferredFixCount = 0, inferredMissingCount = 0, inferredUnknownCount = 0;
  for (const i of issues) { const why = classifyFixActionInference(i); if (why === null) continue; inferredFixCount++; if (why === 'missing') inferredMissingCount++; else inferredUnknownCount++; }
  return { allFixed: reportOnlyCount === 0 && !(totalRevisions === 0 && hasClaimedFix), revisionEvidenceMissing: totalRevisions === 0 && hasClaimedFix, revisionDataMissing: totalRevisions === undefined && hasClaimedFix, inferredFixCount, inferredMissingCount, inferredUnknownCount };
}
export function describeInferredReason(f: FixStatus): string {
  const parts: string[] = [];
  if (f.inferredMissingCount > 0) parts.push(`${f.inferredMissingCount} 处未标注 fix_action（AI 漏传）`);
  if (f.inferredUnknownCount > 0) parts.push(`${f.inferredUnknownCount} 处 fix_action 取值未被识别（非 fix/report_only）`);
  return parts.join('、');
}

/* 覆盖完整性：进度覆盖全文且无缺口（进度已由 checkProgressGate 独立强制，此处只与文档真值比较） */
export const computeCoverageComplete = (o: { totalPara: number; processedTo: number | undefined; hasCoverageGap: boolean }): boolean => o.totalPara > 0 && typeof o.processedTo === 'number' && o.processedTo >= o.totalPara && !o.hasCoverageGap;
export type IntegrityGateDecision = { kind: 'allow' } | { kind: 'reject'; error: string; text: string };
/* 硬性完整性门禁（强制、非 opt-in）：未完整覆盖全文时拒绝生成报告。两态：①有进度未覆盖全文 ②无进度依据且无痕迹 */
export function evaluateIntegrityGate(o: { totalPara: number; processedTo: number | undefined; hasRunTrace: boolean }): IntegrityGateDecision {
  const { totalPara, processedTo, hasRunTrace } = o;
  if (typeof processedTo === 'number' && totalPara > 0 && processedTo < totalPara) return { kind: 'reject', error: `校对未覆盖全文，禁止生成报告: 已到第 ${processedTo}/${totalPara} 段`, text: GATE_PARTIAL(processedTo, totalPara) };
  if (totalPara > 0 && typeof processedTo !== 'number' && !hasRunTrace) return { kind: 'reject', error: `校对无进度依据，禁止生成报告（防"从未跑"被当作"全部完成"）`, text: GATE_NO_TRACE(totalPara) };
  return { kind: 'allow' };
}
export const SKIPPED_ENTRIES_KEEP = 50, SKIPPED_RANGES_KEEP = 50; // 保留上限（隔离载荷膨胀；totalCount 仍全量）
export const mergeSkippedEntries = (prev: SkippedSegmentEntry[], next: SkippedSegmentEntry[]) => [...prev, ...next].slice(-SKIPPED_ENTRIES_KEEP);
/* 合并重叠/相邻的跳过区间并施加保留上限（只做合并 + 截断，不做归属/完整性判定） */
export function mergeSkippedRanges(ranges: Array<[number, number]>): { ranges: Array<[number, number]>; truncated: boolean } {
  const merged: Array<[number, number]> = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return merged.length > SKIPPED_RANGES_KEEP ? { ranges: merged.slice(-SKIPPED_RANGES_KEEP), truncated: true } : { ranges: merged, truncated: false };
}
const fmtRanges = (rs: Array<[number, number]>) => rs.map(([a, b]) => `[${a},${b}]`).join(' ') || '—';
/* 报告**唯一**收尾点：追加「跳过范围披露」节（所有报告路径都须经此收尾）；「覆盖 ✅」≠「逐段校对 ✅」 */
export function skipDisclosure(report: string, sk?: SkippedSegmentsSummary): string {
  if (!sk || sk.totalCount <= 0) return report;
  const truncated = sk.entries.reduce((n, e) => n + e.count, 0) < sk.totalCount;
  let out = `\n${SKIP_TITLE}\n\n${SKIP_NOTE(sk.totalCount)}\n\n| 项 | 值 |\n|------|------|\n| 累计跳过段数 | ${sk.totalCount} 段 |\n| 跳过区间 | ${fmtRanges(sk.ranges)} |\n| 跳过批次数 | ${sk.entries.length} 批${truncated ? '（明细已截断，仅保留最近批次）' : ''} |\n| 区间明细 | ${truncated ? '⚠️ 已截断（仅保留最近区间，早期跳过区间见「累计跳过段数」口径）' : '完整'} |\n`;
  if (sk.entries.length > 0)
    out += `\n<details>\n<summary>逐批跳过明细（${sk.entries.length} 批${truncated ? '，已截断' : ''}）</summary>\n\n| # | 段数 | 区间 | 判定依据 |\n|---|---|---|---|\n` + sk.entries.map((e, i) => `| ${i + 1} | ${e.count} | ${fmtRanges(e.ranges)} | ${e.reason ?? '表格密集非正文段'} |\n`).join('') + `\n</details>\n\n`;
  return report + out + SKIP_TAIL;
}
/* Layer 2（AI 语义）逐批产出披露（Issue #382 C2）：「必须调用」升级为「必须产出可核对」；
   零申报但 Layer 1 命中 >0 的批次单列（#382 症状：AI 看出的病句没变成 issue）。 */
export const layer2Disclosure = (b: Layer2BatchDeclaration[] = []): string => {
  if (!b.length) return '';
  const drift = (x: Layer2BatchDeclaration) => x.aiCount === 0 && (x.layer1Count ?? 0) > 0;
  const no = b.flatMap((x, i) => (drift(x) ? [i + 1] : []));
  const rows = b.map((x, i) => `| ${i + 1} | ${x.layer1Count ?? '未知（未捕获）'} | ${x.aiCount} |${drift(x) ? ' ⚠️ 见下' : ''} |`).join('\n');
  return `\n## Layer 2（AI 语义）产出\n\n- 申报批次数 ${b.length}｜Layer 2 合计产出 ${b.reduce((n, x) => n + x.aiCount, 0)} 条${no.length ? `｜⚠️ **${no.length} 批申报 0 但 Layer 1 实测命中 >0**（第 ${no.join('、')} 批）：请人工复核其 AI 语义分析是否逐句已核` : ''}\n\n| 批次 | Layer 1 实测（正则，服务端捕获） | Layer 2 申报（AI） | 备注 |\n|---|---|---|---|\n${rows}\n`;
};
const loc = (i: ProofreadIssueEntry) => (typeof i.paragraphIndex === 'number' && i.paragraphIndex > 0 ? `段落 ${i.paragraphIndex}` : typeof i.offset === 'number' ? `偏移 ${i.offset}` : '位置未知');
const cell = (v?: string) => (v || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const src = (i: ProofreadIssueEntry) => (i.source === 'ai' ? 'AI' : 'MCP');
/* 问题表格（正式/未分类/疑似问题共用单一实现）；`suggest` 让疑似问题节把「建议修改」列标注为「疑为」 */
const issueTable = (issues: ProofreadIssueEntry[], suggest = '建议修改', emptyType = '') => `| # | 位置 | 原文 | ${suggest} | 类型 | 来源 |\n|---|------|------|${suggest === '建议修改' ? '---------' : '-----'}|------|------|\n` + issues.map((i, n) => `| ${n + 1} | ${loc(i)} | ${cell(i.original)} | ${cell(i.suggestion)} | ${i.type || emptyType} | ${src(i)} |\n`).join('') + `\n`;
export const suspectedSection = (s: ProofreadIssueEntry[], heading = '##'): string => suspectedHeading(s.length, heading) + SUSPECT_NOTE + `\n\n` + issueTable(s, '疑为', '（空）');
const docMeta = (d: DocInfo, at = now()) => meta({ ...d, at });
const scoreTable = (d?: ReportData) => (d
  ? `| 维度 | 问题数 | 原始分 (1-5) | 归一化 (0-2) | 得分 (X.X/10) |\n|------|--------|-------------|-------------|---------------|\n` + PROOFREAD_METRICS.map(m => `| ${m.label} (${m.key}) | ${d.scores[m.key].count} | ${d.scores[m.key].rawScore.toFixed(1)} | ${d.scores[m.key].normalizedScore.toFixed(2)} | ${d.scores[m.key].displayScore}/10 |\n`).join('')
  : `| 维度 | 问题数 | 说明 |\n|------|--------|------|\n` + PROOFREAD_METRICS.map(m => `| ${m.label} (${m.key}) | 0 | 本轮未检测到问题，评分不适用 |\n`).join(''));
export function emptyReport(docInfo: DocInfo, hasSuspected = false, totalRevisions?: number): string {
  const revs = typeof totalRevisions === 'number' && totalRevisions > 0;
  const verdict = hasSuspected ? EMPTY_SUSPECTED : revs ? EMPTY_WITH_REVS(totalRevisions!) : EMPTY_CLEAN;
  return `# 校对报告\n\n` + docMeta(docInfo) + (revs ? `- **修订总数**: ${totalRevisions}\n` : totalRevisions === 0 ? EMPTY_BASELINE_ZERO : '') + `- **发现问题**: 0 处\n| 全部已修复 | ${revs ? ALL_FIXED_REVS(totalRevisions!) : '— 不适用（本轮未发现待修复问题，无可判定对象）'} |\n\n## 六维评分\n\n${scoreTable()}\n${verdict}`;
}
export function reportHead(o: { docInfo: DocInfo; reportDate: string; issueCount: number; unknownTypeCount: number; batch: CoverageAnalysis; crossCheckWarning: string | null; totalRevisions: number | undefined }): string {
  let r = `# 校对报告\n\n` + docMeta(o.docInfo, o.reportDate);
  if (o.batch.hasCoverageGap) r += `- **⚠️ 尚未覆盖完整**: 段落 ${o.batch.coverageGaps.map(g => (g.start === g.end ? `${g.start}` : `${g.start}-${g.end}`)).join(', ')} 未见校对进度上报，可能漏校，请补完后重新生成报告\n`;
  r += (o.totalRevisions === undefined ? '' : revisions(o.totalRevisions)) + `- **发现问题**: ${o.issueCount} 处（${o.totalRevisions === undefined ? '问题数按 issue 条数计' : '按 AI 累计 issue 条数计'}）\n` + (o.totalRevisions === undefined ? '' : `- **门禁口径**: fix_action 修复归因门禁（Issue #277 P1-1；report_only 不计入已修）\n`);
  if (o.unknownTypeCount > 0) r += `- **⚠️ 未分类问题**: ${o.unknownTypeCount} 处（未计入六维评分，见下方「未分类问题」节；请检查 AI 层是否输出 type 字段）\n`;
  return r + (o.crossCheckWarning ? `\n> ${o.crossCheckWarning}\n` : '') + `\n`;
}
export const scoreSection = (d: ReportData): string => `## 六维评分\n\n${scoreTable(d)}\n## 雷达图数据\n\n\`\`\`json\n` +
  JSON.stringify({ metrics: PROOFREAD_METRICS.map(m => ({ name: m.label, key: m.key, count: d.scores[m.key].count, raw: d.scores[m.key].rawScore, normalized: d.scores[m.key].normalizedScore, display: d.scores[m.key].displayScore })) }, null, 2) + `\n\`\`\`\n\n`;
export function issueDetails(d: ReportData, suspected?: ProofreadIssueEntry[]): string {
  const labels = Object.fromEntries(PROOFREAD_METRICS.map(m => [m.key, m.label]));
  let r = `## 问题详情\n\n`;
  for (const { key } of PROOFREAD_METRICS) { const list = d.metricIssues[key]; if (list.length > 0) r += `### ${labels[key]} (${key}) — ${list.length} 处\n\n` + issueTable(list); }
  if (d.unknownTypeIssues.length > 0) r += unknownHeading(d.unknownTypeIssues.length) + UNKNOWN_NOTE + `\n\n` + issueTable(d.unknownTypeIssues, '建议修改', '（空）');
  return suspected?.length ? r + suspectedSection(suspected, '###') : r;
}
/* 统计摘要 + 修复状态行 + 修订证据告警 + TC-12 口径（三者正交，任何分支都不得静默吞掉证据告警） */
export function summarySection(o: { issueCount: number; source: SourceSummary; fix: FixStatus; reportOnlyCount: number; coverageComplete: boolean; processedTo: number | undefined; totalPara: number; suspectedCount: number; totalRevisions: number | undefined; claimedFixCount: number }): string {
  const { issueCount, fix, reportOnlyCount, claimedFixCount, coverageComplete, totalRevisions } = o;
  const rows = [`| 正则基础校对 (MCP) | ${o.source.mcpCount} 处 |`, `| AI 智能校对 | ${o.source.aiCount} 处 |`, ...(o.source.unknownSourceCount > 0 ? [`| ⚠️ 未标注来源 | ${o.source.unknownSourceCount} 处 |`] : []), `| **合计** | **${o.issueCount} 处** |`];
  if (o.source.formatCount > 0) rows.push(`| 其中纯格式问题 | ${o.source.formatCount} 处（已拆入独立「格式」维度计分，见六维评分「格式」行` + (o.source.formatAndReportOnlyCount > 0 ? `；与「仅报告未修」为不同维度，其中 ${o.source.formatAndReportOnlyCount} 处同时属「仅报告未修」） |` : `） |`));
  if (o.suspectedCount > 0) rows.push(`| 待确认问题 | ${o.suspectedCount} 处（见「待确认问题」节） |`);
  // 修复状态（覆盖完整性 × 修复归因 × 修订证据 三者正交）；推断归因只改文案，不改变「已修」判定
  const inferred = (n: number, tail: string) => `（其中 ${n} 处为服务端推断（${describeInferredReason(fix)}），${tail}）`;
  let r: string;
  if (coverageComplete && fix.allFixed) r = ALL_FIXED + (fix.inferredFixCount > 0 ? INFERRED(issueCount, fix.inferredFixCount, describeInferredReason(fix)) : '');
  else if (coverageComplete && fix.revisionEvidenceMissing) r = NO_EVIDENCE(issueCount, issueCount - reportOnlyCount);
  else if (coverageComplete) r = NOT_ALL_FIXED(issueCount, reportOnlyCount, fix.inferredFixCount > 0 ? inferred(fix.inferredFixCount, '按已修计入——如需精确核对请查原始累加数据。') : '。');
  else r = COVERAGE_UNKNOWN(typeof o.processedTo === 'number' ? String(o.processedTo) : '无进度', String(o.totalPara || '未知'));
  if (claimedFixCount > 0 && fix.revisionDataMissing && !(coverageComplete && fix.revisionEvidenceMissing)) r += DATA_MISSING(claimedFixCount); // 证据告警与修复状态正交：任意分支都须披露「声称已修但无证据」
  if (totalRevisions !== undefined) {
    const half = totalRevisions / 2, isInt = isInteger(half), expected = isInt ? half : Math.round(half);
    r += TC12_HEAD(issueCount, reportOnlyCount, claimedFixCount) + TC12_REVS(totalRevisions, isInt ? String(half) : '≈' + half.toFixed(1)) +
      (!isInt ? TC12_ODD : expected === claimedFixCount ? TC12_MATCH : claimedFixCount === 0 ? TC12_NONE(totalRevisions) : TC12_MISMATCH(expected, claimedFixCount));
  }
  const out = `## 统计摘要\n\n| 来源 | 数量 |\n|------|------|\n${rows.join('\n')}\n` + r;
  return o.suspectedCount > 0 && coverageComplete && fix.allFixed ? out + `> ℹ️ **口径说明**：「全部已修复」仅统计已确认的问题（${issueCount} 处），**不含** ${o.suspectedCount} 处待确认问题——后者的处理结论请见「待确认问题」节。\n` : out;
}

interface AccumulateArgs { issues?: ProofreadIssueEntry[]; doc_info?: DocInfo; total_revisions?: number; suspected_issues?: ProofreadIssueEntry[]; _processed_to_paragraph?: number; skipped_segments?: RawSkippedSegmentInput | unknown[]; }
export const proofreadAccumulateHandler: ToolHandler = async (args: Record<string, unknown>): Promise<ToolCallResult> => {
  const a = args as AccumulateArgs, { doc_info, total_revisions } = a;
  const sessionKey = deriveSessionKey(doc_info); // 会话身份 = 文档派生 key（#382：AI 不传 session_id）；派生失败即拒绝（不回落 fileName）
  if (!sessionKey) return fail('无法定位校对会话：doc_info.filePath（文档绝对路径）缺失。校对报告需与文档同目录落盘，请先保存文档并在 doc_info 提供 filePath（唯一会话身份，Issue #382）。', 'doc_info.filePath 缺失（无法派生会话 key）');
  if (!Array.isArray(a.issues)) return fail('issues 必须是数组！', '参数格式错误'); // 非数组会让后续 map/normalize 抛异常，AI 收到「工具崩溃」而非「参数错误」，无法自纠
  let issues = a.issues, suspectedIssues = a.suspected_issues;
  let session = sessionIssues.get(sessionKey); // 获取或创建会话（单一来源 = 进程内 Map；会话不落盘）
  // #420 CR-420-2：已交付会话遇新累加 = 新一轮校对 ⇒ 重开（不复用残留进度，否则被「必须严格递增」拦死）。
  if (session?.reported && doc_info) session = undefined;
  if (!session) {
    if (!doc_info) return fail('首次调用 wps_word_proofread_accumulate 必须提供 doc_info！', '缺少 doc_info（首次调用）');
    session = { issues: [], docInfo: doc_info, createdAt: new Date().toISOString() };
    sessionIssues.set(sessionKey, session);
  }
  // 进度门禁前置到任何会话变更之前（无副作用；此前在累加之后 → 被拒批次污染会话）：① 超界 ② 回退/重复 ③ 单批增量超限
  const processedTo = a._processed_to_paragraph, prevProgress = session.progress?.processedToParagraph ?? 0, totalPara = session.docInfo?.totalParagraphs;
  if (typeof processedTo === 'number' && Number.isFinite(processedTo) && processedTo >= 1 && typeof totalPara === 'number') {
    const gate = checkProgressGate({ processedTo, prevProgress, totalParagraphs: totalPara, batchMax: PROOFREAD_BATCH_MAX });
    if (!gate.ok) return fail(gate.text, gate.error);
  }
  // 必填字段校验（部分成功语义）：只累加有效条目——防一条坏数据丢整批；空白字符（original=" "）是合法的「异常空格」发现，不得 trim 判空
  const { valid, invalid } = validateEntries(issues);
  if (valid.length === 0 && invalid.length > 0)
    return fail(
      `issues 中 ${invalid.length} 条全部缺少必填字段 original/suggestion，无有效条目可累加。\n每条校对问题必须携带 original（原文）和 suggestion（建议修改）两个必填字段。\n 首条: { original: "${(invalid[0].i.original || '').slice(0, 30)}", 缺字段: ${invalid[0].reason} }\n请补充缺失字段后重试；若为首次调用还需携带 doc_info 初始化会话。`,
      `issues ${invalid.length} 条全部缺 original/suggestion`
    );
  issues = valid;
  // 疑似问题必填校验：与 issues 对称（部分成功语义），一条坏疑似数据不拒绝整批
  let skippedSuspectedCount = 0;
  if (Array.isArray(suspectedIssues)) { const f = filterSuspected(suspectedIssues); skippedSuspectedCount = f.skippedCount; suspectedIssues = f.valid; }
  // 合并式更新 + **totalParagraphs 单调取最大**（Issue #382 评审 CR1-2 / CR7-1）：
  //   · 只覆盖显式提供的字段（后续批常只带身份字段，整体覆盖会把 totalWords 抹成 undefined ⇒ 「总字数: 0」回归）；
  //   · `totalParagraphs` 是**覆盖门禁依据**，若允许后续批下调，AI 谎报小值即可让
  //     `processedTo >= totalParagraphs` 提前成立 ⇒ **绕过「未覆盖全文禁止出报告」门禁**（实测可复现）。
  //     故只允许**上调**（文档重排后段数可能变多；降低一律忽略）。
  if (doc_info) {
    const merged = { ...session.docInfo, ...pruneUndefined(doc_info) } as DocInfo;
    const prevTotal = session.docInfo?.totalParagraphs;
    if (typeof prevTotal === 'number' && typeof merged.totalParagraphs === 'number' && merged.totalParagraphs < prevTotal)
      merged.totalParagraphs = prevTotal;
    session.docInfo = merged;
  }
  // 修订数取最大：并行 executor 取值时刻不同，整体覆盖有「最后写入者胜出」竞争；修订单调累积
  if (typeof total_revisions === 'number' && total_revisions > (session.totalRevisions ?? -1)) session.totalRevisions = total_revisions;
  // 归一化（type/source/location/fix_action）；去重仅对带绝对 offset 条目按 dedupKey，同键 source=ai 优先覆盖 mcp；疑似问题同口径单独存储
  const normalized = normalizeEntries(issues), missingOffsetCount = normalized.filter(i => i.offset === undefined).length;
  const dedup = dedupAll([...session.issues, ...normalized], normalized);
  session.issues = dedup.deduped;
  if (Array.isArray(suspectedIssues)) session.suspectedIssues = dedupSuspected(session.suspectedIssues, normalizeEntries(suspectedIssues));
  // 必须在 progress 被改写为「本批终点」之前取已覆盖进度，否则 batchRange 退化为 [end+1, end]（非法）
  const batchRange = resolveBatchRange(processedTo, prevProgress);
  if (typeof processedTo === 'number' && Number.isFinite(processedTo) && processedTo >= 1) session.progress = nextProgress({ prev: prevProgress, processedTo, totalPara: totalPara ?? 0 });
  // 跳过披露（#294）防伪造：区间必须完全落在本批内，服务端零推断只做几何校验；归属判定与治理侧同口径（按区间并集）
  const skipEval = evaluateSkipDeclaration(a.skipped_segments, batchRange, unionCoversRange), normalizedSkipped = skipEval.normalization.entries;
  // 「半跳假披露」防护：仅在「合法整块跳过」（覆盖无缺口 + count 等于本批段数）时累加披露；entries/ranges 加上限防载荷膨胀，totalCount 全量增量累加不得由截断后重算
  if (skipEval.acceptDisclosure && normalizedSkipped.length > 0) {
    const prevSkip = session.skippedSegments;
    session.skippedSegments = { totalCount: (prevSkip?.totalCount ?? 0) + normalizedSkipped.reduce((sum, e) => sum + e.count, 0), ranges: mergeSkippedRanges([...(prevSkip?.ranges ?? []), ...normalizedSkipped.flatMap(e => e.ranges)]).ranges, entries: mergeSkippedEntries(prevSkip?.entries ?? [], normalizedSkipped) };
  }
  // data 字段供 AI **程序化**判断（进度 / 跳过披露）；C2：并入本批 Layer 2 申报（服务端记录）——出队即清空防重复
  const l2 = drainLayer2Declarations();
  if (l2.length > 0) session.layer2Batches = [...(session.layer2Batches ?? []), ...l2];
  return { id: uuidv4(), success: true, data: { progress: typeof session.progress?.processedToParagraph === 'number' ? session.progress : undefined, skippedSegments: session.skippedSegments, sessionKey },
    content: [{ type: 'text', text: renderAccumulateSummary({
      batchIssueCount: issues.length, sessionIssueCount: session.issues.length, progress: session.progress, skippedInvalidCount: invalid.length, skippedSuspectedCount, dedupedCount: dedup.batchDedupedCount, missingOffsetCount,
      suspectedTotal: session.suspectedIssues?.length ?? 0, skippedSegments: session.skippedSegments, droppedOutOfBoundCount: skipEval.normalization.droppedOutOfBoundCount, droppedIncompleteBatchCount: skipEval.normalization.droppedIncompleteBatchCount, batchRange,
    }) }] };
};

// #179 方案 B：文档所在目录并入白名单，使报告与文档同目录可写。Issue #420：契约给 `path-safety.buildWriteRootsWithDocDir`（单源，与 write_file 兜底共用）。
export const buildReportAllowedRoots = buildWriteRootsWithDocDir;
function writeReport(o: { report: string; outputFile?: string; docFilePath?: string; sessionKey: string; session?: SessionData }): ToolCallResult | null {
  const { report, outputFile, docFilePath, sessionKey, session } = o;
  let wrote = false, writeError: string | undefined;
  if (outputFile) {
    try {
      const safePath = validateFilePath(outputFile, buildReportAllowedRoots(docFilePath)), dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(safePath, report, 'utf-8');
      wrote = true;
    } catch (err) { writeError = err instanceof Error ? err.message : String(err); } // 落盘失败必须暴露明确信号，禁止静默吞错
  }
  // 落盘成功才回收；方案 B（无 outputFile）不立即回收（原 `!outputFile || wrote` 会在方案 B 后销毁会话 ⇒ 重试恒报「未找到会话」）。
  // 但「不回收」≠「永久残留」（#420 CR-420-2）：标记 reported，回收改由下次 accumulate 承担（已交付则重开）。
  if (wrote) releaseSession(sessionKey);
  else if (session) session.reported = true;
  if (!writeError) return null;
  const preview = report.length > 1500 ? report.slice(0, 1500) + '\n…(预览截断)' : report; // 失败返回不内嵌全文（省 token），改截断预览
  return fail(`⚠️ 校对报告已生成但**写入文件失败**，本次校对未完成落盘！\n\n目标路径: ${outputFile ?? '(未指定)'}\n失败原因: ${writeError}\n\n会话已保留（未随本次失败释放），请修正路径后重新调用 generateProofreadReport（传 output_file）重试；或改用 SKILL Step 3 的 writeFile 方案落盘。报告全文 ${report.length} 字，本次仅返回预览：\n\n${preview}`, `报告写入文件失败: ${writeError}`);
}
export const generateProofreadReportHandler: ToolHandler = async (args: Record<string, unknown>): Promise<ToolCallResult> => {
  const { output_file, doc_info } = args as { output_file?: string; doc_info?: DocInfo };
  // 会话身份 = 文档派生 key（Issue #382）；无 doc_info 时从活动文档派生（收尾调用即可定位）。
  let docInfoForKey = doc_info;
  if (!docInfoForKey) try { const d = await wpsClient.getActiveDocument(); docInfoForKey = { fileName: d?.name ?? '', filePath: d?.path ?? '', totalParagraphs: 0, totalWords: 0 }; } catch { docInfoForKey = undefined; }
  const sessionKey = deriveSessionKey(docInfoForKey);
  if (!sessionKey) return fail('无法定位校对会话：拿不到文档身份（doc_info.filePath 与活动文档路径均为空）。请先确认活动文档已保存（校对报告需与文档同目录落盘，Issue #382）。', '会话身份缺失');
  const session = sessionIssues.get(sessionKey);
  if (!session) return fail(`未找到会话（文档 ${docInfoForKey?.fileName ?? '未知'}）。请先使用 wps_word_proofread_accumulate 累加校对问题——会话身份由文档路径派生（Issue #382：不再传 session_id）。`, '会话不存在');
  const { issues, docInfo, suspectedIssues, totalRevisions, progress, skippedSegments } = session;
  const processedTo = progress?.processedToParagraph, totalPara = typeof docInfo?.totalParagraphs === 'number' ? docInfo.totalParagraphs : 0;
  // 硬性完整性门禁：未完整覆盖全文即拒绝生成，防「中途结束就假装完成」
  const gate = evaluateIntegrityGate({ totalPara, processedTo, hasRunTrace: issues.length > 0 || (suspectedIssues?.length ?? 0) > 0 || (typeof totalRevisions === 'number' && totalRevisions > 0) });
  if (gate.kind === 'reject') return fail(gate.text, gate.error);
  // 落盘（唯一实现）+ 会话回收；失败返回失败结果，成功返回报告全文
  const write = (report: string) => writeReport({ report, outputFile: output_file, docFilePath: docInfo?.filePath, sessionKey, session }) ?? result(report);
  // 0 问题但有疑似问题时单列「待确认问题」节（避免「✅ 未发现问题」与「⚠️ 待确认」并置）
  if (issues.length === 0) {
    const hasSuspected = (suspectedIssues?.length ?? 0) > 0;
    return write(skipDisclosure(emptyReport(docInfo, hasSuspected, totalRevisions) + (hasSuspected ? suspectedSection(suspectedIssues!) : ''), skippedSegments) + layer2Disclosure(session.layer2Batches));
  }
  // 统计/评分/批次分析/渲染均由纯函数层完成，本函数只做编排
  const data = computeReportData(issues), batch = analyzeBatches({ totalParagraphs: totalPara, processedTo }), cross = computeCrossCheck(issues, totalRevisions);
  const coverageComplete = computeCoverageComplete({ totalPara, processedTo, hasCoverageGap: batch.hasCoverageGap }), fix = computeFixStatus({ issues, reportOnlyCount: cross.reportOnlyCount, claimedFixCount: cross.claimedFixCount, totalRevisions });
  const report = reportHead({ docInfo, reportDate: now(), issueCount: issues.length, unknownTypeCount: data.unknownTypeIssues.length, batch, crossCheckWarning: cross.warning, totalRevisions }) +
    scoreSection(data) + issueDetails(data, suspectedIssues) + summarySection({ issueCount: issues.length, source: computeSourceSummary(issues), fix, reportOnlyCount: cross.reportOnlyCount, coverageComplete, processedTo, totalPara, suspectedCount: suspectedIssues?.length ?? 0, totalRevisions, claimedFixCount: cross.claimedFixCount });
  return write(skipDisclosure(report, skippedSegments) + layer2Disclosure(session.layer2Batches)); // skipDisclosure 是唯一收尾点（与覆盖门禁正交）
};
/* 这两个工具的定义**随本文件直连注册**（Issue #382：纯 TS 逻辑工具不再「网关专属」）——`word/index.ts` 收进 allTools。 */
export const reportTools: RegisteredTool[] = [
  { definition: proofreadAccumulateDefinition, handler: proofreadAccumulateHandler },
  { definition: generateProofreadReportDefinition, handler: generateProofreadReportHandler },
];
/** 会话身份唯一消费口径（导出供回归测试断言；非第二份实现）。 */
export const resolveProofreadSessionKey = deriveSessionKey;
