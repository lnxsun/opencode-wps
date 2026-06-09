# OpenCode WPS

[![CI](https://github.com/lnxsun/opencode-wps/actions/workflows/ci.yml/badge.svg)](https://github.com/lnxsun/opencode-wps/actions)
[![Version](https://img.shields.io/github/v/release/lnxsun/opencode-wps)](https://github.com/lnxsun/opencode-wps/releases)
[![License](https://img.shields.io/github/license/lnxsun/opencode-wps)](LICENSE)

[OpenCode](https://github.com/anomalyco/opencode) AI 助手的 WPS Office 插件，让你在 WPS 文字、表格、演示中直接与 AI 对话，获取智能辅助。

## 项目简介

OpenCode WPS 将 OpenCode AI 的能力集成到 WPS Office 中，通过侧边栏 Chat UI 与 AI 实时交互。你可以让 AI 帮你撰写文档、分析数据、生成幻灯片内容，所有操作都在 WPS 内完成，无需切换窗口。

核心特性：

- **WPS 内嵌 AI 对话** — 侧边栏 Chat UI，支持 SSE 流式输出、Markdown 渲染
- **多会话管理** — 创建、重命名、切换、删除对话会话
- **MCP 工具集成** — 通过 WPS Office MCP 服务器，AI 可以直接操作文档（读/写/格式化），489 个工具覆盖三大应用
- **WPS 专用 Agents** — 自定义 wps 主 agent 和 wps-expert/wps-word/wps-excel/wps-ppt 子 agents
- **执行治理插件** — `.opencode/plugins/governance.js` 使用 16 条通用规则（G1-G8）+ 16 条校对规则（P1-P16）+ 11 条模板填写规则（T1-T11），运行时拦截所有 MCP 调用
- **Agent 选择** — 底部工具栏支持切换不同 agent，消息自动传递 agent 参数
- **一键安装** — 运行 `node install-addons.js` 自动完成全部组件安装（8 步）
- **开机自启** — 通过 Launcher 进程自动管理 OpenCode 服务（监听 14097 端口），用户登录时自动启动
- **执行治理** — governance.js 使用 P1-P16 规则强制 AI 遵守工具调用规范（严格逐批校对、禁止 AI 编造问题、交叉校验修复内容）
- **完整技术文档** — `docs/` 目录包含开发指南、API 参考、问题排查等 10+ 份文档

## 项目组成（4 层架构）

```
opencode-wps/
├── docs/                      # 技术文档
│   ├── README.md              # 文档索引
│   ├── DEVELOPMENT_GUIDE.md  # 开发指南
│   ├── TROUBLESHOOTING.md    # 问题排查
│   ├── OPENCODE_API.md       # OpenCode API 文档
│   ├── WPS_COM_API.md        # WPS COM API 参考
│   ├── WPS_COM_PS1.md        # wps-com.ps1 实现原理
│   ├── MCP.md                # MCP 协议说明
│   ├── POWERSHELL_COM.md     # PowerShell COM 调用
│   ├── SKILLS.md             # Skills 开发指南
│   ├── INSTALL_SCRIPT.md     # 安装脚本说明
│   └── WPSJS_DEVELOPMENT.md  # WPS JS 开发指南
├──
├── opencode-wps/              # 第 1 层：WPS JS 插件（前台 Chat 窗口 + 后台 Launcher）
│   ├── main.js                # Ribbon 回调、状态管理、OpenCode 连接
│   ├── taskpane.html          # Chat UI（SSE 流式对话、Markdown 渲染、会话管理、Agent 选择）
│   ├── launcher.js            # Launcher 进程（自动启动 opencode serve，管理 14097 端口）
│   ├── ribbon.xml             # 功能区按钮定义
│   └── manifest.xml           # 加载项清单
├── agents/                    # 第 2 层：Agents（安装到 ~/.config/opencode/agents/）
│   ├── wps.md               # WPS 助手主 agent
│   ├── wps-expert.md        # WPS 专家子 agent
│   ├── wps-word.md          # Word 文档处理专家
│   ├── wps-excel.md         # Excel 数据处理专家
│   └── wps-ppt.md           # PPT 演示制作专家
├── skills/                    # 第 3 层：Skills（安装到 ~/.opencode/skills/）
│   ├── wps-excel/           # Excel 操作技能
│   ├── wps-word/            # Word 操作技能
│   ├── wps-ppt/             # PPT 操作技能
│   ├── wps-office/          # WPS 通用技能
│   └── wps-proofread/       # 文档校对技能
├── .opencode/                 # 项目级配置（安装时同步到用户目录）
│   ├── plugins/
│   │   └── governance.js    # 执行治理插件（G1-G8 + P1-P16 + T1-T11）
│   └── package.json
├── wps-office-mcp/            # 第 4 层：MCP 服务器（COM 桥接 → WPS API）
│   └── src/                   # TypeScript 源码
├── install-addons.js          # 一键安装脚本（8 步）
├── package.json               # 项目依赖
└── README.md
```

**4 层说明（从上到下，使用流程）：**
- **第 1 层 WPS JS 插件** — 用户可见的 Chat 窗口 + Launcher 服务进程管理
- **第 2 层 Agents** — 角色定义，通过 Agent 选择实现功能聚焦
- **第 3 层 Skills** — 领域技能，AI 调用的能力集
- **第 4 层 MCP (COM 桥接)** — 20+ 个 TypeScript handler（优先执行，参数校验+类型安全）+ 240 个 COM Actions（Gateway 按需加载，无 handler 时透传 PS1）

### MCP 工具体系

MCP 服务器采用三层工具体系，AI 通过不同的方式发现和调用：

| 层级 | 数量 | 命名约定 | 调用方式 | 说明 |
|------|------|----------|----------|------|
| **内置工具** | 14 | `wps_xxx` | 直接 MCP 调用 | 启动即注册，始终可用。含 12 个通用工具 + 2 个 Gateway 工具（`wps_office_search`/`wps_office_execute`） |
| **注册工具** | 244 | `wps_xxx_xxx`（Excel 12 / Word 6 / PPT 15 / Common 4 / proofread 15） | → Gateway 路由 | 通过 `tools/index.ts` 注册，有完整的 TypeScript handler（参数校验+类型安全）。**不注册到 MCP**，而是由 Gateway 优先调用 |
| **COM_ACTIONS** | 240 | 短名称（`getCellValue`, `setFont`, `addSlide`） | `wps_office_search` → `wps_office_execute` → PS1 兜底 | Gateway 索引，按需发现。**执行流程：有 TS handler → 走 handler（自动转换 camelCase→snake_case），无 handler → 透传 PS1 脚本** |

**三层分工**：内置工具处理基础操作，注册工具提供类型安全的深度控制，COM_ACTIONS 覆盖 240 个 WPS API 作为兜底。总计 498 个可用工具。


### 组件说明


| 组件 | 说明 |
|------|------|
| **opencode-wps** | WPS JS 加载项，在 WPS 功能区添加 "OpenCode AI" 标签页，提供侧边栏 Chat UI（含 Agent 选择） |
| **wps-office-mcp** | MCP (Model Context Protocol) 服务器，让 AI 通过 MCP 协议直接操作 WPS 文档（14 内置 + 235 注册 + 240 COM Actions，Gateway 按需加载） |
| **skills** | OpenCode 技能定义，安装到 `~/.opencode/skills/`，指导 AI 如何使用 WPS 相关工具 |
| **agents** | 自定义 WPS Agents（wps-expert 主 agent + wps-word/wps-excel/wps-ppt 子 agents），定义在 `~/.config/opencode/agents/` |
| **install-addons.js** | 一键安装脚本，自动完成所有组件的安装和配置 |

## 项目历史

本项目经历了以下演进过程：

1. **wpsjs 起步** — 按 WPS 官方的 JS 加载项文档实在开发不出来，最后从 [wpsjs](https://github.com/laihaojie/wpsjs) 项目起步，才成功开发出 WPS 插件
2. **iflow 时代** — 最初借鉴 [iflow-for-obsidian](https://github.com/junjie-yan/iflow-for-obsidian) 的方式在 WPS 中调用 [iflow cli](https://github.com/iflow-ai/iflow-cli)，通过 4 个 skills + 1 个 MCP（来自 [wps-skills](https://github.com/lc2panda/wps-skills)）及其关键的 COM 桥接插件，实现了在侧边栏通过对话所见即所得地实时操作文档。开发已经完成，但 iflow cli 官方执意关闭，只能另寻出路
3. **转向 OpenCode** — 转到 OpenCode 后，最初想借鉴 [opencode-obsidian](https://github.com/mtymek/opencode-obsidian) 的方式直接调用官方的 opencode web 界面，但反复尝试后发现 WPS 内置 Chromium 停留在 2022 年的 103 版本，而官方 web 版需要 Chrome 130+，根本不兼容
4. **自建 Chat UI** — 既然官方 web 界面走不通，就基于 OpenCode 的 REST API + SSE 自建了 Chat UI，直接在 WPS 侧边栏中渲染 AI 对话
5. **解决启动问题** — 经历了 `OAAssist.ShellExecute`（触发 WPS 安全警告）、VBS 脚本、手动命令等多种方案后，最终采用 Launcher 进程管理服务 + 计划任务自动启动 Launcher，无需 bat/vbs/手动操作
6. **功能整合** — 将两个独立的旧插件（`wps-claude-addon` 和 `wps-claude-assistant`）合并到统一的 `opencode-wps` 加载项中
7. **迁移到 OpenCode 架构** — 从 Claude Desktop 架构完全迁移到 OpenCode 架构（MCP 配置格式、Skills 目录、插件机制等）
8. **Markdown 渲染** — 重写 `renderMarkdown()` 函数，支持代码块、表格、列表、引用等完整 Markdown 语法

## 环境要求

- **操作系统**：Windows 10/11
- **WPS Office**：个人版 12.1.0+ 或企业版
- **Node.js**：18.0.0+
- **OpenCode**：已安装 opencode-ai（`npm install -g opencode-ai`）

## 安装

### 1. 克隆项目

```bash
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

安装脚本会自动完成以下 8 个步骤：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 安装 WPS 插件 | 复制 opencode-wps 到 `%APPDATA%\kingsoft\wps\jsaddons\`，注册到 publish.xml/jsplugins.xml |
| 2 | 安装 MCP 依赖 | 在 wps-office-mcp 目录执行 `npm install` |
| 3 | 编译 MCP 服务器 | 在 wps-office-mcp 目录执行 `npm run build` |
| 4 | 配置 OpenCode MCP | 修改 `~/.config/opencode/opencode.json`，添加 wps-office MCP 服务器 |
| 5 | 安装 Skills | 复制 5 个技能到 `~/.opencode/skills/` |
| 6 | 安装 Agents | 复制自定义 agents 到 `~/.config/opencode/agents/` 和 `~/.opencode/agents/` |
| 7 | 安装 Plugins | 复制治理插件到 `~/.config/opencode/plugins/` |
| 8 | 注册 Launcher | 注册 Launcher 进程实现开机自启，监听 14097 端口管理服务 |

### 4. 重启 WPS Office

安装完成后重启 WPS，功能区会出现 **OpenCode AI** 标签页。

## 使用

### 打开 AI 对话面板

1. 在 WPS 功能区点击 **OpenCode AI** 标签页
2. 点击 **打开面板** 按钮，右侧弹出 Chat 侧边栏
3. 点击 **连接状态** 按钮查看 OpenCode 服务状态

### 对话操作

- **发送消息** — 在输入框输入问题，按 Enter 或点击发送
- **SSE 流式输出** — AI 回复实时流式显示，支持 Markdown 渲染（代码块、表格、列表等）
- **会话管理** — 点击会话列表切换对话，支持创建、重命名、删除会话
- **Agent 选择** — 点击底部工具栏的 Agent 按钮，选择不同的 AI 助手

### WPS Agents

项目内置了专门的 WPS Office 智能助手：

| Agent | 类型 | 说明 |
|-------|------|------|
| **wps** | 主 agent | WPS Office 综合助手（OpenCode 默认 agent） |
| **wps-expert** | 子 agent | WPS Office 智能助手，综合处理 Word/Excel/PPT（可用 `@wps-expert` 调用）|
| **wps-word** | 子 agent | Word 文档处理专家（可用 `@wps-word` 调用）|
| **wps-excel** | 子 agent | Excel 数据处理专家（可用 `@wps-excel` 调用）|
| **wps-ppt** | 子 agent | PPT 演示文稿专家（可用 `@wps-ppt` 调用）|

**使用方式**：
1. 在消息中使用 `@wps-expert`、`@wps-word`、`@wps-excel`、`@wps-ppt` 调用子 agents 处理特定任务
2. 默认使用 wps 主 agent（无需 @ 前缀）

**自定义 Agents**：
- Agents 定义位置：`~/.config/opencode/agents/`
- 修改后重启 OpenCode 服务生效

### OpenCode 服务管理

OpenCode 服务通过 Launcher 进程管理（监听 `127.0.0.1:14097`），无需手动操作：

```bash
# 通过 Launcher API 管理服务
# 查看状态：GET http://127.0.0.1:14097/status
# 启动服务：POST http://127.0.0.1:14097/start (body: {"cwd": "目录"})
# 停止服务：POST http://127.0.0.1:14097/stop  ← 2026-05-05 按端口精确停止
```

> **2026-05-05 更新**：停止服务改为按端口 14096 精确杀死进程，不再使用 `taskkill /IM opencode.exe` 全杀。

服务默认监听 `127.0.0.1:14096`，WPS 插件会自动检测并连接。

## 工作原理

```
┌─────────────────────────────────────────────────┐
│                  WPS Office                      │
│  ┌──────────┐    ┌──────────────────────────┐   │
│  │ Ribbon   │    │  Chat UI (taskpane.html) │   │
│  │ 打开面板  │───▶│  SSE 流式对话             │   │
│  │ 连接状态  │    │  Markdown 渲染            │   │
│  └──────────┘    │  会话管理                 │   │
│                  └────────────┬─────────────┘   │
│                               │ HTTP/SSE         │
└───────────────────────────────┼──────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  opencode serve       │
                    │  127.0.0.1:14096      │
                    └───────────┬───────────┘
                                │ MCP
                    ┌───────────▼───────────┐
                     │  wps-office-mcp       │
                     │  ┌─────────────────┐  │
                     │  │ 14 内置工具      │  │
                     │  │ 235 注册工具      │  │
                     │  │ 2 Gateway 工具   │  │
                    │  ├─── 按需 ────────┤  │
                    │  │ 240 COM Actions │  │
                    │  │ (Gateway 索引)   │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘

┌─────────────────────────────────────────────────┐
│              Launcher (后台进程)                  │
│  ┌──────────────────────────────────────────┐   │
│  │  127.0.0.1:14097                         │   │
│  │  - 启动/停止 opencode serve              │   │
│  │  - WPS 插件通过此端口管理服务             │   │
│  │  (由 Windows 计划任务随开机启动)         │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

1. Windows 登录时，计划任务自动启动 Launcher（launcher.js），Launcher 监听 14097 端口
2. Launcher 自动启动 `opencode serve --port 14096` 并管理其生命周期
3. WPS 加载项通过 HTTP 检测服务状态，连接后打开 Chat UI
3. Chat UI 通过 SSE 与 OpenCode 交互，实时流式显示 AI 回复
4. OpenCode 通过 MCP 协议调用 wps-office-mcp 服务器操作文档
5. wps-office-mcp 采用**渐进式加载模式**：启动时仅注册 14 个内置工具 + 2 个 Gateway 工具（`wps_office_search`/`wps_office_execute`），240 个 COM Actions 通过 Gateway 索引按需发现和执行，避免启动时一次性注册大量工具导致超时

## 交流群

欢迎加入 OpenCode-WPS 微信交流群，获取最新动态、反馈问题、交流使用心得：

<img src="docs/assets/wechat-group.jpg" alt="OpenCode-WPS 微信交流群" width="300">

> 二维码有效期至 6/15，加入后会更新。如二维码过期，请提交 [Issue](https://github.com/lnxsun/opencode-wps/issues) 联系维护者。

## 致谢

本项目站在以下项目的肩膀上，深表感谢：

- [wpsjs](https://github.com/laihaojie/wpsjs) — 按 WPS 官方文档实在开发不出来，最后从 wpsjs 起步才成功开发出 WPS 插件
- [wps-skills](https://github.com/lc2panda/wps-skills) — 侧边栏通过对话所见即所得地实时操作文档，靠的是 wps-skills 的 skills + MCP（wps-office MCP）及其关键的 COM 桥接插件
- [iflow-for-obsidian](https://github.com/junjie-yan/iflow-for-obsidian) — 最初的实现借鉴了 iflow-for-obsidian 在 WPS 中调用 iflow cli 的方式
- [iflow cli](https://github.com/iflow-ai/iflow-cli) — 一切开始的地方，太遗憾官方执意关闭了 iflow cli
- [opencode-obsidian](https://github.com/mtymek/opencode-obsidian) — 转到 OpenCode 后本来想借鉴其方式直接调用官方 web 界面，但发现 WPS 内置 Chromium 103 不兼容官方 web 版（需 Chrome 130+）
- [opencode](https://github.com/anomalyco/opencode) — 最后落脚的地方

