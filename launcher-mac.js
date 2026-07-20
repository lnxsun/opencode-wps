#!/usr/bin/env node
/**
 * launcher-mac.js - OpenCode 进程管理服务 (Mac)
 *
 * 替代 Windows 版 launcher.js，使用 Mac 原生命令：
 * - lsof 替代 netstat 查询端口
 * - kill 替代 taskkill
 * - ps 替代 wmic 验证进程
 * - open 替代 start 打开浏览器
 */

var http = require('http');
var { spawn, exec } = require('child_process');
var path = require('path');
var fs = require('fs');
var os = require('os');

var PORT = 14097;
var opencodeProcess = null;
var opencodeCwd = '';

// ===== 启动时清理孤儿 MCP 进程 =====
function cleanupOrphanedMcp() {
    try {
        var execSync = require('child_process').execSync;
        var out = execSync("ps aux | grep 'wps-office-mcp/dist/index.js' | grep -v grep | awk '{print $2}'", {
            encoding: 'utf8',
            timeout: 5000
        });
        var lines = out.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var pid = parseInt(lines[i].trim(), 10);
            if (pid > 0 && !isNaN(pid)) {
                try { execSync('kill ' + pid, { timeout: 3000 }); } catch(e) {}
            }
        }
    } catch(e) {}
}
cleanupOrphanedMcp();

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

function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function findOpenCodeBin() {
    var configPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
    if (fs.existsSync(configPath)) {
        try {
            var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.opencodePath && fs.existsSync(config.opencodePath)) {
                console.log('[launcher] Using config path: ' + config.opencodePath);
                return config.opencodePath;
            }
        } catch(e) {}
    }

    var nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
    var nvmBin = '';
    try {
        var nvmVersions = fs.readdirSync(nvmDir).sort();
        if (nvmVersions.length > 0) nvmBin = path.join(nvmDir, nvmVersions[nvmVersions.length - 1], 'bin', 'opencode');
    } catch(e) {}

    var commonPaths = [
        nvmBin,
        path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
        '/usr/local/bin/opencode',
        '/opt/homebrew/bin/opencode',
        '/usr/bin/opencode'
    ].filter(Boolean);
    for (var i = 0; i < commonPaths.length; i++) {
        if (fs.existsSync(commonPaths[i])) {
            console.log('[launcher] Found: ' + commonPaths[i]);
            return commonPaths[i];
        }
    }

    try {
        var whichOut = require('child_process').execSync('which opencode 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 3000 });
        var whichPath = whichOut.trim();
        if (whichPath) {
            console.log('[launcher] Found via PATH: ' + whichPath);
            return whichPath;
        }
    } catch(e) {}

    console.log('[launcher] opencode not found, falling back to PATH');
    return 'opencode';
}

function stopOpenCodeByPort(targetPort) {
    targetPort = targetPort || 14096;
    console.log('[launcher] stopOpenCodeByPort: ' + targetPort);

    try {
        var execSync = require('child_process').execSync;
        var out = execSync("lsof -ti tcp:" + targetPort, {
            encoding: 'utf8',
            timeout: 5000
        });
        var lines = out.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var pid = parseInt(lines[i].trim(), 10);
            if (pid > 0 && !isNaN(pid)) {
                try {
                    var nameOut = execSync("ps -p " + pid + " -o comm= 2>/dev/null", { encoding: 'utf8', timeout: 3000 });
                    var procName = (nameOut || '').trim().toLowerCase();
                    if (procName.indexOf('node') === -1 && procName.indexOf('opencode') === -1 && procName !== '') {
                        console.log('[launcher] 跳过非 OpenCode 进程: ' + procName);
                        continue;
                    }
                } catch(e) {}
                try {
                    execSync('kill ' + pid, { timeout: 3000 });
                    console.log('[launcher] 已终止 PID: ' + pid);
                } catch(e) {
                    console.log('[launcher] 终止 PID ' + pid + ' 失败: ' + e.message);
                }
            }
        }
    } catch(e) {
        console.log('[launcher] 端口 ' + targetPort + ' 无占用进程');
    }

    return { success: true };
}

function stopOpenCode() {
    console.log('[launcher] stopOpenCode');
    if (opencodeProcess) {
        try { opencodeProcess.kill('SIGTERM'); } catch(e) {
            console.error('[launcher] 终止子进程失败: ' + e.message);
        }
        opencodeProcess = null;
    }
    stopOpenCodeByPort(14096);
    return { success: true };
}

function startOpenCode(cwd, port) {
    console.log('[launcher] startOpenCode cwd=' + cwd + ' port=' + port);
    if (opencodeProcess) {
        return { success: false, error: 'already running' };
    }
    if (!cwd) {
        return { success: false, error: 'cwd is undefined' };
    }
    if (!fs.existsSync(cwd)) {
        try { fs.mkdirSync(cwd, { recursive: true }); } catch(e) {}
    }
    opencodeCwd = cwd;
    var opencodeBin = findOpenCodeBin();
    console.log('[launcher] Starting: ' + opencodeBin);

    try {
        opencodeProcess = spawn(opencodeBin, [
            'serve', '--port', String(port || 14096),
            '--hostname', '127.0.0.1', '--cors', 'file://'
        ], {
            cwd: cwd,
            stdio: 'ignore',
            detached: false
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

        var pidFile = path.join(__dirname, 'opencode.pid');
        try { fs.writeFileSync(pidFile, String(opencodeProcess.pid)); } catch(e) {}

        return { success: true, pid: opencodeProcess.pid };
    } catch(e) {
        return { success: false, error: e.message };
    }
}

function dockWindow(callback, data) {
    var cwd = data && data.cwd ? data.cwd : '';
    var sessionId = data && data.session ? data.session : '';
    if (!cwd && opencodeCwd) cwd = opencodeCwd;

    console.log('[launcher] dockWindow: cwd=' + cwd + ' session=' + sessionId);
    var url = 'http://127.0.0.1:14096';
    if (cwd) url += '?cwd=' + encodeURIComponent(cwd);
    if (sessionId) url += (cwd ? '&' : '?') + 'session=' + encodeURIComponent(sessionId);

    exec('open -a "Google Chrome" "' + url + '" 2>/dev/null || open -a "Microsoft Edge" "' + url + '" 2>/dev/null || open "' + url + '"', { timeout: 5000 }, function() {
        callback({ success: true, pid: 0 });
    });
}

process.on('uncaughtException', function(err) {
    console.error('[launcher] CRASH: ' + (err && err.message || err));
    try {
        var pidFile = path.join(__dirname, 'opencode.pid');
        try { fs.unlinkSync(pidFile); } catch(e) {}
    } catch(e) {}
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
        parseBody(req, function(body) {
            try {
                var result = startOpenCode(body.cwd, body.port);
                sendJSON(res, result.success ? 200 : 400, result);
            } catch(e) {
                console.error('[launcher] startOpenCode failed:', e);
                sendJSON(res, 500, { error: 'Internal error: ' + e.message });
            }
        });
        return;
    }

    if (req.method === 'POST' && url === '/stop') {
        sendJSON(res, 200, stopOpenCode());
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

    sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', function() {
    console.log('[launcher] Mac Launcher running on http://127.0.0.1:' + PORT);
});
