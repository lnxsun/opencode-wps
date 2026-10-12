/**
 * 任务窗格 formatSendError 测试套件（Issue #114 跟进）
 *
 * 通过 vm 加载生产源码 opencode-wps/taskpane.html 的内联脚本，
 * 验证 formatSendError() 对三类输入的处理：
 *  - UnknownError（含 ref/message）→ 返回含日志路径与常见原因的可操作引导
 *  - 普通 JSON 错误 / 非 JSON 文本 → 保持原样回退（不裸崩）
 *  - 空响应文本 → 回退到 status 形式
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var TASKPANE_HTML = path.join(__dirname, '..', 'opencode-wps', 'taskpane.html');

var testResults = [];
var testCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    testResults.push({ name: name, status: 'PASS' });
    console.log('  ✓ ' + name);
  } catch (e) {
    testResults.push({ name: name, status: 'FAIL', error: e.stack || e.message });
    console.log('  ✗ ' + name + ' → ' + (e.stack || e.message));
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg || 'expected true, got ' + actual);
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || 'assertEqual') +
        ': expected ' +
        JSON.stringify(expected) +
        ', got ' +
        JSON.stringify(actual)
    );
  }
}
function assertIncludes(haystack, needle, msg) {
  if (haystack.indexOf(needle) === -1) {
    throw new Error(
      (msg || 'assertIncludes') +
        ': expected to include ' +
        JSON.stringify(needle) +
        ', got ' +
        JSON.stringify(haystack)
    );
  }
}

function loadTaskpaneScript() {
  var html = fs.readFileSync(TASKPANE_HTML, 'utf-8');
  var m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('未找到 taskpane.html 内联脚本');
  var src = m[1];

  var sandbox = {
    CONFIG: {
      opencode: { apiBase: 'http://127.0.0.1:14096' },
      network: { timeout: 5000, uploadTimeout: 15000 },
      plugin: { userHome: 'C:/Users/test' },
    },
    document: {
      getElementById: function () {
        return {
          classList: {
            add: function () {},
            remove: function () {},
            contains: function () {
              return true;
            },
          },
          appendChild: function () {},
          innerHTML: '',
          textContent: '',
          style: {},
        };
      },
      createElement: function () {
        return {
          classList: {
            add: function () {},
            remove: function () {},
            contains: function () {
              return true;
            },
          },
          appendChild: function () {},
          innerHTML: '',
          textContent: '',
          style: {},
        };
      },
      body: { appendChild: function () {} },
    },
    window: {
      Application: {
        PluginStorage: {
          getItem: function () {
            return '';
          },
          setItem: function () {},
        },
      },
      addEventListener: function () {},
      removeEventListener: function () {},
    },
    console: { log: function () {}, warn: function () {}, error: function () {} },
    alert: function () {},
    EventSource: function () {
      this.close = function () {};
    },
    XMLHttpRequest: function () {
      this.open = function () {};
      this.send = function () {};
      this.setRequestHeader = function () {};
      this.readyState = 4;
      this.status = 0;
    },
    setTimeout: function () {
      return 1;
    },
    clearTimeout: function () {},
    setInterval: function () {
      return 1;
    },
    clearInterval: function () {},
    fetchJSON: function () {},
    onServerConnected: function () {},
    updateServerStatus: function () {},
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: TASKPANE_HTML });
  return sandbox;
}

var sandbox = loadTaskpaneScript();
var formatSendError = sandbox.formatSendError;

// ---------- 用例 ----------
test('formatSendError: UnknownError 含 ref/message 给出可操作引导', function () {
  var resp = JSON.stringify({
    name: 'UnknownError',
    data: {
      message: 'Unexpected server error. Check server logs for details.',
      ref: 'err_edae3507',
    },
  });
  var out = formatSendError(500, resp);
  assertIncludes(out, 'UnknownError', '应识别 UnknownError');
  assertIncludes(out, 'err_edae3507', '应包含引用号');
  assertIncludes(out, 'opencode-serve.log', '应提示日志路径');
  assertIncludes(out, '非插件问题', '应说明非插件问题');
});

test('formatSendError: UnknownError 无 ref/message 时给默认提示', function () {
  var resp = JSON.stringify({ name: 'UnknownError', data: {} });
  var out = formatSendError(500, resp);
  assertIncludes(out, 'UnknownError', '应识别 UnknownError');
  assertIncludes(out, 'Unexpected server error', '应使用默认 message');
});

test('formatSendError: 普通 JSON 错误（非 UnknownError）保留原始信息', function () {
  var resp = JSON.stringify({ error: 'rate limit' });
  var out = formatSendError(429, resp);
  assertEqual(out, 'Error: ' + resp, '非 UnknownError 应原样返回');
});

test('formatSendError: 非 JSON 文本回退到原始文本', function () {
  var out = formatSendError(500, 'Internal Server Error');
  assertEqual(out, 'Error: Internal Server Error', '非 JSON 应原样返回');
});

test('formatSendError: 空响应文本回退到 status', function () {
  var out = formatSendError(503, '');
  assertEqual(out, 'Error: status 503', '空文本应回退到 status');
});

test('formatSendError: status 为 0（网络错误）且文本 Network error', function () {
  var out = formatSendError(0, 'Network error');
  assertEqual(out, 'Error: Network error', '网络错误应原样返回');
});

test('formatSendError: respText 为 null/undefined 时回退到 status', function () {
  assertEqual(formatSendError(500, null), 'Error: status 500', 'null 应回退到 status');
  assertEqual(formatSendError(500, undefined), 'Error: status 500', 'undefined 应回退到 status');
});

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
var fail = testResults.filter(function (r) {
  return r.status === 'FAIL';
}).length;
console.log('通过: ' + (testCount - fail) + ' 个');
console.log('失败: ' + fail + ' 个');

if (fail > 0) {
  testResults
    .filter(function (r) {
      return r.status === 'FAIL';
    })
    .forEach(function (r) {
      console.log(r.error);
    });
  process.exit(1);
}
console.log('\n✓ 所有 formatSendError 测试通过!');
