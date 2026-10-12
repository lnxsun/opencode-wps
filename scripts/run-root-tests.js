#!/usr/bin/env node
/**
 * 聚合运行根目录单元测试（tests/*.test.js，排除 e2e.test.js）
 *
 * 背景：历史上根测试通过 `node tests/*.test.js` 在 CI 与本地手写清单逐条运行，
 * 易出现「本地跑了一部分、CI 跑另一部分」的命令与文档脱节问题。
 * 本脚本作为 `npm run test` 的落地实现，显式聚合所有根单元测试（排除集成测试
 * `e2e.test.js`，由 `npm run test:e2e` 单独负责），保证本地与 CI 用同一入口。
 *
 * 用法：npm run test   （等价 node scripts/run-root-tests.js）
 *
 * 前置依赖检查（Issue #297）：本脚本启动时先探测根 package.json 的 dependencies
 * 是否已安装。缺失时打印「请先执行 npm install」指引并以 EXIT=2（前置条件未满足，
 * 区别于测试失败的 EXIT=1）退出，避免裸 `Cannot find module` 误导排查。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { findMissingRootDeps } = require('./lib/check-root-deps.js');

const rootDir = path.resolve(__dirname, '..');
const testsDir = path.join(rootDir, 'tests');
const EXCLUDED = new Set(['e2e.test.js']); // e2e 由 test:e2e 单独负责，避免重复执行

// ---- 前置依赖检查（Issue #297）----
// 无 node_modules 时直接以裸 Cannot find module 崩溃，报错不指向「先装依赖」。
// 在此提前拦截，给出明确指引 + 可识别错误码（EXIT=2），已装依赖时行为不变。
const missingDeps = findMissingRootDeps(rootDir);
if (missingDeps.length > 0) {
  console.error('✗ 缺少运行根单元测试所需的依赖: ' + missingDeps.join(', '));
  console.error('  请先执行 npm install（如需 MCP 侧依赖，另执行 npm run mcp:install）后重试。');
  console.error('  （退出码 2 = 前置条件未满足，非测试断言失败）');
  process.exit(2);
}

const files = fs
  .readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js') && !EXCLUDED.has(f))
  .sort();

if (files.length === 0) {
  console.error('✗ 未找到任何根单元测试（tests/*.test.js，排除 e2e.test.js）');
  process.exit(1);
}

console.log(`聚合运行 ${files.length} 个根单元测试：`);
files.forEach(f => console.log(`  - ${f}`));

let failed = 0;
for (const file of files) {
  const testPath = path.join(testsDir, file);
  const r = spawnSync(process.execPath, [testPath], { stdio: 'inherit' });
  const ok = r.status === 0;
  if (!ok) {
    // status 为 null 且存在 signal 说明子进程被信号终止（非正常退出码）
    const reason = r.signal ? `被信号 ${r.signal} 终止` : `退出码 ${r.status}`;
    console.error(`✗ ${file} 失败（${reason}）`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n✗ ${failed}/${files.length} 个根单元测试失败`);
  process.exit(1);
}
console.log(`\n✓ 全部 ${files.length} 个根单元测试通过`);
