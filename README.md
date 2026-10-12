# OpenCode WPS

[![CI](https://github.com/lnxsun/opencode-wps/actions/workflows/ci.yml/badge.svg)](https://github.com/lnxsun/opencode-wps/actions)
[![Version](https://img.shields.io/github/v/release/lnxsun/opencode-wps)](https://github.com/lnxsun/opencode-wps/releases)
[![License](https://img.shields.io/github/license/lnxsun/opencode-wps)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](https://github.com/lnxsun/opencode-wps)

[OpenCode](https://github.com/anomalyco/opencode) AI 助手的 WPS Office 插件，让你在 WPS 文字、表格、演示中直接与 AI 对话，获取智能辅助。**支持 Windows、macOS、Linux 三平台。**

## 核心特性

- **WPS 内嵌 AI 对话** — 侧边栏 Chat UI，支持 SSE 流式输出、Markdown 渲染、多会话管理；**工具调用权限确认弹窗**（允许/拒绝/记住）、**上下文用量进度条**（绿/橙/红三档预警压缩）、**等待审批状态**高亮（区别于正常忙碌）
- **MCP 工具集成** — WPS Office MCP 服务器三层工具体系（内置工具 + 注册工具 + 网关 COM Actions，数量以 `npm run validate:toolcounts` 输出为准），AI 可直接读写/格式化文档
- **WPS 专用 Agents** — wps-expert / wps-word / wps-excel / wps-ppt，通过 Agent 选择实现功能聚焦
- **特色功能** — 模板自动填值（修订追踪）+ 长文档分批校对（铁律 3.0，治理层 P 规则代码层强制执行，清单以 `governance.js` 源码为准；**疑似问题（待确认问题）机制**单列人工核对）
- **执行治理** — governance.js Hooks 拦截所有 MCP 调用（G2-G7 + P1-P4 + T1-T11，`GUIDE_MAP` 指路，清单以源码为准），防 AI 作弊；拦截时附带 **【门禁指路】** 正解指引（`GUIDE_MAP`，文案**恒为同一条短指路**、不按触发次数加长）。由 `npm run validate:semantic-anchor-scope`（轴 I，第十刀并入）断言两条独立判据：①「标签集合 = `GUIDE_MAP` 键集合」双向闭合（防漏接）；②指路文案预算（每条 ≤60 字 / 合计 ≤600 字，防「在报错里塞小作文」）
- **NPC Team 总指挥（零积分）** — 召唤官方免费 `@CodeBuddy` 一句「调用 NPC_TEAM skill」，7 位专家**接力**跑完研发全流程（默认接力模式：每次召唤只执行一步、独立留痕；评审-修复循环自动连续执行，每步在 PR 分别留痕），零平台积分；内置**三条防重规则（铁律 19/20/21）**防重复 PR / 交接只用 PR 编号 / 判「阻塞」前先做对照实验；并有**铁律 24 防腐四维 + 环节覆盖**（全局观 / 契约唯一 / 模块化 / 敢删，1-13 各环节均须防腐与解耦，`npm run validate:npc-team-bloat` 守卫 NPC Team 自身不腐烂）
- **一键安装** — `node install-addons.js` 自动完成全部组件安装，开机自启

> 💡 **NPC Team（零积分）与 CNB Skills 不是 WPS 插件功能**：`@CodeBuddy`、NPC_TEAM 提示词、`.codebuddy/skills/` 等属于 **cnb.cool 平台的开发辅助工具**，用于在 CNB 平台（Issue/PR/对话）辅助研发，与 WPS 插件本体无关。详见 [docs/NPC_TEAM.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/NPC_TEAM.md)。

> 📖 详细功能说明见 [docs/FEATURES.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/FEATURES.md)。

## 快速开始

### 环境要求

- **操作系统**：Windows 10/11、macOS 12+ 或 Linux（Debian/Ubuntu/Arch 等，x86_64 / aarch64）
- **WPS Office**：Windows 个人版 12.1.0+ 或企业版 / Mac 最新版 / Linux 12.1.x（[linux.wps.cn](https://linux.wps.cn)）
- **Node.js**：18.0.0+（或 Bun 1.0+）
- **OpenCode**：`npm install -g opencode-ai`
- **Python 3**：Mac/Linux 需要（`wps-auto.sh` 生成空白 OOXML 用，缺失时回退无参启动）；Windows 不需要

### 一键安装

```bash
# 国内（CNB 镜像）：git clone https://cnb.cool/lnxsun/opencode-wps.git
# 国外（GitHub）：git clone https://github.com/lnxsun/opencode-wps.git
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps
npm install

# 按平台执行安装脚本
node install-addons.js          # Windows（8 步自动安装）
node install-addons-mac.js      # macOS（7 步自动安装）
node install-addons-linux.js    # Linux（8 步自动安装）
```

安装完成后重启 WPS，功能区出现 **OpenCode AI** 标签页：Windows 点击 **打开面板** 即可开始对话；macOS / Linux 点击 **打开Web** 在浏览器中对话。

> 📖 三平台完整安装步骤、目录路径与卸载说明见 [docs/INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)。

## 使用方式

- **Windows**：WPS 侧边栏 Chat UI，直接与 AI 对话
- **macOS / Linux**：Ribbon 点击「打开Web」，浏览器中对话，插件轮询桥操作文档
- **对话能力**：SSE 流式输出、Markdown 渲染、会话管理、Agent 选择、`@wps-word` 等子 agent 调用

> 📖 完整使用指南见 [docs/USAGE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/USAGE.md)；问题排查见 [docs/TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)。

## 项目架构（一图速览）

```
WPS 宿主 (Win/Mac/Linux)
   │
   ▼
WPS JS 插件 ── Win: Chat UI (SSE直连:14096) / Mac·Linux: 轮询桥 (:58891)
   │
   ▼
OpenCode 中央调度 (opencode serve :14096) ── governance.js Hooks 横切治理
   │
   ▼
WPS Office MCP 服务器 (内置工具 + 注册 handler + 网关 COM Actions)
   │
   ▼
Win: PowerShell COM 桥接  /  Mac·Linux: HTTP 轮询 (反向轮询插件)
```

> 📖 完整架构（4 层组件 + 十层调用链 + 平台差异）见 [docs/ARCHITECTURE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/ARCHITECTURE.md)。

## 文档地图

| 分类            | 文档                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 🧭 **使用**     | [安装指南](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md) · [使用指南](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/USAGE.md) · [特色功能](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/FEATURES.md) · [问题排查](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)                                                              |
| 🔧 **开发**     | [开发指南](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/DEVELOPMENT_GUIDE.md) · [代码审查](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/CODE_REVIEW_GUIDE.md) · [WPS JS 开发](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WPSJS_DEVELOPMENT.md) · [安装脚本说明](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALL_SCRIPT.md) · [Skills](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md) |
| 🖥️ **平台专题** | [Windows 支持](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md) · [macOS 支持](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md) · [Linux 支持](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)                                                                                                        |
| 📚 **内部参考** | [架构](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/ARCHITECTURE.md) · [MCP](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MCP.md) · [API 参考](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/OPENCODE_API.md) · [安全](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SECURITY.md) · [NPC Team](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/NPC_TEAM.md)                                               |

> 📚 完整文档中心（含全部 24 份顶层文档 + 2 份设计规格的索引）见 [docs/README.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/README.md)。

## NPC 研发助手（CNB 平台开发辅助工具，与 WPS 插件无关）

> ⚠️ 本节内容属于 **cnb.cool 平台**的研发辅助能力，**不是 WPS 插件的一部分**：它们不随 `install-addons*.js` 安装，不进入 `%APPDATA%`/`~/Library`/`~/.local` 等插件目录，也不依赖 WPS 运行。使用对象是**在 CNB 平台开发本仓库的开发者**，而非 WPS 插件使用者。

在 CNB 平台召唤官方免费 `@CodeBuddy`，只说一句：

```
调用 NPC_TEAM skill 完成以下需求：<你的需求>
```

本仓库内置 NPC_TEAM Skill，`@CodeBuddy` 自动化身 7 位专家（PM/产品/架构/开发/评审/测试/研究员 RES），**默认接力模式**：每次召唤只执行 13 阶段流水线（1/13 深入分析→拆解→分析→设计→开发→评审→修复→测试→需求覆盖度→文档→PR 合并→发布→汇报→复盘，含 5 个暂停点 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5/⏸CP3）中的一个步骤，输出【接力卡】后停下，用户逐步召唤下一棒续跑（**例外：6/13 评审-修复循环自动连续执行，用户要求跑 N 轮时同一次召唤内自动跑完 N 轮直至清零，每步在 PR 分别留痕，中途不暂停**），**零平台 NPC 积分**。

> ⚡ **默认接力模式（每步独立调用；评审-修复循环自动连续执行）**：每次召唤只执行流水线中一个步骤，输出【接力卡】（含任务书 + 下一步召唤话术）后立即停下，用户逐步召唤下一棒续跑——每步独立调用、独立留痕、独立可见，步间天然可确认/纠正/停止，彻底杜绝"单会话闷头跑完 + 编造全绿"；**例外：6/13 评审-修复循环自动连续执行**（用户要求跑 N 轮时同一次召唤内自动跑完 N 轮直至清零，**每一步（评审/修复/复评）都在 PR 分别留痕，留痕以「每步」为粒度而非「每轮」**，中途不暂停、无需逐棒召唤）；**全程贯彻"先验证后整改/先验证后报告"**（整改改代码前须先复现→定位根因→写测试验证方案可行，确认真实必要才动；评审/测试判问题前须先求证、给出可核实依据，杜绝"想当然"与垒屎山）；**7/13 测试通过后做需求覆盖度检查**（逐条核对开发落点/测试覆盖是否覆盖全部需求，输出覆盖度矩阵）并经 **⏸CP2.5 需求覆盖确认暂停**待用户确认；**10/13 PR 合并前经 ⏸CP3 暂停待用户确认**（输出【合并确认卡】，只有用户确认才合并，禁止未确认就合并/假装已合并）；**11/13 发布真实执行（四要素）**（更新版本号 / 形成 CHANGELOG / 发布产物 / 形成 Release Notes）并留痕。也支持用户明确要求时的全程模式（一次跑完，保留 ⏸CP1/⏸CP2/⏸CP2.5/⏸CP3 暂停确认）；**三条防重规则（铁律 19/20/21，Issue #284）**：① **防重复 PR**——5/13 开发开工前先查同 Issue 是否已有 open PR，有则复用同一 PR/分支继续推，禁止新建（一个 Issue 一个 PR 一条分支）；② **交接只能用 PR 编号**——任务书/接力卡/留痕/召唤话术中的交接对象写 `#<编号>`，禁止只写分支名（防「最新交棒指令」指向半成品而选错对象）；③ **判「阻塞」前必须做对照实验**——同一份代码另建目录/另用基线 commit 各跑一遍，只有「本次改动后失败、基线通过」才算本次改动导致的阻塞，环境性失败不得记为本次改动阻塞。

> 📖 使用方式与提示词见 [docs/NPC_TEAM.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/NPC_TEAM.md)。

## 交流群

欢迎加入 OpenCode-WPS 微信交流群，获取最新动态、反馈问题、交流使用心得：

<img src="docs/assets/wechat-group.png" alt="OpenCode-WPS 微信交流群" width="300">

> 当前二维码有效期至 **2026-10-11**（二维码不定期更新）。如二维码过期，请提交 [Issue](https://github.com/lnxsun/opencode-wps/issues) 联系维护者。

## License

[MIT](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/LICENSE)

---

📖 项目演进历史与致谢见 [docs/HISTORY.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/HISTORY.md)。
