/**
 * 安全测试套件
 * 测试 XSS 防护、路径遍历、进程管理等安全功能
 */

// ==================== 测试辅助函数 ====================

function safeInput(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, function(c) {
    var map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}

function validateCwd(cwd, basePath) {
  var resolved = require('path').resolve(cwd);
  var base = require('path').resolve(basePath);
  return resolved.startsWith(base);
}

function isValidPath(pathStr) {
  if (!pathStr || typeof pathStr !== 'string') return false;
  // 防止路径遍历
  if (pathStr.includes('..')) return false;
  // 检查非法字符
  if (/[<>"|?*]/.test(pathStr)) return false;
  return true;
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
  if (!actual) {
    throw new Error(msg + ' - expected true');
  }
}

function assertFalse(actual, msg) {
  if (actual) {
    throw new Error(msg + ' - expected false');
  }
}

console.log('\n========== 安全测试套件 ==========\n');

// --- 1. XSS 防护测试 ---
console.log('--- XSS 防护测试 ---');

test('safeInput: 基本 HTML 标签转义', function() {
  assertEqual(safeInput('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('safeInput: 尖括号转义', function() {
  assertEqual(safeInput('<div>'), '&lt;div&gt;');
  assertEqual(safeInput('a>b'), 'a&gt;b');
});

test('safeInput: 引号转义', function() {
  assertEqual(safeInput('"test"'), '&quot;test&quot;');
  assertEqual(safeInput("'test'"), '&#39;test&#39;');
});

test('safeInput: &符号转义', function() {
  assertEqual(safeInput('a&b'), 'a&amp;b');
});

test('safeInput: 空值/非字符串处理', function() {
  assertEqual(safeInput(null), '');
  assertEqual(safeInput(undefined), '');
  assertEqual(safeInput(123), '');
  assertEqual(safeInput(''), '');
});

test('safeInput: 正常文本不过滤', function() {
  assertEqual(safeInput('Hello World'), 'Hello World');
  assertEqual(safeInput('正常中文文本'), '正常中文文本');
});

test('safeInput: 混合内容', function() {
  assertEqual(safeInput('Hello <script>x</script> & "test"', 'utf-8'), 'Hello &lt;script&gt;x&lt;/script&gt; &amp; &quot;test&quot;');
});

// --- 2. 路径遍历防护测试 ---
console.log('\n--- 路径遍历防护测试 ---');

test('isValidPath: 合法路径', function() {
  assertTrue(isValidPath('C:\\Users\\test\\project'));
  assertTrue(isValidPath('/home/user/project'));
  assertTrue(isValidPath('./relative/path'));
});

test('isValidPath: 路径遍历检测', function() {
  assertFalse(isValidPath('../etc/passwd'));
  assertFalse(isValidPath('C:\\Users\\..\\Windows\\system32'));
  assertFalse(isValidPath('..\\..\\secret.txt'));
});

test('isValidPath: 非法字符检测', function() {
  assertFalse(isValidPath('path|pipe'));
  assertFalse(isValidPath('path*star'));
  assertFalse(isValidPath('path?question'));
  assertFalse(isValidPath('path<tag>'));
  assertFalse(isValidPath('path"quote'));
});

test('isValidPath: 空值处理', function() {
  assertFalse(isValidPath(''));
  assertFalse(isValidPath(null));
  assertFalse(isValidPath(undefined));
});

test('validateCwd: 合法子目录', function() {
  assertTrue(validateCwd('C:\\Users\\test\\project', 'C:\\Users\\test'));
  assertTrue(validateCwd('/home/user/project', '/home/user'));
});

test('validateCwd: 路径遍历尝试', function() {
  assertFalse(validateCwd('C:\\Users\\test\\..\\Windows', 'C:\\Users\\test'));
  assertFalse(validateCwd('/home/../etc', '/home'));
});

// --- 3. API 地址验证测试 ---
console.log('\n--- API 地址验证测试 ---');

function isValidApiUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

test('isValidApiUrl: 合法 URL', function() {
  assertTrue(isValidApiUrl('http://127.0.0.1:14096'));
  assertTrue(isValidApiUrl('https://api.example.com'));
  assertTrue(isValidApiUrl('http://localhost:8080'));
});

test('isValidApiUrl: 非法 URL', function() {
  assertFalse(isValidApiUrl('file:///etc/passwd'));
  assertFalse(isValidApiUrl('javascript:alert(1)'));
  assertFalse(isValidApiUrl(''));
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有安全测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  console.log('失败详情:');
  testResults.forEach(function(r) {
    if (r.status === 'FAIL') {
      console.log('  - ' + r.name + ': ' + r.error);
    }
  });
  process.exit(1);
}