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
```

**规则：**
- ✅ 修改源文件，然后运行 `node install-addons.js` 同步
- ❌ 不要直接修改安装目录中的文件
- ❌ 不要让安装目录的文件"漂移"（和源文件不同步）

## 关键命令
```bash
node install-addons.js   # 一键安装全部组件（修改 skills 后必须运行）
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
└── install-addons.js     # 一键安装脚本 (6 步)
```

## AI 编程助手注意事项

如果你是一个 AI 助手，正在修改本项目：
1. **修改 skills** → 改 `skills/` → 运行 `node install-addons.js` → git commit
2. **修改 MCP** → 改 `wps-office-mcp/src/` → `npm run build` → git commit
3. **不要**直接修改用户目录（`~/.opencode/`、`%APPDATA%\kingsoft\wps\jsaddons\`）
4. **每次修改后**检查：`git status` 确保修改已提交

## 常见问题
1. MCP 连不上 → `cd wps-office-mcp && npm install && npm run build`
2. WPS 插件不显示 → 检查 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` 目录
3. OpenCode 服务未启动 → `schtasks /Run /TN "OpenCodeServer"`
4. 文件路径 → 始终用绝对路径
5. WPS 必须运行才能进行 MCP 操作
6. Skills 不生效 → 检查是否运行了 `node install-addons.js` 同步

## 参考文档
- README.md — 完整项目文档
- skills/README.md — Skills 修改流程（必读！）
- wps-office-mcp/ — MCP 服务器源码和说明
