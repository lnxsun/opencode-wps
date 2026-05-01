/**
 * 工具函数测试套件
 * 测试日志、配置、请求重试等工具函数
 */

// ==================== 待测试的工具函数 ====================

var ERROR_LOGS = [];

function logError(context, data) {
  var log = { time: new Date().toISOString(), context: context, data: data };
  console.error('[ERROR]', log);
  ERROR_LOGS.unshift(log);
  if (ERROR_LOGS.length > 50) ERROR_LOGS.pop();
  return log;
}

function getErrorLogs() {
  return ERROR_LOGS.slice(0, 50);
}

function clearErrorLogs() {
  ERROR_LOGS = [];
}

// 模拟 fetch 请求（带重试）
var fetchRetryCount = 0;
function mockFetchWithRetry(url, options, maxRetries) {
  maxRetries = maxRetries || 3;
  fetchRetryCount++;
  if (fetchRetryCount < maxRetries) {
    throw new Error('Network error');
  }
  return { ok: true, json: function() { return { result: 'success' }; } };
}

async function fetchWithRetry(url, options, maxRetries) {
  maxRetries = maxRetries || 3;
  var lastError;
  for (var i = 0; i < maxRetries; i++) {
    try {
      var resp = mockFetchWithRetry(url, options, maxRetries);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp;
    } catch (e) {
      lastError = e;
      logError('fetchRetry', { url: url, attempt: i + 1, error: e.message });
      if (i < maxRetries - 1) await new Promise(function(r) { setTimeout(r, 100 * (i + 1)); });
    }
  }
  throw lastError;
}

// 配置持久化模拟
var mockStorage = {};
function getPS(key) { return mockStorage[key] || ''; }
function setPS(key, value) { mockStorage[key] = value; }

var CONFIG = {
  get apiUrl() { return getPS('opencode_api_url') || 'http://127.0.0.1:14096'; },
  set apiUrl(val) { setPS('opencode_api_url', val); },
  get cwd() { return getPS('opencode_cwd') || ''; },
  set cwd(val) { setPS('opencode_cwd', val); },
  get agent() { return getPS('opencode_agent') || 'wps-expert'; },
  set agent(val) { setPS('opencode_agent', val); }
};

// 常量定义
var CONSTANTS = {
  API_DEFAULT_URL: 'http://127.0.0.1:14096',
  API_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  SSE_RECONNECT_DELAY: 3000,
  MAX_MESSAGE_LENGTH: 10000,
  MAX_HISTORY: 100,
  TOAST_DURATION: 3000,
  DEFAULT_SESSION_NAME: '新对话'
};

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

function assertArrayEqual(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg + ' - expected: ' + JSON.stringify(expected) + ', actual: ' + JSON.stringify(actual));
  }
}

console.log('\n========== 工具函数测试套件 ==========\n');

// --- 1. 错误日志测试 ---
console.log('--- 错误日志测试 ---');

test('logError: 记录错误', function() {
  clearErrorLogs();
  logError('test', { message: 'test error' });
  var logs = getErrorLogs();
  assertTrue(logs.length > 0, '应有错误日志');
  assertEqual(logs[0].context, 'test', 'context 应为 test');
});

test('logError: 自动截断超过50条', function() {
  clearErrorLogs();
  for (var i = 0; i < 60; i++) {
    logError('test' + i, { index: i });
  }
  var logs = getErrorLogs();
  assertTrue(logs.length <= 50, '应截断到50条');
});

test('logError: 包含时间戳', function() {
  clearErrorLogs();
  var log = logError('test', { msg: 'error' });
  assertTrue(log.time && log.time.length > 0, '应有时间戳');
});

// --- 2. 配置持久化测试 ---
console.log('\n--- 配置持久化测试 ---');

test('CONFIG: 默认 API URL', function() {
  mockStorage = {};
  assertEqual(CONFIG.apiUrl, 'http://127.0.0.1:14096', '默认 URL 应为 127.0.0.1:14096');
});

test('CONFIG: 设置 API URL', function() {
  mockStorage = {};
  CONFIG.apiUrl = 'http://192.168.1.1:8080';
  assertEqual(CONFIG.apiUrl, 'http://192.168.1.1:8080', '应保存设置的 URL');
});

test('CONFIG: 默认 cwd', function() {
  mockStorage = {};
  assertEqual(CONFIG.cwd, '', '默认 cwd 应为空');
});

test('CONFIG: 设置 cwd', function() {
  mockStorage = {};
  CONFIG.cwd = 'D:\\project';
  assertEqual(CONFIG.cwd, 'D:\\project', '应保存设置的 cwd');
});

test('CONFIG: 默认 agent', function() {
  mockStorage = {};
  assertEqual(CONFIG.agent, 'wps-expert', '默认 agent 应为 wps-expert');
});

test('CONFIG: 设置 agent', function() {
  mockStorage = {};
  CONFIG.agent = 'wps-word';
  assertEqual(CONFIG.agent, 'wps-word', '应保存设置的 agent');
});

// --- 3. 常量定义测试 ---
console.log('\n--- 常量定义测试 ---');

test('CONSTANTS: 包含所有必需常量', function() {
  assertTrue(CONSTANTS.API_DEFAULT_URL !== undefined, '应有 API_DEFAULT_URL');
  assertTrue(CONSTANTS.API_TIMEOUT !== undefined, '应有 API_TIMEOUT');
  assertTrue(CONSTANTS.MAX_RETRIES !== undefined, '应有 MAX_RETRIES');
  assertTrue(CONSTANTS.SSE_RECONNECT_DELAY !== undefined, '应有 SSE_RECONNECT_DELAY');
  assertTrue(CONSTANTS.MAX_MESSAGE_LENGTH !== undefined, '应有 MAX_MESSAGE_LENGTH');
  assertTrue(CONSTANTS.TOAST_DURATION !== undefined, '应有 TOAST_DURATION');
});

test('CONSTANTS: 数值合理性', function() {
  assertTrue(CONSTANTS.MAX_RETRIES >= 1 && CONSTANTS.MAX_RETRIES <= 10, 'MAX_RETRIES 应在 1-10 范围');
  assertTrue(CONSTANTS.API_TIMEOUT >= 5000, 'API_TIMEOUT 应 >= 5秒');
  assertTrue(CONSTANTS.SSE_RECONNECT_DELAY >= 1000, 'SSE_RECONNECT_DELAY 应 >= 1秒');
});

// --- 4. WPS 就绪检查函数（模拟）---
console.log('\n--- WPS 就绪检查测试 ---');

function checkWpsReady(mockWps) {
  try {
    if (!mockWps || !mockWps.Application) {
      return { ready: false, error: 'WPS 未就绪' };
    }
    return { ready: true };
  } catch (e) {
    return { ready: false, error: e.message };
  }
}

function checkDocument(mockWps) {
  try {
    var doc = mockWps && mockWps.Application && mockWps.Application.ActiveDocument;
    if (!doc) {
      return { valid: false, error: '请先打开文档' };
    }
    return { valid: true, doc: doc };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

test('checkWpsReady: WPS 对象为空', function() {
  var result = checkWpsReady(null);
  assertFalse(result.ready, '应返回未就绪');
  assertEqual(result.error, 'WPS 未就绪');
});

test('checkWpsReady: WPS 对象存在', function() {
  var result = checkWpsReady({ Application: {} });
  assertTrue(result.ready, '应返回就绪');
});

test('checkDocument: 无活动文档', function() {
  var result = checkDocument({ Application: { ActiveDocument: null } });
  assertFalse(result.valid, '应返回无效');
  assertEqual(result.error, '请先打开文档');
});

test('checkDocument: 有活动文档', function() {
  var mockDoc = { Name: 'test.docx' };
  var result = checkDocument({ Application: { ActiveDocument: mockDoc } });
  assertTrue(result.valid, '应返回有效');
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有工具函数测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}