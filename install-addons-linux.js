#!/usr/bin/env node
/**
 * OpenCode WPS - Linux 安装脚本
 *
 * 功能（对应 install-addons.js 的 Linux 分支）：
 * 1. 安装 WPS 加载项 (opencode-wps-linux) 到 ~/.local/share/Kingsoft/wps/jsaddons
 * 2. 编译 MCP 服务器
 * 3. 配置 OpenCode MCP（~/.config/opencode/opencode.json）
 * 4. 安装 Skills / Agents / Plugins
 * 5. 配置 XDG autostart 开机自启（launcher-linux.js）
 *
 * 参考：wps-skills (lc2panda/wps-skills) scripts/install.sh 的 Linux 分支经验
 * - 加载项目录名必须以 _ 结尾（publish.xml 的 url 字段）
 * - 需手动写 publish.xml / jsplugins.xml 注册文件
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

// ===== 1. WPS 加载项定义（Linux 独立目录） =====
const addon = {
  name: 'opencode-wps-linux',
  label: 'OpenCode AI',
  type: 'wps,et,wpp',
  src: path.resolve(rootDir, 'opencode-wps-linux'),
  exclude: ['node_modules', 'package.json'],
};

// WPS jsaddons 目录 (Linux)
const wpsJsaddonsDir = path.join(homeDir, '.local', 'share', 'Kingsoft', 'wps', 'jsaddons');

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
console.log('  OpenCode WPS - Linux 安装工具');
console.log('========================================\n');

// ===== 0. 前置检测：WPS Office 是否已安装 =====
function detectWpsInstalled() {
  try {
    // 1) 命令路径（wps/et/wpp 任一）
    const out = execSync('command -v wps || command -v et || command -v wpp || echo NONE', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (out && out !== 'NONE') return { ok: true, via: 'command: ' + out };
  } catch (e) {}
  // 2) 常见安装目录（deb 装到 /opt/kingsoft/wps-office，rpm 装到 /usr/lib/kingsoft 等）
  const commonDirs = [
    '/opt/kingsoft/wps-office',
    '/usr/lib/kingsoft/wps-office',
    path.join(homeDir, '.local', 'share', 'Kingsoft', 'wps'),
  ];
  for (let i = 0; i < commonDirs.length; i++) {
    if (fs.existsSync(commonDirs[i])) return { ok: true, via: 'dir: ' + commonDirs[i] };
  }
  return { ok: false };
}

const wpsCheck = detectWpsInstalled();
if (!wpsCheck.ok) {
  console.error('\n❌ 未检测到 WPS Office（Linux 版）。');
  console.error('   请先从 https://linux.wps.cn 下载并安装 WPS Office（deb/rpm）后重试。');
  console.error('   检测依据：command -v wps/et/wpp 或常见安装目录。\n');
  process.exit(1);
}
console.log('  ✓ 已检测到 WPS Office（' + wpsCheck.via + '）\n');

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
  console.error('\n❌ 第 1 步失败：无法安装 WPS 加载项。后续步骤依赖加载项，终止安装。');
  process.exit(1);
}

// ============================================================
// 第 2 步: 写注册文件 (publish.xml / jsplugins.xml / authwebsite.xml)
// ============================================================
console.log('\n【第 2 步】写入 WPS 注册文件');
recordStep('write_register_files');

try {
  // publish.xml - 开发者模式注册
  const publishXmlPath = path.join(wpsJsaddonsDir, 'publish.xml');
  const publishContent =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<jsplugins>',
      '    <jsplugin enable="enable_dev" name="' +
        addon.name +
        '" url="' +
        addon.name +
        '_" type="' +
        addon.type +
        '"/>',
      '</jsplugins>',
    ].join('\n') + '\n';
  fs.writeFileSync(publishXmlPath, publishContent, 'utf-8');
  console.log('  已写入 publish.xml');

  // jsplugins.xml - 普通注册
  const jspluginsXmlPath = path.join(wpsJsaddonsDir, 'jsplugins.xml');
  const jspluginsContent =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<jsplugins>',
      '  <jsplugin type="' +
        addon.type +
        '" enable="true" name="' +
        addon.name +
        '" url="' +
        addon.name +
        '_"/>',
      '</jsplugins>',
    ].join('\n') + '\n';
  fs.writeFileSync(jspluginsXmlPath, jspluginsContent, 'utf-8');
  console.log('  已写入 jsplugins.xml');

  // authwebsite.xml - 授权站点（Linux 加载项需要；必须显式列出本机 HTTP 站点，否则 WPS 沙箱拦截轮询/launcher 请求）
  const authwebsiteXmlPath = path.join(wpsJsaddonsDir, 'authwebsite.xml');
  const authSites = [
    'http://127.0.0.1:58891', // 轮询服务器（MCP 侧）
    'http://127.0.0.1:14097', // launcher
    'http://127.0.0.1:14096', // opencode 服务
  ];
  const authwebsiteContent =
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<AuthWebsiteList>',
      authSites
        .map(function (site) {
          return '    <Website url="' + site + '"/>';
        })
        .join('\n'),
      '</AuthWebsiteList>',
    ].join('\n') + '\n';
  if (fs.existsSync(authwebsiteXmlPath)) {
    // 已有文件：追加缺失的站点（避免覆盖用户自定义授权）
    let existing = '';
    try {
      existing = fs.readFileSync(authwebsiteXmlPath, 'utf-8');
    } catch (e) {}
    const missing = authSites.filter(function (site) {
      return existing.indexOf(site) === -1;
    });
    if (missing.length > 0) {
      // 无闭合标签时重建整个文件：以模板为基础 + 保留用户已有站点（去重），
      // 避免 append 到无闭合标签的文件产生损坏 XML（第 21 轮终审 info）
      if (existing.indexOf('</AuthWebsiteList>') === -1) {
        const userSites = [];
        const siteRe = /<Website\s+url=["']([^"']+)["']\s*\/>/g;
        let m = null;
        while ((m = siteRe.exec(existing)) !== null) {
          if (userSites.indexOf(m[1]) === -1) userSites.push(m[1]);
        }
        const allSites = userSites.concat(
          authSites.filter(function (s) {
            return userSites.indexOf(s) === -1;
          })
        );
        const rebuilt =
          [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<AuthWebsiteList>',
            allSites
              .map(function (site) {
                return '    <Website url="' + site + '"/>';
              })
              .join('\n'),
            '</AuthWebsiteList>',
          ].join('\n') + '\n';
        fs.writeFileSync(authwebsiteXmlPath, rebuilt, 'utf-8');
        console.log(
          '  已重建 authwebsite.xml（原文件无闭合标签，合并 ' + allSites.length + ' 个站点）'
        );
      } else {
        const lines = existing.trim().split(/\n/);
        // 在 </AuthWebsiteList> 前插入缺失站点
        const closeIdx = lines.lastIndexOf('</AuthWebsiteList>');
        const inserts = missing.map(function (site) {
          return '    <Website url="' + site + '"/>';
        });
        if (closeIdx !== -1) {
          lines.splice(closeIdx, 0, inserts.join('\n'));
        } else {
          lines.push(inserts.join('\n'));
        }
        fs.writeFileSync(authwebsiteXmlPath, lines.join('\n') + '\n', 'utf-8');
        console.log('  已合并授权站点到 authwebsite.xml: ' + missing.join(', '));
      }
    } else {
      console.log('  authwebsite.xml 已包含全部授权站点，跳过');
    }
  } else {
    fs.writeFileSync(authwebsiteXmlPath, authwebsiteContent, 'utf-8');
    console.log('  已写入 authwebsite.xml（授权 127.0.0.1:58891/14097/14096）');
  }
} catch (e) {
  handleError('write_register_files', e);
  // 注册文件是 WPS 识别加载项的关键（jsplugins.xml/publish.xml），写入失败等于插件不可用，必须中止
  // （与第 1 步失败 exit(1) 的语义一致，不能让用户看到「安装完成」却实际无法加载）
  console.error(
    '\n❌ 第 2 步失败：WPS 注册文件写入失败。插件将无法被 WPS 识别，请检查目录权限后重试。'
  );
  process.exit(1);
}

// ============================================================
// 第 3 步: 编译 MCP 服务器
// ============================================================
console.log('\n【第 3 步】编译 MCP 服务器');
recordStep('build_mcp_server');

if (fsEx.existsSync(mcpServer.src)) {
  console.log('  源目录: ' + mcpServer.src);

  let depsInstalled = false;
  try {
    console.log('  正在安装依赖 (npm install)...');
    // 加 timeout（10 分钟），避免网络慢/依赖多时安装脚本无限卡死
    execSync('npm install', { cwd: mcpServer.src, stdio: 'inherit', timeout: 600000 });
    console.log('  依赖安装完成');
    depsInstalled = true;
  } catch (e) {
    console.error('  ✗ npm install 失败（详见上方输出）');
    console.error(
      '    MCP 服务器无法编译，插件将不可用。请手动运行: cd ' +
        mcpServer.src +
        ' && npm install 后重试。'
    );
    process.exit(1);
  }

  if (depsInstalled) {
    try {
      console.log('  正在编译 (npm run build)...');
      // 加 timeout（10 分钟）
      execSync('npm run build', { cwd: mcpServer.src, stdio: 'inherit', timeout: 600000 });
      console.log('  编译完成');
    } catch (e) {
      console.error('  ✗ npm run build 失败（详见上方输出）');
      console.error(
        '    MCP 服务器编译失败，插件将不可用。请手动运行: cd ' +
          mcpServer.src +
          ' && npm run build 后重试。'
      );
      process.exit(1);
    }
  } else {
    console.log('  [跳过] 依赖安装失败，跳过 npm run build（先修复依赖安装）');
  }
} else {
  console.log('  [跳过] MCP 服务器源目录不存在: ' + mcpServer.src);
}

// ============================================================
// 第 4 步: 配置 OpenCode MCP 服务器
// ============================================================
console.log('\n【第 4 步】配置 OpenCode MCP 服务器');
recordStep('configure_opencode_mcp');

const mcpEntryPath = path.resolve(mcpServer.src, mcpServer.entryPoint);

if (fsEx.existsSync(mcpEntryPath)) {
  fsEx.ensureDirSync(opencodeConfigDir);

  function stripJsoncComments(text) {
    return text.replace(/\\"|"(?:[^"\\]|\\.)*"|\/\/.*|\/\*[\s\S]*?\*\//g, function (m) {
      return m.startsWith('"') || m.startsWith('\\"') ? m : '';
    });
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
      // 深合并：以模板为源、用户已有配置为目标，保留用户对其它 mcp 条目的自定义配置
      // （数组采用 concat 合并去重，避免覆盖用户已有配置）
      function deepMerge(target, source) {
        for (var key in source) {
          if (source.hasOwnProperty(key)) {
            if (Array.isArray(source[key])) {
              if (!target[key] || !Array.isArray(target[key])) {
                target[key] = [];
              }
              source[key].forEach(function (item) {
                if (target[key].indexOf(item) === -1) {
                  target[key].push(item);
                }
              });
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
              // 用户已有值优先，模板值兜底
              if (target[key] === undefined) {
                target[key] = source[key];
              }
            }
          }
        }
      }
      deepMerge(existing, config);
      config = existing;
      console.log('  已合并已有配置（用户配置优先）');
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
  // 仅当用户没有自定义 wps-office 条目时才写入，避免绕过 deepMerge 覆盖用户已有配置（自定义 command/env 等）
  if (config.mcp[mcpServer.name]) {
    console.log(
      '  [跳过] 用户已有 ' +
        mcpServer.name +
        ' MCP 配置，保留用户自定义（如需覆盖请手动编辑 ' +
        opencodeConfigPath +
        '）'
    );
  } else {
    config.mcp[mcpServer.name] = {
      command: [process.execPath, mcpEntryPath],
      type: 'local',
    };
  }

  fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log('  已配置 MCP 服务器: ' + mcpServer.name);
  console.log('  配置文件: ' + opencodeConfigPath);
} else {
  console.log('  [跳过] MCP 编译产物不存在，请先编译');
}

// ============================================================
// 第 5 步: 安装 Skills
// ============================================================
console.log('\n【第 5 步】安装 OpenCode Skills');
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
// 第 6 步: 安装 Agents
// ============================================================
console.log('\n【第 6 步】安装 OpenCode Agents');
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
// 第 7 步: 安装 OpenCode 插件
// ============================================================
console.log('\n【第 7 步】安装 OpenCode 插件');
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
// 第 8 步: 配置 XDG autostart 开机自启
// ============================================================
console.log('\n【第 8 步】配置 XDG autostart 开机自启');
recordStep('configure_autostart');

const launcherPath = path.resolve(rootDir, 'launcher-linux.js');
const autostartDir = path.join(homeDir, '.config', 'autostart');
const desktopPath = path.join(autostartDir, 'opencode-wps-launcher.desktop');

try {
  fsEx.ensureDirSync(autostartDir);

  const nodePath = process.execPath; // 使用当前 Node 绝对路径
  const desktopContent = [
    '[Desktop Entry]',
    'Type=Application',
    'Name=OpenCode WPS Launcher',
    'Comment=OpenCode AI WPS Office launcher (Linux)',
    'Exec=' + nodePath + ' ' + launcherPath,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');

  fs.writeFileSync(desktopPath, desktopContent, 'utf-8');
  console.log('  已生成 autostart: ' + desktopPath);

  try {
    // execFile 参数数组传递，避免路径含空格/特殊字符被 shell 解释（命令注入）
    require('child_process').execFileSync('chmod', ['+x', desktopPath], {
      stdio: 'pipe',
      timeout: 10000,
    });
    console.log('  已设置可执行权限');
  } catch (e) {
    console.log('  [警告] chmod 失败: ' + e.message);
  }
} catch (e) {
  handleError('configure_autostart', e);
}

// ===== 完成 =====
console.log('\n========================================');
console.log('安装完成！');
console.log('');
console.log('已安装组件:');
console.log('  1. WPS 加载项 (opencode-wps-linux)');
console.log('  2. MCP 服务器');
console.log('  3. OpenCode MCP 配置');
console.log('  4. Skills / Agents / Plugins');
console.log('  5. XDG autostart 开机自启');
console.log('');
console.log('后续步骤:');
console.log('  - 重启 WPS Office 以加载插件');
console.log('  - MCP 服务器通过 npx opencode serve 启动');
console.log('  - 加载项会自动轮询连接 MCP 服务器');
console.log('');
console.log('Linux WPS 加载项安装目录:');
console.log('  ' + path.join(wpsJsaddonsDir, addon.name + '_'));
console.log('========================================');

if (installState.errors.length > 0) {
  console.log('\n⚠️ 安装过程中有 ' + installState.errors.length + ' 个警告:');
  installState.errors.forEach(function (e, i) {
    console.log('  ' + (i + 1) + '. ' + e.step + ': ' + e.error);
  });
}
