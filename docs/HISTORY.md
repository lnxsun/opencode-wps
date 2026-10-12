# 演进历史与致谢

> 📌 **归档/设计文档声明**：本文档为历史归档与设计依据，其中的治理规则编号仅供参考；**现行规则清单以 `.opencode/plugins/governance.js` 与 `skills/wps-proofread/SKILL.md` 为单一事实源**（已删除的规则不会再出现在现行指令中）。

> 🏠 项目首页（README）见 [../README.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/README.md)；本文档为 README 演进史的详细展开。

## 演进历程

本项目经历了以下演进过程：

1. **wpsjs 起步** — 按 WPS 官方的 JS 加载项文档实在开发不出来，最后从 [wpsjs](https://github.com/laihaojie/wpsjs) 项目起步，才成功开发出 WPS 插件
2. **iflow 时代** — 最初借鉴 [iflow-for-obsidian](https://github.com/junjie-yan/iflow-for-obsidian) 的方式在 WPS 中调用 [iflow cli](https://github.com/iflow-ai/iflow-cli)，通过 4 个 skills + 1 个 MCP（来自 [wps-skills](https://github.com/lc2panda/wps-skills)）及其关键的 COM 桥接插件，实现了在侧边栏通过对话所见即所得地实时操作文档。开发已经完成，但 iflow cli 官方执意关闭，只能另寻出路
3. **转向 OpenCode** — 转到 OpenCode 后，最初想借鉴 [opencode-obsidian](https://github.com/mtymek/opencode-obsidian) 的方式直接调用官方的 opencode web 界面，但反复尝试后发现 WPS 内置 Chromium 停留在 2022 年的 103 版本，而官方 web 版需要 Chrome 130+，根本不兼容
4. **自建 Chat UI** — 既然官方 web 界面走不通，就基于 OpenCode 的 REST API + SSE 自建了 Chat UI，直接在 WPS 侧边栏中渲染 AI 对话
5. **解决启动问题** — 经历了 `OAAssist.ShellExecute`（触发 WPS 安全警告）、VBS 脚本、手动命令等多种方案后，最终采用 Launcher 进程管理服务 + 计划任务自动启动 Launcher，无需 bat/vbs/手动操作
6. **功能整合** — 将两个独立的旧插件（`wps-claude-addon` 和 `wps-claude-assistant`）合并到统一的 `opencode-wps` 加载项中
7. **迁移到 OpenCode 架构** — 从 Claude Desktop 架构完全迁移到 OpenCode 架构（MCP 配置格式、Skills 目录、插件机制等）
8. **Markdown 渲染** — 重写 `renderMarkdown()` 函数，支持代码块、表格、列表、引用等完整 Markdown 语法
9. **Gateway 按需加载** — 将全部工具一次性注册改为 Gateway 模式（启动时仅注册内置工具 + 2 个 Gateway 工具，COM Actions 按需发现），大幅减少 MCP 启动耗时、节省 token
10. **特色功能落地** — 根据实际工作需要增加了文档批量填写（模板自动填值 + 修订追踪）和长文档分批校对（铁律 3.0 严格逐批闭环）功能
11. **Hooks 执行治理** — 在实际使用中逐步增加 governance.js hooks 拦截（G2-G7 + P1-P4 + T1-T11，数量以源码为准），解决 AI 随机执行、跳过基础校对、编造修复等运行问题，形成 before 拦截 + after 状态追踪的防作弊闭环
12. **Linux 支持** — 新增 Linux 版插件（`opencode-wps-linux/`，独立目录反向轮询桥）与安装脚本（`install-addons-linux.js`）、Launcher（`launcher-linux.js`）
13. **文档体系重构** — README 精简为门户，详细内容子文档化（安装/使用/架构/功能/历史），docs/README.md 成为完整文档中心索引（Issue #100）

## 致谢

本项目站在以下项目的肩膀上，深表感谢：

- [wpsjs](https://github.com/laihaojie/wpsjs) — 按 WPS 官方文档实在开发不出来，最后从 wpsjs 起步才成功开发出 WPS 插件
- [wps-skills](https://github.com/lc2panda/wps-skills) — 侧边栏通过对话所见即所得地实时操作文档，靠的是 wps-skills 的 skills + MCP（wps-office MCP）及其关键的 COM 桥接插件
- [iflow-for-obsidian](https://github.com/junjie-yan/iflow-for-obsidian) — 最初的实现借鉴了 iflow-for-obsidian 在 WPS 中调用 iflow cli 的方式
- [iflow cli](https://github.com/iflow-ai/iflow-cli) — 一切开始的地方，太遗憾官方执意关闭了 iflow cli
- [opencode-obsidian](https://github.com/mtymek/opencode-obsidian) — 转到 OpenCode 后本来想借鉴其方式直接调用官方 web 界面，但发现 WPS 内置 Chromium 103 不兼容官方 web 版（需 Chrome 130+）
- [opencode](https://github.com/anomalyco/opencode) — 最后落脚的地方
