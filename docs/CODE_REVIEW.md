# OpenCode WPS 代码审查标准与流程（Code Review Standards & Process）

> 适用范围：`lnxsun/opencode-wps` 全仓库（WPS JS 插件、跨平台 Launcher/Install 脚本、`wps-office-mcp` TypeScript 服务、OpenCode Skills/Agents、Governance 插件、Docs）。
> 目标：在保留 CNB NPC 高效产出的同时，建立**系统性质量闸门**，杜绝"NPC 垒屎山"。
> 维护者：代码评审员（NPC）+ 人工终审。本文档与 `AGENTS.md`、`CONTRIBUTING.md`、`.opencode/plugins/governance.js` 配套使用。

---

## 0. 现状诊断（为什么需要这套机制）

| 已有基础（保留） | 结构性缺口（导致屎山） |
|---|---|
| `governance.js` 运行时红线：G1-G7（网关/破坏性确认/路径安全/密码/参数校验）、P1-P16（校对）、T1-T11（模板） | **无 ESLint、无 `tsc --noEmit` 类型检查门禁**，TS 项目只有 `node --check` 语法校验，类型不安全的 `any` 可进 main |
| `validate:*` 治理脚本（settings/versions/toolcounts/npc-team） | **CI 挂在 `main: push` 事后验证**，不是 PR 合并前门禁——代码先合、CI 后跑 |
| `prettier` 格式化 + `format:check` | 缺少**覆盖率阈值**，测试仅覆盖 `wps-office-mcp`，跨平台 add-in/handler/skills 基本无逻辑测试 |
| 三平台 `node --check` + `bash -n` 语法门禁 | 多轮评审是**手工、在 main 上**的，无"评审通过才能合并"强制机制 |
| Jest 单测 + 集成测试（gateway/governance/path-safety/proofread） | NPC 生成代码**无额外约束**：易过度生成、复制三平台、造巨无霸、伪造"完成" |
| 5 个 NPC 角色（含"代码评审员"）+ 已有的 N 轮评审循环 | 缺少**技术债/架构定期评审**机制，重构靠 Issue 被动触发（如 #151） |

**结论**：问题不在"没有审查"，而在"审查是事后、非强制、且对 NPC 生成代码无专项约束"。本文件把审查**前置成 PR 合并门禁**，并给 NPC 代码加专项红线。

---

## 1. 审查原则

1. **正确性 > 性能 > 可读性**。功能不对，其他免谈。
2. **安全红线不可妥协**：路径遍历、命令注入、密钥泄露、破坏性操作未确认——零容忍。
3. **测试是质量证据**：没有测试覆盖的关键路径改动，视为未完成。
4. **NPC 代码视同人类代码，但额外加约束**（见第 5 节）——NPC 不会自觉 DRY、不会自觉控制规模。
5. **小步快跑**：单个 PR 只解决一件事；巨无霸 PR 本身就是一个 🔴 问题。
6. **评审即教学**：每条 🔴/🟡 都要解释"为什么"和"怎么改"，不只挑错。
7. **可回滚**：任何改动必须能在不破坏安装产物的情况下回退。

---

## 2. 严重级别定义

- 🔴 **Blocker（必须修）**：合并前清零。安全漏洞、数据损坏风险、破坏 API/工具契约、类型错误导致运行时崩溃、绕过 governance 红线、缺失关键错误处理。
- 🟡 **Suggestion（应该修）**：强烈建议本轮修复；若本期不修，必须登记到 Tech Debt 列表并 `@` 负责人。
- 💭 **Nit（可选）**：命名、注释、微小风格（Prettier 已管的不要提）。

> 评审员（人/NPC）必须在每条评论标注级别。**禁止"整体看起来不错"式空评**——要么给具体行级意见，要么 Approve。

---

## 3. 通用审查标准（按维度）

### 3.1 正确性
- 是否真正实现了 Issue/PR 描述的需求？边界条件（空值、超长、并发）是否处理？
- 状态机/生命周期是否正确（如 Launcher 的 SSE 探测冷却、服务启停避免振荡）？
- 不变量是否保持（如工具数量 12/240/257、配置双源一致性）？

### 3.2 安全（🔴 优先）
- **路径安全**：任何文件路径处理是否调用 `validateFilePath()` / `validateImagePath()` / `isAllowedUrl()`（`wps-office-mcp/src/utils/path-safety.ts`）？禁止字符串拼接用户路径。
- **命令注入**：`exec`/`spawn`/`schtasks`/`wps-auto.sh` 是否对参数做白名单/转义？禁止拼接不可信输入。
- **密钥**：`LARK_APP_SECRET`、`TENCENT_DOCS_TOKEN` 等是否硬编码？（应走环境变量/secret，参考 `AGENTS.md` 的敏感变量清单）
- **XSS**：`taskpane.html` 渲染模型输出是否转义？Markdown 渲染是否防注入？

### 3.3 性能
- 是否有 N+1（如逐段落校对未批处理）？大文档是否流式/分批（治理要求 ≤200 一批）？
- 是否有内存泄漏（事件监听未释放、定时器未清理）？
- 是否引入同步阻塞（大文件同步读、长循环无 yield）？

### 3.4 可维护性
- **巨无霸**：单文件 > 400 行、单函数 > 80 行、圈复杂度 > 15 → 🟡（历史债务登记，新增禁止）。
- **重复**：跨平台逻辑是否复用 `shared/wps-bridge/*`？三平台 handler 不得复制粘贴（Issue #151 已重构，新增必须复用）。
- **命名与抽象**：是否自解释？魔法数字是否提取为常量？

### 3.5 测试
- 关键路径是否有测试？改了 `gateway`/`governance`/`path-safety`/`proofread` 必须同步改/加对应单测。
- 测试是否**真实**？是否伪造断言、空跑、`expect(true).toBe(true)`？伪造测试 = 🔴。
- 新增工具是否落入 `validate-tool-counts` 校验范围？

### 3.6 错误处理
- 破坏性操作（删除、覆盖、重启服务）是否走 `governance.js` 确认（G 系列）？
- 外部调用（WPS COM、MCP、`fetch`）失败是否有兜底？错误是否向上传播而非吞掉？
- 是否区分"用户错误"与"系统错误"给出可操作提示？

---

## 4. 项目特有红线（来自 `governance.js` + `AGENTS.md`）

以下任一条被绕过 = 🔴 Blocker，且必须在 PR 描述中显式说明"已确认未绕过"：

1. **路径安全**：所有 WPS 文件路径处理必须走 `utils/path-safety.ts` 的校验函数。
2. **工具数量一致性**：新增/修改 MCP 工具必须保持 12/240/257 的注册数量一致（`scripts/validate-tool-counts.js`），并在 PR 附 `npm run validate:toolcounts` 输出。
3. **破坏性操作确认**：删除/覆盖/重启必须经由 governance 钩子确认，禁止在代码里静默执行。
4. **安装产物不入库**：只改源码（`opencode-wps/`、`wps-office-mcp/src/`、`skills/`、`agents/`、`shared/`），**绝不直接改** `~/.opencode/`、`%APPDATA%\kingsoft\wps\jsaddons\`、`~/.config/opencode/opencode.json`。改完跑 `node install-addons.js` 同步。
5. **绝对路径**：WPS COM 操作必须使用绝对路径（运行时约束）。
6. **跨平台一致性**：Windows/Mac/Linux 行为必须对齐；新增平台能力须复用 `shared/wps-bridge`，不得另起炉灶。
7. **配置/版本/提示词双源一致**：改 `.cnb/settings.yml`、`package.json` 版本、`npc-team` 提示词须同步跑 `validate:settings` / `validate:versions` / `validate:npc-team`。
8. **校对/模板规则不被绕过**：`governance.js` 的 P1-P16（批量≤200、严格顺序校对→确认→修复）、T1-T11（模板评估、修订追踪、不伪造字段）不得被代码静默跳过。
9. **发布纪律**：版本升级必须同步 `CHANGELOG.md`，且经 `release:` 提交；不得 silent bump。

---

## 5. NPC 生成代码专项审查（核心）

NPC（DeepSeek V4 Flash 等）通过 Issue/PR 评论触发 `npc:go`，是主要代码来源。**NPC 代码必须同时满足第 3、4 节，并额外满足以下约束**：

### 5.1 NPC 常见"屎山"模式（审查时主动查找）
| 模式 | 表现 | 处置 |
|---|---|---|
| 过度生成 | 为小需求产出大量无关文件/抽象 | 🔴 要求收敛到最小改动面 |
| 复制三平台 | Win/Mac/Linux handler 各抄一份 | 🔴 必须抽到 `shared/wps-bridge` |
| 巨无霸 | `gateway/index.ts`、`main.js` 单文件上千行 | 🔴 拆分（参考 #151 重构） |
| 类型逃逸 | `any` / `@ts-ignore` 绕过检查 | 🔴 禁止；必须显式类型 |
| 伪造完成 | 声称"已测试通过"但无测试/测试空跑 | 🔴 必须附真实 `validate`+单测输出 |
| 不留痕 | commit 无评审轮次、无 Issue 关联 | 🟡 必须 `re: 评审第N轮 (Issue #xxx)` |
| 无界重构 | 顺手改了不相关的模块 | 🟡 拆到独立 PR |
| 静默跳过暂停点 | NPC_TEAM 的暂停点/门禁被跳过 | 🔴 禁止（见治理改造点 2） |

### 5.2 NPC 代码准入门槛（合并前必须全部满足）
1. `npm run format:check` 通过（Prettier）。
2. **新增 ESLint（见第 7 节）零 error**，`tsc --noEmit` 零错误（TS 部分）。
3. `validate:*` 四个脚本全绿。
4. 三平台 `node --check` + `bash -n` 全绿（CI 已有）。
5. 改动涉及的模块有**真实**单测/集成测试通过，且覆盖率不降。
6. 未绕过 `governance.js` 任何红线（第 4 节）。
7. PR 描述包含：关联 Issue、改动摘要、自检证据（命令输出截图/文本）。

> **原则**：NPC 可以高效，但"声称完成"≠"真的完成"。任何 NPC 产出的 PR，人工终审前必须先看 CI 证据，再读关键改动，不可信任 NPC 自述。

---

## 6. 审查流程

### 6.1 分支与提交纪律
- **禁止直接 push `main`**。所有改动走 `feature/*` / `fix/*` / `docs/*` → PR → 评审 → 合并。
- 单 PR 只做一件事；重构类大改拆成"抽离→改造→删除"多 PR。
- Commit message 遵循现有 Conventional Commits（`feat/fix/refactor/style/docs/release`），NPC 提交须带 `re: 评审第N轮 (Issue #xxx)`。
- **小 PR**（< 400 行 diff）优先，便于深度评审。

### 6.2 提交前自查清单（Pre-PR Checklist，作者勾选）
- [ ] `npm run format:check` 通过
- [ ] `validate:settings` / `validate:versions` / `validate:toolcounts` / `validate:npc-team` 全绿
- [ ] 改动模块有真实测试且通过（`wps-office-mcp`: `npm run test:unit`；根 `tests/*`）
- [ ] 未直接改任何安装产物目录
- [ ] 新增/修改 MCP 工具已同步工具数量校验
- [ ] 路径/命令/密钥符合安全红线（第 4 节）
- [ ] `CHANGELOG.md` 已更新（若影响发布）

### 6.3 PR 模板（放 `.github/PULL_REQUEST_TEMPLATE.md`）
```
## 关联 Issue
Closes #

## 改动摘要
（一句话说清做了什么，不要贴 NPC 长文）

## 自查证据
- format:check: ✅/❌
- validate:toolcounts: ✅/❌（附输出）
- 单测: ✅/❌（附关键用例）
- 是否绕过 governance 红线: 否 / 是（说明）

## 评审关注点
（请 reviewer 重点看哪里）
```

### 6.4 双层评审：NPC 初筛 + 人工终审
- **第一层（NPC 代码评审员，自动）**：PR 创建/更新时触发，按本文档第 3/4/5 节做**机械项**扫描（lint、类型、路径安全、工具数、重复、规模），输出 🔴/🟡 清单。**NPC 评审员不批准合并**，只标记问题。
- **第二层（人工终审，必须）**：人审架构合理性、业务正确性、安全判断、NPC 未覆盖的语义问题。人工 Approve 后才可合并。
- 关键决策（安全、破坏性、API 契约）**只能人工拍板**。

### 6.5 多轮评审循环纪律（固化现有 N 轮循环）
- 沿用你们已有的"N 轮 review-修复循环"（如 Issue #151 的 12 轮），但**前置到 PR**：
  - 每轮必须有明确结论（🔴x / 🟡y），禁止"稍后处理"式模糊收尾。
  - 暂停点/门禁（NPC_TEAM 改造点 2）不得静默跳过；跳过须在 PR 显式说明并说明理由。
  - 末轮人工终审 Approve = 循环结束 = 可合并。
- 评审轮次在 commit message 留痕（`re: 评审第N轮`），便于追溯。

### 6.6 合并前强制门禁（CI 改造，见第 7 节）
PR 合并按钮**仅在以下全绿时可用**：Prettier check + ESLint + `tsc --noEmit` + 单测 + 覆盖率阈值 + `validate:*` + 三平台语法门禁 + NPC 评审员无未解决 🔴。

### 6.7 定期架构/技术债评审（Tech Debt Day）
- 每双周固定一次，专门处理：巨无霸文件/函数、跨平台重复、未覆盖模块、历史 `any`、过期 `// TODO`。
- 产出 Tech Debt 列表（登记到 Issue 或 `docs/` 下的 `TECH_DEBT.md`），排入迭代。
- NPC 可参与"清理类" Issue，但同样走第 5 节专项审查。

### 6.8 安全专项评审（发布前）
- 每次 `release:` 前，人工做一次安全走查：路径校验、命令注入、密钥、破坏性操作确认、依赖审计（`npm audit`）。
- 新增依赖必须说明用途并过 `npm audit`（无高危）。

---

## 7. CI 门禁改造清单（落地）

当前 `.cnb.yml` 的 validate 阶段只在 `main: push` 跑。**改造目标：把同等（且增强）的校验挂到 `pull_request` 事件，作为合并前卡点。**

1. **新增 ESLint（TS 严格模式）**
   - `wps-office-mcp` 增加 `eslint` + `@typescript-eslint`，规则含 `no-explicit-any`（error）、`no-unused-vars`、`max-func-lines`、`complexity`。
   - 根 `package.json` 增加 `"lint": "eslint ."` 与 CI 步骤 `npm run lint`。
2. **新增类型检查门禁**
   - `cd wps-office-mcp && npx tsc --noEmit`（当前只有 `test:unit`，无类型门禁）。
3. **新增覆盖率阈值（已落地：棘轮基线 + 关键模块锁定）**
   - `wps-office-mcp/jest.config.js` 的 `coverageThreshold` 采用**棘轮（ratchet）**策略：全局基线设得略低于当前实测（整体 statements 48 / branches 16 / functions 15 / lines 45），保证今天通过、未来只升不降；关键模块硬锁：`src/tools/gateway/**` ≥ 92/75/95/92，`src/utils/path-safety.ts` ≥ 90/80/100/90。
   - CI 步骤 `npm run test:unit -- --coverage`（即 `test:coverage`），未达标则失败。
   - 说明：Jest 的 `global` 阈值仅作用于**未被具体路径覆盖**的文件，故全局基线低于全仓实测值属正常。
4. **复用现有 validate + 语法门禁到 PR**
   - 将 `.cnb.yml` 中 `main:` 下的 `Validate NPC settings & unit tests` 阶段完整复制到 `pull_request:` 事件。
5. **NPC 评审员自动初筛**
   - 在 `pull_request:` 与 `pull_request.comment@npc:` 中接入"代码评审员"角色，按第 5 节扫描并评论 🔴/🟡。
6. **（可选）复杂度/重复扫描**
   - 引入 `sonarjs` 或 `jscpd` 检测重复，作为 🟡 提示。

---

## 8. 角色与责任

| 角色 | 职责 | 能否合并 |
|---|---|---|
| 作者（人/NPC） | 写代码、跑自查清单、附证据 | 否 |
| NPC 代码评审员 | 机械项扫描（lint/类型/路径/工具数/重复/规模），输出问题清单 | 否（仅标记） |
| 人工评审员 | 架构/业务/安全终审，Approve/Request Changes | **是（终审权）** |
| 测试工程师（NPC） | 补/修测试、覆盖率、回归 | 否 |
| 架构师（NPC） | 评审期介入架构合理性（如 NPC_TEAM 的 RES 角色） | 否 |
| 产品经理（NPC） | 确认需求对齐，不评代码 | 否 |

---

## 9. 检查清单速查（Reviewer 用）

**通用**：正确性 ✅ 边界 ✅ 性能(N+1/批量) ✅ 错误处理 ✅ 测试真实 ✅
**安全(🔴)**：路径校验 ✅ 命令注入 ✅ 密钥无硬编码 ✅ XSS 转义 ✅ 破坏性确认 ✅
**项目红线**：工具数一致 ✅ 安装产物未改 ✅ 绝对路径 ✅ 跨平台复用 ✅ 双源配置一致 ✅ 校对/模板规则未绕过 ✅
**NPC 专项**：无巨无霸 ✅ 无三平台复制 ✅ 无 `any` 逃逸 ✅ 无伪造完成 ✅ 留痕 ✅ 改动有界 ✅

---

## 10. 落地路线图（4 步）

> 状态图例：✅ 已完成（含证据） · 🟡 进行中/待办 · ⬜ 未开始

- **第 1 步 — ESLint + 类型检查门禁 + PR 合并前卡点** ✅ **已完成**
  - `wps-office-mcp/.eslintrc.json`：启用 `@typescript-eslint` 推荐集；`no-explicit-any` / `no-var-requires` 设为 `error`，`complexity(20)` / `max-params(6)` / `no-non-null-assertion` 设为 `warn`，忽略 `dist`、`**/*.test.ts`、`src/tests/**`。
  - 修复全部 20 个 ESLint error（6 个源文件：`mac-poll-server.ts`、`wps-keepalive.ts`、`convert.ts`、`proofread-report.ts`、`proofread.ts`、`path-safety.ts`）；`no-explicit-any` 提升为 error 后清零（仅 2 处）。
  - 根 `package.json` 加 `lint` / `typecheck` 脚本；`wps-office-mcp` 加 `lint` / `typecheck` / `lint:fix`。
  - `.cnb.yml` 新增 `pull_request: {opened,synchronize,reopened}` 三个阶段，每个都跑「validate + lint + typecheck + coverage + 三平台语法」；`main: push` 的 validate 阶段也补上 lint/typecheck/coverage。
  - `.github/workflows/ci.yml`：`lint` job 加 ESLint 步骤；`build` job 的 Jest 改为 `test:coverage`（覆盖率门禁）。
  - **证据**：`npm run lint` 0 error；`tsc --noEmit` 0 错误；`.cnb.yml` 与 `ci.yml` 已校验通过。

- **第 2 步 — PR 模板 + 自查清单 + 分支纪律** ✅ **已完成**
  - 新增 `.github/PULL_REQUEST_TEMPLATE.md`：关联 Issue / 改动摘要 / 提交类型 / 自查证据清单 / 评审关注点 / NPC 专项清单。
  - 重写 `CONTRIBUTING.md`：禁直接 push main、分支命名、单 PR 单事、Conventional Commits + `re: 评审第N轮`、Pre-PR 自查清单、PR 模板指针、双层评审、链接 CODE_REVIEW/TECH_DEBT。
  - 第 6.2/6.3 节清单已与模板对齐。

- **第 3 步 — 覆盖率阈值 + NPC 评审员强化 + TECH_DEBT** ✅ **已完成**
  - `wps-office-mcp/jest.config.js`：`coverageThreshold` 改为「棘轮基线 + 关键模块锁定」——全局 `statements 48 / branches 16 / functions 15 / lines 45`（低于当前实测值，确保今天通过、未来不退化）；`src/tools/gateway/**` 锁 `≥92/75/95/92`，`src/utils/path-safety.ts` 锁 `≥90/80/100/90`。
  - `.cnb/settings.yml`：在「代码评审员」prompt 新增 **§6 NPC 生成代码专项审查（最高优先级附加项）**，强制扫描巨无霸 / 三平台复制 / 类型逃逸 / 伪造完成 / 不留痕 / 无界重构 / 绕过治理红线，并明确「NPC 不批准合并」。
  - 新增 `docs/TECH_DEBT.md`：复杂度热点（proofread-report.ts ≈96/88、pivot.ts 41/23…）、非空断言、`any` 残留（生产已清零、测试约 70 处）、覆盖率目标、跨平台重复，含登记模板。
  - **证据**：418 个 Jest 测试通过，`test:coverage` 门禁绿灯；`validate-npc-team-prompt.js`、`sync-npc-team-skill.js --check`、回归测试（`tests/validate-npc-team-prompt.test.js` **124/124 通过**）全绿。
  - **附带健壮性修复**：治理校验脚本 `validate-npc-team-prompt.js`、`sync-npc-team-skill.js`、`tests/validate-npc-team-prompt.test.js` 在读取 `docs/NPC_TEAM.md` 时统一 `.replace(/\r\n/g,'\n')`，消除 Windows `core.autocrlf=true` 导致的本地 CRLF 误报（CI Linux 本就是 LF，不受影响）。

- **第 4 步 — Tech Debt Day + 发布前安全走查** 🟡 **待启动（常态化，按 §6.7/§6.8）**
  - 每双周一次 Tech Debt Day，消化 `TECH_DEBT.md` 登记项（复杂度/重复/未覆盖/历史 `any`）。
  - 每次 `release:` 前人工安全走查（路径/命令注入/密钥/破坏性确认/`npm audit`）。

> 本文件是"标准"，不是一次审查。它的价值在于被 CI 强制执行、被每次 PR 引用。第 1–3 步已落地并验证通过，建议尽快启动第 4 步形成常态。
