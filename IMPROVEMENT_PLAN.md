# opencode-wps 整改方案（详细版）

> 基于 doubao 代码评审报告的改进计划

---

## 文件结构概览

```
opencode-wps/opencode-wps/
├── taskpane.html     # 主 UI 文件（1221 行），包含所有 JS 逻辑
├── main.js           # WPS Ribbon 回调、状态管理
├── launcher.js       # Launcher 进程
├── serve.js          # 本地服务
├── index.html        # 入口页
├── opencode-proxy.js # 代理（未使用）
└── _sse_test.js      # 测试文件
```

**核心代码位置**：
- API_BASE 硬编码：`taskpane.html:309`
- 消息发送：`taskpane.html:sendMessage()`
- SSE 连接：`taskpane.html:connectSSE()`
- 错误处理：无全局捕获

---

## 阶段一：安全修复（高优先级）

### 1.1 输入过滤 - 防 XSS

**问题**：用户消息直接插入 DOM，存在 XSS 风险

**现状**（taskpane.html:行号待查）：
```javascript
// 当前代码，直接用 innerHTML
div.innerHTML = userMessage;  // 危险！
```

**目标代码**：
```javascript
// 新增 safeInput 函数，放在变量定义区域（约第 354 行后）
function safeInput(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, function(c) {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}
```

**修改点**：
1. 在 `// --- Storage ---` 区域后添加 `safeInput` 函数
2. 找到消息渲染位置，将 `innerHTML` 改为 `textContent` 或 `safeInput()` 包装

**涉及行**：约 500-600 行（消息渲染部分）

**验证方法**：发送 `<script>alert(1)</script>` 测试是否弹窗

---

### 1.2 配置外置 - API 地址

**问题**：API 地址硬编码在第 309 行

**现状**：
```javascript
var API_BASE = 'http://127.0.0.1:14096'  // 危险：泄漏地址
```

**目标代码**：
```javascript
// 替换第 309 行为
var API_BASE = (function() {
  var stored = getPS('opencode_api_url');  // 使用 WPS PluginStorage
  return stored || 'http://127.0.0.1:14096';
})();

// 添加配置保存函数
function saveApiUrl(url) {
  window.Application.PluginStorage.setItem('opencode_api_url', url);
}
```

**修改点**：
- 第 309 行：改用立即执行函数读取存储
- 添加保存配置的 UI（在 Setup 界面）

**涉及行**：第 309 行，Setup 区域（约第 200-280 行）

**验证方法**：在 Setup 界面修改 API 地址，刷新后仍生效

---

### 1.3 敏感操作确认

**问题**：删除会话、清空历史等操作无确认

**现状**（约第 400-450 行）：
```javascript
// 直接执行，无确认
function deleteSession(id) {
  sessions = sessions.filter(s => s.id !== id);  // 危险！
}
```

**目标代码**：
```javascript
function confirmDangerousAction(actionName) {
  return confirm('确定要执行"' + actionName + '"吗？此操作不可撤销。');
}

// 修改删除函数
function deleteSession(id) {
  if (!confirmDangerousAction('删除会话')) return;
  sessions = sessions.filter(s => s.id !== id);
  saveSessions();
  renderSessionList();
}
```

**涉及函数**：
- `deleteSession()` - 删除会话
- `clearAllMessages()` - 清空消息
- `clearAllSessions()` - 清空所有会话

**验证方法**：点击删除按钮，弹出确认框

---

## 阶段二：健壮性修复（中优先级）

### 2.1 全局异常捕获

**问题**：JS 错误无捕获，API 失败导致页面崩溃

**现状**：无 `window.onerror`

**目标代码**：
```javascript
// 在变量定义区域后添加（约第 354 行）
window.onerror = function(msg, url, line, col, error) {
  logError('Global', { msg, url, line, col, error: error?.message });
  showToast('操作失败，请重试', 'error');
  return true;  // 阻止默认错误处理
};

window.onunhandledrejection = function(event) {
  logError('UnhandledPromise', { reason: event.reason });
  showToast('网络请求失败', 'error');
};
```

**涉及行**：第 354 行后

**验证方法**：手动触发 JS 错误，观察是否显示 Toast

---

### 2.2 错误日志记录

**问题**：出错后无法定位

**目标代码**：
```javascript
// 新增错误日志函数
var ERROR_LOGS = [];

function logError(context, data) {
  var log = {
    time: new Date().toISOString(),
    context: context,
    data: data
  };
  console.error('[ERROR]', log);
  ERROR_LOGS.unshift(log);
  if (ERROR_LOGS.length > 50) ERROR_LOGS.pop();
}

function getErrorLogs() {
  return ERROR_LOGS;
}
```

**涉及行**：新增函数，约在第 354 行后

---

### 2.3 空值/类型判断

**问题**：多处直接使用对象未判断是否存在

**目标代码**：
```javascript
// 在 WPS API 调用前添加检查
function checkWpsReady() {
  try {
    if (!window.WPS || !window.WPS.Application) {
      showToast('WPS 未就绪，请重启 WPS', 'error');
      return false;
    }
    return true;
  } catch (e) {
    logError('checkWpsReady', e);
    return false;
  }
}

function checkDocument() {
  try {
    var doc = window.WPS.Application.ActiveDocument;
    if (!doc) {
      showToast('请先打开文档', 'warning');
      return false;
    }
    return doc;
  } catch (e) {
    logError('checkDocument', e);
    return false;
  }
}
```

**涉及文件**：main.js

---

### 2.4 网络请求重试

**问题**：API 请求失败无重试，用户需手动重试

**现状**（taskpane.html:约第 800-900 行）：
```javascript
// 直接 fetch，无重试
var resp = await fetch(url, options);
```

**目标代码**：
```javascript
// 新增重试 fetch 函数
async function fetchWithRetry(url, options, maxRetries = 3) {
  var lastError;
  for (var i = 0; i < maxRetries; i++) {
    try {
      var resp = await fetch(url, options);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp;
    } catch (e) {
      lastError = e;
      logError('fetchRetry', { url, attempt: i + 1, error: e.message });
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

// 替换所有直接 fetch 调用
```

**涉及行**：约 800-900 行

---

### 2.5 SSE 连接稳定性

**问题**：SSE 断开后无自动重连

**目标代码**：
```javascript
// 修改 connectSSE 函数，添加重连逻辑
function connectSSE() {
  if (SSE) SSE.close();

  var url = API_BASE + '/v1/chat/completions?sessionId=' + SESSION_ID;
  SSE = new EventSource(url);

  SSE.onopen = function() {
    console.log('SSE connected');
    CONNECTED = true;
    updateConnectionStatus();
  };

  SSE.onerror = function() {
    console.error('SSE error');
    CONNECTED = false;
    updateConnectionStatus();
    SSE.close();
    // 3 秒后重连
    setTimeout(connectSSE, 3000);
  };

  // ... 其余回调
}
```

**涉及行**：约 850-950 行

---

## 阶段三：代码规范与可维护性（低优先级）

### 3.1 提取常量

**问题**：魔法值泛滥，难以维护

**目标代码**：
```javascript
// 在 taskpane.html 第 305 行后添加常量定义
// ==================== 常量定义 ====================
var CONSTANTS = {
  // API
  API_DEFAULT_URL: 'http://127.0.0.1:14096',
  API_TIMEOUT: 30000,
  MAX_RETRIES: 3,

  // SSE
  SSE_RECONNECT_DELAY: 3000,

  // 消息
  MAX_MESSAGE_LENGTH: 10000,
  MAX_HISTORY: 100,

  // UI
  TOAST_DURATION: 3000,
  LOADING_DELAY: 200,

  // 会话
  DEFAULT_SESSION_NAME: '新对话'
};

// 替换代码中的魔法值
// var timeout = 30000;  →  var timeout = CONSTANTS.API_TIMEOUT;
```

**涉及行**：第 305 行后

---

### 3.2 统一命名规范

**现状**：
```javascript
var a = 1;                    // 无意义命名
var DocumentContent = '';    // 大驼峰（应小驼峰）
var doc_content = '';        // 下划线（应驼峰）
```

**目标**：统一使用小驼峰
- 变量/函数：`currentSession`, `sendMessage`
- 常量：`MAX_RETRIES`, `API_TIMEOUT`
- CSS 类：保持小写中划线 `.btn-primary`

**涉及文件**：全局，建议用 IDE 重构

---

### 3.3 工具函数模块化

**问题**：重复代码

**目标代码**：
```javascript
// 新建 opencode-wps/utils.js
var Utils = {
  debounce: function(fn, delay) {
    var timer;
    return function() {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(context, args); }, delay);
    };
  },

  formatDate: function(date) {
    return new Date(date).toLocaleString('zh-CN');
  },

  truncate: function(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  },

  generateId: function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  safeInput: function(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/[<>&"']/g, function(c) {
      var map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
      return map[c];
    });
  }
};
```

**涉及文件**：新建 `utils.js`

---

### 3.4 README 完善

**补充内容**：

| 章节 | 补充内容 |
|------|----------|
| 环境要求 | WPS 12.1.0+，Node.js 18+，Windows 10/11 |
| 快速开始 | `npm install` → `node install-addons.js` → 重启 WPS |
| 功能清单 | SSE 流式对话、Markdown 渲染、多会话、MCP 工具、Agent 选择 |
| 常见问题 | 插件不显示、MCP 连接失败、服务启动失败 |
| 调试 | `node install-addons.js` 重装，`schtasks /Run /TN "OpenCodeLauncher"` 启动服务 |

---

## 实施顺序与时间估计

| 序号 | 任务 | 文件 | 行号 | 预计工时 | 风险 |
|------|------|------|------|----------|------|
| 1.1 | 添加 safeInput 函数 | taskpane.html | 354+ | 0.5h | 低 |
| 1.2 | 配置外置 | taskpane.html | 309 | 1h | 中 |
| 1.3 | 敏感操作确认 | taskpane.html | ~400 | 0.5h | 低 |
| 2.1 | 全局异常捕获 | taskpane.html | 354+ | 0.5h | 低 |
| 2.2 | 错误日志记录 | taskpane.html | 354+ | 0.5h | 低 |
| 2.3 | 空值判断 | main.js | 全文 | 1h | 中 |
| 2.4 | 请求重试 | taskpane.html | ~850 | 1h | 中 |
| 2.5 | SSE 重连 | taskpane.html | ~900 | 0.5h | 中 |
| 3.1 | 提取常量 | taskpane.html | 305 | 1h | 低 |
| 3.2 | 命名规范 | 全局 | - | 2h | 中 |
| 3.3 | 工具模块 | 新建文件 | - | 1h | 低 |
| 3.4 | README 完善 | README.md | - | 1h | 低 |

**总计**：约 10 小时

---

## 进度跟踪

- [ ] 阶段一：安全修复
  - [ ] 1.1 输入过滤 - 添加 safeInput 函数
  - [ ] 1.2 配置外置 - 使用 PluginStorage 存储 API 地址
  - [ ] 1.3 敏感操作确认 - 添加 confirmDangerousAction
- [ ] 阶段二：健壮性修复
  - [ ] 2.1 全局异常捕获 - window.onerror
  - [ ] 2.2 错误日志 - logError 函数
  - [ ] 2.3 空值判断 - checkWpsReady, checkDocument
  - [ ] 2.4 网络重试 - fetchWithRetry
  - [ ] 2.5 SSE 重连 - connectSSE 自动重连
- [ ] 阶段三：规范与维护
  - [ ] 3.1 提取常量 - CONSTANTS 对象
  - [ ] 3.2 命名规范 - 小驼峰统一
  - [ ] 3.3 工具模块 - utils.js
  - [ ] 3.4 README 完善 - 补充环境要求/常见问题