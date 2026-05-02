# 贡献指南

欢迎为 opencode-wps 贡献代码和文档！

---

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境](#开发环境)
- [项目结构](#项目结构)
- [开发流程](#开发流程)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [PR 描述模板](#pr-描述模板)
- [测试](#测试)
- [文档贡献](#文档贡献)
- [常见问题](#常见问题)
- [联系方式](#联系方式)

---

## 行为准则

请阅读并遵守我们的 [Code of Conduct](./CODE_OF_CONDUCT.md)（行为准则），确保社区友好包容。

---

## 如何贡献

### 1. 报告 Bug

如果你发现了 Bug，请通过 GitHub Issues 报告：

1. 搜索现有 Issue，避免重复
2. 使用 Bug 报告模板，提供：
   - 复现步骤
   - 期望行为 vs 实际行为
   - 环境信息（WPS 版本、OpenCode 版本等）
   - 相关日志或截图

### 2. 提出功能建议

1. 搜索现有 Feature Request
2. 使用 Feature Request 模板，说明：
   - 你的使用场景
   - 期望的解决方案
   - 可能的替代方案

### 3. 提交代码

见下方 [开发流程](#开发流程) 章节。

---

## 开发环境

| 要求 | 版本 |
|------|------|
| 操作系统 | Windows 10/11 |
| WPS Office | 12.1.0+ |
| Node.js | 18.0.0+ |

---

## 项目结构

```
opencode-wps/
├── opencode-wps/      # WPS JS 插件
├── wps-office-mcp/   # MCP 服务器 (TypeScript)
├── skills/           # OpenCode Skills
├── agents/           # OpenCode Agents
├── tests/            # 测试文件
├── docs/             # 文档
└── install-addons.js # 安装脚本
```

---

## 开发流程

### 1. 本地开发

```bash
# 1. Fork 仓库
# 2. 克隆到本地
git clone https://github.com/your-username/opencode-wps.git
cd opencode-wps

# 3. 安装依赖
cd wps-office-mcp
npm install
npm run build
cd ..

# 4. 安装插件
node install-addons.js

# 5. 重启 WPS Office
```

### 2. 创建功能分支

```bash
git checkout -b feat/your-feature
```

### 3. 修改代码

- **修改 skills**: 编辑 `skills/` 目录，运行 `node install-addons.js` 同步
- **修改 agents**: 编辑 `agents/` 目录或 `~/.config/opencode/agents/`
- **修改 MCP**: 编辑 `wps-office-mcp/src/`，然后 `npm run build`
- **修改插件**: 编辑 `opencode-wps/` 目录下的 JS/HTML 文件

### 4. 提交并推送

```bash
git commit -m "feat: 添加新功能"
git push origin feat/your-feature
```

### 5. 创建 Pull Request

---

## 代码规范

- **JavaScript**: 使用 ES5 语法（兼容 WPS 内置浏览器 Chrome 103）
  - 使用 `var` 而非 `let/const`
  - 使用 `function` 而非箭头函数
  - 使用回调而非 async/await
  - 使用 `XMLHttpRequest` 而非 `fetch`
- **TypeScript**: 启用 strict 模式
- **命名**: 使用小驼峰命名
- **注释**: 使用 JSDoc 风格
- **代码格式**: 使用 Prettier（`npm run format`）

---

## 提交规范

项目使用 **Conventional Commits**：

```
<type>(<scope>): <subject>

<body>

<footer>
```

| type | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| docs | 文档更新 |
| style | 代码格式调整 |
| refactor | 重构（无功能变化） |
| test | 测试相关 |
| chore | 构建/工具更新 |

### 示例

```bash
git commit -m "feat(agent): 添加 Agent 选择功能"
git commit -m "fix(security): 修复 XSS 漏洞"
git commit -m "docs: 更新 README"
git commit -m "feat(mcp): 添加 Excel 图表创建工具"
```

---

## PR 描述模板

```markdown
## 描述
简要说明这个 PR 解决的问题

## 变更内容
- 变更 1
- 变更 2

## 测试
- [ ] 单元测试通过
- [ ] 手动测试通过

## 截图（如适用）
```

---

## 测试

```bash
# 运行单元测试
node tests/security.test.js
node tests/utils.test.js
node tests/launcher.test.js

# 运行 MCP 测试
npm run mcp:test
```

---

## 文档贡献

文档位于 `docs/` 目录，欢迎：

- 修正错别字
- 补充内容
- 翻译文档
- 添加新文档

文档列表：

| 文档 | 说明 |
|------|------|
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | 本文件 |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 问题排查与避坑指南 |
| [SECURITY.md](./SECURITY.md) | 安全模型与注意事项 |
| [OPENCODE_API.md](./OPENCODE_API.md) | OpenCode API |
| [WPS_COM_API.md](./WPS_COM_API.md) | WPS COM API |
| [WPS_COM_PS1.md](./WPS_COM_PS1.md) | wps-com.ps1 解析 |
| [WPSJS_DEVELOPMENT.md](./WPSJS_DEVELOPMENT.md) | WPS JS 插件开发指南 |
| [MCP.md](./MCP.md) | MCP 服务器说明 |
| [INSTALL_SCRIPT.md](./INSTALL_SCRIPT.md) | 安装脚本说明 |
| [SKILLS.md](./SKILLS.md) | Skills 说明 |

---

## 常见问题

### 插件不显示

- 检查 WPS 版本是否 >= 12.1.0
- 重启 WPS Office
- 运行 `node install-addons.js` 重新安装

### MCP 连接失败

- 检查 OpenCode 服务是否启动
- 检查端口 14096 是否被占用
- 查看 `~/.config/opencode/opencode.json` 配置

### 服务启动失败

- 检查 Launcher 是否运行：`schtasks /Query /TN "OpenCodeLauncher"`
- 手动启动：`schtasks /Run /TN "OpenCodeLauncher"`

---

## 联系方式

- GitHub Issues: 报告 Bug 和问题
- GitHub Discussions: 提问和讨论
- GitHub Releases: 查看公告

---

感谢你的贡献！
