// launcher.js - OpenCode 进程管理服务
var http = require('http');
var { spawn, exec } = require('child_process');
var path = require('path');
var fs = require('fs');

var PORT = 14097;
var opencodeProcess = null;
var opencodeCwd = '';
var dockedPid = 0;

function parseBody(req, callback) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
        console.log('[launcher] Raw body: ' + body);
        try { callback(JSON.parse(body)); }
        catch(e) { 
            console.log('[launcher] Parse error: ' + e.message);
            callback({}); 
        }
    });
}

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function startOpenCode(cwd, port) {
    console.log('[launcher] startOpenCode called with cwd: ' + cwd + ' port: ' + port);
    if (opencodeProcess) {
        return { success: false, error: 'already running' };
    }
    if (!cwd) {
        return { success: false, error: 'cwd is undefined' };
    }
    // 确保目录存在
    if (!fs.existsSync(cwd)) {
        try { fs.mkdirSync(cwd, { recursive: true }); } catch(e) {}
    }
    opencodeCwd = cwd;
    var opencodeBin = findOpenCodeBin();
    console.log('[launcher] Starting with: ' + opencodeBin);

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
            console.log('[launcher] Error: ' + err.message);
            opencodeProcess = null;
        });

        opencodeProcess.on('exit', function(code) {
            console.log('[launcher] Exited: ' + code);
            opencodeProcess = null;
        });

        console.log('[launcher] Started PID: ' + opencodeProcess.pid);
        return { success: true, pid: opencodeProcess.pid };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

function stopOpenCode() {
    if (opencodeProcess) {
        try { opencodeProcess.kill(); } catch(e) {}
        opencodeProcess = null;
    }
    exec('taskkill /IM opencode.exe /F', function() {});
    return { success: true };
}

function findOpenCodeBin() {
    var homeDir = process.env.USERPROFILE || process.env.HOME;
    var npmDir = path.join(homeDir, 'AppData', 'Roaming', 'npm');
    var paths = [
        path.join(npmDir, 'node_modules', 'opencode-ai', 'node_modules', 'opencode-windows-x64-baseline', 'bin', 'opencode.exe'),
        path.join(npmDir, 'node_modules', 'opencode-ai', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe'),
        path.join(npmDir, 'opencode.cmd'),
        path.join(npmDir, 'opencode')
    ];
    for (var i = 0; i < paths.length; i++) {
        if (fs.existsSync(paths[i])) {
            console.log('[launcher] Found: ' + paths[i]);
            return paths[i];
        }
    }
    return 'opencode.exe';
}

function dockWindow(callback, data) {
    var cwd = data && data.cwd ? data.cwd : ''
    var sessionId = data && data.session ? data.session : ''
    
    // 如果没有传cwd，使用launcher中存储的cwd
    if (!cwd && opencodeCwd) {
        cwd = opencodeCwd
    }
    
    console.log('[launcher] dockWindow final cwd: ' + cwd + ' session: ' + sessionId)

    var scriptPath = path.join(__dirname, 'dock.ps1');
    var edgeUrl = 'http://127.0.0.1:14096'

    // 直接使用传入的 cwd，不做任何转换
    if (cwd && cwd.length > 0) {
        edgeUrl += '?cwd=' + encodeURIComponent(cwd)
    }

    console.log('[launcher] Final URL: ' + edgeUrl)
    var script = [
        '# Open OpenCode Web',
        ' & "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --app=' + edgeUrl
    ].join('\n');
    fs.writeFileSync(scriptPath, script, 'utf8');
    exec('powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + scriptPath + '"', { timeout: 5000 }, function(err, stdout, stderr) {
        setTimeout(function() { try { fs.unlinkSync(scriptPath) } catch(e) {} }, 2000)
        callback({ success: true, pid: 0 })
    })
}

var server = http.createServer(function(req, res) {
    if (req.method === 'OPTIONS') {
        sendJSON(res, 200, {});
        return;
    }

    var url = req.url;

    if (req.method === 'POST' && url === '/start') {
        parseBody(req, function(body) {
            var result = startOpenCode(body.cwd, body.port);
            sendJSON(res, result.success ? 200 : 400, result);
        });
        return;
    }

    if (req.method === 'POST' && url === '/stop') {
        var result = stopOpenCode();
        sendJSON(res, 200, result);
        return;
    }

    if (req.method === 'GET' && url === '/status') {
        sendJSON(res, 200, {
            running: opencodeProcess !== null,
            cwd: opencodeCwd,
            pid: opencodeProcess ? opencodeProcess.pid : null
        });
        return;
    }

    if (req.method === 'POST' && url === '/dock') {
        parseBody(req, function(body) {
            fs.writeFileSync(path.join(__dirname, 'dock-debug.log'), JSON.stringify(body), 'utf8')
            dockWindow(function(result) {
                sendJSON(res, result.success ? 200 : 400, result);
            }, body);
        });
        return;
    }

    sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', function() {
    console.log('[launcher] Running on http://127.0.0.1:' + PORT);
});