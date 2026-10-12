# OpenCode WPS 项目文档

本目录是项目的**完整文档中心**。按「使用 / 开发 / 平台专题 / 内部参考」四象限组织，每份文档均为独立主题，互不重复、互相引用。

> 🏠 项目首页（README）见 [../README.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/README.md)。

---

## 🧭 使用指南（面向安装使用用户）

| 文档 | 说明 |
|------|------|
| [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md) | **三平台安装指南**（Win/Mac/Linux 完整步骤、路径速查、卸载） |
| [USAGE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/USAGE.md) | **Wiki 级使用手册**（快速上手、完整对话操作、Agents 详解、场景操作、服务管理、配置参考） |
| [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md) | 问题排查与避坑指南 |
| [cnbcool-codewiki-platform-feedback.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/cnbcool-codewiki-platform-feedback.md) | CNB 平台反馈单：codewiki 插件 LLM 接入认证缺陷（供平台侧修复，Issue #117） |
| [FEATURES.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/FEATURES.md) | 特色功能详解（模板填值 + 校对铁律 3.0） |

## 🔧 开发贡献（面向开发者/贡献者）

| 文档 | 说明 |
|------|------|
| [DEVELOPMENT_GUIDE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/DEVELOPMENT_GUIDE.md) | **Wiki 级开发手册**（环境/项目结构/五大模块开发/跨平台共享层/流程/规范/测试/CI/CD/二次开发） |
| [CODE_REVIEW_GUIDE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/CODE_REVIEW_GUIDE.md) | 代码审查规范与流程（分级标准/审查流程/场景策略/度量指标） |
| [WPSJS_DEVELOPMENT.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WPSJS_DEVELOPMENT.md) | WPS JS 加载项开发与安装指南 |
| [INSTALL_SCRIPT.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALL_SCRIPT.md) | 安装脚本实现说明（install-addons*.js / wpsjs publish） |
| [SKILLS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md) | **Wiki 级 Skills 文档**（内置工具/网关规范/各 Skill 详细能力/开发规范） |

## 🖥️ 平台专题

| 文档 | 说明 |
|------|------|
| [WINDOWS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md) | Windows 支持（✅ 完整支持：侧边栏 Chat UI + COM 桥接 + 计划任务自启） |
| [MAC.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md) | macOS 支持（✅ 完整支持：浏览器对话 + 反向轮询桥 + LaunchAgent 自启） |
| [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md) | Linux 支持（✅ 开发完成，⚠️ 待实机验证） |
| [windows-code-review-fixes.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/windows-code-review-fixes.md) | Windows 插件代码评审与修复记录（Issue #85） |

## 📚 内部参考（面向开发者/维护者）

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/ARCHITECTURE.md) | 架构设计（4 层组件 + 十层调用链 + 工作原理 + 设计决策） |
| [MCP.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MCP.md) | Model Context Protocol 协议文档 |
| [OPENCODE_API.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/OPENCODE_API.md) | OpenCode Server HTTP API |
| [WPS_COM_API.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WPS_COM_API.md) | WPS Office COM API |
| [WPS_COM_PS1.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WPS_COM_PS1.md) | wps-com.ps1 实现原理解析 |
| [POWERSHELL_COM.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/POWERSHELL_COM.md) | PowerShell COM 桥接技术 |
| [SECURITY.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SECURITY.md) | 安全模型与注意事项 |
| [NPC_TEAM.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/NPC_TEAM.md) | NPC Team 总指挥（**CNB 平台开发辅助工具**，零积分全流程，7 位专家含🔬研究员 RES，13 阶段（1/13 深入分析 + 5 暂停点 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5/⏸CP3）含 PR 合并确认 + 发布四要素，内含**三条防重规则铁律 19/20/21**（防重复 PR / 交接只用 PR 编号 / 判「阻塞」前对照实验），并有**铁律 24 防腐四维 + 环节覆盖**（全局观 / 契约唯一 / 模块化 / 敢删 + 每个环节防腐与解耦，由 `validate-npc-team-bloat` 守卫），⚠️ 与 WPS 插件无关） |
| [I18N_PLAN.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/I18N_PLAN.md) | 国际化 (i18n) 支持规划（未来规划） |
| [FEATURES.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/FEATURES.md) | 文档校对/模板填写功能说明（校对流程、治理规则 P1～P4 与历次整改档案） |
| [HISTORY.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/HISTORY.md) | 演进历史与致谢 |
| [releases/](https://cnb.cool/lnxsun/opencode-wps/-/tree/main/docs/releases/) | 版本发布说明（Release Notes）存档：[v1.13.0](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/releases/v1.13.0.md) · [v1.12.0](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/releases/v1.12.0.md) · [v1.11.0](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/releases/v1.11.0.md) · [v1.10.0](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/releases/v1.10.0.md) · [v1.9.35](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/releases/v1.9.35.md) |
| [superpowers/specs/](https://cnb.cool/lnxsun/opencode-wps/-/tree/main/docs/superpowers/specs/) | 设计规格存档：[端口杀进程设计](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/superpowers/specs/2026-05-05-port-kill-design.md) · [MCP 渐进式加载设计](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/superpowers/specs/2026-05-08-mcp-progressive-loading-design.md) |

---

## 平台路径参考

> 📖 三平台安装目录、Launcher 与 MCP 通信方式的完整对照见 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)「平台路径速查」表。

## 仓库根目录文档

| 文档 | 说明 |
|------|------|
| [../README.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/README.md) | 项目首页（精简门户） |
| [../AGENTS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/AGENTS.md) | AI 助手行为指引（架构/命令/Gotchas，含治理门禁指路接入约定） |
| [../CHANGELOG.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/CHANGELOG.md) | 更新日志 |
| [../CODE_OF_CONDUCT.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/CODE_OF_CONDUCT.md) | 行为准则 |
| [../CONTRIBUTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/CONTRIBUTING.md) | 贡献入口 |
| [../LICENSE](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/LICENSE) | MIT 许可证 |

---

## 快速链接

- **项目主页（国外/GitHub）**: https://github.com/lnxsun/opencode-wps
- **项目主页（国内/CNB 镜像）**: https://cnb.cool/lnxsun/opencode-wps
- **OpenCode 配置**: `~/.config/opencode/opencode.json`
- **Launcher**: http://127.0.0.1:14097
- **OpenCode 服务**: http://127.0.0.1:14096
- **CORS 代理**: http://127.0.0.1:14098（备用，opencode-proxy.js 剥离 CSP 头）
