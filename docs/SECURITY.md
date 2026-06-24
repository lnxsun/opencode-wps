# 安全模型

本文档说明 OpenCode WPS 的安全设计和使用注意事项。

## Launcher API 安全模型

### 本地回环设计

Launcher 服务监听 `127.0.0.1:14097`，采用**本地回环（localhost-only）**设计：

| 特性 | 说明 |
|------|------|
| **绑定地址** | 仅 `127.0.0.1`，不监听外部网卡 |
| **网络暴露** | 不对局域网或互联网暴露 |
| **鉴权机制** | **无鉴权** - 基于本地信任模型 |
| **使用场景** | 仅限本机 WPS 插件调用 |

### 安全考量

#### 信任边界
- Launcher API 设计基于**本地信任假设**：只有本机用户才能访问 localhost
- 任何本地进程都可以调用 Launcher API（启动/停止服务）
- 这是典型的 **本地服务** 安全模型，类似于 Windows 防火墙对 127.0.0.1 的默认放行

#### 风险说明
1. **本地无鉴权** - 如果攻击者获得本机代码执行权限，可控制 OpenCode 服务
2. **无网络隔离** - 同一台机器上的任何用户都可以操作 Launcher
3. **不适用于共享环境** - 在多人共用的机器上，其他用户可能干扰服务

#### 不支持外网暴露
- **不提供**、**不支持**、**不建议** 将 Launcher 暴露到 `0.0.0.0` 或公网
- 外网暴露将导致任意用户都能控制你的 OpenCode 服务

### 开发者注意事项

如果需要修改 Launcher 端口或绑定地址：
- 默认 Launcher 端口 `14097` 和 Proxy 端口 `14098` 已在代码中硬编码
- 修改后需同步更新 `taskpane.html` 中的连接配置
- 切勿将 Launcher 绑定到 `0.0.0.0`

### 防御深度（2026-06 全量审查加固）

#### 1. 路径安全层（path-safety.ts）

新增 `wps-office-mcp/src/utils/path-safety.ts` 提供三层路径校验：

| 函数 | 校验内容 | 适用场景 |
|------|---------|---------|
| `validateFilePath(path, allowedRoots)` | 空路径拒绝、`../` 路径遍历拒绝、Windows 反斜杠遍历拒绝、可选根目录白名单 | 所有接受文件路径的 MCP handler（18 个 handler） |
| `validateImagePath(path)` | 继承 validateFilePath + 扩展名白名单（png/jpg/jpeg/gif/bmp/svg/webp） | 图片导出/插入 handler |
| `isAllowedUrl(url)` | 仅允许 `http://127.0.0.1` 和 `https://` URL，拒绝 `javascript:` / `file:` / `data:` 等危险协议 | launcher.js dockWindow 等 URL 参数场景 |

**强制要求**：所有接受文件路径的 handler 必须将 `validateFilePath` 放在 `try` 块内部调用，确保异常被 catch 捕获为结构化错误响应而非未捕获异常。

#### 2. CORS 强化

| 组件 | 改前 | 改后 |
|------|------|------|
| opencode-proxy.js | `access-control-allow-origin: *` | `access-control-allow-origin: http://127.0.0.1:14096` |

代理服务器在端口 `14098` 运行，同时剥离 WPS 内置浏览器的 CSP 头。

#### 3. URL 注入防护（launcher.js）

新增 `isValidUrl()` 函数：
- 仅允许 `http:` 和 `https:` 协议
- 仅允许 `127.0.0.1` 和 `localhost` 主机名
- 拒绝 `javascript:`、`file:`、`data:`、`vbscript:` 等危险协议
- URL 必须包含有效的点分隔主机名

#### 4. 命令重放防护（main.js）

PluginStorage 500ms 轮询采用 `{ cmd, ts }` JSON 格式：
- 每条命令携带时间戳 `ts`
- `lastCmdTime` 记录最后处理的命令时间戳
- 旧时间戳或重复时间戳的命令被跳过
- 缺少 `cmd` 字段的 JSON 被忽略（防止 `{ ts: 1 }` 错误消费）

#### 5. 并发保护（launcher.js）

`stateLock` 标志位防止 `/start` 接口并发调用：
- 已有一个启动请求在处理时，新请求返回 409
- `try/catch/finally` 确保 `stateLock` 在异常时仍被释放

#### 6. 进程验证（launcher.js）

`stopOpenCodeByPort` 在调用 `taskkill` 前通过 `wmic` 确认目标进程名：
- 获取 PID 后先查进程名称
- 仅当进程名为 `node.exe` 或 `opencode.exe` 时才执行 kill
- 防止误杀其他进程

### 报告安全漏洞

如发现安全漏洞，请通过 GitHub Issue 报告。
