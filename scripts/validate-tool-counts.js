#!/usr/bin/env node
/**
 * 校验 MCP 工具体系数量与文档描述一致
 *
 * 背景：文档中"238 注册工具 / 240 COM Actions / 总计 490"等数字随开发持续漂移，
 * 手工维护总是滞后。本脚本读取代码中的真实数量（以代码为准），
 * 并检查关键文档中是否仍残留过时的硬编码数字。
 *
 * 用法：node scripts/validate-tool-counts.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

// ---- 1. 从代码统计真实数量 ----
// 注册工具：wps-office-mcp/src/tools/{excel,word,ppt,common}/*.ts 中的 name: '...'
const toolDirs = ['excel', 'word', 'ppt', 'common'];
const toolRoot = path.join(rootDir, 'wps-office-mcp', 'src', 'tools');
const counts = { excel: 0, word: 0, ppt: 0, common: 0 };
let registeredTotal = 0;

for (const dir of toolDirs) {
  const dirPath = path.join(toolRoot, dir);
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.ts'));
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dirPath, f), 'utf8');
    const matches = src.match(/name:\s*'[^']+'/g) || [];
    n += matches.length;
  }
  counts[dir] = n;
  registeredTotal += n;
}

// COM Actions：gateway/index.ts 的 COM_ACTIONS 数组条目
const gatewaySrc = fs.readFileSync(path.join(toolRoot, 'gateway', 'index.ts'), 'utf8');
const comActionsBlock = gatewaySrc.match(/const COM_ACTIONS: ToolIndexItem\[\] = \[([\s\S]*?)\n\];/);
const comActionsCount = comActionsBlock
  ? (comActionsBlock[1].match(/name:\s*'[^']+'/g) || []).length
  : 0;

console.log(`实际数量（以代码为准）:`);
console.log(`  注册工具: ${registeredTotal} (Excel ${counts.excel} / Word ${counts.word} / PPT ${counts.ppt} / Common ${counts.common})`);
console.log(`  COM Actions: ${comActionsCount}`);
console.log(`  内置工具: 12`);
console.log(`  总计: ${12 + registeredTotal + comActionsCount}\n`);

// ---- 2. 检查文档残留的过时数字 ----
const docFiles = [
  'README.md',
  'AGENTS.md',
  path.join('docs', 'MCP.md'),
  path.join('wps-office-mcp', 'src', 'tools', 'index.ts'),
  path.join('wps-office-mcp', 'src', 'tools', 'gateway', 'index.ts'),
];
const stalePatterns = [
  // 精确的旧数字（238 注册工具、240 COM Actions、490 总计、254 全部工具）
  /238\s*(个)?\s*(注册工具|registered)/,
  /240\s*(个)?\s*(COM Actions|COM_ACTIONS)/,
  /总计\s*490|490\s*个工具/,
  /全部\s*254|254\s*个工具/,
];

for (const rel of docFiles) {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  for (const re of stalePatterns) {
    const m = src.match(re);
    if (m) {
      errors.push(`${rel}: 残留过时数字「${m[0].trim()}」（第 ${src.slice(0, m.index).split('\n').length} 行）`);
    }
  }
}

// ---- 3. 汇总 ----
if (errors.length > 0) {
  console.error('\n❌ 工具数量文档校验失败（存在过时硬编码数字）:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}
console.log('✅ 工具数量校验通过：文档无过时硬编码数字，数量以代码为准');
