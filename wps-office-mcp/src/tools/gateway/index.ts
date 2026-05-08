/**
 * WPS Office COM Actions 索引
 * 从 wps-com.ps1 自动提取的 234 个 COM Actions
 * 供 wps_office_search 和 wps_office_execute 使用
 */

import { wpsClient } from '../../client/wps-client';
import { ToolCallResult } from '../../types/tools';
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
  paramsSchema: Record<string, ToolParamSchema>;
}

export interface ToolParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

/**
 * 所有 234 个 COM Actions 索引
 * 从 wps-com.ps1 完整提取
 */
const COM_ACTIONS: ToolIndexItem[] = [
  // === Word 操作 (35) ===
  { name: 'getActiveDocument', description: '获取当前 WPS 文档信息', keywords: ['文档', '当前', '活动', 'info'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'getDocumentText', description: '获取文档全部文本内容', keywords: ['文本', '内容', '获取', 'text'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'getSelectedText', description: '获取选中的文本', keywords: ['选中', '选区', '获取', 'selection'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'setSelectedText', description: '设置选中的文本内容', keywords: ['设置', '文本', '选中', 'set'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '文本内容', required: true } } },
  { name: 'save', description: '保存当前文档', keywords: ['保存', '存盘', 'save'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'saveAs', description: '另存文档', keywords: ['另存', '保存为', 'save as'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { filePath: { type: 'string', description: '文件路径', required: true }, format: { type: 'string', description: '格式', required: false } } },
  { name: 'openFile', description: '打开文档', keywords: ['打开', '文件', 'open'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { filePath: { type: 'string', description: '文件路径', required: true } } },
  { name: 'createDocument', description: '新建空白文档', keywords: ['新建', '创建', '文档', 'new'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'closeDocument', description: '关闭当前文档', keywords: ['关闭', '退出', 'close'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'setFont', description: '设置字体格式', keywords: ['字体', '格式', '设置', 'font'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { fontName: { type: 'string', description: '字体名称', required: false }, fontSize: { type: 'number', description: '字号', required: false }, bold: { type: 'boolean', description: '加粗', required: false }, italic: { type: 'boolean', description: '斜体', required: false }, color: { type: 'string', description: '颜色', required: false } } },
  { name: 'setParagraph', description: '设置段落格式', keywords: ['段落', '格式', '对齐', 'paragraph'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { alignment: { type: 'string', description: '对齐方式', required: false, enum: ['left', 'center', 'right', 'justify'] }, lineSpacing: { type: 'number', description: '行距', required: false } } },
  { name: 'applyStyle', description: '应用文档样式', keywords: ['样式', '应用', '标题', 'style'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { styleName: { type: 'string', description: '样式名称', required: true } } },
  { name: 'generateTOC', description: '生成目录', keywords: ['目录', '大纲', '生成', 'toc'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'insertBookmark', description: '插入书签', keywords: ['书签', '插入', 'bookmark'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { name: { type: 'string', description: '书签名称', required: true } } },
  { name: 'getBookmarks', description: '获取文档中所有书签', keywords: ['书签', '列表', 'bookmarks'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'replaceBookmarkContent', description: '替换书签内容', keywords: ['书签', '替换', '内容', 'bookmark'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { name: { type: 'string', description: '书签名称', required: true }, content: { type: 'string', description: '替换内容', required: true } } },
  { name: 'findInDocument', description: '在文档中查找文本', keywords: ['查找', '搜索', '文档', 'find'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '查找文本', required: true } } },
  { name: 'findReplace', description: '查找替换', keywords: ['替换', '查找', '批量', 'replace'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { find: { type: 'string', description: '查找内容', required: true }, replace: { type: 'string', description: '替换为', required: true } } },
  { name: 'getDocumentParagraphs', description: '获取文档段落列表', keywords: ['段落', '结构', '列表', 'paragraphs'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'getDocumentStats', description: '获取文档统计信息', keywords: ['统计', '信息', '字数', 'stats'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'insertTable', description: '插入表格', keywords: ['表格', '插入', '新建', 'table'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { rows: { type: 'number', description: '行数', required: true }, cols: { type: 'number', description: '列数', required: true } } },
  { name: 'insertImage', description: '插入图片', keywords: ['图片', '插入', '图像', 'image'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { filePath: { type: 'string', description: '图片路径', required: true }, width: { type: 'number', description: '宽度', required: false }, height: { type: 'number', description: '高度', required: false } } },
  { name: 'setPageSetup', description: '设置页面布局', keywords: ['页面', '边距', '设置', 'page'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { pageWidth: { type: 'number', description: '页宽', required: false }, pageHeight: { type: 'number', description: '页高', required: false }, marginTop: { type: 'number', description: '上边距', required: false }, marginBottom: { type: 'number', description: '下边距', required: false }, marginLeft: { type: 'number', description: '左边距', required: false }, marginRight: { type: 'number', description: '右边距', required: false } } },
  { name: 'insertHeader', description: '插入页眉', keywords: ['页眉', '插入', 'header'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '页眉内容', required: true } } },
  { name: 'insertFooter', description: '插入页脚', keywords: ['页脚', '插入', 'footer'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '页脚内容', required: true } } },
  { name: 'insertHyperlink', description: '插入超链接', keywords: ['超链接', '链接', '插入', 'hyperlink'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '链接文本', required: true }, address: { type: 'string', description: '链接地址', required: true } } },
  { name: 'insertPageBreak', description: '插入分页符', keywords: ['分页', '页break', 'page break'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'setHyperlink', description: '设置超链接', keywords: ['超链接', '设置', 'hyperlink'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '链接文本', required: true }, address: { type: 'string', description: '链接地址', required: true } } },
  { name: 'smartFillField', description: '智能填写模板字段', keywords: ['模板', '填写', '表单', 'smart', 'fill'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { keyword: { type: 'string', description: '关键字', required: true }, value: { type: 'string', description: '填写值', required: true }, fillMode: { type: 'string', description: '填写模式', required: false, enum: ['auto', 'underline', 'afterColon', 'afterLabel', 'placeholder'] } } },
  { name: 'afterColon', description: '冒号后填写模式', keywords: ['填写', '冒号', 'after colon'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { keyword: { type: 'string', description: '关键字', required: true }, value: { type: 'string', description: '填写值', required: true } } },
  { name: 'afterLabel', description: '标签后填写模式', keywords: ['填写', '标签', 'after label'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { keyword: { type: 'string', description: '关键字', required: true }, value: { type: 'string', description: '填写值', required: true } } },
  { name: 'addComment', description: '添加批注', keywords: ['批注', '注释', '添加', 'comment'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { text: { type: 'string', description: '批注内容', required: true } } },
  { name: 'getComments', description: '获取文档批注列表', keywords: ['批注', '列表', 'comments'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'getOpenDocuments', description: '获取打开的文档列表', keywords: ['文档', '列表', '打开'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'switchDocument', description: '切换文档', keywords: ['切换', '文档', 'switch'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { name: { type: 'string', description: '文档名称', required: true } } },

  // === Excel 操作 (100+) ===
  { name: 'getActiveWorkbook', description: '获取当前工作簿信息', keywords: ['工作簿', '当前', '活动', 'workbook'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'getCellValue', description: '获取单元格值', keywords: ['单元格', '值', '读取', 'cell'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'setCellValue', description: '设置单元格值', keywords: ['单元格', '值', '写入', 'cell'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true }, value: { type: 'string', description: '值', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'getRangeData', description: '读取区域数据', keywords: ['区域', '数据', '读取', 'range'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域，如 A1:C10', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'setRangeData', description: '写入区域数据', keywords: ['区域', '数据', '写入', 'range'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '起始单元格', required: true }, data: { type: 'array', description: '二维数组数据', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'setFormula', description: '设置公式', keywords: ['公式', '函数', '计算', 'formula'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '单元格区域', required: true }, formula: { type: 'string', description: '公式', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'getFormula', description: '获取公式', keywords: ['公式', '获取', 'formula'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '单元格', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'setArrayFormula', description: '设置数组公式', keywords: ['数组', '公式', 'array formula'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, formula: { type: 'string', description: '公式', required: true } } },
  { name: 'diagnoseFormula', description: '诊断公式错误', keywords: ['诊断', '公式', '错误', 'diagnose'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { formula: { type: 'string', description: '公式', required: true } } },
  { name: 'createSheet', description: '创建工作表', keywords: ['工作表', '新建', '创建', 'sheet'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '工作表名称', required: true } } },
  { name: 'deleteSheet', description: '删除工作表', keywords: ['工作表', '删除', 'delete'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '工作表名称', required: true } } },
  { name: 'renameSheet', description: '重命名工作表', keywords: ['工作表', '重命名', 'rename'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { oldName: { type: 'string', description: '原名称', required: true }, newName: { type: 'string', description: '新名称', required: true } } },
  { name: 'copySheet', description: '复制工作表', keywords: ['工作表', '复制', 'copy'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '源工作表', required: true }, newName: { type: 'string', description: '新名称', required: true } } },
  { name: 'getSheetList', description: '获取工作表列表', keywords: ['工作表', '列表', 'sheets'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'switchSheet', description: '切换工作表', keywords: ['工作表', '切换', '激活', 'switch'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '工作表名称', required: true } } },
  { name: 'moveSheet', description: '移动工作表', keywords: ['工作表', '移动', 'move'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '工作表名称', required: true }, position: { type: 'number', description: '位置', required: true } } },
  { name: 'createPivotTable', description: '创建透视表', keywords: ['透视表', '创建', 'pivot'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { sourceRange: { type: 'string', description: '数据源', required: true }, destination: { type: 'string', description: '目标位置', required: true }, sheet: { type: 'string', description: '工作表名', required: false } } },
  { name: 'updatePivotTable', description: '更新透视表', keywords: ['透视表', '更新', 'pivot'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { tableName: { type: 'string', description: '透视表名称', required: true } } },
  { name: 'createChart', description: '创建图表', keywords: ['图表', '创建', 'chart'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true }, chartType: { type: 'string', description: '图表类型', required: false, enum: ['column', 'bar', 'line', 'pie', 'area', 'scatter'] }, title: { type: 'string', description: '标题', required: false } } },
  { name: 'updateChart', description: '更新图表', keywords: ['图表', '更新', 'chart'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { chartName: { type: 'string', description: '图表名称', required: true } } },
  { name: 'setCellFormat', description: '设置单元格格式', keywords: ['格式', '单元格', '数字', 'format'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, numberFormat: { type: 'string', description: '数字格式', required: false } } },
  { name: 'setCellStyle', description: '设置单元格样式', keywords: ['样式', '单元格', '字体', 'style'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, fontSize: { type: 'number', description: '字号', required: false }, bold: { type: 'boolean', description: '加粗', required: false }, italic: { type: 'boolean', description: '斜���', required: false } } },
  { name: 'setBorder', description: '设置边框', keywords: ['边框', '设置', 'border'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, style: { type: 'string', description: '边框样式', required: false }, color: { type: 'string', description: '颜色', required: false } } },
  { name: 'copyFormat', description: '复制格式', keywords: ['格式', '复制', 'copy'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { source: { type: 'string', description: '源区域', required: true }, target: { type: 'string', description: '目标区域', required: true } } },
  { name: 'clearFormats', description: '清除格式', keywords: ['格式', '清除', 'clear'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'addConditionalFormat', description: '添加条件格式', keywords: ['条件', '格式', 'conditional'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, condition: { type: 'string', description: '条件', required: true }, format: { type: 'string', description: '格式', required: false } } },
  { name: 'removeConditionalFormat', description: '删除条件格式', keywords: ['条件', '格式', 'conditional'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'getConditionalFormats', description: '获取条件格式', keywords: ['条件', '格式'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'addDataValidation', description: '添加数据验证', keywords: ['验证', '数据', 'validation'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, type: { type: 'string', description: '验证类型', required: true }, formula1: { type: 'string', description: '公式1', required: false }, formula2: { type: 'string', description: '公式2', required: false } } },
  { name: 'removeDataValidation', description: '删除数据验证', keywords: ['验证', '删除', 'validation'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'getDataValidations', description: '获取数据验证列表', keywords: ['验证', '列表'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'mergeCells', description: '合并单元格', keywords: ['合并', '单元格', 'merge'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'unmergeCells', description: '取消合并单元格', keywords: ['取消合并', '拆分', 'unmerge'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'setColumnWidth', description: '设置列宽', keywords: ['列宽', '宽度', 'column'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { column: { type: 'string', description: '列', required: true }, width: { type: 'number', description: '宽度', required: true } } },
  { name: 'setRowHeight', description: '设置行高', keywords: ['行高', '高度', 'row'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, height: { type: 'number', description: '高度', required: true } } },
  { name: 'autoFitColumn', description: '自动调整列宽', keywords: ['自动', '列宽', 'auto'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { column: { type: 'string', description: '列', required: true } } },
  { name: 'autoFitRow', description: '自动调整行高', keywords: ['自动', '��高', 'auto'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true } } },
  { name: 'autoFitAll', description: '自动调整所有行列', keywords: ['自动', '适应', 'auto'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'setNumberFormat', description: '设置数字格式', keywords: ['数字', '格式', 'number'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, format: { type: 'string', description: '格式', required: true } } },
  { name: 'wrapText', description: '自动换行', keywords: ['换行', '文本', 'wrap'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'setPrintArea', description: '设置打印区域', keywords: ['打印', '区域', 'print'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'getSelection', description: '获取选区', keywords: ['选区', '选中', 'selection'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'clearRange', description: '清除区域内容', keywords: ['清除', '内容', 'clear'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'insertRows', description: '插入行', keywords: ['插入', '行', 'insert'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'insertColumns', description: '插入列', keywords: ['插入', '列', 'insert'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { column: { type: 'string', description: '列', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'deleteRows', description: '删除行', keywords: ['删除', '行', 'delete'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'deleteColumns', description: '删除列', keywords: ['删除', '列', 'delete'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { column: { type: 'string', description: '列', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'hideRows', description: '隐藏行', keywords: ['隐藏', '行', 'hide'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'hideColumns', description: '隐藏列', keywords: ['隐藏', '列', 'hide'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { column: { type: 'string', description: '列', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'showRows', description: '取消隐藏行', keywords: ['显示', '行', 'show'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'showColumns', description: '取消隐藏列', keywords: ['显示', '列', 'show'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { column: { type: 'string', description: '列', required: true }, count: { type: 'number', description: '数量', required: false } } },
  { name: 'groupRows', description: '组合行', keywords: ['组合', '行', 'group'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { startRow: { type: 'number', description: '起始行', required: true }, endRow: { type: 'number', description: '结束行', required: true } } },
  { name: 'groupColumns', description: '组合列', keywords: ['组合', '列', 'group'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { startColumn: { type: 'string', description: '起始列', required: true }, endColumn: { type: 'string', description: '结束列', required: true } } },
  { name: 'freezePanes', description: '冻结窗格', keywords: ['冻结', '窗格', 'freeze'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: false } } },
  { name: 'unfreezePanes', description: '取消冻结窗格', keywords: ['取消冻结', 'unfreeze'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'findInSheet', description: '在工作表中查找', keywords: ['查找', '搜索', 'find'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { text: { type: 'string', description: '查找内容', required: true }, range: { type: 'string', description: '区域', required: false } } },
  { name: 'replaceInSheet', description: '在工作表中替换', keywords: ['替换', '查找', 'replace'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { find: { type: 'string', description: '查找', required: true }, replace: { type: 'string', description: '替换', required: true }, range: { type: 'string', description: '区域', required: false } } },
  { name: 'copyRange', description: '复制区域', keywords: ['复制', '区域', 'copy'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { source: { type: 'string', description: '源区域', required: true }, target: { type: 'string', description: '目标', required: true } } },
  { name: 'pasteRange', description: '粘贴区域', keywords: ['粘贴', '区域', 'paste'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { target: { type: 'string', description: '目标', required: true } } },
  { name: 'fillSeries', description: '填充序列', keywords: ['填充', '序列', 'fill'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, type: { type: 'string', description: '类型', required: false }, start: { type: 'number', description: '起始值', required: false }, step: { type: 'number', description: '步进', required: false }, stop: { type: 'number', description: '停止值', required: false } } },
  { name: 'transpose', description: '转置数据', keywords: ['转置', '行列转换', 'transpose'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'textToColumns', description: '文本分列', keywords: ['分列', '文本', 'text'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, delimiter: { type: 'string', description: '分隔符', required: true } } },
  { name: 'subtotal', description: '分类汇总', keywords: ['汇总', '分类', 'subtotal'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, function: { type: 'string', description: '函数', required: true }, level: { type: 'number', description: '级别', required: false } } },
  { name: 'createNamedRange', description: '定义名称', keywords: ['名称', '定义', 'name'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '名称', required: true }, range: { type: 'string', description: '区域', required: true } } },
  { name: 'deleteNamedRange', description: '删除名称', keywords: ['名称', '删除', 'name'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '名称', required: true } } },
  { name: 'getNamedRanges', description: '获取名称列表', keywords: ['名称', '列表', 'names'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'addCellComment', description: '添加批注', keywords: ['批注', '注释', 'comment'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true }, text: { type: 'string', description: '批注内容', required: true } } },
  { name: 'deleteCellComment', description: '删除批注', keywords: ['批注', '删除', 'comment'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true } } },
  { name: 'getCellComments', description: '获取批注列表', keywords: ['批注', '列表', 'comments'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'protectSheet', description: '保护工作表', keywords: ['保护', '工作表', 'protect'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { password: { type: 'string', description: '密码', required: false } } },
  { name: 'unprotectSheet', description: '取消保护工作表', keywords: ['取消保护', 'unprotect'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { password: { type: 'string', description: '密码', required: false } } },
  { name: 'protectWorkbook', description: '保护工作簿', keywords: ['保护', '工作簿', 'protect'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { password: { type: 'string', description: '密码', required: false } } },
  { name: 'insertExcelImage', description: '插入图片', keywords: ['图片', '插入', 'image'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { filePath: { type: 'string', description: '图片路径', required: true }, range: { type: 'string', description: '位置', required: false } } },
  { name: 'lockCells', description: '锁定单元格', keywords: ['锁定', '保护', 'lock'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'openWorkbook', description: '打开工作簿', keywords: ['打开', '工作簿', 'open'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { filePath: { type: 'string', description: '文件路径', required: true } } },
  { name: 'getOpenWorkbooks', description: '获取打开的工作簿列表', keywords: ['打开', '工作簿', '列表'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'createWorkbook', description: '新建工作簿', keywords: ['新建', '工作簿', 'new'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'closeWorkbook', description: '关闭工作簿', keywords: ['关闭', '工作簿', 'close'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'cleanData', description: '清洗数据', keywords: ['清洗', '数据', '整理', 'clean'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, operations: { type: 'array', description: '操作列表', required: false } } },
  { name: 'removeDuplicates', description: '删除重复项', keywords: ['去重', '删除重复', 'duplicates'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, columns: { type: 'array', description: '列索引', required: false } } },
  { name: 'sortRange', description: '排序区域', keywords: ['排序', '区域', 'sort'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true }, key: { type: 'number', description: '排序列', required: true }, order: { type: 'string', description: '顺序', required: false, enum: ['asc', 'desc'] } } },
  { name: 'autoFilter', description: '自动筛选', keywords: ['筛选', '自动', 'filter'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'getCellInfo', description: '获取单元格信息', keywords: ['单元格', '信息', 'cell'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true } } },
  { name: 'refreshLinks', description: '刷新链接', keywords: ['链接', '刷新', 'refresh'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'consolidate', description: '合并计算', keywords: ['合并', '计算', 'consolidate'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },
  { name: 'calculateSheet', description: '重新计算工作表', keywords: ['计算', '重算', 'calculate'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'getExcelContext', description: '获取 Excel 上下文', keywords: ['上下文', 'excel'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'getContext', description: '获取当前���下���', keywords: ['上下文', 'context'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: {} },
  { name: 'switchWorkbook', description: '切换工作簿', keywords: ['切换', '工作簿', 'switch'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { name: { type: 'string', description: '工作簿名称', required: true } } },
  { name: 'trim', description: '去除前后空格', keywords: ['空格', 'trim'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '区域', required: true } } },

  // === PPT 操作 (90+) ===
  { name: 'getActivePresentation', description: '获取当前演示文稿信息', keywords: ['演示', '当前', '活动', 'presentation'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'createPresentation', description: '新建演示文稿', keywords: ['新建', '演示', 'PPT', 'new'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'openPresentation', description: '打开演示文稿', keywords: ['打开', '演示', 'open'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { filePath: { type: 'string', description: '文件路径', required: true } } },
  { name: 'closePresentation', description: '关闭演示文稿', keywords: ['关闭', '演示', 'close'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'getSlideCount', description: '获取幻灯片数量', keywords: ['幻灯片', '数量', 'count'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'addSlide', description: '添加幻灯片', keywords: ['添加', '幻灯片', '新建', 'add'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { layout: { type: 'string', description: '布局', required: false }, position: { type: 'number', description: '位置', required: false } } },
  { name: 'deleteSlide', description: '删除幻灯片', keywords: ['删除', '幻灯片', 'delete'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'duplicateSlide', description: '复制幻灯片', keywords: ['复制', '幻灯片', 'duplicate'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'moveSlide', description: '移动幻灯片', keywords: ['移动', '幻灯片', 'move'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { fromIndex: { type: 'number', description: '原位置', required: true }, toIndex: { type: 'number', description: '新位置', required: true } } },
  { name: 'switchSlide', description: '切换幻灯片', keywords: ['切换', '幻灯片', 'switch'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'getSlideInfo', description: '获取幻灯片信息', keywords: ['幻灯片', '信息', 'info'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'getSlideTitle', description: '获取幻灯片标题', keywords: ['标题', '幻灯片', 'title'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'getSlideNotes', description: '获取幻灯片备注', keywords: ['备注', '幻灯片', 'notes'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'setSlideTitle', description: '设置幻灯片标题', keywords: ['标题', '设置', 'title'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, title: { type: 'string', description: '标题内容', required: true } } },
  { name: 'setSlideSubtitle', description: '设置幻灯片副标题', keywords: ['副标题', '设置', 'subtitle'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, subtitle: { type: 'string', description: '副标题内容', required: true } } },
  { name: 'setSlideContent', description: '设置幻灯片内容', keywords: ['内容', '设置', 'content'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, content: { type: 'string', description: '内容', required: true } } },
  { name: 'setSlideNotes', description: '设置幻灯片备注', keywords: ['备注', '设置', 'notes'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, notes: { type: 'string', description: '备注内容', required: true } } },
  { name: 'setSlideBackground', description: '设置幻灯片背景', keywords: ['背景', '设置', 'background'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, color: { type: 'string', description: '颜色', required: false } } },
  { name: 'setBackgroundColor', description: '设置背景颜色', keywords: ['背景', '颜色', 'background'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { color: { type: 'string', description: '颜色', required: true } } },
  { name: 'setBackgroundGradient', description: '设置背景渐变', keywords: ['背景', '渐变', 'gradient'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { color1: { type: 'string', description: '颜色1', required: true }, color2: { type: 'string', description: '颜色2', required: true }, angle: { type: 'number', description: '角度', required: false } } },
  { name: 'setBackgroundImage', description: '设置背景图片', keywords: ['背景', '图片', 'background'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { filePath: { type: 'string', description: '图片路径', required: true } } },
  { name: 'setSlideTransition', description: '设置切换效果', keywords: ['切换', '动画', 'transition'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, effect: { type: 'string', description: '效果', required: true } } },
  { name: 'removeSlideTransition', description: '删除切换效果', keywords: ['切换', '删除', 'transition'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'applyTransitionToAll', description: '应用切换到全部', keywords: ['切换', '全部', 'transition'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { effect: { type: 'string', description: '效果', required: true } } },
  { name: 'addAnimation', description: '添加动画', keywords: ['动画', '添加', 'animation'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, effect: { type: 'string', description: '效果', required: true } } },
  { name: 'removeAnimation', description: '删除动画', keywords: ['动画', '删除', 'animation'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'setAnimationOrder', description: '设置动画顺序', keywords: ['动画', '顺序', 'order'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, order: { type: 'array', description: '顺序', required: true } } },
  { name: 'getAnimations', description: '获取动画列表', keywords: ['动画', '列表', 'animations'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'addAnimationPreset', description: '添加预设动画', keywords: ['动画', '预设', 'preset'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { preset: { type: 'string', description: '预设名称', required: true } } },
  { name: 'addEmphasisAnimation', description: '添加强调动画', keywords: ['动画', '强调', 'emphasis'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'beautifySlide', description: '美化幻灯片', keywords: ['美化', '幻灯片', 'beautify'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, theme: { type: 'string', description: '主题', required: false } } },
  { name: 'beautifyAllSlides', description: '美化所有幻灯片', keywords: ['美化', '全部', 'beautify'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { theme: { type: 'string', description: '主题', required: false } } },
  { name: 'autoBeautifySlide', description: '自动美化幻灯片', keywords: ['美化', '自动', 'auto'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'unifyFont', description: '统一字体', keywords: ['字体', '统一', 'font'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { fontName: { type: 'string', description: '字体名称', required: true } } },
  { name: 'addShape', description: '添加形状', keywords: ['形状', '添加', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { shapeType: { type: 'string', description: '形状类型', required: true }, x: { type: 'number', description: 'X坐标', required: false }, y: { type: 'number', description: 'Y坐标', required: false }, width: { type: 'number', description: '宽度', required: false }, height: { type: 'number', description: '高度', required: false } } },
  { name: 'deleteShape', description: '删除形状', keywords: ['形状', '删除', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '形状索引', required: true } } },
  { name: 'duplicateShape', description: '复制形状', keywords: ['形状', '复制', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '形状索引', required: true } } },
  { name: 'getShapes', description: '获取形状列表', keywords: ['形状', '列表', 'shapes'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'alignShapes', description: '对齐形状', keywords: ['形状', '对齐', 'align'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { alignment: { type: 'string', description: '对齐方式', required: true } } },
  { name: 'groupShapes', description: '组合形状', keywords: ['形状', '组合', 'group'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'addTextBox', description: '添加文本框', keywords: ['文本框', '添加', 'textbox'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { text: { type: 'string', description: '文本内容', required: true }, x: { type: 'number', description: 'X坐标', required: false }, y: { type: 'number', description: 'Y坐标', required: false }, width: { type: 'number', description: '宽度', required: false } } },
  { name: 'setTextBoxText', description: '设置文本框文本', keywords: ['文本框', '文本', 'textbox'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '文本框索引', required: true }, text: { type: 'string', description: '文本内容', required: true } } },
  { name: 'getTextBoxes', description: '获取文本框列表', keywords: ['文本框', '列表', 'textboxes'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'setTextBoxStyle', description: '设置文本框样式', keywords: ['文本框', '样式', 'style'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, fontSize: { type: 'number', description: '字号', required: false }, color: { type: 'string', description: '颜色', required: false } } },
  { name: 'deleteTextBox', description: '删除文本框', keywords: ['文本框', '删除', 'textbox'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true } } },
  { name: 'insertPptImage', description: '插入图片', keywords: ['图片', '插入', 'image'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { filePath: { type: 'string', description: '图片路径', required: true }, x: { type: 'number', description: 'X坐标', required: false }, y: { type: 'number', description: 'Y坐标', required: false } } },
  { name: 'deletePptImage', description: '删除图片', keywords: ['图片', '删除', 'image'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '图片索引', required: true } } },
  { name: 'setImageStyle', description: '设置图片样式', keywords: ['图片', '样式', 'style'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, style: { type: 'string', description: '样式', required: false } } },
  { name: 'insertPptChart', description: '插入图表', keywords: ['图表', '插入', 'chart'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { chartType: { type: 'string', description: '图表类型', required: true }, x: { type: 'number', description: 'X坐标', required: false }, y: { type: 'number', description: 'Y坐标', required: false } } },
  { name: 'setPptChartData', description: '设置图表数据', keywords: ['图表', '数据', 'chart'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '图表索引', required: true }, data: { type: 'array', description: '数据', required: true } } },
  { name: 'setPptChartStyle', description: '设置图表样式', keywords: ['图表', '样式', 'chart'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '图表索引', required: true }, style: { type: 'string', description: '样式', required: true } } },
  { name: 'insertPptTable', description: '插入表格', keywords: ['表格', '插入', 'table'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { rows: { type: 'number', description: '行数', required: true }, cols: { type: 'number', description: '列数', required: true }, x: { type: 'number', description: 'X坐标', required: false }, y: { type: 'number', description: 'Y坐标', required: false } } },
  { name: 'getPptTableCell', description: '获取表格单元格', keywords: ['表格', '单元格', 'table'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { tableIndex: { type: 'number', description: '表格索引', required: true }, row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true } } },
  { name: 'setPptTableCell', description: '设置表格单元格', keywords: ['表格', '设置', 'table'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { tableIndex: { type: 'number', description: '表格索引', required: true }, row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true }, text: { type: 'string', description: '文本', required: true } } },
  { name: 'setPptTableStyle', description: '设置表格样式', keywords: ['表格', '样式', 'table'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { tableIndex: { type: 'number', description: '表格索引', required: true }, style: { type: 'string', description: '样式', required: true } } },
  { name: 'setPptTableCellStyle', description: '设置表格单元格样式', keywords: ['表格', '样式', 'table'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { tableIndex: { type: 'number', description: '表格索引', required: true }, row: { type: 'number', description: '行号', required: true }, col: { type: 'number', description: '列号', required: true }, style: { type: 'string', description: '样式', required: true } } },
  { name: 'setPptTableRowStyle', description: '设置表格行样式', keywords: ['表格', '样式', 'table'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { tableIndex: { type: 'number', description: '表格索引', required: true }, row: { type: 'number', description: '行号', required: true }, style: { type: 'string', description: '样式', required: true } } },
  { name: 'setShapeStyle', description: '设置形状样式', keywords: ['形状', '样式', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, fill: { type: 'string', description: '填充色', required: false } } },
  { name: 'setShapeBorder', description: '设置形状边框', keywords: ['形状', '边框', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, color: { type: 'string', description: '颜色', required: false }, width: { type: 'number', description: '宽度', required: false } } },
  { name: 'setShapeShadow', description: '设置形状阴影', keywords: ['形状', '阴影', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, color: { type: 'string', description: '颜色', required: false }, blur: { type: 'number', description: '模糊', required: false } } },
  { name: 'setShapeGradient', description: '设置形状渐变', keywords: ['形状', '渐变', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, color1: { type: 'string', description: '颜色1', required: true }, color2: { type: 'string', description: '颜色2', required: true } } },
  { name: 'setShapePosition', description: '设置形状位置', keywords: ['形状', '位置', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, x: { type: 'number', description: 'X坐标', required: true }, y: { type: 'number', description: 'Y坐标', required: true } } },
  { name: 'setShapeZOrder', description: '设置形状层次', keywords: ['形状', '层次', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, order: { type: 'string', description: '顺序', required: true, enum: ['bringForward', 'sendBackward', 'bringToFront', 'sendToBack'] } } },
  { name: 'setShapeFullStyle', description: '设置形状完整样式', keywords: ['形状', '样式', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, fill: { type: 'string', description: '填充', required: false }, border: { type: 'string', description: '边框', required: false }, shadow: { type: 'boolean', description: '阴影', required: false } } },
  { name: 'setShapeRoundness', description: '设置形状圆角', keywords: ['形状', '圆角', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, roundness: { type: 'number', description: '圆角程度', required: true } } },
  { name: 'setShapeTransparency', description: '设置形状透明度', keywords: ['形状', '透明', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, transparency: { type: 'number', description: '透明度 0-100', required: true } } },
  { name: 'setShapeText', description: '设置形状文本', keywords: ['形状', '文本', 'shape'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true }, text: { type: 'string', description: '文本', required: true } } },
  { name: 'addConnector', description: '添加连接符', keywords: ['连接', '线', 'connector'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { shapeType: { type: 'string', description: '类型', required: true }, x1: { type: 'number', description: '起点X', required: true }, y1: { type: 'number', description: '起点Y', required: true }, x2: { type: 'number', description: '终点X', required: true }, y2: { type: 'number', description: '终点Y', required: true } } },
  { name: 'addArrow', description: '添加箭头', keywords: ['箭头', '添加', 'arrow'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { x1: { type: 'number', description: '起点X', required: true }, y1: { type: 'number', description: '起点Y', required: true }, x2: { type: 'number', description: '终点X', required: true }, y2: { type: 'number', description: '终点Y', required: true } } },
  { name: 'setSlideLayout', description: '设置幻灯片布局', keywords: ['布局', '设置', 'layout'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true }, layout: { type: 'string', description: '布局类型', required: true } } },
  { name: 'setSlideNumber', description: '设置幻灯片页码', keywords: ['页码', '设置', 'number'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '页码', required: true } } },
  { name: 'setPptDateTime', description: '设置日期时间', keywords: ['日期', '时间', 'datetime'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { format: { type: 'string', description: '格式', required: false } } },
  { name: 'setPptFooter', description: '设置页脚', keywords: ['页脚', '设置', 'footer'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { text: { type: 'string', description: '页脚内容', required: true } } },
  { name: 'setMasterBackground', description: '设置母版背景', keywords: ['母版', '背景', 'master'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { color: { type: 'string', description: '颜色', required: false } } },
  { name: 'getSlideMaster', description: '获取母版', keywords: ['母版', '获取', 'master'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'applyColorScheme', description: '��用配色方案', keywords: ['配色', '主题', 'color'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { scheme: { type: 'string', description: '方案', required: true } } },
  { name: 'addPptHyperlink', description: '添加超链接', keywords: ['超链接', '添加', 'hyperlink'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { text: { type: 'string', description: '链接文本', required: true }, address: { type: 'string', description: '链接地址', required: true } } },
  { name: 'removePptHyperlink', description: '删除超链接', keywords: ['超链接', '删除', 'hyperlink'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { index: { type: 'number', description: '索引', required: true } } },
  { name: 'findPptText', description: '查找文本', keywords: ['查找', '文本', 'find'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { text: { type: 'string', description: '查找文本', required: true } } },
  { name: 'replacePptText', description: '替换文本', keywords: ['替换', '文本', 'replace'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { find: { type: 'string', description: '查找', required: true }, replace: { type: 'string', description: '替换', required: true } } },
  { name: 'addTitleDecoration', description: '添加标题装饰', keywords: ['标题', '装饰', 'title'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'addPageIndicator', description: '添加页码指示器', keywords: ['页码', '指示器', 'indicator'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'addMasterElement', description: '添加母版元素', keywords: ['母版', '元素', 'master'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { elementType: { type: 'string', description: '元素类型', required: true } } },
  { name: 'startSlideShow', description: '开始幻灯片放映', keywords: ['放映', '开始', 'show'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'endSlideShow', description: '结束幻灯片放映', keywords: ['放映', '结束', 'show'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'autoLayout', description: '自动布局', keywords: ['布局', '自动', 'auto'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'smartDistribute', description: '智能分布', keywords: ['分布', '智能', 'smart'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'distributeShapes', description: '分布形状', keywords: ['形状', '分布', 'distribute'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { direction: { type: 'string', description: '方向', required: true, enum: ['horizontal', 'vertical'] } } },
  { name: 'getOpenPresentations', description: '获取打开的演示文稿列表', keywords: ['演示', '列表', 'presentations'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: {} },
  { name: 'switchPresentation', description: '切换演示文稿', keywords: ['切换', '演示', 'switch'], category: 'ppt', appType: WpsAppType.PRESENTATION, paramsSchema: { name: { type: 'string', description: '演示文稿名称', required: true } } },

  // === 通用操作 (10) ===
  { name: 'convertToPDF', description: '转换为 PDF', keywords: ['PDF', '转换', '导出', 'pdf'], category: 'common', appType: WpsAppType.WRITER, paramsSchema: { outputPath: { type: 'string', description: '输出路径', required: false } } },
  { name: 'convertFormat', description: '格式转换', keywords: ['转换', '格式', 'convert'], category: 'common', appType: WpsAppType.WRITER, paramsSchema: { targetFormat: { type: 'string', description: '目标格式', required: true } } },
  { name: 'getAppInfo', description: '获取应用信息', keywords: ['应用', '信息', 'app'], category: 'common', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'getContext', description: '获取当前上下文', keywords: ['上下文', '当前', 'context'], category: 'common', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'ping', description: '检测连接', keywords: ['检测', '连接', 'ping'], category: 'common', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'wireCheck', description: 'Wire 连接检测', keywords: ['检测', 'wire'], category: 'common', appType: WpsAppType.WRITER, paramsSchema: {} },
  { name: 'underline', description: '设置下划线', keywords: ['下划线', 'underline'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { range: { type: 'string', description: '区域', required: false }, style: { type: 'string', description: '样式', required: false } } },
  { name: 'placeholder', description: '占位符模式', keywords: ['占位符', 'placeholder'], category: 'word', appType: WpsAppType.WRITER, paramsSchema: { placeholder: { type: 'string', description: '占位符', required: true }, value: { type: 'string', description: '替换值', required: true } } },
  { name: 'createDonutChart', description: '创建环形图', keywords: ['图表', '环形', 'donut'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createFlowChart', description: '创建流程图', keywords: ['图表', '流程', 'flow'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createGauge', description: '创建仪表图', keywords: ['图表', '仪表', 'gauge'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createGrid', description: '创建网格图', keywords: ['图表', '网格', 'grid'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createKpiCards', description: '创建 KPI 卡片', keywords: ['图表', 'kpi', 'cards'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createMiniCharts', description: '创建迷你图表', keywords: ['图表', '迷你', 'mini'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createOrgChart', description: '创建组织结构图', keywords: ['图表', '组织', 'org'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createProgressBar', description: '创建进度条', keywords: ['图表', '进度', 'progress'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
  { name: 'createStyledTable', description: '创建样式表格', keywords: ['表格', '样式', 'styled'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true }, style: { type: 'string', description: '样式', required: false } } },
  { name: 'createTimeline', description: '创建时间线', keywords: ['图表', '时间', 'timeline'], category: 'excel', appType: WpsAppType.SPREADSHEET, paramsSchema: { range: { type: 'string', description: '数据区域', required: true } } },
];

/**
 * 工具索引（单例）
 */
export const TOOLS_INDEX: ToolIndexItem[] = COM_ACTIONS;

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
        bExact - aExact + bStart - aStart + bContains - aContains
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
    next_steps: "使用 wps_office_execute 执行，或使用 wps_execute_method 兜底",
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
    (entry) => entry[1].required
  );
  const missingParams = requiredParams.filter(
    (entry) => args[entry[0]] === undefined
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
      tool_name,
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
};