/**
 * Input: 校对会话数据（sessionIssues Map + docInfo）
 * Output: 五维校对报告
 * Pos: 校对报告生成模块。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * 五维校对报告模块 — B' 方案（2 工具 MCP 累加器）
 *
 * 包含：
 * - wps_word_proofread_accumulate: 累加校对问题到会话
 * - wps_word_generate_proofread_report: 生成五维校对报告
 *
 * ⚠️ 重要：这两个工具是 GATEWAY_ONLY（网关专用）——定义在 allTools 中
 * 仅用于 gateway HANDLER_MAP 路由映射（gateway/index.ts 遍历 allTools 建索引），
 * 并不直连注册为 MCP 工具。唯一入口是 wps_office_execute 网关
 * （COM_ACTIONS 索引：proofreadAccumulate / generateProofreadReport）。
 * 结构性防护见 ToolRegistry.GATEWAY_ONLY_TOOLS 黑名单；请勿误删本模块的
 * proofreadReportTools 导出，否则网关路由会失效。
 *
 * 五维评分维度：
 * - fluency（流畅度）: 成分完整、语句通顺
 * - conciseness（简洁度）: 无冗余、不啰嗦
 * - accuracy（准确性）: 事实/术语/数据准确
 * - consistency（一致性）: 格式规范、用语一致（含 standardization）
 * - completeness（完整度）: 无占位文本、内容完整
 *
 * 评分量表：Layer 1 原始 [1, 5] → normalizeToTwoPointScale → [0, 2]
 * T2（#55）：
 * - proofreadAccumulate 对缺 type 的 issue 做兜底推断（normalizeIssueType → inferTypeFromContent），
 *   报告五维评分不再因 type=undefined/`'ai'` 全部落入"未分类"而失真
 * - 报告对"未分类"降级处理并提示（不计入五维评分）
 * - TC-12 口径：报告明确"问题数 = 修订记录数 ÷ 2"（每次替换=删除+插入 2 条修订）；
 *   奇数修订（删除类修复只产生 1 条）时提示"换算不整除、请人工核对"
 * - 缺 source 的 issue 兜底推断（normalizeIssueSource，TC-13）：Layer 1 规则命中→mcp、
 *   F11–F15 AI 专属模式→ai、无法判断→保守 mcp；报告"未标注来源"统计不再失真
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ToolDefinition,
  ToolHandler,
  ToolCallResult,
  ToolCategory,
  RegisteredTool,
} from '../../types/tools';
import { validateFilePath, ALLOWED_WRITE_ROOTS } from '../../utils/path-safety';

// ==================== 类型定义 ====================

/** 五维评分维度 */
type ProofreadMetric = 'fluency' | 'conciseness' | 'accuracy' | 'consistency' | 'completeness';

/** 文档信息 */
interface DocInfo {
  fileName: string;
  filePath: string;
  totalParagraphs: number;
  totalWords: number;
}

/** 校对问题条目 */
interface ProofreadIssueEntry {
  offset: number;
  length: number;
  original: string;
  suggestion: string;
  type: string;
  context: string;
  source: 'mcp' | 'ai';
  paragraphIndex?: number;
  reason?: string;
}

/** 会话数据 */
interface SessionData {
  issues: ProofreadIssueEntry[];
  docInfo: DocInfo;
  createdAt: string;
  totalRevisions?: number;
}

// ==================== 会话 Map 与清理机制 ====================

/**
 * 会话 Map 上限（防止长时运行内存无限增长）
 * 达到上限后，淘汰最久未更新的会话（近似 LRU：按 sessionLastAccess 最后访问时间升序淘汰最旧）
 */
const SESSION_MAP_MAX_SIZE = 200;

/** 最近一次访问时间戳（用于 LRU 淘汰） */
const sessionLastAccess = new Map<string, number>();

/** 淘汰最久未访问的会话（超过上限时） */
function enforceSessionLimit(): void {
  if (sessionIssues.size <= SESSION_MAP_MAX_SIZE) return;
  // 按最后访问时间升序（最旧优先），逐出超限部分
  const evictable = Array.from(sessionLastAccess.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, sessionIssues.size - SESSION_MAP_MAX_SIZE);
  for (const [sid] of evictable) {
    sessionIssues.delete(sid);
    sessionLastAccess.delete(sid);
  }
}

/** 触摸会话：刷新最后访问时间并执行上限淘汰 */
function touchSession(sessionId: string): void {
  sessionLastAccess.set(sessionId, Date.now());
  enforceSessionLimit();
}

/**
 * 报告生成后回收会话（报告是流程终点，问题数据已固化到报告文本）
 * 导出供测试使用
 */
export function releaseSession(sessionId: string): boolean {
  const removed = sessionIssues.delete(sessionId);
  sessionLastAccess.delete(sessionId);
  return removed;
}

// ==================== TYPE_METRIC_MAP ====================

/**
 * 问题类型 → 五维评分维度 映射表
 *
 * 设计文档 §3.1：
 * - `standardization`（规范性）维度在 Layer 1 实现中合并入 `consistency`（一致性）
 *   规范性问题本质上就是格式一致性，语义可接受。AI Layer 2 中仍独立存在。
 * - `completeness`（完整度）为新增维度，对应占位文本检测。
 */
const TYPE_METRIC_MAP: Record<string, ProofreadMetric> = {
  // ── 流畅度 (fluency) ──
  '句式杂糅': 'fluency',     // 新增：PR #37 Layer 1 规则（通顺）
  '的得混淆': 'fluency',
  '的地混淆': 'fluency',
  '在再混淆': 'fluency',
  '即既混淆': 'fluency',
  '常见错别字': 'fluency',
  '口语化': 'fluency',
  '量词搭配': 'fluency',
  '少字': 'fluency',          // ✅ 缺字 → 成分残缺 → 通顺度（架构评审修正）
  // ── 流畅度（AI Layer 2 常用类型，T2/T3：#55 F11–F15）──
  '动宾不当': 'fluency',      // F12 加强重视安全问题
  '语义重复': 'fluency',      // F13 显著的进步提高
  '修饰不当': 'fluency',      // F14 很多丰富的内容
  '搭配冗余': 'fluency',      // F15 具有着深远的意义
  '冗余+搭配': 'fluency',     // F11 存在着很多不足之处
  '冗余搭配': 'fluency',
  '语序不当': 'fluency',
  '成分残缺': 'fluency',
  '句式混乱': 'fluency',
  '关联词失配': 'fluency',
  '指代不明': 'fluency',
  '逻辑矛盾': 'fluency',
  '语病': 'fluency',
  '搭配不当': 'fluency',
  '成分赘余': 'conciseness',  // 语义重复/赘余 → 简洁度
  '重复表达': 'conciseness',

  // ── 简洁度 (conciseness) ──
  '冗余词': 'conciseness',     // 新增：PR #37 Layer 1 规则（简洁）
  '重复字符': 'conciseness',
  '重复标点': 'conciseness',
  '句式冗余': 'conciseness',
  '多字': 'conciseness',
  '多余点号': 'conciseness',

  // ── 准确性 (accuracy) ──
  '法律术语': 'accuracy',
  '工程术语': 'accuracy',

  // ── 一致性 (consistency，含原 standardization) ──
  '中英混排': 'consistency',
  '数字空格': 'consistency',
  '中文标点': 'consistency',
  '用词统一': 'consistency',
  '异常空格': 'consistency',

  // ── 完整度 (completeness) ──
  '占位文本': 'completeness',
};

// ==================== F14 修饰不当模式（评审修正 #70） ====================

/**
 * F14 修饰不当（AI Layer 2）的判定模式。
 *
 * ⚠️ 评审修正：原模式 `(很多|许多|大量|丰富).{0,6}(内容|经验|知识)` 会把
 * "丰富的经验"（丰富直接修饰经验，正常搭配）误判为修饰不当（aiOnlyPattern
 * 也会因此把正常表达兜底归为 ai，来源失真反向复现）。F14 的本质是**数量词
 * 修饰"丰富/充分"**造成语义重复（如"很多丰富的内容"→"很多内容"），
 * 故需数量词与 丰富/充分 同时出现才命中。
 *
 * 统一供 inferIssueType / inferTypeFromContent / normalizeIssueSource 三处复用，
 * 避免规则漂移（评审建议 5）。
 */
export const F14_MODIFIER_PATTERN = new RegExp(
  '(很多|许多|大量|丰富)(的)?(丰富|充分)(的)?(内容|经验|知识)'
);

/**
 * AI 专属模式（F11–F15）判定正则，统一供 normalizeIssueSource 使用。
 *
 * 评审建议（#70 第 4 轮）：原先在 normalizeIssueSource 函数体内用
 * `new RegExp(...)` 每条重建一次实例（issues.map() 遍历时反复分配），
 * 与已提为模块级的 F14_MODIFIER_PATTERN 不对称。提取为模块级常量后
 * 只构建一次，且与 F14_MODIFIER_PATTERN 保持引用关系，杜绝规则漂移。
 */
export const AI_ONLY_PATTERN = new RegExp(
  `存在着|具有着|加强重视|(进步|提升|提高)(提高|进步)|${F14_MODIFIER_PATTERN.source}`
);

// ==================== type 兜底推断（T2，#55） ====================

/**
 * 对缺 type / type 异常的 issue 做兜底推断，保证五维评分有真实统计来源。
 *
 * 背景（#55 P0-2）：AI 层累加时若未携带 type（或旧代码把 AI issue 的
 * type 覆盖为 'ai'），TYPE_METRIC_MAP 查不到 → 全部落入"未分类"兜底，
 * 导致报告五维全 10.0/10、问题类型全 undefined、统计"正则 0 处 + AI 0 处"。
 *
 * 推断优先级：
 * 1. type 已有且非 'ai'/undefined → 直接返回
 * 2. 按 suggestion/original 文本规则映射（与 proofread.ts 规则同源）
 * 3. 仍无法推断 → 返回 '未分类'（报告降级提示，不计入五维评分）
 *
 * ⚠️ 评审建议（#70 第 4 轮）：生产累加路径已改走 normalizeIssueType →
 * inferTypeFromContent（#55 T2 重构），本函数在当前生产代码中已无调用点，
 * 保留仅供测试与向后兼容（历史 SKILL 合并产物 type='ai' 的兜底口径相同）。
 */
export function inferIssueType(issue: { type?: string; original?: string; suggestion?: string }): string {
  const rawType = issue.type;
  // 有效 type 直接使用（排除 'ai' 占位值与空值）
  if (rawType && rawType !== 'ai' && rawType !== '未分类') return rawType;

  const original = (issue.original || '').trim();
  const suggestion = (issue.suggestion || '').trim();
  const text = `${original} ${suggestion}`;

  // ── 冗余词（conciseness）──
  if (/进行(了)?|作出(了)?|予以(了)?|加以(了)?|针对.*这一问题/.test(text)) {
    return '冗余词';
  }
  // ── 句式杂糅（fluency）──
  if (/通过.*?(使|让|令)/.test(original)) return '句式杂糅';
  if (/根据.*?(显示|表明|证实)/.test(original)) return '句式杂糅';
  if (/由于.*?的原因(导致|使|造成)/.test(original)) return '句式杂糅';
  // ── F11–F15 典型模式（AI Layer 2，fluency）──
  if (/存在着|具有着/.test(original)) return '搭配冗余';      // F11/F15
  if (/加强重视/.test(original)) return '动宾不当';            // F12
  if (/(进步|提升|提高)(提高|进步)/.test(original)) return '语义重复'; // F13
  // F14（评审修正：需数量词+丰富/充分 同时出现，避免"丰富的经验"误判）
  if (F14_MODIFIER_PATTERN.test(original)) return '修饰不当';
  // ── 的得地 / 重复 / 标点（向后兼容旧规则）──
  if (/(的的|的地|得的|变的|做的)/.test(original)) return '的得混淆';
  if (/([\u4e00-\u9fff])\1{2,}/.test(original)) return '重复字符';
  if (/([，。；：、！？]){2,}/.test(original)) return '重复标点';
  // ── 占位文本（completeness）──
  if (/xxx|xx公司|test|sample|placeholder|lorem ipsum/i.test(text)) return '占位文本';

  return '未分类';
}

// ==================== 权重公式 ====================

/**
 * 五维评分原始分计算（1-5 量表）
 *
 * - fluency: 5 - count×0.2，下限 0（count≥25 时得 0 分，触发修复）
 * - conciseness: 5 - count×0.3
 * - accuracy: 5 - count×1.0（术语错误权重最高，5 个即 0 分）
 * - consistency: 5 - count×0.1（格式问题权重最低）
 * - completeness: 有占位文本 → 直接得 0（blocker 级，触发修复）
 *
 * 返回值: [1, 5] 范围内的原始分（completeness 可能为 0）
 */
const METRIC_WEIGHT_FORMULA: Record<
  ProofreadMetric,
  (count: number, hasPlaceholder?: boolean) => number
> = {
  fluency: (c) => Math.max(0, 5 - c * 0.2),       // 下限 0（修正）
  conciseness: (c) => Math.max(0, 5 - c * 0.3),
  accuracy: (c) => Math.max(0, 5 - c * 1.0),
  consistency: (c) => Math.max(0, 5 - c * 0.1),
  completeness: (_c, hasPlaceholder) => (hasPlaceholder ? 0 : 5),
};

// ==================== 归一化函数 ====================

/**
 * 将 Layer 1 原始分（1-5 量表）归一化到 [0, 2] 区间
 *
 * 公式: normalized = (rawScore - 1) / 2
 * - rawScore=5 → 2.0
 * - rawScore=3 → 1.0
 * - rawScore=1 → 0.0
 * - rawScore=0 → 0.0（completeness 的 blocker 场景）
 *
 * 归一化后与 AI Layer 2 的 0/1/2 三级评分在同一空间，
 * 报告渲染时统一 ×5 得到 X.X/10 展示。
 */
function normalizeToTwoPointScale(rawScore: number): number {
  return Math.max(0, Math.min(2, (rawScore - 1) / 2));
}

// ==================== 会话管理 ====================

/**
 * 会话问题存储（与 governance.js 的 sessions Map 完全解耦）
 *
 * 两个进程、两个内存空间、两个 Map：
 * - governance.js sessions: 管理分批校对流程状态（lastBatchParaIndex, batchStarted 等）
 * - 本 Map: 管理校对问题的累加与报告生成（issues + docInfo）
 *
 * Key: AI 生成的 session_id（UUID v4）
 * Value: SessionData（issues 数组 + docInfo）
 */
const sessionIssues = new Map<string, SessionData>();

/** 导出供测试使用 */
export { sessionIssues };

// ==================== 兜底类型推断（#55 T2） ====================

/**
 * 从 original/suggestion 内容推断问题类型（用于缺 type 的 issue 兜底）
 * 规则与 proofread.ts rules 的典型模式保持同步，按优先级匹配
 */
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
    [/存在着|具有着/, '搭配冗余'],      // F11/F15
    [/加强重视/, '动宾不当'],            // F12
    [/(进步|提升|提高)(提高|进步)/, '语义重复'], // F13
    // F14（评审修正：数量词+丰富/充分，避免"丰富的经验"误判）
    [F14_MODIFIER_PATTERN, '修饰不当'],
    // ── 其他 ──
    [/签定(合同|协议|合约|约定)/, '法律术语'],
    [/其它(人|事|物|方面|单位|情况|问题)/, '用词统一'],
    [/(?:check|test|sample|todo|fixme|lorem ipsum)/i, '占位文本'],
    [/xxx|xxx有限公司/, '占位文本'],
  ];

  for (const [re, type] of patterns) {
    if (re.test(original)) return type;
  }
  // 原文无法匹配时，尝试从建议文本推断
  if (suggestion) {
    for (const [re, type] of patterns) {
      if (re.test(suggestion)) return type;
    }
  }
  return undefined;
}

/**
 * 规整 issue.type：缺 type / 空 type / type='ai'（SKILL 合并 bug 产物）→ 兜底推断；
 * 仍无法推断 → '未分类'（报告降级处理，不计入五维评分）
 *
 * 评审建议（与 normalizeIssueSource 对称）：有效 type 一律 trim 后返回归一化值，
 * 避免带前后空格的 type（如 ' 的得混淆 '）在 TYPE_METRIC_MAP 严格查表时落入
 * "未分类"（metricForIssue 用 === 查表，不做 trim），与 TC-13 来源失真同源。
 */
export function normalizeIssueType(issue: ProofreadIssueEntry): ProofreadIssueEntry {
  const rawType = typeof issue.type === 'string' ? issue.type.trim() : '';
  if (rawType && rawType !== 'ai' && rawType !== '未分类') {
    // 返回 trim 后的归一化 type（原引用可能带前后空格，报告 TYPE_METRIC_MAP 查表会漏）
    return { ...issue, type: rawType };
  }
  const inferred = inferTypeFromContent(issue.original || '', issue.suggestion || '');
  return { ...issue, type: inferred || '未分类' };
}

/**
 * 规整 issue.source：缺 source / 非法值 → 兜底推断（TC-13，验收遗留）
 *
 * 背景：第三轮会话 proofreadAccumulate 的 issues 未携带 source，报告统计摘要
 * 出现"⚠️ 未标注来源 30 处"（TC-13 来源统计失真）。SKILL 已要求 AI 层输出
 * source（mcp/ai），但代码侧缺少兜底，AI 漏传时报告仍失真。
 *
 * 兜底策略（保守、可追溯，评审建议：严格按注释实现两层判断，
 * 避免"非 AI 专属模式 → 全部 mcp"导致 AI 漏传 source 的非 F11–F15 问题
 * （如口语化/语序不当）被误计为 MCP，TC-13 来源失真在反方向复现）：
 * 1. source 已是 'mcp' / 'ai' → 直接返回（大小写归一化为小写）
 * 2. 命中 F11–F15 AI 专属模式（搭配冗余/动宾不当/语义重复/修饰不当）→ 'ai'
 * 3. 命中 Layer 1 规则（inferTypeFromContent 返回具体类型）→ 'mcp'
 * 4. 仍无法判断 → 保守 'mcp'（Layer 1 规则引擎命中优先，AI 补充场景由 SKILL 约束）
 */
export function normalizeIssueSource(issue: ProofreadIssueEntry): ProofreadIssueEntry {
  const rawSource = typeof issue.source === 'string' ? issue.source.trim().toLowerCase() : '';
  if (rawSource === 'mcp' || rawSource === 'ai') {
    // 评审建议：大小写变体（如 'MCP'/'AI'）虽宽容通过校验，但报告统计用严格 === 判断，
    // 直接返回原引用会导致大小写不一致时仍落入"未标注来源"（TC-13 失真复现）。
    // 统一归一化为小写后再返回，彻底堵住漏网场景。
    return { ...issue, source: rawSource };
  }
  const original = issue.original || '';
  const suggestion = issue.suggestion || '';
  // 第 2 步：F11–F15 的 AI 专属搭配模式（搭配冗余/动宾不当/语义重复/修饰不当）
  // 这些模式 Layer 1 不检出（#25 语料标注 Layer 2 专属），兜底归为 ai。
  // 必须先于 Layer 1 判断：inferTypeFromContent 也能命中 F11–F15 模式（返回对应 type），
  // 若先走 Layer 1 会把 AI 专属问题误计为 mcp。
  const text = `${original} ${suggestion}`;
  if (AI_ONLY_PATTERN.test(text)) {
    return { ...issue, source: 'ai' };
  }
  // 第 3 步：Layer 1 规则命中（inferTypeFromContent 返回具体类型）→ mcp
  const inferred = inferTypeFromContent(original, suggestion);
  if (inferred) {
    return { ...issue, source: 'mcp' };
  }
  // 第 4 步：仍无法判断 → 保守 'mcp'（Layer 1 规则引擎命中优先，AI 补充场景由 SKILL 约束）
  return { ...issue, source: 'mcp' };
}

// ==================== 累加器工具 ====================

export const proofreadAccumulateDefinition: ToolDefinition = {
  name: 'wps_word_proofread_accumulate',
  description: `累加一批校对问题到指定会话。

在校对分批循环中，每批 proofreadBasic + AI 校对完成后，将合并去重后的 issues 和文档信息通过此工具存入会话 Map。
多批调用会追加（而非覆盖），最终由 wps_word_generate_proofread_report 统一生成五维评分报告。

使用场景：
- 每批校对完成后，将问题写入会话
- 首次调用需同时传入 doc_info

注意：
- session_id 由 AI 生成（UUID v4），需在整个校对流程中保持一致
- 重复调用会追加 issues（不会覆盖）`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: '校对会话ID（AI 生成的 UUID v4），整个校对流程保持一致',
      },
      issues: {
        type: 'array',
        description: '本批校对发现的问题列表（Layer 1 + Layer 2 合并去重后）',
        items: {
          type: 'object',
          properties: {
            offset: { type: 'number', description: '文档绝对偏移位置' },
            length: { type: 'number', description: '问题文本长度' },
            original: { type: 'string', description: '原文' },
            suggestion: { type: 'string', description: '建议修改' },
            type: { type: 'string', description: '问题类型（如 的得混淆/重复字符/口语化 等）' },
            context: { type: 'string', description: '上下文' },
            source: { type: 'string', description: '检测来源: mcp（Layer 1）或 ai（Layer 2）' },
            paragraphIndex: { type: 'number', description: '段落索引（可选，从 1 开始）' },
            reason: { type: 'string', description: 'AI 检测理由（仅 source=ai 时有效）' },
          },
        },
      },
      doc_info: {
        type: 'object',
        description: '文档信息（仅首次调用需要，后续调用可省略）',
        properties: {
          fileName: { type: 'string', description: '文档文件名' },
          filePath: { type: 'string', description: '文档完整路径' },
          totalParagraphs: { type: 'number', description: '文档总段数' },
          totalWords: { type: 'number', description: '文档总字数' },
        },
      },
      total_revisions: {
        type: 'number',
        description: '当前累计修订数（可选，用于报告统计）',
      },
    },
    required: ['session_id', 'issues'],
  },
};

export const proofreadAccumulateHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { session_id, issues, doc_info, total_revisions } = args as {
    session_id: string;
    issues?: ProofreadIssueEntry[];
    doc_info?: DocInfo;
    total_revisions?: number;
  };

  if (!session_id || typeof session_id !== 'string') {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: 'session_id 不能为空！' }],
      error: '缺少 session_id',
    };
  }

  if (!Array.isArray(issues)) {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: 'issues 必须是数组！' }],
      error: '参数格式错误',
    };
  }

  // 获取或创建会话
  let session = sessionIssues.get(session_id);
  if (!session) {
    if (!doc_info) {
      return {
        id: uuidv4(),
        success: false,
        content: [
          {
            type: 'text',
            text: '首次调用 wps_word_proofread_accumulate 必须提供 doc_info！',
          },
        ],
        error: '缺少 doc_info（首次调用）',
      };
    }
    session = {
      issues: [],
      docInfo: doc_info,
      createdAt: new Date().toISOString(),
    };
    sessionIssues.set(session_id, session);
  }
  // 刷新最后访问时间并执行上限淘汰
  touchSession(session_id);

  // 更新 docInfo（如果提供了新的）
  if (doc_info) {
    session.docInfo = doc_info;
  }

  // 更新修订数
  if (typeof total_revisions === 'number') {
    session.totalRevisions = total_revisions;
  }

  // 追加 issues（#55 T2：入口统一规整 type，缺 type / type='ai' 时兜底推断；
  // 验收遗留：缺 source 时同样兜底推断，避免报告"未标注来源"失真 TC-13）
  const normalizedIssues = issues.map((i) => normalizeIssueSource(normalizeIssueType(i)));
  const beforeCount = session.issues.length;
  session.issues.push(...normalizedIssues);

  // 去重（按 offset + original）
  const seen = new Set<string>();
  session.issues = session.issues.filter((entry) => {
    const key = `${entry.offset}|${entry.original}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const dedupedCount = beforeCount + issues.length - session.issues.length;

  return {
    id: uuidv4(),
    success: true,
    content: [
      {
        type: 'text',
        text:
          `已累加 ${issues.length} 条问题到会话 ${session_id}。\n` +
          `当前会话累计: ${session.issues.length} 条问题` +
          (dedupedCount > 0 ? `（去重 ${dedupedCount} 条）` : '') +
          '。',
      },
    ],
  };
};

// ==================== 报告辅助（T2/T3，#55） ====================

/**
 * 问题类型 → 五维评分维度（供报告分组使用，含兜底推断后的 type）
 */
function metricForIssue(issue: ProofreadIssueEntry): ProofreadMetric | null {
  return TYPE_METRIC_MAP[issue.type] ?? null;
}

// ==================== 报告生成工具 ====================

export const generateProofreadReportDefinition: ToolDefinition = {
  name: 'wps_word_generate_proofread_report',
  description: `生成五维校对报告。

从会话 Map 中读取所有累加的校对问题，按五维评分维度（fluency/conciseness/accuracy/consistency/completeness）生成结构化报告。
每个维度输出原始分（1-5）、归一化分（0-2）和 X.X/10 展示分。

使用场景：
- 所有批次校对完成后，生成最终校对报告
- 必须在使用 wps_word_proofread_accumulate 累加所有批次问题后调用

报告包含：
- 五维雷达图数据
- 每维度问题统计（数量、原始分、归一化分、10 分制分）
- 详细问题列表（按维度分组）`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      session_id: {
        type: 'string',
        description: '校对会话ID（与 wps_word_proofread_accumulate 中使用的一致）',
      },
      output_file: {
        type: 'string',
        description:
          '报告输出文件路径（可选）。如提供，报告将写入此 .md 文件；如不提供，仅返回报告文本。\n' +
          '注意：若写入失败（路径非法/无权限/磁盘满等），本工具返回 success=false 并携带失败原因，' +
          '会话保留供重试——**落盘失败不视为报告已生成**，AI 必须修复后重试或改用 writeFile 落盘。',
      },
    },
    required: ['session_id'],
  },
};

export const generateProofreadReportHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { session_id, output_file } = args as {
    session_id: string;
    output_file?: string;
  };

  if (!session_id || typeof session_id !== 'string') {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: 'session_id 不能为空！' }],
      error: '缺少 session_id',
    };
  }

  const session = sessionIssues.get(session_id);
  if (!session) {
    return {
      id: uuidv4(),
      success: false,
      content: [
        {
          type: 'text',
          text: `未找到会话 ${session_id}。请先使用 wps_word_proofread_accumulate 累加校对问题。`,
        },
      ],
      error: '会话不存在',
    };
  }

  const { issues, docInfo, createdAt, totalRevisions } = session;

  if (issues.length === 0) {
    const emptyReport = buildEmptyReport(docInfo, createdAt);
    let wroteFile = false;
    let writeError: string | undefined;
    if (output_file) {
      try {
        const safePath = validateFilePath(output_file, ALLOWED_WRITE_ROOTS);
        // 评审建议（#70 第 4 轮）：空报告分支补上与主分支一致的 mkdirSync 自动建父目录——
        // 同一 output_file 因问题数不同（0 vs >0）不应行为不一致：主分支会建目录，
        // 空报告分支此前直接 writeFileSync，目标父目录不存在时会失败（与其他分支口径不同）。
        const dir = path.dirname(safePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(safePath, emptyReport, 'utf-8');
        wroteFile = true;
      } catch (err) {
        // 评审建议：落盘失败必须向上游（AI 层）暴露明确信号，禁止静默吞错——
        // 否则 AI 误判"报告已生成"（用户多次遇到：落盘失败但提示已生成校对报告）。
        // 保留会话便于 AI 修正 output_file 后重试。
        writeError = err instanceof Error ? err.message : String(err);
      }
    }
    // 空报告同样回收会话——仅当写入成功（或未指定 output_file）时释放；写失败保留供重试
    if (!output_file || wroteFile) {
      releaseSession(session_id);
    }
    if (writeError) {
      // 评审建议：失败返回不内嵌完整报告全文（长文档时消耗大量 token），
      // 改为截断预览（前 1500 字）+ 报告总长度提示，AI 可修正路径后重试重新生成完整报告。
      const preview = emptyReport.length > 1500 ? emptyReport.slice(0, 1500) + '\n…(预览截断)' : emptyReport;
      return {
        id: uuidv4(),
        success: false,
        content: [
          {
            type: 'text',
            text:
              `⚠️ 校对报告已生成但**写入文件失败**，本次校对未完成落盘！\n\n` +
              `目标路径: ${output_file ?? '(未指定)'}\n` +
              `失败原因: ${writeError}\n\n` +
              `会话 ${session_id} 已保留，请修正路径后重新调用 generateProofreadReport（传 output_file）重试，` +
              `或改用 SKILL Step 3 的 writeFile 方案落盘。` +
              `报告全文 ${emptyReport.length} 字，本次仅返回预览：\n\n${preview}`,
          },
        ],
        error: `报告写入文件失败: ${writeError}`,
      };
    }
    return {
      id: uuidv4(),
      success: true,
      content: [{ type: 'text', text: emptyReport }],
    };
  }

  // 按维度统计
  const metricCounts: Record<ProofreadMetric, number> = {
    fluency: 0,
    conciseness: 0,
    accuracy: 0,
    consistency: 0,
    completeness: 0,
  };

  const metricIssues: Record<ProofreadMetric, ProofreadIssueEntry[]> = {
    fluency: [],
    conciseness: [],
    accuracy: [],
    consistency: [],
    completeness: [],
  };

  const unknownTypeIssues: ProofreadIssueEntry[] = [];

  for (const issue of issues) {
    const metric = metricForIssue(issue);
    if (metric) {
      metricCounts[metric]++;
      metricIssues[metric].push(issue);
    } else {
      unknownTypeIssues.push(issue);
    }
  }

  // 计算五维评分
  const hasPlaceholder = metricCounts.completeness > 0;

  interface MetricScore {
    count: number;
    rawScore: number;
    normalizedScore: number;
    displayScore: string;
  }

  const scores: Record<ProofreadMetric, MetricScore> = {} as Record<ProofreadMetric, MetricScore>;

  for (const metric of Object.keys(metricCounts) as ProofreadMetric[]) {
    const count = metricCounts[metric];
    const rawScore =
      metric === 'completeness'
        ? METRIC_WEIGHT_FORMULA[metric](count, hasPlaceholder)
        : METRIC_WEIGHT_FORMULA[metric](count);

    const normalizedScore =
      metric === 'completeness' && rawScore === 0
        ? 0 // completeness 的 blocker 场景：直接 0
        : normalizeToTwoPointScale(rawScore);

    scores[metric] = {
      count,
      rawScore,
      normalizedScore: Math.round(normalizedScore * 100) / 100,
      displayScore: (normalizedScore * 5).toFixed(1),
    };
  }

  // ═══════════════════════════════════════════
  // 构建报告
  // ═══════════════════════════════════════════

  const reportDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const metricLabels: Record<ProofreadMetric, string> = {
    fluency: '流畅度',
    conciseness: '简洁度',
    accuracy: '准确性',
    consistency: '一致性',
    completeness: '完整度',
  };

  const metricOrder: ProofreadMetric[] = [
    'fluency',
    'conciseness',
    'accuracy',
    'consistency',
    'completeness',
  ];

  let report = '';

  report += `# 校对报告\n\n`;
  report += `- **文档**: ${docInfo.fileName}\n`;
  report += `- **路径**: \`${docInfo.filePath}\`\n`;
  report += `- **校对时间**: ${reportDate}\n`;
  report += `- **总段数**: ${docInfo.totalParagraphs}\n`;
  report += `- **总字数**: ${docInfo.totalWords}\n`;
  if (totalRevisions !== undefined) {
    // TC-12 口径：WPS 修订模式下每次替换 = 1 次删除 + 1 次插入，即 2 条修订记录。
    // 报告「发现问题」与「修订总数」的换算口径：问题数 = 修订记录数 ÷ 2
    // ⚠️ 验收遗留：删除类修复（如“存在着→空”）只产生 1 条修订，修订数可能为奇数。
    // 此时 ÷2 换算不整除，需明示差异并提示人工核对，避免口径误判。
    const half = totalRevisions / 2;
    const isInteger = Number.isInteger(half);
    // 评审建议：奇数修订时显示 ≈31.5 而非向下取整的 31，避免与"不整除"提示并存造成误导
    const halfDisplay = isInteger ? String(half) : `≈${half.toFixed(1)}`;
    report += `- **修订总数**: ${totalRevisions}（TC-12 口径：问题数 = 修订记录数 ÷ 2 = ${halfDisplay}`;
    report += isInteger
      ? `，每次替换产生删除+插入 2 条修订）\n`
      : `；⚠️ 修订数为奇数（删除类修复只产生 1 条修订），换算不整除，请人工核对修订记录与问题清单是否一一对应）\n`;
    report += `- **发现问题**: ${issues.length} 处（问题数按 issue 条数计；` +
      (isInteger
        ? `若开启修订模式，等价于修订记录数 ÷ 2）\n`
        : `⚠️ 修订数为奇数时不等价于 ÷2，请人工核对）\n`);
  } else {
    report += `- **发现问题**: ${issues.length} 处（问题数按 issue 条数计）\n`;
  }
  if (unknownTypeIssues.length > 0) {
    report += `- **⚠️ 未分类问题**: ${unknownTypeIssues.length} 处（未计入五维评分，见下方"未分类问题"节；请检查 AI 层是否输出 type 字段）\n`;
  }
  report += `\n`;

  // 五维评分摘要
  report += `## 五维评分\n\n`;
  report += `| 维度 | 问题数 | 原始分 (1-5) | 归一化 (0-2) | 得分 (X.X/10) |\n`;
  report += `|------|--------|-------------|-------------|---------------|\n`;

  for (const metric of metricOrder) {
    const s = scores[metric];
    const label = metricLabels[metric];
    report += `| ${label} (${metric}) | ${s.count} | ${s.rawScore.toFixed(1)} | ${s.normalizedScore.toFixed(2)} | ${s.displayScore}/10 |\n`;
  }

  report += `\n`;

  // 雷达图数据（JSON 格式，方便前端渲染）
  report += `## 雷达图数据\n\n`;
  report += `\`\`\`json\n`;
  report += JSON.stringify(
    {
      metrics: metricOrder.map((m) => ({
        name: metricLabels[m],
        key: m,
        count: scores[m].count,
        raw: scores[m].rawScore,
        normalized: scores[m].normalizedScore,
        display: scores[m].displayScore,
      })),
    },
    null,
    2
  );
  report += `\n\`\`\`\n\n`;

  // 按维度详细问题
  report += `## 问题详情\n\n`;

  for (const metric of metricOrder) {
    const metricIssuesList = metricIssues[metric];
    if (metricIssuesList.length === 0) continue;

    report += `### ${metricLabels[metric]} (${metric}) — ${metricIssuesList.length} 处\n\n`;

    report += `| # | 位置 | 原文 | 建议修改 | 类型 | 来源 |\n`;
    report += `|---|------|------|---------|------|------|\n`;

    metricIssuesList.forEach((issue, idx) => {
      const location = issue.paragraphIndex
        ? `段落 ${issue.paragraphIndex}`
        : `偏移 ${issue.offset}`;
      const escapedOriginal = issue.original.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const escapedSuggestion = issue.suggestion.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      report += `| ${idx + 1} | ${location} | ${escapedOriginal} | ${escapedSuggestion} | ${issue.type} | ${issue.source === 'ai' ? 'AI' : 'MCP'} |\n`;
    });

    report += `\n`;
  }

  // 未知类型问题（兜底）— T2：降级提示，不重复计入五维（metricForIssue 返回 null 才入此列）
  if (unknownTypeIssues.length > 0) {
    report += `### ⚠️ 未分类问题（未计入五维评分） — ${unknownTypeIssues.length} 处\n\n`;
    // #55 T2：未分类问题不计入五维评分，提示补充 type 以便纳入统计
    report += `> **提示**：以下问题未携带有效的 type 字段（或 type 不在 TYPE_METRIC_MAP 映射表中），` +
      `无法归入五维评分。请检查 AI 层（Layer 2）输出是否携带正确的 type 字段，` +
      `或补充 TYPE_METRIC_MAP 映射。\n\n`;
    report += `| # | 位置 | 原文 | 建议修改 | 类型 | 来源 |\n`;
    report += `|---|------|------|---------|------|------|\n`;
    unknownTypeIssues.forEach((issue, idx) => {
      const location = issue.paragraphIndex
        ? `段落 ${issue.paragraphIndex}`
        : `偏移 ${issue.offset}`;
      const escapedOriginal = issue.original.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const escapedSuggestion = issue.suggestion.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      report += `| ${idx + 1} | ${location} | ${escapedOriginal} | ${escapedSuggestion} | ${issue.type || '（空）'} | ${issue.source === 'ai' ? 'AI' : 'MCP'} |\n`;
    });
    report += `\n`;
  }

  // 统计摘要（T2，#55：source 缺失时单独列出，防止"正则 0 处 + AI 0 处"失真假象）
  report += `## 统计摘要\n\n`;
  const mcpCount = issues.filter((i) => i.source === 'mcp').length;
  const aiCount = issues.filter((i) => i.source === 'ai').length;
  const unknownSourceCount = issues.filter((i) => i.source !== 'mcp' && i.source !== 'ai').length;
  report += `| 来源 | 数量 |\n`;
  report += `|------|------|\n`;
  report += `| 正则基础校对 (MCP) | ${mcpCount} 处 |\n`;
  report += `| AI 智能校对 | ${aiCount} 处 |\n`;
  if (unknownSourceCount > 0) {
    report += `| ⚠️ 未标注来源 | ${unknownSourceCount} 处 |\n`;
  }
  report += `| **合计** | **${issues.length} 处** |\n`;
  report += `| 全部已修复 | ✅ |\n`;
  if (totalRevisions !== undefined) {
    const half = totalRevisions / 2;
    const isInteger = Number.isInteger(half);
    // 评审建议：奇数修订时显示 ≈31.5（与正文口径一致），不再向下取整
    const halfDisplay = isInteger ? String(half) : `≈${half.toFixed(1)}`;
    report += `\n> **TC-12 口径说明**：问题数 ${issues.length} 处对应修订记录数 ${totalRevisions} 条（每次替换 = 删除 + 插入各 1 条修订，即问题数 = 修订记录数 ÷ 2 = ${halfDisplay}）`;
    report += isInteger
      ? `。如不等，请检查是否有未跟踪修订的替换或人工修改。\n`
      : `。⚠️ 当前修订数为奇数（删除类修复只产生 1 条修订，如“存在着→空”），换算不整除，请人工核对修订记录与问题清单是否一一对应。\n`;
  }

  // 写入文件（如果指定）——仅当写入成功（或未指定 output_file）后才回收会话；
  // 写失败时保留会话，AI 可修正 output_file 后重试生成（评审建议：落盘失败必须向上游暴露信号，
  // 禁止静默吞错——否则 AI 误判"报告已生成"，用户多次遇到"落盘失败但提示已生成校对报告"）
  let wroteFile = false;
  let writeError: string | undefined;
  if (output_file) {
    try {
      const safePath = validateFilePath(output_file, ALLOWED_WRITE_ROOTS);
      const dir = path.dirname(safePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(safePath, report, 'utf-8');
      wroteFile = true;
    } catch (err) {
      writeError = err instanceof Error ? err.message : String(err);
    }
  }

  // 报告生成后回收会话，释放内存（报告文本已固化，会话数据不再需要）
  if (!output_file || wroteFile) {
    releaseSession(session_id);
  }

  if (writeError) {
    // 落盘失败：明确返回失败（success=false + error），AI 必须重试落盘才能进入 Step 4 收尾；
    // 会话已保留（未回收），可直接修正 output_file 后重新生成。
    // 评审建议：失败返回不内嵌完整报告全文（长文档时消耗大量 token），改为截断预览。
    const preview = report.length > 1500 ? report.slice(0, 1500) + '\n…(预览截断)' : report;
    return {
      id: uuidv4(),
      success: false,
      content: [
        {
          type: 'text',
          text:
            `⚠️ 校对报告已生成但**写入文件失败**，本次校对未完成落盘！\n\n` +
            `目标路径: ${output_file}\n` +
            `失败原因: ${writeError}\n\n` +
            `会话 ${session_id} 已保留，请修正路径后重新调用 generateProofreadReport（传 output_file）重试；` +
            `或改用 SKILL Step 3 的 writeFile 方案落盘。` +
            `报告全文 ${report.length} 字，本次仅返回预览：\n\n${preview}`,
        },
      ],
      error: `报告写入文件失败: ${writeError}`,
    };
  }

  return {
    id: uuidv4(),
    success: true,
    content: [{ type: 'text', text: report }],
  };
};

// ==================== 辅助函数 ====================

/**
 * 构建空报告（0 个问题时）
 */
function buildEmptyReport(docInfo: DocInfo, _createdAt: string): string {
  const reportDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return [
    `# 校对报告`,
    ``,
    `- **文档**: ${docInfo.fileName}`,
    `- **路径**: \`${docInfo.filePath}\``,
    `- **校对时间**: ${reportDate}`,
    `- **总段数**: ${docInfo.totalParagraphs}`,
    `- **总字数**: ${docInfo.totalWords}`,
    `- **发现问题**: 0 处`,
    ``,
    `## 五维评分`,
    ``,
    `| 维度 | 问题数 | 原始分 (1-5) | 归一化 (0-2) | 得分 (X.X/10) |`,
    `|------|--------|-------------|-------------|---------------|`,
    `| 流畅度 (fluency) | 0 | 5.0 | 2.00 | 10.0/10 |`,
    `| 简洁度 (conciseness) | 0 | 5.0 | 2.00 | 10.0/10 |`,
    `| 准确性 (accuracy) | 0 | 5.0 | 2.00 | 10.0/10 |`,
    `| 一致性 (consistency) | 0 | 5.0 | 2.00 | 10.0/10 |`,
    `| 完整度 (completeness) | 0 | 5.0 | 2.00 | 10.0/10 |`,
    ``,
    `✅ 文档质量优秀，未发现任何问题。`,
  ].join('\n');
}

// ==================== 导出 ====================

export const proofreadReportTools: RegisteredTool[] = [
  { definition: proofreadAccumulateDefinition, handler: proofreadAccumulateHandler },
  { definition: generateProofreadReportDefinition, handler: generateProofreadReportHandler },
];

export default proofreadReportTools;
