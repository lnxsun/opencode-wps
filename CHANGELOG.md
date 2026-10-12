# 更新日志

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **依赖 CVE 收敛（合并 superset）：axios / fast-uri / hono / ip-address 四个传递依赖族** —
  原先 20 个 open PR 各自只修其中一族（且互相改写 `overrides` 同一块，顺序合并会**丢修复**、
  多例冲突），现合并为一份权威变更，一次性覆盖全部 23 个 CVE Issue：
  - `axios` `^1.18.0` → `^1.20.0`（CVE-2026-101898/101899/101900/101901/101902/101903/
    101904/101905/101906/101907/101908/101909）
  - `fast-uri` override `4.1.3` → `4.1.5`（CVE-2026-84394/86472/86818）
  - `hono` override 新增 `4.13.7`（CVE-2026-84363/84364/84365/93981）
  - `ip-address` override 新增 `10.7.1`（CVE-2026-101910/101911/101912/101913）

## [1.14.10] - 2026-09-30

> 本段为**发布定版**（11/13）：发布于合并提交 `6f8e939`（PR #421 合并后）。
> 合并期与主线 v1.14.9（Issue #420）的冲突已在 PR #421 内收敛，记录于下「Fixed」末条。

### Added

- **判据⑨：历史产物的处置完整性守卫（Issue #419 = #417 AC-6 拆分，PR #421）** — 1.14.1~1.14.6
  六个历史 tarball（约 189MB）的处置此前只是 Issue 里的一句话，**无断言**；而判据⑥ 的判据面
  恰好就是这六个版本（`RELEASE_ARTIFACT_FLOOR` = 产物惯例建立点）⇒ 「删历史产物」= 掏空判据面
  （实测报红 6 条）。现把处置结论落成**可执行断言**：
  - 新增判据⑨ `checkFloorHistoryIntegrity`：`>= 未决处置下限` 的产物**曾入库**即不得被静默抹去；
    `[产物下限, 未决处置下限)` = 待处置对象（保留、不动）。
  - 单源 `ARTIFACT_FLOOR_DECISION_REFS`（处置决策登记，改它必产生 diff ⇒ 可评审）+
    `ARTIFACT_FLOOR_UNDECIDED_BELOW`（未决处置下限）。
  - **否决**「判据⑥ 加历史版本豁免清单」（Issue 候选方案 B）：实测该清单在轴 I 归属侧**零信号**
    ⇒ 静默放宽口袋；改为登记轴 I 语义键 `artifact-floor-integrity` 闭合该盲区。

### Fixed

- **判据⑥ 读口径：`refs/heads/main` → `HEAD`（待发布树）（Issue #419 CR419-1，PR #421）** —
  被断言的对象是 HEAD 的树（判据⑦ 跑 `git archive HEAD`、产物由 HEAD 生成），且 CI 在 **PR 分支**上
  跑 preflight（main 尚未含本次改动）⇒ 二者背离时假绿。实测：feature 分支上 `git rm` 产物 ⇒
  原口径读 main 未删 ⇒ `EXIT=0`。统一到 HEAD 后 `HEAD ↔ archive ↔ 产物` 三者同源，**且合并前可判**。
- 判据⑨ 判据面补 `>= floor`：防未决下限被改到低于产物下限时，把 `v1.14.0`（产物惯例建立**之前**）
  拉进判据面而假红（CR419-2）。
- 判据⑨ 决策登记收为 `^#\d+$` 校验：原只查非空 ⇒ 实测 `['x']` / `['']` 原样放行，断言空心化（CR419-5）。
- 判据⑨ 补未决下限「**抬高**」对偶断言（CR419-11）：原只拦下调；把未决下限上调到 99.0.0 ⇒
  全部历史产物落入「待处置区间」⇒ 判据面为空而 `EXIT=0`（零信号，本 PR 批判的豁免口袋同构形态）。
  现：判据面非空时未决下限不得高于最高的在树产物版本（与判据⓪/④ 同口径）。
- 判据⑥「不可判定」用例修正（CR419-10）：该用例在判据⑥ 口径改为 `HEAD` 后已不再命中判据⑥，
  其泛化匹配实由判据③ 满足（断言无主）⇒ 改为构造判据⑥ 不可判定态 + 断言其独有文案。
- **合并期冲突收敛（判据编号碰撞 ⑧ → ⑨，PR #421）** — PR #421 与主线 v1.14.9（Issue #420）
  各自新增了一条「判据⑧」（本 PR 的「历史产物处置完整性」 vs 主线的「标签 ↔ 发布说明存在性」）
  ⇒ 合并后两条实现**同号**。收敛：本 PR 的判据顺延为**判据⑨**（`checkFloorHistoryIntegrity`
  及 CLI/单源/专测/文档中的引用同步），主线「标签 ↔ 发布说明存在性」保留判据⑧。改编号必产生 diff
  ⇒ 可评审（非静默改名）。
- **E1 留痕链二次拼接（并发加守卫 PR 的机械记账，`ratchet:rechain`）** — 本 PR 与主线 v1.14.9
  各自 append 了一条 `guardSourceLines` 留痕 ⇒ git 合并后落在同一数组、链断裂。按
  `npm run ratchet:rechain` 的「补齐算术 + 收紧声明」拼接（`from` 由实测派生，不手写数字），
  并以 `npm run validate:semantic-anchor-scope` 端到端校验链完整。

## [1.14.9] - 2026-09-30

### Fixed

- **校对会话复盘六项缺陷（Issue #420，PR #422）** — 逐轮还原 `ses_f0fc`（54 段监理周报单批）会话后，
  修掉六处「已检出 / 已修复却不可用或不可信」：
  - `TYPE_METRIC_MAP` 补 `网络用语`（consistency）/ `编号不连续`（format）两键 —— 此前 `3W`/`15W`
    （已实际修复）与段 37 缺「三、」全部落「未分类」，不计六维。
  - Layer 1 补 `3W路`（数字 + `W` + 中文量词，W=万）与裸 `xxx…` 占位规则（旧规则强制后接
    「公司/项目/部门/单位」⇒ 恒漏检）。
  - `generateProofreadReport` 会话回收改为**仅在真正落盘后**：原「不传 output_file 也回收」会让
    「落盘失败后改传 output_file 重试」恒报「未找到会话」，自纠路径被自己掐死。
  - 写白名单并入**当前文档所在目录**（单源 `buildWriteRootsWithDocDir`，`write_file` 与报告落盘
    同口径）—— 此前文档位于用户自选目录时报告恒报 `Path not allowed`。
  - 治理层 P1 放行「本批已取过区间内的只读重读」（原被「本批未走完不得取下一批」整片拦死）。
  - SKILL 补 `source` 必填、网关 `arguments` 须传对象、落盘首选 `output_file`。
  - 评审循环（10 轮）另修：`网络用语` 规则吞尾随空白、方案 B 后会话残留污染重跑、规则声明
    `/gi` 被引擎丢弃、`write_file` 写白名单扩权文档同步、E1 留痕 reason 改实测派生。

## [1.14.8] - 2026-09-30

### Added

- **E1 棘轮留痕重链 `npm run ratchet:rechain`（Issue #408，PR #415）** — E1 留痕是 append-only 链，
  并发「加守卫」PR 合并后需**人工拼接**（保留两侧 / 改 `from` / 末条 `to` 回写实测），
  人工按次数线性增长（本轮手工拼接漏写一个 `},` ⇒ 轴 I 报「留痕链断裂」）。现落成一条命令：
  - 新增 `scripts/ratchet-rechain.js`（CLI）+ `scripts/lib/ratchet-rechain.js`（判据纯函数）：
    **补齐算术**（`from_i ← to_{i-1}`，不可能抬高上限）+ **收紧声明**（基线 ← 实测，仅当实测 ≤ 天花板）
    + **追加留痕须显式授权**（`--issue` / `--reason`，`from`/`to` 由实测派生，人不写数字）。
  - 保留原两条判据不变：「不许静默上调」（现值 ≤ 棘轮基线）与「留痕必填」。
  - 新增 `scripts/lib/e1-metrics.js`：E1 度量口径（`countCodeLines` / `countBranches`）**单源**，
    守卫与重链 CLI 共用，消除潜在第二份计数实现。
  - 守卫源码枚举面扩为 `validate|ratchet-*.js`，堵「改文件名前缀逃出体量分母」。
  - 评估结论（据实记账）：**不采**「`to` 全量派生自实测」——那会让天花板 ≡ 当前实测，
    使「不许上调」判据**退化为恒真**（与已删 `E1_RATCHET_BASELINES` 副本表同族）。
  - 专测 `tests/ratchet-rechain.test.js`（12 例）含变异自证：注入「并发两条留痕 + 粘连」⇒
    原状轴 I 报红、重链后回绿；无授权时 CLI 拒绝并 EXIT=1 且不改写天花板。

### Fixed

- **发布产物 tarball 逐版本翻倍（Issue #417，PR #418）** — `git archive` 打包**全部 git 跟踪文件**，
  而历史产物 `opencode-wps-v<X.Y.Z>.tar.gz` 自 v1.14.1 起均被提交 ⇒ 每个新产物**递归包含全部历史产物**
  ⇒ 体积逐版本约翻倍（实测 1.14.1 2.9M → 1.14.6 93M → 1.14.7 186M）。修法：`.gitattributes`
  新增 `opencode-wps-v*.tar.gz export-ignore`（排除口径由单源 `ARTIFACT_EXPORT_IGNORE_PATTERN` 声明）。
  **实测**：archive 条目 370 → 362、内含产物 8 → **0**、gzip 后 **389,341,079 B → 1,634,373 B**（−99.6%）。
- **新增判据⑦：发布产物的打包口径 / 体积连通（Issue #417，PR #418）** — 判据⑥ 只断言产物
  「存在性/命名」，**内容/体积**在其显式自限内 ⇒「产物逐版本翻倍」长期静默通过。判据⑦ 三条断言：
  ① 产物内不得含产物命名形态的条目（断言钉在 `git archive` **输出**上，**不**用 `git check-attr`
  代替 —— 实测 attribute 在索引/工作树 set 而 `archive HEAD` 读 **HEAD 树** ⇒ 二者可同时为真 = 假绿）；
  ② `.gitattributes` 的 `export-ignore` 行必须**等于**单源 pattern，且能匹配 `artifactName()` 产物名；
  ③ archive 的 gzip 后字节 ≤ 体积上界。判据面 = 「该仓库**有产物入库**」（现场 `git ls-files` 判定，
  声明式边界非豁免口）。
- **判据⑦ 自由参数收敛（4 → 2 个绝对量）与上界派生（Issue #417 R5 评审）** — 每加一个「防护参数」
  就多一处**可被同步放大**的文本；实测「上界 + 基线两处同步」「倍率 + 基线 + 上界三处同步」均曾
  `EXIT=0` 零信号（与 Issue #416 的 E1 记账链同构）。修法：上界改为**派生量**
  （`= ARTIFACT_SIZE_BASELINE_BYTES × ARTIFACT_SIZE_TOLERANCE_RATIO`，恒等式由构造保证）
  ⇒「只改上界」语法上不可能；并新增**倍率绝对上限**（`ARTIFACT_SIZE_RATIO_CEILING` = 32）
  与**基线 ↔ 当场实测对账**（`ARTIFACT_SIZE_BASELINE_MAX_DRIFT` = 4×）两条独立断言。
- **E1 探针写死值假绿（Issue #417 R4 评审）** — `tests/semantic-anchor-scope.test.js` 的 E1 探针
  把变异值**写死为 `9999`**；本 PR 把棘轮锚抬到 `10021` 后 `9999 < 10021` ⇒ `current > baseline` 恒假
  ⇒ 探针**静默假绿**（实测 72/72 → 71/72）。修法：探针规模**现场派生**（解析棘轮锚后取 `锚 + 100`）。
- **判据⑦ 两处修复轮次实测真缺陷（Issue #417 R1/R3 评审）** — ① 断言③ 在缺上界单源时
  **静默跳过**（条件短路 ⇒ 零信号），现拆出独立分支「缺上界即报红」；
  ② 判据面首版锚在 `base`/`limit` 上 ⇒ 二者可被同步放大 ⇒ **判据面自己把自己排除**
  （实测仍零信号），现改锚**独立参照** `ARTIFACT_SIZE_REF_BYTES`。

## [1.14.7] - 2026-09-29

### Fixed

- **发布留痕守卫判据⑥：发布产物 ↔ 版本号连通（Issue #399 13/13 复盘第三轮，PR #416）** —
  判据 ⓪~⑤ **全部只看标签 / CHANGELOG / Release Notes**，**无任何断言覆盖产物（tarball）本身**
  ⇒「产物没做 / 名字写错 / 没进发布分支」可长期静默通过（逐版本 `tar -tzf` 核对才发现产物链
  逐版本翻倍：1.14.1 2.9M → 1.14.6 93M，内含上一版 tarball —— 正是「无断言 ⇒ 无症状」）。
  新增判据⑥：每个 ≥ 下限（`RELEASE_ARTIFACT_FLOOR` = 1.14.1）的发布标签，其**发布分支树**内
  必须存在与版本号同名的产物。命名口径单源 `ARTIFACT_NAME_PATTERN` + 唯一构造函数 `artifactName(v)`。
- **E1 变异探针规模改为派生（Issue #399 13/13 复盘第三轮）** — 两个 E1 变异探针把规模**写死为 500 行**；
  基线抬到 `9509` 后 5% 余量 = 501 行 ⇒ 500 行落入余量内 ⇒ 探针不再越上限 ⇒ 断言**静默假绿**。
  新增 `excessOverLimit()`：现场从守卫源码解析基线并按余量派生探针规模（`余量 + 20`）。
- **E1 记账链三方对账（Issue #399 13/13 复盘第四轮）** — 对本 PR 自证做独立复验，实测复现三条真缺陷：
  🔴 **基线低估**（`E1_BASELINES.guardSourceLines = 9509` 落后实测 9546，落入 5% 余量内不报红）；
  🔴 **初值幽灵**（`E1_RATCHET_INITIAL.guardSourceLines = 5379`，落后现基线 4167 行；改成 `1`/`99999`
  跑守卫**恒为全绿**）；🔴 **留痕链脱钩**（留痕末条 `.to` 与实测/基线脱钩）。修法：基线 / 留痕末条 `.to` /
  初值**三方按 `guard-sources.js` 机械枚举当场对账**回写实测值 + 新增「初值陈旧可见披露」运行时判据。
- **E1 棘轮自指闭合（Issue #399 CP3 前复验）** — 复验实测发现：光改基线（探针 A）能被拦，但
  「基线 + 留痕同步」（B）/「三步全同步」（C）/「实测换成同文件副本」（D）三者**均零信号**放行 ——
  根因是 `e1RatchetBaseline(dim) = log.at(-1).to`，**比较对象与被判对象是同一处文本**。
  新增三条独立 CLI 判据：① `E1_RATCHET_ANCHOR`（与留痕互不派生的锚定来源）；
  ② 「基线 = 当场实测」对账（两方向各有诊断：高于/低于实测均报红）；③ 实测来源唯一性（防同文件副本自指）。
  探针 A/B/C/D 修复后**全部由绿转红**。

### 发行说明

- 产物：`opencode-wps-v1.14.7.tar.gz`（源码快照）。
- 本轮为**守卫层判据面修正**，无对外接口/配置/工具集变更（工具面不变）。


## [1.14.6] - 2026-09-29

### Fixed

- **发布留痕守卫判据⑤ 修三处实测真缺陷 + 加历史边界（Issue #399 13/13 复盘第二轮，PR #414）** —
  上一轮落地的判据⑤「发布提交 message 声称 ⊆ 提交 diff 落地」经**独立复验**，实测发现三处缺陷
  （1 假阴性 + 2 假阳性，全部实测复现，非推断）：

  - 🔴 **假阴性**：判据对**自身头号反例 `77d9e76` 放行**。原「声称集合」只收 `#<数字>`，而真正见证词
    `G3` 是**功能代号**（非 `#` 编号）⇒ 永不入集合；该行唯一的 `#400` 恰在同提交 diff（另一条目）中
    ⇒ 子集断言误过。修法：见证词口径 = 编号 `#<数字>` **∪** 功能代号 `G/P/T<数字>`（新增单源
    `RELEASE_COMMIT_WITNESS_PATTERN`）。
  - 🟡 **假阳性（两端口径不对称）**：真值侧只收编号，与扩口径后的声称侧不对称 ⇒ 声称 `P2` 而 diff 真含
    `P2` 被误报（实测反例 `49bb613`）。修法：真值侧改用**同一**见证词单源。
  - 🟡 **假阳性（提交标题被误认声称）**：标题是**工作描述**，其 Issue/PR 追溯号被当成「声称落地的条目」
    （实测反例 `b7d7757`）。修法：排除首行（实测真实声称 27 条在 body / 6 条在 subject）。
  - **配套：判据⑤ 历史边界** —— `RELEASE_COMMIT_CLAIM_SINCE`（一条**均匀时间边界**，非白名单口袋）
    + `RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES`（边界内已登记反例，可审计）；边界提交在任意 `--root`
    不存在时**如实退回**未收紧范围（多判，不静默空跑）。
  - **R1 评审（契约唯一）**：删声称侧冗余编号匹配（`witnessPattern` 已 ⊇ `refNumberPattern`，属同一语义两处写）。
  - **变异自证 3 组（走真实链路）**：边界退回 `v1.13.0` ⇒ 报红 `G3`；还原「只收编号」⇒ 假阴性复现（放行）；
    以登记反例直接调判据 ⇒ 报红。守卫专测 **43/43**。
- **顺带补录**：CHANGELOG `1.14.6` 段同时覆盖本轮发布提交自身（见下「发布提交」）。

## [1.14.5] - 2026-09-29

### Fixed

- **工具结果信封守卫闭合「间接读」盲区（PR #412 · Issue #401 13/13 复盘）** — `validate-tool-result-payload`
  判据① 原只按**成员访问**形态（`.key`）判「消费点读过某信封键」，实测把键名**先绑到标识符**再用
  计算成员读取（`const k='success'; output[k] !== false`）**守卫全绿** —— 即 Issue #401 的**本源 bug**
  （读投影后不存在的键）**换个写法就绕过了守卫**，属守卫自身的假绿（门禁遮蔽）。现判据① 增
  「**值为信封字段名的标识符** + 计算成员读取」面：先收集 `const/let/var <id> = '<字段名>'` 的别名绑定，
  再拦 `obj[<id>]` 形式的读取；**只登记「绑定值 = 字段名」的别名** ⇒ 与信封无关的同名局部变量
  （如 `for (var k=0; ...)` 循环计数器）**不误报**。
- **字段名单源不变**（R5 口径保持）：别名候选仍由 `types/tools.ts` 的 `ToolCallResult` / `CallToolResponse`
  **源码派生**，经 `checkEnvelopeKeyUsage` 第 3 参传入 —— 守卫内**无第二份手写字段名清单**。
- **轴 I E1 棘轮同步回写 + 留痕**：`#412` 与 `main`（`#413` 的判据⑤）合并后按合并态**实测**回写
  （`guardCodeLines` 1371 / `guardSourceLines` 9213），留痕按**时间序**拼接（`#399` 两条 → `#401 复盘`一条）。
- **归位说明**：本条目原误记为 `PR #411`，实际承载 PR = **#412**（#411 是发布说明 ↔ CHANGELOG 段内容连通修复，
  与此无关）—— 按实测编号改正，不留错误引用。

## [1.14.4] - 2026-09-29

### Added

- **发布提交 message「假留痕」守卫（判据⑤，PR #413）** — `validate:release-connectivity` 原判据①②④ 均**只看真值侧**（标签 / 段存在 / 段内容），对「发布提交 **message 声称**」这一侧无任何断言 ⇒ message 与 diff 各说各话可长期存在（实测反例 `77d9e76`：message 声称 CHANGELOG 新增 G3 修复条目，其 diff 新增行 `#399`/`#404`/`G3` 命中 **0** 处）。新增判据⑤ `checkReleaseCommitClaim`：断言「message 声称落地的引用集合 ⊆ 该提交 CHANGELOG diff 新增行引用集合」。声称侧须「CHANGELOG 关键词 + 写入动词」**同行共现**（初版只认关键词 ⇒ 实测 6 条合法提交假红，已修）；判据面取**版本下限 tag 的提交范围**（不用条数窗口，防随提交密度静默收窄）；候选集加 `--no-merges`（merge 给 combined diff 与「相对主线新增」不等价 ⇒ 假红）。编号口径**复用既有 `REF_NUMBER_PATTERN`**（未新增第二份单源）。含 6 组变异自证 + 3 例 CLI 端到端。

---

## [1.14.3] - 2026-09-28

### Fixed

- **CHANGELOG 漏记 `#399` / `#404`（G3 跨 app 恒拦修复）** — Issue #399 的 G3 修复（PR #404，merge commit `33a9006`）实际落在 v1.14.1，而 1.14.1 / 1.14.2 两段**均未提及**该 Issue/PR，且 v1.14.2 发布提交（`77d9e76`）message 声称已写入、其 CHANGELOG diff 实际未写入（假留痕）。本版把该条目补录进 1.14.1 段 `### Fixed`，并补 1.14.1 Added 段 PR #405 引用。

### Added

- **发布说明 ↔ CHANGELOG 段内容连通守卫（判据④，PR #411）** — `validate:release-connectivity` 原判据② 只校验「CHANGELOG 段**是否存在**」，对「段**内容是否覆盖已发布的引用**」无感 ⇒ 同一漏记形态（Release Notes 列了、CHANGELOG 段没写）可长期存在。新增判据④：断言「发布说明 §一 引用 ⊆ CHANGELOG 版本段（含**任一更早**段）引用」—— 允许回引前序版本、不允许预支更晚留痕；RN 存在却识别不到 §一 章节标题则**报红**（不静默降级）。含 3 组 CLI 端到端变异自证（还原修复前 CHANGELOG ⇒ 报红 `#399/#404/#405`；下限放宽至 1.99.0 ⇒ 报红；标题口径不符 ⇒ EXIT=1）。

---

## [1.14.2] - 2026-09-28

### Added

- **工具结果「信封契约」独立守卫（Issue #401 W-2，PR #406）** — 新增
  `scripts/validate-tool-result-payload.js` 并纳入 `npm run preflight`：断言
  「治理层读的信封顶层键 ⊆ `mcp-server.ts` 投影后真实存在的键」，同时禁止把**字段名**
  写进兜底文案（`'success:false'` 之类）。语义键 `tool-result-payload` 已登记进轴 I 清单。


- **校对整链补入报告环 + 链路级计数对账（Issue #395 收口）** — 原 `runFullChain()` 止于 `proofreadAccumulate`，
  「整链」名不副实（报告环不在链内，而「8 处问题 / 六维全 10.0」正是报告环产物）。本次：
  - `tests/governance-proofread-e2e-395.test.js`：`runFullChain()` 补第 ⑨ 步 `generateProofreadReport`；
    新增 **R9-1 负向对照**（整链省略报告步 ⇒ 继续推进仍被 P2 拦；补上报告步 ⇒ 放行），证明报告步非空跑。
  - 新增 `wps-office-mcp/src/tests/unit/proofread-full-chain-report-395.test.ts`（4 例）：真实
    `proofreadAccumulateHandler` → 真实 `generateProofreadReportHandler`，对**用户可见的报告文本**
    断言「**六维计数合计 + 未分类数 == 上报总数**」（含变异自证：六维漏计 1 条 ⇒ 等式打红），
    并锁「parser 维度清单 = 真实 `PROOFREAD_METRICS` 单源」（维度集漂移即报红）。
- **6/13 评审轮修复（Issue #395，PR #403）**：
  - **SKILL.md 校对坐标键名 `startOffset` → `start_offset`**（CR1-1）：原文档教驼峰、服务端只认下划线，
    实跑 `proofreadBasicHandler({startOffset:0})` = `success:false`「缺少 start_offset」——文档契约与
    MCP schema 对齐后，A2「名实一致」名副其实。
  - **e2e 新增 A2 可执行断言**（CR1-2/CR2-1/CR5-1）：AC7.4 锁「链中坐标键名 == SKILL『必须传』句」
    （单源常量 `PROOFREAD_START_KEY`，含真实链路变异自证）；AC7.5 锁「链中每个工具名均出现在 SKILL」
    （`SINGLE_BATCH_TOOLS` 改用 SKILL 教的裸名，含变异自证）。
  - **`scripts/validate-hook-contract.js` 锚点扩宽**（CR1-3 / CR7-1）：闭合「双引号方括号 / `args` 简写 /
    第二参包裹括号 `({})`」三个逃逸面（实测原 `plugin["tool.execute.before"]({args}, {})` 与 `({}, ({}))` 均 EXIT=0 漏报），并补专测。
  - **e2e 新增 G2 同契约覆盖**（CR8-1）：`beforeArgs()` 改动的 G2 消费点（`wps_execute_method` 白名单）
    补 AC7.6（官方契约下白名单放行 / 越权拦 / 变异自证）。


### Changed


- **治理层信封消费口径统一（Issue #401 W-2）** — `enableTrackChanges` / `generateProofreadReport`
  两处消费点由读 `output.success`（**投影中被剥离的键**）改为读投影后唯一存活的 `output.isError`。


- **口径更正（Issue #395）**：v1.14.0 文案「全链条真跑通」加限定语 —— 当时实为
  「**治理层整链（不含出报告）+ 桩数据**」，与「条件项」披露保持一致（原无限定语属夸大）。

- **净增/净删总账（Issue #395，QA 实测逐文件核对）**：校对源码棘轮 **0**（`proofread-report.ts` −2 / `proofread-report-copy.ts` +2）、`governance.js` **+9/−4**、守卫/元数据物理行数 **+157**（其中 **23 行 = 纯记账 metablock**，真实覆盖面 **+134**：新增钩子契约守卫 116 + 轴 I 扩面 18）。
- **自限对齐**：RC-3 的真实 WPS COM 端到端、真实大文档多批回归，仍为条件项（本环境无 WPS，已在本节与 Release Notes 双处披露，不假装已闭环）。

### Fixed

- **`.opencode/plugins/governance.js` 的 after 钩子早退遮蔽失败分支（Issue #401 W-2）** —
  入口处 `if (output?.isError) return;` 会把「失败事件」整个挡在钩子之外，失败态分支
  （如 `enableTrackChanges` 的 `st.trackChangesOn=false`）**永不执行**；现改为各分支按
  `isError` / 人类可读中文标记自行判定失败。
- **`tests/governance-proofread-e2e-395.test.js` 的 R6-1 用例传了运行时不可能出现的信封形态** —
  原先传 `{ output, success: false }`（handler 返回体的键），而 after 钩子拿到的是投影后的
  `{ content, isError }`；现改为真链路形态 `isError: true`。

### Removed

- **`'success:false'` 兜底文案标记（Issue #401 W-2）** — 它在投影后的信封里**不可能出现**
  （死标记，永不命中的兜底 = 假绿），改由 `isError` 结构化信号承担。
- **被取代机制**：RC-1 的两处键名直读分支（→ `normalizeStartOffset` 单点）；RC-6 的 3 处 `input.args` 参数读取（→ `beforeArgs()` 单点）；RC-7 的报告头部内联口径（→ `ALL_FIXED_REVS` 单源）。

## [1.14.1] - 2026-09-28

### Fixed

- **G3「读前必写」门禁对 Excel / PPT 恒拦（Issue #399，PR #404，merge commit `33a9006`）** —
  两层根因叠加：**RC-1** `appReadState` 读取侧只认 `activeDocRead`，而 Excel/PPT 置位侧写
  `activeWorkbookRead` / `activePresentationRead` ⇒ 永远读到 `false`；**RC-2** `getAppType` 只认
  COM 短名前缀（`getCell*` / `getSlide*`），注册名归一后掉进 `'word'` 兜底 ⇒ 字段名即使修好 PPT 仍恒拦。
  现把字段名收敛为 `appReadStateSlot()` **单源构造**（读取/写入共用），app 归属改为按**应用段**判定 +
  COM 短名语义词表兜底（两通道归一后同形）；拦截文案按 app 指路。新增
  `tests/governance-g3-read-before-write.test.js`（15 例，含两条变异自证）。

  ⚠️ **本条为发布留痕补正**：该修复随 v1.14.1 落主线，但当时 CHANGELOG 段漏记（仅
  `docs/releases/v1.14.2.md` 提及）。现按「段 ↔ 发布说明」连通性守卫（`validate-release-connectivity`
  判据④）补录，使文档与真值一致。

### Added

- **P2「覆盖全文后禁止推进」不变量新增 `scripts/` 层行为守卫（Issue #400，PR #405）** — 该门禁的
  「单批文档在校对前不被拦」不变量此前**只由 `tests/` 承载**，把判据整块删除后 `scripts/` 下五守卫**全 exit 0**
  （Issue #395 门禁遮蔽探针登记的遗留项 W-1，属「不变量必须归属门禁」缺口）。本次：
  - 新增 `scripts/validate-proofread-p2-invariant.js`（**行为**断言，非形态）：在 `scripts/` 层加载 **prod**
    `governance.js`，注入真实 `before`/`after` 钩子调用链 —— ① 单批（≤200 段）「首批取段即达文末」时
    ③取文本 + ④校对**不被拦**（否则闭环死锁）；② 对偶面：多批末批上报（覆盖全文）后继续推进**仍被拦**
    （防「为过 ① 而整块删门禁」）。
  - 判据纯函数在 `scripts/lib/proofread-p2-invariant.js`（模块内无仓库路径字面量）；登记 `GUARD_SCOPES`
    覆盖源 + 第 10 语义键 `proofread-p2-invariant`；接入 `preflight`。
  - **变异自证（走真实链路）**：删 `st.batchAccumulatedThisBatch &&` 前置 ⇒ 守卫 **EXIT 1**；还原 ⇒ **EXIT 0**。

### 净增/净删

- 净增 **+704 / −5**（9 文件）。**被取代机制**：无同范围旧机制可删（该不变量此前只由 `tests/` 承载、
  `scripts/` 层无门禁）⇒ 据实登记为净增，属「把一次性修复升为持续可验守卫」，非扩容。

## [1.14.0] - 2026-09-28

### Fixed

- **修复「校对抽风」7 类根因（Issue #395，PR #397，merge commit `ade19b3`）** — 两次真实校对会话
  （s1：341 次工具调用 / 28 处报错，s2：54 次调用 / 21 处报错）暴露的不是 AI 偷懒，而是
  **通道层 → 归一层 → 参数层 → 状态机层**四层缺陷叠加，把 AI 逼进「每一步都被门禁拦、只能靠猜」的死角。
  逐条修复（每条均有实跑复现）：
  - **RC-0 内置名归一为 `null`**：`SKILL.md` 教 AI 调的是**内置** `wps_get_active_document`，
    而归一函数 `normalizeToolCall` 只认 `wps_{word|excel|ppt|common}_xxx` 前缀 ⇒ 内置名归一为 `null`
    ⇒ `docInfoFetched` **永不置位** ⇒ 后续每道门禁恒报「请先调用 getActiveDocument」。
    现补**内置名映射**（`get_active_document` / `get_active_workbook` / `get_active_presentation`
    → `getActiveDocument` 等），且 SKILL 与门禁**同源同改**。
  - **RC-0′ 输出形态只认文本**：内置名成功体是 **JSON**，after 钩子却只按 `路径：/总段数：` **文本**正则解析
    ⇒ `totalParagraphs=0` ⇒ P2 判据失效。现改「**先试 JSON、回落文本**」，双形态取同一组字段。
  - **RC-1 同一参数两套键名**：MCP schema 只暴露 `start_offset`（下划线），门禁却读驼峰 `startOffset`
    ⇒ **传哪个都过不了另一层**（s1 里 17 次「缺少 startOffset」）。现收敛为**单点** `normalizeStartOffset`，
    两条门禁共用（删去两处各读一套）。
  - **RC-2 单批文档闭环死锁**：≤200 段（单批）文档**首批取段即「覆盖全文」** ⇒ P2 拦下
    `PROOFREAD_ADVANCE_TOOLS` 全部 5 个（取文本/校对/确认/替换全拦），只剩 `accumulate`/`report` 放行，
    而报告又要求先有校对痕迹 ⇒ **闭环死锁**（影响绝大多数周报/纪要类文档）。现 P2「覆盖全文」判据
    加前置 **`batchAccumulatedThisBatch`**（仅在本批已上报后才生效），多批「覆盖全文后强制收尾」语义保持不变。
  - **RC-3 `enableTrackChanges` 谎报成功**：`active` 与 `trackChanges` 同属一次 COM 往返、且直接回抄入参
    ⇒ 写入被静默拒绝时仍回显「已开启」（s2 日志：开启 → 状态「已关闭」→ 再开启 → 才「已开启」）。
    现 handler **独立往返回读** `getTrackChangesStatus`，不一致即 `success:false`，文案只依据**回读值**。
  - **RC-4 `type` 词表缺失致报告自相矛盾**：`TYPE_METRIC_MAP` 43 个 key 全为中文，SKILL 未给词表，
    AI 写英文 `punctuation`/`fluency` 被**原样保留**后查表失败 ⇒ 静默落「未分类」**不计六维**
    ⇒ 报告一边「发现问题 8 处」一边「六维全 10.0」。现 `normalizeIssueType` 未命中不再原样保留
    （统一兜底推断，兜不住即「未分类」且**可见**不计分），SKILL 给出**派生自单源**的词表来源。
  - **RC-5 通道故障文案误导用户**：`content.ts` / `mcp-server.ts` 的失败文案「请确认文档已打开 /
    请把文档窗口切到前台」与同帧 `<wps-context>`（已证明文档已开）**直接矛盾**，把 COM 通道 ROT
    挂接失败误诊为「用户没打开文档」。现改为「**COM 通道未挂接，可调用 openDocument 重连**」。

### Added

- **整链端到端回归 `tests/governance-proofread-e2e-395.test.js`（659 行，17/17）** — 兑现用户
  「测试环节全链条真正跑通、不要左右互搏」的要求，落成三条硬约束：
  - **A1 同一入口**：`runFullChain()` 一条链串 ①取文档→②取段→③取文本→④校对→⑤开修订→⑥确认→⑦替换→⑧上报。
  - **A2 名实一致**：链中工具名/参数键名 = `SKILL.md` 教 AI 用的那套（内置名 + 下划线 `start_offset`）。
  - **A3 变异自证**：把 5 处修复点逐个整块删除，对应用例**必须由绿转红**（实测全转红）；
    另补 3 条**负向对照**（未经取文档 → 取段被拦；未开修订 → 替换被拦；覆盖全文后 → 推进被拦）。
  - **⚠️ 口径更正（Issue #395 收口）**：上句「全链条真正跑通」在当时**名不副实** —— 该 `runFullChain()`
    止于第 ⑧ 步 `proofreadAccumulate`，**从未调用 `generateProofreadReport`**（报告环不在链内），
    且全程喂**桩数据**（不触真实 WPS / 不落盘）。而原始症状「8 处问题 / 六维全 10.0」恰恰**只在报告环产生**。
    准确口径应为「**治理层整链（不含出报告）+ 桩数据**」。报告环已于 Issue #395 收口补入（见 [Unreleased]）。
- **MCP 单测**：`proofread-track-changes-readback.test.ts`（4/4，含删判据自证）、
  `proofread-normalize-contract.test.ts`（未命中 type 不再静默降级）。

### Changed

- **`preflight` 纳入 MCP 集成测试**（`cd wps-office-mcp && npm test`）— 修复评审发现的**门禁面 < 测试面**
  根因（`preflight` 原先不含 MCP 集成测试，导致本 PR 引入的 `skills-consistency` 回归**单测层看不见、CI 会红**）；
  新增断言（`tests/validate-doc-drift.test.js`）锁定该段存在，变异删除该段 → 由绿转红。

### Removed

- **RC-1 的两处重复键名读取分支**收敛为单点 `normalizeStartOffset`；**RC-4 的「未命中即原样保留」分支**删除。

- **轴 I 判据 F：治理层校对门禁「直连 / 网关」两通道同口径（Issue #382 12/12 复盘）** —
  复盘铁律 22/23 要求「改进项当轮落成守卫（含变异自证）」。本轮把 6/12 评审 **CR10-1** 的根因
  （DECISION-1 后 4 个纯 TS 校对工具**直连可调**，而 P1~P4 门禁原先**只写在 `wps_office_execute`
  分支内** ⇒ 直连通道整体绕过校对治理）钉成**判据 F**（`scripts/validate-gateway-membership.js`）：
  ① `normalizeToolCall` 归一化**唯一定义者**（两份解析 = 两条通道各一套口径）；
  ② **before / after 双钩子**都必须消费它（只归一化一条通道 = CR10-1 原样复发）；
  ③ 判据**不得**在归一化定义体之外直接读 `args.tool_name` 取工具身份（旧「只认网关外形」形态）。
  - **变异自证**：新增专用测试 `tests/validate-gateway-f-criterion.test.js`（**8/8**）——逐条注入反例
    （删定义 / 加第二份定义 / 删单钩子调用 / 删两钩子调用 / 定义体外读 `args.tool_name`）断言守卫 CLI
    由绿转红且命中 `判据 F`，另有「反向绿」与「元自证（定义 1 处、调用 ≥2 处）」证明断言非恒真。
  - **自限（显式披露）**：判据 F 为**形态断言**（查调用点/定义点形态）；真**行为**断言落在
    `tests/governance-direct-call.test.js`（走真实插件钩子实测直连通道被 P1 拦截）。
  - 轴 I 守卫源码体量棘轮按实测同步回写（`guardCodeLines` 960 → 976 / `guardSourceLines`
    6974 → 7003，均在同 PR 内留痕）。

- **轴 I 判据 G：历史债披露项**必须**带跟踪 Issue 编号（Issue #389，复盘铁律 22）** —
  原「范围外既有重复入口」披露文案写「待独立 Issue 处理」**不带编号**，正是铁律 22 明令禁止的
  「无 Issue 编号的待后续」形态（债会静默沉淀）。本轮把编号收敛为**单源**并落成守卫：
  - 新增 `scripts/lib/legacy-debt-manifest.js`（`<工具短名>: { issue: <正整数> }`，编号唯一事实源，
    本守卫不重抄清单）；披露文案的 `#388` 由该单源**派生**。
  - 守卫 `scripts/validate-gateway-membership.js` 新增**判据 G**：凡披露项在单源中缺（或非正整数）
    跟踪 Issue 编号即报红；`scripts/lib/legacy-debt-manifest.js` 已随 `guard-sources` 机械枚举进入
    `.prettierignore` 体量闸门豁免清单（双向集合相等断言）。
  - **变异自证**：`tests/validate-gateway-membership.test.js` 新增 3 例（正向带 `#388` / 清空编号报红 /
    删登记报红），现 **14/14**。
  - 轴 I 守卫源码体量棘轮按实测同步回写（`guardCodeLines` 976 → 1002 / `guardSourceLines`
    7003 → 7130，均在同 PR 内留痕）。

### Removed

- **`COM_ACTIONS` 删除 `generateFormula` / `writeFile` 两条重复入口（Issue #388）** —
  两条工具同时满足「∈ `allTools`（直连注册）+ 有 TS handler + PS1 无同名分支」，却仍留在
  `gateway/com-actions.ts` 的 `COM_ACTIONS` 索引中 ⇒ **同一语义两份定义**（schema 的唯一定义者应是
  其 `definition`）。按 DECISION-1 统一规则（无 COM 方法可透传的纯 TS 逻辑工具一律直连注册），
  从索引删除这两条。
  - **schema-safe**：`gateway/index.ts` 的 `params: SCHEMA_MAP.get(tool.name) ?? tool.paramsSchema`，
    而 `SCHEMA_MAP` **派生自 `allTools`**、不读 `COM_ACTIONS[].paramsSchema` ⇒ 那两份 `paramsSchema`
    是**取不到的死分支**（已不生效的第二份定义），删除不损失任何 schema 信息。
  - 守卫判据 G 升级为**双向**：① 披露项须带正整数跟踪 Issue 编号；② 单源登记项须对应**真实**披露项
    （债已清偿却仍登记 = 台账说谎，报红）。`scripts/lib/legacy-debt-manifest.js` 随之清空。
  - **变异自证**：`tests/validate-gateway-membership.test.js` 现 **16/16**，含 #388 要求的
    「删两条→披露清零；还原→披露复现」负向自证 + 无编号报红 + 幽灵台账报红。
  - `COM_ACTIONS` 251 项（-2）；`validate:toolcounts` / 轴 I 判据 A~G 全绿。
  - 轴 I 守卫源码体量棘轮按实测同步回写（`guardCodeLines` 976 → 1013 / `guardSourceLines`
    7003 → 7156，均在同 PR 内留痕）。

## [1.13.0] - 2026-09-24

### Changed

- **NPC Team 提示词整体整改（Issue #383）** — 提示词正文 **159 行 → 85 行**（-46%），硬上限
  `LIMITS.promptLines` **190 → 90**（用户明确要求「严格控制上限为 90，只减不加至少持平」）。
  十二条相互矛盾之处逐条消解：
  - **A1/A2（豁免口径互斥）**：删除「简单需求可跳 2/3/6 非关键项」「3 可省略、4 简单跳过、7 按需裁剪」
    「ARCH 简单改动跳过」三套并存口径，统一为 **⏸CP 之外无豁免**（2/13~7/13 任何环节不得以「简单」为由跳过，
    只允许减「内容深度」）。
  - **A3（接力卡 PR 编号无兜底）**：铁律 12 增加「尚未有 PR 时写『尚无 PR（未到 5/13 开发棒）』」兜底口径。
  - **A4（留痕枚举 ↔ 流水线步数不对齐）**：留痕枚举随流水线收敛为 13 项，评审与修复表述为「评审-修复循环」一项。
  - **A5（⏸CP2.5 未在引导语点名）**：引导语收敛为「到 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 输出暂停卡；到 ⏸CP3 输出【合并确认卡】」。
  - **A6（修复棒预判清零，因果倒置）**：清零判定与累计轮次统一由**复评棒**给出，前面各棒不预判。
  - **B1（铁律 16/17/18 内部条号跳号）**：理顺为 ①~⑥ / ④⑦⑨⑩ / ⑥⑪⑧⑫⑬⑭ 连续可读序列。
  - **B2（铁律 24 内嵌历史编号回潮）**：删除正文内嵌的 `~~Pxx~~` 历史编号（`validate:removed-mechanisms` 专治形态）。
  - **B3（交接话术硬编码 N+1/12）**：接力卡模板增加「若本步为 13/13 则写『流程结束，无下一步』」终止口径。

### Added

- **新增 1/13 深入分析阶段 + ⏸CP0 暂停点（Issue #383）** — 流水线由 12 阶段扩为 **13 阶段**：
  1/13 深入分析（RES 主持 + PO 提问：问答定位 / 故障根因 / 头脑风暴 / 发散收敛，可多轮盘清）
  → **⏸CP0 分析确认**（用户确认「盘清了、无遗漏」后才进拆解，天然成为第 5 个暂停点）；
  原 1/12「需求接收 + PO 澄清」合并进 1/13；需求覆盖度检查由「7/12 附加动作」提为 **8/13 独立环节**
  （与门禁表/进度表/暂停点对称）。
- **阶段总数单源化（Issue #383 C1/C2）** — 删除「12」在 `validate-npc-team-prompt.js` 内的三处硬编码
  （阶段号正则 / `for (let i = 1; i <= 12; i++)` 循环上界 / 段落标题字面量），一律派生自
  `lib/npc-team-prompt-source.js` 的 `STAGE_COUNT`；`STAGE_PROTECTION` 环节保护表扩为 13 条。

### Removed

- **三处手写阶段总数与两处手写段标题字面量（Issue #383「敢删」）** —
  `\/12` 正则、`i <= 12` 上界、「12 阶段」段锚点，以及三处 `prompt.match(/^【XX…\n([\s\S]*?)(?=\n【|$)/m)`
  段提取正则（该正则在 `m` 标志下 `$` 匹配行尾，惰性量词会立刻收尾于首行末 —— 实测段内容只捕获 1 行，
  导致角色卡片校验全部误报）；后者统一收敛为行式 `sectionOf` / `sectionBetween` 派生 helper。

## [1.12.0] - 2026-09-24

### Changed

- **校对工具契约解耦：纯 TS 逻辑工具直连注册，取消「网关专属」（Issue #382 DECISION-1）** —
  按用户拍板的 DECISION-1「**无 COM 方法可透传的纯 TS 逻辑工具一律直连注册**」重写工具面，根治
  「AI 只看得见 15 个内置工具、校对工具须靠 `wps_office_search` 猜词才能发现且拿到残缺 schema」这一
  #382 失真的**共同物理位置**。
  - **会话身份改由文档派生**：**彻底删除 `session_id`**（#325「session 机制一律清理」的最终形态）——
    服务端 `deriveSessionKey(doc_info)`（`proofread-session.ts`，唯一定义者）按文档绝对路径派生 key；
    **无 `filePath` 即拒绝**（不回落 `fileName`，遵「不要下兜底」）。直接消掉 AI 空转 11 轮
    （UUID v4 无生成手段）的全部成因。
  - **注册层**：删 `GATEWAY_ONLY_TOOLS` 黑名单；4 个纯 TS 工具（`wps_word_proofread_basic` /
    `wps_word_confirm_batch_ai_proofread` / `wps_word_proofread_accumulate` /
    `wps_word_generate_proofread_report`）**补 definition 并进 `allTools`**；`mcp-server.ts` 的
    `registerBuiltinTools()` **真实 `registerAll(allTools)`**（此前该调用**从未存在** —— 「直连注册」只是注释里的声明）。
  - **治理层**：删 `DIRECT_TO_GATEWAY` 拦截表 + **G1 规则整条**（+ 其 `GUIDE_MAP` 键）；G2 拦截消息
    回显真实 `method`（原读 `args.method` 落空 ⇒ 消息里是空串，诊断价值为 0）。
  - **「同名不得双通道」**：2 个报告工具的 COM_ACTIONS 条目整体删除（定义迁回与 handler 同居处）。
  - **让 schema 说真话**：`doc_info` 展开 4 子字段（含 `totalWords`，报告不再必然写「总字数: 0」）；
    `_processed_to_paragraph` 由 `required:false` 改 `true`（会硬拒的参数必须说必填）；
    `confirmBatchAiProofread` 由**空签到**改为必传 `ai_issue_count`（Layer2 产出可被核对）。
  - **删掉不生效的规则**：`proofreadBasic.text` 的 `maxLength=5000`（从未生效：网关 schema 转换丢 `maxLength`、
    handler 无长度校验）三处措辞删除，只留「单批 200 段」；**不**把 `maxLength` 补进网关 schema。
  - **搜索可自纠**：`wps_office_search` 空结果给出「换同义词 / 传空 query 列全量 / 内置工具直接调」的提示。
  - **SKILL 与源码同口径**：删「7 个，直接调用」标题矛盾与「`batchStarted` 后必须走网关」条件句，
    改「直接调用 / 走网关 / 不存在」三栏清单；补 `getDocumentTextByRange` **超返裁定**（以 `returnedLength` 为准）、
    长段 `findText` 取全量原文、`total_revisions` 传差值（记基线）。
  - **守卫重写**：`validate-gateway-membership.js` 判据 A~E（纯 TS 工具必直连注册 / 同名不得双通道 /
    索引条目必有执行者 / 不得再有网关专属黑名单 / schema 转换须搬运 required），482 → 274 行；
    10 例变异自证（逐判据注入反例由绿转红）。新增 `proofread-session-key-contract` 8 例回归。
  - **净账**：`gateway/com-actions.ts` −85 / `tool-registry.ts` −27 / `governance.js` −22 /
    `validate-gateway-membership.js` −208 行；校对线体量闸门 1824 → 1884（+60 为「定义从网关表搬入
    与实现同居处」的搬家成本，已在 `upgradeLog` 留痕并给出全仓净删证据）。

## [1.11.0] - 2026-09-23

### Added

- **发布留痕连通性守卫（Issue #380 12/12 复盘，铁律 22）** — 新增 `validate:release-connectivity`（已入 `preflight`）：
  断言**发布标签 ↔ 版本号 ↔ CHANGELOG 段**的连通性（两条判据）——
  ① `vX.Y.Z` 标签所指向提交里的 `package.json.version` 必须等于 `X.Y.Z`；
  ② 每个 `vX.Y.Z` 标签在 `CHANGELOG.md` 必须有 `## [X.Y.Z]` 段。
  病灶为本轮实测出的**真缺陷**：`v1.11.0` 平台标签指向的提交版本竟是 `1.10.0`
  （Release 由 `main` 提前创建，而版本号落在未合并 PR 上 ⇒ 标签落到 1.10.0 树）。
  与 #353（断档编号）/ #357（已删机制）**同族**：文档/标签的「名」与真值之间无连通断言。
  设计要点：声明式**版本下限** `1.9.8`（非逐标签豁免，避免「自许可通道」）；
  `.cnb.yml` 增 `git fetch --tags`（防浅克隆无 tags ⇒ 守卫静默跳过 = 假绿）；
  12 例专测（含 4 例真实 CLI 变异自证，由绿转红）。**修复动作**：平台标签 `v1.11.0` 已重指到
  发布提交 `57455be`（版本 1.11.0），守卫随之由红转绿（对照实验见 PR 留痕）。

- **文档形态守卫新增「断档编号」判据（Issue #352 第十二刀，PR #378，merge commit `dd97559`）** — 与「已删机制」合并进**同一守卫 + 同一文档树**（不新建文件），堵住 #353 形态的历史缺口：
  - **病灶（12/12 复盘实测）**：#353 的原始形态（文档引用 `governance.js` 中不存在的治理规则编号）**此前后无任何门禁可拦** —— 向 `docs/USAGE.md` 非历史区注入一个已归并的编号，轴 I / 已删机制守卫 / 体量闸门 **全绿**（合法编号集合不是代码符号，天然落在轴 I 归属池之外）。
  - **数据单源**：`doc-drift-manifest.js` 新增 `RULE_REF_DERIVE` —— 合法编号集合**运行时从 `governance.js` 头部声明行派生**（不手写第二份清单；派生源缺失即报红）。
  - **判据纯函数**：`doc-drift-scope.js` 新增 `checkDanglingRuleRefs`（模块内无仓库路径字面量）；覆盖范围 `guard-scopes.js` 守卫名 `removed-mechanisms` → `doc-drift`。
  - **双向口径**：非历史区命中报红 / 历史区命中缺显式标注同样报红；`P0-1` 这类问题 ID 前缀由负向断言 `(?![-_])` 排除。
  - **变异自证（真实 CLI 链路，6 例）**：非历史区注入 → 红 · 历史区无标注 → 红 · 基线 / 历史区带标注 / 合法编号 / 问题 ID → 绿；专测 **31/31**（新增 9 例判据 + 3 例变异 + 1 例 end-to-end）。
  - **E1 棘轮随实测同步**：`guardCodeLines` 606 → 631、`guardSourceLines` 5545 → 5648（`wc -l` 实测回写，两条留痕已登记）；无同范围被取代机制可删 ⇒ 据实登记为净增。
  - **自证有效**：同步 `AGENTS.md` / `docs/DEVELOPMENT_GUIDE.md` 时，本守卫当场拦下 `AGENTS.md` 自身新引入的越界编号引用。

### Changed

- **方案 A：治理层服从注册层，内置工具一律放行直连（Issue #373，PR #375）** — 消除「注册层 / 治理层 / 文档层 / 校验脚本」四处口径互相矛盾的根因（用户现象：AI 照着文档调内置工具 → 被治理层拦 → 再搜 → 再试，盲试 30 余次、整轮零产出）。
  - **行为变更（用户可见）**：`governance.js` 的 `DIRECT_TO_GATEWAY` 由 13 键收敛为 **7 键**（全部为「网关专属」校对工具）；启动即注册的内置工具（数量以 `mcp-server.ts` 为准，实测 15）**一律放行直连**，不再被 G1 拦截。网关专属校对工具（`proofreadAccumulate` / `generateProofreadReport` / `enableTrackChanges` / `getTrackChangesStatus` / `replaceInParagraph` / `proofreadBasic` / `confirmBatchAiProofread`）**原样保留** G1 拦截。
  - **新增通道自检工具 `wps_whoami`（内置，可直接调用）**：一次说清哪条通道断了，输出 `ready` / `channelReady` / `activeDocument` / `allowActions` / `blockedActions`；失败消息统一附「下一步：调 `wps_whoami` 自检」。
  - `wps_get_active_document` 失败时恒 `success: false`（不再把 launcher 心跳缓存包成假成功），缓存信息降级为**显式标注的「诊断线索·非成功」**；抛错/无缓存/有缓存三种形态均有行为测试守护（`active-document-honesty`，6 例）。
  - 文档口径收敛：`docs/SKILLS.md` 等 9 处消费方统一为「数量以 `mcp-server.ts` 为准（不写死数字）」；删除已变假的「G1 网关强制」行；`docs/TROUBLESHOOTING.md` 新增「工具调用反复失败（`No active document`）排查」专章。

### Fixed

- **`validate:toolcounts` 两处静默假绿（Issue #373，PR #375）** — 「内置工具」数原为**手写常量**（恒 12，真值 15）、COM Actions 原读**已迁移的旧数组**（恒 0，真值 257）。现三个数字（内置 / COM Actions / 注册工具）**全部派生自代码**（`mcp-server.ts` / `com-actions.ts`），脚本自身不再是漂移源。
- **补齐「注册层 ↔ 治理层 ↔ 文档层」交叉断言（Issue #373，PR #375）** — `validate-gateway-membership` 新增判据 G 双向（G-1「该放行的都放行」/ G-2「`DIRECT_TO_GATEWAY` 键无孤儿」）与判据 H（网关索引条目 ↔ 有执行者）；轴 I 新增第 9 语义键 `tool-count-source`（4 落点双向闭合）。两条判据均有真实 CLI 变异自证（由绿转红）。

### 发布口径修正（发布线诚实收口）

- **发布线诚实收口（Issue #380，本次发布）** — ① CHANGELOG 补齐 v1.10.0 后合并进 `main` 的第十二刀条目（此前 [Unreleased] 为空，刀次变更未被记录）；② 发布产物构成口径按「发布提交快照」如实书写（`.gitignore` 已忽略 `dist/`，CI 亦无 dist 构建步骤 ⇒ 产物**不含** dist，修正 v1.10.0 的不实描述）。

## [1.10.0] - 2026-09-22

### Changed

- **校对源码压缩方案 A+B+D（Issue #352，PR #376）** — 承接 A/B/C/D 四项可砍空间，按用户指令只做 A+B+D，**不碰 C**（报告诚实性逻辑）：
  - **A 风格偏好规则默认关闭**：`Rule.optionalGroup` 新标记，**30 条**规则（口语化 17 + 格式类 13）标为可选组，  规则总数仍 80（默认启用 50）；`runBasicProofreading(..., includeOptional=false)` 默认过滤。  **行为变更（诚实披露）**：默认校对不再报口语化/格式类问题，能力在代码层保留（`includeOptional` 入参，当前无用户可达路径）。
  - **B 归一化投影层合一**：`isFixActionInferred` + `classifyFixActionInference` + `describeFixAction` 三投影合一为  `classifyFixActionInference`（`describeFixAction` 无生产消费方，随刀删除）；`FORMAT_TYPES` 改派生自 `TYPE_METRIC_MAP` 单源。  唯一裁决点仍是 `resolveFixAction`。
  - **D store 并入 types**：删除 `proofread-store.ts`（仅余 `PROOFREAD_BATCH_MAX`）并入 `proofread-types.ts`；  同步 `REPORT_SOURCES`（10→9）、`.prettierignore`、`semantic-anchor-manifest.js` 与相关文档。
  - **体量闸门棘轮收紧**：校对源码 **1841 → 1824 行**（9 文件），`LIMITS === RATCHET === ACHIEVED === RATCHET_INITIAL === 1824`。
  - **方案 C 零改动**：`proofread-report-copy.ts` / `summarySection` 未动（`git diff` 可核）。

- **第十一刀补丁：E1 棘轮留痕「时间序」收口（评审 F3，Issue #352）** —
  把`checkRatchet` 判据②隐含依赖的「留痕末条 = 最新」落成**可执行不变量**。
  - **真缺陷（已修复）**：`guardSourceLines` 留痕数组曾为**非时间序**
    （第五/七/九/十/十一刀乱序），`from/to` 链条接不上 —— 同一处既称「收紧到 5379」又称「上调到 5630」；
    而判据②只取**位置上的末条** `.to` 作基线 ⇒ 该陷阱**不会当场报红**（静默）。
  - **修法**：① 留痕数组按**时间序**重排（纯重排，值不变，链条首尾相接）；
    ② 新增单源判据 `lib/ratchet.js` 的 `checkRatchetLogChronology`（每条 `from` 须 = 前一条 `to`），
    守卫消费它并回补 2 例专测（时间序断言 + 真实 CLI 变异自证：打断链条 → 由绿转红）。
  - **单一来源**：链条判据与 `checkRatchet` **同居** `lib/ratchet.js`（守卫侧不得自写第二份比较，专测反证）。
  - **E1 棘轮随实测同步**：`guardCodeLines` 575→606、`guardBranches` 52→53、
    `guardSourceLines` 5475→5545（新增判据 + 编排，含 `E1_RATCHET_LOG` 留痕）。
  - **验证**：`preflight` EXIT=0；`tests/semantic-anchor-scope.test.js` **61/61**；根单测 26/26；MCP 235/235。

- **第十一刀：文档形态守卫「显式自限」继续收口 —— 闭合 1 条真缺陷 + 自限②可收口部分（Issue #352）** —
  守卫 = `validate-removed-mechanisms.js`（已删机制在非历史区的现在时陈述）。
  - **洞 A（真缺陷，已闭合）**：原判据 `annotated → continue` **先于**历史区判定 ⇒ **非历史区**
    只要在同一行顺带写「已删除」即可逃逸（实测：非历史区现在时陈述 + 该字样 → 守卫 `EXIT=0`）。
    现改为**先判历史区**：非历史区命中一律报红。
  - **自限②可收口部分（已收口）**：原自限「历史区只要求显式标注，不校验标注说的是不是同一件事」
    被这一形态当场利用 —— `## 历史存档` 小节内写「（历史存档）+ 已删机制名 + 仍生效 / 推荐使用」
    曾 `EXIT=0` 放行。这不是语义判断题而是**行内自相矛盾**（同一行既称已删又称仍生效）⇒ 现报红
    （断言词单源 = `doc-drift-manifest.js` 的 `ACTIVE_VOICE_MARKERS`，判据模块不得自写第二份）。
  - **残余自限如实披露（非放宽）**：① 只拦关键词命中，换说法的「隐性同义描述」不声称拦住；
    ② 自相矛盾判定只作用于**命中关键词的那一行**，现行时断言词出现在**另一行**
    （同段落相邻行 / 跨段落，实测 `EXIT=0`）不声称拦住 —— 原措辞「不在同一行」未点明该机制，按实测收窄。
  - **评审轮闭合的结构性假绿（🔴）**：`ACTIVE_VOICE_MARKERS` 以位置参数追加到判据第 6 参，若调用点漏传，
    原 `(activeVoiceMarkers || [])` 会把判据**静默降级**（守卫 `EXIT=0` + 专测 15/15 全绿，零信号）。
    现判据显式断言该单源已传入（缺传即报红，无兜底），并回补 3 例专测。
  - **单一来源不变**：数据单源 `lib/doc-drift-manifest.js` / 判据纯函数 `lib/doc-drift-scope.js` /
    覆盖范围 `lib/guard-scopes.js`；`AGENTS.md` 也不再重抄关键词清单（防文档成为第二份真值）。
  - **验证**：`preflight` EXIT=0；`tests/validate-doc-drift.test.js` **18/18**（+7 例：洞 A / 行内矛盾 /
    合法历史记录不误报 / 断言词单源 / 缺传单源必报红 / 判据代码不得兜底 / 残余自限措辞与实测一致）；
    真实 CLI 变异自证（洞 A、行内矛盾、缺传单源均由绿转红；合法历史记录不误报）。
  详见 `AGENTS.md`「文档形态连通性」节。

- **第十刀：K7 守卫整体删除，两条判据并入轴 I（Issue #352）** — 「统一重构 B」+ F6 彻底收口。
  原 K7 由独立 CLI（`validate-governance-guide-map.js`）+ 独立判据模块（`lib/governance-guide-map.js`）
  + 专测承载；第八刀删 CLI 后判据模块**无执行者**（F6）。第十刀不再「删执行者留孤儿」：
  - **两条判据并入轴 I**（`validate-semantic-anchor-scope.js`）：①「标签集合 = `GUIDE_MAP` 键集合」
    双向闭合；② 指路文案预算（每条 ≤60 / 合计 ≤600）。判据纯函数迁入 `lib/semantic-anchor-scope.js`。
  - **整套独立构件删除**：`lib/governance-guide-map.js` / 其 CLI / 其专测 / `package.json` 接线 /
    `guard-scopes.js` 覆盖源常量 / 清单登记（K7 两脚本落点）。
  - **「统一重构 B」附带收益**：归属锚点收敛为单一来源（删 entry 级 `anchorNames`，由落点级
    `site.anchor` 派生 `keyAnchors`）；缺 `anchor` 报红；单字母锚点（<3）不参与归属判定；
    补登一个真实归属空洞（`content.ts` 消费 `renderTruncationNotice`）。
  - **净账**：删 K7 三文件 **615 行**（含专测 290），轴 I 侧并入 **+133 行**（判据 +98 / 守卫 +35），
    评审-修复轮回补 **+61 行**（K7 专测回补 + 消费端落点登记）；
    `guardSourceLines` 按 `wc -l` 实测（见 `E1_RATCHET_LOG`，**不手写中间快照**）。
  - **评审-修复轮（本 PR 内）**：① 修「数字快照过期」（PR/CHANGELOG/留痕曾写 `5630 → 5295`，实测不符）；
    ② **回补 K7 专测**（原 20 例专测随刀删除后，迁移进轴 I 的判据一度零测试覆盖）——
    新增 10 例锁定：括号感知扫描、键提取顶层、单条/合计预算、键集合对账、单源约束 + 2 例真实 CLI 变异自证；
    ③ **消费端落点随实现迁移同步登记**（`semantic-anchor-scope.js` + CLI 登记为 `governance-guide-map` 落点），
    不留「消费端未登记」的孤儿。
  验证：`preflight` EXIT=0；轴 I **59/59**（含新增 10 例 K7）；变异自证（覆盖/预算/缺 anchor 三类注入均由绿转红）。

- **第五刀：体量棘轮并入轴 I 单一来源，删「同一判据的两份实现」（Issue #352）** — 延续「一刀一回复」。
  本刀性质是**去重与收敛**，不是加闸门：
  - **病灶（实测）**：`守卫/元数据源码体量` 判据存在**两份实现** —— 体量闸门 S8 与轴 I 的 E1，
    各自维护「不许上调 / 值与留痕对账 / 达标即收紧」。第五刀把维度并进轴 I（`guardSourceLines`，
    口径 = 物理行数总量，其余维 = 剔注释有效代码行），体量闸门**只量校对源码**。
  - **同刀删除**：`checkRatchet` 的「达标即收紧」分支（实测：该分支在同刀后**全仓零有效调用**；
    其原语义由「实测 ≤ 上限」直接承担）。
  - **单源下沉**：机械枚举实现迁至 `scripts/lib/guard-sources.js`（体量闸门 / 轴 I / 测试三方共用），
    避免「轴 I 量自己时先要求加载体量闸门」的循环。
  - **卫生**：`.prettierignore` 豁免清单随枚举自动同步（新增单源模块 1 行，双向集合断言保证不漏）。
  - **变异自证（真实 CLI + 真实文件）**：给守卫脚本追加 **300 行纯注释** → 物理行数维度 **EXIT=1**；
    新增 `scripts/validate-probe.js`（500 行）→ **不经任何登记**即报红（自动进分母）；还原 → EXIT=0。
  - **评审循环另修两条同族形态**：① `E1_RATCHET_BASELINES` 副本表与 `E1_BASELINES` 逐字相同 ⇒
    「不许上调」判据恒真（9 维白写）—— 改为**派生自留痕**（`log.at(-1).to ?? initial`），
    变异自证：`current=9999` → 报「棘轮被上调」；② 同一维的诊断一度被推两条（修复叠加）
    —— 回退为**单一出口**，并加断言「同维诊断恰好 1 条」。
  - **回归**：`preflight` EXIT=0；`validate:proofread-report-size` 22/22、`semantic-anchor-scope` 55/55。

- **第四刀：`GUIDE_MAP` 指路文案上预算 + 删「按触发次数加长」（Issue #352）** — 按「一刀一回复」逐刀砍
  校对线守卫膨胀。本刀是**唯一直接减 AI 每次被打断要读的 token 的一刀**：
  - **病灶（实测）**：`GUIDE_MAP` 文案是**唯一不受任何闸门约束的膨胀维度**（E1 只量守卫源码、
    体量闸门只量行数）⇒ 14 条合计 **1272 字**、平均 91 字、最长 **184 字**（P2），
    相当于在 `Error.message` 里塞一篇小作文；`enhanceBlock` 还会按触发次数把**同一段**文本
    逐级加长重放（第 2 次「重复提醒」、第 3 次「强警告」）—— 次数只增 token，不增信息。
  - **K7 补第二条独立判据**：`npm run validate:governance-guide-map` 现断言 ①「标签集合 = `GUIDE_MAP`
    键集合」双向闭合（原判据）②**文案预算**（每条 ≤60 字 / 合计 ≤600 字；预算单源 =
    `scripts/lib/governance-guide-map.js` 的 `PER_ENTRY_MAX` / `TOTAL_MAX`）。
  - **同轮改动**：14 条文案压缩至 **596 字 / 最长 58 字**（−676 字）；`enhanceBlock` 恒发
    **同一条短指路**（删掉 `hitCounter` 计数 + 三段加长分支，−19 行）；`skills/wps-proofread/SKILL.md`
    的「重复触发逐级升级」表述同步改正。
  - **变异自证（真实 CLI / 真实钩子）**：向 `P4` 注入超长文案 → K7 **EXIT=1**（点名 `[P4] 62 字 > 60`）；
    还原 → EXIT=0。行为探针（子进程实跑导出的 `tool.execute.before` 钩子）连续触发同一规则 3 次，
    报错文本**逐字相同**（旧实现第 2/3 次更长）。
  - **评审自证发现并闭合的一条假绿**：预算判据初版只按「解析出的条目」求和 ⇒
    把某条文案**改成双引号**（或反引号/多行拼接）即可让该条**静默逃出预算**（实测：条目数 14→13、
    总量少算该条长度、`EXIT=0`）。现 `GUIDE_MAP` **键集合**改为**只看键、不看引号**，
    与「解析出的条目」做**键集合对账**：解析不到的键报「**文案无法解析**」
    （而非误诊为「该拦截点无门禁指路」——那会让排查方向完全错）。变异自证：双引号化任一文案 →
    由绿转红且诊断指向「无法解析」。
  - **体量账（如实，不记假账）**：守卫侧 +117 行（新增契约本体 + 上述闭合假绿的代码，`GUARD_RATCHET.upgradeLog`
    已留痕 `5519 → 5637`），`governance.js` −19 行。**自限**：只量字数，不量「是否真的更易懂」。

## [1.9.35] - 2026-09-18

### Changed

- **测试侧度量改为单一出口 + 两个守卫源码补进体量分母（Issue #347）** — 观察项「`collectFacts()` 每次调用重复全量 I/O」
  的整改，**净增 0 行代码**（守卫侧靠合并重复报错文案腾出预算）：
  - **K5 单一出口**：新增 `tests/helpers/facts-snapshot.js` —— 测试侧读守卫度量的**唯一出口**
    （跨文件**原位** `collectFacts()` 调用点由 4+43 处收敛为 1 处出口）。实测：同一进程内 50 轮取数
    **210 ms → 10 ms**（≥20×）—— 变异自证改经 `requireFresh(模块)` 取**新鲜实例**。
  - **不回退症状（关键）**：出口**只做进程内至多一次**，`collectFacts()` 本体**保持无缓存**；
    它**不**提供「mutation 感知」，`spawnSync` 跑 CLI 的新进程仍立刻看到磁盘新状态 ⇒ Issue #347
    明令禁止的「变异自证静默失效（假绿）」未引入。反向保护：一条「旧快照看不到本次变异」的断言
    （若出口变成 mutation 感知型缓存，该断言立即转红）。
  - **补计漏计对象（负棘轮）**：本预算**两个守卫源码**（`validate-npc-team-bloat.js` / 本守卫）
    此前**不在体量分母内**，且各自被 S6 反向枚举按预登记豁免跳过 ⇒ 实测**各 +300 行注释、两闸门均 `EXIT=0`**
    （对照实验：同一批注释加到 `validate-semantic-anchor-scope.js` → 两侧均 `EXIT=1`）。
    现补进 `GUARD_SOURCES` 并按实测登记，棘轮 **1620 → 2127**（补计，非扩容）；`.prettierignore` 豁免清单同步。

### Fixed

- **S6 反向归属不递归：子目录新文件可绕过体量闸门（Issue #346）** — 整改 Issue #346 的 🟢 观察项。S6「存在的必须已声明」依赖 `DISCOVER` 目录枚举，而 `readdirSync(dir)` **只枚举第一层**：
  - **实测（旧实现）**：新建 `wps-office-mcp/src/tools/word/sub/proofread-x.ts`（合规命名、子目录）→ `undeclared = []`、`EXIT=0`（**静默不可见**）；同层新名 `scripts/lib/ratchet2.js` 反而能拦 ⇒ 缺口在**子目录**，一次 `mkdir` 即绕过闸门。
  - **修复**：枚举改为**手写 walk**（`withFileTypes` 逐层、目录必下钻、正则**只对文件名**）；新增**目录段排除** `EXCLUDE = new Set(['tests'])`（`tests` 是「对语义的断言」而非实现落点）。
  - **实测三坑（自证过程发现，已如实登记；每坑均由探针当场抓到）**：① 单层 `readdirSync(dir)` 不下钻子目录（**本 Issue 本体**）；② 排除判据须按**目录段**而非 `e.name`（`e.name` 只是 basename，`tests/proofread-z.ts` 的 `e.name === 'proofread-z.ts'` ⇒ 排除恒不命中）；③ **`readdirSync({recursive: true})` 对「目录名命中家族正则」的目录同样不下钻** —— 实测 `word/proofread-x.ts/proofread-inner.ts` → `EXIT=0`（静默不可见）⇒ 若照搬方向 1「递归枚举」的写法，缺口只堵一半；现手写 walk 清除该形态（探针须用**内部合规名**，否则不命中正则、探针失效）。
  - **物理行数零净增**：本守卫受 S7 硬棘轮（247 行）约束 ⇒ 新增代码由**等量删注释**抵消，`GUARD_RATCHET.baseline` 保持 **1619** 未动（**未放宽任何棘轮**，亦未走 `upgradeLog`）。
  - **变异自证（真实 CLI，5 探针）**：① `word/sub/proofread-x.ts` → 由 `EXIT=0` 转 `EXIT=1`「S6 未登记源码」；② `word/a/b/c/` 深嵌套同效；③ `word/proofread-x.ts/proofread-inner.ts`（目录名命中家族正则）→ 由 `EXIT=0` 转 `EXIT=1`（第三坑）；④ `word/tests/proofread-z.ts` 在**有**排除时 `EXIT=0`、**删掉**排除即报红（排除是活的）；⑤ 干净仓库仍 `EXIT=0`（不误伤）。
  - **回归测试**：`tests/validate-proofread-report-size.test.js` **32/32**（+4 例，含子目录与深嵌套探针 / **目录名命中正则**探针 / 排除活性 / 源码口径断言）。

### Fixed

- **「同集断言」名为「必须等于」、实现只查「包含」（Issue #341，PR #345 第 4 轮评审）** — 第 4 轮独立评审发现：
  - **R4-F1（🟡）**：两处 `.prettierignore` ↔ 清单「同集断言」（`R1-F4` 与另一条）实现均为**单向**
    （`all.filter(rel => !ignoreSrc.includes(rel))`），但测试名写「放宽集**必须等于** `REPORT_SOURCES`（∪ `GUARD_SOURCES`）」。
    实测：往 `.prettierignore` 加入**无关文件**（如 `scripts/validate-versions.js`）⇒ 该文件被**静默豁免 prettier 门禁**，
    两条断言仍全绿。⇒ `AGENTS.md`/`DEVELOPMENT_GUIDE` 宣称「同集一致性由回归测试断言（改一处漏改另一处即报红）」
    只对**一半**成立（漏改会报、多写不会报）。
  - **修复**：`.prettierignore` 增设机器可读区块标记（`BEGIN/END 体量闸门豁免清单`），断言改为**双向集合相等**
    （区块内条目 == `REPORT_SOURCES ∪ GUARD_SOURCES`），并补一条「往区块内注入无关文件 → 转红」的**真实文件链路**变异自证。
  - **回归测试**：`tests/validate-proofread-report-size.test.js` **28/28**（含双向断言与注入探针）。

- **守卫源码棘轮 initial/baseline 同源致判据恒真（Issue #341，PR #345 第 3 轮评审）** — 第 3 轮独立评审发现第 2 轮整改未真正闭合：
  - **R3-F1（🔴）**：`S8` 传参 `initial: GUARD_RATCHET_BASELINE, baseline: GUARD_RATCHET_BASELINE`（**同一个变量**）⇒
    共享判据② `baseline !== (log.to ?? initial)` 退化为 `X !== X` **恒假** ⇒「上调唯一合法路径 = upgradeLog 留痕」**无执行者**：
    实测只把 `GUARD_RATCHET_BASELINE` 由 1620 抬到 99999（不改 limits、不改实测、留痕为空）→ **`EXIT=0` 静默放宽**。
    **对照实验**：校对源码侧 `initial` 是独立字面量 1842，同探针（LIMITS 与 RATCHET 同改 9999）→ `EXIT=1`「值与留痕不对账」
    —— 同一文件、同一判据，一侧拦得住、另一侧拦不住（铁律 24 第 5 维「同一断言两套口径」）。
  - **修复**：拆为**两个独立常量** —— `GUARD_RATCHET_INITIAL`（初始值，独立字面量）与 `GUARD_RATCHET.baseline`（现值）；
    `initial` 传前者、`baseline` 传后者。探针实测：抬高现值 → `EXIT=1`「棘轮值与留痕不对账」。
  - **回归测试**：`tests/validate-proofread-report-size.test.js` **28/28**（+1 例 R3-F1 变异自证）。

- **守卫源码体量闸门的两个自证/单向缺口（Issue #341，PR #345 第 2 轮评审）** — 第 2 轮独立评审用真实 CLI 探针挖出 2 个缺口：
  - **R2-F1（🔴）棘轮基线自证循环**：S8 的基线此前由 `GUARD_SOURCES` 各值派生 ⇒ **加行 + 同步抬高该文件棘轮值**静默通过
    （实测 `guard-scopes.js` +100 行并把其棘轮 119 → 219 → `EXIT=0`），`upgradeLog`（扩容留痕通道）被完全绕过。
    现基线改为**独立常量** `GUARD_RATCHET_BASELINE`（与 `GUARD_SOURCES` 无派生关系），上调必报「棘轮被上调」。
  - **R2-F2（🔴）新增文件不登记可逃出闸门**：S0/S6 此前只做单向检查（声明的必须存在），不做反向检查；
    总量按**已登记项之和**算 ⇒ 未登记的新文件不进分母（实测新增 `proofread-new.ts` / `guard-scopes-probe.js` 均 `EXIT=0`）。
    PR 描述与本文档曾写「新增文件不登记 → S0 报红」—— **实测不成立**（名实不符）。现补**反向归属**断言
    （`DISCOVER` 枚举口径 + 未登记者报 S6），探针实测两批对象均报红。
  - **回归测试**：`tests/validate-proofread-report-size.test.js` **27/27**（+2 例，含两条变异自证）。
  - **自限（显式披露）**：反向枚举只覆盖 `DISCOVER` 列出的目录/正则，他处新文件不被发现（不声称拦住）。

- **校对线体量闸门三处假绿（Issue #341，PR #345 第 1 轮评审）** — 对 PR #345 做第 1 轮独立评审，用真实 CLI 探针挖出 3 个缺口并整改：
  - **F1（🔴）「绝不增加」对守卫体系本身无效**：轴 I 的 E1 口径是「有效代码行」（**剔注释**），实测给
    `validate-semantic-anchor-scope.js` 追加 **300 行纯注释 → EXIT=0**；同一 PR 还用**物理行数**保护校对源码
    （注释明确写「注释/说明膨胀正是原病灶」），却在守卫自身换了剔注释口径 ⇒ 违反铁律 24 第 5 维「同一断言两套口径」。
    本 PR 自身即为实例（守卫脚本 529 → 559 行、`guardCodeLines` 基线 387 → 411）。
  - **F2（🔴）守卫/元数据脚本无任何体量约束**：`guard-scopes.js` / 判据模块 / 清单模块既不在 `REPORT_SOURCES`，
    E1 又管不住注释（F1）⇒ 旧文档「脚本体积不计行，由 E1 单独约束」的兜底**并不成立**（名实不符）。实测
    `guard-scopes.js` +500 行注释 → `preflight` 全绿。
  - **修复**：新增 `GUARD_SOURCES` 显式清单 + **S6 归属 / S7 物理行数 ≤ 登记值 / S8 棘轮不许上调 + 值与留痕对账**
    三类断言；口径与校对源码**统一为物理行数**（消除「同一断言两套口径」）。**同一轮把本守卫自身压回 253 行以内**
    （247 行），未靠「抬高红线」达标（棘轮只降不升，S8 由「达标未收紧」当场报红）。
  - **F3（🟡）`TARGET_TOTAL_LINES` 名实不符 + 幽灵数字**：`TARGET` 实际语义是「**已达成值**（棘轮收紧基准）」
    而非上限（探针 `TARGET=500` 明显未达成仍 EXIT=0），已更名 `ACHIEVED_TOTAL_LINES` 并同步 `lib/ratchet.js`
    参数文档；清掉注释里遗留的幽灵数字 `1687`（实测 1842）。
  - **变异自证（真实 CLI，均由绿转红）**：守卫脚本 +300 行注释 → S7 报红；`guard-scopes.js` +500 行 → S7 报红；
    清单登记幽灵守卫源文件 → S6 报红；上调守卫源码棘轮 → 「达标未收紧 / 值与留痕不对账」报红。
  - **回归测试**：`tests/validate-proofread-report-size.test.js` 24/24（+4 例，含上述四条变异自证）。

### Changed

- **校对线全层压缩：2822 → 1842 行（−35%），并把体量闸门从「仅报告层」扩为「全层」（Issue #341）** — 用户指令「P0-P3 权限整改，但是记住只大幅压缩，绝不增加」。逐项如下：

  - **口径扩围（本轮最实质的一项）**：此前 `validate-proofread-report-size.js` 的 `REPORT_SOURCES` **只列 `proofread-report.ts`**（299 行），而报告层仅占校对源码 **~11%** —— 其余 5 个文件（规则 / 归一化 / 累加 / 入口 / 类型）共 ~1900 行**完全无体量约束**：把它们改大到任意体积，守卫照样 `EXIT=0`。即「后续也不允许超过 300 行」此前只锁住了 11% 的体积。现计行对象扩为**校对线全部源码 10 个文件**（含新单列的 `proofread-report-copy.ts` 文案层，**同口径计入**，防「不计行的文案抽屉」）。
  - **压缩（功能与报告输出逐字节不变）**：删历史叙事型注释（轮次 / 评审过程 / 被否方案）→ 只留「判据 + 被误报的反例」；声明层（`TYPE_METRIC_MAP` / 白名单数组 / schema 对象 / 类型成员）单行化；多行结果构造收敛为单一 `okResult()`/`fail()`/`gateFail()`；`cleanup` 死路径与重复校验合并。**未删任何规则、任何报告节、任何披露文案**。
  - **行为等价性自证（不采信自述）**：① 规则层 80 条规则 × 49 条定点语料 + 900 段随机语料 → 新旧引擎输出**逐字节一致**；② 归一化层 8 个导出 × 20 组 issue + 跳过区间 × 4 组边界 + 权重公式 → **0 差异**；③ 报告层由既有 `proofread-fixaction-gate-e2e`（打 `generateProofreadReportHandler`）与成对语料锁定。
  - **闸门收紧**：`LIMITS.totalLines === RATCHET.totalLines === TARGET_TOTAL_LINES === 1842`（**只降不升**，S3~S5 棘轮守护）；新增文件不登记 → S0 报红；擅自加行 → S1/S2 报红（四探针变异自证见下）。

- **轴 I 新增「死元数据闸门」：清单落点指向幽灵路径即报红（Issue #341）** — 评审实测：把清单某条落点的 `path` 改成不存在的文件后，全部覆盖类判据仍**全绿**（只打印一条「落点本地不存在（**环境性**，非契约违规）」提示，而环境性提示不拦 CI）。根因：不存在的落点被归并候选池时静默丢弃（`readIfExists` → `null` → `filter` 掉），既无从报漏登记、也不报错。现于候选池**之外**单独扫清单：`sites[].path` 非空却不存在 → **报红**（清单是数据，改名/删除落点必须同步登记）。变异自证：注入幽灵落点 → `EXIT=1` 报「死元数据」；还原 → `EXIT=0`。

- **文档同源修正（Issue #341）** — `AGENTS.md` 原写「校对单测已**整体删除**」与实测矛盾（`src/tests/unit/` 下已有 4 文件 62 例，由 `#343` 重建）：这是**指导 AI 的入口文档**上的名实不符，危害被放大（后来者会以为没有回归网）。已改为实际清单，并补「校对线体量闸门」与「脚本体积不计行（E1 单独约束）」两节。

  **四探针变异自证（真实 CLI 链路，均由绿转红）**：
  | 探针 | 结果 |
  |---|---|
  | 清单登记一个不存在的校对源码 → | `EXIT=1` 报 `S0 计行对象缺失` |
  | 给校对源码加 30 行 → | `EXIT=1` 报 `S1 总行数超上限` |
  | 把 `LIMITS` 与 `RATCHET` 同改 9999 → | `EXIT=1` 报「棘轮被上调」 |
  | 清单登记幽灵落点 → | 轴 I `EXIT=1` 报「死元数据」 |
  | 无探针基线 → | 两守卫均 `EXIT=0` |

### Fixed

- **合并后数值表述与实测对齐（Issue #341，PR #344 合并前评审）** — 合并前独立评审复算时发现 CHANGELOG 记「MCP 全量单测 236 例」与实测 **235/235**（15 suites）不符；已按实测校正为 235 例（PR 描述区的 235/235 本就是对的，仅 CHANGELOG 漂移）。属名实不一致（本 Issue 反复治理的形态），故在合并前修掉而非留观。

- **校对报告体量闸门与语义归属侧的三个假绿缺口（Issue #341，PR #344）** — 严格评审 PR #344 时挖出 3 个真缺口（均附复现探针）：
  - **F1 归属侧嵌套漏扫（🔴）**：`IS_TEST_FILE` 用 `/(^|\/)(tests?|__tests__)\//` 匹配**任意层级** `tests/`，于是 `tests/fixtures/`（实现代码）被整目录排除。探针实测：`tests/fixtures/probe-f.js` 写同义实现 → 轴 I **EXIT=0（假绿）**；`scripts/probe-f.js` 同内容 → EXIT=1。同时删除 `IS_META_MODULE` 的 `validate-*` 整类排除（同样只提供假绿入口，实测 `scripts/validate-tmp-probe.js` 藏同义实现 → EXIT=0；现存 0 个 `validate-*.js` 命中锚点）。**不再开任何「按目录名」的豁免**，边界改为在自限披露里如实说明。
  - **F2 体量闸门可被 rename 绕过（🔴）**：`REPORT_FILES = readdirSync(DIR).filter(/^proofread-report.*\.ts$/)` 由「单目录 + 名字前缀」双重约束构成。探针实测：把 `proofread-report-render.ts`(332 行) 改名为 `render-layer.ts` → 守卫读到「2 文件 / 650 行」EXIT=0，并打印「距 300 行尚差 350 行」——**一个 rename 就绕过了「后续也不允许超过 300 行」**。改为 `REPORT_SOURCES` **按职责的显式清单** + **S0 归属断言**（清单声明但树中找不到即报红）。
  - **F3 计行口径名实不符（🔴）**：`report-copy.ts`（报告文案唯一定义者，render 层逐分支 `import * as C` 调用）被排除在闸门外，却已借改名逃出语义归属侧。已纳入 `REPORT_SOURCES`（对象 3 → 4 文件），并以 `RATCHET.upgradeLog` 留痕说明「口径修正而非扩容」。
- **守卫上限「棘轮」机制：把「只能下降不能上升」从注释升格为断言（Issue #341，PR #344）** — 评审发现两条守卫的阈值均可被随意放宽（实测把 `LIMITS.totalLines` 改成 999999、把 `E1_BASELINES` 改成 99999，守卫照样 EXIT=0）⇒「后续也不允许超过 300 行」「防腐不豁免守卫」均可被一句改常量废掉。现抽出**唯一契约** `scripts/lib/ratchet.js`（`checkRatchet`）：①不许上调 ②棘轮基线 = `upgradeLog` 最后一条 `.to`（让留痕成为**活的**，此前它是死数据）③留痕必填字段 ④达标即收紧。两条守卫**同源消费**该判据（不再各写一份）。
  - 新增专测 `tests/ratchet.test.js`（12 例，每条判据正向 + 变异自证 + 「判据不可缺」断言）。
  - 新增语义键 `ratchet-verdict`（3 落点，轴 I 语义键 5 → 6 / 落点 20 → 23）。
  - 新增断言「语义键必须出现在 docs/ 任何 .md 中」（防「有契约，但没人知道」）。
  - **自限（显式披露）**：不声称拦住「有权限且同时改棘轮与限值两处」的人 —— 静态守卫不能阻止维护者改守卫；它保证的是改动语义后果显式化。

### Changed

- **校对报告生成四层合并为单文件，实测 1102 → 299 行（≤300 达成，Issue #341）** — 用户指令「压到 300 行以内而且后续不允许突破」。此前报告生成分写 4 个文件（`proofread-report.ts` 编排 / `proofread-report-render.ts` 渲染 / `proofread-report-stats.ts` 统计 / `report-copy.ts` 文案），合计 **1102 行**。本轮把四层**合并为单文件 `proofread-report.ts`**，并压缩声明层（跨文件 import 与样板消除、每函数注释收敛为「决策理由 ≤1 行」、短语句同屏）。
  - **行为等价，非删能力**：全部导出与渲染分支保留；21 组语料覆盖「report_only 变体族 / 推断归因 / 半跳丢弃 / 空报告 / 交叉校验缺失」等路径，重构前后报告输出**逐字节一致**（diff=0）。权威锚点 `wps-office-mcp/src/tests/unit/proofread-fixaction-gate-e2e.test.ts`（6 例）与 MCP 全量单测（235 例）保持全绿。
  - **棘轮降档（只降不升）**：`scripts/validate-proofread-report-size.js` 的 `LIMITS.totalLines` 与 `RATCHET.totalLines` 由 1160 **收紧为 300**，`REPORT_SOURCES` 收敛为单文件；`TARGET_TOTAL_LINES=300` 与棘轮合一（S4「达标即收紧」自动成立）。
  - **清单同源更新**：`.prettierignore`（与 `REPORT_SOURCES` 同集断言）、`scripts/lib/semantic-anchor-manifest.js`（3 处落点改指合并后文件）、`scripts/validate-npc-team-bloat.js`（H1 登记路径）同步。
  - **守卫回归测试**：`tests/validate-proofread-report-size.test.js` 更新为单文件模型（含原名文件「不得遗留」断言），19/19 通过。

- **校对归一化层收敛：删除零消费导出 + 重建回归网 + 注释分流（Issue #341）** — `proofread-normalize.ts` 是「AI 输出 → 下游可计算形态」的规范层，**AI 不直接使用它**（调用方只有 4 个服务端模块），但长期处于「零测试 + 零守卫 + 语义无主」象限：校对单测随 `d2114ea` 整体删除后，变体族归一化规则只存在于注释里、无任何执行者。本轮**顺序执行**（先补回归 → 再删导出 → 最后分流注释），顺序反了就会重演「修一个冒一个」。
  - **① 补最小回归网（先做，防改坏无人拦）**：新增 `proofread-normalize-contract.test.ts`（纯函数契约，31 例）与 `proofread-fixaction-gate-e2e.test.ts`（报告 handler 端到端，6 例）。锁三类：`report_only` **10 种变体族**（含 R9-1 主案例 `report__only` / `report  _  only` / `report_-_only`）、`missing`/`unknown` 推断归因（R9-2）、半跳/越界丢弃 + 整块跳过采纳（R11-1）。**变异自证已实跑**：把分隔符收敛回退成 `[-\s]+` → **7 例转红**；关闭「区间并集覆盖本批」校验 → 半跳用例转红；去掉推断留痕 → **5 例转红**。
  - **② 删 6 个零消费导出（≈ 全仓 grep 零命中原文件 3%）**：`inferIssueType`（其注释自述「保留仅供测试」**而测试已全删**）、`normalizeSkippedSegment`（75 行，逻辑已被 `...Detailed` 整体吸收）、`SkippedSegmentNormalizeIssue`（**其 `droppedIncompleteBatchCount` 因 `normalizeOne` 硬编码 `false` 而永远为 0**——声明了一个永远填 0 的字段）、`SkippedSegmentNormalizeResult`（调用方一律用 `ReturnType<typeof ...>`）、`NormalizedOne`（中间类型）、`F14_MODIFIER_PATTERN`（仅同文件内部引用，降为非导出常量）。`normalizeSkippedSegments` **保留**——它正是「半跳丢弃」用例的消费点（删除统计见下）。
  - **③ `fix_action` 裁决单点化**：`isReportOnly` / `isFixActionInferred` / `classifyFixActionInference` **各自**把整条 issue 连同 3 个正则重跑一遍（同一条 issue 归一化 3 次）。现提 `resolveFixAction(issue): { fixAction, inferred }` **唯一实现**，四个读取侧 + 新增用户可读投影 `describeFixAction` 全部只做投影；报告统计改走 `describeFixAction(resolveFixAction(i)).kind`，消费方不再自读两字段拼组合态（那正是「同一语义两处写」的入口）。原「入库 = 共删」的死字段 `droppedIncompleteBatchCount` 由 `NormalizedOne` 一路带到公共接口，本轮一并收敛。
  - **④ 注释分流（不是精简）**：45.1% 的注释记的是**修订史**（`R9-1` / `TC-13` / `#277`）与施工过程，实测证据被当测试用写在函数体注释里。按类型分流：决策理由压到 3 行内留函数顶；实测证据 → **测试用例正文**（② 的回归网）；历史记录 → `docs/FEATURES.md` 整改表；施工过程删除。`normalizeIssueLocation` 原有的**两段孤立块注释**（坐标系收敛背景 + 本函数职责，夹在中间而函数体反而无 doc）合并为单一 doc 注释——那是补丁栈的物理痕迹。
  - **⑤ 语义登记（消除「语义无主」）**：5 组语义中 3 组此前既不在守卫范围、也无登记。现登记 3 条语义键进 `scripts/lib/semantic-anchor-manifest.js`：`fix-action-verdict` / `skipped-segment-ownership` / `theme-metric-map`（共 16 个落点），由轴 I 做「语义键 ↔ 落点集合」**双向集合相等**断言。**登记当场抓出真实漏点**：`proofread-accumulate-helpers.ts` 同样消费 `normalizeIssueFixAction`（第三处写入侧调用）——正是「同一语义换位置就复发」的形态，已补登记。E1 基线按实测更新（清单模块 96 → 205），并在注释中显式声明「该增长是本 Issue 的**目的**而非副作用」（语义无主正是触发治理的病灶），余量仍由 `÷0.95` 构造保证 ≥5%。
  - **净变化（实测，非估）**：`proofread-normalize.ts` **758 → 574 行（−24.3%）**；注释 **342 → 198（45.1% → 34.5%）**；导出 **22 → 21**（删 6 个、新增 4 个 `resolveFixAction` / `describeFixAction` / `FixActionVerdict` + 1 个测试消费的保留下注）；非注释代码行 368 → 333。**删掉的机制清单**：`inferIssueType` 兜底推断、`normalizeSkippedSegment` 单条入口、`SkippedSegmentNormalizeIssue` 接口、`SkippedSegmentNormalizeResult` 接口、`NormalizedOne` 中间类型、`droppedIncompleteBatch` 死字段、`F14_MODIFIER_PATTERN` 的导出面。
  - **保留（未删，如实披露）**：`TYPE_METRIC_MAP` / `METRIC_WEIGHT_FORMULA` 等领域常量按「宁保守勿过删」保留；`normalizeToTwoPointScale`（3 行、单消费点）**未内联**——它是 `computeScores` 在测试中独立复算的入口，内联会让回归网失去锚点。
  - **验证（真实执行）**：`npm run preflight` **EXIT=0**（16 项全绿）；MCP 单测 **225/225**（含新增 37 例）；轴 I 语义键 **2 → 5**、落点 **9 → 20**，守卫变异自证 **39/39**；`tsc --noEmit` 0 错；`eslint` 0 新增告警（8 warning 均为既有）；`format:check` 通过。

### Added

- **坐标契约段 3（L1 + L2）：字符偏移与段落索引的**类型级**分层（Issue #325）** — 按用户拍板「L1+L2」落地，**只涉及校对相关**：
  - **新增 `wps-office-mcp/src/tools/word/coordinate-layers.ts`（唯一契约来源）**：`CoordinateBrand<T>` 品牌载体 + `DocumentAbsoluteOffset`（L1 字符偏移）+ `ParagraphIndex`（L2 段落索引）+ 具名 `ParagraphRange` + 两个收窄入口 `asDocumentAbsoluteOffset` / `asParagraphIndex`。**单列模块**而非塞进 `proofread-types.ts`：后者受轴 A 行数棘轮（只降不升）约束，把「新增不变量」塞进去会逼出「删别处代码凑数」的动机（#314 病根：名实不符）。`proofread-types.ts` 仅 `export *`（既有导入路径不变）。
  - **为什么必须用品牌（而非只写注释）**：`type A = number` / `type B = number` 是**透明别名**，可互相赋值 —— 只写注释的「类型分离」在编译器眼里并不存在。品牌不同 ⇒ 混用报 `TS2322`，这正是段 3 要消除的「同一个 `number` 承载两个坐标系」（`resolveBatchRange` 的 `[number, number]` 与字符区间结构相同）。
  - **新增编译期断言** `src/tests/support/coordinate-layer-typecheck.ts`（**非 `.test.ts`**）：`tsconfig.json` 的 `exclude` 含 `*/.test.ts` 通配，故编译期断言必须放在受 `tsc --noEmit` 检查的 `.ts` 文件里，否则是**假绿**。断言含 6 条 `@ts-expect-error`（L1↔L2 互赋、裸 `number` 直赋、`ParagraphRange` 与元组互赋）。
  - **扩展轴 K（不新增守卫文件）**：`scripts/lib/coordinate-contract.js` 增 `checkLayerSeparation`，`scripts/validate-coordinate-contract.js` 增**轴 K4**：K4-1 品牌载体**唯一声明**、K4-2 两个出口类型**都必须**用 `CoordinateBrand`（退回裸 `number` 即转红）、K4-3 编译期断言**不得**落在 `.test.ts`（否则不被 tsc 检查）。`tests/validate-coordinate-contract.test.js` 增 3 例变异自证 + 1 例真实仓库核对（**17/17**）。
  - **变异自证（已实跑）**：把 `DocumentAbsoluteOffset`/`ParagraphIndex` 改回裸 `number` ⇒ `tsc --noEmit` 报 **3× TS2578 `Unused '@ts-expect-error' directive`**（证明分层真的消失，断言非恒真）。
  - **未落实（诚实披露）**：把 `proofread-normalize.ts` / `accumulate-helpers.ts` 的段索引消费点改读 `ParagraphIndex`/`ParagraphRange`（上一轮口径中的「换算簇归一」）**未做** —— 该两文件被 PR #338 重写（`proofread-store.ts` -546 / `proofread-report.ts` -133 等），在其合并顺序确定前改动必冲突。段 1/2 已闭环（缺 `start_offset` 硬报错、信号行回填 `baseOffset`）。
  - **验证（真实执行）**：上述 `validate:coordinate-contract` / `:proofread-budget` / `:proofread-convergence` / `:proofread-repro-lock` / `:proofread-issue-matrix` 当时全绿（**后四条已随 Issue #325「真动刀」+ 第二刀整体删除**，`validate:coordinate-contract` 亦于第二刀删除）；MCP 单测 **780/780**；`tsc --noEmit` 0 错。

### Changed

- **校对规则上下文守卫的声明层收敛（Issue #341，PR #342）** — 定位：`proofread-rules.ts` 的 80 条规则 + 6 个**上下文守卫**（`isCjkChar` / `isWesternBoundaryChar` / `isNounLikeFollower` / `isLeftContextCjk` / `isUsageObjectAfter` / `isEnvCauseUseAsVerb`）是「宁可少报不可误报」的**规则精度本体**，本轮**只清声明层冗余，零行为变更**。`proofread-rules.ts` **789 → 783 行（−6，14 增 20 删）**：
  - **6 个守卫去 `export`**（`isCjkChar` / `isWesternBoundaryChar` / `isNounLikeFollower` / `isUsageObjectAfter` / `isEnvCauseUseAsVerb` / `isLeftContextCjk`）—— 全仓唯一消费者是 `proofread.ts` 的 `import { rules }`，守卫无任何外部导入，`export` 属「实现外溢」（轴 I 归属判据亦不引用这些符号）。
  - **删同值别名 `NOUN_LIKE_ZUO = NOUN_LIKE_BIAN`**（仅 1 处引用）；`isNounLikeFollower(follower, nouns)` 的形参 `nouns` 为**死参数**（两个调用点分别传 `NOUN_LIKE_BIAN` 与其别名，实为同一张表）⇒ 收为单参，表改由**单一来源 `NOUN_LIKE_BIAN`** 直取。
  - **`isLeftContextCjk` 删重复重读** `const prev1 = text[index-1]`（与上方 `left` 同值，且 `left === undefined` 已提前返回）⇒ 直接复用 `left`；同时把该守卫的注释校正为**与实现一致**的口径（读「变」字紧邻的**单字**，非「前 3 字」），并同步校正 `docs/FEATURES.md` C1-4 / `CHANGELOG.md` C1-4 的历史描述（此前「匹配前 3 字」与源码不符）。
  - **行为等价性证据（真实执行）**：独立探针以 `runBasicProofreading` 的规则循环为骨架，注入「旧规则文件 vs 新规则文件」，**21,295 条语料**（含 6 个守卫全部触发点的针对性语料 + 20,000 条字符组合）输出**逐字节一致**（diff=0）；`tsc --noEmit` EXIT=0、MCP 单测 **188/188**、`npm run preflight` EXIT=0。
  - **诚实披露（不在本轮范围）**：① `ENV_CAUSE_USE_NOUN_OBJ`(13) 与 `USAGE_OBJECT_AFTER_YONG`(12) 两张高度重叠的白名单**未合并**（服务不同守卫，合并有语义风险，另案）；② 规则本体 789 行的**量级下降**不在守卫层，而在 `proofread-normalize.ts` + `accumulate-helpers.ts` 的**坐标系归一**（轴 A，最大收益，须独立 PR + 评审）。

- **守卫收尾（Issue #325 第二刀）：删除空断言 / 弱守卫，消除「覆盖声明无执行者」的假绿** — 承接上一轮体量统计的结论「不该再按原方向动刀，该收尾」。本轮**纯减法**，不留假绿：
  - **删 `scripts/validate-proofread-repro-lock.js`（169 行，空断言）** — 实测输出「刻意红用例 0 条」+ 依赖的 `docs/proofread-issue-regression-matrix.md` 已在上一轮删除 ⇒ 轴 R2/R3 **静默跳过**、恒绿。它守不住任何东西，只是「看着有守卫」。
  - **删 `scripts/validate-coordinate-contract.js`（155 行）+ `scripts/lib/coordinate-contract.js`（122 行）+ `tests/validate-coordinate-contract.test.js`（158 行，弱守卫）** — 该轴只断言「类型定义落点唯一 / 断言文本在位」，**不执行行为**（文件内自述）；真正执行行为的是 jest（`proofread-coordinate-contract.test.ts`），故行为判据的归属本就无须此脚本。相关注释引用同步清理。
  - **删 `scripts/lib/guard-scopes.js` 的「无执行者范围」** — 原表登记的 `validate-proofread-budget.js`（轴 A）/ `validate-proofread-convergence.js`（轴 F）**已随上一轮删除**，其范围数据被轴 I 当作覆盖源使用 ⇒ 「覆盖侧 / 方向 2 / AC4 过期」全是拿清单与**没有执行者的范围**对账（PR #336 评审 F2 同型复发）。现范围表**只登记存活的真实守卫**（`validate-gateway-membership.js` / `validate-semantic-anchor-scope.js`），每条带 `script` 字段。
  - **新增断言：覆盖声明必须有执行者** — 轴 I 的 F2 一致性断言扩为三条：①清单模块必须消费共享单源；②不得重新内联范围字面量；③ **每条 `GUARD_SCOPES.script` 必须真实存在、且必须 `require` 共享单源**。变异自证：把某条覆盖源的脚本指向不存在的文件 → **exit 1**（这正是旧实现的病灶形态，现已拦得住）。
  - **`validate-gateway-membership` 接入 `preflight`** — 上一轮它是**孤儿守卫**（有效但 CI 不跑；实测把 `wps_proofread_basic` 从 `GATEWAY_ONLY_TOOLS` 删掉，它转红而 `preflight` 不红）。同时它改为**消费范围单源**（不再内联 4 个落点路径字面量）+ 自检「实做路径 ⊆ 声明覆盖」（声明与实做同源）。
  - **棘轮收紧（只降）**：治理侧无改动；守卫自身 E1 基线按实测更新 —— 守卫脚本 227→232、清单模块 110→96、范围单源 75→68（均为实测值，非估）。
  - **未达成/未做（如实披露）**：轴 A（校对源码）口径**已随 budget 脚本删除而不再有守卫度量**，上一轮实测值 **5989 < phase1 的 6300**（已低于目标 311 行）——目标达成但账本已不在，本轮不重建账本（与用户「清零守卫」决策一致）。
  - **验证（真实执行）**：`npm run preflight` **EXIT=0**（新增 `validate:gateway-membership` 入链）；`validate:semantic-anchor-scope` **EXIT=0**，变异自证 **36/36**（含新增「覆盖声明无执行者」2 例）；`validate:gateway-membership` **EXIT=0**，变异自证 **7/7**；MCP 单测全绿；`tsc --noEmit` 0 错。

- **新增轴 I：同一语义的跨通道落点连通性判据（Issue #335，R10 第六类「范围无主」）** — 立项命题：校对线复发机制是「同一语义多处真值 ⇒ 换位置就复发」；前五类治「语义两处写」，R10 抓到**第六类**——「一个概念被哪几条守卫覆盖」这件事实身也没有唯一归属。
  - **复现实验（先复现后动手，命令可复算）**：同一改动只换落点 —— 轴外（`wps-com.ps1` / `range-signal.ts`）追加同义实现 → 守卫**全绿**；轴内（`proofread-types.ts`）追加同量 → **exit 1**。缺口**不是「数错」**（轴内实测与棘轮严丝合缝），是「同一概念的两侧之间**没有任何连通性断言**」。
  - **既有 H1 为何拦不住**：H1 只断言 `CROSS_CHANNEL_SCOPE_GAPS` 登记存在 + `why` 指向文件存在 = **自限判据**（探针改文件内容、不触碰登记表 ⇒ 恒绿）。
  - **落地判据（方向 1①② + 方向 2）**：① **覆盖侧**——每条落点须「被守卫覆盖」或「显式豁免 + 独立理由 + `waiverBy` 留痕」；② **归属侧**——**全仓文本源码树**内凡**代码形态**承载该语义（声明/导出/对象 key/成员访问/调用/PS1 `$var =`）却**未登记**的文件即报红；③ **方向 2**——清单 `covered` 声明必须与唯一范围表**现场计算**一致（堵「把文件移出范围就达标」）。
  - **单一来源（AC3）**：清单 + 计行范围只在 `scripts/lib/semantic-anchor-manifest.js`（`SEMANTIC_ANCHORS` / `GUARD_SCOPES`）；判据纯函数只在 `scripts/lib/semantic-anchor-scope.js`，**模块内无任何仓库路径字面量**（自证用例守护，沿用 #321 R9-A）。
  - **AC1 复现实验固化**：A/B/C/D 四条对照实验以**可执行断言**入库（`tests/semantic-anchor-scope.test.js`，`spawnSync` 跑守卫 CLI **本尊**）：未登记落点追加同义实现（TS / PS1）→ **exit 1**；已登记落点 → 归属侧不重复报；干净仓库 → exit 0。
  - **AC4 豁免留痕 / 过期**：豁免须带 `waiverBy`；落点**已被覆盖**却仍挂豁免 → 判「过期」要求删除（防「先写永久豁免、再悄悄移出范围」的作弊口袋）。
  - **AC5 门禁 + E1**：`npm run validate:semantic-anchor-scope` 已入 `preflight`；守卫/判据/清单三模块受 E1 复杂度上限约束（各留 ≥5% 余量）；**H1 下限仍成立**（3 条，未为过阈值删空）。
  - **AC6 收敛**：本线改动落在 `scripts/` 与 `tests/`，**不在** `validate:proofread-convergence` 作用域内 → 校对线净增仍 **0**（`✅ 校对线无变更`），口径如实。
  - **AC7 文档同步**：`docs/batch-state-machine.md` §9.4.2 要点 6.1（「待办」→「已落地」+ 位置/口径/自证）、本节、`AGENTS.md` R10 自述段。
  - **如实披露的自限（AC2 口径）**：轴 I 以**导出符号 / 具名常量**为归属主判据（特征串为辅）——**不声称**拦住「不用新符号、只改语义细节」的隐性同义实现；该情形在守卫输出中显式打印。
  - **验证（真实执行）**：`npm run validate:semantic-anchor-scope` **EXIT=0**；变异自证 **22/22**（含 A/B 探针拦红 + 对照轴不误伤）；`validate:proofread-budget` / `:convergence` / `:npc-team-bloat` 全绿。

- **轴 I 守卫评审修复 F1~F4：范围数据单源化 + 归属判据闭环（PR #336 评审，Issue #335）** — 评审实测四条（3 必修 + 1 建议）逐条复现 → 修复 → 变异自证，**同 PR 内闭环**：
  - **F2（critical）· 范围表是手抄副本** — 原 `GUARD_SCOPES` 声称「唯一范围表」，实则把 `validate-proofread-budget.js:proofreadSourceFiles()`（轴 A）与 `validate-proofread-convergence.js:SCOPE_PATHS`（轴 F）的真实范围**抄了一遍**；实测「把 budget 的轴 A 正则加上 `range-signal.ts`」→ 轴 I **EXIT=0**（waiver 未判过期、covered 未判不符）⇒「方向 2」「AC4」退化为拿清单跟**自家副本**对账。**修法**：范围数据上移 `scripts/lib/guard-scopes.js` **单源**，两个真实守卫改为 `require('./lib/guard-scopes.js')`；轴 I 新增**一致性断言**（真实守卫必须消费单源、不得再内联范围字面量）。**修后实测**：同一探针 → 轴 I **exit 1**（报「覆盖声明与实际范围表不符」+「豁免已过期」）。
  - **F1（warning）· 归属候选根不含 `scripts/`、`tests/`** — 输出写「全仓源码树」措辞不实；实测在 `scripts/probe-sibling.js` 写 `const truncated = true` → **EXIT=0**（漏报）。**修法**：候选根补 `scripts/`、`tests/`，`tests/` 不再在 `SKIP_DIR`；输出改为「N 个源码根 + 已登记落点；排除 测试/清单/判据/守卫 元模块与构建产物」。**修后实测**：同探针 → **exit 1**。
  - **F3（warning）· 落点级 `site.anchor` 是有声明无消费的死元数据** — 判据侧从未读 `site.anchor`（只读 entry 级 `anchorNames`）；且部分 anchor 写成**非代码形态**（`B = 200` / `$requestedLength`）。**修法**：新增 `checkSiteAnchors`（落点 anchor 必须真在该文件以**代码形态**出现，否则报「有声明无消费」）；把 `B = 200` 归一为 `B`；PS1 分支统一处理 `$` 前缀；同时把归属判据扩到项目实际出现的合法代码形态（可选 TS 成员 `NAME?:`、多行 `import { NAME, }` 成员、对象值引用 `key: NAME,`、`var NAME =`），并**同行**剔除字符串字面量与注释（防元模块自指噪声；逐行剔除以避开「未配对引号跨行吞代码」的假红）。
  - **F4（info）· E1 限值余量过窄（脆性）** — 原限值为手工字面量、余量现场算 ⇒ 余量恒 ~5.0%，**加一条登记（8 行）即误报**（实测「0/27 余量」）。**修法**：**基线 / 限值分离** —— 基线为上一轮实测的声明值，限值 = `ceil(基线 ÷ 0.95)` **自动派生** ⇒ 余量 ≥5% 是**构造保证**；实测超基线但未超派生上限只发 **warning**（正常小改不误报），超上限仍 FAIL。范围单源模块亦纳入 E1 对象。
  - **验证（真实执行）**：`npm run validate:semantic-anchor-scope` **EXIT=0**；轴 I 变异自证 **34/34**（新增 F1/F2/F3/F4 五组自证 + 代码形态识别 4 组）；`npm run preflight` **EXIT=0**（含 budget/convergence/npc-team-bloat 全绿、`format:check`、`lint`、根单测 **22/22**、e2e **14/14**）；MCP 单测 **765/765**。轴 A 实读当时 **6916**、距 phase1 差 **616 行**（该度量后随 budget 脚本删除而不再有守卫度量，见本文件「守卫收尾」条目）。

- **校对工具「全部走网关、禁止直连」收敛（Issue #325，用户决策）** — 原 5 个校对工具（`enableTrackChanges` / `getTrackChangesStatus` / `replaceInParagraph` / `proofreadBasic` / `confirmBatchAiProofread`）此前为「双路径」（既有直连名又有网关名，G1 **白名单不含它们** ⇒ 直连合法不报错）。按「校对工具一律禁止直连」把它们升为 **GATEWAY_ONLY**，与既有 2 个报告工具同构。落点**三处同名单 + 一处定义源**：
  - **执行期兜底** `.opencode/plugins/governance.js` 的 `DIRECT_TO_GATEWAY` +5 短名（`wps-office_wps_word_enable_track_changes` 等），G1 命中即拦并指路 `wps_office_execute`。
  - **注册期结构性拒绝** `wps-office-mcp/src/server/tool-registry.ts` 的 `GATEWAY_ONLY_TOOLS` +5 full name（`wps_word_enable_track_changes` 等）—— 即使误 `registerAll` 也被跳过。
  - **定义唯一来源** `gateway/com-actions.ts`（5 工具 schema 本就在此，未新增第二份定义）。
  - **新增轴 I（双向守卫，非注释约定）**：`scripts/validate-gateway-membership.js` 断言 A 校对工具 ∈ `GATEWAY_ONLY_TOOLS`、B ∈ `DIRECT_TO_GATEWAY`、C 不在 `mcp-server` 直连注册清单、D `GATEWAY_ONLY_TOOLS` ⊆ `DIRECT_TO_GATEWAY`、E 在 `com-actions.ts` 有定义、F G1 仍以 `DIRECT_TO_GATEWAY[outerTool]` 查表。**此前 `DIRECT_TO_GATEWAY` 零 CI 断言**（grep tests/ scripts/ 零命中）。已接入 `npm run preflight`；变异自证 `tests/validate-gateway-membership.test.js`（**7/7**：基线 + A~F 各自抓红）。
  - **行数约束**：治理插件净增 0（新增 5 条目 + 注释，压缩文件头同量注释抵消，`ratchet.G` 保持 **2308**）；校对源码（`proofread*.ts`）**零改动**，轴 A 保持 **6916**、轴 F 净增 **0**。SKILL / FEATURES / 设计文档口径同步为「禁止直连」。
  - **验证（真实执行）**：`npm run preflight` EXIT=0；轴 A 6916 / G 2308 / 轴 I 绿；`npm run build` 通过；MCP 单测 **765/765**。
- **坐标契约段 2 落地：`start_offset` 必填（硬报错）+ 契约类型单源（Issue #325，D1 硬报错 / D2 复用）** — 承接段 1 复现，按用户拍板的 D1/D2 定点修复，**只涉及校对相关**：
  - **D1 · `proofreadBasic` 缺 `start_offset` 硬报错**：此前缺省时走 `runBasicProofreading(content, 0)`，产出「本段相对偏移」却被消费方按「文档绝对偏移」解读 ⇒ **静默错位**（指向另一段完全无关文本且不报错，段 1 复现已固化）。现 `proofreadBasicHandler` 与 `file_path` 通道**一律拒绝执行**并给出正解（先用 `getDocumentTextByRange` 取本批文本、再把同一个 `start_offset` 原样传入）；网关 schema 与 MCP `inputSchema` 同步标为必填。**这是行为变更**，已同步更新 8 处既有单测的调用（显式传 `start_offset`）。
  - **D2 · 契约类型复用 `proofread-types.ts`**：新增 `DocumentTextSlice`（`{ baseOffset, text, offsetSpace }`）与 `OffsetSpace`，作为「位置字段坐标系」的**唯一类型化契约**；测试支持模块由「自行声明」改为 **re-export**，使「同一类型两处定义」在类型层面也不成立。
  - **信号行回填 `baseOffset`**：`getDocumentTextByRange` 的机器可读信号行（`range-signal.ts`，唯一实现）补 `baseOffset` = **真实返回的** `startOffset`（不采信 PS 端同名字段），消费方无需再从请求参数反推。
  - **新增轴 K 门禁**（`npm run validate:coordinate-contract`，进 `preflight`）：`scripts/lib/coordinate-contract.js`（纯判据）+ `scripts/validate-coordinate-contract.js`（CLI）+ `tests/validate-coordinate-contract.test.js`（**12 例变异自证 + 真实链路跑 CLI 本尊**）。轴 K1 契约**定义落点唯一**（只认 `interface/type` 定义，不认「名字被引用」）、轴 K2 判据模块**不得二次声明**（必须 re-export）、轴 K3 **真实链路行为断言在位**（只断言归属，**不执行**行为 —— 已在输出显式披露自限）。
  - **同 PR 内净删（轴 F1 净增 ≤0 / 轴 F2 删增比 ≥0.5）**：`proofread.ts` 抽出 `failResult`/`caughtResult` 两个**错误结果构造的唯一实现**，替换 7 处逐字重复的 `{ id, success:false, content, error }` 形状（此前同一语义多源），并把文件头注释中「复述 `proofread-rules.ts` 规则本体」「重复 `#55 T1` 契约」的部分收敛为**指针**；**本轮校对线净增 −7 行**（轴 A 6916 → **6909**，棘轮未放宽）。
  - **豁免留痕**：轴 F2 为 `proofread-types.ts` 登记一条「单一来源声明」豁免（该类型此前不存在、无被取代实现可删），并写明**同 PR 内删除证据**（`proofread.ts` −87 行）；标注「与使用它的 PR 同生共死」。
  - **验证（真实执行）**：`npm run preflight` **EXIT=0**；轴 A 6909 / 注释占比 20.2% / 轴 E 94 / 轴 D 27 键 / 轴 D-G 2308 / 轴 K 绿 / 轴 R 绿；`validate:proofread-convergence` 净增 **−7** / 删增比 1.087；MCP 单测 **778/778**；根单测（含新增 12 例）全绿。
  - **未达成声明**：轴 A **仍 6909 > phase1 的 6300**（差 609 行）；段 3（`proofread-normalize.ts` / `accumulate-helpers.ts` 坐标系归一）**未开工**。相位值未改，汇总行如实披露。

- **校对线四 PR 合并落库：SKILL 674 -> 94 行，主仓校对线净删 -580（Issue #325）** — 按「合 #326 / #329 / #328 / #330，关 #327」的方案真实执行合并（非读 diff 推测），本条目记录合入终值：
  - **#326** 新增 `docs/proofread-modules.md`（校对子系统模块清单）+ `docs/proofread-collaboration-flow.md`（协作关系索引），`docs/README.md` 同步索引。纯新增文档，零冲突。
  - **#329** `governance.js` 补 `DELETED_RULE_NOTES` 定义落点（原为悬空引用）+ 新增**轴 D-G'**（具名登记表引用完整性）与 5 例变异自证。
  - **#328** `skills/wps-proofread/SKILL.md` **674 -> 94 行**（达成「<=100 行」目标），去冗余、只留主干；并补回被删过头的三处能力：`_force_ai_fix`/`_ai_evidence` 合法强制通道、`total_revisions` 字段、F11-F15 逐句结论纪律指针。棘轮轴 E 同步 `674 -> 94`、EKb `45 -> 7`。
  - **#330** 承接 #327 不可替代的三处修复：`docs/FEATURES.md` 校对 P 规则表去漂移（删除源码中不存在的合并组，补齐缺失键）、`docs/batch-state-machine.md` 滞后字段（#314 已删的 `maxReportedParagraph`/`fullCoverageReached`/LRU）改正、`validate-proofread-convergence.js` 清理 #314 遗留的过期豁免。
  - **#327 不合并**：其 SKILL 去重（674 -> 637）被 #328（674 -> 94）**严格取代**（棘轮 E 只能取 94，取 637 会被单调性判红）；文档部分已迁至 #330。
  - **合并期手工解冲突 2 处（同义，非互斥值）**：`docs/FEATURES.md` 的「治理规则三层表述」表（两侧都改成「源码为编号/条数唯一事实源」）→ 取并集并去掉已漂移的条数快照；`validate-proofread-convergence.js` 的过期豁免注释 → 保留更完整的「豁免须与使用它的 PR 同生共死」表述。
  - **顺带修复 1 处由本合并暴露的真实门禁失败**：MCP `skills-consistency.test.ts` 把 SKILL 2e 新补的 `_ai_evidence` 判为「不存在的工具」（777 中 1 失败）→ 按既有惯例（同 `_processed_to_paragraph`）登记为**已知非工具名**，测试恢复 **777/777**。
  - **验证（真实执行，合序后终态）**：`npm run preflight` **EXIT=0**（14 项全绿）；轴 A 6916 / E 94 / EKb 7 / D 30 键 / G 2494 / 轴 D-G' 绿 / 轴 G 绿 / 轴 G' 绿；`validate:proofread-convergence` 净增 **-580** / 删增比 11.175；根单测 **26/26**（聚合 21/21）；MCP 单测 **777/777**。
  - **未达成声明**：本轮**未触及 phase1 目标** —— 轴 A 仍 **6916 > 6300**（差 616 行），治理插件仍 2494 > 2400（差 94 行）。相位值未改，汇总行如实披露。

### Changed

- **删除校对「并行编排线」+ 网关 schema 补全隐性契约（Issue #325，档 A+B）** — 按「A+B」授权落地，**只涉及校对相关**：
  - **档 A · 删并行编排线（治理层 P19/P20/P21）**：`P19`（批次归属越界）/`P20`（`_steps_log` 逐步凭证）/`P21`（并行区间重叠）是 **planner/executor 并行线专属规则**（该线已于 Issue #179 弃用、agent 定义文件早已删除）。**对照实验**（两条链路实测）：串行流程（不携带 `_batch_id`/`_batch_range`/`_steps_log`）跑关键调用 → **P19/P20/P21 零触发**；携带 `_batch_id` 时 → 可达（证明三条规则只在并行路径生效）。删除后治理插件 **2494 → 2293 行**，**首次打穿 phase1 的 2400**；`GUIDE_MAP` 33 → 30 条目 / 30 → 27 唯一 key；`enhanceBlock` 50 → 43。同时删除随之失效的「planner 初始化登记豁免」（`isPlannerInitAccumulate`）、`assignedRanges`/`registeredRanges` 会话状态、`governance-parallel.test.ts`（466 行）。
  - **诚实披露：服务端并行线未删** —— `generateAutoBatches`（服务端自动分批，Issue #179 取代 planner subagent）**仍被现行串行报告门禁消费**（`proofread-report.ts` 首次 `proofreadAccumulate` 时自动登记批次表、报告 `getIncompleteBatches` 据此判完整性），**不是死代码**。删它属契约级改动（动报告覆盖判定），按铁律须独立 PR，故**本轮不动**，已在 `AGENTS.md` 与 PR 留痕说明。
  - **档 B · 网关 schema 补全隐性契约**：治理层强制的参数此前**只在 SKILL 散文里**，网关 `paramsSchema` 不暴露（`wps_office_search` 查不到、传错不报错）→ 现补入 `com-actions.ts`：`proofreadAccumulate` 补 `_processed_to_paragraph` / `skipped_segments` / `suspected_issues`（并把 `issues` 由空壳 array 补出字段契约：`original`/`suggestion` 必填 + `paragraphIndex`/`offset`/`length`/`type`/`metric`/`fix_action` + UTF-16 自洽约束）；`replaceInParagraph` 补 `_force_ai_fix` / `_ai_evidence`（Layer 2 语义修复的合法强制通道）。**纯 schema 描述，零行为变更**（网关 args 本就透传）。
  - **新增轴 H（防回潮）**：`checkEnforcedParamsInSchema(enforced, schemaSrc)`（纯函数，`scripts/lib/proofread-antipattern.js`）断言治理层强制的下划线参数**必须作为 schema key 出现**；判据**只认 key**、**不认** description 里的名字（否则「散文提一句」会被当成已暴露 = 同型假绿，有变异自证用例）。清单由 caller 单源传入。
  - **棘轮同步**：轴 `D 30 → 27`、`G 2494 → 2293`（只降不升）；`DELETED_RULES` 增补 `P19/P20/P21`；`phase1.D 30 → 27`。文档（`AGENTS.md` / `FEATURES.md` / `batch-state-machine.md` / `proofread-modules.md` / `proofread-collaboration-flow.md` / `proofread-skip-table-dense-design.md`）同步「原 P19/P20/P21 已删除」口径。
  - **验证（真实执行）**：`npm run preflight` **EXIT=0**；治理插件 **2293** 行（≤棘轮 2293，≤ phase1 2400）；轴 H 绿（3/3 参数已暴露）；根单测 **21/21**（聚合 26/26）；MCP 单测 **765/765**（删除 12 个并行专属用例后）；`validate:proofread-budget` / `:convergence` / `:issue-matrix` / `:skill-docs` / `:wikilinks` 全绿。
  - **未达成声明**：轴 A（校对源码 `proofread*.ts`）**仍 6916 > phase1 的 6300，差 616 行** —— 本轮未触及，相位值未改，汇总行如实披露。

- **PR #332 × #333 合并落库：P13 单一实现 + 并行编排线删除（手工解冲突，Issue #325）** — 两个 PR 都以同一个基线 `150f00e` 出发、**同改一个 `getDocumentTextByRange` 判定块**，冲突只有 `.opencode/plugins/governance.js` 的 P13 一处（其余文件自动合并成功）。按「**六层校验链各自独立信息都要留**，被删的并行态整体不留」逐句解：
  - **保留 #332（独立信息 = 缺省 `length` 的真实绕过）**：P13 **单一实现**（不再两套 if）、`MAX_DOC_TEXT_BYTES` 具名常量、**显式/缺省 `length` 同判** —— 缺省 `length` 在 PS 侧等于「取到文档尾」，旧实现只读显式 `length`，故「只传 `start_offset`」一次都不触发（真实绕过，非风格问题）。
  - **不留 #333 已删者（并行态）**：`isParallel` 分支 + `MAX_BATCH_TEXT_BYTES`（10000）—— 二者**只以 `_batch_id` 为条件**，而该参数属已整体删除的并行编排线（P19/P20/P21 + planner/executor/reporter），串行流程从不携带。
  - **合并口径（诚实披露）**：并行态消失后 **P13 不再有「单批上限」档位**，越界判据只由**本批已登记区间**决定 —— ① 起点越过本批终点（无本批边界时按整篇上限兜底）；② 显式 `length` 超上限（本批区间 ×2，下限 50000）；③ **本批边界未登记 + 缺省 `length`**（无任何上限可比地取全文）。**已知收窄**：本批边界已登记且缺省 `length` 时治理层不再拦（「本批之后是否仍有正文」非治理层独立信息，沿用「只保留服务端不具备的独立信息」判定标准）；有批次进行时 `batchEndOffset` 恒非 null，故该形态只在「未分批即取范围文本」时可达。
  - **行为副本同步**：`tests/governance-rules.test.js` 的 `p13Decide` 与源码判据逐字同源，并新增**反向断言** —— P13 判据内不得再出现 `isParallel` / `MAX_BATCH_TEXT_BYTES`（防并行态回潮）；P13 块边界改用「切到下一规则块」而非固定窗口（固定窗口会把 P14 之后的内容误当 P13 判据）。
  - **文案断言校正**：`tests/governance-gate-guide.test.js` 的「原拦截文案保留」改为按重写后的 P13 文案核对（摘要仍含「禁止一次性拉取多批文本。请只获取本批范围内的文本」）。
  - **棘轮对齐（非放宽）**：`ratchet.G` **2293 → 2308**（合并后经 Prettier 的实测值，仍 < `phase1` 2400）。这是「实测值 + 0 headroom」按合并终值重新对齐；**放宽会被棘轮单调性守卫拦红**。
  - **验证（真实执行）**：`npm run preflight` **EXIT=0**（14 项全绿）；轴 A 6916 / E 94 / EKb 7 / D 30 条 27 键 / G 2308 / 轴 D-G' / 轴 G / 轴 G' / 轴 H 全绿；`validate:proofread-convergence` 净增 0；根单测 **21/21**（聚合 26/26，含 `governance-rules` 45/45、`governance-gate-guide` 26/26）；MCP 单测 **765/765**；e2e **14/14**；`lint` / `format:check` 通过。
  - **未达成声明**：轴 A（校对源码 `proofread*.ts`）**仍 6916 > phase1 6300，差 616 行** —— 本轮未触及，相位值未改。

### Fixed

- **治理层失效引用：`DELETED_RULE_NOTES` 悬空指针 + 新增轴 D-G' 守卫（Issue #325）** — 核对「2493 行治理层」体量时发现**真实缺陷**（非体量问题）：
  - **缺陷**：`governance.js` 有 **2 处**注释写「见文件头 `DELETED_RULE_NOTES`（单一来源）」，但源码**从未定义**该名字——文件头只有一段**无名** JSDoc 登记表。读者（含 AI）按指引去找**找不到落点**。属「失效引用」，而现有守卫只覆盖 `#<数字>` Issue 编号，**具名常量引用无守卫**（盲区）。
  - **修复**：给文件头登记表补上名字 `DELETED_RULE_NOTES`（`── DELETED_RULE_NOTES：已删除规则登记表 ──`），两处引用改为指向**真实存在**的登记表。**零行为变更**（纯注释），治理插件行数与 GUIDE_MAP 均未动（轴 D / D-G 棘轮不受影响）。
  - **新增轴 D-G'（防复发）**：`checkNamedRegistryRefs(src, names)`（纯函数，`scripts/lib/proofread-antipattern.js`）断言具名登记表**必须有定义落点**；名字清单由 caller 单源传入（模块内不持仓库路径/名字）。判据**只认定义落点**（`const NAME =` 或「── NAME：」标题），**不认**「名字被引用」——首版用 `text.includes(name)` 时，删掉定义、只留引用仍 exit 0（**实测假绿**），现该输入必须转红。
  - **变异自证**：`tests/proofread-antipattern.test.js` 新增 5 例（含「只有引用无定义 → 报红」「首版 includes 判据假绿 → 现判据转红」「清单不得在判据模块内硬编码」）；删定义落点实测 `❌ 轴 D-G' 超限`。
  - 门禁：`validate:proofread-budget`（新增轴 D-G' 绿）· `validate:proofread-convergence` · `:skill-docs` · `:wikilinks` · `:npc-team-bloat` · `:proofread-issue-matrix` · `format:check` · `lint` · 根单测 **21/21**。

## [1.9.34] - 2026-09-15

- **R10 闸门漂移：跨通道范围无主 + 本 PR 自身账目口径更正（PR #321 评审 R10）** — 按「同一条验收口径在所有环节同样成立」逐条复跑本 PR 的 R1–R9 门禁，抓到**两条**：
  - **R10-A（🔴 闸门漂移 · 范围无主）**：轴 A 只量 `proofread*.ts` + `content.ts` + `document.ts`，而同一语义（文本真值 / 截断信号）的**另一半实现**在 `wps-office-mcp/scripts/wps-com.ps1`（`f1a67a0` 改 **+19/−4 = 23 行**）、消费入口在 `range-signal.ts`（73 行）、治理侧在 `governance.js` —— 三者**既不计行也无跨通道断言**。**对照实验**（同一改动只换落点）：轴外追加 23 行同义实现 → 守卫 **exit 0**；轴内追加同样 23 行 → **exit 1**。⇒ 缺口是「同一概念两侧**没有连通性断言**」，与 R1-A（作用域单一来源）/ R3-A（纳入范围无主）**同族**，长在守卫自己的范围上。**处置**：按铁律 17⑨ 拆独立原子 Issue；本 PR 只做**机器可读登记**（`scripts/validate-npc-team-bloat.js` 的 `CROSS_CHANNEL_SCOPE_GAPS`）+ **H1 断言**（登记非空、每条须 `miss`/`why`、`why` 指向的文件必须存在）——**自限判据，不声称已拦范围漂移**。
  - **R10-B（🔴 本 PR 自身账目名实不符）**：8/12 阶段在 CHANGELOG 写「616 行缺口**仅在** `content.ts`/`document.ts` 这两个**与校对无关**的文件里」。**核实结果：该性质断言不成立**——① 轴 A 口径含这两文件，616 是**口径整体**对目标线的差，非「只在非校对文件里」；② `document.ts` 直接 `import { renderRangeText } from './range-signal'`（同一语义消费入口），与校对线耦合。实核：校对真身 `proofread*.ts` **4865**、两文件 **2051**，合计 **6916**；删真身**不能**达标（口径含两文件），而「把两文件移出计行范围」会**立即达标**（4865 ≤ 6300）——正是 R10-A 那个缺口本体。**已按核实更正为可复核口径**（数字 + 命令可复算）。
  - **本步改动（净删，守「敢删」）**：① `AGENTS.md` 三处同族条目**合并**（−9 行）；② 新增 H1 一类断言的同时，把 H1 判据**内联 + 复用既有分桶/度量**、并把 7 处「第几轮谁提的」过程叙述注释**结论化**（守卫有效代码行 286 → 315，E1 上限按「基线 ×1.05 且余量 ≥5%」纪律如实上调至 340）；③ 修正 1 处自身口径。**本 PR 不含校对业务源码改动**（属 #314 线；轴 A 相对 `origin/main` 净增 **0**）。
  - **验证（真实执行）**：`npm run preflight` **EXIT=0**；`node tests/validate-npc-team-bloat.test.js` **47/47**（新增 H1 5 组，含**真实端到端**变异自证：把登记项 `why` 指向不存在文件 → 守卫 CLI 由绿转红）；`npm run validate:npc-team` / `:npc-team-bloat` ✅；`validate:proofread-budget` ✅（轴 A/E/D/A''/D'''/轴 G/轴 G' 全绿）；MCP 单测 **777/777**；根单元 **26/26**；e2e **14/14**。

Ref: #314

## [1.9.33] - 2026-09-15

### Fixed

- **R1 评审修复：轴 G 作用域与叙事不同义 + 轴 G' 常量名可「两侧一起改名」绕过（PR #321 评审 R1）** — 承接 12/12 复盘新增的两条「假绿补盲」守卫（轴 G 叙事宣称 / 轴 G' 批次大小单源）。R1 评审（只评本轮 diff）以**对照实验**抓出 2 条 🔴 必修 + 2 条 🟡 建议，两条 🔴 **正是本 PR 立论的那个病，长在本 PR 自己新增的判据上**：
  - **🔴 R1-A（轴 G 作用域与叙事不同义）**：判据模块注释 / JSDoc / `AGENTS.md` **三处都宣称覆盖「CHANGELOG / docs 正文」**，而预算脚本的作用域是 **单文件字面量** `PHASE1_CLAIM_DOCS = ['CHANGELOG.md']`。实测：仅在 `docs/batch-state-machine.md` 注入正向宣称 `phase1 一期线已达成` → **守卫本尊 exit 0**（假绿）。
    **修法**：作用域升格为纯函数模块导出的 **`NARRATIVE_SCOPE` 单一来源**，新增 `checkNarrativeScope` 做**逐项比对**（纳入范围里每个含 phase1 语义的文档都必须在清单内，一个不漏；清单不得写通配，通配使作用域不可枚举）。
  - **🔴 R1-B（轴 G' 常量名可被「两侧一起改名」绕过）**：原判据只查「常量名存在 + 值相等」——把 `PROOFREAD_BATCH_MAX` 与 `MAX_PARAGRAPHS_PER_BATCH` **同时改名为同一个新名字**（各自仍有消费点）→ 判据 **0 违规**，即「单源锚点」被完全解除。
    **修法**：改**双向归属**判据 —— ① 声明源内必须**恰好一次**定义（多次定义 ⇒ 值以哪处为准变歧义）；② 两侧**不得共用同一名字**；③ 每个名字必须有至少 1 处**真实消费点**（`import` / `export` 名字清单行不算消费 —— 否则「只留 import、删掉全部使用点」会让朴素计数 ≥2 而实际已无消费）。
  - **🟡 R1-C（作用域叙事与被约束对象不同义）**：叙事只提「跨运行时 TS/JS 两处」，判据实际约束**三处**（含 SKILL 内 `B = <n>`）。**修法**：来源集合显式化（声明源 + 消费源 + SKILL 引用），守卫汇总行打印**实际作用域构成**，叙事三处同步为「声明 2 处 + 消费源 + SKILL 引用」。
  - **🟡 R1-D（变异自证走真实链路）**：`tests/proofread-antipattern.test.js` 直接调纯函数断言返回数组，与铁律 24 第 7 维③「变异自证须走真实链路」不完全一致。**修法**：本次 4 组关键修复全部补**真实链路自证**（改写工作区文件 → 跑 `npm run validate:proofread-budget` **门禁本尊** → 断言 exit≠0 → 还原），见下方「变异自证」。
  - **测试**：`tests/proofread-antipattern.test.js` **10 → 48 用例**（新增 R1-A 豁免三类逐条自证 + 作用域覆盖性 + 真实链路读取数；R1-B 归属三类：一起改名 / 共用同名 / 无消费点 / 只留 import / 多处定义；R3-A 双向集合相等；R4 新增棘轮维度判据；R5 文件缺失/R5-B 通配两条真实链路自证）。
  - **净改动含敢删**：判据内**删除**两处「路径不同即算消费」的旧口径与单文件作用域字面量，改为单一来源 + 消费点口径。
  - **变异自证（真实链路，先红后绿，全部实测）**：

```
docs/batch-state-machine.md 注入「phase1 一期线已达成」  → 轴 G   exit 1 ✅（原版 exit 0 = 假绿）
NARRATIVE_SCOPE 删掉 docs/ 条目                        → 轴 G scope exit 1 ✅
TS/JS 常量一起改名为 BATCH_LIMIT_X（各自有消费点）      → 轴 G'  exit 1 ✅（原版 0 违规 = 假绿）
TS 常量名改名为 OTHER_NAME（无消费点）                  → 轴 G'  exit 1 ✅
TS 常量去掉唯一使用点（只留 import 名字清单行）         → 轴 G'  exit 1 ✅
JS 常量 200 → 250                                     → 轴 G'  exit 1 ✅
SKILL 第二处 B 200 → 300                              → 轴 G'  exit 1 ✅
CHANGELOG 注入正向宣称（反向对照，须同样拦）            → 轴 G   exit 1 ✅
还原后                                                  → EXIT=0 ✅
```

- **R2~R9 评审-修复：同源 / 同删 / 同披露 / 唯一出口 / 环境状态不误判 / 词法边界 / 文档同步（PR #321 评审 R2–R9）** — 同一 PR 的评审-修复循环内，对本 PR 自身新增判据连续收口（每条评审/修复/复评均在 PR #321 分别留痕）：
  - **R2（修复棒）**：轴 G 作用域升格为 `NARRATIVE_SCOPE` 单一来源；轴 G' 改**双向归属**四条（声明恰好一次 / 两边不同名 / 必须有真实消费点 / 值相等 + SKILL 全部 `B = <n>` 同值）。
  - **R3-A（复评发现，R4 闭环）**：轴 G「纳入范围」此前在守卫脚本内**另持一份硬编码**（与 `NARRATIVE_SCOPE` 恰好同值 ⇒ 无法区分「同源」与「巧合相等」），单向判据可被「缩窄纳入范围」整体弱化而不报红（实测 P11/P12 `exit 0` 假绿）。**修法**：移入纯函数模块的 `NARRATIVE_IN_SCOPE`（同源），`checkNarrativeScope` 改**双向集合相等**（漏扫 / 越界两个方向都报红）。
  - **R4（同源 / 同删 / 同披露 / 唯一出口）**：① 删 `MAX_SESSIONS`/`lastAccessTime` LRU 后**同删其墓碑断言**（`governance-batch-fix.test.ts` 改写为新不变量：无容量上限 / 无 LRU），MCP 单测回 **777/777**；② 新增轴 D-G 治理插件行数棘轮（2494）；③ 汇总行**同口径披露 G 缺口**；④ 新增 **轴 D-G''：判据模块导出出口唯一**（`module.exports` 恰好 1 处，**前置于一切消费**防「被静默覆盖」——实测该文件曾出现两块 `module.exports`，往被遮蔽块补导出无效、且消费方取不到函数致守卫中途崩溃）。
  - **R5（环境状态不误判）**：① **文件缺失不得报成「作用域越界」** —— 集合相等改拿**声明集合**比对（此前拿「过滤掉不存在文件后」的集合，把部分检出 / 浅克隆 / 重构中临时移走误判成契约违规），缺失文件单独以「本地不存在（环境性，非契约违规）」披露；② 通配条目不再被重复报成「越界」（同一根因只留通配诊断一条）。
  - **R6（文档层名实不符）**：CHANGELOG 只记 R1、漏记 R2~R5；用例数声称「10 → 26」与实测漂移；`Ref: #314` 与版本标题间缺空行。**修法**：补记账目、用例数对齐实测、补空行。
  - **R7（文档 ↔ 实现同义）**：`AGENTS.md` 的 R4 段未同步 R5 的三处语义（越界基准改声明集合 / 文件缺失走环境性披露 / 通配跳过），`docs` 回归矩阵未列新变异行。**修法**：同步 R5 语义 + 回归矩阵补 5 行。
  - **R8（形态判据误伤面）**：SKILL「`B = <n>`」判据 `/B\s*=\s*(\d+)/` 缺左边界，会命中 `RB = 999` 一类以 B 结尾的标识符（误报漂移）。**修法**：加左边界 `(?<![A-Za-z0-9_])B`，并补双向用例（误伤放行 + 真漂移仍拦）。
  - **R9（同一语义多源在本 PR 自身代码内残留）**：判据模块 `normalizeSources` 硬编码声明源路径，与 caller 的 `BATCH_MAX_TS`/`BATCH_MAX_JS` 同值 = 第二处来源。**修法**：改为 caller 以 `paths:{ts,js}` 单源传入，模块内不再出现仓库路径字面量。
  - **QA-1 / QA-2 / QA-3（7/12 测试回炉，铁律 9 跳转修复）**：7/12 QA 主动攻防（非复述 R10 留痕）抓出 **2 条 🔴 P0 + 1 条 🟡**，均为**本 PR 自身新增判据**的覆盖不全（对照实验证明 `origin/main` 无轴 G 判据 ⇒ 本 PR 引入）：
    - **🔴 QA-1（轴 G 谓词是词表白名单）**：`claimRe = /已达成|达成 ✅|已达标/` 为**枚举词表**，同义表述即为假绿入口。真实门禁本尊实测，注入以下反例后**全部 exit 0**（假绿）：例如「一期线已经达成」/ 例如「一期线达标」/ 例如「phase1 achieved」。
    - **🔴 QA-2（轴 G 豁免是行级 + 谓词要求同行相邻）**：豁免对**整行**判定，行内任意位置的 `禁止` 即整行放行；且跨行即漏拦。注入以下反例后同样 **exit 0**：例如「一期线已达成。禁止他人照抄本文」/ 拆行形态（复现用「phase1⏎已达成」）。
    - **🟡 QA-3（文档名实不符，R6-A 第三次复发）**：CHANGELOG 声称新套件「10 → 37 用例」，实测 39。
    - **修法（判据重设计，非再打补丁）**：把「什么叫达成宣称」的定义权从词表收回判据本身 —— **宣称**改「目标标记（phase1/一期线）与达成语素（达成/达标/完成/实现/满足/就绪/上线/achieved/accomplished/reached，含已/已经/无已诸形态）在 16 字符邻近窗口内共现」（**跨行命中**）；**豁免**改「宣称片段级」双分支 —— 分支 A 紧邻否定（≤8 字符且不含分句符，保证否定**支配**该宣称）、分支 B 句首禁止句（前导仅空白/引用/加粗，≤40 字符），另加引述/反例标记；**语境窗口只在本行内**（不跨行回溯，保 R1-A 既有不变量「豁免只豁免本行」）。同一宣称含多个目标标记去重只报 1 次。
    - **净改动含敢删**：**删除**词表判据 `claimRe`、行级豁免、`phase1Re` 逐行扫描三处旧机制（净增 55 行 / 净删 22 行，判据本体从「枚举」收敛为「结构」）。
    - **变异自证（真实链路，先红后绿，全部实测）**：

```
注入反例到 docs/batch-state-machine.md（每条注入后跑门禁本尊，记 exit）
  #1 对照形态（R8 前已拦）                          → 1 ✅
  #2 QA-1 同义表述 A                                → 1 ✅（修复前 0 = 假绿）
  #3 QA-1 同义表述 B                                → 1 ✅（修复前 0 = 假绿）
  #4 QA-1 英文形态                                  → 1 ✅（修复前 0 = 假绿）
  #5 QA-2 同句远置豁免词                             → 1 ✅（修复前 0 = 假绿）
  #6 QA-2 拆行形态                                  → 1 ✅（修复前 0 = 假绿）
反向对照（合法披露不得误伤，须 exit 0）
  #7 如实披露「未达成 + 尚差 N 行」                  → exit 0 ✅
  #8 真实文档 306 行的句首禁止句                     → exit 0 ✅
还原后                                            → EXIT=0 ✅
（各反例的具体字符串见本 PR 的 7/12 QA 留痕与 `tests/proofread-antipattern.test.js`；
 判定口径见 `checkNarrativePhase1Claim` 的「邻近窗口 + 宣称片段级双分支豁免」）
```
  - **净改动含敢删**：删除本地第二份硬编码纳入范围清单、死 `module.exports` 块、4 行墓碑断言、**2 处硬编码声明源路径**。
  - **变异自证（真实链路，先红后绿，全部实测）**：

```
P11 缩窄纳入范围（NARRATIVE_IN_SCOPE → ['CHANGELOG.md']）        → 轴 G scope exit 1 ✅（R4 前 exit 0 = 假绿）
P12 扫描清单并入范围外文件 README.md                            → 轴 G scope exit 1 ✅（R4 前 exit 0 = 假绿）
P13 纳入范围漏扫（NARRATIVE_SCOPE 删 docs/ 条目）                → 轴 G scope exit 1 ✅（原方向保留）
文档缺失（rm docs/batch-state-machine.md）                      → exit 0 + ⚠️ 本地不存在 ✅（R5 前误报「越界」）
通配场景 checkNarrativeScope(['docs/**/*.md'], [])              → 1 条（仅通配）✅（R5 前 2 条）
注入第二个 module.exports（轴 D-G''）                           → 立即 exit 1 ✅（R4 前静默覆盖/中途崩溃）
ratchet.G = 99999（凭空放大数）                                  → 棘轮单调性 exit 1 ✅
SKILL 注入 `var RB = 999;`（以 B 结尾的无关标识符）              → 0 违规 ✅（R8-A 前误报漂移）
判据模块内硬编码声明源路径（回归）                               → 自证用例 exit 1 ✅（R9-A）
还原后                                                          → EXIT=0 ✅
```

- **8/12 文档阶段（PR #321）：修 1 处文档↔实测漂移（AGENTS.md `GUIDE_MAP` 基线口径）** — 8/12 复核时逐条比对「文档写的」与「脚本实测的」，抓出一处漂移：`AGENTS.md` 的 `GUIDE_MAP` 基线行声称 **`33 entries / 30 unique`（归并）**，而脚本实测 `GUIDE_MAP` 键集**无重复**（**33 / 33**）。该行**正是 R6-A（文档名实不符）的同族形态**，且**无守卫可拦**（轴 D' 只断言条目数 33；`unique` 数无任何断言）。
  - **修法（改文档为实测，不放松守卫）**：基线行如实写 **`33 / 33 unique keys（当前无归并）`**，并把「归并说明」的**复现条件**写进该行（若将来引入归并键，须与基线行**同时**改）。**未**放宽任何判据。
  - **如实披露（未做项）**：① 本步**未新增守卫**去断言 `unique` 数（会净增代码，与本 Issue「净行 ≤0 / 只收敛」口径冲突，登记为后续原子项）；② `AGENTS.md` 内仍保留 `P1b`/`P27b` 为独立 key 的说明（**属真实事实**，非漂移）；③ 本步**未推进 phase1 的 A 轴**（仍 6916，距 ≤6300 差 **616 行**；守卫汇总行照旧显式标注未达成）。**口径更正（R10 核验）**：此前本条曾写「缺口仅在 `content.ts`/`document.ts` 这两个**与校对无关**的文件里」——**该性质断言不成立**，已按核实结果更正：轴 A 计行口径 = `proofread*.ts` + `content.ts` + `document.ts`（`proofreadSourceFiles()`），而这 616 行是**口径整体**（含真身）对目标线的差，**不是**「只在非校对文件里」；`document.ts` 亦直接 `import { renderRangeText } from './range-signal'`（同一语义的消费入口），可见与校对线耦合。实核：校对真身（`proofread*.ts`）**4865 行**、两文件共 **2051 行**，合计 **6916**。删真身**不能**达标（口径含这两文件），而「把两文件移出计行范围」会**立即达标**（4865 ≤ 6300）——这正是本步 R10 登记的**闸门缺口**本体（`docs/batch-state-machine.md` §9.4.2 要点 6.1、守卫 H1 登记表）。
  - **顺带核实（本步实测，非复述）**：`docs/proofread-issue-regression-matrix.md` 与 `docs/README.md` 相对 `origin/main` **零变更**（前者与 #316 一起合并、后者在 #316 的 8/12 已收录），故**本轮无文档漂移②③**；PR #321 与 `main`（`0c4fd99`）**无冲突**（`mergeable_state: mergeable`）。
  - **验证**：`npm run preflight` **EXIT=0**；轴 D'（文档↔实测双向）复跑通过；MCP 单测+集成 **777/777**；根单元 **21 套**；e2e **14/14**。

Ref: #314

## [1.9.32] - 2026-09-14

### Changed

- **NPC Team 防腐改造（续）：把 #314 最新一轮测试教训刻进提示词第 7 维 + 守卫（Issue #312，承接 PR #317）** — 用户补充「issue314 又有新的经验可以吸取」，本轮把 `#314#comment-2099345506088845312` 的三条教训抽象为**可复用判据**并落地（而非抄素材）：
  - **铁律 24 新增第 7 维「断言归属」（净零改写，铁律编号仍 24）**：①**测行为不测形态**——断言须验证真实链路行为，不得只查「源码里有无某字符串」（反例 #314 QA-F2 + 本轮自查 K4）；②**不变量必须归属门禁**——防腐不变量须由能独立执行的门禁（守卫/CI）拥有，不得只由测试文件承载（反例 #314 i1 + 本轮自查：文档级去重此前只在测试）；③**变异自证须走真实链路**——须跑真实门禁/真实输出形态由绿转红（反例 #314 QA-F1）。
  - **守卫新增 G1「文档级腐肉」断言（8 类断言）**：`docs/NPC_TEAM.md` **全文**的重复长行由守卫**本尊**拦截——修复「文档级去重只在测试、守卫 CLI 静默放行」的**契约无主**（实测：注入文档级重复长行后守卫由绿转红，此前为绿）。
  - **K4 由「字符串存在性」升级为「行为断言」**：泛化判据（不得出现自写提取正则）+ 拷贝实现自证（保留 require 行 + 自写等价正则必须被抓住），修复 #314 QA-F2 式「测形态不测行为」。
  - **敢删/名实一致**：合并守卫内 30+ 行「第几轮修了什么」历史注释为单一口径 rationale；E1 上限按真实基线重设并留 ≥8% 余量；`LIMITS.docDuplicateLines` 与 `DOC_LONG_LINE_MIN` 单一契约。
  - **回归测试**：`tests/validate-npc-team-bloat.test.js` **36/36**（含 G1 真实端到端变异自证）、`tests/validate-npc-team-prompt.test.js` **227/227**（新增 S10/S11 第 7 维负向）；`npm run preflight` **EXIT=0**。
  - **范围**：本 PR **不含校对源码改动**（属 #314 校对线）。

Ref: #312

### Fixed

- **发布前置：解除 PR 合并阻塞并复跑全量门禁（Issue #312）** — v1.9.31 落版（`5cd415c`）使 `main` 前移，PR #319 的 `CHANGELOG.md` 与 `[Unreleased]` 归档标题冲突（`mergeable_state: conflict`）。在 PR #319 **自身 head 分支**上 `git merge origin/main`，两侧条目**并集保留**（本 PR `[Unreleased]` NPC Team 条目 + main `[1.9.31]` 归档），合并提交 `25e88f3`；冲突解除后 `mergeable_state: mergeable`，9/12 合并（合并提交 `9f82b2b`）。**未新建分支、未新建 PR**（铁律 19/20）。合并后 `npm run preflight` **EXIT=0** 全量复跑。

Ref: #312

## [1.9.31] - 2026-09-14

### Fixed

- **8/12 文档阶段：修 3 处文档漂移 + 补 3 类守卫盲区 + 消除栈钉死与基准黑箱（Issue #314）** — 承接 7/12 重测 🟢 与合并冲突解除（head `fcb7757`）。本步**只修一致性、不加功能**，且**每一类发现都从「靠人记得」变成 CI 断言**：
  - **文档漂移①（守卫盲区）**：`AGENTS.md` 两处「已删除规则清单」都写 `P22/P23/P28`、**漏 `P25b`** —— 而脚本 `DELETED_RULES` 是 4 条含 `P25b`。轴 D'' 只扫 SKILL + `docs/`（**不扫 `AGENTS.md`**）、轴 D' 只覆盖基数，故该漂移**此前无任何守卫可拦**。新增**轴 D'''**：`AGENTS.md` 清单必须完整覆盖 `DELETED_RULES`（判据做**单向引用完整性**，避免误伤 `P1b`/`P27b`/`P16b` 这类独立现行 key 清单）。**变异自证**：把 `P25b` 从文档删掉 → FAIL。
  - **文档漂移②**：`docs/README.md`（四象限索引）**未收录**本 Issue 新增的 3 个守卫与回归矩阵 —— 读者在文档中心里找不到防腐机制的入口。已补 `proofread-issue-regression-matrix.md` 条目（矩阵三态口径 + 守卫判据）。
  - **文档漂移③（守卫盲区）**：轴 A'/F3 只卡**注释占比**、不卡质量，故「清理历史注释删出孤立 `*。` 残缺 JSDoc 行」（评审 R1-3 形态）**无守卫可拦**。新增**轴 A''**：校对源码不得出现语义为空的 JSDoc 行（去掉 `*` 与空白后只剩标点）。**变异自证**：注入 ` *。` → FAIL。
  - **栈钉死（盲区 4）**：「棘轮值是在哪个 base 下量出来的」此前**只写在评审评论里**，换个基准（`A: 6916` 在 `origin/main` 与 `0ad2ec0` 下测量结果不同）就成了黑箱。现把基准钉进脚本：`validate-proofread-budget.js` 声明 `RATCHET_BASE`（单一来源），`validate-proofread-convergence.js` 新增**轴 F5b** 断言两处一致，不一致即 FAIL（改基准必须同时改两处 → 必然 diff 留痕）。**变异自证**：把基准改成 `HEAD~1` → FAIL。
  - **基线口径纠正**：轴 A 的 `BASELINE.A = 7326` 是**无法复核的字面量**，且与脚本自身量法不同源（`7326` 为 `wc -l` 口径；脚本按 `split('\n')` 计，差 8 = 文件缺尾换行标记）。现改为**按 `RATCHET_BASE` 现场测量**（同一函数、同一口径），实测基线 **7334**、当前 **6916**。
  - **棘轮去余量**：`ratchet.EKb` 由 `45`（含 headroom）对齐到**实测值**；棘轮留余量等于给「先加 20 行、下次再说」开口，正是本 Issue 要治的「每次只往既有实现追加」。
  - **实测**：`npm run preflight` **EXIT=0**；MCP 单测+集成 **777/777**；根单元 **26/26**；e2e **14/14**；3 组新守卫变异自证全部由绿转红。
  - **诚实披露**：本步**未推进 phase1 的 A 轴**（仍 6916，距 ≤6300 差 **616 行**），守卫汇总行照旧显式标注「未达成，不得写成已达成」；本步产出为**一致性修复 + 守卫补盲**，非收敛进度。

Ref: #314

### Fixed

- **修「假绿」：防腐预算守卫把「未达成」写成「已达成」，且补 SKILL 瘦身与单源化第二轮收敛（Issue #314）** — 用户指令「按『修假绿 + 继续削』来」。上一轮（PR #316）新增的 `scripts/validate-proofread-budget.js` 存在**第三处假绿**（前两处已自曝并修复）：
  - **假绿本体**：`phase1` 注释写「一期线达成：7195 / 757 / 50.6 / 30」，却把 `LIMIT` 指向 `phase2`（= 当前实测值 + 极小 headroom）。脚本因此**通过**，而真实达成度是 **A 轴欠 903 行、E 轴欠 57 行**。这不是逻辑 bug，是把「未达成」写成「已达成」——最隐蔽的一种假绿。
  - **修法**：`LIMIT` 不再指向「当前值 + headroom」。现行语义：`ratchet`（棘轮线）= **本轮实际达成度**，只允许降；`phase1` = Issue #314 **真实目标**（6300/700/50/30），**标注 `achieved: false` 保持不变**；汇总行**显式披露**「距 phase1 真实目标还须降 N 行 ← 未达成，不得写成已达成」。新增防御：生效档位若 `achieved !== true` 直接抛错，堵死「把未达成目标当 LIMIT」的通道。
  - **继续削（第二轮真实收敛，非「不涨」）**：
    - **拆规则表（轴 A）**：把 `proofread.ts` 里 1042 行的规则区（80 条规则 + 上下文守卫 + 白名单）拆为 `proofread-rules.ts`（规则数据）+ `proofread-rule-types.ts`（`Rule` 类型契约）。注释口径改为「每条规则**判据与被误报反例必留一条**，但『第几轮评审、谁在第几轮提的、中间方案被否决的过程』不复述——过程留痕的单一来源是 PR 评论与 git 历史」。`proofread.ts` 1689 → 636 行。
    - **去重落盘/回收逻辑（轴 A）**：`generateProofreadReportHandler` 的**空报告分支与主分支**各写一遍「validateFilePath → mkdirSync → writeFileSync → 按写入结果 releaseSession → 失败返回截断预览」（两处共 60+ 行，曾因漂移导致空报告分支漏 `mkdirSync`）。抽为唯一实现 `writeReportAndRelease()`。
    - **单源化六维清单（轴 A）**：维度 key 原先在 `proofread-report.ts` 写三遍（`metricCounts` 初值对象 / `metricIssues` 初值对象 / `metricOrder` 数组）、中文标签另写一遍。改由 `proofread-types.ts` 的 `PROOFREAD_METRICS`（唯一顺序 + 标签来源）派生。
    - **补 Issue #314 两项功能项（收敛形态，非新增膨胀）**：
      - **缺陷 5 / P16 升级为段内唯一性判定（轴 D）**：新增 **P16b** 规则——`findText` 若只是某条 `issue.original` 的**真子串**（如 `findText="  "` 2 空格 / 单字），或同一段落内 ≥2 条不同原文都含该 `findText`（落点歧义）→ **拒绝**。此前 P16 用「双向子串包含」判定，与 `replaceInParagraph` 的整段替换语义矛盾（`findText="  "` 能通过校验但段内不唯一）。新增状态 `proofreadIssueEntries`（`{original, offset, length, paragraphIndex}`）随批次/会话重置；`GUIDE_MAP` 登记 `P16b` 正解。
      - **缺陷 2 / 截断显式化（轴 C）**：`wps-com.ps1` 的 `getDocumentTextByRange` 增 `requestedLength` / `returnedLength` / `truncated`（此前 `length` 是**返回长度**，调用方无法区分「拿到全量」与「被截断」——这是 AI 用模型记忆**重写全文**（幻觉）的唯一入口）；`getDocumentParagraphs` 增 `textTruncated` / `textLength`，截断值（前 200 字符 + `...`）**不再冒充当原文**（下游须以 `textTruncated` 判断可否当原文用），并统一剥离 `\r`/`\n`。
    - **SKILL 瘦身（轴 E）**：`SKILL.md` 834 → **674 行 / 44.9 KB**（SKILL 体量这一**子目标** 700 行 / 50 KB 已满足；**phase1 整体仍未达成**，见下「诚实披露」）。压缩「例外 2 表格跳过」（合并「为什么/判据/上报/门禁配合/反面清单」的重复表述）、把 5 段「📌 规则边界」长文收敛为一张「可报/不可报」结论表（判据细节的单一来源 = `proofread-rules.ts` 每规则首行注释）。
  - **实测**：校对源码 **7326 → 6946**（−380）；SKILL 834 → 674 行（−160）；规则 key 35 → 30；治理插件 2280 → 2231。本 PR（含 #316）校对线净增 **−1374**（删/增比 3.83）。
  - **诚实披露**：**phase1 的 A 轴（≤6300）本轮未达成**，距目标仍差 646 行——按「不许把未达成写成已达成」的口径，守卫汇总行**显式标注未达成**，后续原子 PR 继续推进。
  - **验证**：`npm run preflight` **EXIT=0**；MCP 单测+集成 **743/743**；根单元 **19/19**；e2e **14/14**；`governance-gate-guide` 25/25；`governance-rules` 33/33。

Ref: #314

### Changed

- **校对子系统反膨胀收敛：同一语义单源化 + 敢删重复规则 + 防腐预算/收敛守卫进 CI（Issue #314）** — 校对线累计 31+ 个同族 Issue、12 轮同症状复发。用户 2026-09-13 判断：「是不是校对功能太大了造成上下文腐烂、AI 只加不减；没有模块化导致修一处又坏一处」，并要求「定一个防止上下文腐烂的上限，验收按这个目标动刀」。实测确认三问全部成立（近 60 次提交删/增比仅 **0.070**；「每批 200 段」一个语义散落 **72 处**；单条链路源码 7326 + 测试 14294 + SKILL 834 + 治理 2280 行）。本次**不修 bug，只收敛**：
  - **单一来源（轴 C）**：`skills/wps-proofread/SKILL.md` 建立批次大小单一来源（正文统一写 `B`，数值只出现在引用处），删除重复 20+ 处；MCP 侧删除 `proofreadAccumulate` / `generateProofreadReport` 的**第二份 `ToolDefinition`**（描述/schema 唯一来源改为网关索引 `com-actions.ts`，handler 改由 `proofreadGatewayRoutes` 路由）；取消 `proofread-report.ts` 的 `export *` 再导出，消费方一律从定义模块导入。`getDocumentParagraphs` 单批上限校验由 200 改为引用 `PROOFREAD_BATCH_MAX`，消除「AI 侧校验 =200 而服务端接受 300」的重复门槛漂移（P2 门槛同源缺陷）。
  - **敢删规则（轴 D）**：**删除治理规则 P22/P23/P28 与 P25b** —— 其不变量已被服务端 `proofreadAccumulate` 串行进度校验段与报告覆盖门禁**独立强制**（对照实验留痕：缺 doc_info / 进度重复 / 跳号 / 超界均被服务端拒绝）。保留 P25（相对**本批实际获取末段**校验，服务端无此信息，不可替代）。`GUIDE_MAP` key 35 → 30，治理插件 2280 → 2164 行。
  - **SKILL 瘦身（轴 E）**：**删除自证腐烂的「P 规则速查表 + 免责段」**（「P6b 非独立 key…以源码为准/归并说明」等 20 余行），改为「规则单一来源=治理源码 + 命中拦截时有【门禁指路】」；834 → 757 行 / 59.3 → 50.6 KB。
  - **新增防腐闸门（轴 F，进 `npm run preflight`）**：`scripts/validate-proofread-budget.js`（源码/SKILL/规则数**棘轮**上限 + **已删规则防回潮**）、`scripts/validate-proofread-convergence.js`（**净增 ≤0** + 注释占比 ≥20% 防「删注释换行数」账本造假）。两者均以**变异自证**验证拦得住：纯追加 20 行 → 红；把 P28 加回 → 红；剥离全部注释（占比 0.9%） → 红。
  - **实测收敛量**：校对线 **−239 行**（新增 308 / 删除 547，删增比 1.78）；校对源码 7326 → 7203、SKILL 834 → 757、规则 35 → 30。
  - **验证**：`npm run preflight` EXIT=0；MCP 单测+集成 **743/743**；根测试 **19/19**；e2e **14/14**。
  - **契约变更（面向维护者）**：`proofreadReportTools`（`RegisteredTool[]`）→ `proofreadGatewayRoutes`（`tool_name → handler`）；`proofread-report.ts` 不再再导出 types/normalize/session 符号。`AGENTS.md`、`docs/batch-state-machine.md`（§9.4 规则表、新增 §9.4.2）已同步。

Ref: #314

## [1.9.30] - 2026-09-14

### Changed

- **NPC Team 防腐改造：把 #312 的发现刻进提示词/skill（全局观 / 契约唯一 / 模块化 / 敢删 + 1-12 各环节防腐与解耦，Issue #312，PR #317）** — 承接 Issue #312，把「同一 bug 换地方连续复发、越修越多、修补栈只加不删、上下文 2.4 万行必漏读」三条本质根因**固化进 NPC Team 自身提示词**，让 NPC Team 从此会站在全局、预防提示词腐烂、模块化/解耦、敢动刀减代码：
  - **铁律 24「防腐四维」**（`docs/NPC_TEAM.md` 权威源 + `.codebuddy/skills/npc-team/SKILL.md` 派生源双源同步）：**全局观**（动手前先答影响面/消费方，答不出禁止动手）/**契约唯一**（跨模块只过契约、须答「唯一定义者在哪一行」）/**模块化**（交付前报模块边界与依赖方向，文件拆了但契约没拆不算模块化）/**敢删**（每轮默认给出「能删什么」，须报净增/净删行数，只增不减须在 PR 写明理由）；每条均带 **#314 真实反例**与可核实判据。
  - **铁律 24 第 5 维「防御式度量」**（防「假绿」）：任何断言/门禁/度量须满足①名实一致（文案与阈值口径同义，不得把「未达成」写成「已达成」）②口径唯一（同一断言对所有被守卫对象用同一实现）③守卫自身可被同一判据反证（注入反例须由绿转红）。
  - **铁律 24 第 6 维「环节覆盖」**（用户补充「1-12 各个环节都要有防腐和解耦意识」）：流水线每个环节动手前须答本环节「①防腐什么 ②解耦什么 ③度量什么」三项并逐条留痕；留痕缺任一项即视为该环节未真实执行（合取式，非析取式；流水线级声明不得顶替环节级声明）。
  - **【防腐检查清单】6 条自检问句内联于提示词正文**（不新增外部文档，守提示词总量上限）：全局观 / 契约唯一 / 模块化 / 敢删 / 防腐自证 + 假绿自查 / 上限余量。
  - **新增守卫脚本 `scripts/validate-npc-team-bloat.js`**（`npm run validate:npc-team-bloat`，已接入 `preflight` 与 `.cnb.yml` CI）：以 5 类断言（A1 提示词行数 ≤190 / B1 铁律条目数 / C1 重复长句腐肉 / D1 未登记引用 / E1 守卫与校验器**自身**有效代码行与分支数）防 NPC Team 自身腐烂，**每类断言均有变异自证**（注入反例后由绿转红）；并新增「文档级长行去重」用例（防腐不豁免承载提示词的 `docs/NPC_TEAM.md` 自身）。
  - **校验脚本 `scripts/validate-npc-team-prompt.js` 新增 9.12（防腐四维 + 清单）/ 9.13（环节覆盖）门禁**：逐条断言铁律 24 六维语义完整、清单 6 问存在、12 环节「本环节三项」逐环节命中（缺任一环节即 CI 红）；并修 QA-F8 锚点式假绿（把实质判据并入同一语义数组校验，缺失项在报错中点名）。
  - **回归测试**：`tests/validate-npc-team-bloat.test.js` **33/33**（含 5 组变异自证）、`tests/validate-npc-team-prompt.test.js` **225/225**（含 S1–S9 负向矩阵 + 防锚点式假绿的 S9）；`npm run preflight` **EXIT=0**。
  - **文档同步（8/12 文档阶段）**：`docs/NPC_TEAM.md` 新增铁律 24 六维、【防腐检查清单】、流水线 12 环节保护行、角色卡片/注意事项/门禁段同步；`README.md` 核心特性行、`docs/README.md` 文档索引、`docs/DEVELOPMENT_GUIDE.md` 本地验证段与 CI 门禁表补 `validate:npc-team-bloat`；`AGENTS.md` 关键命令段登记防腐守卫。
  - **范围**：本 PR **不含校对源码改动**（校对契约与收敛另立关联 Issue #314 独立推进）。

Ref: #312

## [1.9.29] - 2026-09-13

### Changed
- **校对 skill 不再自称「插件强制校验」：把治理层规则速查改为「执行守卫速查」并澄清 skill/插件的职责边界（Issue #309）** — 用户反馈 `skills/wps-proofread/SKILL.md` 里「插件强制校验：治理插件在运行时自动拦截所有 `wps_office_execute` 调用」读起来像 skill 自身的行为描述，实为**治理插件**（`.opencode/plugins/governance.js`，经 `tool.execute.before` 钩子生效、随 OpenCode 运行）的既成事实，边界不清易误导维护者与终端用户：
  - **SKILL.md**：`## 插件强制校验` → **`## 执行守卫速查（治理层自动拦截）`**，新增「背景澄清」段（拦截与 skill 是否加载/附录是否读过**无关**；附录为下游记录、非用户可配置项；正文铁律才是执行契约），新增「【门禁指路】**照做即可**」说明，补 P1/P1b/P6b/P23/P25b/P28/P27b 等缺失条目，标注「拦截点」列为示意，并显式给出三层事实源（源码 > 本文档/FEATURES > SKILL 摘要）。逐字保留原「规则速查」表格语义与 P 规则关键语义（零语义回归）。
  - **规则清单失真修正**：`P1-P16`（16 条）表述早已过时（源码现为 P1～P28 系），`AGENTS.md` / README / `docs/ARCHITECTURE.md` / `docs/DEVELOPMENT_GUIDE.md` / `docs/HISTORY.md` / `docs/SKILLS.md` / `docs/FEATURES.md` / `docs/windows-code-review-fixes.md` 统一改为**「P 系列 + 清单以 `governance.js` 源码为准」**（历史文档保留「当时的快照为 P1-P16」标注，不改写历史结论）。
  - **文档同步**：`docs/batch-state-machine.md` 第 9 节与 `docs/FEATURES.md`「治理机制」补**三层阅读顺序**（语义事实源 / AI 执行摘要 / 唯一生效实现）与「改实现必须同步改摘要」一致性要求；`skills/README.md` 新增「skill 与治理插件的关系」小节。
  - **Issue #309 追问修订**：原句「自动拦截所有 `wps_office_execute` 调用」属**绝对化表述**，易被读成「网关工具被禁用/正常调用也会被拦」。改为「挂在 `tool.execute.before` 钩子上、对每一次工具调用逐条检查——通过的正常放行，命中规则的直接报错」，并明确「不是所有调用都被拦截，正常调用不受影响」，同时点明 G1/G2/P17 拦非网关/原生调用、其余规则针对网关内调用；同时修正速查表中 `P1` / `P1b` 的「拦截点」错标（源码实际拦的是 `proofreadBasic`，不是 `getDocumentParagraphs`）与 `P4` 行错标（实际拦 `replaceInParagraph`，`replaceRange` 工具已移除），并把 `P6b`/`P25b` 标注为「非独立 `GUIDE_MAP` key」（归并到 `P6`/`P25` 指路）。纯文案修订，拦截语义零变更。
  - **文档同步（续）**：`docs/DEVELOPMENT_GUIDE.md` §3.5 补「规则三层事实源 + 改实现必须三处同步」要求。
  - **验证**：`npm run preflight` EXIT=0（含 `validate:versions` / `format:check` / `lint` / 根测试 26/26 / e2e 14/14 / `validate:skill-docs`）；MCP 单测+集成 **751/751**。
  - **QA 回归修复**：`skills-consistency` 单测曾因 SKILL.md 新增的 `GUIDE_MAP` 概念名被工具名正则命中而误报（经对照实验确认由本次改动引入），按既有约定登记 `GUIDE_MAP` 为非工具名（并做变异自证确保守卫未弱化）。

Ref: #309

## [1.9.28] - 2026-09-13

### Fixed

- **校对规则同族长度缺陷：`根据A显示` / `由于A的原因导致` 无界匹配收敛（Issue #295，PR #301）** — 承接 PR #291 对 `通过A使B` 的边界收敛，把**同族另两条 `.*?` 无界规则**按同款手法收敛，消除跨句/长距离误报（实测曾跨句号吃到 62 字符、跨逗号吃到 44 字符）：
  - **R1 `根据(.*?)(显示|表明|证实)`** → `根据([^。；！？\n]{1,12}?)(显示|表明|证实)`（句读约束 + A 上界 12 字，正例最长实测 `第三方检测机构检验报告` = 12 字，8 字会误伤真杂糅）。
  - **R2 `由于(.*?)的原因(导致|使|造成)`** → `由于([^。；！？\n]{1,15}?)(的原因)(导致|使用|使|造成)` + `normalizeMatch` 守卫（句读约束 + A 上界 15 字；**刻意保留 `，` 在 A 内**，正例 `施工方未按图施工` 需跨 `，` 才命中；长距离负例由 15 字上界拦住）。
  - **新增 `Rule.normalizeMatch` 钩子**：正则扩边界取上下文后剔除多余字符 / 返回 `null` 整体丢弃；主循环带「只允许缩短」断言，防止归一化反而变长。
  - **新增 `isEnvCauseUseAsVerb` + `ENV_CAUSE_USE_NOUN_OBJ`**：区分「使用 + 名物化宾语」（正常动宾 → 丢弃）与「使 + 用X」（真杂糅 → 保留），零漏报保住 `使用户` / `使用人员` / `使用设备时`，同时关掉 `使用了` / `使用范围` 误报。
  - **继 PR #291 后补全「长距离无界匹配」缺口**：三条句式杂糅规则（`通过A使B` / `根据A显示` / `由于A的原因导致`）全部收敛为「句读约束 + 长度上限」，句式杂糅族不再有 `.*?` 裸匹配。
  - **验证**：双向断言（正例 + 负例各 5+ 条，含 `使用户` / `使用人员` / `使用设备时` 守卫边界对照实验）落 `proofread-rules.test.ts`；需求覆盖度 **6/6**；6/12 评审-修复循环 **10 轮**清零；MCP 单测 **668/668**；根单测 26/26、e2e 14/14；`tsc` 0 错；`preflight` **EXIT=0**。
  - **文档同步**：设计文档补 `F-2`/`F-3` 两条有界规则 + 新增 2.5.1 收敛细则（半角句界外科式处理 / 换行符集显式全列 / `使用` 同型排除 / 范围声明）+ `Rule` 类型新增 `normalizeMatch` 与「只允许尾部修剪」契约；`docs/FEATURES.md` 补 `F2-1`..`F2-5` + 维护契约 4 条。
  - **越界自查**：其余 `.*?` 同族规则（`针对(.*?)这一问题` 等）仅在文档标注、未顺手修改（铁律 17⑨）。

Ref: #295

- **校对偏移契约统一原文坐标系：含控制字符时 offset/length/original 自洽（Issue #296，PR #299）** — 补齐校对结果 `offset` / `length` / `original` 三元组在含控制字符（`\u00A0` / `\u200B` / 制表符等）文本上的坐标系歧义：三者统一到**原文（UTF-16 code unit）坐标系**，并固化不变式 `text.slice(offset, offset + length) === original`。新增 13 条含控制字符回归用例；契约写入 `skills/wps-proofread/SKILL.md` 与设计文档。消除「定位偏移与实际原文错位」类定位漂移。

Ref: #296

### Added

- **校对「表格密集区整块跳过非正文段落」（Issue #294，PR #300）** — Issue #277 真实会话（5494 段 / 28 批 / 约 45 分钟）暴露：前 5 批几乎全是表格（目录 / 对照表），AI 仍逐段拉取并反复确认「无问题」，属纯开销。本次在**不破报告完整性门禁**的前提下，为表格密集区提供「整块跳过」的可执行策略，并把跳过范围**如实披露**进报告：
  - **skill 层（策略契约）**：`skills/wps-proofread/SKILL.md` 铁律 2 新增**「例外 2：表格密集非正文区整块跳过」** —— 白名单判据 A（段属 `doc.Tables` 表格单元格段落，非「看起来像表格的正文」）/ B（段不含叙述句）/ C（跳过区间**完整覆盖**本批 100%），配**反向硬约束**（批内任一段不满足 A 或 B → 整批逐段照常校对）与**兜底**（判据不确定一律不跳，宁可漏跳不可误跳）+ 上报契约（`skipped_segments`）+ 反面清单。
  - **服务端披露通道（单一来源）**：`proofread-types.ts` 新增 `SessionData.skippedSegments` 与 `SkippedSegmentEntry` / `SkippedSegmentsSummary`；`proofread-normalize.ts` 新增 `normalizeSkippedSegment(s)` **保守归一化**（非法条目丢弃不猜测）；`proofread-report.ts` 的 `proofreadAccumulate` 新增 `skipped_segments` 入参并累加，抽出 `buildSkippedDisclosureSection()` 供**主分支与 0 问题分支（`buildEmptyReport`）共同复用** —— 0 问题恰是表格密集场景的典型结果，避免披露在最常见场景静默失效。
  - **跳过与进度正交（门禁不破）**：跳过是「内容判定」概念，**不改变** `_processed_to_paragraph` 的推进方式（仍严格递增、单批增量 ≤200），跳过段照常计入覆盖进度，`processedToParagraph >= totalParagraphs` 完整性门禁语义不变 —— 即「覆盖 ✅ ≠ 逐段校对 ✅」，二者分开表述。
  - **治理门禁配合**：`.opencode/plugins/governance.js` 新增 **P27/P27b** 拦截「半跳 / 假披露」（区间未完整覆盖本批却声明跳过），P27b 与是否调用过 `proofreadBasic` 无关，杜绝「先调 basic 再补半跳声明」绕过；三层（skill / 服务端 / 治理）**同口径**。
  - **新增测试**：`proofread-skip-tables.test.ts`（21 例）+ `qa294-probe.test.ts`（QA 独立探针 10 例，不与 DEV 复用断言、正反向成对）+ `proofread-store.test.ts` 扩展。
  - **文档单一事实源**：新增 `docs/proofread-skip-table-dense-design.md`（设计依据 + 硬约束 C1–C4 + 判据 + 披露字段契约）并登记 `docs/README.md` 索引。
  - **验证**：`npm run preflight` EXIT=0；MCP 单测 710/710；根单测 26/26；e2e 14/14；`governance-rules` 29/29、`governance-gate-guide` 25/25；6/12 评审-修复循环 **11 轮 / 14 问题清零**（含第 11 轮审计复评 R11-1「半跳可通过披露通道产出失真正文前提」，经铁律 21 对照实验确认系本 PR 第 1 轮修复引入，已三层同口径修复）；7/12 QA 独立复核 10/10。
  - **未采纳**：以「段」为跳过粒度（会产生「半跳」歧义与进度跳跃风险）；模糊启发式表格识别（违反「宁可漏跳不可误跳」，重蹈 #277 覆辙）。

Ref: #294

## [1.9.27] - 2026-09-13

### Fixed

- **根测试入口前置依赖检查：缺依赖时给出明确指引与可识别错误码（Issue #297，PR #298）** — 无 `node_modules` 时 `npm test`（`node scripts/run-root-tests.js`）以裸 `Cannot find module 'fs-extra'` 崩溃，报错**不指向「先装依赖」**，易被误读为代码缺陷（Issue #277 / PR #291 曾因此多绕一圈排查）。属 DX / 门禁健壮性缺口，本次按 Issue 推荐方案①（前置检查 + 明确指引）闭环：
  - **新增** `scripts/lib/check-root-deps.js`：纯函数 `findMissingRootDeps(rootDir)`，依赖清单**从根 package.json 的 dependencies 动态读取**（加依赖自动纳入，不硬编码漏项），探测用 `require.resolve(name, { paths: [rootDir] })`，与 Node 实际解析一致。
  - **修改** `scripts/run-root-tests.js`：入口前置拦截 —— 缺失依赖时精确列出缺失项并打印「请先执行 `npm install`（如需 MCP 侧依赖，另执行 `npm run mcp:install`）」指引，以 **EXIT=2**（前置条件未满足）退出，**区别于测试失败的 EXIT=1**；不再输出裸 `Cannot find module`。
  - **新增** `tests/check-root-deps.test.js`：8 条窄用例（齐全不误报 / 精确列出缺失 / 部分缺失 / 无 dependencies 字段 / package.json 缺失 / package.json 损坏等），纯函数直测、不 spawn 子进程，稳定且快；经四态破坏性反证确认无假阳性（评审 R2 抓出并修掉一版「结论随环境翻转」的假阳性用例）。
  - **文档同步**：`docs/TROUBLESHOOTING.md` 快速排查表新增「npm test 报缺依赖 + 退出码 2」条目；`docs/DEVELOPMENT_GUIDE.md` 测试节补 0/1/2 退出码语义，两处与代码真实输出**逐字一致**。
  - **未采纳方案②**（惰性 require + fallback）：只会把失败从加载期推迟到运行期，且 fallback 会掩盖真实断链（铁律 16④）；未改 MCP 侧测试入口（`npm run mcp:install` 负责，独立入口）；未顺手修 `launcher.test.js` 的 `Bad substitution` 环境噪声。
  - **验证**：无依赖态 EXIT=2 + 明确指引（裸 `Cannot find module` 计数 **0**）；已装依赖态 EXIT=0（根单元测试 **18/18**、e2e **14/14**）；根侧 + MCP 侧门禁 **13/13** EXIT=0；新增依赖 **0**；需求覆盖度 **9/9** 无缺口；6/12 评审-修复循环 10 轮问题清零；`wps-office-mcp` 的 `eslint: not found` 经铁律 21 对照实验（基线同样复现）判为环境性失败，未混入本 PR。

Ref: #297

### Added

- **NPC 流水线复盘门禁：铁律 22/23 + 校验脚本 9.11 段（Issue #292 复盘改进项预防性闭环）** — #292 复盘暴露出两类真实盲区，本次按**铁律 22（复盘改进项预防性闭环）**当轮落成可执行产物，不在后续 Issue 挂账：
  - **根因 ①：可预防类改进项复盘后无人守卫** — #292 复盘发现「把标签改成 GUIDE_MAP 里不存在的字符串即可绕过门禁守卫」这类盲区，虽在 #290/#292 已修复行为，但**守卫本身仍只单向校验**，下次改动可静默回退。**落地产物**：本次直接升级守卫（见下 9.11 段），把该盲区转为机检断言，并保留 7 组组合攻击变异自证。
  - **根因 ②：复盘结论可能仅凭历史留痕宣称落地** — #292 复盘发现「文案与文档对齐」一项因 #290/#292 交叉改写出现漂移，仅靠历史留痕无法发现。**落地产物**：新增**铁律 23（复盘必须对照原始需求逐条复验）**，要求用脚本/断言/命令重新扫描复验，禁止凭历史「已完成」宣称。
  - **新增铁律 22（复盘改进项必须预防性闭环）** — 12/12 复盘产出的**可预防类**改进项（门禁遮蔽/守卫假绿/依赖漂移/环境性失败误判等）**必须在复盘当轮落成可执行产物**——新增或升级守卫断言、校验脚本、CI 门禁，并至少跑 1 组变异自证（注入反例后断言由绿转红）；无法当轮落地的必须写明跟踪 Issue 编号与责任阶段；**禁止只写"后续如何避免"的口头承诺就宣称复盘完成**（防"四要素齐全但全是空话"）。
  - **新增铁律 23（复盘必须对照原始需求逐条复验）** — 12/12 复盘须把 Issue **原始需求文本**逐条拉出，用可核实手段（脚本扫描/断言/命令输出）重新复验是否真实落地（需求原文 ↔ 开发落点 ↔ 守卫断言），并附复验命令与输出摘要；**禁止仅凭历史留痕中的"已完成"宣称落地**，任一无法复验者当场登记为遗留项。
  - **校验脚本新增 9.11 段（`scripts/validate-npc-team-prompt.js`）** — 五处落点全部纳入 CI 机检：铁律 22/23 正文（已纳入 DEDUP_CORE 顺序链 + **位置跟随性硬校验**）、文档级**验收方法 H/I**、【注意事项】两条 bullet、门禁表两行、工作流程 12/12 行落点；每处既校验「标题存在」又校验「实质语义完整」（防保留标题、正文改空话的语义弱化逃生口），匹配采用 `stripPunct` 归一化（去空白/引号/强调符/连接号），兼顾防弱化与容忍排版差异。
  - **回归测试** — `tests/validate-npc-team-prompt.test.js` 新增 **9 条**用例（1 正向防误拦 + 8 负向攻击：删标题/弱化正文/删语义/删 bullet/删门禁表行/删工作流程落点，含「中性化守卫 + 破坏落点」的组合攻击），累计 **206/206**。
  - **变异自证（铁律 22 要求）** — 17 组变异攻击全部由绿转红，其中 **7 组为「同时中性化守卫 + 破坏对应落点」的组合攻击**（C1~C7）100% 被拦；同时暴露并修正了 3 处**真实漏检**：① 22/23 未纳入 DEDUP_CORE 顺序链时可被挪位；② 删 `DEDUP_CORE` 中 22/23 登记即静默放行；③ 位置跟随校验缺失。另修正 4 条既有用例断言（`铁律 19~21` → `19~2[13]`、双源噪声导致的假阳性），均为本次门禁升级的同源适配。
  - **文档同步** — `docs/NPC_TEAM.md` 同步新增铁律 22/23、方法 H/I、【注意事项】两条 bullet、门禁表两行、工作流程 12/12 行落点；`.codebuddy/skills/npc-team/SKILL.md` 由 `scripts/sync-npc-team-skill.js` 派生同步（双源一致）。
  - **验证** — `node scripts/validate-npc-team-prompt.js` exit 0；`node tests/validate-npc-team-prompt.test.js` **206/206**；`npm test` **26/26**；`npm run test:e2e` **14/14**；`node tests/governance-gate-guide.test.js` **25/25**。

Ref: #292

- **NPC 流水线三条防重规则（铁律 19/20/21，Issue #284）** — 针对 Issue #277 在 36 分钟内产出 3 个同题 PR（#278/#279/#280）、并新建两个几乎相同的 Issue（#281/#282）、7/12 又因「最新交棒指令」指向半成品 #279 而选错交接对象的重复劳动事故，在 NPC Team 提示词中新增三条硬性防重规则（`docs/NPC_TEAM.md` + `.codebuddy/skills/npc-team/SKILL.md` 双源同步）：
  - **铁律 19 防重复 PR**：任何一轮 5/12 开发开工前必须先查同 Issue 是否已有 open PR（`cnb pulls list-pulls --state open` + Issue 评论 PR 编号交叉核对）；已有 open PR 一律复用该 PR 与其 head 分支继续推提交，**禁止新建分支、禁止新建 PR**；收尾自查「本 Issue 下 open PR ≤1，一个 Issue 一个 PR 一条分支」。
  - **铁律 20 交接只用 PR 编号**：任务书/接力卡/评审·修复·测试·合并留痕/召唤话术中的交接对象必须写 PR 编号 `#<编号>` + commit sha，**禁止只写分支名**；下一棒必须以 PR 编号认领对象，禁止凭"最新一条指令/最新分支"猜对象。
  - **铁律 21 判「阻塞」前必须对照实验**：任何角色判定"阻塞/失败与本次改动相关"前，必须同一份代码、同一命令在另建干净目录或另用基线 commit（未含本次改动）各跑一遍；只有"本次改动后失败、基线通过"才可判为本次改动导致的阻塞；基线同样失败属环境性失败，**不得记为本次改动阻塞**，须附两条命令与输出作证据并继续推进其余可验证部分。
  - 配套落点：流水线 5/12 开发绑定"开工前先查 open PR"、任务书/接力卡新增 PR 编号与「交接 PR」字段、角色卡片 PM/DEV/CR/QA 职责同步、门禁表新增三行防重门禁；`scripts/validate-npc-team-prompt.js` 新增 9.10 节防重规则门禁（含文档级门禁表/工作流程校验），`tests/validate-npc-team-prompt.test.js` 新增 14 条回归用例（1 正向 + 13 负向）。

Ref: #284

- **第 1 轮评审修复（E1~E7 门禁逃生口）** — 6/12 评审用变异攻击发现 9.10 门禁只覆盖部分落点，7 处新增落点被删后 CI 仍 exit 0。已逐条补齐门禁：① 铁律 19「判定口径」句；② 铁律 20「一次流水线同一 Issue 只认一个 PR 编号」句；③ 铁律 21「对照实验证据须写入 Issue/PR 留痕」句；④ 铁律 12「交接对象一律用 PR 编号而非分支名」句；⑤ 角色卡片 PM/DEV/CR/QA 的铁律 19/20/21 落点；⑥ 【合并确认卡】「交接对象唯一性」行；⑦ 工作流程 7/12 行对照实验落点。`tests/validate-npc-team-prompt.test.js` 新增 11 条回归用例（10 负向 + 1 正向），累计 176/176。

- **第 2 轮评审修复（U1/U2/U5 逃生口）** — 扩展变异攻击面发现 3 处文档级/字段级落点未被门禁覆盖：① 文档级「方法 G（三条防重规则验证）」；② 【注意事项】三条防重规则说明 bullet；③ 提示词内【接力卡】「本步产物」PR 编号约束行。已补齐门禁 + 3 条回归用例，累计 179/179。

- **第 3 轮评审修复（N4/N5/N7/N8 语义弱化逃生口）** — 转向门禁正则鲁棒性攻击（保留锚点关键字、弱化实质约束）发现 4 处放行：① 流水线 5/12 「禁止新建」；② 门禁表铁律 19 行内约束；③ 方法 G 正文；④ 注意事项 bullet 正文。已改为完整约束句式强匹配 + 4 条回归用例，累计 183/183。

- **第 4 轮评审修复（B4 过度校验误报）** — 转向「空白/格式绕过 + 等价格式改写误拦」攻击发现：方法 G 门禁因标题多一个空格即误判失败（属过度校验）。引入**空白归一化匹配**（`stripWs`）兼顾「防语义弱化」与「容忍排版差异」，同步用于方法 G / 注意事项 bullet / 门禁表语义校验；新增 4 条回归用例（2 正向防误报 + 2 负向防漏报），累计 187/187。

- **第 5 轮评审修复（O2/O3 顺序校验逃生口）** — 转向 DEDUP_CORE 顺序校验健壮性攻击发现：① 铁律 20/21 之间插入干扰句仍放行；② 重复注入铁律 19 标题仍放行。修复：搜索游标从上一命中处推进 + 铁律 19~21 区间仅允许三条规则本体（无未声明干扰行）+ 三条标题全局唯一；新增 3 条回归用例，累计 190/190。

- **第 6 轮评审修复（Z1/Z2 文档承诺逃生口）** — 转向 SKILL 触发词/单一规则源/文档承诺维度发现：文档级「自动校验说明」段落中「三条防重规则门禁存在（铁律 19/20/21…）」被删或弱化均不报（该段是文档对 CI 校验项的显式承诺）。已补空白归一化强匹配门禁 + 2 条回归用例，累计 192/192。

- **第 8 轮评审修复（V3 PM 卡片双落点覆盖）** — 角色卡片段落化边界维度发现：PM 卡片同时含铁律 19/20 两处落点，但门禁只校验铁律 19，删「审核交接对象一律用 PR 编号（铁律 20）」半句仍放行。补强为双落点完整校验 + 1 条回归用例，累计 193/193。

- **第 9 轮评审修复（W2/W4 多落点覆盖）** — 角色卡片第二落点/交接字段后缀维度发现：① CR 卡片含铁律 20/21 两落点，门禁只校验铁律 20；② 接力卡「交接 PR」字段门禁只校验字段头，后缀「只认 PR 编号…（铁律 20）」可删。均补强为完整校验 + 2 条回归用例，累计 195/195。

- **第 10 轮评审修复（Y2/Y3 铁律正文尾句）** — 终检 17 处落点发现：① 铁律 20 案例锚点尾句「本仓 7/12 曾因指向半成品 #279 而选错交接对象」；② 铁律 21 行为禁令尾句「禁止不做对照实验就报阻塞 / 禁止拿环境失败停下整条流水线 / 禁止以"阻塞"名义跳过留痕」（正是 Issue #284 第 3 条治本建议的行为禁令本体）未受门禁保护。补入受保护句式 + 2 条回归用例，累计 **197/197**。

- **8/12 文档阶段：用户入口文档同步（Issue #284 需求落地闭环）** — 三条防重规则此前只落在 `docs/NPC_TEAM.md`（提示词权威源）与 `.codebuddy/skills/npc-team/SKILL.md`（派生源），**用户实际阅读入口未同步**，存在「规则已落地但用户不知」的文档脱节：
  - `README.md`：核心特性行补「内置三条防重规则（铁律 19/20/21）」；接力模式说明段补三条规则的**用户可读一句话摘要**（防重复 PR / 交接只用 PR 编号 / 判「阻塞」前对照实验）。
  - `docs/README.md`：文档索引 NPC_TEAM 条目补「内含三条防重规则铁律 19/20/21」说明，便于从索引直达规则。
  - 本阶段同时按**铁律 21 对照实验**复核 `format:check` 存量失败：`tests/rewrite-wiki-links.test.js` 在未含本次改动的 `origin/main` 基线 worktree 上同样 Prettier warn → 判**存量环境性/历史问题，与本次改动无关**，不记为本次改动阻塞，遵循铁律 17⑨ 不在本 PR 顺手修。
  - 验证方式与结果见 PR #285 的 8/12 文档留痕评论。

### Changed

- **全部自建 NPC 模型由 DeepSeek V4 Flash 升级为 DeepSeek V4.1 Flash（Issue #286）** — 将本仓库 7 个自建 NPC 角色（项目经理 / 产品经理 / 架构师 / 全栈开发工程师 / 代码评审员 / 测试工程师 / 研究员，定义见 `.cnb/settings.yml`）的执行模型统一从 `deepseek-v4-flash` 升级为 `deepseek-v4.1-flash`：
  - `.cnb.yml` 的 `.npc_task` 锚点（`issue.comment@npc` / `pull_request.comment@npc` 兜底事件，即评论触发全部 NPC 角色的入口）：`model` 改为 `deepseek-v4.1-flash`。
  - `.cnb.yml` 的 `crontab` 微信群二维码提醒 NPC：`model` 同步改为 `deepseek-v4.1-flash`，保持与 `.npc_task` 锚点一致。
  - 相关注释同步更新模型名，避免注释与配置漂移。

  **范围说明**：本次仅调整「自建 NPC」的 `npc:go` 模型。以下同名字符串非自建 NPC 模型，保持不动：`opencode-wps/config.js` 的 WPS 插件侧边栏模型列表（`opencode/deepseek-v4-flash-free`）、`agents/wps-expert.md` 与 `.github/workflows/opencode.yml` 的 OpenCode/GitHub Agent 模型、codewiki 的 `llm_model_name` 及历史 CHANGELOG/文档记录。

## [1.9.26] - 2026-09-12

### Fixed

- **门禁指路覆盖缺口闭环：裸 `throw` 接入 `enhanceBlock` + 守卫测试防复发（Issue #290 / #292，PR #293）** — 承接 Issue #247「门禁引导增强」设计目标，补齐 `governance.js` 中「拦截了但不指路」的长尾缺口，让 AI 撞门禁时**首次触发即拿到「该怎么做」**，而非只收到「不能这么做」：
  - **#290（有正解未接入）**：6 处裸 `throw new Error` 的消息体已带 `GUIDE_MAP` 已定义标签却未走增强入口（P17 伪造校对报告 / P24 覆盖全文未生成收尾报告 / P19 批次区间越界 ×2 / P23 `doc_info.totalParagraphs` 不一致 / P25 假进度上报），改为 `throw enhanceBlock(st, msg, '<ruleKey>', toolName)`；**显式传 ruleKey**，免疫文案微调导致首标签漂移；原文案逐字保留，仅追加【门禁指路】。
  - **#292（连正解都没有）**：`GUIDE_MAP` 补 6 条正解（`P21` 并行批次区间重叠 / `P6` 陈旧 issue 填充 / `P13` 单批文本超限 / `P26` 越界 issue 段落索引 / `P1` 流程前置缺失 / `P1b` 批次被截断），5 处「有标签无正解」+ 4 处无标签流程前置校验接入 `enhanceBlock` 显式 key；**17 处无规则标签的参数校验/模板兜底保持裸 `throw` 不动**（接入会以空 key 进 `hitCounter`，污染「重复翻车感知」口径）。
  - **新增守卫测试 `tests/governance-gate-guide.test.js`（23 条断言）**：直接扫源码 throw 点（原有 `governance-rules.test.js` 把 helper 抽出来白盒跑，碰不到「哪个拦截点用了裸 throw」，正是缺口长期存在的盲区），断言「裸 throw 且带 `GUIDE_MAP` 已定义标签 = 0」+「标签 ↔ `GUIDE_MAP` 双向一致」+ 显式 ruleKey 实参 + 原文案保留 + CI 接入守护。
  - **结果**：裸 `throw new Error` 32 → **17**（全部无标签）；`throw enhanceBlock` 34 → **49**；`GUIDE_MAP` key 27 → **34**；覆盖缺口 6 → **0**；拦截语义零回归（原文案片段逐条保留 + `indexOf` 断言固化）。
  - **文档同步（8/12 文档）**：`docs/FEATURES.md` 铁律 3.0 表格补 `P1b` 独立条目（`P1b`=批次输出被截断需同参数重试补齐，与 `P1`=`尚未获取首批段落` 语义不同，Issue #292 R1 评审拆出的独立 key）；`docs/batch-state-machine.md` §9 规则表补 `P1b`，并新增 §9.4.1「门禁指路」机制小节（`GUIDE_MAP`/`hitCounter`/`enhanceBlock`/`extractRuleKey` + 双向一致 + 禁止空 key 进 `hitCounter`）；`AGENTS.md` 规则范围更新为 `P1-P28 (含 P1b/P6b/P25b)`、「Gate guidance」小节补接入约定与基线计数；`governance.js` 注释区登记 key 清单。
  - **守卫测试同步加固（2 条）**：新增「新增 key 已在 docs/AGENTS.md/注释区登记且 `P1b` 语义与 `P1` 区分」「`P1/P1b` 两条正解语义不同、指路方向不得互相覆盖」断言，使**文档与代码的双向一致也进入机检**（防止「代码有正解、文档无记载」漂移），用例 23 → **25 条**；4 组变异自证（删 `FEATURES.md` 的 `P1b` 条目 / 改 `§9.4.1` 小节标题 / 删 AGENTS.md 双向一致约束 / 把 `P1b` 文案改成与 `P1` 相同）均使新断言**由绿转红**。
  - **验证**：10 轮评审-修复循环 ×2（变异自证：删 `GUIDE_MAP` 条目 / 改标签 / 内嵌同名字符串均使守卫由绿转红）；`node tests/governance-gate-guide.test.js` 25/25、`npm test` 26/26、`npm run test:e2e` 14/14、`npm run preflight` 全绿（EXIT=0）。

Ref: #290
Ref: #292

## [1.9.25] - 2026-09-12

### Fixed

- **同族校对规则边界收敛：消除句式杂糅跨句与变的/在再误报（Issue #277-C，PR #291）** — 真实校对会话（5494 段）复盘暴露**同族规则边界缺失**：同一族规则在部分语境下把**正确写法**误判为错别字，规则层持续产出误报。本次按「右边界守卫」同构方案（与 P1-3 / R4-1 的 `isWesternSegment` 左边界互补）收敛 5 处：
  - **C1-1 句式杂糅跨句乱吃**：`通过(.*?)(使|让|令)` 的 `(.*?)` 无长度/句读约束，会话实证 3 条误报、**最长匹配 124 字符**，AI 按 `original` 定位替换即成整段污染。`A` 限定「不含句末标点/换行、≤8 字」：`/通过([^。；！？\n]{1,8}?)([使让令])/g`。
  - **C1-2 `使用` 被误排除**：`通过A使用B` 是正常动宾需排除，但 `使 + 用X`（真杂糅，如 `使用户体验`）与 `使用X` **字符层面完全同形**。改为**强搭配白名单**（12 项：`意见/时长/说明/情况/方式/方法/范围/权限/记录/文档/系统/环境`）+ **必须满足词界**（表项后接 CJK 视为新词，`记录员`/`文档化` 不豁免）；单字 `人` 明确不入表。
  - **C1-3 `变的/做的` 误报**：「总额不变的前提下」被当成「变得」的得混淆（段落 635）。新增**右边界守卫** `isRightBoundaryOk`：判据为**左语境 + 右词性联合**——左侧紧邻非 CJK（串首/空白/ASCII 标点）+ 右侧名词性 → 丢弃；左右皆 CJK（`数值变的很少`）→ 一律仍报。
  - **C1-4 左语境判据取错**：R1 初版「只按右侧前缀匹配」会把 `数值变的很少` 的「数值」误判为「不变的」结构而**丢弃真修复**。改为 `isLeftContextCjk` 锚定「变」字**紧邻的左邻字**（`text[index-1]`，`index`=「变」的下标）：左邻为汉字且该字**不属于**「否定/变更词」集合（`不/未/没/要/有/会/能/可/变/已`）时视为「主语 + 变的」谓语语境，不允许白名单豁免。（历史备注：本行旧文曾写「匹配前 3 字」，与实现不符——实现读的是**单字**，已按源码校正。）
  - **C1-5 `在次` 时间名词误报**：「月账单在**次月**10日前确认」被当成 `在次⇒再次`（段落 3950）。仅 `在次` 分支豁免标准时间名词（`次月/次日/次周/次年`）；**`在来`/`在去` 分支不豁免**；豁免面收窄过程：通用量词 → `月/日/周/年/季` → 去 `季`（`次季度` 会漏报真错）→ 仅 `次` 分支。

  **规则维护契约（Issue #277-C 增补，勿删）**：同形异义必须用「左右语境联合判据」，不得只按单侧前缀匹配；白名单宁少不滥且必须满足词界；单字词不进白名单；豁免面不得超出设计意图；正则的贪婪通配必须有上下界。

  整治策略：误报会诱导 AI 改坏正确文本，故规则收紧遵循**宁可少报（假阴性）不可误报（假阳性）**；无法用规则判定的交给 Layer 2 AI 语义层。**验证**：净增 26 条单测（617→643），QA 独立探针 25/25、根单元 26/26、E2E 14/14、`tsc`/`eslint`/`prettier` 全绿、`npm run preflight` EXIT=0；性能 23200 字文本单次 3.4ms。评审-修复 R1–R10 共 10 轮清零，**9 条 🔴 中 5 条为修复自身引入的回归**（`使用人`/`季`/泛化宾语/`来去`共用/前缀越界），全靠循环当场打回。

Ref: #277

## [1.9.24] - 2026-09-11

### Fixed

- **校对报告可信度整改：消除规则误报与报告失真（Issue #277 ← #247 诊断，PR #280）** — 真实校对会话（5494 段）复盘暴露 3 个 P1 级报告失真/误报 + 2 个 P2 口径问题，逐项修复：
  - **P1-1「全部已修复 ✅」失真**：报告判定只校验段落覆盖完整（`_coverageComplete`），不看问题是否真的被修，导致 33 条 `fix_action: report_only`（仅报告未修）也被标为「全部已修复 ✅」。新增 `_allFixed` 判据（要求全部问题非 `report_only`），不满足时显示「覆盖 ✅ / 修复 ❌（N 处仅报告未修）」。`fix_action` 字段新增变体归一化（`report__only` / `report only` 等分隔符全量收敛为 `[^a-z0-9]+`）与取值推断标记（`fix_action_inferred`：区分 `missing`/`unknown`），并在报告「口径说明」披露，关闭「AI 漏传字段 = 误判已修」通道。
  - **P1-2「中英混排」大面积误报（21/34 条为假）**：原规则「任何字母 + 全角标点」即判混排，把中文句子里的单个代号（`，D1`、`执行方R`、`QPS，`、`。SLA`）当英文词误报。改为要求标点两侧为**纯西文词边界**（≥2 字母西文词 + 显式 `isWesternBoundaryChar` 判定），单字母代号天然不命中，真混排（`hello world，世界`）仍命中。
  - **P1-3「的地混淆」误报**：原规则命中 `一致的` 即替换为 `一致地`，不看「的」后接名词还是动词，误伤 `不一致的成果` / `一致的目标`。改为要求「的」后接谓语性成分才报，后接名词则跳过。
  - **P2 报告修订口径自相矛盾**：文案「问题数 × 2 = 修订数」方向反了（实际是修订数 ÷ 2 ≈ 替换类问题数）。修正文案方向，并与 `issues.length` 交叉校验，不一致时告警「修订记录与问题清单对不上」。
  - **P2 禁 `echo` 落盘中文**：`echo "中文" > file.txt` 在 Windows 必然 GBK/UTF-8 乱码，污染校对结果。SKILL.md 新增铁律：禁止用 `echo` 写中文到临时文件，需落盘一律走 `file_path` 指向已有文件或分片传 `text`。

  整治策略：误报会诱导 AI 改坏正确文本，故规则收紧遵循**宁可少报（假阴性）不可误报（假阳性）**；无法用规则判定的交给 Layer 2 AI 语义层。评审 R1–R10 彻底循环清零（含 R7/R8/R9/R10 抓出并闭环 8 条问题，其中 R8-1 为 R7 修复自身引入的回归，当场打回）；MCP 单测 617/617、`preflight` EXIT=0。

## [1.9.23] - 2026-09-11

### Added

- **NPC 流水线三条防重规则（铁律 19/20/21，Issue #284，PR #285）** — 针对 Issue #277 在 36 分钟内产出 3 个同题 PR（#278/#279/#280）、并新建两个几乎相同的 Issue（#281/#282）、7/12 又因「最新交棒指令」指向半成品 #279 而选错交接对象的重复劳动事故，在 NPC Team 提示词中新增三条硬性防重规则（`docs/NPC_TEAM.md` 权威源 + `.codebuddy/skills/npc-team/SKILL.md` 派生源双源同步），并配套 CI 门禁防未来静默删除：
  - **铁律 19 防重复 PR**：任何一轮 5/12 开发开工前必须先查同 Issue 是否已有 open PR（`cnb pulls list-pulls --state open` + Issue 评论 PR 编号交叉核对）；已有 open PR 一律复用该 PR 与其 head 分支继续推提交，**禁止新建分支、禁止新建 PR**；收尾自查「本 Issue 下 open PR ≤1，一个 Issue 一个 PR 一条分支」。
  - **铁律 20 交接只用 PR 编号**：任务书/接力卡/评审·修复·测试·合并留痕/召唤话术中的交接对象必须写 PR 编号 `#<编号>` + commit sha，**禁止只写分支名**；下一棒必须以 PR 编号认领对象，禁止凭「最新一条指令 / 最新分支」猜对象。
  - **铁律 21 判「阻塞」前必须对照实验**：任何角色判定「阻塞 / 失败与本次改动相关」前，必须同一份代码、同一命令在另建干净目录或另用基线 commit（未含本次改动）各跑一遍；只有「本次改动后失败、基线通过」才可判为本次改动导致的阻塞；基线同样失败属环境性失败，**不得记为本次改动阻塞**，须附两条命令与输出作证据并继续推进其余可验证部分。
  - 配套落点：流水线 5/12 开发绑定「开工前先查 open PR」、任务书/接力卡新增 PR 编号与「交接 PR」字段、角色卡片 PM/DEV/CR/QA 职责同步、门禁表新增三行防重门禁；`scripts/validate-npc-team-prompt.js` 新增 9.10 节防重规则门禁（含文档级门禁表/工作流程校验）；`tests/validate-npc-team-prompt.test.js` 回归用例累计 **197/197**（评审-修复循环 10 轮清零，修复 24 项「门禁可被绕过」缺口）。
  - 用户入口文档同步：`README.md` 核心特性行与接力模式说明段补三条防重规则的用户可读摘要；`docs/README.md` 文档索引 NPC_TEAM 条目补「内含三条防重规则」说明，消除「规则已落地但用户不知」的文档脱节。

### Fixed

- **发布卫生整顿：存量格式失败修复 + 镜像产物缺口披露 + Release 收敛（Issue #284）** — 复核 v1.9.23 发布链时发现三处「发布留痕与实际状态不一致」的真实缺口，逐项修复：
  - **存量格式失败（真因定位后修复）**：`tests/rewrite-wiki-links.test.js` 存在 Prettier 格式违规，导致 `main.push` 流水线的 `npm run preflight` 在 `format:check` 处失败、tag 流水线的 `Docker build`/`Docker push` 被 skip。**先验证后整改**：复现（`npx prettier --check`）+ 定位根因（PR #283 `ffa90b4` 新增 `path.join(ROOT, ...)` 调用后单行超宽未重排）+ 验证方案（`prettier --write` 后 `--check` exit 0、原文件仅 1 处方差异）→ 正式修复（5 行格式化改动，语义不变）。
  - **镜像发布产物缺口（如实披露，本 PR 未手工推送）**：`docker.cnb.cool/lnxsun/opencode-wps:latest` 仍停在 `d3fa55d2`（= v1.9.22，最后推送 `2026-09-10T09:37`），制品库中**尚无** `:70918b5` / `:v1.9.23` 标签；根因为 tag/push 流水线的 `Docker build`/`Docker push` 被 `format:check` 失败连带 skip。本 PR 修复格式失败后，**由合并后触发的 `main.push` 流水线自动补推**最新镜像——本 PR 本身**未**手工推送（需 Docker 构建环境 + 制品库权限，交由流水线更可核实）。
  - **Release / tag 元数据收敛**：核对 Release 与 CHANGELOG 口径，去除 CHANGELOG `[1.9.23]` 段内 9 处冗余孤立 `Ref: #284` 行（收敛为段末 1 处），避免重复引用噪音。

- **结项发布：镜像补推与格式修复的终态闭环（Issue #284）** — 上一轮留痕写的是「**由合并后触发的 `main.push` 流水线自动补推**」这一**未来承诺**，本轮在 PR #288（合并提交 `7dee126`）合并后**实测收敛到已完成终态并留痕**：
  - **镜像产物已真实补齐**：合并触发的 `main.push` 流水线 `cnb-56g-1k27c83p5` 三段（pipeline-1/2/3）全部 `success`，`Docker build`/`Docker push` 不再被 skip。制品库实测 `docker.cnb.cool/lnxsun/opencode-wps` 的 `latest` 与 `7dee126e` 均指向 revision `7dee126`，推送时刻 `2026-09-11T12:41:47`（此前 `latest` 停在 `d3fa55d2` = v1.9.22）。**此前的「镜像缺口未闭合」表述已过期，以本条为准。**
  - **格式失败已随修复闭环**：`npm run preflight` 在含 PR #288 的主线上 `format:check` 通过（`All matched files use Prettier code style!`），不再是失败项。
  - **Release 页面同步**：CNB Release v1.9.23 的「⚠️ 遗留说明」中两条已过期声明（`format:check` 存量失败未修复、Docker 镜像产物未产出、镜像 `latest` 仍停在 `d3fa55d2`）已随本轮更正为已闭环终态，避免发布页与制品库/流水线实际状态不一致。

Ref: #284

## [1.9.22] - 2026-09-10

### Changed

- **校对批次统一为每批固定 200 段，去除「推荐 100 段」歧义（Issue #247 / #277，PR #276）** — Issue #247 反馈校对过程批次策略混乱（一会 100 段一批、一会 200 段一批、一会一次跑 3 批、一会一次跑完剩余段落），根源是 skill/agent/docs 中「每批 ≤200 段，**推荐 100 段**」表述存在歧义，AI 可自由取 100 或 200，导致执行不一致。本次将全链路口径统一为**每批固定 200 段**：
  - `skills/wps-proofread/SKILL.md`：铁律 6、批次大小限制、计划表、2a 子步骤、BATCH_SIZE、超时章节统一为「固定 200 段」，明确「严禁这批 100 段、下批 200 段的随意变化」「严禁临时把批量改成 50/100/150 段」。
  - `agents/wps-expert.md`：校对铁律第 3 条改为「单批固定 200 段」。
  - `docs/FEATURES.md` / `docs/SKILLS.md` / `docs/batch-state-machine.md`：文档口径同步为固定 200 段，并补回「为何控制单批大小」依据（防 MCP 输出截断漏检 / `text.maxLength=5000`）。
  - `wps-office-mcp/src/tools/word/proofread-store.ts`：运行时 `generateAutoBatches` 默认批量由 100 改为 200，使 SKILL.md「服务端自动分批每批固定 200 段」成为真事实，消除文档与运行时错位（同步更新相关单测断言，250 段→2 批）。

  **语义说明**：治理层 `MAX_PARAGRAPHS_PER_BATCH=200` 保留为**硬上限兜底**（最后一批可能少于 200），AI 操作策略在 skill/agent 层强制为**固定 200 段**；超大型文档保留「向用户说明后可缩减该批」的降级逃生阀，避免数千段文档靠后批次反复超时卡死；单批文本常超 5000 字符，应直接预期走 `file_path`。

## [1.9.21] - 2026-09-09

### Changed

- **三平台大 handler 单源化去重（Issue #270，去重重构 PR）** — 将 `opencode-wps-assistant/` 与 `opencode-wps-linux/` 两份平台的 `excel-handler.js`/`ppt-handler.js`/`word-handler.js` 收敛为单一来源：新增 `shared/wps-bridge/{excel,ppt,word}-handler-core.js`（以 mac 硬化版为唯一事实源），扩展 `scripts/sync-wps-bridge.js` 按平台生成两份产物文件，`--check` 漂移门禁覆盖三份大 handler。经逐字节比对核实三份大 handler **不含平台条件逻辑**（零 `BRIDGE_PLATFORM`/零 OS 判断），但两平台文件并非逐字节相同——存在少量内容分歧，本次统一以 mac（参考 Windows 契约的硬化版）为准：
  - `getActiveWorkbook`：linux 原多返回 `activeSheet` 字段，统一后不再返回（Windows/mac 参考实现均无，且无下游消费方读取，低影响）。
  - `getOpenWorkbooks`/`getOpenPresentations` 等列表获取：linux 原用 `fail()`（success:false），统一为 mac 的 `ok({..., error})`（success:true + error 字段）。
二者均与 Windows/mac 参考实现对齐，属低影响行为对齐而非功能回归；linux 同时继承 mac 的入参校验/try-catch/OOM 上限等安全护栏。`tests/wps-bridge-shared.test.js` 新增 5 个回归用例（共享 core 存在、mac/linux body 一致、产物由 shared 派生、动作数保持一致、硬化护栏继承），单源化覆盖率 100%。

- **单文件拆分 proofread-report.ts（Issue #270，单文件拆分 PR）** — 将 2115 行的 `wps-office-mcp/src/tools/word/proofread-report.ts` 拆为 4 个职责清晰模块：`proofread-types.ts`（共享类型）、`proofread-normalize.ts`（类型/来源/位置归一化 + 评分权重公式，纯逻辑）、`proofread-session.ts`（会话 Map + LRU 上限淘汰 + 磁盘恢复/清理）、`proofread-report.ts`（仅保留两个工具 handler 与报告生成逻辑）。主文件经 `export *` 再导出全部公共 API，向后兼容（测试与外部消费方无需改动）。166 个 proofread-report 单测 + 519 个全量 MCP 测试全绿，`tsc` 通过，抽象无运行时行为变化。

## [1.9.20] - 2026-09-09

### Fixed

- **修复校对空跑与报告失真问题（Issue #247，PR #274）** — 承接 CP1 整改方案，针对已实证的 4 类根因落地修复：①调和 `skills/wps-proofread/SKILL.md` 传参自相矛盾（优先用 `text` ≤5000 字符，仅当 ≥5000 字符或含 `\f` 才用 `file_path`，对齐 `proofreadBasic.text.maxLength=5000` 真实定义），补 `writeFile` 落盘临时文件完整示例与参数键名警示（`text_file`/`filePath` 驼峰均会翻车）；②明确段落总数以 `getDocumentParagraphs.totalCount` 为唯一事实源，`getActiveDocument.paragraphCount` 仅参考；③修订模式三工具（`enableTrackChanges`/`getTrackChangesStatus`/`confirmBatchAiProofread`）超时 5000→15000ms；④空报告 0 问题不再虚假六维 10.0/10，改「评分不适用 / 未检测到问题」，并澄清修订总数=文档级累计（含既有修订）非本轮修复数。

Ref: #247

## [1.9.19] - 2026-09-09

### Fixed

- **强化校对 SKILL 对 AI 的调用约束，减少行为层报错（Issue #247，PR #269）** — 逐行核对实际校对会话，根子问题（WPS-MCP 调不到）已解决后，仍有 41 处「行为层」报错（AI 用得不规范 + 规则误拦叠加）。修复：强化 `skills/wps-proofread/SKILL.md` 对 AI 的调用约束：①`arguments` 必须是对象（给出已发生的错误示范：JSON 字符串/打错冒号）；②单批 ≤200 段、严禁一次拉 300~1149 段跳步加速、严禁重复上报同一进度、只报实际推进末段；③`findText` 必须取本批段落真实原文。`agents/wps-expert.md` 校对铁律同步扩为 6 条强制条目。

### Changed

- **治理门禁增加引导反馈，拦截时给 AI 指路防反复翻车（Issue #247，PR #271）** — `governance.js` 引入 `GUIDE_MAP` 为 G1-G4 / P2-P28 / T1-T8 等高频易翻车规则补充「正解指引」；`hitCounter` 会话级触发送数，同规则重复触发逐级升级引导强度（第 1 次基础指路 → 第 2 次重复提醒+完整流程 → ≥3 次强警告+建议中止）；`enhanceBlock()` 统一增强入口接入 34 处拦截点。**只追加引导内容，不修改任何拦截语义**，既有校验逻辑零回归。

### Docs

- **AGENTS.md 增加 Gate guidance 说明** — 跟随 PR #271 同步更新治理门禁引导机制说明。

## [1.9.18] - 2026-09-09

### Fixed

- **修复 WPS-MCP 工具调不到 / 校对不稳定根因（Issue #247，PR #254 / #255 / #256 / #257）** — 经多轮逐行分析实际校对会话（ses_f8a0/f860/f85f/f806）与 GitHub 正常版对照，最终钉死「AI 调不到 wps-office MCP 工具、转去退路调旁门（opencli 等）」的**运行时三层根因**并全部修复：

  ①**PR #254（agent tools 白名单裸名）** — 4 个 agent（wps-expert/word/excel/ppt）front-matter 的 `tools:` 白名单写的是**裸名**（`wps_office_execute`），而 opencode 实际把 MCP 工具按 server 名前缀注册为真名（`wps-office_wps_office_execute`），前缀对不上导致匹配 0 个 WPS 工具、agent 对 WPS-MCP 工具完全不可见。修复：**删除 4 个 agent 的 `tools:` 白名单**，回归 `docs/superpowers/specs/2026-05-08-mcp-progressive-loading-design.md` 原设计（agent 收敛靠 MCP 网关而非白名单），与 GitHub 正常版对齐。新增 `scripts/validate-agent-no-tools.js` 门禁（断言 agent front-matter 无 tools 字段）+ 6 个回归测试，接入 preflight。

  ②**PR #255（launcher 端口占用 ServeError）** — `startOpenCode()` 启动守卫只查**内存引用**不查端口实占，launcher 重启后引用复位，会重复 spawn 新 serve，孤儿 opencode serve 占着 14096 端口导致新 serve `ServeError`。修复：抽象 `killProcessOnPort(port)`（netstat 定位 + 进程名校验 + taskkill），spawn 前先清理端口上的孤儿 serve，杜绝 churn 复发；launcher 测试 43/43。

  ③**PR #256 / #257（裸命令 PATH 依赖 ENOENT）** — serve 由 launcher 从 **WPS 进程环境** spawn（PATH 缺失 node/powershell），而 `install-addons*.js` 写 MCP 条目用**裸 `node`**、`wps-client.ts` 的 `spawnPowerShell` 用**裸 `spawn("powershell")`** → serve 拉起 MCP/执行 COM 时 `spawn node/powershell ENOENT` 静默失败。修复：三平台 install-addons 的 MCP `command` 改用 `process.execPath` 绝对路径（#256）；`wps-client.ts` 新增 `resolvePowerShellPath()` 探测系统 PowerShell 绝对路径再 spawn（#257）。经层层修复，MCP 工具正常注册、COM 调用不再 ENOENT。

- **修复 wps-proofread skill 文档断链（Issue #247，PR #249 / #250）** — SKILL.md 瘦身（PR #246）后新增 4 处对 `docs/*.md` 的引用（L67/L359/L500/L541），但按 skill 相对路径解析不到（根 docs 不随 skill 安装复制）。修复：**#249（B2）** 在 skill 目录放置运行时依赖副本；**#250（方案 C，替代 B2 双份镜像）** 改为**单一来源 + 安装期派生**——git 只保留根 `docs/` 一份真源，`install-addons*.js` 安装时从根 docs 派生 skill 内 docs，新增 `scripts/lib/skill-doc-refs.js` / `derive-skill-docs.js` + `validate:skill-docs` 门禁（并入 preflight）+ 8 个回归测试，彻底消除双份漂移。

### Changed

- **版本号升级至 1.9.18** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.18，`validate-versions` 校验通过。

### Security

- **升级 fast-uri 至 4.1.3 修复 CVE-2026-75931 / CVE-2026-76172 / SSRF 漏洞** — MCP server 依赖存在 SSRF/拒绝服务风险，升级 `fast-uri` 至 4.1.3 予以修复。
- **升级 qs 至 6.16.0 修复 CVE-2026-82417 / CVE-2026-82562** — `qs` 存在原型污染 RCE 风险，升级至 6.16.0 予以修复。

### Docs

- **新增 WPS 宿主 TaskPane 视口 bug 踩坑文档（Issue #248）** — 记录 WPS 内置 Chromium 103 下 TaskPane 视口异常的问题与规避。
- **更新微信群二维码（Issue #251）**

## [1.9.17] - 2026-09-02

### Fixed

- **修复后端 serve 进程不稳定拉起（churn）（Issue #243，PR #244）** — 承接 Issue #164 日志分析发现的现象：launcher 在同一会话内反复探测出 4 个不同 opencode 二进制路径，每次切换都杀/重启 serve 进程，导致后端服务启动不稳定。根因与修复：①**R1 探测结果缓存稳定化**——`findOpenCodeBin()` 无缓存导致同一会话内探测结果在不同二进制间摇摆；新增模块级缓存，首次探测成功后缓存路径、后续直接复用，config 显式变更时失效重探，避免反复切换；②**R2 失败探测节流**——探测全部失败时缓存带 TTL（30s）的失败标记，避免高频反复执行阻塞探测；③附带修复默认 config 的 `opencodePath=opencode` 短路 bin 目录探测的问题（否则默认配置下永远探测不到 npm/bun 全局安装的真实二进制，依赖薄 PATH 而 ENOENT）。经 10 轮评审-修复循环清零，launcher 42/42 + taskpane-healthcheck 32/32 + 全部根单元测试通过，`validate-versions` 校验通过。

### Changed

- **版本号升级至 1.9.17** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.17，`validate-versions` 校验通过。

## [1.9.16] - 2026-08-28

### Fixed

- **分批校对防假校对/假进度补充治理（Issue #229，PR #238）** — 在 v1.9.15（PR #232/#233）治理基础上，实测（ses_fb8c）仍暴露的 2 个残留根因彻底整改：①**每批必须先调 proofreadBasic（P27）**——AI 对大量批次仅 getDocumentParagraphs 视觉扫描（不调 proofreadBasic 就跳过），直接 proofreadAccumulate 上报进度，现有规则无法拦截；新增 P27 在串行模式下 proofreadAccumulate 上报进度前，本批必须先调用 proofreadBasic，杜绝只视觉扫描+上报的假校对；②**批次连续推进禁止跳跃（P28）**——AI 从 200 跳到 600 或从 1400 跳到 5550 的跳跃式假进度仍可放行；新增 P28 进度必须逐批连续推进（跳变 ≤ 200 段/批），中间批次未校对直接拦截。经 10 轮评审-修复循环清零，governance-batch-fix 66/66、全量单测 515/515 通过。

### Changed

- **版本号升级至 1.9.16** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.16，`validate-versions` 校验通过。

## [1.9.15] - 2026-08-28

### Fixed

- **分批校对执行极不稳定问题追加整改（Issue #229，PR #232 / PR #233）** — 在 v1.9.14（PR #230）修复基础上，实测仍暴露的 2 个残留根因彻底整改：①**防假校对/假进度治理（PR #232，P25/P25b/P26 逐批强制）**——AI 跳跃式上报假进度、复用陈旧 issue 填充、只视觉扫描不真校对即可出报告；新增 P25 进度不超过本批实际返回末段、P25b 进度单调不回退、P26 issue 段落须在当前批实际返回窗口内，从代码层硬校验堵死"宣称校对到未实际获取段落"；②**超界请求误判截断死锁 + file_path 绕过截断保护（PR #233）**——文档实际段数少于请求批次时"重试补齐"与"直接校对"双双被拦死锁；以及 SKILL 推荐用 file_path 传参时绕过 R12-1 截断保护致段落静默漏检；修复为 totalParagraphs 提前提取 + 批次边界 clamp 到实际末段 + reachedDocEnd 不误判截断 + R12-1 截断拦截独立于 file_path 分支。两 PR 各经 10 轮评审-修复循环清零，分批稳定性测试扩至 39 用例，全量单测 488/488 通过。

### Changed

- **NPC Team 提示词强化「先验证后整改/先验证后报告」机制（Issue #234，PR #235）** — 在 NPC Team 提示词中显式贯彻「先验证后整改」原则，杜绝想当然拍方案/凭经验直接改代码：①铁律 16 新增第⑤点「整改前必须先验证方案可行性」（复现→定位根因→写测试验证假设→确认可行才改，验证失败回退方案）；②铁律 16 新增第⑥点「报告/判定问题前必须先求证」（先验证后报告，防垒屎山）；③5/12 开发改为验证先行五步（复现→定位根因→验证方案→整改→自测）；④4/12 方案设计必须含可行性预验证计划；⑤CR/QA 角色卡片及 6/12、7/12 阶段落实先验证后报告。经 10 轮评审-修复循环清零，validate:npc-team 双源一致性校验通过。

- **版本号升级至 1.9.15** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.15，`validate-versions` 校验通过。

## [1.9.14] - 2026-08-28

### Fixed

- **修复分批校对执行极不稳定问题（Issue #229，PR #230）** — 分批校对无法按批次从头到尾严格执行的 6 项根因全部修复：①批次中途失败死锁（新增同批重试放行，P2/P12/P18 规则联动）；②getDocumentParagraphs 输出截断致状态错乱（批次边界以请求 end_paragraph 为准）；③proofreadBasic JSON 解析失败致 P15/P16 失灵（proofreadHadIssues 三态化 null/false/true）；④会话状态作用域过宽（activeDocPath 文档切换自动重置 + LRU 淘汰）；⑤总段数「未知」解析失败（「共N段」兜底提取）；⑥parseParagraphRanges 正则误解析（style 非贪婪匹配）。经 16 轮评审-修复循环清零，25 条分批稳定性测试全通过。

### Changed

- **版本号升级至 1.9.14** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.14，`validate-versions` 校验通过。

## [1.9.13] - 2026-08-25

### Fixed

- **修复实际校对流程漏洞（Issue #223，PR #226）** — 基于实际校对会话排查出的 4 个 P0 级流程漏洞完成治理插件加固：P16 新增「findText 含截断标记即拦截」杜绝零修复；P23 新增「首次 proofreadAccumulate 强制 doc_info」+「空 issues 上报进度即拦截」堵死丢数据/进度造假；P24 新增「覆盖全文未生成报告禁止推进」强制收尾报告。配套 SKILL/docs 同步 + 11 条回归测试，经 10 轮评审-修复清零后合并。

### Changed

- **版本号升级至 1.9.13** — 根 package.json / package-lock.json / opencode-wps/ / opencode-wps-linux/ / wps-office-mcp/ 全量版本一致升级至 1.9.13，validate-versions 校验通过。

## [1.9.12] - 2026-08-25

### Changed

- **NPC_TEAM 阶段编号调整为 1/12~12/12（Issue #224，PR #225）** — 将流水线 12 阶段编号整体 +1：0/12 需求接收 → 1/12、…、11/12 复盘 → 12/12，修复原编号从 0 起步、到 11 结束永远看不到 12/12 的进度错觉。同步迁移 docs/NPC_TEAM.md（权威源）、.codebuddy/skills/npc-team/SKILL.md（双源一致）、scripts/validate-npc-team-prompt.js（阶段完整性校验 0..11→1..12）、scripts/lib/npc-team-triggers.js、tests/validate-npc-team-prompt.test.js（151 用例）及 README.md。（PR #225，merge commit `0cf72b3`）

- **版本号升级至 1.9.12** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.12，`validate-versions` 校验通过。

## [1.9.11] - 2026-08-25

### Fixed

- **Wiki 一级目录落地页补 `.md` 后缀（Issue #210）** — `collectEntries()` 生成的 4 个一级目录落地页路径从裸目录名（`使用指南`）改为带 `.md` 后缀（`使用指南.md`）。修复 v1.9.10 发布时 `tag_push` 下 4 个落地页 `HTTP 400 {"errcode":10402,"errmsg":" file format is not supported."}` 失败问题（其余 22 篇带 .md 文档已成功）。同步更新冲突检测与测试断言。（PR #221，merge commit `f793d89`）

### Changed

- **版本号升级至 1.9.11** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.11，`validate-versions` 校验通过。

## [1.9.10] - 2026-08-25

### Fixed

- **Wiki 上传恢复两步协议（Issue #210）** — `scripts/upload-wiki.js` 的 `uploadFile()` 从「直接 multipart 上传到 `/-/upload/wiki/file`」恢复为「两步协议」：① JSON 预上传 `{name, size, ext:{commit_sha}}` → 返回 `upload_url`；② multipart 上传到 `upload_url`。修复 v1.9.9 发布时 `tag_push` 下 26 篇 Wiki 全部 `HTTP 400 Invalid argument` 的问题（此前两步协议提交未合并到 main，导致基于 main 的发布上传失败）。补充 `BRANCH_SHA`（commit_sha）变量。（PR #219，merge commit `0083786`）

### Changed

- **版本号升级至 1.9.10** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.10，`validate-versions` 校验通过。

## [1.9.9] - 2026-08-25

### Added

- **Wiki 导航子项中文显示名（Issue #210）** — `scripts/upload-wiki.js` 新增 `WIKI_NAME_MAP` 映射表（源文件名 → Wiki 中文显示名），让 Wiki 左侧导航子项显示中文名称（如 `使用说明`、`安装指南`、`问题排查`、`功能特性`）替代英文文件名（`USAGE`、`INSTALLATION` 等）。新增 `wikiName()` 函数负责转换，未映射文件原样返回；`buildCategoryIndex` 索引页链接同步使用中文显示名。配套更新开发指南。（PR #216，merge commit `d63c895`）

### Changed

- **版本号升级至 1.9.9** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.9，`validate-versions` 校验通过。

## [1.9.8] - 2026-08-24

### Added

- **新增自建「研究员」NPC（Issue #16）** — 在 `.cnb/settings.yml` 的 `npc.roles:` 列表末尾追加第 7 个自建 NPC「研究员」（深度调研与资料检索专家），人设、核心能力、安全约束齐全；同时让其余 6 个角色（项目经理/产品经理/架构师/全栈开发/代码评审员/测试工程师）在团队协作表中各补 1 行 `@研究员` 协同认知，研究员 prompt 亦认识全部 6 个角色，实现双向协作互认闭环。`button.description` 一并纳入研究员。配套更新：`.cnb.yml` 注释「5 个 NPC 角色」→「7 个 NPC 角色」；`docs/NPC_TEAM.md` 副标题「六位专家」→「七位专家」、角色清单/研发流程覆盖图（调研前置）/对比表 6→7 全面对齐，历史实测记录注明发生在新增研究员之前。`validate:settings`（7 角色）、`validate:npc-team`（双源一致）通过。（PR #212，merge commit `492149f`）

### Changed

- **版本号升级至 1.9.8** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.8，`validate-versions` 校验通过。

> ℹ️ 说明：v1.9.7 已用于 Wiki 上传两步协议修复（Issue #210，见 Releases），本仓库 `main` 分支的 NPC 研究员变更使用下一个可用版本号 1.9.8。

## [1.9.6] - 2026-08-24

### Fixed

- **修复 Wiki 一级目录同名首子节点 404（Issue #210）** — CNB Wiki 导航会把每个一级目录本身渲染成「与一级目录同名」的可点击子节点，指向裸目录路径（`/-/wiki/使用指南`、`/-/wiki/开发指南`、`/-/wiki/平台专题`、`/-/wiki/内部参考`），但此前脚本只上传了带子路径的页面、没有裸路径落地页，导致点击报 `404 Not Found`。本次在 `scripts/upload-wiki.js` 新增 `CATEGORY_INDEX` 映射 + `buildCategoryIndex()` 索引页生成：对 4 个一级目录各追加一页裸路径落地页——「使用指南」「开发指南」复用同名 `docs/USAGE.md`、`docs/DEVELOPMENT_GUIDE.md`；「平台专题」「内部参考」自动生成分类索引页（汇总本目录全部文档链接）。落地页纳入上传清单，手动重传后四个一级目录点击即可正常打开、不再 404。（PR #211）

### Changed

- **版本号升级至 1.9.6** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.6，`validate-versions` 校验通过。

## [1.9.5] - 2026-08-23

### Fixed

- **方案 A：手动上传 docs/ 到 Wiki 修复链接 404（Issue #117/#204）** — 由于 codewiki 插件 LLM 生成存在平台侧缺陷（无法自动生成 Wiki），新增脚本 `scripts/upload-wiki.js`，在 `.cnb.yml` 的 `tag_push` 中尝试调用 CNB Wiki 上传 API（`POST /{repo}/-/upload/wiki/file`），把 `docs/`（已改写为 CNB blob 绝对链接）按 4 大分类（使用指南/开发指南/平台专题/内部参考）重新上传为 Wiki 页面。

### Note

- **方案 A 实测结论（2026-08-23）**：`upload/wiki/file` 为 CNB 内部未公开 API，在 CI（tag_push）环境下流水线临时令牌 `CNB_TOKEN` 无法认证上传——JSON body 返回 `401 errcode:16`（user not logged in），multipart 返回 `400 errcode:3`（Invalid argument）。`upload-wiki.js` 当前在 CI 中不会成功上传，需用户本人（OAuth 权限）通过网页手动上传修正后的 docs/ 覆盖旧版 Wiki，或等待平台修复 codewiki 插件 LLM 缺陷后自动生成。脚本保留作平台能力恢复后的自动尝试。

### Changed

- **版本号升级至 1.9.5** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.5，`validate-versions` 校验通过。

## [1.9.4] - 2026-08-23

### Fixed

- **修复 Wiki 挂载后内部链接 404（Issue #204）** — codewiki 生成 Wiki 时不重写仓库内相对链接，导致 `docs/` 与根 `README.md` 中 110+26 处相对路径链接在 Wiki 页面点击后 404。本次将全部内部相对链接改写为 CNB blob 绝对链接（`https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/xxx.md`，与知识库入库口径一致），新增脚本 `scripts/rewrite-wiki-links.js` 统一维护 + `npm run validate:wikilinks` CI 校验。新增 `docs/TROUBLESHOOTING.md`「十四、Wiki 已生成但内部链接点击 404」排查指引。重新打 tag 触发 codewiki 后 Wiki 内链接即可正常跳转。

### Changed

- **版本号升级至 1.9.4** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.4，`validate-versions` 校验通过。

## [1.9.1] - 2026-08-23

### Changed

- **codewiki 使用免费 deepseek-v4-flash 模型生成 Wiki（Issue #117）** — 平台侧 codewiki 插件默认 LLM 模型已切换为免费的 `deepseek-v4-flash`（不消耗 AI 积分），规避此前因平台 AI 积分用尽导致的 Wiki 生成失败。仓库 `.cnb.yml` codewiki 配置显式指定 `llm_model_name: deepseek-v4-flash`，重新打 tag 即可触发 Wiki 自动生成。

- **版本号升级至 1.9.1** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.1，`validate-versions` 校验通过。

## [1.9.0] - 2026-08-22

### Added

- **屎山清理（Issue #189，多 PR 推进）** — 系统清理项目历史债：
  - **PR-C handler-utils 单源化**：把 excel/ppt/word 三平台 handler 中**两平台逐字节相同**的 14 个纯工具函数（`getExcelSheet`/`colToLetter`/`resolveColumnLetter`/`colToNumber`/`resolveRowCol`/`resolveAlignment`/`toExcelColor`/`findNotesShape`/`findShape`/`getPPT`/`resolveSlideIndex`/`toRgb`/`getSelectionRange`/`toBgr`）抽到 `shared/wps-bridge/handler-utils.js` 单一来源，`sync-wps-bridge.js` 同步到平台目录，改一处四处生效。实测行为零变化（仅抽两平台逐字节相同的纯函数，不触碰行为差异部分）。

### Changed

- **屎山清理（Issue #189，多 PR 推进）**：
  - **PR-D CI 收敛**：`.cnb.yml` 手工罗列的几十行堆命令收敛为 `npm run preflight`（已聚合 validate 系列 + format:check + lint + test + test:e2e）+ 4 项必需额外检查（sync-npc-team-skill/sync-wps-bridge 漂移检测、bash -n 两个 wps-auto.sh、MCP lint + test:unit + test:integration）。lint-js.js 递归覆盖全部 .js、run-root-tests.js 聚合全部根测试，门禁无损。
  - **PR-E 双轨兜底清理**：移除 excel `setBorder` 的 `rangeAddress` 旧兼容参数（经全仓库 grep 核实**无任何上游调用方**，删除后仅认 `range` 参数）。其余"双轨兜底"（setCellFormat 顶层 numberFormat 等）经核实为 **MCP 公开 API 契约**（`format.ts` schema 显式声明 + gateway 测试保障），**不能删**，如实保留。

- **版本号升级至 1.9.0** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.9.0，`validate-versions` 校验通过。
## [1.8.4] - 2026-08-22

### Added

- **将 MCP `test:integration` 集成测试接入 CI Validate 阶段（PR #199，Issue #186）** — 落地 Issue #147 十四条质量红线「充分测试，测试覆盖要全面」，补齐 `wps-office-mcp` 集成测试从未在 CI 中执行的缺口：
  - `.cnb.yml` Validate 阶段 MCP 行：`cd wps-office-mcp && npm run lint && npm run test:unit && npm run test:integration`（与单测并列，保留 Issue #185 的 lint 接入，去除重复 npm ci）；
  - `docs/DEVELOPMENT_GUIDE.md` CI 门禁表 MCP 行同步为「单测 + 集成测试」；
  - 集成测试对 WPS COM / MCP SDK / logger 均 mock，**无需 WPS 运行，headless CI 可真实跑通**（3 suites / 46 tests 通过）。

### Changed

- **版本号升级至 1.8.4** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.8.4，`validate-versions` 校验通过。

## [1.8.3] - 2026-08-22

### Added

- **NPC_TEAM 需求覆盖度检查 + ⏸CP2.5 暂停点（PR #188，Issue #147 补充）** — 在 NPC_TEAM skill 流水线 6/12 测试通过后新增「需求覆盖度检查」子步骤（逐条核对需求 ↔ 开发落点 ↔ 测试覆盖矩阵，任一需求无落点或无测试覆盖即不通过），完成后经 ⏸CP2.5 需求覆盖确认暂停待用户确认；未覆盖全部需求不得进入文档：
  - `docs/NPC_TEAM.md` + `.codebuddy/skills/npc-team/SKILL.md`（双源）：流水线主链 + 工作流程新增需求覆盖度检查 + ⏸CP2.5 暂停点，暂停确认表/门禁表/冒烟方法 F/验证点表/QA 角色卡片同步补齐；
  - `scripts/validate-npc-team-prompt.js`：新增 5 道 prompt 级门禁（需求覆盖度检查/覆盖度矩阵/⏸CP2.5 暂停点/需求全覆盖语义/暂停卡模板）+ 文档级校验（暂停确认表/工作流程/门禁表/冒烟方法/验证点表）；
  - `tests/validate-npc-team-prompt.test.js`：新增多个负向回归用例（删需求覆盖度检查/删 ⏸CP2.5/删开发落点矩阵/删 QA 职责等均拦截），用例 140→149 通过；
  - `README.md`：接力模式说明补齐需求覆盖度检查 + ⏸CP2.5 暂停点。

- **补建 MCP ESLint 静态规则检查（PR #200，Issue #185）** — 消灭 `wps-office-mcp` 的「僵尸 lint 脚本」（`npm run lint` 声明但从未安装/运行），落地 Issue #147 质量红线「npm run lint 检查代码」：
  - `wps-office-mcp` devDependencies 新增 `eslint@^8.57.0`、`@typescript-eslint/parser@^8`、`@typescript-eslint/eslint-plugin@^8`；
  - 新增 `wps-office-mcp/.eslintrc.cjs`（ESLint 8 + `@typescript-eslint/recommended` 规则，适配项目 CJS 风格与 jest 测试文件）；
  - 根 `preflight` 与 `.cnb.yml` CI 增加 `cd wps-office-mcp && npm run lint`；
  - `npm run lint` 在 wps-office-mcp 内真实可运行（0 error，77 个 any warning 不阻塞退出码）。

### Changed

- **版本号升级至 1.8.3** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.8.3，`validate-versions` 校验通过。

## [1.8.2] - 2026-08-22

### Added

- **NPC_TEAM 7/12 文档阶段按当次需求/bug 整改同步修改完善项目相关文档（PR #190，Issue #147 补充）** — 7/12 文档阶段明确化：当次需求开发/bug 整改对应的实际改动，须同步修改完善项目相关文档，确保文档与当次改动一致、不流于空泛模板：
  - `docs/NPC_TEAM.md`：工作流程 7/12 文档阶段描述明确化（与 .codebuddy/skills/npc-team/SKILL.md 双源同步一致）；
  - `scripts/validate-npc-team-prompt.js`：新增 7/12 文档两层门禁（inline 流水线 + 工作流程行，防删减）；
  - `tests/validate-npc-team-prompt.test.js`：新增 2 个负向回归用例（删 inline / 删 workflow 均拦截），用例 140/140 通过。

### Changed

- **版本号升级至 1.8.2** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.8.2，`validate-versions` 校验通过。

## [1.8.1] - 2026-08-21

### Added

- **NPC 十四条质量红线固化（Issue #147 防垒屎山）** — 把"NPC 垒屎山"倾向的 14 条工程纪律固化到 NPC_TEAM skill 与工程脚本，三个原子化 PR 落地：
  - **工程脚本补齐（PR #182）**：根目录新增 `npm run test`（聚合根 JS 单测）/ `test:e2e`（e2e 单独跑）/ `lint`（全仓 JS 语法门禁 `node --check`）/ `preflight`（一键聚合 validate 系列 + format:check + lint + test + test:e2e）四个脚本，`.cnb.yml` CI 接入 `npm run preflight`，`docs/DEVELOPMENT_GUIDE.md` 同步命令说明。
  - **e2e 假测试修复（PR #183）**：`tests/e2e.test.js` 3 个 `assertTrue(true, '跳过实际 HTTP 请求')` 假断言改为真实本地 mock HTTP server 校验（校验真实请求/响应/状态码），移除空断言，e2e 接入 CI；`runTests` 校验 testCount=0 时 exit 1，防假装测试。
  - **NPC_TEAM 铁律 16-18 固化（PR #184）**：`docs/NPC_TEAM.md` + `.codebuddy/skills/npc-team/SKILL.md` 双源新增铁律 16（思维纪律：充分分析根因/方案求证/评审实事求是/逻辑清晰无矛盾兜底）、铁律 17（改动纪律：最小必要改动/原子化 PR/无关问题单独拆 issue/用户可见变更更新 /docs）、铁律 18（测试纪律：充分测试逐条真测/执行单测+集成测试/运行 preflight/lint/format）；`scripts/validate-npc-team-prompt.js` 新增门禁锚点；`tests/validate-npc-team-prompt.test.js` 新增 14 个负向回归用例（124→138）。

### Changed

- **版本号升级至 1.8.1** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.8.1，`validate-versions` 校验通过。

### Fixed

- **"暂未建立的测试"已单独拆 issue 完善**：MCP `lint`（eslint src/**/*.ts）僵尸脚本（#185）、MCP `test:integration` 未接入 CI（#186）分别单独开 issue 跟踪完善，符合"无关问题单独拆"纪律。

## [1.8.0] - 2026-08-21

### Changed

- **版本号升级至 1.8.0** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.8.0，`validate-versions` 校验通过。

### Fixed

- **校对防幻觉链路加固（Issue #179 真实校对实例分析落地）** — 针对真实校对会话（session_ffa8）暴露的问题逐项修复：
  - **单批进度增量上限 200 段（评审 R2-1）**：700→1600 跳号（增量 900）被服务端拒绝，封堵 Issue #179 原始假进度攻击路径（与 `getDocumentParagraphs` 单批上限一致）。
  - **进度超界校验串行/并行共用（评审 R2-2/R3-1）**：`_processed_to_paragraph` > 文档总段数一律拒绝（含并行模式），防谎报超大值瞬间覆盖全文。
  - **批次区间缺口时「全部已修复 ✅」不显示（评审 R2-3）**：与「批次区间未覆盖完整」告警口径统一，防自动批次被篡改出缺口后仍误报。
  - **saveSessionToDisk 批次表深拷贝（评审 R2-7）**：防浅引用污染磁盘缓存/内存会话。
  - **SKILL.md 同步六维评分与进度校验说明（评审 R3-4/R3-5）**：五维→六维、增量上限与超界校验说明补充。
  - **install-addons.js 保留用户 MCP env 配置（评审 R4-1）**：重建 MCP 条目不再清空用户自定义环境变量；`applyWriteRoots` 按平台规范化路径分隔符（评审 R4-2）。
  - **`P17` 拦截原生 `write` 伪造校对报告（漏洞封堵）**：此前 `P17` 只对 `wps_office_execute` 网关内 `tool_name=write` 生效，而 OpenCode 原生 `write` 工具在「非网关调用直接 return」闸门就被放行，AI 可用原生 `write` 绕过服务端真实累计数据手动拼造报告。现将原生 `write`/`writeFile`/`writeText`/`edit` 写「校对报告」路径的拦截**提升到前置闸门之前**，除非服务端已成功生成报告（`reportGenerated=true`）否则一律拦截（`governance.js`）。
  - **服务端校验串行进度单调递增（防假进度跳号）**：`proofreadAccumulate` 在**串行模式**（无 `_batch_id`）下校验 `_processed_to_paragraph` 必须严格递增（新值 > 已上报进度），重复上报/进度回退一律拒绝——堵住 AI 谎报进度（如 700→1600 跳过中间批次）假装覆盖全文的漏洞；并行模式（带 `_batch_id`）各执行 agent 区间独立，保持 `Math.max` 不误伤（`proofread-report.ts`）。
  - **区分「空批次表」与「全部完成」（防误报）**：报告「全部已修复 ✅」改为仅在服务端确认真实覆盖全文（`processedToParagraph >= totalParagraphs`）时显示；否则显示「⚠️ 覆盖状态未确认完整」，杜绝「空批次表 + 无进度」兜底放行时误报「全部完成」（`proofread-report.ts`）。
  - **主 agent 补充校对 skill 路由**：`wps-expert.md` 的 Skill 调用优先级新增 `wps-proofread`（文档校对专项），并补充校对路由与铁律指引——用户请求校对时须调用 `wps-proofread`，报告必须由 `generateProofreadReport` 生成、严禁 `write` 伪造、未覆盖全文不得声称全部已修复。
  - **路径写盘白名单配置暴露**：新增 `opencode-wps/config.js` 的 `allowedWriteRoots` 配置项，`install-addons.js` 将其写入 `opencode.json` 中 MCP server 的 `env.OPCODE_ALLOWED_ROOTS`，解决用户文档在其他盘符（如 F 盘）时报告写盘报「Path not allowed」的问题（PR #180 只解决权限授权，未解决路径白名单）。逻辑抽取到 `shared/permission-helper.js` 的 `applyWriteRoots`（可测试）。
  - **测试**：`governance-p17.test.ts` 新增原生 `write` 拦截/放行用例；`proofread-report.test.ts` 新增串行进度防回退、并行乱序兼容、空批次表不误报、覆盖全文正常显示用例；`install-permission.test.js` 新增 `applyWriteRoots` 5 用例（均接入 CI）。

### Added（Issue #179 方案全量补齐）

- **服务端自动分批（取代 planner subagent）**：`proofreadAccumulate` 会话首次初始化（且未携带 `_batch_allocations`）时，服务端按 `docInfo.totalParagraphs` 自动生成连续批次（每批 100 段）落盘（`proofread-store.ts` 新增 `generateAutoBatches`）——批次表从此**永远非空**，根除「空批次表 = 全部完成」的误判；单 agent 顺序校对不要求逐批置 done，按进度覆盖判定（`proofread-report.ts`）。
- **报告门禁三态区分（防「从未规划/从未跑」误报）**：`generateProofreadReport` 区分「编排模式（AI 手动登记批次，要求全部 done + 凭证完整 + 覆盖全文）/ 串行模式（按进度覆盖判定）/ 空白会话（无 issues、无疑似问题、无修订依据 → 直接拒绝生成）」，历史遗留串行会话（有运行痕迹但无进度）放行但报告标注「⚠️ 覆盖状态未确认完整」不误报「全部已修复 ✅」；`saveSessionToDisk` 合并批次表改为 clone 写入，避免内存 session 被磁盘旧批次表污染导致手动登记被覆盖（`proofread-store.ts`）。
- **路径白名单方案 B（报告与文档同目录可写）**：`generateProofreadReport` 写盘校验时把 `docInfo.filePath` 所在目录并入允许根目录（`buildReportAllowedRoots`），报告与文档同目录可写、不全局开放盘符；与方案 A（`allowedWriteRoots` → `OPCODE_ALLOWED_ROOTS`）互补（`proofread-report.ts`）。
- **放弃 4-subagent 编排（文案层）**：`skills/wps-proofread/SKILL.md` 删除 4-subagent 编排章节，改为「单 agent 顺序执行 + 服务端强制分批/进度/门禁」执行模型；`agents/wps-proofread-planner/manager/executor/reporter.md` 头部标注「⚠️ 已停用（Issue #179 阶段4）」仅作历史存档。
- **格式维度拆分（统计口径）**：`TYPE_METRIC_MAP` 把「异常空格/中英混排/数字空格/中文标点」等纯格式问题从 `consistency`（一致性）拆出独立 `format`（格式）维度（权重最低 0.05），避免大量空格/标点把「一致性」拖成 0 分失真；报告统计摘要新增「其中纯格式问题 N 处」归类展示（`proofread-report.ts`）。

## [1.7.0] - 2026-08-20

### Added

- **服务端权限自动放行（Issue #179 方案A，根治长任务外部目录读写卡授权）** — 在生成 `opencode.json` 时写入服务端 `permission`（`"*": "allow"` + `external_directory: { "**": "allow" }`），服务端直接放行所有工具及工作目录外的文件读写，权限请求不再下发，彻底根治长任务（如 F 盘文档校对）因 `external_directory` 授权卡住（曾出现 7.86 小时中断）的问题：
  - **`opencode-wps/config.js`**：`permission.mode` 新增服务端放行语义——`'auto'` 时 `install-addons.js` 注入服务端 `permission`；`'manual'` 时移除（走前端弹窗人工确认）。
  - **`install-addons.js`**：生成 opencode.json 时读取 `config.js` 的 `permission.mode`，按模式注入/移除服务端 `permission`；逻辑抽取到 `shared/permission-helper.js`（纯函数，可测试）。
  - **`.opencode/opencode.jsonc`**：模板新增默认 `permission`，`external_directory` 可按需收紧到具体盘符（如 `F:\\**`）。
  - **文档**：`docs/USAGE.md`、`docs/SECURITY.md` 更新服务端放行机制、关闭与收紧方法及安全权衡说明。
  - **测试**：新增 `tests/install-permission.test.js`（6 用例：auto 注入/保留、manual 删除/无副作用、未知 mode 回退 auto、模板与默认值一致），并接入 `.cnb.yml` 与 `.github/workflows/ci.yml`。
  - **评审修复（PR #180 第 1 轮）**：
    - 未知 `permission.mode` 不再静默回退到 `auto`（全放行），改为按 `manual` 保守处理并在 install 日志中明确警告（避免拼写错误时静默扩大权限面）。
    - `manual` 模式仅移除「由模板注入的默认全放行配置」，保留用户在 `opencode.json` 中自定义的精细 `permission`（不再误删自定义配置）。
    - `SECURITY.md` 补充说明：opencode 原生 `"*": "allow"` 放行的内置工具（bash/edit/write 等）不受 governance.js 拦截，提醒收紧范围。
    - 测试从 6 用例扩至 9 用例，覆盖未知 mode 保守回退、manual 保留自定义权限、auto 变体不静默全放行。
    - **评审修复（PR #180 第 2 轮）**：`SECURITY.md`、`USAGE.md` 补充「收紧 external_directory 需同时清理已有 `opencode.json` 旧 `**` 规则」的指引——因 `install-addons.js` 的深层合并会让旧 `**` 与新的收紧规则共存，收紧不彻底。
    - **评审修复（PR #180 第 3 轮）**：`install-addons.js` 第 4.5 步 `catch` 分支改为保守处理——`config.js` 无法读取时**移除模板注入的全放行 permission**（安全降级方向为“收紧”而非“放宽”，与未知 mode 保守 manual 原则一致）并明确警告；manual 模式日志改为“不写入”以更准确。
    - **评审修复（PR #180 第 4 轮）**：
      - `install-addons.js` 修复 falsy mode（空串/0/false）被静默当 auto 全放行的问题——改为读取 falsy mode 值并交由 `applyServicePermission` 保守按 manual 处理（与未知 mode 保守原则一致）。
      - `.opencode/opencode.jsonc`、`config.js` 注释同步更新，反映 manual 模式仅移除默认全放行、保留用户自定义精细 permission 的实际行为。
      - 测试增至 10 用例，新增 falsy mode 保守处理覆盖。
    - **评审修复（PR #180 第 5 轮）**：`applyServicePermission` 返回值新增 `removedDefault` 字段区分 manual 下「移除默认全放行」与「保留自定义」；install 日志据此更精确；测试用例改用 JSON 深比较提升健壮性（不再依赖引用保留）。
    - **评审修复（PR #180 第 6 轮）**：`isSamePermission` 改为基于键的递归深比较（对属性顺序不敏感），修复 JSON.stringify 顺序敏感误判；新增「属性顺序不同的默认全放行也应被移除」测试，测试增至 11 用例。
    - **评审修复（PR #180 第 7 轮）**：`install-addons.js` 第 4.5 步顶部注释同步更新，反映 manual 仅移除默认全放行、保留自定义的实际行为（与模板/config.js 注释一致）。
    - **评审修复（PR #180 第 8 轮）**：CHANGELOG 版本段归属调整——将本 PR 未发布功能从已发布的 `[1.6.6]` 段移入新增的 `[Unreleased]` 段，符合 Keep a Changelog 规范，避免已发布版本混入未发布内容。

## [1.6.6] - 2026-08-19

### Fixed

- **WPS 文字首次打开面板头部被遮挡、压扁顶部功能区的问题（Issue #164，PR #170）** — 基于千年一炭实机反馈的**新认知**做的最小聚焦修复：打开文档/切标签正常、仅点击「打开面板」后头部被遮挡，且**仅 WPS 文字（12.1.0.28022）出现，PPT/Excel 正常**。根因：WPS 文字宿主在 `tskpane.Visible = true` 时会**重新计算任务窗格窗口位置**，把顶边定位到标题栏正下方（覆盖「开始/插入」功能区），从而**覆盖掉先前设置的 `DockPosition = Right`**；PPT/Excel 不会在置可见时重算这个错误位置，所以它们正常。本次修复在**两处 `Visible=true` 之后各做一次二次校正** `setTaskPaneDockPosition(...)`，把被宿主覆盖的正确停靠纠正回来：
  - **`createTaskPane()`（首次创建路径）**：`Visible = true` **之后**再调用一次 `setTaskPaneDockPosition(tskpane)`，纠正被 WPS 文字宿主覆盖的正确停靠。
  - **`OnAction` GetTaskPane 找回路径**：`tp.Visible = !tp.Visible` 切到**可见**后同样二次校正 `setTaskPaneDockPosition(tp)`（仅可见时校正，隐藏时跳过）。
  - **干净基线、不垒屎山**：本 PR 基于干净基线开发，PR #166/#169 引入的所有错误修复（`scheduleFirstOpenLayoutCorrection`、`FIRST_OPEN_RELAYOUT_DELAY_MS`、`WPS_LAYOUT_CORRECTION_ENABLED`、`cancelFirstOpenLayoutCorrection` 及各竞态/降级/防重复逻辑，净删 849 行）已整体移除，`main.js` 恢复为仅保留基础右侧停靠健壮性代码，其上仅叠加上述两处最小二次校正。
  - **无副作用收敛方式**：修复发生在 `Visible=true` **之后**、与「WPS 文字置可见时覆盖 DockPosition」的宿主行为对齐，**不引入**任何 `Visible=false→true` 重排、定时器、降级开关、防重复标记；即使二次校正假设不成立也只是「无效但无害」，不会像 PR #166 那样每次点击主动触发遮挡。
  - 经验证：`tests/taskpane-dock.test.js` **22/22 全绿**（20 基线 + 新增 2 个二次校正用例，验证 `Visible=true` 之后 DockPosition 被再次校正的时序）；formatsenderror 7/7、healthcheck 32/32 全绿；`node --check` + prettier 通过；经独立评审（info×3 无 warning/error）+ CI success 后合并。

### Changed

- **版本号升级至 1.6.6** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.6，`validate-versions` 校验通过。

## [1.6.5] - 2026-08-19

### Fixed

- **launcher 非 shell 分支（.exe/.ps1）启动 opencode serve 不再抛 "stdio is invalid"（Issue #161 回归，PR #171）** — 修复「启动服务」返回 HTTP 400、opencode 进程起不来：当 opencode 二进制为 `.exe`（或走 `.ps1` 的 powershell 直启）时，非 shell 分支把 `fs.createWriteStream()` 创建的日志 WriteStream **直接作为 spawn 的 stdio**。根因：`createWriteStream()` 异步打开文件，若在 `'open'` 事件触发前就把流传给 `child_process.spawn()`，流的 `fd` 仍为 `null`，Node 抛 `The argument 'stdio' is invalid. Received WriteStream { fd: null, ... }`（与 .cmd 场景同源，但此前仅 shell 分支规避了）。本次修复：
  - **非 shell 分支改用 `['ignore','pipe','pipe']` + 手动转发**：与 shell 分支（.cmd）完全一致，`stdout`/`stderr` 通过 `data` 事件手动写入日志流，彻底消除 WriteStream 未 open 即作为 stdio 的竞态；日志落盘行为完全不变。
  - **测试同步**：`tests/launcher.test.js` 新增非 shell 向未 open 的 WriteStream 作为 stdio 必抛 "stdio is invalid" 的根因用例；pipe 转发提取为公共函数 `pipeChildOutputToLog`，两分支统一复用，源码断言从「保留 WriteStream 直连 stdio」反转为「统一用 pipe + `pipeChildOutputToLog` 手动转发」。

### Changed

- **版本号升级至 1.6.5** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.5，`validate-versions` 校验通过。

## [1.6.4] - 2026-08-19

### Fixed

- **修复侧边栏 ChatUI 首次打开头部被遮挡、且压扁 WPS 顶部标签（开始/插入等）的问题（Issue #164，PR #166）** — 根因：在最大化窗口下**首次创建**任务窗格时，WPS 宿主（12.1.0.28022）会把任务窗格 WebView 的可见区域定位到文档窗口错误的顶边 Y（约偏移一个功能区高度），导致 ChatUI 顶部（`topbar` + `session-header`）被挤出可视区、被功能区盖住。关键证据：用户实测「新建 WPS 标签窗口再切回」可恢复，证明宿主在窗口/标签切换时会重算任务窗格的窗口矩形（含顶边 Y）——这是唯一可靠的恢复路径。页面内部（`getBoundingClientRect`/`window.innerHeight`）只能看到 WebView 内部视口、测不到宿主偏移，故此前 #78 六轮「页面内检测 + 强制 reflow + 宿主重绘」全部无效（方向从根上就错了）。本次修复：
  - **在「首次创建」路径调度一次宿主重排校正（`scheduleFirstOpenLayoutCorrection`）**：延迟 1000ms（`FIRST_OPEN_RELAYOUT_DELAY_MS`，等 WebView 初始布局稳定）后，重新断言停靠位置为右侧、并短暂 `Visible=false → true` 强制宿主按正确几何重建任务窗格可见窗口——与「切换标签触发宿主重排」同源，精准补上首次打开缺失的那一次宿主重排。
  - **只做首次、只做一次**：首次创建时宿主按错误几何布局**必现**（用户确认），之后宿主已正确重排，重复隐藏→显示反而可能闪屏，故用 `firstOpenLayoutCorrectionScheduled` 标记防重复调度；延迟窗口内若用户已手动隐藏面板则跳过（`Visible` 读回校验，尊重用户操作）；停靠位置校正失败时不再做无意义重排；校正失败只留痕不中断（下次打开仍有重排机会）。
  - **降级开关 `WPS_LAYOUT_CORRECTION_ENABLED`（默认开启）**：若实机验证发现「Visible 切换等效切标签宿主重排」假设不成立，可将该常量改为 `false` 一键禁用校正（避免每次首开闪屏），无需改动逻辑；作为未来 WPS 升级或遮挡复发的逃生舱。
  - 经验证：`tests/taskpane-dock.test.js` 新增用例后 **32/32 全绿**，经 **11 轮评审-修复循环清零**（每步在 PR #166 留痕）+ CI success 后合并。

### Changed

- **版本号升级至 1.6.4** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.4，`validate-versions` 校验通过。

## [1.6.3] - 2026-08-18

### Fixed

- **launcher 启动 opencode serve 时不再追加 `--permission allow` 旗标（Issue #161 根因）** — 修复「启动服务」反复提示"启动失败，请检查 OpenCode 是否已安装"：用户 `opencode-serve.log` 铁证表明，老版本 opencode 的 `serve` 子命令**根本不识别 `--permission` 旗标**（其 help 选项列表只有 `--print-logs/--log-level/--pure/--port/--hostname/--mdns/--mdns-domain/--cors`）。此前 Issue #116 在 auto 模式（`autoAllowOnLaunch: true`）下无条件追加 `--permission allow`，导致 opencode 把未知旗标当错误 → 打印 usage/help → 以 **code=1** 退出 → 14096 端口永远不监听 → 侧边栏 30s 轮询超时 → 报「启动失败」。本次修复：
  - **删除启动路径里的 `--permission` 旗标**：`buildSpawnCommand` 不再向 `serve` 参数追加 `--permission allow`；同时删除 `shouldAutoAllowPermission()` 与不再被调用的 `loadWpsConfig()`（消除死代码）。
  - **删除 `autoAllowOnLaunch` 配置**：config.js 不再产出服务端旗标，只保留 `permission.mode`（`auto`/`manual`）驱动前端自动响应。
  - **拒绝「探测旗标支持」的错误方向（推翻 PR #167）**：不新增 `supportsPermissionFlag()`/`getPermissionArgs()`/`buildPermissionProbeCommand()` 等能力探针——探测一个本就不该依赖、且老版本不存在的旗标 = 徒增代码 + 新增故障点。
  - **权限自动放行完全交由前端通道**：`taskpane.html` 的 `handlePermissionRequest` 在 `config.permission.mode === 'auto'` 时直接 `respondPermission('allow')`（不弹窗），另有 `/tui/control/next` 长轮询兜底；`manual` 模式保留弹窗人工确认。
  - **测试与文档同步**：`tests/launcher.test.js` 权限用例反转断言——验证 launcher **不再**追加 `--permission`、config **不再**有 `autoAllowOnLaunch`；`docs/USAGE.md` 移除「服务端根治追加 `--permission`」的误导描述，改为说明前端 auto-allow + `/tui/control/next` 兜底机制。

### Changed

- **版本号升级至 1.6.3** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.3，`validate-versions` 校验通过。

## [1.6.2] - 2026-08-18

### Fixed

- **launcher 复用 `buildSpawnCommand`，`.ps1` 用 powershell.exe 绝对路径启动（Issue #134 回归，PR #159）** — 修复「启动服务」反复提示"启动失败，请检查 OpenCode 是否已安装"：当用户 opencode 为 `.ps1`（如 Trae 自带 node 生成的 `opencode.ps1`）时，上一轮 `findOpenCodeBin` 已能探测到 `.ps1`，但 `startOpenCode` 实际启动时**未复用 `buildSpawnCommand` 的 `.ps1 → powershell.exe` 转换**，误直接 `spawn` `.ps1` 文件（Node 无法执行无解释器关联的 `.ps1`）导致 `ENOENT`、进程起不来、14096 端口不监听。本次修复：
  - **`startOpenCode` 复用 `buildSpawnCommand`**：新增可选 `port` 参数，用其返回的 `command/args/needShell` 执行 spawn；`.ps1` 走 `powershell.exe` 绝对路径（`resolvePowerShellExe()`，按 `System32 → SysWOW64 → 裸命令` 逐级兜底，保证计划任务/VBS/服务等**无人值守场景** PATH 缺 PowerShell 目录也能启动）启动，非 shell 分支改 `hiddenSpawn(spawnCmd.command, args)`，不再直接 spawn opencodeBin。
  - **收敛重复分支**：`startOpenCode` 消除自行复制的 `isPs1/isExe/needShell` 分支，统一以 `buildSpawnCommand` 为单一来源；`.cmd`/无扩展名走 `cmd.exe /d /s /c` 包装且复用 `spawnCmd.command` 拼 shellCmd，消除漂移风险。
  - **日志可复现、错误可定位**：spawn 日志对含空格路径加引号（`quoteIfNeeded` 提升为模块级函数）；spawn error 追加实际 spawn 的 `command` 字段；`.ps1` 场景 powershell 退出时对 14096 端口做 `isPortListening` 复核并提示「服务可能仍在运行」。
  - **测试与文档同步**：`tests/launcher.test.js` 新增 `resolvePowerShellExe` 兜底探测 / `.ps1` 走 powershell 绝对路径 / `quoteIfNeeded` 引号 / needShell 分支复用 `spawnCmd.command` / getDiagInfo 预览前缀等专项用例，**38 项全过**；`docs/TROUBLESHOOTING.md` 补充 `.ps1` powershell 绝对路径启动与 spawn error `command` 字段说明。
  - 经 **10 轮评审-修复循环清零**（每步在 PR 留痕）+ QA 测试（38/38 + `security.test.js` 31/31 + 全部 CI 门禁通过）+ CI success 后合并。

### Changed

- **版本号升级至 1.6.2** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.2，`validate-versions` 校验通过。

## [1.6.1] - 2026-08-18

### Added

- **launcher 探测目录新增 bun 全局 bin（`BUN_INSTALL` 与 `~/.bun/bin`）（Issue #134，PR #160）** — 修复「点击启动服务没反应」：用户删除 `.trae-cn` 并用 `bun install -g opencode-ai` 全局安装 opencode（bin 生成于 `~/.bun/bin`）后，launcher 的 `getOpenCodeBinDirs()` 原先只探测 `.trae-cn` / npm / Program Files，**探测不到 bun 全局 bin**，回退到裸 `opencode` 依赖瘦 PATH 导致 spawn ENOENT、服务起不来。本次修复：
  - **新增 bun 全局 bin 探测**：`getOpenCodeBinDirs()` 支持 `BUN_INSTALL` 环境变量自定义安装位置（缺省 `~/.bun`），显式兜底 `~/.bun/bin`，去重逻辑保证无重复；`Program Files` / `Program Files (x86)` 由硬编码 `C:\` 改为读取 `process.env['ProgramFiles']` / `process.env['ProgramFiles(x86)']`（缺失回退硬编码），增强健壮性。
  - **不再探测已删除的 `.trae-cn`**：用户明确 `.trae-cn` 已删除且是历史问题根源，移除两条 `.trae-cn` 探测目录；在 `docs/TROUBLESHOOTING.md` 补充兼容性说明（如需兼容旧环境可自行在 `getOpenCodeBinDirs()` 末尾追加）。
  - **bun shim spawn 时注入 bun 运行时 PATH**：新增 `isBunShimPath()` 识别 bun 路径（用 `path.relative` 目录边界匹配，规避 `D:\bun` vs `D:\bunny` 前缀误判），命中 bun shim 的 `.exe` 分支时将该 bun bin 目录前置注入 `spawnEnv.PATH`，确保 shim 能解析到 bun 运行时。
  - **测试与文档同步**：`tests/launcher.test.js` 新增 bun 探测去重 / `BUN_INSTALL` 自定义与默认兜底 / `isBunShimPath` 边界与前缀不误判等用例，**33 项全过**；`docs/TROUBLESHOOTING.md` 自检指引与残留 `.trae-cn` 举例统一为 bun / npm 场景。
  - 经 **10 轮评审-修复循环清零**（每步在 PR 留痕）+ QA 测试（33 项全过、`isBunShimPath`/`getOpenCodeBinDirs`/bun PATH 注入边界验证通过）+ CI success 后合并。

### Changed

- **版本号升级至 1.6.1** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.1（顺带修复上一版漏改根 `package-lock.json` 的漂移），`validate-versions` 校验通过。

## [1.6.0] - 2026-08-18

### Added

- **代码质量重构：消除三平台 handler 重复 + 拆分 gateway 巨无霸（Issue #151 体检报告落地，PR #155）** — 针对仓库体检识别的「三平台 handler 大量复制粘贴 + `gateway/index.ts` 近 3000 行巨无霸」隐患，按「抽公共层 → 拆巨无霸 → 保持测试门禁」优先级重构，消除重复、降低维护成本、防止项目恶化为屎山：
  - **新增 `shared/wps-bridge/` 跨平台共享层（单一来源）**：`response.js` / `registry.js` / `common-core.js` 作为 Mac 与 Linux 反向轮询桥的公共逻辑唯一来源，解决历史上「改 bug 需在两平台各改一遍、极易漏改」问题。平台目录对应文件（`utils/response.js`、`handlers/registry.js`、`handlers/common-handler.js`）改为**生成产物**。
  - **新增 `scripts/sync-wps-bridge.js`**：将共享层同步到两个平台目录（生成平台化的 `common-handler.js`，按平台注入 `BRIDGE_PLATFORM` 标记）；`--check` 模式供 CI 漂移检测。
  - **平台差异隔离**：`common-handler.js` 共享化后，mac 独有 `ensureOutputDir`（saveAs/convertToPDF 前置校验输出目录）仅在 `BRIDGE_PLATFORM==='mac'` 启用；`setSelectedText` 缺 text 校验对齐 mac 安全语义（linux 此前静默清空，现统一拒绝缺参）。
  - **`gateway/index.ts` 数据表拆分**：将 `COM_ACTIONS`（~257 条，原内嵌近 2400 行）与类型定义（`VerificationStatus`/`ToolIndexItem`/`ToolParamSchema`）拆到独立 `com-actions.ts`，`index.ts` 从 2991 行瘦身至 ~580 行，专责 `searchTools`/`executeTool` 逻辑。
  - **测试与门禁**：新增 `tests/wps-bridge-shared.test.js`（10 用例：单源一致性 / 生成正确性 / 平台差异隔离 / 漂移检测 / gateway 拆分）；`.cnb.yml` 增加共享层 `--check` 漂移门禁 + 共享文件语法门禁。
  - 全量 **410+ 测试通过**（MCP 364 + 桥接共享层 10 + 既有 bridge/setcellformat/其他）+ `validate-versions`/`validate-toolcounts` 全绿，零回归。

### Changed

- **版本号升级至 1.6.0** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.6.0，`validate-versions` 校验通过。

## [1.5.9] - 2026-08-18

### Added

- **报告硬性完整性门禁 + 进度追踪 P22（Issue #151，PR #156）** — 彻底解决文档校对「假装完成 / 中途结束 / 匆忙生成报告」的遗留稳定性问题，根因修复为**服务端强制、非 opt-in**：
  - **`proofread-report.ts`**：`generateProofreadReport` 新增硬性完整性门禁——编排模式批次未完整 done / 覆盖有缺口 / 超界 / 重叠，或串行模式进度 `< totalParagraphs` 时，**直接返回 `success=false` 拒绝生成**（原先仅打软告警照样返回 success，AI 借此「假装完成 + 用 write 拼造假报告」）。
  - **`proofreadAccumulate` 强制进度追踪**：每次调用必报 `_processed_to_paragraph`，服务端在 session 记录 `progress.processedToParagraph`（取各批最大值，兼容并行），真实覆盖进度全程可核验，AI 无法跳过段落谎报完成。
  - **`governance.js` 新增 P22**：强制校验 `_processed_to_paragraph` 必填（规划初始化登记豁免），缺字段直接拦截，杜绝 AI 缺字段照常累加/出报告。
  - **文档/规则同步**：`skills/wps-proofread/SKILL.md`（P22 规则表 + 硬门禁说明）、`agents/wps-proofread-executor.md` / `wps-proofread-manager.md` / `wps-proofread-reporter.md`、`docs/PROOFREAD_SUBAGENTS.md` 同步更新。
  - **验证**：全量 416 测试通过（16 套件，含新增串行门禁 / 进度联动 / P22 用例）；TypeScript 编译 / prettier / `validate:toolcounts` / `validate:versions`(1.5.9) / `validate:npc-team` / `validate:settings` 全部通过；10 轮评审-修复清零 + CI success + mergeable 后经 ⏸CP3 用户确认合并。

### Changed

- **版本号升级至 1.5.9** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.5.9，`validate-versions` 校验通过。

## [1.5.8] - 2026-08-17

### Added

- **文档校对重构为「规划/管理/执行/报告」4 subagent 协同架构（Issue #151，PR #152）** — 将原单 agent 串行承担全部职责的文档校对流程，重构为 4 个 subagent 协同的稳定、准确、高效架构，解决六大执行不稳定问题（分批不稳 / 中途中断 / 上下文超限 / 统计不准 / 假装校对 / 耗时过长）：
  - **`agents/` 新增 4 个校对 subagent**：`wps-proofread-planner`（规划：一次性分批计划 + 生成唯一 session_id + 登记批次分配表）、`wps-proofread-manager`（管理：调度执行 agent 并行 ≤3 + 监督逐步落盘防幻觉 + 断点续跑）、`wps-proofread-executor`（执行：专职逐批按独立段落区间走完 `getDocumentParagraphs → proofreadBasic → confirmBatchAiProofread → replaceInParagraph → proofreadAccumulate` 全链条）、`wps-proofread-reporter`（报告：从磁盘 session 归并 + 五维评分保留 + 修订记录交叉校验 + 疑似缺失告警）。
  - **`skills/wps-proofread/SKILL.md`**：新增「校对 subagent 组编排」章节，规划 agent 自动编排调度（无插件 UI 分流，改动面最小）。
  - **`governance.js`**：新增 P19（批次归属/越界拦截）、P20（逐步凭证落盘防幻觉）、P21（并行区间重叠检测）。
  - **`proofread-store.ts`**：扩展批次分配表落盘 + 逐步执行凭证（stepsLog）持久化，支持断点续跑与每步审计。
  - **`proofread-report.ts`**：批次完整性校验（未完成批告警）+ issue 数 vs 修订数交叉校验（疑似缺失告警），统计准确优先。
  - **`docs/PROOFREAD_SUBAGENTS.md`**：新增架构说明文档；`docs/FEATURES.md` / `docs/USAGE.md` / `docs/SKILLS.md` 同步登记 4-subagent 组与 P19/P20/P21 规则。
  - **用户决策固化**：并行度 ≤3（WPS 单进程 COM 约束）；不保留单 agent 串行兜底（靠重派 + 断点续跑替代）；统计准确优先、保留五维评分并强化校验；规划 agent 自动编排；管理 agent 监督逐步落盘防幻觉。
  - 经 **24+ 轮评审-修复循环清零**（含追加 12 轮）+ QA 测试（410 用例全绿、并行稳定性 5 轮无回归）+ CI success 后合并。

### Changed

- **版本号升级至 1.5.8** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.5.8，`validate-versions` 校验通过。

## [1.5.7] - 2026-08-16

### Added

- **NPC_TEAM skill 6 改造点（Issue #76/#147，PR #148）** — 依据 Issue #76 提出的 6 个使用问题，对 `docs/NPC_TEAM.md` / `.codebuddy/skills/npc-team/SKILL.md` / `scripts/validate-npc-team-prompt.js` / `scripts/lib/npc-team-triggers.js` / `tests/validate-npc-team-prompt.test.js` 落地 6 项改造，并同步更新 `docs/README.md`：
  - **恢复 CP1/CP2 强制暂停点**（铁律 6 强化）：任何模式（接力/全程/自动连续）到 ⏸CP1/⏸CP2/⏸CP3 必须输出对应暂停卡停下等用户命令，不得静默跳过；配套校验门禁。
  - **每步独立调用 + 自动接续**（运行模式）：未设 ⏸CP 暂停点的步骤执行完输出接力卡后由系统按接力卡自动触发下一步，无需用户逐棒手动复制召唤话术；手动接力仍兜底可用。
  - **每步留痕粒度强化**（铁律 7）：评审棒/修复棒/复评棒每一步各自独立留痕，缺任一步即视为假装执行。
  - **新增🔬研究员 RES 第 7 角色**：角色卡片 7 张强校验；RES 介入 0/12、2/12、5/12、11/12 流水线；`description` 触发词补「研究员」。
  - **评审严格限定 PR 范围**（新增铁律 15）：CR 只评审 PR diff 新增/改动行，RES 定位只针对 PR diff 范围，不得泛化到无关模块。
  - **跑 N 轮 review-修复循环**（铁律 8 固化）：本次产物 PR 至少跑 10 轮评审-修复循环直至问题清零，有效下限 = max(10, 用户指定 N)，可核实验收。
- **RES 介入 5/12 研究员独立评审固化（Issue #147 补充，PR #148 commit a1bfeb1）** — 明确 RES 在 5/12 的四维独立评审职责（需求背景核实 / 方案可行性复核 / 根因定位 / 复现定位），评审结论须以「🔬 RES 研究员评审」独立留痕于 PR，缺任一项独立留痕即视为 RES 未介入（假介入）；配套 2 道校验门禁 + 2 个负向回归用例（validate-npc-team-prompt 用例 124/124）。
- **NPC Team 流水线模拟动画（Issue #147，commit 881e57f）** — 新增 `npc-team-pipeline-animation.html` 自包含 HTML/JS 动画，可视化演示 12 阶段 / 7 角色 / 3 暂停点 / 10 轮评审-修复循环自动连续执行，浏览器直接打开即可播放，用于核验流水线流程设计。

### Changed

- **版本号升级至 1.5.7** — 根 `package.json` / `package-lock.json` / `opencode-wps/`（package.json、config.js、manifest.xml）/ `opencode-wps-linux/`（package.json、manifest.xml）/ `wps-office-mcp/`（package.json、package-lock.json）版本一致升级至 1.5.7，`validate-versions` 校验通过。

## [1.5.6] - 2026-08-16

### Fixed

- **修复校对问题空白内容被误判缺字段（Issue #116 session_ff63，P0）** — `proofreadAccumulate` 原用 `trim()` 判断 `original`/`suggestion` 是否缺失，导致「异常空格 / 多余空格 / 全角空格」这类空白内容的合法校对问题（如 `original="  "`）被误判为缺字段而整批拒绝，第一批校对结果永久丢失。修复：不再 trim 判断，只拒绝「字段不存在」（undefined/null/非字符串）或「真正为空字符串」（`''`）；空白字符属合法校对发现，允许累加。疑似问题（suspected_issues）同步修复。新增 2 个回归测试（半角空格/全角空格）。
- **修复上下文用量条仍看不到（Issue #116 session_ff63，P1）** — SSE 事件（`session.status` / `message.updated`）取不到用量数据时静默跳过，用量条停在初始状态。修复：`extractCtxUsage` 返回 null 且从未获取过真实数据时调用 `ctxMeterNoData()` 诚实降级提示（`CTX_DATA_SEEN` 标记避免覆盖已展示的真实数据）。
- **修复超大型文档段落获取超时（Issue #116 session_ff63，P1）** — 9652 段超大型文档请求靠后批次时固定 60s 仍超时（WPS COM 需遍历前面所有段落定位）。修复：`getDocumentParagraphs` 按目标段落号分段动态放大超时（≤500段:60s / 301-3000段:90s / 3001-8000段:120s / >8000段:150s），Mac/Linux/Windows 三平台一致，并对字符串数字参数容错。新增 5 个测试（含边界值）。
- **强化全流程同一 session_id（Issue #116 session_ff63，P2/P3）** — SKILL 明确强调所有批次、所有 subagent 必须共用校对开始时生成的同一个 `session_id`，避免 subagent 各自累加产生多份矛盾报告；`generateProofreadReport` 缺 session_id 错误提示补充示例用法，引导 AI 传入正确必填参数。
- **新增工具权限自动确认（Issue #116 补充需求）** — 侧边栏看不到权限确认（serve web 能看到）导致长任务（如 97 批校对）卡住。修复（三保险）：① launcher 启动 `opencode serve` 时按配置追加 `--permission allow`（服务端源头放行）；② 前端 `handlePermissionRequest` 检测 config `permission.mode==='auto'` 时自动 `respondPermission('allow')` 不弹窗；③ 新增 `/tui/control/next` 长轮询兜底通道（serve web 走此通道），收到权限请求时 auto 自动允许。可配置：config.js 新增 `permission.mode`（`auto`/`manual`，默认 `auto`）+ `autoAllowOnLaunch`；governance.js 的 G1-G7 安全规则仍生效，不会被绕过。新增 launcher 权限自动确认测试。

## [1.5.5] - 2026-08-16

### Fixed

- **修复 codewiki 生成 Wiki 持续失败：移除已废弃的 llm_model_name 模型名（Issue #117，PR #145）** — 此前在 `.cnb.yml` 的 `tag_push → codewiki` 配置中写死了 `llm_model_name: 'hy3-preview'`，但该模型已在 CNB 平台下线，导致 codewiki 插件 LLM 接入始终返回空响应（`LLM响应中未找到有效的Action标签, LLM响应预览: (空)`），Wiki 生成一直 `status: error`。按官方反馈（cnb/feedback#4760「把这行去掉，已经没有这个模型了，建议不要写死模型名」）修复：移除 `llm_model_name: 'hy3-preview'` 一行，让 codewiki 插件走平台默认模型，并同步更新 `use_codebuddy` 注释。修复后重新打 tag `v1.5.5` 触发 Wiki 重新生成，核验仓库 Wiki 入口是否成功激活。

## [1.5.4] - 2026-08-16

### Fixed

- **修复点击「关闭服务」闪现 13 个黑色命令行窗口（Issue #143，PR #144）** — 点击 ChatUI 右上角「关闭服务」（黑色方块）时闪现 13 个黑窗。根因：`stopOpenCode()` → `stopOpenCodeByPort(14096)` 通过多个 `execSync` 子进程（`netstat` 查端口 → `powershell`/`wmic` 验证进程名 → `taskkill` 结束进程）停止服务，端口 14096 上同时存在主进程与多个 SSE 连接，逐 PID 验证+kill 未设 `windowsHide` 时弹出可见控制台窗口。修复：① 抽离 `hiddenExecSync()` 帮助函数统一强制 `windowsHide:true`（`CREATE_NO_WINDOW`）；② 全部 9+ 处 `execSync` 子进程调用统一走它，并为各调用点显式加 `windowsHide:true` 双保险。测试：`opencode-wps/tests/launcher.test.js` 新增「所有 execSync 均显式 windowsHide:true」+ 兜底计数（execSync 数 ≤ windowsHide 数），17/17 通过。

- **修复点击「启动服务」闪现 1 次黑窗（Issue #143 跟进，PR #144）** — 用户反馈点击启动服务也会闪 1 次黑色命令行窗口（与关闭服务闪 13 次同类问题）。根因：`startOpenCode()` 的 `spawn` 在 `needShell=true`（npm 全局安装的 `opencode.cmd` shim / 无扩展名 PATH shim）时依赖 Node `shell:true`，`windowsHide` 仅间接传给外层 `cmd.exe`，无法彻底覆盖 `.cmd` 批处理为脚本启动的嵌套控制台进程。修复：① 新增 `hiddenSpawn()` 帮助函数统一强制 `windowsHide:true`（与 `hiddenExecSync` 同风格）；② `.cmd` shim 分支改为**显式 `cmd.exe /d /s /c` 包装**（`shell:false` + `windowsHide:true` + `windowsVerbatimArguments:true`），让 `CREATE_NO_WINDOW` 直接作用于 cmd.exe 进程树；③ `.exe`/`.ps1` 直启分支统一走 `hiddenSpawn`。测试：`opencode-wps/tests/launcher.test.js` 新增「spawn 统一经 hiddenSpawn 强制 windowsHide」专项，22/22 通过；`tests/launcher.test.js` 30/30 通过。

## [1.5.3] - 2026-08-15

### Fixed

- **opencode 运行中但 UI 状态误显「已停止」（Issue #114 跟进）** — 用户反馈 opencode 实际运行中，WPS 插件顶部状态栏仍显示「已停止」。根因：插件状态判定过度依赖两个信号源——`/global/health`（14096 直连，在 WPS Chromium 下可能因 CORS 差异持续失败，Issue #114 已确认）与 launcher `/status`（14097）。当 **launcher 未运行** 时，`probeLauncherRunning()` 交叉验证失效，前端失去所有兜底信号，即使 opencode 进程在跑（14096 端口监听）也误显「已停止」，且健康检查（每 10s 探测 /global/health）持续失败无法自动恢复。本轮修复引入 **SSE（EventSource）作为第三信号源**（EventSource 不受 XHR CORS 差异影响）：① `probeLauncherRunning()` 新增 `launcherReachable` 回调参数，区分「launcher 可达但服务停止」与「launcher 不可达」；② 健康检查失败分支：当 launcher 不可达时主动 `connectSSE()` 探测——SSE onopen 成功即证明服务在跑并恢复「运行中」+ 切回 chat；③ `init()` 首屏 launcher 未运行分支同样触发 SSE 探测；④ `SSE.onopen` 在 setup 探测场景下补建会话（避免进入 chat 后 SESSION_ID 为空无法聊天）；⑤ 服务真停时 SSE onerror 且不自动重连（SESSION_ID 为空），不会误报也不会连接风暴。测试：`taskpane-healthcheck` 新增 4 用例共 23/23 通过。
- **评审加固（Issue #114 跟进，PR #141 多轮评审）**：依据 PR #141 的 5 轮独立 review-修复循环进一步完善——① `SSE.onopen` 补建会话时不再回调 `connectSSE()`（`connectSSE()` 开头会 close 刚建立成功的这条 SSE 再重连，造成不必要连接拆除/重建），仅建会话、保留当前已建立 SSE 继续接收消息；② 健康检查失败分支的探测性 `connectSSE()` 增加冷却守卫（`sseProbeAllowed()`，**30s 冷却窗口**，大于健康检查周期 10s 才能真正限流）——服务真停 + launcher 不可达时，最多每 30s 创建一次注定失败的 EventSource，收敛无谓周期性失败连接；③ 探测性连接失败不自动重连（`SSE_IS_PROBE` 标记）——避免绕过冷却守卫向已停止服务反复建连；④ `SSE.onopen` 探测恢复路径补齐模型/智能体下拉框（与 `onServerConnected()` 完整恢复行为一致）；⑤ **状态粘性防振荡**——SSE 已连接时信任该最强信号，不以 `/global/health` 失败拆除运行中状态（消除每 10s 的 chat↔setup 闪烁），`SSE.onerror` 断开后仍可正常降级。测试：`taskpane-healthcheck` 新增 10 用例，共 **32/32 通过**。

## [1.5.2] - 2026-08-14

### Fixed

- **修复 opencode 服务运行中但 UI 状态误显「已停止」（Issue #114 回归，PR #132）** — 用户反馈 opencode 实际运行中，WPS 插件顶部状态栏却显示「已停止」。根因：插件对服务状态的判定**单一依赖 `/global/health`** 健康检查，一旦瞬时误触失败（网络抖动 / CORS proxy 抖动 / launcher 重启间隙 / SSE 连接被 close），状态即误判为「已停止」且难以自动恢复。本轮将状态判定改为**多源交叉验证**：① `launcher.js` `/status` 端口回退——`running` 不再只依赖 `opencodeProcess` 引用，引用丢失时回退探测 14096 端口监听，并暴露 `portOpen` 字段供前端交叉验证；② `taskpane.html` 新增 `probeLauncherRunning()` 多源兜底——`/global/health` 失败但 launcher 确认服务在跑则恢复「运行中」并重建 SSE（覆盖「SSE 被 close 后无法自动恢复」的核心场景）；③ `SSE.onopen` 状态联动——连接成功同步恢复「运行中」并切回 chat；④ `init()` 首屏 launcher 回退 + `enterChat()` 去重。测试：`taskpane-healthcheck` 19/19、`launcher` 15/15、全量 10 套件通过。评审 10 轮 review-修复循环清零。

## [1.5.1] - 2026-08-14

### Fixed

- **修复 codewiki 生成 Wiki 失败：切换 CNB AI 接入点（Issue #117，PR #129）** — codewiki 插件默认 `use_codebuddy: 1`（CodeBuddy 接入点）在本环境调用 LLM 返回空响应，导致仓库结构分析失败（`analyze_repository_structure_agent: agent.run() 返回空内容` / `generate catalogue error: agent returned empty catalogue items`），Wiki 始终无法生成。按 codewiki 插件 README 示例在 `.cnb.yml` 的 `tag_push → codewiki` stage 增加 `use_codebuddy: 0`（切换 CNB AI 接入点）+ `llm_model_name: 'hy3-preview'`（混元免费模型，区别于 NPC 任务注释里的 hy3，此处为 codewiki 插件模型的合法命名）。本版本合并 PR #129 并打 tag `v1.5.1` 触发 codewiki 重新生成 Wiki，验证 Wiki 能否成功生成并激活仓库导航栏入口。Wiki 入口：https://cnb.cool/lnxsun/opencode-wps/-/wikis

## [1.5.0] - 2026-08-14

### Fixed

- **聊天报错 `UnknownError` 可排查（Issue #114 跟进，PR #126）** — 用户在聊天发送消息时偶发 `Error: {"name":"UnknownError","ref":"err_xxx"}`，此为 **OpenCode 服务端**（`opencode serve`）生成回复时的内部错误（常见于模型 API key 失效/限流、模型不存在、provider 配置错误、文档上下文过大），非插件 bug。本轮改进：① `opencode-wps/launcher.js` 将 opencode serve 的 `stdio: 'ignore'` 改为**日志落盘**到 `~/.opencode/logs/opencode-serve.log`（追加模式），服务端 stdout/stderr 不再被丢弃，用户可搜索 `err_xxx` 定位真实根因；② `opencode-wps/taskpane.html` 新增 `formatSendError()`，发送消息出错时若识别到 `UnknownError`，给出含日志路径与常见原因的**可操作排查引导**（不再裸显示 JSON）；③ `docs/TROUBLESHOOTING.md` 新增「UnknownError 排查」章节。测试：`taskpane-healthcheck` 14/14、`taskpane-formatsenderror` 7/7、`launcher` 14/14、`taskpane` 内联脚本语法全部通过。
  **评审修复（PR #126 第 1~10 轮）**：① 日志写流 `logStream` 提升为模块级变量并新增 `closeOpenCodeLogStream()`，在 `stopOpenCode()` 与子进程 `exit`/`error` 时统一关闭释放（仅 `end()` 先 flush 再关 fd，避免 destroy 丢数据），修复资源泄漏与末尾日志丢失；② 新增简单日志轮转（单文件超 5MB 先删旧 `.old` 再重命名，规避 Windows rename 目标已存在报错）；③ `formatSendError()` 日志路径提示改为「按实际用户目录定位」，不再硬编码 C 盘路径；④ `TROUBLESHOOTING.md` 同步补充日志路径与轮转清理说明；⑤ 新增 `tests/taskpane-formatsenderror.test.js`（7 用例）并接入 CI 门禁，覆盖 UnknownError/普通错误/空响应/网络错误/null-undefined 兜底等场景。

## [1.4.0] - 2026-08-14

### Added

- **校对数据服务端落盘持久化 + 必填字段校验 + 疑似问题机制（Issue #116，PR #124）** — 根治校对流程数据易失的核心问题：① 新增 `proofread-store.ts` 落盘存储模块，`proofreadAccumulate` 每次累加后增量写盘到 `~/.opencode-wps/proofread-sessions/{sessionId}.json`，报告生成优先读内存、缺失时从磁盘恢复（`getSessionOrLoad`），`releaseSession`/LRU 淘汰同步删除磁盘文件，存储目录 `0o700` 权限收敛——即使会话压缩（Compaction）或 MCP 服务重启，已累加校对问题不丢失、报告可完整生成；② `proofreadAccumulate` 入口对缺 `original`/`suggestion` 的 issue 明确报错，替代此前静默通过、到报告生成阶段 `.replace()` 读 `undefined` 崩溃的隐患；③ 报告生成器 `.replace()` 处统一 `(issue.original || '')` 兜底，历史坏数据漏过校验也不崩溃；④ 新增 `suspected_issues` 参数（AI 识别但未确认的问题），报告单独列出「⚠️ 待确认问题」节并标注「未修改，请人工核对」，不纳入五维评分，即使 issues 为空也列出该节。评审 10 轮 review-修复循环清零（含必填校验原子性、空 issues+疑似问题不丢失、权限收敛等）。

- **侧边栏权限确认 UI + 上下文用量条 + 等待审批状态（Issue #116，PR #120）** — 补齐侧边栏交互三个关键能力：① **权限确认模态框**：监听权限请求事件，弹出「工具调用权限确认」框（展示工具名/参数/说明），支持**允许 / 拒绝 / 记住选择**，通过 `POST /session/:id/permissions/:permissionID` 响应——解决此前「生成报告卡住」只能切 web 会话确认的问题；② **上下文用量条**：底部 3px 进度条随 SSE 实时更新，hover 显示详细 token 数，<70% 绿 / ≥70% 橙 / ≥90% 红，提示用户预判会话压缩；③ **等待审批状态**：`session.status` 新增 `waiting` 中间态，状态点橙色闪烁 + 底栏高亮提示「等待你确认工具调用」，与正常 busy 状态区分，避免用户误以为死循环。评审 5 轮 review-修复循环清零（含 props.id 提取优先级、SSE 断开状态清理、并发权限请求覆盖、会话切换状态清理等）。

- **MCP 超时放大 + 校对批次建议 + TC-12 口径说明（Issue #116，PR #121）** — 性能与数据口径优化：① `getDocumentParagraphs` 超时 30s→60s、`getDocumentTextByRange` 15s→30s，减少大批量段落获取在 WPS COM 处理慢时的超时重试；② SKILL 推荐每批 100 段（此前默认 200），避免单次返回文本超过 MCP 输出限制被截断导致漏检；③ TC-12 口径明确：报告「发现问题 = issue 条数」「修订数 ÷ 2 仅修订模式等价」，修正此前口径混乱。评审 5 轮 review-修复循环清零（含 SKILL 批次计算示例、版本引用一致性）。

## [1.3.1] - 2026-08-14

### Fixed

- **修复 codewiki 配置以正确激活 Wiki 入口（Issue #117，PR #127）** — 仓库首页 `showWiki=false`、Wiki 导航入口不显示、`/-/wikis` 报 404 的根因：codewiki 插件配置结构与插件 README 推荐模式不一致——旧配置把 `image` 放在任务级 `docker.image`、`git_doc_dir` 指向容器内 `/data/codewiki/${CNB_REPO_SLUG}` 路径且未声明 Docker 数据卷，插件生成的内容写入容器内部，流水线结束后即丢失，平台无法读取。按 codewiki 插件 README **Pattern 1（推荐模式）** 调整 `.cnb.yml`：① `image: cnbcool/codewiki:latest` 移至 `stages[].image`（阶段级）；② `git_doc_dir` 改为工作区路径 `/${CNB_BUILD_WORKSPACE}/${CNB_REPO_SLUG}/codewiki`，生成内容可被平台持久化读取；③ 保留 `knowledge_enabled: true`（Wiki 自动入库仓库知识库）。合并后打 `v1.3.1` tag 触发 `tag_push` → codewiki 重新生成 Wiki 并激活入口。Wiki 入口：https://cnb.cool/lnxsun/opencode-wps/-/wikis

## [1.3.0] - 2026-08-14

### Added

- **NPC_TEAM 评审-修复循环改为自动连续执行 + 每步留痕（Issue #76，PR #123）** — 按用户反馈"5 轮独立的 PR review 与修复循环还是不能自动进行、中间还是会暂停"并澄清"是每步在 PR 留痕，而不是每轮"，将提示词 5/12 评审-修复循环由「逐轮接力（每轮评审/修复/复评各为独立一次 @CodeBuddy 召唤，禁止一次召唤内连跑多轮）」改为**接力模式下自动连续执行**：用户要求跑 N 轮时，同一次召唤内自动连续跑完「评审棒 → 修复棒 → 复评棒 → 下一轮…」直至达成 N 轮且问题清零，**中途不暂停、无需逐棒手动召唤**；但**每一步（评审/修复/复评）都必须在 PR 分别回复留痕（留痕以「每步」为粒度而非「每轮」）**，每步留痕必须真实可核实，否则视为假装执行。配套：① 提示词铁律 8 / CR 角色卡片 / 流水线 5/12 / 工作流程 / 门禁表 / 冒烟测试方法 C 全部同步（评审-修复接力卡 → 评审-修复循环留痕卡，含评审/修复/复评留痕块 + 本步留痕位置字段）；② `scripts/validate-npc-team-prompt.js` 第 10b 节重写为「自动连续执行 + 每步留痕」强校验；③ `tests/validate-npc-team-prompt.test.js` 评审-修复接力相关用例重写为自动连续语义（115 用例全绿）；④ `.codebuddy/skills/npc-team/SKILL.md` frontmatter description + 正文双源同步。**评审修复汇总（PR #123 第 1~10 轮）**：① 铁律 11 补「评审-修复循环自动连续执行例外」声明；② 运行模式「接力模式」描述同步补评审-修复循环例外；③ description 补「自动继续/自动连续执行」触发词；④ 运行模式段内评审-修复例外强校验 + 锚点缺失提示；⑤R6 新增【评审-修复循环汇总卡】卡名强校验 + 负向用例；⑥R7 澄清用户要求 N 轮与「至少 10 轮」下限优先级——铁律 8 补「下限优先：若 N<10 按至少 10 轮执行」，复评留痕改「有效下限 = max(10, 用户要求 N)」；⑦R8 冒烟测试验证表「接力只执行一步」行补评审-修复自动连续例外；⑧R9 方法 C 已清零分支改「有效下限轮次 max(10, 用户要求 N)」；⑨R10 CHANGELOG 用例数同步 115。

## [1.2.0] - 2026-08-14

### Added

- **生成项目 Wiki（Issue #117，PR #118）** — 结合本项目代码库及库中现有文档（`docs/`），在 CNB 平台用 **Code Wiki（codewiki 插件）** 机制生成项目 Wiki：`.cnb.yml` 新增 `tag_push` → `codewiki` 插件 stage（`git_doc_dir: /data/codewiki/${CNB_REPO_SLUG}` 必填 + `knowledge_enabled: true` 自动入库仓库知识库，可被 AI 问答引用），打 tag 即自动读取仓库代码与现有文档生成 Wiki，仓库首页出现 Wiki 入口。同时围绕 **开发 / 使用双主线** 将文档补充至 Wiki 级详细度：`docs/USAGE.md`（Wiki 级使用手册：快速上手/三平台打开面板/完整对话操作/WPS 专用 Agents/常用文档操作场景/OpenCode 服务管理/配置参考/最佳实践）、`docs/DEVELOPMENT_GUIDE.md`（Wiki 级开发手册：环境/项目结构/五大模块开发/MCP 三层工具体系/开发流程/规范/测试/CI/CD/二次开发）、`docs/SKILLS.md`（内置工具清单/两级网关调用规范/各 Skill 能力/开发规范）；`docs/README.md` 更新四象限索引。评审 15 轮 review-修复循环清零 + QA 测试通过（锚点缺陷修复复验）。Wiki 入口：https://cnb.cool/lnxsun/opencode-wps/-/wikis

### Fixed

- **修复 opencode 服务运行中但状态栏误显"已停止"**（Issue #114）— 根因：健康检查"一次失败即永久放弃"的单向设计——`showSetup()` 与 `stopHealthCheck()` 强耦合，一旦进入 setup 视图健康检测永久关闭，且 setup 视图无任何自动恢复探测；瞬时网络抖动/CORS proxy 抖动/launcher 重启间隙一次误触即可导致即使服务始终健康，UI 也永远显示"已停止"。修复（`opencode-wps/taskpane.html`）：① `showSetup()` 移除 `stopHealthCheck()`，健康检测与视图切换解耦，改为**全局常驻**；② 新增 `IN_SETUP_VIEW` 标记，setup 下检测到服务恢复自动 `onServerConnected()` 切回 chat；③ `startHealthCheck()` 失败仅切视图不停止检测，成功且 setup 未连接时自动恢复；④ `init()` 初始失败路径补启动健康检测；⑤ 显式停止（`STOPPING` 标记）不再被全局健康检查自动重连，并清理手动启动轮询（`START_POLL_TIMER`）；⑥ 健康检查防重入（`HEALTH_CHECK_IN_FLIGHT`）避免请求风暴，仅状态变化时更新。新增 `tests/taskpane-healthcheck.test.js`（14 用例，AC1-AC5 + 历轮评审修复回归）并接入 CI。评审-修复 9 轮循环清零。

### Added

- **NPC_TEAM 流水线扩展：PR 合并（合并前暂停待确认）+ 发布四要素（Issue #76，CR 第 11~28 轮追加循环）** — …；**CR 第 28 轮修复：按用户明确要求「不要简单可缩裁剪，至少 10 轮保留」，全面删除「简单可缩」豁免（反转 CR 24 收紧方向）——① 铁律 8 移除「简单改动走最小路径时 review 轮数可相应缩减」句，改为「评审轮数不得以简单为由缩减，不得以简单可缩为名跳轮偷懒」；三张接力卡「已累计轮次」行移除「简单改动按铁律 8 可缩」、复评卡已清零分支与方法 C 移除「（简单改动可缩）」后缀，「至少 10 轮」成为无条件硬性下限（任何情况下都不得以简单为名缩减轮数）；② validate 强校验同步收紧：RULE8_CORE 改为校验「评审轮数不得以简单为由缩减」+「不得以简单可缩为名跳轮偷懒」完整句式（顺序校验同步）、RELAY_REREVIEW_CORE 已累计轮次/已清零分支改无条件完整句精确匹配（不再容忍简单可缩后缀）、评审/修复卡已累计轮次校验同步收紧、方法 C 校验移除简单可缩后缀容忍（保留 CR 25/26/27 新增的独立召唤/停棒/合并确认强校验）；③ 测试同步：删铁律 8 防钻空子用例改为删「禁止以简单为由缩减轮数」句负向用例、插入干扰句用例同步、CR 24 新增的 3 个「删豁免后缀应拦截」负向用例反转为「加回简单可缩后缀应拦截」，117 用例全绿；实测 6 类「简单可缩」复活攻击（删禁止缩减句/已清零分支加回/已累计轮次行加回/流水线加回/删跳轮偷懒句/方法 C 加回）均 exit 1 拦截。**；**CR 第 24 轮修复（本轮 5 轮循环 R1）：① 收紧「简单可缩」豁免后缀校验——第 23 轮放宽为前缀匹配/通配窗口后，豁免后缀可被篡改为「可减至 1 轮」等破坏性文本（实测 exit 0 漏检）；RELAY_REREVIEW_CORE 改完整句匹配（含精确豁免后缀）、三卡已累计轮次加豁免后缀存在性双重校验、方法 C 移除通配窗口改枚举校验，篡改/删后缀/数字削弱（10→3）现均拦截；② 新增 3 个负向回归用例（110→113）。**；**CR 第 23 轮修复（追加 12 轮循环 R4）：① 修复「简单可缩」裁剪与「至少 10 轮」下限的矛盾——铁律 8 明确「简单改动走最小路径时 review 轮数可相应缩减」，但第 21/22 轮把「至少 10 轮」无条件同步进三张接力卡已累计轮次行与复评卡已清零分支后，卡片无条件要求 10 轮、无简单可缩豁免，简单改动会被迫空跑到 10 轮；在三卡「已累计轮次」行补「简单改动按铁律 8 可缩」、复评卡已清零分支补「（简单改动可缩）」、方法 C 已清零分支同步补注；② validate 强校验同步放宽为允许简单可缩后缀（RELAY_REREVIEW_CORE 已累计轮次/已清零分支改用前缀匹配、评审/修复卡已累计轮次校验改正则、方法 C 校验嵌套括号容忍），消除「简单可缩」被校验堵死的语义冲突；配套更新 docs 静态校验描述。**；**CR 第 22 轮修复（追加 12 轮循环 R3）：① CHANGELOG 顶部条目标题「CR 第 11~~19 轮追加循环」更新为「第 11~~21 轮」与条目内实际轮次一致；② docs 静态校验描述补「复评卡已清零分支『至少 10 轮』下限 + 方法 C 已清零语义强校验」（第 21 轮新增校验能力未在文档同步）；③ 评审/修复接力卡「已累计轮次」行补「清零且已达至少 10 轮则进下一阶段」，与复评卡口径一致（此前三卡不一致，前两棒缺循环结束条件提示）；配套 validate 新增评审/修复卡已累计轮次 10 轮下限段内强校验 + 复评卡字段改段内定位（RELAY_REREVIEW_CORE，消除第 21 轮同步后全局 indexOf 误报）+ 删复评卡已累计轮次用例改段内真拦截（修复双源假阳性），新增 1 负向回归用例（109→110）。**；**CR 第 21 轮修复（追加 12 轮循环 R2）：① 复评接力卡「已清零」分支重申「至少 10 轮」下限——此前仅「已累计轮次」行有「清零且已达至少 10 轮」约束，已清零分支直接写「已清零 → 转 6/12 测试」，按字面执行时 CodeBuddy 第 1 轮清零即可能放行，与门禁表「至少 10 轮 review-修复循环至清零才进下一阶段」矛盾；改为「已清零（**且已达至少 10 轮**，转 6/12 测试，独立召唤）」；② 冒烟测试方法 C 已清零分支同步补「（且已达至少 10 轮）」，validate 9.7 ⑥ 新增「至少 10 轮」关键词强校验（防改成「已清零即可进 6/12」不拦截）；③ validate 10b 节注释残留旧口径「5/10 评审-修复循环」修正为 5/12。配套新增 2 负向回归用例（107→109）。**；**CR 第 20 轮修复（追加 12 轮循环 R1）：① 修复 `tests/validate-npc-team-prompt.test.js` `runValidateCaptureFull` 的 SKILL.md 还原失效——sync 脚本直接 writeFileSync 不产生 `.tmp`，旧还原条件 `fs.existsSync(SKILL_FILE + ".tmp")` 永远不成立，变异提示词永久污染 SKILL.md（实测 diff 45 字符）；改为 finally 无条件按备份原内容写回，并新增「测试后 SKILL.md 与测试前完全一致」回归用例（105→107）；② 修复 `validate-npc-team-prompt.js` 阶段完整性校验「边界节点双删」逃生口——原 `if (stageIdRe(0)||stageIdRe(11))` 在流水线段同时删掉 0/12 与 11/12 时条件不成立，走 else 只发 warning（实测同步双源后 exit 0）；改为无条件执行 0..11 全序校验，缺失任何阶段（含首尾）都报 error，新增负向回归用例；③ CHANGELOG 顶部条目 CR 第 15 轮（R5）叙述段错位到第 19 轮之后，恢复 R1→R9 递增顺序。**；**CR 第 11 轮修复（追加 9 轮循环 R1）：① 阶段完整性校验逃生口修复——原 `includes('0/12')` 命中 `10/12`、`includes('1/12')` 命中 `11/12` 子串，删流水线 0/12、1/12 节点仍 exit 0；改为【流水线】段内 0..11 全序出现校验（词边界正则 + indexOf 递增），并拦截跨段引用掩盖；② 复评接力卡「已清零」分支明确为独立召唤 6/12 测试（不再由复评棒自行跨阶段执行，铁律 11）；③ R 计轮口径统一——R 表示轮次（每轮 = 评审棒+修复棒+复评棒三棒），修复/复评棒下一步不再 +1，仅复评未清零转第 R+1 轮评审；配套 validate 句式同步 + 新增 2 个阶段完整性负向回归用例（91→93）**；**CR 第 12 轮修复（追加 9 轮循环 R2）：① 冒烟测试方法 C 残留旧口径 R+1/12 同步为三棒同轮口径（未清零 → 第 R+1 轮评审；已清零 → 独立召唤 6/12），并在 validate 9.7 新增方法 C 文档级语义强校验；② 三张接力卡「已累计轮次：R/12」分母语义混淆（评审轮次无 12 上限）改为「已累计轮次：第 R 轮」；③ CHANGELOG 残留 `0/12~~11/12` 双波浪号（Markdown 删除线语义）修正为单波浪号；配套 validate 句式 + 测试同步（93→94）**；**CR 第 13 轮修复（追加 9 轮循环 R3）：① 补【暂停·CP2 开发确认】暂停卡模板（全程模式第二强制暂停点此前无输出模板，validate 仅校验 ⏸CP2 字样被流水线引用命中）并在 validate 第 8 节强校验模板存在；② validate 9.7 新增 ⑦ 冒烟测试方法 E（全程模式回退验证）文档级存在性校验（防全程模式边界约束被删改）；③ README 发布表述对齐「发布真实执行（四要素）」行名；配套新增 2 负向用例（94→96）**；**CR 第 14 轮修复（追加 9 轮循环 R4）：① 暂停确认引导语区分输出契约——到 ⏸CP1/⏸CP2 时输出暂停卡、到 ⏸CP3 时输出【合并确认卡】（此前引导语把 CP3 也归为暂停卡，与铁律 13/合并确认卡模板矛盾），validate 第 8 节强校验引导语；② 【暂停·CP2 开发确认】模板命令三选一内容强校验（防模板与暂停确认表/工作流程漂移）；配套新增 2 负向用例（96→98）**；**CR 第 15 轮修复（追加 9 轮循环 R5）：① `DOC_DESC_TRIGGERS` 交集校验清单补齐「PR 合并/合并确认/发布/Release Notes」4 项（此前缺项使 checkDescAgainstDocs 对合并/发布触发短语形同虚设，与注释/dosc 脱钩）；② 全流程触发语义移除 10 阶段旧串（拆解→…→文档→汇报→复盘），仅保留 12 阶段新串（含 PR合并→发布），消除规则源过时表述**；**CR 第 16 轮修复（追加 9 轮循环 R6）：① 【接力卡】段首引导语残留旧口径「全程模式改为 ⏸CP1/⏸CP2/⏸CP3 暂停卡」修正为「⏸CP1/⏸CP2 暂停卡 + ⏸CP3【合并确认卡】」（第 4 轮修复的漏网之鱼，双源 SKILL 同步）；② validate 第 10 节【接力卡】段内新增段首引导语强校验（仅接力模式需输出 + 全程模式不输出接力卡 + CP3 合并确认卡），防全程/接力输出契约被删改；配套新增 2 负向用例（98→100）**；**CR 第 17 轮修复（追加 9 轮循环 R7）：① 【运行模式】判断逻辑补齐全程模式触发分支（明确要求一次跑完→全程模式；带接力卡/任务书→接力续棒；新需求→默认接力），此前判断只覆盖接力模式导致全程模式声明不可达；② validate 第 10 节新增 RELAY_JUDGE_CORE 判断逻辑句式强校验（三分支顺序校验），防运行模式切换契约被删改；配套新增 2 负向用例（100→102）**；**CR 第 18 轮修复（追加 9 轮循环 R8）：① 合并确认卡补 8/12→9/12 接力衔接（合并棒完成后输出【接力卡·8/12】+ 9/12 发布独立召唤话术 + DEV 四要素说明），此前合并棒完成后无发布棒指引；② validate 9.5 新增 8/12→9/12 接力衔接强校验（9/12 发布召唤话术/合并棒完成后/发布棒 DEV 四要素），防合并后无法规范进入发布；配套新增 2 负向用例（102→104）**；**CR 第 19 轮修复（追加 9 轮循环 R9·最终轮）：任务书「用户命令记录」字段补齐 CP3 确认合并命令（继续/补充/停止，CP3 含确认合并），与暂停确认表命令集对齐；validate RELAY_CORE 同步句式强校验；配套新增 1 负向用例（104→105）。同时核对了组件清单表（无过时阶段列举，无需修改）**；，将 NPC_TEAM 流水线从 10 阶段扩展为 **12 阶段**（0/12~~11/12）：新增 **⏸CP3 合并确认**（7/12 文档完成后暂停，输出【合并确认卡】——待合并 PR + 评审清零/测试通过/CI success 可核实记录位置，**只有用户本人回复「确认合并/继续」才放行 8/12 PR 合并**，禁止代替确认/未确认就合并/假装已合并）+ **8/12 PR 合并**（PM 真实 merge-pull 并留痕合并结果）+ **9/12 发布**（DEV 真实执行四要素：① 更新版本号（package.json 等）② 形成 CHANGELOG ③ 发布产物（构建/制品/标签）④ 形成 Release Notes，禁止只输出"已发布"却缺任一要素）；原 8/10 汇报→10/12、9/10 复盘→11/12。配套：① 提示词新增铁律 13（合并前暂停确认）/铁律 14（发布真实执行）、角色卡片 PM/DEV 职责扩展、【合并确认卡】模板段、流水线/工作流程/暂停确认表/门禁表/冒烟测试表全量同步（3 暂停点、12 阶段）；② `scripts/validate-npc-team-prompt.js` 新增第 9.5 节「PR 合并门禁」强校验（铁律 13 声明 + 【合并确认卡】段内要素：合并前置状态/用户确认才放行/禁止未确认就合并/8/12 合并召唤话术）+ 第 9.6 节「发布四要素」强校验（铁律 14 + ①版本号 ②CHANGELOG ③发布产物 ④Release Notes 四句式顺序校验）+ 阶段编号迁移（0/12~~11/12 完整性 + 历史 0/10~~9/10 残留拦截，排除评审轮次 R/10 合法用法）+ ⏸CP3 暂停点校验；③ `tests/validate-npc-team-prompt.test.js` 新增 14 个合并/发布回归用例（正向 2 + 负向 12：删铁律 13/删合并确认卡段/删合并前置状态/删用户确认才放行/删禁止未确认合并/删合并召唤话术/删铁律 14/删四要素①②③④/删禁止缺要素句 全拦截），52→79 用例全绿；④ `scripts/lib/npc-team-triggers.js` + `.codebuddy/skills/npc-team/SKILL.md` frontmatter description 新增「PR 合并/合并确认/发布/Release Notes」触发词；⑤ docs/README/CHANGELOG 同步更新。**CR 第 1 轮修复：评审轮次计轮 R/10→R/12 统一分母（保留「至少 10 轮」语义）+ 合并/发布触发词收紧（单字「发布」须与发布语境组合命中）+ CHANGELOG 0/12~~11/12 笔误修正 + README 阶段序列与 docs 对齐；CR 第 2 轮修复：合并门禁 9.5 补齐段内校验盲区（收到确认前不得执行合并/确认合并放行映射/命令三选一完整/铁律 13 禁止细节），新增 5 负向用例（66→71）；CR 第 3 轮修复：新增 9.7 文档级合并/发布覆盖校验（流水线主链/工作流程/门禁表/暂停确认表/角色卡片），实测 8 个漏检盲区全部拦截，新增 5 负向用例（71→76）；CR 第 4 轮修复：新增 sliceContentSection 文档级区间定位（锚点缺失显式报错），消除删章节标题绕过校验盲区，新增 3 负向用例（76→79）；CR 第 5 轮修复：CHANGELOG 用例数同步 52→79 + 文档自动校验章节描述同步；CR 第 6 轮修复：9.7 内容级强校验（流水线主链顺序/门禁表四要素与禁止细节/暂停确认表前置状态/工作流程合并语义）新增 5 负向用例（79→84）；CR 第 7 轮修复：正则放宽空白防误报 + 补工作流程合并行留痕合并结果强校验（84→87）；CR 第 8 轮修复：合并确认卡补待合并 PR 对象字段与用户已确认合并留痕位置强校验（87→89）；CR 第 9 轮修复：角色卡片 CR 卡 + 工作流程评审行补每轮分别回复留痕强校验（89→91）

- **NPC_TEAM 评审-修复循环接力化 + 复评卡闭环（Issue #76，CR 第 1~2 轮修复）** — 按用户要求"其中的 PR review 与 修复循环也建议使用接力模式"，将 5/10 评审-修复循环在**接力模式**下逐轮接力：每轮评审与每次修复各是独立一次 `@CodeBuddy` 召唤，评审棒输出【评审接力卡】（含评审结论 + 修复召唤话术）、修复棒输出【修复接力卡】（含修复提交 + 复评召唤话术），禁止在一次召唤内偷偷连跑多轮评审-修复（防"假装评审"）。**CR 第 2 轮修复新增【复评接力卡】闭环模板**（复评结论🔴仍需修复/🟢通过双分支 + 未清零续第 R+1/10 轮评审 / 清零转 6/10 测试）+ R 计轮口径（R 从 1 起，一轮 = 评审棒+修复棒+复评棒）。配套：① 提示词铁律 8 升级为「10 轮彻底循环，接力模式」、CR 角色卡片/流水线/工作流程/门禁表/冒烟测试表同步；② `scripts/validate-npc-team-prompt.js` 新增第 10b 节「评审-修复接力」强校验（RELAY_REVIEW_CORE 12 句式顺序校验 + 评审/修复/复评接力卡召唤话术示例校验；**CR 第 1 轮修复：接力卡话术校验段化**，消除跨段假阳性；**CR 第 6 轮修复：评审/修复/复评接力卡话术校验同样段化**，消除三段卡漏检）；③ `tests/validate-npc-team-prompt.test.js` 新增 9+6 个接力/复评回归用例（正向 + 负向全拦截，**CR 第 1 轮修复负向用例改全量替换真拦截、CR 第 6 轮修复三段卡话术用例改段内定位真拦截、CR 第 7 轮修复新增锚点缺失段化拦截用例、CR 第 10 轮修复新增缩进漂移拦截/修正用例、CR 第 12 轮修复新增铁律 8 段内评审棒/修复棒句负向用例**），52 用例全绿；④ `docs/NPC_TEAM.md` 新增【评审接力卡】/【修复接力卡】/【复评接力卡】模板段与「方法 C（评审-修复接力）」冒烟测试；⑤ `.codebuddy/skills/npc-team/SKILL.md` 双源同步；README 同步更新（**CR 第 1 轮修复 README 接力表述**）

- **NPC_TEAM 提示词改造：默认接力模式（每步独立调用 @CodeBuddy，Issue #76）** — 按用户最新要求"每一步都独立调一次 @CodeBuddy NPC，而不是调一次 @CodeBuddy 跑完全部步骤"，提示词新增「运行模式」自检（默认接力 / 可选全程）：**接力模式**下每次召唤 `@CodeBuddy` **只执行流水线中的一个步骤**，执行完输出【接力卡】（含任务书 + 下一步召唤话术）后立即停下，用户把接力卡复制给下一次召唤的 `@CodeBuddy` 逐步续跑完全流程——每步独立调用、独立留痕、独立可见，步间天然可确认/纠正/停止，彻底杜绝"单会话闷头跑完 + 编造全绿"（#78 事故根因）；**全程模式**（一次跑完全部步骤）仅当用户明确要求时可用（保留 ⏸CP1/⏸CP2 暂停确认）。新增铁律 11（接力只执行一步，绝不自行继续、绝不代替用户召唤下一棒）+ 铁律 12（接力卡必含召唤话术）+【任务书】/【接力卡】模板段。配套：① `scripts/validate-npc-team-prompt.js` 新增第 10 节「接力模式」强校验（RELAY_CORE 11 句式顺序校验 + 接力召唤话术示例校验），防回退为"一次跑完"旧行为；② `tests/validate-npc-team-prompt.test.js` 新增 9 个接力模式回归用例（正向 + 8 负向：删默认声明/删只执行一步/删铁律 11/删接力卡段/删召唤话术/删绝不自行继续/删任务书段/删召唤话术示例 均拦截），26 用例全绿；**CR 第 6 轮修复：累计用例数更新为 46（新增 4 个复评/双源段化拦截用例）；CR 第 7 轮修复：累计用例数更新为 47（新增 1 个锚点缺失段化拦截用例）；CR 第 10 轮修复：累计用例数更新为 50（新增缩进漂移拦截 2 用例 + sync 自动修正 1 用例）；CR 第 12 轮修复：累计用例数更新为 52（新增铁律 8 段内评审棒/修复棒句负向用例 2 个）；**CR 第 8 轮修复：CHANGELOG 用例数 46→47 + 1b 冒烟测试标题 3→4 步（方法 A/B/C/D）；CR 第 9 轮修复：RELAY_REVIEW_CORE 铁律 8 段内校验（防 CR 卡片段同句式逃生口）+ 删独立召唤用例段内定位真拦截**；③ `scripts/lib/npc-team-triggers.js` description 触发词新增「接力/每步独立执行」；④ `.codebuddy/skills/npc-team/SKILL.md` frontmatter 同步接力触发词 + 正文双源同步；⑤ `docs/NPC_TEAM.md` 新增「两种执行方式」「接力模式怎么开始/继续」「1b 接力模式冒烟测试」章节、对比表与冒烟测试表新增接力验证点；README 同步更新

- **NPC_TEAM Skill：一键调用，告别粘贴提示词（Issue #76）** — 新增 `.codebuddy/skills/npc-team/SKILL.md`：将 `docs/NPC_TEAM.md` 中的提示词做成 CNB 平台可自动加载的自定义 Skill（官方文档支持项目级 `.codebuddy/skills/` 目录）。使用方式：在 CNB 平台本仓库对话中召唤官方免费 `@CodeBuddy` 后，只需一句「调用 NPC_TEAM skill 完成以下需求：xxxxxx」即可化身 NPC Team 跑完全流程，**无需再粘贴提示词**；原粘贴方式保留为兜底。配套：① `scripts/validate-npc-team-prompt.js` 新增第 11 节「Skill 双源一致性」强校验（Skill 存在 + frontmatter 合法 + name 为 npc-team + 正文与 docs 提示词归一化后完全一致），已接入 CI；② 新增 `scripts/sync-npc-team-skill.js`（含 `--check` 模式）供改提示词后一键同步；③ `tests/validate-npc-team-prompt.test.js` 新增 5 个回归用例（正向双源一致 / Skill 缺失拦截 / 正文漂移拦截 / frontmatter name 错误拦截 / 同步脚本 --check），13 用例全绿；④ `docs/NPC_TEAM.md` 新增「使用方式一（推荐）：一句话调用 Skill」、组件清单与边界说明；README 同步更新

### Changed

- **明确 NPC_TEAM 提示词、skills 为 CNB 平台开发辅助工具（Issue #100）** — `README.md` 核心特性移除「NPC Team 总指挥（零积分）」条目（避免被误解为 WPS 插件功能），新增 💡 边界说明；NPC 章节标题改为「NPC 研发助手（CNB 平台开发辅助工具，与 WPS 插件无关）」，正文明确 `@CodeBuddy`/NPC_TEAM 提示词/`.codebuddy/skills/` 属于 cnb.cool 平台研发辅助能力：不随 `install-addons*.js` 安装、不进入插件目录、不依赖 WPS 运行；`docs/README.md`、`docs/USAGE.md`、`docs/SKILLS.md`、`docs/NPC_TEAM.md`、`.codebuddy/skills/npc-team/SKILL.md` 同步补边界声明（SKILL.md 仅加说明段，正文未动，CI 双源一致性校验通过）

- **以 README 为中心的文档体系重构（Issue #100）** — README.md 从 647 行精简为 116 行门户式结构（核心特性/快速开始/使用方式/架构速览/文档地图/NPC 零积分），详细内容子文档化：新增 `docs/INSTALLATION.md`（三平台安装合并+路径速查）、`docs/USAGE.md`（使用指南）、`docs/ARCHITECTURE.md`（4 层组件+十层调用链+工作原理+设计决策）、`docs/FEATURES.md`（特色功能详解）、`docs/HISTORY.md`（演进史+致谢）；重写 `docs/README.md` 为四象限完整文档中心索引（使用/开发/平台专题/内部参考，全覆盖 22 份顶层文档+2 份 specs，平台路径表补 Linux）；修复 `docs/CODE_REVIEW_GUIDE.md`、`docs/DEVELOPMENT_GUIDE.md` 两处既有断链（`./CODE_OF_CONDUCT.md` → `../CODE_OF_CONDUCT.md`）；自建 NPC（6 角色）配置参考迁入 `docs/NPC_TEAM.md` 防信息丢失；全库 63 份 md 文档相对链接经脚本校验全部有效，原 README 54 个关键概念全覆盖无遗漏

- **修复 Issue #78 三诊：打开面板路径主动调度宿主重绘，首次打开头部不再遮挡** — 用户实测合并 PR #83 后首次打开面板头部仍被遮挡、切标签后才恢复，且「打开两个文档标签窗口后开启 opencode-wps 标签则正常」。根因：PR #83 的宿主重绘（`forceTaskPaneRedraw`）只挂在 `WindowActivate` 事件上，而首次打开面板（`btnShowTaskPane`）**不经过该事件** → 首次打开时宿主重绘永不触发；打开第二个文档标签触发 `WindowActivate` → 重绘执行 → 头部恢复，与用户全部观察吻合。修复：① `forceTaskPaneRedraw` 新增 `force` 参数（仅日志区分触发源，防抖语义不变）；② `btnShowTaskPane` 首次创建/切换显示为可见后，延迟 400ms 主动调度宿主重绘（隐藏→显示任务窗格），让 WPS 宿主重新布局 WebView 拿到正确视口；③ 关闭路径不调度；重绘窗口内用户操作仍被尊重（`lastUserTaskPaneAction` 时间戳比对不变），切换路径仅当无重绘进行中才调度（避免快速点击额外闪烁），调度前重置时间戳避免旧操作被误判为窗口内操作；`tests/taskpane-dock.test.js` 新增 12 个用例（31 → 43），全量 8 套件 + 语法门禁全绿（评审修复：抽 `scheduleTaskPaneOpenRedraw` 公共函数去重；新增「重绘窗口内用户关闭不误弹」「窗格销毁放弃恢复」安全边界用例；等待期守卫保留用户时间戳；`WINDOW_ACTIVATE_REDRAW_DELAY` 抽命名常量；可观测性增强——守卫放弃/窗格不存在/窗格不可见三条静默返回路径补日志留痕，形成 放弃/跳过/完成 三段可观测链）

- **NPC Team 提示词校验：第 8 轮评审修复（Issue #76）** — 修复回归测试工作区残留：`tests/validate-npc-team-prompt.test.js` 的 `runValidate` finally 还原后追加 `unlinkSync` 清理 `.tmp`/`.bak`（实测此前每次运行都残留 `docs/NPC_TEAM.md.tmp` 被改写内容，可能污染 CI 后续步骤）；验证：运行后无残留、连续运行幂等、8 用例仍全通过
  — ① 9.1 留痕正则 `留下.*痕迹` 跨行贪婪收紧为 `留下.{0,60}痕迹|可核实.{0,60}痕迹`（第 1 轮同类问题在 9.1 的遗留，实测删铁律 7 留痕句曾被文档其他位置"痕迹"跨段满足）；② 铁律 7 特有表述「可见回复/记录」纳入 `RULE7_ANTI_HALLUCINATION` 强校验（文档工作流程/门禁表另有等价表述，但铁律 7 自身句式须受控）；③ **新增 `tests/validate-npc-team-prompt.test.js` 回归测试**（8 用例：正向 + 第 4/5/6/7 轮负向攻击固化），接入 CI `.cnb.yml` Validate 阶段；负向验证：删铁律 7 留痕句 → 拦截；删「可见回复/记录」→ 拦截；正向 0 错误 0 警告
  — ① 铁律 7 反幻觉细节纳入强校验：新增 `RULE7_ANTI_HALLUCINATION = ['可核实', '谎报']`，实测删铁律 7 括号约束（可核实痕迹/不存在的模拟器谎报）此前 exit 0 放行，现拦截；② `RULE8_CORE` 由"子串存在校验"升级为**顺序校验**（7 子串按铁律 8 段落内声明顺序递增 `indexOf`，打乱/插入干扰文本即报"句式顺序错乱"），并在注释显式记录 includes 校验局限（防删不改义，语义改写靠人工评审兜底）；负向验证：删铁律 7 括号约束 → 拦截；铁律 8 插入干扰句打乱顺序 → 拦截；正向 0 错误 0 警告
  — 扩展 `RULE8_CORE` 强校验常量，封堵铁律 8 残余盲区：① 新增「循环执行直至问题清零」强校验（此前 9.2 旧校验 `循环.{0,40}清零` 为 OR 宽松匹配，实测只删铁律 8 该句、靠 CR 卡片残留「直至问题清零」仍放行）；② 新增「每轮留痕规则不变」「不得因裁剪而跳轮假装」强校验（此前「简单可缩但留痕纪律不变」红线无任何校验保护，实测删掉该句仍 exit 0）。负向验证：删「循环执行直至问题清零」→ 拦截；删防钻空子句 → 2 错误拦截；正向 `node scripts/validate-npc-team-prompt.js` 仍 0 错误 0 警告
  — 修复 `scripts/validate-npc-team-prompt.js` 9.2.1 三项新增校验的 **OR 正则逃生口**：原校验（`每轮.{0,60}PR.{0,60}回复|分别回复|假装进行|...`）为 OR 匹配，只要提示词任意位置残留「分别回复」「假装进行」等字样即放行；实测删光铁律 8 核心约束（每轮 review 必须在 PR 中回复 / 每次修复也必须在 PR 中回复 / 绝不允许跳过轮次假装进行）、仅靠 CR 角色卡片残留「分别回复留痕」时校验仍 exit 0。改为**锁定铁律 8 完整句式常量 `RULE8_CORE` 逐字强校验**（4 个完整子串缺一即报错），负向验证：删铁律 8 核心约束 → 拦截；删单句「每轮 review 必须在 PR 中回复」→ 拦截；正向 `node scripts/validate-npc-team-prompt.js` 仍 0 错误 0 警告

- **NPC Team 提示词：评审-修复循环升级为 10 轮彻底循环（Issue #76 补充）** — 按用户反馈"代码评审和修复循环不完善"，将提示词铁律 8 从模糊的"循环直至清零"升级为**至少 10 轮彻底的 PR review 与修复循环**：① 每轮 review 必须在 PR 中回复（真实评审记录），每次修复也必须在 PR 中回复（修复说明 + 提交），**绝不允许跳过轮次假装进行**；② 10 轮后仍有问题则继续循环至清零，不得带已知问题进入下一阶段；简单改动走最小路径时 review 轮数可缩减但留痕纪律不变；③ 同步更新角色卡片（CR）、流水线 5/10 阶段、工作流程章节、真实执行与循环门禁表、冒烟测试验证点；`scripts/validate-npc-team-prompt.js` 新增 3 项校验（10 轮要求 / 每轮 review 与每次修复在 PR 分别回复留痕 / 不允许跳过轮次假装进行），负向测试验证均正确拦截（删"10 轮"、删"每轮分别回复"、删"假装进行" → 全部报错）；README 同步更新
- **修复 PR #86 第 1 轮评审 13 条（Issue #84 Mac 彻底评审）** — 对照 Linux 终版（PR #82 经 26 轮评审清零）逐文件比对，Mac 专属代码补齐 13 处 Linux 已修复而 Mac 未对齐的问题：① `launcher-mac.js` `startOpenCode` 空 cwd 改用 `os.homedir()` 兜底（此前直接报 `'cwd is undefined'`，导致「打开Web」自愈路径必败）；② `parseBody` 增加 `aborted` 标志防请求体超限后 `end` 事件双回调；③ `excel-handler.js` `insertRows`/`deleteRows`/`hideRows`/`showRows`/`groupRows` 行参数 `parseInt` + 正整数校验（此前 `params.row || 1` 对 0/负数/字符串静默兜底）；④ `sortRange` keyColumn 纯列字母补行号 + order 大小写不敏感；⑤ `autoFilter` criteria 存在时 field 必填校验；⑥ `replaceInSheet` 缺 findText 前置校验；⑦ `getCellComments` 无批注空保护；⑧ `transpose` 改 `PasteSpecial(-4104,false,false,true)` 真转置语义（此前普通粘贴覆盖）；⑨ `textToColumns` 参数修正（ConsecutiveDelimiter=false, Tab=true）；⑩ `consolidate` sources 非空 + function parseInt 校验；⑪ `getContext` 读首行真实值识别表头（新增 `headerRow` 字段）+ selectedCell 包 try/catch；⑫ `setCellStyle`/`setBorder`/`addConditionalFormat` 颜色统一走 `toExcelColor`、对齐走 `resolveAlignment`；⑬ `cleanData` 改 trim/collapse/all 三模式单元格级正则处理（去 Range.Replace 平台差异 + 全局正则 lastIndex 交替漏判 bug）；另修复 `setZoom` parseInt 校验；`tests/mac-bridge.test.js` 新增 8 个测试（17 → 25）；全部 JS `node --check` + `bash -n` 通过，6 套件 133 用例 + MCP 274 单测全绿，PR CI success
- **修复 PR #83 第 10 轮（最终轮）评审 2 info**（Issue #78）— ① `registerWindowActivateReflow` 新增 `windowActivateListenerRegistered` 已注册标志：`OnAddinLoad` 可能被多次调用（插件重载/异常恢复），防重复叠加 WindowActivate 监听（重复注册会叠加执行完整重绘流程、多定时器交错）；② `forceReflowFix` 的 300ms 最小间隔检查**提前到所有 DOM 访问之前**：被拦截时零 DOM 触碰（`getBoundingClientRect` 是同步布局读取成本高），避免无效代码路径；新增「OnAddinLoad 重复调用不重复注册」测试用例，测试 30 → 31 个全通过，全量 122 个用例全绿；**至此 10 轮 review 修复循环全部完成**
- **修复 PR #83 第 9 轮评审 3 info**（Issue #78）— ① `visibilitychange` 隐藏时复位 `reflowFixed`：WPS 切走标签时 WebView 可能被销毁重建，回显时必须重新检查布局，不能沿用隐藏前的「已修复」状态；② `showChat` 内 `typeof` 检查简化（`if (window.__scheduleReflowFix)` 直接调用）：时序倒挂由 IIFE 挂载时的「chat 已先行显示则补触发」兜底，两层机制互补，注释说明；③ `docs/WPSJS_DEVELOPMENT.md` 第 15 条补 DEV 增量 2：记录第 5~8 轮关键防护（输入焦点跳过/滚动位置保存恢复/300ms 最小间隔/chat 隐藏跳过/时序倒挂补触发/visibilitychange 隐藏复位/定时器统一走 scheduleReflowFix），维护者可读；测试 30 个全通过（静态骨架测试新增 ⑱visibilitychange 隐藏复位 / ⑲showChat 直接调用 断言），全量 121 个用例全绿
- **修复 PR #83 第 8 轮评审 1 critical + 1 warning（含第 5 轮回归自我纠正）**（Issue #78）— ① **critical（自纠，第 5 轮引入）**：`forceReflowFix` 的 `display:none` 会重置 `.messages` 滚动容器 `scrollTop`，第 5 轮「尊重位置」逻辑在重排**之后**才读 scrollTop（已被重置为 0），`nearBottom` 恒 false 且不滚动 → 用户消息列表被滚回顶部；改为重排**前**保存 `savedScrollTop`，重排后按 `wasNearBottom` 决策：原本在底部 → `scrollToBottom()`；原本在历史位置 → 精确恢复原 scrollTop，不打断阅读；② **warning（状态位空转）**：`scheduleReflowFix` 先重置 `reflowFixed=false` 再被 300ms 最小间隔拦截，导致状态位与事实不符、后续触发反复空转；改为间隔检查**先于**状态位重置（不足 300ms 直接 return 不动状态位），300ms/1000ms 定时器兜底统一走 `scheduleReflowFix`；测试 30 个全通过（静态骨架测试新增 ⑯滚动位置保存恢复 / ⑰最小间隔检查在状态位重置之前 断言，⑤定时器兜底正则同步更新），全量 121 个用例全绿
- **修复 PR #83 第 7 轮评审 3 info**（Issue #78）— ① `reflowRetryCount` 语义修正：`.app` 成功找到后清零（重试上限=「连续」失败上限），避免未来 `.app` 动态渲染时 10 次耗尽后 rAF 链式重试永久失效；② `heads.length === 0`（结构变动）时复查视为未修复（`reflowOk = heads.length > 0`），维持「持续可重试」语义，与第 4 轮注释一致；③ 已知限制留痕：`forceTaskPaneRedraw` 异步恢复对「WPS TaskPane 原生 X 关闭（不经过 OnAction，时间戳不更新）」的覆盖情况——销毁语义已由 `!cur` 判空覆盖、隐藏语义可能误弹，已记录到 `docs/WPSJS_DEVELOPMENT.md` 注意事项第 16 条 + main.js 注释；测试 30 个全通过（静态骨架测试新增 ⑭重试计数清零 / ⑮heads 空视为未修复 断言），全量 121 个用例全绿
- **修复 PR #83 第 6 轮评审 1 warning + 2 info**（Issue #78）— ① **warning（初始化时序倒挂）**：自愈 IIFE 定义在 `init()` 之后，`init` 异步回调（`onServerConnected`→`showChat`）可能先于 IIFE 执行，`typeof window.__scheduleReflowFix` 检查会静默跳过首次主动自愈；IIFE 挂载后补判断「chat 已先行显示」则立即 `scheduleReflowFix()`，覆盖时序倒挂场景；② **info（重排非幂等）**：新增 `lastForceReflowAt` 最小间隔 300ms，多个入口（rAF/load/定时器/resize/showChat）在同一时间窗内排队时只执行一次强制重排，避免昂贵布局反复跑；③ **info（scrollToBottom 空指针）**：`scrollToBottom()` 内部补判空（`if ($messages)`），避免 `CONNECTED` 为 true 但 `$messages` 为 null 时抛 TypeError 中断自愈流程；测试 30 个全通过（静态骨架测试新增 ⑪时序倒挂补触发 / ⑫重排最小间隔 / ⑬scrollToBottom 判空 断言），全量 121 个用例全绿
- **修复 PR #83 第 5 轮评审 2 warning + 1 info**（Issue #78）— ① **warning（重排打断输入）**：`forceReflowFix` 强制重排前检查 `#input-box` 是否聚焦（`document.activeElement === inputBox`），聚焦时跳过本次重排——避免 `display:none` 移除再恢复输入框导致 WPS Chromium（103）下输入框失焦、正在输入的光标丢失；② **warning（自愈强拉滚动条）**：重排成功后仅在用户消息列表**在底部**时才 `scrollToBottom()`（`nearBottom` 判断，容差 50px），用户向上查看历史消息时尊重阅读位置，不再强行拉回底部；③ **info（时间戳边界）**：`redrawStartTime` 提前到 `forceTaskPaneRedraw` 函数开头（读取窗格前），比对改 `lastUserTaskPaneAction >= redrawStartTime` 覆盖同毫秒边界（用户操作与重绘开始同毫秒也不误恢复）；测试 30 个全通过（静态骨架测试新增 ⑨输入焦点保护 / ⑩滚动位置尊重 断言），全量 121 个用例全绿
- **修复 PR #83 第 4 轮评审 1 warning + 2 info**（Issue #78）— ① **warning（用户介入时序 bug）**：`forceTaskPaneRedraw` 异步恢复回调仅靠 `cur.Visible` 无法防「用户手动关闭」——用户点 `btnShowTaskPane` toggle 把窗格关掉（Visible=false）时，回调会误判「我们隐藏的状态」而恢复置位、把刚关闭的窗格弹回来；新增 `lastUserTaskPaneAction` 时间戳（`OnAction` toggle 分支记录）+ `redrawStartTime` 比对：重绘期间用户操作过则放弃恢复，尊重用户意图；② **info**：`querySelectorAll('.topbar, .session-header')` 返回空时 `allInView` 恒真会误置 `reflowFixed` 永久关闭自愈；改为 `heads.length > 0` 才做预检，空时保守保持可重试；③ **info**：强制重排后**复查**头部是否回到视口内，仍越界时 `reflowFixed = reflowOk`（不置位），保留后续重试机会（WebView 布局 bug 顽固时一次重排可能不够）；测试 29 → 30 个（新增：重绘期间用户操作后放弃恢复），全量 121 个用例全绿
- **修复 PR #83 第 3 轮评审 2 warning + 2 info**（Issue #78）— ① `forceReflowFix` 增加 chat 视图隐藏判断（`view-chat.classList.contains('hidden')` 时直接跳过）：首次渲染处于 setup 视图时 `.topbar` 在 `display:none` 父级上 `getBoundingClientRect` 全为 0，预检恒不通过导致 `reflowFixed` 无法置位、定时器反复空转；② 预检改为**双头部检查**（`.topbar, .session-header` 任一越出视口即触发重排），消除只查 topbar 的漏判窗口；③ `showChat()` 末尾主动调用 `window.__scheduleReflowFix()`（页面底部 IIFE 暴露）：setup→chat 切换后不依赖旧 WebView 内核是否派发 resize，显式触发自愈；④ 宿主侧 `forceTaskPaneRedraw` 异步恢复延迟 80ms → 150ms（慢速环境宿主完成隐藏→重排耗时不定，80ms 可能过早导致重绘不完整）；测试 29 个全通过（静态骨架测试新增 ⑥⑦⑧ 断言），全量 120 个用例全绿
- **修复 PR #83 第 2 轮评审 1 critical + 2 warning + 1 info（含第 1 轮回归自我纠正）**（Issue #78）— ① **critical（自纠）**：`forceReflowFix` 预检 `documentElement.scrollHeight <= innerHeight` 在 `position:fixed` 布局下恒真（fixed 不产生滚动），导致强制重排永不执行、页面自愈失效；改为检测 `.topbar` 的 `getBoundingClientRect()` 是否在视口内（`r.top>=0 && r.bottom<=innerHeight && r.width>0`），布局正常才跳过；② **warning**：`forceTaskPaneRedraw` 新增 `taskPaneRedrawPending` 防抖标志，WindowActivate 连续触发时一次重绘未完成（80ms）跳过后续触发，避免交错定时器导致 Visible 状态错乱；③ **warning**：异步恢复前复查 `GetTaskPane` 当前窗格——已销毁（null）或已被外部恢复（`cur.Visible` 为 true，如用户重新打开）时跳过置位，不误弹用户刚关闭的窗格；④ **info**：300ms/1000ms 定时器兜底改为先重置 `reflowFixed` 再执行（`reflowFixed=false; forceReflowFix()`），避免首次误判后兜底全部空转；测试 26 → 29 个（新增：防抖跳过/外部恢复不重复置位/窗格销毁放弃恢复），全量 120 个用例全绿
- **修复 PR #83 第 1 轮评审 2 warning + 2 info**（Issue #78）— ① `opencode-wps/main.js` `forceTaskPaneRedraw` 的 `Visible false→true` 拆成**异步两步**（中间 `setTimeout 80ms` 让出宿主事件循环）：同一同步代码块内连续置位可能被 WPS 宿主合并处理导致重绘不生效；② `forceTaskPaneRedraw` 内 `PluginStorage.getItem` 单独 try/catch（与 `OnAction` 路径防御一致）：失败时留痕「读取 taskpane_id 失败」并继续用内存兜底，而非整函数误报「强制重绘失败」；③ `opencode-wps/taskpane.html` `forceReflowFix` 增加 `reflowFixed` 状态位 + 预检：布局已正常时不重复强制重排，避免 300ms/1000ms 定时器对正常布局**闪屏**；resize 时重置状态位允许再次自愈；④ rAF 链式重试加**次数上限**（10 次 ≈166ms），防止 `.app` 缺失时每帧无限空转占 CPU；测试：`loadMainJs` 的 setTimeout mock 改为可手动 flush（`__flushTimeouts`），「异步两步重绘」用例适配新时序，26 个全通过，全量 103 个用例全绿
- **修复 Issue #78 复诊（补 DEV 增量）：首次渲染兜底加固** — `opencode-wps/taskpane.html` 自愈逻辑增强：① `forceReflowFix` 在 `.app` 尚未挂载时改为 rAF 链式重试（不再直接 return 丢兜底）；② 新增 `raf` 兼容层，`requestAnimationFrame` 缺失时用 `setTimeout 16ms` 兜底（兼容旧 WebView 内核）；③ 首次渲染触发时机扩展为三路（rAF 首帧前 + `load` 事件 + 300ms/1000ms 定时器），覆盖 WebView 视口高度计算的不同时序；④ `tests/taskpane-dock.test.js` 新增「taskpane.html 自愈骨架」静态校验用例（position:fixed 锚定/forceReflowFix/offsetHeight 强制 reflow/rAF 降级/resize 与 visibilitychange 监听/多时机兜底），测试 25 → 26 个全通过；全量测试 103 个用例全绿
- **修复 Issue #78 复诊：头部被遮挡根因是 TaskPane WebView 首次渲染布局 bug，非 DockPosition**（Issue #78）— 用户实测 PR #79 修复后头部仍被遮挡、新建 WPS 标签页再切回即恢复；两张截图像素级对比显示任务窗格刚打开时 topbar/session-header 区域为空白（WebView 视口高度计算错误把 flex 头部挤出可视区），切换窗口触发宿主重绘后才恢复。三层防御修复：① `opencode-wps/taskpane.html` 的 `html,body` 改用 `position:fixed + inset:0` 锚定视口四边（规避 `height:100%` 部分版本失效）；② 页面内监听 `resize`/`visibilitychange` 并强制 reflow（`forceReflowFix`：隐藏→读 `offsetHeight`→恢复 `.app`，节流 100ms）；③ `opencode-wps/main.js` 注册 `AddApiEventListener('WindowActivate')`（官方 SDK `wps-jsapi` 声明事件），切回标签时强制任务窗格 `Visible false→true` 重绘（仅当窗格原本可见时执行，避免误弹已关闭窗格），旧版本无 `AddApiEventListener` 时静默降级；新增 5 个测试用例（注册监听/旧版本降级/重绘置位/不存在不误弹/异常静默），测试 20 → 25 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 15 条
- **修复 PR #79 第 12 轮评审 1 info**（Issue #78 / PR #79）— `opencode-wps/main.js` `btnShowTaskPane` 分支「GetTaskPane 找回」路径的 `setTaskPaneDockPosition(tp)` 返回值补检查：此前该路径停靠校正失败时仅内部留痕、无「窗格仍可用」增强留痕，与 `createTaskPane()` 内行为不一致（创建路径有增强留痕、找回路径静默）；现校正失败时同样补充 `console.error('[WPS] 任务窗格停靠校正失败（窗格仍可用，下次点击将重新校正）')` 留痕后不中断可见性切换（下次点击仍会重新校正，有自愈机会），两处行为统一；新增「GetTaskPane 找回路径停靠校正失败：留痕不中断可见性切换」测试用例，测试 19 → 20 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 14 条
- **修复 PR #79 第 11 轮评审 2 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` `createTaskPane()` 内 `CreateTaskPane` 返回值补判空：个别版本可能返回 `null`（而非抛异常），此前直接访问 `tskpane.ID` 会抛误导性 TypeError（外层 catch 虽能兜住，但「初始化任务窗格失败」文案带偏排查方向）；现返回 null 时 `console.error('创建任务窗格失败: CreateTaskPane 返回空对象')` 明确留痕并返回 null；② `createTaskPane()` 检查 `setTaskPaneDockPosition()` 返回值：停靠校正失败（内部已留痕）但窗格仍可用，不中断、补充「窗格仍可用，下次点击将重新校正」留痕后继续置可见并返回窗格对象（保留自愈机会）；新增 2 个测试用例（CreateTaskPane 返回 null 立即判空 / 停靠校正失败仍返回窗格对象），测试 17 → 19 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 12/13 条
- **修复 PR #79 第 10 轮评审 2 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` `createTaskPane()` 内 `PluginStorage.setItem('taskpane_id', ...)` 收敛进 `if (tskpane.ID)` 判空分支：此前 ID 为空（个别版本未回填）时仍会执行 `setItem`，把 `undefined` 持久化写入 `PluginStorage`，可能覆盖既有**有效** ID（评审 warning 盲区）；现仅 ID 有效时才持久化，ID 为空时留痕、不覆盖内存缓存、也不写持久化；② `errMsg()` JSDoc `@returns {string}` 改为 `@returns {*}`，与实现（非 Error 值原样返回）一致；`tests/taskpane-dock.test.js` 「窗格 ID 为空」用例补充 `setItemCalls.length === 0` 断言（封住持久化盲区），测试 17/17 全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项第 10 条补充「跳过 setItem 写入」语义
- **修复 PR #79 第 9 轮彻底评审 3 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` `createTaskPane()` 内 `taskpaneIdCache = tskpane.ID` 补空值防御：个别版本 `CreateTaskPane` 返回的窗格 `ID` 可能为 `undefined`，直接覆盖会令内存兜底失效回到多窗格叠加场景，现 ID 为空时 `console.error` 留痕且不覆盖既有缓存；② `tests/taskpane-dock.test.js` 文件头注释由 5 条断言更新为 17 用例全量清单（与真实用例数对齐）；③ `errMsg()` 统一范围补齐——`main.js` 中 5 处既有 `e.message` 裸访问（`checkWpsReady`/`checkDocument`/`sendDocInfo`/`startOpenCodeServer`/`checkStatus`）全部改 `errMsg(e)`，异常信息提取实现全文件收敛；新增「窗格 ID 为空不覆盖缓存」测试用例，测试 16 → 17 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项第 10/11 条同步更新
- **修复 PR #79 彻底评审 1 warning + 2 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` `createTaskPane()` 内 `tskpane.Visible = true` 单独包 try/catch：此前若个别版本对只读 `Visible` 抛异常，窗格已创建、ID 已存却返回 `null`，调用处误判「创建失败」且无自愈机会；现失败 `console.error` 留痕后**仍返回窗格对象**，保留下次点击自愈路径；② 新增模块级 `taskpaneIdCache` 内存 ID 兜底：`setItem` 持久化失败时，本次会话内再次点击不会重复 `CreateTaskPane` 造成多窗格叠加（`OnAction` 在 `getItem` 为空/异常时回退内存值）；③ 提取 `errMsg()` 公共函数统一 6+ 处 `(e && e.message ? e.message : e)` 重复表达式；新增 3 个测试用例（Visible 置位失败仍返回窗格对象 / setItem 持久化失败内存 ID 兜底不重复创建 / errMsg 函数），测试 13 → 16 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 9/10/11 条
- **修复 PR #79 第 8 轮评审 2 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` `createTaskPane()` 外层 catch 留痕文案由「创建任务窗格失败」改为「初始化任务窗格失败」：该 try 块实际涵盖 CreateTaskPane / 存 ID / DockPosition 校正 / Visible 置位全流程，原文案过窄会误导排查方向；② `btnShowTaskPane` 分支 `tp.Visible = !tp.Visible` 补 try/catch：与 `createTaskPane()` 内 `Visible` 置位保持统一异常兜底，避免个别 WPS 版本对该属性抛异常时中断按钮回调；新增「切换可见性失败（tp.Visible 只读）留痕不中断」测试用例，测试 12 → 13 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 8 条「可见性切换也要 try/catch」
- **修复 PR #79 第 7 轮评审 warning**（Issue #78 / PR #79）— `opencode-wps/main.js` `createTaskPane()` 内 `PluginStorage.setItem('taskpane_id', ...)` 原为**裸奔调用**：`setItem` 与 `getItem` 同源同概率抛异常（如插件初始化未完成），一旦抛异常会中断整个大 try 块，导致后续 `setTaskPaneDockPosition` 校正与 `tskpane.Visible = true` 置位被跳过（窗格创建了却永远不显示）、`createTaskPane()` 返回 `null` 后调用处直接 `return`，且无留痕。现改为 `setItem` 单独包 try/catch：失败 `console.error('[WPS] 保存 taskpane_id 失败: ...')` 留痕后**继续执行**后续初始化（DockPosition 校正 + Visible 置位照常）；新增「setItem 抛异常：留痕后继续校正停靠并置可见」测试用例，测试 11 → 12 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 7 条「setItem 必须 try/catch」
- **修复 PR #79 第 6 轮评审 2 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` `createTaskPane()` 包 try/catch：`CreateTaskPane` 抛异常（如 `taskpane.html` 路径无效、WPS 环境异常）时 `console.error` 留痕并返回 `null`，调用处判空兜底，不再直接中断；② `btnShowTaskPane` 分支 `PluginStorage.getItem("taskpane_id")` 包 try/catch（与仓库 `checkStatus`/`pollCommand`/`dockOpenCodeWindow` 防御模式一致），插件初始化未完成等场景读取失败留痕并回退重建；新增 2 个测试用例覆盖「getItem 抛异常回退重建 + 留痕」「CreateTaskPane 抛异常返回 null + 留痕」，测试 9 → 11 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项新增第 5/6 条
- **修复 PR #79 第 5 轮评审 info**（Issue #78 / PR #79）— `opencode-wps/main.js` `btnShowTaskPane` 分支 `GetTaskPane` 调用包 try/catch：个别 WPS 版本对无效/过期 `taskpane_id` 会**抛异常**（而非返回 null），此前会直接中断且无留痕，现统一 catch 后 `console.error` 留痕并回退 `createTaskPane()` 重建，贴合文档「必须判空」初衷；新增「GetTaskPane 抛异常回退重建 + 留痕」测试用例，测试 8 → 9 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项第 4 条补充抛异常场景
- **修复 PR #79 第 4 轮评审 2 info**（Issue #78 / PR #79）— ① `opencode-wps/main.js` 提取 `createTaskPane()` 辅助函数，统一「首次创建」与「GetTaskPane 判空回退重建」两段完全重复的逻辑（CreateTaskPane 单参数 + 存 taskpane_id + setTaskPaneDockPosition + Visible=true），`btnShowTaskPane` 分支简化为一处判空分流；② `docs/WPSJS_DEVELOPMENT.md` 注意事项第 2 条措辞修正——「当前仅使用 `msoCTPDockPositionLeft`/`Right`」改为「当前停靠枚举仅定义 Left/Right（实际使用 Right，Left 保留备用）」，避免误导；新增 `createTaskPane` 统一初始化用例，测试 7 → 8 个全通过
- **修复 PR #79 第 2 轮评审 2 问题**（Issue #78 / PR #79）— ① `GetTaskPane` 判空回退重建：`taskpane_id` 持久化于 `PluginStorage`，WPS 重启后旧 id 残留、`GetTaskPane` 返回 `null` 时直接访问 `tp.Visible` 会抛 TypeError 导致窗格打不开，现改为判空后回退「重新 `CreateTaskPane` + 重存 `taskpane_id`」；② 清理 `tests/taskpane-dock.test.js` 冗余死代码（`loadMainJs` 重复调用 3 次、恒真断言、未使用的 `sandbox2`/`app`/`src`），新增「GetTaskPane 返回 null 回退重建」用例，测试 6 → 7 个全通过；`docs/WPSJS_DEVELOPMENT.md` 注意事项补充第 4 条「`GetTaskPane` 必须判空」
- **修复 PR #79 评审 3 问题 + 补真实测试防线**（Issue #78 / PR #79）— ① 删除 `WPS_Enum` 中未使用的 `msoCTPDockPositionTop(1)/Bottom(3)`（与已有 `msoFileDialogOpen:1` 数值冲突埋雷），仅保留实际使用的 `Right(2)`；② `CreateTaskPane` 恢复单参数（仓库无官方文档佐证第二参数），创建后统一通过 `setTaskPaneDockPosition()` 设置 `DockPosition` 属性显式校正；③ 空 catch 改 `console.error` 留痕，新增 `tests/taskpane-dock.test.js`（vm 加载生产源码 + mock Application，6 用例：枚举无冲突/单参数/首次创建校正/再次打开重校正/失败留痕/无效对象）并接入 GitHub Actions legacy 测试与 `.cnb.yml` Validate 阶段；`docs/WPSJS_DEVELOPMENT.md` 新增「任务窗格 TaskPane API」章节记录验证结论
- **NPC Team 提示词新增「真实执行与循环门禁」（Issue #76 补充）** — 针对 #78 实测暴露的"编造评审/测试全绿"问题，提示词铁律新增 7~10：① **每步真实执行+留痕**：每一步必须单独执行并在 Issue/PR 留下可核实痕迹（评论/评审/提交/CI 记录），禁止假装执行；② **评审-修复循环**：5/10 评审留痕、问题全部修复后复评，循环直至清零；③ **测试失败跳转**：6/10 验收不通过跳回 4/10 或 5/10 重新执行直至通过；④ **充分复盘四要素**：9/10 复盘必须写清根因/教训/预防/加固；`scripts/validate-npc-team-prompt.js` 新增 4 项门禁校验（留痕/清零/跳转/四要素），负向测试验证均正确拦截；`docs/NPC_TEAM.md` 新增「真实执行与循环门禁」章节与【留痕检查】自检段
- **NPC Team 提示词新增「暂停确认机制」（Issue #76 补充）** — 流水线插入 2 个强制暂停点（⏸CP1 计划确认 / ⏸CP2 开发确认），到点输出暂停卡并停下，等用户命令词（**「继续」放行 / 「补充：<意见>」修正后继续 / 「停止」终止**）；铁律：**只有用户本人回复命令词才放行，禁止代替用户确认、禁止假装已确认**（防"自评自导跑完全流程"的幻觉）；`scripts/validate-npc-team-prompt.js` 新增暂停确认校验（⏸CP1/⏸CP2 完整定义、三命令词完整形式、禁止代替确认铁律、暂停卡格式段），负向测试验证：删暂停点/改命令词/删铁律/改名暂停段均正确拦截
- **NPC Team 校验脚本强化**（PR #77 复评 3 条 info 整改）— ① `scripts/validate-npc-team-prompt.js` 改用真正的命名捕获组 `m.groups.prompt`（移除恒为 undefined 的 `m.group ?? m[1]`）；② 角色校验从"全文中任意命中"弱校验升级为**强校验**：在 `【角色卡片】` 段内逐张匹配「emoji 缩写：/全称：」卡片行，卡片被误删（即使流水线正文仍含「开发/评审/测试」等词）也会报错拦截；③ 提示词代码块增加锚点 `# NPC_TEAM_PROMPT_START`，正则只捕获带锚点的块并校验长度下限（≥500 字符），避免将来在提示词前新增其他 text 块时静默捕获错误内容；`docs/NPC_TEAM.md` 同步在提示词块首行加锚点；负向测试验证：删除 QA 卡片 / 删除锚点均能正确拦截

### Added

- **NPC Team 提示词 V2 优化 + 有效性测试**（Issue #76）— `docs/NPC_TEAM.md` 提示词从 ~2092 token 压缩到 ~1019 token（**-51%**，6 角色/10 阶段/零积分/安全红线全保留）：流水线改单行紧凑格式、合并身份声明与角色清单、切换卡示例压缩为单卡、去除与工作流程章节重复的流水线描述；新增 `scripts/validate-npc-team-prompt.js` 静态校验脚本（校验 6 角色齐全/10 阶段编号完整/零积分红线/安全红线/切换卡）并接入 `.cnb.yml` CI 的 Validate 阶段；文档新增「有效性测试（可复现）」章节（静态校验 + 2 分钟冒烟测试方法 + 实测结论）

### Fixed

- **清理 Issue #78 无效修复代码（确认为 WPS 宿主 bug，Issue #78 七诊收尾）** — 经 6 轮实机验证（PR #79/#83/#90/#109）确认「侧边栏 chatui 头部被遮挡 + WPS 顶栏标签被压扁」为 **WPS 宿主 TaskPane 布局 bug**，插件侧无法修复（仅新建标签/切标签可临时恢复）。按用户要求清理全部无效修复代码，不再垒屎山：① `opencode-wps/main.js` 删除宿主重绘模块（`forceTaskPaneRedraw`/`scheduleTaskPaneOpenRedraw`/`registerWindowActivateReflow` 及配套状态变量/常量/`WindowActivate` 监听注册），`OnAddinLoad` 恢复仅初始化枚举+连接 OpenCode；② `opencode-wps/taskpane.html` 删除「头部遮挡自愈」IIFE（`forceReflowFix`/`scheduleReflowFix`/resize/visibilitychange 监听/定时器兜底）、`showChat()` 中的自愈调度调用，`html,body` 布局恢复标准 `width:100%;height:100%`（去掉 `position:fixed` hack）；③ `tests/taskpane-dock.test.js` 删除重绘/自愈相关用例（43 → 20），仅保留任务窗格创建/切换的通用健壮性用例（判空/try-catch/ID 兜底/停靠校正）；④ `docs/WPSJS_DEVELOPMENT.md` 删除注意事项第 15/16 条（无效修复结论+已知限制）与「头部遮挡修复实机验收步骤」章节。**保留**：PR #79 的任务窗格基础健壮性代码（右侧停靠默认、判空回退重建、全链路 try/catch 留痕、内存 ID 兜底）——这些是通用质量提升，与 WPS bug 无关。验证：taskpane-dock 20/20 + 全量 7 套件 + `node --check` 全绿
- **对齐合并去重口径并补可观测性**（PR #71 三轮评审 3 warning + 3 info）— ① 去重键同键（同 offset 同 original）时 **source=ai 优先覆盖 mcp**（与 SKILL 合并口径一致，不再错留 2 条）；② 累加器返回文本补充 **offset 缺失计数**（「其中 N 条未携带绝对 offset，未参与去重」），报告侧可区分「位置未知」是漏传还是计算失败；③ `dedupedCount` 改为只统计**本批新增导致的去重**（不再把历史累计重复计入）；④ SKILL.md 公式移除已废弃的 `offset_in_paragraph` 字面量引用（改为「段内字符位置」）、「必须包含 offset」改为「强烈建议携带 paragraphIndex + offset」（与代码层可选语义对齐）；⑤ `normalizeIssueLocation` 删除被有意忽略的 `offset_in_paragraph` 类型声明（类型即文档）
- **AI 覆盖 MCP 时保留 Layer 1 type + 统一 SKILL 两处合并口径**（PR #71 四轮评审 2 warning + 3 info）— ① 累加器 AI 条目覆盖 MCP 条目时，若 AI type 兜底为「未分类」而 MCP（Layer 1 正则命中）有具体 type，**保留 MCP 的 type**（与 SKILL 2d 保护逻辑对齐，避免报告五维评分失真）；② SKILL.md **两处合并去重逻辑完全统一**（此前无条件 AI 优先 vs `issue.score` 条件 AI 优先互相矛盾，AI 参照执行会得到不同结果），现统一为「同键 AI 无条件优先 + 保留 Layer 1 type」；③ 去重键 `offset|original` 改用 `JSON.stringify([offset, original])`，消除原文含 `|` 时的分隔符歧义；④ `formatIssueLocation` 对非法 `paragraphIndex`（0/负数，约定从 1 起）不再展示「段落 0」，降级为偏移展示；⑤ schema 中 `offset`/`paragraph_index` 描述注明兼容字符串数字（AI 层可能输出 "3"）；⑥ **跨批 type 提升**：AI 未分类条目先入、后续批次 MCP 带具体 type 后到（同位置同原文）时，用 MCP 的具体 type 提升 AI 条目的「未分类」（AI 优先语义不变，避免报告五维评分漏计）；新增 6 个单测覆盖以上行为
- **CI 增加 Jest 测试门禁**（Issue #50 P1-1）— `.github/workflows/ci.yml` 的 build job 新增 `npm test` 步骤，`wps-office-mcp` 的 9 个 Jest 套件 / 208 个测试正式进入 CI，不再形同虚设
- **统一版本号为单一版本源 1.1.0**（Issue #50 P1-2）— 删除 `opencode-wps/manifest.xml` 冗余的小写 `<version>` 字段，`opencode-wps/package.json`、`wps-office-mcp/package.json` 及 lock 统一为 1.1.0；新增 `scripts/validate-versions.js` 校验脚本并接入 CI
- **修复 install-addons.js 自启矛盾**（Issue #50 P2-3）— 删除第 77 行过时声明"不再自动注册开机自启任务"，改为如实提示"第 8 步将注册 Launcher 开机自启"，与第 8 步实际行为一致
- **修复 CI JSON 检查形同虚设**（Issue #50 P2-4）— JSON 检查只列 `*.json` 文件并严格解析（不再静默吞掉 .js 失败），新增 `node --check` 独立 JS 文件语法检查
- **launcher CORS 收敛为白名单**（Issue #50 P2-5）— `opencode-wps/launcher.js` 的 `Access-Control-Allow-Origin` 由 `*` 改为白名单（127.0.0.1:14096 / localhost:14096 / 无 Origin / null / file://），拒绝恶意本地网页跨站读取
- **工具数量文档改为以代码为准**（Issue #50 P2-6）— README/AGENTS.md/docs/MCP.md 中的硬编码数字（238/240/490）改为约数并标注"以代码为准"，新增 `scripts/validate-tool-counts.js` 校验脚本防止过时数字残留

### Added

- Agent 选择功能（wps-expert/wps-word/wps-excel/wps-ppt）
- 4 层架构文档（JS插件 → Agents → Skills → MCP）
- 测试套件（security.test.js, utils.test.js, launcher.test.js）
- CONTRIBUTING.md 贡献指南
- Agent Skill 调用优先级指引
- **Word 文档校对功能**（混合 MCP 基础校对 + AI 智能校对）
  - 4 个校对专用 MCP 工具：`wps_word_enable_track_changes`、`wps_word_get_track_changes_status`、`wps_word_replace_range`、`wps_word_proofread_basic`
  - 基础校对规则引擎（零 token 正则检测错别字/重复字符/常见语病）
  - 修订模式（Track Changes）支持，所有修改可追溯
  - Markdown 校对报告自动生成（文档同目录）
  - 从真实校对报告提炼的 30+ 条正则规则
- **path-safety.ts** 路径安全工具（validateFilePath / validateImagePath / isAllowedUrl）
- 18 个文件路径处理 handler 接入 path-safety 校验
- path-safety.test.ts 单元测试（13 个测试用例）
- launcher.js `isValidUrl()` URL 白名单校验
- launcher.js `stateLock` 并发请求保护（同时仅允许一个 `/start`）
- main.js PluginStorage JSON 命令 `{ cmd, ts }` 时间戳去重
- CORS 代理 `opencode-proxy.js`（端口 14098，剥离 CSP 头）
- **Mac 版「打开Web」按钮**（Issue #74）— `opencode-wps-assistant/ribbon.xml` 新增「对话」分组及「打开Web」按钮，`main.js` 新增 `OnOpenWebClick` 回调，点击后经 launcher `/dock` 自动在系统默认浏览器（优先 Chrome/Edge）打开 `http://127.0.0.1:14096`，消除 Mac 端「WPS 内操作、浏览器里手动输地址对话」的割裂感

### Changed

- 安装脚本输出更详细的状态信息
- `getActiveDocument` 输出格式：`页数` → `总段数`，对齐 COM 实际返回字段（`paragraphCount`）
- `proofreadBasic` 增加异常空格检测（连续空格 / 全角空格）
- manifest.xml Version → 1.1.0
- SSE 指数退避：初始 1s，最大 30s
- `taskkill` 参数：`/PID xxx /F` → `/F /PID xxx 2>nul`
- `convert.ts` 恢复 `getAppTypeByExtension` / `getFormatCode` 为 export
- 5 个 PPT 工具标记为 `[DEPRECATED]`（提示使用现代替代工具）
- `add_speaker_notes` handler 转发至 `set_slide_notes`
- 7 对重复工具逐一比对：#1-#5 修复 deprecated 消息提示额外功能，#3/#6 移除 deprecated（功能不同）

### Security

- XSS 防护：safeInput 函数
- 配置持久化：CONFIG 对象
- Launcher 路径安全：配置文件读取、cwd 验证
- 进程管理优化：PID 文件精确终止
- 配置防御性检查：loadOpenCodeConfig 函数
- spawn 参数数组化（安全改进）
- **path-safety.ts** 路径遍历保护（所有接受文件路径的 handler 强制校验）
- **CORS 白名单**：`access-control-allow-origin: *` → `http://127.0.0.1:14096`
- **URL 注入防护**：launcher.js dockWindow 仅允许 http/https 协议 + 127.0.0.1/localhost
- **validateCwd 增强**：拒绝 UNC 路径和 DOS 设备路径
- **launcher.js stateLock**：防止 `/start` 并发请求
- **JSON 命令重放防护**：PluginStorage 轮询 + 时间戳去重
- **wmic 进程验证**：stopOpenCodeByPort 在 kill 前确认进程名

### Fixed

- GetUrlPath 简化为 URL API
- **Mac 侧 `setCellFormat` 支持视觉格式**：补齐 `format` 对象内 bold/italic/fontSize/fontName/fontColor/bgColor/underline/strikethrough/对齐/wrapText/numberFormat 处理，与 Windows `wps-com.ps1` 行为对齐（此前仅处理 4 个顶层参数，其余被静默丢弃）
  - 颜色支持 `format` 内优先、顶层 `fontColor`/`bgColor` 兼容旧调用
  - `fontSize` 仅接受正数（忽略 0/负数，避免边界值被静默处理或抛错）
  - 新增 22 个单元测试（tests/setcellformat-mac.test.js），路径改为 `__dirname` 固化，并接入 CI 测试步骤
- 网络请求重试：fetchWithRetry
- SSE 自动重连：connectSSE 增强
- WPS 就绪检查：checkWpsReady, checkDocument
- MCP COM 重试+超时：execWpsActionWithRetry
- 全局变量封装：AppState 单例
- proofread.ts 路径遍历漏洞（B1）
- formula.ts 3 个 handler 缺少 try/catch（B2）
- launcher.js dockWindow 命令注入（B4）
- launcher.js validateCwd UNC/DOS 设备路径泄露（B5）
- 删除 dock-debug.log 泄露（B7）
- proxy 端口冲突 14097 → 14098
- macOS 运行时校验：10 个 handler 添加 `process.platform === 'win32'` 守卫
- unhandledRejection 触发 process.exit 保留
- gateway.test.ts uuid v14 ESM mock 修复
- chart.ts/image.ts validateFilePath 移入 try 块内部（3 处）
- launcher.js stateLock 死锁 → try/catch/finally 保护
- main.js JSON 命令缺少 cmd 字段时跳过处理
- JSDoc 注释补充 25 处（main.js×10 + launcher.js×6 + taskpane.html×9）

---

## [1.1.1] - 2026-08-06

### Fixed

- **清理 Issue #78 无效修复代码（确认为 WPS 宿主 bug，Issue #78 七诊收尾，PR #112）** — 经 6 轮实机验证（PR #79/#83/#90/#109）确认「侧边栏 chatui 头部被遮挡 + WPS 顶栏标签被压扁」为 **WPS 宿主 TaskPane 布局 bug**，插件侧无法修复（仅新建标签/切标签可临时恢复）。清理全部无效修复代码（净删 889 行，+9/-889）：① `opencode-wps/main.js` 删除宿主重绘模块（`forceTaskPaneRedraw`/`scheduleTaskPaneOpenRedraw`/`registerWindowActivateReflow` 及配套状态变量/常量/`WindowActivate` 监听注册），`OnAddinLoad` 恢复仅初始化枚举+连接 OpenCode；② `opencode-wps/taskpane.html` 删除「头部遮挡自愈」IIFE（`forceReflowFix`/`scheduleReflowFix`/resize/visibilitychange 监听/定时器兜底）与 `showChat()` 中的自愈调度调用，`html,body` 布局恢复标准 `width:100%;height:100%`；③ `tests/taskpane-dock.test.js` 删除重绘/自愈相关用例（43 → 20）；④ `docs/WPSJS_DEVELOPMENT.md` 删除注意事项第 15/16 条与「头部遮挡修复实机验收步骤」章节。**保留**：PR #79 的任务窗格基础健壮性代码（右侧停靠默认、判空回退重建、全链路 try/catch 留痕、内存 ID 兜底）——通用质量提升，与 WPS bug 无关。验证：5 轮 review-修复循环问题清零 + 8 套件 **193 用例全绿** + CI success + 全仓库零残留扫描通过

## [1.0.0] - 2026-04-21

### Added

- WPS JS 加载项（opencode-wps）
- MCP 服务器（wps-office-mcp）
- 4 个 Skills（wps-word, wps-excel, wps-ppt, wps-office）
- Launcher 进程管理
- 一键安装脚本（install-addons.js）
- Markdown 渲染
- 多会话管理
- SSE 流式对话

### Features

- 任务窗格 Chat UI
- Ribbon 按钮
- WPS COM 桥接（PowerShell）
- 约 200 个 MCP 工具

---

## 历史版本

请查看 [Releases](https://github.com/lnxsun/opencode-wps/releases)（国内镜像：https://cnb.cool/lnxsun/opencode-wps/-/releases）查看所有版本。
