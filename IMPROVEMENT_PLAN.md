# opencode-wps 整改方案

> 基于 doubao 代码评审报告的改进计划

## 整改原则

1. **分阶段实施**：按优先级分 3 个阶段
2. **最小改动**：不影响现有功能的前提下优化
3. **可验证**：每项改进可测试验证

---

## 阶段一：安全修复（高优先级）

### 1.1 输入过滤

**问题**：用户输入/外部数据直接使用，存在 XSS 风险

**方案**：在 taskpane.html 添加 safeInput 函数

```javascript
function safeInput(str) {
  if (!str) return "";
  return str.replace(/[<>&"']/g, function(c) {
    const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}
```

**涉及文件**：
- `opencode-wps/taskpane.html` - 用户消息处理

**影响范围**：低，仅影响消息显示

---

### 1.2 配置外置

**问题**：API 地址硬编码在源码中

**方案**：使用 localStorage 存储配置，初始化时加载

```javascript
const CONFIG = {
  get apiUrl() {
    return localStorage.getItem('opencode_api_url') || 'http://127.0.0.1:14096';
  },
  set apiUrl(val) {
    localStorage.setItem('opencode_api_url', val);
  }
};
```

**涉及文件**：
- `opencode-wps/taskpane.html`
- `opencode-wps/main.js`

---

### 1.3 敏感操作确认

**问题**：无权限控制，危险操作无确认

**方案**：危险操作添加确认对话框

```javascript
async function confirmDangerousAction(action) {
  return confirm(`确定要执行 "${action}" 吗？此操作不可撤销。`);
}
```

**涉及文件**：
- `opencode-wps/taskpane.html` - 文件删除、清空等操作

---

## 阶段二：健壮性修复（中优先级）

### 2.1 全局异常捕获

**问题**：API 调用失败导致插件卡死

**方案**：
1. 添加 window.onerror 全局捕获
2. 封装 WPS API 调用函数，内部包含 try-catch

```javascript
window.onerror = function(msg, url, line, col, error) {
  console.error('Global error:', msg, 'at', line);
  showToast('操作失败，请重试', 'error');
  return true;
};

async function safeWpsCall(fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    console.error('WPS API error:', err);
    showToast('WPS 操作失败: ' + err.message, 'error');
    return fallback;
  }
}
```

**涉及文件**：
- `opencode-wps/main.js`
- `opencode-wps/taskpane.html`

---

### 2.2 空值/类型判断

**问题**：未判断文档对象是否存在，频繁 undefined 错误

**方案**：每个 API 调用前检查

```javascript
function checkDocument() {
  if (!WPS || !WPS.Application) {
    showToast('WPS 未就绪，请重启 WPS', 'error');
    return false;
  }
  const doc = WPS.Application.ActiveDocument;
  if (!doc) {
    showToast('请先打开文档', 'warning');
    return false;
  }
  return true;
}
```

**涉及文件**：
- `opencode-wps/main.js`

---

### 2.3 错误日志

**问题**：出错后无法定位

**方案**：
1. 添加 console.error 日志
2. 保留错误日志到 localStorage（仅保留最近 50 条）

```javascript
function logError(context, error) {
  const log = {
    time: new Date().toISOString(),
    context,
    message: error.message || String(error)
  };
  console.error('[ERROR]', log);
  // 保留到 localStorage
  const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
  logs.unshift(log);
  localStorage.setItem('error_logs', JSON.stringify(logs.slice(0, 50)));
}
```

---

### 2.4 网络请求重试

**问题**：API 请求失败无重试

**方案**：封装 fetch 添加重试逻辑

```javascript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

**涉及文件**：
- `opencode-wps/taskpane.html`

---

## 阶段三：代码规范与可维护性（低优先级）

### 3.1 统一命名规范

**问题**：命名不一致

**方案**：
- 变量/函数：小驼峰 `myVariable`, `myFunction`
- 常量：全大写下划线 `MAX_RETRIES`, `API_TIMEOUT`
- CSS 类：小写中划线 `.btn-primary`, `.chat-message`

**涉及文件**：全局

---

### 3.2 提取常量

**问题**：魔法值泛滥

**方案**：文件头部定义常量

```javascript
// opencode-wps/main.js
const CONSTANTS = {
  API_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  SSE_RECONNECT_DELAY: 3000,
  MAX_MESSAGE_LENGTH: 10000,
  DEFAULT_SESSION_NAME: '新对话'
};

// opencode-wps/taskpane.html
const UI_CONSTANTS = {
  TOAST_DURATION: 3000,
  LOADING_DELAY: 200,
  MAX_HISTORY: 100
};
```

---

### 3.3 工具函数模块化

**问题**：通用方法重复编写

**方案**：提取工具函数

```javascript
// opencode-wps/utils.js
const Utils = {
  debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  formatDate(date) {
    return new Date(date).toLocaleString('zh-CN');
  },

  truncate(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};
```

---

### 3.4 README 完善

**问题**：文档不完整

**方案**：补充以下内容

1. 环境要求
   - WPS 版本：12.1.0+
   - Node.js：18.0.0+
   - 操作系统：Windows 10/11

2. 快速开始
   ```bash
   npm install
   node install-addons.js
   # 重启 WPS
   ```

3. 功能清单
   - SSE 流式对话
   - Markdown 渲染
   - 多会话管理
   - MCP 工具调用
   - Agent 选择

4. 常见问题
   - 插件不显示
   - MCP 连接失败
   - 服务启动失败

---

## 实施顺序

| 阶段 | 优先级 | 预计工作量 | 风险 |
|------|--------|------------|------|
| 阶段一：安全修复 | 高 | 2h | 低 |
| 阶段二：健壮性修复 | 中 | 4h | 中 |
| 阶段三：规范与维护 | 低 | 6h | 低 |

---

## 进度跟踪

- [ ] 阶段一：安全修复
  - [ ] 1.1 输入过滤
  - [ ] 1.2 配置外置
  - [ ] 1.3 敏感操作确认
- [ ] 阶段二：健壮性修复
  - [ ] 2.1 全局异常捕获
  - [ ] 2.2 空值/类型判断
  - [ ] 2.3 错误日志
  - [ ] 2.4 网络请求重试
- [ ] 阶段三：规范与维护
  - [ ] 3.1 统一命名规范
  - [ ] 3.2 提取常量
  - [ ] 3.3 工具函数模块化
  - [ ] 3.4 README 完善