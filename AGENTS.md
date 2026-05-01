# AGENTS.md

## 项目概述
OpenCode WPS — OpenCode AI 的 WPS Office 插件，在 WPS 中嵌入 AI 对话侧边栏。

## 项目架构（重要！）

```
源文件（git 跟踪）              安装后（不被 git 跟踪）
─────────────────            ─────────────────────
opencode-wps/    ──安装──▶  %APPDATA%\kingsoft\wps\jsaddons\opencode-wps_\
wps-office-mcp/  ──安装──▶  ~/.config/opencode/opencode.json (MCP 配置)
skills/          ──安装──▶  ~/.opencode/skills/
agents/          ──安装──▶  ~/.config/opencode/agents/ + ~/.opencode/agents/
```

**规则：**
- ✅ 修改源文件，然后运行 `node install-addons.js` 同步
- ❌ 不要直接修改安装目录中的文件
- ❌ 不要让安装目录的文件"漂移"（和源文件不同步）

## 关键命令
```bash
node install-addons.js   # 一键安装全部组件（修改 skills/agents 后必须运行）
npm run build            # 编译 MCP 服务器 (cd wps-office-mcp && npm run build)
npm run mcp:install      # 安装 MCP 依赖
```

## 项目结构
```
opencode-wps/
├── opencode-wps/         # WPS JS 加载项 (main.js, taskpane.html, ribbon.xml)
├── wps-office-mcp/       # MCP 服务器 (TypeScript, 196 个工具)
├── skills/               # 4 个 OpenCode Skills (wps-excel/word/ppt/office)
│   └── README.md        # ⚠️ 必须先读：skills 修改流程
├── agents/               # 自定义 Agents (wps-expert + 3 个子 agents)
└── install-addons.js     # 一键安装脚本 (6 步)
```

## WPS Agents 功能

### Agents 定义位置
- 全局 agents：`~/.config/opencode/agents/` (不被 git 跟踪)
- 项目 agents：`.opencode/agents/` (如需要)

### 现有 Agents
| Agent | 角色 | 说明 |
|-------|------|------|
| wps-expert | primary | WPS Office 智能助手主 agent |
| wps-word | subagent | Word 文档处理专家 |
| wps-excel | subagent | Excel 数据处理专家 |
| wps-ppt | subagent | PPT 演示文稿专家 |

### 使用方式
1. 在 WPS 侧边栏底部点击 **Agent** 按钮选择
2. 消息中可用 `@wps-word`、`@wps-excel`、`@wps-ppt` 调用子 agents
3. 发送消息时会自动传递 `agent` 参数到 OpenCode API

### 修改 Agents
1. 修改 `~/.config/opencode/agents/` 下的 `.md` 文件
2. 重启 OpenCode 服务使配置生效
3. （可选）复制到 `.opencode/agents/` 实现项目级配置

## AI 编程助手注意事项

如果你是一个 AI 助手，正在修改本项目：
1. **修改 skills** → 改 `skills/` → 运行 `node install-addons.js` → git commit
2. **修改 MCP** → 改 `wps-office-mcp/src/` → `npm run build` → git commit
3. **修改 Agents** → 改 `~/.config/opencode/agents/` → 重启服务 → git commit
4. **重要：永远不要修改以下目录**（它们是安装产物，不是源文件）：
   - ❌ `~/.opencode/skills/` 或 `%USERPROFILE%\.opencode\skills\`
   - ❌ `%APPDATA%\kingsoft\wps\jsaddons\`
   - ❌ `~/.config/opencode/opencode.json`
5. **每次修改后**检查：`git status` 确保修改已提交

## Launcher 服务管理

OpenCode 通过 Launcher 进程管理自动启动：
- Launcher 监听：`http://127.0.0.1:14097`
- API 端点：
  - `GET /status` - 查看状态
  - `POST /start` - 启动服务 (body: `{"cwd": "目录"}`)
  - `POST /stop` - 停止服务

## 如何避免"改错目录"的问题

当 AI 要修改文件时，先问自己：
1. 这个文件在 `D:\code\opencode-wps\` 下吗？→ 是，继续
2. 这个文件是被 git 跟踪的吗？→ 用 `git ls-files <path>` 检查
3. 如果不在代码库但在用户目录 → 停止！这是安装产物，不是源文件

## 常见问题
1. MCP 连不上 → `cd wps-office-mcp && npm install && npm run build`
2. WPS 插件不显示 → 检查 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` 目录
3. OpenCode 服务未启动 → `schtasks /Run /TN "OpenCodeLauncher"` 或通过 Launcher API 启动
4. 文件路径 → 始终用绝对路径
5. WPS 必须运行才能进行 MCP 操作
6. Skills 不生效 → 检查是否运行了 `node install-addons.js` 同步
7. Agents 不显示 → 重启 OpenCode 服务让新 agents 生效

## 参考文档
- README.md — 完整项目文档
- skills/README.md — Skills 修改流程（必读！）
- wps-office-mcp/ — MCP 服务器源码和说明
