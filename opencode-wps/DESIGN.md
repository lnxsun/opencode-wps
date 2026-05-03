# WPS OpenCode AI 加载项 - 设计文档

## 1. 项目概述

本项目是一个 WPS Office 加载项（WPSJS Add-in），将 [opencode](https://github.com/nicepkg/opencode) AI 助手集成到 WPS 侧边栏中，为用户提供文档上下文感知的 AI 对话能力。

### 1.1 核心目标

- 在 WPS 侧边栏中提供完整的 AI 聊天界面
- 自动获取当前文档名称、路径、选中文本等上下文信息并注入 AI 会话
- 支持多会话管理、模型切换、模式切换等功能
- 通过 opencode REST API + SSE 实现实时流式响应

### 1.2 技术选型说明

**为何使用自定义 Chat UI 而非 iframe 嵌入 opencode Web UI：**

项目早期参考了 [opencode-obsidian](https://github.com/nicepkg/opencode-obsidian) 插件的 iframe 嵌入方案，但经过测试发现该方案在 WPS 环境中不可行：

1. **JS 运行时崩溃** — opencode SPA 访问 `e.project.worktree` 时 `e.project` 为 `undefined`，导致 `TypeError`
2. **CSS 兼容性** — opencode 前端使用 `dvh`（Chrome 108+）、`:has()`（Chrome 105+）、`@container`（Chrome 105+），WPS 内置浏览器为 Chrome 104，均不支持
3. **项目数据不匹配** — `/experimental/worktree` API 返回空数组，session 与实际工作目录不一致

因此最终采用自定义 Chat UI，仅通过 REST API 和 SSE 与 opencode 后端通信，完全兼容 Chrome 104+。

## 2. 系统架构

```
+------------------------------------------+
|              WPS Office 进程               |
|                                          |
|  +----------------+  +----------------+  |
|  |  index.html    |  |  taskpane.html |  |
|  |  (主入口)       |  |  (侧边栏 UI)   |  |
|  |  加载 main.js  |  |  自定义 Chat UI |  |
|  +-------+--------+  +-------+--------+  |
|          |                    |           |
|          |   PluginStorage    |           |
|          +<--- 跨上下文通信 --->+           |
|          |                    |           |
+----------|--------------------|-----------+
           |                    |
           | ShellExecute       | XHR / SSE
           | (启动进程)          | (API 调用)
           v                    v
+------------------------------------------+
|         opencode serve 进程               |
|         http://127.0.0.1:14096           |
|                                          |
|  REST API:                               |
|    POST   /session          创建会话      |
|    GET    /session           列出会话     |
|    GET    /session/:id       会话详情     |
|    PATCH  /session/:id       修改会话     |
|    DELETE /session/:id       删除会话     |
|    GET    /session/:id/message 历史消息   |
|    POST   /session/:id/message 发送消息   |
|    POST   /session/:id/abort   中止生成   |
|    GET    /global/health     健康检查     |
|    GET    /global/config     获取配置     |
|    GET    /global/event      SSE 事件流   |
+------------------------------------------+
           ^
           |
+------------------------------------------+
|     serve.js (Node.js 静态文件服务)        |
|     http://127.0.0.1:3444                |
|                                          |
|  服务 test-wps-addon/ 目录下的静态文件      |
|  提供 CORS 头 (Access-Control-Allow-*)    |
+------------------------------------------+
```

### 2.1 组件职责

| 组件 | 文件 | 职责 |
|------|------|------|
| WPS 入口 | `index.html` | WPS 加载项入口，加载 `main.js` |
| 主逻辑 | `main.js` | Ribbon 回调、opencode 进程管理、Session 创建、跨上下文通信 |
| 侧边栏 UI | `taskpane.html` | 完整的聊天界面，包含 CSS + HTML + JS（单文件） |
| 静态服务 | `serve.js` | Node.js HTTP 服务器，为 WPS 提供加载项文件 |
| Ribbon 定义 | `ribbon.xml` | WPS 工具栏按钮定义 |
| 插件注册 | `publish.xml` | WPS 加载项注册文件（位于 `%APPDATA%\kingsoft\wps\jsaddons\`） |
| 项目配置 | `wpsjs.config.js` | 端口等基础配置 |

## 3. 文件详细设计

### 3.1 main.js — 主控制逻辑

运行在 WPS 主上下文中（`index.html` 加载），拥有完整的 WPS API 访问权限。

#### 3.1.1 全局配置

```
OPENCODE_PORT = 14096        opencode 服务端口
OPENCODE_HOST = '127.0.0.1'  监听地址
OPENCODE_CWD  = 'D:\code\office-test'  工作目录（opencode 从此目录启动）
OPENCODE_CORS_ORIGINS = 'file:// http://127.0.0.1:3444'  允许的 CORS 来源
```

#### 3.1.2 状态管理

通过 `PluginStorage` 在 main.js 和 taskpane.html 之间共享状态：

| Key | 说明 | 写入方 |
|-----|------|--------|
| `opencode_state` | 服务状态：`stopped` / `starting` / `running` / `error` | main.js |
| `opencode_error` | 错误信息 | main.js |
| `opencode_api_base` | API 地址，如 `http://127.0.0.1:14096` | main.js |
| `opencode_cwd` | 工作目录 | main.js |
| `opencode_session_id` | 当前会话 ID | main.js / taskpane |
| `opencode_command` | taskpane 发给 main 的命令（`start` / `stop`） | taskpane |
| `taskpane_id` | 侧边栏面板 ID | main.js |

#### 3.1.3 启动流程

```
用户点击 "打开面板"
    |
    v
OnAction("btnShowTaskPane")
    |-- 创建/显示 TaskPane (taskpane.html)
    |-- 如果 OPENCODE_STATE === 'stopped'
    |       |
    |       v
    |   startOpenCodeServer()
    |       |-- checkServerHealth()  --> 已在运行？
    |       |       |-- 是 --> onServerReady()
    |       |       |-- 否 --> ShellExecute 启动 opencode
    |       |                     |
    |       |                     v
    |       |               waitForServer() (轮询, 最多 30s)
    |       |                     |
    |       |                     v
    |       |               onServerReady()
    |       |                     |
    |       |                     v
    |       |               createSession() --> POST /session
    |       |                     |
    |       |                     v
    |       |               setOpenCodeState('running')
    |       |               (写入 PluginStorage, taskpane 监听到)
```

#### 3.1.4 命令轮询

taskpane.html 无法直接调用 main.js 的函数（不同执行上下文），因此通过 PluginStorage 实现命令传递：

- taskpane 写入 `opencode_command = 'start'`
- main.js 每 500ms 轮询检查，发现命令后执行并清空

### 3.2 taskpane.html — 侧边栏聊天界面

单 HTML 文件，包含 CSS 样式 + HTML 结构 + JavaScript 逻辑。运行在 WPS TaskPane 上下文中。

#### 3.2.1 UI 结构

```
+-----------------------------------+
| [Logo] OpenCode         [新会话]   |  <- topbar
+-----------------------------------+
| [三] 汉堡菜单                      |  <- subheader
+-----------------------------------+
| [Session]          [Changes]      |  <- tabs
+-----------------------------------+
| 会话标题    [状态点]  [...]         |  <- session-header
+-----------------------------------+
|                                   |
|   用户消息气泡 (右对齐)             |
|                                   |
|   AI 回复 (左对齐, Markdown 渲染)  |
|     > Thinking (可折叠)            |
|     正文内容 (流式光标动画)          |
|                                   |
|   ...                             |
|                                   |
+-----------------------------------+
| [+]  输入框              [发送]    |  <- input-area
+-----------------------------------+
| [Build v] [模型 v] [Default v]    |  <- bottombar (3个下拉菜单)
+-----------------------------------+
```

#### 3.2.2 功能清单

**聊天核心：**
- 消息发送：`POST /session/{id}/message` (fire-and-forget, 5 分钟超时)
- 流式响应：通过 SSE (`/global/event`) 接收 `message.part.delta` 事件
- 中止生成：`POST /session/{id}/abort`
- 历史消息加载：`GET /session/{id}/message`
- Markdown 渲染：支持标题、加粗、斜体、代码块、列表、引用、链接

**会话管理：**
- 新建会话：`POST /session`
- 重命名：`PATCH /session/{id}` 修改 title
- 删除：`DELETE /session/{id}`
- 切换会话：通过汉堡菜单侧边栏选择
- 分享/归档：UI 已实现，功能预留

**底部栏下拉菜单：**
- **Build/Plan 模式切换** — 选择 AI 工作模式
- **模型选择器** — 从 `/global/config` 获取可用模型列表，支持 Free 标签显示
- **Default** — 预留配置项

**上下文注入：**
- 自动注入：每次发送消息前，自动检查并注入文档上下文
- 手动注入：点击 `+` 按钮强制注入
- 注入方式：`POST /session/{id}/message` + `noReply: true`
- 上下文内容：文档名称、路径、选中文本（截断至 3000 字符）
- 格式：`<wps-context>...</wps-context>` 包裹

#### 3.2.3 SSE 事件处理

taskpane.html 通过 `EventSource` 连接 `/global/event`，处理以下事件：

| 事件类型 | 处理逻辑 |
|----------|----------|
| `session.status` | 更新状态点（busy/idle），idle 时完成流式输出 |
| `message.updated` | 新消息开始（创建流式气泡）/ 消息完成（finalize） |
| `message.part.updated` | 记录 part 类型（text/reasoning），完整 part 更新 |
| `message.part.delta` | 增量文本追加，实时更新流式气泡 |

#### 3.2.4 流式渲染机制

```
message.updated (role=assistant, finish=false)
    |-- 创建流式气泡 (id="streaming-msg")
    |-- 显示闪烁光标动画
    v
message.part.delta (多次)
    |-- 根据 partID 判断是 text 还是 reasoning
    |-- 追加到 STREAMING_TEXT 或 STREAMING_REASONING
    |-- 实时更新气泡 innerHTML (Markdown 渲染 + 光标)
    v
session.status (idle) / message.updated (finish=true)
    |-- finalizeStreaming()
    |-- 移除光标动画
    |-- 移除 streaming-msg id（转为普通历史消息）
```

#### 3.2.5 初始化流程

```
页面加载
    |
    v
setInterval 300ms 轮询 PluginStorage
    |-- state === 'running'  --> initApp()
    |-- state === 'error'    --> showError()
    |-- state === 'stopped'  --> 显示 "Start OpenCode" 按钮
    |
    v (2秒后兜底)
直接尝试 GET /global/health
    |-- 成功 --> initApp()
    |-- 失败 --> 保持等待

initApp():
    |-- 读取 PluginStorage 中的 api_base, cwd, session_id
    |-- GET /global/health 确认服务可用
    |-- fetchAvailableModels() 获取模型列表
    |-- 如有 session_id --> loadSessionMessages()
    |-- 否则 --> createNewSession()
    |-- connectSSE() 建立事件流连接
```

### 3.3 serve.js — 静态文件服务器

简单的 Node.js HTTP 服务器，无第三方依赖。

- 监听 `127.0.0.1:3444`
- 服务 `test-wps-addon/` 目录下的所有静态文件
- 返回 `Access-Control-Allow-Origin: *` 头（允许 WPS 内置浏览器跨域访问）
- 支持 MIME 类型：`.html`, `.js`, `.xml`, `.css`, `.json`, `.png`, `.jpg`, `.svg`
- 包含路径遍历安全检查

### 3.4 ribbon.xml — 工具栏定义

在 WPS 工具栏中添加 "OpenCode AI" 选项卡，包含：

| 按钮 ID | 标签 | 功能 |
|---------|------|------|
| `btnShowTaskPane` | 打开面板 | 创建/切换侧边栏面板 |
| `btnStartStop` | 启动/停止 AI | 动态标签，控制 opencode 进程 |
| `btnSendContext` | 发送上下文 | 预留（现由 taskpane 内部处理） |

### 3.5 publish.xml — 插件注册

位于 `%APPDATA%\kingsoft\wps\jsaddons\publish.xml`：

```xml
<jsplugins>
  <jspluginonline name="test-wps-addon" type="wps"
    url="http://127.0.0.1:3444/"
    enable="enable_dev" install="null"/>
</jsplugins>
```

WPS 启动时读取此文件，从 `url` 加载加载项。`enable_dev` 表示开发模式启用。

## 4. 通信协议

### 4.1 消息发送（fire-and-forget 模式）

发送消息时使用特殊的 `postMessage()` 函数，而非通用的 `fetchJSON()`：

- 超时设为 5 分钟（300000ms）
- 超时不视为错误（SSE 仍在接收流式响应）
- 仅 HTTP 400+ 状态码才触发 onError
- AI 回复通过 SSE 事件流式到达，不依赖 POST 响应

### 4.2 上下文注入协议

```
POST /session/{id}/message
Content-Type: application/json

{
  "noReply": true,
  "parts": [{
    "type": "text",
    "text": "<wps-context>\nCurrent document: xxx.docx\nPath: D:\\...\n\nSelected text:\n\"\"\"\n选中的内容...\n\"\"\"\n</wps-context>"
  }]
}
```

- `noReply: true` — 告诉 opencode 不要对此消息生成回复
- 上下文通过去重机制避免重复注入（`LAST_INJECTED_CONTEXT`）
- 选中文本超过 3000 字符时自动截断

### 4.3 跨上下文通信（main.js <-> taskpane.html）

WPS 加载项中，`index.html`（主入口）和 `taskpane.html`（侧边栏）运行在不同的 JS 上下文中，无法直接调用对方函数。通信通过 `PluginStorage` 实现：

```
main.js:  window.Application.PluginStorage.setItem('opencode_state', 'running')
taskpane: window.Application.PluginStorage.getItem('opencode_state')  // 'running'
```

taskpane 向 main 发命令：
```
taskpane: setPS('opencode_command', 'start')
main.js:  // 500ms 轮询检测到命令，执行后清空
```

## 5. 浏览器兼容性约束

WPS 内置浏览器基于 **Chrome 104**，以下特性不可使用：

| 特性 | 最低版本 | 状态 |
|------|----------|------|
| `dvh` / `svh` 单位 | Chrome 108 | 不可用 |
| `:has()` 选择器 | Chrome 105 | 不可用 |
| `@container` 查询 | Chrome 105 | 不可用 |
| `structuredClone()` | Chrome 98 | 可用 |
| `EventSource` (SSE) | Chrome 6 | 可用 |
| `XMLHttpRequest` | 始终支持 | 可用 |
| Flexbox | Chrome 29 | 可用 |
| CSS Grid | Chrome 57 | 可用 |
| `@keyframes` | Chrome 43 | 可用 |
| `template literals` | Chrome 41 | 可用 (但代码中使用 `var` + 字符串拼接以保持最大兼容) |

**编码约定**：taskpane.html 中 JS 统一使用 `var` 声明、字符串拼接、`function` 关键字，不使用箭头函数、`let`/`const`、模板字符串，以确保兼容性。

## 6. 开发与部署

### 6.1 开发环境搭建

**前置条件：**
- Node.js（v20.15 或以上）
- WPS Office 客户端（个人版 12.1.0.16910+）
- opencode CLI 已安装（`opencode serve` 命令可用）

**步骤：**

1. 确认 publish.xml 存在：
   ```
   %APPDATA%\kingsoft\wps\jsaddons\publish.xml
   ```

2. 启动静态文件服务：
   ```bash
   cd test-wps-addon
   node serve.js
   # [Addon Server] Running at http://127.0.0.1:3444/
   ```

3. 启动 opencode 服务（从项目工作目录）：
   ```bash
   cd D:\code\office-test
   opencode serve --port 14096 --hostname 127.0.0.1 --cors "file:// http://127.0.0.1:3444"
   ```

4. 启动 WPS Office，点击工具栏 "OpenCode AI" > "打开面板"

### 6.2 关键配置项

| 配置 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| 静态服务端口 | `serve.js` `PORT` | 3444 | 加载项文件服务端口 |
| opencode 端口 | `main.js` `OPENCODE_PORT` | 14096 | opencode API 端口 |
| 工作目录 | `main.js` `OPENCODE_CWD` | `D:\code\office-test` | opencode 启动目录，影响文件操作范围 |
| CORS 来源 | `main.js` `OPENCODE_CORS_ORIGINS` | `file:// http://127.0.0.1:3444` | 允许跨域的来源 |
| API 地址 | `taskpane.html` `API_BASE` | `http://127.0.0.1:14096` | 初始值，运行时从 PluginStorage 读取覆盖 |

### 6.3 文件修改指引

| 需求 | 修改文件 | 说明 |
|------|----------|------|
| 修改聊天 UI 样式 | `taskpane.html` `<style>` 部分 | 注意 Chrome 104 兼容性 |
| 修改聊天逻辑 | `taskpane.html` `<script>` 部分 | 使用 `var` + ES5 语法 |
| 修改工具栏按钮 | `ribbon.xml` + `main.js` `OnAction()` | 需同时修改两处 |
| 修改 opencode 启动参数 | `main.js` 顶部配置区 | 修改后需重启 WPS |
| 添加新的 API 调用 | `taskpane.html` 使用 `fetchJSON()` | 通用 JSON 请求封装 |

## 7. 已知限制

1. **单向进程管理** — main.js 通过 `ShellExecute` 启动 opencode，但无法直接终止（需手动 kill 进程或关闭 WPS）
2. **PluginStorage 延迟** — 跨上下文通信依赖 500ms 轮询，存在最大 500ms 延迟
3. **无离线能力** — 需要 opencode 服务运行且网络可达（API 调用和 LLM 推理依赖网络）
4. **Markdown 渲染简化** — 使用正则实现的轻量 Markdown 渲染，不支持表格、脚注等高级语法
5. **单文档上下文** — 当前仅注入活动文档信息，不支持多文档关联分析
6. **文件上传限制** — WPS 内置浏览器无法访问用户文件系统（安全限制），只能通过 FileReader 读取文件内容并转为 Base64 发送到服务端，无法像官方 opencode 那样传文件路径让服务端读取。文件大小限制 100MB。

## 8. 目录结构速查

```
test-wps-addon/
  index.html          WPS 入口文件，加载 main.js
  main.js             主控制逻辑（Ribbon 回调 + 服务管理 + Session 创建）
  taskpane.html       侧边栏聊天 UI（CSS + HTML + JS 单文件，~650 行）
  ribbon.xml          WPS 工具栏按钮定义
  serve.js            Node.js 静态文件服务器（端口 3444）
  package.json        项目元信息
  wpsjs.config.js     端口等基础配置

%APPDATA%\kingsoft\wps\jsaddons\
  publish.xml         WPS 加载项注册文件
```
