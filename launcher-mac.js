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
    // 参数数组形式 + 显式 timeout：避免 shell 拼接，且 ps 慢时不会无限阻塞 launcher 启动
    var out = execSync('ps -axo pid=,command=', {
      encoding: 'utf8',
      timeout: 5000,
    });
    var lines = out.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = /^(\d+)\s+.*wps-office-mcp\/dist\/index\.js/.exec(lines[i]);
      if (m) {
        var pid = parseInt(m[1], 10);
        if (pid > 0 && !isNaN(pid)) {
          try {
            execSync('kill ' + pid, { timeout: 3000 });
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
}
cleanupOrphanedMcp();

// 请求体大小上限（防止恶意大包拖垮 launcher）
var MAX_BODY = 64 * 1024;

function parseBody(req, callback) {
  var body = '';
  var size = 0;
  var aborted = false;
  req.on('data', function (chunk) {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_BODY) {
      aborted = true;
      console.log('[launcher] Body too large, rejecting');
      try {
        req.destroy();
      } catch (e) {}
      callback({ error: 'body too large' });
      return;
    }
    body += chunk;
  });
  req.on('end', function () {
    if (aborted) return;
    try {
      callback(JSON.parse(body));
    } catch (e) {
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
    'Access-Control-Allow-Headers': 'Content-Type',
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
    } catch (e) {}
  }

  var nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  var nvmBin = '';
  try {
    // sort 默认字典序：'v14.0.0' 会排在 'v9.0.0' 前面，直接取最后一个会选到旧版本；
    // 需用版本号数值比较取最新（与 install-addons-mac.js 的排序逻辑对齐）
    var nvmVersions = fs
      .readdirSync(nvmDir)
      .filter(function (v) {
        return v.indexOf('v') === 0;
      })
      .sort(function (a, b) {
        var pa = a.substring(1).split('.').map(Number);
        var pb = b.substring(1).split('.').map(Number);
        for (var i = 0; i < 3; i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        }
        return 0;
      });
    if (nvmVersions.length > 0)
      nvmBin = path.join(nvmDir, nvmVersions[nvmVersions.length - 1], 'bin', 'opencode');
  } catch (e) {}

  var commonPaths = [
    nvmBin,
    path.join(os.homedir(), '.opencode', 'bin', 'opencode'),
    '/usr/local/bin/opencode',
    '/opt/homebrew/bin/opencode',
    '/usr/bin/opencode',
  ].filter(Boolean);
  for (var i = 0; i < commonPaths.length; i++) {
    if (fs.existsSync(commonPaths[i])) {
      console.log('[launcher] Found: ' + commonPaths[i]);
      return commonPaths[i];
    }
  }

  try {
    var whichOut = require('child_process').execSync('which opencode 2>/dev/null || echo ""', {
      encoding: 'utf8',
      timeout: 3000,
    });
    var whichPath = whichOut.trim();
    if (whichPath) {
      console.log('[launcher] Found via PATH: ' + whichPath);
      return whichPath;
    }
  } catch (e) {}

  console.log('[launcher] opencode not found, falling back to PATH');
  return 'opencode';
}

function stopOpenCodeByPort(targetPort) {
  targetPort = targetPort || 14096;
  // 端口显式数值校验：字符串/'14096; rm -rf ~' 等不可信输入注入 shell 命令（防御性参数化）
  targetPort = parseInt(targetPort, 10);
  if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
    console.log('[launcher] 无效端口: ' + targetPort);
    return { success: false };
  }
  console.log('[launcher] stopOpenCodeByPort: ' + targetPort);

  try {
    var execSync = require('child_process').execSync;
    // 参数数组形式：lsof -ti tcp:<port>（避免端口拼接进 shell 命令）
    var out = execSync('lsof', ['-ti', 'tcp:' + targetPort], {
      encoding: 'utf8',
      timeout: 5000,
    });
    var lines = out.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var pid = parseInt(lines[i].trim(), 10);
      if (pid > 0 && !isNaN(pid)) {
        try {
          var nameOut = execSync('ps -p ' + pid + ' -o comm= 2>/dev/null', {
            encoding: 'utf8',
            timeout: 3000,
          });
          var procName = (nameOut || '').trim().toLowerCase();
          if (
            procName.indexOf('node') === -1 &&
            procName.indexOf('opencode') === -1 &&
            procName !== ''
          ) {
            console.log('[launcher] 跳过非 OpenCode 进程: ' + procName);
            continue;
          }
        } catch (e) {}
        try {
          execSync('kill ' + pid, { timeout: 3000 });
          console.log('[launcher] 已终止 PID: ' + pid);
        } catch (e) {
          console.log('[launcher] 终止 PID ' + pid + ' 失败: ' + e.message);
        }
      }
    }
  } catch (e) {
    console.log('[launcher] 端口 ' + targetPort + ' 无占用进程');
  }

  return { success: true };
}

function stopOpenCode() {
  console.log('[launcher] stopOpenCode');
  if (opencodeProcess) {
    try {
      opencodeProcess.kill('SIGTERM');
    } catch (e) {
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
  // cwd 为空时使用用户主目录（自愈/默认启动场景），避免空 cwd 导致启动失败（与 Linux 版对齐）
  if (!cwd) {
    cwd = os.homedir();
    console.log('[launcher] cwd 为空，使用用户主目录: ' + cwd);
  }
  if (!fs.existsSync(cwd)) {
    try {
      fs.mkdirSync(cwd, { recursive: true });
    } catch (e) {}
  }
  opencodeCwd = cwd;
  var opencodeBin = findOpenCodeBin();
  console.log('[launcher] Starting: ' + opencodeBin);

  try {
    opencodeProcess = spawn(
      opencodeBin,
      ['serve', '--port', String(port || 14096), '--hostname', '127.0.0.1', '--cors', 'file://'],
      {
        cwd: cwd,
        stdio: 'ignore',
        detached: false,
      }
    );

    opencodeProcess.on('error', function (err) {
      console.log('[launcher] Error: ' + err.message);
      opencodeProcess = null;
    });

    opencodeProcess.on('exit', function (code) {
      console.log('[launcher] Exited: ' + code);
      opencodeProcess = null;
      // 正常退出也清理 pid 文件（此前仅 uncaughtException 清理），避免残留 pid 导致下次启动误判/重复清理
      try {
        var pidPath = path.join(os.homedir(), '.opencode', 'launcher-opencode.pid');
        fs.unlinkSync(pidPath);
      } catch (e) {}
    });

    console.log('[launcher] Started PID: ' + opencodeProcess.pid);

    var pidFile = path.join(os.homedir(), '.opencode', 'launcher-opencode.pid');
    try {
      fs.writeFileSync(pidFile, String(opencodeProcess.pid));
    } catch (e) {}

    return { success: true, pid: opencodeProcess.pid };
  } catch (e) {
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

  // 命令注入防护：用 spawn + 参数数组（而非 exec + 字符串拼接），
  // 避免 cwd/session 中的引号/分号等不可信字符被 shell 解释
  // macOS 上依次尝试 Chrome → 默认浏览器（open 命令带 URL 参数，本身不拼接 shell）
  var openBin = '/usr/bin/open';
  var tried = [];
  var done = false;
  var startedFallback = false;
  // 整体超时兜底：open 进程极端情况下（LaunchServices 无响应）可能长时间不退出，
  // finish 永不调用导致 HTTP 挂起（第 5 轮已修双失败路径但未覆盖「open 进程挂起」）
  var watchdog = setTimeout(function () {
    console.log('[launcher] dock open 超时（10s），强制完成');
    finish();
  }, 10000);
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    callback({ success: true, pid: 0 });
  }
  function tryOpen(bundleId) {
    if (bundleId) tried.push(bundleId);
    var args = bundleId ? ['-a', bundleId, url] : [url];
    var child = require('child_process').spawn(openBin, args, { stdio: 'ignore' });
    // macOS open 默认不等待应用退出，进程很快以退出码返回：
    // code===0 才算打开成功；非 0（如 Chrome 未安装时 open -a 报错）回退默认浏览器，避免"假成功"
    // （旧实现用 on('spawn') 立即回调 success，Chrome 缺失时 open 仍会 spawn 成功但实际没打开）
    child.on('error', function (err) {
      console.log('[launcher] open failed (' + (bundleId || 'default') + '): ' + err.message);
      if (done) return;
      // 兜底已尝试过默认浏览器仍失败：直接 finish（否则 callback 永不调用，HTTP 挂起）
      if (startedFallback || tried.length >= 2) {
        finish();
      } else {
        startedFallback = true;
        tryOpen(null);
      }
    });
    child.on('close', function (code) {
      if (done) return;
      if (code === 0) {
        finish();
      } else if (startedFallback || tried.length >= 2) {
        // Chrome 与默认浏览器都失败（无浏览器/无 http 关联）：必须 finish，避免 HTTP 挂起
        finish();
      } else {
        startedFallback = true;
        tryOpen(null);
      }
    });
  }
  tryOpen('Google Chrome');
}

process.on('uncaughtException', function (err) {
  console.error('[launcher] CRASH: ' + ((err && err.message) || err));
  try {
    var pidFile = path.join(os.homedir(), '.opencode', 'launcher-opencode.pid');
    try {
      fs.unlinkSync(pidFile);
    } catch (e) {}
  } catch (e) {}
  server.close();
  process.exit(1);
});
process.on('unhandledRejection', function (reason) {
  console.error('[launcher] Unhandled Rejection: ' + ((reason && reason.message) || reason));
});

var server = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') {
    sendJSON(res, 200, {});
    return;
  }

  var url = req.url;

  if (req.method === 'POST' && url === '/start') {
    parseBody(req, function (body) {
      try {
        var result = startOpenCode(body.cwd, body.port);
        sendJSON(res, result.success ? 200 : 400, result);
      } catch (e) {
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
    var running = opencodeProcess !== null;
    var pid = opencodeProcess ? opencodeProcess.pid : null;
    // pid 文件交叉校验：launcher 重启后 opencodeProcess 为 null，但若 pid 文件指向的进程仍存活（孤儿），状态应如实上报
    if (!running) {
      try {
        var pidFilePath = path.join(os.homedir(), '.opencode', 'launcher-opencode.pid');
        var savedPid = parseInt(fs.readFileSync(pidFilePath, 'utf-8'), 10);
        if (savedPid > 0) {
          try {
            process.kill(savedPid, 0); // 信号 0 仅探测存活
            running = true;
            pid = savedPid;
          } catch (e) {}
        }
      } catch (e) {}
    }
    sendJSON(res, 200, {
      running: running,
      cwd: opencodeCwd,
      pid: pid,
    });
    return;
  }

  if (req.method === 'GET' && url === '/health') {
    sendJSON(res, 200, { healthy: true, uptime: process.uptime() });
    return;
  }

  if (req.method === 'POST' && url === '/dock') {
    parseBody(req, function (body) {
      dockWindow(function (result) {
        sendJSON(res, result.success ? 200 : 400, result);
      }, body);
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('[launcher] Mac Launcher running on http://127.0.0.1:' + PORT);
});
