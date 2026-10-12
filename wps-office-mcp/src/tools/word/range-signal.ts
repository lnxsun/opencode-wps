/**
 * Input: getDocumentTextByRange / getDocumentParagraphs 的响应数据
 * Output: 「可读摘要 + 机器可读信号行」的统一渲染
 * Pos: 截断/区间信号的**唯一定义者**（Issue #314 QA-F1/QA-F3 单一来源）。
 *
 * 为什么必须单源（Issue #314 根因 A：文本真值无主）：
 *   截断信号此前只存在于 PS 数据层，TS handler 把它渲染成人类可读纯文本后
 *   信号即丢失 —— 治理层只能扫全文正则，而正则与真实形态永不匹配（假绿）。
 *   消费方（governance.js / AI）与生产方（handler）必须按**同一 JSON 契约**对接，
 *   故把「信号行长什么样」收在此处唯一实现，禁止任何调用方自建第二套形态。
 */

/** 信号行的唯一格式：`[README_SIGNAL {"key":"value"}]`（governance.parseReadmeSignal 按此解析） */
export const SIGNAL_LINE_RE = /\[README_SIGNAL (\{[^\n]*\})\]/;

/**
 * 渲染按偏移读取的区间文本响应。
 *
 * @param d PS 数据层返回的原始字段（**只透传，不重新推断截断** —— 避免同一语义两处口径）
 *
 * `baseOffset`（Issue #325 段 2）：本切片在**文档原文**中的起始绝对偏移，即消费方
 * 把「本段相对偏移」换算成文档绝对偏移时**只需加一次**的那个数。它是
 * `DocumentTextSlice` 契约（定义者见 `proofread-types.ts`）在信号行上的投影 ——
 * **与 `startOffset` 同值**，在此**回填**是为了让消费方（AI / 治理层）不必再自己
 * 从请求参数反推（它们只看到响应）。信号行格式仍由本函数唯一实现。
 */
export function renderRangeText(d: {
  text: string;
  startOffset: number;
  length: number;
  docLength: number;
  requestedLength?: number;
  clampedLength?: number;
  returnedLength?: number;
  truncated?: boolean;
  docEndReached?: boolean;
}): string {
  const signal = {
    baseOffset: d.startOffset,
    startOffset: d.startOffset,
    length: d.length,
    docLength: d.docLength,
    requestedLength: d.requestedLength,
    clampedLength: d.clampedLength,
    returnedLength: d.returnedLength,
    truncated: d.truncated,
    docEndReached: d.docEndReached,
  };
  return (
    `文档文本 (偏移 ${d.startOffset}, 长度 ${d.length}, 文档总长 ${d.docLength}` +
    (d.truncated ? '，⚠️ 本次读取被截断' : '') +
    `):\n\n${d.text}\n\n[README_SIGNAL ${JSON.stringify(signal)}]`
  );
}

/** 渲染单段展示行 + 截断标注（唯一实现，禁止再内联第二份模板） */
export function renderParagraphLine(p: {
  index: number;
  style: string;
  start: number;
  end: number;
  text: string;
  textTruncated?: boolean;
  textLength?: number;
}): string {
  const mark =
    p.textTruncated === true
      ? ` [⚠️文本被截断 ${p.text.length - 3}/${p.textLength ?? '?'} 字符，不可作为替换原文]`
      : '';
  return `[${p.index}] (${p.style}) [${p.start}-${p.end}] ${p.text}${mark}`;
}

/** 段落截断汇总提示（唯一实现） */
export function renderTruncationNotice(count: number): string {
  return count > 0
    ? `\n⚠️ ${count} 段的 text 已被截断（展示用，非原文全量）——` +
        `禁止用它们作为 replaceInParagraph 的 findText；须按偏移重新取区间文本。`
    : '';
}
