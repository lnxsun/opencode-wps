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
├── wps-office-mcp/       # MCP 服务器 (TypeScript, 240 个 COM Actions + 12 内置工具)
├── skills/               # 5 个 OpenCode Skills (wps-excel/word/ppt/office/proofread)
│   └── README.md        # ⚠️ 必须先读：skills 修改流程
├── agents/               # 自定义 Agents (wps-expert + 3 个子 agents)
├── .opencode/
│   ├── plugins/
│   │   └── governance.js # ⚙️ 执行治理插件（G1-G7 + P1-P16 + T1-T11，代码层强制执行）
│   └── package.json
└── install-addons.js     # 一键安装脚本 (7 步)
```

## WPS Agents 功能

### Agents 定义位置
- 全局 agents：`~/.config/opencode/agents/` (不被 git 跟踪)
- 项目 agents：`.opencode/agents/` (如需要)

### 现有 Agents
| Agent | 角色 | 说明 |
|-------|------|------|
| wps | primary | WPS Office 综合助手（OpenCode 默认 agent） |
| wps-expert | subagent | WPS Office 智能助手，综合处理 Word/Excel/PPT |
| wps-word | subagent | Word 文档处理专家 |
| wps-excel | subagent | Excel 数据处理专家 |
| wps-ppt | subagent | PPT 演示文稿专家 |

### 使用方式
1. 在消息中使用 `@wps-expert`、`@wps-word`、`@wps-excel`、`@wps-ppt` 调用子 agents
2. 消息中自动传递 `agent` 参数到 OpenCode API
3. 默认使用 wps 主 agent（无需 @ 前缀）

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

## 执行治理插件

`.opencode/plugins/governance.js` 是项目的执行治理核心，使用 OpenCode Plugin Hooks 在运行时拦截所有 MCP 工具调用：

### 通用规则（G1-G7，始终生效）
- **G1 网关强制**：6 个双路径工具必须走 `wps_office_execute` 网关
- **G2 wps_execute_method 白名单**：仅允许白名单 API 通过
- **G3 读前必写**：写操作前必须先读取文档状态
- **G4 破坏性确认**：删除/清除操作需显式传 `confirm: true`
- **G5 文件路径安全**：禁止 `..` 路径穿越
- **G6 密码保护**：保护/取消保护密码脱敏
- **G7 参数范围校验**：行号/索引自动 ≥ 1

### 校对规则（P1-P16，分批校对时生效）
- **P1-P11**：批次大小 ≤200、连续性、startOffset 匹配、修订模式、proofreadBasic 必调、P14(P13) 确认前必须 proofread、P15 无 issue 限制 AI 修复、P16 替换内容与已知 issue 交叉校验

### 模板填写规则（T1-T11，模板填写时生效）
- 填写前评估文档、分批 ≤200 段、开启修订模式、禁止编造字段、跳过签字字段、所有填值加下划线

### 修改治理插件
1. 修改 `.opencode/plugins/governance.js`
2. 运行 `node install-addons.js` 同步到 `~/.config/opencode/plugins/`
3. 重启 OpenCode 服务

## 参考文档
- README.md — 完整项目文档
- skills/README.md — Skills 修改流程（必读！）
- wps-office-mcp/ — MCP 服务器源码和说明
