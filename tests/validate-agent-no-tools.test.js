/**
 * validate-agent-no-tools 防回归门禁的回归测试（Issue #247）
 *
 * 背景：Issue #247「校对不稳定 2」根因是 8/20 给 wps-expert 误加了裸名 tools
 * 白名单，导致该 agent 可见 WPS 工具数 = 0。修复方向（PR #254）是 4 个 agent
 * 均不设 tools 白名单。本测试守护 validate-agent-no-tools.js 本身：确保
 * 「agent 带 tools 白名单即检出失败」「无 tools 即通过」两个断言始终成立，
 * 防未来把校验写松/写坏导致根因复发而不自知。
 *
 * 运行：node tests/validate-agent-no-tools.test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'validate-agent-no-tools.js');
const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const AGENT_FILES = ['wps-expert.md', 'wps-word.md', 'wps-excel.md', 'wps-ppt.md'];

// ---- mini 测试框架 ----
let testCount = 0;
let passCount = 0;
const failures = [];

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failures.push({ name, err: e });
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error((msg || 'not equal') + ': got ' + actual + ', want ' + expected);
}
function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg || 'expected true');
}

// ---- 工具：建临时 agents 目录 ----
function makeTmpAgents(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-notools-'));
  for (const f of AGENT_FILES) {
    fs.writeFileSync(path.join(dir, f), contents[f] || '', 'utf8');
  }
  return dir;
}
function runScript(dir) {
  return spawnSync(process.execPath, [SCRIPT, '--agents-dir', dir], { encoding: 'utf8' });
}

const NO_TOOLS_FM = `---
description: test agent
mode: subagent
color: "#000000"
---
body
`;
const WITH_TOOLS_FM = `---
description: test agent
mode: subagent
color: "#000000"
tools:
  wps_office_execute: true
---
body
`;
const WITH_TOOLS_INLINE = `---
description: test agent
mode: subagent
color: "#000000"
tools:   # 误加 tools 行内声明
---
body
`;

// ---- 用例 ----
test('真实仓库 agents 目录（PR #254 后已删 tools）→ 通过', () => {
  const r = runScript(AGENTS_DIR);
  assertEqual(r.status, 0, '真实 agents 目录应校验通过, stdout=' + r.stdout);
});

test('agent 声明顶层 tools: 白名单 → 检出失败（exit 1）', () => {
  const contents = {};
  AGENT_FILES.forEach(f => (contents[f] = NO_TOOLS_FM));
  contents['wps-expert.md'] = WITH_TOOLS_FM;
  const dir = makeTmpAgents(contents);
  const r = runScript(dir);
  assertEqual(r.status, 1, '含 tools 时应失败, stdout=' + r.stdout + ' stderr=' + r.stderr);
  assertTrue(/wps-expert\.md/.test(r.stderr), '报错应指向具体文件');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('agent 声明 tools 行内（带注释）→ 检出失败（exit 1）', () => {
  const contents = {};
  AGENT_FILES.forEach(f => (contents[f] = NO_TOOLS_FM));
  contents['wps-word.md'] = WITH_TOOLS_INLINE;
  const dir = makeTmpAgents(contents);
  const r = runScript(dir);
  assertEqual(r.status, 1, '含 tools 行内声明时应失败, stderr=' + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('缺 agent 文件 → 检出失败（exit 1）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-notools-'));
  // 只写 3 个，缺 1 个
  fs.writeFileSync(path.join(dir, 'wps-expert.md'), NO_TOOLS_FM, 'utf8');
  fs.writeFileSync(path.join(dir, 'wps-word.md'), NO_TOOLS_FM, 'utf8');
  fs.writeFileSync(path.join(dir, 'wps-excel.md'), NO_TOOLS_FM, 'utf8');
  const r = runScript(dir);
  assertEqual(r.status, 1, '缺 agent 文件应失败, stderr=' + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('非法 front-matter（无 --- 包裹）→ 检出失败（exit 1）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-notools-'));
  AGENT_FILES.forEach(f => {
    fs.writeFileSync(path.join(dir, f), 'not front matter', 'utf8');
  });
  const r = runScript(dir);
  assertEqual(r.status, 1, '非法 front-matter 应失败, stderr=' + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

// 第 5 轮评审 F：补 CRLF 行尾 front-matter 回归用例（脚本声明支持 CRLF，Windows 环境可能以 CRLF 保存）
const CRLF_NO_TOOLS = `---\r\ndescription: test agent crlf\r\nmode: subagent\r\ncolor: "#111111"\r\n---\r\nbody\r\n`;
test('CRLF 行尾 front-matter 的 agent（无 tools）→ 通过', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-notools-'));
  AGENT_FILES.forEach(f => fs.writeFileSync(path.join(dir, f), CRLF_NO_TOOLS, 'utf8'));
  const r = runScript(dir);
  assertEqual(r.status, 0, 'CRLF front-matter 应通过, stdout=' + r.stdout + ' stderr=' + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- 汇总 ----
console.log(`\n${passCount}/${testCount} 用例通过`);
if (failures.length) {
  process.exit(1);
}
