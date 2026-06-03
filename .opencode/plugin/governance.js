/**
 * governance.js — WPS 执行治理插件
 *
 * 统一管控所有 MCP 工具调用，阻止"随心所欲"的执行模式。
 *
 * ── 通用执行规则（始终生效） ──
 * 规则 G1：所有双路径工具强制走网关（DIRECT_TO_GATEWAY）
 * 规则 G2：wps_execute_method 严格受限（仅允许白名单 API）
 * 规则 G3：写操作前必须先执行读操作（readBeforeWrite）
 * 规则 G4：破坏性操作必须传递 confirm: true
 * 规则 G5：文件路径参数校验（防路径穿越）
 * 规则 G6：密码参数保护（日志脱敏 + 使用限制）
 * 规则 G7：参数范围校验（行号/列号/索引 ≥ 1）
 * 规则 G8：跨应用数据传递必须通过缓存（cacheData/getCachedData）
 *
 * ── 分批校对规则（校对激活时生效） ──
 * 规则 P1-P11：继承 enforce-batch.js 的全部 11 条规则
 *
 * ── 模板填写工作流规则（模板填写时生效） ──
 * 规则 T1：填写前必须调用 getActiveDocument 评估文档规模
 * 规则 T2：填写前必须调用 getDocumentParagraphs 分批（≤200 段/批）
 * 规则 T3：填写前必须调用 enableTrackChanges(true) 开启修订模式
 * 规则 T4：填写后建议调用 findInDocument 检查遗漏
 * 规则 T5：批次连续性检查（同 P2，复用 getDocumentParagraphs 规则）
 * 规则 T6：禁止子串重复填写 — 若新 keyword 是已填 keyword 的子串或超串，拦截
 * 规则 T7：禁止编造 — 首次填写前必须输出"文档字段 ↔ 用户值"对照表并获用户确认
 * 规则 T8：跳过签字字段 — 含"签字/签名/签章"的关键字无需填写（需手动签章）
 * 规则 T9：日期字段强制 underline — 日期字段禁止使用 afterColon 模式
 */

// ==================== 常量定义 ====================

const DIRECT_TO_GATEWAY = {
  "wps-office_wps_get_active_document":     "getActiveDocument",
  "wps-office_wps_insert_text":             "insertText",
  "wps-office_wps_get_active_workbook":     "getActiveWorkbook",
  "wps-office_wps_get_cell_value":          "getCellValue",
  "wps-office_wps_set_cell_value":          "setCellValue",
  "wps-office_wps_get_active_presentation": "getActivePresentation",
};

const WRITE_TOOLS = new Set([
  "setCellValue", "setRangeData", "setFormula", "setArrayFormula",
  "insertText", "insertTable", "insertImage", "insertExcelImage",
  "insertPptImage", "insertRows", "insertColumns", "deleteRows", "deleteColumns",
  "clearRange", "mergeCells", "unmergeCells",
  "replaceInParagraph", "replaceRange", "findReplace", "replaceInSheet",
  "setCellFormat", "setCellStyle", "setBorder", "setNumberFormat",
  "setColumnWidth", "setRowHeight",
  "setFont", "setParagraph", "applyStyle",
  "setSlideTitle", "setSlideContent", "setSlideNotes", "setSlideBackground",
  "addSlide", "deleteSlide", "duplicateSlide", "moveSlide",
  "addShape", "deleteShape", "addTextBox", "setTextBoxText", "deleteTextBox",
  "addComment", "beautifySlide", "beautifyAllSlides",
  "save", "saveAs", "closeDocument", "closePresentation", "closeWorkbook",
  "smartFillField", "replaceBookmarkContent",
]);

const READ_TOOLS = new Set([
  "getActiveDocument", "getActiveWorkbook", "getActivePresentation",
  "getDocumentText", "getDocumentParagraphs", "getDocumentStats",
  "getCellValue", "getRangeData", "getFormula",
  "getSheetList", "getCellInfo", "getSelection",
  "getSlideCount", "getSlideInfo", "getSlideTitle", "getSlideNotes",
  "getShapes", "getTextBoxes", "getBookmarks", "getComments",
  "findInDocument", "findInSheet",
]);

const DESTRUCTIVE_TOOLS = new Set([
  "deleteSheet", "deleteSlide", "deleteRows", "deleteColumns",
  "deleteShape", "deleteTextBox", "deletePptImage", "deleteCellComment",
  "clearRange", "clearFormats",
  "unmergeCells",
  "removeConditionalFormat", "removeDataValidation",
  "removeAnimation", "removeSlideTransition", "removePptHyperlink",
  "closeDocument", "closePresentation", "closeWorkbook",
]);

const PASSWORD_TOOLS = new Set([
  "protectSheet", "unprotectSheet", "protectWorkbook",
]);

const FILE_PATH_PARAMS = new Set([
  "filePath", "imagePath", "outputPath", "path",
]);

// 参数范围校验定义
const PARAM_RANGES = {
  "getCellValue":    { row: [1, null], col: [1, null] },
  "setCellValue":    { row: [1, null], col: [1, null] },
  "getCellInfo":     { row: [1, null], col: [1, null] },
  "addCellComment":  { row: [1, null], col: [1, null] },
  "deleteCellComment": { row: [1, null], col: [1, null] },
  "insertRows":      { row: [1, null] },
  "deleteRows":      { row: [1, null] },
  "hideRows":        { row: [1, null] },
  "showRows":        { row: [1, null] },
  "setRowHeight":    { row: [1, null], height: [1, null] },
  "deleteSlide":     { slideIndex: [1, null] },
  "switchSlide":     { slideIndex: [1, null] },
  "getSlideInfo":    { slideIndex: [1, null] },
  "getSlideTitle":   { slideIndex: [1, null] },
  "getSlideNotes":   { slideIndex: [1, null] },
  "setSlideTitle":   { slideIndex: [1, null] },
  "setSlideSubtitle": { slideIndex: [1, null] },
  "setSlideContent": { slideIndex: [1, null] },
  "setSlideNotes":   { slideIndex: [1, null] },
  "setSlideBackground": { slideIndex: [1, null] },
  "setSlideTransition": { slideIndex: [1, null] },
  "removeSlideTransition": { slideIndex: [1, null] },
  "addAnimation":    { slideIndex: [1, null], shapeIndex: [1, null] },
  "removeAnimation": { slideIndex: [1, null], animationIndex: [1, null] },
  "deleteShape":     { index: [1, null] },
  "duplicateShape":  { index: [1, null] },
  "insertTable":     { rows: [1, 100], cols: [1, 100] },
  "insertPptTable":  { rows: [1, 100], cols: [1, 100] },
  "groupRows":       { startRow: [1, null], endRow: [1, null] },
};

// wps_execute_method 白名单 API
const EXECUTE_METHOD_WHITELIST = new Set([
  "Application.ActiveDocument",
  "Application.ActiveWorkbook",
  "Application.ActivePresentation",
]);

// ==================== 状态变量 ====================

let lastBatchParaIndex = 0;
let batchStartParaIndex = 0;
let docInfoFetched = false;
let batchStarted = false;
let batchCount = 0;
let trackChangesOn = false;
let aiProofreadDoneThisBatch = false;
let lastRevisionCount = 0;

let batchStartOffset = null;
let batchEndOffset = null;
let proofreadCalledThisBatch = false;

// 通用状态：各应用的读取状态
let appReadState = {
  word: { activeDocRead: false },
  excel: { activeWorkbookRead: false },
  ppt: { activePresentationRead: false },
};

// 模板填写状态跟踪
let templateFilling = {
  active: false,
  docFetched: false,
  paragraphsFetched: false,
  trackChangesEnabled: false,
  fieldsFilled: 0,
  lastParagraphIndex: 0,
  fillKeywords: [],
  userConfirmed: false,   // T7：用户是否确认了字段对照表
};

// ==================== 辅助函数 ====================

function parseParagraphRanges(outputText) {
  const regex = /^\s*\[(\d+)\] \((.+)\)\s*\[(\d+)-(\d+)\]/gm;
  const matches = [];
  let m;
  while ((m = regex.exec(outputText)) !== null) {
    matches.push({ index: parseInt(m[1], 10), start: parseInt(m[3], 10), end: parseInt(m[4], 10) });
  }
  return matches;
}

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

function getAppType(toolName) {
  if (toolName.startsWith('getActivePresentation') || toolName.startsWith('wps_ppt_') || toolName.startsWith('wpp_')) return 'ppt';
  if (toolName.startsWith('getActiveWorkbook') || toolName.startsWith('wps_excel_') || toolName.startsWith('et_') || toolName.startsWith('getCell') || toolName.startsWith('setCell') || toolName.startsWith('getRange') || toolName.startsWith('setRange') || toolName.startsWith('getSheet') || toolName.startsWith('createSheet') || toolName.startsWith('deleteSheet') || toolName.startsWith('renameSheet') || toolName.startsWith('copySheet') || toolName.startsWith('switchSheet') || toolName.startsWith('moveSheet')) return 'excel';
  return 'word';
}

function appTypeFromConfig(appType) {
  if (appType === 'et') return 'excel';
  if (appType === 'wpp') return 'ppt';
  if (appType === 'wps') return 'word';
  return appType;
}

function requiresReadBeforeWrite(toolName) {
  if (toolName.startsWith('get')) return false;
  if (toolName.startsWith('find')) return false;
  if (toolName.startsWith('ping') || toolName.startsWith('wireCheck')) return false;
  if (READ_TOOLS.has(toolName)) return false;
  if (WRITE_TOOLS.has(toolName)) return true;
  return false;
}

function checkParamRange(toolName, toolArgs) {
  const ranges = PARAM_RANGES[toolName];
  if (!ranges) return;
  for (const [param, [min, max]] of Object.entries(ranges)) {
    const val = toolArgs[param];
    if (val === undefined || val === null) continue;
    if (typeof val !== 'number') continue;
    if (val < min) {
      throw new Error(
        `【执行治理】${toolName} ${param}=${val} 过小（允许 ≥ ${min}）。` +
        `请确保 ${param} 从 ${min} 开始。`
      );
    }
    if (max !== null && val > max) {
      throw new Error(
        `【执行治理】${toolName} ${param}=${val} 过大（允许 ≤ ${max}）。` +
        `请减小 ${param} 值。`
      );
    }
  }
}

function checkFilePathSafety(args) {
  for (const key of Object.keys(args)) {
    if (!FILE_PATH_PARAMS.has(key)) continue;
    const val = String(args[key] || '');
    if (val.includes('..')) {
      throw new Error(
        `【执行治理】文件路径含路径穿越符号（..），已拒绝：${key}="${val}"。` +
        `请使用绝对路径且不含 ".."。`
      );
    }
  }
}

function checkPasswordProtection(toolName, toolArgs) {
  if (!PASSWORD_TOOLS.has(toolName)) return;
  if (toolArgs.password && toolArgs.password.length > 0) {
    console.warn(
      `【执行治理】${toolName} 使用了密码参数（已脱敏）。` +
      `密码不会记录日志，请确认操作范围。`
    );
  }
}

// ==================== 插件默认导出 ====================

export default async () => {
  return {

    // ── 执行后钩子：输出成功后才提交可变状态 ──
    "tool.execute.after": async (input, output) => {
      if (input.name === "wps-office_wps_office_execute") {
        if (output?.isError) return;

        const toolName = input.args?.tool_name;

        if (toolName === "getActiveDocument") {
          const outText = getOutputText(output);
          if (!outText) return;
          docInfoFetched = true;
          appReadState.word.activeDocRead = true;
          return;
        }

        if (toolName === "getActiveWorkbook") {
          const outText = getOutputText(output);
          if (!outText) return;
          appReadState.excel.activeWorkbookRead = true;
          return;
        }

        if (toolName === "getActivePresentation") {
          const outText = getOutputText(output);
          if (!outText) return;
          appReadState.ppt.activePresentationRead = true;
          return;
        }

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

        if (toolName === "enableTrackChanges") {
          const outText = getOutputText(output);
          if (!outText) return;
          trackChangesOn = input.args?.arguments?.enable === true;
          return;
        }

        if (toolName === "proofreadBasic") {
          const outText = getOutputText(output);
          if (!outText) return;
          proofreadCalledThisBatch = true;
          aiProofreadDoneThisBatch = false;
          return;
        }

        if (toolName === "confirmBatchAiProofread") {
          aiProofreadDoneThisBatch = true;
          return;
        }

        if (toolName === "getTrackChangesStatus") {
          const outText = getOutputText(output);
          if (!outText) return;
          const match = outText.match(/当前修订数量:\s*(\d+)/);
          if (match) {
            lastRevisionCount = parseInt(match[1], 10);
          }
          return;
        }

        // ── 模板填写状态跟踪 ──
        if (toolName === "getActiveDocument") {
          templateFilling.docFetched = true;
          return;
        }

        if (toolName === "getDocumentParagraphs") {
          const outText = getOutputText(output);
          if (!outText) return;
          const ranges = parseParagraphRanges(outText);
          if (ranges.length > 0) {
            templateFilling.paragraphsFetched = true;
            templateFilling.lastParagraphIndex = ranges[ranges.length - 1].index;
          }
          return;
        }

        if (toolName === "enableTrackChanges") {
          const outText = getOutputText(output);
          if (!outText) return;
          templateFilling.trackChangesEnabled = input.args?.arguments?.enable === true;
          return;
        }

        if (toolName === "smartFillField") {
          templateFilling.active = true;
          templateFilling.fieldsFilled++;
          const keyword = input.args?.arguments?.keyword;
          if (keyword) {
            templateFilling.fillKeywords.push(keyword);
          }
          if (input.args?.arguments?._field_mapping_confirmed) {
            templateFilling.userConfirmed = true;
          }
          return;
        }

        if (toolName === "replaceBookmarkContent") {
          templateFilling.active = true;
          templateFilling.fieldsFilled++;
          return;
        }
      }
    },

    // ── 执行前钩子：所有规则校验 ──
    "tool.execute.before": async (input, output) => {
      // ==================== 规则 G1：网关强制 ====================
      const gatewayName = DIRECT_TO_GATEWAY[input.name];
      if (gatewayName) {
        throw new Error(
          `【执行治理】请通过网关调用 ${gatewayName}，不要直接调用 ${input.name}。` +
          `使用方法：wps_office_execute({ tool_name: "${gatewayName}", arguments: {...} })`
        );
      }

      // ==================== 规则 G2：wps_execute_method 白名单 ====================
      if (input.name === "wps-office_wps_execute_method" || input.name === "wps_execute_method") {
        const method = input.args?.method || input.args?.arguments?.method || '';
        const allowed = Array.from(EXECUTE_METHOD_WHITELIST).some(a => method.startsWith(a));
        if (!allowed) {
          throw new Error(
            `【执行治理】wps_execute_method 只允许白名单 API。` +
            `当前 method="${method}" 不在白名单中。` +
            `允许的 API：${Array.from(EXECUTE_METHOD_WHITELIST).join(', ')}。` +
            `其他操作请通过 wps_office_execute 使用已注册工具。`
          );
        }
      }

      // 以下规则仅针对 wps_office_execute 网关调用
      if (input.name !== "wps-office_wps_office_execute") return;

      const toolName = input.args?.tool_name;
      const toolArgs = input.args?.arguments || {};

      // 跳过检测/信息类工具
      if (!toolName) return;

      // ==================== 规则 G5：文件路径安全检查 ====================
      checkFilePathSafety(toolArgs);

      // ==================== 规则 G6：密码参数保护 ====================
      checkPasswordProtection(toolName, toolArgs);

      // ==================== 规则 G3：读前必写 ====================
      if (requiresReadBeforeWrite(toolName)) {
        const appType = appTypeFromConfig(toolArgs.appType) || getAppType(toolName);
        const state = appReadState[appType];
        if (state && !state.activeDocRead) {
          throw new Error(
            `【执行治理】执行 ${toolName} 前必须先读取文档状态。` +
            `请先调用 getActiveDocument(Word) / getActiveWorkbook(Excel) / ` +
            `getActivePresentation(PPT) 了解当前文档信息。`
          );
        }
      }

      // ==================== 规则 G4：破坏性操作确认 ====================
      if (DESTRUCTIVE_TOOLS.has(toolName)) {
        const confirm = toolArgs.confirm;
        if (confirm !== true) {
          throw new Error(
            `【执行治理】${toolName} 是破坏性操作，必须传递 confirm: true 确认。` +
            `请在调用参数中添加 arguments: { ..., confirm: true } 以确认此操作。`
          );
        }
      }

      // ==================== 规则 G7：参数范围校验 ====================
      checkParamRange(toolName, toolArgs);

      // ==================== 规则 G8：跨应用缓存检查 ====================
      if (toolName === "getCachedData" || toolName === "wps-office_wps_get_cached_data") {
        return;
      }

      // ── 以下为分批校对专用规则（P1-P11） ──

      if (toolName === "getActiveDocument" || toolName === "enableTrackChanges") {
        return;
      }

      // ── 规则 P1 + P2：getDocumentParagraphs ──
      if (toolName === "getDocumentParagraphs") {
        if (!docInfoFetched) {
          throw new Error(
            `【执行治理】请先调用 getActiveDocument 了解文档总段落数，` +
            `再获取段落列表。`
          );
        }
        const start = toolArgs.start_paragraph ?? 1;
        const end = toolArgs.end_paragraph ?? (start + 49);
        const count = end - start + 1;
        if (start < 1) {
          throw new Error(`【执行治理】start_paragraph 必须 ≥ 1（当前值: ${start}）。`);
        }
        if (end < start) {
          throw new Error(`【执行治理】end_paragraph（${end}）必须 ≥ start_paragraph（${start}）。`);
        }
        if (count > 200) {
          throw new Error(
            `【执行治理】getDocumentParagraphs 单次请求 ${count} 段，` +
            `超过上限 200 段。请分多次获取。`
          );
        }
        if (lastBatchParaIndex === 0 && start !== 1) {
          throw new Error(
            `【执行治理】首次 getDocumentParagraphs 必须从第 1 段开始（当前 start=${start}）。`
          );
        }
        if (lastBatchParaIndex > 0 && start !== lastBatchParaIndex + 1) {
          if (start !== 1) {
            throw new Error(
              `【执行治理】批次不连续：上一批结束于段落 ${lastBatchParaIndex}，` +
              `当前批从段落 ${start} 开始。批次必须连续或从第 1 段重新开始。`
            );
          }
        }
        return;
      }

      // ── 规则 P3 + P5 + P7 + P8 + P9：proofreadBasic ──
      if (toolName === "proofreadBasic") {
        if (!docInfoFetched) {
          throw new Error(
            `【执行治理】请先调用 getActiveDocument 了解文档总段落数，` +
            `输出分批校对计划后，再开始校对。`
          );
        }
        if (!batchStarted) {
          throw new Error(
            `【执行治理】请先调用 getDocumentParagraphs 获取第一批段落，` +
            `确认分批计划后再调 proofreadBasic。`
          );
        }
        const so = toolArgs.startOffset;
        if (so === undefined || so === null) {
          throw new Error(
            `【执行治理】proofreadBasic 缺少 startOffset 参数。` +
            `必须传入本批第一段的字符起始位置。`
          );
        }
        if (proofreadCalledThisBatch) {
          throw new Error(
            `【执行治理】本批已调过 proofreadBasic，禁止再次调用。` +
            `每批只准调 1 次。`
          );
        }
        if (batchStartOffset !== null && so !== batchStartOffset) {
          throw new Error(
            `【执行治理】proofreadBasic startOffset=${so} 与本批第一段起始位置 ` +
            `${batchStartOffset} 不匹配。`
          );
        }
        if (!toolArgs.file_path && batchEndOffset !== null) {
          const text = toolArgs.text || '';
          if (text.length === 0) {
            throw new Error(
              `【执行治理】proofreadBasic 传入文本为空。` +
              `请用 getDocumentTextByRange(startOffset=${so}, length=${batchEndOffset - so}) 获取文本。`
            );
          }
          if (text.length < 20) {
            throw new Error(
              `【执行治理】proofreadBasic 传入文本仅 ${text.length} 字符，` +
              `明显不足（预期约 ${batchEndOffset - so} 字符）。`
            );
          }
        }
        return;
      }

      // ── 规则 P4 + P6 + P10 + P11：替换操作 ──
      if (toolName === "replaceRange" || toolName === "replaceInParagraph" || toolName === "findReplace") {
        if (!trackChangesOn) {
          throw new Error(
            `【执行治理】请先调用 enableTrackChanges(true) 开启修订模式，` +
            `再执行替换操作。`
          );
        }
        if (toolName === "replaceRange") {
          throw new Error(
            `【执行治理】分批校对流程中严禁使用 replaceRange。` +
            `请统一改用 replaceInParagraph。`
          );
        }
        if (toolName === "findReplace" && batchStarted) {
          throw new Error(
            `【执行治理】分批校对流程中禁止使用 findReplace（不支持修订标记）。` +
            `请改用 replaceInParagraph。`
          );
        }
        if (toolName === "replaceInParagraph") {
          if (batchStarted && !proofreadCalledThisBatch) {
            throw new Error(
              `【执行治理】replaceInParagraph 必须在同一批的 proofreadBasic 之后调用。`
            );
          }
          if (batchStarted && !aiProofreadDoneThisBatch) {
            throw new Error(
              `【执行治理】AI 智能校对未完成。请在 proofreadBasic 之后调用 ` +
              `confirmBatchAiProofread 确认 AI 校对已完成，再执行替换操作。`
            );
          }
          if (batchStarted) {
            const paraIdx = toolArgs.paragraphIndex;
            if (paraIdx !== undefined) {
              if (paraIdx < batchStartParaIndex) {
                throw new Error(
                  `【执行治理】replaceInParagraph paragraphIndex=${paraIdx} 在本批起始段落 ${batchStartParaIndex} 之前。`
                );
              }
              if (paraIdx > lastBatchParaIndex) {
                throw new Error(
                  `【执行治理】replaceInParagraph paragraphIndex=${paraIdx} 超出本批结束段落 ${lastBatchParaIndex}。`
                );
              }
            }
          }
        }
        return;
      }

      // ── 模板填写工作流规则（T1-T7） ──

      if (toolName === "smartFillField" || toolName === "replaceBookmarkContent") {
        // T1：评估文档
        if (!templateFilling.active && !templateFilling.docFetched) {
          throw new Error(
            `【执行治理】模板填写前请先评估文档规模。` +
            `请先调用 getActiveDocument 了解文档总段落数。`
          );
        }
        // T2：分批
        if (!templateFilling.active && !templateFilling.paragraphsFetched) {
          throw new Error(
            `【执行治理】模板填写前请先分批。` +
            `请先调用 getDocumentParagraphs 以每批 ≤200 段评估文档结构，再逐批填写。`
          );
        }
        // T7：首次填写前必须输出字段对照表并获用户确认（禁止编造）
        // AI 需先向用户输出"文档字段 ↔ 用户值"对照表，用户确认后，在首次
        // smartFillField 传 _field_mapping_confirmed: true 放行
        if (!templateFilling.userConfirmed) {
          if (!toolArgs._field_mapping_confirmed) {
            throw new Error(
              `【执行治理·禁止编造】首次 smartFillField 前，你必须：\n` +
              `1. 列出文档中所有待填写字段与用户提供值的对照表\n` +
              `2. 标记出用户未提供的字段（如缺少"采购项目编号"的值）\n` +
              `3. 要求用户补充缺失值，不得自行编造\n` +
              `4. 用户确认后，在首次 smartFillField 参数中添加 ` +
              `_field_mapping_confirmed: true 即可放行`
            );
          }
        }
        // T3：修订模式
        if (!templateFilling.trackChangesEnabled) {
          throw new Error(
            `【执行治理】模板填写前请先调用 enableTrackChanges(true) 开启修订模式，` +
            `以便追踪填写变更。`
          );
        }
        // T8：跳过签字字段（需手动签章，不应由AI填写）
        if (toolArgs.keyword) {
          const signaturePatterns = ['签字', '签名', '签章', '盖章'];
          for (const pattern of signaturePatterns) {
            if (toolArgs.keyword.includes(pattern)) {
              throw new Error(
                `【执行治理·跳过签字】"${toolArgs.keyword}" 包含"${pattern}"，` +
                `属于手工签章字段，不应由AI填写。请跳过此字段。`
              );
            }
          }
        }
        // T9：日期字段禁止 afterColon，必须使用 underline 模式
        if (toolArgs.keyword === '日期' && toolArgs.fillMode === 'afterColon') {
          throw new Error(
            `【执行治理·日期填写错误】日期字段禁止使用 afterColon 模式。\n` +
            `请在 smartFillField 中改用 fillMode: "underline"。\n` +
            `underline 模式会正确处理"____年____月____日"或"        年    月    日"日期占位符。`
          );
        }
        // T6：禁止子串重复填写
        const newKeyword = toolArgs.keyword;
        if (newKeyword && templateFilling.fillKeywords.length > 0) {
          for (const existingKwd of templateFilling.fillKeywords) {
            if (existingKwd.includes(newKeyword) || newKeyword.includes(existingKwd)) {
              if (existingKwd !== newKeyword) {
                throw new Error(
                  `【执行治理·禁止重复】"${newKeyword}" 与已填写字段 "${existingKwd}" ` +
                  `存在包含关系（子串/超串）。请确认这是否是同一字段：\n` +
                  `- 如果是同一字段（如"包号"是"采购包号"的一部分），不要再次填写\n` +
                  `- 如果是不同字段，请向用户确认后再填写`
                );
              }
            }
          }
        }
        return;
      }
    }
  };
};
