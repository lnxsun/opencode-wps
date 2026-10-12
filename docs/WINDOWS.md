# Windows 支持

OpenCode WPS 的 Windows 版支持，为 Windows 桌面环境下的 WPS Office 提供 OpenCode AI 能力。Windows 是项目最初支持、功能最完整的平台（**侧边栏 Chat UI + 服务进程管理**）。

> 状态：✅ 完整支持（首版即支持，经 10 轮代码评审加固，见 [windows-code-review-fixes.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/windows-code-review-fixes.md)）。

> 📖 完整三平台安装指南（含 Windows 环境要求/路径速查/卸载）见 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)。

## 架构总览

Windows 版走 **PowerShell COM 桥接**：WPS 加载项运行在 WPS 内置 Chromium 103 中，通过 REST + SSE 直连 OpenCode 服务，文档操作经 MCP 服务器调用 PowerShell 脚本操作 WPS COM API（同步、强类型）：

```
OpenCode AI (系统浏览器 / WPS 侧边栏 Chat UI，REST + SSE 客户端)
    ↑ SSE / HTTP
WPS 插件 (opencode-wps，taskpane.html + main.js)
    ↑ REST + SSE（launcher 以 --cors file:// 放行）
OpenCode 中央调度 (opencode serve :14096)
    ↑ stdio / MCP
MCP Server (wps-office-mcp)
    ↑ PowerShell COM（spawnPowerShell）
wps-com.ps1 → WPS COM API（wps/et/wpp）
```

> 💡 侧边栏 Chat UI 与系统浏览器均为 REST + SSE 客户端，直连 opencode serve（14096）；另保留 `opencode-proxy.js`（:14098，剥离 CSP 头）作为备用通讯层，当前 launcher 已用 `--cors file://` 放行，运行时调用链不再经过它。

## 组件清单

| 组件 | 路径 | 说明 |
|------|------|------|
| Windows 插件（主目录） | `opencode-wps/` | 唯一带完整 Chat UI 的加载项：main.js / taskpane.html / ribbon.xml / manifest.xml / config.js / launcher.js / opencode-proxy.js（serve.js 为开发用静态服务器 :3444，仅调试） |
| Windows Launcher | `opencode-wps/launcher.js` | 端口 14097，netstat/findstr 查端口 + Get-CimInstance/wmic 验证进程（Win11 兼容），管理 opencode serve 生命周期 |
| Windows 安装脚本 | `install-addons.js` | 8 步一键安装（插件 + MCP + 配置 + skills/agents/plugins + 计划任务自启），等价 Linux 的 `install-addons-linux.js` |
| COM 桥接脚本 | `wps-office-mcp/scripts/wps-com.ps1` | PowerShell COM 桥（仅 Windows 使用），另有 extract-methods.ps1 / check-methods.cjs 用于动作提取与校验 |
| MCP 平台路由 | `wps-office-mcp/src/client/wps-client.ts` | 三通道：win32(PowerShell COM) / darwin(轮询) / linux(轮询)，Windows 走 `spawnPowerShell`，超时主动 kill PowerShell 进程 |
| 代码评审记录 | `docs/windows-code-review-fixes.md` | Issue #85 Windows 侧 10 轮评审与修复记录 |
| 文档 | `docs/WINDOWS.md` | 本文档 |

## 前置条件

- 操作系统：Windows 10 / 11（x64）
- WPS Office：个人版 12.1.0+ 或企业版
- Node.js >= 18（或 Bun 1.0+）
- OpenCode CLI（`opencode` 在 PATH 中）
- PowerShell 5.1+（系统自带；COM 桥接依赖，无需 Python）

> ✅ 与 Linux 不同，Windows **不需要** Python 3（无 `wps-auto.sh` 空白 OOXML 生成需求）。

## 安装步骤

```bash
# 1. 克隆仓库（二选一：
#    国内 CNB 镜像：git clone https://cnb.cool/lnxsun/opencode-wps.git
#    国外 GitHub：  git clone https://github.com/lnxsun/opencode-wps.git）
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps

# 2. 安装项目依赖（install-addons.js 依赖根目录 node_modules 的 fs-extra）
npm install

# 3. 运行 Windows 安装脚本（等价于 Mac 的 install-addons-mac.js / Linux 的 install-addons-linux.js）
node install-addons.js
```

脚本完成（8 步）：

1. 复制插件到 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_/`
2. 安装并编译 MCP 服务器（wps-office-mcp 目录 `npm install` + `npm run build`）
3. 修改 `~/.config/opencode/opencode.json`，添加 wps-office MCP 服务器
4. 同步 skills 到 `~/.opencode/skills/`
5. 同步 agents 到 `~/.config/opencode/agents/` 与 `~/.opencode/agents/`
6. 同步 plugins 到 `~/.config/opencode/plugins/`
7. 清理旧版 legacy 配置文件残留
8. 注册计划任务 `OpenCodeLauncher`（schtasks）实现开机自启；旧任务 `OpenCodeServer` 一并清理

## 使用

```bash
# 手动启动 launcher（或依赖计划任务开机自启）
node opencode-wps/launcher.js

# 启动 opencode 服务（launcher 会自动管理，也可手动）
opencode serve --port 14096 --hostname 127.0.0.1 --cors file://

# 重启 WPS Office，Ribbon 出现「OpenCode AI」标签页
```

Ribbon 提供三个按钮（`opencode-wps/ribbon.xml`）：

- **打开面板**：在 WPS 侧边栏打开 Chat UI（SSE 流式对话、Markdown 渲染、会话管理、Agent 选择）
- **打开Web**：在系统浏览器中打开 OpenCode AI 对话界面（经 launcher `/dock` 打开 Edge；与 Mac/Linux 不同，Windows 无自愈拉起逻辑，需先确保 opencode 服务已运行）
- **连接状态**：查看 OpenCode 服务连接状态

## 应用切换

Windows 版**无独立切换脚本**——COM 桥接模式下，MCP 直接通过 `wps-com.ps1` 操作当前打开的 WPS 文档，无需关闭/重启应用；跨应用（文字/表格/演示）操作由 WPS COM 对象模型在进程内完成。

> 对比：Mac 用 `opencode-wps-assistant/wps-auto.sh`（open + pkill），Linux 用 `opencode-wps-linux/wps-auto.sh`（wps/et/wpp + xdg-open）。

## 已知限制

- **WPS 内置 Chromium 103**（2022 年版本）：官方 opencode web 版需 Chrome 130+ 不兼容，故自建 Chat UI；同时不得使用过新的 Web API
- **计划任务需管理员权限**：`schtasks /Create` 注册开机自启需要当前用户有创建计划任务权限（一般用户默认可创建，企业受限环境可能失败，可手动运行 launcher 代替）
- **COM 桥接单实例**：操作基于当前打开的 WPS 进程，多开 WPS 实例时 COM 对象可能指向默认实例；若未启动任何 WPS 应用，`GetActiveObject` 返回「No WPS application running」需先手动打开（与 Mac/Linux 每文档独立轮询桥不同）

## 常见问题

**Q: 插件没有出现在 Ribbon？**
检查 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` 目录及 `publish.xml`/`jsplugins.xml` 是否注册，重启 WPS。

**Q: MCP 连不上？**
在**仓库根目录**执行（构建后自动 `cd ..` 回到根目录）：
```bash
cd wps-office-mcp && npm install && npm run build && cd ..
```
> 若还需重新运行安装脚本同步配置，请务必在**仓库根目录**执行 `node install-addons.js`（`install-addons*.js` 位于仓库根目录，不在 `wps-office-mcp/` 内）。

**Q: 打开Web提示 launcher 不可达？**
确认 `node opencode-wps/launcher.js` 已运行（`curl http://127.0.0.1:14097/health`）。

**Q: Windows 11 下服务停止异常？**
launcher 已用 `Get-CimInstance Win32_Process` 替代 Win11 移除的 wmic（失败再回退 wmic，再失败保守跳过），如仍异常请确认 PowerShell 5.1+ 可用。

> 📖 更多排查见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)；Windows 侧代码评审与修复细节见 [windows-code-review-fixes.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/windows-code-review-fixes.md)。
