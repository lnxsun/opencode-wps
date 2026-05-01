# opencode-wps 整改方案（整合版）

> 基于豆包 + DeepSeek 代码评审报告的改进计划

---

## 一、问题汇总（17 项）

### 严重问题（高优先级，5 项）

| # | 问题 | 来源 | 位置 |
|---|------|------|------|
| 1 | **XSS 漏洞** - 用户消息直接插入 DOM | 豆包 | taskpane.html |
| 2 | **硬编码路径** - launcher.js 中 OpenCode 路径写死 | DeepSeek | launcher.js:findOpenCodeBin |
| 3 | **路径遍历风险** - /dock 接口 cwd 参数未验证 | DeepSeek | launcher.js:/dock |
| 4 | **暴力进程终止** - taskkill 误杀其他 opencode.exe | DeepSeek | launcher.js:stopOpenCode |
| 5 | **API 地址硬编码** - http://127.0.0.1:14096 泄漏 | 豆包 | taskpane.html:309 |

### 中等问题（中优先级，7 项）

| # | 问题 | 来源 | 位置 |
|---|------|------|------|
| 6 | **全局变量污染** - 大量 var 声明 | 豆包+DeepSeek | main.js |
| 7 | **错误处理不足** - try-catch 常为空或仅打印 | 豆包+DeepSeek | main.js, taskpane.html |
| 8 | **无请求重试** - API 失败无自动重试 | 豆包 | taskpane.html |
| 9 | **SSE 无重连** - 连接断开后不自动重连 | 豆包 | taskpane.html:connectSSE |
| 10 | **无空值判断** - WPS 对象直接使用 | 豆包 | main.js |
| 11 | **配置无持久化** - 每次重启恢复默认 | 豆包 | taskpane.html |
| 12 | **COM 异常处理** - MCP 调用无重试机制 | DeepSeek | wps-office-mcp/client/ |

### 低优先级问题（5 项）

| # | 问题 | 来源 | 位置 |
|---|------|------|------|
| 13 | **命名不统一** - 混用大小写、下划线 | 豆包 | 全局 |
| 14 | **魔法值泛滥** - 固定数字/字符串散落 | 豆包 | taskpane.html |
| 15 | **注释风格不统一** - JSDoc vs 自定义格式 | DeepSeek | wps-office-mcp/ |
| 16 | **无自动化测试** | DeepSeek | wps-office-mcp/ |
| 17 | **无 CONTRIBUTING.md/CHANGELOG.md** | DeepSeek | 根目录 |

---

## 二、文件结构概览

```
opencode-wps/opencode-wps/
├── taskpane.html     # 主 UI 文件（1221 行），包含所有 JS 逻辑
├── main.js           # WPS Ribbon 回调、状态管理
├── launcher.js       # Launcher 进程
├── serve.js          # 本地服务
├── index.html        # 入口页
├── opencode-proxy.js # 代理（未使用）
└── _sse_test.js      # 测试文件

opencode-wps/wps-office-mcp/
├── src/
│   ├── client/       # COM 桥接客户端
│   ├── server/       # MCP 服务器
│   └── tools/        # 工具定义（excel, word, ppt, common）
└── scripts/
    └── wps-com.ps1   # PowerShell COM 调用脚本
```

**关键问题位置**：
- XSS 漏洞：taskpane.html 消息渲染部分
- 硬编码路径：launcher.js:findOpenCodeBin (~第 30-50 行)
- 路径遍历：launcher.js:/dock (~第 100-120 行)
- 暴力终止：launcher.js:stopOpenCode (~第 150-170 行)
- API 地址：taskpane.html:309

---

## 三、整改计划（3 阶段）

### 阶段一：安全修复（高优先级）

#### 1.1 XSS 防护 - 输入过滤

**问题**：用户消息直接插入 DOM，存在 XSS 风险

**位置**：taskpane.html 消息渲染部分

**目标代码**：
```javascript
function safeInput(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[<>&"']/g, function(c) {
    var map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });
}
```

**修改点**：
1. 在变量定义区域后添加 safeInput 函数
2. 找到消息渲染位置，用 safeInput 包装用户输入

---

#### 1.2 配置外置 - API 地址

**问题**：API 地址硬编码在第 309 行

**位置**：taskpane.html:309

**目标代码**：
```javascript
var API_BASE = (function() {
  var stored = getPS('opencode_api_url');
  return stored || 'http://127.0.0.1:14096';
})();

function saveApiUrl(url) {
  window.Application.PluginStorage.setItem('opencode_api_url', url);
}
```

---

#### 1.3 Launcher 路径修复

**问题**：OpenCode 路径硬编码，不可移植

**位置**：launcher.js:findOpenCodeBin (~第 30-50 行)

**目标代码**：
```javascript
function findOpenCodeBin() {
  // 优先从配置读取
  var configPath = path.join(process.env.APPDATA, 'opencode', 'config.json');
  if (fs.existsSync(configPath)) {
    var config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.opencodePath && fs.existsSync(config.opencodePath)) {
      return config.opencodePath;
    }
  }
  // 回退到常见路径
  var paths = [
    path.join(process.env.USERPROFILE, '.trae-cn', 'bin', 'opencode.exe'),
    path.join(process.env.LOCALAPPDATA, 'Programs', 'opencode', 'opencode.exe'),
    'opencode'  // PATH 中的 opencode
  ];
  for (var i = 0; i < paths.length; i++) {
    if (paths[i] === 'opencode' || fs.existsSync(paths[i])) {
      return paths[i];
    }
  }
  return null;
}
```

---

#### 1.4 路径遍历防护

**问题**：/dock 接口 cwd 参数未验证

**位置**：launcher.js:/dock (~第 100-120 行)

**目标代码**：
```javascript
app.post('/dock', function(req, res) {
  var rawCwd = req.body.cwd || '';
  // 验证和规范化路径
  var cwd = path.resolve(rawCwd);
  // 防止路径遍历
  if (!cwd.startsWith(process.env.USERPROFILE) && !cwd.startsWith('C:\\')) {
    return res.status(400).json({ error: '无效的工作目录' });
  }
  // ... 启动逻辑
});
```

---

#### 1.5 进程管理优化

**问题**：taskkill 误杀其他 opencode.exe 进程

**位置**：launcher.js:stopOpenCode (~第 150-170 行)

**目标代码**：
```javascript
var childProcess = null;

function startOpenCode(cwd) {
  // ... 启动逻辑
  childProcess = spawn('opencode', ['serve'], {
    cwd: cwd,
    detached: true,
    stdio: 'ignore'
  });
  childProcess.unref();
  // 记录 PID
  fs.writeFileSync(pidFile, childProcess.pid.toString());
}

function stopOpenCode() {
  if (childProcess && !childProcess.killed) {
    childProcess.kill();  // 只杀子进程
    return;
  }
  // 回退：读取 PID 文件精确终止
  if (fs.existsSync(pidFile)) {
    var pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));
    try { process.kill(pid); } catch(e) {}
  }
  // 移除暴力 taskkill
}
```

---

### 阶段二：健壮性修复（中优先级）

#### 2.1 全局异常捕获

**问题**：JS 错误无捕获，API 失败导致页面崩溃

**位置**：taskpane.html

**目标代码**：
```javascript
window.onerror = function(msg, url, line, col, error) {
  logError('Global', { msg: msg, url: url, line: line, col: col, error: error?.message });
  showToast('操作失败，请重试', 'error');
  return true;
};

window.onunhandledrejection = function(event) {
  logError('UnhandledPromise', { reason: event.reason });
  showToast('网络请求失败', 'error');
};

function logError(context, data) {
  var log = { time: new Date().toISOString(), context: context, data: data };
  console.error('[ERROR]', log);
}
```

---

#### 2.2 网络请求重试

**问题**：API 请求失败无重试

**位置**：taskpane.html ~第 800-900 行

**目标代码**：
```javascript
async function fetchWithRetry(url, options, maxRetries) {
  maxRetries = maxRetries || 3;
  var lastError;
  for (var i = 0; i < maxRetries; i++) {
    try {
      var resp = await fetch(url, options);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp;
    } catch (e) {
      lastError = e;
      logError('fetchRetry', { url: url, attempt: i + 1, error: e.message });
      if (i < maxRetries - 1) await new Promise(function(r) { setTimeout(r, 1000 * (i + 1)); });
    }
  }
  throw lastError;
}
```

---

#### 2.3 SSE 自动重连

**问题**：SSE 断开后不重连

**位置**：taskpane.html:connectSSE

**目标代码**：
```javascript
function connectSSE() {
  if (SSE) SSE.close();
  var url = API_BASE + '/v1/chat/completions?sessionId=' + SESSION_ID;
  SSE = new EventSource(url);

  SSE.onerror = function() {
    console.error('SSE error');
    CONNECTED = false;
    updateConnectionStatus();
    SSE.close();
    setTimeout(connectSSE, 3000);  // 3 秒后重连
  };
  // ... 其余回调
}
```

---

#### 2.4 WPS 对象空值判断

**问题**：WPS 对象直接使用，无空值检查

**位置**：main.js

**目标代码**：
```javascript
function checkWpsReady() {
  try {
    if (!window.WPS || !window.WPS.Application) {
      console.error('WPS 未就绪');
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
      console.warn('请先打开文档');
      return false;
    }
    return doc;
  } catch (e) {
    logError('checkDocument', e);
    return false;
  }
}
```

---

#### 2.5 MCP COM 异常处理

**问题**：COM 调用无重试机制

**位置**：wps-office-mcp/src/client/

**目标代码**：
```javascript
async function callWpsApiWithRetry(command, maxRetries) {
  maxRetries = maxRetries || 3;
  for (var i = 0; i < maxRetries; i++) {
    try {
      return await callWpsApi(command);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(function(r) { setTimeout(r, 500); });
    }
  }
}
```

---

#### 2.6 配置持久化

**问题**：配置每次重启恢复默认

**位置**：taskpane.html

**目标代码**：
```javascript
var CONFIG = {
  get apiUrl() { return getPS('opencode_api_url') || 'http://127.0.0.1:14096'; },
  set apiUrl(val) { window.Application.PluginStorage.setItem('opencode_api_url', val); },
  get cwd() { return getPS('opencode_cwd') || ''; },
  set cwd(val) { window.Application.PluginStorage.setItem('opencode_cwd', val); }
};
```

---

#### 2.7 全局变量封装

**问题**：main.js 大量全局变量

**位置**：main.js

**目标代码**：
```javascript
var AppState = {
  port: null,
  state: 'disconnected',
  cwd: '',
  init: function() {
    this.port = getPS('opencode_port') || 14096;
    this.cwd = getPS('opencode_cwd') || '';
  }
};

function getOpenCodePort() { return AppState.port; }
function setOpenCodeState(state) { AppState.state = state; }
```

---

### 阶段三：代码规范与文档（低优先级）

#### 3.1 提取常量

**问题**：魔法值泛滥

**位置**：taskpane.html

**目标代码**：
```javascript
var CONSTANTS = {
  API_DEFAULT_URL: 'http://127.0.0.1:14096',
  API_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  SSE_RECONNECT_DELAY: 3000,
  MAX_MESSAGE_LENGTH: 10000,
  TOAST_DURATION: 3000,
  DEFAULT_SESSION_NAME: '新对话'
};
```

---

#### 3.2 统一命名规范

**问题**：命名不一致

**方案**：
- 变量/函数：小驼峰
- 常量：全大写下划线
- CSS 类：小写中划线

**工具**：使用 IDE 重构 (VS Code 重命名)

---

#### 3.3 注释风格统一

**问题**：JSDoc vs 自定义格式混用

**位置**：wps-office-mcp/

**方案**：将自定义注释转换为标准 JSDoc

---

#### 3.4 新增文档

**缺失**：CONTRIBUTING.md, CHANGELOG.md

**方案**：创建这两个文件

---

#### 3.5 自动化测试

**问题**：无测试

**位置**：wps-office-mcp/

**方案**：引入 Jest 单元测试

---

## 四、实施顺序与时间估计

| 序号 | 任务 | 优先级 | 文件 | 预计工时 |
|------|------|--------|------|----------|
| 1 | XSS 防护 safeInput | 高 | taskpane.html | 0.5h |
| 2 | 配置外置 API | 高 | taskpane.html | 0.5h |
| 3 | Launcher 路径修复 | 高 | launcher.js | 1h |
| 4 | 路径遍历防护 | 高 | launcher.js | 0.5h |
| 5 | 进程管理优化 | 高 | launcher.js | 0.5h |
| 6 | 全局异常捕获 | 中 | taskpane.html | 0.5h |
| 7 | 网络请求重试 | 中 | taskpane.html | 1h |
| 8 | SSE 自动重连 | 中 | taskpane.html | 0.5h |
| 9 | WPS 空值判断 | 中 | main.js | 1h |
| 10 | MCP COM 重试 | 中 | wps-office-mcp/ | 1h |
| 11 | 配置持久化 | 中 | taskpane.html | 0.5h |
| 12 | 全局变量封装 | 中 | main.js | 1h |
| 13 | 提取常量 | 低 | taskpane.html | 0.5h |
| 14 | 命名规范统一 | 低 | 全局 | 2h |
| 15 | 注释风格统一 | 低 | wps-office-mcp/ | 1h |
| 16 | 新增文档 | 低 | 根目录 | 1h |
| 17 | 自动化测试 | 低 | wps-office-mcp/ | 4h |

**总计**：约 16 小时

---

## 五、进度跟踪

### 阶段一：安全修复
- [ ] 1.1 XSS 防护 - safeInput 函数
- [ ] 1.2 配置外置 - API 地址持久化
- [ ] 1.3 Launcher 路径 - 配置文件读取
- [ ] 1.4 路径遍历 - cwd 参数验证
- [ ] 1.5 进程管理 - PID 精确终止

### 阶段二：健壮性修复
- [ ] 2.1 全局异常捕获 - window.onerror
- [ ] 2.2 网络请求重试 - fetchWithRetry
- [ ] 2.3 SSE 自动重连 - connectSSE 重连
- [ ] 2.4 WPS 空值判断 - checkWpsReady/checkDocument
- [ ] 2.5 MCP COM 重试 - callWpsApiWithRetry
- [ ] 2.6 配置持久化 - CONFIG 对象
- [ ] 2.7 全局变量封装 - AppState 单例

### 阶段三：规范与文档
- [ ] 3.1 提取常量 - CONSTANTS 对象
- [ ] 3.2 命名规范 - 小驼峰统一
- [ ] 3.3 注释风格 - JSDoc 统一
- [ ] 3.4 新增文档 - CONTRIBUTING.md/CHANGELOG.md
- [ ] 3.5 自动化测试 - Jest 集成