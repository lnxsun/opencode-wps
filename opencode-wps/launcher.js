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

    var opencodeCmd = opencodeBin.endsWith('.ps1') 
        ? ['-ExecutionPolicy', 'Bypass', '-File', opencodeBin]
        : [opencodeBin];
    var opencodeArgs = opencodeBin.endsWith('.ps1')
        ? ['serve', '--port', String(port || 14096), '--hostname', '127.0.0.1', '--cors', 'file://']
        : ['serve', '--port', String(port || 14096), '--hostname', '127.0.0.1', '--cors', 'file://'];
    
    try {
        opencodeProcess = spawn(
            opencodeBin.endsWith('.ps1') ? 'powershell.exe' : opencodeBin,
            opencodeBin.endsWith('.ps1') 
                ? ['-ExecutionPolicy', 'Bypass', '-File', opencodeBin, ...opencodeArgs]
                : opencodeArgs,
            {
                cwd: cwd,
                stdio: 'ignore',
                detached: false,
                windowsHide: true,
                shell: true
            }
        );

        opencodeProcess.on('error', function(err) {
            console.log('[launcher] Error: ' + err.message);
            opencodeProcess = null;
        });

        opencodeProcess.on('exit', function(code) {
            console.log('[launcher] Exited: ' + code);
            opencodeProcess = null;
            // 清理 PID 文件
            var pidFile = path.join(__dirname, 'opencode.pid');
            try { fs.unlinkSync(pidFile); } catch (e) {}
        });

        console.log('[launcher] Started PID: ' + opencodeProcess.pid);

        // 保存 PID 到文件
        var pidFile = path.join(__dirname, 'opencode.pid');
        try {
            fs.writeFileSync(pidFile, String(opencodeProcess.pid));
        } catch (e) {
            console.log('[launcher] Failed to write PID file: ' + e.message);
        }

        return { success: true, pid: opencodeProcess.pid };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

function stopOpenCode() {
    console.log('[launcher] stopOpenCode called');
    
    // 先尝试结束 node 跟踪的子进程
    if (opencodeProcess) {
        try {
            opencodeProcess.kill();
        } catch(e) {
            console.error('[launcher] 终止子进程失败: ' + e.message);
        }
        opencodeProcess = null;
    }

    // 使用 PowerShell 执行 taskkill（更可靠）
    try {
        var execSync = require('child_process').execSync;
        // PowerShell 版本
        execSync('powershell -Command "Stop-Process -Name opencode -Force -ErrorAction SilentlyContinue"', { 
            stdio: 'ignore',
            timeout: 5000
        });
        console.log('[launcher] taskkill via PowerShell success');
    } catch(e) {
        console.log('[launcher] taskkill failed: ' + e.message);
    }
    
    // 清理 PID 文件
    var pidFile = path.join(__dirname, 'opencode.pid');
    try {
        if (fs.existsSync(pidFile)) {
            fs.unlinkSync(pidFile);
        }
    } catch(e) {}

    return { success: true };
}

function loadOpenCodeConfig() {
    var configPath = path.join(process.env.APPDATA || process.env.USERPROFILE, 'opencode', 'config.json');
    var defaultConfig = { opencodePath: 'opencode' };

    if (!fs.existsSync(configPath)) {
        console.log('[launcher] 配置文件不存在，使用默认值（请运行 install-addons.js）');
        return defaultConfig;
    }

    try {
        var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config && typeof config === 'object') {
            return config;
        }
    } catch (e) {
        console.error('[launcher] 配置文件解析失败，使用默认值: ' + e.message);
    }

    return defaultConfig;
}

function findOpenCodeBin() {
    // 1. 从配置读取（有防御性检查）
    var config = loadOpenCodeConfig();
    if (config.opencodePath) {
        if (config.opencodePath === 'opencode' || fs.existsSync(config.opencodePath)) {
            console.log('[launcher] Using config path: ' + config.opencodePath);
            return config.opencodePath;
        }
    }

    // 2. 尝试常见安装路径
    var commonPaths = [
        path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', '.trae-cn', 'bin', 'opencode.exe'),
        path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Administrator\\AppData\\Local', 'Programs', 'opencode', 'opencode.exe'),
        'C:\\Program Files\\opencode\\opencode.exe',
        'C:\\Program Files (x86)\\opencode\\opencode.exe'
    ];
    for (var i = 0; i < commonPaths.length; i++) {
        if (fs.existsSync(commonPaths[i])) {
            console.log('[launcher] Found: ' + commonPaths[i]);
            return commonPaths[i];
        }
    }

    // 3. 回退到 PATH 中的 opencode
    console.log('[launcher] ⚠️ 未找到 OpenCode，将从 PATH 查找');
    console.log('[launcher] 提示: 请确保 opencode 已安装或运行 install-addons.js');
    return 'opencode';
}

function validateCwd(cwd) {
    if (!cwd || typeof cwd !== 'string') {
        return { valid: false, error: 'cwd 不能为空' };
    }
    // 防止路径遍历
    if (cwd.includes('..')) {
        return { valid: false, error: '无效的工作目录：不允许路径遍历' };
    }
    // 检查非法字符
    if (/[<>"|?*]/.test(cwd)) {
        return { valid: false, error: '无效的工作目录：包含非法字符' };
    }
    // 规范化路径
    var resolved = path.resolve(cwd);
    return { valid: true, resolved: resolved };
}

function dockWindow(callback, data) {
    var cwd = data && data.cwd ? data.cwd : ''
    var sessionId = data && data.session ? data.session : ''

    // 如果没有传cwd，使用launcher中存储的cwd
    if (!cwd && opencodeCwd) {
        cwd = opencodeCwd
    }

    // 验证 cwd
    if (cwd) {
        var validation = validateCwd(cwd);
        if (!validation.valid) {
            console.log('[launcher] Cwd validation failed: ' + validation.error);
            callback({ success: false, error: validation.error });
            return;
        }
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