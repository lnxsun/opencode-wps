// launcher.js - OpenCode 进程管理服务
var http = require('http');
var { spawn, exec } = require('child_process');
var path = require('path');
var fs = require('fs');
var os = require('os');

var PORT = 14097;
var opencodeProcess = null;
var opencodeCwd = '';
var dockedPid = 0;
var stateLock = false;

// ===== 启动时清理孤儿 MCP 进程 =====
function cleanupOrphanedMcp() {
    try {
        var execSync = require('child_process').execSync;
        // 用 PowerShell Get-Process 按命令行路径查找，无 % 转义问题
        var psCmd = "Get-Process -Name node | Where-Object { $_.CommandLine -match 'wps-office-mcp\\\\dist\\\\index\\.js' } | ForEach-Object { $_.Id }";
        var out = execSync('powershell -NoProfile -Command "' + psCmd + '"', {
            encoding: 'utf8',
            timeout: 5000
        });
        var lines = out.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var pid = parseInt(lines[i].trim(), 10);
            if (pid > 0 && !isNaN(pid)) {
                try { execSync('taskkill /F /PID ' + pid + ' 2>nul', { shell: 'cmd.exe', stdio: 'ignore', timeout: 3000 }); } catch(e) {}
            }
        }
    } catch(e) { /* no orphaned processes */ }
}
cleanupOrphanedMcp();

/**
 * 解析 HTTP 请求体为 JSON
 * @param {object} req - HTTP Request 对象
 * @param {function} callback - 回调函数，接收解析后的对象
 */
function parseBody(req, callback) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
        try { callback(JSON.parse(body)); }
        catch(e) { 
            console.log('[launcher] Parse error: ' + e.message);
            callback({}); 
        }
    });
}

/**
 * 发送 JSON 格式的 HTTP 响应
 * @param {object} res - HTTP Response 对象
 * @param {number} statusCode - HTTP 状态码
 * @param {object} data - 响应数据
 */
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',  // launcher 仅绑定 127.0.0.1，无外部访问风险
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
    // 验证工作目录安全性
    var validation = validateCwd(cwd);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }
    cwd = validation.resolved;
    if (!fs.existsSync(cwd)) {
        try { fs.mkdirSync(cwd, { recursive: true }); } catch(e) {}
    }
    opencodeCwd = cwd;
    var opencodeBin = findOpenCodeBin();
    console.log('[launcher] Starting with: ' + opencodeBin);

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

function stopOpenCodeByPort(port) {
    port = port || 14096;
    console.log('[launcher] stopOpenCodeByPort called for port: ' + port);
    
    try {
        var execSync = require('child_process').execSync;
        
        // 查找占用指定端口的进程 PID
        var output = execSync('netstat -ano | findstr :' + port, { 
            shell: 'cmd.exe',
            encoding: 'utf8',
            timeout: 5000
        });
        
        var lines = output.split('\n');
        var killed = false;
        
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf('LISTENING') > 0 || line.indexOf('ESTABLISHED') > 0) {
                var parts = line.split(/\s+/);
                var localAddr = parts[1] || '';
                // 检查是否为指定端口
                var addrParts = localAddr.split(':');
                var listenPort = parseInt(addrParts[addrParts.length - 1], 10);
                
                if (listenPort === port) {
                    var pid = parseInt(parts[parts.length - 1], 10);
                    if (pid > 0) {
                        console.log('[launcher] Found process占用端口 ' + port + ', PID: ' + pid);
                        // 验证进程名，避免误杀
                        try {
                            var nameOut = execSync('wmic process where ProcessId=' + pid + ' get Name /format:csv', { encoding: 'utf8', timeout: 3000, shell: 'cmd.exe' });
                            var procName = (nameOut.split('\n')[1] || '').trim().toLowerCase();
                            if (procName !== 'node.exe' && procName !== 'opencode.exe' && procName !== '') {
                                console.log('[launcher] 跳过非 OpenCode 进程: ' + procName);
                                continue;
                            }
                        } catch(e) { /* wmic 可能失败，继续尝试 kill */ }
                        try {
                            execSync('taskkill /F /PID ' + pid + ' 2>nul', { 
                                shell: 'cmd.exe',
                                stdio: 'ignore',
                                timeout: 5000
                            });
                            console.log('[launcher] 已终止 PID: ' + pid);
                            killed = true;
                        } catch(e) {
                            console.log('[launcher] 终止 PID ' + pid + ' 失败: ' + e.message);
                        }
                    }
                }
            }
        }
        
        if (!killed) {
            console.log('[launcher] 未找到占用端口 ' + port + ' 的进程');
        }
        
    } catch(e) {
        console.log('[launcher] 按端口关闭失败: ' + e.message);
    }
    
    return { success: true };
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

    // 按端口关闭（14096 和 14097）- 精确杀，不全杀
    try {
        stopOpenCodeByPort(14096);
    } catch(e) {
        console.log('[launcher] 按端口关闭失败: ' + e.message);
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

/**
 * 查找可用的 opencode CLI 可执行文件
 * @returns {string|null} 找到的路径，未找到返回 null
 */
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
        path.join(process.env.USERPROFILE || os.homedir(), '.trae-cn', 'bin', 'opencode.exe'),
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'opencode', 'opencode.exe'),
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

/**
 * 校验工作目录路径合法性
 * 拒绝 UNC 路径、DOS 设备路径、路径穿越
 * @param {string} cwd - 待校验的目录路径
 * @returns {string} 校验通过后的绝对路径
 * @throws {Error} 路径不合法时抛出
 */
function validateCwd(cwd) {
    if (typeof cwd !== 'string' || !cwd) {
        return { valid: false, error: 'cwd 不能为空' };
    }
    // 拒绝 UNC 路径和 DOS 设备路径
    if (/^\\\\[?.]/.test(cwd) || /^\\\\/.test(cwd)) {
        throw new Error('UNC and DOS device paths are not allowed');
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

/**
 * 校验 URL 合法性（仅允许 localhost HTTP/HTTPS）
 * @param {string} url - 待校验的 URL
 * @returns {boolean} URL 合法返回 true
 */
function isValidUrl(url) {
    if (typeof url !== 'string') return false;
    try {
        var parsed = new URL(url);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
               (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
    } catch (e) { return false; }
}

/**
 * 打开 Edge 停靠窗口
 * @param {string} url - 停靠目标 URL
 */
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

    if (!isValidUrl(edgeUrl)) {
        console.error('[launcher] Invalid URL rejected:', edgeUrl);
        callback({ success: false, error: 'Invalid URL' });
        return;
    }
    console.log('[launcher] Final URL: ' + edgeUrl)
    var script = [
        '# Open OpenCode Web',
        '$edge = @(',
        '    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",',
        '    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",',
        '    (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" -ErrorAction SilentlyContinue)."(default)"',
        ') | Where-Object { Test-Path $_ } | Select-Object -First 1',
        'if (-not $edge) { $edge = "msedge.exe" }',
        '& "$edge" --app=' + edgeUrl
    ].join('\n');
    fs.writeFileSync(scriptPath, script, 'utf8');
    exec('powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + scriptPath + '"', { timeout: 5000 }, function(err, stdout, stderr) {
        setTimeout(function() { try { fs.unlinkSync(scriptPath) } catch(e) {} }, 2000)
        callback({ success: true, pid: 0 })
    })
}

// ===== 崩溃自动恢复 =====
process.on('uncaughtException', function(err) {
    console.error('[launcher] CRASH: ' + (err && err.message || err));
    try {
        var pidFile = path.join(__dirname, 'opencode.pid');
        try { fs.unlinkSync(pidFile); } catch(e) {}
    } catch(e) {}
    // 释放端口，让计划任务/VBS 自动重新拉起
    server.close();
    process.exit(1);
});
process.on('unhandledRejection', function(reason) {
    console.error('[launcher] Unhandled Rejection: ' + (reason && reason.message || reason));
});

var server = http.createServer(function(req, res) {
    if (req.method === 'OPTIONS') {
        sendJSON(res, 200, {});
        return;
    }

    var url = req.url;

    if (req.method === 'POST' && url === '/start') {
        if (stateLock) {
            sendJSON(res, 409, { error: 'Another start request is in progress' });
            return;
        }
        stateLock = true;
        parseBody(req, function(body) {
            try {
                var result = startOpenCode(body.cwd, body.port);
                sendJSON(res, result.success ? 200 : 400, result);
            } catch(e) {
                console.error('[launcher] startOpenCode failed:', e);
                sendJSON(res, 500, { error: 'Internal error: ' + e.message });
            } finally {
                stateLock = false;
            }
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

    if (req.method === 'GET' && url === '/health') {
        sendJSON(res, 200, { healthy: true, uptime: process.uptime() });
        return;
    }

    if (req.method === 'POST' && url === '/dock') {
        parseBody(req, function(body) {
            dockWindow(function(result) {
                sendJSON(res, result.success ? 200 : 400, result);
            }, body);
        });
        return;
    }

    if (req.method === 'POST' && url === '/docinfo') {
        parseBody(req, function(body) {
            var docInfoPath = path.join(__dirname, 'docinfo.cache.json');
            if (body && body.closed === true) {
                try { fs.unlinkSync(docInfoPath); } catch(e) { /* 文件不存在也视为清除成功 */ }
                sendJSON(res, 200, { success: true });
                return;
            }
            try {
                fs.writeFileSync(docInfoPath, JSON.stringify(body), 'utf8');
                sendJSON(res, 200, { success: true });
            } catch(e) {
                console.error('[launcher] Failed to write docinfo cache: ' + e.message);
                sendJSON(res, 500, { success: false, error: 'Write failed: ' + e.message });
            }
        });
        return;
    }

    if (req.method === 'GET' && url === '/docinfo') {
        var docInfoPath = path.join(__dirname, 'docinfo.cache.json');
        try {
            var data = fs.readFileSync(docInfoPath, 'utf8');
            sendJSON(res, 200, JSON.parse(data));
        } catch(e) {
            sendJSON(res, 404, { error: 'No document info available' });
        }
        return;
    }

    sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', function() {
    console.log('[launcher] Running on http://127.0.0.1:' + PORT);
});