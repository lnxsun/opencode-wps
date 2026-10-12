/**
 * 校对报告模块 — 归一化/类型推断逻辑（单一来源）。
 *
 * 把**非受信**的 AI 输出收敛成下游可计算的确定形态：问题类型兜底推断、来源归一化、
 * 位置归一化、修复动作裁决、评分权重公式、跳过区间归属。无会话状态、无 IO，纯函数。
 *
 * 设计取向：**宁可少披露、不可假披露**（宁可丢条目也不放行半真数据）。
 */

import { ProofreadMetric, ProofreadIssueEntry, SkippedSegmentEntry } from './proofread-types';

/** 问题类型 → 六维评分维度映射表（报告评分的唯一来源）。
 * `standardization` 并入 `consistency`（规范性问题本质即格式一致性）；`format` 独立成维，
 * 使纯格式问题不再污染一致性/用语统一评分。 */
export const TYPE_METRIC_MAP: Record<string, ProofreadMetric> = {
  // fluency：句式杂糅, 的得混淆, 的地混淆, 在再混淆, 即既混淆, 常见错别字, 口语化, 量词搭配, 少字, 动宾不当, 语义重复, 修饰不当, 搭配冗余, '冗余+搭配', 冗余搭配, 语序不当, 成分残缺, 句式混乱, 关联词失配, 指代不明, 逻辑矛盾, 语病, 搭配不当
  句式杂糅: 'fluency',
  的得混淆: 'fluency',
  的地混淆: 'fluency',
  在再混淆: 'fluency',
  即既混淆: 'fluency',
  常见错别字: 'fluency',
  口语化: 'fluency',
  量词搭配: 'fluency',
  少字: 'fluency',
  动宾不当: 'fluency',
  语义重复: 'fluency',
  修饰不当: 'fluency',
  搭配冗余: 'fluency',
  '冗余+搭配': 'fluency',
  冗余搭配: 'fluency',
  语序不当: 'fluency',
  成分残缺: 'fluency',
  句式混乱: 'fluency',
  关联词失配: 'fluency',
  指代不明: 'fluency',
  逻辑矛盾: 'fluency',
  语病: 'fluency',
  搭配不当: 'fluency',
  // conciseness：成分赘余, 重复表达, 冗余词, 重复字符, 重复标点, 句式冗余, 多字, 多余点号
  成分赘余: 'conciseness',
  重复表达: 'conciseness',
  冗余词: 'conciseness',
  重复字符: 'conciseness',
  重复标点: 'conciseness',
  句式冗余: 'conciseness',
  多字: 'conciseness',
  多余点号: 'conciseness',
  // accuracy：法律术语, 工程术语
  法律术语: 'accuracy',
  工程术语: 'accuracy',
  // consistency：用词统一, 网络用语（Issue #420：`W`=万 属用语统一；缺键会让「已修复」条目落未分类、不计六维）
  用词统一: 'consistency',
  网络用语: 'consistency',
  // format：8 个格式类 type + Issue #420「编号不连续」（SKILL 明列「编号连续性」为检测范围，词表却无键 ⇒ 恒落未分类）
  中英混排: 'format', 数字空格: 'format', 中文标点: 'format', 异常空格: 'format',
  多余空格: 'format', 全角空格: 'format', 标点符号: 'format', 格式规范: 'format', 编号不连续: 'format',
  // completeness：占位文本
  占位文本: 'completeness',
};
// ==================== F14 修饰不当模式 ====================

/** F14 修饰不当模式：**数量词 + 丰富/充分** 须同时出现（裸 `.{0,6}` 会把「丰富的经验」误判）。 */
const F14_MODIFIER_PATTERN = /(很多|许多|大量|丰富)(的)?(丰富|充分)(的)?(内容|经验|知识)/;

/** F11–F15 的 AI 专属模式（Layer 1 不检出）：`normalizeIssueSource` 据此把漏传 source 的条目归为 ai。 */
export const AI_ONLY_PATTERN = new RegExp(
  `存在着|具有着|加强重视|(进步|提升|提高)(提高|进步)|${F14_MODIFIER_PATTERN.source}`
);

// ==================== type 兜底推断（T2，#55） ====================

// ==================== 权重公式 ====================

/** 六维评分原始分（1-5 量表；completeness 有占位文本直接 0，属 blocker）。
 * 权重差异是本表唯一业务含义：accuracy 1.0 > conciseness 0.3 > fluency 0.2 > consistency 0.1 > format 0.05。 */
export const METRIC_WEIGHT_FORMULA: Record<
  ProofreadMetric,
  (count: number, hasPlaceholder?: boolean) => number
> = {
  fluency: c => Math.max(0, 5 - c * 0.2), // 下限 0（修正）
  conciseness: c => Math.max(0, 5 - c * 0.3),
  accuracy: c => Math.max(0, 5 - c * 1.0),
  consistency: c => Math.max(0, 5 - c * 0.1),
  completeness: (_c, hasPlaceholder) => (hasPlaceholder ? 0 : 5),
  // Issue #179 阶段6：格式维度权重最低（0.05），大量空格/标点不再把其它维度拖成 0 分
  format: c => Math.max(0, 5 - c * 0.05),
};

// ==================== 归一化函数 ====================

/** Layer 1 原始分（1-5）→ [0,2]（与 AI 侧 0/1/2 同空间，渲染时 ×5 得 X.X/10），负值钳到 0。 */
export const normalizeToTwoPointScale = (rawScore: number): number => Math.max(0, Math.min(2, (rawScore - 1) / 2));

// ==================== 兜底类型推断（#55 T2） ====================

/** 从 original/suggestion 内容兜底推断问题类型（按优先级匹配；与 rules 的典型模式同源）。 */
export function inferTypeFromContent(original: string, suggestion: string): string | undefined {
  const patterns: Array<[RegExp, string]> = [
    // ── 通顺（fluency） ──
    [/通过.{0,20}(使|让|令)/, '句式杂糅'],
    [/根据.{0,20}(显示|表明|证实)/, '句式杂糅'],
    [/由于.{0,20}的原因(导致|使|造成)/, '句式杂糅'],
    [/(即|既)(然|而)/, '即既混淆'],
    [/(做|搞|弄|写|说|画|跑|跳|走|看|听|吃|喝)的(太|很|非常|比较|极为|十分|挺)/, '的得混淆'],
    [/(狠|很|真|非|极|异|格)的(好|坏|快|慢|多|少|高|低|长|短|大|小)/, '的得混淆'],
    [/在(次|来|去)/, '在再混淆'],
    // ── 简洁（conciseness） ──
    [/进行(了)?((深入|详细|认真|充分|全面|系统|细致|专门|彻底|有效)[的])?(研究|分析|讨论|处理|调查)/, '冗余词'],
    [/作出(了)?(决定|部署|安排)/, '冗余词'],
    [/予以(了)?(解决|处理|落实)/, '冗余词'],
    [/加以(了)?(解决|完善|规范)/, '冗余词'],
    [/针对.{0,20}这一问题/, '冗余词'],
    [/大约.{0,8}(左右|上下)/, '句式冗余'],
    [/的原因(是因为|是由于)/, '句式冗余'],
    [/目的是为了|可以(说|看成|认为)是|被(广大|众多)所/, '句式冗余'],
    [/必须要|全部都|进一步地|现如今|涉及到|付诸于|诉诸于/, '多字'],
    [/并(非|不)是/, '多字'],
    [/(的的|了了|，，|。。|！！|？？)/, '重复字符'],
    // ── F11–F15 典型模式（AI Layer 2，fluency；#55 T3） ──
    [/存在着|具有着/, '搭配冗余'], // F11/F15
    [/加强重视/, '动宾不当'], // F12
    [/(进步|提升|提高)(提高|进步)/, '语义重复'], // F13
    // F14
    [F14_MODIFIER_PATTERN, '修饰不当'],
    // Issue #420：数字 + `W/w` + 中文量词（`3W路`）→ 用语统一；不裸匹配 `\d+W`（否则吃掉 `100W 灯泡`）
    [/\d+\s*[Ww](?=\s*(?:路|人|元|条|台|次|个|平|套|份|辆|头|只))/, '网络用语'],
    // ── 其他 ──
    [/签定(合同|协议|合约|约定)/, '法律术语'],
    [/其它(人|事|物|方面|单位|情况|问题)/, '用词统一'],
    [/(?:check|test|sample|todo|fixme|lorem ipsum)/i, '占位文本'],
    [/xxx|xxx有限公司/, '占位文本'],
  ];

  // 先看原文，原文无法匹配再看建议文本
  for (const text of [original, suggestion]) {
    if (!text) continue;
    for (const [re, type] of patterns) if (re.test(text)) return type;
  }
  return undefined;
}

/** 规整 issue.type（#395 RC-4/CR1-2）：命中词表 → 原样；缺失/空/`'ai'`/`'未分类'` → 文本兜底推断，仍不可推断 → `'未分类'`（幂等）；给了 type 但不在词表（如英文）→ **不静默改判**到合法却错误的维度，落 `'未分类'` 由报告单列告警 ⇒ 非法可辨识。type 一律 trim。 */
export function normalizeIssueType(issue: ProofreadIssueEntry): ProofreadIssueEntry {
  const t = typeof issue.type === 'string' ? issue.type.trim() : ''; // 无 type 才兜底推断；非法 type 落「未分类」不静默改判
  return TYPE_METRIC_MAP[t] ? { ...issue, type: t } : !t || t === 'ai' || t === '未分类' ? { ...issue, type: inferTypeFromContent(issue.original || '', issue.suggestion || '') || '未分类' } : { ...issue, type: '未分类' };
}

/** 字符串数字 → 数值；非数值 / undefined / 空串 → undefined（不强行转换）。 */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') return Number.isFinite(Number(value)) ? Number(value) : undefined;
  return undefined;
}

export function normalizeIssueLocation(issue: ProofreadIssueEntry): ProofreadIssueEntry {
  // 仅声明本函数消费的字段；有意忽略 `offset_in_paragraph`（段落内偏移，与绝对 offset 不可混用）
  const raw = issue as ProofreadIssueEntry & {
    paragraphIndex?: number | string;
    paragraph_index?: number | string;
    offset?: number | string;
  };
  // paragraphIndex 优先驼峰，其次蛇形旧别名；offset 仅接受绝对偏移数值（offset_in_paragraph 绝不兜底）
  return { ...issue, paragraphIndex: toFiniteNumber(raw.paragraphIndex) ?? toFiniteNumber(raw.paragraph_index), offset: toFiniteNumber(raw.offset) };
}

/** 去重键：JSON 序列化数组（消除分隔符歧义）。仅对携带绝对 offset 的条目调用。 */
export const dedupKey = (offset: number, original: string): string => JSON.stringify([offset, original]);

/** 规整 issue.source：缺/非法值 → 兜底推断。次序不可颠倒：mcp/ai（大小写归一）→ F11–F15 AI 专属模式 → Layer 1 → 保守 mcp。
 * F11–F15 必须先于 Layer 1：`inferTypeFromContent` 同样命中它们，先走 Layer 1 会把 AI 专属问题误计为 mcp。 */
export function normalizeIssueSource(issue: ProofreadIssueEntry): ProofreadIssueEntry {
  const rawSource = typeof issue.source === 'string' ? issue.source.trim().toLowerCase() : '';
  if (rawSource === 'mcp' || rawSource === 'ai') {
    // 报告统计用严格 === 判断：直接返回原引用会让大小写变体（'MCP'/'AI'）落入「未标注来源」
    return { ...issue, source: rawSource };
  }
  const original = issue.original || '', suggestion = issue.suggestion || '';
  if (AI_ONLY_PATTERN.test(`${original} ${suggestion}`)) return { ...issue, source: 'ai' }; // 次序见函数头注释：必须先于 Layer 1
  // 其余（Layer 1 命中 / 无法判断）→ 保守 'mcp'
  return { ...issue, source: 'mcp' };
}

/** 修复动作的**单一裁决点**：「读取侧判定 = 写入侧归一化」的组合态只此一处
 * （历史上三个读取侧函数各自把整条 issue 连同 3 个正则重跑一遍）。
 *
 * 规则（**保守语义：不因缺字段把「已修」判成「未修」**）：
 * - `report_only` 及其变体（大小写 / 连字符 / 空白 / 下划线重复 / 驼峰 `reportOnly`）→ `report_only`；
 * - 显式 `fix` 及其变体 → `fix`；
 * - 其余（缺省 / `null` / 未知值 / 非字符串）→ `fix` **并置 `inferred` 留痕** —— 兜底必须可见，
 *   否则报告无法区分「AI 明确声明已修」与「AI 漏传被默认成已修」。 */
export interface FixActionVerdict {
  /** 归一化后的修复动作（`fix` / `report_only`） */
  fixAction: 'fix' | 'report_only';
  /** 服务端**推断**的原因（`undefined` = 调用方显式声明）：
   * `'missing'` = 未提供 `fix_action`；`'unknown'` = 提供了非约定取值（如 `'pending'`）而兜底。 */
  inferred?: 'missing' | 'unknown';
}

/** 非字母数字字符统一收敛为「单个下划线」（列举分隔符必漏，故用字符类而非白名单）。 */
const canonicalFixActionToken = (value: unknown): string | undefined =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/reportonly/g, 'report_only').replace(/^_+|_+$/g, '')
    : undefined;

/** 修复动作裁决（唯一实现；读取侧与写入侧共用，杜绝两套口径） */
export function resolveFixAction(issue: ProofreadIssueEntry): FixActionVerdict {
  const raw = issue as ProofreadIssueEntry & { fix_action?: unknown; fixAction?: unknown };
  // `??` 只在左值为 null/undefined 时取右值 ⇒ 两字段同时存在时以 `fix_action` 为准
  const value = raw.fix_action ?? raw.fixAction;
  const canonical = canonicalFixActionToken(value);
  if (canonical === 'report_only') return { fixAction: 'report_only' };
  if (typeof value === 'string' && canonical === 'fix') return { fixAction: 'fix' };
  // 兜底：保守判为已修，但必须留痕「这是推断」（漏传 vs 取值未被识别分开归因）
  const missing = raw.fix_action == null && raw.fixAction == null;
  return { fixAction: 'fix', inferred: missing ? 'missing' : 'unknown' };
}

/** 规整 issue 的修复动作字段（**写入侧**，改写会话数据）。
 * ⚠️ 与读取侧三个判定同源（共同依赖 `resolveFixAction`）；若日后启用**枚举校验**（拒绝未知取值），
 * 必须同步报告侧「口径说明」，二者不可单独改。 */
export function normalizeIssueFixAction(issue: ProofreadIssueEntry): ProofreadIssueEntry {
  const verdict = resolveFixAction(issue);
  if (verdict.fixAction === 'report_only') return { ...issue, fix_action: 'report_only' };
  if (verdict.inferred === undefined) {
    // 显式 fix：顺带剥离陈旧的 inferred 标记（否则「已核实」会被历史标记污染）
    const { fix_action_inferred: _drop, ...rest } = issue as ProofreadIssueEntry & { fix_action_inferred?: boolean };
    return { ...rest, fix_action: 'fix' };
  }
  return { ...issue, fix_action: 'fix', fix_action_inferred: true };
}

/** 判定单条 issue 是否为「仅报告未修」。报告门禁统一走本函数而非裸 `=== 'report_only'`——
 * 后者对未经归一化的裸数据（测试直注 / 存量会话）中的变体值会漏判，导致「未修」被当成已修
 * 而误显示「全部已修复 ✅」。空值/非对象按「未知 → 保守视为已修」处理。 */
export const isReportOnly = (issue: ProofreadIssueEntry): boolean =>
  !!issue && typeof issue === 'object' && resolveFixAction(issue).fixAction === 'report_only';

/** 修复归因**唯一投影**（Issue #352 方案 B：原 `isFixActionInferred` + `classifyFixActionInference` + `describeFixAction`
 * 三函数围绕同一语义转 ⇒ 合一）。返回 `'missing'` / `'unknown'` / `null`（非推断）；报告文案须区分前二者。
 * 消费方经 `resolveFixAction` 或本投影取态，**不得**自读 `fix_action`+`fix_action_inferred` 自拼组合态。 */
export const classifyFixActionInference = (issue: ProofreadIssueEntry): 'missing' | 'unknown' | null =>
  issue && typeof issue === 'object' ? resolveFixAction(issue).inferred ?? null : null;

// ==================== 跳过范围披露归一化（Issue #294） ====================

/** 本批区间的**严格归一化**（唯一实现）。返回 `undefined` = 不可得 → 归属校验退化为仅格式过滤。
 * 此前三处各写一遍同一段校验（单条归一化 / 覆盖性校验 / 调用方）——「批内声明有效范围」的多处定义。 */
function strictBatchBounds(batchRange?: [number, number]): [number, number] | undefined {
  if (
    !Array.isArray(batchRange) ||
    batchRange.length !== 2 ||
    !Number.isInteger(batchRange[0]) ||
    !Number.isInteger(batchRange[1]) ||
    batchRange[0] < 1 ||
    batchRange[1] < batchRange[0]
  ) {
    return undefined;
  }
  return [Math.floor(batchRange[0]), Math.floor(batchRange[1])];
}

/** `skipped_segments` 归一化结果 + **丢弃明细**（不静默吞掉）。
 * 两个丢弃计数必须分开：越界（捏造/记错）与未完整覆盖（半跳）的纠正指引不同。 */
export interface SkippedSegmentNormalizeResult {
  entries: SkippedSegmentEntry[];
  /** 被丢弃的越界/越批区间总数（跨条目累计） */
  droppedOutOfBoundCount: number;
  /** 被丢弃的「未完整覆盖本批」条目数。只承认「整批跳过」（100% 完整覆盖）：放行「批内跳一半」
   * 会让报告以「整批为表格单元格」渲染，而半跳批里必然含正文段——披露前提与事实不符。 */
  droppedIncompleteBatchCount: number;
}

/** 归一化单条 `skipped_segments` 入参（只做保守归一化，**不做任何「补齐创作」**）。
 * `count` 正整数才有效（缺省由 `ranges` 求和）；`ranges` 非法项过滤、**越出 `bounds` 的丢弃并计数**；
 * 兼容 snake_case / 驼峰别名。返回 `entry: null` = 该条无效，调用方**忽略而非猜测**。
 * ⚠️ 只做区间归属校验，**不**判「批内表格占比 ≥80%」（skill 层判据，服务端零推断）。 */
function normalizeOne(
  raw: unknown,
  bounds?: [number, number]
): { entry: SkippedSegmentEntry | null; droppedOutOfBoundCount: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entry: null, droppedOutOfBoundCount: 0 };
  }
  const r = raw as Record<string, unknown>;
  const rangesRaw = r.ranges ?? r.range_list ?? r.rangeList;
  const ranges: Array<[number, number]> = [];
  let droppedOutOfBoundCount = 0;
  if (Array.isArray(rangesRaw)) {
    for (const item of rangesRaw) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const start = Number(item[0]);
      const end = Number(item[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      if (start < 1 || end < start) continue;
      if (bounds !== undefined && (start < bounds[0] || end > bounds[1])) {
        // 越出本批 → 与「跳过段须同时计入已覆盖进度」自相矛盾（捏造或记错），丢弃不静默
        droppedOutOfBoundCount++;
        continue;
      }
      ranges.push([start, end]);
    }
  }
  // 越界丢弃后 ranges 为空 → 整条作废：留「有 count、无区间」的半真条目会让报告渲染出不可核实的披露。
  if (ranges.length === 0) return { entry: null, droppedOutOfBoundCount };

  let count = Number(r.count ?? r.segment_count ?? r.segmentCount);
  if (!Number.isInteger(count) || count <= 0) {
    count = ranges.reduce((sum, [s2, e2]) => sum + (e2 - s2 + 1), 0);
  }
  if (!Number.isInteger(count) || count <= 0) {
    return { entry: null, droppedOutOfBoundCount };
  }

  const entry: SkippedSegmentEntry = { count: Math.floor(count), ranges };
  const reasonRaw = r.reason ?? r.explain ?? r.description;
  if (typeof reasonRaw === 'string' && reasonRaw.trim()) {
    entry.reason = reasonRaw.trim();
  }
  return { entry, droppedOutOfBoundCount };
}

/** `skipped_segments` 的**原始入参形状**（单一真值定义处）：单条对象或对象数组；
 * 数组元素可以是本对象或裸区间数组（后者被归一化丢弃）。字段别名与 `normalizeOne` 同口径。 */
export interface RawSkippedSegmentInput {
  count?: number; ranges?: Array<[number, number]>; reason?: string;
  segment_count?: number; segmentCount?: number;
  range_list?: Array<[number, number]>; rangeList?: Array<[number, number]>;
  explain?: string; description?: string;
}

/** 归一化 `skipped_segments` 入参 → 有效条目 + 丢弃明细（无效条目一律丢弃，不猜测、不补零）。
 * 跳过区间必须**完全落在本批**且**全部条目的区间并集无缺口覆盖本批**（半跳批必然含正文段）；
 * `batchRange` 不可得时退化为仅格式过滤（仍不静默越界放行）。 */
export function normalizeSkippedSegmentsDetailed(raw: unknown, batchRange?: [number, number]): SkippedSegmentNormalizeResult {
  if (raw == null) return { entries: [], droppedOutOfBoundCount: 0, droppedIncompleteBatchCount: 0 };
  const bounds = strictBatchBounds(batchRange);
  const entries: SkippedSegmentEntry[] = [];
  let droppedOutOfBoundCount = 0;
  for (const item of Array.isArray(raw) ? raw : [raw]) {
    const { entry, droppedOutOfBoundCount: dropped } = normalizeOne(item, bounds);
    if (entry) entries.push(entry);
    droppedOutOfBoundCount += dropped;
  }
  // 判定粒度是**全批条目的区间并集**（多条目「合计覆盖本批」合法，按单条判定会误伤）。
  if (bounds !== undefined && entries.length > 0 && !unionCoversRange(entries.flatMap(e => e.ranges), bounds))
    return { entries: [], droppedOutOfBoundCount, droppedIncompleteBatchCount: entries.length };
  return { entries, droppedOutOfBoundCount, droppedIncompleteBatchCount: 0 };
}

/** `skipped_segments` 归一化的**简化入口**（只要条目列表）——避免调用点到处写 `.entries`。 */
export const normalizeSkippedSegments = (raw: unknown, batchRange?: [number, number]): SkippedSegmentEntry[] =>
  normalizeSkippedSegmentsDetailed(raw, batchRange).entries;

/** 区间集合的**并集**是否无缺口覆盖目标区间（覆盖性判定**唯一实现**，归一化层与报告层共用）。
 * 必须按**并集**判定而非单条——多条目「合计覆盖本批」是合法声明。
 * 注：披露侧另有 `mergeSkippedRanges`（含保留上限），职责不同（合并 vs 判定）。 */
export function unionCoversRange(ranges: Array<[number, number]>, target: [number, number]): boolean {
  const sorted = [...ranges].filter(r => r[0] >= 1 && r[1] >= r[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length === 0) return false;
  let cursor = target[0];
  for (const [start, end] of sorted) {
    if (end < cursor) continue;
    if (start > cursor) return false;
    cursor = Math.max(cursor, end + 1);
    if (cursor > target[1]) return true;
  }
  return cursor > target[1];
}
