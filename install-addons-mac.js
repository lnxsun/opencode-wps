/**
 * OpenCode WPS - Mac 安装脚本
 *
 * 功能：
 * 1. 安装 WPS 加载项 (opencode-wps-assistant) 到 WPS jsaddons 目录
 * 2. 编译 MCP 服务器
 * 3. 配置 OpenCode MCP
 * 4. 安装 Skills / Agents / Plugins
 * 5. 配置 launchd 开机自启
 */

const fs = require('fs');
const fsEx = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { deriveSkillDocs } = require(path.join(__dirname, 'scripts', 'lib', 'derive-skill-docs.js'));

const rootDir = __dirname;
const homeDir = process.env.HOME || require('os').homedir();

// ===== 安装状态追踪 =====
const installState = { errors: [] };
function recordStep(name) {
  console.log('  ✓ ' + name);
}
function handleError(name, err) {
  const msg = err.message || String(err);
  installState.errors.push({ step: name, error: msg });
  console.error('  ✗ ' + name + ': ' + msg);
}

// ===== 1. WPS 加载项定义 =====
const addon = {
  name: 'opencode-wps-assistant',
  label: 'OpenCode AI',
  type: 'wps,et,wpp',
  src: path.resolve(rootDir, 'opencode-wps-assistant'),
  exclude: ['node_modules', 'package.json'],
};

// WPS jsaddons 目录 (Mac)
const wpsJsaddonsDir = path.join(
  homeDir,
  'Library',
  'Containers',
  'com.kingsoft.wps',
  'Data',
  'Documents',
  'jsaddons'
);

// ===== 2. MCP 服务器 =====
const mcpServer = {
  name: 'wps-office',
  src: path.resolve(rootDir, 'wps-office-mcp'),
  entryPoint: 'dist/index.js',
};

// ===== 3. Skills / Agents / Plugins 路径 =====
const skillsSrcDir = path.resolve(rootDir, 'skills');
const opencodeSkillsDir = path.join(homeDir, '.opencode', 'skills');
const agentsSrcDir = path.resolve(rootDir, 'agents');
const opencodeAgentsDir = path.join(homeDir, '.config', 'opencode', 'agents');
const opencodeAgentsProjectDir = path.join(homeDir, '.opencode', 'agents');
const opencodeConfigDir = path.join(homeDir, '.config', 'opencode');
const opencodeConfigPath = path.join(opencodeConfigDir, 'opencode.json');
const opencodeConfigTemplate = path.resolve(rootDir, '.opencode', 'opencode.jsonc');
const pluginSrcDir = path.resolve(rootDir, '.opencode', 'plugins');
const pluginDstDir = path.join(opencodeConfigDir, 'plugins');

console.log('========================================');
console.log('  OpenCode WPS - Mac 安装工具');
console.log('========================================\n');

// ============================================================
// 第 1 步: 安装 WPS 加载项
// ============================================================
console.log('【第 1 步】安装 WPS 加载项');
recordStep('install_wps_addon');

try {
  const destDir = path.join(wpsJsaddonsDir, addon.name + '_');
  console.log('  目标: ' + destDir);

  fsEx.ensureDirSync(wpsJsaddonsDir);
  fsEx.emptyDirSync(destDir);

  const items = fs.readdirSync(addon.src);
  let count = 0;
  items.forEach(item => {
    if (addon.exclude.includes(item)) return;
    fsEx.copySync(path.join(addon.src, item), path.join(destDir, item), { overwrite: true });
    count++;
  });
  console.log('  已复制 ' + count + ' 个文件');
} catch (e) {
  handleError('install_wps_addon', e);
}

// ============================================================
// 第 2 步: 编译 MCP 服务器
// ============================================================
console.log('\n【第 2 步】编译 MCP 服务器');
recordStep('build_mcp_server');

if (fsEx.existsSync(mcpServer.src)) {
  console.log('  源目录: ' + mcpServer.src);

  try {
    console.log('  正在安装依赖 (npm install)...');
    // 显式 timeout：网络异常/依赖下载慢时避免 npm install 挂起整机安装（与 launcher-mac 的 execSync timeout 语义对齐）
    execSync('npm install', { cwd: mcpServer.src, stdio: 'pipe', timeout: 120000 });
    console.log('  依赖安装完成');
  } catch (e) {
    console.log('  [警告] npm install 失败，请手动运行: cd ' + mcpServer.src + ' && npm install');
  }

  try {
    console.log('  正在编译 (npm run build)...');
    execSync('npm run build', { cwd: mcpServer.src, stdio: 'pipe', timeout: 120000 });
    console.log('  编译完成');
  } catch (e) {
    console.log(
      '  [警告] npm run build 失败，请手动运行: cd ' + mcpServer.src + ' && npm run build'
    );
  }
} else {
  console.log('  [跳过] MCP 服务器源目录不存在: ' + mcpServer.src);
}

// ============================================================
// 第 3 步: 配置 OpenCode MCP 服务器
// ============================================================
console.log('\n【第 3 步】配置 OpenCode MCP 服务器');
recordStep('configure_opencode_mcp');

const mcpEntryPath = path.resolve(mcpServer.src, mcpServer.entryPoint);

if (fsEx.existsSync(mcpEntryPath)) {
  fsEx.ensureDirSync(opencodeConfigDir);

  function stripJsoncComments(text) {
    // 安全去注释：只在字符串字面量外删除 // 与 /* */ 注释，
    // 避免误删 URL/路径中的 //（如 https:// 或 "//" 形式）（原正则 \/\/.* 会把 URL 的 // 当注释删除导致 JSON 损坏）
    var out = '';
    var i = 0;
    var len = text.length;
    var inString = false;
    var inLineComment = false;
    var inBlockComment = false;
    while (i < len) {
      var ch = text[i];
      var next = i + 1 < len ? text[i + 1] : '';
      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          out += ch;
        }
        i++;
        continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (inString) {
        out += ch;
        if (ch === '\\' && i + 1 < len) {
          out += text[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') inString = false;
        i++;
        continue;
      }
      if (ch === '"') {
        inString = true;
        out += ch;
        i++;
        continue;
      }
      if (ch === '/' && next === '/') {
        inLineComment = true;
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  let config = {};
  if (fsEx.existsSync(opencodeConfigTemplate)) {
    try {
      const raw = fs.readFileSync(opencodeConfigTemplate, 'utf-8');
      config = JSON.parse(stripJsoncComments(raw));
      console.log('  已加载配置模板');
    } catch (e) {
      console.log('  [警告] 无法解析配置模板: ' + e.message);
      config = {};
    }
  }

  if (fsEx.existsSync(opencodeConfigPath)) {
    try {
      const raw = fs.readFileSync(opencodeConfigPath, 'utf-8');
      const existing = JSON.parse(raw.replace(/^\uFEFF/, ''));
      function deepMerge(target, source) {
        for (var key in source) {
          if (source.hasOwnProperty(key)) {
            if (Array.isArray(source[key])) {
              target[key] = source[key].slice();
            } else if (
              typeof source[key] === 'object' &&
              source[key] !== null &&
              !Array.isArray(source[key])
            ) {
              if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                target[key] = {};
              }
              deepMerge(target[key], source[key]);
            } else {
              target[key] = source[key];
            }
          }
        }
      }
      deepMerge(config, existing);
      console.log('  已合并已有配置');
    } catch (e) {
      console.log('  [警告] 无法合并已有配置: ' + e.message);
    }
  }

  // 替换配置模板中的占位符
  function replacePlaceholders(obj) {
    for (var key in obj) {
      if (typeof obj[key] === 'string') {
        if (obj[key] === '___AGNES_API_KEY___') {
          var envVal = process.env.AGNES_API_KEY;
          if (envVal) obj[key] = envVal;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        replacePlaceholders(obj[key]);
      }
    }
  }
  replacePlaceholders(config);

  if (!config.mcp) config.mcp = {};
  config.mcp[mcpServer.name] = {
    command: [process.execPath, mcpEntryPath],
    type: 'local',
  };

  fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log('  已配置 MCP 服务器: ' + mcpServer.name);
  console.log('  配置文件: ' + opencodeConfigPath);
} else {
  console.log('  [跳过] MCP 编译产物不存在，请先编译');
}

// ============================================================
// 第 4 步: 安装 Skills
// ============================================================
console.log('\n【第 4 步】安装 OpenCode Skills');
recordStep('install_skills');

if (fsEx.existsSync(skillsSrcDir)) {
  const skills = fs
    .readdirSync(skillsSrcDir)
    .filter(name => fsEx.existsSync(path.join(skillsSrcDir, name, 'SKILL.md')));
  if (skills.length > 0) {
    fsEx.ensureDirSync(opencodeSkillsDir);
    skills.forEach(name => {
      fsEx.copySync(path.join(skillsSrcDir, name), path.join(opencodeSkillsDir, name), {
        overwrite: true,
      });
      // 单一来源方案 C：从根 docs/ 派生 skill 引用的 docs（消除 B2 镜像漂移）
      const dr = deriveSkillDocs({
        rootDir,
        skillSrcDir: path.join(skillsSrcDir, name),
        skillDestDir: path.join(opencodeSkillsDir, name),
      });
      if (dr.unmet.length > 0) {
        handleError(
          'derive_skill_docs',
          name +
            ' 的 SKILL.md 引用 [' +
            dr.unmet.join(', ') +
            '] 无法从根 docs/ 派生，安装后 skill 将断链，请先补充根 docs/ 源文件'
        );
      }
      console.log('  已安装: ' + name);
    });
    console.log('  Skills 目录: ' + opencodeSkillsDir);
  } else {
    console.log('  [跳过] 未找到有效的 skills');
  }
} else {
  console.log('  [跳过] Skills 源目录不存在');
}

// ============================================================
// 第 5 步: 安装 Agents
// ============================================================
console.log('\n【第 5 步】安装 OpenCode Agents');
recordStep('install_agents');

if (fsEx.existsSync(agentsSrcDir)) {
  const files = fs.readdirSync(agentsSrcDir).filter(f => f.endsWith('.md'));
  if (files.length > 0) {
    fsEx.ensureDirSync(opencodeAgentsDir);
    fsEx.ensureDirSync(opencodeAgentsProjectDir);
    files.forEach(file => {
      fsEx.copySync(path.join(agentsSrcDir, file), path.join(opencodeAgentsDir, file), {
        overwrite: true,
      });
      fsEx.copySync(path.join(agentsSrcDir, file), path.join(opencodeAgentsProjectDir, file), {
        overwrite: true,
      });
      console.log('  已安装: ' + file);
    });
  } else {
    console.log('  [跳过] 未找到有效的 agents');
  }
} else {
  console.log('  [跳过] Agents 源目录不存在');
}

// ============================================================
// 第 6 步: 安装 OpenCode 插件
// ============================================================
console.log('\n【第 6 步】安装 OpenCode 插件');
recordStep('install_opencode_plugins');

if (fsEx.existsSync(pluginSrcDir)) {
  const files = fs.readdirSync(pluginSrcDir).filter(f => f.endsWith('.js'));
  if (files.length > 0) {
    fsEx.ensureDirSync(pluginDstDir);
    files.forEach(file => {
      fsEx.copySync(path.join(pluginSrcDir, file), path.join(pluginDstDir, file), {
        overwrite: true,
      });
      console.log('  已安装: ' + file);
    });
  } else {
    console.log('  [跳过] 未找到有效的插件');
  }
} else {
  console.log('  [跳过] 插件源目录不存在');
}

// ============================================================
// 第 7 步: 配置 launchd 开机自启
// ============================================================
console.log('\n【第 7 步】配置 launchd 开机自启');
recordStep('configure_launchd');

const launchAgentDir = path.join(homeDir, 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgentDir, 'com.opencode.launcher.plist');

// 说明：assistant 目录下的 launcher-mac.js 不存在（实际文件在根目录），
// 因此直接使用 rootDir 下的 launcher-mac.js，并校验其存在 + wps-auto.sh 存在（切换脚本缺失时安装无意义）
const rootLauncher = path.resolve(rootDir, 'launcher-mac.js');
if (
  fsEx.existsSync(rootLauncher) &&
  fsEx.existsSync(path.resolve(rootDir, 'opencode-wps-assistant', 'wps-auto.sh'))
) {
  // 使用 rootDir 下的 launcher-mac.js
  const actualLauncher = rootLauncher;

  fsEx.ensureDirSync(launchAgentDir);

  const nodePath = process.execPath; // 使用当前 Node 绝对路径
  const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node');
  let nvmBinDir = '';
  try {
    // sort 默认字典序：v14.0.0 会排在 v9.0.0 前面，需用版本号比较取最新
    const versions = fs
      .readdirSync(nvmDir)
      .filter(function (v) {
        return v.indexOf('v') === 0;
      })
      .sort(function (a, b) {
        const pa = a.substring(1).split('.').map(Number);
        const pb = b.substring(1).split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        }
        return 0;
      });
    if (versions.length > 0) nvmBinDir = path.join(nvmDir, versions[versions.length - 1], 'bin');
  } catch (e) {}
  const pathDirs = ['/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin', nvmBinDir]
    .filter(Boolean)
    .join(':');

  // plist 中 XML 字符串需转义（路径可能含 & < > 等字符，如用户目录带特殊字符）
  function xmlEscape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.opencode.launcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>${xmlEscape(nodePath)}</string>
        <string>${xmlEscape(actualLauncher)}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${xmlEscape(path.join(homeDir, 'Library', 'Logs', 'opencode-launcher.log'))}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(path.join(homeDir, 'Library', 'Logs', 'opencode-launcher.err'))}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${xmlEscape(pathDirs)}</string>
    </dict>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plistContent, 'utf-8');
  console.log('  已生成 launchd plist: ' + plistPath);

  try {
    // 先卸载旧注册（bootout 忽略不存在错误），再用 bootstrap 注册（launchctl load 在 macOS 10.10+ 已废弃）
    try {
      execSync('launchctl bootout gui/' + process.getuid() + ' ' + plistPath, {
        stdio: 'pipe',
        timeout: 10000,
      });
    } catch (e) {}
    execSync('launchctl bootstrap gui/' + process.getuid() + ' ' + plistPath, {
      stdio: 'pipe',
      timeout: 10000,
    });
    console.log('  已注册开机自启: com.opencode.launcher');
  } catch (e) {
    console.log('  [警告] launchctl bootstrap 失败，请手动运行:');
    console.log('    launchctl bootstrap gui/' + process.getuid() + ' ' + plistPath);
  }
} else {
  console.log('  [跳过] launcher-mac.js 不存在');
}

// ===== 完成 =====
console.log('\n========================================');
console.log('安装完成！');
console.log('');
console.log('已安装组件:');
console.log('  1. WPS 加载项 (opencode-wps-assistant)');
console.log('  2. MCP 服务器');
console.log('  3. OpenCode MCP 配置');
console.log('  4. Skills / Agents / Plugins');
console.log('  5. launchd 开机自启');
console.log('');
console.log('后续步骤:');
console.log('  - 重启 WPS Office 以加载插件');
console.log('  - MCP 服务器通过 npx opencode serve 启动');
console.log('  - 加载项会自动轮询连接 MCP 服务器');
console.log('');
console.log('Mac WPS 加载项安装目录:');
console.log('  ' + path.join(wpsJsaddonsDir, addon.name + '_'));
console.log('========================================');

if (installState.errors.length > 0) {
  console.log('\n⚠️ 安装过程中有 ' + installState.errors.length + ' 个警告:');
  installState.errors.forEach(function (e, i) {
    console.log('  ' + (i + 1) + '. ' + e.step + ': ' + e.error);
  });
}
