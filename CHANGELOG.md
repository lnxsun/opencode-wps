# 更新日志

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Agent 选择功能（wps-expert/wps-word/wps-excel/wps-ppt）
- 4 层架构文档（JS插件 → Agents → Skills → MCP）
- 测试套件（security.test.js, utils.test.js, launcher.test.js）
- CONTRIBUTING.md 贡献指南
- Agent Skill 调用优先级指引
- **Word 文档校对功能**（混合 MCP 基础校对 + AI 智能校对）
  - 4 个校对专用 MCP 工具：`wps_word_enable_track_changes`、`wps_word_get_track_changes_status`、`wps_word_replace_range`、`wps_word_proofread_basic`
  - 基础校对规则引擎（零 token 正则检测错别字/重复字符/常见语病）
  - 修订模式（Track Changes）支持，所有修改可追溯
  - Markdown 校对报告自动生成（文档同目录）
  - 从真实校对报告提炼的 30+ 条正则规则
- **path-safety.ts** 路径安全工具（validateFilePath / validateImagePath / isAllowedUrl）
- 18 个文件路径处理 handler 接入 path-safety 校验
- path-safety.test.ts 单元测试（13 个测试用例）
- launcher.js `isValidUrl()` URL 白名单校验
- launcher.js `stateLock` 并发请求保护（同时仅允许一个 `/start`）
- main.js PluginStorage JSON 命令 `{ cmd, ts }` 时间戳去重
- CORS 代理 `opencode-proxy.js`（端口 14098，剥离 CSP 头）

### Changed
- 安装脚本输出更详细的状态信息
- `getActiveDocument` 输出格式：`页数` → `总段数`，对齐 COM 实际返回字段（`paragraphCount`）
- `proofreadBasic` 增加异常空格检测（连续空格 / 全角空格）
- manifest.xml Version → 1.1.0
- SSE 指数退避：初始 1s，最大 30s
- `taskkill` 参数：`/PID xxx /F` → `/F /PID xxx 2>nul`
- `convert.ts` 恢复 `getAppTypeByExtension` / `getFormatCode` 为 export
- 5 个 PPT 工具标记为 `[DEPRECATED]`（提示使用现代替代工具）
- `add_speaker_notes` handler 转发至 `set_slide_notes`
- 7 对重复工具逐一比对：#1-#5 修复 deprecated 消息提示额外功能，#3/#6 移除 deprecated（功能不同）

### Security
- XSS 防护：safeInput 函数
- 配置持久化：CONFIG 对象
- Launcher 路径安全：配置文件读取、cwd 验证
- 进程管理优化：PID 文件精确终止
- 配置防御性检查：loadOpenCodeConfig 函数
- spawn 参数数组化（安全改进）
- **path-safety.ts** 路径遍历保护（所有接受文件路径的 handler 强制校验）
- **CORS 白名单**：`access-control-allow-origin: *` → `http://127.0.0.1:14096`
- **URL 注入防护**：launcher.js dockWindow 仅允许 http/https 协议 + 127.0.0.1/localhost
- **validateCwd 增强**：拒绝 UNC 路径和 DOS 设备路径
- **launcher.js stateLock**：防止 `/start` 并发请求
- **JSON 命令重放防护**：PluginStorage 轮询 + 时间戳去重
- **wmic 进程验证**：stopOpenCodeByPort 在 kill 前确认进程名

### Fixed
- GetUrlPath 简化为 URL API
- 网络请求重试：fetchWithRetry
- SSE 自动重连：connectSSE 增强
- WPS 就绪检查：checkWpsReady, checkDocument
- MCP COM 重试+超时：execWpsActionWithRetry
- 全局变量封装：AppState 单例
- proofread.ts 路径遍历漏洞（B1）
- formula.ts 3 个 handler 缺少 try/catch（B2）
- launcher.js dockWindow 命令注入（B4）
- launcher.js validateCwd UNC/DOS 设备路径泄露（B5）
- 删除 dock-debug.log 泄露（B7）
- proxy 端口冲突 14097 → 14098
- macOS 运行时校验：10 个 handler 添加 `process.platform === 'win32'` 守卫
- unhandledRejection 触发 process.exit 保留
- gateway.test.ts uuid v14 ESM mock 修复
- chart.ts/image.ts validateFilePath 移入 try 块内部（3 处）
- launcher.js stateLock 死锁 → try/catch/finally 保护
- main.js JSON 命令缺少 cmd 字段时跳过处理
- JSDoc 注释补充 25 处（main.js×10 + launcher.js×6 + taskpane.html×9）

---

## [1.0.0] - 2026-04-21

### Added
- WPS JS 加载项（opencode-wps）
- MCP 服务器（wps-office-mcp）
- 4 个 Skills（wps-word, wps-excel, wps-ppt, wps-office）
- Launcher 进程管理
- 一键安装脚本（install-addons.js）
- Markdown 渲染
- 多会话管理
- SSE 流式对话

### Features
- 任务窗格 Chat UI
- Ribbon 按钮
- WPS COM 桥接（PowerShell）
- 约 200 个 MCP 工具

---

## 历史版本

请查看 [Releases](https://github.com/lnxsun/opencode-wps/releases) 查看所有版本。
