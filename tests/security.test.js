/**
 * 安全测试套件
 * 测试 XSS 防护、路径遍历、进程管理等安全功能
 *
 * 注意：escapeHtml / decodeHtmlEntities / safeHref 的实现与
 * opencode-wps/taskpane.html 中的生产实现保持一致（taskpane.html 为 HTML
 * 文件无法直接 import，故此处维护同步副本；修改生产代码时请同步更新）。
 */

// ==================== 测试辅助函数 ====================

/**
 * HTML 转义，防止 XSS（与 taskpane.html 中 escapeHtml 保持一致）
 */
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[<>&"']/g, function(c) {
    var map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}

/**
 * 解码 HTML 实体为原始字符（与 taskpane.html 中 decodeHtmlEntities 保持一致）
 */
function decodeHtmlEntities(s) {
  if (!s) return '';
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x([0-9a-fA-F]+);/g, function(m, h) { return String.fromCharCode(parseInt(h, 16)) }).replace(/&#(\d+);/g, function(m, d) { return String.fromCharCode(parseInt(d, 10)) });
}

/**
 * 安全处理 URL 链接，防止 XSS（与 taskpane.html 中 safeHref 保持一致）
 * 入参可为已转义文本（renderMarkdown 链路）或原始文本（直接调用）。
 */
function safeHref(url) {
  if (!url) return '#';
  var decoded = decodeHtmlEntities(url);
  var trimmed = decoded.replace(/^\s+|\s+$/g, '');
  // 协议检测前去除控制字符/空白（OWASP 建议），防 `jav\nascript:` 之类混淆绕过
  var low = trimmed.replace(/[\x00-\x20\x7f]/g, '').toLowerCase();
  if (low.indexOf('http:') === 0 || low.indexOf('https:') === 0 || low.indexOf('mailto:') === 0) return escapeHtml(trimmed);
  if (low.indexOf('javascript:') === 0 || low.indexOf('data:') === 0 || low.indexOf('vbscript:') === 0) return '#';
  // 协议相对 URL（//evil.com）在 file:// 环境下解析为 UNC 路径，非预期行为
  if (trimmed.indexOf('//') === 0) return '#';
  return escapeHtml(trimmed);
}

/**
 * 校验工作目录路径合法性（跨平台）
 * 统一分隔符 + 大小写不敏感（Windows）后比较，避免 path.resolve 在
 * 非 Windows 平台对 `C:\...` 盘符路径解析不一致导致的误判。
 */
function validateCwd(cwd, basePath) {
  if (!cwd || !basePath) return false;
  var normalize = function(p) {
    var out = p.replace(/\\/g, '/').replace(/\/+/g, '/');
    // 解析 . 和 .. 段
    var parts = out.split('/');
    var stack = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '.' || parts[i] === '') continue;
      if (parts[i] === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(parts[i]);
      }
    }
    return stack.join('/').toLowerCase();
  };
  var resolved = normalize(cwd);
  var base = normalize(basePath);
  return resolved.indexOf(base + '/') === 0 || resolved === base;
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

// --- 1. HTML 转义测试（escapeHtml）---
console.log('--- HTML 转义测试 (escapeHtml) ---');

test('escapeHtml: 基本 HTML 标签转义', function() {
  assertEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapeHtml: 尖括号转义', function() {
  assertEqual(escapeHtml('<div>'), '&lt;div&gt;');
  assertEqual(escapeHtml('a>b'), 'a&gt;b');
});

test('escapeHtml: 引号转义', function() {
  assertEqual(escapeHtml('"test"'), '&quot;test&quot;');
  assertEqual(escapeHtml("'test'"), '&#39;test&#39;');
});

test('escapeHtml: &符号转义', function() {
  assertEqual(escapeHtml('a&b'), 'a&amp;b');
});

test('escapeHtml: 空值/非字符串处理', function() {
  assertEqual(escapeHtml(null), '');
  assertEqual(escapeHtml(undefined), '');
  assertEqual(escapeHtml(123), '');
  assertEqual(escapeHtml(''), '');
});

test('escapeHtml: 正常文本不过滤', function() {
  assertEqual(escapeHtml('Hello World'), 'Hello World');
  assertEqual(escapeHtml('正常中文文本'), '正常中文文本');
});

test('escapeHtml: 混合内容', function() {
  assertEqual(escapeHtml('Hello <script>x</script> & "test"'), 'Hello &lt;script&gt;x&lt;/script&gt; &amp; &quot;test&quot;');
});

// --- 2. HTML 实体解码测试（decodeHtmlEntities）---
console.log('\n--- HTML 实体解码测试 (decodeHtmlEntities) ---');

test('decodeHtmlEntities: 基本实体解码', function() {
  assertEqual(decodeHtmlEntities('&lt;div&gt;'), '<div>');
  assertEqual(decodeHtmlEntities('a&amp;b'), 'a&b');
  assertEqual(decodeHtmlEntities('&quot;q&quot;'), '"q"');
  assertEqual(decodeHtmlEntities('&#39;s&#39;'), "'s'");
});

test('decodeHtmlEntities: 十六进制/十进制数字实体', function() {
  assertEqual(decodeHtmlEntities('&#x73;'), 's');
  assertEqual(decodeHtmlEntities('&#115;'), 's');
  assertEqual(decodeHtmlEntities('&#x6A;avascript'), 'javascript');
});

test('decodeHtmlEntities: 空值处理', function() {
  assertEqual(decodeHtmlEntities(''), '');
  assertEqual(decodeHtmlEntities(null), '');
  assertEqual(decodeHtmlEntities(undefined), '');
});

// --- 3. safeHref 安全 URL 测试 ---
console.log('\n--- safeHref 安全 URL 测试 ---');

test('safeHref: 合法 http/https/mailto 通过并转义', function() {
  assertEqual(safeHref('http://a.com/?x=1&y=2'), 'http://a.com/?x=1&amp;y=2');
  assertEqual(safeHref('https://cnb.cool/?q=1&r=2'), 'https://cnb.cool/?q=1&amp;r=2');
  assertEqual(safeHref('mailto:a@b.com'), 'mailto:a@b.com');
});

test('safeHref: 相对路径带 & 参数不被双重转义', function() {
  assertEqual(safeHref('docs/guide.html?a=1&b=2'), 'docs/guide.html?a=1&amp;b=2');
  assertEqual(safeHref('img/x.png?a=1&b=2'), 'img/x.png?a=1&amp;b=2');
});

test('safeHref: 危险协议拦截', function() {
  assertEqual(safeHref('javascript:alert(1)'), '#');
  assertEqual(safeHref('JaVaScRiPt:alert(1)'), '#');
  assertEqual(safeHref('data:text/html,<svg>'), '#');
  assertEqual(safeHref('vbscript:msgbox(1)'), '#');
});

test('safeHref: 实体混淆绕过拦截', function() {
  // 直接调用时传原始混淆文本（含 &amp; 等实体）
  // &#x61; → a, &#x73; → s，解码后为 javascript: 必须拦截
  assertEqual(safeHref('jav&#x61;script:alert(1)'), '#');
  assertEqual(safeHref('java&#x73;cript:alert(1)'), '#');
  assertEqual(safeHref('java&#115;cript:alert(1)'), '#');
  assertEqual(safeHref('&#x6A;avascript:alert(1)'), '#');
  // 协议中间夹 & 不构成 javascript 协议（解码为相对 URL，安全），只转义不拦截
  assertEqual(safeHref('java&amp;script:alert(1)'), 'java&amp;script:alert(1)');
});

test('safeHref: 控制字符/空白混淆拦截', function() {
  assertEqual(safeHref('java\nscript:alert(1)'), '#');
  assertEqual(safeHref('java\tscript:alert(1)'), '#');
  assertEqual(safeHref('java script:alert(1)'), '#');
});

test('safeHref: 协议相对 URL 拦截', function() {
  assertEqual(safeHref('//evil.com/x'), '#');
});

test('safeHref: 已转义文本链路无双重转义', function() {
  // renderMarkdown 中入参已被全局 escapeHtml 转义
  assertEqual(safeHref('http://a.com/?x=1&amp;y=2'), 'http://a.com/?x=1&amp;y=2');
  assertEqual(safeHref('docs/a.html?a=1&amp;b=2'), 'docs/a.html?a=1&amp;b=2');
  // 已转义的 javascript: 同样拦截
  assertEqual(safeHref('javascript:alert(1)'), '#');
});

test('safeHref: 空值/非字符串处理', function() {
  assertEqual(safeHref(''), '#');
  assertEqual(safeHref(null), '#');
  assertEqual(safeHref(undefined), '#');
});

// --- 4. 路径遍历防护测试 ---
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
  assertTrue(validateCwd('C:\\Users\\test', 'C:\\Users\\test'));
});

test('validateCwd: 路径遍历尝试', function() {
  assertFalse(validateCwd('C:\\Users\\test\\..\\Windows', 'C:\\Users\\test'));
  assertFalse(validateCwd('/home/../etc', '/home'));
  assertFalse(validateCwd('C:\\Users\\test2', 'C:\\Users\\test'));
});

// --- 5. API 地址验证测试 ---
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
