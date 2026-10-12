# macOS 支持

OpenCode WPS 的 macOS 版支持，为 macOS 桌面环境下的 WPS Office for Mac 提供 OpenCode AI 能力。Mac 版与 Linux 版同架构（反向轮询桥），因为 Mac 版 WPS 加载项运行在沙箱内，无法启动 HTTP 服务端。

> 状态：✅ 完整支持（经 Issue #84/#86 Mac 侧彻底评审与修复，见 [CHANGELOG.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/CHANGELOG.md)）。

> 📖 完整三平台安装指南（含 macOS 环境要求/路径速查/卸载）见 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)。

## 架构总览

macOS 版与 Linux 版同架构（反向轮询桥），因为 Mac 版 WPS 加载项同样运行在沙箱内，无法启动 HTTP 服务端：

```
OpenCode AI (浏览器 14096)
    ↑ SSE / HTTP
WPS 插件 (opencode-wps-assistant，Ribbon 按钮 + 轮询客户端)
    ↑ 每 500ms GET /poll，执行后 POST /result
MCP Server (wps-office-mcp，轮询服务端 :58891)
    ↑ stdio
OpenCode MCP 客户端
```

## 组件清单

| 组件 | 路径 | 说明 |
|------|------|------|
| Mac 插件（独立目录） | `opencode-wps-assistant/` | manifest/ribbon/main/handlers/utils/wps-auto.sh，与 Win/Linux 目录完全隔离 |
| Mac 轮询服务端 | `wps-office-mcp/src/client/mac-poll-server.ts` | HTTP 服务端 :58891，500ms 轮询协议（Linux 版复用本类） |
| MCP 平台路由 | `wps-office-mcp/src/client/wps-client.ts` | 三通道：win32(PowerShell COM) / darwin(轮询) / linux(轮询)，darwin 走 `execMacPoll` |
| Mac Launcher | `launcher-mac.js` | 端口 14097，lsof 查端口 + kill/ps 管理 opencode 进程（无 netstat/taskkill），open 打开浏览器（优先 Chrome，缺失回退默认浏览器） |
| Mac 安装脚本 | `install-addons-mac.js` | 7 步一键安装（插件 + MCP + 配置 + skills/agents/plugins + LaunchAgent 自启） |
| 应用切换脚本 | `opencode-wps-assistant/wps-auto.sh` | open + pkill（精确匹配 wpsoffice，避免误杀） |
| 文档 | `docs/MAC.md` | 本文档 |

## 前置条件

- 操作系统：macOS 12+（Monterey 或更新）
- WPS Office for Mac 最新版
- Node.js >= 18（或 Bun 1.0+）
- OpenCode CLI（`opencode` 在 PATH 中）
- Python 3（`wps-auto.sh` 生成空白 OOXML 文件用；缺失时回退 `open -a "WPS Office"` 无参启动；Windows 不需要）

## 安装步骤

```bash
# 1. 克隆仓库（二选一：
#    国内 CNB 镜像：git clone https://cnb.cool/lnxsun/opencode-wps.git
#    国外 GitHub：  git clone https://github.com/lnxsun/opencode-wps.git）
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps

# 2. 安装项目依赖（install-addons-mac.js 依赖根目录 node_modules 的 fs-extra；MCP 由脚本第 2 步自动编译）
npm install

# 3. 运行 Mac 安装脚本（等价于 Windows 的 install-addons.js / Linux 的 install-addons-linux.js）
node install-addons-mac.js
```

脚本完成（7 步）：

1. 复制插件到 `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/opencode-wps-assistant_/`（macOS 安装不写注册文件，WPS 自动扫描 jsaddons 目录）
2. 安装并编译 MCP 服务器（wps-office-mcp 目录 `npm install` + `npm run build`）
3. 修改 `~/.config/opencode/opencode.json`，添加 wps-office MCP 服务器
4. 同步 skills 到 `~/.opencode/skills/`
5. 同步 agents 到 `~/.config/opencode/agents/` 与 `~/.opencode/agents/`
6. 同步 plugins 到 `~/.config/opencode/plugins/`
7. 注册 LaunchAgent `~/Library/LaunchAgents/com.opencode.launcher.plist` 实现开机自启（日志在 `~/Library/Logs/opencode-launcher.{log,err}`）

## 使用

```bash
# 手动启动 launcher（或重启 Mac 让 LaunchAgent 自动启动）
node launcher-mac.js

# 启动 opencode 服务（launcher 会自动管理，也可手动）
opencode serve --port 14096 --hostname 127.0.0.1 --cors file://

# 重启 WPS Office for Mac，Ribbon 出现「OpenCode AI」标签页
```

Ribbon 提供三个按钮（`opencode-wps-assistant/ribbon.xml`）：

- **服务状态**：查看轮询状态与已注册动作数
- **暂停/恢复**：暂停或恢复轮询
- **打开Web**：先探测 launcher 与 opencode 服务（未运行则自愈拉起），再经 `/dock` 在系统浏览器（优先 Chrome）中打开 OpenCode AI 对话界面

> 💡 打开Web内置自愈：launcher 可达但 opencode 未运行时会自动 `POST /start` 拉起服务，并轮询探测端口就绪（最多 5s）后再打开浏览器。

## 应用切换

`opencode-wps-assistant/wps-auto.sh` 负责在文字/表格/演示之间自动切换：

- 启动应用：`open -a "WPS Office"`（优先）或 `open "wps:et"/"wps:wps"/"wps:wpp"` scheme 回退
- 切换流程：pkill 精确关闭 WPS 进程（`-x` 匹配 `wpsoffice`/`wps`/`et`/`wpp`/`wpspdf` + `com.kingsoft.wpsoffice` 前缀，避免误杀无关进程）→ 启动目标应用 → 轮询等待就绪（最多 10s）
- 空白文件：优先用 python3 生成最小 OOXML（docx/xlsx/pptx）后 `open` 打开（WPS 注册了文件关联），无 python3 时回退无参启动

## 已知限制

- **无内嵌 Chat UI**：Mac 版为命令轮询桥，对话在浏览器中进行（与 Linux 相同，区别于 Windows 侧边栏）
- **COM 不可用**：Mac 版 WPS 基于 WPS JS API（handlers/*.js），不走 PowerShell COM 桥接
- **沙箱内轮询延迟**：每 500ms 拉取一次命令，相比 Windows COM 同步调用有最多 500ms 的延迟；轮询失败时退避 500ms→1s→2s→5s 封顶，避免 CPU 空转
- **切换脚本依赖**：应用切换依赖 `open` 与 WPS 文件关联；无 python3 时无法生成空白文件（回退无参启动，不影响常规使用）

## 常见问题

**Q: 插件没有出现在 Ribbon？**
检查 `~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/` 下是否存在 `opencode-wps-assistant_/` 目录，重启 WPS。

**Q: MCP 连不上？**
在**仓库根目录**执行（构建后自动 `cd ..` 回到根目录）：
```bash
cd wps-office-mcp && npm install && npm run build && cd ..
```
> 若还需重新运行安装脚本同步配置，请务必在**仓库根目录**执行 `node install-addons-mac.js`（`install-addons*.js` 位于仓库根目录，不在 `wps-office-mcp/` 内）。

**Q: 打开Web提示 launcher 不可达？**
确认 `node launcher-mac.js` 已运行（`curl http://127.0.0.1:14097/health`），或重启 Mac 让 LaunchAgent 自动拉起。

**Q: 轮询一直失败/退避？**
查看 WPS 控制台日志与 launcher 日志（`~/Library/Logs/opencode-launcher.err`），确认 :58891 轮询服务已启动（MCP 服务器 `macPollServer` 在 darwin 平台自动 start）。

> 📖 更多排查见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)；Linux 版同架构说明见 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)。
