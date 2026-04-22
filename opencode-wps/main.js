// ========================================
// WPS 加载项 - OpenCode 集成
// 自定义 Chat UI (REST API + SSE) + 上下文注入
// CWD 由用户在 taskpane 中指定，通过 launcher.js 管理进程
// ========================================

// ===== 全局配置 =====
var OPENCODE_PORT = 14096
var OPENCODE_HOST = '127.0.0.1'
var OPENCODE_API_BASE = 'http://' + OPENCODE_HOST + ':' + OPENCODE_PORT
var LAUNCHER_API = 'http://' + OPENCODE_HOST + ':14097'

// 运行时状态
var OPENCODE_STATE = 'stopped' // stopped | connecting | running | error
var OPENCODE_ERROR = ''

// ===== 工具函数 =====
var WPS_Enum = {
    msoCTPDockPositionLeft: 0,
    msoCTPDockPositionRight: 2
}

function GetUrlPath() {
    var e = document.location.toString()
    return -1 != (e = decodeURI(e)).indexOf("/") && (e = e.substring(0, e.lastIndexOf("/"))), e
}

// ===== 状态管理 =====
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

// ===== 通过 launcher.js 管理进程 =====

function startOpenCodeServer(cwd) {
    if (!cwd) {
        console.log('[OpenCode] No CWD specified for start')
        return
    }
    // 保存 CWD
    try { window.Application.PluginStorage.setItem('opencode_cwd', cwd) } catch (e) {}

    console.log('[OpenCode] Requesting launcher to start with CWD: ' + cwd)

    var xhr = new XMLHttpRequest()
    xhr.timeout = 10000
    xhr.open('POST', LAUNCHER_API + '/start', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                console.log('[OpenCode] Launcher accepted start request')
            } else {
                console.log('[OpenCode] Launcher start failed: ' + xhr.status + ' ' + xhr.responseText)
            }
        }
    }
    xhr.onerror = function() { console.log('[OpenCode] Cannot reach launcher at ' + LAUNCHER_API) }
    xhr.ontimeout = function() { console.log('[OpenCode] Launcher request timeout') }
    try {
        xhr.send(JSON.stringify({ cwd: cwd, port: OPENCODE_PORT }))
    } catch (e) {
        console.log('[OpenCode] Failed to call launcher: ' + e.message)
    }
}

function stopOpenCodeServer() {
    console.log('[OpenCode] Requesting launcher to stop')

    var xhr = new XMLHttpRequest()
    xhr.timeout = 5000
    xhr.open('POST', LAUNCHER_API + '/stop', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            console.log('[OpenCode] Launcher stop response: ' + xhr.status)
        }
    }
    xhr.onerror = function() { console.log('[OpenCode] Cannot reach launcher for stop') }
    try {
        xhr.send()
    } catch (e) {}
    setOpenCodeState('stopped')
}

// ===== 服务器检测 =====

function checkServerHealth(callback) {
    var xhr = new XMLHttpRequest()
    xhr.timeout = 3000
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            callback(xhr.status === 200)
        }
    }
    xhr.onerror = function () { callback(false) }
    xhr.ontimeout = function () { callback(false) }
    try {
        xhr.open('GET', OPENCODE_API_BASE + '/global/health', true)
        xhr.send()
    } catch (e) {
        callback(false)
    }
}

// 连接已运行的 opencode 服务
function connectOpenCode() {
    if (OPENCODE_STATE === 'running') return

    setOpenCodeState('connecting')

    checkServerHealth(function (isRunning) {
        if (isRunning) {
            setOpenCodeState('running')
        } else {
            setOpenCodeState('stopped')
        }
    })
}

// ===== Ribbon 回调 =====

function OnAddinLoad(ribbonUI) {
    if (typeof (window.Application.ribbonUI) != "object") {
        window.Application.ribbonUI = ribbonUI
    }
    if (typeof (window.Application.Enum) != "object") {
        window.Application.Enum = WPS_Enum
    }
    // 加载时检测 opencode 是否已在运行
    connectOpenCode()
    return true
}

function OnAction(control) {
    var eleId = control.Id
    switch (eleId) {
        case "btnShowTaskPane":
            {
                var tsId = window.Application.PluginStorage.getItem("taskpane_id")
                if (!tsId) {
                    var tskpane = window.Application.CreateTaskPane(GetUrlPath() + "/taskpane.html")
                    var id = tskpane.ID
                    window.Application.PluginStorage.setItem("taskpane_id", id)
                    tskpane.Visible = true
                } else {
                    var tskpane = window.Application.GetTaskPane(tsId)
                    tskpane.Visible = !tskpane.Visible
                }
            }
            break
        case "btnCheckStatus":
            {
                checkStatus()
            }
            break
        default:
            break
    }
    return true
}

function GetImage(control) {
    if (!control || !control.id) return ''
    if (control.id === 'btnShowTaskPane') return 'btn-panel.png'
    if (control.id === 'btnCheckStatus') return 'btn-status.png'
    return ''
}

function OnGetEnabled(control) {
    return true
}

function OnGetVisible(control) {
    return true
}

function OnGetLabel(control) {
    return ""
}

// ===== 状态检查 =====

function checkStatus() {
    var cwd = ''
    try { cwd = window.Application.PluginStorage.getItem('opencode_cwd') || '' } catch (e) {}
    var statusText = '=== OpenCode 状态 ===\n\n'
    statusText += '状态: ' + OPENCODE_STATE + '\n'
    statusText += '地址: ' + OPENCODE_API_BASE + '\n'
    if (cwd) statusText += '工作目录: ' + cwd + '\n'
    if (OPENCODE_ERROR) statusText += '错误: ' + OPENCODE_ERROR + '\n'

    if (OPENCODE_STATE !== 'running') {
        statusText += '\n提示: 请在插件面板中启动 OpenCode 服务\n'
    }

    try {
        if (typeof window.Application !== 'undefined') {
            statusText += '\n=== WPS 信息 ===\n'
            statusText += '应用: ' + (window.Application.Name || 'WPS Office') + '\n'
            if (window.Application.ActiveWorkbook) {
                statusText += '当前文档: ' + window.Application.ActiveWorkbook.Name + ' (Excel)\n'
            } else if (window.Application.ActiveDocument) {
                statusText += '当前文档: ' + window.Application.ActiveDocument.Name + ' (Word)\n'
            } else if (window.Application.ActivePresentation) {
                statusText += '当前文档: ' + window.Application.ActivePresentation.Name + ' (PPT)\n'
            }
        }
    } catch (e) {
        statusText += '\nWPS 信息获取失败: ' + e.message
    }
    alert(statusText)
}

// ===== 命令轮询 =====
// taskpane.html 通过 PluginStorage 发送命令，main.js 轮询执行
// 支持命令:
//   connect      - 连接已运行的服务
//   start:CWD    - 启动服务（指定工作目录，调用 launcher API）
//   stop         - 停止服务（调用 launcher API）
setInterval(function () {
    try {
        var cmd = window.Application.PluginStorage.getItem('opencode_command')
        if (cmd) {
            window.Application.PluginStorage.setItem('opencode_command', '')
            if (cmd === 'connect') {
                connectOpenCode()
            } else if (cmd.indexOf('start:') === 0) {
                var cwd = cmd.substring(6)
                startOpenCodeServer(cwd)
            } else if (cmd === 'stop') {
                stopOpenCodeServer()
            }
        }
    } catch (e) {}
}, 500)
