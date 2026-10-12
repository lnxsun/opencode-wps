/**
 * 根侧运行时依赖前置检查回归测试（Issue #297）
 *
 * 背景：无 node_modules 时 `npm test` 直接以裸 `Cannot find module 'fs-extra'`
 * 崩溃，报错不指向「先装依赖」，误导排查。scripts/lib/check-root-deps.js 提供
 * findMissingRootDeps 纯函数供入口脚本前置拦截。
 *
 * 本文件固化正/负向用例守护该逻辑：已装依赖 → 空清单（不误报）；缺依赖 →
 * 精确列出缺失项；package.json 缺失/损坏 → 返回空清单（不拦截，交回原流程）。
 *
 * 另含两条**真实仓库根**用例（非临时夹具），覆盖 `mkdtemp` 假仓库做不到的事：
 *   1. 对仓库根跑探测，断言「缺失清单 == 未装项」，捕捉本仓漏报/误报；
 *   2. 只断言「未装项必须被报出」，且期望值按真实环境裁剪 —— 不断言清单长度，
 *      避免环境装没装恰好翻转断言方向（假阳性，见 #297 R2-1）。
 * 注意：真实仓库依赖不一定缺失，故用例按 require.resolve 实测结果推导期望，
 * 保证在「装了」与「没装」两种环境下都只表达真实语义。
 *
 * 运行：node tests/check-root-deps.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { findMissingRootDeps } = require('../scripts/lib/check-root-deps.js');

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

function skip(name, reason) {
  testCount++;
  console.log('  - ' + name + '（跳过：' + reason + '）');
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg || 'expected true');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error((msg || 'not equal') + ': got ' + actual + ', want ' + expected);
}

// ---- 夹具：临时 rootDir + 伪 package.json ----
function mkTempRoot(deps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rootdeps-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'tmp', version: '0.0.0', dependencies: deps || {} }),
    'utf8'
  );
  return dir;
}
// 造一个真实可解析的假依赖目录（node_modules/<name>/package.json + index.js）
function writeFakeDep(rootDir, name) {
  const depDir = path.join(rootDir, 'node_modules', name);
  fs.mkdirSync(depDir, { recursive: true });
  fs.writeFileSync(
    path.join(depDir, 'package.json'),
    JSON.stringify({ name: name, version: '1.0.0', main: 'index.js' }),
    'utf8'
  );
  fs.writeFileSync(path.join(depDir, 'index.js'), 'module.exports = {};', 'utf8');
}

// ---- 用例 ----
test('findMissingRootDeps：依赖齐全时返回空清单（不误报）', () => {
  const root = mkTempRoot({ 'fake-present-dep': '^1.0.0' });
  writeFakeDep(root, 'fake-present-dep');
  const missing = findMissingRootDeps(root);
  assertEqual(missing.length, 0, '不应报缺失');
  fs.rmSync(root, { recursive: true, force: true });
});

test('findMissingRootDeps：缺失依赖被精确列出', () => {
  const root = mkTempRoot({ 'fake-missing-dep': '^1.0.0' });
  const missing = findMissingRootDeps(root);
  assertEqual(missing.length, 1, '应报 1 个缺失');
  assertEqual(missing[0], 'fake-missing-dep', '缺失项应为 fake-missing-dep');
  fs.rmSync(root, { recursive: true, force: true });
});

test('findMissingRootDeps：部分缺失只报缺失项', () => {
  const root = mkTempRoot({ 'fake-present-dep': '^1.0.0', 'fake-absent-dep': '^1.0.0' });
  writeFakeDep(root, 'fake-present-dep');
  const missing = findMissingRootDeps(root);
  assertEqual(missing.length, 1, '只应报 1 个缺失');
  assertEqual(missing[0], 'fake-absent-dep', '缺失项应为 fake-absent-dep');
  fs.rmSync(root, { recursive: true, force: true });
});

test('findMissingRootDeps：无 dependencies 字段时为空清单', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rootdeps-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'tmp', version: '0.0.0' }),
    'utf8'
  );
  const missing = findMissingRootDeps(root);
  assertEqual(missing.length, 0, '无 dependencies 不应报缺失');
  fs.rmSync(root, { recursive: true, force: true });
});

test('findMissingRootDeps：package.json 缺失时不拦截（返回空清单）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rootdeps-'));
  const missing = findMissingRootDeps(root);
  assertEqual(missing.length, 0, 'package.json 缺失应返回空清单');
  fs.rmSync(root, { recursive: true, force: true });
});

test('findMissingRootDeps：package.json 损坏时不抛出（返回空清单）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rootdeps-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{ not valid json', 'utf8');
  let threw = false;
  let missing = null;
  try {
    missing = findMissingRootDeps(root);
  } catch (e) {
    threw = true;
  }
  assertTrue(!threw, '损坏的 package.json 不应抛出异常');
  assertEqual(missing.length, 0, '损坏的 package.json 应返回空清单');
  fs.rmSync(root, { recursive: true, force: true });
});

test('findMissingRootDeps：对真实仓库根探测，缺失项与本仓 node_modules 现状一致', () => {
  const root = path.resolve(__dirname, '..');
  const expected = ['fs-extra', 'yaml'].filter(dep => {
    try {
      require.resolve(dep, { paths: [root] });
      return false; // 已装 → 不该出现在缺失清单
    } catch (e) {
      return true; // 未装 → 必须出现在缺失清单
    }
  });
  const missing = findMissingRootDeps(root);
  assertEqual(
    JSON.stringify(missing.sort()),
    JSON.stringify(expected.sort()),
    '本仓缺失清单应精确等于「本地实际未装上的根依赖」'
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assertTrue(
    Object.keys(pkg.dependencies || {}).length >= 2,
    '本仓根 dependencies 应非空（否则该用例失去意义）'
  );
});

test('findMissingRootDeps：部分根依赖缺失时，缺失清单精确等于未装项（按真实环境裁剪）', () => {
  const root = path.resolve(__dirname, '..');
  const expected = ['fs-extra', 'yaml'].filter(dep => {
    try {
      require.resolve(dep, { paths: [root] });
      return false; // 已装 → 不得出现在缺失清单
    } catch (e) {
      return true; // 未装 → 必须出现在缺失清单
    }
  });
  if (expected.length === 0) {
    skip('findMissingRootDeps：部分缺失对照', '本环境根依赖已全部安装');
    return;
  }
  // 只断言「未装项必须被报出」，不断言清单长度——长度还取决于本仓未来新增的
  // 根依赖在本环境是否装上，用长度断言会引入与用例目标无关的外部依赖（R2-1）。
  const missing = findMissingRootDeps(root);
  expected.forEach(dep => {
    assertTrue(
      missing.indexOf(dep) !== -1,
      '未安装的根依赖 ' + dep + ' 必须被报出（实际：' + JSON.stringify(missing) + '）'
    );
  });
});

// ---- 汇总 ----
console.log('\n' + path.basename(__filename) + ': ' + passCount + '/' + testCount + ' 通过');
if (failures.length > 0) {
  console.log('失败项：');
  failures.forEach(f => console.log('  ✗ ' + f.name + ' → ' + f.err.message));
  process.exit(1);
}
