const fs = require('fs');
const fsEx = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const homeDir = process.env.USERPROFILE || process.env.HOME;

// ===== 安装状态追踪 =====
const installState = {
    errors: []
};

function recordStep(stepName) {
    console.log('  ✓ ' + stepName);
}

function handleError(stepName, error) {
    const errMsg = error.message || String(error);
    installState.errors.push({ step: stepName, error: errMsg });
    console.error('  ✗ ' + stepName + ': ' + errMsg);
}

// ===== 1. WPS 插件定义 =====
const addons = [
    {
        name: 'opencode-wps',
        label: 'OpenCode AI',
        type: 'wps,et,wpp',
        src: path.resolve(rootDir, 'opencode-wps'),
        exclude: [
            '.debugTemp', 'wps-addon-build',
            'DESIGN.md', 'browsertest.html', '_sse_test.js',
            'opencode-proxy.js', 'start-proxy.bat',
            'wpsjs.config.js', 'server.log', 'temp.txt', 'taskpane.html.bak',
            'package.json'
        ]
    },
];

// 已合并/废弃的旧插件（安装时自动清理）
const mergedAddons = ['test-wps-addon', 'wps-claude-addon', 'wps-claude-assistant'];

// ===== 2. MCP 服务器 =====
const mcpServer = {
    name: 'wps-office',
    src: path.resolve(rootDir, 'wps-office-mcp'),
    entryPoint: 'dist/index.js',  // 编译后的入口
};

// ===== 3. Skills =====
const skillsSrcDir = path.resolve(rootDir, 'skills');
const opencodeSkillsDir = path.join(homeDir, '.opencode', 'skills');

// ===== 4. Agents =====
const agentsSrcDir = path.resolve(rootDir, 'agents');
const opencodeAgentsDir = path.join(homeDir, '.config', 'opencode', 'agents');
const opencodeAgentsProjectDir = path.join(homeDir, '.opencode', 'agents');

// ===== 4. OpenCode 全局配置 =====
const opencodeConfigDir = path.join(homeDir, '.config', 'opencode');
const opencodeConfigPath = path.join(opencodeConfigDir, 'opencode.json');
const opencodeConfigTemplate = path.resolve(rootDir, '.opencode', 'opencode.jsonc');

// ===== 5. 废弃的 Claude 目录（需要清理） =====
const staleClaudeDirs = [
    path.join(homeDir, '.claude', 'skills'),
    path.join(homeDir, '.claude', 'plugins', 'wps-mcp-skills'),
];

const jsaddonsDir = path.join(process.env.APPDATA, 'kingsoft', 'wps', 'jsaddons');

console.log('========================================');
console.log('  WPS Office AI 安装工具');
console.log('========================================');
console.log('  CWD 将在插件面板中由用户指定');
console.log('  不再自动注册开机自启任务\n');

// ============================================================
// 第 1 步: 安装 WPS 插件
// ============================================================
console.log('【第 1 步】安装 WPS 插件');
console.log('目标目录: ' + jsaddonsDir + '\n');
recordStep('install_wps_plugin');

fsEx.ensureDirSync(jsaddonsDir);

addons.forEach(addon => {
    const destDir = path.join(jsaddonsDir, addon.name + '_');
    console.log('  安装: ' + addon.name + ' (' + addon.label + ')');

    if (!fsEx.existsSync(addon.src)) {
        console.log('    [跳过] 源目录不存在: ' + addon.src);
        return;
    }

    fsEx.emptyDirSync(destDir);

    const items = fs.readdirSync(addon.src);
    let copiedCount = 0;

    items.forEach(item => {
        if (addon.exclude.includes(item)) return;
        const srcPath = path.join(addon.src, item);
        const destPath = path.join(destDir, item);
        fsEx.copySync(srcPath, destPath, { overwrite: true });
        copiedCount++;
    });

    console.log('    已复制 ' + copiedCount + ' 个文件');

    // 动态注入安装路径（修复硬编码路径问题）
    if (addon.name === 'opencode-wps') {
        const mainJsPath = path.join(destDir, 'main.js');
        if (fsEx.existsSync(mainJsPath)) {
            const mainJsContent = fs.readFileSync(mainJsPath, 'utf-8');
            const actualPath = destDir.replace(/\\/g, '\\\\');
            const updatedContent = mainJsContent.replace(/___WPS_ADDON_PATH___/g, () => actualPath);
            if (updatedContent === mainJsContent) {
                console.log('    [警告] main.js 中未找到 ___WPS_ADDON_PATH___，路径注入失败');
            } else {
                fs.writeFileSync(mainJsPath, updatedContent, 'utf-8');
                console.log('    已注入安装路径: ' + destDir);
            }
        }

        // 注入用户主目录到 config.js（修复 CWD 硬编码问题）
        const configJsPath = path.join(destDir, 'config.js');
        if (fsEx.existsSync(configJsPath)) {
            const configJsContent = fs.readFileSync(configJsPath, 'utf-8');
            const userHome = process.env.USERPROFILE || require('os').homedir();
            const updatedConfig = configJsContent.replace(/___WPS_USER_HOME___/g, () => userHome.replace(/\\/g, '\\\\'));
            if (updatedConfig === configJsContent) {
                console.log('    [警告] config.js 中未找到 ___WPS_USER_HOME___，用户目录注入失败');
            } else {
                fs.writeFileSync(configJsPath, updatedConfig, 'utf-8');
                console.log('    已注入用户目录: ' + userHome);
            }
        }
    }
});

// 清理已合并的旧插件
mergedAddons.forEach(name => {
    [name, name + '_'].forEach(dir => {
        const p = path.join(jsaddonsDir, dir);
        try { if (fsEx.existsSync(p)) { fsEx.removeSync(p); console.log('    已清理旧插件: ' + dir); } } catch(e) {}
    });
});

// 清理旧的开机自启计划任务
const taskName = 'OpenCodeServer';
try { execSync('schtasks /Delete /TN "' + taskName + '" /F', { stdio: 'pipe' }); console.log('  已移除旧的开机自启任务'); } catch(e) {}

// 清理旧的 VBS 启动器
const oldVbsFiles = [
    path.join(rootDir, 'start-opencode-silent.vbs'),
    path.join(jsaddonsDir, 'opencode-wps_', 'start-opencode-silent.vbs')
];
oldVbsFiles.forEach(f => {
    try { if (fsEx.existsSync(f)) { fsEx.removeSync(f); console.log('  已清理旧 VBS: ' + path.basename(f)); } } catch(e) {}
});

// 更新 publish.xml
const publishXmlPath = path.join(jsaddonsDir, 'publish.xml');
let existingEntries = {};

if (fsEx.existsSync(publishXmlPath)) {
    try {
        const content = fs.readFileSync(publishXmlPath, 'utf-8');
        const regex = /<jsplugin[^>]*name="([^"]*)"[^>]*\/>/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            existingEntries[match[1]] = match[0];
        }
    } catch (e) {}
}

addons.forEach(addon => {
    existingEntries[addon.name] = '<jsplugin enable="enable_dev" name="' + addon.name + '" url="' + addon.name + '_" type="' + addon.type + '"/>';
});

mergedAddons.forEach(name => { delete existingEntries[name]; });

const publishLines = ['<?xml version="1.0" encoding="UTF-8"?>', '<jsplugins>'];
Object.values(existingEntries).forEach(entry => { publishLines.push('    ' + entry); });
publishLines.push('</jsplugins>');
fs.writeFileSync(publishXmlPath, publishLines.join('\n') + '\n', 'utf-8');
console.log('  已更新 publish.xml');

// 更新 jsplugins.xml
const jspluginsXmlPath = path.join(jsaddonsDir, 'jsplugins.xml');
let existingJsEntries = {};

if (fsEx.existsSync(jspluginsXmlPath)) {
    try {
        const content = fs.readFileSync(jspluginsXmlPath, 'utf-8');
        const regex = /<jsplugin[^>]*name="([^"]*)"[^>]*\/>/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            existingJsEntries[match[1]] = match[0];
        }
    } catch (e) {}
}

addons.forEach(addon => {
    existingJsEntries[addon.name] = '<jsplugin type="' + addon.type + '" enable="true" name="' + addon.name + '" url="' + addon.name + '_"/>';
});

mergedAddons.forEach(name => { delete existingJsEntries[name]; });

const jsLines = ['<?xml version="1.0" encoding="UTF-8"?>', '<jsplugins>'];
Object.values(existingJsEntries).forEach(entry => { jsLines.push('  ' + entry); });
jsLines.push('</jsplugins>');
fs.writeFileSync(jspluginsXmlPath, jsLines.join('\n') + '\n', 'utf-8');
console.log('  已更新 jsplugins.xml');

// 更新 authaddin.json（真正的启用开关）
const authaddinJsonPath = path.join(jsaddonsDir, 'authaddin.json');

if (fsEx.existsSync(authaddinJsonPath)) {
    try {
        const authContent = fs.readFileSync(authaddinJsonPath, 'utf-8');
        const authData = JSON.parse(authContent.replace(/^\uFEFF/, ''));
        
        // 遍历所有应用类型（wps, et, wpp）
        ['wps', 'et', 'wpp'].forEach(appType => {
            if (!authData[appType]) return;
            // 遍历所有 key，按 name 字段匹配 opencode-wps（不依赖硬编码 key）
            Object.keys(authData[appType]).forEach(key => {
                if (key === 'namelist') return;
                const entry = authData[appType][key];
                if (entry && entry.name === 'opencode-wps') {
                    entry.enable = true;
                    console.log('  已启用 ' + appType + ' 插件');
                }
            });
        });
        
        fs.writeFileSync(authaddinJsonPath, JSON.stringify(authData, null, 4) + '\n', 'utf-8');
        console.log('  已更新 authaddin.json');
    } catch (e) {
        console.log('  [警告] 更新 authaddin.json 失败: ' + e.message);
        console.log('  请手动修改 authaddin.json 中 opencode-wps 的 enable 为 true');
    }
} else {
    console.log('  [警告] authaddin.json 不存在，跳过');
}

// ============================================================
// 第 2 步: 编译 MCP 服务器
// ============================================================
console.log('\n【第 2 步】编译 MCP 服务器');
recordStep('build_mcp_server');

if (fsEx.existsSync(mcpServer.src)) {
    console.log('  源目录: ' + mcpServer.src);

    // npm install
    console.log('  正在安装依赖 (npm install)...');
    try {
        execSync('npm install', { cwd: mcpServer.src, stdio: 'pipe' });
        console.log('  依赖安装完成');
    } catch (e) {
        console.log('  [警告] npm install 失败: ' + (e.message || '').split('\n')[0]);
        console.log('  请手动运行: cd ' + mcpServer.src + ' && npm install');
    }

    // npm run build
    console.log('  正在编译 (npm run build)...');
    try {
        execSync('npm run build', { cwd: mcpServer.src, stdio: 'pipe' });
        console.log('  编译完成');
    } catch (e) {
        console.log('  [警告] npm run build 失败: ' + (e.message || '').split('\n')[0]);
        console.log('  请手动运行: cd ' + mcpServer.src + ' && npm run build');
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
const mcpEntryForward = mcpEntryPath.replace(/\\/g, '/');  // opencode.json 用正斜杠

if (fsEx.existsSync(mcpEntryPath)) {
    fsEx.ensureDirSync(opencodeConfigDir);

    // 辅助：去除 JSONC 注释（行注释 // 和块注释 /* */）
    function stripJsoncComments(text) {
        return text.replace(/\\"|"(?:[^"\\]|\\.)*"|\/\/.*|\/\*[\s\S]*?\*\//g, function(m) {
            // 保留字符串内的内容，去除注释
            return m.startsWith('"') || m.startsWith('\\"') ? m : '';
        });
    }

    // 第 1 步：从模板加载默认配置
    let config = {};
    if (fsEx.existsSync(opencodeConfigTemplate)) {
        try {
            const raw = fs.readFileSync(opencodeConfigTemplate, 'utf-8');
            config = JSON.parse(stripJsoncComments(raw));
            console.log('  已加载配置模板: ' + opencodeConfigTemplate);
        } catch (e) {
            console.log('  [警告] 无法解析配置模板: ' + e.message);
            config = {};
        }
    } else {
        console.log('  [跳过] 配置模板不存在: ' + opencodeConfigTemplate);
    }

    // 第 2 步：用已有配置覆盖（保留用户自定义内容如 API Key）
    if (fsEx.existsSync(opencodeConfigPath)) {
        try {
            const raw = fs.readFileSync(opencodeConfigPath, 'utf-8');
            // 去掉 BOM
            const existing = JSON.parse(raw.replace(/^\uFEFF/, ''));
            // 深度合并：existing 覆盖 template（已有配置优先）
            function deepMerge(target, source) {
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        if (Array.isArray(source[key])) {
                            target[key] = source[key].slice(); // 数组合并：保留用户新增项
                        } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                                target[key] = {};
                            }
                            deepMerge(target[key], source[key]);
                        } else {
                            // source（已有配置）始终覆盖 target（模板）
                            target[key] = source[key];
                        }
                    }
                }
            }
            deepMerge(config, existing);
            console.log('  已合并已有配置: ' + opencodeConfigPath);
        } catch (e) {
            console.log('  [警告] 无法解析 opencode.json: ' + e.message);
        }
    }

    // 第 3 步：替换占位符
    function replacePlaceholders(obj) {
        for (var key in obj) {
            if (typeof obj[key] === 'string') {
                // ___AGNES_API_KEY___ → 环境变量 AGNES_API_KEY（如存在）
                if (obj[key] === '___AGNES_API_KEY___') {
                    var envVal = process.env.AGNES_API_KEY;
                    if (envVal) obj[key] = envVal;
                }
                // ___WPS_USER_HOME___ → 用户主目录
                if (obj[key] === '___WPS_USER_HOME___') {
                    var userHome = process.env.USERPROFILE || require('os').homedir();
                    obj[key] = userHome.replace(/\\/g, '\\\\');
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                replacePlaceholders(obj[key]);
            }
        }
    }
    replacePlaceholders(config);

    // 第 4 步：更新 MCP 配置
    if (!config.mcp) config.mcp = {};
    config.mcp[mcpServer.name] = {
        command: ['node', mcpEntryForward],
        type: 'local'
    };

    // 第 5 步：写回配置
    fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log('  已配置 MCP 服务器: ' + mcpServer.name);
    console.log('  入口: ' + mcpEntryForward);
    console.log('  配置文件: ' + opencodeConfigPath);
} else {
    console.log('  [跳过] MCP 编译产物不存在: ' + mcpEntryPath);
    console.log('  请先编译: cd ' + mcpServer.src + ' && npm run build');
}

// ============================================================
// 第 4 步: 安装 Skills 到 OpenCode
// ============================================================
console.log('\n【第 4 步】安装 OpenCode Skills');
recordStep('install_skills');

if (fsEx.existsSync(skillsSrcDir)) {
    const skills = fs.readdirSync(skillsSrcDir).filter(name => {
        return fsEx.existsSync(path.join(skillsSrcDir, name, 'SKILL.md'));
    });

    if (skills.length > 0) {
        fsEx.ensureDirSync(opencodeSkillsDir);

        skills.forEach(skillName => {
            const src = path.join(skillsSrcDir, skillName);
            const dest = path.join(opencodeSkillsDir, skillName);
            fsEx.copySync(src, dest, { overwrite: true });
            console.log('  已安装: ' + skillName);
        });

        console.log('  Skills 目录: ' + opencodeSkillsDir);
    } else {
        console.log('  [跳过] 未找到有效的 skills');
    }
} else {
    console.log('  [跳过] Skills 源目录不存在: ' + skillsSrcDir);
}

// ============================================================
// 第 5 步: 安装 Agents 到 OpenCode
// ============================================================
console.log('\n【第 5 步】安装 OpenCode Agents');
recordStep('install_agents');

if (fsEx.existsSync(agentsSrcDir)) {
    const agentFiles = fs.readdirSync(agentsSrcDir).filter(name => name.endsWith('.md'));

    if (agentFiles.length > 0) {
        // 安装到全局 agents 目录
        fsEx.ensureDirSync(opencodeAgentsDir);
        agentFiles.forEach(file => {
            const src = path.join(agentsSrcDir, file);
            const dest = path.join(opencodeAgentsDir, file);
            fsEx.copySync(src, dest, { overwrite: true });
            console.log('  已安装: ' + file);
        });
        console.log('  全局 Agents 目录: ' + opencodeAgentsDir);

        // 安装到项目 agents 目录
        fsEx.ensureDirSync(opencodeAgentsProjectDir);
        agentFiles.forEach(file => {
            const src = path.join(agentsSrcDir, file);
            const dest = path.join(opencodeAgentsProjectDir, file);
            fsEx.copySync(src, dest, { overwrite: true });
        });
        console.log('  项目 Agents 目录: ' + opencodeAgentsProjectDir);
    } else {
        console.log('  [跳过] 未找到有效的 agents');
    }
} else {
    console.log('  [跳过] Agents 源目录不存在: ' + agentsSrcDir);
}

// ============================================================
// 第 6 步: 安装 OpenCode 插件到用户目录
// ============================================================
console.log('\n【第 6 步】安装 OpenCode 插件');
recordStep('install_opencode_plugins');

const pluginSrcDir = path.resolve(rootDir, '.opencode', 'plugins');
const pluginDstDir = path.join(opencodeConfigDir, 'plugins');

if (fsEx.existsSync(pluginSrcDir)) {
    const pluginFiles = fs.readdirSync(pluginSrcDir).filter(f => f.endsWith('.js'));

    if (pluginFiles.length > 0) {
        fsEx.ensureDirSync(pluginDstDir);
        pluginFiles.forEach(file => {
            const src = path.join(pluginSrcDir, file);
            const dst = path.join(pluginDstDir, file);
            fsEx.copySync(src, dst, { overwrite: true });
            console.log('  已安装: ' + file);
        });
        console.log('  插件目录: ' + pluginDstDir);
    } else {
        console.log('  [跳过] 未找到有效的插件');
    }
} else {
    console.log('  [跳过] 插件源目录不存在: ' + pluginSrcDir);
}

// 清理旧版插件路径（`~/.opencode/plugin/` → `~/.config/opencode/plugins/`）
const oldPluginDir = path.join(homeDir, '.opencode', 'plugin');
try {
    if (fsEx.existsSync(oldPluginDir)) {
        fsEx.removeSync(oldPluginDir);
        console.log('  已清理旧版插件目录: ' + oldPluginDir);
    }
} catch(e) {
    console.log('  [警告] 无法清理旧版插件目录: ' + e.message);
}

// ============================================================
// 第 7 步: 清理废弃配置
// ============================================================
console.log('\n【第 7 步】清理废弃配置');
recordStep('cleanup_legacy_config');

staleClaudeDirs.forEach(dir => {
    try {
        if (fsEx.existsSync(dir)) {
            fsEx.removeSync(dir);
            console.log('  已清理: ' + dir);
        }
    } catch(e) {
        console.log('  [警告] 无法清理 ' + dir + ': ' + e.message);
    }
});

// 清理旧的 .claude-plugin 和 .opencode-plugin（已废弃）
const stalePluginDirs = [
    path.resolve(rootDir, '.claude-plugin'),
    path.resolve(rootDir, '.opencode-plugin'),
];
stalePluginDirs.forEach(dir => {
    try {
        if (fsEx.existsSync(dir)) {
            fsEx.removeSync(dir);
            console.log('  已清理: ' + path.basename(dir));
        }
    } catch(e) {}
});

// ============================================================
// 第 8 步: 注册 launcher 开机自启 + 立即启动
// ============================================================
console.log('\n【第 8 步】注册 launcher 开机自启');
recordStep('register_launcher_autostart');

const launcherPath = path.join(jsaddonsDir, 'opencode-wps_', 'launcher.js');

if (fsEx.existsSync(launcherPath)) {
    // 生成 VBS 静默启动器
    const launcherVbsPath = path.join(jsaddonsDir, 'opencode-wps_', 'start-launcher.vbs');
    // VBS: "node ""path""" → 实际执行 node "path"
    // 外层 "..." 是 VBS 字符串，内层 "" 是字面引号，最后一个 " 关闭 VBS 字符串
    const launcherVbsContent = 'CreateObject("Wscript.Shell").Run "node ""' + launcherPath + '""", 0, False';
    fs.writeFileSync(launcherVbsPath, launcherVbsContent, 'utf-8');
    console.log('  已生成 launcher VBS: ' + launcherVbsPath);

    // 注册计划任务（用户登录时自动启动 launcher）
    const taskName = 'OpenCodeLauncher';
    try { execSync('schtasks /Delete /TN "' + taskName + '" /F', { stdio: 'pipe' }); } catch(e) {}

    const xmlContent = [
        '<?xml version="1.0" encoding="UTF-16"?>',
        '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
        '  <RegistrationInfo><Description>OpenCode Launcher</Description></RegistrationInfo>',
        '  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>',
        '  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>',
        '  <Settings>',
        '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
        '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
        '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
        '    <AllowHardTerminate>true</AllowHardTerminate>',
        '    <StartWhenAvailable>true</StartWhenAvailable>',
        '    <AllowStartOnDemand>true</AllowStartOnDemand>',
        '    <Enabled>true</Enabled><Hidden>true</Hidden>',
        '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
        '  </Settings>',
        '  <Actions Context="Author">',
        '    <Exec>',
        '      <Command>wscript.exe</Command>',
        '      <Arguments>"' + launcherVbsPath + '"</Arguments>',
        '    </Exec>',
        '  </Actions>',
        '</Task>'
    ].join('\r\n');

    const tmpXml = path.join(require('os').tmpdir(), '_opencode_launcher_task.xml');
    const bom = Buffer.from([0xFF, 0xFE]);
    const xmlBuf = Buffer.from(xmlContent, 'utf16le');
    fs.writeFileSync(tmpXml, Buffer.concat([bom, xmlBuf]));

    try {
        execSync('schtasks /Create /TN "' + taskName + '" /F /XML "' + tmpXml + '"', { stdio: 'pipe' });
        console.log('  已注册开机自启: ' + taskName);
    } catch(e) {
        console.log('  [警告] 注册计划任务失败: ' + (e.message || '').split('\n')[0]);
    } finally {
        try { fs.unlinkSync(tmpXml); } catch(e) {}
    }

    // 立即启动 launcher
    try {
        const { spawn: spawnProc } = require('child_process');
        const child = spawnProc('node', [launcherPath], {
            detached: true, stdio: 'ignore', windowsHide: true
        });
        child.unref();
        console.log('  已启动 launcher (PID: ' + child.pid + ')');
    } catch(e) {
        console.log('  [警告] 启动 launcher 失败，尝试 VBS 启动');
        try { execSync('wscript.exe "' + launcherVbsPath + '"', { stdio: 'pipe' }); } catch(e2) {}
    }
} else {
    console.log('  [跳过] launcher.js 不存在');
}

// ===== 完成 =====
console.log('\n========================================');
console.log('安装完成！');
console.log('');
console.log('已安装组件:');
console.log('  1. WPS 插件 (opencode-wps) → jsaddons');
console.log('  2. MCP 服务器 → ' + mcpServer.src);
console.log('  3. OpenCode MCP 配置 → opencode.json');
console.log('  4. Skills → ~/.opencode/skills/');
console.log('  5. Agents → ~/.config/opencode/agents/ 和 ~/.opencode/agents/');
console.log('  6. Plugins → ~/.config/opencode/plugins/');
console.log('  7. launcher 进程管理 → http://127.0.0.1:14097');
console.log('');
console.log('后续步骤:');
console.log('  - 重启 WPS Office 以加载插件');
console.log('  - 在插件面板中设置工作目录并启动服务');
console.log('========================================');

// 如果有任何错误，显示警告
if (installState.errors.length > 0) {
    console.log('\n⚠️ 安装过程中有 ' + installState.errors.length + ' 个警告');
    console.log('错误详情:');
    installState.errors.forEach(function(e, i) {
        console.log('  ' + (i + 1) + '. ' + e.step + ': ' + e.error);
    });
    console.log('\n请检查上述问题后重新运行安装');
}
