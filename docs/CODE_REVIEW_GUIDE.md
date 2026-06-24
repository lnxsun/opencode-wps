# 代码审查规范与流程指南

> 适用对象：`opencode-wps` 全员（维护者、贡献者、自动化代理）
> 适用代码：`opencode-wps/`（WPS JS 加载项）、`wps-office-mcp/`（MCP 服务器）、`agents/`、`skills/`、`.opencode/plugins/`、`install-addons.js`
> 目标：让 5 人小团队与外部贡献者能**在 30 分钟内读完并执行**，而非长篇说教

---

## 目录

- [0. 三个核心原则](#0-三个核心原则)
- [1. 审查分级标准（必须修复 / 建议优化 / 可选改进）](#1-审查分级标准必须修复--建议优化--可选改进)
  - [1.1 通用定义](#11-通用定义)
  - [1.2 代码风格规范](#12-代码风格规范)
  - [1.3 逻辑正确性](#13-逻辑正确性)
  - [1.4 安全性检查](#14-安全性检查)
  - [1.5 性能考量](#15-性能考量)
  - [1.6 可维护性](#16-可维护性)
  - [1.7 评审评论标准格式](#17-评审评论标准格式)
- [2. 完整审查流程](#2-完整审查流程)
  - [2.1 提交前自查清单（PR 作者必读）](#21-提交前自查清单pr-作者必读)
  - [2.2 角色分工与轮换机制](#22-角色分工与轮换机制)
  - [2.3 审查意见的提交与跟踪闭环](#23-审查意见的提交与跟踪闭环)
  - [2.4 争议处理机制](#24-争议处理机制)
- [3. 不同场景的审查策略](#3-不同场景的审查策略)
  - [3.1 紧急修复（Hotfix）快速通道](#31-紧急修复hotfix快速通道)
  - [3.2 大型重构深度审查](#32-大型重构深度审查)
  - [3.3 新人/外部贡献者的 PR](#33-新人外部贡献者的-pr)
  - [3.4 安全相关变更](#34-安全相关变更)
  - [3.5 文档与 Skills/Agents 变更](#35-文档与-skillsagents-变更)
  - [3.6 纯格式化与依赖更新](#36-纯格式化与依赖更新)
- [4. 审查效率与质量的度量指标](#4-审查效率与质量的度量指标)
  - [4.1 效率指标（Speed）](#41-效率指标speed)
  - [4.2 质量指标（Quality）](#42-质量指标quality)
  - [4.3 协作指标（Collaboration）](#43-协作指标collaboration)
  - [4.4 指标采集与看板](#44-指标采集与看板)
- [5. 模板与附录](#5-模板与附录)
  - [5.1 PR 描述模板（必填字段）](#51-pr-描述模板必填字段)
  - [5.2 审查 Checklist 速查表](#52-审查-checklist-速查表)
  - [5.3 自动化门禁（CI 必跑）](#53-自动化门禁ci-必跑)
  - [5.4 项目专属红线（do-not-touch）](#54-项目专属红线do-not-touch)

---

## 0. 三个核心原则

| # | 原则 | 含义 |
|---|------|------|
| 1 | **自动化能做的，不留给人** | 风格/格式化/类型/单测覆盖率/依赖漏洞 全部交给 CI；人只审查**意图**和**设计**。 |
| 2 | **阻塞意见必须可执行** | 每个 🔴 都必须给出具体行号 + 原因 + 建议改法；不接受"再优化一下"这种空话。 |
| 3 | **24 小时内首响应** | 工作时间内提交后 24h 内必须有人给出首轮意见（Approve / Request Changes / Comment）。超时自动 @ 下一位轮值审查人。 |

---

## 1. 审查分级标准（必须修复 / 建议优化 / 可选改进）

### 1.1 通用定义

| 级别 | 标记 | 含义 | 合并/关闭条件 |
|------|------|------|---------------|
| 🔴 **Blocker** | 必须修复 | 阻塞合并：安全漏洞、数据丢失/损坏风险、API 契约破坏、关键路径错误、CI 红灯 | 代码改动并由审查者二次确认 ✅ 后才能 Merge |
| 🟡 **Suggestion** | 建议优化 | 强烈建议修但不阻塞：可读性、健壮性、可测试性、设计一致性、性能 | 留作 issue 或下个 PR；不阻塞当前 PR |
| 💭 **Nit** | 可选改进 | 个人偏好、风格细节、不影响功能的命名/注释 | 作者可一键 Apply suggestion 接受；也可忽略 |

**判定原则**：当你不确定一个问题是 🟡 还是 💭 时，问自己——
> *"如果下个迭代这个代码会出错吗？出错会造成用户感知吗？"*
> 是 → 🟡 ；否 → 💭

---

### 1.2 代码风格规范

> 本项目使用 Prettier + ESLint 自动化处理；人只审**无法自动化的部分**。

#### 🔴 Blocker

- 违反 `npm run format:check`（CI 会自动判红，无需人审）
- TypeScript 代码未通过 `tsc --noEmit`（strict 模式开启，CI 必跑）
- 提交了 `package-lock.json` 与 `package.json` 互相矛盾的版本
- 在 `opencode-wps/` 中使用了 `fetch` / `ReadableStream` / `TextDecoderStream`（**WPS Chromium 103 不支持，会导致 SSE 永久 pending**）

#### 🟡 Suggestion

- 命名不能从字面看出含义（如 `data1`, `tmp`, `handleStuff`）
- 魔法数字未提取为命名常量（如 `setTimeout(fn, 14096)` 应为 `OPENCODE_PORT`）
- 函数超过 ~50 行且有明显可拆分的子逻辑
- 嵌套层级 ≥ 4 层（提前 return / 卫语句可消除）
- 注释解释了"做了什么"而非"为什么"（what 应当由代码自解释）
- TypeScript 中存在 `any`、未处理的 `@ts-ignore`、未提供类型的回调参数

#### 💭 Nit

- 对象/属性顺序与文件其他部分不一致
- 注释末尾标点不统一
- import 顺序与 ESLint 配置不完全一致（CI 必跑，但偶尔的 manual override 可放过）

---

### 1.3 逻辑正确性

#### 🔴 Blocker

- 边界条件未处理：`null` / `undefined` / 空数组 / 空字符串 / 0 / 负数
- 异步逻辑缺错误处理（无 `try/catch`、Promise 无 `.catch`、XHR 无 `onerror`）
- 资源泄漏：未关闭的 `XMLHttpRequest`、未释放的 COM 对象、未 `unmount` 的事件监听
- 死循环 / 死锁 / 竞态条件
- 改了公共 API 签名但未更新调用方（包含 MCP tool schema、Skill 协议、ribbon 回调）
- 改了文件路径硬编码但没同步 WPS 实际安装目录
- 改了 `governance.js` 规则集但未在 PR 描述说明影响范围

#### 🟡 Suggestion

- 条件判断复杂、可读性差（应拆函数 / 策略表 / 状态机）
- 错误信息缺少上下文（应当包含**哪个操作**、**哪个文件/ID**、**期望值 vs 实际值**）
- 浮点比较未用容差
- 日期/时区未明确（`new Date()` 在 WPS 内部与 Node 中表现可能不同）
- 缺少幂等性保护（重复执行会产生副作用）
- 未处理平台差异（项目 Windows-only，但跨进程通信可能涉及 32/64 位 COM）

#### 💭 Nit

- if/else 顺序偏好（先正后负 vs 先负后正）
- 早 return vs 单 return 风格选择

---

### 1.4 安全性检查

> 参考 [`SECURITY.md`](./SECURITY.md) 中关于 Launcher 本地回环设计的约束。

#### 🔴 Blocker

- **路径遍历**：`fs.readFile`/`wps` 操作的路径来自用户输入但未校验是否在白名单目录内
- **命令注入**：`child_process.exec` / PowerShell 拼接用户输入
- **反序列化漏洞**：`eval` / `new Function` / `JSON.parse` 后直接执行
- **WPS COM 越权**：调用了会写本地文件/注册表的 Action 但未走 `governance.js` 的 G4 路径安全检查
- **硬编码密钥**：token、密码、API key 出现在源码中
- **本地服务监听 `0.0.0.0`**：违反 [`SECURITY.md`](./SECURITY.md) 明确规定
- **XSS 风险**：`taskpane.html` 中使用 `innerHTML` 拼接用户/AI 返回的 Markdown 未转义
- **未使用绝对路径**：WPS COM 操作必须用绝对路径（AGENTS.md 已明示）

#### 🟡 Suggestion

- 错误信息泄露了内部路径、堆栈、密钥前缀
- 日志记录了完整 token / 文件内容
- 第三方依赖未锁定具体版本（`^x.y.z` 在生产中应改为 `x.y.z`）
- 启用了过宽的权限（如 MCP tool 接受任意 `cwd` 而非白名单）

#### 💭 Nit

- 安全相关注释措辞（"TODO" vs "FIXME" vs "SECURITY"）
- 注释中包含过期示例代码

---

### 1.5 性能考量

> 本项目性能瓶颈主要在 WPS COM 调用、PowerShell 进程启动、SSE 流式渲染。

#### 🔴 Blocker

- **N+1 调用**：循环中逐条调用 COM Action 而未批量化
- **同步阻塞 UI**：在 `main.js` ribbon 回调里做了 >500ms 的同步操作
- **未限制的内存增长**：SSE 流未做断线重连/缓冲上限，AI 长输出可能撑爆 taskpane DOM
- **重复执行**：`install-addons.js` 在未变更时仍全量拷贝文件

#### 🟡 Suggestion

- 热路径未加缓存（重复执行同一条 MCP 工具调用应当走本地缓存）
- 大对象深拷贝（如 `JSON.parse(JSON.stringify(x))`）
- 字符串拼接用 `+` 而非数组 `join` 或模板字符串（在 ≥1000 元素时）
- 未使用流式 API（`ReadableStream` 在 Node 侧可用，但 WPS 内置浏览器禁止）
- PowerShell 进程频繁启停（应复用 `wps-com.ps1` 长连接会话）

#### 💭 Nit

- 局部变量声明位置（函数顶部 vs 使用前）
- for 循环 vs forEach vs for...of 选择

---

### 1.6 可维护性

#### 🔴 Blocker

- 复制粘贴超过 ~30 行的重复代码（应抽函数/类/模块）
- 关键模块缺少 JSDoc 注释且函数名无法自解释
- 新增公共 API 但没更新 `docs/` 或对应 README
- 改了 `agents/` / `skills/` 但没运行 `install-addons.js` 同步
- 改了 `wps-office-mcp/src/` 但没跑 `npm run build`

#### 🟡 Suggestion

- 函数职责过多（违反 SRP）
- 模块间循环依赖
- 缺少针对边界条件的单元测试
- 改动涉及 ≥3 个文件但 PR 描述只说了 1 个文件
- TypeScript 类型用 `interface` 描述数据但用 `type` 描述联合（应保持一致）
- 缺少必要的 `// eslint-disable-next-line` 注释说明

#### 💭 Nit

- 注释标点、术语用词统一性
- 临时调试代码（`console.log('debug')`）残留
- 文件末尾多余空行

---

### 1.7 评审评论标准格式

每条评论必须按以下格式书写，**缺任一字段视为不合格**：

```markdown
🔴 **【分类】一句话问题描述**
**位置**：`path/to/file.ts:行号`
**为什么**：解释会造成什么后果（不是"不优雅"这种主观词）
**建议**：给出可直接复制粘贴的修复代码或具体步骤
**严重度**：[安全/数据/契约/性能/可维护]
```

示例：

```markdown
🔴 **【安全】未限制路径白名单，存在任意文件读取风险**
**位置**：`wps-office-mcp/src/tools/read-doc.ts:42`
**为什么**：用户传入的 `filePath` 直接传给 `fs.readFile`，恶意请求可读
`C:\Users\其他用户\.ssh\id_rsa` 等敏感文件。
**建议**：
\`\`\`ts
const ALLOWED = [process.env.USERPROFILE!, process.cwd()];
const abs = path.resolve(filePath);
if (!ALLOWED.some(p => abs.startsWith(p))) {
  throw new Error('path_not_allowed');
}
\`\`\`
**严重度**：安全
```

🟡/💭 用同样格式，去掉**严重度**字段。

---

## 2. 完整审查流程

### 2.1 提交前自查清单（PR 作者必读）

在请求审查前，**作者必须**逐项打勾：

- [ ] **PR 标题**遵循 Conventional Commits：`type(scope): subject`（如 `feat(mcp): add excel-chart tool`）
- [ ] **PR 描述**填写了 [§5.1 模板](#51-pr-描述模板必填字段) 全部必填字段
- [ ] **关联 Issue**：用 `Closes #123` / `Fixes #456` 关联
- [ ] **本地 CI 全绿**：
  - [ ] `npm run format:check`
  - [ ] `npm run build`
  - [ ] `npm run mcp:test`（如改 MCP）
  - [ ] `node tests/*.test.js`（如改 JS 加载项）
- [ ] **影响范围自述**：列出了所有受影响的文件、依赖、配置、文档
- [ ] **截图/录屏**：UI 类改动必须附 WPS 实际操作截图
- [ ] **WPS 实测**（如改 `opencode-wps/`）：在真实 WPS 12.1.0+ 中跑通主流程
- [ ] **同步操作**：改 `skills/agents/plugins/` 后跑过 `node install-addons.js`
- [ ] **回滚预案**：描述了出错时如何回滚（revert commit / 关闭开关 / 恢复配置）
- [ ] **无调试残留**：已删除 `console.log` / `debugger` / 注释掉的死代码
- [ ] **无敏感信息**：未提交 token、密码、个人路径、机器名

> **自查清单任一未勾选 → 自动转回 Draft**，CI 会通过 PR 机器人贴出提醒。

---

### 2.2 角色分工与轮换机制

#### 角色定义

| 角色 | 人数 | 职责 | 任期 |
|------|------|------|------|
| **作者（Author）** | 1 | 写代码 + 自查清单 + 响应评论 | 每次 PR |
| **主审查（Primary Reviewer）** | 1 | 全量审查、出 Approve / Request Changes | 轮值 1 周 |
| **次审查（Secondary Reviewer）** | 1 | 抽查、覆盖盲点、平衡工作量 | 轮值 1 周 |
| **领域专家（Domain Expert）** | 1~N | 安全/性能/架构等专项 | 长期，按需召集 |
| **维护者（Maintainer）** | 1~2 | 最终合并权、争议仲裁 | 长期 |

#### 自动分配规则

```
作者 push → GitHub CODEOWNERS 自动指派主审查
            ↓
若改动文件命中以下任一规则，加派领域专家：
  - governance.js / SECURITY.md          → 安全专家
  - wps-office-mcp/src/server.ts         → 架构师
  - install-addons.js                    → 发布工程师
  - agents/ 或 skills/                   → Skills 维护者
```

#### 轮换机制

- **周轮值**：每周一 09:00（北京时间）在团队群同步主/次审查
- **轮值表维护**：写在 [`docs/CODE_REVIEW_GUIDE.md` 的 GitHub 仓库 Wiki 页面](https://github.com/lnxsun/opencode-wps/wiki)（不在仓库内，避免 PR 噪音）
- **轮换规则**：
  - 同一人不能连续 ≥3 周担任主审查
  - 改自己写的代码时必须由**他人**审查
  - 跨模块改动时，主审查必须是**改动量最大的模块**的负责人
- **轮值人缺席**：在群内请假 → 自动顺延至下个有空的；超过 24h 无响应 → 触发 §4.1 SLA 告警

#### 审查人员职责清单

| 阶段 | 主审查 | 次审查 | 作者 |
|------|--------|--------|------|
| 收到 PR 通知 | 24h 内首响应 | 24h 内可忽略 | 24h 内必应评论 |
| 阅读 PR 描述 | ✅ 必读 | ✅ 必读 | — |
| 全量审查代码 | ✅ | 仅看主审查标 🔴 的地方 | 实时 |
| 跑通变更 | 按需 | 不必 | ✅ |
| Approve / Request Changes | ✅ | 必要时 | 响应评论 |
| 最终合并 | — | — | ✅（自合并前需 ≥1 Approve） |

---

### 2.3 审查意见的提交与跟踪闭环

#### 状态机

```
Draft ──push──> Open ──> Changes Requested ──> Open ──> Approved ──> Merged
                  │                                  ↑
                  └─────── Closed (stale) ────────────┘
```

#### 状态转换规则

| 当前状态 | 触发动作 | 新状态 | 备注 |
|----------|---------|--------|------|
| Draft | 标 "Ready for review" | Open | 触发审查 SLA 计时 |
| Open | 任何评论 | Open | 不改变状态 |
| Open | 主审查 Approve | Approved | 等 CI 全绿 + 无 🔴 |
| Open | 主审查 Request Changes | Changes Requested | 阻塞合并 |
| Open | 7 天无活动 | Stale | 机器人自动 Close |
| Changes Requested | 作者 push 新提交 | Open | 自动重置审查计时 |
| Approved | CI 红 | Changes Requested | 自动重置 |

#### 意见分类与跟踪

每条评论使用 GitHub **Suggestion block**（` ```suggestion `）给出可直接应用的代码片段。
- 主审查给 🔴 → 作者必须修 → 二次确认 ✅
- 主审查给 🟡 → 作者二选一：修 / 在 PR 描述回复"留作后续 issue #N"
- 主审查给 💭 → 作者可一键 Apply，可忽略（但要回复 resolved）

#### 跟踪看板

每周一会发一份 "PR Health Report"：
- 超过 7 天未合并的 PR 列表
- 累计 🔴 数量 Top 3 的 PR
- 长时间未响应的评论

---

### 2.4 争议处理机制

#### 三级升级路径

```
1. 评论内讨论  →  24h 内无法达成一致
2. @第二位审查人 征求第二意见  →  24h 内仍无法达成一致
3. 发起 "Architecture Decision Record" (ADR)  →  维护者最终拍板
```

#### 触发争议的条件

以下场景必须走 ADR，不允许私下拍板：

- 改变 `governance.js` 的 G1-G7 规则语义
- 调整 MCP tool 的对外 schema
- 改变 Skills / Agents 的协议格式
- 修改 WPS 加载项的核心架构（如 launcher 进程模型、SSE 协议）
- 修改 `install-addons.js` 的同步逻辑

#### ADR 模板

存放在 `docs/adr/0001-<short-title>.md`，文件名递增：

```markdown
# ADR-0001: <一句话标题>

## 状态
Proposed | Accepted | Deprecated | Superseded by ADR-XXXX

## 背景
什么问题触发了这个决策？

## 备选方案
1. 方案 A：…
2. 方案 B：…

## 决策
选择了哪个方案？为什么？

## 后果
- 正面：…
- 负面：…
- 需要 follow-up 的工作：…
```

#### 行为准则

- 禁止人身攻击 / 阴阳怪气（参考 [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)）
- 评论聚焦**代码**与**决策**，不针对**个人**
- 维护者拍板后 30 天内不接受同类争议（除非有新事实）

---

## 3. 不同场景的审查策略

### 3.1 紧急修复（Hotfix）快速通道

**触发条件**（满足任一）：
- 生产环境 P0/P1 故障
- 安全漏洞披露
- 数据丢失/损坏风险
- 关键路径 100% 不可用

**流程**（目标：**从提交到合并 < 4 小时**）：

1. 分支命名：`hotfix/<issue-id>-<短描述>`（如 `hotfix/456-launcher-port-conflict`）
2. 跳过 Draft 阶段，直接标 "Ready for review"
3. 标签：`hotfix`, `P0`/`P1`
4. **审查人数 = 1**（主审查一人），但必须是**维护者**或**领域专家**
5. **SLA 收紧到 1 小时首响应**：超时直接 @ 维护者
6. **允许事后补 PR 描述**：如果时间紧，至少填 §5.1 的"影响范围"和"回滚预案"
7. 合并后**必须**在 24 小时内补一个 follow-up PR：补全测试、文档、ADR

**禁止在 hotfix 中做的事**：
- 顺手重构（即便只多 5 行）
- 改无关的代码格式
- 升级依赖版本
- 改 `governance.js`

### 3.2 大型重构深度审查

**判定标准**（满足任一即视为大型重构）：
- 改动文件数 ≥ 20
- 改动行数 ≥ 500（不含自动生成的 lock 文件）
- 跨 ≥3 个模块
- 改变公共 API / 协议

**深度审查要求**：

1. **前置 RFC / ADR**：合并前必须有 ADR 文档被接受
2. **分阶段提交**：拆成 N 个 ≤200 行的子 PR，每个 PR 独立可合并
3. **审查人数 ≥ 2**：主审查 + 领域专家
4. **架构师 Review**：命中核心架构 → 必须架构师 Approve
5. **回归测试**：必须新增/更新测试，且 `npm run mcp:test` 全绿
6. **性能基准**：若改动了热路径，附 before/after 性能数据
7. **分阶段合并**：每阶段合并后观察 24h 无回归再合并下一阶段
8. **回滚开关**：必须支持按 feature flag 关闭新逻辑

### 3.3 新人/外部贡献者的 PR

**特殊照顾**：

1. **标签**：`first-time-contributor` / `external`
2. **审查者必须 ≥ 2 人**：防止单审查者认知盲点
3. **审查者要主动留 `learning` 标签评论**：解释*为什么*这样改，而不只是*改什么*
4. **可放宽风格**：不阻塞因 Prettier 之外的个人风格差异
5. **必须给正向反馈**：找到至少 1 个 ✅ 写得好或 ✨ 有亮点的点
6. **不要 DoS 式提问**：一次评论提所有问题，不要分 10 轮打回去
7. **可合并性判定**：DCO / CLA / Contributor License Agreement 通过

### 3.4 安全相关变更

**触发条件**：命中以下任一
- `governance.js` 改动
- 鉴权 / 路径校验 / 加密相关
- `SECURITY.md` 改动
- 新增依赖处理网络、文件、进程

**额外要求**：

1. **必须** 2 名审查者：1 主审 + 1 安全专家
2. **必须** 在 PR 描述回答：
   - 攻击面变化（新增 / 缩小 / 不变）
   - 威胁模型是否变化
   - 是否需要更新 `SECURITY.md`
3. **强制** 跑安全 lint：`npm audit` 无 high/critical
4. **可考虑** 外部安全审查：涉及鉴权架构变更时邀请外部 reviewer
5. **禁止** 在公开 PR 中讨论未公开漏洞细节（用私有 issue 跟踪）

### 3.5 文档与 Skills/Agents 变更

| 变更类型 | 审查者 | 关键检查点 |
|----------|--------|-----------|
| `docs/*.md` 文字修正 | 1 名（无需领域专家） | 拼写 / 链接 / 与代码一致性 |
| `skills/<x>.md` 新增/修改 | 1 名 + 1 名老用户 | 触发词是否覆盖真实意图、步骤可执行、示例能跑通 |
| `agents/*.md` 新增/修改 | 1 名 + 维护者 | 是否与现有 agent 职责重叠、是否需要更新 §AGENTS.md |
| `.opencode/plugins/*.js` | 1 名 + 架构师 | hook 顺序、错误处理、性能影响 |
| 跨多个 Skills/Agents | 维护者必审 | 防止职责边界混乱 |

### 3.6 纯格式化与依赖更新

| 变更类型 | 流程 |
|----------|------|
| `npm run format` 自动修复 | 1 名 Approve 即可，无须逐行 review |
| 依赖 minor/patch 升级 | 自动 PR + 1 名 Approve；CI 全绿即合 |
| 依赖 major 升级 | 1 名 + 1 名领域专家 + ADR 说明升级理由 |
| 锁文件/Node 版本变更 | 1 名 + CI 全绿 + 在 WPS 实测主流程 |

---

## 4. 审查效率与质量的度量指标

> 指标**不用于考核个人**，仅用于发现流程瓶颈。
> 每月 1 号发布 "Code Review Health Report"。

### 4.1 效率指标（Speed）

| 指标 | 定义 | 目标 | 数据源 |
|------|------|------|--------|
| **首响应时间（Time to First Review）** | PR 从 Open → 收到首条非作者评论 | 中位数 < 24h，P95 < 48h | GitHub API |
| **审查周期（Review Cycle Time）** | PR 从 Open → 首次 Approve | 中位数 < 3 天 | GitHub API |
| **合并周期（Time to Merge）** | PR 从 Open → Merged | 中位数 < 5 天 | GitHub API |
| **hotfix 合并时间** | hotfix PR 从 Open → Merged | < 4h | 标签筛选 |
| **审查 SLA 命中率** | 24h 内首响应的 PR 占比 | > 80% | 自动化统计 |
| **批量积压** | Open 状态超过 7 天的 PR 数 | < 5 | 自动化统计 |

### 4.2 质量指标（Quality）

| 指标 | 定义 | 目标 | 数据源 |
|------|------|------|--------|
| **缺陷逃逸率（Defect Escape Rate）** | 合并后 30 天内被 revert 或 hotfix 修复的 PR / 总 PR | < 10% | git log + 标签 |
| **回滚率（Revert Rate）** | 因代码问题回滚的次数 | < 5% / 月 | `revert:` commit |
| **🔴 评论密度** | 每 100 行代码收到的 🔴 数量 | < 1 | 自动化统计 |
| **CI 红转绿次数** | 同一 PR 上 CI 失败的修复次数 | < 3 | GitHub API |
| **覆盖率** | `wps-office-mcp/src/` 单测覆盖率 | ≥ 70% | Jest `--coverage` |
| **依赖漏洞** | `npm audit` high+critical 数 | 0 | 自动化 |
| **遗留评论（Stale Comments）** | 超过 14 天未 Resolved 的评论 | < 10 | 自动化 |

### 4.3 协作指标（Collaboration）

| 指标 | 定义 | 目标 |
|------|------|------|
| **审查参与度** | 月度审查过 PR 的人数 / 团队总人数 | > 60% |
| **审查均衡度（基尼系数）** | 每人审查 PR 数的分布 | 基尼 < 0.4 |
| **争议升级率** | 走 ADR 流程的争议数 / 总 PR 数 | < 5% |
| **评论响应率** | 24h 内作者对评论的回复率 | > 90% |
| **学习性评论占比** | 标 `learning` 的评论数 / 总评论数 | > 15%（针对非资深 PR） |

### 4.4 指标采集与看板

**采集方式**：

```bash
# 推荐工具链
- GitHub CLI: gh pr list / gh pr view --comments
- 自托管: github-action-metrics
- 内部脚本: scripts/report-code-review-health.js
```

**看板位置**：

- **周报**：团队群周日晚 20:00
- **月度报告**：`docs/reports/YYYY-MM-code-review-health.md`
- **实时仪表盘**（可选）：Grafana + GitHub webhook

**指标红线**（连续 2 个月未达标 → 触发流程回顾）：

- 缺陷逃逸率 > 15%
- 审查周期 P95 > 7 天
- 审查参与度 < 40%
- 争议升级率 > 10%

---

## 5. 模板与附录

### 5.1 PR 描述模板（必填字段）

```markdown
## 描述
<!-- 一句话：解决什么问题 -->

## 变更类型
- [ ] 新功能 (feat)
- [ ] Bug 修复 (fix)
- [ ] 重构 (refactor)
- [ ] 性能优化 (perf)
- [ ] 安全修复 (security)
- [ ] 文档 (docs)
- [ ] Skills/Agents
- [ ] 其他

## 影响范围
- **改动文件**：
- **新增依赖**：
- **配置变更**：
- **数据库/状态文件**：

## 测试
- [ ] 单元测试已添加/更新
- [ ] 集成测试通过
- [ ] WPS 实测（截图附后）
- [ ] OpenCode 实测

## 风险与回滚
- **风险点**：
- **回滚方式**：
- **监控指标**：

## Checklist
- [ ] `npm run format:check` 通过
- [ ] `npm run build` 通过
- [ ] `npm run mcp:test` 通过（如改 MCP）
- [ ] 已跑 `node install-addons.js`（如改 skills/agents/plugins）
- [ ] 无 `console.log` / `debugger` / 注释代码残留
- [ ] 已关联 Issue：`Closes #XXX` / `Fixes #XXX`

## 截图（如适用）
<!-- 至少一张 WPS 实际效果截图 -->
```

### 5.2 审查 Checklist 速查表

打印贴在工位 / 显示器边框：

```
┌─────────────────────────────────────────────────┐
│  CODE REVIEW QUICK CHECKLIST                    │
├─────────────────────────────────────────────────┤
│  □ 改了 governance.js / SECURITY.md？ → 2 审     │
│  □ 改了 MCP tool schema？       → 同步下游调用方 │
│  □ 改了 skills/agents/plugins/  → 跑 install    │
│  □ 改了 wps-office-mcp/         → npm run build │
│  □ 改了 opencode-wps/           → WPS 实测      │
│  □ 改动 >500 行？               → ADR 先行      │
│  □ 引入新依赖？                 → npm audit      │
│  □ 含 path/fs/exec？            → 路径白名单     │
│  □ 含 innerHTML/eval？          → XSS 风险      │
│  □ WPS 侧用 fetch/ReadableStream？→ 立即拒绝    │
└─────────────────────────────────────────────────┘
```

### 5.3 自动化门禁（CI 必跑）

```yaml
# .github/workflows/pr-check.yml （示意）
name: PR Check
on: [pull_request]
jobs:
  validate:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run format:check
      - run: npm run build
      - run: npm run mcp:test
      - run: npm audit --audit-level=high
      - name: 红线扫描
        run: |
          # 禁止 WPS 侧使用 fetch / ReadableStream
          if grep -rn "fetch(" opencode-wps/; then
            echo "::error::WPS 加载项禁止使用 fetch"
            exit 1
          fi
          if grep -rn "ReadableStream\|TextDecoderStream" opencode-wps/; then
            echo "::error::WPS Chromium 103 不支持 ReadableStream"
            exit 1
          fi
          # 禁止绑定 0.0.0.0
          if grep -rn "0\.0\.0\.0" opencode-wps/ wps-office-mcp/src/; then
            echo "::error::违反 SECURITY.md，禁止 0.0.0.0 绑定"
            exit 1
          fi
```

### 5.4 项目专属红线（do-not-touch）

> 违反任一条 → PR 必拒，无论其他质量多高。

1. **WPS 侧禁止使用 `fetch` / `ReadableStream` / `TextDecoderStream`**（Chromium 103 不支持）
2. **WPS 侧禁止使用 `let/const/箭头函数/async-await`**（ES5 兼容要求）
3. **WPS 侧禁止省略 `var` 声明**（会污染全局）
4. **MCP / Launcher 禁止绑定 `0.0.0.0`**（违反 [`SECURITY.md`](./SECURITY.md)）
5. **WPS COM 操作禁止使用相对路径**（必须 `path.resolve` 为绝对路径）
6. **禁止手动编辑 `~/.opencode/skills/`、`%APPDATA%\kingsoft\wps\jsaddons/`、`~/.config/opencode/`**（这些是 install-addons.js 生成的工件）
7. **禁止提交 `node_modules/`、`*.log`、`dist/`、`build/`**（仓库根 `.gitignore` 已处理，PR 机器人会提示）
8. **禁止绕过 `governance.js`** 的 G1-G7 规则（即便在"紧急"情况下）

---

## 附录 A：变更记录

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| 1.0 | 2026-06-23 | 初版发布 | 火眼眼（Code Reviewer） |

## 附录 B：相关文档

- [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md) — 开发流程与代码规范
- [`SECURITY.md`](./SECURITY.md) — 安全模型与红线
- [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) — 常见问题排查
- [`WPSJS_DEVELOPMENT.md`](./WPSJS_DEVELOPMENT.md) — WPS 加载项开发细节
- [`MCP.md`](./MCP.md) — MCP 协议说明
- [`../AGENTS.md`](../AGENTS.md) — 项目根指南（含架构、命令、G1-G7 规则）
