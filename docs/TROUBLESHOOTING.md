# WPS 插件问题排查与避坑指南

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
   - 打开侧边栏后，按 F12 打开开发者工具
   - 检查 Network 面板，看 taskpane.html 是否返回 200

---

## 三、Start Server 启动失败的坑

### 问题现象
- 点击 Start Server，转一会儿报错 "Failed to start. Check if opencode is installed."
- 但实际上 opencode 已经安装了

### 根因
`launcher.js` 使用 Node.js 的 `spawn()` 直接启动 opencode：
```javascript
// 错误代码 - 假设 opencode 是可执行文件
opencodeProcess = spawn('opencode', ['serve', ...]);
```

但实际上 opencode 是 `.ps1` PowerShell 脚本，需要通过 powershell.exe 启动。

### 如何避坑

1. **检测脚本类型并使用正确的启动方式**
   ```javascript
   // 正确代码
   if (opencodeBin.endsWith('.ps1')) {
       opencodeProcess = spawn('powershell.exe', [
           '-ExecutionPolicy', 'Bypass',
           '-File', opencodeBin,
           'serve', '--port', '14096', ...
       ]);
   } else {
       opencodeProcess = spawn(opencodeBin, ['serve', ...]);
   }
   ```

2. **手动验证服务**
   ```powershell
   # 检查 launcher 是否运行
   Invoke-RestMethod "http://127.0.0.1:14097/status"

   # 手动启动服务测试
   Invoke-RestMethod "http://127.0.0.1:14097/start" -Method Post -Body '{"cwd":"D:\code\opencode-wps"}' -ContentType "application/json"

   # 检查健康状态
   Invoke-RestMethod "http://127.0.0.1:14096/global/health"
   ```

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
| Start Server 失败 | launcher.js 是否支持 .ps1 | 添加 powershell 检测逻辑 |
| 服务启动了但连不上 | 检查 14096 端口是否正常 | 手动测试 /global/health |
| Proxy 连接失败 | opencode-proxy.js 端口 14098 是否启动 | 检查 14098 端口 |

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
| **调试困难** | F12 开发者工具功能有限 | 问题排查困难 |

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
   - 避免箭头函数（可选）
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
1. 在 WPS 中按 F12 打开 Console（或 ALT+F12）
2. 执行 `console.log(typeof fetch)` 确认 API 存在性
3. 测试核心路径（如 `fetch('http://127.0.0.1:14096/global/health')`）是否返回 Promise 并 resolve
4. 测试完成后，**再决定是否集成**该库
