/**
 * enforce-batch.js — 强制分批校对插件
 *
 * 拦截所有 MCP 工具调用，检验分批校对规则：
 *
 * ── 流程规则 ──
 * 规则 1： getDocumentParagraphs 单次请求不得超过 200 段
 * 规则 2： getDocumentParagraphs 必须从第 1 段开始，逐批推进
 * 规则 3： proofreadBasic 必须传入正确的 startOffset（与段落 [start] 一致）
 * 规则 4a：replaceRange 完全禁用（偏移量在含不可见字符的文档中不可靠）
 * 规则 4b：findReplace 禁用（不支持修订标记）
 * 规则 5： 必须先获取文档信息并开始分批，才允许校对
 * 规则 6： 修改前必须开启修订模式（enableTrackChanges(true)）
 *
 * ── 数据正确性规则（tool.execute.after 从输出解析）──
 * 规则 7： 每批只准调 1 次 proofreadBasic（禁止拆子块）
 * 规则 8： startOffset 必须等于本批第一段的 [start] 值
 * 规则 9： text 不能为空且不能明显过短（< 20 字符）。不要求精确长度匹配，
 *          因为 WPS COM Range.Text 返回长度可能因 \\f \\a 等控制字符
 *          与段落 [start-end] 预期长度不一致。
 *
 * ── 智能校对规则 ──
 * 规则 10：replaceInParagraph 前必须先确认 AI 校对（confirmBatchAiProofread）
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

let lastBatchParaIndex = 0;
let batchStartParaIndex = 0;       // 本批第一段的段落索引
let docInfoFetched = false;        // getActiveDocument 已调
let batchStarted = false;          // getDocumentParagraphs 至少调过一次
let batchCount = 0;                // 已处理的批次数
let trackChangesOn = false;        // enableTrackChanges(true) 已调
let aiProofreadDoneThisBatch = false;  // 本批AI校对已确认
let lastRevisionCount = 0;             // 从 getTrackChangesStatus 获得的最新修订数

// 规则 7-9 所需状态（从 getDocumentParagraphs 输出解析）
let batchStartOffset = null;       // 本批第一段的 [start]
let batchEndOffset = null;         // 本批最后一段的 [end]
let proofreadCalledThisBatch = false;  // 本批是否已调过 proofreadBasic

// 从 getDocumentParagraphs 输出字符串中提取 [index] + [start-end] 数组
// 锚定到行首格式 "[index] (style) [start-end]" 避免匹配正文中的 [digits-digits]
// 使用贪心回溯匹配样式名，支持含括号的样式名如 "Heading 1 (modified)"
function parseParagraphRanges(outputText) {
  const regex = /^\s*\[(\d+)\] \((.+)\)\s*\[(\d+)-(\d+)\]/gm;
  const matches = [];
  let m;
  while ((m = regex.exec(outputText)) !== null) {
    matches.push({ index: parseInt(m[1], 10), start: parseInt(m[3], 10), end: parseInt(m[4], 10) });
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
      if (output?.isError) return;  // 明确失败的调用不提交任何状态

      const toolName = input.args?.tool_name;

      // getActiveDocument：输出成功后才标记文档已获取
      if (toolName === "getActiveDocument") {
        const outText = getOutputText(output);
        if (!outText) return;
        docInfoFetched = true;
        return;
      }

      // getDocumentParagraphs：输出成功后才提交批次状态
      if (toolName === "getDocumentParagraphs") {
        const outText = getOutputText(output);
        if (!outText) return;

        const ranges = parseParagraphRanges(outText);
        if (ranges.length === 0) return;

        lastBatchParaIndex = ranges[ranges.length - 1].index;
        batchStartParaIndex = ranges[0].index;
        batchStarted = true;
        batchCount++;

        batchStartOffset = ranges[0].start;
        batchEndOffset = ranges[ranges.length - 1].end;
        proofreadCalledThisBatch = false;
        aiProofreadDoneThisBatch = false;
        return;
      }

      // enableTrackChanges：输出成功后才提交修订模式状态
      if (toolName === "enableTrackChanges") {
        const outText = getOutputText(output);
        if (!outText) return;
        trackChangesOn = input.args?.arguments?.enable === true;
        return;
      }

      // proofreadBasic：有有效输出才设置已校对标志
      if (toolName === "proofreadBasic") {
        const outText = getOutputText(output);
        if (!outText) return;
        proofreadCalledThisBatch = true;
        aiProofreadDoneThisBatch = false; // 基础校对后 AI 校对标记重置
        return;
      }

      // confirmBatchAiProofread：确认本批 AI 智能校对已完成
      if (toolName === "confirmBatchAiProofread") {
        aiProofreadDoneThisBatch = true;
        return;
      }

      // getTrackChangesStatus：捕获最新修订数
      if (toolName === "getTrackChangesStatus") {
        const outText = getOutputText(output);
        if (!outText) return;
        const match = outText.match(/当前修订数量:\s*(\d+)/);
        if (match) {
          lastRevisionCount = parseInt(match[1], 10);
        }
        return;
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

      // ── 跟踪 getActiveDocument（注意：docInfoFetched 在 after-hook 输出成功后才提交）
      if (toolName === "getActiveDocument") {
        return;
      }

      // ── 跟踪 enableTrackChanges（注意：trackChangesOn 在 after-hook 输出成功后才提交）
      if (toolName === "enableTrackChanges") {
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

        // 规则 2a：首次调用必须从第 1 段开始
        if (lastBatchParaIndex === 0 && start !== 1) {
          throw new Error(
            `【分批插件】首次 getDocumentParagraphs 必须从第 1 段开始（当前 start=${start}）。` +
            `请从 start_paragraph=1 开始分批。`
          );
        }

        // 规则 2b：批次必须连续
        if (lastBatchParaIndex > 0 && start !== lastBatchParaIndex + 1) {
          if (start === 1) {
            // 允许调回第 1 段重新开始
            proofreadCalledThisBatch = false;
            batchStarted = false;
            batchCount = 0;
          } else {
            throw new Error(
              `【分批插件】批次不连续：上一批结束于段落 ${lastBatchParaIndex}，` +
              `当前批从段落 ${start} 开始。批次必须从 ${lastBatchParaIndex + 1} 开始逐批推进，` +
              `或从第 1 段重新开始。`
            );
          }
        }
        // 注意：lastBatchParaIndex 从实际返回的最后一段索引计算（而非请求的 end_paragraph），
        // 短文档不会被逼近不存在的段落。batchStarted/batchCount/proofreadCalledThisBatch
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

        // 规则 9：text 不能为空且不能明显过短
        // 注意：由于 WPS COM 的 Range.Text 返回长度可能因控制字符/分页符等
        // 与段落 [start-end] 计算的预期长度不一致，不用严格相等检查。
        // 改为检查 text 是否非空且至少包含一定有效内容。
        // 如果使用 file_path 参数（控制字符规避方案），则跳过文本长度检查。
        if (batchEndOffset !== null && !toolArgs.file_path) {
          const text = toolArgs.text || '';
          const expectedLen = batchEndOffset - so;
          // 文本不能为空
          if (text.length === 0) {
            throw new Error(
              `【分批插件】proofreadBasic 传入文本为空。` +
              `请用 getDocumentTextByRange(startOffset=${so}, length=${expectedLen}) ` +
              `获取文本后再调用 proofreadBasic。`
            );
          }
          // 文本不能明显过短（< 20 字符），说明传错了文本
          if (text.length < 20) {
            throw new Error(
              `【分批插件】proofreadBasic 传入文本仅 ${text.length} 字符，` +
              `明显不足（预期约 ${expectedLen} 字符）。` +
              `请用 getDocumentTextByRange 获取完整批次文本。`
            );
          }
        }

        // 注意：proofreadCalledThisBatch 在 after-hook 输出成功后才提交
        // 参见 tool.execute.after。这样即使 COM 调用失败，状态也不会脏。
        return;
      }

      // ── 规则 4 + 6 + 10 + 11：replaceRange / replaceInParagraph / findReplace ──
      if (toolName === "replaceRange" || toolName === "replaceInParagraph" || toolName === "findReplace") {
        // 规则 6：必须先开启修订模式
        if (!trackChangesOn) {
          throw new Error(
            `【分批插件】请先调用 enableTrackChanges(true) 开启修订模式，` +
            `再执行替换操作。所有修改必须在修订模式下进行。`
          );
        }

        // 规则 4a：replaceRange 完全禁止（偏移量在含不可见字符的文档中不可靠）
        if (toolName === "replaceRange") {
          throw new Error(
            `【分批插件】分批校对流程中严禁使用 replaceRange。` +
            `偏移量在含不可见字符（\\f、\\a、BEL 等）的文档中不可靠，` +
            `会导致替换到错误位置损坏文档。` +
            `请统一改用 replaceInParagraph（按段落索引+文本匹配）。`
          );
        }

        // 规则 4b：findReplace 禁止（不支持修订标记）
        if (toolName === "findReplace" && batchStarted) {
          throw new Error(
            `【分批插件】分批校对流程中禁止使用 findReplace（不支持修订标记）。` +
            `请改用 replaceInParagraph 进行替换。`
          );
        }

        // 规则 4c：必须先调 proofreadBasic（基础校对）
        if (toolName === "replaceInParagraph" && !proofreadCalledThisBatch) {
          throw new Error(
            `【分批插件】replaceInParagraph 必须在同一批的 proofreadBasic 之后调用。` +
            `请先对当前批次执行 proofreadBasic 完成基础校对，再修复问题。`
          );
        }

        // 规则 10：必须确认 AI 智能校对已完成
        if (toolName === "replaceInParagraph" && !aiProofreadDoneThisBatch) {
          throw new Error(
            `【分批插件】AI 智能校对未完成。请在 proofreadBasic 之后调用 ` +
            `confirmBatchAiProofread 确认 AI 校对已完成，再执行替换操作。` +
            `基础校对 + AI 智能校对两层完成后才允许修复。`
          );
        }

        // 段落索引验证：replaceInParagraph 必须在本批段落范围内
        if (toolName === "replaceInParagraph" && batchStarted) {
          const paraIdx = toolArgs.paragraphIndex;
          if (paraIdx !== undefined) {
            if (paraIdx < batchStartParaIndex) {
              throw new Error(
                `【分批插件】replaceInParagraph paragraphIndex=${paraIdx} 在本批起始段落 ${batchStartParaIndex} 之前。` +
                `请确保替换的段落在当前校对的批次内。`
              );
            }
            if (paraIdx > lastBatchParaIndex) {
              throw new Error(
                `【分批插件】replaceInParagraph paragraphIndex=${paraIdx} 超出本批结束段落 ${lastBatchParaIndex}。` +
                `请确保替换的段落在当前校对的批次内。`
              );
            }
          }
        }
      }
    }
  };
};
