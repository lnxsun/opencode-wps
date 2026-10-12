# Linux 支持

OpenCode WPS 的 Linux 版支持，为 Linux 桌面环境下的 WPS Office 提供 OpenCode AI 能力。

> 状态：✅ 开发完成（代码/脚本/测试就绪）；⚠️ 尚未在真实 Linux + WPS 环境实测（需要实机验证）。

> 📖 完整三平台安装指南（含 Linux 环境要求/路径速查/卸载）见 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)。

## 架构总览

Linux 版与 macOS 版同架构（反向轮询桥），因为 Linux 版 WPS 加载项同样运行在沙箱内，无法启动 HTTP 服务端：

```
OpenCode AI (浏览器 14096)
    ↑ SSE / HTTP
WPS 插件 (opencode-wps-linux，Ribbon 按钮 + 轮询客户端)
    ↑ 每 500ms GET /poll，执行后 POST /result
MCP Server (wps-office-mcp，轮询服务端 :58891)
    ↑ stdio
OpenCode MCP 客户端
```

## 组件清单

| 组件 | 路径 | 说明 |
|------|------|------|
| Linux 插件（独立目录） | `opencode-wps-linux/` | manifest/ribbon/main/handlers/wps-auto.sh，与 Win/Mac 目录完全隔离 |
| Linux 轮询服务端 | `wps-office-mcp/src/client/linux-poll-server.ts` | 复用 MacPollServer 类，仅注入 Linux 切换脚本 |
| MCP 平台路由 | `wps-office-mcp/src/client/wps-client.ts` | 三通道：win32(PowerShell COM) / darwin(轮询) / linux(轮询) |
| Linux Launcher | `launcher-linux.js` | 端口 14097，ps/kill + /proc 扫描管理 opencode 进程（无 lsof 依赖），xdg-open 打开浏览器 |
| Linux 安装脚本 | `install-addons-linux.js` | 插件安装 + 注册文件 + MCP 配置 + skills/agents + XDG autostart |
| 文档 | `docs/LINUX.md` | 本文档 |

## 前置条件

- Linux 发行版（Debian/Ubuntu/Arch 等），x86_64 或 aarch64
- WPS Office Linux 版（https://linux.wps.cn，当前 12.1.x，deb/rpm）
- Node.js >= 18（或 Bun 1.0+）
- OpenCode CLI（`opencode` 在 PATH 中）
- Python 3（`wps-auto.sh` 生成空白 OOXML 文件用；缺失时回退无参启动 WPS）

## 安装步骤

```bash
# 1. 克隆仓库（二选一：
#    国内 CNB 镜像：git clone https://cnb.cool/lnxsun/opencode-wps.git
#    国外 GitHub：  git clone https://github.com/lnxsun/opencode-wps.git）
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps

# 2. 安装项目依赖（install-addons-linux.js 依赖根目录 node_modules 的 fs-extra）
npm install

# 3. 运行 Linux 安装脚本（等价于 Windows 的 install-addons.js / Mac 的 install-addons-mac.js）
node install-addons-linux.js
```

脚本完成：

1. 复制插件到 `~/.local/share/Kingsoft/wps/jsaddons/opencode-wps-linux_/`
2. 写入注册文件 `publish.xml` / `jsplugins.xml` / `authwebsite.xml`
3. 编译 MCP 服务器并写入 `~/.config/opencode/opencode.json`
4. 同步 skills / agents / plugins
5. 生成 XDG autostart（`~/.config/autostart/opencode-wps-launcher.desktop`）

## 使用

```bash
# 手动启动 launcher（或依赖 autostart 开机自启）
node launcher-linux.js

# 启动 opencode 服务（launcher 会自动管理，也可手动）
opencode serve --port 14096 --hostname 127.0.0.1 --cors file://

# 重启 WPS Office，Ribbon 出现「OpenCode AI」标签页
```

Ribbon 提供三个按钮：

- **服务状态**：查看轮询状态与已注册动作数
- **暂停/恢复**：暂停或恢复轮询
- **打开Web**：在系统默认浏览器打开 OpenCode AI 对话界面

## 应用切换

`opencode-wps-linux/wps-auto.sh` 负责在文字/表格/演示之间自动切换：

- 优先使用 WPS 原生命令：`wps`（文字）、`et`（表格）、`wpp`（演示）
- 命令不存在时回退 `xdg-open` 打开空白 Office 文件
- 切换流程：pkill 关闭所有 WPS 进程（轮询等待退出，最多 10s）→ 启动目标应用（轮询等待就绪，最多 10s）

## 已知限制

- ⚠️ **未实测**：尚未在真实 Linux + WPS 环境验证 JSAPI 行为（与 Mac 版同架构，风险较低）
- **沙箱内轮询延迟**：每 500ms 拉取一次命令，失败退避 500ms→1s→2s→5s 封顶，避免 CPU 空转（与 macOS 同架构）
- `wpsjs` 工具链（npm 包）不支持 Linux，开发加载项需手写目录结构与注册文件（本仓库已内置）
- Linux 版 WPS 不支持键盘快捷键模拟（WPS-Zotero 作者实测结论，影响很小）

## 常见问题

**Q: 插件没有出现在 Ribbon？**
检查 `~/.local/share/Kingsoft/wps/jsaddons/` 下是否存在 `opencode-wps-linux_/` 目录及 `publish.xml`，重启 WPS。

**Q: MCP 连不上？**
在**仓库根目录**执行（构建后自动 `cd ..` 回到根目录）：
```bash
cd wps-office-mcp && npm install && npm run build && cd ..
```
> 若还需重新运行安装脚本同步配置，请务必在**仓库根目录**执行 `node install-addons-linux.js`（`install-addons*.js` 位于仓库根目录，不在 `wps-office-mcp/` 内）。

**Q: 打开Web提示 launcher 不可达？**
确认 `node launcher-linux.js` 已运行（`curl http://127.0.0.1:14097/health`）。
