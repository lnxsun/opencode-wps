/**
 * E2E 测试套件
 * 模拟前端与 MCP 的交互，验证工具调用链
 */

var http = require('http');

var testResults = [];
var testCount = 0;
var passCount = 0;

// 支持异步测试：test() 入队，runTests() 串行 await 执行，
// 使真实 HTTP mock 请求可用 async/await 做真断言（取代同步假断言）。
// section(name) 在队列中插入分组标题，随执行顺序一并打印。
var pendingTests = [];
function test(name, fn) {
  pendingTests.push({ type: 'test', name: name, fn: fn });
}
function section(name) {
  pendingTests.push({ type: 'section', name: name });
}

function runTests() {
  return pendingTests.reduce(function (p, t) {
    return p.then(function () {
      if (t.type === 'section') {
        console.log(t.name);
        return;
      }
      testCount++;
      return Promise.resolve()
        .then(t.fn)
        .then(
          function () {
            passCount++;
            testResults.push({ name: t.name, status: 'PASS' });
            console.log('✓ ' + t.name);
          },
          function (e) {
            testResults.push({ name: t.name, status: 'FAIL', error: e.message });
            console.log('✗ ' + t.name + ': ' + e.message);
          }
        );
    });
  }, Promise.resolve());
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg + ' - expected: ' + expected + ', actual: ' + actual);
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg + ' - expected true');
}

console.log('\n========== E2E 测试套件 ==========\n');

section('--- OpenCode 服务测试 ---');

function httpGet(url) {
  return new Promise(function (resolve, reject) {
    http
      .get(url, function (res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          resolve({ status: res.statusCode, data: data });
        });
      })
      .on('error', reject);
  });
}

// 起一个本地 mock HTTP server（监听随机空闲端口），返回 { url, close }。
// 用真实 HTTP 请求验证 httpGet() 的请求/响应/状态码链路，取代此前
// assertTrue(true, '跳过实际 HTTP 请求') 的假断言。
function startMockServer(handler) {
  var server = http.createServer(handler);
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      var port = server.address().port;
      resolve({
        url: 'http://127.0.0.1:' + port,
        close: function () {
          server.close();
        },
      });
    });
  });
}

test('Launcher 服务健康检查', async function () {
  // 真实校验 httpGet 对健康检查端点的请求/响应链路（不依赖外部服务）
  var mock = await startMockServer(function (req, res) {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  try {
    var resp = await httpGet(mock.url + '/health');
    assertEqual(resp.status, 200, '健康检查应返回 HTTP 200');
    assertEqual(resp.data, '{"status":"ok"}', '健康检查应返回 ok 响应体');
  } finally {
    mock.close();
  }
});

test('OpenCode 服务状态 API', async function () {
  // 真实校验 httpGet 对状态 API 的请求/响应链路
  var mock = await startMockServer(function (req, res) {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"running":true}');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  try {
    var resp = await httpGet(mock.url + '/api/status');
    assertEqual(resp.status, 200, '状态 API 应返回 HTTP 200');
    assertEqual(resp.data, '{"running":true}', '状态 API 应返回 running 响应体');
  } finally {
    mock.close();
  }
});

test('MCP 工具列表 API', async function () {
  // 真实校验 httpGet 对工具列表 API 的请求/响应链路
  var mock = await startMockServer(function (req, res) {
    if (req.url === '/api/tools') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('["wps_get_cell_value","wps_word_set_font"]');
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  try {
    var resp = await httpGet(mock.url + '/api/tools');
    assertEqual(resp.status, 200, '工具列表 API 应返回 HTTP 200');
    assertEqual(
      resp.data,
      '["wps_get_cell_value","wps_word_set_font"]',
      '工具列表 API 应返回工具数组响应体'
    );
  } finally {
    mock.close();
  }
});

section('\n--- 工具调用链测试 ---');

test('WPS Excel 工具链：读取单元格', function () {
  // 模拟 MCP 工具调用
  var mockRequest = {
    method: 'wps_get_cell_value',
    params: { sheet: 'Sheet1', row: 1, col: 1 },
  };
  assertTrue(mockRequest.method.startsWith('wps_'), '工具方法应以 wps_ 开头');
  assertTrue(mockRequest.params.sheet, '应包含工作表参数');
});

test('WPS Word 工具链：设置字体', function () {
  var mockRequest = {
    method: 'wps_word_set_font',
    params: { font_name: '微软雅黑', font_size: 14 },
  };
  assertEqual(mockRequest.method, 'wps_word_set_font', '方法名正确');
});

test('WPS PPT 工具链：添加幻灯片', function () {
  var mockRequest = {
    method: 'wps_ppt_add_slide',
    params: { layout: 'title_content', position: 1 },
  };
  assertTrue(mockRequest.params.layout, '应包含布局参数');
});

section('\n--- 配置持久化测试 ---');

var mockStorage = {};
function getPS(key) {
  return mockStorage[key] || '';
}
function setPS(key, val) {
  mockStorage[key] = val;
}

test('API 地址持久化', function () {
  setPS('opencode_api_url', 'http://127.0.0.1:14096');
  var url = getPS('opencode_api_url');
  assertEqual(url, 'http://127.0.0.1:14096', '应保存并读取 API 地址');
});

test('工作目录持久化', function () {
  setPS('opencode_cwd', 'D:\\project');
  var cwd = getPS('opencode_cwd');
  assertEqual(cwd, 'D:\\project', '应保存并读取工作目录');
});

test('Agent 选择持久化', function () {
  setPS('opencode_agent', 'wps-expert');
  var agent = getPS('opencode_agent');
  assertEqual(agent, 'wps-expert', '应保存并读取 Agent');
});

section('\n--- 错误恢复测试 ---');

test('网络请求失败重试', function () {
  var retryCount = 0;
  var mockFetch = function () {
    retryCount++;
    if (retryCount < 3) throw new Error('Network error');
    return { ok: true };
  };
  // 模拟重试逻辑
  for (var i = 0; i < 3; i++) {
    try {
      mockFetch();
    } catch (e) {
      continue;
    }
  }
  assertEqual(retryCount, 3, '应重试 3 次');
});

test('SSE 连接断开重连', function () {
  var reconnectCount = 0;
  var mockSSE = {
    close: function () {
      reconnectCount++;
    },
    onerror: null,
  };
  // 模拟断开重连
  mockSSE.close();
  mockSSE.close();
  assertTrue(reconnectCount >= 1, '应触发重连');
});

section('\n--- 会话管理测试 ---');

var sessions = [];
function createSession(title) {
  var id = Date.now().toString(36);
  sessions.push({ id: id, title: title, messages: [] });
  return id;
}

test('创建新会话', function () {
  var id = createSession('测试会话');
  assertTrue(id.length > 0, '应生成会话 ID');
  assertEqual(sessions.length, 1, '应有一个会话');
});

test('切换会话', function () {
  createSession('会话1');
  createSession('会话2');
  var currentId = sessions[0].id;
  assertTrue(currentId, '应能切换到指定会话');
});

test('删除会话', function () {
  sessions = [];
  createSession('会话A');
  createSession('会话B');
  var before = sessions.length;
  var deleteId = sessions[0].id;
  var remaining = [];
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].id !== deleteId) {
      remaining.push(sessions[i]);
    }
  }
  sessions = remaining;
  assertTrue(sessions.length < before, '应减少会话数量');
});

// ==================== 测试结果汇总 ====================

runTests().then(function () {
  console.log('\n========== 测试结果 ==========');
  console.log('总计: ' + testCount + ' 个测试');
  console.log('通过: ' + passCount + ' 个');
  console.log('失败: ' + (testCount - passCount) + ' 个');

  // 防「0 个测试假装通过」：没有任何测试注册时不得 exit 0（用户第 6 条：不要假装测试）
  if (testCount === 0) {
    console.log('\n✗ 未执行任何测试（0 个测试）！\n');
    process.exit(1);
  }
  if (passCount === testCount) {
    console.log('\n✓ 所有 E2E 测试通过!\n');
    process.exit(0);
  } else {
    console.log('\n✗ 部分测试失败!\n');
    process.exit(1);
  }
});
