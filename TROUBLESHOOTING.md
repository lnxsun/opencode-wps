# WPS 插件问题排查与避坑指南

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

1. **install-addons.js 必须同时更新 authaddin.json**
   ```javascript
   // 找到 opencode-wps 的 key: 6b7a57516c426c6551796e326633317a
   // 设置 "enable": true
   ```

2. **检查配置的命令**
   ```powershell
   # 查看真正的开关状态
   Get-Content "$env:APPDATA\kingsoft\wps\jsaddons\authaddin.json"
   # 搜索 opencode-wps 那一段，确认 enable 是 true 还是 false
   ```

3. **修复命令**（如果手动紧急修复）
   - 编辑 `authaddin.json`
   - 找到 key `6b7a57516c426c6551796e326633317a`
   - 把 `"enable": false` 改为 `"enable": true`
   - 不需要重启 WPS，重新打开"加载项"窗口即可

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
   // 正确代码 - 硬编码插件目录
   function GetUrlPath() {
       return 'file:///C:/Users/Administrator/AppData/Roaming/kingsoft/wps/jsaddons/opencode-wps_';
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
| 服务 | opencode serve (端口 14096) |

---

## 六、常见问题快速排查

| 症状 | 检查点 | 修复方法 |
|-----|-------|---------|
| 插件不显示 | authaddin.json 中 enable 是否为 true | 修改 authaddin.json |
| 侧边栏空白 | main.js 的 GetUrlPath 是否用绝对路径 | 硬编码插件目录路径 |
| Start Server 失败 | launcher.js 是否支持 .ps1 | 添加 powershell 检测逻辑 |
| 服务启动了但连不上 | 检查 14096 端口是否正常 | 手动测试 /global/health |

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

1. **配置必须统一管理**：3 个配置文件（authaddin.json、publish.xml、jsplugins.xml）必须通过 install-addons.js 统一更新，不能只改一个

2. **环境兼容性**：WPS taskpane 不是普通浏览器，document.location 不可用

3. **脚本类型检测**：Windows 上 .ps1 脚本需要通过 powershell.exe 启动，不能直接 spawn

4. **改完必须测**：每次修改后必须执行完整验证清单，不能只改代码不验证

5. **紧急修复**：如果插件禁用，手动改 authaddin.json 是最快方案

6. **UI 不能复用**：WPS 内置浏览器太旧，不能直接嵌入官方页面，必须自己实现简化版 UI