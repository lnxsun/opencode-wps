/**
 * setCellFormat（Mac 侧）视觉格式处理单元测试
 * 验证 excel-handler.js 中的 toExcelColor / resolveAlignment / setCellFormat handler
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

function assertNotNull(actual, msg) {
  if (actual === null || actual === undefined) throw new Error(msg + ' - expected non-null');
}

// ==================== 加载 excel-handler.js ====================

var fs = require('fs');
var vm = require('vm');
var path = require('path');

var __handlers = {};
global.registerHandler = function(name, fn) { __handlers[name] = fn; };
global.ok = function(data) { return { success: true, data: data || null, error: null }; };
global.fail = function(msg) { return { success: false, data: null, error: msg || '未知错误' }; };
global.invalidParam = function(msg) { return { success: false, data: null, error: '参数错误: ' + (msg || '') }; };

var mockCalls = [];
var mockRange = {
  set HorizontalAlignment(v) { mockCalls.push(['hAlign', v]); },
  set VerticalAlignment(v) { mockCalls.push(['vAlign', v]); },
  set WrapText(v) { mockCalls.push(['wrapText', v]); },
  set NumberFormat(v) { mockCalls.push(['numberFormat', v]); },
  Font: {
    set Size(v) { mockCalls.push(['fontSize', v]); },
    set Bold(v) { mockCalls.push(['bold', v]); },
    set Italic(v) { mockCalls.push(['italic', v]); },
    set Name(v) { mockCalls.push(['fontName', v]); },
    set Color(v) { mockCalls.push(['fontColor', v]); },
    set Underline(v) { mockCalls.push(['underline', v]); },
    set Strikethrough(v) { mockCalls.push(['strikethrough', v]); }
  },
  Interior: {
    set Color(v) { mockCalls.push(['bgColor', v]); }
  },
  Merge: function() { mockCalls.push(['merge', true]); },
  UnMerge: function() { mockCalls.push(['unmerge', true]); }
};

function resetMock() {
  mockCalls.length = 0;
}

global.Application = {
  ActiveWorkbook: {
    Name: 'test.xlsx',
    Sheets: {
      Count: 1,
      Item: function(name) { return { Name: name }; }
    },
    ActiveSheet: { Name: 'Sheet1', Range: function() { return mockRange; } }
  },
  ActiveSheet: { Name: 'Sheet1', Range: function() { return mockRange; } }
};

// 用 vm 在当前上下文直接执行，使顶层 var/function 挂到全局，便于测试辅助函数
var handlerPath = path.join(__dirname, '..', 'opencode-wps-assistant', 'handlers', 'excel-handler.js');
var src = fs.readFileSync(handlerPath, 'utf-8');
vm.runInThisContext(src, { filename: 'excel-handler.js' });

var setCellFormat = __handlers.setCellFormat;
var toExcelColor = global.toExcelColor;
var resolveAlignment = global.resolveAlignment;
var H_ALIGN_MAP = global.H_ALIGN_MAP;
var V_ALIGN_MAP = global.V_ALIGN_MAP;

// ==================== toExcelColor 测试 ====================

console.log('\n--- toExcelColor ---');

test('toExcelColor: #RRGGBB 转 BGR', function() {
  // #FF0000 (red) → BGR = 0x0000FF = 255
  assertEqual(toExcelColor('#FF0000'), 255, '红色转换');
  // #00FF00 (green) → BGR = 0x00FF00 = 65280
  assertEqual(toExcelColor('#00FF00'), 65280, '绿色转换');
  // #0000FF (blue) → BGR = 0xFF0000 = 16711680
  assertEqual(toExcelColor('#0000FF'), 16711680, '蓝色转换');
});

test('toExcelColor: 不带 # 前缀', function() {
  assertEqual(toExcelColor('FF0000'), 255, '无前缀红色');
});

test('toExcelColor: RGB 简写', function() {
  assertEqual(toExcelColor('#F00'), 255, '3位简写红色');
  assertEqual(toExcelColor('#0F0'), 65280, '3位简写绿色');
});

test('toExcelColor: 数字直接返回', function() {
  assertEqual(toExcelColor(255), 255, '数字原样返回');
  assertEqual(toExcelColor(0), 0, '零');
});

test('toExcelColor: 非法值返回 null', function() {
  assertEqual(toExcelColor('#GGGGGG'), null, '非法十六进制');
  assertEqual(toExcelColor('red'), null, '颜色名不支持');
  assertEqual(toExcelColor(''), null, '空字符串');
  assertEqual(toExcelColor(null), null, 'null');
  assertEqual(toExcelColor(undefined), null, 'undefined');
});

test('toExcelColor: 大小写不敏感', function() {
  assertEqual(toExcelColor('#ff0000'), 255, '小写');
  assertEqual(toExcelColor('#FF0000'), 255, '大写');
});

// ==================== resolveAlignment 测试 ====================

console.log('\n--- resolveAlignment ---');

test('resolveAlignment: 字符串映射', function() {
  assertEqual(resolveAlignment('left', H_ALIGN_MAP), -4131, 'left');
  assertEqual(resolveAlignment('center', H_ALIGN_MAP), -4108, 'center');
  assertEqual(resolveAlignment('right', H_ALIGN_MAP), -4152, 'right');
  assertEqual(resolveAlignment('top', V_ALIGN_MAP), -4160, 'top');
  assertEqual(resolveAlignment('bottom', V_ALIGN_MAP), -4107, 'bottom');
});

test('resolveAlignment: 大小写不敏感', function() {
  assertEqual(resolveAlignment('LEFT', H_ALIGN_MAP), -4131, '大写 LEFT');
  assertEqual(resolveAlignment('Center', H_ALIGN_MAP), -4108, '混合大小写');
});

test('resolveAlignment: 数字直接返回', function() {
  assertEqual(resolveAlignment(-4131, H_ALIGN_MAP), -4131, '数字常量');
  assertEqual(resolveAlignment(-4108, H_ALIGN_MAP), -4108, 'center 数字');
});

test('resolveAlignment: 非法值返回 null', function() {
  assertEqual(resolveAlignment('diagonal', H_ALIGN_MAP), null, '未知对齐');
  assertEqual(resolveAlignment('', H_ALIGN_MAP), null, '空字符串');
  assertEqual(resolveAlignment(undefined, H_ALIGN_MAP), null, 'undefined');
});

// ==================== setCellFormat handler 测试 ====================

console.log('\n--- setCellFormat handler ---');

function makeSheet() {
  var sheet = { Name: 'Sheet1', Range: function() { return mockRange; } };
  global.Application.ActiveWorkbook.Sheets.Item = function(name) { return sheet; };
  return sheet;
}

test('setCellFormat: format 对象内完整视觉格式', function() {
  resetMock();
  var r = setCellFormat({
    range: 'A1:G10',
    format: {
      bold: true,
      italic: false,
      fontSize: 12,
      fontName: '微软雅黑',
      fontColor: '#FF0000',
      bgColor: '#D6E4F0',
      underline: true,
      strikethrough: false,
      horizontalAlignment: 'center',
      verticalAlignment: 'top',
      wrapText: true
    }
  });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'bold'; })[0][1], true, 'bold');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'italic'; })[0][1], false, 'italic false 应生效');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontSize'; })[0][1], 12, 'fontSize');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontName'; })[0][1], '微软雅黑', 'fontName');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontColor'; })[0][1], 255, 'fontColor #FF0000 → BGR 255');
  assertNotNull(mockCalls.filter(function(c) { return c[0] === 'bgColor'; })[0], 'bgColor 应设置');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'underline'; })[0][1], true, 'underline');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'strikethrough'; })[0][1], false, 'strikethrough false 应生效');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'hAlign'; })[0][1], -4108, '水平居中');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'vAlign'; })[0][1], -4160, '垂直顶部');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'wrapText'; })[0][1], true, 'wrapText');
});

test('setCellFormat: numberFormat 优先 format 对象内', function() {
  resetMock();
  var r = setCellFormat({
    range: 'A1',
    format: { numberFormat: '0.00%' },
    numberFormat: '0.0%'
  });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'numberFormat'; })[0][1], '0.00%', 'format.numberFormat 优先');
});

test('setCellFormat: 顶层 numberFormat 兼容旧调用', function() {
  resetMock();
  var r = setCellFormat({ range: 'A1', numberFormat: '0.0%' });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'numberFormat'; })[0][1], '0.0%', '顶层 numberFormat 生效');
});

test('setCellFormat: 顶层对齐/换行参数兼容旧调用', function() {
  resetMock();
  var r = setCellFormat({
    range: 'A1',
    horizontalAlignment: 'right',
    verticalAlignment: 'bottom',
    wrapText: false
  });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'hAlign'; })[0][1], -4152, '右对齐');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'vAlign'; })[0][1], -4107, '底部对齐');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'wrapText'; })[0][1], false, 'wrapText false');
});

test('setCellFormat: mergeCells 处理', function() {
  resetMock();
  var r = setCellFormat({ range: 'A1:B2', mergeCells: true });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'merge'; }).length, 1, 'Merge 调用');

  resetMock();
  r = setCellFormat({ range: 'A1:B2', mergeCells: false });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'unmerge'; }).length, 1, 'UnMerge 调用');
});

test('setCellFormat: fontSize 0 应被忽略，正数生效', function() {
  resetMock();
  var r = setCellFormat({ range: 'A1', format: { fontSize: 0 } });
  assertTrue(r.success, 'fontSize 0 不应报错');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontSize'; }).length, 0, 'fontSize 0 不应设置');

  resetMock();
  r = setCellFormat({ range: 'A1', format: { fontSize: 12 } });
  assertTrue(r.success, 'fontSize 12 应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontSize'; })[0][1], 12, 'fontSize 12 应设置');

  resetMock();
  r = setCellFormat({ range: 'A1', format: { fontSize: -5 } });
  assertTrue(r.success, 'fontSize 负数应被忽略不报错');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontSize'; }).length, 0, 'fontSize 负数不应设置');
});

test('setCellFormat: 顶层 fontColor/bgColor 兼容旧调用', function() {
  resetMock();
  var r = setCellFormat({ range: 'A1', fontColor: '#FF0000', bgColor: '#0000FF' });
  assertTrue(r.success, '顶层颜色应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontColor'; })[0][1], 255, '顶层 fontColor #FF0000 → BGR 255');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'bgColor'; })[0][1], 16711680, '顶层 bgColor #0000FF → BGR 16711680');
});

test('setCellFormat: format 内颜色优先于顶层', function() {
  resetMock();
  var r = setCellFormat({
    range: 'A1',
    fontColor: '#FF0000',
    bgColor: '#FF0000',
    format: { fontColor: '#00FF00', bgColor: '#00FF00' }
  });
  assertTrue(r.success, '应成功');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontColor'; })[0][1], 65280, 'format.fontColor 优先');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'bgColor'; })[0][1], 65280, 'format.bgColor 优先');
});

test('setCellFormat: 顶层非法颜色不抛错', function() {
  resetMock();
  var r = setCellFormat({ range: 'A1', fontColor: 'not-a-color' });
  assertTrue(r.success, '顶层非法颜色应跳过而非报错');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontColor'; }).length, 0, '非法 fontColor 不应设置');
});

test('setCellFormat: 无 format 不报错（兼容空调用）', function() {
  resetMock();
  var r = setCellFormat({ range: 'A1' });
  assertTrue(r.success, '空调用应成功');
  assertEqual(mockCalls.length, 0, '无格式调用不应触发任何属性设置');
});

test('setCellFormat: 非法颜色不抛错', function() {
  resetMock();
  var r = setCellFormat({
    range: 'A1',
    format: { fontColor: '#ZZZZZZ', bgColor: 'not-a-color', bold: true }
  });
  assertTrue(r.success, '非法颜色应跳过而非报错');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'fontColor'; }).length, 0, '非法 fontColor 不应设置');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'bgColor'; }).length, 0, '非法 bgColor 不应设置');
  assertEqual(mockCalls.filter(function(c) { return c[0] === 'bold'; })[0][1], true, 'bold 仍应设置');
});

test('setCellFormat: 无打开工作簿返回失败', function() {
  var saved = global.Application.ActiveWorkbook;
  global.Application.ActiveWorkbook = null;
  try {
    var r = setCellFormat({ range: 'A1' });
    assertEqual(r.success, false, '应失败');
    assertNotNull(r.error, '应有错误信息');
  } finally {
    global.Application.ActiveWorkbook = saved;
  }
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有 setCellFormat 测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
