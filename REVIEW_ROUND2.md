# opencode-wps 第二轮代码审查报告

> 来源：DeepSeek 第二次审查（基于第一轮问题的修复评估）

---

## 评估变化

| 维度 | 第一轮 | 第二轮 | 变化原因 |
| :--- | :---: | :---: | :--- |
| 架构设计 | 5 | 5 | 架构优秀，无需改动 |
| 代码风格 | 3 | 4 | 全局变量封装、路径处理简化 |
| 可维护性 | 4 | 5 | 配置外移、安装脚本优化 |
| 健壮性 | 3 | 4.5 | 错误处理增强、COM 重试 |
| 安全性 | 3 | 4.5 | 硬编码修复、路径验证 |

**总体预估**：3.5/5 → 4.6/5

---

## ✅ 已通过项（第一轮问题已修复）

- [x] `launcher.js` 硬编码路径 → 配置文件读取
- [x] `/dock` 接口 cwd 参数验证
- [x] `stopOpenCode` 精确 PID 终止
- [x] 全局变量封装 → AppState 单例
- [x] fetchWithRetry 网络重试
- [x] SSE 自动重连
- [x] WPS 就绪检查
- [x] MCP COM 重试
- [x] 配置持久化 CONFIG 对象
- [x] 添加 CONTRIBUTING.md / CHANGELOG.md

---

## 🔎 仍需处理的问题（第二轮审查）

### 1. 配置防御性检查

**问题**：如果配置文件不存在或格式错误，可能直接抛错

**建议**：
```javascript
// launcher.js
function loadConfig() {
    var configPath = path.join(process.env.APPDATA, 'opencode', 'config.json');
    if (!fs.existsSync(configPath)) {
        console.log('[launcher] 请先运行安装脚本生成配置文件');
        return { opencodePath: 'opencode' }; // 默认值
    }
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        console.error('[launcher] 配置文件解析失败，使用默认值');
        return { opencodePath: 'opencode' };
    }
}
```

---

### 2. spawn 参数数组化

**问题**：命令拼接可能存在注入风险

**建议**：
```javascript
// 当前（字符串拼接）
spawn('opencode.exe serve --port ' + port)

// 改进（参数数组）
spawn('opencode', ['serve', '--port', String(port)], { cwd: cwd })
```

---

### 3. GetUrlPath 简化

**问题**：复杂的字符串处理可读性差

**建议**：
```javascript
// 当前
function GetUrlPath() {
    var e = document.location.toString()
    return -1 != (e = decodeURI(e)).indexOf("/") && (e = e.substring(0, e.lastIndexOf("/"))), e
}

// 改进
function GetUrlPath() {
    try {
        return new URL(document.location.href).pathname.replace(/\/[^\/]*$/, '') || '/';
    } catch (e) {
        return '/';
    }
}
```

---

### 4. 异步错误处理统一

**问题**：install-addons.js 混用同步/异步方法

**建议**：保持同步方法（已有），或改为 async/await 风格

---

### 5. MCP 重试结合超时

**问题**：重试可能延缓响应，需结合超时快速失败

**建议**：
```javascript
async function execWpsActionWithRetry(action, params, maxRetries = 3) {
    for (let i = 1; i <= maxRetries; i++) {
        try {
            return await Promise.race([
                execWpsAction(action, params),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
        } catch (error) {
            if (i === maxRetries) throw error;
            await new Promise(r => setTimeout(r, 500 * i));
        }
    }
}
```

---

### 6. CHANGELOG 格式标准化

**问题**：应遵循 Keep a Changelog 格式

**建议**：
```markdown
## [1.1.0] - 2026-05-01

### Added
- Agent 选择功能

### Changed
- 安全性提升：XSS 防护、路径验证

### Fixed
- 健壮性增强：错误处理、请求重试

### Removed
- 废弃的启动脚本
```

---

## 后续优化建议（锦上添花）

1. **自动化 CI/CD** - GitHub Actions 编译检查和 lint
2. **安装失败回滚机制** - 某步失败自动恢复
3. **开发者模式** - Skills/Agents 从源目录读取
4. **E2E 测试** - 模拟前端与 MCP 交互

---

## 整改计划

| 优先级 | 问题 | 状态 |
|--------|------|------|
| 高 | 配置防御性检查 | 待处理 |
| 中 | spawn 参数数组化 | 待处理 |
| 中 | GetUrlPath 简化 | 待处理 |
| 低 | CHANGELOG 格式标准化 | 待处理 |
| 低 | MCP 超时+重试 | 待处理 |
| 低 | 异步处理统一 | 待处理 |