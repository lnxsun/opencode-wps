# OpenCode Server API

Interact with opencode server over HTTP.

The `opencode serve` command runs a headless HTTP server that exposes an OpenAPI endpoint that an opencode client can use.

---

## Usage

```bash
opencode serve [--port <number>] [--hostname <string>] [--cors <origin>]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port` | Port to listen on | `4096` |
| `--hostname` | Hostname to listen on | `127.0.0.1` |
| `--mdns` | Enable mDNS discovery | `false` |
| `--mdns-domain` | Custom domain name for mDNS service | `opencode.local` |
| `--cors` | Additional browser origins to allow | `[]` |

`--cors` can be passed multiple times:

```bash
opencode serve --cors http://localhost:5173 --cors https://app.example.com
```

---

## Authentication

Set `OPENCODE_SERVER_PASSWORD` to protect the server with HTTP basic auth. The username defaults to `opencode`, or set `OPENCODE_SERVER_USERNAME` to override it.

```bash
OPENCODE_SERVER_PASSWORD=your-password opencode serve
```

---

## How it works

When you run `opencode` it starts a TUI and a server. The TUI is the client that talks to the server. The server exposes an OpenAPI 3.1 spec endpoint that can also be used to generate an SDK.

You can run `opencode serve` to start a standalone server. If you have the opencode TUI running, `opencode serve` will start a new server.

### Connect to an existing server

When you start the TUI it randomly assigns a port and hostname. You can pass `--hostname` and `--port` flags to connect to an existing server.

The `/tui` endpoint can be used to drive the TUI through the server. For example, you can prefill or run a prompt.

---

## Spec

The server publishes an OpenAPI 3.1 spec that can be viewed at:

```
http://<hostname>:<port>/doc
```

For example, `http://localhost:14096/doc` (本项目使用的端口).

---

## APIs

### Global

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/global/health` | Get server health and version | `{ healthy: true, version: string }` |
| `GET` | `/global/event` | Get global events (SSE stream) | Event stream |

### Project

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/project` | List all projects | `Project[]` |
| `GET` | `/project/current` | Get the current project | `Project` |

### Path & VCS

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/path` | Get the current path | `Path` |
| `GET` | `/vcs` | Get VCS info for the current project | `VcsInfo` |

### Instance

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/instance/dispose` | Dispose the current instance | `boolean` |

### Config

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/config` | Get config info | `Config` |
| `PATCH` | `/config` | Update config | `Config` |
| `GET` | `/config/providers` | List providers and default models | `{ providers, default }` |

### Provider

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/provider` | List all providers | `{ all, default, connected }` |
| `GET` | `/provider/auth` | Get provider authentication methods | `{ [providerID]: ProviderAuthMethod[] }` |
| `POST` | `/provider/{id}/oauth/authorize` | Authorize a provider using OAuth | `ProviderAuthAuthorization` |
| `POST` | `/provider/{id}/oauth/callback` | Handle OAuth callback for a provider | `boolean` |

### Sessions

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/session` | List all sessions | Returns `Session[]` |
| `POST` | `/session` | Create a new session | body: `{ parentID?, title? }`, returns `Session` |
| `GET` | `/session/status` | Get session status for all sessions | Returns `{ [sessionID]: SessionStatus }` |
| `GET` | `/session/:id` | Get session details | Returns `Session` |
| `DELETE` | `/session/:id` | Delete a session and all its data | Returns `boolean` |
| `PATCH` | `/session/:id` | Update session properties | body: `{ title? }`, returns `Session` |
| `GET` | `/session/:id/children` | Get a session's child sessions | Returns `Session[]` |
| `GET` | `/session/:id/todo` | Get the todo list for a session | Returns `Todo[]` |
| `POST` | `/session/:id/init` | Analyze app and create `AGENTS.md` | body: `{ messageID, providerID, modelID }`, returns `boolean` |
| `POST` | `/session/:id/fork` | Fork an existing session at a message | body: `{ messageID? }`, returns `Session` |
| `POST` | `/session/:id/abort` | Abort a running session | Returns `boolean` |
| `POST` | `/session/:id/share` | Share a session | Returns `Session` |
| `DELETE` | `/session/:id/share` | Unshare a session | Returns `Session` |
| `GET` | `/session/:id/diff` | Get the diff for this session | query: `messageID?`, returns `FileDiff[]` |
| `POST` | `/session/:id/summarize` | Summarize the session | body: `{ providerID, modelID }`, returns `boolean` |
| `POST` | `/session/:id/revert` | Revert a message | body: `{ messageID, partID? }`, returns `boolean` |
| `POST` | `/session/:id/unrevert` | Restore all reverted messages | Returns `boolean` |
| `POST` | `/session/:id/permissions/:permissionID` | Respond to a permission request | body: `{ response, remember? }`, returns `boolean` |

### Messages

| Method | Path | Description | Notes |
|--------|------|-------------|-------|
| `GET` | `/session/:id/message` | List messages in a session | query: `limit?`, returns `{ info, parts }[]` |
| `POST` | `/session/:id/message` | Send a message and wait for response | body: `{ messageID?, model?, agent?, noReply?, system?, tools?, parts }`, returns `{ info, parts }` |
| `GET` | `/session/:id/message/:messageID` | Get message details | Returns `{ info, parts }` |
| `POST` | `/session/:id/prompt_async` | Send a message asynchronously (no wait) | body: same as `/session/:id/message`, returns `204 No Content` |
| `POST` | `/session/:id/command` | Execute a slash command | body: `{ messageID?, agent?, model?, command, arguments }`, returns `{ info, parts }` |
| `POST` | `/session/:id/shell` | Run a shell command | body: `{ agent, model?, command }`, returns `{ info, parts }` |

### Commands

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/command` | List all commands | `Command[]` |

### Files

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/find?pattern=<pat>` | Search for text in files | Array of match objects |
| `GET` | `/find/file?query=<q>` | Find files and directories by name | `string[]` (paths) |
| `GET` | `/find/symbol?query=<q>` | Find workspace symbols | `Symbol[]` |
| `GET` | `/file?path=<path>` | List files and directories | `FileNode[]` |
| `GET` | `/file/content?path=<p>` | Read a file | `FileContent` |
| `GET` | `/file/status` | Get status for tracked files | `File[]` |

### Tools (Experimental)

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/experimental/tool/ids` | List all tool IDs | `ToolIDs` |
| `GET` | `/experimental/tool?provider=<p>&model=<m>` | List tools with JSON schemas for a model | `ToolList` |

### LSP, Formatters & MCP

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/lsp` | Get LSP server status | `LSPStatus[]` |
| `GET` | `/formatter` | Get formatter status | `FormatterStatus[]` |
| `GET` | `/mcp` | Get MCP server status | `{ [name]: MCPStatus }` |
| `POST` | `/mcp` | Add MCP server dynamically | body: `{ name, config }`, returns MCP status object |

### Agents

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/agent` | List all available agents | `Agent[]` |

### Logging

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/log` | Write log entry | body: `{ service, level, message, extra? }`, returns `boolean` |

### TUI

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/tui/append-prompt` | Append text to the prompt | `boolean` |
| `POST` | `/tui/open-help` | Open the help dialog | `boolean` |
| `POST` | `/tui/open-sessions` | Open the session selector | `boolean` |
| `POST` | `/tui/open-themes` | Open the theme selector | `boolean` |
| `POST` | `/tui/open-models` | Open the model selector | `boolean` |
| `POST` | `/tui/submit-prompt` | Submit the current prompt | `boolean` |
| `POST` | `/tui/clear-prompt` | Clear the prompt | `boolean` |
| `POST` | `/tui/execute-command` | Execute a command | body: `{ command }`, returns `boolean` |
| `POST` | `/tui/show-toast` | Show toast | body: `{ title?, message, variant }`, returns `boolean` |
| `GET` | `/tui/control/next` | Wait for the next control request | Control request object |
| `POST` | `/tui/control/response` | Respond to a control request | body: `{ body }`, returns `boolean` |

### Auth

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `PUT` | `/auth/:id` | Set authentication credentials | body must match provider schema, returns `boolean` |

### Events

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/event` | Server-sent events stream | First event is `server.connected`, then bus events |

### Docs

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/doc` | OpenAPI 3.1 specification | HTML page with OpenAPI spec |

---

## 本项目使用的配置

本项目使用以下配置启动 OpenCode 服务：

```bash
opencode serve --port 14096 --hostname 127.0.0.1 --cors file://
```

API 端点：
- 健康检查: `http://127.0.0.1:14096/global/health`
- SSE 流: `http://127.0.0.1:14096/event`
- 发送消息: `POST http://127.0.0.1:14096/session/{id}/message`
- OpenAPI 文档: `http://127.0.0.1:14096/doc`