## PR #53 审查结果

由 `helloworldbugs` 提交，目标 `main`，包含模型搜索、选择持久化、wps-expert subagent 等改进。

### CRITICAL

**1. `PERSIST.*` 被错误替换为 `CONFIG.*` — 所有 API 调用失败**

`taskpane.html:408-412` 把初始化从 `PERSIST.apiUrl/cwd/agent/model` 改成了 `CONFIG.apiUrl/cwd/agent/model`。但 `CONFIG` 对象**没有这些属性**（它只有 `opencode`, `launcher`, `plugin`, `session`, `network`）。结果：
- `API_BASE = undefined` → 所有网络请求失败
- `PROJECT_DIR = undefined` → 项目目录丢失
- `CURRENT_AGENT / MODEL / PROVIDER` 全部 `undefined`

**修复**：回退为 `PERSIST.apiUrl/cwd/agent/model/provider`。

**2. 硬编码 `C:\Users\Administrator` 路径**

`taskpane.html:610`:
```js
var cwd = userInput || 'C:\\Users\\' + 'Administrator'
```
拆分字符串显然是为了绕过代码审查。硬编码意味着：
- 所有非 Administrator 用户的 WPS 打开后会指向**不存在的路径**
- 原设计 `CONFIG.plugin.userHome` 是安装时动态注入的，现在被替换为硬编码死路径

**修复**：恢复 `CONFIG.plugin.userHome`。

### HIGH

**3. `CONFIG.provider = id` 写入了不存在的属性**

`taskpane.html:790` — provider 选择不会被持久化到存储。

**修复**：改为 `PERSIST.provider = id`。

**4. `filterModelDropdown` 无匹配时没有反馈**

搜索无结果时下拉框变空，用户看不到任何提示。

### LOW

- 搜索 XSS 安全（只做 `.indexOf()` 不注入 DOM）
- CSS 选择器 `[onclick*="selectModel"]` 脆弱，建议加 `data-*` 属性

---

**结论：不能合并。** #1 和 #2 是阻断性回归，会破坏整个应用。根因是把用户选择（PERSIST）和配置常量（CONFIG）混为一谈。