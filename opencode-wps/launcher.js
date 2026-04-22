// launcher.js - OpenCode 进程管理服务
// 轻量 HTTP 服务器，运行在 14097 端口
// 提供 /start /stop /status API，由 WPS 插件通过 main.js 调用
// 必须先启动此服务，WPS 插件才能启动/停止 opencode serve

var http = require('http');
var { spawn, exec } = require('child_process');
var path = require('path');
var fs = require('fs');

var PORT = 14097;
var opencodeProcess = null;
var opencodeCwd = '';

// 解析请求 body
function parseBody(req, callback) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
        try { callback(JSON.parse(body)); }
        catch(e) { callback({}); }
    });
}

// 发送 JSON 响应
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// 启动 opencode serve
function startOpenCode(cwd, port) {
    if (opencodeProcess) {
        return { success: false, error: 'opencode already running' };
    }

    if (!cwd || !fs.existsSync(cwd)) {
        return { success: false, error: 'Invalid CWD: ' + cwd };
    }

    opencodeCwd = cwd;
    var opencodeBin = findOpenCodeBin();

    try {
        opencodeProcess = spawn(opencodeBin, [
            'serve',
            '--port', String(port || 14096),
            '--hostname', '127.0.0.1',
            '--cors', 'file://'
        ], {
            cwd: cwd,
            stdio: 'ignore',
            detached: false,
            windowsHide: true
        });

        opencodeProcess.on('error', function(err) {
            console.log('[launcher] Process error: ' + err.message);
            opencodeProcess = null;
        });

        opencodeProcess.on('exit', function(code) {
            console.log('[launcher] Process exited with code: ' + code);
            opencodeProcess = null;
        });

        console.log('[launcher] Started opencode serve (PID: ' + opencodeProcess.pid + ', CWD: ' + cwd + ')');
        return { success: true, pid: opencodeProcess.pid };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

// 停止 opencode serve
function stopOpenCode() {
    if (opencodeProcess) {
        try {
            opencodeProcess.kill();
            // Windows 上需要 taskkill 杀掉子进程树
            exec('taskkill /PID ' + opencodeProcess.pid + ' /T /F', function() {});
        } catch(e) {}
        opencodeProcess = null;
        console.log('[launcher] Stopped opencode serve');
        return { success: true };
    }
    // 备选：直接 taskkill
    exec('taskkill /IM opencode.exe /F', function() {});
    return { success: true };
}

// 查找 opencode 可执行文件
function findOpenCodeBin() {
    var homeDir = process.env.USERPROFILE || process.env.HOME;
    var npmGlobalDir = path.join(homeDir, 'AppData', 'Roaming', 'npm');
    var npmOpencodeExe = path.join(npmGlobalDir, 'node_modules', 'opencode-ai', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe');
    var npmOpencodeCmd = path.join(npmGlobalDir, 'opencode.cmd');

    if (fs.existsSync(npmOpencodeExe)) return npmOpencodeExe;
    if (fs.existsSync(npmOpencodeCmd)) return npmOpencodeCmd;
    return 'opencode.exe';
}

// HTTP 服务器
var server = http.createServer(function(req, res) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        sendJSON(res, 200, {});
        return;
    }

    var url = req.url;

    // POST /start - 启动 opencode serve
    if (req.method === 'POST' && url === '/start') {
        parseBody(req, function(body) {
            var result = startOpenCode(body.cwd, body.port);
            sendJSON(res, result.success ? 200 : 400, result);
        });
        return;
    }

    // POST /stop - 停止 opencode serve
    if (req.method === 'POST' && url === '/stop') {
        var result = stopOpenCode();
        sendJSON(res, 200, result);
        return;
    }

    // GET /status - 查询状态
    if (req.method === 'GET' && url === '/status') {
        sendJSON(res, 200, {
            running: opencodeProcess !== null,
            cwd: opencodeCwd,
            pid: opencodeProcess ? opencodeProcess.pid : null
        });
        return;
    }

    // 404
    sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', function() {
    console.log('[launcher] Process manager running on http://127.0.0.1:' + PORT);
    console.log('[launcher] Ready to start/stop opencode serve');
});
