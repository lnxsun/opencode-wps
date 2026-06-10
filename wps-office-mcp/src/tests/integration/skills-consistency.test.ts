/**
 * Skills/Agents ä¸€è‡´æ€§æµ‹è¯?
 * éªŒè¯ Skills å’?Agents ä¸­å¼•ç”¨çš„æ‰€æœ‰å·¥å…·åç§°åœ¨ TOOLS_INDEX ä¸­å­˜åœ?
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

// Skills å’?Agents åœ¨é¡¹ç›®æ ¹ç›®å½•ï¼Œä¸åœ?MCP æ¨¡å—å†?
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const skillsDir = path.resolve(PROJECT_ROOT, 'skills');
const agentsDir = path.resolve(PROJECT_ROOT, 'agents');

// 14 ä¸ª MCP å·¥å…·ï¼ˆ12 å†…ç½® + 2 Gatewayï¼Œç›´æŽ¥æ³¨å†Œï¼Œä¸åœ¨ gateway index ä¸­ï¼‰
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

// Legacy å·¥å…·åç§°æ˜ å°„ï¼šæ—§ç‰ˆ wps_office_* å·¥å…·å -> gateway index ä¸­çš„å®žé™…å·¥å…·å
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

describe('Skills å¼•ç”¨çš„å·¥å…·åç§°ä¸€è‡´æ€?, () => {
  const skillFiles = [
    'wps-excel/SKILL.md',
    'wps-word/SKILL.md',
    'wps-ppt/SKILL.md',
    'wps-office/SKILL.md',
  ];

  skillFiles.forEach(skillPath => {
    const filePath = path.join(skillsDir, skillPath);

    it(`æ–‡ä»¶ ${skillPath} ä¸åº”å¼•ç”¨ä¸å­˜åœ¨çš„å·¥å…·`, () => {
      if (!fs.existsSync(filePath)) {
        // åœ?MCP æµ‹è¯•çŽ¯å¢ƒä¸­ï¼Œskills ç›®å½•å¯èƒ½ä¸å­˜åœ¨ï¼Œè·³è¿‡
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // æå–æ‰€æœ‰åå¼•å·åŒ…è£¹çš„å·¥å…·åç§?
      // æŽ’é™¤ï¼šçº¯ä¸‹åˆ’çº¿ï¼ˆå¦?___ï¼‰ã€å¸ƒå±€ç±»åž‹ï¼ˆå¦‚ title_contentï¼‰ã€åŠ¨ç”»ç±»åž‹ï¼ˆå¦?fly_inï¼?
      const toolNamePattern = /`(\w+(?:_\w+)+)`/g;
      const matches = new Set<string>();
      let m;
      while ((m = toolNamePattern.exec(content)) !== null) {
        const name = m[1];
        // æŽ’é™¤çº¯ä¸‹åˆ’çº¿ã€å¸ƒå±€ç±»åž‹ï¼ˆå«æœ‰å¸¸è§åˆ†éš”ç¬¦ï¼‰ã€åŠ¨ç”»ç±»åž?
        if (/^_+$/.test(name)) continue;  // çº¯ä¸‹åˆ’çº¿å¦?___
        if (/^(title_content|two_column|comparison|blank|fly_in|zoom|fade|wipe|appear)$/.test(name)) continue;  // å¸ƒå±€/åŠ¨ç”»ç±»åž‹
        matches.add(name);
      }

      // éªŒè¯æ¯ä¸ªå¼•ç”¨çš„å·¥å…·åç§?
      const errors: string[] = [];
      const indexNames = TOOLS_INDEX.map(t => t.name);

      matches.forEach(name => {
        if (ALL_MCP_TOOLS.has(name)) return;
        if (LEGACY_TOOLS[name]) return; // å·²æ˜ å°„åˆ° legacy
        if (indexNames.includes(name)) return;

        // gateway index å·¥å…·åç§°ä¸å¸¦ wps_ å‰ç¼€ï¼Œå°è¯•åŽ»æŽ‰å‰ç¼€
        const shortName = name
          .replace('wps_excel_', '')
          .replace('wps_word_', '')
          .replace('wps_ppt_', '');

        if (indexNames.includes(shortName)) return;

        errors.push(`  ${name} (å°è¯•åŒ¹é…: ${shortName})`);
      });

      if (errors.length > 0) {
        console.error(`\n${skillPath} å¼•ç”¨äº†ä¸å­˜åœ¨çš„å·¥å…·\n${errors.join('\n')}`);
      }
      expect(errors.length).toBe(0);
    });
  });
});

describe('Agents å¼•ç”¨çš„å·¥å…·åç§°ä¸€è‡´æ€?, () => {
  const agentFiles = [
    'wps-expert.md',
    'wps-excel.md',
    'wps-word.md',
    'wps-ppt.md',
  ];

  agentFiles.forEach(agentPath => {
    const filePath = path.join(agentsDir, agentPath);

    it(`æ–‡ä»¶ ${agentPath} ä¸åº”å¼•ç”¨ä¸å­˜åœ¨çš„å·¥å…·`, () => {
      if (!fs.existsSync(filePath)) {
        // åœ?MCP æµ‹è¯•çŽ¯å¢ƒä¸­ï¼Œagents ç›®å½•å¯èƒ½ä¸å­˜åœ¨ï¼Œè·³è¿‡
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
        if (ALL_MCP_TOOLS.has(name)) return;
        if (LEGACY_TOOLS[name]) return;

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
        console.error(`\n${agentPath} å¼•ç”¨äº†ä¸å­˜åœ¨çš„å·¥å…·\n${errors.join('\n')}`);
      }
      expect(errors.length).toBe(0);
    });
  });
});

describe('wps-expert.md tools å­—æ®µéªŒè¯', () => {
  it('wps-expert.md ä¸åº”å¼•ç”¨ä¸å­˜åœ¨çš„å·¥å…·', () => {
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
      if (ALL_MCP_TOOLS.has(name)) return;
      if (LEGACY_TOOLS[name]) return;

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
      console.error(`\nwps-expert.md å¼•ç”¨äº†ä¸å­˜åœ¨çš„å·¥å…·\n${errors.join('\n')}`);
    }
    expect(errors.length).toBe(0);
  });
});
