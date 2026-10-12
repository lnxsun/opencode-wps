# 开发指南（Wiki 级）

本文档是 opencode-wps 的**完整开发手册**，面向开发者/贡献者，覆盖：开发环境搭建、项目结构、五大模块（插件/MCP/Skills/Agents/安装脚本）的开发指南、开发流程、代码规范、提交规范、测试、CI/CD 门禁、二次开发与常见问题。

> 📖 架构与设计见 [ARCHITECTURE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/ARCHITECTURE.md)；代码审查规范见 [CODE_REVIEW_GUIDE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/CODE_REVIEW_GUIDE.md)；WPS JS 加载项专项开发见 [WPSJS_DEVELOPMENT.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WPSJS_DEVELOPMENT.md)。

---

## 目录

- [一、开发环境](#一开发环境)
- [二、项目结构](#二项目结构)
- [三、模块开发指南](#三模块开发指南)
- [四、开发流程](#四开发流程)
- [五、代码规范](#五代码规范)
- [六、提交规范](#六提交规范)
- [七、测试](#七测试)
- [八、CI/CD 门禁](#八cicd-门禁)
- [九、二次开发](#九二次开发)
- [十、常见问题](#十常见问题)
- [十一、联系方式](#十一联系方式)

---

## 一、开发环境

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| **操作系统** | Windows 10/11（主）/ macOS 12+ / Linux | Windows 是完整支持平台（COM 桥接） |
| **WPS Office** | 12.1.0+（Win 个人版或企业版） | Mac/Linux 用最新版 |
| **Node.js** | 18.0.0+（或 Bun 1.0+） | MCP 服务器为 TypeScript |
| **npm** | 随 Node.js | 依赖安装 |

### 环境准备

```bash
# 1. 克隆仓库
# 国内（CNB 镜像）：git clone https://cnb.cool/lnxsun/opencode-wps.git
# 国外（GitHub）：git clone https://github.com/lnxsun/opencode-wps.git
git clone https://github.com/lnxsun/opencode-wps.git
cd opencode-wps

# 2. 安装根依赖
npm install

# 3. 安装并编译 MCP 服务器
cd wps-office-mcp
npm install
npm run build
cd ..

# 4. 安装插件到本机
node install-addons.js        # Windows
# node install-addons-mac.js  # macOS
# node install-addons-linux.js# Linux

# 5. 重启 WPS Office，功能区出现 OpenCode AI 标签页
```

---

## 二、项目结构

```
opencode-wps/             # 仓库根目录
├── .opencode/             # 治理插件 + OpenCode 配置模板（仓库顶层）
│   ├── plugins/governance.js   # 执行治理（G2-G7 + P1-P4 + T1-T11，清单以源码为准）
│   └── opencode.jsonc          # OpenCode 配置模板
├── opencode-wps/          # Windows JS 插件（Chat UI + Launcher）
├── opencode-wps-assistant/# macOS JS 插件（反向轮询桥）
├── opencode-wps-linux/    # Linux JS 插件（反向轮询桥）
├── shared/wps-bridge/     # 跨平台共享层（单一来源）：response/registry/common-core/handler-utils
│   └── （由 scripts/sync-wps-bridge.js 同步到 Mac/Linux 平台目录）
├── wps-office-mcp/        # MCP 服务器（TypeScript，三层工具）
├── skills/                # 5 个 WPS Skills
├── agents/                # 4 个 WPS Agents
├── scripts/               # 校验/工具脚本（validate-*）
├── tests/                 # 测试文件
├── docs/                  # 文档中心
├── install-addons*.js     # 三平台一键安装脚本
├── launcher-mac.js        # macOS Launcher 进程
├── launcher-linux.js      # Linux Launcher 进程
└── package.json           # 根命令
```

### 关键路径与安装映射

| 源目录（git 跟踪） | 安装目标（非 git 跟踪） |
|--------------------|------------------------|
| `opencode-wps/` | `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` |
| `wps-office-mcp/` | MCP 编译产物 + `~/.config/opencode/opencode.json` 配置 |
| `skills/` | `~/.opencode/skills/` |
| `agents/` | `~/.config/opencode/agents/` + `~/.opencode/agents/` |
| `.opencode/plugins/` | `~/.config/opencode/plugins/` |

> ⚠️ **铁律**：只编辑源文件，然后运行 `node install-addons.js` 同步；**绝不**直接编辑安装产物目录。每次改动后用 `git status` 核对，避免改错目录。

---

## 三、模块开发指南

### 3.1 WPS 插件（`opencode-wps/`，Windows）

核心文件：

| 文件 | 职责 |
|------|------|
| `main.js` | Ribbon 回调、状态管理、OpenCode 连接 |
| `taskpane.html` | Chat UI（SSE 流式、Markdown 渲染、会话/Agent 管理） |
| `launcher.js` | 后台 Launcher 进程（管理 OpenCode 服务） |
| `opencode-proxy.js` | CORS 代理（端口 14098，剥离 CSP 头） |
| `config.js` | 全局配置中心（`CONFIG` 对象） |
| `ribbon.xml` | 功能区按钮定义 |
| `manifest.xml` | 插件清单 |
| `serve.js` | 开发静态服务器（端口 3444，仅开发用） |

**开发要点**：
- 所有文件路径必须使用**绝对路径**
- 前端与后端通过 `config.js` 共享 `CONFIG`
- Chat UI 用 SSE 流式（`XMLHttpRequest`，禁用 `fetch`）

### 3.2 MCP 服务器（`wps-office-mcp/`，TypeScript）

```
wps-office-mcp/
├── src/
│   ├── server/           # MCP server 入口
│   ├── client/           # 跨平台路由（Win→PowerShell COM, Mac/Linux→HTTP poll）
│   │   ├── wps-client.ts
│   │   ├── mac-poll-server.ts   # Mac 反向轮询（Linux 复用本类）
│   │   ├── linux-poll-server.ts # Linux 轮询
│   │   └── wps-keepalive.ts    # 跨平台服务保活（Win/Mac 探测 :58890，Linux 探测 WPS 主进程）
│   ├── tools/            # 三层工具
│   │   ├── index.ts      # 注册工具（allTools）
│   │   ├── gateway/      # Gateway（COM_ACTIONS 索引，数据表已拆到 com-actions.ts）
│   │   ├── common/       # 通用工具
│   │   ├── excel/        # Excel 工具
│   │   ├── word/         # Word 工具
│   │   └── ppt/          # PPT 工具
│   ├── types/            # 类型定义
│   └── utils/
│       ├── path-safety.ts # 路径安全（validateFilePath）
│       ├── error.ts       # 错误处理工具
│       ├── launcher.ts    # Launcher 工具函数
│       └── logger.ts      # 日志工具
├── scripts/              # Windows COM 脚本（wps-com.ps1 等）
└── package.json
```

#### 三层工具体系

（理解 MCP 开发的关键）

| 层级 | 数量 | 命名 | 注册/调用方式 |
|------|------|------|---------------|
| 内置工具 | 以 `mcp-server.ts` 为准（见 `validate:toolcounts` 输出） | `wps_xxx` | 启动即注册，**始终可直接调用**（Issue #382 DECISION-1：「网关强制」规则已删除；含 `wps_office_search`/`wps_office_execute` Gateway、缓存工具与 `wps_whoami` 自检，完整清单见 [SKILLS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md#内置工具所有-skill-共用)） |
| 注册工具 | 见 `validate:toolcounts` 输出 | `wps_xxx_xxx` | `tools/index.ts` 的 `allTools` → **`registerBuiltinTools()` 尾部 `registerAll(allTools)`** ⇒ 出现在 `tools/list`，**可直接调用**（含 4 个纯 TS 校对工具，Issue #382 DECISION-1） |
| COM Actions | 见 `gateway/com-actions.ts` 的 `COM_ACTIONS` | 短名称 | `wps_office_search` → `wps_office_execute` → TS handler 或 PS1 兜底（**渐进式入口**，非唯一入口） |

> ⚠️ **两条通道 → 一份判据**（Issue #382 CR10-1）：治理层 `governance.js` 的 `normalizeToolCall`
> 把「直连调用」与「网关调用」归一成同一 `{ toolName, innerArgs }` ⇒ P1~P4 校对门禁对两条通道**同口径**。
> 新增工具时若它参与校对流程，只需保证工具名经该归一化后与 `PROOFREAD_ADVANCE_TOOLS` 等短名集合一致。

> 📚 **交叉参考**：内置工具完整清单与两级网关调用规范详见 [SKILLS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md#内置工具所有-skill-共用)；运行时端口/Launcher 管理（14096/14097/14098）与使用侧配置详见 [USAGE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/USAGE.md#63-端口速查)。

**开发流程**（新增一个工具）：
1. 在 `src/tools/<category>/` 下新建 handler（类型安全 + 参数校验）
2. 在 `tools/index.ts` 的 `allTools` 注册（**注册即直连可见**，无需再动网关）
3. （**仅当**该工具有 PS1 同名 switch 分支、需走网关渐进式入口时）在 `gateway/com-actions.ts` 的 `COM_ACTIONS` 登记；
   ⚠️ **纯 TS 逻辑工具（PS1 无同名分支）不得登记进 COM_ACTIONS**（否则「同名双通道」，
   由 `validate:gateway-membership` 判据 B 报红）
4. `npm run build` 编译
5. 运行 `npm run validate:toolcounts` 校验工具数量
6. 重启 OpenCode 生效

**关键约定**：
- 所有接受文件路径的 handler 必须用 `validateFilePath()`（来自 `utils/path-safety.ts`）且在 `try` 块内调用
- 新增/修改后跑单元测试与工具数量校验

### 3.3 Skills（`skills/`）

5 个 WPS 专用 Skills：`wps-excel`、`wps-word`、`wps-ppt`、`wps-office`、`wps-proofread`。

每个 Skill 目录结构：
```
skills/wps-word/
├── SKILL.md    # Skill 定义（必需）
└── README.md   # 使用说明
```

> 📖 修改 Skills 前**必读** `skills/README.md`；每个 Skill 的详细用法见 [SKILLS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md)。

**开发流程**：
1. 编辑 `skills/<name>/SKILL.md`（或 README.md）
2. 运行 `node install-addons.js` 同步到 `~/.opencode/skills/`
3. 重启 OpenCode 使新 Skill 生效

### 3.4 Agents（`agents/`）

4 个 Agents：`wps-expert`、`wps-word`、`wps-excel`、`wps-ppt`。定义文件含 frontmatter（description/mode/color/tools）。

**开发流程**：
1. 编辑 `agents/*.md`
2. `node install-addons.js` 同步到 `~/.config/opencode/agents/` + `~/.opencode/agents/`
3. 重启 OpenCode 生效

### 3.5 治理插件（`.opencode/plugins/governance.js`）

通过 OpenCode Plugin Hooks（`tool.execute.before`/`after`）拦截所有 MCP 工具调用：

- **G2-G7**：Gateway 强制、破坏性操作确认、路径安全、密码保护、参数校验
- **P 规则（P1～P4）**：校对规则（批次推进前置 / 替换与收尾前置 / 替换内容校验 / 进度真实性；清单以 `governance.js` 源码为准）
- **T1-T11**：模板填值规则（评估文档、批 ≤200、修订追踪、不编造字段）

> 📌 **规则事实源**：语义说明 = `docs/FEATURES.md`；唯一生效实现 = `governance.js` 源码。
> **改治理规则时必须两处同步**（实现 → 语义）；SKILL.md 不再持有规则表（Issue #325 去冗余），无需同步。

**开发流程**：
1. 修改 `governance.js`
2. `node install-addons.js` 同步到 `~/.config/opencode/plugins/`
3. 重启 OpenCode 生效

> ⚠️ 治理规则有配套 CI 校验（validate-settings 等），改动需保证 CI 通过。

### 3.6 安装脚本（`install-addons*.js`）

三平台一键安装脚本（Windows/macOS/Linux 各 7-8 步）：安装插件、编译 MCP、配置 OpenCode、同步 Skills/Agents/Plugins、注册自启。实现细节见 [INSTALL_SCRIPT.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALL_SCRIPT.md)。

### 3.7 跨平台共享层（`shared/wps-bridge/`）

**背景**：Mac 与 Linux 反向轮询桥存在大量同构 handler 代码（`response.js`/`registry.js`/`common-handler.js`/`excel-handler.js`/`ppt-handler.js`/`word-handler.js`），历史上改一个 bug 需在两平台各改一遍、极易漏改。重构将其收敛为**单一来源（single source of truth）**：

```
shared/wps-bridge/                 # 单一来源（git 跟踪，改这里）
├── response.js                    # 响应工具（ok/fail/invalidParam）
├── registry.js                    # handler 注册表
├── common-core.js                 # 通用 handler 核心（平台差异经 BRIDGE_PLATFORM 隔离）
├── handler-utils.js               # 平台无关纯工具函数（excel/ppt/word 共用）
├── excel-handler-core.js          # 表格 handler 核心（mac 硬化版为唯一事实源，linux 继承）
├── ppt-handler-core.js            # 演示 handler 核心（同上）
└── word-handler-core.js           # 文字 handler 核心（同上）
        │  由 scripts/sync-wps-bridge.js 同步生成
        ▼
opencode-wps-assistant/            # macOS 平台产物（生成，勿手编）
    ├── utils/response.js
    └── handlers/{registry.js, common-handler.js, handler-utils.js,
                  excel-handler.js, ppt-handler.js, word-handler.js}
opencode-wps-linux/                # Linux 平台产物（生成，勿手编）
    ├── utils/response.js
    └── handlers/{registry.js, common-handler.js, handler-utils.js,
                  excel-handler.js, ppt-handler.js, word-handler.js}
```

**核心规则**：
- **编辑源**：只改 `shared/wps-bridge/*.js`，平台目录文件是**生成产物**，禁止手工编辑（顶部注释已标明）。
- **同步**：改完源后运行 `node scripts/sync-wps-bridge.js` 重新生成平台产物。
- **平台差异**：`common-handler.js` 通过全局 `BRIDGE_PLATFORM`（`'mac' | 'linux'`）隔离，由同步脚本按平台注入。例如 `ensureOutputDir`（saveAs/convertToPDF 前置校验输出目录）仅在 `BRIDGE_PLATFORM==='mac'` 启用。三份大 handler（excel/ppt/word）**不含平台条件逻辑**（已核实零 BRIDGE_PLATFORM/零 OS 判断），但两平台文件并非逐字节相同——存在少量内容分歧，至此单源化统一以 mac（参考 Windows 契约的硬化版）为准：
  1. `getActiveWorkbook`：linux 原多返回 `activeSheet` 字段，统一后不再返回（Windows/mac 参考实现均无，且无任何下游消费方读取该字段，低影响）。
  2. `getOpenWorkbooks`/`getOpenPresentations` 等列表获取：linux 原用 `fail()`（success:false），统一为 mac 的 `ok({..., error})`（success:true + error 字段）。语义为行为对齐（success 语义统一），非功能回归。
二者均与 Windows/mac 参考实现对齐，属低影响行为对齐而非回归；linux 同时继承 mac 的入参校验/try-catch/OOM 上限等安全护栏。
- **CI 漂移门禁**：`.cnb.yml` 用 `node scripts/sync-wps-bridge.js --check` 校验平台产物与共享层无漂移；本地用 `node scripts/sync-wps-bridge.js --check` 自查。
- **单源化基线**：`node scripts/sync-wps-bridge.js --report` 输出 excel/ppt/word 三份大 handler 的**单源化覆盖基线**（mac/linux 产物与 shared core 的行指纹匹配率，应达 100%）。**只读模式**：不写回平台文件、不触发漂移校验。
- **测试**：`node tests/wps-bridge-shared.test.js`（单源一致性/生成正确性/平台差异隔离/漂移检测）。

> 💡 详细架构说明见 [ARCHITECTURE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/ARCHITECTURE.md)「共享层说明」。

---

## 四、开发流程

### 1. 本地开发

见 [第一节](#一开发环境)。开发时常用命令：

```bash
# 构建 MCP 服务器
npm run build

# 安装 MCP 依赖
npm run mcp:install

# 运行 MCP 测试
npm run mcp:test

# 格式化代码
npm run format
npm run format:check
```

### 2. 创建功能分支

```bash
git checkout -b feat/your-feature
```

### 3. 修改代码（按模块）

- **Skills**：编辑 `skills/` → `node install-addons.js`
- **Agents**：编辑 `agents/` 或安装后的 `~/.config/opencode/agents/`（后者为产物）
- **MCP**：编辑 `wps-office-mcp/src/` → `npm run build`
- **插件**：编辑 `opencode-wps/` 下 JS/HTML 文件
- **治理**：编辑 `.opencode/plugins/governance.js` → 同步

### 4. 本地验证

```bash
# 统一预检门禁（validate 系列 + format:check + lint + MCP lint/test + test + test:e2e，提交 PR 前必跑）
# 前置条件：需先安装 MCP 依赖（preflight 内含 cd wps-office-mcp && npm run lint && npm test）：
#   cd wps-office-mcp && npm install   （或 npm run mcp:install）
npm run preflight
# 工具数量校验（内置/注册/COM Actions 三数全部派生自代码，见输出；不手写）
npm run validate:toolcounts
# NPC_TEAM 双源一致性
npm run validate:npc-team
# NPC_TEAM 提示词防腐校验（行数/铁律数/重复长句/未登记引用/环节覆盖，Issue #312）
npm run validate:npc-team-bloat
# 版本号一致性
npm run validate:versions
# agent 不带 tools 白名单校验（防 Issue #247 根因复发）
npm run validate:agent-no-tools
# settings 校验
npm run validate:settings
# 体量/棘轮守卫（**校对线全层**体量棘轮 + 语义连通性，Issue #341）
#   · validate:proofread-report-size —— 校对源码体量闸门（S0 归属 / S1 总量 / S2 单文件 / 棘轮 S3~S5）
#     计行对象 = 校对线全部源码（9 个文件：入口/规则/归一化/累加/报告/文案/类型/…）
#     ⚠️ 口径已从「仅报告层」扩为「全层」：报告层只占校对源码 ~15%，只锁它等于没锁
#   · validate:semantic-anchor-scope —— 语义键 × 落点集合双侧连通性（轴 I）
#     新增**跨模块概念**须在 scripts/lib/semantic-anchor-manifest.js 登记，
#     并在下方「语义键清单」区块列出键名（守卫会断言该区块含全部键）
#   · （K7 已并入 validate:semantic-anchor-scope —— 第十刀，Issue #352）
#   · validate:removed-mechanisms —— 文档形态漂移（Issue #359 / 第十二刀）：
#     ① 已删机制的非历史区现在时陈述（#357）；② 断档编号（引用了源码中不存在的治理规则编号，#353）。
#     数据单源 = scripts/lib/doc-drift-manifest.js（② 的合法编号集合运行时从 governance.js 头部声明行派生），
#     判据 = scripts/lib/doc-drift-scope.js
#   · validate:proofread-p2-invariant —— P2「覆盖全文后禁止推进」门禁的「本批已上报」前置**不变量**
#     （Issue #400）：行为断言守卫，在 scripts/ 层加载 **prod** governance.js 跑真实链路，
#     断言 ③取文本 + ④校对 在单批（≤200 段）时不被打断（不死锁）、多批覆盖全文后继续推进仍被拦（对偶面）。
#     判据纯函数 = scripts/lib/proofread-p2-invariant.js（模块内无仓库路径字面量）
npm run validate:proofread-report-size
npm run validate:semantic-anchor-scope
npm run validate:removed-mechanisms
npm run validate:proofread-p2-invariant
#   · validate:release-connectivity —— 发布留痕连通性（Issue #380 / #383 / #399 补正）：
#     判据① 标签↔版本号；② 标签↔CHANGELOG 段**存在**；③ 标签↔发布分支可达；
#     ④ 发布说明 §一 引用 ⊆ CHANGELOG 段（含更早段）引用 —— 拦「发布说明列了、CHANGELOG 段没写」
#       （Issue #399 实测反例：v1.14.2 RN §一 列 #399/#404，CHANGELOG 1.14.2 段 0 处提及）
#     ⑤ 发布提交 message 的「CHANGELOG 声称」⊆ 该提交 CHANGELOG diff 新增行**见证词** —— 拦 message 层
#       **假留痕**（Issue #399 13/13 复盘实测反例：77d9e76 message 称含 G3/#399，diff 新增行 0 命中）
#       ──「见证词」= 编号 `#<数字>` ∪ 功能代号 `G/P/T<数字>`（单源 RELEASE_COMMIT_WITNESS_PATTERN，
#         声称侧与真值侧**同源**）。声称行 = 「CHANGELOG 关键词 + 写入动词」同行共现，且**排除提交标题行**
#         （标题是工作描述，其 #编号 属 Issue/PR 追溯，非「已写入」声称）。
#       历史边界 = RELEASE_COMMIT_CLAIM_SINCE（声明式；含已登记反例 RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES），
#         只对边界之后的提交断言 —— 边界不对任意 --root 存在时**如实退回**未收紧范围（不静默空跑）。
#     判据纯函数 = scripts/lib/release-connectivity-scope.js（模块内无仓库路径字面量）
npm run validate:release-connectivity
# 运行全部根单测
npm run test
# 运行 e2e 集成测试
npm run test:e2e
# 全仓 JS 语法门禁
npm run lint
# 格式化代码（Prettier）
npm run format
# 仅检查格式（Prettier）
npm run format:check
cd wps-office-mcp && npm test
```

### 4.1 语义键清单（轴 I 单一来源）

<!-- SEMANTIC-ANCHORS-LIST -->
以下语义键由 `scripts/lib/semantic-anchor-manifest.js` 单源登记，
`npm run validate:semantic-anchor-scope` 断言「语义键 ↔ 落点集合」双向闭合，
且本区块必须列出全部键（新增键须同时改清单与本节）：

- `truncation-signal` — 文本真值 / 截断信号（`requestedLength` · `returnedLength` · `truncated`）
- `batch-max` — 批次大小「200 段」（跨运行时单源）
- `fix-action-verdict` — 修复动作裁决（`fix` / `report_only` + 服务端推断留痕）
- `skipped-segment-ownership` — 跳过声明归属归一化（区间落在本批内 + 并集覆盖本批）
- `theme-metric-map` — 问题类型 → 六维评分维度映射 + 权重公式
- `ratchet-verdict` — 守卫上限「棘轮」判据（不许上调 / 值与留痕对账 / 留痕必填 / 达标即收紧）
- `guard-source-budget` — 守卫/元数据源码体量预算（机械枚举单源 `scripts/lib/guard-sources.js` + **轴 I 维度 `guardSourceLines`**，Issue #352 第五刀）
- `tool-count-source` — 工具数量真值源（内置/注册/COM Actions 三数**派生自代码**；治理层 ∩ 注册层由判据 G 双向断言，Issue #373）。落点自带归属判据（供轴 I 的落点级 anchor 判定）：

```js
const TOOL_COUNT_SOURCE_KEY = 'tool-count-source';
```
- `governance-guide-map` — 治理层「规则标签 ↔ 门禁指路」映射（`GUIDE_MAP` 键集合 = `enhanceBlock` 标签集合；并含**指路文案预算**，见 4.3）。⚠️ 第十刀：原独立 K7 守卫已删，两条判据并入轴 I
- `tool-result-payload` — 工具调用结果**信封**（`ToolCallResult` 的 `success` → `mcp-server` 投影 `isError` → 治理层消费面）。
  契约面**只有** `isError` 能跨「TS 类型 → 投影 → 运行时 after 入参」三层存活；消费侧源码见 4.4。
- `artifact-floor-integrity` — 历史产物的**处置完整性**（Issue #419 = #417 AC-6 拆分）：判据⑨ 断言「冻结下限以上、**曾入库**的产物仍在待发布树内」，`[产物下限, 未决处置下限)` = 待处置对象（保留、不动）。处置结论由单源 `ARTIFACT_FLOOR_DECISION_REFS` 登记（改它必产生 diff ⇒ 可评审），**不**设「历史版本豁免清单」（实测该类清单在轴 I 归属侧零信号 = 静默放宽口袋）。
- `proofread-p2-invariant` — P2「覆盖全文后禁止推进」门禁的「本批已上报」前置**不变量**（Issue #400）：单批（≤200 段）文档首批取段即达文末时 ③取文本 + ④校对 **均不被 P2 拦**（不死锁）；多批末批上报后继续推进 **仍被 P2 拦**（对偶面）。行为断言守卫 = `scripts/validate-proofread-p2-invariant.js`（在 `scripts/` 层加载 prod 插件跑真实链路，不依赖 `tests/`）

### 4.2 守卫上限「棘轮」机制（Issue #341）

守卫自身的阈值（如 `validate-proofread-report-size` 的 `LIMITS.totalLines`、
`validate-semantic-anchor-scope` 的 `E1_BASELINES`）**不得被随意放宽** —— 否则闸门形同虚设。

> **历史变更（Issue #341 → #352）**：计量口径已从「报告层单文件」扩为**校对线全层**（用户指令
> 「只大幅压缩、绝不增加」）。#341 把 10 个校对源码文件从 **2822 行压到 1842 行（−35%）**（时为棘轮值）。
>
> **Issue #352 压缩方案 A+B+D（本轮）**：合并 `proofread-store.ts` 入 `proofread-types.ts`（10→9 文件）、
> 归一化三投影合一、30 条风格偏好规则默认关闭（`Rule.optionalGroup`）⇒ 棘轮收紧至 **1824 行**
> （`LIMITS === RATCHET === ACHIEVED === 1824`）。
>
> **第 1 轮评审补强（S6~S8）**：校对源码之外的**守卫/元数据脚本**（`GUARD_SOURCES`，条数以源码为唯一事实源）同样纳入
> **物理行数**棘轮 —— 原仅由轴 I 的 E1（**剔注释**「有效代码行」）约束，实测 +300 行注释 EXIT=0 ⇒
> 「绝不增加」对守卫体系本身无效。~~现两口径分工并存：E1 量逻辑复杂度，S6~S8 量篇幅。~~
> ⚠️ **本条沿革已被第五刀取代**：S6/S7 第三刀删除、S8 第五刀**并入 E1 成为一维**
> （`guardSourceLines`，物理行数）——现行口径为「**E1 内部两种口径并存**」：
> 其余维量逻辑复杂度（剔注释），`guardSourceLines` 量篇幅（物理行数）。
>
> **第 2 轮评审补强（R2-F1/F2）**：① S8 棘轮基线改为**独立常量** `GUARD_RATCHET_BASELINE`
> （此前由 `GUARD_SOURCES` 派生 ⇒ 自证循环：「加行 + 同步抬高该文件棘轮值」静默通过，实测可绕）；
> ② S0/S6 升为**双向归属**（此前只查「声明的必须存在」，未登记的新文件不进分母 ⇒ 实测可逃出闸门）。
> ⚠️ **S6/S7 已随后续第三刀删除**（见下「第三刀」）—— 保留本段仅作历史沿革，现行断言以最新段落为准。
>
> **第 3 轮评审补强（R3-F1）**：第 2 轮的「独立基线」仍有缺陷 —— `initial` 与 `baseline` 传了**同一个变量**，
> 使共享判据「值与留痕对账」退化为 `X !== X` **恒真** ⇒ 单独抬高现值即静默放宽（实测 1620 → 99999 `EXIT=0`）。
> 现拆为 `GUARD_RATCHET_INITIAL`（初始值，独立字面量）与 `GUARD_RATCHET.baseline`（现值），二者不得同源。
>
> **第 4 轮评审补强（R4-F1）**：`.prettierignore` ↔ 清单的「同集断言」原为**单向**（只查「声明的都在」），
> 加入无关文件即可静默逃出 prettier 门禁。现改为**双向集合相等**（`BEGIN/END` 区块 ↔ 两批清单）。
>
> **第 5 轮（Issue #346）**：S6 反向归属的枚举由「单层 `readdirSync(dir)`」改为**手写 walk**（`withFileTypes`
> 逐层、目录必下钻、正则**只对文件名**）—— 旧实现只枚举**第一层**，子目录新文件不入分母
> （实测 `word/sub/proofread-x.ts` → `EXIT=0`，一次 `mkdir` 绕过闸门）。**实测三坑**：① 单层枚举不下钻；
> ② 排除判据须按**目录段**而非 `e.name`（basename）；③ **`readdirSync({recursive: true})` 对「目录名命中
> 家族正则」的目录不下钻**（`word/proofread-x.ts/proofread-inner.ts` → `EXIT=0`）⇒ 照搬「递归枚举」只堵一半。
> 本轮改动**物理行数零净增**（仍 247 行，S7 硬棘轮由等量删注释抵消）。
>
> **Issue #347（本轮）· K5 测试侧度量单一出口**：`collectFacts()` 是度量口径的唯一定义者，但每次调用
> 重做全套 I/O；测试按**用例**反复调用 ⇒ 成本随用例数放大。现测试侧读快照**只经**
> `tests/helpers/facts-snapshot.js`（单一来源模块）：跨文件**原位** `collectFacts()` 调用点已被单个出口取代。
> ⚠️ 该出口**只做进程内至多一次**，`collectFacts()` 本体**保持无缓存** —— 它**不**提供「mutation 感知」，
> 变异自证（改文件 → 重跑应报红）改经 `requireFresh(模块)` 取**新鲜实例**，否则即为假绿。
> 同轮把本预算**当时未入分母的守卫源码**（`validate-npc-team-bloat.js` / 本守卫）补进 `GUARD_SOURCES` ——
> 此前它们**不在体量分母内**（实测可各自 +300 行注释而两闸门均 `EXIT=0`，因各自被 S6 反向枚举
> 按预登记豁免跳过）；补登记后棘轮 1620 → 2127（**负棘轮**：把漏计对象按实测补齐，非扩容）。
> **Issue #352 第三刀（本轮）· 分母改自动枚举，S6/S7 删除**：手写 `GUARD_SOURCES` 清单实为
> 「任选取子集」（实测 11 文件 / 2738 行，**漏计** `validate-gateway-membership.js` 170 行等真守卫；比值 85% 的守卫源码不在分母内）。
> 且「登记进清单」本身 = **合法抬高棘轮**，形成自我许可循环。现 `GUARD_SOURCES` 由 `discoverGuardSources()`
> **机械枚举** `scripts/validate-*.js` + `scripts/lib/*.js`（27 文件 / 5519 行）—— 新增守卫文件自动进分母，
> **无需任何登记**；要放行只能显式走 `upgradeLog` 或先删等量。随之删除：**S6 双向归属**（无手写清单即无「未登记」）
> 与 **S7 逐文件上限**（无逐文件登记值）；体量约束收敛为**单一总量棘轮 S8**（含「超基线」显式报红）。
> 棘轮 2738 → 5519 为**负棘轮**（补齐漏计对象，非扩容）。**自限**：枚举不递归子目录、仅两个显式目录。
> 
> **Issue #352 第五刀（本轮）· 体量棘轮并入轴 I 单一来源**：原 S8（体量闸门内）与 E1（轴 I）是**同一判据的
> 两份实现**（各自维护「不许上调 / 值与留痕对账 / 达标即收紧」）；且第三刀改机械枚举后，棘轮表是**人手写**的
> 绝对值、与该刀新增代码并列对比 ⇒ **首跑必报红**（实测 5519 → 实测 5625），只能改棘轮表放行。
> 现收敛为轴 I 的**一个维度** `guardSourceLines`（口径 = 守卫源码**物理行数总量**，其余维=剔注释有效代码行），
> 枚举实现下沉为单源 `scripts/lib/guard-sources.js`（体量闸门 / 轴 I / 测试三方共用）；体量闸门不再量守卫侧、
> 不再持 `GUARD_RATCHET`。**同刀删除** `checkRatchet` 的「达标即收紧」分支（实测：删除后全仓零有效调用）。
> **另（第 8 轮评审 F1）**：轴 I 的 `E1_RATCHET_BASELINES` 副本表**已删** —— 实测它与 `E1_BASELINES`
> 去注释后**逐字相同** ⇒ 「不许上调」判据恒真（9 维白写，属 R3-F1 同族形态）。现棘轮基线**派生自留痕**
> （`log.at(-1).to ?? initial`），该判据恢复真实判别力（变异自证：`current=9999` → 报「棘轮被上调」）。
> 

本仓把「上限只降不升」落成**共享判据** `scripts/lib/ratchet.js` 的 `checkRatchet`：

| 判据 | 含义 | 违反后果 |
|------|------|----------|
| 不许上调 | 当前限值 ≤ 棘轮基线 | 报红（须走留痕流程） |
| 值与留痕对账 | 棘轮基线 = `upgradeLog` 最后一条 `.to`（无留痕时 = 初始值） | 报红（防「改值不留痕 / 留痕不改值」） |
| 留痕必填 | 每条 `upgradeLog` 须含 `issue`/`reason`/`from`/`to` | 报红（空壳留痕不受理） |

- **唯一契约**：`scripts/lib/ratchet.js`（两条守卫均 `require` 它，不得各写一份）
- **专测**：`tests/ratchet.test.js`（每条判据正向 + 变异自证 + 「判据不可缺」断言）
- **自限（显式披露）**：不声称拦住「有权限且同时改棘轮与限值两处」的人 ——
  静态守卫不能阻止维护者改守卫；它保证的是改动语义后果**显式化**（值与留痕必须对账）

#### 4.2.1 留痕**重链**：`npm run ratchet:rechain`（Issue #408）

E1 留痕是 **append-only 链**（每条 `from == 上一条 to`）。两个并发「加守卫」PR 各自 append 一条时，
git 合并会把两条落在**同一个数组**上 ⇒ 冲突，且需要人工：① 保留两侧条目；② 把后侧条目的 `from`
改为前侧最后 `to`；③ 把末条 `to` 改为合并后**实测值**。**轴 I 能捕获拼接错误**（链断裂即报红），
但**拼接动作本身是手工**、按次数线性增长 —— 属流程自动化缺口（非判据漏洞，也非假绿）。

```bash
npm run ratchet:rechain                     # 体检：不改文件；有待改写即 EXIT=1
npm run ratchet:rechain -- --write          # 应用「补齐 from 链条 + 收紧声明基线」
npm run ratchet:rechain -- --write --issue '#408' --reason "…"   # 显式授权把天花板抬到实测
```

**它做什么（判据纯函数 = `scripts/lib/ratchet-rechain.js`，CLI 只做 IO/文本手术）**：

| 动作 | 说明 |
|------|------|
| 补齐算术 | `from_i ← to_{i-1}`（i≥1）—— 纯算术，**不可能**抬高任何上限 |
| 追加留痕 | `实测 > 天花板` 时，**须显式授权**（`--issue` + `--reason`）才追加；`from`/`to` **由实测派生**（人不写数字） |
| 收紧声明 | `E1_BASELINES[dim] ← 实测`，**只在实测 ≤ 天花板**时（无授权绝不上调天花板） |

**保留原两条判据**：「不许静默上调」（现值 ≤ 棘轮基线）与「留痕必填」一条未动 ——
本 CLI 不改判据，只做「人工重算 → 一条命令」的替换。

⚠️ **为什么不采「`to` 全量派生自实测」（Issue #408 方案 A 的评估结论，据实记账）**：
留痕条目是**历史**记录（`to_i` = 当时的实测），只有**末条**语义与「现值」重合。若把 `to` 全派生自
**当前**实测，则天花板 ≡ 当前实测 ⇒ 「不许上调」判据**退化为恒真**（与 R3-F1 / 第 8 轮 F1 已删的
`E1_RATCHET_BASELINES` 副本表同族：判据恒真 = 白写）。故采**方案 B**（可执行重链），原判据一条不减。

⚠️ **实现自限（显式披露）**：改写只经**锚定正则 / 条目原文定位**，不做 AST 重写（AST 序列化会清空
注释，而本仓注释承载沿革与自限披露）。因此对块内格式有依赖 ⇒ 改写后**内置重跑轴 I** 做端到端校验，
结构不符即报红而非静默写坏。**实测踩过的三坑**（均已在 CLI 内注明）：① 单行条目漏解析（按 `^\s+from:`
行锚定会漏改单行条目且**静默**）；② 追加时块尾无换行导致两对象**粘连**（即本 Issue 手工缺陷的机器版）；
③ **追加留痕本身写长守卫源码** ⇒ 「测→追加」无不动点（发散）⇒ 拆为「结构改写一次 + 数值定式迭代」。

⚠️ **体量口径同步**：`scripts/lib/guard-sources.js` 的枚举面从 `validate-*.js` 扩到
`validate|ratchet-*.js` —— 否则**改个文件名前缀**即可逃出体量分母（第三刀治掉的「合法抬高/逃出棘轮」形态）。
自限：其余 `scripts/*.js` 工具（`gen-` / `lint-` / `run-` / `sync-` / `upload-` / `rewrite-`）不入分母
（它们不读写任何棘轮/契约值）；将来若获得改写契约值的能力，须并入枚举。

- **专测**：`tests/ratchet-rechain.test.js`（12 例；含**变异自证**：注入「并发两条留痕 + 粘连」⇒
  原状轴 I 报 `留痕链断裂`、重链后回绿；无授权时 CLI **拒绝并 EXIT=1** 且不改写天花板）

### 4.3 指路文案预算（Issue #352 第四刀）

`GUIDE_MAP` 是 AI **被打断时**要读的字，此前**是唯一不受任何闸门约束的膨胀维度**
（E1 只量守卫源码、体量闸门只量行数 ⇒ 文案想写多长写多长）。实测改前：14 条合计 **1272 字**、
平均 91 字、最长 184 字（P2），相当于在 `Error.message` 里塞了一篇小作文；且 `enhanceBlock`
还会按触发次数把同一段文本**逐级加长**重放（第 2 次「重复提醒」、第 3 次「强警告」）——
次数只增 token，不增信息。

现由 `npm run validate:semantic-anchor-scope`（轴 I）断言两条**独立**判据
（⚠️ 第十刀：原独立 K7 守卫已整体删除，两条判据并入轴 I）：
① **完整性**：`enhanceBlock` 字面量标签集合 ↔ `GUIDE_MAP` 键集合 双向相等（防漏接/死条目）；
② **文案预算**：每条 ≤60 字、合计 ≤600 字（判据纯函数 = `scripts/lib/semantic-anchor-scope.js` 的
`PER_ENTRY_MAX` / `TOTAL_MAX`）。

同轮：`enhanceBlock` 恒发**同一条短指路**（删掉计数状态与三段加长分支），14 条文案压缩至
**596 字 / 最长 58 字**（−676 字）。**自限**：只量字数，不量「是否真的更易懂」。

### 4.4 工具结果「信封契约」（Issue #401 W-2）

治理层据 handler 结果判「成功/失败」时，**唯一契约面 = 工具调用结果信封**。它的三层流转是：

```
ToolCallResult（wps-office-mcp/src/types/tools.ts，唯一定义者）
  → mcp-server.ts 投影 { content, isError: !result.success }   ← success 在此被剥离
    → 治理插件 after 钩子入参（TS 无法类型化）
```

- **只有 `isError` 能跨这三层存活** ⇒ 消费点**不得**读 `success`（运行时恒 `undefined`）；
- 失败态**另有**一条人类可读通道：`content[]` 里的中文标记（治理层经 `getOutputText` 读取）；
- **真值表**（`enableTrackChanges`，置位值 = 本次是否要求开启）：

| 形态 | 结果 | 说明 |
|---|---|---|
| 缺省 `enable` + 失败 | 不得认为已开启 | schema 默认 `true` ⇒ 缺省按「请求开启」 |
| 缺省 `enable` + 成功「已开启」 | 认为已开启 | — |
| 显式 `enable:false`（关闭）失败 | 仍认为已开启 | 关闭失败 ⇒ 修订很可能仍开，不得假红 |
| 显式 `enable:true`（开启）失败 | 不得认为已开启 | 未生效 |

- **守卫**：`npm run validate:payload-envelope`（`scripts/validate-tool-result-payload.js`，已入 `preflight`）
  - 判据① 消费点只读**投影后仍存在**的键（含**间接读**面：`const k='success'; out[k]`）；
    判据①′ 消费点**至少读一枚**（防不变量被静默移除）；
  - 判据② 兜底文案不得含**字段名**标记；判据③ 契约字段名可从 TS 源码派生；
  - 判据④ 允许集合**不得含投影后不存在的键**（独立来源 = 投影公式，防放宽自指）；
  - 单一来源：字段名派生自 `types/tools.ts`；允许集合 = `scripts/lib/semantic-anchor-scope.js`；
  - 专测 `tests/validate-tool-result-payload.test.js`（12 例，含 M1~M10 变异自证）。
- **自限（显式披露）**：判据断言**键名同一**，**不**断言投影式 `isError = !result.success` 的**取值语义**
  （由 `proofread-envelope-contract-401.test.ts` 的真实链路用例承担）；
  间接读面只覆盖「绑定值 = 字段名」的直接别名，经再赋值/函数参数/对象属性间接传递者不声称拦住。

> 「绝不增加」由此闸门 + 上表四条棘轮判据共同保证：**任何新增都必须先删等量内容**
> （`REPORT_SOURCES` 按职责显式登记，改名/搬家不登记即由 S0 报红；新增一文件而不入清单亦同）。
### 5. 提交并推送

```bash
git add .
git commit -m "feat(mcp): 添加 xxx 功能"
git push origin feat/your-feature
```

### 6. 创建 Pull Request

见 [PR 描述模板](#六提交规范)。

---

## 五、代码规范

### JavaScript（WPS 插件）

**必须遵守**（兼容 WPS 内置 Chromium 103/104）：
- 使用 ES5 语法：`var`（非 `let/const`）、`function`（非箭头函数）、回调（非 async/await）
- **必须使用 `XMLHttpRequest`，禁止 `fetch`**（WPS Chromium 104 的 fetch Promise 永远 pending）
- **禁止 `ReadableStream`/`TextDecoderStream`**（WPS 104 不完整支持）
- 所有路径处理用绝对路径 + `validateFilePath()`

### TypeScript（MCP）

- 启用 strict 模式
- 小驼峰命名
- JSDoc 风格注释
- 所有接受文件路径的 handler 用 `validateFilePath()`（在 `try` 块内）

### 通用

- 命名小驼峰
- JSDoc 注释
- Prettier 格式化（`npm run format`）

---

## 六、提交规范

使用 **Conventional Commits**：

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

### PR 描述模板

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

## 七、测试

```bash
# 统一预检门禁（提交 PR 前必须运行，确保所有自动化检查通过）
# 前置条件：先安装 MCP 依赖（preflight 含 cd wps-office-mcp && npm run lint && npm test）
#   cd wps-office-mcp && npm install   （或 npm run mcp:install）
npm run preflight
# 运行全部根单测（tests/*.test.js，排除 e2e）
# 退出码语义（Issue #297）：0 = 全部通过；1 = 测试断言失败；2 = 前置依赖缺失
#   （未执行 npm install，会打印「请先执行 npm install」而非裸 Cannot find module）
npm run test
# 运行 e2e 集成测试（真实 HTTP mock 链路）
npm run test:e2e
# 全仓 JS 语法检查
npm run lint
# MCP ESLint 静态规则检查（TypeScript，Issue #185 补建；preflight 已含，此处为单独执行）
cd wps-office-mcp && npm run lint
# 格式化代码（Prettier）
npm run format
# 检查格式（Prettier）
npm run format:check

# 路径安全测试
cd wps-office-mcp && npx jest src/tests/unit/path-safety.test.ts

# MCP 测试
npm run mcp:test

# MCP 单元测试
cd wps-office-mcp && npm run test:unit

# MCP 开发模式
cd wps-office-mcp && npm run dev
```

> 📖 测试也是 PR 门禁的一部分，见 [第八节](#八cicd-门禁)。

---

## 八、CI/CD 门禁

`.cnb.yml` 定义了 CNB 平台的 CI/CD 流水线。`main.push` 触发**全量门禁测试**：

| 校验项 | 命令 | 说明 |
|--------|------|------|
| settings 校验 | `node scripts/validate-settings.js` | 校验 NPC settings |
| 版本校验 | `node scripts/validate-versions.js` | 版本号一致性 |
| 工具数量 | `node scripts/validate-tool-counts.js` | 内置/注册/COM Actions 三数全部派生自代码（见输出） |
| NPC_TEAM | `node scripts/validate-npc-team-prompt.js` | 提示词双源一致性 |
| NPC_TEAM 防腐 | `node scripts/validate-npc-team-bloat.js` | 提示词自身防腐（行数/铁律数/重复/未登记引用/环节覆盖，Issue #312） |
| NPC_TEAM 同步 | `node scripts/sync-npc-team-skill.js --check` | Skill 同步检查 |
| 单测 | `node tests/*.test.js` | 安全/Launcher/Mac/Linux/桥接共享层回归 |
| 桥接共享层漂移 | `node tests/wps-bridge-shared.test.js` + `node scripts/sync-wps-bridge.js --check` | 单一来源一致性 + 平台产物无漂移（消除三平台 handler 重复重构） |
| JS 语法 | `node --check <file>` | 三平台脚本 + 共享层语法门禁 |
| MCP | `cd wps-office-mcp && npm ci && npm run test:unit && npm run test:integration` | MCP 单测 + 集成测试 |

提交 PR 前建议本地跑一遍门禁，避免 CI 失败。

### Code Wiki 生成（`tag_push` → `codewiki` 插件）

`.cnb.yml` 顶层 `$` 下另配置了 `tag_push` 事件，打 tag 时自动运行 **CNB Code Wiki（codewiki）插件**，读取仓库代码 + `docs/` 现有文档生成项目 Wiki：

```yaml
$:
  tag_push:
    - docker:
        image: cnbcool/codewiki:latest
      stages:
        - name: generate codewiki
          timeout: 10h
          settings:
            git_doc_dir: /data/codewiki/${CNB_REPO_SLUG}   # 必填
            knowledge_enabled: true                        # 生成 Wiki 自动入库仓库知识库
```

- **`git_doc_dir`**：必填项，指定 codewiki 插件的临时工作目录（官方示例写法）。
- **`knowledge_enabled: true`**：生成内容自动同步到仓库知识库，可被 AI 问答引用。
- **触发时机**：仅 `tag_push` 事件触发（打 tag 时），与 `main.push` 全量门禁互不干扰。发布时打 tag 即可触发 Wiki 生成，生成后仓库首页出现 Wiki 入口。

> ⚠️ **文档链接规范（Issue #204）**：codewiki 生成 Wiki 时**不会重写仓库内相对链接**，若 `docs/` 文档使用相对路径（`./xxx.md`、`../xxx.md`）互相引用，Wiki 页面内点击会 404。因此 `docs/` 与根 `README.md` 中的内部链接**一律使用 CNB blob 绝对链接**（`https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/xxx.md`），由脚本 `scripts/rewrite-wiki-links.js` 统一维护，并以 `npm run validate:wikilinks` 在 CI 校验，禁止新增相对链接。

### Wiki 手动上传脚本（`scripts/upload-wiki.js`，方案 A）

`.cnb.yml` 的 `tag_push` 事件中，在 codewiki 插件**之前**先运行 `scripts/upload-wiki.js`（方案 A），把 `docs/` 按 `WIKI_MENU` 的 4 大分类直接调用 `upload/wiki/file` API 上传为 Wiki 页面（绕过 codewiki 插件 LLM 生成缺陷，Issue #117/#204）：

```yaml
- name: upload wiki docs
  image: node:22
  run: |
    node scripts/upload-wiki.js
```

- **`WIKI_MENU`**：脚本顶部定义的 Wiki 菜单结构（4 大分类 + 各分类下 `docs/` 文件名），与仓库首页 Wiki 导航保持一致；新增文档需同步登记到对应分类的 `files`。
- **`WIKI_NAME_MAP`**：源文件名 → Wiki 中文显示名映射（如 `USAGE.md → 使用说明.md`），让 Wiki 左侧导航显示中文名称而非英文文件名；新增文档若希望导航显示中文名，需在此登记。`wikiName()` 函数负责转换，未映射的源文件名原样返回（`README.md` 保持原英文名不映射），映射值缺少 `.md` 后缀或含路径分隔符 `/` 时会输出警告。命名规范：优先使用纯中文；英文专有名词（MCP/OpenCode/WPS/API/Skills）保留原拼写；缩写组合（WPSJS/WPS_COM_PS1）保留下划线转空格，不拆分缩写字母。
- **`CATEGORY_INDEX`**：一级目录“同名”落地页配置（Issue #210）。Wiki 导航会把每个一级目录渲染成“与一级目录同名”的首个子节点（指向裸目录路径如 `/-/wiki/使用指南`），此前裸路径无页面会 404。脚本为每个一级目录额外上传一页裸路径落地页：
  - 存在同名文档的目录（使用指南→`USAGE.md`、开发指南→`DEVELOPMENT_GUIDE.md`）：复用该文档内容并在顶部加一行「本页为「××」分类入口页」说明；
  - 无同名文档的目录（平台专题/内部参考）：用 `buildCategoryIndex` 生成“分类索引页”，汇总本目录全部 Wiki 文档链接（链接指向 Wiki 内页面并做 URL 编码）。
- **防御行为**：未知分类抛「未知 Wiki 分类」错误；同名文档缺失时回退为索引页并打印警告（不终止上传流程）；`WIKI_MENU` 中未配置落地页的一级目录打印警告（防 404 复发）。
- **单测**：`tests/upload-wiki.test.js`（12 用例）覆盖落地页生成/复用/回退/编码/未注册警告，`npm run test` 会运行。

> ⚠️ **实测结论（Issue #117，2026-08-23）**：`upload/wiki/file` API 在 CI（tag_push）环境下**无法认证上传**（JSON `401 errcode:16`、multipart `400 errcode:3`），流水线临时令牌 `CNB_TOKEN` 对该内部 API 无权限。因此当前 `upload-wiki.js` 在 CI 中不会成功上传，需由用户本人（OAuth 权限）网页手动上传 `docs/`，或等平台修复 codewiki 插件 LLM 缺陷后自动生成；脚本保留作平台能力恢复后的自动尝试。

---

## 九、二次开发

### 新增一个 Word 工具（示例）

1. 在 `wps-office-mcp/src/tools/word/` 新建 `my-tool.ts`（含入参/出参类型 + 校验）
2. 在 `src/tools/index.ts` 的 `allTools` 注册
3. 编译：`cd wps-office-mcp && npm run build`
4. 校验：`npm run validate:toolcounts`
5. 重启 OpenCode，工具即被 MCP 注册

### 新增一个 Skill

1. 在 `skills/` 新建目录 `skills/my-skill/`
2. 添加 `SKILL.md`（frontmatter + 概述/能力/工具/工作流/限制）
3. `node install-addons.js` 同步
4. 重启 OpenCode

### 新增一个 Agent

1. 在 `agents/` 新建 `my-agent.md`（含 frontmatter）
2. `node install-addons.js` 同步
3. 重启 OpenCode，即可在 Agent 列表选择

### 新增一条治理规则

1. 在 `.opencode/plugins/governance.js` 的 before/after 钩子中新增规则
2. 保持编号连续（G/P/T 系列）
3. `node install-addons.js` 同步
4. 重启 OpenCode，并确保 CI 校验通过

---

## 十、常见问题

### 插件不显示

- 检查 WPS 版本是否 ≥ 12.1.0
- 重启 WPS Office
- 运行 `node install-addons.js` 重新安装

### MCP 连接失败

- 检查 OpenCode 服务是否启动
- 检查端口 14096 是否被占用
- 查看 `~/.config/opencode/opencode.json` 配置
- 在**仓库根目录**运行 `cd wps-office-mcp && npm install && npm run build && cd ..`，然后重启 OpenCode

### 服务启动失败

- 检查 Launcher 是否运行：`schtasks /Query /TN "OpenCodeLauncher"`
- 手动启动：`schtasks /Run /TN "OpenCodeLauncher"`

### Skills/Agents 未加载

- 重新运行安装脚本 + 重启 OpenCode

### 工具数量校验失败

- 运行 `npm run validate:toolcounts`，按提示调整 `tools/index.ts` / `gateway/index.ts` / `mcp-server.ts`

---

## 十一、联系方式

- GitHub Issues: 报告 Bug 和问题
- GitHub Discussions: 提问和讨论
- GitHub Releases: 查看公告

---

感谢你的贡献！
