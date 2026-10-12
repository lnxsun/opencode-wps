/**
 * Input: 生产 `proofread-types.ts` 的 `DocumentTextSlice`/`OffsetSpace`（**类型 re-export**，
 *        不 import 生产**实现**）+ 判据函数的调用方传入值
 * Output: 坐标契约的**判据唯一实现**（正判据 + 真实链路探测）——类型本身**不在本文件声明**
 * Pos: 「校对文本位置 = 文档原文 UTF-16 code unit 绝对偏移」这一不变量的**判据唯一出口**
 *      （**类型**的唯一出口是 `wps-office-mcp/src/tools/word/proofread-types.ts`，见 D2）。
 *
 * 为什么存在（Issue #325 · 坐标系归一 · 段 1）：
 *   现状是「同一个 offset 数字，生产方按『本批文本相对偏移』写、消费方按『文档绝对偏移』读」，
 *   而中间没有任何断言 —— 漏传 `start_offset` 时 `runBasicProofreading` 静默把相对偏移
 *   当绝对偏移输出，**不会报错，只会静默算错位置/去重键**。
 *   本文件把该不变量的**正判据**（isDocumentAbsoluteSlice）与**真实链路探测**
 *   （probeBasicProofreadOffsetSpace）放在一处：段 2 的守卫、段 3 的归一都必须调用这里，
 *   **不得在各自文件里再写一套判据**（否则就是本 Issue 要治的「同一语义多源」）。
 *
 * 段 2 变更（Issue #325）：`getDocumentTextByRange` 的**信号行已回填** `baseOffset`
 *   （= 真实返回的 `startOffset`，唯一实现见 `range-signal.ts` renderRangeText），
 *   `proofreadBasicHandler` 亦已对缺 `start_offset` **硬报错**（D1）。
 *   故本文件的 `probeBasicProofreadOffsetSpace` 现在的语义是「**探测引擎缺省语义**」
 *   （缺省 ⇒ 相对坐标系），供回归断言固化 —— 不再用于证明缺陷。
 */

// 契约类型**不在本文件声明**（Issue #325 段 2 · D2）：唯一声明处是生产
// `wps-office-mcp/src/tools/word/proofread-types.ts`。本文件只做 re-export，
// 使「同一语义两处声明」在类型层面也不成立（本文件**不得**再出现 `interface DocumentTextSlice`；
// 该约束现由 TypeScript 的 re-export 形态本身保证 —— 原先另有一个「只查名字」的轴 K 脚本，
// 已随 Issue #325 第二刀删除，不再保留无执行者的假口径）。
export type { OffsetSpace, DocumentTextSlice } from '../../tools/word/proofread-types';

// L2（段落索引）契约同样**只在此 re-export**（不得二次声明 `interface ParagraphRange`）；
// 品牌类型 `ParagraphIndex` / `DocumentAbsoluteOffset` 亦由生产单源定义。
export type {
  DocumentAbsoluteOffset,
  ParagraphIndex,
  ParagraphRange,
} from '../../tools/word/coordinate-layers';
export { asDocumentAbsoluteOffset, asParagraphIndex } from '../../tools/word/coordinate-layers';

/** 命中项位置字段的**最小**可判定形态（不绑定任何生产类型，避免契约与实现耦合） */
export interface OffsetCarrier {
  offset: number;
  length: number;
  original: string;
}

/**
 * 正判据（**唯一实现**）：命中项是否落在「文档原文绝对偏移」坐标系。
 *
 * @param docText 整篇文档原文（切成片段校验时传**对应该绝对偏移的那份原文**）
 * @param carrier 命中项（`offset`/`length`/`original`）
 */
export function isDocumentAbsoluteSlice(docText: string, carrier: OffsetCarrier): boolean {
  if (carrier.offset < 0) return false;
  if (carrier.length !== carrier.original.length) return false;
  if (carrier.offset + carrier.length > docText.length) return false;
  return docText.slice(carrier.offset, carrier.offset + carrier.length) === carrier.original;
}

/**
 * 只读探测「`runBasicProofreading` 产出的 offset 落在哪个坐标系」——按**真实行为**判定。
 *
 * 不做任何桩注入、不改生产代码：用一段**前导正文 + 目标片段**的整篇文本，
 * 调 `runBasicProofreading(segment)`）后校验**整篇**原文切片。
 *
 * 注意（段 2 起）：这条链路**已不再可达**于工具层 —— `proofreadBasicHandler` 缺
 * `start_offset` 会**硬报错**（D1），故本探测只用于固化**引擎自身的缺省语义**
 * （缺省 ⇒ 相对坐标系），它是「handler 必须显式声明坐标系」这条约束的**成因**。
 */
export function probeBasicProofreadOffsetSpace(
  run: (text: string, baseOffset?: number) => OffsetCarrier[],
  leadText: string,
  segmentText: string
): {
  segmentStart: number;
  /** 缺省 baseOffset 时，命中项的 offset 能否按「文档绝对偏移」解释整篇原文 */
  missingBaseOffsetIsDocumentAbsolute: boolean;
  /** 显式传 baseOffset = segmentStart 时，命中项能否按「文档绝对偏移」解释整篇原文 */
  explicitBaseOffsetIsDocumentAbsolute: boolean;
  /** 缺省 baseOffset 时实测到的首个 offset（用于报告，不参与判定） */
  observedOffset: number | null;
} {
  const wholeText = leadText + segmentText;
  const segmentStart = leadText.length;

  const missing = run(segmentText)[0] ?? null;
  const explicit = run(segmentText, segmentStart)[0] ?? null;

  return {
    segmentStart,
    missingBaseOffsetIsDocumentAbsolute:
      missing !== null && isDocumentAbsoluteSlice(wholeText, missing),
    explicitBaseOffsetIsDocumentAbsolute:
      explicit !== null && isDocumentAbsoluteSlice(wholeText, explicit),
    observedOffset: missing === null ? null : missing.offset,
  };
}
