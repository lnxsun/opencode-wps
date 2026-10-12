/**
 * WPS Office COM Actions 索引
 * 共若干 COM Actions（数量随开发持续演进，**以 COM_ACTIONS 数组长度为准**，不在此手写）
 *
 * 工具名称映射说明：
 * - Gateway 使用短名称（如 setFont、addSlide）进行索引和搜索
 * - 执行时通过 wpsClient.executeMethod() 动态调用 WPS COM 方法
 * - WPS Client 支持动态方法名执行，无需显式映射
 *
 * 验证状态：
 * - verified: 已通过实际测试验证可用
 * - indexed: 仅索引，无直接实现（通过 executeMethod 动态调用）
 * - stub: 有占位实现，尚未完整测试
 */

// 验证状态枚举与类型定义已拆到 ./com-actions（数据表单一职责）
import { wpsClient } from '../../client/wps-client';
import { RegisteredTool, ToolCallResult, ToolHandler, ToolInputSchema } from '../../types/tools';
import { allTools } from '../index';
import { COM_ACTIONS, ToolIndexItem, ToolParamSchema, VerificationStatus } from './com-actions';

export { VerificationStatus, ToolIndexItem, ToolParamSchema };

// ==================== Schema 自动生成 ====================
// 从注册工具定义自动生成 COM_ACTIONS 的 paramsSchema，消除双重定义
// 纯 PS1 工具（无对应注册工具）仍使用硬编码 paramsSchema 作为兜底

function reverseParamMap(forward: Record<string, string>): Record<string, string> {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(forward)) rev[v] = k;
  return rev;
}

function inputSchemaToParamsSchema(
  inputSchema: ToolInputSchema,
  revMap?: Record<string, string>
): Record<string, ToolParamSchema> {
  const requiredSet = new Set(inputSchema.required || []);
  const params: Record<string, ToolParamSchema> = {};
  for (const [key, prop] of Object.entries(inputSchema.properties || {})) {
    const mappedKey = revMap?.[key] ?? key;
    params[mappedKey] = {
      type: prop.type,
      description: prop.description,
      required: requiredSet.has(key),
    };
    if (prop.enum) params[mappedKey].enum = prop.enum;
  }
  return params;
}

// ==================== 工具验证状态 ====================
// verified: PowerShell 脚本 + wps-client.ts 中已完整实现并测试
// indexed: 仅在 Gateway 索引中存在，通过 executeMethod 动态调用
// stub: 有占位实现，尚未完整测试

// 将 wps_xxx_xxx 风格的短名称转为驼峰 (set_font → setFont)
function toCamelCase(snake: string): string {
  return snake.replace(/_(.)/g, (_, c) => c.toUpperCase());
}

// 工具注册名 → appType 映射（从 name 前缀推断，值与 WpsAppType 一致）
function appTypeFromName(name: string): string {
  const prefix = name.match(/^wps_(word|excel|ppt|common)_/i)?.[1]?.toLowerCase();
  if (prefix === 'excel') return 'et';
  if (prefix === 'ppt') return 'wpp';
  return 'wps';
}

// 逐工具参数名映射：COM_ACTIONS 的 camelCase 参数名 → TS handler 的期望参数名
// 仅在 COM schema 与 handler inputSchema 参数名不一致时需要
const HANDLER_PARAM_MAP: Record<string, Record<string, string>> = {
  setFont: { fontName: 'font_name', fontSize: 'font_size' },
  applyStyle: { styleName: 'style_name' },
  beautifySlide: {
    slideIndex: 'slide_index',
    colorScheme: 'color_scheme',
    beautifyAll: 'beautify_all',
  },
  findInDocument: {
    text: 'find_text',
    matchCase: 'match_case',
    matchWholeWord: 'match_whole_word',
    maxResults: 'max_results',
  },
  replaceBookmarkContent: { content: 'text' },
  smartFillField: { fillMode: 'fill_mode' },
  getDocumentParagraphs: { startParagraph: 'start_paragraph', endParagraph: 'end_paragraph' },
  replaceInParagraph: {
    paragraphIndex: 'paragraph_index',
    findText: 'find_text',
    replaceText: 'replace_text',
    matchCase: 'match_case',
    matchWholeWord: 'match_whole_word',
    replaceAll: 'replace_all',
  },
  proofreadBasic: { startOffset: 'start_offset' },

  getDocumentTextByRange: { startOffset: 'start_offset' },
};

// 从注册工具中预先构建 handler 映射表：COM 短名 + appType → TS handler
// 使用 "name|appType" 复合键解决跨应用同名冲突（如 insertImage 同时存在于 Word 和 PPT）
// 使 executeTool 能根据 TOOLS_INDEX 中的 appType 精确路由到正确的 handler
const HANDLER_MAP = new Map<string, ToolHandler>();
const toolByName = new Map<string, RegisteredTool>();
for (const tool of allTools) {
  toolByName.set(tool.definition.name, tool);
  const shortName = tool.definition.name.replace(/^wps_(word|excel|ppt|common)_/i, '');
  const camelName = toCamelCase(shortName);
  const appType = appTypeFromName(tool.definition.name);
  const key = `${camelName}|${appType}`;
  if (HANDLER_MAP.has(key)) {
    console.warn(`[HANDLER_MAP] 重复键：${key}（来自 ${tool.definition.name}）`);
  }
  HANDLER_MAP.set(key, tool.handler);
}
// 处理命名不遵循 wps_{word|excel|ppt|common}_ 约定的工具
// wps_convert_to_pdf 无 common 段，toCamelCase 产生 wpsConvertToPdf 而非 convertToPDF
const pdfTool = toolByName.get('wps_convert_to_pdf');
if (pdfTool) {
  HANDLER_MAP.set('convertToPDF|wps', pdfTool.handler);
}
const paragraphsTool = toolByName.get('wps_word_get_paragraphs');
if (paragraphsTool) {
  HANDLER_MAP.set('getDocumentParagraphs|wps', paragraphsTool.handler);
}
// ⚠️ Issue #382：校对 4 个纯 TS 工具（proofreadBasic / confirmBatchAiProofread / proofreadAccumulate /
// generateProofreadReport）**已直连注册**（DECISION-1），不再是「网关专属」——它们的 handler 由上面的
// `allTools` 循环统一注入，本处不再单独喂表（原 proofreadGatewayRoutes 注入已删除）。

// 构建 schema 映射表：COM 短名 → paramsSchema
// 优先从注册工具定义自动生成，消除 COM_ACTIONS 的 paramsSchema 双重定义
const SCHEMA_MAP = new Map<string, Record<string, ToolParamSchema>>();
for (const tool of allTools) {
  const shortName = tool.definition.name.replace(/^wps_(word|excel|ppt|common)_/i, '');
  const camelName = toCamelCase(shortName);
  const revMap = reverseParamMap(HANDLER_PARAM_MAP[camelName] || {});
  const schema = inputSchemaToParamsSchema(tool.definition.inputSchema, revMap);
  if (Object.keys(schema).length > 0) SCHEMA_MAP.set(camelName, schema);
}
if (paragraphsTool) {
  const schema = inputSchemaToParamsSchema(paragraphsTool.definition.inputSchema);
  if (Object.keys(schema).length > 0) SCHEMA_MAP.set('getDocumentParagraphs', schema);
}

const VERIFIED_TOOLS = new Set([
  // === Common ===
  'ping',
  'wireCheck',
  'getAppInfo',
  'getContext',
  'getOpenDocuments',
  'getOpenPresentations',
  'switchDocument',
  'switchPresentation',
  'switchWorkbook',
  'convertToPDF',
  'convertFormat',
  'trim',
  'underline',
  'placeholder',
  'writeFile',
  // === Word ===
  'getActiveDocument',
  'getDocumentText',
  'getDocumentTextByRange',
  'getSelectedText',
  'setSelectedText',
  'save',
  'saveAs',
  'openFile',
  'openDocument',
  'createDocument',
  'closeDocument',
  'setFont',
  'setTextColor',
  'setParagraph',
  'applyStyle',
  'generateTOC',
  'insertBookmark',
  'getBookmarks',
  'replaceBookmarkContent',
  'findInDocument',
  'findReplace',
  'getDocumentParagraphs',
  'getDocumentStats',
  'insertTable',
  'insertImage',
  'setPageSetup',
  'insertHeader',
  'insertFooter',
  'insertHyperlink',
  'insertPageBreak',
  'setHyperlink',
  'smartFillField',
  'addComment',
  'getComments',
  'insertText',
  'setLineSpacing',
  'insertSectionBreak',
  // === Word: Proofreading ===
  'enableTrackChanges',
  'getTrackChangesStatus',
  'replaceInParagraph',
  'proofreadBasic',
  'confirmBatchAiProofread',
  // === Excel ===
  'getActiveWorkbook',
  'getCellValue',
  'setCellValue',
  'getRangeData',
  'setRangeData',
  'setFormula',
  'getFormula',
  'setArrayFormula',
  'diagnoseFormula',
  'evaluateFormula',
  'autoSum',
  'createSheet',
  'deleteSheet',
  'renameSheet',
  'copySheet',
  'getSheetList',
  'switchSheet',
  'moveSheet',
  'createPivotTable',
  'updatePivotTable',
  'createChart',
  'updateChart',
  'createDonutChart',
  'createFlowChart',
  'createGauge',
  'createGrid',
  'createKpiCards',
  'createMiniCharts',
  'setCellFormat',
  'setCellStyle',
  'setBorder',
  'copyFormat',
  'clearFormats',
  'addConditionalFormat',
  'removeConditionalFormat',
  'getConditionalFormats',
  'addDataValidation',
  'removeDataValidation',
  'getDataValidations',
  'mergeCells',
  'unmergeCells',
  'setColumnWidth',
  'setRowHeight',
  'autoFitColumn',
  'autoFitRow',
  'autoFitAll',
  'setNumberFormat',
  'wrapText',
  'setPrintArea',
  'getSelection',
  'clearRange',
  'insertRows',
  'insertColumns',
  'deleteRows',
  'deleteColumns',
  'hideRows',
  'hideColumns',
  'showRows',
  'showColumns',
  'groupRows',
  'groupColumns',
  'freezePanes',
  'unfreezePanes',
  'findInSheet',
  'replaceInSheet',
  'copyRange',
  'pasteRange',
  'fillSeries',
  'transpose',
  'textToColumns',
  'subtotal',
  'createNamedRange',
  'deleteNamedRange',
  'getNamedRanges',
  'addCellComment',
  'deleteCellComment',
  'getCellComments',
  'protectSheet',
  'unprotectSheet',
  'protectWorkbook',
  'insertExcelImage',
  'lockCells',
  'openWorkbook',
  'getOpenWorkbooks',
  'createWorkbook',
  'cleanData',
  'removeDuplicates',
  'sortRange',
  'autoFilter',
  'getCellInfo',
  'refreshLinks',
  'consolidate',
  'calculateSheet',
  'getExcelContext',
  'generateFormula',
  'setZoom',
  'remove_duplicates',
  'unify_date',
  'closeWorkbook',
  // === PPT ===
  'getActivePresentation',
  'createPresentation',
  'openPresentation',
  'closePresentation',
  'getSlideCount',
  'addSlide',
  'deleteSlide',
  'duplicateSlide',
  'moveSlide',
  'switchSlide',
  'getSlideInfo',
  'getSlideTitle',
  'getSlideNotes',
  'setSlideTitle',
  'setSlideSubtitle',
  'setSlideContent',
  'setSlideNotes',
  'setSlideBackground',
  'setBackgroundColor',
  'setSlideSize',
  'setSlideTheme',
  'setFontColor',
  'setShapeFill',
  'setBackgroundGradient',
  'setBackgroundImage',
  'setSlideTransition',
  'removeSlideTransition',
  'applyTransitionToAll',
  'addAnimation',
  'removeAnimation',
  'setAnimationOrder',
  'getAnimations',
  'addAnimationPreset',
  'addEmphasisAnimation',
  'beautifySlide',
  'beautifyAllSlides',
  'autoBeautifySlide',
  'unifyFont',
  'addShape',
  'deleteShape',
  'duplicateShape',
  'getShapes',
  'alignShapes',
  'groupShapes',
  'distributeShapes',
  'addTextBox',
  'setTextBoxText',
  'getTextBoxes',
  'setTextBoxStyle',
  'deleteTextBox',
  'insertPptImage',
  'deletePptImage',
  'setImageStyle',
  'insertPptChart',
  'setPptChartData',
  'setPptChartStyle',
  'insertPptTable',
  'getPptTableCell',
  'setPptTableCell',
  'setPptTableStyle',
  'setPptTableCellStyle',
  'setPptTableRowStyle',
  'setShapeStyle',
  'setShapeBorder',
  'setShapeShadow',
  'setShapeGradient',
  'setShapePosition',
  'setShapeZOrder',
  'setShapeFullStyle',
  'setShapeRoundness',
  'setShapeTransparency',
  'setShapeText',
  'addConnector',
  'addArrow',
  'setSlideLayout',
  'setSlideNumber',
  'setPptDateTime',
  'setPptFooter',
  'setMasterBackground',
  'getSlideMaster',
  'applyColorScheme',
  'addPptHyperlink',
  'removePptHyperlink',
  'findPptText',
  'replacePptText',
  'addTitleDecoration',
  'addPageIndicator',
  'addMasterElement',
  'startSlideShow',
  'endSlideShow',
  'autoLayout',
  'smartDistribute',
  'create3DText',
  'set3DDepth',
  'set3DMaterial',
  'set3DRotation',
  // Export 工具 (Issue #15)
  'exportChartAsImage',
  'exportRangeAsImage',
  'exportSlideAsImage',
]);

// 计算索引中每个工具的验证状态
function getToolStatus(toolName: string): VerificationStatus {
  return VERIFIED_TOOLS.has(toolName) ? 'verified' : 'indexed';
}

export const TOOLS_INDEX: ToolIndexItem[] = COM_ACTIONS.map(tool => ({
  ...tool,
  status: getToolStatus(tool.name),
}));

export interface SearchOptions {
  query: string;
  category?: string;
  limit?: number;
}

export interface SearchResult {
  total: number;
  results: Array<{
    name: string;
    description: string;
    category: string;
    appType: string;
    params: Record<string, ToolParamSchema>;
    example: string;
  }>;
  next_steps: string;
}

export function searchTools(options: SearchOptions): SearchResult {
  const { query, category, limit = 10 } = options;
  let filtered = TOOLS_INDEX;
  if (category) filtered = filtered.filter(t => t.category === category);
  if (query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    filtered = filtered.filter(t =>
      terms.some(
        term =>
          t.name.toLowerCase().includes(term) ||
          t.description.toLowerCase().includes(term) ||
          t.keywords.some(k => k.toLowerCase().includes(term))
      )
    );
  }
  if (query) {
    const sortQ = query.toLowerCase();
    filtered = filtered.sort((a, b) => {
      const aExact = a.name.toLowerCase() === sortQ ? 1 : 0;
      const bExact = b.name.toLowerCase() === sortQ ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aStart = a.name.toLowerCase().startsWith(sortQ) ? 1 : 0;
      const bStart = b.name.toLowerCase().startsWith(sortQ) ? 1 : 0;
      if (aStart !== bStart) return bStart - aStart;
      return a.name.localeCompare(b.name);
    });
  }
  const results = filtered.slice(0, limit).map(tool => ({
    name: tool.name,
    description: tool.description.split('\n')[0],
    category: tool.category,
    appType: tool.appType,
    params: SCHEMA_MAP.get(tool.name) ?? tool.paramsSchema,
    example: `wps_office_execute('${tool.name}', {...})`,
  }));
  return { total: filtered.length, results, next_steps: hintFor(query, results) };
}

/** 空结果/少结果的**可自纠提示**（Issue #382 §五黑盒通道①）：`searchTools` 是关键词 `includes` 匹配
 * （无语义）—— 猜错词就是 `total: 0` 且**原先无任何提示该换什么词**。本函数补上「怎么自纠」。
 * 口径单源：只在结果为空时给**相近名**（子串/前缀命中的工具名），不猜语义（不假装能理解同义词）。 */
function hintFor(query: string, results: Array<{ name: string }>): string {
  if (results.length > 0) return '使用 wps_office_execute 执行';
  const q = String(query || '').toLowerCase();
  // 相近名 = 「工具名含 query 的某一段」或「query 含工具名的某一段」（双向子串），只为给 AI 可自纠的线索
  const parts = q.split(/[\s_-]+/).filter(p => p.length >= 2);
  const near = TOOLS_INDEX.filter(t =>
    parts.some(
      p => t.name.toLowerCase().includes(p) || t.keywords.some(k => k.toLowerCase().includes(p))
    )
  ).map(t => t.name);
  return (
    `未匹配到任何工具（关键词匹配，无语义）。自纠方式：① 换同义词/换更短的关键词重搜；` +
    `② 调 wps_office_search({ query: '' }) 列出全量（不传 query 即全量 ${TOOLS_INDEX.length} 条）；` +
    `③ 内置工具（tools/list 里直接可见的 wps_* 不带应用段的）**无需搜索，直接调用**。` +
    (near.length > 0 ? `可能的相近工具：${near.slice(0, 8).join(' / ')}` : '')
  );
}

export interface ExecuteOptions {
  tool_name: string;
  arguments: Record<string, unknown>;
}

export async function executeTool(options: ExecuteOptions): Promise<ToolCallResult> {
  const { tool_name, arguments: args } = options;
  const indexItem = TOOLS_INDEX.find(t => t.name === tool_name);
  if (!indexItem) {
    return {
      id: '',
      success: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `工具 "${tool_name}" 不存在`,
            suggestion: '使用 wps_office_search 查找可用工具',
          }),
        },
      ],
    };
  }
  // 优先使用 TS handler（带参数校验、类型安全、详细错误信息）
  // 用 "name|appType" 复合键精确匹配，处理跨应用同名工具
  const camelName = toCamelCase(tool_name);
  const handlerKey = `${tool_name}|${indexItem.appType}`;
  const fallbackKey = `${camelName}|${indexItem.appType}`;
  const handler = HANDLER_MAP.get(handlerKey) ?? HANDLER_MAP.get(fallbackKey);
  if (handler) {
    // 应用逐工具参数名映射（将 COM 参数名转为 handler 期望的参数名）
    const paramMap = HANDLER_PARAM_MAP[tool_name];
    const mappedArgs =
      paramMap && Object.keys(paramMap).length > 0
        ? Object.fromEntries(Object.entries(args).map(([k, v]) => [paramMap[k] ?? k, v]))
        : args;
    try {
      return await handler(mappedArgs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
      return {
        id: '',
        success: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `TS handler 执行失败`,
              details: errorMessage,
              tool: tool_name,
              params: args,
            }),
          },
        ],
      };
    }
  }
  // 无 TS handler，直接透传 PS1（兜底）
  try {
    const result = await wpsClient.executeMethod(
      tool_name,
      args as Record<string, unknown>,
      indexItem.appType
    );
    return {
      id: '',
      success: result.success,
      content: [
        { type: 'text', text: JSON.stringify({ result, tool_name, appType: indexItem.appType }) },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    return {
      id: '',
      success: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: `执行工具 "${tool_name}" 失败`,
              details: errorMessage,
              tool: tool_name,
              appType: indexItem.appType,
              params: args,
              // 仅在非生产环境包含堆栈
              ...(process.env.NODE_ENV !== 'production' && { stack: errorStack }),
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

export default { TOOLS_INDEX, searchTools, executeTool };
