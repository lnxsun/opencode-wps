# WPS 插件问题排查与避坑指南

> 🏠 返回 [README](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/README.md)；安装与环境问题见 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)。

## 零、`config.js` 用户目录自引用哨兵被 install-addons.js 误替换（反复踩坑 4 次）

### 问题现象
- 重新安装插件后，默认工作目录变成了 `C:\Users\Default` 而不是 `~`（真实的用户主目录）
- 每次修复后隔一段时间又复现

### 根因
`config.js` 中 `userHome` 使用自引用哨兵判断是否已被替换：

```javascript
// 错误写法 — 两处都会被 regex 匹配
var v = '__OPCODE_WPS_USER_HOME__';
if (v !== '__OPCODE_WPS_USER_HOME__') return v;  // ← install-addons.js 的 regex 也会替换这一行！
```

`install-addons.js` 的替换逻辑：`replace(/__OPCODE_WPS_USER_HOME__/g, userHome)` — 这是一个 **全局 regex**，会匹配文件中的所有出现。BOTH 行都被替换后：

```javascript
var v = 'C:\\Users\\Administrator';
if (v !== 'C:\\Users\\Administrator') return v;  // ← 恒为 false！
```

哨兵永远返回 false，代码 fallthrough 到 `process.env.USERPROFILE`。而在 **WPS 浏览器上下文（taskpane.html/main.js）中 `process` 对象不存在**，最终返回硬编码 `'C:\\Users\\Default'`。

### 如何避坑

**1. 自引用哨兵必须使用 regex 无法匹配的字符串**

`install-addons.js` 的 regex 是 `/__OPCODE_WPS_USER_HOME__/g`（带双下划线前缀后缀）。比较字符串时必须**去掉双下划线**：

```javascript
// 正确写法 — indexOf 字符串不含双下划线，不会被 regex 匹配
var v = '__OPCODE_WPS_USER_HOME__';
if (v.indexOf('OPCODE_WPS_USER_HOME') < 0) return v;
```

**2. 验证方法**

安装后检查 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_\config.js`：

```powershell
Select-String "userHome:" "$env:APPDATA\kingsoft\wps\jsaddons\opencode-wps_\config.js" -Context 0,7
```

确认输出中：
- `var v = 'C:\\Users\\XXX'` — 替换了真实用户目录 ✓
- `if (v.indexOf('OPCODE_WPS_USER_HOME') < 0) return v;` — 哨兵行**未被替换** ✓

**3. 如果再次复现**

检查 `config.js` 中 `userHome` IIFE 的逻辑：
- 确认 `install-addons.js` 的 regex 没有误替换哨兵行的字符串
- 确认 WPS 浏览器上下文中 `process` 的 fallback 是 `''`（空字符串），不是 `'C:\\Users\\Default'`
- 运行 `node install-addons.js` 后再检查

---

## 一、插件不显示的坑

### 问题现象
- WPS 加载项中看不到 opencode-wps 插件
- 或者看到是禁用状态，手动启用后重启又变回禁用

### 根因
WPS 插件配置分散在 **3 个文件** 中：

| 文件 | 作用 | 说明 |
|-----|------|-----|
| `authaddin.json` | **真正的开关** | WPS 启动时读取，enable=false 则禁用 |
| `publish.xml` | 插件发布配置 | enable_dev = 开发模式 |
| `jsplugins.xml` | 插件加载配置 | enable=true 仅供参考 |

**关键坑**：之前只修改 `publish.xml` 和 `jsplugins.xml`，完全没发现 `authaddin.json` 是真正的控制文件！

### 如何避坑

**自动方案：**
运行 `node install-addons.js` 会自动更新 `authaddin.json` 中的 `enable` 为 `true`。

**手动检查：**
```powershell
# 查看当前状态
Get-Content "$env:APPDATA\kingsoft\wps\jsaddons\authaddin.json"
```

---

## 二、侧边栏打开空白的坑

### 问题现象
- 插件显示，点击"打开面板"，侧边栏是空白页面

### 根因
`main.js` 中的 `GetUrlPath()` 函数使用了浏览器的 `document.location`：
```javascript
// 错误代码 - 在 WPS taskpane 环境中不工作
function GetUrlPath() {
    var pathname = new URL(document.location.href).pathname;
    return pathname.replace(/\/[^\/]*$/, '') || '/';
}
```

WPS 的 taskpane 是特殊的运行环境，document 对象和浏览器不一致。

### 如何避坑

1. **taskpane 中使用绝对路径**
   ```javascript
   // 正确代码 - 安装时动态注入路径
   function GetUrlPath() {
       var pluginPath = '___WPS_ADDON_PATH___'; // install-addons.js 替换为实际路径
       return pluginPath.replace(/\\/g, '/');
   }
   ```

2. **验证方法**
   - 检查插件目录下 `taskpane.html` 是否已正确复制：`%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_\taskpane.html`
   - 确认 `GetUrlPath()` 返回的路径与插件实际安装路径一致（本地安装模式不开放 F12 开发者工具，仅 `wpsjs debug` 开发模式可用 F12）

---

## 三、Start Server 启动失败的坑

### 问题现象
- 点击 Start Server，转一会儿报错 "Failed to start. Check if opencode is installed."
- 但实际上 opencode 已经安装了（`opencode --version` 能输出版本号）

### 根因
`launcher.js` 使用 Node.js 的 `spawn()` 启动 opencode serve。出现“已安装但启动失败”时，**最常见根因是 launcher 进程的运行期环境找不到 opencode 二进制**，而非 opencode 没装。具体有两种：

1. **运行期 PATH 与交互终端不一致**（Issue #134 实测根因）：launcher 由计划任务 → VBS → `node launcher.js` 拉起，其 PATH **不继承**你登录 PowerShell 时由 shell 配置（如 npm / bun 全局 bin 目录）注入的目录。结果 `spawn('opencode', ...)` 走 `cmd /c opencode serve` 时 `cmd` 找不到 opencode → `ENOENT` → 启动失败。

2. **opencode 是 `.ps1` PowerShell 脚本**：npm 全局安装会在 bin 目录同时生成 `opencode`、`opencode.cmd`、`opencode.ps1`。PowerShell 的 `Get-Command` 优先解析 `.ps1`，而 `cmd.exe` 只解析 `.exe/.cmd/.bat`。若 launcher 拿到裸的 `'opencode'` 且运行环境只有 `.ps1`，`spawn` 无法直接执行。

### 关键诊断：`opencode-serve.log` 为空

`opencode-wps/launcher.js` 已把 opencode serve 的 stdout/stderr 落盘到 `<用户目录>\.opencode\logs\opencode-serve.log`。

- **日志有内容** → opencode 已启动并输出，问题在服务端（端口占用、配置错误、模型报错等）。
- **日志为空 + 14096 拒连** → 子进程压根没被拉起来（`ENOENT` 找不到二进制），是 PATH/二进制定位问题。此时日志会追加一行 `[launcher] spawn error: ...` 说明具体原因。

### 如何避坑（已修复，含增强）

1. **launcher 探测真实二进制绝对路径**（`findOpenCodeBin`，已实现）：不再依赖运行期 PATH，按优先级 `显式配置 > 常见 bin 目录探测（.exe/.cmd/.ps1）> where 解析 > 裸 'opencode'` 查找。覆盖：bun 全局 bin（`~/.bun/bin` / `BUN_INSTALL`）、`%APPDATA%\npm`、`%LOCALAPPDATA%\npm`、`Program Files` 等。**不再探测 `.trae-cn`**（用户已删除该目录，且 `.trae-cn` 属历史遗留问题根源；如需兼容旧环境，可在 `getOpenCodeBinDirs()` 末尾自行追加对应目录）。命中 `.ps1` 时用 `resolvePowerShellExe()` 解析出的 **powershell 绝对路径**（`SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`，极端 32 位进程回退 `SysWOW64`，精简系统回退裸 `powershell.exe` 走 PATH）以 `-ExecutionPolicy Bypass -File` 启动——用绝对路径可保证 launcher 由计划任务 / VBS / 服务在**无人值守场景**拉起时，其 PATH 不含 PowerShell 目录也能解析到 powershell.exe，避免再次 ENOENT。
   - **探测结果缓存稳定化（Issue #243）**：同一会话内首次探测成功后缓存二进制路径，后续调用直接返回缓存，避免 launcher 反复探测出不同二进制（如 npm shim / `.bun`）导致 serve 进程被反复杀/重启（churn）。config 显式指定 `opencodePath` 变更或缓存路径文件失效时自动失效重探。探测全部失败时带 30s TTL 节流，避免高频阻塞探测（含 `where opencode` 5s 超时）。

2. **spawn 失败原因落盘**（已实现）：`error` 事件把 `[launcher] spawn error: <原因> (opencodeBin=<路径>, command=<实际启动命令>)` 写进 `opencode-serve.log`，不再出现“空日志”。其中 `command` 反映**真正 spawn 的可执行文件**（`.ps1` 场景为 powershell 绝对路径，`.exe` 为二进制路径），避免定位误导。

3. **手动验证服务**
   ```powershell
   # 检查 launcher 是否运行
   Invoke-RestMethod "http://127.0.0.1:14097/status"

   # 手动启动服务测试
   Invoke-RestMethod "http://127.0.0.1:14097/start" -Method Post -Body '{"cwd":"D:\code\opencode-wps"}' -ContentType "application/json"

   # 检查健康状态
   Invoke-RestMethod "http://127.0.0.1:14096/global/health"
   ```

4. **自检 opencode 真实形态（拉不起时用）**
   ```powershell
   Get-Command opencode | Format-List Name, Source, CommandType  # 看是 .exe/.cmd/.ps1
   # 若来自 bun 全局安装 → 应位于 ~/.bun/bin（或 BUN_INSTALL 指定位置）下的 opencode.exe shim
   # 检查是否也生成了 .cmd/.exe（cmd 能直接执行的形态）
   dir "$env:USERPROFILE\.bun\bin\opencode.*"
   ```

5. **一键诊断 `/diag`（推荐）**
   launcher 提供 `GET /diag` 诊断接口，把二进制探测、配置文件、日志落盘与最终 spawn 命令一次性暴露出来，无需去计划任务/VBS 控制台翻日志：
   ```powershell
   Invoke-RestMethod "http://127.0.0.1:14097/diag" | Format-List opencodeBin, config, logFile, logExists, logSize, homedir, userprofile, spawnCommand
   ```
   - `opencodeBin`：launcher 解析出的 opencode 可执行绝对路径（`.exe/.cmd/.ps1`），裸 `opencode` 表示未探测到真实路径、仍依赖运行期 PATH（此时多半会启动失败）。
   - `config.path`：命中的配置文件路径（`null` = 未找到，会走 PATH 探测）。
   - `logFile` / `logExists` / `logSize`：`opencode-serve.log` 路径与存在性/大小（`logSize=0` 说明尚未落盘日志）。
   - `spawnCommand`：最终启动命令预览（`.ps1` 会显示为 `powershell.exe -ExecutionPolicy Bypass -File ...`）。
   - `homedir` / `userprofile`：帮助确认环境变量解析是否符合预期。

---

## 四、修改后必须验证的清单

每次修改 `install-addons.js`、`main.js`、`launcher.js` 后，必须执行：

### 安装后验证
```powershell
node install-addons.js
# 应该无报错完成

# 检查 authaddin.json
Get-Content "$env:APPDATA\kingsoft\wps\jsaddons\authaddin.json"
# 确认 opencode-wps 的 enable 是 true
```

### WPS 加载验证
1. 重启 WPS
2. 文件 → 选项 → 加载项
3. 管理 → WPS 加载项 → 转到
4. 确认 opencode-wps 存在且已勾选启用

### 服务验证
1. 点击插件的"打开面板"
2. 侧边栏应该正常显示（不是空白）
3. 输入目录，点击 Start Server
4. 等待 10 秒，确认显示 "Connected"
5. 浏览器访问 http://127.0.0.1:14096/global/health 返回 {"healthy":true}

---

## 五、关键配置文件位置

| 文件 | 路径 |
|-----|------|
| authaddin.json | `%APPDATA%\kingsoft\wps\jsaddons\authaddin.json` |
| publish.xml | `%APPDATA%\kingsoft\wps\jsaddons\publish.xml` |
| jsplugins.xml | `%APPDATA%\kingsoft\wps\jsaddons\jsplugins.xml` |
| 插件目录 | `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` |
| launcher | `opencode-wps\launcher.js` (端口 14097) |
| proxy | `opencode-wps\opencode-proxy.js` (端口 14098) |
| 服务 | opencode serve (端口 14096) |

---

## 六、常见问题快速排查

| 症状 | 检查点 | 修复方法 |
|-----|-------|---------|
| 插件不显示 | authaddin.json 中 enable 是否为 true | 修改 authaddin.json |
| 侧边栏空白 | main.js 的 GetUrlPath 是否用绝对路径 | 硬编码插件目录路径 |
| Start Server 失败（opencode 已安装） | ① launcher 运行期 PATH 找不到二进制（计划任务环境不含 npm/bun 目录）② opencode 是 .ps1 | 已修复：`findOpenCodeBin` 按绝对路径探测（含 .exe/.cmd/.ps1），spawn 失败原因落盘到 opencode-serve.log；升级后重跑 `node install-addons.js` |
| Start Server 失败（/start 返回 HTTP 400，`opencode-serve.log` 报 `The argument 'stdio' is invalid`） | launcher 非 shell 分支（.exe/.ps1 直启）把 `fs.createWriteStream()` 创建的**未 open（fd:null）** 的 WriteStream 直接作为 spawn 的 stdio，spawn 前抛异常 | 已修复（≥1.6.5）：两分支统一改用 `['ignore','pipe','pipe']` + `pipeChildOutputToLog` 手动转发到日志流，彻底消除 WriteStream 未 open 即作为 stdio 的竞态；升级后重跑 `node install-addons.js` 并重启 launcher |
| 服务启动了但连不上 | 检查 14096 端口是否正常 | 手动测试 /global/health |
| 服务运行中但状态栏显示"已停止" | ① 健康检查"一次失败即永久放弃"（历史版本）② `/global/health` 探测在 WPS Chromium 下受 CORS/环境差异影响持续失败 ③ **launcher（14097）未运行**导致 `/status` 交叉验证失效 | 升级到包含健康检查自动恢复 + **多源交叉验证**的版本：健康检查全局常驻，状态判定不再单一依赖 `/global/health`——`/status` 端口监听回退 + **SSE 连接成功联动**，任一可靠信号源确认服务在跑即恢复"运行中"（≤1 周期自动恢复）。当 **launcher 未运行** 时（`probeLauncherRunning` 不可达），前端改用 **SSE（EventSource，不受 XHR CORS 差异影响）作为第三信号源**探测：SSE onopen 成功即证明服务在跑并自动恢复 + 切回 chat（≥1.5.3） |
| Proxy 连接失败 | opencode-proxy.js 端口 14098 是否启动 | 检查 14098 端口 |
| `npm test` 报「缺少运行根单元测试所需的依赖: fs-extra, yaml」并**退出码 2** | 工作区未执行 `npm install`（无 `node_modules`）——属**前置条件未满足**，非代码缺陷 | 先 `npm install`（如需 MCP 侧依赖再 `npm run mcp:install`）后重试。**注意退出码语义：0 = 测试通过，1 = 测试断言失败，2 = 前置依赖缺失**（≥1.9.27，Issue #297）。若仍出现裸 `Cannot find module`，说明在旧版本上运行 |
| 聊天报 `Error: {"name":"UnknownError",...}` | OpenCode 服务端内部错误（模型调用失败等），非插件 bug | 见下方「UnknownError 排查」章节 |
| AI 反复调用同一个工具、每次都报 `No active document`（或「没有打开的文档」） | COM 通道不可用（WPS 未运行 / 文档窗口不在前台），而 AI 把失败当成「工具挑食」反复重试 | 让 AI 先调 **`wps_whoami` 通道自检**（一次说清 `channelReady` / `activeDocument` / 建议下一步），据 `hint` 处理；**不要重复同一个失败调用**。详见下方「工具调用反复失败（No active document）排查」章节（Issue #373） |

---

### 六·补充：工具调用反复失败（`No active document`）排查

**现象**：AI 在同一轮对话里反复调用同一个工具，每次返回都提示「没有打开的文档 / `No active document`」，
试了 30 余次仍零产出；同时另一个工具（如 `wps_get_active_document`）却「看起来成功」。

**结论先行**：这不是「工具挑食」，而是 **COM 通道未挂接**（`GetActiveObject` 取不到 WPS 实例）——
WPS 进程可能在运行、文档也可能**确实已打开**（插件上下文 / launcher 缓存能看到文档名就是证据），
故障点在 COM 的 ROT 挂接，**不是「用户没把窗口切到前台」**。此前 `wps_get_active_document` 在 COM 失败时会回退读**插件心跳缓存**
（WPS 加载项每 500ms 推送的「最近开过哪个文档」）并把缓存包成 `success: true`，
把「通道断了」伪装成「通道正常」⇒ AI 据此认定「文档健在、只是某些工具挑食」，于是盲试。
**（Issue #373）已修**：失败就报失败，缓存降级为显式标注的「诊断线索·非成功」。

> ⚠️ **（Issue #395 RC-5）文案已纠偏**：失败提示**不再**写「请把文档窗口切到前台 / 请确认文档已打开」——
> 这类措辞与「插件上下文已读到文档名」的证据**直接矛盾**（曾把用户支去点任务栏，实际一次
> `openDocument` 重连就能打通通道）。现在统一指向「COM 通道未挂接，可调用 `openDocument` 重连」。

**自检方法（首选）**：让 AI 调用 **`wps_whoami`**（通道自检，内置工具，可直接调用）：

```json
{"channelReady": false, "platform": "win32", "activeDocument": null,
 "hint": "通道未就绪：COM 通道未挂接（`GetActiveObject` 取不到 WPS 实例）。可调用 `openDocument` 重连，或检查 WPS 是否在运行；不要重复同一个失败调用。"}
```

- **`channelReady`** 才是「通道是否就绪」的唯一判据（**不要**看 `success`——`success` 只表示自检本身执行成功）；
- `channelReady: true` ⇒ 可正常调用内置工具，或经 `wps_office_execute` 调用网关工具；
- `channelReady: false` ⇒ **调用 `openDocument` 重连**（或确认 WPS 进程在运行），**不要**重复同一个失败调用；**不要**再让用户去切窗口——通道未挂接与窗口是否前台无关（Issue #395 RC-5）。

**逐步排查**：

| 检查点 | 说明 | 处理 |
|------|------|------|
| WPS 是否在运行 | COM 通道依赖 WPS 进程 | 启动 WPS |
| COM 通道是否已挂接 | `GetActiveObject` 取不到实例时，即使文档已打开也不可用（与窗口是否前台无关） | 调 `openDocument` 重连（会重新挂接）；仍失败则重启 WPS |
| 是否有**活动文档** | 通道就绪后 `ActiveDocument` 应为该文档；插件上下文/launcher 缓存能看到文档名即说明文档已打开 | 文档未打开时先打开；已打开则按上一行处理通道 |
| MCP Server 是否连上 | 见 [MCP.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MCP.md) | `cd wps-office-mcp && npm install && npm run build` |

> 📌 **给 AI 的纪律**：任何工具报「No active document」时，**先调 `wps_whoami` 自检**，
> 再据 `hint` 决定换动作（通道未挂接 ⇒ 调 `openDocument` 重连）；**禁止**对同一调用反复重试，
> **禁止**把通道故障说成「请你确认文档已打开」（Issue #395 RC-5）。

---

### 六·补充：UnknownError 排查（聊天报错）

**现象**：在聊天框发送消息后，插件顶部/聊天区提示：

```json
Error: {"name":"UnknownError","data":{"message":"Unexpected server error. Check server logs for details.","ref":"err_xxxxxxxx"}}
```

**结论先行**：`UnknownError` 是 **OpenCode 服务端**（`opencode serve` 进程）在生成回复时抛出的内部错误，**不是 WPS 插件代码问题**。`ref: err_xxxxxxxx` 是服务端生成、用于在服务端日志中定位具体错误的引用 ID。常见触发因素：

| 因素 | 说明 | 处理 |
|------|------|------|
| 模型调用失败 | API key 失效 / 限流 / 模型不存在 / provider 配置错误 | 检查 `~/.config/opencode/opencode.json` 的 model/provider 配置与 API key |
| 文档上下文过大 | `injectContext` 注入的 WPS 文档上下文超过模型上下文窗口 | 在插件中清空/精简当前文档上下文后再试 |
| 会话状态异常 | 会话 `SESSION_ID` 失效或服务端会话损坏 | 在插件中「新建会话」重试 |
| 服务端 bug | `opencode serve` 自身异常 | 查看服务端日志定位（见下） |

**如何查看服务端日志（关键）**：

1. 确保已升级到含 **日志落盘** 的版本（`opencode-wps/launcher.js` 已将 opencode serve 的 stdout/stderr 写入日志文件，而非丢弃）。
2. 打开日志文件（按实际用户目录定位，Windows 默认为 `C:\Users\<你的用户名>`）：`<用户目录>\.opencode\logs\opencode-serve.log`
3. 在日志中搜索 `err_xxxxxxxx` 或报错时间点前后的堆栈，即可定位真正原因。
4. 日志采用**追加模式**，单文件超 5MB 会自动重命名为 `opencode-serve.log.old` 并重新开始记录，避免无限增长占满磁盘；如磁盘紧张可手动删除 `.old` 历史文件。

**临时绕过 launcher 手动启动查看日志**：

```bash
cd C:\path\to\your\workspace
opencode serve --port 14096 --hostname 127.0.0.1 --cors file://
```

在终端复现报错，直接看服务端打印的详细错误。

---

## 七、WPS 内置浏览器限制（重要）

### 为什么不能直接用官方 OpenCode 页面

WPS 加载项的内置浏览器是基于 **Chromium 103/104**（2022 年版本），不是最新的 Chrome 浏览器。这导致了大量限制：

### 已知的限制

| 限制类型 | 具体问题 | 影响 |
|---------|---------|------|
| **WebGL 不支持** | `getContext('webgl')` 返回 null | 无法使用 3D 图表、Canvas 高级效果 |
| **新版 API 不支持** | 如 `URL.canParse()`、`Array.at()` 等 | 部分现代 JS 方法报错 |
| **PWA 不支持** | 无 Service Worker、Manifest | 无法安装为桌面应用 |
| **Clipboard API 限制** | 写剪贴板需要用户授权 | 自动粘贴功能受限 |
| **LocalStorage 限制** | 存储空间小，隐私模式可能禁用 | 缓存/状态持久化不可靠 |
| **Fetch/CORS 限制** | 跨域请求更严格 | 调用外部 API 可能失败 |
| **ES Module 限制** | 部分场景下 module 加载失败 | 模块化代码可能不工作 |
| **文件系统访问限制** | 无法通过文件路径让服务端读取文件 | 文件上传必须转 Base64（最大 100MB） |
| **调试困难** | 本地安装模式下 WPS 不开放 F12；仅 `wpsjs debug` 开发模式可用 | 前端改 `wpsjs debug` + F12 调试（见「十五」）；后端查 `opencode-serve.log` |

### 版本信息示例

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.102 Safari/537.36 WpsOfficeApp/12.1.0.16250
```

### 解决方案

1. **不要直接 iframe 嵌入 opencode.ai**
   - 官方页面依赖大量新特性，会白屏或功能异常

2. **自己实现 UI**
   - 在 taskpane.html 中编写简化版 UI
   - 通过 API 调用 OpenCode 服务
   - 参考本项目的 taskpane.html 实现

3. **兼容写法**
   - 使用 ES5 语法
   - 避免箭头函数（强制，见 CODE_REVIEW_GUIDE.md §5.4 红线）
   - 避免 Optional Chaining (`?.`) 和 Nullish Coalescing (`??`)
   - 使用 polyfill 处理 Promise 等

4. **测试不同 WPS 版本**
   - 不同版本的 Chromium 内核可能有差异
   - 在目标 WPS 版本上测试

---

## 八、教训总结

1. **配置必须统一管理**：3 个配置文件（authaddin.json、publish.xml、jsplugins.xml）现在通过 install-addons.js 统一更新

2. **环境兼容性**：WPS taskpane 不是普通浏览器，document.location 不可用

3. **脚本类型检测**：Windows 上 .ps1 脚本需要通过 powershell.exe 启动，不能直接 spawn

4. **改完必须测**：每次修改后必须执行完整验证清单，不能只改代码不验证

5. **UI 不能复用**：WPS 内置浏览器太旧，不能直接嵌入官方页面，必须自己实现简化版 UI

6. **install-addons.js 是核心**：开发调试和日常使用都通过此脚本，无需 wpsjs publish

---

## 九、关闭 OpenCode 进程的最佳实践

### 问题背景
在 Launcher 中需要停止 OpenCode 服务进程。尝试过多种方式都不成功，最终找到最优解。

### 尝试过的失败方案

1. **读取 PID 文件然后 kill**
   - 理论上应该读取 `opencode.pid` 获取进程 PID，然后调用 `taskkill /PID xxx`
   - 问题：PID 文件路径难以确定，且 WPS 环境下文件访问受限

2. **通过 API 停止服务**
   - 尝试调用 OpenCode 的 shutdown API
   - 问题：OpenCode 服务本身没有提供可靠的停止接口

3. **查找进程标题**
   - 尝试通过窗口标题找到进程
   - 问题：命令行窗口可能被隐藏或标题变化

4. **按进程名全杀**
   - 使用 `taskkill /IM opencode.exe /F /T`
   - 问题：会终止系统上所有名为 `opencode.exe` 的进程

### 最终方案（2026-06 更新）

按端口精确停止，kill 前通过 wmic 确认进程名，防止误杀。

**代码**（launcher.js）：
```javascript
stopOpenCodeByPort(14096);  // 复用 stopOpenCodeByPort 函数
```

内部实现：
```javascript
execSync('wmic process where "ProcessId=' + pid + '" get Name /format:csv', ...);
// 确认进程名为 node.exe 或 opencode.exe 后再执行：
// 注意：2>nul 是 cmd.exe 重定向语法，PowerShell 应使用 2>$null
execSync('taskkill /F /PID ' + pid + ' 2>nul', ...);
```

**优点**：只终止占用 14096 端口的进程，且通过 wmic 双重验证进程身份。

### 黑窗闪现说明（2026-08 更新）

Windows 下，停止服务（`stopOpenCodeByPort`）与启动服务（`startOpenCode`）的**子进程调用曾闪现黑色命令行窗口**：

- **关闭服务闪 13 黑窗**：`stopOpenCodeByPort` 通过多个 `execSync` 子进程（`netstat` 查端口 → `powershell`/`wmic` 验证进程名 → `taskkill` 结束进程）停止服务，端口 14096 上可能同时存在主进程与多个 SSE 连接，逐 PID 验证+kill 未设 `windowsHide` 时累积闪现最多 13 个黑窗。**已修复**：全部 `execSync` 统一经 `hiddenExecSync()` 强制 `windowsHide:true`（`CREATE_NO_WINDOW`）。
- **启动服务闪 1 黑窗**：`spawn` 在 `needShell=true`（npm 全局 `opencode.cmd` shim / 无扩展名 PATH shim）时依赖 `shell:true`，`windowsHide` 仅间接传给外层 `cmd.exe`，无法覆盖 `.cmd` 批处理为脚本启动的嵌套控制台进程。**已修复**：`.cmd` 分支改为显式 `cmd.exe /d /s /c` 包装（`shell:false` + `windowsHide:true` + `windowsVerbatimArguments:true`），`.exe`/`.ps1` 直启分支统一走 `hiddenSpawn()`，所有 `spawn` 强制 `windowsHide:true`。

> 📌 若升级后仍观察到黑窗闪现，请反馈复现步骤与 `opencode-serve.log`。

---

## 十、WPS FileDialog 获取选中文件夹路径

### 问题背景
使用 WPS 的 `Application.FileDialog` 让用户选择文件夹后，无法获取用户实际选择的路径。

### 尝试过的失败方案

1. **使用 InitialFileName**
   - 期望：`fd.InitialFileName` 能在用户选择后更新为选中路径
   - 问题：InitialFileName 只是设置初始值，选择后不会更新

2. **使用 msoFileDialogOpen**
   - 用文件选择对话框，用户选文件后取所在目录
   - 问题：用户想选文件夹，而且 SelectedItems 获取不到值

3. **使用 SelectedItems**
   - 正确应该用 `fd.SelectedItems.Item(1)` 获取选中项
   - 问题：WPS 环境下可能报"未找到成员"错误

### 最终方案

```javascript
// 使用文件夹选择器
var fd = window.Application.FileDialog(window.Application.Enum.msoFileDialogFolderPicker)
fd.Title = '选择工作目录'
fd.InitialFileName = defaultPath || 'C:\\'

var result = fd.Show()
if (result === -1) {
    // 用户确认选择
    var folderPath = fd.SelectedItems.Item(1)
    if (folderPath) {
        document.getElementById('cwd-input').value = folderPath
    }
} else if (result === 0) {
    // 用户取消选择，清空输入框
    document.getElementById('cwd-input').value = ''
}
```

**关键点**：
- `msoFileDialogFolderPicker` - 直接选择文件夹，不是选文件
- `result === -1` - 用户确认选择（返回 -1 表示点了确定）
- `result === 0` - 用户取消选择
- `fd.SelectedItems.Item(1)` - 获取用户选中的文件夹路径
- 取消选择时清空输入框，避免用户体验困惑

---

## 十一、ACP / SDK 等现代库兼容性踩坑（2026-06）

### 背景

项目曾尝试两条路径来支持多模型可选：
1. **`@opencode-ai/sdk`** — 集成 OpenCode 官方 SDK，用 `SDK.listSessions()` 等替代原生 XHR
2. **借鉴 claudian 的 ACP 架构** — 用 Provider Registry + ChatRuntime 接口实现多 Provider Runtime

两条路径都因 WPS 内置 Chromium 103/104 的浏览器环境限制而失败。

---

### 1. `@opencode-ai/sdk` 不可用

**尝试**：安装 `@opencode-ai/sdk`，用 esbuild 打包为浏览器 bundle，在 `taskpane.html` 中用 SDK 替代原生 XHR/EventSource。

**失败根因**：

| 问题 | 详细 | 现象 |
|------|------|------|
| SDK 内部使用 `fetch()` | WPS Chromium 104 的 `fetch()` **Promise 永远 pending**（不 resolve 也不 reject） | `sdk.listSessions()` → 挂死 → 前端卡"加载中" |
| `TextDecoderStream` | SDK 的 SSE 使用 `response.body.pipeThrough(new TextDecoderStream()).getReader()` — Chrome 104 **不支持** `TextDecoderStream` | SSE 流式响应挂死，无流式回复 |
| `ReadableStream` pipeThrough | 同上，WPS 104 的 `ReadableStream` 实现不完整 | SDK 内部报错，静默失败 |
| `fetch()` 超时机制 | SDK 设置 `req.timeout = false`，依赖 `fetch()` 内部超时 | `fetch()` 永远挂死，无法超时 |

**关键日志**（WPS Console）：
```
[fetch] SDK error: {TypeError: Failed to fetch}
[fetch] SDK error: undefined
[SSE] Error: ...
```

**结论**：**WPS Chromium 104 的 `fetch()` 不可信任**，所有 HTTP 请求必须用原生 `XMLHttpRequest`，所有 SSE 必须用原生 `EventSource`。

**安全沙箱测试**：关闭 WPS 的"安全沙箱保护"后重新测试 `@opencode-ai/sdk`，`fetch()` **依然挂死**。说明问题不是安全策略导致的，而是 Chromium 104 内核本身的 `fetch()` 实现缺陷。

**替代方案**（未实施）：创建一个 XHR-based `fetch()` polyfill 注入 SDK — 但工作量等同于重写浏览器的 fetch API，不值得。

---

### 2. ACP (Agent Client Protocol) 不可用

**尝试**：借鉴 [claudian](https://github.com/YishenTu/claudian) 的多模型架构，用 Provider Registry + ChatRuntime 接口实现多 Provider Runtime（OpenCode、OpenAI、Anthropic 等）。

**失败根因**：

| ACP 组件 | WPS JS 环境 | 原因 |
|---------|------------|------|
| `child_process.spawn()` | ❌ 不可用 | WPS JS 运行在浏览器沙箱，无 Node.js API |
| stdin/stdout 管道 | ❌ 不可用 | 浏览器无 stdio 访问能力 |
| JSON-RPC 2.0 over stdio | ❌ 不可用 | 依赖子进程 + 管道通信 |
| Provider CLI 解析（`which claude`等） | ❌ 不可用 | 浏览器无 shell 访问 |
| `AsyncGenerator<StreamChunk>` | ⚠️ 需适配 | Chrome 104 支持，但现有代码用回调模式 |

**可行部分**：

| 组件 | 可行性 | 说明 |
|------|:------:|------|
| Provider Registry 模式 | ✅ | 纯设计模式，无环境依赖 |
| ChatRuntime 接口抽象 | ✅ | 可映射到回调/事件模式 |
| Provider 配置存储 | ✅ | 用 PluginStorage 或 localStorage |
| HTTP streaming 解析 | ✅ | 用 XHR + 逐行解析 SSE |

**结论**：ACP 的**传输层**（子进程 + stdio）完全不兼容 WPS JS。但上层的 **Provider Registry + ChatRuntime 抽象模式** 是纯设计模式，可以用 HTTP 方式重写（见 `ACP化改造` 分支评估）。

---

### 3. 通用教训：引入外部库的前置检查清单

在 WPS JS 环境中引入任何外部库之前，必须检查：

| 检查项 | 问题 | 处理 |
|--------|------|------|
| 是否依赖 `fetch()`？ | WPS 104 的 fetch 可能挂死 | 需确认是否能用 XHR 替代，或直接不可用 |
| 是否使用 `ReadableStream`/`TextDecoderStream`？ | Chrome 104 不完整支持 | 不可用 |
| 是否依赖 Node.js API（`fs`, `child_process`, `path`）？ | 浏览器沙箱无 Node.js | 不可用 |
| 是否使用 ES2018+ 特性（`AsyncGenerator`, `for-await-of`）？ | Chrome 104 部分支持 | 需验证或 Babel 转译 |
| 是否使用 `URL.canParse()`、`Array.at()` 等新版 API？ | Chrome 104 不支持 | 需 polyfill 或改用 ES5 |
| 是否依赖 WebSocket？ | WPS 环境可能受限 | 需实测 |
| 是否需要跨域请求？ | CORS 策略更严格 | 需后端支持或代理 |

**验证步骤**：
1. 在 `wpsjs debug` 开发调试模式下按 F12 打开 Console 观察（本地安装模式看不到前端 console，须用调试模式）
2. 执行 `console.log(typeof fetch)` 确认 API 存在性
3. 测试核心路径（如 `fetch('http://127.0.0.1:14096/global/health')`）是否返回 Promise 并 resolve
4. 测试完成后，**再决定是否集成**该库

---

## 十二、macOS 特有排查

### 插件不显示
```
~/Library/Containers/com.kingsoft.wps/Data/Documents/jsaddons/
├── opencode-wps-assistant/
│   ├── manifest.xml            # 必须有
│   ├── index.html
│   └── ...
```

**排查**：
1. 确认 `manifest.xml` 在正确的插件目录
2. WPS for Mac 功能区 → 配置工具 → 加载项管理 — 确认插件已启用
3. 重启 WPS（完全退出，不是关闭窗口）
4. 前端报错排查：开发调试模式（`wpsjs debug`）下按 F12 打开 Console；本地模式前端 console 不可见。launcher 自身输出日志见 `~/Library/Logs/opencode-launcher.log`（由 LaunchAgent 重定向，见 docs/MAC.md）

### MCP 不连接

MCP 服务器在 Mac 上使用 HTTP 轮询（`:58891/poll`），不同于 Windows 的 PowerShell COM：

```bash
# 检查 mac-poll-server 是否在运行
lsof -i :58891

# 测试轮询端点的连通性
curl -s http://127.0.0.1:58891/poll | head -c 100

# 检查 launcher-mac 日志
ps aux | grep launcher-mac
```

**排查**：
1. `node launcher-mac.js` 是否在运行？
2. `opencode serve` 是否在 `:14096` 运行？
3. `mac-poll-server.ts` 是否已编译？（`cd wps-office-mcp && npm run build`）

### WPS JS API 不支持某些操作

由于 Mac 版 WPS 使用 JS API（而非 Windows 的 COM 桥接），部分操作可能受限：

| 操作 | Mac 支持 | 说明 |
|------|----------|------|
| `Application.Evaluate()` | 部分支持 | 降级为设置公式→读取值→恢复 |
| `ActiveWindow.Zoom` | 支持 | 读写缩放比例 |
| `ApplyTemplate(theme)` | 部分支持 | 降级到 `ApplyTheme` |
| 文件对话框 | 不支持 | WPS JS API 无 `FileDialog` |
| ActiveX/OLE 对象 | 不支持 | 仅 Windows COM 可用 |

如果遇到不支持的操作，错误信息会在 Chat UI 中显示，通常包含 "未知操作" 或具体的 JS 异常信息。

### 安装后 Skills/Agents 不生效

```bash
# 重新运行安装脚本
node install-addons-mac.js

# 重启 OpenCode 服务（通过 Launcher API）
curl -X POST http://127.0.0.1:14097/stop
curl -X POST http://127.0.0.1:14097/start -H "Content-Type: application/json" -d '{"cwd": "'$PWD'"}'
```

## 十三、CNB Code Wiki 生成失败排查（Issue #117）

> 适用于：在仓库配置了 `.cnb.yml` 的 `tag_push` → `codewiki` 插件，但打 tag 后仓库 `/wikis` 页面仍是 "Page not found"、Wiki 始终未生成。

### 问题现象

- 仓库导航栏未出现 **Wiki** 入口，访问 `/-/wikis` 报 404 / "Page not found"。
- 知识库中看不到 Wiki 生成的文档。
- `tag_push` 触发的 codewiki 构建日志反复出现：
  ```
  LLM响应中未找到有效的Action标签, LLM响应预览: (空)
  analyze_repository_structure_agent: agent.run() 返回空内容
  generate catalogue error: agent returned empty catalogue items
  ```

### 根因（平台侧，非仓库配置）

经容器内实测（与 codewiki 插件相同构建环境直接调用 LLM 端点），根因是 **codewiki 插件（镜像 `cnbcool/codewiki:latest`，v5.3）调用的 LLM 接入端点返回 401 认证失败**：

| 测试项 | 结果 |
|--------|------|
| `use_codebuddy: 0` 端点 `/-/ai/chat/completions` | **401** `errcode:16 "user is not logged in"` |
| `use_codebuddy: 1` 端点 `/-/ai-ide/v2/chat/completions` | **401** `errcode:16 "user is not logged in"` |
| `Authorization: Bearer $CNB_TOKEN` | ❌ 401 |
| `x-cnb-token: $CNB_TOKEN` | ❌ 401 |

同时确认 `CNB_TOKEN`（27 位）已注入容器、`CNB_API_ENDPOINT=https://api.cnb.cool` 正常。结论：

- codewiki 插件调用的两个 LLM 端点都**拒绝了 `CNB_TOKEN` 认证**，返回 401 未登录 → LLM 拿到空响应 → 仓库结构分析 / 目录生成全部失败 → Wiki 从未真正生成。
- 这与 `.cnb.yml` 无关——`use_codebuddy` 0/1、任何模型名都无法绕过认证。
- **这是 CNB 平台侧 LLM 接入的认证兼容性问题**（插件旧版 v5.3 的 LLM proxy 认证机制与当前平台 AI 接入要求不匹配），非仓库配置可修复。

### 如何避坑 / 处理

1. **确认配置已就绪**（`.cnb.yml` 顶层 `$` 下 `tag_push` → `generate codewiki` stage）：
   ```yaml
   tag_push:
     - stages:
         - name: generate codewiki
           timeout: 10h
           image: cnbcool/codewiki:latest
           settings:
             git_doc_dir: /${CNB_BUILD_WORKSPACE}/${CNB_REPO_SLUG}/codewiki   # 必填
             use_codebuddy: 0          # CNB AI 接入点
             llm_model_name: 'hy3-preview'   # 插件 README 示例模型
             knowledge_enabled: true   # 生成的 Wiki 自动入库仓库知识库
   ```
   > `git_doc_dir` 为**必填**，缺失会导致插件直接运行失败。

2. **检查构建日志**：若出现上述 `LLM响应...空` / `返回空内容` 错误，即命中本根因。

3. **向平台侧反馈**（仓库侧无法自行修复）：
   - 向 CNB 平台反馈 codewiki 插件 LLM 401 认证问题；
   - 在仓库「设置 → AI/知识库」中确认本仓库 AI 接入（custom-token）已正确配置；
   - 待插件镜像升级到兼容认证机制的版本后，重新打 tag 触发一次即可（届时 `.cnb.yml` 配置已就绪）。

### 判定要点

- **是配置问题**：`git_doc_dir` 缺失、`knowledge_enabled` 未开、`tag_push` 事件缺失 → 修改 `.cnb.yml` 即可。
- **是平台认证问题**：配置逐项核对无误但日志仍报 401 / LLM 空响应 → 平台侧问题，按上文第 3 条处理。

---

## 十四、Wiki 已生成但内部链接点击 404（Issue #204）

> 适用于：Wiki 已成功挂载（首页可正常打开），但 Wiki 页面内**文档间相互引用的链接**点击后跳转到 404。

### 问题现象

- Wiki 首页能正常打开，文档内容可见；
- 点击页面内「[INSTALLATION.md]」「[README.md]」等**文档互引链接** → 404；
- 仓库 `docs/` 与根 `README.md` 中存在大量**相对路径链接**（`./xxx.md`、`../xxx.md`）。

### 根因

codewiki 将仓库 `docs/` 文档生成到 Wiki 平台时，**不会重写文档内部的相对链接**。相对链接在仓库文件浏览中正常，但在 Wiki 页面中按当前 Wiki URL 解析到不存在的路径 → **404**。

对照：仓库知识库入库（`knowledge:update`）会**自动把相对链接重写为 CNB blob 绝对链接**（`https://cnb.cool/<slug>/-/blob/main/docs/xxx.md`），因此知识库中的链接可正常访问；但 codewiki 生成的 Wiki 未做同样重写。

### 解决

1. 将 `docs/` 与根 `README.md` 中所有内部相对链接改写为 **CNB blob 绝对链接**（`https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/xxx.md`）。
2. 用脚本 `scripts/rewrite-wiki-links.js` 统一维护与改写：
   - `node scripts/rewrite-wiki-links.js`（实际改写）
   - `node scripts/rewrite-wiki-links.js --check`（CI 校验，见 `npm run validate:wikilinks`）
3. 将修正后的 docs/ 重新上传到 Wiki（方案 A）：
   - 由于 codewiki 插件 LLM 生成存在平台侧缺陷（见上「十三」），设计上改用 `scripts/upload-wiki.js` 直接调用 CNB Wiki 上传 API，把 docs/ 按 4 大分类重新上传为 Wiki 页面。
   - `node scripts/upload-wiki.js`（在 `.cnb.yml` 的 `tag_push` 中自动执行，见 `.cnb.yml`）。
   - ⚠️ **实测结论（Issue #117，2026-08-23）**：该 API（`upload/wiki/file`）在 CI（tag_push）环境下**无法认证上传**——JSON body 返回 `401 errcode:16`（user not logged in），multipart 返回 `400 errcode:3`（Invalid argument）。即流水线临时令牌 `CNB_TOKEN` 对该内部 API 无权限（对 `docker login` 的 OCI 有效，但对 HTTP 上传接口不可用）。**因此当前 `upload-wiki.js` 在 CI 中不会成功上传**，需通过以下任一方式上传修正后的 docs/ 至 Wiki：
     - **用户本人手动上传**（有 OAuth 权限）：登录 CNB 网页，进入 Wiki 编辑界面，把修正后的 docs/（blob 绝对链接版）重新上传覆盖旧版；或
     - **等待平台修复 codewiki 插件 LLM 缺陷**后重新打 tag，由 codewiki 自动生成覆盖。
   - 上传后 Wiki 内链接即可正常跳转（blob 绝对链接可访问）。
   - **一级目录落地页（Issue #210）**：Wiki 导航会把每个一级目录渲染成“与一级目录同名”的首个子节点，点击指向裸目录路径（如 `/-/wiki/使用指南`）。`upload-wiki.js` 会为每个一级目录额外上传一页“裸路径落地页”：存在同名文档的目录（使用指南/开发指南）复用该文档内容并加一行入口说明，无同名文档的目录（平台专题/内部参考）生成“分类索引页”汇总本目录全部 Wiki 文档链接。从而让 `/-/wiki/使用指南` 等裸目录路径可访问而非 404。
   - **子项中文显示名（Issue #210，`WIKI_NAME_MAP`）**：`upload-wiki.js` 的 `WIKI_NAME_MAP` 会把 Wiki 导航子项显示为**中文名称**（如 `使用说明`、`安装指南`、`问题排查`、`功能特性`）而非英文文件名（`USAGE`、`INSTALLATION` 等），更符合中文文档站导航习惯。未映射的源文件名原样返回，`README.md` 保持原英文名不映射；新增文档若希望导航显示中文名，需在 `WIKI_NAME_MAP` 登记（命名规范见 `docs/DEVELOPMENT_GUIDE.md`）。

### 判定要点

- 是相对链接未改写 → 按上文第 1、2 步处理；
- 是平台侧 Wiki 渲染问题（改写为 blob 绝对链接后仍 404）→ 向 CNB 平台反馈。

---

## 十五、WPS 宿主 TaskPane 视口 bug（侧边栏头部遮挡，Issue #164 血泪教训）

> 适用于：WPS 文字（Writer）侧边栏 ChatUI **首次打开**时头部（topbar/session-header）被遮挡、且压扁「开始/插入」功能区顶部标签；**仅 WPS 文字出问题，PPT/Excel 正常**；「新建 WPS 标签窗口再切回」可临时恢复。

### 问题现象

- 打开 WPS 文字 → 点击插件「打开面板」→ 侧边栏 ChatUI 顶部被 WPS 功能区盖住
- 首次打开**必现**（单显示器 + 最大化时）
- 打开文档/切换到 opencode-wps 插件选项卡时正常，**一点击「打开面板」就遮挡**
- PPT/Excel 中点击「打开面板」**正常**，仅 WPS 文字异常
- 「新建一个 WPS 标签窗口再切回」后遮挡消失（宿主重算窗格几何纠正）

### 根因

经 10+ 轮排查（Issue #78 → #164，共涉及 PR #165/#166/#169/#170/#173/#174/#240）与 **DIAG 日志实测取证**确认：

**WPS 文字（实测版本 12.1.0.28022）宿主在首次显示任务窗格（`Visible=true`）时，把 WebView 视口定位到了"整窗高度"而非"功能区下方可用高度"，差值恰为功能区高度（实测 `innerHeight=751` vs 正常 `634`，差 117px ≈ 功能区高度）。** 页面头部正好落在这被盖住的 117px 里，被功能区遮挡。

关键事实：
- **前端页面布局无 bug**：`messages.offsetTop` 恒为 98px，flex 高度链数学上不可能把头部顶出可视区
- **宿主侧任何 API 都无法纠正**：`DockPosition` / `Visible=false→true` / `Width/Height` 微调 / `ActiveWindow.UsableHeight` 设 Height —— **全部实测无效**，WPS 文字把 `innerHeight` 锁死为整窗高，不随任何宿主属性变更
- **WPS 官方升级后自动消失**（用户在 2026-09-03 确认），证实为 WPS 旧版本宿主 bug，非插件代码问题

### 如何避坑 / 排查

**第一步：先确认是不是 WPS 版本 bug（优先升级 WPS）**

遇到「仅 WPS 文字首开遮挡、PPT/Excel 正常」这类布局问题时，**先检查 WPS 版本并尝试升级**，不要急于改插件代码。本案例中，WPS 从 12.1.0.28022 升级后问题自动消失。

**第二步：确认前端是否真的有问题（DIAG 取证）**

在 `taskpane.html` 中加入诊断日志（`window.innerHeight / document.documentElement.clientHeight / .app.offsetHeight / messages.offsetTop`），对比「异常 vs 新建标签切回后」两组数据：

| 实测 | 结论 | 修法 |
|------|------|------|
| 异常与恢复时 `messages.offsetTop` 恒定、仅 `innerHeight` 不同 | 前端布局无 bug，是宿主视口定位 bug | 升级 WPS / 反馈 WPS 官方 |
| `innerHeight` 正常、但页面布局错 | 页面 bug | 直接改页面 CSS/JS |

**第三步：若确认为宿主 bug，不要叠插件侧补丁**

历史上已尝试并**全部实测无效**的手段（不要重蹈覆辙）：

| 手段 | 为什么无效 |
|------|-----------|
| 页面内 reflow/redraw 自愈 | 页面内测不到宿主视口偏移 |
| `DockPosition` 方向切换/再断言 | 只决定停靠侧，不控制视口高度 |
| `Visible=false→true` 重排 | 宿主重算仍沿用错误整窗高度 |
| `Width`/`Height` +2/-2 微调 | 宿主不接受尺寸变更触发视口重算 |
| `ActiveWindow.UsableHeight` 设 `tskpane.Height` | 实测 `innerHeight` 仍为整窗高 |

**插件侧如何采集前端 DIAG 数据**

本地安装模式下 WPS **不开放 F12 开发者工具**，前端 `console.log` 无法直接查看。请改用 **`wpsjs debug` 开发调试模式**运行插件，并按 F12 在 Console 查看 DIAG 输出。

若需采集前端布局数据，可临时在 `taskpane.html` 注入采集 `window.innerHeight / document.documentElement.clientHeight / .app.offsetHeight / messages.offsetTop` 的 `console.log`，于 `wpsjs debug` 模式 Console 中观察；采集完成后移除临时代码。

### 判定要点

- **是 WPS 版本 bug** → 前端 DIAG 数据正常、`innerHeight` 异常、升级 WPS 后消失 → **不是插件代码问题**，不要改插件代码，反馈 WPS 官方
- **是页面 bug** → 前端 DIAG 数据异常（`offsetTop`/`offsetHeight` 异常）→ 直接在页面 CSS/JS 修复
- **「新建标签切回可恢复」是一个诊断信号，不是修复手段**：它证明宿主在窗格切换时会重算几何，但插件侧**没有可靠接口**能触发同等的重算
