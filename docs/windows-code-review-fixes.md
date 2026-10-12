# Windows 插件代码评审与修复记录（Issue #85）

> 背景：Linux 侧插件开发时评审发现大量问题，Windows 侧此前未做彻底评审。
> 本文件记录本轮对 Windows 侧全部代码的评审结论与修复项。
> 流水线：4/10 开发（M1-M7）→ 5/10 评审 → 6/10 测试。

## 评审范围

| 模块 | 文件 | 规模 |
|------|------|------|
| M1 | `opencode-wps/taskpane.html` | 1705 行 |
| M2 | `opencode-wps/main.js` | 561 行 |
| M3 | `opencode-wps/launcher.js` | 522 行 |
| M4 | `opencode-wps/config.js` / `opencode-proxy.js` / `serve.js` | 小 |
| M5 | `wps-office-mcp/src` | ~3.1 万行 TS |
| M6 | `install-addons.js` + `scripts/` | 中 |
| M7 | `skills/` / `agents/` / `.opencode/plugins/governance.js` | 中 |

## 修复清单（🔴 必修 / 🟡 建议）

### M1 taskpane.html

| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | `toggleProviderDropdown` 的 `p.id` 未转义直接拼进 onclick（供应商名来自服务端 `/config/providers`，可被污染 → DOM XSS） | `escapeAttr(p.id)` |
| 🔴 | `openSidebar` 的 `s.id` 未转义拼进 onclick（会话 id 来自服务端 `/session`） | `escapeAttr(s.id)` |
| 🔴 | `escapeAttr` 原实现不转义 `<>&`，且单引号用 `&#39;`——在 onclick 双层解析下 HTML 会先解码回 `'` 重新引入注入 | 重写：`&`→`&amp;`、`<`→`&lt;`、`>`→`&gt;`、`"`→`&quot;`、`'`→`\'`（JS 字符串转义） |
| 🟡 | `renderCwdHistory` 转义顺序 bug：`&` 最后替换会把前面生成的 `&quot;` 二次转义成 `&amp;quot;` | `&` 最先替换 |
| 🟡 | Markdown 链接 `target="_blank"` 缺 `rel="noopener noreferrer"`（tabnabbing） | 补充 |
| 🟡 | `stopOpenCode` 未清理 SSE 重连定时器，停止服务后仍会继续重连 | 清理 `sseReconnectTimer` 并重置退避 |
| 🟡 | `handleFileUpload` 文件名未清洗换行控制字符，可伪造 `</file-upload>` 注入额外消息块 | 清洗 `[\r\n\x00-\x1f]` |

### M3 launcher.js

| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | `validateCwd` 契约不一致：UNC 分支 `throw`、其它分支返回对象；`dockWindow` 无 try/catch → UNC 输入触发 `uncaughtException` 导致 launcher 崩溃 | 统一返回 `{ valid: false, error }` |
| 🔴 | `stopOpenCodeByPort(port)` 未校验端口，`/start` 的 `body.port` 可注入 shell 元字符（命令注入） | `parseInt` + 1-65535 范围校验 |
| 🟡 | wmic 查询失败时**继续 kill**：Windows 11 无 wmic → 误杀占用端口的非 OpenCode 进程 | 查询失败保守跳过 |
| 🟡 | `parseBody` 无 body 大小限制 → DoS | 1MB 上限 + 413 响应 |
| 🟡 | `dockWindow` 的 URL 拼进 PowerShell 双引号无包裹：cwd 含 `$` 触发变量插值、含 `'` 破坏字符串 | 单引号包裹 + 单引号翻倍转义 |
| 🟡 | `dock.ps1` 固定文件名 → 并发请求互相覆盖竞态 | 唯一临时文件名（时间戳+随机数） |

### M4 proxy/serve

| 级别 | 问题 | 修复 |
|------|------|------|
| 🟡 | `serve.js` 路径穿越用 `indexOf(ROOT)` 前缀匹配：`C:\root2\x` 可绕过 `C:\root` | `path.relative` 严格校验 |
| 🟡 | `opencode-proxy.js` 客户端断开时上游请求悬挂（句柄/内存泄漏） | `clientReq` error/close 时 `proxyReq.destroy()` |

### M5 wps-office-mcp

| 级别 | 问题 | 修复 |
|------|------|------|
| 🟡 | `wps-client.ts` 的 `Promise.race` 超时定时器永不清理：每次 COM 调用（即使成功）遗留最长 30s 挂起定时器 → Jest worker 无法退出 + 资源泄漏 | `result` 完成即 `clearTimeout` |
| 🟡 | Mac 分支 `execWpsAction` 被调用两次（timeoutPromise 内 + race 内） | 只调用一次存入变量 |

### M6 install-addons.js

| 级别 | 问题 | 修复 |
|------|------|------|
| 🟡 | VBS 启动器路径含引号会破坏 VBS 字符串 | 防御性 `"` → `""` 转义 |

## 评审通过项（无需修复）

- **M2 main.js**：try/catch 覆盖完善（此前 PR #83 已 10 轮加固），无新增必修项
- **M5 路径安全**：`validateFilePath`/`validateImagePath`/`isAllowedUrl` 已在全部写路径 handler 应用
- **M5 工具一致性**：240 注册工具 + 257 COM Actions 全部对齐，无死映射（脚本验证）
- **M7 governance**：G2-G7/P 系列/T1-T11 规则完整（**当时的快照为 P1-P16，编号仅作历史坐标**，不指向现行 `governance.js`），GATEWAY_ONLY 黑名单防直连
- **凭据/危险函数扫描**：无硬编码密钥、无 eval、无 new Function（browsertest 为能力探测）

## 测试验证

| 检查项 | 结果 |
|--------|------|
| `node --check` 全部 JS 文件（12 个） | ✅ |
| taskpane.html 内联 JS 语法 | ✅ |
| `wps-office-mcp` tsc build | ✅ |
| `wps-office-mcp` jest（302 用例） | ✅ 11 suites / 302 tests |
| `scripts/validate-tool-counts.js` | ✅ 509 工具一致 |
| `scripts/validate-versions.js` | ✅ 1.1.0 全一致 |
| `scripts/validate-settings.js` | ✅ |
| `scripts/validate-npc-team-prompt.js` | ✅ |

## 评审迭代记录（Issue #76 要求 10 轮彻底 review-修复循环）

> 自 PR #87 创建后，按 Issue #76 要求执行 10 轮 review-修复循环，每轮评审与修复均在 PR 行级评论/评论中留痕。以下为每轮新增修复项（超出原始 12 项清单的增量）。

### 第 1 轮（提交 `22da0dd`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | `serve.js` 路径穿越校验可被 URL 编码绕过（`%2e%2e`） | `decodeURIComponent` 后再 `path.relative` 校验 |
| 🟡 | `renderCwdHistory` 手写链式转义与 `escapeAttr` 不一致 | 统一改用 `escapeAttr`（先翻倍反斜杠再转义） |
| 🟡 | dockWindow 临时脚本唯一名并发竞态窗口 | 注释澄清 + 保留唯一名机制 |
| ℹ️ | dockWindow 超时仍回调 `success: true` 误报成功 | `err` 时回调 `{ success: false }` |
| ℹ️ | serve.js 注释与实现不符 | 注释澄清 + 实现补齐 decode |
| ℹ️ | `parseBody` 的 `_tooLarge` 可被外部 JSON 伪造 | 改用模块级 `Symbol` 标记 |

### 第 2 轮（提交 `4fe6487`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🟡 | proxy OPTIONS 预检在 `http.request` 之后，白白向上游发请求 | OPTIONS 判断移到 `http.request` 之前 |
| 🟡 | 响应头逐 key 复制转发 `connection`/`transfer-encoding` | 过滤 8 项 hop-by-hop 头 |
| ℹ️ | `/docinfo` POST 未校验 body 类型 | 校验普通对象，否则 400 |
| ℹ️ | `/stop`/`/dock`/`/docinfo` 无来源校验（CSRF） | 统一走 `getAllowedOrigin` 白名单 |
| ℹ️ | `validateCwd` 的 `includes('..')` 误拒 `my..folder` | 改为拒绝 `..` 完整路径段形态 |

### 第 3 轮（提交 `05089e8`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | `toggleProviderDropdown` 的 `p.name` 未转义（服务端配置可污染 → DOM XSS） | `escapeHtml(p.name)` |
| 🟡 | renameBox input value 用 `escapeHtml`，`&quot;` 二次解码闭合属性 | 改用 `escapeAttr` |
| ℹ️ | 补 reasoning/text XSS 单测防回归 | `tests/security.test.js` 新增 `escapeAttr` 同步副本 + 6 用例 |
| ℹ️ | VBS 的 `&` 转义疑虑 | 已核实字符串字面量内 `&` 为普通字符，注释澄清 |

### 第 4 轮（提交 `08520b4`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | CSRF `isLocal` 判断与既有 CORS 白名单冲突，`file://` 面板被误拦截 | 删除双逻辑，统一复用 `getAllowedOrigin` |
| 🟡 | `/start` 的 port 未校验，`String(port)` 原样拼 `--port` | `startOpenCode` 入口 parseInt + 1-65535 校验 |
| 🟡 | proxy 的 proxyRes/proxyReq error 未处理 | error 监听 + `headersSent` 分流防二次写头 |
| ℹ️ | dockWindow 校验后未用 resolved 路径 | 通过校验后用 `validation.resolved` 拼 `?cwd=` |

### 第 5 轮（提交 `57bac1f`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | `handleFileUpload` 只清洗 filename 未清洗 `file.type` | `file.type` 同控制字符清洗 |
| 🟡 | dockWindow exec 超时（Edge 冷启动>5s）误报失败 | 超时后探测 Edge 进程，出现则视为成功 |
| ℹ️ | serve.js 404 回显路径含非法字符 | 固定文案 `Not found` |

### 第 6 轮（提交 `754f7d7`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | `security.test.js`/`launcher.test.js` 未接入 CI | `.cnb.yml` Validate 阶段补两行 |
| 🟡 | 文档未同步第 1-5 轮新增修复 | 本文件追加「评审迭代记录」章节 |
| ℹ️ | Windows 侧 JS 无语法门禁 | `.cnb.yml` 补 `node --check` 4 个 Windows 文件 |

### 第 7 轮（提交 `7a4dced`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🔴 | wmic 在 Win11 移除 → `stopOpenCode` 完全失效（永远杀不掉进程） | 改用 `Get-CimInstance Win32_Process`（Win11 兼容），失败回退 wmic，再失败才保守跳过 |
| 🟡 | dockWindow 超时探测 `count>0` 误判用户已开的普通 Edge | 改为 `CommandLine -match 14096` 精确匹配 dock 专属进程 |
| ℹ️ | findstr `:14096` 子串误匹配 `:140960` 等；IPv6 地址解析错 | findstr 加尾空格；`lastIndexOf(':')` 取端口 |

### 第 8 轮（提交 `62e39e2`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🟡 | schtasks XML 中 `launcherVbsPath` 未转义，路径含 `&` 导致 XML 非法、开机自启静默失效 | 新增 `xmlEscape`（& < > " ' 全转义）后拼入 XML |
| ℹ️ | `opencode.pid` 写入/删除竞态 + 插件目录残留 | 幂等说明（双向 unlink 均 try/catch） |
| ℹ️ | `opencodePath` 未校验，config.json 被篡改可指向任意 exe | `findOpenCodeBin` 校验文件名含 opencode 或 .exe/.cmd/.ps1 |

### 第 9 轮（提交 `160434b`）
| 级别 | 问题 | 修复 |
|------|------|------|
| 🟡 | proxy 未监听 `clientRes` error（EPIPE/ECONNRESET → 未捕获异常） | 补 `clientRes.on('error')` → destroy 上游 |
| ℹ️ | `x-opencode-directory` 请求头原样转发上游，可伪造目录访问 | 转发前 delete（连同 x-forwarded-*） |
| ℹ️ | 上游 5xx 响应头含 `x-powered-by`/`server` 泄露 | 过滤 LEAK_HEADERS 4 项 |

### 第 10 轮（终审，提交 `647ca84`）
**结论：通过 ✅**（前 9 轮共 34 条问题全部整改，终审全量复查未发现新阻塞问题）

| 验证项 | 结果 |
|--------|------|
| 4 个修改文件 `node --check` | ✅ 全部通过 |
| `tests/security.test.js` | ✅ 31/31 |
| `tests/launcher.test.js` | ✅ 14/14 |
| `tests/taskpane-dock.test.js` | ✅ 31/31 |
| 校验脚本（versions/tool-counts/npc-team） | ✅ 全部通过 |
| `.cnb.yml` YAML | ✅ 合法 |

### 冲突解决（提交 `4111f60`）
| 级别 | 问题 | 修复 |
|------|------|------|
| ⚠️ | PR 与 main（Mac 评审 #86 合入）在 `.cnb.yml` 冲突 | 合并 main，Windows 与 Mac 回归测试共存；PR 恢复 mergeable |

## 10 轮累计修复 34 条问题
覆盖：XSS（4 处）、命令注入（2 处）、路径穿越（2 处）、CSRF/来源校验（2 处）、资源泄漏（3 处）、进程管理（3 处）、CI 覆盖（2 处）、文档同步（2 处）等。
