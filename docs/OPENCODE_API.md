# OpenCode Server API

通过 HTTP 与 OpenCode 服务器交互。

`opencode serve` 命令运行一个无头 HTTP 服务器，暴露 OpenAPI 端点供 OpenCode 客户端使用。

---

## 使用方法

```bash
opencode serve [--port <端口号>] [--hostname <主机名>] [--cors <来源>]
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port` | 监听的端口 | `4096` |
| `--hostname` | 监听的主机名 | `127.0.0.1` |
| `--mdns` | 启用 mDNS 发现 | `false` |
| `--mdns-domain` | mDNS 服务自定义域名 | `opencode.local` |
| `--cors` | 允许的浏览器来源 | `[]` |

`--cors` 可以多次传递：

```bash
opencode serve --cors http://localhost:5173 --cors https://app.example.com
```

---

## 认证

设置 `OPENCODE_SERVER_PASSWORD` 使用 HTTP 基本认证保护服务器。用户名默认为 `opencode`，或通过 `OPENCODE_SERVER_USERNAME` 覆盖。

```bash
OPENCODE_SERVER_PASSWORD=your-password opencode serve
```

---

## 工作原理

当你运行 `opencode` 时，它会启动一个 TUI 和一个服务器。TUI 是与服务器通信的客户端。服务器暴露一个 OpenAPI 3.1 规范端点，也可用于生成 SDK。

你可以运行 `opencode serve` 启动独立服务器。如果你已经在运行 opencode TUI，`opencode serve` 会启动一个新的服务器。

### 连接到现有服务器

当你启动 TUI 时，它会随机分配端口和主机名。你可以传递 `--hostname` 和 `--port` 参数连接到现有服务器。

`/tui` 端点可用于通过服务器驱动 TUI。例如，你可以预填或运行提示词。

---

## 规范

服务器发布一个 OpenAPI 3.1 规范，可在以下地址查看：

```
http://<主机名>:<端口>/doc
```

例如，`http://localhost:14096/doc`（本项目使用的端口）。

---

## API 参考

### Global（全局）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/global/health` | 获取服务器健康状态和版本 | `{ healthy: true, version: string }` |
| `GET` | `/global/event` | 获取全局事件（SSE 流） | 事件流 |

### Project（项目）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/project` | 列出所有项目 | `Project[]` |
| `GET` | `/project/current` | 获取当前项目 | `Project` |

### Path & VCS（路径和版本控制）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/path` | 获取当前路径 | `Path` |
| `GET` | `/vcs` | 获取当前项目的 VCS 信息 | `VcsInfo` |

### Instance（实例）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `POST` | `/instance/dispose` | 释放当前实例 | `boolean` |

### Config（配置）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/config` | 获取配置信息 | `Config` |
| `PATCH` | `/config` | 更新配置 | `Config` |
| `GET` | `/config/providers` | 列出提供者 和默认模型 | `{ providers, default }` |

### Provider（提供者）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/provider` | 列出所有提供者 | `{ all, default, connected }` |
| `GET` | `/provider/auth` | 获取提供者认证方法 | `{ [providerID]: ProviderAuthMethod[] }` |
| `POST` | `/provider/{id}/oauth/authorize` | 使用 OAuth 授权提供者 | `ProviderAuthAuthorization` |
| `POST` | `/provider/{id}/oauth/callback` | 处理提供者的 OAuth 回调 | `boolean` |

### Sessions（会话）

| 方法 | 路径 | 说明 | 备注 |
|------|------|------|------|
| `GET` | `/session` | 列出所有会话 | 返回 `Session[]` |
| `POST` | `/session` | 创建新会话 | body: `{ parentID?, title? }`，返回 `Session` |
| `GET` | `/session/status` | 获取所有会话的状态 | 返回 `{ [sessionID]: SessionStatus }` |
| `GET` | `/session/:id` | 获取会话详情 | 返回 `Session` |
| `DELETE` | `/session/:id` | 删除会话及其所有数据 | 返回 `boolean` |
| `PATCH` | `/session/:id` | 更新会话属性 | body: `{ title? }`，返回 `Session` |
| `GET` | `/session/:id/children` | 获取会话的子会话 | 返回 `Session[]` |
| `GET` | `/session/:id/todo` | 获取会话的待办事项 | 返回 `Todo[]` |
| `POST` | `/session/:id/init` | 分析应用并创建 `AGENTS.md` | body: `{ messageID, providerID, modelID }`，返回 `boolean` |
| `POST` | `/session/:id/fork` | 在消息处 fork 会话 | body: `{ messageID? }`，返回 `Session` |
| `POST` | `/session/:id/abort` | 中止运行中的会话 | 返回 `boolean` |
| `POST` | `/session/:id/share` | 分享会话 | 返回 `Session` |
| `DELETE` | `/session/:id/share` | 取消分享会话 | 返回 `Session` |
| `GET` | `/session/:id/diff` | 获取会话的 diff | query: `messageID?`，返回 `FileDiff[]` |
| `POST` | `/session/:id/summarize` | 总结会话 | body: `{ providerID, modelID }`，返回 `boolean` |
| `POST` | `/session/:id/revert` | 还原消息 | body: `{ messageID, partID? }`，返回 `boolean` |
| `POST` | `/session/:id/unrevert` | 恢复所有还原的消息 | 返回 `boolean` |
| `POST` | `/session/:id/permissions/:permissionID` | 响应权限请求 | body: `{ response, remember? }`，返回 `boolean` |

### Messages（消息）

| 方法 | 路径 | 说明 | 备注 |
|------|------|------|------|
| `GET` | `/session/:id/message` | 列出会话中的消息 | query: `limit?`，返回 `{ info, parts }[]` |
| `POST` | `/session/:id/message` | 发送消息并等待响应 | body: `{ messageID?, model?, agent?, noReply?, system?, tools?, parts }`，返回 `{ info, parts }` |
| `GET` | `/session/:id/message/:messageID` | 获取消息详情 | 返回 `{ info, parts }` |
| `POST` | `/session/:id/prompt_async` | 异步发送消息（不等待） | body: 同 `/session/:id/message`，返回 `204 No Content` |
| `POST` | `/session/:id/command` | 执行斜杠命令 | body: `{ messageID?, agent?, model?, command, arguments }`，返回 `{ info, parts }` |
| `POST` | `/session/:id/shell` | 运行 shell 命令 | body: `{ agent, model?, command }`，返回 `{ info, parts }` |

### Commands（命令）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/command` | 列出所有命令 | `Command[]` |

### Files（文件）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/find?pattern=<pat>` | 在文件中搜索文本 | 匹配对象数组 |
| `GET` | `/find/file?query=<q>` | 按名称查找文件和目录 | `string[]`（路径） |
| `GET` | `/find/symbol?query=<q>` | 查找工作区符号 | `Symbol[]` |
| `GET` | `/file?path=<path>` | 列出文件和目录 | `FileNode[]` |
| `GET` | `/file/content?path=<p>` | 读取文件 | `FileContent` |
| `GET` | `/file/status` | 获取跟踪文件的状态 | `File[]` |

### Tools（实验性）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/experimental/tool/ids` | 列出所有工具 ID | `ToolIDs` |
| `GET` | `/experimental/tool?provider=<p>&model=<m>` | 列出模型的工具及其 JSON Schema | `ToolList` |

### LSP、Formatters 和 MCP

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/lsp` | 获取 LSP 服务器状态 | `LSPStatus[]` |
| `GET` | `/formatter` | 获取格式化器状态 | `FormatterStatus[]` |
| `GET` | `/mcp` | 获取 MCP 服务器状态 | `{ [name]: MCPStatus }` |
| `POST` | `/mcp` | 动态添加 MCP 服务器 | body: `{ name, config }`，返回 MCP 状态对象 |

### Agents（智能体）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/agent` | 列出所有可用的智能体 | `Agent[]` |

### Logging（日志）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `POST` | `/log` | 写入日志条目 | body: `{ service, level, message, extra? }`，返回 `boolean` |

### TUI

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `POST` | `/tui/append-prompt` | 追加文本到提示词 | `boolean` |
| `POST` | `/tui/open-help` | 打开帮助对话框 | `boolean` |
| `POST` | `/tui/open-sessions` | 打开会话选择器 | `boolean` |
| `POST` | `/tui/open-themes` | 打开主题选择器 | `boolean` |
| `POST` | `/tui/open-models` | 打开模型选择器 | `boolean` |
| `POST` | `/tui/submit-prompt` | 提交当前提示词 | `boolean` |
| `POST` | `/tui/clear-prompt` | 清除提示词 | `boolean` |
| `POST` | `/tui/execute-command` | 执行命令 | body: `{ command }`，返回 `boolean` |
| `POST` | `/tui/show-toast` | 显示通知 | body: `{ title?, message, variant }`，返回 `boolean` |
| `GET` | `/tui/control/next` | 等待下一个控制请求 | 控制请求对象 |
| `POST` | `/tui/control/response` | 响应控制请求 | body: `{ body }`，返回 `boolean` |

### Auth（认证）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `PUT` | `/auth/:id` | 设置认证凭据 | body 必须匹配提供者 schema，返回 `boolean` |

### Events（事件）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/event` | 服务器发送事件流 | 首个事件是 `server.connected`，然后是总线事件 |

### Docs（文档）

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| `GET` | `/doc` | OpenAPI 3.1 规范 | 带 OpenAPI 规范的 HTML 页面 |

---

## 本项目使用的配置

本项目使用以下配置启动 OpenCode 服务：

```bash
opencode serve --port 14096 --hostname 127.0.0.1 --cors file://
```

API 端点：
- 健康检查：`http://127.0.0.1:14096/global/health`
- SSE 流：`http://127.0.0.1:14096/event`
- 发送消息：`POST http://127.0.0.1:14096/session/{id}/message`
- OpenAPI 文档：`http://127.0.0.1:14096/doc`