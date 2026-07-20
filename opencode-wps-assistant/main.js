/**
 * OpenCode AI - Mac WPS 桥接加载项主入口
 * 架构：MCP Server (HTTP 服务端:58891) ← 轮询 ← WPS 加载项 (HTTP 客户端)
 *
 * 加载项在 WPS Chromium 沙箱内运行，无法启动 HTTP 服务端，
 * 因此采用反向轮询模式：每 500ms 向 MCP Server 拉取命令，
 * 执行后通过 POST /result 返回结果。
 */

var CONFIG = {
    SERVER_URL: 'http://127.0.0.1:58891',
    POLL_INTERVAL: 500,
    POLL_TIMEOUT: 5000
};

var _ribbonUI = null;
var _pollTimer = null;
var _isPolling = false;
var _isPaused = false;

function OnAddinLoad(ribbonUI) {
    _ribbonUI = ribbonUI;
    console.log('=== OpenCode AI 桥接加载项 (Mac) ===');
    console.log('服务器: ' + CONFIG.SERVER_URL);
    startPolling();
    return true;
}

function OnStatusClick() {
    var info = 'OpenCode AI WPS 桥接\n';
    info += '状态: ' + (_isPolling ? '轮询中' : '已停止') + '\n';
    info += '间隔: ' + CONFIG.POLL_INTERVAL + 'ms\n';
    info += '服务器: ' + CONFIG.SERVER_URL + '\n';
    info += '已注册动作: ' + Object.keys(HANDLERS).length + ' 个';
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
    try { _ribbonUI.Invalidate(); } catch (e) {}
    return true;
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

        xhr.onload = function() {
            if (xhr.status === 200) {
                try {
                    var response = JSON.parse(xhr.responseText);
                    if (response.command) {
                        dispatchCommand(response.command);
                    }
                } catch (e) {
                    console.error('解析响应失败:', e);
                }
            }
            scheduleNext();
        };

        xhr.onerror = function() {
            scheduleNext();
        };

        xhr.ontimeout = function() {
            scheduleNext();
        };

        xhr.send();
    } catch (e) {
        console.error('轮询异常:', e);
        scheduleNext();
    }
}

function scheduleNext() {
    _pollTimer = setTimeout(poll, CONFIG.POLL_INTERVAL);
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

function sendResult(requestId, result) {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', CONFIG.SERVER_URL + '/result', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 3000;
        xhr.send(JSON.stringify({ requestId: requestId, result: result }));
    } catch (e) {
        console.error('发送结果失败:', e);
    }
}
