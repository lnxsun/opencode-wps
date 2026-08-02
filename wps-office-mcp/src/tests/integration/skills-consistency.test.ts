/**
 * Skills/Agents 一致性测试
 * 验证 Skills 和 Agents 中引用的所有工具名称在 TOOLS_INDEX 中存在
 *
 * @date 2026-05-18
 * @updated 2026-08-01 重构：三处重复校验逻辑抽取公共函数（Issue #49）
 */

import { TOOLS_INDEX } from '../../tools/gateway';

// uuid v14 是 ESM-only，Jest CJS 无法解析，手动 mock（与 gateway.test.ts 一致）
jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

// Mock logger
jest.mock('../../utils/logger', () => ({
  log: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path') as typeof import('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs') as typeof import('fs');

// Skills 和 Agents 在项目根目录，不在 MCP 模块内
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const skillsDir = path.resolve(PROJECT_ROOT, 'skills');
const agentsDir = path.resolve(PROJECT_ROOT, 'agents');

// 14 个 MCP 工具（12 内置 + 2 Gateway，直接注册，不在 gateway index 中）
const ALL_MCP_TOOLS = new Set([
  'wps_check_connection',
  'wps_get_active_document',
  'wps_insert_text',
  'wps_get_active_workbook',
  'wps_get_cell_value',
  'wps_set_cell_value',
  'wps_get_active_presentation',
  'wps_execute_method',
  'wps_cache_data',
  'wps_get_cached_data',
  'wps_list_cache',
  'wps_clear_cache',
  'wps_office_search',
  'wps_office_execute',
]);

const indexNames = TOOLS_INDEX.map(t => t.name);

// Legacy 工具名称映射：旧版 wps_office_* 工具名 -> gateway index 中的实际工具名
const LEGACY_TOOLS: Record<string, string> = {
  wps_office_check_status: 'getContext',
  wps_office_activate_app: 'getContext',
  wps_office_new_document: 'createDocument',
  wps_office_open_file: 'openFile',
  wps_office_save_document: 'save',
  wps_office_save_as: 'saveAs',
  wps_office_close_document: 'closeDocument',
  wps_office_export_pdf: 'convertToPDF',
  wps_office_export_image: 'convertFormat',
  wps_office_export_html: 'convertFormat',
  wps_office_print: 'convertToPDF',
};

// 文档中反引号包裹的**参数名/非工具名**（仅用于说明 JSON 字段/参数），
// 一致性校验只关心工具名，这些不参与匹配
const NON_TOOL_NAMES = new Set([
  'file_path',
  'session_id',
  'output_file',
  '_force_ai_fix',
  'offset_in_paragraph',
  'paragraph_index',
  'start_paragraph',
  'end_paragraph',
  'paragraph_count',
  'start_offset',
  'startOffset',
  'replaceAll',
  'total_revisions',
  'doc_info',
  'findText',
  'replaceText',
  'paragraphIndex',
  'matchCase',
  'matchWholeWord',
  // wps-proofread/SKILL.md 中的 JSON 字段/参数名（#44 校验覆盖新增）
  'text',
  'issues',
  'key',
  'length',
  'score',
  'original',
  'toFix',
  'toReport',
  'report_only',
  'replace_all',
  'batchStarted',
  'lastBatchParaIndex',
  'sessionIssues',
  'filePath',
]);

/**
 * 提取反引号包裹的工具名称
 * @param content 待扫描内容
 * @param excludeLayout 是否排除布局/动画类型（Skills 专属，如 title_content / fly_in）
 */
function extractToolNames(content: string, excludeLayout = false): string[] {
  const toolNamePattern = /`(\w+(?:_\w+)+)`/g;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = toolNamePattern.exec(content)) !== null) {
    const name = m[1];
    // 排除纯下划线占位符（如 ___ / ____）
    if (/^_+$/.test(name)) continue;
    // 排除布局/动画类型
    if (
      excludeLayout &&
      /^(title_content|two_column|comparison|blank|fly_in|zoom|fade|wipe|appear)$/.test(name)
    )
      continue;
    matches.add(name);
  }
  return [...matches];
}

/**
 * 校验工具名称是否在已知白名单内（ALL_MCP_TOOLS / LEGACY_TOOLS / TOOLS_INDEX 含去前缀匹配），
 * 返回未知工具名称列表
 */
function findUnknownTools(names: string[]): string[] {
  const unknown: string[] = [];
  names.forEach(name => {
    if (NON_TOOL_NAMES.has(name)) return;
    if (ALL_MCP_TOOLS.has(name)) return;
    if (LEGACY_TOOLS[name]) return; // 已映射到 legacy

    // gateway index 工具名称不带 wps_ 前缀，尝试去掉前缀
    const shortName = name
      .replace('wps_excel_', '')
      .replace('wps_word_', '')
      .replace('wps_ppt_', '');

    if (indexNames.includes(name) || indexNames.includes(shortName)) return;
    unknown.push(name);
  });
  return unknown;
}

/**
 * 断言文件引用的所有工具名称均存在（文件缺失时跳过）
 * @param filePath 待校验文件绝对路径
 * @param excludeLayout 是否排除布局/动画类型（Skills 专属）
 */
function expectValidToolRefs(filePath: string, excludeLayout = false): void {
  if (!fs.existsSync(filePath)) {
    // 在 MCP 测试环境中，skills/agents 目录可能不存在，跳过
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const unknown = findUnknownTools(extractToolNames(content, excludeLayout));

  if (unknown.length > 0) {
    console.error(`\n${filePath} 引用了不存在的工具\n${unknown.map(n => `  ${n}`).join('\n')}`);
  }
  expect(unknown.length).toBe(0);
}

describe('Skills 引用的工具名称一致性', () => {
  const skillFiles = [
    'wps-excel/SKILL.md',
    'wps-word/SKILL.md',
    'wps-ppt/SKILL.md',
    'wps-office/SKILL.md',
    'wps-proofread/SKILL.md',
  ];

  skillFiles.forEach(skillPath => {
    it(`文件 ${skillPath} 不应引用不存在的工具`, () => {
      expectValidToolRefs(path.join(skillsDir, skillPath), true);
    });
  });
});

describe('Agents 引用的工具名称一致性', () => {
  const agentFiles = ['wps-expert.md', 'wps-excel.md', 'wps-word.md', 'wps-ppt.md'];

  agentFiles.forEach(agentPath => {
    it(`文件 ${agentPath} 不应引用不存在的工具`, () => {
      expectValidToolRefs(path.join(agentsDir, agentPath));
    });
  });
});

describe('wps-expert.md tools 字段验证', () => {
  it('wps-expert.md 不应引用不存在的工具', () => {
    expectValidToolRefs(path.resolve(agentsDir, 'wps-expert.md'));
  });
});
