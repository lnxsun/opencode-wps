# 安装指南

本文档覆盖 **Windows / macOS / Linux** 三平台的完整安装步骤、目录路径与卸载说明。快速安装只需运行对应平台的安装脚本：

```bash
node install-addons.js          # Windows
node install-addons-mac.js      # macOS
node install-addons-linux.js    # Linux
```

## 环境要求

| 依赖 | 要求 |
|------|------|
| **操作系统** | Windows 10/11、macOS 12+、或 Linux（Debian/Ubuntu/Arch 等，x86_64 / aarch64） |
| **WPS Office** | Windows：个人版 12.1.0+ 或企业版；macOS：WPS Office for Mac 最新版；Linux：12.1.x（[linux.wps.cn](https://linux.wps.cn)，deb/rpm） |
| **Node.js** | 18.0.0+（或 Bun 1.0+） |
| **OpenCode** | 已全局安装 opencode-ai（`npm install -g opencode-ai`） |
| **Python 3** | Mac/Linux 需要（`wps-auto.sh` 生成空白 OOXML 用，缺失时回退无参启动）；Windows 不需要 |

## Windows 安装

### 1. 克隆项目

```bash
# 国内（CNB 镜像）：git clone https://cnb.cool/lnxsun/opencode-wps.git
# 国外（GitHub）：git clone https://github.com/lnxsun/opencode-wps.git
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps
```

### 2. 安装项目依赖

```bash
npm install
```

### 3. 一键安装

```bash
node install-addons.js
```

安装脚本自动完成以下 **8 个步骤**：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 安装 WPS 插件 | 复制 opencode-wps 到 `%APPDATA%\kingsoft\wps\jsaddons\`，注册到 publish.xml/jsplugins.xml |
| 2 | 安装并编译 MCP 服务器 | 在 wps-office-mcp 目录执行 `npm install` + `npm run build` |
| 3 | 配置 OpenCode MCP | 修改 `~/.config/opencode/opencode.json`，添加 wps-office MCP 服务器 |
| 4 | 安装 Skills | 复制 5 个技能到 `~/.opencode/skills/` |
| 5 | 安装 Agents | 复制自定义 agents 到 `~/.config/opencode/agents/` 和 `~/.opencode/agents/` |
| 6 | 安装 Plugins | 复制治理插件到 `~/.config/opencode/plugins/` |
| 7 | 清理旧配置 | 移除旧版 legacy 配置文件残留 |
| 8 | 注册 Launcher | 注册 Windows 计划任务实现开机自启，监听 14097 端口管理服务 |

### 4. 重启 WPS Office

安装完成后重启 WPS，功能区会出现 **OpenCode AI** 标签页。

> 📖 Windows 完整说明（架构/组件清单/应用切换/已知限制/常见问题）见 [WINDOWS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md)。

## macOS 安装

> Mac 版 WPS 使用与 Windows 不同的 JS 插件架构（基于 WPS JS API 而非 COM 桥接），因此采用独立插件实现与安装方式。

### 1. 克隆项目

```bash
# 国内（CNB 镜像）：git clone https://cnb.cool/lnxsun/opencode-wps.git
# 国外（GitHub）：git clone https://github.com/lnxsun/opencode-wps.git
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps
```

### 2. 安装项目依赖并编译 MCP

```bash
npm install
cd wps-office-mcp && npm install && npm run build && cd ..
```

### 3. 安装 Mac 插件和组件

```bash
node install-addons-mac.js
```

安装脚本自动完成以下 **7 个步骤**：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 安装 WPS 插件 | 复制 `opencode-wps-assistant/` 到 `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/` |
| 2 | 安装并编译 MCP 服务器 | 在 wps-office-mcp 目录执行 `npm install` + `npm run build` |
| 3 | 配置 OpenCode MCP | 修改 `~/.config/opencode/opencode.json`，添加 wps-office MCP 服务器 |
| 4 | 安装 Skills | 复制 5 个技能到 `~/.opencode/skills/` |
| 5 | 安装 Agents | 复制 agents 到 `~/.config/opencode/agents/` 和 `~/.opencode/agents/` |
| 6 | 安装 Plugins | 复制治理插件到 `~/.config/opencode/plugins/` |
| 7 | 注册 LaunchAgent | 创建 `~/Library/LaunchAgents/com.opencode.launcher.plist` 实现开机自启 |

### 4. 启动服务

安装完成后，手动启动 launcher-mac：

```bash
node launcher-mac.js
```

或重启 Mac 让 LaunchAgent 自动启动。

### 5. 重启 WPS Office

重启 WPS Office for Mac，功能区会出现 **OpenCode AI** 标签页。

> 📖 macOS 完整说明（架构/组件清单/应用切换/已知限制/常见问题）见 [MAC.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md)。

## Linux 安装

> Linux 版与 macOS 版同架构（反向轮询桥），插件独立目录 `opencode-wps-linux/`。状态：✅ 开发完成；⚠️ 尚未在真实 Linux + WPS 环境实测（需要实机验证）。

> 📖 Linux 完整说明（架构/组件清单/应用切换/已知限制/常见问题）见 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)。

### 1. 克隆仓库

```bash
# 国内（CNB 镜像）：git clone https://cnb.cool/lnxsun/opencode-wps.git
# 国外（GitHub）：git clone https://github.com/lnxsun/opencode-wps.git
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps
```

### 2. 安装项目依赖

```bash
npm install
```

### 3. 一键安装

```bash
node install-addons-linux.js
```

安装脚本自动完成以下 **8 个步骤**：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 安装 WPS 插件 | 复制 `opencode-wps-linux/` 到 `~/.local/share/Kingsoft/wps/jsaddons/opencode-wps-linux_` |
| 2 | 写入注册文件 | 写 `publish.xml` / `jsplugins.xml` / `authwebsite.xml` |
| 3 | 安装并编译 MCP 服务器 | 在 wps-office-mcp 目录执行 `npm install` + `npm run build` |
| 4 | 配置 OpenCode MCP | 修改 `~/.config/opencode/opencode.json`，添加 wps-office MCP 服务器 |
| 5 | 安装 Skills | 复制 5 个技能到 `~/.opencode/skills/` |
| 6 | 安装 Agents | 复制 agents 到 `~/.config/opencode/agents/` 和 `~/.opencode/agents/` |
| 7 | 安装 Plugins | 复制治理插件到 `~/.config/opencode/plugins/` |
| 8 | 配置自启 | 生成 XDG autostart（`~/.config/autostart/opencode-wps-launcher.desktop`） |

### 4. 启动服务

安装后手动启动 launcher（或依赖 XDG autostart 开机自启）：

```bash
node launcher-linux.js
```

### 5. 重启 WPS Office

重启 WPS，功能区出现 **OpenCode AI** 标签页，点击 **打开Web** 即可在浏览器中对话。

> 📖 Linux 完整说明（前置条件/组件清单/应用切换/已知限制/常见问题）见 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)。

## 平台路径速查

| 资源 | Windows | macOS | Linux |
|------|---------|-------|-------|
| WPS 插件目录 | `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` | `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/opencode-wps-assistant_` | `~/.local/share/Kingsoft/wps/jsaddons/opencode-wps-linux_` |
| 安装脚本 | `install-addons.js` | `install-addons-mac.js` | `install-addons-linux.js` |
| Launcher | `opencode-wps/launcher.js`（计划任务自启） | `launcher-mac.js`（LaunchAgent 自启） | `launcher-linux.js`（XDG autostart 自启） |
| MCP 通信 | PowerShell COM（wps-com.ps1） | HTTP 轮询（mac-poll-server.ts:58891） | HTTP 轮询（linux-poll-server.ts:58891） |

## 卸载

> 卸载 = 移除插件 + 清理 MCP/Skills/Agents/Plugins 配置 + 移除自启。三平台均可手动删除，无官方卸载命令。

| 平台 | 插件目录 | 注册文件 | 自启清理 | MCP 配置 |
|------|----------|----------|----------|----------|
| **Windows** | 删除 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` | 从 `publish.xml`/`jsplugins.xml` 移除 `opencode-wps` 条目（安装时合并追加，需单独移除） | 计划任务：`schtasks /Delete /TN "OpenCodeLauncher" /F`（另有旧任务 `OpenCodeServer` 一并清理） | 从 `~/.config/opencode/opencode.json` 移除 wps-office MCP 条目 |
| **macOS** | 删除 `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/` 下对应目录 | 无需处理（macOS 安装不写注册文件，WPS 自动扫描 jsaddons 目录） | `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.opencode.launcher.plist` 并删除 plist（`launchctl load/unload` 在 macOS 10.10+ 已废弃） | 同上 |
| **Linux** | 删除 `~/.local/share/Kingsoft/wps/jsaddons/opencode-wps-linux_` | 从 `publish.xml`/`jsplugins.xml` 移除 `opencode-wps-linux` 条目（安装时整文件写入） | 删除 `~/.config/autostart/opencode-wps-launcher.desktop` | 同上 |

卸载后重启 WPS，功能区不再显示 **OpenCode AI** 标签页即完成。

## 常见问题

- **插件不显示** → 检查插件目录是否存在、WPS 是否重启、`publish.xml/jsplugins.xml` 是否注册
- **MCP 连接失败** → 在仓库根目录运行 `cd wps-office-mcp && npm install && npm run build && cd ..`，然后重启 OpenCode
- **Skills/Agents 未加载** → 在**仓库根目录**重新运行安装脚本 `node install-addons.js`（⚠️ `install-addons*.js` 位于仓库根目录，不在 `wps-office-mcp/` 内）+ 重启 OpenCode 服务
- **Linux 实机验证** → 参考 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)「已知限制」「常见问题」章节

> 📖 更多排查见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)；安装脚本实现细节见 [INSTALL_SCRIPT.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALL_SCRIPT.md)。
