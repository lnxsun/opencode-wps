const fs = require('fs');
const fsEx = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const homeDir = process.env.USERPROFILE || process.env.HOME;

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

// ============================================================
// 第 2 步: 编译 MCP 服务器
// ============================================================
console.log('\n【第 2 步】编译 MCP 服务器');

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

const mcpEntryPath = path.resolve(mcpServer.src, mcpServer.entryPoint);
const mcpEntryForward = mcpEntryPath.replace(/\\/g, '/');  // opencode.json 用正斜杠

if (fsEx.existsSync(mcpEntryPath)) {
    // 读取或创建 opencode.json
    let config = {};
    fsEx.ensureDirSync(opencodeConfigDir);

    if (fsEx.existsSync(opencodeConfigPath)) {
        try {
            const raw = fs.readFileSync(opencodeConfigPath, 'utf-8');
            // 去掉 BOM
            config = JSON.parse(raw.replace(/^\uFEFF/, ''));
        } catch (e) {
            console.log('  [警告] 无法解析 opencode.json，将重新创建');
            config = {};
        }
    }

    // 确保 mcp 字段存在
    if (!config.mcp) config.mcp = {};

    // 更新 wps-office MCP 配置
    config.mcp[mcpServer.name] = {
        command: ['node', mcpEntryForward],
        type: 'local'
    };

    // 写回配置
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
// 第 6 步: 清理废弃配置
// ============================================================
console.log('\n【第 6 步】清理废弃配置');

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
// 第 7 步: 注册 launcher 开机自启 + 立即启动
// ============================================================
console.log('\n【第 7 步】注册 launcher 开机自启');

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

    const tmpXml = path.join(rootDir, '_launcher_task.xml');
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
console.log('  6. launcher 进程管理 → http://127.0.0.1:14097');
console.log('');
console.log('后续步骤:');
console.log('  - 重启 WPS Office 以加载插件');
console.log('  - 在插件面板中设置工作目录并启动服务');
console.log('========================================');
