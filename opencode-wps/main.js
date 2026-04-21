// ========================================
// WPS 加载项 - OpenCode 集成
// 自定义 Chat UI (REST API + SSE) + 上下文注入
// 注意: opencode 需要单独启动，本插件不负责启动进程
// ========================================

// ===== 全局配置 =====
var OPENCODE_PORT = 14096
var OPENCODE_HOST = '127.0.0.1'
var OPENCODE_CWD = 'D:\\code\\office-test'
var OPENCODE_API_BASE = 'http://' + OPENCODE_HOST + ':' + OPENCODE_PORT

// 运行时状态
var OPENCODE_STATE = 'stopped' // stopped | connecting | running | error
var OPENCODE_ERROR = ''
var OPENCODE_SESSION_ID = ''

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
        window.Application.PluginStorage.setItem('opencode_cwd', OPENCODE_CWD)
        window.Application.PluginStorage.setItem('opencode_session_id', OPENCODE_SESSION_ID)
    } catch (e) {}
    console.log('[OpenCode] State: ' + state + (error ? ' Error: ' + error : ''))
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
            onServerReady()
        } else {
            setOpenCodeState('stopped')
        }
    })
}

function onServerReady() {
    createSession(function (sessionId) {
        if (sessionId) {
            OPENCODE_SESSION_ID = sessionId
        }
        setOpenCodeState('running')
    })
}

// ===== Session 管理 =====

function apiRequest(method, path, body, callback) {
    var xhr = new XMLHttpRequest()
    xhr.timeout = 5000
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var resp = JSON.parse(xhr.responseText)
                    callback(resp)
                } catch (e) {
                    callback(null)
                }
            } else {
                callback(null)
            }
        }
    }
    xhr.onerror = function () { callback(null) }
    xhr.ontimeout = function () { callback(null) }
    try {
        xhr.open(method, OPENCODE_API_BASE + path, true)
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.setRequestHeader('x-opencode-directory', OPENCODE_CWD)
        if (body) {
            xhr.send(JSON.stringify(body))
        } else {
            xhr.send()
        }
    } catch (e) {
        callback(null)
    }
}

function unwrapResponse(resp) {
    if (!resp) return null
    if (resp.data) return resp.data
    if (resp.message) return resp.message
    return resp
}

function createSession(callback) {
    apiRequest('POST', '/session', { title: 'WPS Office' }, function (resp) {
        var data = unwrapResponse(resp)
        if (data && data.id) {
            console.log('[OpenCode] Session created: ' + data.id)
            callback(data.id)
        } else {
            console.log('[OpenCode] Session creation failed')
            callback(null)
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
    // 加载时自动检测 opencode 是否已运行
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
    var statusText = '=== OpenCode 状态 ===\n\n'
    statusText += '状态: ' + OPENCODE_STATE + '\n'
    statusText += '地址: ' + OPENCODE_API_BASE + '\n'
    if (OPENCODE_ERROR) statusText += '错误: ' + OPENCODE_ERROR + '\n'

    if (OPENCODE_STATE !== 'running') {
        statusText += '\n提示: 请确保 opencode 已启动\n'
        statusText += '命令: opencode serve --port ' + OPENCODE_PORT + '\n'
    }

    try {
        if (typeof window.Application !== 'undefined') {
            statusText += '\n=== WPS 信息 ===\n'
            statusText += '应用: ' + (window.Application.Name || 'WPS Office') + '\n'
            if (window.Application.ActiveWorkbook) {
                statusText += '当前文档: ' + window.Application.ActiveWorkbook.Name + ' (Excel)\n'
                statusText += '工作表数: ' + window.Application.ActiveWorkbook.Sheets.Count + '\n'
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
setInterval(function () {
    try {
        var cmd = window.Application.PluginStorage.getItem('opencode_command')
        if (cmd) {
            window.Application.PluginStorage.setItem('opencode_command', '')
            switch (cmd) {
                case 'connect':
                    connectOpenCode()
                    break
            }
        }
    } catch (e) {}
}, 500)
