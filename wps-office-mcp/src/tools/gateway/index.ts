/**
 * Input: 无
 * Output: 250+ 工具的索引
 * Pos: 工具索引构建器。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * 工具索引 - 老王的百宝箱
 * 自动从所有 RegisteredTool 提取索引信息，供 gateway 工具搜索使用
 */

import { allTools } from '../../tools';
import { wpsClient } from '../../client/wps-client';
import { ToolCallResult, ToolDefinition, RegisteredTool, ToolParameterSchema } from '../../types/tools';
import { WpsAppType } from '../../types/wps';

/**
 * 工具索引项
 */
export interface ToolIndexItem {
  name: string;
  description: string;
  keywords: string[];
  category: string;
  appType: WpsAppType;
  method: string;
  paramsSchema: Record<string, ToolParamSchema>;
  originalTool: RegisteredTool;
}

export interface ToolParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

/**
 * WPS 方法映射（工具名 -> WPS API 方法名）
 */
const METHOD_MAP: Record<string, string> = {
  wps_word_apply_style: 'applyStyle',
  wps_word_set_font: 'setFont',
  wps_word_generate_toc: 'generateToc',
  wps_word_insert_text: 'insertText',
  wps_word_find_replace: 'findReplace',
  wps_word_get_paragraphs: 'getParagraphs',
  wps_word_find_in_document: 'findInDocument',
  wps_word_smart_fill_field: 'smartFillField',
  wps_word_replace_bookmark_content: 'replaceBookmarkContent',
  wps_excel_set_formula: 'setFormula',
  wps_excel_generate_formula: 'generateFormula',
  wps_excel_diagnose_formula: 'diagnoseFormula',
  wps_excel_read_range: 'getRangeData',
  wps_excel_write_range: 'setRangeData',
  wps_excel_clean_data: 'cleanData',
  wps_excel_remove_duplicates: 'removeDuplicates',
  wps_excel_create_pivot_table: 'createPivotTable',
  wps_excel_update_pivot_table: 'updatePivotTable',
  wps_excel_create_chart: 'createChart',
  wps_excel_update_chart: 'updateChart',
  wps_ppt_add_slide: 'addSlide',
  wps_ppt_beautify: 'beautify',
  wps_ppt_unify_font: 'unifyFont',
  wps_convert_to_pdf: 'convertToPdf',
  wps_convert_format: 'convertFormat',
  wps_cache_data: 'cacheData',
  wps_get_cached_data: 'getCachedData',
  wps_list_cache: 'listCache',
  wps_clear_cache: 'clearCache',
  wps_get_active_document: 'getActiveDocument',
  wps_get_active_workbook: 'getActiveWorkbook',
  wps_get_active_presentation: 'getActivePresentation',
  wps_get_cell_value: 'getCellValue',
  wps_set_cell_value: 'setCellValue',
  wps_execute_method: 'executeMethod',
};

/**
 * 中文关键词映射
 */
const KEYWORDS_MAP: Record<string, string[]> = {
  wps_word_apply_style: ['样式', '应用样式', '标题', '正文', '格式'],
  wps_word_set_font: ['字体', '字号', '加粗', '斜体', '颜色', '下划线', '格式'],
  wps_word_generate_toc: ['目录', '大纲', '自动生成'],
  wps_word_insert_text: ['插入', '文本', '添加', '新建'],
  wps_word_find_replace: ['替换', '查找', '批量替换', '修改'],
  wps_word_get_paragraphs: ['段落', '结构', '获取'],
  wps_word_find_in_document: ['查找', '位置', '定位'],
  wps_word_smart_fill_field: ['填写', '模板', '表单', '占位符'],
  wps_word_replace_bookmark_content: ['书签', '替换'],
  wps_excel_set_formula: ['公式', '函数', '计算'],
  wps_excel_generate_formula: ['生成公式', '写公式', '创建公式'],
  wps_excel_diagnose_formula: ['诊断', '错误', '修复'],
  wps_excel_read_range: ['读取', '数据', '范围'],
  wps_excel_write_range: ['写入', '写入数据', '填充'],
  wps_excel_clean_data: ['清洗', '清理', '整理'],
  wps_excel_remove_duplicates: ['去重', '删除重复', '���复'],
  wps_excel_create_pivot_table: ['透视表', '汇总', '分析'],
  wps_excel_update_pivot_table: ['更新透视表'],
  wps_excel_create_chart: ['图表', '柱状图', '折线图', '饼图'],
  wps_excel_update_chart: ['更新图表'],
  wps_ppt_add_slide: ['幻灯片', '新建页面', '添加'],
  wps_ppt_beautify: ['美化', '优化', '排版'],
  wps_ppt_unify_font: ['统一字体', '字体'],
  wps_convert_to_pdf: ['PDF', '导出', '转换'],
  wps_convert_format: ['格式转换', '转格式'],
  wps_cache_data: ['缓存', '存储'],
  wps_get_cached_data: ['获取缓存'],
  wps_list_cache: ['列出缓存'],
  wps_clear_cache: ['清除缓存'],
  wps_get_active_document: ['文档', '当前文档'],
  wps_get_active_workbook: ['工作簿', '当前工作簿'],
  wps_get_active_presentation: ['演示', '当前演示'],
  wps_get_cell_value: ['单元格', '读取'],
  wps_set_cell_value: ['单元格', '写入'],
};

/**
 * 从工具定义提取 appType
 */
function getAppType(toolName: string): WpsAppType {
  if (toolName.includes('word') || toolName === 'wps_get_active_document') {
    return WpsAppType.WRITER;
  }
  if (toolName.includes('excel') || toolName === 'wps_get_active_workbook' || toolName.includes('cell')) {
    return WpsAppType.SPREADSHEET;
  }
  if (toolName.includes('ppt') || toolName === 'wps_get_active_presentation') {
    return WpsAppType.PRESENTATION;
  }
  return WpsAppType.WRITER;
}

/**
 * 从工具定义提取 WPS 方法名
 */
function getWpsMethod(toolName: string): string {
  return METHOD_MAP[toolName] || toolName.replace(/^wps_/, '');
}

/**
 * 从工具定义提取分类
 */
function getCategory(toolName: string): string {
  if (toolName.includes('word') || toolName.includes('document')) {
    return 'word';
  }
  if (toolName.includes('excel') || toolName.includes('spreadsheet')) {
    return 'excel';
  }
  if (toolName.includes('ppt') || toolName.includes('presentation')) {
    return 'ppt';
  }
  return 'common';
}

/**
 * 从工具定义提取关键词
 */
function getKeywords(definition: ToolDefinition, toolName: string): string[] {
  const defaultKeywords = KEYWORDS_MAP[toolName] || [];
  const desc = definition.description || '';
  const extracted: string[] = [];

  const match = desc.match(/[\u4e00-\u9fa5]+/g);
  if (match) {
    extracted.push(...match);
  }

  return [...new Set([...defaultKeywords, ...extracted])];
}

/**
 * 参数 Schema 转换
 */
function convertParamsSchema(props: Record<string, ToolParameterSchema>): Record<string, ToolParamSchema> {
  const result: Record<string, ToolParamSchema> = {};
  for (const [key, schema] of Object.entries(props)) {
    result[key] = {
      type: schema.type,
      description: schema.description || '',
      required: Array.isArray(schema.required) ? schema.required.includes(key) : false,
      default: schema.default,
      enum: schema.enum,
    };
  }
  return result;
}

/**
 * 构建工具索引
 */
export function buildToolsIndex(): ToolIndexItem[] {
  const index: ToolIndexItem[] = [];

  for (const tool of allTools) {
    const { definition } = tool;
    const name = definition.name;
    const category = getCategory(name);
    const appType = getAppType(name);
    const method = getWpsMethod(name);
    const keywords = getKeywords(definition, name);

    index.push({
      name,
      description: definition.description,
      keywords,
      category,
      appType,
      method,
      paramsSchema: convertParamsSchema(definition.inputSchema.properties),
      originalTool: tool,
    });
  }

  return index;
}

/**
 * 工具索引（单例）
 */
export const TOOLS_INDEX: ToolIndexItem[] = buildToolsIndex();

/**
 * 搜索选项
 */
export interface SearchOptions {
  query: string;
  category?: string;
  limit?: number;
}

/**
 * 搜索结果
 */
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

/**
 * 搜索工具
 */
export function searchTools(options: SearchOptions): SearchResult {
  const { query, category, limit = 10 } = options;

  let filtered = TOOLS_INDEX;

  if (category) {
    filtered = filtered.filter((tool) => tool.category === category);
  }

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }

  let sorted = filtered;
  if (query) {
    const q = query.toLowerCase();
    sorted = filtered.sort((a, b) => {
      const aExact = a.name.toLowerCase() === q ? 1 : 0;
      const bExact = b.name.toLowerCase() === q ? 1 : 0;
      const aStart = a.name.toLowerCase().startsWith(q) ? 1 : 0;
      const bStart = b.name.toLowerCase().startsWith(q) ? 1 : 0;
      const aContains = a.keywords.some((k) => k.includes(q)) ? 1 : 0;
      const bContains = b.keywords.some((k) => k.includes(q)) ? 1 : 0;

      return (
        bExact -
        aExact +
        bStart -
        aStart +
        bContains -
        aContains
      );
    });
  }

  const results = sorted.slice(0, limit).map((tool) => ({
    name: tool.name,
    description: tool.description.split('\n')[0],
    category: tool.category,
    appType: tool.appType,
    params: tool.paramsSchema,
    example: `wps_office_execute('${tool.name}', {...})`,
  }));

  return {
    total: filtered.length,
    results,
    next_steps:
      "使用 wps_office_execute 执行，或使用 wps_execute_method 兜底",
  };
}

/**
 * 执行选项
 */
export interface ExecuteOptions {
  tool_name: string;
  arguments: Record<string, unknown>;
}

/**
 * 执行工具
 */
export async function executeTool(
  options: ExecuteOptions
): Promise<ToolCallResult> {
  const { tool_name, arguments: args } = options;

  const indexItem = TOOLS_INDEX.find((t) => t.name === tool_name);

  if (!indexItem) {
    return {
      id: '',
      success: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `工具 "${tool_name}" 不存在`,
            available: TOOLS_INDEX.slice(0, 20).map((t) => t.name),
            suggestion: '使用 wps_office_search 查找可用工具',
          }),
        },
      ],
    };
  }

  const requiredParams = Object.entries(indexItem.paramsSchema).filter(
    ([, schema]) => schema.required
  );
  const missingParams = requiredParams.filter(
    ([name]) => args[name] === undefined
  );

  if (missingParams.length > 0) {
    return {
      id: '',
      success: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `缺少必需参数`,
            missing: missingParams.map(([name]) => name),
            schema: indexItem.paramsSchema,
          }),
        },
      ],
    };
  }

  try {
    const result = await wpsClient.executeMethod(
      indexItem.method,
      args as Record<string, unknown>,
      indexItem.appType
    );

    return {
      id: '',
      success: result.success,
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    return {
      id: '',
      success: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: `执行失败: ${error}`,
          }),
        },
      ],
    };
  }
}

export default {
  TOOLS_INDEX,
  searchTools,
  executeTool,
  buildToolsIndex,
};