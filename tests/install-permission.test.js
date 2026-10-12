/**
 * 服务端权限放行测试（Issue #179 方案A）
 *
 * 验证 shared/permission-helper.js 的 applyServicePermission：
 *  - mode==='auto'   → 保留/注入服务端 permission（工具 + 外部目录直接放行）
 *  - mode==='manual' → 删除服务端 permission（走前端人工确认）
 * 同时验证 .opencode/opencode.jsonc 模板能被解析且含默认 permission。
 */
'use strict';

var path = require('path');
var fs = require('fs');

var testCount = 0;
var passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.log('  ✗ ' + name + '\n     ' + (e.message || e));
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || '') + ' 期望=' + expected + ' 实际=' + actual);
}

// 加载被测模块
var helper = require(path.join(__dirname, '..', 'shared', 'permission-helper.js'));
var applyServicePermission = helper.applyServicePermission;
var applyWriteRoots = helper.applyWriteRoots;
var DEFAULT_PERMISSION = helper.DEFAULT_PERMISSION;

// ==================== 测试用例 ====================

test('mode=auto：config 无 permission 时应注入默认全放行配置', function () {
  var config = { model: 'ollama/qwen3.5:4b' };
  var r = applyServicePermission(config, 'auto');
  assertTrue(r.applied === true, 'auto 模式应标记 applied');
  assertEqual(r.mode, 'auto', '返回 mode 应为 auto');
  assertTrue(!!config.permission, '应注入 permission');
  assertEqual(config.permission['*'], 'allow', '* 应为 allow');
  assertEqual(
    config.permission.external_directory['**'],
    'allow',
    'external_directory ** 应为 allow'
  );
});

test('mode=auto：config 已有 permission（来自模板）时应保留原值', function () {
  var scoped = { '*': 'allow', external_directory: { 'F:\\**': 'allow' } };
  var config = { permission: JSON.parse(JSON.stringify(scoped)) };
  var r = applyServicePermission(config, 'auto');
  assertTrue(r.applied === true, 'auto 模式应标记 applied');
  // 模板中的自定义范围应被原样透传，不被默认值覆盖（用 JSON 深比较，不依赖引用保留）
  assertEqual(
    JSON.stringify(config.permission),
    JSON.stringify(scoped),
    '应保留模板中已定义的 permission'
  );
});

test('mode=manual：应保留与默认全放行不同的用户自定义子集', function () {
  // {'*':'allow'} 缺少 external_directory，不完整，属于用户自定义子集，应保留
  var custom = { '*': 'allow' };
  var config = { model: 'x', permission: { '*': 'allow' } };
  var r = applyServicePermission(config, 'manual');
  assertTrue(r.applied === false, 'manual 模式不应标记 applied');
  assertEqual(r.mode, 'manual', '返回 mode 应为 manual');
  assertEqual(
    JSON.stringify(config.permission),
    JSON.stringify(custom),
    '应保留用户自定义子集 permission'
  );
});

test('mode=manual：config 无 permission 时不应产生副作用', function () {
  var config = { model: 'x' };
  var r = applyServicePermission(config, 'manual');
  assertTrue(r.applied === false, 'manual 不应 applied');
  assertTrue(config.permission === undefined, '不应新增 permission');
});

test('未知 mode 应按 manual 保守处理（不注入）', function () {
  var config = {};
  var r = applyServicePermission(config, 'whatever');
  assertEqual(r.mode, 'manual', '未知 mode 应保守回退到 manual');
  assertTrue(r.invalid === true, '未知 mode 应标记 invalid');
  assertTrue(config.permission === undefined, '不应注入默认 permission（避免静默全放行）');
});

test('未知 mode 为 auto 变体（拼写错误/含空白）时不应静默全放行', function () {
  var config = {};
  var r = applyServicePermission(config, 'Autom');
  assertEqual(r.mode, 'manual', 'Autom 应回退 manual');
  assertTrue(config.permission === undefined, '不应注入 permission');
  var config2 = {};
  var r2 = applyServicePermission(config2, 'auto ');
  assertEqual(r2.mode, 'manual', '含尾随空格的 auto 应回退 manual');
  assertTrue(config2.permission === undefined, '不应注入 permission');
});

test('falsy mode（空串/0/false/undefined）应按 manual 保守处理，不静默全放行', function () {
  // 覆盖 install-addons.js 读取 config.js permission.mode 为 falsy 值时的安全边界（Issue #179 评审修复 #4）
  var falsyModes = ['', 0, false, undefined];
  for (var i = 0; i < falsyModes.length; i++) {
    var config = {};
    var r = applyServicePermission(config, falsyModes[i]);
    assertEqual(r.mode, 'manual', 'falsy mode(' + String(falsyModes[i]) + ') 应保守回退 manual');
    assertTrue(
      config.permission === undefined,
      'falsy mode(' + String(falsyModes[i]) + ') 不应注入 permission'
    );
  }
});

test('mode=manual：应移除模板注入的默认全放行 permission', function () {
  var config = { model: 'x', permission: JSON.parse(JSON.stringify(DEFAULT_PERMISSION)) };
  var r = applyServicePermission(config, 'manual');
  assertTrue(r.applied === false, 'manual 模式不应标记 applied');
  assertEqual(r.mode, 'manual', '返回 mode 应为 manual');
  assertTrue(config.permission === undefined, '应删除默认全放行 permission');
  assertTrue(r.removedDefault === true, '应标记 removedDefault');
});

test('mode=manual：应保留用户自定义的精细 permission（非默认全放行）', function () {
  var custom = { write: 'allow' };
  var config = { model: 'x', permission: JSON.parse(JSON.stringify(custom)) };
  var r = applyServicePermission(config, 'manual');
  assertTrue(r.applied === false, 'manual 不应 applied');
  assertTrue(r.removedDefault === false, '保留自定义不应标记 removedDefault');
  assertEqual(
    JSON.stringify(config.permission),
    JSON.stringify(custom),
    '应保留用户自定义精细 permission'
  );
});

test('mode=manual：属性顺序不同的默认全放行也应被移除（isSamePermission 顺序不敏感）', function () {
  // 模拟用户手写时属性顺序与模板不同（external_directory 在前），但内容等价于默认全放行
  var reordered = { external_directory: { '**': 'allow' }, '*': 'allow' };
  var config = { model: 'x', permission: JSON.parse(JSON.stringify(reordered)) };
  var r = applyServicePermission(config, 'manual');
  assertTrue(r.removedDefault === true, '顺序不同但内容等价应视为默认全放行并移除');
  assertTrue(config.permission === undefined, '应删除等价于默认全放行的 permission');
});

test('DEFAULT_PERMISSION 与模板保持一致', function () {
  // 读取模板并解析（与 install-addons.js 相同的 stripJsoncComments 逻辑）
  var templatePath = path.join(__dirname, '..', '.opencode', 'opencode.jsonc');
  var raw = fs.readFileSync(templatePath, 'utf-8');
  var stripped = raw.replace(/\\"|"(?:[^"\\]|\\.)*"|\/\/.*|\/\*[\s\S]*?\*\//g, function (m) {
    return m.startsWith('"') || m.startsWith('\\"') ? m : '';
  });
  var template = JSON.parse(stripped);
  assertTrue(!!template.permission, '模板应包含 permission');
  assertEqual(
    JSON.stringify(template.permission),
    JSON.stringify(DEFAULT_PERMISSION),
    '模板 permission 应与 DEFAULT_PERMISSION 一致'
  );
});

// ==================== applyWriteRoots（路径白名单）测试 ====================

test('allowedWriteRoots 非空：注入 MCP env.OPCODE_ALLOWED_ROOTS（Issue #179 路径白名单暴露）', function () {
  var mcp = { command: ['node', 'server.js'], type: 'local' };
  var r = applyWriteRoots(mcp, 'F:\\2025年度;D:\\docs');
  assertTrue(r.applied === true, '非空 roots 应标记 applied');
  assertTrue(!!mcp.env, '应创建 env');
  // R4-2/R9-2 修复：env 按平台分隔符规范化写入，返回值与 env 实际值一致
  // （本测试环境为 Linux/macOS → 冒号 `:`）
  var expectedDelim = process.platform === 'win32' ? ';' : ':';
  var expected = 'F:\\2025年度' + expectedDelim + 'D:\\docs';
  assertEqual(
    mcp.env.OPCODE_ALLOWED_ROOTS,
    expected,
    'env 应写入 OPCODE_ALLOWED_ROOTS（平台分隔符规范化）'
  );
  assertEqual(r.roots, expected, '返回值应为规范化后的值（与 env 一致）');
});

test('allowedWriteRoots 混用分隔符时按平台规范化（R4-2 评审修复）', function () {
  var mcp = { command: ['node', 'server.js'], type: 'local' };
  // 用户混用 `;` 和 `:`（Windows 盘符路径含冒号，mac 路径可用分号）
  var r = applyWriteRoots(mcp, 'C:\\a;D:\\b:E:\\c');
  var expectedDelim = process.platform === 'win32' ? ';' : ':';
  var expected = 'C:\\a' + expectedDelim + 'D:\\b' + expectedDelim + 'E:\\c';
  assertEqual(mcp.env.OPCODE_ALLOWED_ROOTS, expected, 'env 应统一为平台分隔符');
});

test('allowedWriteRoots 带首尾空白：注入前应 trim', function () {
  var mcp = { command: ['node', 'server.js'], type: 'local' };
  var r = applyWriteRoots(mcp, '  F:\\docs  ');
  assertEqual(r.roots, 'F:\\docs', 'roots 应去除首尾空白');
  assertEqual(mcp.env.OPCODE_ALLOWED_ROOTS, 'F:\\docs', 'env 应为 trim 后的值');
});

test('allowedWriteRoots 为空/未配置：不注入，沿用 MCP 默认（Issue #179）', function () {
  var mcp = { command: ['node', 'server.js'], type: 'local' };
  var r = applyWriteRoots(mcp, '');
  assertTrue(r.applied === false, '空 roots 应标记未注入');
  assertTrue(
    !mcp.env || mcp.env.OPCODE_ALLOWED_ROOTS === undefined,
    '不应写入 OPCODE_ALLOWED_ROOTS'
  );
});

test('allowedWriteRoots 未配置时清理残留过期 OPCODE_ALLOWED_ROOTS（Issue #179）', function () {
  var mcp = {
    command: ['node', 'server.js'],
    type: 'local',
    env: { OPCODE_ALLOWED_ROOTS: 'D:\\old' },
  };
  var r = applyWriteRoots(mcp, '');
  assertTrue(r.applied === false, '空 roots 应标记未注入');
  assertTrue(mcp.env.OPCODE_ALLOWED_ROOTS === undefined, '应清理残留 OPCODE_ALLOWED_ROOTS');
});

test('allowedWriteRoots 非字符串（undefined）按未配置处理', function () {
  var mcp = { command: ['node', 'server.js'], type: 'local' };
  var r = applyWriteRoots(mcp, undefined);
  assertTrue(r.applied === false, 'undefined 应视为未配置');
  assertTrue(!mcp.env || mcp.env.OPCODE_ALLOWED_ROOTS === undefined, '不应写入 env');
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 权限放行测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有权限放行测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
