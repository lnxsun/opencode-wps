// launcher.js - OpenCode 进程管理服务
const http = require('http');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 统一入口注释：当前 launcher 启动 opencode serve 不再追加 --permission 旗标（Issue #161：
// 老版本 opencode 的 serve 子命令不认识该旗标，追加后打印 usage 以 code=1 退出导致启动失败）。
// 权限自动放行完全交由前端 taskpane 的 handlePermissionRequest 在 config.permission.mode==='auto'
// 时自动 respondPermission('allow')，以及 /tui/control/next 长轮询兜底实现（见 opencode-wps/taskpane.html）。

// 统一的隐藏窗口 execSync：强制 windowsHide:true（CREATE_NO_WINDOW）。
// Windows 上若未隐藏，execSync 拉起的 cmd.exe / powershell / wmic 子进程会闪现可见控制台窗口
// （Issue #143 关闭服务时闪 13 次黑窗的根因）。集中在此封装，新增子进程调用统一走它，防遗漏。
function hiddenExecSync(command, options) {
  options = options || {};
  options.windowsHide = true;
  return require('child_process').execSync(command, options);
}

// 统一的隐藏窗口 spawn：强制 windowsHide:true（CREATE_NO_WINDOW）。
// 启动服务时 startOpenCode 用 spawn 拉起 opencode 进程（.exe/.ps1 直启、.cmd shim 走 cmd）。
// Issue #143 后续反馈：仅靠 Node shell:true 内部传给 cmd.exe 的 windowsHide，无法彻底覆盖
// .cmd 批处理 shim 为脚本启动的嵌套控制台进程，导致“点击启动服务也闪 1 次黑窗”。
// 因此对需 shell 的 .cmd shim 改用显式 `cmd.exe /d /s /c` 包装（shell:false + windowsHide:true），
// 让 CREATE_NO_WINDOW 直接作用于 cmd.exe 进程树，与 hiddenExecSync（关闭服务修复）验证过的机制一致。
function hiddenSpawn(command, args, options) {
  options = options || {};
  options.windowsHide = true;
  return require('child_process').spawn(command, args, options);
}

const PORT = 14097;
const OPENCODE_PORT = 14096;
let opencodeProcess = null;
let opencodeCwd = '';
let dockedPid = 0;
let stateLock = false;
// opencode serve 服务端日志写流（模块级持有，便于 stop/exit 时统一关闭，避免资源泄漏）
let opencodeLogStream = null;

// opencode 二进制探测结果缓存（Issue #243 R1）：
// 同一会话内 findOpenCodeBin() 首次探测成功后缓存路径，后续调用直接返回缓存，
// 避免 launcher 在同一会话内反复探测出不同二进制（npm shim / .bun）导致
// serve 进程被反复杀/重启（churn，Issue #164 发现）。config.opencodePath 变更时
// 由 resetOpenCodeBinCache() 手动失效（见 loadOpenCodeConfig 调用方 / startOpenCode）。
let opencodeBinCache = null;
// R2 失败探测节流 TTL：探测全部失败后在此窗口内直接返回裸命令，不重复完整探测（避免 churn）。
let BIN_PROBE_FAILURE_TTL_MS = 30 * 1000;

// 关闭并释放 opencode serve 日志写流（幂等，可安全重复调用）
// 注意：用 end() 会先 flush 缓冲区再关闭 fd，避免 destroy() 丢弃未落盘数据；
// 由于写流只被子进程 stdout/stderr 使用，子进程退出后这里即可安全关闭。
function closeOpenCodeLogStream() {
  if (opencodeLogStream) {
    try {
      opencodeLogStream.end();
    } catch (e) {
      /* 忽略关闭过程中的错误 */
    }
    opencodeLogStream = null;
  }
}

// 把子进程的 stdout/stderr 手动 pipe 进日志写流（shell 模式与非 shell 模式共用）。
// shell（.cmd）模式下 Node 不允许向 stdio 直接传 WriteStream；非 shell（.exe/.ps1）
// 模式若在 WriteStream 未 open（fd:null）时直连 stdio 会抛 "stdio is invalid"
// （Issue #161 回归）。两分支统一走 ['ignore','pipe','pipe'] + 本函数手动转发，
// 彻底消除竞态，且日志落盘行为完全一致。失败不阻断：即便日志流异常，
// opencode serve 仍能正常启动并运行。
function pipeChildOutputToLog(proc, logStream) {
  if (!proc || !logStream) return;
  if (proc.stdout) {
    proc.stdout.on('data', function (d) {
      try {
        logStream.write(d);
      } catch (e) {}
    });
  }
  if (proc.stderr) {
    proc.stderr.on('data', function (d) {
      try {
        logStream.write(d);
      } catch (e) {}
    });
  }
}

// ===== 启动时清理孤儿 MCP 进程 =====
function cleanupOrphanedMcp() {
  try {
    // 统一走 hiddenExecSync（强制 windowsHide，防黑窗闪现）
    var execSync = hiddenExecSync;
    // 用 PowerShell Get-Process 按命令行路径查找，无 % 转义问题
    var psCmd =
      "Get-Process -Name node | Where-Object { $_.CommandLine -match 'wps-office-mcp\\\\dist\\\\index\\.js' } | ForEach-Object { $_.Id }";
    var out = execSync('powershell -NoProfile -Command "' + psCmd + '"', {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    var lines = out.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var pid = parseInt(lines[i].trim(), 10);
      if (pid > 0 && !isNaN(pid)) {
        try {
          execSync('taskkill /F /PID ' + pid + ' 2>nul', {
            shell: 'cmd.exe',
            stdio: 'ignore',
            timeout: 3000,
            windowsHide: true,
          });
        } catch (e) {}
      }
    }
  } catch (e) {
    /* no orphaned processes */
  }
}
cleanupOrphanedMcp();

/**
 * 解析 HTTP 请求体为 JSON
 * @param {object} req - HTTP Request 对象
 * @param {function} callback - 回调函数，接收解析后的对象
 */
// 模块级 Symbol 标记：外部 JSON 无法伪造（普通 JSON 字符串键无法匹配 Symbol）
var BODY_TOO_LARGE = Symbol('bodyTooLarge');
function parseBody(req, callback) {
  var body = '';
  var MAX_BODY = 1024 * 1024; // 1MB
  var tooLarge = false;
  req.on('data', function (chunk) {
    if (body.length + chunk.length > MAX_BODY) {
      tooLarge = true;
      return;
    }
    body += chunk;
  });
  req.on('end', function () {
    if (tooLarge) {
      console.log('[launcher] Body too large ( > 1MB), rejected');
      callback(BODY_TOO_LARGE);
      return;
    }
    try {
      callback(JSON.parse(body));
    } catch (e) {
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
// launcher 仅绑定 127.0.0.1，CORS 收敛为白名单（与 opencode-proxy.js 一致）：
//  - OpenCode serve 来源（http://127.0.0.1:14096）
//  - WPS 插件面板：本地 file:// 或 WPS 内部扩展（无 Origin / null / file://）
//  - 其余任意 http(s) Origin 一律拒绝，防本地恶意网页跨站读取
var CORS_ORIGINS = ['http://127.0.0.1:14096', 'http://localhost:14096'];

function getAllowedOrigin(req) {
  var origin = req.headers.origin;
  if (!origin || origin === 'null' || origin.indexOf('file://') === 0) {
    // 无 Origin 头：同源请求 / curl 等；null / file://：WPS 插件面板等本地受限上下文
    return '*';
  }
  if (CORS_ORIGINS.indexOf(origin) !== -1) {
    return origin;
  }
  return null; // 白名单外的 Origin 一律拒绝
}

function sendJSON(req, res, statusCode, data) {
  var allowOrigin = getAllowedOrigin(req);
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function startOpenCode(cwd, port) {
  console.log('[launcher] startOpenCode called with cwd: ' + cwd + ' port: ' + port);
  // 端口校验前置（与 stopOpenCodeByPort 同一套规则）：body.port 可被外部控制，
  // 非法值（非数字/越界/含 shell 元字符）直接拒绝，防止污染 --port 启动参数。
  // 必须先于端口占用判定解析出合法 finalPort，孤儿清理与 spawn 都要用它。
  var parsedPort = parseInt(port, 10);
  if (
    port !== undefined &&
    port !== null &&
    (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535)
  ) {
    return { success: false, error: 'invalid port' };
  }
  var finalPort = parsedPort || OPENCODE_PORT;
  if (opencodeProcess) {
    return { success: false, error: 'already running' };
  }
  // Issue #247 回归根因：launcher 重启后 opencodeProcess 引用复位为 null，
  // 但历次拉起没清干净的孤儿 opencode serve 仍占着 finalPort。此时直接 spawn 新 serve
  // 必然 bind 冲突抛 ServeError（用户手动前台 opencode serve 实测坐实）。
  // 故守卫不能只看内存引用，还要在 spawn 前把端口上非本进程跟踪的孤儿 serve 清掉，杜绝 churn 复发。
  //   仅当 opencodeProcess === null（确无本 launcher 跟踪的合法子进程）时才清理，
  //   避免误杀正在被自己管理的运行中 serve（那种情况已被上面的 already running 拦截）。
  if (isPortListening(finalPort)) {
    console.log(
      '[launcher] Port ' + finalPort + ' occupied by stale serve, cleaning up before start'
    );
    killProcessOnPort(finalPort);
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
    try {
      fs.mkdirSync(cwd, { recursive: true });
    } catch (e) {}
  }
  opencodeCwd = cwd;
  var opencodeBin = findOpenCodeBin();
  console.log('[launcher] Starting with: ' + opencodeBin);

  // 复用 buildSpawnCommand 统一构造 spawn 命令：
  //   .ps1 → powershell.exe -ExecutionPolicy Bypass -File <bin> serve ...（脱离运行期 PATH）
  //   .exe → 直接 CreateProcess
  //   无扩展名/.cmd（npm 全局 shim）→ needShell=true，走 cmd.exe 包装
  // Issue #134 回归：startOpenCode 此前自行复制一套 isPs1/isExe 分支，且 .ps1 分支
  // 误走 `hiddenSpawn(bin, args)` 直接 spawn .ps1 文件——Node 的 spawn 无法直接执行
  // .ps1 脚本（无解释器关联），必然 ENOENT 失败，导致用户 .ps1 场景启动必失败。
  var spawnCmd = buildSpawnCommand(opencodeBin, finalPort);
  var opencodeArgs = spawnCmd.args;
  var needShell = spawnCmd.needShell;

  // 服务端日志落盘：stdio 由 'ignore' 改为管道，stdout/stderr 写入日志文件。
  // 之前 'ignore' 直接丢弃 opencode serve 的全部日志，导致用户无法查看
  // 服务端日志来定位 UnknownError（如 err_edae3507）等运行期错误。
  // 先关闭上一次遗留的日志写流（防止重复启动时产生孤儿流，符合重入安全）
  closeOpenCodeLogStream();
  var logFile = null;
  try {
    var logDir = path.join(os.homedir(), '.opencode', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    logFile = path.join(logDir, 'opencode-serve.log');
    // 简单大小轮转：超过阈值（如 5MB）时把旧日志重命名，避免无限增长占满磁盘。
    // Windows 上 rename 目标已存在会抛错，故先删除上次的 .old（忽略其不存在）。
    try {
      var MAX_LOG_BYTES = 5 * 1024 * 1024;
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) {
        try {
          if (fs.existsSync(logFile + '.old')) {
            fs.unlinkSync(logFile + '.old');
          }
        } catch (e) {}
        fs.renameSync(logFile, logFile + '.old');
      }
    } catch (e) {
      /* 轮转失败不影响日志落盘 */
    }
    // 'a' 追加模式：保留历史日志，便于对比多次运行
    opencodeLogStream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch (e) {
    console.log('[launcher] Failed to init opencode log file: ' + e.message);
  }

  try {
    // stdio 处理与 shell 模式解耦：shell 模式（如 npm 全局安装的 opencode.cmd，
    // needShell=true）下 Node 不允许向 stdio 传流对象（WriteStream），否则抛
    // "The argument 'stdio' is invalid. Received WriteStream {fd:null,...}" 导致
    // spawn 前直接 throw（Issue #134 回归，用户 .cmd 场景启动必失败）。
    // 因此 shell 模式改用 ['ignore','pipe','pipe'] + 手动 pipe 到日志写流；
    // 非 shell 模式（.exe/.ps1 直接 CreateProcess）才可把日志写流直接作为 stdio。
    if (needShell) {
      // 需 shell 的 .cmd shim（npm 全局安装的 opencode.cmd / 无扩展名 PATH shim）：
      // 显式通过 `cmd.exe /d /s /c` 启动，而非依赖 Node 的 shell:true。
      // 理由（Issue #143 后续反馈）：Node shell:true 的 windowsHide 仅间接传给外层 cmd.exe，
      // 无法彻底覆盖 .cmd 批处理为脚本启动的嵌套控制台进程，导致“点击启动服务也闪 1 次黑窗”。
      // 改显式 cmd.exe 后 windowsHide（CREATE_NO_WINDOW）直接作用于 cmd.exe 进程树，
      // 与 hiddenExecSync（关闭服务修复）验证过的隐藏机制一致，彻底消除黑窗。
      // windowsVerbatimArguments:true 让 Node 不对 args 二次加引号，避免含空格路径被破坏。
      // 用 spawnCmd.command（即 buildSpawnCommand 返回的启动命令本体，needShell 场景下等于
      // opencodeBin）构造被 cmd.exe 包装的命令，保持与 buildSpawnCommand 单一来源一致（R3-5）。
      // cmd.exe 为固定系统组件，直接在此硬编码作为壳，无需走 buildSpawnCommand。
      var shellCmd = '"' + spawnCmd.command + '" ' + opencodeArgs.join(' ');
      opencodeProcess = hiddenSpawn('cmd.exe', ['/d', '/s', '/c', shellCmd], {
        cwd: cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: false,
        windowsVerbatimArguments: true,
      });
      // 手动把子进程 stdout/stderr pipe 进日志写流（shell 模式无法直接作为 stdio）。
      // 失败不阻断：即便日志流异常，opencode serve 仍能正常启动并运行。
      pipeChildOutputToLog(opencodeProcess, opencodeLogStream);
    } else {
      // 非 shell 分支：.exe 直接 CreateProcess；.ps1 用 powershell.exe -ExecutionPolicy
      // Bypass -File <bin> 启动（spawnCmd.command 已封装，见 buildSpawnCommand）。
      // 切勿直接 spawn .ps1 文件——Node 无法直接执行 .ps1（ENOENT），这正是用户 .ps1
      // 场景启动失败的根因（Issue #134 回归）。
      // stdio 处理与 shell 分支保持一致：用 ['ignore','pipe','pipe'] + 手动 pipe 到日志
      // 写流，而非把 WriteStream 直接作为 stdio（Issue #161 回归）。根因：
      // fs.createWriteStream() 异步打开文件，若在 'open' 事件触发前就把它传给 spawn 的
      // stdio，流对象 fd 仍为 null，Node 抛 "The argument 'stdio' is invalid. Received
      // WriteStream { fd: null, ... }"（与 .cmd 场景同源，但此前仅 shell 分支规避了）。
      // 统一改为 pipe + 手动转发后彻底消除该竞态，同时日志落盘行为完全一致。
      var stdioArr = ['ignore', 'pipe', 'pipe'];
      var exeSpawnOptions = {
        cwd: cwd,
        stdio: stdioArr,
        detached: false,
        shell: false,
      };
      // bun 生成的 opencode shim 运行时依赖 bun（Issue #134 用户用 bun 全局重装）。
      // 探测到 bun bin 时，把 bun 运行时目录前置注入 spawn 的 PATH，确保 shim 能解析到 bun。
      // 仅在直接 CreateProcess 的 .exe 场景（spawnCmd.command 即二进制自身）注入；
      // .ps1 场景 spawnCmd.command 为 powershell.exe，无需注入 bun 运行时目录。
      if (spawnCmd.command === opencodeBin && isBunShimPath(opencodeBin)) {
        var bunDir = path.dirname(opencodeBin);
        var spawnEnv = Object.assign({}, process.env);
        spawnEnv.PATH = bunDir + path.delimiter + (spawnEnv.PATH || '');
        exeSpawnOptions.env = spawnEnv;
        console.log('[launcher] bun shim detected, prepending PATH: ' + bunDir);
      }
      opencodeProcess = hiddenSpawn(spawnCmd.command, opencodeArgs, exeSpawnOptions);
      // 手动把子进程 stdout/stderr pipe 进日志写流（与 shell 分支共用 pipeChildOutputToLog）。
      // 失败不阻断：即便日志流异常，opencode serve 仍能正常启动并运行。
      pipeChildOutputToLog(opencodeProcess, opencodeLogStream);
    }

    if (logFile) {
      console.log('[launcher] opencode serve logs → ' + logFile);
    }

    opencodeProcess.on('error', function (err) {
      console.log('[launcher] Error: ' + err.message);
      // 把启动失败原因写进 opencode-serve.log：计划任务/VBS 启动的 launcher 控制台不可见，
      // 若不落盘则失败原因完全丢失（Issue #134 的 opencode-serve.log 曾为空）。
      // 常见 ENOENT = 找不到 opencode 二进制；EACCES = 权限不足。
      // 直接复用闭包中已算好的 opencodeBin，避免在此失败关键路径上再次触发
      // findOpenCodeBin() 里同步阻塞的 execSync('where opencode', {timeout:5000})。
      // 同时记录实际 spawn 的 command（.ps1 场景为 powershell 绝对路径，.exe 为二进制路径），
      // 避免 ENOENT/EACCES 时用户误以为是 .ps1 本身的问题（R4-1）。
      var errMsg =
        '[launcher] spawn error: ' +
        err.message +
        ' (opencodeBin=' +
        (opencodeBin || '<empty>') +
        ', command=' +
        (spawnCmd ? spawnCmd.command : '<empty>') +
        ')';
      try {
        if (opencodeLogStream && opencodeLogStream.writable) {
          // 用 end(errMsg) 而非 write()+closeOpenCodeLogStream()：end 会在 flush
          // 缓冲区后关闭 fd，避免依赖隐式 flush 行为导致失败原因丢日志。
          opencodeLogStream.end(errMsg + '\n');
        }
      } catch (e) {
        /* 日志写入失败不阻断 */
      }
      console.log(errMsg);
      opencodeProcess = null;
      // 子进程启动失败，释放日志写流（end 已触发，closeOpenCodeLogStream 幂等置空）
      closeOpenCodeLogStream();
    });

    // 把实际执行的 spawn 命令写进日志：便于用户在 opencode-serve.log 里核对
    // launcher 到底用哪个二进制、怎么启动的（Issue #134 空日志难排查的增强）。
    // 直接用 buildSpawnCommand 返回的 command+args（.ps1 即为 powershell.exe -File ...），
    // 与真正 spawn 的命令保持一致。注意日志写流可能在 spawn 前被下方 catch 替换，
    // 故在此闭包内用局部引用。
    // R6-4/R7-3：对 command 及含空格的参数加引号（模块级 quoteIfNeeded），使日志中的
    // spawn 命令可直接复制复现（如 .ps1 路径 C:\Users\A B\...\opencode.ps1 含空格时）。
    var spawnCmdLog =
      quoteIfNeeded(spawnCmd.command) + ' ' + opencodeArgs.map(quoteIfNeeded).join(' ');
    try {
      if (opencodeLogStream && opencodeLogStream.writable) {
        opencodeLogStream.write('[launcher] spawn: ' + spawnCmdLog + '\n');
      }
    } catch (e) {
      /* 日志写入失败不阻断 */
    }

    opencodeProcess.on('exit', function (code) {
      console.log('[launcher] Exited: ' + code);
      // 把退出码写进 opencode-serve.log：若进程能 spawn 但立即非零退出
      //（如 .ps1 内部 node 找不到、opencode 参数错误等），error 事件不会触发，
      // 只有这里能留下痕迹，否则日志又变回“空日志”无法定位。
      var exitMsg =
        '[launcher] process exited: code=' +
        code +
        ' (opencodeBin=' +
        (opencodeBin || '<empty>') +
        ')';
      try {
        if (opencodeLogStream && opencodeLogStream.writable) {
          opencodeLogStream.end(exitMsg + '\n');
        }
      } catch (e) {
        /* 日志写入失败不阻断 */
      }
      console.log(exitMsg);
      opencodeProcess = null;
      // 子进程退出后释放日志写流，确保末尾日志落盘
      closeOpenCodeLogStream();
      // .ps1 场景：opencodeProcess 是 powershell 进程，真正的 opencode serve 是它的子进程。
      // powershell 异常退出而 opencode 子进程仍存活时，端口可能仍被占用（R3-6），在此复核提示，
      // 避免用户误以为服务已停止；stopOpenCodeByPort 已能在停止时按端口兜底清理。
      try {
        if (isPortListening(OPENCODE_PORT)) {
          console.log(
            '[launcher] Warning: opencode serve may still be running on port ' +
              OPENCODE_PORT +
              ' (spawned via ' +
              (spawnCmd.command || opencodeBin) +
              '), PID file removed but process tree may linger'
          );
        }
      } catch (e) {}
      // 清理 PID 文件
      var pidFile = path.join(__dirname, 'opencode.pid');
      try {
        fs.unlinkSync(pidFile);
      } catch (e) {}
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
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 按端口精确终止占用该端口的 OpenCode/Node 孤儿进程（Issue #247 自愈核心）。
 *
 * 逐行扫描 netstat 监听/连接该端口的 PID，先验证进程名确为 opencode.exe / node.exe
 * 才 taskkill —— 避免误杀占用同一端口的其他合法程序（如用户自起的其他服务）。
 * 命中至少一个即返回 { killed: true }；端口无占用/非 OpenCode 进程则返回 killed: false。
 *
 * 供两处复用：
 *   1) stopOpenCode() 停止服务时按 14096 兜底清理（原 stopOpenCodeByPort 逻辑）；
 *   2) startOpenCode() spawn 新 serve 前，清掉 launcher 重启后残留、占着端口的
 *      孤儿 opencode serve，从源头杜绝 bind 冲突 ServeError。
 *
 * @param {number} port - 目标端口（1-65535）
 * @returns {{ success: boolean, killed: boolean, error?: string }}
 */
function killProcessOnPort(port) {
  // 端口必须是 1-65535 的整数：外部可控值未校验会拼进 netstat/findstr 造成命令注入
  //（如 port="14096 & calc"），故强制整数化 + 范围校验。
  port = parseInt(port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.log('[launcher] Invalid port rejected: ' + port);
    return { success: false, error: 'invalid port', killed: false };
  }
  console.log('[launcher] killProcessOnPort called for port: ' + port);

  try {
    var execSync = hiddenExecSync;

    // 查找占用指定端口的进程 PID
    // findstr 匹配 ":port "（带尾空格）减少 :140960/:114096 等子串误匹配
    var output = execSync('netstat -ano | findstr ":' + port + ' "', {
      shell: 'cmd.exe',
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });

    var lines = output.split('\n');
    var killed = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('LISTENING') > 0 || line.indexOf('ESTABLISHED') > 0) {
        var parts = line.split(/\s+/);
        var localAddr = parts[1] || '';
        // 检查是否为指定端口：IPv6 地址 [::1]:14096 含多个冒号，用 lastIndexOf 取端口
        var listenPort = parseInt(localAddr.substring(localAddr.lastIndexOf(':') + 1), 10);

        if (listenPort === port) {
          var pid = parseInt(parts[parts.length - 1], 10);
          if (pid > 0) {
            console.log('[launcher] Found process on port ' + port + ', PID: ' + pid);
            // 验证进程名，避免误杀。优先用 PowerShell Get-CimInstance（Win11 兼容，
            // wmic 已在 Win11 移除）；查询失败再保守跳过，避免误杀非 OpenCode 进程。
            // 注意：不能无条件 continue——否则 Win11 上永远杀不掉合法进程。
            var isOpenCode = false;
            try {
              var psNameCmd =
                'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \'ProcessId=' +
                pid +
                '\').Name"';
              var nameOut = execSync(psNameCmd, {
                encoding: 'utf8',
                timeout: 3000,
                windowsHide: true,
              });
              var procName = (nameOut.split('\n')[0] || '').trim().toLowerCase();
              isOpenCode =
                procName === 'node.exe' || procName === 'opencode.exe' || procName === '';
              if (!isOpenCode) {
                console.log('[launcher] Skipping non-OpenCode process: ' + procName);
                continue;
              }
            } catch (e) {
              // PowerShell 也失败（极少数环境）：回退尝试 wmic（老系统），再失败则保守跳过
              try {
                var wmicOut = execSync(
                  'wmic process where ProcessId=' + pid + ' get Name /format:csv',
                  { encoding: 'utf8', timeout: 3000, shell: 'cmd.exe', windowsHide: true }
                );
                var wmicName = (wmicOut.split('\n')[1] || '').trim().toLowerCase();
                isOpenCode =
                  wmicName === 'node.exe' || wmicName === 'opencode.exe' || wmicName === '';
                if (!isOpenCode) {
                  console.log('[launcher] Skipping non-OpenCode process: ' + wmicName);
                  continue;
                }
              } catch (e2) {
                // 两种方式都失败：无法确认进程身份，保守跳过
                console.log('[launcher] Cannot verify process name for PID ' + pid + ', skipping');
                continue;
              }
            }
            try {
              execSync('taskkill /F /PID ' + pid + ' 2>nul', {
                shell: 'cmd.exe',
                stdio: 'ignore',
                timeout: 5000,
                windowsHide: true,
              });
              console.log('[launcher] Terminated PID: ' + pid);
              killed = true;
            } catch (e) {
              console.log('[launcher] Failed to terminate PID ' + pid + ': ' + e.message);
            }
          }
        }
      }
    }

    if (!killed) {
      console.log('[launcher] No process found on port ' + port);
    }
  } catch (e) {
    console.log('[launcher] Port-based shutdown failed: ' + e.message);
  }

  return { success: true, killed: killed };
}

function stopOpenCodeByPort(port) {
  var result = killProcessOnPort(port);
  if (result && result.error) {
    return result;
  }
  return { success: true };
}

function stopOpenCode() {
  console.log('[launcher] stopOpenCode called');

  // 先尝试结束 node 跟踪的子进程
  if (opencodeProcess) {
    try {
      opencodeProcess.kill();
    } catch (e) {
      console.error('[launcher] Failed to kill child process: ' + e.message);
    }
    opencodeProcess = null;
  }
  // 关闭 opencode serve 日志写流，确保末尾日志落盘
  closeOpenCodeLogStream();

  // 按端口关闭（14096 和 14097）- 精确杀，不全杀
  try {
    stopOpenCodeByPort(14096);
  } catch (e) {
    console.log('[launcher] Port-based shutdown failed: ' + e.message);
  }

  // 清理 PID 文件
  var pidFile = path.join(__dirname, 'opencode.pid');
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
  } catch (e) {}

  return { success: true };
}

/**
 * 探测指定端口当前是否被监听（同步）。
 * 用于 /status 在 opencodeProcess 引用丢失（如 launcher 重启）时回退判断服务是否仍在运行。
 * 基于 netstat -ano 匹配本地监听地址，与 stopOpenCodeByPort 同一套匹配规则。
 * @param {number} port - 目标端口（1-65535）
 * @returns {boolean} 端口是否被 LISTENING
 */
function isPortListening(port) {
  port = parseInt(port, 10);
  if (isNaN(port) || port < 1 || port > 65535) return false;
  try {
    var execSync = hiddenExecSync;
    // findstr 匹配 ":port "（带尾空格）减少 :140960/:114096 等子串误匹配
    var output = execSync('netstat -ano | findstr ":' + port + ' "', {
      shell: 'cmd.exe',
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    var lines = output.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('LISTENING') > 0) {
        var parts = line.split(/\s+/);
        var localAddr = parts[1] || '';
        // IPv6 地址 [::1]:14096 含多个冒号，用 lastIndexOf 取端口
        var listenPort = parseInt(localAddr.substring(localAddr.lastIndexOf(':') + 1), 10);
        if (listenPort === port) {
          return true;
        }
      }
    }
  } catch (e) {
    // netstat 失败（极少数环境）不阻断，视为端口未监听
  }
  return false;
}

function loadOpenCodeConfig() {
  // 优先读取 opencode 的真实全局配置位置（与 install-addons.js 写入一致）：
  //   Windows: %USERPROFILE%\.config\opencode\opencode.json
  //   POSIX:   ~/.config/opencode/opencode.json
  // 兼容旧路径 %APPDATA%\opencode\config.json（历史遗留），两者都读不到再走 PATH 探测。
  var candidates = [
    path.join(process.env.USERPROFILE || os.homedir(), '.config', 'opencode', 'opencode.json'),
    // 旧路径兜底：APPDATA/USERPROFILE 均未定义（如裸 Linux 环境）时退回 os.homedir()，避免 path.join(undefined) 抛错
    path.join(
      process.env.APPDATA || process.env.USERPROFILE || os.homedir(),
      'opencode',
      'config.json'
    ),
  ];
  var defaultConfig = { opencodePath: 'opencode' };

  var configPath = null;
  for (var ci = 0; ci < candidates.length; ci++) {
    if (fs.existsSync(candidates[ci])) {
      configPath = candidates[ci];
      break;
    }
  }

  if (!configPath) {
    console.log('[launcher] Config file not found, using defaults (run install-addons.js)');
    return defaultConfig;
  }

  try {
    var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config && typeof config === 'object') {
      return config;
    }
  } catch (e) {
    console.error('[launcher] Config file parse failed, using defaults: ' + e.message);
  }

  return defaultConfig;
}

/**
 * 在指定目录里探测 opencode 可执行文件（兼容 .exe/.cmd/.ps1 三种形态）。
 * npm 全局安装会同时生成 opencode、opencode.cmd、opencode.ps1 三个 shim，
 * 交互 PowerShell 的 Get-Command 优先解析 .ps1，而 cmd.exe 只会解析 .exe/.cmd/.bat。
 * 统一在此按扩展名探测，避免依赖 launcher 运行期（计划任务/VBS）的 PATH。
 * @param {string} dir - 待探测目录
 * @returns {string|null} 命中返回绝对路径，未命中返回 null
 */
function findOpenCodeInDir(dir) {
  if (!dir || typeof dir !== 'string') return null;
  // 优先 .exe，其次 .cmd（cmd 可直接执行），最后 .ps1（走 powershell -File）
  var exts = ['.exe', '.cmd', '.ps1'];
  for (var ei = 0; ei < exts.length; ei++) {
    var candidate = path.join(dir, 'opencode' + exts[ei]);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch (e) {
      /* 单个候选探测失败不阻断 */
    }
  }
  return null;
}

/**
 * 收集 opencode 可能所在的 bin 目录（Windows）。
 * 覆盖 npm / bun 全局安装、以及 Program Files 等常见位置，
 * 供 findOpenCodeBin 按扩展名逐一探测。
 * @returns {string[]} 候选目录列表（去重、按优先级排序）
 */
function getOpenCodeBinDirs() {
  var user = process.env.USERPROFILE || os.homedir() || '';
  var appdata = process.env.APPDATA || path.join(user, 'AppData', 'Roaming');
  var localAppData = process.env.LOCALAPPDATA || path.join(user, 'AppData', 'Local');
  // bun 全局安装位置：`BUN_INSTALL` 环境变量（默认 ~/.bun），全局 bin 在其下 bin 目录。
  // 用户反馈已用 `bun install -g` 全局重装 opencode（Issue #134），此处必须覆盖 bun bin。
  // 注意：bun 生成的 opencode.exe 是 bun shim，spawn 时依赖 bun 运行时在 PATH；
  // 但探测目的是定位到 shim 绝对路径，避免裸 'opencode' 依赖薄 PATH 而 ENOENT。
  var bunInstall = process.env.BUN_INSTALL;
  var bunInstallBin = bunInstall ? path.join(bunInstall, 'bin') : path.join(user, '.bun', 'bin');
  var dirs = [
    // bun 全局 bin（`bun install -g` 生成的 opencode.exe shim）
    bunInstallBin,
    // 默认 ~/.bun/bin 兜底：仅当 BUN_INSTALL 自定义了安装位置时补充，避免未设置时重复条目
    bunInstall ? path.join(user, '.bun', 'bin') : null,
    // npm 全局 bin
    path.join(appdata, 'npm'),
    path.join(localAppData, 'npm'),
    // opencode 官方安装器
    path.join(localAppData, 'Programs', 'opencode'),
    process.env['ProgramFiles']
      ? path.join(process.env['ProgramFiles'], 'opencode')
      : 'C:\\Program Files\\opencode',
    process.env['ProgramFiles(x86)']
      ? path.join(process.env['ProgramFiles(x86)'], 'opencode')
      : 'C:\\Program Files (x86)\\opencode',
  ];
  var seen = {};
  var out = [];
  for (var i = 0; i < dirs.length; i++) {
    if (!dirs[i]) continue;
    var key = dirs[i].toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(dirs[i]);
  }
  return out;
}

/**
 * 判断 opencode 可执行路径是否位于 bun 全局 bin（`~/.bun/bin` 或 `BUN_INSTALL/bin`）。
 * bun 生成的 opencode shim 运行时依赖 bun，spawn 时需把 bun bin 注入 PATH。
 * @param {string} binPath - opencode 可执行文件绝对路径
 * @returns {boolean} 命中 bun 全局 bin 返回 true
 */
function isBunShimPath(binPath) {
  if (!binPath || typeof binPath !== 'string') return false;
  var user = process.env.USERPROFILE || os.homedir() || '';
  var bunDirs = [path.join(user, '.bun', 'bin')];
  var bunInstall = process.env.BUN_INSTALL;
  if (bunInstall) {
    bunDirs.push(path.join(bunInstall, 'bin'));
  }
  var resolvedBin = path.resolve(binPath).toLowerCase();
  for (var i = 0; i < bunDirs.length; i++) {
    var resolvedDir = path.resolve(bunDirs[i]).toLowerCase();
    // 用 path.relative 判断 binPath 是否位于 bunDir 下，规避前缀子串误判
    //（如 BUN_INSTALL=D:\bun 时 D:\bunny\bin 不应命中）。
    var rel = path.relative(resolvedDir, resolvedBin);
    if (rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)) {
      return true;
    }
  }
  return false;
}

/**
 * 解析 `where opencode` 命令输出，返回第一个命中的 opencode 可执行文件绝对路径。
 * 逐行过滤：文件名含 opencode 且以 .exe/.cmd/.ps1 结尾（Windows 扩展名判定）。
 * @param {string} output - `where opencode` 的原始输出（可含 \r\n 换行）
 * @returns {string|null} 命中返回绝对路径；未命中返回 null
 */
function parseWhereOutput(output) {
  if (typeof output !== 'string' || !output) return null;
  var lines = output.split(/\r?\n/);
  for (var li = 0; li < lines.length; li++) {
    var line = (lines[li] || '').trim();
    if (!line) continue;
    // 提取文件名：兼容 / 与 \ 分隔符（path.basename 在非 Windows 上不识别
    // 反斜杠路径，故手动取最后一个分隔符后的片段，保证单测跨平台可跑）。
    var base = line.split(/[\/\\]/).pop();
    // 取第一个命中的 opencode（.exe/.cmd/.ps1 均可）。
    // 用 ^opencode\.(...)$ 精确匹配文件名，避免误命中相邻文件（如
    // opencodehelper.exe / opencode-tool.cmd / my-opencode.bin）。`where opencode`
    // 虽只返回精确同名项，收紧后更稳，且不受基线路径影响。
    if (/^opencode\.(exe|cmd|ps1)$/i.test(base)) {
      return line;
    }
  }
  return null;
}

/**
 * 查找可用的 opencode CLI 可执行文件（绝对路径）。
 * 优先级：显式配置 > 常见 bin 目录探测（.exe/.cmd/.ps1）> PATH 解析 > 裸 'opencode'。
 * @returns {string} 找到的 opencode 可执行路径；未找到时返回裸 'opencode'（依赖运行期 PATH）
 */
function findOpenCodeBin() {
  // 缓存命中直接返回（Issue #243 R1）：同一会话内不再反复探测出不同二进制路径，
  // 避免 serve 进程因二进制切换被反复杀/重启（churn）。
  // 缓存时记录当时 config.opencodePath；若配置显式指定路径且有变更，则失效重探。
  if (opencodeBinCache && opencodeBinCache.path) {
    // 权衡说明：此处每次读取 config 以检测 opencodePath 显式变更（正确性优先）。
    // 命中高频调用时确有轻微文件 I/O 开销，但 config 文件极小、读取代价可忽略，
    // 且换来的"配置变更即时失效"语义必要，故保留。
    var cfg = loadOpenCodeConfig();
    // 归一化：默认 'opencode'（loadOpenCodeConfig 的 defaultConfig）视为"未显式指定"，
    // 等效 null，避免默认值与探测缓存（cfgPath=null）误判为配置变化导致缓存永远失效。
    var rawCfgPath = cfg && cfg.opencodePath ? cfg.opencodePath : null;
    var cfgPath = rawCfgPath === 'opencode' ? null : rawCfgPath;
    if (
      (!cfgPath && !opencodeBinCache.cfgPath) ||
      (cfgPath && cfgPath === opencodeBinCache.cfgPath)
    ) {
      // 配置未变化（或都未显式指定）。校验缓存路径文件仍存在：
      // 无论路径来自 config 显式（cfgPath 非空，R3-1）还是 bin 目录/PATH 探测
      // （cfgPath=null，R4-2），若文件被删除/失效都应失效重探——否则会持续用失效
      // 路径启动 serve 失败且不自愈（如 npm/bun 全局安装被卸载）。
      if (!fs.existsSync(opencodeBinCache.path)) {
        console.log('[launcher] Cached opencode path no longer exists, resetting bin cache');
        opencodeBinCache = null;
      } else {
        // 复用缓存
        return opencodeBinCache.path;
      }
    } else {
      // 显式配置路径发生变化：缓存失效，重新探测
      console.log('[launcher] opencodePath config changed, resetting bin cache');
      opencodeBinCache = null;
    }
  }

  // 1. 从配置读取（有防御性检查）
  var config = loadOpenCodeConfig();
  // 仅当用户显式指定了非默认的 opencodePath 才采用（默认 'opencode' 视为未显式配置，
  // 不短路 bin 目录探测——否则默认配置下永远走裸命令、探测不到 npm/bun 全局安装的真实
  // 二进制，造成依赖薄 PATH 而 ENOENT，见 Issue #134/#243）。
  if (config.opencodePath && config.opencodePath !== 'opencode') {
    if (fs.existsSync(config.opencodePath)) {
      // 校验路径是可执行文件且文件名合理（防 config.json 被篡改指向任意 exe）
      var p = config.opencodePath;
      var isFile = fs.statSync(p).isFile();
      var nameOk = /opencode/i.test(path.basename(p)) || /\.(exe|cmd|ps1)$/i.test(p);
      if (isFile && nameOk) {
        console.log('[launcher] Using config path: ' + config.opencodePath);
        opencodeBinCache = { path: config.opencodePath, cfgPath: config.opencodePath };
        return config.opencodePath;
      }
      console.log(
        '[launcher] Config opencodePath invalid (not opencode-like file), falling through'
      );
    }
  }

  // 2. 在常见 bin 目录按扩展名探测（.exe/.cmd/.ps1）
  var dirs = getOpenCodeBinDirs();
  for (var di = 0; di < dirs.length; di++) {
    var found = findOpenCodeInDir(dirs[di]);
    if (found) {
      console.log('[launcher] Found: ' + found);
      opencodeBinCache = { path: found, cfgPath: null };
      return found;
    }
  }

  // 3. 用 `where opencode` 从 PATH 解析真实路径（where 依赖本进程运行期 PATH，
  //    计划任务/VBS 拉起的 launcher 目录探测无法覆盖时，靠 where 兜底）。
  //    稳定性权衡：命中结果会被 R1 缓存，后续 PATH 更新了更好的 opencode 版本不会
  //    自动切换（稳定性优先于时效性）；如需切换到新版本，可 reset 缓存或重启 launcher。
  try {
    var execSync = hiddenExecSync;
    var out = execSync('where opencode', {
      shell: 'cmd.exe',
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    var viaWhere = parseWhereOutput(out);
    if (viaWhere) {
      console.log('[launcher] Found via PATH: ' + viaWhere);
      opencodeBinCache = { path: viaWhere, cfgPath: null };
      return viaWhere;
    }
  } catch (e) {
    /* where 未命中或命令失败，继续回退 */
  }

  // 4. 回退到裸 'opencode'（依赖运行期 PATH，最后手段）。
  //    Issue #243 R2：探测全部失败时缓存一个带 TTL 的失败标记，TTL 内直接返回裸
  //    'opencode'，不再重复完整探测（含阻塞的 `where opencode` 5s 超时）。这避免
  //    同一会话内因探测不稳定而高频反复 spawn 不同二进制（serve 进程 churn）。
  //    TTL 过后自然失效，重新探测，以便 PATH / 安装状态更新后能命中。
  //    权衡：TTL 内若用户新安装/更新 opencode 无法及时感知（持续用裸命令），
  //    属节流设计意图；可等 TTL 过期或重启 launcher 后生效。
  if (
    opencodeBinCache &&
    opencodeBinCache.failedAt &&
    Date.now() - opencodeBinCache.failedAt < BIN_PROBE_FAILURE_TTL_MS
  ) {
    return 'opencode';
  }
  console.log('[launcher] ⚠️ OpenCode not found in known paths/PATH');
  console.log('[launcher] Tip: ensure opencode is installed or run install-addons.js');
  opencodeBinCache = { failedAt: Date.now() };
  return 'opencode';
}

/**
 * 手动清空 opencode 二进制探测缓存（Issue #243 R1）。
 * 仅供测试隔离与外部显式失效场景调用（生产代码中缓存失效由 findOpenCodeBin
 * 内部读取 config 比对 opencodePath 显式变更自动处理，无需主动调用本函数）。
 */
function resetOpenCodeBinCache() {
  opencodeBinCache = null;
}

/**
 * 构造实际 spawn 用的启动命令（与 startOpenCode 同一套逻辑，供 /diag 自检预览）。
 * .ps1 → powershell.exe -ExecutionPolicy Bypass -File <bin> serve ...（脱离运行期 PATH）；
 *   ⚠️ 约束：该分支 needShell=false，opencodeProcess 跟踪的是 powershell 进程，真正的
 *   opencode serve 是它的子进程。因此要求 .ps1 脚本前台阻塞运行 opencode serve
 *   （不要用 Start-Process / 后台 & 拉起后立即返回），否则 powershell 提前退出会触发
 *   exit 回调、误判服务已停止（R5-1）。
 * .exe → 直接 <bin> serve ...；无扩展名（PATH 中裸 'opencode'）或 .cmd 后缀
 *   （npm 全局安装的 shim）→ needShell=true，由调用方经 cmd.exe 包装启动。
 * @param {string} opencodeBin - findOpenCodeBin 解析出的可执行路径
 * @param {number} [port] - 可选端口（默认 OPENCODE_PORT），供 startOpenCode 传入 body.port
 * @returns {{command: string, args: string[], needShell: boolean}} spawn 命令构成
 */
function buildSpawnCommand(opencodeBin, port) {
  var bin = opencodeBin || 'opencode';
  var isPs1 = bin.endsWith('.ps1');
  var isExe = /\.exe$/i.test(bin);
  var args = [
    'serve',
    '--port',
    String(port || OPENCODE_PORT),
    '--hostname',
    '127.0.0.1',
    '--cors',
    'file://',
  ];
  // 权限自动放行由前端处理（Issue #161）：opencode serve 的 serve 子命令不认识
  // --permission 旗标，追加会导致打印 usage 并以 code=1 退出、服务起不来。
  // 故启动命令不再追加该旗标，改由 taskpane.html 在 auto 模式下自动 allow + /tui/control/next 兜底。
  var needShell = !isPs1 && !isExe;
  if (isPs1) {
    return {
      command: resolvePowerShellExe(),
      args: ['-ExecutionPolicy', 'Bypass', '-File', bin].concat(args),
      needShell: false,
    };
  }
  return { command: bin, args: args, needShell: needShell };
}

// 对含空白/特殊字符的命令或参数加双引号，用于拼可复制复现的 spawn 命令日志（R6-4/R7-3）。
// 不含空白则原样返回。注意：仅用于日志展示，真正的 spawn 走 Node 数组参数自动加引号。
function quoteIfNeeded(s) {
  return /\s/.test(String(s)) ? '"' + s + '"' : String(s);
}

// 解析 Windows PowerShell 可执行文件的绝对路径。launcher 可能由计划任务 / VBS / 服务
// 在无人值守场景拉起，其 PATH 环境未必包含 PowerShell 所在目录，若直接 spawn 裸
// 'powershell.exe' 可能 ENOENT（Issue #134 正是无人值守启动失败的场景）。用绝对路径
// 可保证 .ps1 场景在任何 PATH 环境下都能解析到 powershell.exe。
function resolvePowerShellExe() {
  var sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  // 先探 64 位 System32，再兜底 32 位 SysWOW64（极端 32 位进程下 System32 经
  // WOW64 重定向可能无 v1.0），最后回退裸命令让 Node 走 PATH 解析（R9-1）。
  var candidates = [
    path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(sysRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  try {
    for (var i = 0; i < candidates.length; i++) {
      if (fs.existsSync(candidates[i])) {
        return candidates[i];
      }
    }
  } catch (e) {
    /* 探测异常回退裸命令 */
  }
  return 'powershell.exe';
}

/**
 * 收集 launcher 诊断信息（GET /diag），用于在无法查看计划任务/VBS 控制台时
 * 快速定位 opencode 二进制探测、配置文件与日志落盘问题（Issue #134 空日志难排查）。
 * 返回的每个字段都不应 throw——单字段失败降级为默认/异常标记，保证 /diag 永远可达。
 * @returns {object} 诊断信息对象
 */
function getDiagInfo() {
  var info = {};
  // opencode 二进制探测结果
  try {
    info.opencodeBin = findOpenCodeBin();
  } catch (e) {
    info.opencodeBin = '<error: ' + (e && e.message) + '>';
  }
  // 配置文件探测
  try {
    var config = loadOpenCodeConfig();
    info.config = {
      path: configPathUsed(),
      opencodePath: config.opencodePath,
    };
  } catch (e) {
    info.config = { error: e && e.message };
  }
  // 服务端日志落盘
  var logFile = path.join(os.homedir(), '.opencode', 'logs', 'opencode-serve.log');
  info.logFile = logFile;
  try {
    info.logExists = fs.existsSync(logFile);
    info.logSize = info.logExists ? fs.statSync(logFile).size : 0;
  } catch (e) {
    info.logExists = false;
    info.logSize = 0;
  }
  // 环境信息
  info.homedir = os.homedir();
  info.userprofile = process.env.USERPROFILE || '';
  // spawn 命令预览（不实际启动）：统一用 command + args，避免非 shell 分支
  // 因 command 是否为裸 'powershell.exe' 而丢前缀（.ps1 用绝对路径后三元的
  // 'powershell.exe' 判断失效；.exe 本就不匹配）。R2-1 修复。
  var spawnCmd = buildSpawnCommand(info.opencodeBin);
  info.spawnCommand = spawnCmd.command + ' ' + spawnCmd.args.join(' ');
  return info;
}

/**
 * 返回 loadOpenCodeConfig 实际命中的配置文件路径（供 /diag 展示）。
 * 与 loadOpenCodeConfig 共用同一候选顺序：真实全局配置 > 旧路径兜底。
 * @returns {string|null} 命中返回路径，未命中返回 null
 */
function configPathUsed() {
  var candidates = [
    path.join(process.env.USERPROFILE || os.homedir(), '.config', 'opencode', 'opencode.json'),
    path.join(
      process.env.APPDATA || process.env.USERPROFILE || os.homedir(),
      'opencode',
      'config.json'
    ),
  ];
  for (var ci = 0; ci < candidates.length; ci++) {
    if (fs.existsSync(candidates[ci])) return candidates[ci];
  }
  return null;
}

/**
 * 校验工作目录路径合法性
 * 拒绝 UNC 路径、DOS 设备路径、路径穿越。
 * 统一返回 { valid, resolved/error } 对象，绝不 throw——
 * 调用方（startOpenCode / dockWindow）都没有 try/catch 包裹，
 * 一旦 throw 会进入 uncaughtException 导致 launcher 进程退出。
 * @param {string} cwd - 待校验的目录路径
 * @returns {{valid: boolean, resolved?: string, error?: string}} 校验结果
 */
function validateCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd) {
    return { valid: false, error: 'cwd 不能为空' };
  }
  // 拒绝 UNC 路径和 DOS 设备路径
  if (/^\\\\[?.]/.test(cwd) || /^\\\\/.test(cwd)) {
    return { valid: false, error: 'UNC and DOS device paths are not allowed' };
  }
  // 防止路径遍历：只拒绝 `..` 作为完整路径段的形态（`C:\a\..\b`），
  // 允许 `C:\my..folder` 等合法目录名（旧实现 includes('..') 误拒合法路径）
  if (/(^|[\\/])\.\.($|[\\/])/.test(cwd)) {
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
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    );
  } catch (e) {
    return false;
  }
}

/**
 * 打开 Edge 停靠窗口
 * @param {string} url - 停靠目标 URL
 */
function dockWindow(callback, data) {
  var cwd = data && data.cwd ? data.cwd : '';
  var sessionId = data && data.session ? data.session : '';

  // 如果没有传cwd，使用launcher中存储的cwd
  if (!cwd && opencodeCwd) {
    cwd = opencodeCwd;
  }

  // 验证 cwd：与 startOpenCode 同一套规则，通过后用 resolved 规范路径拼 query
  if (cwd) {
    var validation = validateCwd(cwd);
    if (!validation.valid) {
      console.log('[launcher] Cwd validation failed: ' + validation.error);
      callback({ success: false, error: validation.error });
      return;
    }
    cwd = validation.resolved;
  }

  console.log('[launcher] dockWindow final cwd: ' + cwd + ' session: ' + sessionId);

  // 每次调用使用唯一临时脚本名，避免并发请求互相覆盖同一 dock.ps1 的竞态
  var scriptPath = path.join(
    __dirname,
    'dock.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8) + '.ps1'
  );
  var edgeUrl = 'http://127.0.0.1:14096';

  // 直接使用传入的 cwd，不做任何转换
  if (cwd && cwd.length > 0) {
    edgeUrl += '?cwd=' + encodeURIComponent(cwd);
  }

  if (!isValidUrl(edgeUrl)) {
    console.error('[launcher] Invalid URL rejected:', edgeUrl);
    callback({ success: false, error: 'Invalid URL' });
    return;
  }
  console.log('[launcher] Final URL: ' + edgeUrl);
  // PowerShell 单引号字符串包裹 URL + 单引号翻倍转义：
  // - 单引号内不做 $ 变量插值（防 cwd 含 $ 被 PowerShell 解析）
  // - 单引号翻倍（''）表示字面单引号（防 cwd 含 ' 破坏字符串定界）
  // encodeURIComponent 不编码 ' 与 $，必须在此层处理
  var psSafeUrl = edgeUrl.replace(/'/g, "''");
  var script = [
    '# Open OpenCode Web',
    '$edge = @(',
    '    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",',
    '    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",',
    '    (Get-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" -ErrorAction SilentlyContinue)."(default)"',
    ') | Where-Object { Test-Path $_ } | Select-Object -First 1',
    'if (-not $edge) { $edge = "msedge.exe" }',
    '& "$edge" --app=' + "'" + psSafeUrl + "'",
  ].join('\n');
  fs.writeFileSync(scriptPath, script, 'utf8');
  exec(
    'powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + scriptPath + '"',
    { timeout: 5000 },
    function (err, stdout, stderr) {
      // 延迟删除脚本：等 PowerShell 启动完成后再删，避免进程仍在读文件时被删
      setTimeout(function () {
        try {
          fs.unlinkSync(scriptPath);
        } catch (e) {}
      }, 2000);
      if (err) {
        // exec 超时 ≠ 启动失败：Edge 冷启动可能超过 5 秒，PowerShell 可能仍在拉起窗口。
        // 探测"带 --app= 且指向 14096 的 msedge 进程"是否出现（避免误判用户已开的普通 Edge 浏览器）
        console.error('[launcher] dockWindow exec error: ' + (err.message || err));
        try {
          var execSync = hiddenExecSync;
          var edgeCheck = execSync(
            'powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name=\'msedge.exe\'\" | Where-Object { $_.CommandLine -match \'14096\' } | Measure-Object).Count"',
            { encoding: 'utf8', timeout: 3000, windowsHide: true }
          );
          var count = parseInt(edgeCheck.trim(), 10);
          if (count > 0) {
            console.log(
              '[launcher] dockWindow exec timed out but Edge app process detected (' +
                count +
                '), treating as success'
            );
            callback({ success: true, pid: 0, timeout: true });
            return;
          }
        } catch (e) {
          /* 探测失败，按失败处理 */
        }
        callback({ success: false, error: 'dock exec failed: ' + (err.message || err) });
        return;
      }
      callback({ success: true, pid: 0 });
    }
  );
}

// ===== 崩溃自动恢复 =====
process.on('uncaughtException', function (err) {
  console.error('[launcher] CRASH: ' + ((err && err.message) || err));
  try {
    var pidFile = path.join(__dirname, 'opencode.pid');
    try {
      fs.unlinkSync(pidFile);
    } catch (e) {}
  } catch (e) {}
  // 释放端口，让计划任务/VBS 自动重新拉起
  server.close();
  process.exit(1);
});
process.on('unhandledRejection', function (reason) {
  console.error('[launcher] Unhandled Rejection: ' + ((reason && reason.message) || reason));
});

var server = http.createServer(function (req, res) {
  // 来源校验统一走 getAllowedOrigin（已覆盖：无 Origin / null / file:// 放行、
  // 白名单 127.0.0.1/localhost 放行、其余拒绝）；非白名单 Origin 直接 403。
  // 不再单独做 isLocal 判断——两套逻辑并存曾导致 file:// 面板被误拦截。
  var origin = req.headers.origin;
  if (origin && getAllowedOrigin(req) === null) {
    sendJSON(req, res, 403, { error: 'Forbidden: non-local origin' });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJSON(req, res, 200, {});
    return;
  }

  var url = req.url;

  if (req.method === 'POST' && url === '/start') {
    if (stateLock) {
      sendJSON(req, res, 409, { error: 'Another start request is in progress' });
      return;
    }
    stateLock = true;
    parseBody(req, function (body) {
      if (body === BODY_TOO_LARGE) {
        stateLock = false;
        sendJSON(req, res, 413, { error: 'Request body too large' });
        return;
      }
      try {
        var result = startOpenCode(body.cwd, body.port);
        sendJSON(req, res, result.success ? 200 : 400, result);
      } catch (e) {
        console.error('[launcher] startOpenCode failed:', e);
        sendJSON(req, res, 500, { error: 'Internal error: ' + e.message });
      } finally {
        stateLock = false;
      }
    });
    return;
  }

  if (req.method === 'POST' && url === '/stop') {
    var result = stopOpenCode();
    sendJSON(req, res, 200, result);
    return;
  }

  if (req.method === 'GET' && url === '/status') {
    // 状态判定：opencodeProcess 引用存在即 running；
    // 但 launcher 重启后（opencodeProcess 复位为 null）而 14096 端口仍被占用时，
    // 进程其实仍在运行 —— 需回退探测端口，避免 UI 误显 stopped（Issue #114 回归）。
    var running = opencodeProcess !== null;
    // 端口监听探测：仅 running=false 时才需实际 netstat；running=true 时端口必然占用，
    // portOpen 恒 true（避免多余 netstat）。前端可用 running || portOpen 交叉判断。
    var portOpen = running ? true : isPortListening(OPENCODE_PORT);
    if (!running) {
      running = portOpen;
    }
    sendJSON(req, res, 200, {
      running: running,
      cwd: opencodeCwd,
      pid: opencodeProcess ? opencodeProcess.pid : null,
      // 额外暴露端口探测结果，便于前端多源交叉验证（与 running 同源复用，避免重复 netstat）
      portOpen: portOpen,
    });
    return;
  }

  if (req.method === 'GET' && url === '/health') {
    sendJSON(req, res, 200, { healthy: true, uptime: process.uptime() });
    return;
  }

  if (req.method === 'GET' && url === '/diag') {
    // 诊断接口：暴露 opencode 二进制探测、配置文件、日志落盘、spawn 命令预览，
    // 便于计划任务/VBS 拉起且控制台不可见时远程自检（Issue #134 空日志难排查）。
    try {
      sendJSON(req, res, 200, getDiagInfo());
    } catch (e) {
      console.error('[launcher] /diag failed:', e);
      sendJSON(req, res, 500, { error: 'Internal error: ' + e.message });
    }
    return;
  }

  if (req.method === 'POST' && url === '/dock') {
    parseBody(req, function (body) {
      if (body === BODY_TOO_LARGE) {
        sendJSON(req, res, 413, { error: 'Request body too large' });
        return;
      }
      dockWindow(function (result) {
        sendJSON(req, res, result.success ? 200 : 400, result);
      }, body);
    });
    return;
  }

  if (req.method === 'POST' && url === '/docinfo') {
    parseBody(req, function (body) {
      if (body === BODY_TOO_LARGE) {
        sendJSON(req, res, 413, { error: 'Request body too large' });
        return;
      }
      // 校验 body 必须是普通对象（非数组/非标量），避免写入非法缓存内容
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        sendJSON(req, res, 400, { error: 'Invalid body: expected object' });
        return;
      }
      var docInfoPath = path.join(__dirname, 'docinfo.cache.json');
      if (body && body.closed === true) {
        try {
          fs.unlinkSync(docInfoPath);
        } catch (e) {
          /* 文件不存在也视为清除成功 */
        }
        sendJSON(req, res, 200, { success: true });
        return;
      }
      try {
        fs.writeFileSync(docInfoPath, JSON.stringify(body), 'utf8');
        sendJSON(req, res, 200, { success: true });
      } catch (e) {
        console.error('[launcher] Failed to write docinfo cache: ' + e.message);
        sendJSON(req, res, 500, { success: false, error: 'Write failed: ' + e.message });
      }
    });
    return;
  }

  if (req.method === 'GET' && url === '/docinfo') {
    var docInfoPath = path.join(__dirname, 'docinfo.cache.json');
    try {
      var data = fs.readFileSync(docInfoPath, 'utf8');
      sendJSON(req, res, 200, JSON.parse(data));
    } catch (e) {
      sendJSON(req, res, 404, { error: 'No document info available' });
    }
    return;
  }

  sendJSON(req, res, 404, { error: 'Not found' });
});

// 仅在作为主模块运行时才启动 HTTP 服务（require 用于单测时跳过监听）
if (require.main === module) {
  server.on('error', function (err) {
    // 端口被占用时（典型：旧 launcher 残留占着 14097，或多次 schtasks /Run 叠加启动），
    // 不再无提示退出——把明确原因写入日志文件（schtasks/VBS 静默启动时 console 不可见，
    // 只能靠落盘日志排查），供用户定位（Issue #175）。
    var msg = (err && err.message) || String(err);
    var lines = ['[launcher] FATAL: 启动失败——' + msg];
    if (err && err.code === 'EADDRINUSE') {
      lines.push('[launcher] 端口 ' + PORT + ' 已被占用。');
      lines.push(
        '[launcher] 可能原因：旧 launcher 进程仍存活（残留占用 14097），或重复 schtasks /Run 叠加启动。'
      );
      lines.push('[launcher] 处置：先结束占用该端口的旧进程，再重新启动。');
      lines.push('[launcher]   netstat -ano | findstr :' + PORT);
      lines.push('[launcher]   taskkill /F /PID <旧进程PID>');
      lines.push('[launcher] 然后重新执行：schtasks /Run /TN "OpenCodeLauncher"');
    }
    for (var i = 0; i < lines.length; i++) {
      console.error(lines[i]);
    }
    // 尽量把错误落盘到 launcher 目录下的 launcher.err.log，弥补静默启动场景日志不可见
    try {
      fs.appendFileSync(path.join(__dirname, 'launcher.err.log'), lines.join('\n') + '\n', 'utf-8');
    } catch (e4) {
      /* 落盘失败不影响退出 */
    }
    server.close();
    // 端口被占属于致命配置冲突，明确退出（区别于静默崩溃：已有落盘日志可查）。
    // 但延迟到下一个 tick 退出，确保 close 完成、日志已写。
    setTimeout(function () {
      process.exit(1);
    }, 100);
  });
  server.listen(PORT, '127.0.0.1', function () {
    console.log('[launcher] Running on http://127.0.0.1:' + PORT);
  });
}

// 导出纯函数供单测 require 真实实现（避免测试文件里维护一份与交付代码脱节的副本）。
// 被 require 时跳过上面 server.listen，仅暴露函数。
module.exports = {
  parseWhereOutput: parseWhereOutput,
  findOpenCodeBin: findOpenCodeBin,
  resetOpenCodeBinCache: resetOpenCodeBinCache,
  findOpenCodeInDir: findOpenCodeInDir,
  getOpenCodeBinDirs: getOpenCodeBinDirs,
  isBunShimPath: isBunShimPath,
  loadOpenCodeConfig: loadOpenCodeConfig,
  resolvePowerShellExe: resolvePowerShellExe,
  quoteIfNeeded: quoteIfNeeded,
  buildSpawnCommand: buildSpawnCommand,
  getDiagInfo: getDiagInfo,
  configPathUsed: configPathUsed,
  validateCwd: validateCwd,
  isPortListening: isPortListening,
};
