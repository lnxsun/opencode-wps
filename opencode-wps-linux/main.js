/**
 * OpenCode AI - Linux WPS 桥接加载项主入口
 * 架构：MCP Server (HTTP 服务端:58891) ← 轮询 ← WPS 加载项 (HTTP 客户端)
 *
 * Linux 版 WPS 加载项同样运行在 WPS 沙箱内，无法启动 HTTP 服务端，
 * 因此与 Mac 版保持一致的反向轮询模式：每 500ms 向 MCP Server 拉取命令，
 * 执行后通过 POST /result 返回结果。
 */

var CONFIG = {
  SERVER_URL: 'http://127.0.0.1:58891',
  LAUNCHER_URL: 'http://127.0.0.1:14097',
  OPENCODE_URL: 'http://127.0.0.1:14096',
  POLL_INTERVAL: 500,
  POLL_TIMEOUT: 5000,
};

var _ribbonUI = null;
var _pollTimer = null;
var _isPolling = false;
var _isPaused = false;
var _failCount = 0; // 连续失败计数（退避用）
var _lastError = ''; // 最近一次轮询错误
var _lastRequestId = ''; // 最近一次已执行的命令 requestId（去重用，防止 poll 重复取同一命令重复执行）

// 退避间隔：500ms -> 1s -> 2s -> 5s 封顶（MCP 不可用时避免 CPU 空转）
var _backoffBase = 500;
var _backoffMax = 5000;

function OnAddinLoad(ribbonUI) {
  _ribbonUI = ribbonUI;
  console.log('=== OpenCode AI 桥接加载项 (Linux) ===');
  console.log('服务器: ' + CONFIG.SERVER_URL);
  startPolling();
  return true;
}

function OnStatusClick() {
  var info = 'OpenCode AI WPS 桥接\n';
  info += '状态: ' + (_isPolling ? '轮询中' : '已停止') + '\n';
  info += '间隔: ' + CONFIG.POLL_INTERVAL + 'ms\n';
  info += '服务器: ' + CONFIG.SERVER_URL + '\n';
  info += '已注册动作: ' + Object.keys(HANDLERS).length + ' 个\n';
  info += '连续失败: ' + _failCount + ' 次';
  if (_lastError) info += '\n最近错误: ' + _lastError;
  alert(info);
  return true;
}

function OnToggleClick() {
  _isPaused = !_isPaused;
  if (_isPaused) {
    stopPolling();
    alert('轮询已暂停');
  } else {
    startPolling();
    alert('轮询已恢复');
  }
  try {
    _ribbonUI.Invalidate();
  } catch (e) {}
  return true;
}

/**
 * 打开 Web：先探测 launcher 与 opencode 服务状态，再调用 launcher-linux 的 /dock 接口，
 * 在系统默认浏览器（优先 Chrome/Edge）中打开 OpenCode AI 对话界面。
 */
function OnOpenWebClick() {
  console.log('[OpenCode] OpenWeb: ' + CONFIG.OPENCODE_URL);

  // 发送前先确认 launcher 可达、opencode 服务已运行，避免浏览器打开连接失败页
  var probe = new XMLHttpRequest();
  probe.open('GET', CONFIG.LAUNCHER_URL + '/status', true);
  probe.timeout = 3000;
  probe.onload = function () {
    var st = null;
    try {
      st = JSON.parse(probe.responseText || '{}');
    } catch (e) {}
    if (!st || st.running !== true) {
      // 自愈：launcher 在但 opencode 未运行 -> 尝试 POST /start 拉起后重试
      alert('OpenCode 服务未启动，正在尝试拉起...');
      selfStartOpenCode();
      return;
    }
    dockOpen(st.cwd || '');
  };
  probe.onerror = function () {
    alert('打开Web失败：launcher 不可达，请确认 launcher-linux 已启动');
  };
  probe.ontimeout = function () {
    alert('打开Web失败：launcher 响应超时，请确认 launcher-linux 已启动');
  };
  try {
    probe.send();
  } catch (e) {
    alert('打开Web失败：' + e.message);
  }
  return true;
}

/**
 * 自愈：launcher 可达但 opencode 服务未运行（running !== true）时，
 * 调用 POST /start 拉起 opencode serve，成功后重试 dock。
 */
function selfStartOpenCode() {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', CONFIG.LAUNCHER_URL + '/start', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 5000;
  xhr.onload = function () {
    if (xhr.status === 200) {
      alert('OpenCode 服务已启动，正在打开Web...');
      // 稍等 opencode 端口就绪后重试打开
      setTimeout(function () {
        dockOpen('');
      }, 1500);
    } else {
      // 400 可能是 "already running"（服务其实已运行）——主动探测确认，避免误导用户
      var resp = null;
      try {
        resp = JSON.parse(xhr.responseText || '{}');
      } catch (e) {}
      if (resp && resp.error && resp.error.indexOf('already running') !== -1) {
        alert('OpenCode 服务已在运行，正在打开Web...');
        setTimeout(function () {
          dockOpen('');
        }, 800);
      } else {
        alert(
          '打开Web失败：opencode 启动失败（' + xhr.status + '），请手动运行 node launcher-linux.js'
        );
      }
    }
  };
  xhr.onerror = function () {
    alert('打开Web失败：launcher 不可达，请确认 launcher-linux 已启动');
  };
  xhr.ontimeout = function () {
    alert('打开Web失败：launcher 响应超时，请重试');
  };
  try {
    // launcher 的 startOpenCode 要求 cwd 非空（空字符串会返回 {success:false, error:'cwd is undefined'}），
    // 因此不传 cwd 或传默认值；此处传空对象让 launcher 使用其默认 cwd（opencodeCwd 或用户主目录）
    xhr.send(JSON.stringify({}));
  } catch (e) {
    alert('打开Web失败：' + e.message);
  }
}

function dockOpen(cwd) {
  console.log('[OpenCode] Dock cwd=' + cwd);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', CONFIG.LAUNCHER_URL + '/dock', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 5000;
  xhr.onload = function () {
    console.log('[OpenCode] Dock response: ' + xhr.status + ' ' + xhr.responseText);
    if (xhr.status !== 200) {
      alert('打开Web失败：launcher 返回 ' + xhr.status + '，请确认 launcher-linux 已启动');
    }
  };
  xhr.onerror = function () {
    console.error('[OpenCode] Dock error: launcher 不可达');
    alert('打开Web失败：launcher 不可达，请确认 launcher-linux 已启动');
  };
  xhr.ontimeout = function () {
    console.error('[OpenCode] Dock timeout');
    alert('打开Web失败：launcher 响应超时，请重试');
  };
  try {
    xhr.send(JSON.stringify({ cwd: cwd }));
  } catch (e) {
    console.error('[OpenCode] Dock send error: ' + e.message);
    alert('打开Web失败：' + e.message);
  }
}

function startPolling() {
  if (_pollTimer) return;
  _isPolling = true;
  console.log('开始轮询: ' + CONFIG.SERVER_URL);
  poll();
}

function stopPolling() {
  if (_pollTimer) {
    clearTimeout(_pollTimer);
    _pollTimer = null;
  }
  _isPolling = false;
  console.log('轮询已停止');
}

function poll() {
  if (!_isPolling) return;

  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', CONFIG.SERVER_URL + '/poll', true);
    xhr.timeout = CONFIG.POLL_TIMEOUT;

    xhr.onload = function () {
      if (xhr.status === 200) {
        _failCount = 0; // 成功则重置退避
        _lastError = '';
        try {
          var response = JSON.parse(xhr.responseText);
          if (response.command) {
            // 去重：同一 requestId 不重复执行（MCP 侧 handlePoll 在命令未完成时会重复返回同一命令，
            // 无去重会导致非幂等操作（setCellValue/deleteSlide/insertColumns）重复执行）
            if (response.command.requestId && response.command.requestId === _lastRequestId) {
              // 上一轮已执行过，跳过（命令可能仍在执行中，等待结果 POST 完成）
              console.log('跳过重复命令: ' + response.command.requestId);
              scheduleNext();
            } else {
              _lastRequestId = response.command.requestId || '';
              // 先排下一轮轮询再执行命令，避免耗时命令（如大范围 getRangeData）同步阻塞轮询节奏
              scheduleNext();
              dispatchCommand(response.command);
            }
          } else {
            scheduleNext();
          }
        } catch (e) {
          console.error('解析响应失败:', e);
          _failCount++;
          _lastError = '解析失败: ' + e.message;
          scheduleNext();
        }
      } else {
        _failCount++;
        _lastError = 'HTTP ' + xhr.status;
        scheduleNext();
      }
    };

    xhr.onerror = function () {
      _failCount++;
      _lastError = '网络错误';
      console.error('轮询网络错误 (连续失败 ' + _failCount + ' 次)');
      scheduleNext();
    };

    xhr.ontimeout = function () {
      _failCount++;
      _lastError = '超时';
      console.error('轮询超时 (连续失败 ' + _failCount + ' 次)');
      scheduleNext();
    };

    xhr.send();
  } catch (e) {
    _failCount++;
    _lastError = e.message || String(e);
    console.error('轮询异常:', e);
    scheduleNext();
  }
}

// 退避调度：连续失败时指数退避（500ms -> 1s -> 2s -> 5s 封顶），成功时恢复 500ms
function scheduleNext() {
  // 暂停（_isPolling=false）时不再排下一轮，避免 in-flight XHR 回调重建 timer 导致恢复按钮失效
  if (!_isPolling) return;
  var delay = CONFIG.POLL_INTERVAL;
  if (_failCount > 0) {
    // 指数退避：500ms -> 1s -> 2s -> 4s -> 5s(封顶)
    var multiplier = Math.pow(2, Math.min(_failCount - 1, 4)); // 1,2,4,8,16
    delay = Math.min(_backoffBase * multiplier, _backoffMax);
  }
  _pollTimer = setTimeout(poll, delay);
}

function dispatchCommand(cmd) {
  console.log('执行命令:', cmd.action);

  var result;
  try {
    var handler = getHandler(cmd.action);
    if (handler) {
      result = handler(cmd.params || {});
    } else {
      result = { success: false, error: '未知操作: ' + cmd.action, data: null };
    }
  } catch (e) {
    console.error('执行命令异常:', cmd.action, e);
    result = { success: false, error: e.message || String(e), data: null };
  }

  sendResult(cmd.requestId, result);
}

function sendResult(requestId, result, attempt) {
  attempt = attempt || 1;
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', CONFIG.SERVER_URL + '/result', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 3000;
    // 失败重试（最多 3 次，500ms 退避），避免命令已执行但结果 POST 失败导致 MCP 侧空等超时
    // 3 次全部失败时打印明确错误（供排查：MCP 侧会 30s 超时，WPS 侧必须留痕），
    // 并清空 _lastRequestId：避免命令已执行但结果未送达时，去重状态残留导致边缘场景重复执行（第 21 轮终审 info）
    function failFinal(kind) {
      console.error(
        '发送结果失败（已重试 3 次）: ' +
          kind +
          ' requestId=' +
          requestId +
          ' action 结果将被 MCP 判超时'
      );
      if (_lastRequestId === requestId) {
        _lastRequestId = '';
      }
    }
    xhr.onload = function () {
      if (xhr.status !== 200) {
        if (attempt < 3) {
          console.warn('发送结果失败 HTTP ' + xhr.status + '，重试 ' + (attempt + 1));
          setTimeout(function () {
            sendResult(requestId, result, attempt + 1);
          }, 500 * attempt);
        } else {
          failFinal('HTTP ' + xhr.status);
        }
      }
    };
    xhr.onerror = function () {
      if (attempt < 3) {
        console.warn('发送结果网络错误，重试 ' + (attempt + 1));
        setTimeout(function () {
          sendResult(requestId, result, attempt + 1);
        }, 500 * attempt);
      } else {
        failFinal('网络错误');
      }
    };
    xhr.ontimeout = function () {
      if (attempt < 3) {
        console.warn('发送结果超时，重试 ' + (attempt + 1));
        setTimeout(function () {
          sendResult(requestId, result, attempt + 1);
        }, 500 * attempt);
      } else {
        failFinal('超时');
      }
    };
    xhr.send(JSON.stringify({ requestId: requestId, result: result }));
  } catch (e) {
    console.error('发送结果失败:', e);
  }
}
