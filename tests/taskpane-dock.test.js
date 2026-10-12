/**
 * 任务窗格停靠位置测试套件（PR #79 评审整改 ③：零测试防线 → 补真实单测）
 *
 * 通过 vm 加载生产源码 opencode-wps/main.js（与 CI 中 node --check 同源），
 * mock window.Application（CreateTaskPane / GetTaskPane / PluginStorage），
 * 共 22 个用例，覆盖：
 *  1. CreateTaskPane 仅传 url 单参数（评审 ②：API 签名稳妥用法）
 *  2. 首次创建后 DockPosition 被校正为 msoCTPDockPositionRight（=2）
 *  3. 再次打开（已存在 taskpane_id）时重新校正 DockPosition
 *  4. DockPosition 设置失败时 console.error 留痕（评审 ③：不再空 catch）
 *  5. WPS_Enum 无枚举值冲突：Top/Bottom 未引入（评审 ①）
 *  6. GetTaskPane 返回 null（残留旧 id）回退重建窗格
 *  7. GetTaskPane 抛异常回退重建窗格并留痕
 *  8. DockPosition 设置失败时窗格仍正常打开（不阻断）
 *  9. createTaskPane 辅助函数统一完成创建/存 ID/校正停靠/置可见（评审 ⑤ 去重）
 * 10. setTaskPaneDockPosition 无效对象返回 false
 * 11. PluginStorage.getItem 抛异常：留痕并回退重建（评审 ⑥ 防御一致）
 * 12. CreateTaskPane 抛异常：失败留痕并返回 null，不中断（评审 ⑥ 统一兜底）
 * 13. PluginStorage.setItem 抛异常：留痕后继续校正停靠并置可见（评审 ⑦ 统一兜底）
 * 14. 切换可见性失败（tp.Visible 只读）：留痕不中断按钮回调（评审 ⑧）
 * 15. createTaskPane 内 Visible 置位失败：留痕后仍返回窗格对象（评审 ⑨ 自愈兜底）
 * 16. setItem 持久化失败：内存 ID 兜底防多窗格叠加（评审 ⑩）
 * 17. CreateTaskPane 返回的窗格 ID 为空：留痕、不覆盖既有内存缓存、且跳过 setItem 持久化写入（评审 ⑫ 空值防御）
 *     + errMsg 公共函数行为校验（评审 ⑪，含在上述用例中）
 *     + ID 为空时 setItem 不应被调用（避免持久化 undefined 覆盖既有有效 ID）
 * 18. CreateTaskPane 返回 null（而非抛异常）：立即判空 + 明确留痕 + 返回 null（评审 ⑬ 防御补充）
 * 19. 停靠校正失败但窗格可用：留痕说明窗格仍可用，仍返回窗格对象（评审 ⑬ 防御补充）
 * 20. GetTaskPane 找回路径停靠校正失败：补充「窗格仍可用」留痕，不中断可见性切换（评审 ⑭ 行为一致性）
 * 21. 首次创建：Visible=true 之后 DockPosition 被二次校正为 Right（Issue #164 WPS 文字）
 * 22. GetTaskPane 找回路径：切到可见后 DockPosition 被二次校正（Issue #164 WPS 文字）
 *
 * 清理说明（Issue #78）：此前为修复「头部被遮挡」问题新增的宿主重绘（forceTaskPaneRedraw /
 * scheduleTaskPaneOpenRedraw / registerWindowActivateReflow）与页面自愈（taskpane.html reflow）
 * 相关用例已随无效修复代码一并删除——经 6 轮实机验证确认该问题为 WPS 宿主 bug，修复无效。
 * 本文件仅保留任务窗格创建/切换的通用健壮性用例（与 WPS bug 无关）。
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var MAIN_JS = path.join(__dirname, '..', 'opencode-wps', 'main.js');

var testResults = [];
var testCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    testResults.push({ name: name, status: 'PASS' });
    console.log('  ✓ ' + name);
  } catch (e) {
    testResults.push({ name: name, status: 'FAIL', error: e.message });
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg || 'expected true, got ' + actual);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'assertEqual') + ': expected ' + expected + ', got ' + actual);
  }
}

/**
 * 加载生产 main.js 到 vm 沙箱，返回 sandbox
 * @param {object} appMock - window.Application mock
 */
function loadMainJs(appMock) {
  var src = fs.readFileSync(MAIN_JS, 'utf-8');
  var errorLogs = [];
  // 记录 setTimeout 回调：生产代码用 setTimeout 做异步两步（隐藏→显示），
  // 测试环境不自动执行（避免时序依赖），由用例手动 flush（__flushTimeouts）
  var timeoutQueue = [];
  var sandbox = {
    window: {
      Application: appMock,
      // OnAddinLoad 会给 Application.Enum 赋值；mock 上允许动态加属性即可
    },
    console: {
      log: function () {},
      warn: function () {},
      error: function (msg) {
        errorLogs.push(String(msg));
      },
    },
    alert: function () {},
    setInterval: function () {
      return 0;
    },
    clearInterval: function () {},
    setTimeout: function (cb) {
      timeoutQueue.push(cb);
      return timeoutQueue.length;
    },
    XMLHttpRequest: function () {
      this.open = function () {};
      this.send = function () {};
      this.setRequestHeader = function () {};
    },
    __errorLogs: errorLogs,
    // 手动执行已排队的 setTimeout 回调（按 FIFO），返回执行次数
    __flushTimeouts: function () {
      var n = 0;
      while (timeoutQueue.length) {
        var cb = timeoutQueue.shift();
        cb();
        n++;
      }
      return n;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: MAIN_JS });
  return sandbox;
}

// ==================== 测试用例 ====================

test('WPS_Enum 无枚举值冲突：无 Top/Bottom，Right=2 且唯一', function () {
  var sandbox = loadMainJs({});
  var WPS_Enum = sandbox.WPS_Enum;
  assertTrue(WPS_Enum, 'WPS_Enum 未定义');
  // 评审 ①：Top/Bottom 未引入（其值 1/3 与 msoFileDialogOpen=1 冲突）
  assertTrue(
    typeof WPS_Enum.msoCTPDockPositionTop === 'undefined',
    'msoCTPDockPositionTop 不应存在'
  );
  assertTrue(
    typeof WPS_Enum.msoCTPDockPositionBottom === 'undefined',
    'msoCTPDockPositionBottom 不应存在'
  );
  assertEqual(WPS_Enum.msoCTPDockPositionRight, 2, 'msoCTPDockPositionRight 应为 2');
  // 所有枚举值唯一
  var values = Object.keys(WPS_Enum).map(function (k) {
    return WPS_Enum[k];
  });
  var unique = values.filter(function (v, i) {
    return values.indexOf(v) === i;
  });
  assertEqual(unique.length, values.length, '枚举值存在冲突（重复数值）');
});

test('CreateTaskPane 仅传 url 单参数（评审 ② API 签名稳妥用法）', function () {
  var createCalls = [];
  var appMock = {
    CreateTaskPane: function (url) {
      createCalls.push({ url: url, argsCount: arguments.length });
      return { ID: 'tp-1', DockPosition: undefined, Visible: false };
    },
    GetTaskPane: function () {
      return { DockPosition: undefined, Visible: false };
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  // 触发按钮动作
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(createCalls.length, 1, 'CreateTaskPane 应被调用 1 次');
  assertEqual(createCalls[0].argsCount, 1, 'CreateTaskPane 第二参数不应传入（官方签名稳妥用法）');
});

test('首次创建：CreateTaskPane 后 DockPosition 校正为 Right(2)', function () {
  var createdPane = { ID: 'tp-1', DockPosition: undefined, Visible: false };
  var appMock = {
    CreateTaskPane: function () {
      return createdPane;
    },
    GetTaskPane: function () {
      return { DockPosition: undefined, Visible: false };
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(createdPane.DockPosition, 2, '首次创建后 DockPosition 应为 2 (Right)');
  assertEqual(createdPane.Visible, true, '创建后应可见');
});

test('再次打开：已存在 taskpane_id 时重新校正 DockPosition', function () {
  var existingPane = { DockPosition: 0, Visible: false };
  var appMock = {
    CreateTaskPane: function () {
      throw new Error('不应调用 CreateTaskPane');
    },
    GetTaskPane: function () {
      return existingPane;
    },
    PluginStorage: {
      getItem: function () {
        return 'tp-existing';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(existingPane.DockPosition, 2, '再次打开时 DockPosition 应重新校正为 2');
  assertEqual(existingPane.Visible, true, '切换后应可见');
});

test('GetTaskPane 返回 null（残留旧 taskpane_id）：回退重建窗格', function () {
  var recreatedPane = { ID: 'tp-new', DockPosition: undefined, Visible: false };
  var setItemCalls = [];
  var appMock = {
    CreateTaskPane: function () {
      return recreatedPane;
    },
    GetTaskPane: function () {
      return null;
    },
    PluginStorage: {
      getItem: function () {
        return 'tp-stale';
      },
      setItem: function (k, v) {
        setItemCalls.push([k, v]);
      },
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(recreatedPane.DockPosition, 2, '回退重建后 DockPosition 应校正为 2');
  assertEqual(recreatedPane.Visible, true, '回退重建后应可见');
  var hasTaskPaneId = setItemCalls.some(function (c) {
    return c[0] === 'taskpane_id' && c[1] === 'tp-new';
  });
  assertTrue(hasTaskPaneId, '应更新 PluginStorage 中的 taskpane_id 为新窗格 ID');
});

test('GetTaskPane 抛异常（个别版本对无效 id 抛错）：回退重建窗格并留痕', function () {
  var recreatedPane = { ID: 'tp-new2', DockPosition: undefined, Visible: false };
  var setItemCalls = [];
  var appMock = {
    CreateTaskPane: function () {
      return recreatedPane;
    },
    GetTaskPane: function () {
      throw new Error('invalid taskpane id');
    },
    PluginStorage: {
      getItem: function () {
        return 'tp-stale';
      },
      setItem: function (k, v) {
        setItemCalls.push([k, v]);
      },
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(recreatedPane.DockPosition, 2, '回退重建后 DockPosition 应校正为 2');
  assertEqual(recreatedPane.Visible, true, '回退重建后应可见');
  var hasTaskPaneId = setItemCalls.some(function (c) {
    return c[0] === 'taskpane_id' && c[1] === 'tp-new2';
  });
  assertTrue(hasTaskPaneId, '应更新 PluginStorage 中的 taskpane_id 为新窗格 ID');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('GetTaskPane 获取任务窗格失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('DockPosition 设置失败：console.error 留痕（评审 ③ 不空吞异常）', function () {
  var pane = {
    ID: 'tp-fail',
    set DockPosition(v) {
      throw new Error('DockPosition 只读');
    },
    Visible: false,
  };
  var appMock = {
    CreateTaskPane: function () {
      return pane;
    },
    GetTaskPane: function () {
      return pane;
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('设置任务窗格停靠位置失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
  assertEqual(pane.Visible, true, '即使停靠设置失败，窗格仍应正常打开');
});

test('createTaskPane 辅助函数：统一完成创建/存 ID/校正停靠/置可见（评审 ⑤ 去重）', function () {
  var createdPane = { ID: 'tp-c', DockPosition: undefined, Visible: false };
  var setItemCalls = [];
  var createCalls = [];
  var appMock = {
    CreateTaskPane: function (url) {
      createCalls.push({ url: url, argsCount: arguments.length });
      return createdPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function (k, v) {
        setItemCalls.push([k, v]);
      },
    },
  };
  var sandbox = loadMainJs(appMock);
  var ret = sandbox.createTaskPane();
  assertEqual(ret, createdPane, '应返回创建的任务窗格对象');
  assertEqual(createCalls.length, 1, 'CreateTaskPane 应被调用 1 次');
  assertEqual(createCalls[0].argsCount, 1, 'CreateTaskPane 第二参数不应传入');
  var hasTaskPaneId = setItemCalls.some(function (c) {
    return c[0] === 'taskpane_id' && c[1] === 'tp-c';
  });
  assertTrue(hasTaskPaneId, '应存储 taskpane_id 为新窗格 ID');
  assertEqual(createdPane.DockPosition, 2, 'DockPosition 应校正为 2 (Right)');
  assertEqual(createdPane.Visible, true, '创建后应可见');
});

test('setTaskPaneDockPosition 直接调用：无效对象返回 false', function () {
  var sandbox = loadMainJs({});
  assertEqual(sandbox.setTaskPaneDockPosition(null), false, 'null 应返回 false');
  assertEqual(sandbox.setTaskPaneDockPosition(undefined), false, 'undefined 应返回 false');
});

test('PluginStorage.getItem 抛异常（插件初始化未完成）：留痕并回退重建（评审 ⑥ 防御一致）', function () {
  var recreatedPane = { ID: 'tp-init-fail', DockPosition: undefined, Visible: false };
  var appMock = {
    CreateTaskPane: function () {
      return recreatedPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        throw new Error('PluginStorage 未就绪');
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(recreatedPane.DockPosition, 2, 'getItem 异常后回退重建，DockPosition 应校正为 2');
  assertEqual(recreatedPane.Visible, true, '回退重建后应可见');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('读取 taskpane_id 失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('CreateTaskPane 抛异常（路径无效等）：失败留痕并返回 null，不中断（评审 ⑥ 统一兜底）', function () {
  var appMock = {
    CreateTaskPane: function () {
      throw new Error('taskpane.html 路径无效');
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' }); // 不应抛异常
  assertEqual(sandbox.createTaskPane(), null, 'createTaskPane 失败应返回 null');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('初始化任务窗格失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('PluginStorage.setItem 抛异常（初始化未完成）：留痕后继续校正停靠并置可见（评审 ⑦ 统一兜底）', function () {
  var createdPane = { ID: 'tp-setitem-fail', DockPosition: undefined, Visible: false };
  var appMock = {
    CreateTaskPane: function () {
      return createdPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {
        throw new Error('PluginStorage 未就绪');
      },
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' }); // 不应抛异常
  // setItem 失败不应中断后续初始化：DockPosition 校正 + Visible 置位照常执行
  assertEqual(createdPane.DockPosition, 2, 'setItem 失败后 DockPosition 仍应校正为 2');
  assertEqual(createdPane.Visible, true, 'setItem 失败后窗格仍应可见');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('保存 taskpane_id 失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('切换可见性失败（tp.Visible 只读）：留痕不中断按钮回调（评审 ⑧ 统一兜底）', function () {
  var existingPane = { DockPosition: 0 };
  Object.defineProperty(existingPane, 'Visible', {
    get: function () {
      return false;
    },
    set: function () {
      throw new Error('Visible 只读');
    },
  });
  var appMock = {
    CreateTaskPane: function () {
      throw new Error('不应调用 CreateTaskPane');
    },
    GetTaskPane: function () {
      return existingPane;
    },
    PluginStorage: {
      getItem: function () {
        return 'tp-existing';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' }); // 不应抛异常
  assertEqual(existingPane.DockPosition, 2, '切换前仍应完成 DockPosition 校正');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('切换任务窗格可见性失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('GetTaskPane 找回路径停靠校正失败：补充「窗格仍可用」留痕，不中断可见性切换（评审 ⑭ 行为一致性）', function () {
  // 已存在任务窗格（GetTaskPane 找回路径）：DockPosition 只读抛异常（停靠校正失败）
  var existingPane = { ID: 'tp-existing-dockfail', Visible: false };
  Object.defineProperty(existingPane, 'DockPosition', {
    get: function () {
      return undefined;
    },
    set: function () {
      throw new Error('DockPosition 只读');
    },
  });
  var appMock = {
    CreateTaskPane: function () {
      throw new Error('不应调用 CreateTaskPane');
    },
    GetTaskPane: function () {
      return existingPane;
    },
    PluginStorage: {
      getItem: function () {
        return 'tp-existing-dockfail';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' }); // 不应抛异常
  // 停靠校正失败不阻断：可见性切换照常执行（false → true）
  assertEqual(existingPane.Visible, true, '停靠校正失败后可见性切换仍应执行');
  // 双层留痕：内部「设置任务窗格停靠位置失败」+ 增强「窗格仍可用」
  var hasDockError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('设置任务窗格停靠位置失败') >= 0;
  });
  assertTrue(
    hasDockError,
    '应输出停靠设置失败留痕（setTaskPaneDockPosition 内部），实际错误日志: ' +
      JSON.stringify(sandbox.__errorLogs)
  );
  var hasUsable = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('任务窗格停靠校正失败（窗格仍可用') >= 0;
  });
  assertTrue(
    hasUsable,
    '应输出「窗格仍可用」增强留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('createTaskPane 内 Visible 置位失败：留痕后仍返回窗格对象（评审 ⑨ 自愈兜底）', function () {
  var createdPane = { ID: 'tp-visible-fail', DockPosition: undefined };
  Object.defineProperty(createdPane, 'Visible', {
    get: function () {
      return false;
    },
    set: function () {
      throw new Error('Visible 只读');
    },
  });
  var appMock = {
    CreateTaskPane: function () {
      return createdPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  var ret = sandbox.createTaskPane();
  // 关键：不再返回 null，而是返回窗格对象——保留下次点击自愈机会（GetTaskPane 找回 → 重新校正 + 切换可见性）
  assertEqual(ret, createdPane, 'Visible 置位失败仍应返回窗格对象');
  assertEqual(createdPane.DockPosition, 2, 'DockPosition 仍应校正为 2');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('置任务窗格可见失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 console.error 留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('setItem 持久化失败：内存 ID 兜底，再次点击不重复创建（评审 ⑩ 多窗格防叠加）', function () {
  var createdPane = { ID: 'tp-cache', DockPosition: undefined, Visible: false };
  var createCalls = 0;
  var appMock = {
    CreateTaskPane: function () {
      createCalls++;
      return createdPane;
    },
    GetTaskPane: function () {
      return createdPane;
    }, // 内存 ID 能找回窗格
    PluginStorage: {
      getItem: function () {
        throw new Error('PluginStorage 未就绪');
      }, // 持久化读取也失败
      setItem: function () {
        throw new Error('PluginStorage 未就绪');
      }, // 持久化写入失败
    },
  };
  var sandbox = loadMainJs(appMock);
  // 第一次点击：创建 + setItem 失败（留痕），内存 ID 已记录
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(createCalls, 1, '第一次点击应创建 1 次');
  assertEqual(createdPane.Visible, true, '第一次创建后应可见');
  // 第二次点击：应通过内存 ID 找回窗格，不再重复创建，而是切换可见性
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(createCalls, 1, '第二次点击应复用内存 ID，不重复创建');
  assertEqual(createdPane.Visible, false, '第二次点击后应切换为隐藏');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('保存 taskpane_id 失败') >= 0;
  });
  assertTrue(
    hasError,
    '应输出 setItem 失败留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('CreateTaskPane 返回的窗格 ID 为空：留痕但不覆盖既有内存缓存（评审 ⑫ 空值防御）', function () {
  var createdPane = { ID: undefined, DockPosition: undefined, Visible: false };
  var setItemCalls = [];
  var appMock = {
    CreateTaskPane: function () {
      return createdPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function (k, v) {
        setItemCalls.push([k, v]);
      },
    },
  };
  var sandbox = loadMainJs(appMock);
  // 先造一个既有缓存，验证 ID 为空时不覆盖
  sandbox.taskpaneIdCache = 'tp-existing-cache';
  var ret = sandbox.createTaskPane();
  assertEqual(ret, createdPane, 'ID 为空仍应返回窗格对象（初始化流程不中断）');
  assertEqual(createdPane.DockPosition, 2, 'DockPosition 仍应校正为 2');
  assertEqual(createdPane.Visible, true, '窗格仍应置可见');
  assertEqual(sandbox.taskpaneIdCache, 'tp-existing-cache', 'ID 为空时不应覆盖既有内存缓存');
  assertEqual(setItemCalls.length, 0, 'ID 为空时应跳过 setItem 持久化写入，避免覆盖既有有效 ID');
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('任务窗格 ID 为空') >= 0;
  });
  assertTrue(hasError, '应输出 ID 为空留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs));
});

test('errMsg 公共函数：Error 取 message，非 Error 值原样返回（评审 ⑪ 去重）', function () {
  var sandbox = loadMainJs({});
  assertEqual(sandbox.errMsg(new Error('boom')), 'boom', 'Error 对象应取 message');
  assertEqual(sandbox.errMsg('直接字符串'), '直接字符串', '字符串应原样返回');
  assertEqual(sandbox.errMsg(42), 42, '数字应原样返回');
  assertEqual(sandbox.errMsg(null), null, 'null 应原样返回');
  assertEqual(sandbox.errMsg(undefined), undefined, 'undefined 应原样返回');
});

test('CreateTaskPane 返回 null（而非抛异常）：立即判空 + 明确留痕 + 返回 null（评审 ⑬）', function () {
  var appMock = {
    CreateTaskPane: function () {
      return null;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  var ret = sandbox.createTaskPane();
  assertEqual(ret, null, 'CreateTaskPane 返回 null 时 createTaskPane 应返回 null');
  // 留痕文案应明确指向「返回空对象」，而非误导性的「初始化任务窗格失败」
  var hasError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('CreateTaskPane 返回空对象') >= 0;
  });
  assertTrue(hasError, '应输出明确留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs));
  var hasMisleading = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('初始化任务窗格失败') >= 0;
  });
  assertTrue(
    !hasMisleading,
    '不应走到误导性的外层 catch 文案，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('停靠校正失败但窗格可用：留痕说明窗格仍可用，仍返回窗格对象（评审 ⑬）', function () {
  var createdPane = { ID: 'tp-dock-fail', Visible: false };
  Object.defineProperty(createdPane, 'DockPosition', {
    get: function () {
      return undefined;
    },
    set: function () {
      throw new Error('DockPosition 只读');
    },
  });
  var appMock = {
    CreateTaskPane: function () {
      return createdPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  var ret = sandbox.createTaskPane();
  // 停靠校正失败不阻断：仍置可见并返回窗格对象（下次点击经 GetTaskPane 找回重新校正，有自愈机会）
  assertEqual(ret, createdPane, '停靠校正失败仍应返回窗格对象');
  assertEqual(createdPane.Visible, true, '停靠校正失败后仍应置可见');
  var hasDockError = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('设置任务窗格停靠位置失败') >= 0;
  });
  assertTrue(
    hasDockError,
    '应输出停靠设置失败留痕（setTaskPaneDockPosition 内部），实际错误日志: ' +
      JSON.stringify(sandbox.__errorLogs)
  );
  var hasUsable = sandbox.__errorLogs.some(function (l) {
    return l.indexOf('任务窗格停靠校正失败（窗格仍可用') >= 0;
  });
  assertTrue(
    hasUsable,
    '应输出「窗格仍可用」增强留痕，实际错误日志: ' + JSON.stringify(sandbox.__errorLogs)
  );
});

test('首次创建：Visible=true 之后 DockPosition 被二次校正为 Right（Issue #164 WPS 文字）', function () {
  // 记录事件序列：'dock'（DockPosition 赋值）与 'visible'（Visible 赋值）发生的先后顺序。
  // 根因：WPS 文字（12.1.0.28022）在 Visible=true 时会重算窗格位置、覆盖 DockPosition=Right，
  // 因此修复要求 DockPosition 在置可见【之后】再被校正一次。
  var events = [];
  var createdPane = { ID: 'tp-reassert', _dock: undefined, _visible: false };
  Object.defineProperty(createdPane, 'DockPosition', {
    get: function () {
      return createdPane._dock;
    },
    set: function (v) {
      createdPane._dock = v;
      events.push('dock');
    },
  });
  Object.defineProperty(createdPane, 'Visible', {
    get: function () {
      return createdPane._visible;
    },
    set: function (v) {
      createdPane._visible = v;
      events.push('visible');
    },
  });
  var appMock = {
    CreateTaskPane: function () {
      return createdPane;
    },
    GetTaskPane: function () {
      throw new Error('不应调用 GetTaskPane');
    },
    PluginStorage: {
      getItem: function () {
        return '';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  // 断言时序：最后一个事件是 DockPosition 二次校正，且它发生在置可见之后
  assertEqual(events[events.length - 1], 'dock', '最后一次校正应发生在置可见之后');
  // DockPosition 应被赋值 ≥2 次（置可见前一次 + 置可见后二次校正）
  var dockCount = events.filter(function (e) {
    return e === 'dock';
  }).length;
  assertTrue(dockCount >= 2, 'DockPosition 应被二次校正（当前 ' + dockCount + ' 次）');
  assertEqual(createdPane.DockPosition, 2, '最终 DockPosition 应为 2 (Right)');
  assertEqual(createdPane.Visible, true, '创建后应可见');
});

test('GetTaskPane 找回路径：切到可见后 DockPosition 被二次校正（Issue #164 WPS 文字）', function () {
  // 记录事件序列：验证从隐藏切到可见后，DockPosition 被再次校正。
  var events = [];
  var existingPane = { _dock: undefined, _visible: false };
  Object.defineProperty(existingPane, 'DockPosition', {
    get: function () {
      return existingPane._dock;
    },
    set: function (v) {
      existingPane._dock = v;
      events.push('dock');
    },
  });
  Object.defineProperty(existingPane, 'Visible', {
    get: function () {
      return existingPane._visible;
    },
    set: function (v) {
      existingPane._visible = v;
      events.push('visible');
    },
  });
  var appMock = {
    CreateTaskPane: function () {
      throw new Error('不应调用 CreateTaskPane');
    },
    GetTaskPane: function () {
      return existingPane;
    },
    PluginStorage: {
      getItem: function () {
        return 'tp-existing';
      },
      setItem: function () {},
    },
  };
  var sandbox = loadMainJs(appMock);
  sandbox.OnAction({ Id: 'btnShowTaskPane' });
  assertEqual(existingPane.Visible, true, '从隐藏切到可见');
  assertEqual(events[events.length - 1], 'dock', '切到可见后应再二次校正 DockPosition');
  assertEqual(existingPane.DockPosition, 2, '切到可见后 DockPosition 应为 2 (Right)');
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log(
  '通过: ' +
    testResults.filter(function (r) {
      return r.status === 'PASS';
    }).length +
    ' 个'
);
var failed = testResults.filter(function (r) {
  return r.status === 'FAIL';
});
console.log('失败: ' + failed.length + ' 个');

if (failed.length === 0) {
  console.log('\n✓ 所有任务窗格停靠测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!');
  failed.forEach(function (r) {
    console.log('  - ' + r.name + ': ' + r.error);
  });
  process.exit(1);
}
