# 贡献指南

欢迎为 opencode-wps 贡献代码！

## 开发环境

- **操作系统**：Windows 10/11
- **WPS Office**：12.1.0+
- **Node.js**：18.0.0+

## 项目结构

```
opencode-wps/
├── opencode-wps/      # WPS JS 插件
├── wps-office-mcp/   # MCP 服务器 (TypeScript)
├── skills/           # OpenCode Skills
├── agents/           # OpenCode Agents
├── tests/            # 测试文件
└── install-addons.js # 安装脚本
```

## 开发流程

### 1. 本地开发

```bash
# 克隆仓库
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps

# 安装依赖
cd wps-office-mcp
npm install
npm run build
cd ..

# 安装插件
node install-addons.js

# 重启 WPS Office
```

### 2. 修改代码

- **修改 skills**: 编辑 `skills/` 目录，运行 `node install-addons.js` 同步
- **修改 agents**: 编辑 `agents/` 目录或 `~/.config/opencode/agents/`
- **修改 MCP**: 编辑 `wps-office-mcp/src/`，然后 `npm run build`

### 3. 测试

```bash
# 运行单元测试
node tests/security.test.js
node tests/utils.test.js
node tests/launcher.test.js
```

## 代码规范

- **JavaScript**: 使用小驼峰命名
- **TypeScript**: 遵循 TSLint 规则
- **注释**: 使用 JSDoc 风格

## 提交规范

1. 创建功能分支：`git checkout -b feature/your-feature`
2. 提交更改：`git commit -m "feat: 添加新功能"`
3. 推送分支：`git push origin feature/your-feature`
4. 创建 Pull Request

## 问题反馈

- 通过 GitHub Issues 报告 bug
- 通过 GitHub Discussions 提问

## 许可证

MIT License