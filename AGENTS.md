# AGENTS.md

## Project

OpenCode WPS — WPS Office plugin embedding an AI chat sidebar (OpenCode AI) into WPS Writer, Spreadsheet, and Presentation.

## Architecture (critical)

Source files (git-tracked) are installed to user directories (not git-tracked):

```
opencode-wps/          → %APPDATA%\kingsoft\wps\jsaddons\opencode-wps_\
wps-office-mcp/        → ~/.config/opencode/opencode.json (MCP config entry)
skills/                → ~/.opencode/skills/
agents/                → ~/.config/opencode/agents/ + ~/.opencode/agents/
.opencode/plugins/     → ~/.config/opencode/plugins/
```

**Rules:**
- Edit source files only, then run `node install-addons.js` to sync
- Never edit files in `~/.opencode/skills/`, `%APPDATA%\kingsoft\wps\jsaddons\`, `~/.config/opencode/opencode.json`, or `~/.config/opencode/agents/` — these are install artifacts
- Verify with `git status` after every change to avoid editing the wrong directory

## Key Commands

```bash
node install-addons.js          # One-shot install: WPS plugin + MCP build + skills/agents/plugins sync
npm run build                   # Build MCP server (cd wps-office-mcp && npm run build, or root shortcut)
npm run mcp:install             # Install MCP dependencies
npm run mcp:test                # Run MCP tests (cd wps-office-mcp && npm test)
npm run format                  # Format with Prettier
npm run format:check            # Check formatting

# CI 门禁本地预检
npm run validate:toolcounts     # 工具数量校验（内置/注册/COM Actions 全部派生自代码，见输出）
npm run validate:agent-no-tools # agent 不带 tools 白名单校验（防 Issue #247 根因复发）
npm run validate:npc-team       # NPC_TEAM 提示词双源一致性校验
npm run validate:npc-team-bloat # NPC_TEAM 提示词防腐校验（行数/铁律数/重复/未登记引用/环节覆盖，Issue #312）
npm run validate:versions       # 版本号一致性校验
npm run validate:settings       # .cnb settings 校验
npm run validate:skill-docs    # skill 文档引用命中根 docs 单一来源校验
```

**Order matters**: Edit source → `node install-addons.js` → restart WPS / OpenCode service.

## Project Structure

```
opencode-wps/              # WPS JS add-in (main.js, taskpane.html, ribbon.xml, config.js, launcher.js)
  opencode-proxy.js        # CORS proxy (port 14098, strips CSP headers)
opencode-wps-assistant/    # macOS JS add-in (reverse polling bridge, no Chat UI)
  wps-auto.sh              # macOS WPS app switch script (open + pkill)
opencode-wps-linux/        # Linux JS add-in (reverse polling bridge, separate dir)
  wps-auto.sh              # Linux WPS app switch script (wps/et/wpp + xdg-open)
wps-office-mcp/            # MCP server (TypeScript, COM Actions + built-in tools；数量以代码为准)
  src/                     # Server, client, tools, types, utils
    client/                # wps-client (win32/mac/linux channel routing)
      mac-poll-server.ts   # Reverse polling server (reused by Linux via constructor)
      linux-poll-server.ts # Linux poll server (injects Linux wps-auto.sh path)
    utils/path-safety.ts   # Path validation (validateFilePath/validateImagePath/isAllowedUrl)
skills/                    # 5 OpenCode Skills (wps-excel/word/ppt/office/proofread)
  # 单一来源方案 C：skill 的 SKILL.md 以 docs/xxx.md 引用设计文档时，根 docs/ 为唯一事实源，
  # 安装期 install-addons*.js 从根 docs/ 派生（见 scripts/lib/derive-skill-docs.js），git 层不保留双份。
  # 校验：npm run validate:skill-docs
  README.md                # MUST READ before modifying skills
agents/                    # 4 agent definitions (wps-expert, wps-word, wps-excel, wps-ppt)
  # 约束：agent front-matter 不设 tools 白名单——MCP 工具运行时带 wps-office_ 前缀，裸名白名单会匹 0 个工具致调不到。
.opencode/
  plugins/governance.js    # Execution governance plugin (G2-G7 + P1-P4 + T1-T11 rules)
  opencode.jsonc           # OpenCode config template (merged into ~/.config/opencode/opencode.json)
install-addons.js          # One-shot install script (8 steps) — Windows
install-addons-mac.js      # One-shot install script — macOS (launchd autostart)
install-addons-linux.js    # One-shot install script — Linux (XDG autostart)
launcher-mac.js            # macOS Launcher process (lsof/kill/ps + open, port 14097)
launcher-linux.js          # Linux Launcher process (/proc scan + xdg-open, port 14097)
docs/                      # 文档中心（docs/README.md 四象限索引，改文档先读它）
```

## MCP Server

`wps-office-mcp/` is a TypeScript MCP server. Key commands:
```bash
cd wps-office-mcp && npm install && npm run build   # Must build before MCP works
cd wps-office-mcp && npm test                        # Jest tests
cd wps-office-mcp && npm run test:unit               # Unit tests only
cd wps-office-mcp && npm run dev                     # Dev mode (ts-node)
```

Three-tier tool system:
- **built-in tools** (`wps_xxx`) — always registered via MCP, **directly callable**（「网关强制」规则已随 Issue #382 DECISION-1 整体删除：注册层不再有「网关专属」黑名单）
- **registered tools** (`wps_xxx_xxx`) — TypeScript handlers, routed via Gateway (数量**以代码为准**，不手写：`wps-office-mcp/src/tools/gateway/com-actions.ts` 的 `COM_ACTIONS` / `wps-office-mcp/src/tools/index.ts` 的 `allTools`，校验见 `scripts/validate-tool-counts.js`)
- **COM Actions** — discovered on-demand via `wps_office_search`/`wps_office_execute` Gateway tools（数量以 `gateway/com-actions.ts` 的 `COM_ACTIONS` 数组长度为准）

WPS must be running for any MCP operation.

## WPS Plugin

`opencode-wps/` contains the JS add-in. Key files:
- `config.js` — global config hub (`CONFIG` object: OpenCode port 14096, Launcher port 14097, user home)
- `main.js` — ribbon callbacks, state management, OpenCode connection
- `taskpane.html` — chat UI (SSE streaming, Markdown rendering, session/agent management)
- `launcher.js` — background process managing OpenCode service lifecycle
- `opencode-proxy.js` — CORS proxy (port 14098, strips CSP headers for WPS Chromium)

All file paths in WPS operations must be absolute.

## Governance Plugin

`.opencode/plugins/governance.js` intercepts all MCP tool calls at runtime via OpenCode Plugin Hooks (`tool.execute.before`/`after`):
- **G2-G7**: Gateway enforcement, destructive confirmation, path safety, password protection, parameter validation
- **P1-P4**: Proofreading rules — P1 批次推进前置 / P2 替换与收尾前置 / P3 替换内容校验 / P4 进度真实性
- **T1-T11**: Template filling rules (evaluate doc, batch ≤200, track revisions, no fabricated fields)

判定标准：**治理层只保留校验「服务端不具备的独立信息」**。凡服务端（`proofreadAccumulate` /
`generateProofreadReport`）已独立强制的口径（进度递增、单批增量上限、覆盖门禁、`doc_info` 必填、
批次表与凭证、会话落盘恢复），治理层不再做第二份实现——同一语义两层各写一遍只会产生
「两层状态不同步」（AI 卡死或误拦）。拦截消息统一经 `enhanceBlock` 追加 `GUIDE_MAP` 指路文案。

**指路文案有预算**（Issue #352 第四刀）：每条 ≤60 字、合计 ≤600 字。
⚠️ **Issue #352 第十刀**：原独立 K7 守卫（`validate-governance-guide-map.js` + `lib/governance-guide-map.js`）
已**整体删除**（F6「删执行者留孤儿」的彻底收口）；其两条独立判据（①「标签 ↔ 键双向闭合」② 文案预算）
**并入轴 I**（`validate:semantic-anchor-scope`）——仍是两条独立判据，只是换了 owner。
其**消费端落点随实现同步登记**（`semantic-anchor-scope.js` + 其 CLI 登记为 `governance-guide-map` 落点），
不留「消费端未登记」的孤儿；K7 专测**回补**在轴 I 测试内（原独立专测随刀删除，迁移不得连测试一起丢）。
文案**恒为同一条短指路**——不按触发次数逐级加长：把同一段长文本在第二次/第三次触发时再念一遍
不提供任何新信息，只让 AI 在被打断时读更多字。长正解应放 `SKILL.md`（AI 一次性读到）。
预算为 0 的旧状态是「唯一不受任何闸门约束的膨胀维度」（14 条合计 1272 字 / 最长 184 字）。

Modify in `.opencode/plugins/governance.js`, then `node install-addons.js` to sync.

### R10 跨通道连通性（Issue #335，轴 I）

校对线复发的第六类形态是「**一个概念被哪几条守卫覆盖**」这件事本身也没有唯一归属。
现已把那不变量落成可执行守卫：`npm run validate:semantic-anchor-scope`（**轴 I**，已入 `preflight`）。

- **判据**：「语义键 ↔ 落点集合」**双向集合相等** —— ①覆盖侧（每条落点须被守卫计行范围覆盖，
  由**单一范围表现场计算**判定）；②归属侧（全仓源码树内凡以**代码形态**承载该语义却未登记的文件即报红，
  实测拦得住 R10 的 A/B 探针）。
  ⚠️ **Issue #352 第九刀**：原「方向 2（`covered` 声明对账）」与「AC4（豁免过期 + `waiverBy` 留痕）」
  两个判据已删除 —— 实测掏空二者轴 I CLI 仍 `EXIT=0`（零独立判别力），且清单 `covered` 恒 `true`、
  `waiver` 恒 `null`（零对象）⇒ 互为自指骨架；豁免口随之删除（覆盖只能靠真覆盖）。
  ⚠️ **自限（显式披露，非放宽）**：本刀删除判据后，E1 各维（守卫/判据/清单/范围模块的有效代码行与
  分支数）**实测值下降但棘轮基线未同步收紧**（`libCodeLines` 余量最大 50 行）⇒ 测「E1 删后未收紧」
  不报红（`checkRatchet` 只禁上调、不强制下调）。承接方 = 代码评审纪律（改判据时同步核 E1 基线）+
  第五刀（PR #368）将整体移除该机制。**不假装仍被覆盖**（强改需给守卫体系自身净增 ~51 行留痕数据
  并上调守卫体量棘轮，即第五刀认定为「制度性维护负债」并删除的机制，故不强行整改）。
- **单一来源**：清单 `SEMANTIC_ANCHORS` 在 `scripts/lib/semantic-anchor-manifest.js`；
  覆盖范围 `GUARD_SCOPES` 在 `scripts/lib/guard-scopes.js`（判据模块内**无仓库路径字面量**）；
  判据纯函数在 `scripts/lib/semantic-anchor-scope.js`。
- **覆盖源必须有执行者**：`GUARD_SCOPES` 每条声明带 `script`，判据断言「该脚本真实存在 +
  真的 require 单源」—— 没有执行者的覆盖声明即报红（历史假绿来源）。
- **自限（显式披露，非放宽）**：以代码形态的导出符号 / 具名常量 / 具名函数为归属主判据，
  **不声称**拦住「不用新符号、只改语义细节」的隐性同义实现。

⚠️ **Issue #325 更新**：`validate-proofread-budget.js` / `validate-proofread-convergence.js` /
`validate-proofread-repro-lock.js` / `validate-coordinate-contract.js` 与校对线防腐文档
（`docs/proofread-*.md` / `docs/batch-state-machine.md`）已整体删除（用户决策「真动刀」）。
**第二刀（收尾）**：上列四守卫中残留的 repro-lock（空断言）+ coordinate-contract（只查名字）
已删除；`guard-scopes.js` 里的「已删守卫行数范围」亦删除（无执行者的范围 = 假覆盖），
范围表只登记存活的真实守卫（`validate-gateway-membership.js` / `validate-semantic-anchor-scope.js`），
后者已接入 `preflight`。

⚠️ **校对单测已重建**（Issue #341，勿再照旧说法认为「已整体删除」）：`wps-office-mcp/src/tests/unit/`
下 4 个文件、62 例（`proofread-normalize-contract` / `proofread-context-guards` /
`proofread-coordinate-contract` / `proofread-fixaction-gate-e2e`），由 `cd wps-office-mcp && npm test` 覆盖。

### 校对线体量闸门（Issue #341「只大幅压缩、绝不增加」）

`npm run validate:proofread-report-size` 已从「**仅** `proofread-report.ts`」扩为**校对线全层**：

- **计行对象** = `REPORT_SOURCES` 显式清单（9 个校对源码文件，含 `proofread-report-copy.ts` 文案层）；
  ⚠️ **文案层同口径计入**，单列文件≠免约束 —— 否则它就是「不计行的文案抽屉」，正是本闸门要防的形态。
- **断言**：S0 归属（清单声明的必须存在）/ S1 总量 / S2 单文件 / S3~S5 校对源码棘轮（共享判据 `scripts/lib/ratchet.js`）。
  ⚠️ **S6 双向归属 / S7 逐文件上限已删**（Issue #352 第三刀）；**S8（守卫源码总量棘轮）已迁出**
  （第五刀，见下节）—— 本闸门此后**只量校对源码**，不再持守卫侧清单与棘轮常量。
- **现状**：9 文件合计 **1824 行**（压缩前 2822），棘轮 `LIMITS === RATCHET === ACHIEVED === 1824`（Issue #352 方案 A+B+D 收紧）。
- ⚠️ `.prettierignore` 对该清单**同集放宽**（prettier 会把紧凑写法重新撑开，实测 299 → 808 行）；
  格式纪律改由本闸门承担；同集一致性由回归测试做**双向集合相等**断言（`.prettierignore` 的
  `BEGIN/END 体量闸门豁免清单` 区块 ↔ `REPORT_SOURCES ∪ 机械枚举`，多写/漏写均报红）。

### 守卫/元数据源码体量（**轴 I 维度 `guardSourceLines`**，Issue #352 第五刀）

守卫与元数据脚本**不在** `REPORT_SOURCES`（它们不是「校对能力」），但**同样受物理行数棘轮约束** ——
现由**轴 I**（`npm run validate:semantic-anchor-scope`）的 **E1 维度 `guardSourceLines`** 承担，
口径 = **物理行数总量**（含注释/空行），其余 E1 维度为有效代码行（剔注释）⇒ 两口径**分工并存、互不可推**
（给守卫追加 300 行纯注释：本维度报红、其余维度不为所动）。

集合由 `scripts/lib/guard-sources.js` 的 `discoverGuardSources()` **机械枚举**
`scripts/validate-*.js` + `scripts/lib/*.js`（**唯一来源**，三方共用：体量闸门 / 轴 I / 测试）
—— 新增守卫文件**自动进分母**，不再需要「登记」动作。

**为什么从体量闸门迁入（第五刀）**：原 S8 与轴 I 的 E1 是**同一判据的两份实现**（各自维护「不许上调 /
值与留痕对账 / 达标即收紧」）。保留两份 = 同一语义两处写（本仓反复在治的形态），且 S8 的
「达标即收紧」在第三刀改机械枚举后**任何非破坏性改动都会报红**（棘轮表 5519 与实测并列对比）
⇒ 只能改棘轮表放行，属维护负债。收敛为**一份实现 + 一个维度**后，`checkRatchet` 的
「达标即收紧」分支全仓零有效调用，同刀删除（−4 行不变量）。

**为什么砍（第三刀）**：旧形态下新增一个守卫要动 **6 处**（`GUARD_SOURCES` / `GUARD_SCOPES` / 语义清单 /
`E1_RATCHET_LOG` / `.prettierignore` / `preflight`），且登记进 `GUARD_SOURCES` 即**合法抬高棘轮** ⇒
形成「发现问题 → 加守卫 → 登记 → 棘轮上调 → 通关」的**自我许可循环**（#314 反例的同构形态）。
自动枚举把分母变成**机械事实**：加守卫自动增行 ⇒ 必超基线 ⇒ 报红，要放行只能**显式留痕**（`upgradeLog`）
或**先删等量** —— 自我许可通道当场断掉。

**断言 = 轴 I 的 E1 棘轮维度**（不许上调 + 值与留痕对账 + 留痕必填）。自限：枚举**不递归子目录**、
仅两个显式目录（当前该两目录均无子目录）；E1 上限 = 基线 ×1.05（余量**构造保证**）。
枚举模式 = `scripts/` 下 `validate-*.js` + `ratchet-*.js`（Issue #408：`ratchet:rechain` 能改写棘轮基线，
故与守卫同口径计入；否则**改个文件名前缀**即可逃出分母）+ `scripts/lib/*.js`。

### E1 留痕重链 `npm run ratchet:rechain`（Issue #408）

E1 留痕是 **append-only 链**（每条 `from == 上一条 to`）。两个并发「加守卫」PR 各自 append 时，
git 合并落在同一数组 ⇒ 需**人工拼接**（保留两侧 / 改 `from` / 末条 `to` 回写实测）——拼接错误轴 I 能捕获
（报「留痕链断裂」），但**拼接动作本身是手工**、按次数线性增长。现落成一条命令：

```bash
npm run ratchet:rechain                     # 体检（不改文件；有待改写即 EXIT=1）
npm run ratchet:rechain -- --write          # 应用「补齐 from 链 + 收紧声明基线」
npm run ratchet:rechain -- --write --issue '#N' --reason "…"     # 显式授权把天花板抬到实测
```

- **单源**：判据纯函数 = `scripts/lib/ratchet-rechain.js`；度量口径 = `scripts/lib/e1-metrics.js`
  （守卫与 CLI 共用，不得各写一份计数）；棘轮契约 = `scripts/lib/ratchet.js`（**未改**）。
- **保留原判据**：「不许静默上调」（现值 ≤ 棘轮基线）与「留痕必填」一条不减 ——
  CLI 只把「人工重算」换成一条命令；`from`/`to` **由实测派生**，但**授权必须显式**。
- **评估结论（不采方案 A，据实记账）**：若把留痕 `to` 全派生自**当前**实测，则天花板 ≡ 当前实测
  ⇒ 「不许上调」**退化为恒真**（与已删 `E1_RATCHET_BASELINES` 副本表同族）。
- **自限**：文本手术只经锚定正则 / 条目原文定位（不做 AST 重写，以保住承载沿革的注释）⇒
  对块内格式有依赖；故 `--write` **内置重跑轴 I** 端到端校验，结构不符即报红。
- **专测**：`tests/ratchet-rechain.test.js`（12 例，含「并发两条留痕 + 粘连」变异自证）。

⚠️ 为什么单独设这一节（Issue #341 第 1 轮评审 F1/F2）：轴 I 的 **E1** 口径原为「有效代码行 + 分支数」
（**剔注释**）—— 实测给守卫脚本追加 **300 行纯注释 → EXIT=0**，即「绝不增加」对守卫体系本身无效。
故 **E1 内新增一维 `guardSourceLines`（物理行数）** 与既有各维并存，两个口径**分工并存、互不可推**：
其余维量逻辑复杂度（剔注释），本维量篇幅（物理行数，与校对源码同口径）。

### 文档形态连通性（Issue #359，元问题本体）

`npm run validate:semantic-anchor-scope`（轴 I）覆盖的是**代码形态**的同一语义多处写；
「编号 / 数字 / 口径 / 已删机制描述」**不是代码符号** ⇒ 天然落在轴 I 自限之外（#353~#358 **全部**落在该自限里）。
#359 把该缺口落成**文档形态**守卫（**已入 `preflight`**）：

- **`npm run validate:removed-mechanisms`** —— 两条同族判据，同扫一份文档树：
  ①**已删机制**在**非历史区**的现在时陈述（关键词表以 `scripts/lib/doc-drift-manifest.js` 为唯一事实源，
  本行不重抄清单 —— 防文档成为第二份真值）。双向口径：非历史区命中报红；历史区命中**缺显式标注**
  同样报红（防「挪进历史区即豁免」的作弊口袋）；**标注与陈述行内自相矛盾**亦报红
  （同处既称「历史存档/已删除」又称「仍生效」⇒ 报红，见 `ACTIVE_VOICE_MARKERS`）。
  ②**断档编号**（#353 同族，第十二刀）：文档引用了 `governance.js` 中**不存在**的治理规则编号
  （此处以 `P16`/`P17`/`P25` 作历史坐标举例，非现行编号）⇒ 报红。合法编号集合**运行时从 `governance.js` 头部声明行派生**
  （`RULE_REF_DERIVE`，不手写第二份清单；派生源缺失即报红）。双向口径同 ①。
  自限：只拦 `P/G/T + 数字` token（「第 16 条规则」之类自然语言指代不声称拦住）；只校验编号**是否存在**，
  不校验「用得对不对」（需人工评审）；`P0-1` 这类问题 ID 前缀已排除（负向断言 `(?![-_])`）。

单一来源：数据单源 = `scripts/lib/doc-drift-manifest.js`（关键词表 / 扫描范围 / 历史区豁免）；
判据纯函数 = `scripts/lib/doc-drift-scope.js`（模块内无仓库路径字面量）；覆盖范围 = `lib/guard-scopes.js`。
**自限（显式披露，第十一刀收口后如实记账）**：
① 只拦**关键词命中**，「隐性同义描述」不声称拦住（**仍在**，不可自动化部分）；
② 自相矛盾判定只作用于**命中关键词的那一行** —— 现行时断言词出现在**另一行**
（同段落相邻行 / 跨段落）不声称拦住（**仍在**；原措辞「不在同一行」未点明该机制，已按实测收窄）。
**历史区双向口径（QA-F1）**：历史区内的命中必须带显式标注，否则报红 ——
否则「挪进历史区」就成了免检的作弊口袋。

**第十一刀（自限收口，两条实测洞）**：
- **洞 A（真缺陷，已闭合）**：原判据 `annotated → continue` **先于**历史区判定 ⇒ **非历史区**
  只要顺带写「已删除」即可逃逸（实测 `EXIT=0`）。现改为**先判历史区**，非历史区命中一律报红。
- **自限②可收口部分（已收口）**：原「不校验标注说的是不是同一件事」被这一形态当场利用 ——
  在`## 历史存档`小节内写一行「（历史存档）+ 某已删机制名 + 仍生效 / 推荐使用」曾 `EXIT=0` 放行。
  这不是语义判断题而是**行内自相矛盾**（同一行既称已删又称仍生效）⇒ 现报红
  （断言词单源 = `ACTIVE_VOICE_MARKERS`，本行不重抄该行原文 —— 重抄会被本守卫当场拦下）。
- **评审轮补的一刀（结构性假绿，已闭合）**：`ACTIVE_VOICE_MARKERS` 以**位置参数**追加到判据既有 5 参之后，
  若调用点漏传，原实现 `(activeVoiceMarkers || [])` 会把判据**静默降级为「不启用」**——
  实测守卫 `EXIT=0`、真实注入的行内自相矛盾**不再被拦**，而专测仍 **15/15 全绿**（无任何信号）。
  现判据**显式断言该单源已传入**（缺传即报红、不接受 `|| []` 兜底），并回补 3 例专测
  （缺传必报红 / 判据模块代码里不得兜底 / 残余自限措辞与实测一致）。

> ⚠️ Issue #352「第二刀」删除：原先另有一条 `validate:doc-numbers`（禁文档手写工具数量）——
> 其治的是**文档措辞**而非行为性风险，成本 ≈ 620 行（守卫 + 数据单源 + 测试），
> 实测边际收益过低且自身曾两度逃逸/判据不可复现 ⇒ 整体移除，改由**代码评审**约定。
> 对应落点：`STALE_TOOL_NUMBER_PATTERNS` / `checkDocNumbers` / `validate:doc-numbers` 全链。

#### AC4 复验表（#359 原「为什么逃过守卫」逐条，实测）

| 原判据 | 逃过原因 | 复验（本轮） |
|---|---|---|
| `validate:toolcounts` 只覆盖清单内文件 | `MCP.md`/`ARCHITECTURE.md`/`AGENTS.md` 的 `~39`/`~257` 不在其面 | 数字改**派生引用**（#358/#359 已收敛至代码为准；#373 把脚本内两处手写数字也改为派生）✅ |
| `validate:skill-docs` 不校验节名存在 | 引用了不存在的「校对执行模型」 | `grep 校对执行模型` **0 命中**（#357 已修）✅ |
| 轴 I 只认代码形态符号 | 编号/已删机制描述不是代码符号 | 新增 `validate:removed-mechanisms`（判据 ①）；**第十二刀补判据 ② 断档编号** —— 原「编号回潮」此前后无门禁（实测注入一个已归并编号即全绿，历史坐标），现派生自源码的编号集合 + 6 例变异自证；`grep 'P1[5-9]\|P2[0-9]'` **非存档 0 命中** ✅ |
| `validate:proofread-report-size` 只量行数 | 五维/六维同字节数，删改不触发 | `grep 五维`（代码树）**0 命中**（#355 已修）✅ |
| `validate:npc-team-bloat` 只覆盖 NPC_TEAM.md | 不覆盖 README/docs/* | 由 `removed-mechanisms` 覆盖文档树（已删机制侧）✅ |

## Agents

Defined in `agents/` (installed to `~/.config/opencode/agents/`). Invoke via `@wps-expert`, `@wps-word`, `@wps-excel`, `@wps-ppt` in messages.

## Gotchas

1. **Platform**: Windows only (WPS COM, `%APPDATA%`, `schtasks`)
2. **WPS Chromium**: Bundled Chromium 103 — no modern web features
3. **Launcher**: Runs at `http://127.0.0.1:14097`, manages `opencode serve` on port 14096
4. **CORS Proxy**: Runs at `http://127.0.0.1:14098` (strips CSP headers, used by WPS Chromium)
5. **MCP won't connect** → `cd wps-office-mcp && npm install && npm run build`
6. **Plugin not visible** → Check `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` exists
7. **Skills/agents not loaded** → Re-run `node install-addons.js` + restart OpenCode
8. **Always use absolute file paths** — WPS COM requires them
9. **All file path handlers must use `validateFilePath()`** from `utils/path-safety.ts`
