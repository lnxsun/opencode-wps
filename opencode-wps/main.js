// ========================================
// WPS 加载项 - OpenCode 集成
// ========================================

var OPENCODE_PORT = 14096
var OPENCODE_HOST = '127.0.0.1'
var OPENCODE_API_BASE = 'http://' + OPENCODE_HOST + ':' + OPENCODE_PORT
var LAUNCHER_API = 'http://' + OPENCODE_HOST + ':14097'

var OPENCODE_STATE = 'stopped'
var OPENCODE_ERROR = ''
var isProcessingCommand = false;

var WPS_Enum = {
    msoCTPDockPositionLeft: 0,
    msoCTPDockPositionRight: 2,
    msoFileDialogFolderPicker: 4,
    msoFileDialogOpen: 1
}

// --- WPS 就绪检查 ---
/**
 * 检查 WPS Application 是否就绪
 * @returns {boolean} true 表示 WPS 可用
 */
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

/**
 * 获取当前活动文档（支持文字/表格/演示）
 * @returns {object|null} 活动文档对象，无文档时返回 null
 */
function checkDocument() {
    try {
        var app = window.WPS && window.WPS.Application;
        if (!app) {
            // 某些 WPS 版本中窗口回调只能通过 window.Application 访问
            app = window.Application;
            if (!app) return null;
        }
        // WPS 文字 / 表格 / 演示使用不同的 Active 属性
        var doc = app.ActiveDocument || app.ActiveWorkbook || app.ActivePresentation;
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

/**
 * 获取插件安装路径
 * @returns {string} 归一化的路径（正斜杠）
 */
function GetUrlPath() {
    var pluginPath = '___WPS_ADDON_PATH___';
    return pluginPath.replace(/\\/g, '/');
}

var lastDocInfo = '';

/**
 * 将当前文档信息推送到 launcher 缓存
 * 每 500ms 轮询调用，文档未变化时自动跳过
 */
function sendDocInfo() {
    try {
        var app = window.WPS && window.WPS.Application;
        if (!app) app = window.Application;
        if (!app) return;
        var doc = app.ActiveDocument || app.ActiveWorkbook || app.ActivePresentation;
        if (!doc) {
            // 无文档打开时清除缓存，避免 MCP fallback 返回过期数据
            if (lastDocInfo !== '') {
                lastDocInfo = '';
                var clearXhr = new XMLHttpRequest();
                clearXhr.open('POST', LAUNCHER_API + '/docinfo', true);
                clearXhr.setRequestHeader('Content-Type', 'application/json');
                clearXhr.send(JSON.stringify({ closed: true }));
            }
            return;
        }
        var info = {
            name: doc.Name,
            path: doc.FullName,
            type: app.ActiveDocument ? 'word' : app.ActiveWorkbook ? 'excel' : 'ppt'
        };
        if (app.ActiveDocument) {
            try { info.paragraphCount = doc.Paragraphs.Count; } catch(e) {}
            try { info.wordCount = doc.Words.Count; } catch(e) {}
        }
        var key = JSON.stringify(info);
        if (key === lastDocInfo) return;
        lastDocInfo = key;
        var xhr = new XMLHttpRequest();
        xhr.timeout = 3000;
        xhr.open('POST', LAUNCHER_API + '/docinfo', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(key);
    } catch(e) {
        console.warn('[OpenCode] sendDocInfo failed: ' + e.message);
    }
}

/**
 * 设置 OpenCode 运行状态
 * @param {string} state - 状态值：stopped / running / error
 * @param {string} [error] - 错误描述
 */
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

/**
 * 启动 OpenCode 服务进程
 * @param {string} cwd - 工作目录
 */
function startOpenCodeServer(cwd) {
    if (!cwd) { isProcessingCommand = false; return; }
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
            isProcessingCommand = false;
        }
    }
    xhr.onerror = function() { console.log('[OpenCode] Cannot reach launcher'); isProcessingCommand = false; }
    xhr.ontimeout = function() { console.log('[OpenCode] Launcher timeout'); isProcessingCommand = false; }
    try { xhr.send(data) } catch (e) { console.log('[OpenCode] Send error: ' + e.message); isProcessingCommand = false; }
}

/**
 * 停止 OpenCode 服务进程
 */
function stopOpenCodeServer() {
    var xhr = new XMLHttpRequest()
    xhr.timeout = 5000
    xhr.open('POST', LAUNCHER_API + '/stop', true)
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) { console.log('[OpenCode] Stop: ' + xhr.status); isProcessingCommand = false; }
    }
    xhr.onerror = function() { isProcessingCommand = false; }
    xhr.ontimeout = function() { isProcessingCommand = false; }
    try { xhr.send() } catch (e) { isProcessingCommand = false; }
    setOpenCodeState('stopped')
}

/**
 * 检查 OpenCode 服务健康状况
 */
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

/**
 * 连接 OpenCode Chat API
 * @param {string} cwd - 工作目录
 * @param {string} sessionId - 会话标识
 */
function connectOpenCode() {
    if (OPENCODE_STATE === 'running') { isProcessingCommand = false; return; }
    setOpenCodeState('connecting')
    checkServerHealth(function(isRunning) {
        setOpenCodeState(isRunning ? 'running' : 'stopped')
        isProcessingCommand = false;
    })
}

function OnAddinLoad(ribbonUI) {
    if (typeof window.Application.ribbonUI != "object") window.Application.ribbonUI = ribbonUI
    if (typeof window.Application.Enum != "object") window.Application.Enum = WPS_Enum
    connectOpenCode()
    return true
}

function getControlId(control) {
    // WPS 不同版本/回调中 Id 属性大小写不一致（control.Id vs control.id）
    return control.Id || control.id;
}

function OnAction(control) {
    var eleId = getControlId(control)
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
    if (!control) return ''
    var id = getControlId(control);
    if (!id) return '';
    if (id === 'btnShowTaskPane') return 'btn-panel.png'
    if (id === 'btnDockWindow') return 'btn-dock.png'
    if (id === 'btnCheckStatus') return 'btn-status.png'
    return ''
}

function GetImageSize(control) {
    if (!control) return 16
    var id = getControlId(control);
    if (!id) return 16;
    if (id === 'btnShowTaskPane') return 32
    return 16
}

function OnGetEnabled(control) {
    if (!control) return true;
    // 任务窗格和Web面板按钮始终可用；连接状态按钮需文档已打开
    var id = getControlId(control);
    if (id === 'btnShowTaskPane' || id === 'btnDockWindow') return true;
    if (id === 'btnCheckStatus') return checkDocument() !== null;
    console.warn('[WPS] Unknown ribbon button: ' + (id || '(no id)') + ', disabled by default');
    return false; // 未知按钮默认禁用（新增按钮需显式添加 case）
}

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

/**
 * 打开/停靠任务窗格
 * @param {string} [sessionId] - 会话标识
 */
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
    sendDocInfo()
}

var lastCmdTime = 0;

setInterval(function () {
    if (isProcessingCommand) return;
    sendDocInfo()
    try {
        var raw = window.Application.PluginStorage.getItem('opencode_command')
        if (raw) {
            var cmd = raw, ts = 0;
            // 尝试解析 JSON 格式 { cmd: string, ts: number }
            if (raw.indexOf('{') === 0) {
                try {
                    var parsed = JSON.parse(raw);
                    if (parsed.ts) { ts = parsed.ts; cmd = parsed.cmd; }
                } catch(e) {}
            }
            if (ts && ts <= lastCmdTime) {
                window.Application.PluginStorage.setItem('opencode_command', '')
                return;
            }
            if (ts) lastCmdTime = ts;
            isProcessingCommand = true;
            window.Application.PluginStorage.setItem('opencode_command', '')
            if (cmd === 'connect') { connectOpenCode(); }
            else if (cmd.indexOf('start:') === 0) { startOpenCodeServer(cmd.substring(6)); }
            else if (cmd === 'stop') { stopOpenCodeServer(); }
            else { isProcessingCommand = false; }
        }
    } catch (e) { isProcessingCommand = false; }
}, 500)