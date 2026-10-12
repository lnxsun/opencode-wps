/**
 * Input: Tool 定义集合
 * Output: Tool 注册数组
 * Pos: MCP Tools 总入口。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * Tools总入口 - MCP工具汇总注册模块
 * 整合Excel、Word、PPT、Common的所有Tools
 *
 * 使用方法：
 * import { allTools } from './tools';
 * toolRegistry.registerAll(allTools);
 *
 * 或者按需导入：
 * import { excelTools, wordTools, pptTools, commonTools } from './tools';
 */

import { RegisteredTool } from '../types/tools';
import { excelTools } from './excel';
import { wordTools } from './word';
import { pptTools } from './ppt';
import { commonTools } from './common';

/**
 * 所有MCP Tools集合（注册工具数 = excelTools + wordTools + pptTools + commonTools，见下方分类；另含内置工具 + Gateway COM Actions，数量以代码为准）
 * 注意：实际注册工具数随开发持续演进，数量以代码为准（运行时可用 allTools.length 计算）
 *
 * 三层工具体系：
 *   1. 内置工具（在 mcp-server.ts 中注册；**数量以该文件为准，不手写**）：wps_check_connection, wps_get_cell_value 等
 *   2. Gateway 工具（2个）：wps_office_search（搜索）、wps_office_execute（执行）
 *   3. COM Actions（在 gateway/index.ts 索引，通过 Gateway 按需加载；数量以该数组长度为准）
 *
 * 直接注册工具分类：
 *   Excel (82个):   公式/数据/图表/透视表/工作表/格式化/工作簿/高级数据
 *   Word   (37个):  格式化(5)/内容(14)/文档管理(9)/校对(6+2报告)/其他(3)
 *   PPT   (112个):  幻灯片/幻灯片操作/演示文稿管理/文本框/动画/背景/图片/表格/形状
 *   Common (9个):   转换/通用
 *
 * ⚠️ Issue #382 DECISION-1：纯 TS 逻辑工具（PS1 无同名分支）**直连注册**——`mcp-server.ts`
 *   真实调用 `registerAll(allTools)`，故 `allTools` 即「直连注册工具面」（AI 可在 `tools/list` 看见）。
 *   原 `GATEWAY_ONLY_TOOLS` 黑名单与治理 G1「网关强制」**已整条删除**（双路径漏洞 + 让 schema 说真话）。
 */
export const allTools: RegisteredTool[] = [
  ...excelTools,
  ...wordTools,
  ...pptTools,
  ...commonTools,
];

// 按应用类型分别导出
export { excelTools } from './excel';
export { wordTools } from './word';
export { pptTools } from './ppt';
export { commonTools } from './common';

// Excel相关导出
export {
  formulaTools,
  dataTools,
  setFormulaDefinition,
  setFormulaHandler,
  generateFormulaDefinition,
  generateFormulaHandler,
  diagnoseFormulaDefinition,
  diagnoseFormulaHandler,
  readRangeDefinition,
  readRangeHandler,
  writeRangeDefinition,
  writeRangeHandler,
  cleanDataDefinition,
  cleanDataHandler,
  removeDuplicatesDefinition,
  removeDuplicatesHandler,
} from './excel';

// Word相关导出
export {
  formatTools,
  contentTools,
  proofreadTools,
  applyStyleDefinition,
  applyStyleHandler,
  setFontDefinition,
  setFontHandler,
  generateTocDefinition,
  generateTocHandler,
  insertTextDefinition,
  insertTextHandler,
  findReplaceDefinition,
  findReplaceHandler,
} from './word';

// PPT相关导出
export {
  slideTools,
  addSlideDefinition,
  addSlideHandler,
  beautifyDefinition,
  beautifyHandler,
  unifyFontDefinition,
  unifyFontHandler,
} from './ppt';

// Common相关导出
export {
  convertTools,
  convertToPdfDefinition,
  convertToPdfHandler,
  convertFormatDefinition,
  convertFormatHandler,
} from './common';

/**
 * 获取所有Tool的数量
 */
export const getToolCount = (): number => allTools.length;

/**
 * 获取按应用分类的Tool数量
 */
export const getToolCountByApp = (): {
  excel: number;
  word: number;
  ppt: number;
  common: number;
} => ({
  excel: excelTools.length,
  word: wordTools.length,
  ppt: pptTools.length,
  common: commonTools.length,
});

export default allTools;
