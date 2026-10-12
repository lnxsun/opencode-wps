/**
 * Mac 桥接加载项核心逻辑单元测试（Issue #84 Mac 彻底评审修复）
 *
 * 覆盖本次评审修复的关键逻辑：
 *  1. main.js 轮询命令去重（同一 requestId 不重复执行）
 *  2. main.js 失败退避（连续失败指数退避，成功恢复）
 *  3. main.js sendResult 失败重试（最多 3 次）
 *  4. excel-handler.js 列工具（colToLetter/resolveColumnLetter/colToNumber）
 *  5. excel-handler.js 单元格行列校验（resolveRowCol）
 *  6. ppt-handler.js 颜色解析（toRgb：PPT RGB 顺序，非 BGR）
 *  7. ppt-handler.js slideIndex 校验（resolveSlideIndex）
 *  8. word-handler.js 颜色解析（parseColor：BGR + 颜色名）
 */

var testCount = 0;
var passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('✓ ' + name);
  } catch (e) {
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
  if (actual === null || actual === undefined) throw new Error(msg + ' - expected non-null');
}

function assertNull(actual, msg) {
  if (actual !== null && actual !== undefined)
    throw new Error(msg + ' - expected null, got: ' + actual);
}

var fs = require('fs');
var vm = require('vm');
var path = require('path');

// ==================== 加载 excel-handler.js（列工具 + resolveRowCol） ====================
var __handlers = {};
global.registerHandler = function (name, fn) {
  __handlers[name] = fn;
};
global.ok = function (data) {
  return { success: true, data: data || null, error: null };
};
global.fail = function (msg) {
  return { success: false, data: null, error: msg || '未知错误' };
};
global.invalidParam = function (msg) {
  return { success: false, data: null, error: '参数错误: ' + (msg || '') };
};

var excelSrc = fs.readFileSync(
  path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'excel-handler.js'),
  'utf-8'
);
// 先加载 handler-utils.js（Issue #189 PR-C：纯函数已单源化到该文件）
vm.runInThisContext(
  fs.readFileSync(
    path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'handler-utils.js'),
    'utf-8'
  ),
  { filename: 'handler-utils.js' }
);
vm.runInThisContext(excelSrc, { filename: 'excel-handler.js' });

var colToLetter = global.colToLetter;
var resolveColumnLetter = global.resolveColumnLetter;
var colToNumber = global.colToNumber;
var resolveRowCol = global.resolveRowCol;

console.log('\n--- excel-handler 列工具 ---');

test('colToLetter: 1->A, 26->Z, 27->AA, 52->AZ, 703->AAA', function () {
  assertEqual(colToLetter(1), 'A', '1→A');
  assertEqual(colToLetter(26), 'Z', '26→Z');
  assertEqual(colToLetter(27), 'AA', '27→AA');
  assertEqual(colToLetter(52), 'AZ', '52→AZ');
  assertEqual(colToLetter(703), 'AAA', '703→AAA');
});

test('colToLetter: 非法输入返回 null', function () {
  assertNull(colToLetter(0), '0 非法');
  assertNull(colToLetter(-1), '负数非法');
  assertNull(colToLetter('A'), '字符串非法');
  assertNull(colToLetter(NaN), 'NaN 非法');
});

test('resolveColumnLetter: 数字与字母统一解析', function () {
  assertEqual(resolveColumnLetter(1), 'A', '1→A');
  assertEqual(resolveColumnLetter(27), 'AA', '27→AA');
  assertEqual(resolveColumnLetter('AB'), 'AB', 'AB 原样');
  assertEqual(resolveColumnLetter('ab'), 'AB', '小写转大写');
  assertEqual(resolveColumnLetter(' C '), 'C', '去空格');
});

test('resolveColumnLetter: 非法返回 null', function () {
  assertNull(resolveColumnLetter('AB12'), '超3位非法');
  assertNull(resolveColumnLetter(''), '空串非法');
  assertNull(resolveColumnLetter(0), '0 非法');
});

test('colToNumber: 字母转列号（与 colToLetter 对称）', function () {
  assertEqual(colToNumber('A'), 1, 'A→1');
  assertEqual(colToNumber('Z'), 26, 'Z→26');
  assertEqual(colToNumber('AA'), 27, 'AA→27');
  assertEqual(colToNumber(27), 27, '数字原样');
  assertNull(colToNumber('AB12'), '非法字母串');
});

test('resolveRowCol: 正整数校验', function () {
  var rc = resolveRowCol(1, 2);
  assertNotNull(rc, '合法行列');
  assertEqual(rc.row, 1, 'row');
  assertEqual(rc.col, 2, 'col');
  assertNull(resolveRowCol(0, 1), 'row=0 非法');
  assertNull(resolveRowCol(1, 0), 'col=0 非法');
  assertNull(resolveRowCol(-1, 1), '负行非法');
  assertNull(resolveRowCol('x', 1), '非数字行非法');
  assertNull(resolveRowCol(1, undefined), 'col 缺失非法');
});

// ==================== 加载 ppt-handler.js（toRgb + resolveSlideIndex） ====================
__handlers = {};
var pptSrc = fs.readFileSync(
  path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'ppt-handler.js'),
  'utf-8'
);
// handler-utils.js 已在前面 excel 段加载（全局共享），此处无需重复
vm.runInThisContext(pptSrc, { filename: 'ppt-handler.js' });

var toRgb = global.toRgb;
var resolveSlideIndex = global.resolveSlideIndex;

console.log('\n--- ppt-handler 颜色与索引 ---');

test('toRgb: PPT RGB 顺序（非 BGR）', function () {
  // 关键：PPT ForeColor.RGB 需要 RGB 顺序，红色 #FF0000 = 16711680（不是 255）
  assertEqual(toRgb('#FF0000'), 16711680, '#FF0000→RGB 红');
  assertEqual(toRgb('#00FF00'), 65280, '#00FF00→RGB 绿');
  assertEqual(toRgb('#0000FF'), 255, '#0000FF→RGB 蓝');
});

test('toRgb: 3位简写与数字', function () {
  assertEqual(toRgb('#F00'), 16711680, '#F00→红');
  assertEqual(toRgb(255), 255, '数字原样');
});

test('toRgb: 非法返回 null', function () {
  assertNull(toRgb('#GGGGGG'), '非法 hex');
  assertNull(toRgb('red'), '颜色名不支持');
  assertNull(toRgb(''), '空串');
  assertNull(toRgb(null), 'null');
});

test('resolveSlideIndex: 正整数且不越界', function () {
  var pres = { Slides: { Count: 5 } };
  assertEqual(resolveSlideIndex(pres, 1), 1, '1 合法');
  assertEqual(resolveSlideIndex(pres, 5), 5, '5=Count 合法');
  assertNull(resolveSlideIndex(pres, 0), '0 非法');
  assertNull(resolveSlideIndex(pres, 6), '6>Count 非法');
  assertNull(resolveSlideIndex(pres, 'x'), '非数字非法');
  assertNull(resolveSlideIndex(pres, undefined), '缺失非法');
});

// ==================== 加载 word-handler.js（parseColor） ====================
__handlers = {};
var wordSrc = fs.readFileSync(
  path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'word-handler.js'),
  'utf-8'
);
// handler-utils.js 已在前面 excel 段加载（全局共享），此处无需重复
vm.runInThisContext(wordSrc, { filename: 'word-handler.js' });

var parseColor = global.parseColor;

console.log('\n--- word-handler 颜色解析 ---');

test('parseColor: Word BGR 顺序 + 颜色名', function () {
  // Word Font.Color 需要 BGR：红 #FF0000 = 255
  assertEqual(parseColor('#FF0000'), 255, '#FF0000→BGR 红');
  assertEqual(parseColor('#00FF00'), 65280, '#00FF00→BGR 绿');
  assertEqual(parseColor('#0000FF'), 16711680, '#0000FF→BGR 蓝');
  assertEqual(parseColor('red'), 255, '颜色名 red→255');
  assertEqual(parseColor('blue'), 16711680, '颜色名 blue');
});

test('parseColor: 非法返回 null', function () {
  assertNull(parseColor('#GGGGGG'), '非法 hex');
  assertNull(parseColor('not-a-color'), '未知颜色名');
  assertNull(parseColor(''), '空串');
  assertNull(parseColor(undefined), 'undefined');
});

// ==================== 加载 main.js（轮询去重/退避/重试） ====================
// main.js 是 WPS 加载项脚本，需 mock XMLHttpRequest / setTimeout / console
var pendingXhrs = [];
var timers = [];
var globalConsole = [];

function MockXHR() {
  this.timeout = 0;
  this.status = 0;
  this.responseText = '';
  this._method = '';
  this._url = '';
  this._body = null;
  this.onload = null;
  this.onerror = null;
  this.ontimeout = null;
  pendingXhrs.push(this);
}
MockXHR.prototype.open = function (method, url, async) {
  this._method = method;
  this._url = url;
};
MockXHR.prototype.setRequestHeader = function (k, v) {};
MockXHR.prototype.send = function (body) {
  this._body = body;
};
MockXHR.prototype.simulateLoad = function (status, responseText) {
  this.status = status;
  this.responseText = responseText;
  if (this.onload) this.onload();
};
MockXHR.prototype.simulateError = function () {
  if (this.onerror) this.onerror();
};

function mockTimers() {
  timers = [];
  var realSetTimeout = global.setTimeout;
  global.setTimeout = function (fn, delay) {
    timers.push({ fn: fn, delay: delay });
    return timers.length;
  };
  return function restore() {
    global.setTimeout = realSetTimeout;
  };
}

// 重新加载 main.js（每个用例前重置状态）
function loadMain() {
  __handlers = {};
  var mainSrc = fs.readFileSync(
    path.join(__dirname, '..', 'opencode-wps-assistant', 'main.js'),
    'utf-8'
  );
  // main.js 使用 var 顶层声明，vm.runInThisContext 会重复声明报错，用独立 context
  var sandbox = {
    console: console,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    XMLHttpRequest: MockXHR,
    alert: function () {},
    HANDLERS: __handlers,
    registerHandler: function (n, f) {
      __handlers[n] = f;
    },
    getHandler: function (n) {
      return __handlers[n];
    },
    ok: global.ok,
    fail: global.fail,
    invalidParam: global.invalidParam,
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(mainSrc, sandbox, { filename: 'main.js' });
  return sandbox;
}

console.log('\n--- main.js 轮询去重/退避/重试 ---');

test('poll: 同一 requestId 不重复执行（去重）', function () {
  var restore = mockTimers();
  try {
    var sb = loadMain();
    var executed = [];
    sb.registerHandler('testAction', function (params) {
      executed.push(params);
      return { success: true };
    });
    pendingXhrs.length = 0;
    sb._isPolling = true;
    sb._lastRequestId = '';
    sb.poll();

    // 第一次 poll：拿到命令 req-1
    assertEqual(pendingXhrs.length, 1, '发出第一个 poll');
    pendingXhrs[0].simulateLoad(
      200,
      JSON.stringify({ command: { action: 'testAction', requestId: 'req-1', params: { v: 1 } } })
    );
    assertEqual(executed.length, 1, '命令执行一次');
    assertEqual(sb._lastRequestId, 'req-1', '记录 requestId');

    // 第二次 poll：同一 requestId 应跳过
    pendingXhrs.length = 0;
    sb.poll();
    pendingXhrs[0].simulateLoad(
      200,
      JSON.stringify({ command: { action: 'testAction', requestId: 'req-1', params: { v: 1 } } })
    );
    assertEqual(executed.length, 1, '重复命令被跳过');
  } finally {
    restore();
  }
});

test('poll: 失败连续计数与退避调度', function () {
  var restore = mockTimers();
  try {
    var sb = loadMain();
    pendingXhrs.length = 0;
    sb._isPolling = true;
    sb._failCount = 0;
    sb.poll();

    // 网络错误
    pendingXhrs[0].simulateError();
    assertEqual(sb._failCount, 1, '失败计数=1');
    assertEqual(timers[timers.length - 1].delay, 500, '第一次退避 500ms');

    // 再失败一次 → 1s
    pendingXhrs.length = 0;
    sb.poll();
    pendingXhrs[0].simulateError();
    assertEqual(sb._failCount, 2, '失败计数=2');
    assertEqual(timers[timers.length - 1].delay, 1000, '第二次退避 1s');

    // 连续失败封顶 5s
    sb._failCount = 10;
    pendingXhrs.length = 0;
    sb.poll();
    pendingXhrs[0].simulateError();
    assertEqual(timers[timers.length - 1].delay, 5000, '退避封顶 5s');
  } finally {
    restore();
  }
});

test('poll: 成功重置失败计数', function () {
  var restore = mockTimers();
  try {
    var sb = loadMain();
    pendingXhrs.length = 0;
    sb._isPolling = true;
    sb._failCount = 5;
    sb.poll();
    pendingXhrs[0].simulateLoad(200, JSON.stringify({}));
    assertEqual(sb._failCount, 0, '成功重置失败计数');
    assertEqual(sb._lastError, '', '清空错误信息');
  } finally {
    restore();
  }
});

test('sendResult: 非 200 重试（最多 3 次）', function () {
  var restore = mockTimers();
  try {
    var sb = loadMain();
    pendingXhrs.length = 0;
    timers.length = 0;
    sb.sendResult('req-1', { success: true });

    // 第一次发送 → 非 200 → 计划重试
    assertEqual(pendingXhrs.length, 1, '第一次发送');
    pendingXhrs[0].simulateLoad(500, '');
    assertEqual(timers.length, 1, '计划重试');
    assertEqual(timers[0].delay, 500, '重试退避 500ms');

    // 执行重试 → 第二次发送 → 非 200 → 再重试（2次后 delay=1000）
    timers[0].fn();
    assertEqual(pendingXhrs.length, 2, '第二次发送');
    pendingXhrs[1].simulateLoad(500, '');
    assertEqual(timers.length, 2, '再次计划重试');
    assertEqual(timers[1].delay, 1000, '第二次重试退避 1s');

    // 第三次发送 → 非 200 → 放弃并清空去重状态
    timers[1].fn();
    assertEqual(pendingXhrs.length, 3, '第三次发送');
    pendingXhrs[2].simulateLoad(500, '');
    assertEqual(sb._lastRequestId, '', '最终失败清空去重状态');
  } finally {
    restore();
  }
});

test('sendResult: 200 不重试', function () {
  var restore = mockTimers();
  try {
    var sb = loadMain();
    pendingXhrs.length = 0;
    sb.sendResult('req-1', { success: true });
    pendingXhrs[0].simulateLoad(200, '');
    assertEqual(timers.length, 0, '成功不重试');
  } finally {
    restore();
  }
});

// ==================== 第 1 轮评审修复验证 ====================
// 覆盖：行参数校验 / consolidate / cleanData 模式 / sortRange 列字母 / getContext 表头识别

console.log('\n--- 第 1 轮评审修复验证 ---');

// 重新加载 excel-handler（已含最新修复）
__handlers = {};
var excelSrc2 = fs.readFileSync(
  path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'excel-handler.js'),
  'utf-8'
);
vm.runInThisContext(excelSrc2, { filename: 'excel-handler.js2' });

var getHandlerFn = function (name) {
  return __handlers[name];
};

function mockExcelApp() {
  // 构造最小 Excel 环境，直接调用 handler 校验分支逻辑
  var calls = { insertRows: null, deleteRows: null, hideRows: null, groupRows: null };
  var sheet = {
    Rows: function (r) {
      calls.rowsRange = r;
      return {
        Insert: function () {
          calls.insertRows = r;
        },
        Delete: function () {
          calls.deleteRows = r;
        },
      };
    },
    Range: function (r) {
      calls.range = r;
      return {
        Group: function () {
          calls.groupRows = r;
        },
        Hidden: false,
      };
    },
  };
  global.Application = { ActiveSheet: sheet };
  return { sheet: sheet, calls: calls };
}

function loadExcelHandler() {
  __handlers = {};
  var src = fs.readFileSync(
    path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'excel-handler.js'),
    'utf-8'
  );
  vm.runInThisContext(src, { filename: 'excel-handler-latest.js' });
}

loadExcelHandler();

test('insertRows: row=0 非法返回 fail', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('insertRows')({ row: 0 });
  assertFalse(result.success, 'row=0 应失败');
  assertTrue(result.error.indexOf('无效的行参数') !== -1, '明确错误信息');
});

test('insertRows: 合法 row/count 调用 Rows 范围', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('insertRows')({ row: 3, count: 2 });
  assertTrue(result.success, '合法参数成功');
  assertEqual(app.calls.insertRows, '3:4', 'Rows(3:4)');
});

test('deleteRows: count=-1 非法返回 fail', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('deleteRows')({ row: 1, count: -1 });
  assertFalse(result.success, 'count=-1 应失败');
});

test('deleteRows: count 缺省时默认 1 行', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('deleteRows')({ row: 2 });
  assertTrue(result.success, 'count 缺省成功');
  assertEqual(app.calls.deleteRows, '2:2', 'Rows(2:2) 单行');
});

test('groupRows: 字符串行参数非法返回 fail', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('groupRows')({ row: 'abc' });
  assertFalse(result.success, '字符串行参数应失败');
});

test('groupRows: 合法参数调用 Range', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('groupRows')({ row: 5, count: 3 });
  assertTrue(result.success, '合法参数成功');
  assertEqual(app.calls.groupRows, '5:7', 'Range(5:7)');
});

test('consolidate: 缺 sources 返回 fail', function () {
  var app = mockExcelApp();
  var result = getHandlerFn('consolidate')({ range: 'A1:B2' });
  assertFalse(result.success, '缺 sources 应失败');
  assertTrue(result.error.indexOf('缺少 sources') !== -1, '明确错误信息');
});

test('cleanData: trim 模式去首尾空白', function () {
  loadExcelHandler();
  var cells = [];
  var range = {
    Rows: { Count: 1 },
    Columns: { Count: 1 },
    Cells: {
      Item: function (r, c) {
        return cells[0];
      },
    },
  };
  var cell = { Value2: '  hello world  ' };
  cells[0] = cell;
  var sheet = {
    Range: function () {
      return range;
    },
  };
  global.Application = {
    ActiveWorkbook: { ActiveSheet: sheet },
    ActiveSheet: sheet,
  };
  var result = getHandlerFn('cleanData')({ range: 'A1' });
  assertTrue(result.success, 'trim 成功');
  assertEqual(cell.Value2, 'hello world', '去首尾空白');
  assertEqual(result.data.replaced, 1, '替换 1 处');
});

test('setBorder: rangeAddress 旧兼容参数已清理，缺 range 返回失败', function () {
  loadExcelHandler();
  var rangeObj = {
    Borders: {
      Item: function () {
        return { Weight: null, LineStyle: null, Color: null };
      },
    },
  };
  var sheet = {
    Range: function () {
      return rangeObj;
    },
  };
  global.Application = {
    ActiveWorkbook: { ActiveSheet: sheet },
    ActiveSheet: sheet,
  };
  // 只传 rangeAddress（旧兼容参数）不再生效，应报缺 range
  var r1 = getHandlerFn('setBorder')({ rangeAddress: 'A1:B2' });
  assertFalse(r1.success, '仅 rangeAddress 应失败（旧兼容参数已清理）');
  assertTrue(/缺少 range/.test(r1.error), '应提示缺少 range');
  // 传 range 正常工作
  var r2 = getHandlerFn('setBorder')({ range: 'A1:B2' });
  assertTrue(r2.success, '传 range 应成功');
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有 Mac 桥接核心逻辑测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
