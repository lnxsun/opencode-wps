#!/usr/bin/env node
/**
 * 校验 4 个 agent front-matter 不设 `tools:` 白名单（防 Issue #247 根因复发）
 *
 * 背景：Issue #247「校对不稳定 2」根因是 8/20 给 wps-expert 误加了裸名
 * `tools:` 白名单。opencode 将 MCP server `wps-office` 的工具按带
 * `wps-office_` 前缀的真名注册，而 agent front-matter 的 tools 白名单若写裸名
 * 会匹配 0 个工具 → 该 agent 可见 WPS 工具数 = 0 → 调不到 wps_office_execute。
 *
 * 设计约束（对齐 docs/superpowers/specs/2026-05-08-mcp-progressive-loading-design.md
 * Phase 2「删除 tools: 字段，agent 收敛靠 MCP 网关而非白名单」）：
 *   4 个 WPS agent（wps-expert/word/excel/ppt）均不得声明 tools 字段，
 *   对全部工具可见，工具调用的收敛由 MCP 网关（wps_office_search/execute）负责。
 *
 * 本脚本作为 CI 门禁，一旦有人往 agent front-matter 误加回 tools 白名单即告警。
 *
 * 用法：
 *   node scripts/validate-agent-no-tools.js
 *   node scripts/validate-agent-no-tools.js --agents-dir <自定义agents目录>  # 供回归测试在临时目录建 fixture
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
// --agents-dir 可选：测试时指定临时目录，避免污染真实 agents/
const argIdx = process.argv.indexOf('--agents-dir');
const AGENTS_DIR =
  argIdx !== -1 && process.argv[argIdx + 1]
    ? path.resolve(process.argv[argIdx + 1])
    : path.join(rootDir, 'agents');
const AGENT_FILES = ['wps-expert.md', 'wps-word.md', 'wps-excel.md', 'wps-ppt.md'];

const errors = [];
const ok = [];

for (const file of AGENT_FILES) {
  const filePath = path.join(AGENTS_DIR, file);
  if (!fs.existsSync(filePath)) {
    errors.push(`缺少 agent 定义文件: ${file}`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  // front-matter：首个 --- 与第二个 --- 之间的头部
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    errors.push(`${file}: 缺少合法的 YAML front-matter（应为一对 --- 包裹）`);
    continue;
  }
  const fm = fmMatch[1];
  // 校验 front-matter 中不出现顶层 tools: 字段（YAML 顶层字段无缩进）
  if (/^tools:[ \t]*(#.*)?$/m.test(fm)) {
    errors.push(
      `${file}: front-matter 声明了顶层 tools: 白名单——4 个 WPS agent 均不得设 tools 白名单（防 Issue #247 根因复发）。请删除该字段，agent 收敛靠 MCP 网关。`
    );
  } else {
    ok.push(`${file}: 无 tools 白名单 ✓`);
  }
}

for (const line of ok) console.log('  ' + line);
if (errors.length) {
  console.error('\n❌ agent tools 白名单校验失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('\n✅ 4 个 agent 均未声明 tools 白名单');
