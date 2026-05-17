/**
 * Skills/Agents 一致性测试
 * 验证 Skills 和 Agents 中引用的所有工具名称在 TOOLS_INDEX 中存在
 *
 * @date 2026-05-18
 */

import { TOOLS_INDEX } from '../../tools/gateway';

// Mock logger
jest.mock('../../utils/logger', () => ({
  log: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
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

// 14 个内置工具（直接注册，不在 gateway index 中）
const BUILTIN_TOOLS = new Set([
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

// Legacy 工具名称映射：旧的 wps_office_* 工具名 -> gateway index 中的实际工具名
const LEGACY_TOOLS: Record<string, string> = {
  'wps_office_check_status': 'getContext',
  'wps_office_activate_app': 'getContext',
  'wps_office_new_document': 'createDocument',
  'wps_office_open_file': 'openFile',
  'wps_office_save_document': 'save',
  'wps_office_save_as': 'saveAs',
  'wps_office_close_document': 'closeDocument',
  'wps_office_export_pdf': 'convertToPDF',
  'wps_office_export_image': 'convertFormat',
  'wps_office_export_html': 'convertFormat',
  'wps_office_print': 'convertToPDF',
};

describe('Skills 引用的工具名称一致性', () => {
  const skillFiles = [
    'wps-excel/SKILL.md',
    'wps-word/SKILL.md',
    'wps-ppt/SKILL.md',
    'wps-office/SKILL.md',
  ];

  skillFiles.forEach(skillPath => {
    const filePath = path.join(skillsDir, skillPath);

    it(`文件 ${skillPath} 不应引用不存在的工具`, () => {
      if (!fs.existsSync(filePath)) {
        // 在 MCP 测试环境中，skills 目录可能不存在，跳过
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // 提取所有反引号包裹的工具名称
      // 排除：纯下划线（如 ___）、布局类型（如 title_content）、动画类型（如 fly_in）
      const toolNamePattern = /`(\w+(?:_\w+)+)`/g;
      const matches = new Set<string>();
      let m;
      while ((m = toolNamePattern.exec(content)) !== null) {
        const name = m[1];
        // 排除纯下划线、布局类型（含有常见分隔符）、动画类型
        if (/^_+$/.test(name)) continue;  // 纯下划线如 ___
        if (/^(title_content|two_column|comparison|blank|fly_in|zoom|fade|wipe|appear)$/.test(name)) continue;  // 布局/动画类型
        matches.add(name);
      }

      // 验证每个引用的工具名称
      const errors: string[] = [];
      const indexNames = TOOLS_INDEX.map(t => t.name);

      matches.forEach(name => {
        if (BUILTIN_TOOLS.has(name)) return;
        if (LEGACY_TOOLS[name]) return; // 已映射到 legacy
        if (indexNames.includes(name)) return;

        // gateway index 工具名称不带 wps_ 前缀，尝试去掉前缀
        const shortName = name
          .replace('wps_excel_', '')
          .replace('wps_word_', '')
          .replace('wps_ppt_', '');

        if (indexNames.includes(shortName)) return;

        errors.push(`  ${name} (尝试匹配: ${shortName})`);
      });

      if (errors.length > 0) {
        console.error(`\n${skillPath} 引用了不存在的工具:\n${errors.join('\n')}`);
      }
      expect(errors.length).toBe(0);
    });
  });
});

describe('Agents 引用的工具名称一致性', () => {
  const agentFiles = [
    'wps-expert.md',
    'wps-excel.md',
    'wps-word.md',
    'wps-ppt.md',
  ];

  agentFiles.forEach(agentPath => {
    const filePath = path.join(agentsDir, agentPath);

    it(`文件 ${agentPath} 不应引用不存在的工具`, () => {
      if (!fs.existsSync(filePath)) {
        // 在 MCP 测试环境中，agents 目录可能不存在，跳过
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      const toolNamePattern = /`(\w+(?:_\w+)+)`/g;
      const matches = new Set<string>();
      let m;
      while ((m = toolNamePattern.exec(content)) !== null) {
        matches.add(m[1]);
      }

      const errors: string[] = [];
      matches.forEach(name => {
        if (BUILTIN_TOOLS.has(name)) return;

        const shortName = name
          .replace('wps_excel_', '')
          .replace('wps_word_', '')
          .replace('wps_ppt_', '');

        const inIndex = indexNames.includes(name) || indexNames.includes(shortName);
        if (!inIndex) {
          errors.push(`  ${name}`);
        }
      });

      if (errors.length > 0) {
        console.error(`\n${agentPath} 引用了不存在的工具:\n${errors.join('\n')}`);
      }
      expect(errors.length).toBe(0);
    });
  });
});

describe('wps-expert.md tools 字段验证', () => {
  it('wps-expert.md 不应引用不存在的工具', () => {
    const filePath = path.resolve(agentsDir, 'wps-expert.md');
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');

    const toolNamePattern = /`(\w+(?:_\w+)+)`/g;
    const tools: string[] = [];
    let m;
    while ((m = toolNamePattern.exec(content)) !== null) {
      tools.push(m[1]);
    }

    const errors: string[] = [];

    tools.forEach(name => {
      if (BUILTIN_TOOLS.has(name)) return;

      const shortName = name
        .replace('wps_excel_', '')
        .replace('wps_word_', '')
        .replace('wps_ppt_', '');

      const inIndex = indexNames.includes(name) || indexNames.includes(shortName);
      if (!inIndex) {
        errors.push(`  ${name}`);
      }
    });

    if (errors.length > 0) {
      console.error(`\nwps-expert.md 引用了不存在的工具:\n${errors.join('\n')}`);
    }
    expect(errors.length).toBe(0);
  });
});