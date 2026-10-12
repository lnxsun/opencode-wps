/**
 * 版本源一致性守卫回归测试（Issue #295 复盘 · 铁律 22 预防性闭环）
 *
 * 背景：#295 复盘 10/12 实探到 `scripts/validate-versions.js` 的**校验盲区** ——
 * 只覆盖 `wps-office-mcp/package-lock.json`，**漏了根 `package-lock.json`**，
 * 于是根 `package.json`(1.9.27) 与根 `package-lock.json`(1.9.26) 长期漂移
 * 而门禁全绿。本测试守护新抽出的纯函数 `checkLockfileVersions`，确保：
 *   ① 一致 → 无错误（不误报）；
 *   ② 顶层漂移 → 精确报错（**变异自证**：注入反例断言由绿转红）；
 *   ③ packages[""] 漂移 → 精确报错（第二处 version 不可漏）；
 *   ④ packages[""] 缺失 → 不因缺字段崩溃/误报。
 *
 * 运行：node tests/validate-versions.test.js（被 npm run test 自动聚合）
 */
'use strict';

const { checkLockfileVersions } = require('../scripts/lib/version-sources.js');

// ---- 自建 mini 测试框架（与 tests/ 其他套件一致，无第三方依赖）----
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
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || 'not equal') + ': got ' + a + ', want ' + b);
}

const mk = (top, inner) => ({ version: top, packages: { '': { version: inner } } });

// ---- 用例 ----
test('一致时无错误（顶层 + packages[""] 均为期望）', () => {
  assertEqual(
    checkLockfileVersions(
      'package-lock.json',
      'package-lock.json',
      mk('1.9.27', '1.9.27'),
      '1.9.27'
    ),
    []
  );
});

test('变异自证：顶层漂移 → 由绿转红（精确报 1 条）', () => {
  const errs = checkLockfileVersions(
    'package-lock.json',
    'package-lock.json',
    mk('1.9.26', '1.9.27'),
    '1.9.27'
  );
  assertEqual(errs.length, 1, '应报 1 条');
  if (!errs[0].includes('顶层') || !errs[0].includes('1.9.26')) {
    throw new Error('错误信息应含「顶层」与漂移值 1.9.26: ' + errs[0]);
  }
});

test('变异自证：packages[""] 漂移 → 由绿转红（第二处 version 不可漏）', () => {
  const errs = checkLockfileVersions(
    'package-lock.json',
    'package-lock.json',
    mk('1.9.27', '1.9.26'),
    '1.9.27'
  );
  assertEqual(errs.length, 1, '应报 1 条');
  if (!errs[0].includes('packages[""]') || !errs[0].includes('1.9.26')) {
    throw new Error('错误信息应含 packages[""] 与漂移值 1.9.26: ' + errs[0]);
  }
});

test('两处同时漂移 → 精确报 2 条', () => {
  const errs = checkLockfileVersions(
    'package-lock.json',
    'package-lock.json',
    mk('1.9.26', '1.9.25'),
    '1.9.27'
  );
  assertEqual(errs.length, 2, '应报 2 条');
});

test('packages[""] 缺失时不崩溃、不因缺字段误报', () => {
  const errs = checkLockfileVersions(
    'package-lock.json',
    'package-lock.json',
    { version: '1.9.27' },
    '1.9.27'
  );
  assertEqual(errs, [], '缺 packages[""] 且顶层一致 → 无错误');
});

// ---- 真实仓库根用例（非临时夹具）：本仓 lockfile 必须与单一版本源一致 ----
test('真实仓库：根 package-lock.json 与根 package.json 一致', () => {
  const fs = require('fs');
  const path = require('path');
  const rootDir = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
  const errs = checkLockfileVersions('package-lock.json', 'package-lock.json', lock, pkg.version);
  assertEqual(errs, [], '本仓根 lockfile 应与 package.json 同版本');
});

// ---- 汇总 ----
console.log(`\nvalidate-versions: ${passCount}/${testCount} 通过`);
if (failures.length > 0) {
  failures.forEach(f => console.error('  - ' + f.name + ': ' + f.err.message));
  process.exit(1);
}
