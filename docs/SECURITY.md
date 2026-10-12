# 安全模型

本文档说明 OpenCode WPS 的安全设计和使用注意事项。

## Launcher API 安全模型

### 本地回环设计

Launcher 服务监听 `127.0.0.1:14097`，采用**本地回环（localhost-only）**设计：

| 特性         | 说明                           |
| ------------ | ------------------------------ |
| **绑定地址** | 仅 `127.0.0.1`，不监听外部网卡 |
| **网络暴露** | 不对局域网或互联网暴露         |
| **鉴权机制** | **无鉴权** - 基于本地信任模型  |
| **使用场景** | 仅限本机 WPS 插件调用          |

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

| 函数                                   | 校验内容                                                                                                                        | 适用场景                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `validateFilePath(path, allowedRoots)` | 空路径拒绝、`../` 路径遍历拒绝、Windows 反斜杠遍历拒绝、可选根目录白名单                                                        | 所有接受文件路径的 MCP handler（18 个 handler） |
| `validateImagePath(path)`              | 继承 validateFilePath + 扩展名白名单（png/jpg/jpeg/gif/bmp/svg/webp）                                                           | 图片导出/插入 handler                           |
| `isAllowedUrl(url)`                    | 仅允许 `http:` / `https:` / `ftp:` / `file:` 协议，拒绝 `javascript:` / `data:` / `vbscript:` 等危险协议（**不限制 hostname**） | MCP 工具 URL 参数校验（非 launcher）            |

**强制要求**：所有接受文件路径的 handler 必须将 `validateFilePath` 放在 `try` 块内部调用，确保异常被 catch 捕获为结构化错误响应而非未捕获异常。

#### 2. CORS 强化

| 组件              | 改前                             | 改后                                                  |
| ----------------- | -------------------------------- | ----------------------------------------------------- |
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

### 服务端权限放行（Issue #179 方案A）

为根治长任务（如 F 盘文档校对）因外部目录授权卡住的问题，默认开启**服务端权限自动放行**：

- **机制**：`install-addons.js` 在生成 `opencode.json` 时读取 `opencode-wps/config.js` 的 `permission.mode`，为 `'auto'` 时写入服务端 `permission`：`{ "*": "allow", "external_directory": { "**": "allow" } }`。服务端直接放行所有工具及工作目录外的文件读写，权限请求不再下发。
- **关闭**：将 `config.js` 的 `permission.mode` 改为 `'manual'` 并重跑 `node install-addons.js`，服务端 `permission` 会被移除，回到前端弹窗人工确认。
- **保留自定义权限**：若用户在 `opencode.json` 中手动配置了精细 `permission`（与默认全放行不同），切到 `manual` 时该自定义配置会被**保留**，仅移除由模板注入的默认全放行配置。
- **收紧范围**：修改 `.opencode/opencode.jsonc` 的 `permission.external_directory`，如 `{ "F:\\**": "allow" }` 仅放开 F 盘，`install-addons.js` 原样透传。
  > ⚠️ **收紧注意**：若此前已安装过（已有 `opencode.json` 含旧的 `**` 全放行），修改模板收紧时需**同时清理已有 `opencode.json` 中的旧 `external_directory` 规则**（或删除 `~/.config/opencode/opencode.json` 后重跑 `node install-addons.js` 让模板全量生效）。否则 `install-addons.js` 第 2 步的深层合并会让旧的 `**` 与新的 `F:\**` **共存**，`**` 全放行仍生效，收紧无效。

**安全权衡**：`"*": "allow"` 表示对所有工具放行，`external_directory: { "**": "allow" }` 表示对工作目录外的任意路径读写放行。仅建议在**本地可信环境**使用。若文档分布在固定盘符/目录，强烈建议将 `external_directory` 收紧到具体盘符（如 `F:\**`），而不是用 `**` 全放。

> ⚠️ 该服务端放行只作用于 OpenCode 工具调用权限，**governance.js 的 G2-G7 安全规则（路径安全/破坏性确认/密码保护等）对 MCP 工具调用仍生效**。但需注意：`"*": "allow"` 放行的 **opencode 原生内置工具（如 `bash`/`edit`/`write` 等）不受 governance.js 拦截**——governance 仅拦截 MCP 工具调用。因此若环境不可信或文档含敏感内容，请务必收紧 `external_directory` 或改用 `manual` 模式人工确认，避免原生工具越权读写。

> 🔴 **报告写盘拦截的边界（R3-3/R4-3）**：governance 的 P2 只拦截原生 `write`/`writeFile`/`writeText`/`edit` 写含「校对报告」路径，以及网关内 `writeFile` 写报告路径。**`bash`/`powershell` 等 shell 工具的重定向写盘（如 `echo '伪造报告' > 校对报告.md`）不在 P2 拦截范围**——若 agent 持有 shell 工具权限，理论上仍可绕过防幻觉写盘拦截。建议：a) 校对会话中不给 agent 授予 bash 写盘权限（或收紧）；b) 定期审计会话日志确认报告均由 `generateProofreadReport` 生成。

### 文件路径写盘白名单（Issue #179 路径白名单暴露）

MCP 服务端 write 类操作（含校对报告落盘）默认只允许写入**用户主目录 + 系统临时目录 + 当前活动文档所在目录**（Issue #179 方案 B；单源 `path-safety.buildWriteRootsWithDocDir`，`write_file` 与报告落盘同口径）。通过 `opencode-wps/config.js` 的 `allowedWriteRoots` 配置可放开更多写盘根目录（`install-addons.js` 写入 `opencode.json` 中 MCP server 的 `env.OPCODE_ALLOWED_ROOTS`）：

- **仅放开必要的根目录**：建议把 `allowedWriteRoots` 精确到你的文档根目录（如 `F:\2025年度`），不要用空串或不加节制的宽路径，避免扩大可写范围。
- **路径穿越仍被拦截**：即使白名单放开，`validateFilePath` 仍会拒绝路径穿越（`..`）、DOS 设备路径、NTFS 备用数据流等，不会因白名单放宽而失效。
- **留空 `''`**：不注入白名单，沿用 MCP 默认（仅限用户主目录 + 系统临时目录），是最保守的选项。

### 报告安全漏洞

如发现安全漏洞，请通过 GitHub Issue 报告。
