// ========================================
// WPS 加载项 - OpenCode 集成
// ========================================

var OPENCODE_PORT = 14096
var OPENCODE_HOST = '127.0.0.1'
var OPENCODE_API_BASE = 'http://' + OPENCODE_HOST + ':' + OPENCODE_PORT
var LAUNCHER_API = 'http://' + OPENCODE_HOST + ':14097'

var OPENCODE_STATE = 'stopped'
var OPENCODE_ERROR = ''

var WPS_Enum = {
    msoCTPDockPositionLeft: 0,
    msoCTPDockPositionRight: 2
}

// --- 全局状态封装 ---
var AppState = {
    port: 14096,
    host: '127.0.0.1',
    apiBase: 'http://127.0.0.1:14096',
    launcherApi: 'http://127.0.0.1:14097',
    state: 'stopped',
    error: '',

    getApiBase: function() {
        return 'http://' + this.host + ':' + this.port;
    },

    getLauncherApi: function() {
        return this.launcherApi;
    },

    setState: function(state, error) {
        this.state = state;
        this.error = error || '';
        // 同步到全局变量（兼容旧代码）
        OPENCODE_STATE = state;
        OPENCODE_ERROR = error || '';
        OPENCODE_API_BASE = this.getApiBase();
    }
};

// --- WPS 就绪检查 ---
function checkWpsReady() {
    try {
        if (!window.WPS || !window.WPS.Application) {
            console.error('[WPS] WPS 未就绪');
            return false;
        }
        return true;
    } catch (e) {
        console.error('[WPS] 检查失败: ' + e.message);
        return false;
    }
}

function checkDocument() {
    try {
        var doc = window.WPS && window.WPS.Application && window.WPS.Application.ActiveDocument;
        if (!doc) {
            console.warn('[WPS] 请先打开文档');
            return null;
        }
        return doc;
    } catch (e) {
        console.error('[WPS] 文档检查失败: ' + e.message);
        return null;
    }
}

function GetUrlPath() {
    var e = document.location.toString()
    return -1 != (e = decodeURI(e)).indexOf("/") && (e = e.substring(0, e.lastIndexOf("/"))), e
}

function setOpenCodeState(state, error) {
    OPENCODE_STATE = state
    OPENCODE_ERROR = error || ''
    try {
        window.Application.PluginStorage.setItem('opencode_state', state)
        window.Application.PluginStorage.setItem('opencode_error', error || '')
        window.Application.PluginStorage.setItem('opencode_api_base', OPENCODE_API_BASE)
    } catch (e) {}
    console.log('[OpenCode] State: ' + state + (error ? ' Error: ' + error : ''))
}

function startOpenCodeServer(cwd) {
    if (!cwd) return
    try { window.Application.PluginStorage.setItem('opencode_cwd', cwd) } catch (e) {}
    var data = JSON.stringify({ cwd: cwd })
    console.log('[OpenCode] Sending: ' + data)
    var xhr = new XMLHttpRequest()
    xhr.timeout = 10000
    xhr.open('POST', LAUNCHER_API + '/start', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            console.log('[OpenCode] Launcher response: ' + xhr.status + ' ' + xhr.responseText)
        }
    }
    xhr.onerror = function() { console.log('[OpenCode] Cannot reach launcher') }
    try { xhr.send(data) } catch (e) { console.log('[OpenCode] Send error: ' + e.message) }
}

function stopOpenCodeServer() {
    var xhr = new XMLHttpRequest()
    xhr.timeout = 5000
    xhr.open('POST', LAUNCHER_API + '/stop', true)
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) console.log('[OpenCode] Stop: ' + xhr.status)
    }
    xhr.onerror = function() {}
    try { xhr.send() } catch (e) {}
    setOpenCodeState('stopped')
}

function checkServerHealth(callback) {
    var xhr = new XMLHttpRequest()
    xhr.timeout = 3000
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) callback(xhr.status === 200)
    }
    xhr.onerror = function() { callback(false) }
    xhr.ontimeout = function() { callback(false) }
    try { xhr.open('GET', OPENCODE_API_BASE + '/global/health', true); xhr.send() } catch (e) { callback(false) }
}

function connectOpenCode() {
    if (OPENCODE_STATE === 'running') return
    setOpenCodeState('connecting')
    checkServerHealth(function(isRunning) {
        setOpenCodeState(isRunning ? 'running' : 'stopped')
    })
}

function OnAddinLoad(ribbonUI) {
    if (typeof window.Application.ribbonUI != "object") window.Application.ribbonUI = ribbonUI
    if (typeof window.Application.Enum != "object") window.Application.Enum = WPS_Enum
    connectOpenCode()
    return true
}

function OnAction(control) {
    var eleId = control.Id
    switch (eleId) {
        case "btnShowTaskPane":
            var tsId = window.Application.PluginStorage.getItem("taskpane_id")
            if (!tsId) {
                var tskpane = window.Application.CreateTaskPane(GetUrlPath() + "/taskpane.html")
                window.Application.PluginStorage.setItem("taskpane_id", tskpane.ID)
                tskpane.Visible = true
            } else {
                window.Application.GetTaskPane(tsId).Visible = !window.Application.GetTaskPane(tsId).Visible
            }
            break
        case "btnDockWindow":
            dockOpenCodeWindow()
            break
        case "btnCheckStatus":
            checkStatus()
            break
    }
    return true
}

function GetImage(control) {
    if (!control || !control.id) return ''
    if (control.id === 'btnShowTaskPane') return 'btn-panel.png'
    if (control.id === 'btnDockWindow') return 'btn-dock.png'
    if (control.id === 'btnCheckStatus') return 'btn-status.png'
    return ''
}

function GetImageSize(control) {
    if (!control || !control.id) return 16
    if (control.id === 'btnShowTaskPane') return 32
    return 16
}

function OnGetEnabled(control) { return true }
function OnGetVisible(control) { return true }
function OnGetLabel(control) { return "" }

function checkStatus() {
    var cwd = ''
    try { cwd = window.Application.PluginStorage.getItem('opencode_cwd') || '' } catch (e) {}
    var statusText = '=== OpenCode 状态 ===\n\n'
    statusText += '状态: ' + OPENCODE_STATE + '\n'
    statusText += '地址: ' + OPENCODE_API_BASE + '\n'
    if (cwd) statusText += '工作目录: ' + cwd + '\n'
    if (OPENCODE_ERROR) statusText += '错误: ' + OPENCODE_ERROR + '\n'
    if (OPENCODE_STATE !== 'running') statusText += '\n提示: 请在插件面板中启动 OpenCode 服务\n'

    try {
        if (typeof window.Application !== 'undefined') {
            statusText += '\n=== WPS 信息 ===\n'
            statusText += '应用: ' + (window.Application.Name || 'WPS Office') + '\n'
            if (window.Application.ActiveWorkbook) statusText += '文档: ' + window.Application.ActiveWorkbook.Name + ' (Excel)\n'
            else if (window.Application.ActiveDocument) statusText += '文档: ' + window.Application.ActiveDocument.Name + ' (Word)\n'
            else if (window.Application.ActivePresentation) statusText += '文档: ' + window.Application.ActivePresentation.Name + ' (PPT)\n'
        }
    } catch (e) { statusText += '\nWPS 信息获取失败: ' + e.message }
    alert(statusText)
}

function dockOpenCodeWindow() {
    var cwd = ''
    var sessionId = ''
    try { cwd = window.Application.PluginStorage.getItem('opencode_cwd') || '' } catch(e) {}
    try { sessionId = window.Application.PluginStorage.getItem('opencode_session_id') || '' } catch(e) {}
    if (!cwd) {
        try { cwd = window.Application.PluginStorage.getItem('opencode_start_cwd') || '' } catch(e) {}
    }
    console.log('[OpenCode] dockOpenCodeWindow cwd: ' + cwd + ' session: ' + sessionId)

    var normalized = cwd.replace(/\\\\/g, '\\')
    var xhr = new XMLHttpRequest()
    xhr.open('POST', LAUNCHER_API + '/dock', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            console.log('[OpenCode] Dock response: ' + xhr.status + ' ' + xhr.responseText)
        }
    }
    xhr.onerror = function() { console.log('[OpenCode] Dock error') }
    xhr.send(JSON.stringify({ cwd: normalized, session: sessionId }))
}

setInterval(function () {
    try {
        var cmd = window.Application.PluginStorage.getItem('opencode_command')
        if (cmd) {
            window.Application.PluginStorage.setItem('opencode_command', '')
            if (cmd === 'connect') connectOpenCode()
            else if (cmd.indexOf('start:') === 0) startOpenCodeServer(cmd.substring(6))
            else if (cmd === 'stop') stopOpenCodeServer()
        }
    } catch (e) {}
}, 500)