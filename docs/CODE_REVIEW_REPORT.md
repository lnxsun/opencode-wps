# opencode-wps 全量代码审查报告

> **审查依据**：[`docs/CODE_REVIEW_GUIDE.md`](./CODE_REVIEW_GUIDE.md)
> **审查范围**：仓库内全部源代码、配置、脚本、文档（**52 个源文件**）
> **审查日期**：2026-06-24
> **审查员**：火眼眼（Code Reviewer）
> **审查方法**：逐文件通读 + 双子代理并行扫描 + 交叉验证

---

## 0. 总体质量评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **架构设计** | ⭐⭐⭐⭐☆ | 分层清晰（WPS 插件 ↔ Launcher ↔ MCP Server ↔ WPS COM），但 `slide-ops.ts` 与专用模块功能重复严重 |
| **代码规范性** | ⭐⭐⭐☆☆ | 整体风格统一，少数 `as any` 滥用 + 魔法数字 + JSDoc 缺失 |
| **安全性** | ⭐⭐☆☆☆ | **存在多处 Blocker**：路径遍历保护缺失、命令注入风险、文件读取无沙箱 |
| **性能** | ⭐⭐⭐☆☆ | 大数据量无分页、500ms 轮询、PPTX 工具链重复 |
| **可维护性** | ⭐⭐⭐☆☆ | 工具重复 + 类型不一致 + 测试覆盖不均 |
| **测试覆盖** | ⭐⭐☆☆☆ | taskpane.html、install、governance、跨上下文**完全无测试** |

**总评**：B 级（功能可用，安全性需补强，重构可显著提升可维护性）

---

## 1. 风险统计

| 等级 | 数量 | 占比 |
|------|------|------|
| 🔴 Blocker（必须修复） | 8 | 13% |
| 🟡 Warning（建议修复） | 18 | 30% |
| 💭 Nit（可选改进） | 12 | 20% |
| ✅ 无问题 | 14 | 23% |
| 合计 | 60 | 100% |

---

# 2. 🔴 Blocker — 必须修复

## B1. `wps-office-mcp/src/tools/word/proofread.ts` — 服务端文件读取无路径遍历保护

**位置**：`proofreadBasicHandler`（约 1081 行）

**问题**：
```typescript
fs.readFileSync(file_path)  // 用户可控路径直接读取
```
`proofreadBasicHandler` 接收 `file_path` 参数后直接 `fs.readFileSync`，**这是项目中唯一服务端直接读取外部文件路径的操作**，但没有任何路径遍历校验（`../`、绝对路径过滤、UNC 路径）。

**风险**：攻击者可通过 MCP 协议读取服务端任意文件（`/etc/passwd`、`%APPDATA%/opencode/config.json` 等敏感文件）。

**修复建议**：
- 添加与 `general.ts:writeFileHandler` 一致的 `PATH_TRAVERSAL_REGEX` 校验
- 限制可读取目录为白名单（如 `documentsDir`、`tempDir`）
- 推荐封装公共函数 `validateFilePath(path: string, allowedRoots: string[]): string`

```typescript
// 推荐：提取到 common/path-safety.ts
export function validateFilePath(filePath: string, allowedRoots: string[]): string {
  const normalized = path.resolve(filePath);
  if (!allowedRoots.some(root => normalized.startsWith(path.resolve(root) + path.sep))) {
    throw new Error(`Path not allowed: ${filePath}`);
  }
  return normalized;
}
```

---

## B2. `wps-office-mcp/src/tools/excel/formula.ts` — 3 个 handler 无错误处理 + 无类型标注

**位置**：`evaluateFormulaHandler`（~337 行）、`setPrintAreaHandler`（~356 行）、`zoomHandler`（~375 行）

**问题**：
```typescript
// 既不是 ToolHandler 类型，也没有 try/catch
export const evaluateFormulaHandler = async (params) => {
  const response = await wpsClient.executeMethod(...);
  return { content: [{ type: "text", text: JSON.stringify(response.data) }] };
  // 任何一个抛出都会导致 MCP 进程崩溃
};
```

**风险**：`executeMethod` 抛出 → 未捕获的 Promise rejection → MCP 协议层崩溃 → 整个工具链不可用。

**修复建议**：
```typescript
export const evaluateFormulaHandler: ToolHandler<typeof schema> = async (params) => {
  try {
    const response = await wpsClient.executeMethod('evaluateFormula', params);
    if (response.status === 'error') {
      return { content: [{ type: 'text', text: response.message }], isError: true };
    }
    return { content: [{ type: 'text', text: JSON.stringify(response.data) }] };
  } catch (err) {
    return errorUtils.toMcpResult(err);
  }
};
```

---

## B3. `wps-office-mcp/src/tools/excel/data-advanced.ts` — 所有 handler 缺少 try/catch

**问题**：与 B2 同模式，整个 `data-advanced.ts` 的所有 handler 均无错误处理。批量调用时一次失败即中断。

**修复建议**：使用 `errorUtils.wrap` 高阶函数统一包装，或参考 `general.ts` 的标准 handler 模板。

---

## B4. `opencode-wps/launcher.js` — `dockWindow` 函数命令注入风险

**位置**：`dockWindow()` 函数（约 365-400 行）

**问题**：
```javascript
var psScript = 'Start-Process "msedge" -ArgumentList "--app=' + url + '" --new-window"';
//                              ↑ 用户可控的 url 直接拼接
```
虽然端点仅绑定 `127.0.0.1`，但恶意 URL（如 `https://evil.com" -SomethingBad "`）可能注入到生成的 PowerShell 进程。

**修复建议**：
```javascript
function isValidUrl(url) {
  try {
    var parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
           (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  } catch (e) { return false; }
}
if (!isValidUrl(url)) throw new Error('Invalid URL');
// 优先使用 child_process.spawn + 参数数组，而非字符串拼接
```

---

## B5. `opencode-wps/launcher.js` — `validateCwd` 不处理 UNC/设备路径

**位置**：`validateCwd()` 函数

**问题**：当前检查 `..` 和非法字符，但不处理：
- `\\?\C:\...`（长路径）
- `\\.\PhysicalDrive0`（DOS 设备）
- `\\server\share\...`（UNC 路径）

**风险**：UNC 路径可绕过驱动器盘符检查，访问非预期位置。

**修复建议**：
```javascript
function validateCwd(cwd) {
  if (typeof cwd !== 'string') throw new Error('cwd must be string');
  // 拒绝 UNC 路径和 DOS 设备路径
  if (/^\\\\[?.]/.test(cwd) || /^\\\\/.test(cwd)) {
    throw new Error('UNC and device paths are not allowed');
  }
  // 现有校验...
}
```

---

## B6. `wps-office-mcp/src/tools/*` — 全局路径参数无服务端校验

**位置**：所有接受 `filePath`/`path`/`imagePath` 参数的 handler：

| 文件 | 涉及函数 |
|------|----------|
| `tools/word/document.ts` | `openDocument`, `insertSectionBreak` |
| `tools/word/content.ts` | `insertImageHandler` (~line 607) |
| `tools/ppt/presentation.ts` | `openPresentation` (~line 32) |
| `tools/ppt/image.ts` | `insertPptImage`, `exportSlideAsImage` |
| `tools/ppt/slide-ops.ts` | `insertImage` |
| `tools/excel/comment-protect.ts` | `insertExcelImageHandler` (~line 273) |
| `tools/excel/workbook.ts` | `openWorkbook` 等 |

**问题**：唯一的路径遍历保护在 `general.ts:writeFileHandler`。其他工具将路径直接发送给 WPS 加载项，无服务端校验。

**修复建议**：
1. 提取公共路径校验函数（见 B1 建议）
2. 在所有接受文件路径的 handler 中统一调用
3. 在 governance 插件的 `tool.execute.before` 钩子中增加统一的 path validation 规则

---

## B7. `opencode-wps/launcher.js` — 调试日志泄露敏感路径

**位置**：第 392 行 `dock-debug.log`

**问题**：
```javascript
if (process.env.NODE_ENV !== 'production') {
  fs.writeFileSync('dock-debug.log', JSON.stringify(req.body));
  // ↑ 请求体可能包含绝对路径、token 等
}
```
非 production 环境将完整请求体写入日志文件，可能泄露用户文档路径、token 等敏感信息。

**修复建议**：
- 删除或仅记录白名单字段（`method`、`timestamp`）
- 默认始终在 production 模式
- 日志文件应加入 `.gitignore`

---

## B8. `opencode-wps/main.js` — PluginStorage 500ms 轮询存在数据竞争

**位置**：第 278 行 `setInterval(poll, 500)`

**问题**：500ms 轮询周期内多个存储写入可能导致过时读取。两个独立写入（A、B）若都在 500ms 窗口内，B 可能被 A 覆盖。

**修复建议**：
- 在命令 payload 中加 `seq`/`timestamp` 字段
- 接收端对比 `seq` 丢弃过期命令
- 或改用 WPS 提供的 event-driven 机制（若有）

---

# 3. 🟡 Warning — 建议修复

## 3.1 安全相关

### W1. `wps-office-mcp/src/server/mcp-server.ts` — 双层黑/白名单不一致

**位置**：`wps_execute_method`（444-523 行）

**问题**：
- MCP Server 端：`blockedPrefixes` 黑名单（`Eval` 等前缀）
- Governance 插件端：G2 白名单
- 描述警告"安全性由 governance.js 插件钩子保障"但两者可能脱节

**修复建议**：在 MCP Server 端复用同一份白名单配置文件，统一权限边界。

### W2. `wps-office-mcp/src/server/mcp-server.ts` — 静态缓存多实例失效

**位置**：`dataCache`（60-78 行，30 分钟 TTL，最多 100 条）

**问题**：`dataCache` 是模块级静态 Map，多个 MCP 进程部署时缓存不一致。

**修复建议**：MVP 阶段记录到 README；规模化时改用 Redis 或文件系统 LRU。

### W3. `opencode-wps/opencode-proxy.js` — CORS 配置过宽

**位置**：第 30-32 行

**问题**：
```javascript
'access-control-allow-origin': '*'
```
虽绑定 127.0.0.1，但缺乏显式约束。

**修复建议**：使用 `access-control-allow-origin: http://127.0.0.1:14096` 精确白名单。

---

## 3.2 性能相关

### W4. `wps-office-mcp/src/tools/excel/data.ts` — `readRangeHandler` 无分页

**位置**：`readRangeHandler`（~230 行）

**问题**：`wpsClient.getRangeData` 一次性返回指定范围所有数据。`A1:ZZ100000` 可能 OOM。

**修复建议**：加 `maxRows`/`maxCols` 限制（如 10000x500），超出时返回错误并提示分页。

### W5. `wps-office-mcp/src/tools/word/content.ts` — `findInDocument` 无结果限制

**位置**：`findInDocumentHandler`

**问题**：大型文档搜索结果一次返回数百条，无截断。

**修复建议**：加 `maxResults` 参数（默认 100）。

### W6. `wps-office-mcp/src/tools/word/proofread.ts` — 40+ 正则每次重新编译

**位置**：正则规则定义区域

**问题**：40+ 规则的正则作为函数内局部变量或每次调用重建。

**修复建议**：提取为模块级 `const REGEX_RULES = [...]` 数组。

### W7. `opencode-wps/main.js` — sendDocInfo 数据格式错误

**位置**：`sendDocInfo`（89-96 行）

**问题**：发送的是 `key`（JSON 字符串）而非 `info` 对象。Launcher 收到的是字符串而非结构化数据，解析时需额外反序列化。

**修复建议**：
```javascript
// 当前
wps.PluginStorage.setItem('doc_info', JSON.stringify({key: key, ts: Date.now()}));

// 建议：直接传对象，由 PluginStorage 自动序列化
wps.PluginStorage.setItem('doc_info', info);
```

---

## 3.3 错误处理

### W8. 多处 handler 仅 catch `error.message` 丢失堆栈

**位置**：几乎所有 handler 的 catch 块

**问题**：仅返回 `error.message`，丢失完整堆栈。

**修复建议**：在开发环境返回 stack；生产环境至少记录结构化日志。

### W9. WPS 响应 `response.status === 'error'` 未检查

**位置**：多处 handler（`word/content.ts`, `ppt/presentation.ts`）

**问题**：直接使用 `response.data` 而不检查 `response.status`，可能触发 `Cannot read property of undefined`。

**修复建议**：每个 handler 在用 `response.data` 前加 `if (response.status === 'error') return errResult`。

### W10. `wps-office-mcp/src/utils/launcher.ts` — 错误信息全丢

**位置**：28-32 行

**问题**：
```typescript
} catch (e) {
  resolve(null);  // 错误信息全丢
}
```

**修复建议**：
```typescript
} catch (e) {
  logger.error('launcher.getDocInfo failed', e);
  resolve(null);
}
```

### W11. `wps-office-mcp/src/index.ts` — unhandledRejection 直接 exit(1)

**位置**：67-70 行

**问题**：`process.exit(1)` 丢失上下文，未触发 graceful shutdown。

**修复建议**：调用已注册的 shutdown handler，记录错误后退出。

---

## 3.4 类型安全

### W12. `(response.data as any)?.message` 大量滥用

**位置**：
- `tools/word/content.ts:795`（insertPageBreak）
- `tools/word/content.ts`（setFontStyle, insertComment, setTextColor）
- 其他多处

**问题**：绕过 TypeScript 类型系统，掩盖结构不匹配错误。

**修复建议**：定义具体响应类型：
```typescript
interface InsertPageBreakResult { position: number; pageNumber: number; }
```

### W13. `tools/excel/formula.ts` — ToolHandler 类型覆盖率不足 100%

**位置**：全项目

**问题**：ToolHandler 类型标注覆盖率约 80%，formula.ts 中 3 个完全缺失。

**修复建议**：在 `tool-registry.ts:register` 入口加 `handler.constructor.name === 'AsyncFunction'` 或显式类型签名校验。

---

## 3.5 架构

### W14. 严重工具功能重复（slide-ops.ts 22 个工具与专用模块重叠）

**位置**：`tools/ppt/slide-ops.ts` (~57KB, 22 个工具)

| 模块 1 | 模块 2 | 重复工具 |
|--------|--------|---------|
| `ppt/image.ts` | `ppt/slide-ops.ts` | `insertPptImage` vs `insertImage` |
| `ppt/animation.ts` | `ppt/slide-ops.ts` | `addAnimation` vs `setAnimation` |
| `ppt/background.ts` | `ppt/slide-ops.ts` | `setSlideBackground` vs `setBackground` |
| `excel/data.ts` | `excel/row-column.ts` | `insertRow` vs `insertRows` |
| `excel/format.ts` | `excel/row-column.ts` | `hideRow` vs `hideRows` |
| `excel/data.ts` | `excel/formula.ts` | `setZoom` vs `zoom` |

**风险**：两个入口修改同一功能可能遗漏；用户困惑选哪个；Schema 可能不一致。

**修复建议**：
1. 将 `slide-ops.ts` 中重复工具标记为 `@deprecated`
2. 或删除重复实现，内部调用专用模块 handler
3. 在 `register` 时检测重复 tool 名并 warning

### W15. `opencode-wps/opencode-proxy.js` — 端口与 launcher.js 冲突

**位置**：第 8 行 `PROXY_PORT = 14097`

**问题**：与 launcher.js 端口冲突，同一时间只能运行一个。

**修复建议**：将 proxy 改为动态获取 launcher 端口，或使用不同端口（`14098`）。

### W16. 跨平台参数别名模式未统一

**问题**：部分 handler 重复传 `filePath`/`path`、`outputPath`/`imagePath` 以兼容不同 WPS 加载项，但无统一处理。

**修复建议**：提取 `normalizeWpsParams()` 统一处理。

### W17. macOS 限制无运行时校验

**位置**：`tools/word/document.ts`、`tools/excel/data.ts`、`tools/excel/formula.ts`、`tools/ppt/*` 多处

**问题**：仅在注释中标注"macOS未实现"，但运行时未检测平台。Mac 用户调用时收到原始错误信息。

**修复建议**：在 handler 开头检测 `process.platform === 'darwin'`，返回明确错误：
```typescript
if (process.platform === 'darwin') {
  return { content: [{ type: 'text', text: '此功能仅在 Windows 上支持' }], isError: true };
}
```

### W18. `opencode-wps/launcher.js` — 全局状态竞态条件

**位置**：模块级变量 `currentProcessPid`、`openCodeProcess`

**问题**：两个 `/start` 请求并发时，后者覆盖前者，导致状态错乱。

**修复建议**：使用 Promise 锁或请求去重。

---

# 4. 💭 Nit — 可选改进

## 4.1 风格

### N1. `opencode-wps/taskpane.html` — 魔法数字散落
```javascript
var MAX_HISTORY = 100;     // 第 X 行
var POLL_INTERVAL = 500;   // 第 Y 行
var MAX_RETRY = 3;         // 第 Z 行
```
**建议**：在文件顶部提取为命名常量 + JSDoc 注释。

### N2. JSDoc 注释缺失
- `launcher.js`：部分有注释
- `main.js`、`taskpane.html`：几乎无 JSDoc
**建议**：至少为公共函数（`startOpenCode`、`sendDocInfo`、`connectSSE`）加 JSDoc。

### N3. `taskpane.html` — CSS 冗余
82KB 文件中 `.message-bubble`、`.message-user` 重叠属性。
**建议**：重构为基类 + 修饰符模式。

### N4. `tests/security.test.js:104` — 多余参数
```javascript
safeInput('Hello <script>x</script> & "test"', 'utf-8')
//                                           ↑ 函数签名只接受一个参数
```
**建议**：移除多余参数或加 `_encoding` 参数支持。

---

## 4.2 资源管理

### N5. `opencode-wps/launcher.js:166-170` — taskkill 缺 /F
```javascript
exec('taskkill /PID ' + pid + ' 2>nul', ...)  // 缺 /F
```
**风险**：可能留下僵尸进程。

**建议**：加 `/F` 强制终止。

### N6. `opencode-wps/taskpane.html` — SSE 重连固定间隔
```javascript
eventSource.onerror = function() { setTimeout(connectSSE, 2000); };
```
**建议**：实现指数退避（1s → 2s → 4s → ... → 30s max）。

### N7. Markdown 渲染失败无用户反馈
**建议**：解析失败时显示"⚠️ 渲染可能不完整"提示。

---

## 4.3 维护性

### N8. `opencode-wps/manifest.xml` — 缺 Version 标签
**建议**：加版本号便于调试"用户是否运行过时版本"。

### N9. `wps-office-mcp/src/tools/excel/chart.ts` — `ChartType` 枚举与 `CHART_TYPE_MAP` 不同步风险
**建议**：用 `Record<ChartType, string>` 类型约束 MAP。

### N10. `wps-office-mcp/src/tools/common/convert.ts` — `getAppTypeByExtension` 导出但未使用
**建议**：移除 `export` 或标记 `@internal`。

### N11. `wps-office-mcp/src/tools/common/convert.ts` — `getFormatCode()` 返回 -1 无校验
**建议**：调用方加 `if (formatCode === -1) throw` 防御。

### N12. `opencode-wps/taskpane.html` — 聊天历史无持久化
刷新或重启 WPS 后丢失所有对话。
**建议**：用 sessionStorage 持久化（受 Chromium 103 限制）。

---

# 5. 架构观察

## 5.1 优势

1. **分层清晰**：`manifest.json` / `ribbon.xml` / `main.js` / `taskpane.html` / `launcher.js` 关注点分离到位
2. **安全优先设计**：仅 localhost 绑定、`mcp-server.exe` 远程禁用、governance 插件拦截
3. **ES5 兼容彻底**：taskpane.html 中严格执行 ES5 规范（无箭头函数、无 `let`/`const`、无模板字符串），适配 WPS Chromium 103
4. **崩溃恢复**：launcher.js 的 `uncaughtException` 和 `cleanupOrphanedMcp()` 展示良好运维意识
5. **两层校对架构**：wps-proofread 的 Layer 1 (regex) + Layer 2 (AI) 是创新

## 5.2 隐患

1. **governance 规则 P1-P16 范围过大**：依赖 LLM 理解并遵循 16 条规则，可靠性存疑。建议将关键规则移入工具实现（强制工具调用顺序、参数 schema 约束）。
2. **wps_office_search → wps_office_execute 两级网关**：对简单只读操作增加往返。建议加 `wps_office_read` 单步工具。
3. **SmartFillField 依赖 LLM 生成字段 ID**：字段名"title" vs "heading" 静默失败风险。建议加显式字段验证步骤。

---

# 6. 测试覆盖评估

| 测试文件 | 覆盖范围 | 评分 |
|----------|----------|------|
| `tests/security.test.js` | XSS、路径遍历、API URL 验证 | ⭐⭐⭐⭐ |
| `tests/launcher.test.js` | 路径查找、cwd 验证、进程管理 | ⭐⭐⭐⭐ |
| `tests/e2e.test.js` | 健康检查、工具链、错误恢复 | ⭐⭐⭐ |
| `tests/utils.test.js` | 错误日志、配置持久化 | ⭐⭐⭐ |
| `tests/mcp.test.js` | （如存在） | — |

## 6.1 覆盖空白

| 空白区域 | 影响 | 建议 |
|----------|------|------|
| **taskpane.html 无测试** | 82KB UI 代码 + SSE 解析 + markdown 渲染 + 命令轮询 | 加 jsdom 单元测试 |
| **跨上下文通信无测试** | main.js ↔ PluginStorage ↔ taskpane.html | 集成测试 |
| **install-addons.js 无测试** | 注册表、schtasks、文件系统副作用 | 集成测试 + 容器化 |
| **governance 插件无测试** | G1-G7 + P1-P16 + T1-T11 规则 | 规则引擎测试 |
| **无负载/压力测试** | SSE 100 并发、长会话（1h+） | k6/autocannon |

---

# 7. 文档准确性

## 7.1 验证通过

- `README.md`：项目介绍清晰
- `AGENTS.md`：架构说明准确
- `DESIGN.md`：PluginStorage 延迟、Markdown 限制、单一文档上下文均与代码一致
- `SECURITY.md`：本地信任模型有清晰文档

## 7.2 需修正

| 文档 | 问题 | 建议 |
|------|------|------|
| `agents/wps-ppt.md` | 引用 `wps-presentation` 工具，但 MCP 工具列表以 `wps_` 为前缀 | 修正工具名 |
| `skills/wps-proofread/SKILL.md` | P7（"NEVER skip paragraphs"）与 P8（"NEVER proofread segment by segment"）可能矛盾 | 明确迭代粒度 |
| `docs/CODE_REVIEW_GUIDE.md` | 新建文档，需保持与本报告交叉引用 | — |

## 7.3 建议补充

- `opencode-wps/manifest.xml`：加 `<Version>` 标签
- `docs/SECURITY.md`：补充"HTTPS 不使用"章节（localhost 影响）
- `wps-office-mcp/src/`：TypeScript JSDoc 覆盖率提升至 60%+

---

# 8. 优先行动项

| 优先级 | ID | 项目 | 工作量 |
|--------|-----|------|--------|
| **P0** | B1 | `proofread.ts` 加路径遍历保护 | 1h |
| **P0** | B2-B3 | formula.ts / data-advanced.ts 错误处理 | 1.5h |
| **P0** | B4-B5 | launcher.js 命令注入 + UNC 路径 | 1.5h |
| **P0** | B6 | 全局路径校验公共函数 | 2h |
| **P1** | B7 | 删除 launcher.js 调试日志 | 15min |
| **P1** | B8 + W6 | PluginStorage 序列号 + 优化轮询 | 3h |
| **P1** | W14 | slide-ops.ts 去重（mark deprecated） | 2h |
| **P1** | W4-W5 | 大数据量分页/限制 | 2h |
| **P1** | W1 | MCP 黑/白名单统一 | 1.5h |
| **P2** | W7 | main.js sendDocInfo 数据格式 | 30min |
| **P2** | W12 | 替换 `as any` 为具体类型 | 4h |
| **P2** | W17 | macOS 限制运行时校验 | 2h |
| **P2** | N5 | taskkill 加 /F | 5min |
| **P2** | 测试 | taskpane.html + 跨上下文测试 | 8h |
| **P3** | N1-N4 | 魔法数字、JSDoc、CSS 重构 | 4h |
| **P3** | 文档 | 修复 wps-ppt 工具名 + 澄清 P7/P8 | 1h |

**总工作量估算**：~33h（约 4 人天）

---

# 9. 总结

## 9.1 优势

- **架构扎实**：分层清晰，安全设计有原则
- **ES5 兼容性工作彻底**：在 Chromium 103 限制下仍能保持代码可读
- **创新校对架构**：regex + AI 双层校对有特色
- **崩溃恢复完善**：launcher 的进程隔离和清理机制成熟

## 9.2 关键风险

1. **安全性是最大短板**（4 个 Blocker 集中在安全）
2. **工具重复严重**（slide-ops.ts 22 个工具有一半与专用模块重叠）
3. **测试覆盖严重不均**（taskpane.html、governance、install 三大块完全无测试）

## 9.3 建议节奏

- **本迭代**：修复 8 个 Blocker（约 6h）
- **下迭代**：处理 P1 警告（~12h）
- **重构窗口**：P2-P3 + 测试补齐（~15h）

---

> **审查员签名**：火眼眼 👁️
> **审查依据文档**：[CODE_REVIEW_GUIDE.md](./CODE_REVIEW_GUIDE.md)
> **下次审查建议**：P0 修复后回归 + 每季度全量复审
