# AGENTS.md

## 项目概述
OpenCode WPS — OpenCode AI 的 WPS Office 插件，在 WPS 中嵌入 AI 对话侧边栏。

## 关键命令
```bash
node install-addons.js   # 一键安装全部组件
npm run build            # 编译 MCP 服务器 (cd wps-office-mcp && npm run build)
npm run mcp:install      # 安装 MCP 依赖
```

## 项目结构
```
opencode-wps/
├── opencode-wps/         # WPS JS 加载项 (main.js, taskpane.html, ribbon.xml)
├── wps-office-mcp/       # MCP 服务器 (TypeScript, 196 个工具)
├── skills/               # 4 个 OpenCode Skills (wps-excel/word/ppt/office)
└── install-addons.js     # 一键安装脚本 (6 步)
```

## 常见问题
1. MCP 连不上 → `cd wps-office-mcp && npm install && npm run build`
2. WPS 插件不显示 → 检查 `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` 目录
3. OpenCode 服务未启动 → `schtasks /Run /TN "OpenCodeServer"`
4. 文件路径 → 始终用绝对路径
5. WPS 必须运行才能进行 MCP 操作

## 参考文档
- README.md — 完整项目文档
- wps-office-mcp/ — MCP 服务器源码和说明
