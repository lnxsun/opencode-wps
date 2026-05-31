/**
 * enforce-batch.js — 强制分批校对插件
 *
 * 拦截所有 MCP 工具调用，检验分批校对规则：
 *
 * ── 流程规则 ──
 * 规则 1：getDocumentParagraphs 单次请求不得超过 200 段
 * 规则 2：getDocumentParagraphs 必须从第 1 段开始，逐批推进
 * 规则 3：proofreadBasic 必须传入正确的 startOffset（与段落 [start] 一致）
 * 规则 4：replaceRange 必须在 proofreadBasic 之后调用
 * 规则 5：必须先获取文档信息并开始分批，才允许校对
 * 规则 6：修改前必须开启修订模式（enableTrackChanges(true)）
 *
 * ── 数据正确性规则（tool.execute.after 从输出解析）──
 * 规则 7：每批只准调 1 次 proofreadBasic（禁止拆子块）
 * 规则 8：startOffset 必须等于本批第一段的 [start] 值
 * 规则 9：text.length 必须等于本批最后一段 [end] - startOffset
 *         （禁止跳过空段落，必须传完整文本）
 *
 * 规则 7-9 依赖 getDocumentTextByRange 工具提供精确文档子串。
 * 如果 AI 手动拼接文本（跳过空段落），规则 9 会拒绝。
 *
 * 重要：所有有双路径（独立 MCP 工具 + 网关）的操作，一律强制走网关。
 */

// 有对应网关工具的双路径 MCP 工具名
const DIRECT_TO_GATEWAY = {
  "wps-office_wps_get_active_document":     "getActiveDocument",
  "wps-office_wps_insert_text":             "insertText",
  "wps-office_wps_get_active_workbook":     "getActiveWorkbook",
  "wps-office_wps_get_cell_value":          "getCellValue",
  "wps-office_wps_set_cell_value":          "setCellValue",
  "wps-office_wps_get_active_presentation": "getActivePresentation",
};

let prevEnd = 0;
let docInfoFetched = false;        // getActiveDocument 已调
let batchStarted = false;          // getDocumentParagraphs 至少调过一次
let batchCount = 0;                // 已处理的批次数
let proofreadDone = false;         // 当前批是否已调过 proofreadBasic
let trackChangesOn = false;        // enableTrackChanges(true) 已调

// 规则 7-9 所需状态（从 getDocumentParagraphs 输出解析）
let batchStartOffset = null;       // 本批第一段的 [start]
let batchEndOffset = null;         // 本批最后一段的 [end]
let proofreadCalledThisBatch = false;  // 本批是否已调过 proofreadBasic

// 从 getDocumentParagraphs 输出字符串中提取 [index] + [start-end] 数组
// 锚定到行首格式 "[index] (style) [start-end]" 避免匹配正文中的 [digits-digits]
function parseParagraphRanges(outputText) {
  const regex = /^\s*\[(\d+)\] \([^)]+\) \[(\d+)-(\d+)\]/gm;
  const matches = [];
  let m;
  while ((m = regex.exec(outputText)) !== null) {
    matches.push({ index: parseInt(m[1], 10), start: parseInt(m[2], 10), end: parseInt(m[3], 10) });
  }
  return matches;
}

// 从钩子 output 中提取文本
function getOutputText(output) {
  if (!output) return '';
  const result = output.result || output;
  if (typeof result === 'string') return result;
  if (typeof result?.text === 'string') return result.text;
  if (Array.isArray(result?.content)) {
    const textBlock = result.content.find(c => c?.type === 'text');
    if (textBlock?.text) return textBlock.text;
  }
  if (Array.isArray(result)) {
    const textBlock = result.find(c => c?.type === 'text');
    if (textBlock?.text) return textBlock.text;
  }
  return '';
}

export default async () => {
  return {
      // ── 执行后钩子：输出成功后才提交可变状态 ──
    "tool.execute.after": async (input, output) => {
      if (input.name !== "wps-office_wps_office_execute") return;

      const toolName = input.args?.tool_name;

      // getDocumentParagraphs：输出成功后才提交批次状态
      if (toolName === "getDocumentParagraphs") {
        const outText = getOutputText(output);
        if (!outText) return;

        const ranges = parseParagraphRanges(outText);
        if (ranges.length === 0) return;

        prevEnd = ranges[ranges.length - 1].index;
        batchStarted = true;
        batchCount++;
        proofreadDone = false;

        batchStartOffset = ranges[0].start;
        batchEndOffset = ranges[ranges.length - 1].end;
        proofreadCalledThisBatch = false;
        return;
      }

      // proofreadBasic：有有效输出才设置已校对标志
      if (toolName === "proofreadBasic") {
        const outText = getOutputText(output);
        if (!outText) return;
        proofreadCalledThisBatch = true;
        proofreadDone = true;
      }
    },

    // ── 执行前钩子：所有规则校验 ──
    "tool.execute.before": async (input, output) => {
      // 强制走网关：校对流程中拦截所有双路径独立 MCP 工具
      if (batchStarted) {
        const gatewayName = DIRECT_TO_GATEWAY[input.name];
        if (gatewayName) {
          throw new Error(
            `【分批插件】请通过网关调用 ${gatewayName}，不要直接调用 ${input.name}。` +
            `使用方法：wps_office_execute({ tool_name: "${gatewayName}", arguments: {...} })`
          );
        }
      }

      // 仅拦截走 wps_office_execute 网关的调用
      if (input.name !== "wps-office_wps_office_execute") return;

      const toolName = input.args?.tool_name;
      const toolArgs = input.args?.arguments || {};

      // ── 跟踪 getActiveDocument ──
      if (toolName === "getActiveDocument") {
        docInfoFetched = true;
        return;
      }

      // ── 跟踪 enableTrackChanges ──
      if (toolName === "enableTrackChanges") {
        trackChangesOn = toolArgs.enable === true;
        return;
      }

      // ── 规则 1 + 2：getDocumentParagraphs ──
      if (toolName === "getDocumentParagraphs") {
        const start = toolArgs.start_paragraph ?? 1;
        const end = toolArgs.end_paragraph ?? (start + 49);
        const count = end - start + 1;

        if (start < 1) {
          throw new Error(`【分批插件】start_paragraph 必须 ≥ 1（当前值: ${start}）。`);
        }
        if (end < start) {
          throw new Error(`【分批插件】end_paragraph（${end}）必须 ≥ start_paragraph（${start}）。`);
        }

        // 规则 1：单次最多 200 段
        if (count > 200) {
          throw new Error(
            `【分批插件】getDocumentParagraphs 单次请求 ${count} 段，` +
            `超过上限 200 段。请按每批 200 段分批获取：` +
            `start_paragraph=${start}, end_paragraph=${Math.min(start + 199, end)}。`
          );
        }

        // 规则 2：批次必须连续
        if (prevEnd > 0 && start !== prevEnd + 1) {
          if (start === 1) {
            // 允许调回第 1 段重新开始
            proofreadDone = false;
            proofreadCalledThisBatch = false;
            batchStarted = false;
            batchCount = 0;
          } else {
            throw new Error(
              `【分批插件】批次不连续：上一批结束于段落 ${prevEnd}，` +
              `当前批从段落 ${start} 开始。批次必须从 ${prevEnd + 1} 开始逐批推进，` +
              `或从第 1 段重新开始。`
            );
          }
        }
        // 注意：prevEnd 从实际返回的最后一段索引计算（而非请求的 end_paragraph），
        // 短文档不会被逼近不存在的段落。batchStarted/batchCount/proofreadDone
        // 同样在 after-hook 输出成功后才提交，COM 失败也不会脏状态。
        return;
      }

      // ── 规则 3 + 5 + 7 + 8 + 9：proofreadBasic ──
      if (toolName === "proofreadBasic") {
        // 规则 5：必须先获取文档信息 + 启动分批
        if (!docInfoFetched) {
          throw new Error(
            `【分批插件】请先调用 getActiveDocument 了解文档总段落数，` +
            `输出分批校对计划后，再开始校对。`
          );
        }
        if (!batchStarted) {
          throw new Error(
            `【分批插件】请先调用 getDocumentParagraphs 获取第一批段落，` +
            `确认分批计划后，再调 proofreadBasic。未输出分批计划前不得开始校对。`
          );
        }
        // 规则 3：startOffset 必须传
        const so = toolArgs.startOffset;
        if (so === undefined || so === null) {
          throw new Error(
            `【分批插件】proofreadBasic 缺少 startOffset 参数。` +
            `必须传入本批第一段的字符起始位置（从 getDocumentParagraphs 返回的 [start-end] 中提取）。`
          );
        }

        // 规则 7：每批只准调 1 次
        if (proofreadCalledThisBatch) {
          throw new Error(
            `【分批插件】本批已调过 proofreadBasic，禁止再次调用。` +
            `每批只准调 1 次 proofreadBasic。如果要跳过子块，请使用 ` +
            `getDocumentTextByRange 获取完整文本后一次性传入。`
          );
        }

        // 规则 8：startOffset 必须等于本批第一段的 [start]
        if (batchStartOffset !== null && so !== batchStartOffset) {
          throw new Error(
            `【分批插件】proofreadBasic startOffset=${so} 与本批第一段起始位置 ` +
            `${batchStartOffset} 不匹配。startOffset 必须等于 ` +
            `getDocumentParagraphs 返回的本批第一段 [start] 值。`
          );
        }

        // 规则 9：text.length 必须等于本批最后一段 [end] - startOffset
        if (batchEndOffset !== null) {
          const text = toolArgs.text || '';
          const expectedLen = batchEndOffset - so;
          if (text.length !== expectedLen) {
            throw new Error(
              `【分批插件】proofreadBasic 传入文本长度 ${text.length} 与本批 ` +
              `字符范围 ${so}-${batchEndOffset}（长度 ${expectedLen}）不匹配。` +
              `请用 getDocumentTextByRange(startOffset=${so}, length=${expectedLen}) ` +
              `获取精确文本后再调用 proofreadBasic。`
            );
          }
        }

        // 注意：proofreadCalledThisBatch/proofreadDone 在 after-hook 输出成功后才提交
        // 参见 tool.execute.after。这样即使 COM 调用失败，状态也不会脏。
        return;
      }

      // ── 规则 6 + 4：replaceRange / findReplace ──
      if (toolName === "replaceRange" || toolName === "findReplace") {
        if (!trackChangesOn) {
          throw new Error(
            `【分批插件】请先调用 enableTrackChanges(true) 开启修订模式，` +
            `再执行替换操作。所有修改必须在修订模式下进行。`
          );
        }
        if (toolName === "findReplace" && batchStarted) {
          throw new Error(
            `【分批插件】分批校对流程中禁止使用 findReplace（不支持修订标记）。` +
            `请改用 replaceRange 进行替换。`
          );
        }
        if (toolName === "replaceRange" && !proofreadDone) {
          throw new Error(
            `【分批插件】replaceRange 必须在同一批的 proofreadBasic 之后调用。` +
            `请先对当前批次执行 proofreadBasic 完成校对，再修复问题。`
          );
        }
      }
    }
  };
};
