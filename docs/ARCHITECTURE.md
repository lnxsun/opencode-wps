# 架构设计

本文档从两个互补视角描述 OpenCode WPS 的架构：

- **4 层组件视图** — 按仓库目录归属划分层次
- **十层调用链视图** — 按一次完整请求的调用链划分（另含 ⑪ Launcher 旁路进程）

> 两种视角互为补充：组件第 1 层 ≈ 调用链 ②③④+⑪，第 2 层 ≈ ⑥（Agents），第 3 层 ≈ ⑦（Skills），第 4 层 ≈ ⑧⑨⑩；⑤ 为公共调度层，⑪ 为旁路服务进程。

## 4 层组件视图

```
opencode-wps/              # 第 1 层（Win）：WPS JS 插件（前台 Chat 窗口 + 后台 Launcher）
│   ├── index.html              # WPS 加载项入口文件（WPS 启动时加载）
│   ├── main.js                # Ribbon 回调、状态管理、OpenCode 连接
│   ├── taskpane.html          # Chat UI（SSE 流式对话、Markdown 渲染、会话管理、Agent 选择）
│   ├── launcher.js            # Launcher 进程（Windows 版）
│   ├── opencode-proxy.js      # CORS 代理（端口 14098，剥离 CSP 头）
│   ├── ribbon.xml             # 功能区按钮定义
│   ├── manifest.xml           # 插件清单
│   ├── config.js              # 全局配置中心
│   └── serve.js               # 开发静态服务器（端口 3444，仅开发用）
├── opencode-wps-assistant/  # 第 1 层（Mac）：WPS JS 插件（命令轮询桥，无 Chat UI）
│   ├── index.html              # WPS 加载项入口文件（WPS 启动时加载）
│   ├── main.js                # 轮询循环 + 命令分发
│   ├── handlers/              # Word/Excel/PPT 操作处理器（206 个动作，word 26 / excel 88 / ppt 82 / common 10）
│   ├── ribbon.xml             # 功能区按钮定义（服务状态/暂停恢复/打开Web）
│   ├── manifest.xml           # 插件清单
│   └── wps-auto.sh            # Mac 应用切换脚本（open + pkill）
├── opencode-wps-linux/      # 第 1 层（Linux）：WPS JS 插件（独立目录，命令轮询桥）
│   ├── main.js                # 轮询循环 + 命令分发（500ms 轮询 :58891）
│   ├── handlers/              # Word/Excel/PPT 操作处理器（platform 标记 linux）
│   ├── utils/response.js      # 响应工具（ok/fail/invalidParam）
│   ├── ribbon.xml             # 功能区按钮定义（服务状态/暂停恢复/打开Web）
│   ├── manifest.xml           # 插件清单
│   ├── package.json           # 插件元数据
│   └── wps-auto.sh            # Linux 应用切换脚本（wps/et/wpp + xdg-open）
├── shared/wps-bridge/       # 跨平台共享层（单一来源）：response/registry/common-core/handler-utils + excel/ppt/word-handler-core
│   └── （由 scripts/sync-wps-bridge.js 同步到 Mac/Linux 平台目录）
├── agents/                  # 第 2 层：Agents（跨平台通用，wps-expert/word/excel/ppt）
├── skills/                  # 第 3 层：Skills（跨平台通用，5 个技能）
├── .opencode/               # 项目级配置（跨平台通用，含 governance.js 治理插件）
└── wps-office-mcp/          # 第 4 层：MCP 服务器（Win→COM 桥接 / Mac→HTTP 轮询 / Linux→HTTP 轮询）
    ├── src/client/
    │   ├── wps-client.ts        # 跨平台路由：Win→PowerShell COM, Mac/Linux→HTTP poll
    │   ├── mac-poll-server.ts   # Mac HTTP 轮询服务器（:58891，Linux 复用本类）
    │   └── linux-poll-server.ts # Linux 轮询服务器（注入 Linux wps-auto.sh）
    └── scripts/                 # Windows COM 脚本（仅 Windows 使用）
```

**4 层说明（从上到下，使用流程）：**

- **第 1 层 WPS JS 插件** — Win：前台 Chat 窗口 + 服务进程管理；Mac/Linux：命令轮询桥（无 Chat 界面）。Windows 使用 COM 桥接（`opencode-wps/`），Mac 使用反向轮询（`opencode-wps-assistant/`），Linux 使用反向轮询（`opencode-wps-linux/`，独立目录）
- **第 2 层 Agents** — 角色定义，通过 Agent 选择实现功能聚焦（跨平台通用）
- **第 3 层 Skills** — 领域技能，AI 调用的能力集（跨平台通用）
- **第 4 层 MCP** — 跨平台路由：Win→PowerShell COM 桥接，Mac/Linux→HTTP 轮询（反向轮询插件）。三层工具体系：内置工具 + TypeScript handler（注册工具）+ WPS API 动作（COM Actions）

**横向机制：**

- **config.js 全局配置** — 所有配置的统一来源（OpenCode/Launcher 端口、网络超时、插件元数据、回退模型），注入为全局 `CONFIG` 对象供各层读取
- **governance.js 执行治理** — 通过 OpenCode Plugin Hooks（`tool.execute.before`/`after`）在所有 MCP 工具调用前后注入规则拦截（G2-G7 + P1-P4 + T1-T11，清单以 governance.js 源码为准），after 钩子更新状态 → before 钩子校验状态，形成防 AI 作弊闭环

### 组件说明

| 组件 | 说明 | 平台 |
|------|------|------|
| **opencode-wps** | WPS JS 加载项（Windows 版），Ribbon + Chat UI + Launcher 进程 | Windows |
| **opencode-wps-assistant** | WPS JS 加载项（Mac 版），命令轮询桥（无 Chat UI），轮询 :58891 拉取命令 | macOS |
| **opencode-wps-linux** | WPS JS 加载项（Linux 版），命令轮询桥，独立目录 | Linux |
| **wps-office-mcp** | MCP 服务器，跨平台路由（Win→PowerShell COM，Mac/Linux→HTTP 轮询） | 跨平台 |
| **skills** | OpenCode 技能定义，安装到 `~/.opencode/skills/` | 跨平台 |
| **agents** | 自定义 WPS Agents，定义在 `~/.config/opencode/agents/` | 跨平台 |
| **install-addons.js** | Windows 一键安装脚本 | Windows |
| **install-addons-mac.js** | macOS 安装脚本（launchd plist + 插件部署） | macOS |
| **install-addons-linux.js** | Linux 安装脚本（jsaddons + publish.xml + XDG autostart） | Linux |
| **launcher-mac.js** | macOS Launcher 进程（lsof/kill/ps/open） | macOS |
| **launcher-linux.js** | Linux Launcher 进程（/proc 扫描/kill/ps + xdg-open，无 lsof 依赖） | Linux |
| **shared/wps-bridge** | 跨平台共享层（单一来源）：response.js / registry.js / common-core.js / handler-utils.js + excel/ppt/word-handler-core.js，由 `scripts/sync-wps-bridge.js` 同步到 Mac/Linux | 跨平台 |

> 💡 **共享层说明**：Mac 与 Linux 反向轮询桥存在大量同构 handler 代码（历史上改 bug 需在两平台各改一遍）。`shared/wps-bridge/` 作为**单一来源**，平台目录文件（`common-handler.js`/`excel-handler.js`/`ppt-handler.js`/`word-handler.js`/`handler-utils.js`/`response.js`/`registry.js`）为**生成产物**。改动共享逻辑请改 `shared/` 后运行 `node scripts/sync-wps-bridge.js` 同步；CI 用 `node scripts/sync-wps-bridge.js --check` 校验漂移。

### MCP 工具体系（三层）

MCP 服务器采用三层工具体系，AI 通过不同的方式发现和调用：

| 层级 | 数量 | 命名约定 | 调用方式 | 说明 |
|------|------|----------|----------|------|
| **内置工具** | **以 `mcp-server.ts` 为准**（见 `validate:toolcounts` 输出） | `wps_xxx` | 直接 MCP 调用 | 启动即注册，**始终可直接调用**（Issue #382 DECISION-1：「网关强制」规则已删除，「网关专属」概念取消 —— 纯 TS 逻辑工具同样直连注册）。含基础工具 + 缓存工具 + `whoami` 自检 + 2 个 Gateway 工具（`wps_office_search`/`wps_office_execute`） |
| **注册工具** | 见 `tools/index.ts` | `wps_xxx_xxx`（分应用计数见 `validate:toolcounts` 输出） | → Gateway 路由 | 通过 `tools/index.ts` 注册，有完整的 TypeScript handler（参数校验+类型安全），不注册到 MCP，由 Gateway 优先调用 |
| **COM_ACTIONS** | 见 `gateway/com-actions.ts` 的 `COM_ACTIONS` | 短名称（`getCellValue`, `setFont`, `addSlide`） | `wps_office_search` → `wps_office_execute` → PS1 兜底 | Gateway 索引，按需发现。有 TS handler → 走 handler，无 handler → 透传 PS1 脚本 |

> 各层数量随开发持续演进，**以代码为准**（内置工具见 `mcp-server.ts`，注册工具见 `tools/index.ts`，COM_ACTIONS 数据表见 `gateway/com-actions.ts`、路由逻辑见 `gateway/index.ts`，校验见 `scripts/validate-tool-counts.js`）。

### config.js — 全局配置中心

`config.js` 是 WPS 插件的唯一配置来源，通过 `<script src="config.js">` 引入后，`CONFIG` 对象挂载为全局变量：

| 配置项 | 用途 | 默认值 |
|--------|------|--------|
| `CONFIG.opencode.apiBase` | OpenCode 服务地址 | `http://127.0.0.1:14096` |
| `CONFIG.launcher.apiBase` | Launcher 管理地址 | `http://127.0.0.1:14097` |
| `CONFIG.plugin.userHome` | 用户主目录（安装时注入） | `__OPCODE_WPS_USER_HOME__` |
| `CONFIG.network.timeout` | HTTP 请求超时 | `30000ms` |
| `CONFIG.session.defaultAgent` | 默认 agent | `wps-expert` |

### hooks — 执行治理的核心机制

`.opencode/plugins/governance.js` 通过 OpenCode Plugin Hooks 机制，在所有 MCP 工具调用前后注入拦截逻辑：

- **`tool.execute.before` 钩子**：在所有工具执行前检查规则（G2-G7 通用 + P1-P4 校对 + T1-T11 模板，清单以源码为准），违规直接阻断
- **`tool.execute.after` 钩子**：工具执行成功后更新状态追踪（如批次计数、修订计数、issue 来源），供下一次 `before` 钩子校验

**钩子的巨大作用**：

1. **零侵入** — 无需修改工具实现代码，在插件运行时动态注入
2. **全局管控** — 一次定义，覆盖所有 AI 的工具调用路径
3. **状态联动** — after 钩子追踪状态 → before 钩子校验状态，形成闭环
4. **防 AI 作弊** — 禁止 AI 跳过基础校对、跳过确认、编造修复等风险行为
5. **代码层强制执行** — 不依赖 AI 自觉，违反规则直接报错，AI 无法绕过

## 十层调用链视图

> 调用链共 10 层（①-⑩），⑪ Launcher 为**旁路服务管理进程**：它不参与请求流动，仅负责 `opencode serve`（⑤）的生命周期管理，故编号超出十层、单独列示。

### 全链路架构图

```
┌─────────────────────────────────────▼────────────────────────────────────┐
│             ① WPS 宿主应用（Win / Mac / Linux）                          │
│   Ribbon（打开面板 / 连接状态）+ WPS 文档对象模型                        │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │ ② 注入/加载
┌─────────────────────────────────────▼────────────────────────────────────┐
│        ② WPS JS 插件 — Win：前台 Chat UI / Mac·Linux：命令轮询桥         │
│    Win: opencode-wps/（taskpane.html SSE+Markdown 直连 :14096）          │
│    Mac: opencode-wps-assistant/（无 Chat UI，轮询 :58891 拉取命令）      │
│    Linux: opencode-wps-linux/（无 Chat UI，轮询 :58891 拉取命令）        │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │ ③ REST + SSE（仅 Win，运行时绕过 ④）
┌─────────────────────────────────────▼────────────────────────────────────┐
│   ⑤ OpenCode 中央调度平台（opencode serve :14096）                       │
│   会话管理 / Agent 路由（wps-expert/word/excel/ppt）                     │
│   ══ 治理横切：governance.js Hooks（before/after）══                     │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │ ⑤⑥ MCP 协议（stdio）
┌─────────────────────────────────────▼────────────────────────────────────┐
│       ⑥ Agents（跨平台）       ⑦ Skills（跨平台）                        │
│       agents/*.md              skills/*（5 个技能）                      │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │ ⑦ 工具调用（MCP）
┌─────────────────────────────────────▼────────────────────────────────────┐
│        ⑧ WPS Office MCP 服务器（三层工具体系）                           │
│        内置 + 注册 handler + COM Actions（数量以代码为准）                          │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │ ⑧⑨ 平台桥接（按平台路由）
┌─────────────────────────────────────▼────────────────────────────────────┐
│  ⑨ Win：PowerShell COM（wps-com.ps1）  │  ⑨ Mac/Linux：HTTP 轮询（:58891）│
│     → ⑩ WPS COM API 操作文档            │ mac/linux-poll-server.ts 500ms  │
│                                        │ 拉取 → ⑩ WPS JS API（handlers） │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │ ⑩ 操作结果 → 沿原路返回

┌─────────────────────────────────────┬────────────────────────────────────┐
│  ④ 自建通讯层 — CORS 代理（:14098）— 备用，不在运行时调用链              │
│  opencode-proxy.js 剥离 CSP 头；当前 launcher 已用 --cors file:// 放行   │
└─────────────────────────────────────┬────────────────────────────────────┘

┌─────────────────────────────────────┬────────────────────────────────────┐
│  ⑪ Launcher 服务管理（:14097）— 旁路进程，不参与调用链                   │
│  管理 opencode serve：/status /start /stop /health /dock（按端口精确停止）│
│  Win: schtasks / Mac: LaunchAgent / Linux: XDG autostart                 │
└─────────────────────────────────────┬────────────────────────────────────┘
```

### 十层职责与平台差异

| 层 | 职责 | 平台差异 |
|----|------|----------|
| ① WPS 宿主 | 承载插件运行环境，提供文档对象模型 | 三平台相同，但 COM 与 JS API 两套对象模型 |
| ② WPS JS 插件 | Win：前台 Chat UI（UI/会话/Agent 选择）；Mac/Linux：命令轮询桥（无 Chat 界面） | Win：taskpane.html（SSE 直连 :14096）；Mac：index.html（轮询 :58891 拉取命令）；Linux：manifest.xml 直载 main.js（轮询 :58891 拉取命令，无 index.html） |
| ③ 通讯协议 | 浏览器与 OpenCode 服务之间的 REST + SSE（仅 Win）；Mac/Linux 为插件↔MCP 的 HTTP 轮询 | 仅 Win：REST + SSE 直连 :14096（launcher 以 `--cors file://` 放行）；Mac/Linux：插件↔MCP :58891 HTTP 轮询，不直连 OpenCode |
| ④ 自建通讯层 | opencode-proxy.js（:14098）剥离 CSP 头，解决 WPS 内置 Chromium 103 不兼容现代 Web（官方 web 版需 Chrome 130+）的根因 | 备用方案：当前 launcher 已用 `--cors file://` 放行，运行时调用链不再经过它；Mac/Linux 无需 CORS 代理 |
| ⑤ OpenCode 调度 | 会话管理、Agent 路由、模型调度（config.js 支持 Ollama 回退模型） | 跨平台一致 |
| ⑥ Agents | 角色定义（wps-expert/word/excel/ppt），Agent 选择实现功能聚焦 | 跨平台一致 |
| ⑦ Skills | 领域技能（wps-word/excel/ppt/office/proofread），AI 调用的能力集 | 跨平台一致 |
| ⑧ MCP 服务器 | 三层工具体系：内置 + 注册 handler + COM Actions | 跨平台一致，数量以代码为准 |
| ⑨ 平台桥接 | 将 MCP 命令转换为平台原生调用 | Win：PowerShell COM（wps-com.ps1）；Mac/Linux：HTTP 轮询（:58891，500ms 间隔） |
| ⑩ WPS 操作 | 最终执行文档读写/格式化/校对/填值 | Win：COM API；Mac/Linux：WPS JS API（handlers/*.js） |
| ⑪ Launcher（旁路） | 管理 opencode serve 生命周期（:14097），实现开机自启；不参与请求调用链 | Win：计划任务（schtasks）；Mac：LaunchAgent plist；Linux：XDG autostart |

### 一次完整请求的调用链（以 Windows 为例）

```
用户在 Chat 输入 → ② taskpane.html → ③ SSE POST /session/{id}/message
→ ⑤ opencode serve :14096（Win 直连，launcher 以 `--cors file://` 放行）→ ⑥ Agent 路由 + ⑦ Skill 选择
→ ⑧ MCP 工具调用 → ⑨ wps-com.ps1（PowerShell COM）→ ⑩ WPS 文档操作
→ 结果沿原路返回 → SSE 流式渲染到 Chat 窗口
```

> 注：④ CORS 代理（:14098）为备用方案，不在上述实际调用链中；Mac/Linux 端无 Chat UI，由 `opencode-wps-assistant/` 或 `opencode-wps-linux/` 轮询 :58891 拉取 MCP 命令并返回结果。

## 工作原理（平台差异）

### Windows

```
┌────────────────────────────────────────────┐
│              WPS Office                    │
│  ┌──────────┐  ┌──────────────────────┐   │
│  │  Ribbon  │  │  taskpane.html       │   │
│  │  打开面板 │─▶│  SSE + Markdown      │   │
│  └──────────┘  └──────────┬───────────┘   │
│                           │ HTTP/SSE       │
└───────────────────────────┼────────────────┘
                            │
                ┌───────────▼───────────┐
                │  opencode serve:14096 │
                └───────────┬───────────┘
                            │ MCP
                ┌───────────▼───────────┐
                │  wps-office-mcp       │
                │  ├─ 内置工具          │
                │  ├─ 注册工具         │
                │  └─ COM Actions      │
                └───────────┬───────────┘
                            │ PowerShell COM
                ┌───────────▼───────────┐
                │  wps-com.ps1          │
                └───────────────────────┘

┌────────────────────────────────────────────┐
│  Launcher (port 14097, 计划任务自启)        │
└────────────────────────────────────────────┘
```

1. 计划任务自动启动 Launcher → 启动 `opencode serve --port 14096`
2. WPS 加载项连接 OpenCode，通过 SSE 流式对话
3. MCP 工具调用 → PowerShell COM 桥接 → 操作 WPS 文档

### macOS / Linux

```
┌────────────────────────────────────────────┐
│         WPS Office for Mac / Linux         │
│  ┌──────────┐  ┌──────────────────────┐   │
│  │  Ribbon  │  │  main.js (轮询循环)  │   │
│  │  打开Web │─▶│  handlers/*.js 执行 │   │
│  └──────────┘  └──────────▲───────────┘   │
│                           │ GET /poll      │
│                           │ 每 500ms       │
└───────────────────────────┼────────────────┘
                            │ :58891
                ┌───────────▼───────────┐
                │  mac/linux-poll-server│
                └───────────┬───────────┘
                            │ MCP
                ┌───────────▼───────────┐
                │  wps-office-mcp       │
                │  isMacPlatform()      │
                │  → execMacPoll()      │
                └───────────────────────┘

> 注：入口文件平台差异——Mac 插件有 `index.html`（加载全部 scripts 后执行 main.js）；Linux 插件无 index.html，由 `manifest.xml` `<scripts>` 直接加载 main.js。

┌────────────────────────────────────────────┐
│  launcher-mac/linux (port 14097, 自启)      │
└────────────────────────────────────────────┘
```

1. 自启机制自动启动 launcher → 启动 `opencode serve --port 14096`
2. MCP 检测到 Mac/Linux，使用 HTTP 轮询（`:58891/poll`）而非 PowerShell COM
3. WPS 插件每 500ms 拉取命令，通过 WPS JS API 直接操作文档

### 跨平台通用

所有原 darwin 守卫的 MCP 工具已移除平台限制，skills/agents/plugins 配置跨平台一致。

## 关键设计决策（源自实践踩坑）

1. **自建 Chat UI 而非官方 Web 版** — WPS 内置 Chromium 停留在 2022 年的 103 版本，官方 opencode web 版需 Chrome 130+，只能基于 REST + SSE 自建通讯层
2. **Launcher 进程而非 VBS/bat** — 经历 `OAAssist.ShellExecute`（触发安全警告）、VBS 脚本、手动命令等方案后，最终采用 Launcher 进程 + 计划任务/LaunchAgent/XDG autostart 自动启动
3. **三平台差异化桥接** — Win 走 PowerShell COM（同步、强类型），Mac/Linux 走 HTTP 反向轮询（500ms 拉取、异步），三者共用同一 MCP 层和工具集
4. **治理横切进调用链** — governance.js 的规则（G2-G7 + P1-P4 + T1-T11，清单以源码为准）不改变调用链结构，而是通过 Plugin Hooks 在⑤层拦截所有工具调用，before/after 形成状态闭环

> 📖 Windows 详细说明见 [WINDOWS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md)；macOS 详细说明见 [MAC.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md)；Linux 详细说明见 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)；MCP 协议见 [MCP.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MCP.md)；PowerShell COM 桥接见 [POWERSHELL_COM.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/POWERSHELL_COM.md) 与 [WPS_COM_PS1.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WPS_COM_PS1.md)。
