/** 校对线共享类型与跨运行时常量（单一来源），供 normalize / session / report / accumulate 共用。 */

/** 六维评分维度（格式为独立维度） */
export type ProofreadMetric =
  'fluency' | 'conciseness' | 'accuracy' | 'consistency' | 'completeness' | 'format';

/** 六维的**唯一顺序与中文标签来源**：统计/评分/展示全部由本表派生（新增维度只改一处）。 */
export const PROOFREAD_METRICS: ReadonlyArray<{ key: ProofreadMetric; label: string }> = [
  { key: 'fluency', label: '流畅度' },
  { key: 'conciseness', label: '简洁度' },
  { key: 'accuracy', label: '准确性' },
  { key: 'consistency', label: '一致性' },
  { key: 'completeness', label: '完整度' },
  { key: 'format', label: '格式' },
];

/** 位置字段所处的坐标系（唯一取值；`unknown` 仅用于「来源不明」）。 */
export type OffsetSpace = 'document-absolute' | 'unknown';

/** 按偏移读取的文档文本切片 —— 位置字段的**唯一类型化契约**：
 * `getDocumentTextByRange.start_offset` / `proofreadBasic.start_offset` / 本类型的 `baseOffset`
 * 三处**必须同一个数**。不变式：`original === text.slice(offset, offset+length)` 且
 * `original.length === length`（UTF-16 code unit，**非** cleaned 坐标）。 */
export interface DocumentTextSlice {
  /** 该切片在**文档原文**中的起始绝对偏移；相对偏移在此**加一次**即绝对偏移 */
  baseOffset: number;
  /** 该切片的原始文本（含控制字符，未被清理） */
  text: string;
  /** 本切片各字段所处的坐标系（生产方声明，消费方据此决定是否可直接使用） */
  offsetSpace: OffsetSpace;
}

// ── 坐标层契约：定义与铁律的唯一来源是 `./coordinate-layers`（单列模块）；
// 此处只 re-export，使既有消费方仍可从本文件导入，不产生第二份定义。
export * from './coordinate-layers';

/** 文档信息 */
export interface DocInfo { fileName: string; filePath: string; totalParagraphs: number; totalWords: number; }

/** 校对问题条目 */
export interface ProofreadIssueEntry {
  /** 文档绝对偏移（可选：AI 层漏传时展示层降级为「位置未知」，不用 offset_in_paragraph 冒充） */
  offset?: number;
  /** 原文坐标系（UTF-16 code unit）下的区间长度。契约：`original.length === length` 且
   * `text.slice(offset, offset + length) === original`。**不是** cleaned 坐标系的词长。 */
  length: number;
  /** 原文切片：与 `offset`/`length` 同坐标系，**允许含控制字符**（AI 应按绝对偏移换算改写，勿做字面量全文匹配） */
  original: string;
  suggestion: string; type: string; context: string;
  source: 'mcp' | 'ai';
  paragraphIndex?: number; reason?: string;
  /** 修复动作：`fix` = 已实际修复（替换/删除落盘）；`report_only` = 仅报告未修复（误报回避 / 替换失败）。
   * 缺省（AI 漏传）视为 `fix`——保守语义，不因缺字段把「已修」误判成「未修」。报告门禁以此判定可否显示「全部已修复 ✅」。 */
  fix_action?: 'fix' | 'report_only';
  /** `fix_action` 是否为**服务端推断**：`true` = 调用方未传（或传未知值）而兜底为 `fix`；缺省 = 显式声明。
   * 用途：报告不得把「推断出的已修」当成「核实过的已修」——存在推断条目时须附加口径说明。 */
  fix_action_inferred?: boolean;
}

/** 会话数据 */
export interface SessionData {
  issues: ProofreadIssueEntry[];
  docInfo: DocInfo;
  createdAt: string;
  totalRevisions?: number;
  /** 疑似问题：AI 识别但未确认的问题，报告单独列出「待确认」 */
  suspectedIssues?: ProofreadIssueEntry[];
  /** 报告已交付（#420 CR-420-2）：不立即回收（保住方案 B 后重试），回收改由下次 accumulate 重开承担。 */
  reported?: boolean;
  /** 校对进度：服务端追踪实际覆盖进度，用于 `generateProofreadReport` 的硬性完整性门禁
   * （`processedToParagraph < docInfo.totalParagraphs` 即拒绝生成报告，防「中途结束就假装完成」）。
   * 由 `proofreadAccumulate` 每次上报 `_processed_to_paragraph` 增量更新（取各批最大值）。 */
  progress?: {
    /** 已校对到的最末段落索引（含），1 起 */
    processedToParagraph: number;
    /** 文档总段数（与 docInfo.totalParagraphs 一致，冗余便于校验） */
    totalParagraphs: number;
    /** 是否已覆盖全文（processedToParagraph >= totalParagraphs） */
    allBatchesComplete?: boolean;
    /** 每次上报的进度轨迹（去重升序）：供门禁校验「区间无缺口覆盖全文」——
     * 仅查最终值 >= total 无法发现 700→1600 跳号假进度。 */
    history?: number[];
  };
  /** 跳过范围披露：表格密集区「整块跳过」的累计记录。
   * 语义边界（须与 `progress` 分开理解）：`progress` = **覆盖进度**（跳过段仍计入覆盖）；
   * 本字段 = **内容判定**（这些段未逐段走校对链）。「覆盖 ✅」≠「逐段校对 ✅」——
   * 报告须以独立字段如实披露跳过范围，不得静默吞掉。
   * 由 `proofreadAccumulate` 每次上报 `skipped_segments` 增量累加（服务端字段，非 AI 口头声明）。 */
  skippedSegments?: SkippedSegmentsSummary;
  /** Layer 2（AI 语义）逐批申报产出（Issue #382 C2）：把「必须调用 confirmBatchAiProofread」升级为
   * 「必须产出可核对」——report 据此披露逐批明细，并标出「申报 0 条但 Layer 1 命中 >0」的批次
   * （#382 症状：报告「AI 智能校对 0 处」与「AI 其实看出了病句」并存）。服务端字段，非 AI 口头声明。 */
  layer2Batches?: Layer2BatchDeclaration[];
}

/** 单批 Layer 2 申报：`aiCount` = AI 申报的语义 issue 数；`layer1Count` = 该批 Layer 1（正则）
 * 实测条数（服务端捕获，AI 不可伪造）；缺省 = 未捕获。 */
export interface Layer2BatchDeclaration {
  aiCount: number;
  layer1Count?: number;
}

/** 单次「整块跳过」记录：一批被判定为表格密集非正文段的区间 */
export interface SkippedSegmentEntry {
  /** 跳过段数（本批） */
  count: number;
  /** 跳过段落的闭区间列表 `[[start, end], ...]`（1 起，含端点） */
  ranges: Array<[number, number]>;
  /** 可选：判定依据说明（如「全为表格单元格且无正文叙述句」） */
  reason?: string;
}

/** 跳过范围累计汇总 */
export interface SkippedSegmentsSummary {
  /** 累计跳过段数 */
  totalCount: number;
  /** 累计跳过区间列表 */
  ranges: Array<[number, number]>;
  /** 逐批跳过明细（可审计） */
  entries: SkippedSegmentEntry[];
}

/** 单批段落上限 —— 跨运行时**唯一**批次大小来源（Issue #352 D：原 proofread-store.ts 并入本文件）。 */
export const PROOFREAD_BATCH_MAX = 200;

/** 校对规则类型契约（Issue #401 R4：由 `proofread-rule-types.ts` 并入 —— 单类型模块属过度切分）。 */
export type Rule = {
  pattern: RegExp;
  type: string;
  metric?: 'fluency' | 'conciseness';
  getSuggestion: (match: string) => string;
  /** 左边界守卫（西文词边界，显式校验替代 lookbehind —— `exec` 可从任意位置起匹配，检视到非 CJK 字符时约束失效）。 */
  isWesternSegment?: (match: RegExpExecArray, text: string) => boolean;
  /** 右边界守卫（匹配项**右侧**合法语境，如「变的/做的」同形异义），与 isWesternSegment 互补。 */
  isRightBoundaryOk?: (match: RegExpExecArray, text: string) => boolean;
  /** 归一化与上下文裁决：扩边界取上下文后①把「仅用于取上下文」字符从 original 剔回（只允许**尾部修剪**，offset 不变）；②不成立返回 null。⚠️ 归一化后 `m.index+m[0].length` **不再指向真实右邻**。 */
  normalizeMatch?: (match: RegExpExecArray, text: string) => string | null;
  /** 可选规则组（Issue #352 A）：风格偏好类误报率高，默认不启用；需 `includeOptional` opt-in（当前无用户可达路径）。 */
  optionalGroup?: true;
};
