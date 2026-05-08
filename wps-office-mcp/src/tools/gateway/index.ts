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
  originalTool: RegisteredTool | null;
}

export interface ToolParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

/**
 * WPS COM Actions 映射 - 224+ 个底层操作
 */
const WPS_COM_ACTIONS: Record<string, { description: string; appType: WpsAppType; category: string }> = {
  // Common (30+)
  ping: { description: "检查 MCP 连接状态", appType: WpsAppType.WRITER, category: "common" },
  wireCheck: { description: "检查 WPS COM 桥接", appType: WpsAppType.WRITER, category: "common" },
  getAppInfo: { description: "获取当前应用信息", appType: WpsAppType.WRITER, category: "common" },
  getSelectedText: { description: "获取选中文本", appType: WpsAppType.WRITER, category: "common" },
  getSelection: { description: "获取选区信息", appType: WpsAppType.WRITER, category: "common" },
  setSelectedText: { description: "设置选中文本", appType: WpsAppType.WRITER, category: "common" },
  save: { description: "保存当前文档", appType: WpsAppType.WRITER, category: "common" },
  saveAs: { description: "另存为", appType: WpsAppType.WRITER, category: "common" },
  openFile: { description: "打开文件", appType: WpsAppType.WRITER, category: "common" },
  closeFile: { description: "关闭文件", appType: WpsAppType.WRITER, category: "common" },
  newDocument: { description: "新建文档", appType: WpsAppType.WRITER, category: "common" },
  newWorkbook: { description: "新建工作簿", appType: WpsAppType.SPREADSHEET, category: "common" },
  newPresentation: { description: "新建演示", appType: WpsAppType.PRESENTATION, category: "common" },
  convertToPDF: { description: "转换为 PDF", appType: WpsAppType.WRITER, category: "common" },
  convertFormat: { description: "格式转换", appType: WpsAppType.WRITER, category: "common" },
  exportAsPDF: { description: "导出 PDF", appType: WpsAppType.WRITER, category: "common" },
  exportAsImage: { description: "导出图片", appType: WpsAppType.WRITER, category: "common" },
  exportAsHTML: { description: "导出 HTML", appType: WpsAppType.WRITER, category: "common" },
  print: { description: "打印文档", appType: WpsAppType.WRITER, category: "common" },
  printPreview: { description: "打印预览", appType: WpsAppType.WRITER, category: "common" },
  quit: { description: "退出应用", appType: WpsAppType.WRITER, category: "common" },
  
  // Excel (80+)
  getActiveWorkbook: { description: "获取当前工作簿", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getActiveSheet: { description: "获取当前工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getSheetList: { description: "获取工作表列表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getSheetNames: { description: "获取所有工作表名", appType: WpsAppType.SPREADSHEET, category: "excel" },
  createSheet: { description: "新建工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  deleteSheet: { description: "删除工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  copySheet: { description: "复制工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  renameSheet: { description: "重命名工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  moveSheet: { description: "移动工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  protectSheet: { description: "保护工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  unprotectSheet: { description: "取消保护工作表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getRangeData: { description: "读取区域数据", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setRangeData: { description: "写入区域数据", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getCellValue: { description: "读取单元格值", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setCellValue: { description: "设置单元格值", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getFormula: { description: "获取公式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setFormula: { description: "设置公式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getRichText: { description: "获取富文本", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setRichText: { description: "设置富文本", appType: WpsAppType.SPREADSHEET, category: "excel" },
  copyRange: { description: "复制区域", appType: WpsAppType.SPREADSHEET, category: "excel" },
  cutRange: { description: "剪切区域", appType: WpsAppType.SPREADSHEET, category: "excel" },
  pasteRange: { description: "粘贴区域", appType: WpsAppType.SPREADSHEET, category: "excel" },
  pasteSpecial: { description: "选择性粘贴", appType: WpsAppType.SPREADSHEET, category: "excel" },
  clearRange: { description: "清除区域内容", appType: WpsAppType.SPREADSHEET, category: "excel" },
  clearFormats: { description: "清除格式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  fillSeries: { description: "填充序列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  fillDown: { description: "向下填充", appType: WpsAppType.SPREADSHEET, category: "excel" },
  fillRight: { description: "向右填充", appType: WpsAppType.SPREADSHEET, category: "excel" },
  fillUp: { description: "向上填充", appType: WpsAppType.SPREADSHEET, category: "excel" },
  fillLeft: { description: "向左填充", appType: WpsAppType.SPREADSHEET, category: "excel" },
  transpose: { description: "转置数据", appType: WpsAppType.SPREADSHEET, category: "excel" },
  mergeCells: { description: "合并单元格", appType: WpsAppType.SPREADSHEET, category: "excel" },
  unmergeCells: { description: "取消合并", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setBorder: { description: "设置边框", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setNumberFormat: { description: "设置数字格式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setAlignment: { description: "设置对齐方式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setColumnWidth: { description: "设置列宽", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setRowHeight: { description: "设置行高", appType: WpsAppType.SPREADSHEET, category: "excel" },
  autoFit: { description: "自动调整列宽", appType: WpsAppType.SPREADSHEET, category: "excel" },
  hideRow: { description: "隐藏行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  hideColumn: { description: "隐藏列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  showRow: { description: "显示行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  showColumn: { description: "显示列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  freezePanes: { description: "冻结窗格", appType: WpsAppType.SPREADSHEET, category: "excel" },
  unfreezePanes: { description: "取消冻结", appType: WpsAppType.SPREADSHEET, category: "excel" },
  sortRange: { description: "排序区域", appType: WpsAppType.SPREADSHEET, category: "excel" },
  filterRange: { description: "筛选区域", appType: WpsAppType.SPREADSHEET, category: "excel" },
  clearFilter: { description: "清除筛选", appType: WpsAppType.SPREADSHEET, category: "excel" },
  insertRow: { description: "插入行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  insertColumn: { description: "插入列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  deleteRow: { description: "删除行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  deleteColumn: { description: "删除列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  addChart: { description: "添加图表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  deleteChart: { description: "删除图表", appType: WpsAppType.SPREADSHEET, category: "excel" },
  addImage: { description: "添加图片", appType: WpsAppType.SPREADSHEET, category: "excel" },
  deleteImage: { description: "删除图片", appType: WpsAppType.SPREADSHEET, category: "excel" },
  // 扩展 Excel (额外 30+)
  setCellFormat: { description: "设置单元格格式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setCellStyle: { description: "设置单元格样式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setIndent: { description: "设置缩进", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setTextOrientation: { description: "设置文字方向", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setWrap: { description: "设置自动换行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setShrink: { description: "缩小字体填充", appType: WpsAppType.SPREADSHEET, category: "excel" },
  groupRows: { description: "组合行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  ungroupRows: { description: "取消组合行", appType: WpsAppType.SPREADSHEET, category: "excel" },
  groupColumns: { description: "组合列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  ungroupColumns: { description: "取消组合列", appType: WpsAppType.SPREADSHEET, category: "excel" },
  splitPanes: { description: "拆分窗格", appType: WpsAppType.SPREADSHEET, category: "excel" },
  sortColumn: { description: "按列排序", appType: WpsAppType.SPREADSHEET, category: "excel" },
  sortRow: { description: "按行排序", appType: WpsAppType.SPREADSHEET, category: "excel" },
  autoFilter: { description: "自动筛选", appType: WpsAppType.SPREADSHEET, category: "excel" },
  applyFilter: { description: "应用筛选条件", appType: WpsAppType.SPREADSHEET, category: "excel" },
  removeFilter: { description: "移除筛选", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setComment: { description: "设置批注", appType: WpsAppType.SPREADSHEET, category: "excel" },
  getComment: { description: "获取批注", appType: WpsAppType.SPREADSHEET, category: "excel" },
  deleteComment: { description: "删除批注", appType: WpsAppType.SPREADSHEET, category: "excel" },
  addHyperlink: { description: "添加超链接", appType: WpsAppType.SPREADSHEET, category: "excel" },
  removeHyperlink: { description: "删除超链接", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartType: { description: "设置图表类型", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartTitle: { description: "设置图表标题", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartData: { description: "设置图表数据", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartStyle: { description: "设置图表样式", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartLegend: { description: "设置图表图例", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartAxis: { description: "设置图表坐标轴", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setDataLabels: { description: "设置数据标签", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setPlotArea: { description: "设置绘图区", appType: WpsAppType.SPREADSHEET, category: "excel" },
  setChartArea: { description: "设置图表区", appType: WpsAppType.SPREADSHEET, category: "excel" },
  protectWorkbook: { description: "保护工作簿", appType: WpsAppType.SPREADSHEET, category: "excel" },
  unprotectWorkbook: { description: "取消保护工作簿", appType: WpsAppType.SPREADSHEET, category: "excel" },
  
  // Word (80+)
  getActiveDocument: { description: "获取当前文档", appType: WpsAppType.WRITER, category: "word" },
  getDocumentStats: { description: "获取文档统计", appType: WpsAppType.WRITER, category: "word" },
  getActiveParagraph: { description: "获取当前段落", appType: WpsAppType.WRITER, category: "word" },
  getParagraphs: { description: "获取所有段落", appType: WpsAppType.WRITER, category: "word" },
  getParagraphCount: { description: "获取段落数", appType: WpsAppType.WRITER, category: "word" },
  insertText: { description: "插入文本", appType: WpsAppType.WRITER, category: "word" },
  insertParagraph: { description: "插入段落", appType: WpsAppType.WRITER, category: "word" },
  insertLineBreak: { description: "插入换行符", appType: WpsAppType.WRITER, category: "word" },
  deleteText: { description: "删除文本", appType: WpsAppType.WRITER, category: "word" },
  findText: { description: "查找文本", appType: WpsAppType.WRITER, category: "word" },
  replaceText: { description: "替换文本", appType: WpsAppType.WRITER, category: "word" },
  setFont: { description: "设置字体", appType: WpsAppType.WRITER, category: "word" },
  setFontName: { description: "设置字体名称", appType: WpsAppType.WRITER, category: "word" },
  setFontSize: { description: "设置字号", appType: WpsAppType.WRITER, category: "word" },
  setBold: { description: "设置加粗", appType: WpsAppType.WRITER, category: "word" },
  setItalic: { description: "设置斜体", appType: WpsAppType.WRITER, category: "word" },
  setUnderline: { description: "设置下划线", appType: WpsAppType.WRITER, category: "word" },
  setTextColor: { description: "设置文字颜色", appType: WpsAppType.WRITER, category: "word" },
  setHighlight: { description: "设置高亮", appType: WpsAppType.WRITER, category: "word" },
  setParagraphFormat: { description: "设置段落格式", appType: WpsAppType.WRITER, category: "word" },
  setLineSpacing: { description: "设置行距", appType: WpsAppType.WRITER, category: "word" },
  setSpaceBefore: { description: "设置段前间距", appType: WpsAppType.WRITER, category: "word" },
  setSpaceAfter: { description: "设置段后间距", appType: WpsAppType.WRITER, category: "word" },
  setLeftIndent: { description: "设置左缩进", appType: WpsAppType.WRITER, category: "word" },
  setRightIndent: { description: "设置右缩进", appType: WpsAppType.WRITER, category: "word" },
  setFirstLineIndent: { description: "设置首行缩进", appType: WpsAppType.WRITER, category: "word" },
  setPageSetup: { description: "页面设置", appType: WpsAppType.WRITER, category: "word" },
  setPaperSize: { description: "设置纸张大小", appType: WpsAppType.WRITER, category: "word" },
  setOrientation: { description: "设置方向", appType: WpsAppType.WRITER, category: "word" },
  setTopMargin: { description: "设置上边距", appType: WpsAppType.WRITER, category: "word" },
  setBottomMargin: { description: "设置下边距", appType: WpsAppType.WRITER, category: "word" },
  setLeftMargin: { description: "设置左边距", appType: WpsAppType.WRITER, category: "word" },
  setRightMargin: { description: "设置右边距", appType: WpsAppType.WRITER, category: "word" },
  insertPageBreak: { description: "插入分页符", appType: WpsAppType.WRITER, category: "word" },
  insertSectionBreak: { description: "插入分节符", appType: WpsAppType.WRITER, category: "word" },
  setHeader: { description: "设置页眉", appType: WpsAppType.WRITER, category: "word" },
  setFooter: { description: "设置页脚", appType: WpsAppType.WRITER, category: "word" },
  setHeaderDistance: { description: "设置页眉距离", appType: WpsAppType.WRITER, category: "word" },
  setFooterDistance: { description: "设置页脚距离", appType: WpsAppType.WRITER, category: "word" },
  insertTable: { description: "插入表格", appType: WpsAppType.WRITER, category: "word" },
  insertTableRow: { description: "插入表格行", appType: WpsAppType.WRITER, category: "word" },
  insertTableCell: { description: "插入表格单元格", appType: WpsAppType.WRITER, category: "word" },
  deleteTableRow: { description: "删除表格行", appType: WpsAppType.WRITER, category: "word" },
  deleteTableCell: { description: "删除表格单元格", appType: WpsAppType.WRITER, category: "word" },
  mergeTableCells: { description: "合并表格单元格", appType: WpsAppType.WRITER, category: "word" },
  splitTableCells: { description: "拆分表格单元格", appType: WpsAppType.WRITER, category: "word" },
  insertImage: { description: "插入图片", appType: WpsAppType.WRITER, category: "word" },
  insertShape: { description: "插入形状", appType: WpsAppType.WRITER, category: "word" },
  insertChart: { description: "插入图表", appType: WpsAppType.WRITER, category: "word" },
  createBookmark: { description: "创建书签", appType: WpsAppType.WRITER, category: "word" },
  getBookmarks: { description: "获取书签列表", appType: WpsAppType.WRITER, category: "word" },
  gotoBookmark: { description: "跳转到书签", appType: WpsAppType.WRITER, category: "word" },
  deleteBookmark: { description: "删除书签", appType: WpsAppType.WRITER, category: "word" },
  applyStyle: { description: "应用样式", appType: WpsAppType.WRITER, category: "word" },
  createStyle: { description: "创建样式", appType: WpsAppType.WRITER, category: "word" },
  deleteStyle: { description: "删除样式", appType: WpsAppType.WRITER, category: "word" },
  addTableOfContents: { description: "添加目录", appType: WpsAppType.WRITER, category: "word" },
  updateTableOfContents: { description: "更新目录", appType: WpsAppType.WRITER, category: "word" },
  trackChanges: { description: "修订文档", appType: WpsAppType.WRITER, category: "word" },
  acceptChanges: { description: "接受修订", appType: WpsAppType.WRITER, category: "word" },
  rejectChanges: { description: "拒绝修订", appType: WpsAppType.WRITER, category: "word" },
  
  // PPT (60+)
  getActivePresentation: { description: "获取当前演示", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideCount: { description: "获取幻灯片数量", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getActiveSlide: { description: "获取当前幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideIndex: { description: "获取当前幻灯片索引", appType: WpsAppType.PRESENTATION, category: "ppt" },
  addSlide: { description: "添加幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  deleteSlide: { description: "删除幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  duplicateSlide: { description: "复制幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  moveSlide: { description: "移动幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  goToSlide: { description: "跳转到幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  nextSlide: { description: "下一张幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  previousSlide: { description: "上一张幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideTitle: { description: "设置幻灯片标题", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideContent: { description: "设置幻灯片内容", appType: WpsAppType.PRESENTATION, category: "ppt" },
  clearSlideContent: { description: "清空幻灯片内容", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertSlideText: { description: "插入幻灯片文本", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertSlideImage: { description: "插入幻灯片图片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertSlideChart: { description: "插入幻灯片图表", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertSlideShape: { description: "插入幻灯片形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideLayout: { description: "设置幻灯片布局", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideTransition: { description: "设置切换效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideEffect: { description: "设置动画效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideBackground: { description: "设置背景", appType: WpsAppType.PRESENTATION, category: "ppt" },
  applyTheme: { description: "应用主题", appType: WpsAppType.PRESENTATION, category: "ppt" },
  applyTemplate: { description: "应用模板", appType: WpsAppType.PRESENTATION, category: "ppt" },
  applyColorScheme: { description: "应用配色方案", appType: WpsAppType.PRESENTATION, category: "ppt" },
  applyFontScheme: { description: "应用字体方案", appType: WpsAppType.PRESENTATION, category: "ppt" },
  beautify: { description: "一键美化", appType: WpsAppType.PRESENTATION, category: "ppt" },
  unifyFont: { description: "统一字体", appType: WpsAppType.PRESENTATION, category: "ppt" },
  alignShapes: { description: "对齐形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  distributeShapes: { description: "分布形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  groupShapes: { description: "组合形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  ungroupShapes: { description: "取消组合形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setShapeFill: { description: "设置形状填充", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setShapeLine: { description: "设置形状轮廓", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setShapeEffect: { description: "设置形状效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setTextFormat: { description: "设置文本格式", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setParagraphFormat2: { description: "设置段落格式", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertNotes: { description: "插入备注", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getNotes: { description: "获取备注", appType: WpsAppType.PRESENTATION, category: "ppt" },
  startSlideshow: { description: "开始放映", appType: WpsAppType.PRESENTATION, category: "ppt" },
  endSlideshow: { description: "结束放映", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setPresentationView: { description: "设置视图模式", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setZoom: { description: "设置缩放", appType: WpsAppType.PRESENTATION, category: "ppt" },
  // 扩展 PPT (额外 70+)
  getSlide: { description: "获取幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlides: { description: "获取所有幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideNames: { description: "获取幻灯片名称", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideTitle: { description: "获取幻灯片标题", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideContent: { description: "获取幻灯片内容", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideShapes: { description: "获取幻灯片形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideImages: { description: "获取幻灯片图片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSlideCharts: { description: "获取幻灯片图表", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideLayout2: { description: "设置幻灯片布局", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideSize: { description: "设置幻灯片大小", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideShowTransition: { description: "设置幻灯片切换", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideTiming: { description: "设置切换时间", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideSound: { description: "设置切换声音", appType: WpsAppType.PRESENTATION, category: "ppt" },
  applySlideMaster: { description: "应用母版", appType: WpsAppType.PRESENTATION, category: "ppt" },
  createSlideMaster: { description: "创建母版", appType: WpsAppType.PRESENTATION, category: "ppt" },
  editSlideMaster: { description: "编辑母版", appType: WpsAppType.PRESENTATION, category: "ppt" },
  deleteSlideMaster: { description: "删除母版", appType: WpsAppType.PRESENTATION, category: "ppt" },
  applyLayout: { description: "应用布局", appType: WpsAppType.PRESENTATION, category: "ppt" },
  createLayout: { description: "创建布局", appType: WpsAppType.PRESENTATION, category: "ppt" },
  editLayout: { description: "编辑布局", appType: WpsAppType.PRESENTATION, category: "ppt" },
  deleteLayout: { description: "删除布局", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setMasterBackground: { description: "设置母版背景", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setMasterTitle: { description: "设置母版标题", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setMasterText: { description: "设置母版文本", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setThemeColor: { description: "设置主题颜色", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setThemeFont: { description: "设置主题字体", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setThemeEffect: { description: "设置主题效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  addAnimation: { description: "添加动���", appType: WpsAppType.PRESENTATION, category: "ppt" },
  removeAnimation: { description: "删除动画", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setAnimationEffect: { description: "设置动画效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setAnimationTiming: { description: "设置动画时间", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setAnimationTrigger: { description: "设置动画触发", appType: WpsAppType.PRESENTATION, category: "ppt" },
  reorderAnimation: { description: "重新排序动画", appType: WpsAppType.PRESENTATION, category: "ppt" },
  addTransition: { description: "添加切换效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  removeTransition: { description: "删除切换效果", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setTransitionSpeed: { description: "设置切换速度", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertShape2: { description: "插入形状", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertTextBox: { description: "插入文本框", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertTable2: { description: "插入表格", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertMedia: { description: "插入媒体", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertVideo: { description: "插入视频", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertAudio: { description: "插入音频", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertOLE: { description: "插入 OLE 对象", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertFooter: { description: "插入页脚", appType: WpsAppType.PRESENTATION, category: "ppt" },
  insertHeader: { description: "插入页眉", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getFooter: { description: "获取页脚", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getHeader: { description: "获取页眉", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideNumber: { description: "设置幻灯片编号", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setDateTime: { description: "设置日期时间", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setFootNote: { description: "设置脚注", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setEndNote: { description: "设置尾注", appType: WpsAppType.PRESENTATION, category: "ppt" },
  exportSlide: { description: "导出幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  exportNotes: { description: "导出备注", appType: WpsAppType.PRESENTATION, category: "ppt" },
  exportHandout: { description: "导出讲义", appType: WpsAppType.PRESENTATION, category: "ppt" },
  printSlides: { description: "打印幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  printHandouts: { description: "打印讲义", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setPrintSetup: { description: "设置打印", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setPageSetup2: { description: "页面设置", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideOrientation: { description: "设置幻灯片方向", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setSlideOrder: { description: "设置幻灯片顺序", appType: WpsAppType.PRESENTATION, category: "ppt" },
  sortSlides: { description: "幻灯片排序", appType: WpsAppType.PRESENTATION, category: "ppt" },
  groupSlides: { description: "组合幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  ungroupSlides: { description: "取消组合幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  hideSlide: { description: "隐藏幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  showSlide: { description: "显示幻灯片", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setVisibility: { description: "设置可见性", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getSection: { description: "获取节", appType: WpsAppType.PRESENTATION, category: "ppt" },
  addSection: { description: "添加节", appType: WpsAppType.PRESENTATION, category: "ppt" },
  deleteSection: { description: "删除节", appType: WpsAppType.PRESENTATION, category: "ppt" },
  moveToSection: { description: "移动到节", appType: WpsAppType.PRESENTATION, category: "ppt" },
  setComment2: { description: "设置评论", appType: WpsAppType.PRESENTATION, category: "ppt" },
  getComment2: { description: "获取评论", appType: WpsAppType.PRESENTATION, category: "ppt" },
  addReply: { description: "添加回复", appType: WpsAppType.PRESENTATION, category: "ppt" },
  resolveComment: { description: "解决评论", appType: WpsAppType.PRESENTATION, category: "ppt" },
};

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
  wps_excel_remove_duplicates: ['去重', '删除重复', '重复'],
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
 * 构建工具索引（包含 MCP Tools + COM Actions）
 */
export function buildToolsIndex(): ToolIndexItem[] {
  const index: ToolIndexItem[] = [];

  // 1. 先添加 MCP Tools (25个)
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

  // 2. 再添加 COM Actions (224+个)
  for (const [action, config] of Object.entries(WPS_COM_ACTIONS)) {
    index.push({
      name: `wps_com_${action}`,
      description: config.description,
      keywords: [action, config.description],
      category: config.category,
      appType: config.appType,
      method: action,
      paramsSchema: {},
      originalTool: null as any,
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