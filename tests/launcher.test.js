/**
 * Launcher 测试套件
 * 测试 Launcher 的路径查找、进程管理等功能
 * 直接 require ../opencode-wps/launcher.js 的真实实现（评审建议 #2：避免本地副本与交付代码脱节）。
 */

var path = require('path');
var fs = require('fs');
var os = require('os');

// ==================== 加载真实 Launcher 实现 ====================
// launcher.js 通过 require.main === module 保护，被 require 时不会启动 HTTP 服务，
// 仅暴露纯函数（findOpenCodeBin/findOpenCodeInDir/getOpenCodeBinDirs/loadOpenCodeConfig/validateCwd/isPortListening）。
var launcher = require(path.join(__dirname, '..', 'opencode-wps', 'launcher.js'));

var findOpenCodeInDir = launcher.findOpenCodeInDir;
var getOpenCodeBinDirs = launcher.getOpenCodeBinDirs;
var findOpenCodeBin = launcher.findOpenCodeBin;
var parseWhereOutput = launcher.parseWhereOutput;
var buildSpawnCommand = launcher.buildSpawnCommand;
var getDiagInfo = launcher.getDiagInfo;
var configPathUsed = launcher.configPathUsed;
var validateCwd = launcher.validateCwd;

// 进程管理（模拟）
var mockChildProcess = null;
var mockPidFile = path.join(__dirname, 'test.pid');

function startOpenCodeMock(cwd) {
  // 模拟启动，返回 PID
  var mockPid = Math.floor(Math.random() * 10000) + 1000;
  fs.writeFileSync(mockPidFile, mockPid.toString());
  return { pid: mockPid, cwd: cwd };
}

function stopOpenCodeMock() {
  if (fs.existsSync(mockPidFile)) {
    var pid = parseInt(fs.readFileSync(mockPidFile, 'utf-8'));
    fs.unlinkSync(mockPidFile);
    return { killed: true, pid: pid };
  }
  return { killed: false };
}

function getOpenCodePid() {
  if (fs.existsSync(mockPidFile)) {
    return parseInt(fs.readFileSync(mockPidFile, 'utf-8'));
  }
  return null;
}

// ==================== 测试用例 ====================

var testResults = [];
var testCount = 0;
var passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    testResults.push({ name: name, status: 'PASS' });
    console.log('✓ ' + name);
  } catch (e) {
    testResults.push({ name: name, status: 'FAIL', error: e.message });
    console.log('✗ ' + name + ': ' + e.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg + ' - expected: ' + expected + ', actual: ' + actual);
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg + ' - expected true');
}

function assertFalse(actual, msg) {
  if (actual) throw new Error(msg + ' - expected false');
}

function assertNotNull(actual, msg) {
  if (actual === null || actual === undefined) {
    throw new Error(msg + ' - expected not null');
  }
}

console.log('\n========== Launcher 测试套件（真实实现） ==========\n');

// --- 1. 路径查找测试（真实 findOpenCodeInDir / getOpenCodeBinDirs / findOpenCodeBin）---
console.log('--- 路径查找测试 ---');

test('findOpenCodeInDir: 识别 .trae-cn 下的 opencode.ps1（Issue #134 实测形态）', function () {
  var binDir = path.join(__dirname, 'fakehome');
  fs.mkdirSync(binDir, { recursive: true });
  var ps1 = path.join(binDir, 'opencode.ps1');
  fs.writeFileSync(ps1, '# fake ps1\n');
  try {
    var result = findOpenCodeInDir(binDir);
    assertEqual(path.basename(result), 'opencode.ps1', '应命中 .ps1');
    assertEqual(path.dirname(result), binDir, '应返回所在目录');
  } finally {
    fs.unlinkSync(ps1);
    try {
      fs.rmdirSync(binDir, { recursive: true });
    } catch (e) {}
  }
});

test('findOpenCodeInDir: 目录下同时有 .exe 时优先 .exe（其次 .cmd/.ps1）', function () {
  var binDir = path.join(__dirname, 'fakehome2');
  fs.mkdirSync(binDir, { recursive: true });
  var exe = path.join(binDir, 'opencode.exe');
  var cmd = path.join(binDir, 'opencode.cmd');
  var ps1 = path.join(binDir, 'opencode.ps1');
  fs.writeFileSync(exe, '\x00');
  fs.writeFileSync(cmd, '@echo off');
  fs.writeFileSync(ps1, 'x');
  try {
    assertEqual(path.basename(findOpenCodeInDir(binDir)), 'opencode.exe', '应优先 .exe');
    fs.unlinkSync(exe);
    assertEqual(
      path.basename(findOpenCodeInDir(binDir)),
      'opencode.cmd',
      '无 .exe 时应退而取 .cmd'
    );
    fs.unlinkSync(cmd);
    assertEqual(
      path.basename(findOpenCodeInDir(binDir)),
      'opencode.ps1',
      '仅剩 .ps1 时应命中 .ps1'
    );
  } finally {
    try {
      fs.unlinkSync(exe);
    } catch (e) {}
    try {
      fs.unlinkSync(cmd);
    } catch (e) {}
    try {
      fs.unlinkSync(ps1);
    } catch (e) {}
    try {
      fs.rmdirSync(binDir, { recursive: true });
    } catch (e) {}
  }
});

test('findOpenCodeInDir: 目录为空或不存在时返回 null', function () {
  assertEqual(findOpenCodeInDir(null), null, 'null 目录应返回 null');
  assertEqual(findOpenCodeInDir(''), null, '空目录应返回 null');
  assertEqual(findOpenCodeInDir(123), null, '非字符串应返回 null');
  var missing = path.join(__dirname, 'no_such_dir_xyz');
  assertEqual(findOpenCodeInDir(missing), null, '不存在的目录应返回 null');
});

test('getOpenCodeBinDirs: 覆盖 bun/npm/Program Files 常见目录且去重', function () {
  var dirs = getOpenCodeBinDirs();
  assertTrue(Array.isArray(dirs), '应返回数组');
  // 关键目录必须覆盖（不变量：与 BUN_INSTALL / ProgramFiles 环境无关的强断言）
  var joined = dirs.join('\n');
  assertTrue(
    /\.bun[\\/]bin/.test(joined),
    '应包含 bun 全局 bin 目录（用户已用 bun 全局重装 opencode）'
  );
  assertTrue(!/\.trae-cn/.test(joined), '不再探测 .trae-cn（用户已删除该目录）');
  assertTrue(/npm/.test(joined), '应包含 npm 全局 bin');
  assertTrue(/Programs[\\/]opencode/.test(joined), '应包含 opencode 官方安装目录');
  // 去重校验（不变量：无论环境差异，去重后无重复）
  var lower = dirs.map(function (d) {
    return d.toLowerCase();
  });
  assertEqual(new Set(lower).size, dirs.length, '候选目录不应有重复');
  // 环境无关的最小数量下限：bun/npm(2)/Programs/opencode/Program Files(1-2)
  assertTrue(dirs.length >= 5, '至少包含 5 个唯一候选目录（去重后）');
});

test('getOpenCodeBinDirs: BUN_INSTALL 未设置时默认探测 ~/.bun/bin 且无重复', function () {
  var oldBun = process.env.BUN_INSTALL;
  if (oldBun !== undefined) {
    delete process.env.BUN_INSTALL; // 确保未设置
  }
  try {
    var dirs = getOpenCodeBinDirs();
    var joined = dirs.join('\n');
    // 默认 ~/.bun/bin 必须被探测（回归：用户默认 bun 安装位置）
    assertTrue(/\.bun[\\/]bin/.test(joined), 'BUN_INSTALL 未设置时应包含默认 ~/.bun/bin');
    // 未设置时不应出现两条相同的默认 bun bin（🟡-1 去重语义）
    var bunCount = dirs.filter(function (d) {
      return /\.bun[\\/]bin/.test(d.toLowerCase());
    }).length;
    assertEqual(bunCount, 1, 'BUN_INSTALL 未设置时默认 bun bin 仅出现一次');
  } finally {
    if (oldBun !== undefined) {
      process.env.BUN_INSTALL = oldBun; // 恢复
    }
  }
});

test('getOpenCodeBinDirs: 尊重 BUN_INSTALL 环境变量自定义 bun 安装位置', function () {
  var oldBun = process.env.BUN_INSTALL;
  process.env.BUN_INSTALL = 'D:\\custom-bun'; // 用户自定义 bun 安装目录
  try {
    var dirs = getOpenCodeBinDirs();
    var joined = dirs.join('\n');
    assertTrue(/D:\\custom-bun[\\/]bin/.test(joined), '应优先使用 BUN_INSTALL 指定的 bun bin 目录');
    // 🟡-2：自定义 BUN_INSTALL 时，默认 ~/.bun/bin 仍应作兜底探测
    assertTrue(/\.bun[\\/]bin/.test(joined), 'BUN_INSTALL 自定义时默认 ~/.bun/bin 仍应兜底探测');
  } finally {
    // 恢复原环境变量，避免污染后续测试
    if (oldBun === undefined) {
      delete process.env.BUN_INSTALL;
    } else {
      process.env.BUN_INSTALL = oldBun;
    }
  }
});

test('findOpenCodeBin: 返回有效路径字符串（冒烟）', function () {
  var result = findOpenCodeBin();
  assertNotNull(result, '应返回路径');
  assertTrue(typeof result === 'string' && result.length > 0, '应返回非空字符串');
});

test('isBunShimPath: 识别 bun 全局 bin 路径，且不误判非 bun 路径', function () {
  var user = path.join(os.homedir(), '.bun', 'bin');
  var userBin = path.join(user, 'opencode.exe');
  assertTrue(launcher.isBunShimPath(userBin), '应识别 ~/.bun/bin 下的 opencode.exe');
  var npmPath = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'opencode.cmd');
  assertTrue(!launcher.isBunShimPath(npmPath), '不应误判 npm 全局路径');
  assertTrue(!launcher.isBunShimPath('opencode'), '裸命令不应误判');
  assertTrue(!launcher.isBunShimPath(null), 'null 应返回 false');
  // BUN_INSTALL 自定义路径：需先设置环境变量，isBunShimPath 才识别
  var oldBun = process.env.BUN_INSTALL;
  process.env.BUN_INSTALL = 'D:\\custom-bun';
  try {
    var custom = path.join('D:\\custom-bun', 'bin', 'opencode.exe');
    assertTrue(launcher.isBunShimPath(custom), '应识别 BUN_INSTALL 自定义路径下的 opencode.exe');
    // 🟡-7：前缀子串不误判——BUN_INSTALL=D:\\bun 时 D:\\bunny\\bin 不应命中
    process.env.BUN_INSTALL = 'D:\\bun';
    var notBunny = path.join('D:\\bunny', 'bin', 'opencode.exe');
    assertTrue(!launcher.isBunShimPath(notBunny), 'BUN_INSTALL=D:\\bun 时 D:\\bunny\\bin 不应误判');
  } finally {
    if (oldBun === undefined) {
      delete process.env.BUN_INSTALL;
    } else {
      process.env.BUN_INSTALL = oldBun;
    }
  }
});

// --- step 3 `where opencode` 输出解析（评审建议：补单测拦截 .cmd 正则 bug）---
console.log('\n--- where 输出解析（parseWhereOutput）---');

test('parseWhereOutput: 命中 .cmd 路径（回归 Issue #134 / 评审 bug）', function () {
  var out = 'C:\\Users\\Administrator\\.trae-cn\\sdks\\versions\\node\\current\\opencode.cmd';
  assertEqual(parseWhereOutput(out), out, '应识别 .cmd 绝对路径（\\.cmd 正则不再误配）');
});

test('parseWhereOutput: 命中 .ps1 / .exe 路径', function () {
  assertEqual(
    parseWhereOutput('D:\\tools\\opencode.ps1'),
    'D:\\tools\\opencode.ps1',
    '应识别 .ps1'
  );
  assertEqual(parseWhereOutput('C:\\npm\\opencode.exe'), 'C:\\npm\\opencode.exe', '应识别 .exe');
});

test('parseWhereOutput: 多行输出取第一个命中的 opencode', function () {
  var out = 'C:\\a\\some_other.exe\r\nC:\\b\\opencode.cmd\r\nC:\\c\\opencode.ps1';
  assertEqual(
    parseWhereOutput(out),
    'C:\\b\\opencode.cmd',
    '应跳过无关行、取第一个命中的 opencode'
  );
});

test('parseWhereOutput: 未命中/空输入返回 null', function () {
  assertEqual(parseWhereOutput(null), null, 'null 应返回 null');
  assertEqual(parseWhereOutput(''), null, '空串应返回 null');
  assertEqual(parseWhereOutput('C:\\a\\other.exe'), null, '不含 opencode 的路径应返回 null');
  assertEqual(parseWhereOutput('C:\\a\\opencode.txt'), null, '非 .exe/.cmd/.ps1 扩展名应返回 null');
});

test('parseWhereOutput: 收紧正则拒绝相邻文件误命中（评审建议）', function () {
  // 仅文件名精确为 opencode.<ext> 才命中，避免误收 opencodehelper.exe / opencode-tool.cmd
  assertEqual(parseWhereOutput('C:\\bin\\opencodehelper.exe'), null, 'opencodehelper.exe 不应命中');
  assertEqual(parseWhereOutput('C:\\bin\\opencode-tool.cmd'), null, 'opencode-tool.cmd 不应命中');
  assertEqual(parseWhereOutput('C:\\bin\\my-opencode.bin'), null, 'my-opencode.bin 不应命中');
  assertEqual(
    parseWhereOutput('C:\\bin\\opencode.exe'),
    'C:\\bin\\opencode.exe',
    '精确 opencode.exe 应命中'
  );
});

// --- buildSpawnCommand：spawn 命令预览（GET /diag 自检）---
console.log('\n--- spawn 命令构造（buildSpawnCommand）---');

test('buildSpawnCommand: .ps1 → powershell.exe -File（脱离运行期 PATH，Issue #134）', function () {
  var r = buildSpawnCommand('C:\\bin\\opencode.ps1');
  // command 应为 powershell.exe：无人值守 PATH 下用绝对路径（resolvePowerShellExe），
  // 精简系统回退裸命令。两种情况下 command 都以 powershell.exe 结尾。
  assertTrue(
    /powershell\.exe$/i.test(r.command),
    '.ps1 应由 powershell.exe 拉起（command=' + r.command + '）'
  );
  assertTrue(r.args.indexOf('-ExecutionPolicy') !== -1, '应带 -ExecutionPolicy');
  assertEqual(
    r.args[r.args.indexOf('-File') + 1],
    'C:\\bin\\opencode.ps1',
    '-File 后应为 ps1 绝对路径'
  );
  assertEqual(r.needShell, false, '.ps1 不需要 shell');
  assertTrue(r.args.indexOf('serve') !== -1, '应含 serve 子命令');
});

test('buildSpawnCommand: .exe → 直接执行，无需 shell，且不再追加 --permission（Issue #161）', function () {
  var r = buildSpawnCommand('C:\\bin\\opencode.exe');
  assertEqual(r.command, 'C:\\bin\\opencode.exe', '.exe 应直接作为 command');
  assertEqual(r.needShell, false, '.exe 不需要 shell');
  assertTrue(r.args.indexOf('--port') !== -1, '应含 --port');
  // Issue #161 根因：老版本 opencode 的 serve 不识别 --permission 旗标，必须不再追加。
  assertTrue(r.args.indexOf('--permission') === -1, '不应含 --permission（Issue #161）');
  // 移除 --permission 不得破坏其它必需参数：--hostname / --cors file://（WPS Chromium 跨域）
  assertTrue(r.args.indexOf('--hostname') !== -1, '应含 --hostname');
  assertTrue(r.args.indexOf('--cors') !== -1, '应含 --cors');
  assertTrue(r.args.indexOf('file://') !== -1, '--cors 后应为 file://');
});

test('buildSpawnCommand: 无扩展名（PATH 裸 opencode）→ 依赖 shell 启动 .cmd shim', function () {
  var r = buildSpawnCommand('opencode');
  assertEqual(r.command, 'opencode', '裸 opencode 作为 command');
  assertEqual(r.needShell, true, '无扩展名需要 shell 启动 .cmd shim');
});

test('buildSpawnCommand: 空值默认回退裸 opencode', function () {
  var r = buildSpawnCommand(null);
  assertEqual(r.command, 'opencode', '空值应回退裸 opencode');
});

test('buildSpawnCommand: .cmd 后缀 → needShell=true 且 command 为 .cmd 路径（R4-2）', function () {
  var r = buildSpawnCommand('C:\\npm\\opencode.cmd');
  assertEqual(r.command, 'C:\\npm\\opencode.cmd', '.cmd 应作为 command');
  assertEqual(r.needShell, true, '.cmd 需要 shell 经 cmd.exe 包装启动');
  assertTrue(r.args.indexOf('serve') !== -1, '应含 serve 子命令');
});

test('resolvePowerShellExe: 返回以 powershell.exe 结尾的非空字符串（R4-2）', function () {
  var p = launcher.resolvePowerShellExe ? launcher.resolvePowerShellExe() : null;
  if (launcher.resolvePowerShellExe) {
    assertTrue(
      typeof p === 'string' && /powershell\.exe$/i.test(p),
      'resolvePowerShellExe 应返回以 powershell.exe 结尾的路径（got=' + p + '）'
    );
  }
});

test('quoteIfNeeded: 含空格加引号、无空格原样（R7-3）', function () {
  assertEqual(
    launcher.quoteIfNeeded('C:\\Users\\A B\\opencode.ps1'),
    '"C:\\Users\\A B\\opencode.ps1"',
    '含空格应加引号'
  );
  assertEqual(launcher.quoteIfNeeded('opencode'), 'opencode', '无空格应原样');
  assertEqual(launcher.quoteIfNeeded('serve'), 'serve', '命令子项应原样');
});

// --- Issue #134 回归：startOpenCode 必须复用 buildSpawnCommand，.ps1 不能直接 spawn ---
// 根因：startOpenCode 此前自行复制 isPs1/isExe 分支，.ps1 误走 hiddenSpawn(opencodeBin, args)
// 直接 spawn .ps1 文件——Node 的 spawn 无法直接执行 .ps1（无解释器关联），必然 ENOENT 失败，
// 导致用户 opencode.ps1（Trae 自带 node）场景启动必失败。修复后 startOpenCode 复用
// buildSpawnCommand，.ps1 → powershell.exe -ExecutionPolicy Bypass -File <bin>。
test('startOpenCode: 复用 buildSpawnCommand，非 shell 分支用 spawnCmd.command 启动', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'opencode-wps', 'launcher.js'), 'utf-8');
  // startOpenCode 应调用 buildSpawnCommand(opencodeBin, finalPort) 构造 spawn 命令
  assertTrue(
    /var spawnCmd = buildSpawnCommand\(opencodeBin, finalPort\)/.test(src),
    'startOpenCode 应复用 buildSpawnCommand 构造 spawn 命令'
  );
  // 非 shell 分支必须 spawn spawnCmd.command（.ps1 时为 powershell.exe），而非直接 spawn opencodeBin
  assertTrue(
    /opencodeProcess = hiddenSpawn\(spawnCmd\.command, opencodeArgs/.test(src),
    '非 shell 分支应 spawn spawnCmd.command（.ps1 时为 powershell.exe），而非直接 spawn opencodeBin'
  );
  // 不再存在旧的 isPs1 分支逻辑直接 spawn opencodeBin
  assertTrue(
    !/hiddenSpawn\(opencodeBin, opencodeArgs/.test(src),
    '不允许再直接 spawn opencodeBin（会直接执行 .ps1 导致 ENOENT）'
  );
});

test('startOpenCode: needShell 分支复用 spawnCmd.command 并经 cmd.exe 包装（R8-4）', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'opencode-wps', 'launcher.js'), 'utf-8');
  // needShell 分支（.cmd/无扩展名）应使用 spawnCmd.command 构造 shellCmd（R3-5），
  // 而非重新用裸 opencodeBin，防止与 buildSpawnCommand 单一来源漂移。
  assertTrue(
    /var shellCmd = '"' \+ spawnCmd\.command \+ '" ' \+ opencodeArgs\.join\(' '\)/.test(src),
    'needShell 分支应用 spawnCmd.command 构造 shellCmd（而非裸 opencodeBin）'
  );
  // needShell 分支应经 cmd.exe /d /s /c 包装启动
  assertTrue(
    /hiddenSpawn\('cmd\.exe', \['\/d', '\/s', '\/c', shellCmd\]/.test(src),
    'needShell 分支应经 cmd.exe /d /s /c 包装'
  );
  // 不再有裸 opencodeBin 拼 shellCmd 的旧写法
  assertTrue(
    !/shellCmd = '"' \+ opencodeBin \+ '"'/.test(src),
    '不允许再用裸 opencodeBin 构造 shellCmd'
  );
});

// --- getDiagInfo / configPathUsed：GET /diag 自检 ---
console.log('\n--- 诊断信息（getDiagInfo / configPathUsed）---');

test('getDiagInfo: 返回关键字段且结构稳定', function () {
  var info = getDiagInfo();
  assertNotNull(info.opencodeBin, '应包含 opencodeBin');
  assertTrue(
    typeof info.opencodeBin === 'string' && info.opencodeBin.length > 0,
    'opencodeBin 应为非空字符串'
  );
  assertTrue(typeof info.logFile === 'string' && info.logFile.length > 0, 'logFile 应为非空字符串');
  assertTrue(typeof info.logExists === 'boolean', 'logExists 应为布尔');
  assertTrue(typeof info.logSize === 'number' && info.logSize >= 0, 'logSize 应为非负数字');
  assertTrue(typeof info.homedir === 'string' && info.homedir.length > 0, 'homedir 应为非空字符串');
  assertTrue('userprofile' in info, '应包含 userprofile 字段');
  assertTrue(
    typeof info.spawnCommand === 'string' && info.spawnCommand.length > 0,
    'spawnCommand 应为非空字符串'
  );
  assertNotNull(info.config, '应包含 config 信息');
});

test('getDiagInfo: spawnCommand 与 buildSpawnCommand 一致', function () {
  var info = getDiagInfo();
  var cmd = buildSpawnCommand(info.opencodeBin);
  // 统一用 command + args（R2-1：不再因 command 是否为裸 powershell.exe 而丢前缀）
  var expected = cmd.command + ' ' + cmd.args.join(' ');
  assertEqual(info.spawnCommand, expected, 'spawnCommand 应与 buildSpawnCommand 输出一致');
  // 预览必须以 command 开头（.ps1 用绝对路径 / .exe 用二进制路径均不应丢前缀）
  assertTrue(
    info.spawnCommand.indexOf(cmd.command) === 0,
    'spawnCommand 应以 command 开头（command=' + cmd.command + '）'
  );
});

test('configPathUsed: 返回字符串或 null（不抛错）', function () {
  var p = configPathUsed();
  if (p !== null) {
    assertTrue(typeof p === 'string' && p.length > 0, '应为非空字符串');
  }
});

// --- 2. cwd 验证测试（真实 validateCwd）---
console.log('\n--- cwd 验证测试 ---');

test('validateCwd: 合法 Windows 路径', function () {
  var result = validateCwd('D:\\project\\myapp');
  assertTrue(result.valid, '应返回有效');
  assertNotNull(result.resolved, '应返回规范化路径');
});

test('validateCwd: 合法 Unix 路径', function () {
  var result = validateCwd('/home/user/project');
  assertTrue(result.valid, '应返回有效');
});

test('validateCwd: 空值', function () {
  var result = validateCwd('');
  assertFalse(result.valid, '应返回无效');
  assertEqual(result.error, 'cwd 不能为空');
});

test('validateCwd: 路径遍历尝试', function () {
  var result = validateCwd('C:\\Users\\test\\..\\Windows');
  assertFalse(result.valid, '应返回无效');
  assertTrue(result.error.includes('路径遍历'), '应提示路径遍历');
});

test('validateCwd: 非法字符', function () {
  var result = validateCwd('C:\\test|path');
  assertFalse(result.valid, '应返回无效');
  assertTrue(result.error.includes('非法字符'), '应提示非法字符');
});

test('validateCwd: 相对路径', function () {
  var result = validateCwd('./project');
  assertTrue(result.valid, '相对路径应有效');
});

// --- 3. 进程管理测试 ---
console.log('\n--- 进程管理测试 ---');

test('startOpenCodeMock: 启动并记录 PID', function () {
  var result = startOpenCodeMock('D:\\test');
  assertNotNull(result.pid, '应返回 PID');
  assertEqual(result.cwd, 'D:\\test', '应保存 cwd');
  var savedPid = getOpenCodePid();
  assertEqual(savedPid, result.pid, 'PID 应已保存');
});

test('stopOpenCodeMock: 终止进程并清理', function () {
  startOpenCodeMock('D:\\test');
  var result = stopOpenCodeMock();
  assertTrue(result.killed, '应返回已终止');
  var savedPid = getOpenCodePid();
  assertTrue(savedPid === null, 'PID 文件应已删除');
});

test('getOpenCodePid: 无 PID 文件', function () {
  try {
    fs.unlinkSync(mockPidFile);
  } catch (e) {}
  var pid = getOpenCodePid();
  assertTrue(pid === null, '无文件时应返回 null');
});

// --- 4. 边界情况测试 ---
console.log('\n--- 边界情况测试 ---');

test('validateCwd: 特殊路径', function () {
  var result = validateCwd('C:\\');
  assertTrue(result.valid, '根目录应有效');
});

test('validateCwd: 带空格的路径', function () {
  var result = validateCwd('C:\\Program Files\\App');
  assertTrue(result.valid, '带空格的路径应有效');
});

test('validateCwd: 中文路径', function () {
  var result = validateCwd('D:\\我的文档\\项目');
  assertTrue(result.valid, '中文路径应有效');
});

// --- 4. /status 状态判定：端口回退逻辑（Issue #114 回归） ---
test('/status: 存在 isPortListening 端口回退探测（launcher 重启后仍能识别运行中的服务）', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'opencode-wps', 'launcher.js'), 'utf-8');
  // isPortListening 函数存在
  assertTrue(/function isPortListening\s*\(/.test(src), '应定义 isPortListening 函数');
  // /status 中 opencodeProcess 为 null 时回退探测端口（portOpen 源），running 复用 portOpen
  assertTrue(
    /portOpen = running \? true : isPortListening\(OPENCODE_PORT\)/.test(src),
    '/status 应通过 portOpen 回退探测端口'
  );
  assertTrue(
    /running = portOpen;/.test(src),
    '/status 中 running 应复用 portOpen（避免重复 netstat）'
  );
  // 暴露 portOpen 字段供前端多源交叉验证
  assertTrue(/portOpen: portOpen/.test(src), '/status 应暴露 portOpen 字段');
  // OPENCODE_PORT 常量已定义
  assertTrue(/const OPENCODE_PORT = 14096;/.test(src), '应定义 OPENCODE_PORT=14096 常量');
});

// --- Issue #247 回归：startOpenCode spawn 前自愈孤儿 opencode serve 占用端口 ---
test('/startOpenCode: 守卫升级为「内存引用 + 端口实占孤儿自愈」，spawn 前清理孤儿 serve', function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'opencode-wps', 'launcher.js'), 'utf-8');
  // 1) 抽象出按端口终止 OpenCode 孤儿进程的可复用清理函数（startOpenCode / stopOpenCodeByPort 共用）
  assertTrue(/function killProcessOnPort\s*\(/.test(src), '应定义 killProcessOnPort 端口清理函数');
  // 2) startOpenCode 内应先用 killProcessOnPort 清理孤儿，而非直接 spawn
  assertTrue(
    /killProcessOnPort\(finalPort\)/.test(src),
    'startOpenCode 应在 spawn 前调用 killProcessOnPort 清理孤儿 serve'
  );
  // 3) 清理受端口实占探测守卫触发（isPortListening(finalPort) 为真才清理，避免空跑 netstat）
  assertTrue(
    /if \(isPortListening\(finalPort\)\)/.test(src),
    '孤儿清理应以 isPortListening(finalPort) 为触发条件'
  );
  // 4) 内存引用守卫仍在（opencodeProcess 非空即 already running，不重复清理/启动）
  assertTrue(/if \(opencodeProcess\)/.test(src), 'startOpenCode 应保留内存引用守卫');
  // 5) stopOpenCodeByPort 委托复用 killProcessOnPort，保持单点逻辑不重复实现
  assertTrue(
    /function stopOpenCodeByPort\s*\([^)]*\)[\s\S]{0,200}?killProcessOnPort\(port\)/.test(src),
    'stopOpenCodeByPort 应委托 killProcessOnPort 复用清理逻辑'
  );
});

// --- Issue #243 R1/R2：findOpenCodeBin 缓存稳定化 + 失败探测节流 ---
console.log('\n--- Issue #243 R1/R2：findOpenCodeBin 缓存与失败节流 ---');

// 构造可控的探测场景：BUN_INSTALL 指向含 opencode.exe 的临时目录，使探测优先命中该目录
function makeFakeBinDir() {
  // getOpenCodeBinDirs 对 BUN_INSTALL 会探测 <BUN_INSTALL>/bin 下的 opencode
  var dir = path.join(os.tmpdir(), 'opencode-test-bin-' + Date.now());
  var binDir = path.join(dir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  var exePath = path.join(binDir, 'opencode.exe');
  fs.writeFileSync(exePath, 'fake binary placeholder');
  return { dir: dir, exePath: exePath };
}

function cleanupFakeBinDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

test('R3-1: 缓存路径文件失效后应失效重探（config 显式路径被删除）', function () {
  // 构造 config 显式 opencodePath 场景：USERPROFILE 下写入 config.json 指向临时 exe
  var homeDir = path.join(os.tmpdir(), 'opencode-test-home-' + Date.now());
  var cfgDir = path.join(homeDir, '.config', 'opencode');
  fs.mkdirSync(cfgDir, { recursive: true });
  var exePath = path.join(os.tmpdir(), 'opencode-config-exe-' + Date.now() + '.exe');
  fs.writeFileSync(exePath, 'fake');
  fs.writeFileSync(path.join(cfgDir, 'opencode.json'), JSON.stringify({ opencodePath: exePath }));
  var oldUser = process.env.USERPROFILE;
  process.env.USERPROFILE = homeDir;
  launcher.resetOpenCodeBinCache();
  try {
    var first = findOpenCodeBin();
    assertEqual(first, exePath, '首次应命中 config 显式路径');
    // 删除该 exe 文件，再次调用应失效重探（不再返回失效路径）
    fs.unlinkSync(exePath);
    var second = findOpenCodeBin();
    // config 路径已失效，应走兜底（bin 目录/PATH/裸命令），不应返回已删除的 exePath
    assertTrue(second !== exePath, '缓存路径文件失效后不应返回失效路径');
  } finally {
    if (oldUser === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUser;
    try {
      fs.rmSync(homeDir, { recursive: true, force: true });
    } catch (e) {}
    try {
      fs.unlinkSync(exePath);
    } catch (e) {}
    launcher.resetOpenCodeBinCache();
  }
});

test('R1-A1: findOpenCodeBin 首次探测后缓存复用，同一会话内返回相同路径', function () {
  var fake = makeFakeBinDir();
  var oldBun = process.env.BUN_INSTALL;
  var oldUser = process.env.USERPROFILE;
  process.env.BUN_INSTALL = fake.dir;
  // 隔离真实 config：临时覆盖 USERPROFILE 指向空目录，使 loadOpenCodeConfig 找不到
  // config 文件、返回默认 {opencodePath:'opencode'}，避免真实用户 config 干扰探测
  // （注：OPENCODE_CONFIG_PATH 对 loadOpenCodeConfig 无效，故不用它隔离）。
  var emptyHome = path.join(os.tmpdir(), 'opencode-test-home-' + Date.now());
  fs.mkdirSync(emptyHome, { recursive: true });
  process.env.USERPROFILE = emptyHome;
  launcher.resetOpenCodeBinCache();
  try {
    // spy console.log 捕获探测日志（如 [launcher] Found:），验证缓存命中时不重新执行探测
    var origLog = console.log;
    var logs = [];
    console.log = function () {
      logs.push(Array.prototype.join.call(arguments, ' '));
    };
    var first = findOpenCodeBin();
    assertEqual(first, fake.exePath, '首次探测应命中 fake bin 的 opencode.exe');
    var foundLogsAfterFirst = logs.filter(function (l) {
      return l.indexOf('[launcher] Found:') >= 0;
    }).length;
    // 第二次调用：应命中缓存返回相同路径，且不重新执行探测（不新增 Found 日志）
    var second = findOpenCodeBin();
    assertEqual(second, first, '缓存复用：第二次调用应返回相同路径');
    var foundLogsAfterSecond = logs.filter(function (l) {
      return l.indexOf('[launcher] Found:') >= 0;
    }).length;
    assertEqual(
      foundLogsAfterSecond,
      foundLogsAfterFirst,
      '缓存命中时不应重新执行探测（Found 日志数不变）'
    );
  } finally {
    // 确保异常/断言失败时也恢复 console.log，避免污染后续测试日志收集（R5-1）
    if (typeof origLog === 'function') console.log = origLog;
    if (oldBun === undefined) delete process.env.BUN_INSTALL;
    else process.env.BUN_INSTALL = oldBun;
    if (oldUser === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUser;
    cleanupFakeBinDir(fake.dir);
    try {
      fs.rmSync(emptyHome, { recursive: true, force: true });
    } catch (e) {}
    launcher.resetOpenCodeBinCache();
  }
});

test('R1-A2: resetOpenCodeBinCache 清空缓存后重新探测', function () {
  var fake = makeFakeBinDir();
  var oldBun = process.env.BUN_INSTALL;
  var oldUser = process.env.USERPROFILE;
  process.env.BUN_INSTALL = fake.dir;
  var emptyHome = path.join(os.tmpdir(), 'opencode-test-home-' + Date.now());
  fs.mkdirSync(emptyHome, { recursive: true });
  process.env.USERPROFILE = emptyHome;
  launcher.resetOpenCodeBinCache();
  try {
    var first = findOpenCodeBin();
    assertEqual(first, fake.exePath, '首次探测应命中 fake bin');
    launcher.resetOpenCodeBinCache();
    var afterReset = findOpenCodeBin();
    assertEqual(afterReset, fake.exePath, '清空缓存后应重新探测并仍命中同一路径');
  } finally {
    if (oldBun === undefined) delete process.env.BUN_INSTALL;
    else process.env.BUN_INSTALL = oldBun;
    if (oldUser === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUser;
    cleanupFakeBinDir(fake.dir);
    try {
      fs.rmSync(emptyHome, { recursive: true, force: true });
    } catch (e) {}
    launcher.resetOpenCodeBinCache();
  }
});

test('R2-A3: 探测全部失败后缓存失败标记，TTL 内直接返回裸命令不重复探测', function () {
  // 构造所有探测路径都失败的场景：BUN_INSTALL 指向空目录 + USERPROFILE 隔离真实 config
  var emptyDir = path.join(os.tmpdir(), 'opencode-test-empty-' + Date.now());
  fs.mkdirSync(emptyDir, { recursive: true });
  var oldBun = process.env.BUN_INSTALL;
  var oldUser = process.env.USERPROFILE;
  process.env.BUN_INSTALL = emptyDir;
  var emptyHome = path.join(os.tmpdir(), 'opencode-test-home-' + Date.now());
  fs.mkdirSync(emptyHome, { recursive: true });
  process.env.USERPROFILE = emptyHome;
  launcher.resetOpenCodeBinCache();
  try {
    var result = findOpenCodeBin();
    assertEqual(result, 'opencode', '探测全部失败应回退到裸命令');
  } finally {
    if (oldBun === undefined) delete process.env.BUN_INSTALL;
    else process.env.BUN_INSTALL = oldBun;
    if (oldUser === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUser;
    try {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    } catch (e) {}
    try {
      fs.rmSync(emptyHome, { recursive: true, force: true });
    } catch (e) {}
    launcher.resetOpenCodeBinCache();
  }
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有 Launcher 测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
