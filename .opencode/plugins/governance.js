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
 *
 * ── 分批校对规则（校对激活时生效） ──
 * 规则 P1-P16：继承 enforce-batch.js 的全部 11 条规则 + P12-P16 严格逐批（P12：周期未完成禁止获取下一批；P13：getDocumentTextByRange 限本批范围；P14：confirmBatchAiProofread 前必须 proofreadBasic；P15：基础校对无 issue 时禁止 AI 自行大量修复；P16：替换内容与已知 issue 交叉校验）
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
 * 规则 T9：日期字段推荐 underline 模式（T11 保证所有模式的值都加下划线，故 afterColon 也允许）
 * 规则 T10：禁止同一 (keyword, value) 重复填写（仅同一段落内，由 wps-com.ps1 每段落正则校验，governance 层不做跨段落拦截）
 * 规则 T11：所有填入的值必须加下划线（smartFillField 工具层自动执行，填值后立即设置 Font.Underline=1）
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

const EXECUTE_METHOD_WHITELIST = new Set([
  "Application.ActiveDocument",
  "Application.ActiveWorkbook",
  "Application.ActivePresentation",
]);

// ==================== 状态变量 ====================
// TODO: 多会话并发时会相互覆盖，需改为 Map<sessionId, State> 隔离

let lastBatchParaIndex = 0;
let batchStartParaIndex = 0;
let docInfoFetched = false;
let batchStarted = false;
let batchCount = 0;
let trackChangesOn = false;
let aiProofreadDoneThisBatch = false;
let lastRevisionCount = 0;
let totalParagraphs = 0;  // 文档总段落数
let allBatchesComplete = false;  // 所有批次是否已完成

let batchStartOffset = null;
let batchEndOffset = null;
let proofreadCalledThisBatch = false;
let replaceCalledThisBatch = false;
let proofreadHadIssues = false;
let proofreadIssueOriginals = [];
let replaceCountThisBatch = 0;
const MAX_AI_FIXES_NO_ISSUES = 1;

let appReadState = {
  word: { activeDocRead: false },
  excel: { activeWorkbookRead: false },
  ppt: { activePresentationRead: false },
};

let templateFilling = {
  active: false,
  docFetched: false,
  paragraphsFetched: false,
  trackChangesEnabled: false,
  fieldsFilled: 0,
  lastParagraphIndex: 0,
  fillKeywords: [],
  userConfirmed: false,
  fillHistory: [],
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
  if (typeof output === 'string') return output;
  // after hook format: { output: "string result", title, metadata }
  if (typeof output.output === 'string' && output.output.length > 0) return output.output;
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
  if (toolName.startsWith('getActiveWorkbook') || toolName.startsWith('wps_excel_') || toolName.startsWith('et_')) return 'excel';
  if (toolName.startsWith('getCell') || toolName.startsWith('setCell') || toolName.startsWith('getRange') || toolName.startsWith('setRange')) return 'excel';
  if (toolName.startsWith('getSheet') || toolName.startsWith('createSheet') || toolName.startsWith('deleteSheet')) return 'excel';
  if (toolName.startsWith('renameSheet') || toolName.startsWith('copySheet') || toolName.startsWith('switchSheet') || toolName.startsWith('moveSheet')) return 'excel';
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

// ==================== 插件导出 ====================

export const WpsGovernancePlugin = async () => {
  return {

    // ── 执行后钩子：输出成功后才提交可变状态 ──
    // 回调签名: (input: { tool: string, sessionID: string, callID: string, args: object }, output: { content: array, isError?: boolean }) => Promise<void>
    "tool.execute.after": async (input, output) => {
      const outerTool = input.tool;

      if (outerTool === "wps-office_wps_office_execute" || outerTool === "wps_office_execute") {
        if (output?.isError) return;

        // after hook: args come from input.args (type: {tool, sessionID, callID, args})
        const toolArgs = input.args || {};
        const toolName = toolArgs.tool_name;
        const innerArgs = toolArgs.arguments || {};

        if (toolName === "getActiveDocument") {
          const outText = getOutputText(output);
          if (!outText) return;
          docInfoFetched = true;
          appReadState.word.activeDocRead = true;
          // 解析文档总段落数
          const paraMatch = outText.match(/总段数[：:]\s*(\d+)/i)
            || outText.match(/[Pp]aragraphs?[:\s]+(\d+)/i);
          if (paraMatch) {
            totalParagraphs = parseInt(paraMatch[1], 10);
          } else {
            totalParagraphs = 0;
          }
          // 重置模板填写状态（新文档）
          templateFilling.active = false;
          templateFilling.docFetched = true;
          allBatchesComplete = false;
          batchCount = 0;
          lastBatchParaIndex = 0;
          templateFilling.paragraphsFetched = false;
          templateFilling.trackChangesEnabled = false;
          templateFilling.userConfirmed = false;
          templateFilling.fillKeywords = [];
          templateFilling.fillHistory = [];
          templateFilling.fieldsFilled = 0;
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
          replaceCalledThisBatch = false;
          proofreadHadIssues = false;
          proofreadIssueOriginals = [];
          replaceCountThisBatch = 0;
          templateFilling.paragraphsFetched = true;
          templateFilling.lastParagraphIndex = ranges[ranges.length - 1].index;
          // 检测所有批次是否完成
          if (totalParagraphs > 0 && lastBatchParaIndex >= totalParagraphs) {
            allBatchesComplete = true;
          }
          return;
        }

        if (toolName === "enableTrackChanges") {
          const outText = getOutputText(output);
          if (!outText) return;
          trackChangesOn = innerArgs.enable === true;
          templateFilling.trackChangesEnabled = innerArgs.enable === true;
          return;
        }

        if (toolName === "proofreadBasic") {
          const outText = getOutputText(output);
          if (!outText) return;
          proofreadCalledThisBatch = true;
          aiProofreadDoneThisBatch = false;
          replaceCalledThisBatch = false;
          proofreadHadIssues = false;
          proofreadIssueOriginals = [];
          try {
            const parsed = JSON.parse(outText);
            if (parsed && Array.isArray(parsed.issues)) {
              proofreadHadIssues = parsed.issues.length > 0;
              proofreadIssueOriginals = parsed.issues
                .map(i => i.original)
                .filter(Boolean);
            }
          } catch (_e) {}
          return;
        }

        if (toolName === "replaceInParagraph") {
          replaceCalledThisBatch = true;
          replaceCountThisBatch++;
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

        if (toolName === "smartFillField") {
          templateFilling.active = true;
          templateFilling.fieldsFilled++;
          const keyword = innerArgs.keyword;
          const value = innerArgs.value;
          if (keyword) {
            templateFilling.fillKeywords.push(keyword);
          }
          if (keyword && value !== undefined) {
            templateFilling.fillHistory.push({ keyword, value, underline: true });
          }
          if (innerArgs._field_mapping_confirmed) {
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
    // 回调签名: (input: { tool: string, sessionID: string, callID: string, args: object }, output: never) => Promise<void>
    // rules: G1-G7 通用规则, P1-P16 校对规则, T1-T11 模板填写规则
    "tool.execute.before": async (input, output) => {
      const outerTool = input.tool;

      // ==================== 规则 G1：网关强制 ====================
      const gatewayName = DIRECT_TO_GATEWAY[outerTool];
      if (gatewayName) {
        throw new Error(
          `【执行治理】请通过网关调用 ${gatewayName}，不要直接调用 ${outerTool}。` +
          `使用方法：wps_office_execute({ tool_name: "${gatewayName}", arguments: {...} })`
        );
      }

      // ==================== 规则 G2：wps_execute_method 白名单 ====================
      if (outerTool === "wps-office_wps_execute_method" || outerTool === "wps_execute_method") {
        const args = input.args || {};
        const method = args.method || '';
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
      if (outerTool !== "wps-office_wps_office_execute" && outerTool !== "wps_office_execute") return;

      const toolArgs = input.args || {};
      const toolName = toolArgs.tool_name;
      const innerArgs = toolArgs.arguments || {};

      // 跳过检测/信息类工具
      if (!toolName) return;

      // ==================== 规则 G5：文件路径安全检查 ====================
      checkFilePathSafety(innerArgs);

      // ==================== 规则 G6：密码参数保护 ====================
      checkPasswordProtection(toolName, innerArgs);

      // ==================== 规则 G3：读前必写 ====================
      if (requiresReadBeforeWrite(toolName)) {
        const appType = appTypeFromConfig(innerArgs.appType) || getAppType(toolName);
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
        const confirm = innerArgs.confirm;
        if (confirm !== true) {
          throw new Error(
            `【执行治理】${toolName} 是破坏性操作，必须传递 confirm: true 确认。` +
            `请在调用参数中添加 arguments: { ..., confirm: true } 以确认此操作。`
          );
        }
      }

      // ==================== 规则 G7：参数范围校验 ====================
      checkParamRange(toolName, innerArgs);

      // ── 以下为分批校对专用规则（P1-P11） ──

      if (toolName === "getActiveDocument" || toolName === "enableTrackChanges") {
        return;
      }

      // ── 规则 P1 + P2：getDocumentParagraphs ──
      if (toolName === "getDocumentParagraphs") {
        // 所有批次已完成，禁止再获取段落，应生成报告
        if (allBatchesComplete) {
          throw new Error(
            `【执行治理】所有 ${batchCount} 批已全部完成（段落 1-${lastBatchParaIndex}/${totalParagraphs}）。\n` +
            `请直接生成校对报告（.校对报告.md），不要再调用 getDocumentParagraphs。`
          );
        }
        // P12：严格的逐批处理 — 当前批校对周期未完成前，禁止获取下一批
        if (batchStarted && !proofreadCalledThisBatch) {
          throw new Error(
            `【执行治理】【P12】当前批（段落 ${batchStartParaIndex}-${lastBatchParaIndex}）` +
            `尚未调用 proofreadBasic，不得获取下一批。\n` +
            `每批必须先调 proofreadBasic 进行基础校对，禁止仅凭视觉判断跳过。`
          );
        }
        if (batchStarted && proofreadCalledThisBatch && !aiProofreadDoneThisBatch) {
          throw new Error(
            `【执行治理】【P12】当前批的 AI 智能校对尚未确认。` +
            `调完 proofreadBasic 后必须调用 confirmBatchAiProofread 确认 AI 校对完成。`
          );
        }
        if (batchStarted && proofreadCalledThisBatch && proofreadHadIssues && !replaceCalledThisBatch) {
          throw new Error(
            `【执行治理】【P12】当前批（段落 ${batchStartParaIndex}-${lastBatchParaIndex}）` +
            `的校对问题尚未修复，不得获取下一批。\n` +
            `请先调用 replaceInParagraph 完成本批修复。`
          );
        }
        if (!docInfoFetched) {
          throw new Error(
            `【执行治理】请先调用 getActiveDocument 了解文档总段落数，` +
            `再获取段落列表。`
          );
        }
        const start = innerArgs.start_paragraph ?? 1;
        const end = innerArgs.end_paragraph ?? (start + 199);  // 默认200段/批
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
        const so = innerArgs.startOffset;
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
        if (!innerArgs.file_path && batchEndOffset !== null) {
          const text = innerArgs.text || '';
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
          if (batchStartOffset !== null) {
            const expectedLen = batchEndOffset - batchStartOffset;
            const maxLen = Math.max(expectedLen * 2, 50000);
            if (text.length > maxLen) {
              throw new Error(
                `【执行治理】【P6b】proofreadBasic 传入文本 ${text.length} 字符 ` +
                `远超本批预期范围 ${expectedLen} 字符。` +
                `禁止一次性校对多批。请严格每批 ≤200 段、单次 proofreadBasic 只传本批文本。`
              );
            }
          }
        }
        return;
      }

      // ── 规则 P13：getDocumentTextByRange 范围上限 ──
      if (toolName === "getDocumentTextByRange") {
        if (batchStarted && batchStartOffset !== null && batchEndOffset !== null) {
          const requestedLen = innerArgs.length;
          if (requestedLen !== undefined && requestedLen !== null) {
            const expectedBatchLen = batchEndOffset - batchStartOffset;
            const maxLen = Math.max(expectedBatchLen * 2, 50000);
            if (requestedLen > maxLen) {
              throw new Error(
                `【执行治理】【P13】getDocumentTextByRange length=${requestedLen} ` +
                `远超本批预期范围长度 ${expectedBatchLen}。` +
                `禁止一次性拉取多批文本。请只获取本批范围内的文本（≤200 段）。`
              );
            }
          }
        }
        return;
      }

      // ── 规则 P14：confirmBatchAiProofread 必须 proofreadBasic 已调用 ──
      if (toolName === "confirmBatchAiProofread") {
        if (batchStarted && !proofreadCalledThisBatch) {
          throw new Error(
            `【执行治理】【P14】confirmBatchAiProofread 必须在 proofreadBasic 之后调用。\n` +
            `当前批尚未进行基础校对，请先调用 proofreadBasic。` +
            `（禁止跳过基础校对直接确认 AI 校对）`
          );
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
        if (toolName === "findReplace") {
          if (batchStarted) {
            throw new Error(
              `【执行治理】分批校对流程中禁止使用 findReplace（不支持修订标记）。` +
              `请改用 replaceInParagraph。`
            );
          }
          // 非校对场景下也禁止用 findReplace 做模板填写
          const findTextFR = innerArgs.findText || innerArgs.find || '';
          const colonMatchFR = findTextFR.match(/^[\u4e00-\u9fff]+[：:]/);
          if (colonMatchFR && findTextFR.length >= 2 && findTextFR.length <= 20) {
            throw new Error(
              `【执行治理·禁止低级替换】检测到用 findReplace 做模板填写。\n` +
              `findText="${findTextFR}" 看起来是一个模板字段标签。\n` +
              `请改用 smartFillField 填写模板字段。`
            );
          }
          return;
        }
        if (toolName === "replaceInParagraph") {
          // 模板填写场景的"禁止低级替换"检查（优先级高于 P10）
          const findText = innerArgs.findText || innerArgs.find || '';
          const colonMatch = findText.match(/^[\u4e00-\u9fff]+[：:]/);
          if (colonMatch && findText.length >= 2 && findText.length <= 20) {
            throw new Error(
              `【执行治理·禁止低级替换】检测到用 replaceInParagraph 做模板填写。\n` +
              `findText="${findText}" 看起来是一个模板字段标签。\n` +
              `请改用 smartFillField 填写模板字段。`
            );
          }
          // P10/P11：仅在校对流程中强制 proofreadBeforeReplace
          // 模板填写/修复场景（templateFilling.active）跳过此检查
          if (!templateFilling.active && batchStarted && !proofreadCalledThisBatch) {
            throw new Error(
              `【执行治理】replaceInParagraph 必须在同一批的 proofreadBasic 之后调用。`
            );
          }
          if (!templateFilling.active && batchStarted && !aiProofreadDoneThisBatch) {
            throw new Error(
              `【执行治理】AI 智能校对未完成。请在 proofreadBasic 之后调用 ` +
              `confirmBatchAiProofread 确认 AI 校对已完成，再执行替换操作。`
            );
          }
          // P15：基础校对无 issue 时，禁止 AI 自行大量修复
          // 当 proofreadHadIssues = false（基础校对未发现问题），最多允许 1 次 AI 自定修复
          // 超过限制需传 _force_ai_fix: true 显式确认
          if (!templateFilling.active && batchStarted && !proofreadHadIssues) {
            if (replaceCountThisBatch >= MAX_AI_FIXES_NO_ISSUES) {
              if (!innerArgs._force_ai_fix) {
                throw new Error(
                  `【执行治理】【P15】基础校对未发现本批存在任何问题，` +
                  `AI 已自行修复 ${replaceCountThisBatch} 处。\n` +
                  `禁止 AI 编造不存在的校对问题。如确认此处确需修复，` +
                  `请在参数中添加 _force_ai_fix: true 以强制放行。`
                );
              }
            }
          }
          // P16：交叉校验 — 替换内容应与已知校对 issue 对应
          // 防止 AI 擅自修复 proofreadBasic 未发现的问题（"把正确的改成错误的"）
          if (!templateFilling.active && batchStarted && proofreadHadIssues && proofreadIssueOriginals.length > 0) {
            const findText = innerArgs.findText || innerArgs.find || '';
            if (findText && !innerArgs._force_ai_fix) {
              const matchesIssue = proofreadIssueOriginals.some(orig =>
                (orig && (orig.includes(findText) || findText.includes(orig)))
              );
              if (!matchesIssue) {
                const maxShow = 5;
                const shown = proofreadIssueOriginals.slice(0, maxShow);
                const more = proofreadIssueOriginals.length > maxShow ? `...等共 ${proofreadIssueOriginals.length} 条` : '';
                throw new Error(
                  `【执行治理】【P16】replaceInParagraph findText="${findText}" ` +
                  `与 proofreadBasic 找到的任何 issue 原文都不匹配。\n` +
                  `已知问题原文：${shown.join('、')}${more}\n` +
                  `AI 不应修复基础校对未发现的问题。如需强制修复请传 _force_ai_fix: true。`
                );
              }
            }
          }
          if (batchStarted) {
            const paraIdx = innerArgs.paragraphIndex;
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

      // ── 模板填写工作流规则（T1-T11） ──
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
        // T7：首次填写前必须输出字段对照表并获用户确认
        if (toolName === "smartFillField" && !templateFilling.userConfirmed) {
          if (!innerArgs._field_mapping_confirmed) {
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
        // T8：跳过签字字段
        if (innerArgs.keyword) {
          const signaturePatterns = ['签字', '签名', '签章', '盖章'];
          for (const pattern of signaturePatterns) {
            if (innerArgs.keyword.includes(pattern)) {
              throw new Error(
                `【执行治理·跳过签字】"${innerArgs.keyword}" 包含"${pattern}"，` +
                `属于手工签章字段，不应由AI填写。请跳过此字段。`
              );
            }
          }
        }
        // T6：禁止子串重复填写（可传 _substring_confirmed: true 绕过）
        // 使用场景：封面用"采购项目名称"，商务应答表用"项目名称"——不同字段，用户已确认
        const newKeyword = innerArgs.keyword;
        if (newKeyword && !innerArgs._substring_confirmed && templateFilling.fillKeywords.length > 0) {
          for (const existingKwd of templateFilling.fillKeywords) {
            if (existingKwd.includes(newKeyword) || newKeyword.includes(existingKwd)) {
              if (existingKwd !== newKeyword) {
                throw new Error(
                  `【执行治理·禁止重复】"${newKeyword}" 与已填写字段 "${existingKwd}" ` +
                  `存在包含关系（子串/超串）。请确认这是否是同一字段：\n` +
                  `- 如果是同一字段（如"包号"是"采购包号"的一部分），不要再次填写\n` +
                  `- 如果是不同字段，请向用户确认后在参数中添加 _substring_confirmed: true 绕过`
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
