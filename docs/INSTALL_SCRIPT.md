# 安装脚本说明

> 📖 用户视角的三平台安装步骤（环境要求/路径速查/卸载）见 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)；本文档从实现角度解析安装脚本。

## 概述

项目提供三个安装脚本（分别服务于 Windows、macOS、Linux）与一个官方发布工具（wpsjs publish，跨平台）：

| 脚本 | 平台 | 用途 | 场景 |
|------|------|------|------|
| `install-addons.js` | Windows | 本地一键安装 | 开发调试、日常使用 |
| `install-addons-mac.js` | macOS | 本地一键安装 | 开发调试、日常使用 |
| `install-addons-linux.js` | Linux | 本地一键安装 | 开发调试、日常使用 |
| `wpsjs publish` | 跨平台 | 官方发布工具 | 分发给他人、离线部署 |

---

## install-addons.js（Windows 安装脚本）

> 📖 Windows 平台专题（架构/前置条件/已知限制/常见问题）见 [WINDOWS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md)。

```bash
node install-addons.js
```

**功能：**
1. 复制插件文件到 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_`
2. 更新 `publish.xml` 和 `jsplugins.xml`（注册 WPS 插件）
3. 安装 MCP 依赖并编译
4. 配置 OpenCode MCP（更新 `opencode.json`）
5. 安装 Skills（5 个）到 `~/.opencode/skills/`
6. 安装 Agents（4 个）到 `~/.config/opencode/agents/`
7. 安装 Governance 插件到 `~/.config/opencode/plugins/`
8. 注册 Launcher 计划任务（开机自启）

**特点：**
- 自动化程度高，一键完成
- 使用 Windows 计划任务管理 Launcher 自启
- 通过 PowerShell COM 桥接操作 WPS

---

## install-addons-mac.js（macOS 安装脚本）

> 📖 macOS 平台专题（架构/前置条件/已知限制/常见问题）见 [MAC.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md)。

```bash
node install-addons-mac.js
```

**功能：**
1. 复制插件到 `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/`
2. 安装并编译 MCP 服务器（在 wps-office-mcp 目录执行 `npm install` + `npm run build`）
3. 配置 OpenCode MCP（更新 `opencode.json`）
4. 安装 Skills（5 个）到 `~/.opencode/skills/`
5. 安装 Agents（4 个）到 `~/.config/opencode/agents/`
6. 安装 Governance 插件到 `~/.config/opencode/plugins/`
7. 创建 LaunchAgent plist（`~/Library/LaunchAgents/com.opencode.launcher.plist`）

**架构差异：**

| 维度 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 插件目录 | `opencode-wps/`（COM 桥接） | `opencode-wps-assistant/`（反向轮询） | `opencode-wps-linux/`（反向轮询） |
| WPS 插件路径 | `%APPDATA%\kingsoft\wps\jsaddons\` | `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/` | `~/.local/share/Kingsoft/wps/jsaddons/` |
| MCP 通信 | PowerShell COM（wps-com.ps1） | HTTP 轮询（mac-poll-server.ts:58891） | HTTP 轮询（linux-poll-server.ts:58891） |
| 自启机制 | 计划任务（schtasks） | LaunchAgent（launchd plist） | XDG autostart |
| Launcher | `opencode-wps/launcher.js` | `launcher-mac.js` | `launcher-linux.js` |

**注意**：Mac/Linux 版 WPS 的 Chromium 沙箱无法启动 HTTP 服务器，因此采用反向轮询架构：MCP 服务器提供 HTTP 端点（`:58891/poll`），WPS 插件每 500ms 主动拉取命令。

---

## install-addons-linux.js（Linux 安装脚本）

> 📖 Linux 平台专题（架构/前置条件/已知限制/常见问题）见 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)。

```bash
npm install
node install-addons-linux.js
```

**功能：**
1. 复制插件到 `~/.local/share/Kingsoft/wps/jsaddons/opencode-wps-linux_`
2. 写入注册文件 `publish.xml` / `jsplugins.xml` / `authwebsite.xml`
3. 编译 MCP 服务器并配置 OpenCode MCP（更新 `opencode.json`）
4. 安装 Skills（5 个）到 `~/.opencode/skills/`
5. 安装 Agents（4 个）到 `~/.config/opencode/agents/`
6. 安装 Governance 插件到 `~/.config/opencode/plugins/`
7. 生成 XDG autostart（`~/.config/autostart/opencode-wps-launcher.desktop`）

**特点：**
- 无 lsof 依赖（/proc 扫描管理 opencode 进程）
- XDG autostart 开机自启
- 通过 HTTP 反向轮询操作 WPS（与 macOS 同架构）

---

## wpsjs publish（官方发布工具，跨平台）

```bash
cd opencode-wps
wpsjs publish -s "http://127.0.0.1:8080/"
```

**功能：**
1. 验证插件结构
2. 生成构建产物到 `wps-addon-build/` 和 `wps-addon-publish/`
3. 提供 HTTP 服务供 WPS 加载插件

**工作流程：**

```
wpsjs publish
    ↓
生成 wps-addon-build/（插件文件）
生成 wps-addon-publish/publish.html（发布页面）
    ↓
启动 HTTP 服务器（端口如 8080）
    ↓
WPS 加载项从 HTTP 地址加载插件
```

**两种模式：**
- **在线模式**：插件部署在 HTTP 服务器上
- **离线模式**：通过 `publish.html` 安装

---

## 使用场景

| 场景 | Windows 推荐 | macOS 推荐 | Linux 推荐 |
|------|-------------|------------|------------|
| 本地开发调试 | `node install-addons.js` | `node install-addons-mac.js` | `node install-addons-linux.js` |
| 日常使用 | `node install-addons.js` | `node install-addons-mac.js` | `node install-addons-linux.js` |
| 分发给其他用户 | `wpsjs publish` | `wpsjs publish` | 手动分发（`wpsjs` 不支持 Linux） |
| 离线部署 | `wpsjs publish` 离线模式 | `wpsjs publish` 离线模式 | 手动复制插件目录（`wpsjs` 不支持 Linux） |
