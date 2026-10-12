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

// 启动即注册的内置工具（直接注册，不在 gateway index 中）。
// ⚠️ Issue #373 第 4 轮评审 CR4-2：原为**手写 14 项白名单**（注释还写死「12 内置 + 2 Gateway」）——
//   新增 `wps_whoami` 后本白名单缺项，使「文档引用的工具名是否存在」这一校验对 whoami **失明**
//   （实测 findUnknownTools('wps_whoami') 落到 UNKNOWN 分支）。现改为**派生自唯一定义者**
//   `mcp-server.ts`，加内置工具只需改源码（与 validate-tool-counts.js / mcp-builtin.test.ts 同口径）。
// ⚠️ Issue #382 DECISION-1：注册面 = 内置工具（mcp-server.ts）+ 注册工具（allTools）——
//   4 个纯 TS 校对工具已直连注册（其 full name 形如 `wps_word_proofread_basic`），
//   若仍只认 mcp-server 的 15 个内置，SKILL 引用它们会被误判为「不存在的工具」。
const ALL_MCP_TOOLS = new Set<string>([
  ...(
    require('fs')
      .readFileSync(require('path').join(__dirname, '../../server/mcp-server.ts'), 'utf8')
      .match(/name:\s*'(wps_[a-z0-9_]+)'/g) || []
  ).map((m: string) => m.replace(/name:\s*'|'/g, '')),
  ...(require('../../tools').allTools as Array<{ definition: { name: string } }>).map(
    t => t.definition.name
  ),
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
  // Issue #277：fix_action 是 issue 字段名（非工具名），SKILL.md 中以反引号书写会被
  // 工具名提取正则 `\`(\w+(?:_\w+)+)\`` 命中 —— 登记为已知非工具名
  'fix_action',
  // Issue #294：skipped_segments 是 proofreadAccumulate 的入参名（非工具名），
  // SKILL.md 铁律 2 例外条款以反引号书写会被同一正则命中 —— 登记为已知非工具名
  'skipped_segments',
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
  'filePath',
  // 治理层强制的隐藏参数（非 MCP 工具名）
  '_processed_to_paragraph',
  // 校对 SKILL 2e 的 Layer 2 合法强制通道参数，由治理层 P3 消费
  // （治理层拦截文案要求传入），不是 MCP 工具名 —— 以反引号书写便于读者溯源。
  '_force_ai_fix',
  '_ai_evidence',
  'MAX_PARAGRAPHS_PER_BATCH',
  // 校对 SKILL 引用批次大小单一来源常量（跨运行时同值校验需要读者能溯源）
  'PROOFREAD_BATCH_MAX',
  // 校对确认工具的必填参数名（非工具名），SKILL 2c 以反引号书写
  'ai_issue_count',
  // Issue #395 CR2-6：`TYPE_METRIC_MAP` 是校对类型词表的**代码常量名**（非工具名），
  // 校对 SKILL 须以反引号书写以便读者溯源 —— 被工具名提取正则命中，登记为已知非工具名。
  'TYPE_METRIC_MAP',
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
