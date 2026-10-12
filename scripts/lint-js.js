#!/usr/bin/env node
/**
 * 全仓 JavaScript 语法门禁（`npm run lint` 的落地实现）
 *
 * 背景：仓库根 package.json 长期无 lint 命令。由于大量测试/脚本使用 ES5 `var`
 * 风格，直接引入 ESLint 默认规则会海量误报（prefer-const 等数百条），属「想当然」
 * 不可落地。本任务采用务实方案：lint = 全仓 .js 逐个 `node --check` 语法检查，
 * 真实有效、零误报、可立即在 CI 落地。ESLint 静态规则增强另开 issue 演进。
 *
 * 用法：npm run lint   （等价 node scripts/lint-js.js）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
// 需忽略的目录/文件（node_modules、构建产物、第三方等）
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist']);
// 待检查的顶层入口（若放根目录），其余按遍历收集
const JS_EXT = '.js';

/** 递归收集 .js 文件（跳过忽略目录；对非忽略目录的读失败打印警告而非静默跳过） */
function collectJs(dir) {
  const result = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.warn(`⚠️ 无法读取目录 ${dir}（${e.message}），跳过该目录`);
    return result;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      result.push(...collectJs(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(JS_EXT)) {
      result.push(path.join(dir, entry.name));
    }
  }
  return result;
}

const files = collectJs(rootDir).sort();
if (files.length === 0) {
  console.error('✗ 未找到任何 .js 文件');
  process.exit(1);
}

console.log(`语法检查 ${files.length} 个 .js 文件：`);
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`✗ 语法错误：${file}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n✗ ${failed}/${files.length} 个文件存在语法错误`);
  process.exit(1);
}
console.log(`\n✓ 全部 ${files.length} 个 .js 文件语法通过`);
