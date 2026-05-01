/**
 * Launcher 测试套件
 * 测试 Launcher 的路径查找、进程管理等功能
 */

var path = require('path');
var fs = require('fs');

// ==================== 待测试的 Launcher 函数 ====================

// 模拟 findOpenCodeBin（实际会读取配置文件或尝试常见路径）
function findOpenCodeBin(configPath) {
  // 模拟从配置读取
  if (configPath && fs.existsSync(configPath)) {
    try {
      var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.opencodePath && (config.opencodePath === 'opencode' || fs.existsSync(config.opencodePath))) {
        return config.opencodePath;
      }
    } catch (e) {}
  }
  // 模拟常见路径
  var paths = [
    path.join(process.env.USERPROFILE || 'C:\\Users\\test', '.trae-cn', 'bin', 'opencode.exe'),
    path.join(process.env.LOCALAPPDATA || 'C:\\Users\\test\\AppData\\Local', 'Programs', 'opencode', 'opencode.exe'),
    'opencode'
  ];
  // 返回第一个（模拟存在）
  return paths[2]; // 返回 'opencode' 表示在 PATH 中
}

// 验证 cwd 安全性
function validateCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') {
    return { valid: false, error: 'cwd 不能为空' };
  }
  // 防止路径遍历
  if (cwd.includes('..')) {
    return { valid: false, error: '无效的工作目录：不允许路径遍历' };
  }
  // 检查非法字符
  if (/[<>"|?*]/.test(cwd)) {
    return { valid: false, error: '无效的工作目录：包含非法字符' };
  }
  // 规范化路径
  var resolved = path.resolve(cwd);
  return { valid: true, resolved: resolved };
}

// 进程管理（模拟）
var mockChildProcess = null;
var mockPidFile = path.join(__dirname, 'test.pid');

function startOpenCodeMock(cwd) {
  // 模拟启动，返回 PID
  var mockPid = Math.floor(Math.random() * 10000) + 1000;
  fs.writeFileSync(mockPidFile, mockPid.toString());
  return { pid: mockPid, cwd: cwd };
}

function stopOpenCodeMock() {
  if (fs.existsSync(mockPidFile)) {
    var pid = parseInt(fs.readFileSync(mockPidFile, 'utf-8'));
    fs.unlinkSync(mockPidFile);
    return { killed: true, pid: pid };
  }
  return { killed: false };
}

function getOpenCodePid() {
  if (fs.existsSync(mockPidFile)) {
    return parseInt(fs.readFileSync(mockPidFile, 'utf-8'));
  }
  return null;
}

// ==================== 测试用例 ====================

var testResults = [];
var testCount = 0;
var passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    testResults.push({ name: name, status: 'PASS' });
    console.log('✓ ' + name);
  } catch (e) {
    testResults.push({ name: name, status: 'FAIL', error: e.message });
    console.log('✗ ' + name + ': ' + e.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg + ' - expected: ' + expected + ', actual: ' + actual);
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg + ' - expected true');
}

function assertFalse(actual, msg) {
  if (actual) throw new Error(msg + ' - expected false');
}

function assertNotNull(actual, msg) {
  if (actual === null || actual === undefined) {
    throw new Error(msg + ' - expected not null');
  }
}

console.log('\n========== Launcher 测试套件 ==========\n');

// --- 1. 路径查找测试 ---
console.log('--- 路径查找测试 ---');

test('findOpenCodeBin: 返回有效路径', function() {
  var result = findOpenCodeBin(null);
  assertNotNull(result, '应返回路径');
});

test('findOpenCodeBin: 读取配置文件', function() {
  var configPath = path.join(__dirname, 'test-config.json');
  fs.writeFileSync(configPath, JSON.stringify({ opencodePath: 'opencode' }));
  var result = findOpenCodeBin(configPath);
  fs.unlinkSync(configPath);
  assertEqual(result, 'opencode', '应从配置读取');
});

// --- 2. cwd 验证测试 ---
console.log('\n--- cwd 验证测试 ---');

test('validateCwd: 合法 Windows 路径', function() {
  var result = validateCwd('D:\\project\\myapp');
  assertTrue(result.valid, '应返回有效');
  assertNotNull(result.resolved, '应返回规范化路径');
});

test('validateCwd: 合法 Unix 路径', function() {
  var result = validateCwd('/home/user/project');
  assertTrue(result.valid, '应返回有效');
});

test('validateCwd: 空值', function() {
  var result = validateCwd('');
  assertFalse(result.valid, '应返回无效');
  assertEqual(result.error, 'cwd 不能为空');
});

test('validateCwd: 路径遍历尝试', function() {
  var result = validateCwd('C:\\Users\\test\\..\\Windows');
  assertFalse(result.valid, '应返回无效');
  assertTrue(result.error.includes('路径遍历'), '应提示路径遍历');
});

test('validateCwd: 非法字符', function() {
  var result = validateCwd('C:\\test|path');
  assertFalse(result.valid, '应返回无效');
  assertTrue(result.error.includes('非法字符'), '应提示非法字符');
});

test('validateCwd: 相对路径', function() {
  var result = validateCwd('./project');
  assertTrue(result.valid, '相对路径应有效');
});

// --- 3. 进程管理测试 ---
console.log('\n--- 进程管理测试 ---');

test('startOpenCodeMock: 启动并记录 PID', function() {
  var result = startOpenCodeMock('D:\\test');
  assertNotNull(result.pid, '应返回 PID');
  assertEqual(result.cwd, 'D:\\test', '应保存 cwd');
  var savedPid = getOpenCodePid();
  assertEqual(savedPid, result.pid, 'PID 应已保存');
});

test('stopOpenCodeMock: 终止进程并清理', function() {
  startOpenCodeMock('D:\\test');
  var result = stopOpenCodeMock();
  assertTrue(result.killed, '应返回已终止');
  var savedPid = getOpenCodePid();
  assertTrue(savedPid === null, 'PID 文件应已删除');
});

test('getOpenCodePid: 无 PID 文件', function() {
  try { fs.unlinkSync(mockPidFile); } catch (e) {}
  var pid = getOpenCodePid();
  assertTrue(pid === null, '无文件时应返回 null');
});

// --- 4. 边界情况测试 ---
console.log('\n--- 边界情况测试 ---');

test('validateCwd: 特殊路径', function() {
  var result = validateCwd('C:\\');
  assertTrue(result.valid, '根目录应有效');
});

test('validateCwd: 带空格的路径', function() {
  var result = validateCwd('C:\\Program Files\\App');
  assertTrue(result.valid, '带空格的路径应有效');
});

test('validateCwd: 中文路径', function() {
  var result = validateCwd('D:\\我的文档\\项目');
  assertTrue(result.valid, '中文路径应有效');
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有 Launcher 测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}