'use strict';

/**
 * 发布留痕连通性守卫的**单一来源数据清单**（Issue #380 12/12 复盘 · 铁律 22 预防性闭环）。
 *
 * 病灶（本轮实测，附复现命令）：
 *   发布四要素（版本号 / CHANGELOG / 产物 / Release Notes）与**代码真值**之间
 *   **没有任何连通断言** —— 于是同一类「断档」换形态复发：
 *     · ① `git tag v1.11.0` 指向的提交里 `package.json.version` 仍是 `1.10.0`
 *          （实测：`git show v1.11.0:package.json | grep version` → `1.10.0`）；
 *     · ② `CHANGELOG.md` 的 `## [1.11.0]` 段**漏记已合入 main 的变更**（PR #381 段 0 处提及
 *          PR #375 方案 A，而 `b242dfa` 已是 main 现值）—— 两个 competing PR 各写一份段，
 *          无断言要求「段 ↔ 已发布 tag」对账。
 *   ⇒ 与 #353（断档编号）/ #357（已删机制）**同族**：文档/标签的「名」与实现真值之间无连通断言。
 *
 * 本清单只承载**数据**：待校验的标签命名口径与产物/文档落点；判据纯函数在
 * `scripts/lib/release-connectivity-scope.js`（该模块内**无仓库路径字面量**，沿用单源口径）。
 *
 * ⚠️ 数据清单模块本身**不做 IO**：git 与文件读取由守卫 CLI 编排。
 */

/** 版本标签命名口径：`v<major>.<minor>.<patch>`（本仓既有惯例）。 */
const TAG_VERSION_PATTERN = /^v(\d+\.\d+\.\d+)$/;

/**
 * 版本**下限**（声明式截断，非逐个标签豁免）。
 *
 * 为什么需要：仓库历史里 `v1.9.7` 及更早的标签**先于**「发布标签 ↔ 版本号/CHANGELOG」惯例建立
 * （实测：`v1.9.2`/`v1.9.3` 指向提交版本为 1.9.1；`v1.9.2`/`v1.9.3`/`v1.9.7` 无 CHANGELOG 段）。
 * 若逐标签豁免 ⇒ 即「自许可通道」（本仓反复在治的形态）。故改为**一条均匀适用的版本下限**：
 * 仅对 `>= 本下限` 的标签断言连通性；下限及以上的**全部**标签一律受判据约束，无例外口。
 *
 * ⚠️ 下限是**声明式常量**，改它必然产生本文件 diff（可评审）；且下限只能**不变或下调门槛更严**
 *  —— 上调下限 = 放宽（须走 PR 评审留痕，不能静默上调，故本守卫额外断言「下限不得高于 min(现存标签)」，
 *  见 `checkFloorNotRegressive`）。
 */
const VERSION_FLOOR = '1.9.8';

/** 把 `X.Y.Z` 解析为可比较的数值数组（不足补零）。 */
function parseVersion(v) {
  const parts = String(v)
    .trim()
    .split('.')
    .map(n => parseInt(n, 10));
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).map(n => (Number.isFinite(n) ? n : 0));
}

/** a >= b 的版本比较（同口径，唯一实现）。 */
function versionGte(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] > y[i]) return true;
    if (x[i] < y[i]) return false;
  }
  return true;
}

/** 版本号的单一来源（与 `validate-versions.js` 同源）：根 package.json。 */
const VERSION_SOURCE = 'package.json';

/** 发布分支（判据③：发布标签必须可达此分支）—— 单一来源，改它必然产生本文件 diff（可评审）。 */
const RELEASE_BRANCH = 'main';

/** CHANGELOG 落点（发布段必须存在的唯一文档真值）。 */
const CHANGELOG_FILE = 'CHANGELOG.md';

/** CHANGELOG 版本段标题口径：`## [X.Y.Z]`（Keep a Changelog）。 */
const CHANGELOG_SECTION_PATTERN = /^##\s+\[(\d+\.\d+\.\d+)\]/;

/** Release Notes 落点目录（判据④：`docs/releases/vX.Y.Z.md`）。 */
const RELEASE_NOTES_DIR = 'docs/releases';

/** Release Notes 文件命名口径：`vX.Y.Z.md`（取捕获组 1 为版本号）。 */
const RELEASE_NOTES_PATTERN = /^v(\d+\.\d+\.\d+)\.md$/;

/**
 * 判据④ 的「本次发布内容」章节标题口径 —— 只有该章节内的引用计入连通断言。
 *
 * 为什么限定章节：Release Notes 顶部「关联」行与文末 `Ref:` 会列出**背景关联** PR/Issue
 * （如 v1.14.2 顶部列 #404 仅为关联），把它们一并计入会把「引用即须留痕」误扩到背景项。
 */
const RELEASE_NOTES_CONTENT_SECTION_PATTERN = /^##\s*一、/;

/** 判据④ 的编号引用口径：`#<数字>`（Issue / PR 同形）。 */
const REF_NUMBER_PATTERN = /#(\d+)/g;

/**
 * 判据④ 的版本下限（声明式截断，非逐条豁免）。
 *
 * 为什么需要：`v1.10.0` 及更早版本的 Release Notes 与 CHANGELOG 段口径尚未对齐
 * （实测：v1.10.0 §一 引用 #370/#371/#372 未进 CHANGELOG 段）—— 那是「惯例建立前」的历史，
 * 若逐个补录 ⇒ 即「无限回溯」；若逐条豁免 ⇒ 「自许可口袋」。故改为**一条均匀适用的下限**：
 * 仅对 `>= 本下限` 的 Release Notes 断言「§一 引用 ⊆ CHANGELOG 段引用」，无例外口。
 *
 * ⚠️ 下限只能**不变或下调**（更严）；上调 = 放宽，须走 PR 评审留痕。守卫 CLI 侧有**两条**防退化断言
 * （与判据⓪ 同口径）：① 下限不得高于当前版本源版本；② 下限不得使判据面为空（全部发布说明均不在面）。
 * 专测见 `tests/validate-release-connectivity.test.js` 的「CLI 端到端变异：下限使判据面为空」。
 */
const RELEASE_NOTES_CONTENT_FLOOR = '1.13.0';

/**
 * 判据⑥ 的**发布产物**命名口径（Issue #399 13/13 复盘第三轮 · 铁律 22 预防性闭环）。
 *
 * 病灶（本轮实测发现，门禁遮蔽）：发布四要素之三「③ 发布产物」在提示词/文档中**声明**，
 * 但 `validate:release-connectivity` 判据 ⓪~⑤ **全部只看标签/CHANGELOG/Release Notes**，
 * **无任何断言覆盖产物（tarball）本身** ⇒ 「产物没做/名字写错/没进发布分支」长期可静默通过。
 * 实测：本轮把 6 个版本 tarball 逐一 `tar -tzf` 核对，才发现产物链**逐版本翻倍**
 * （1.14.1 2.9M → 1.14.6 93M，内含上一版 tarball ⇒ 指数增长）—— 正是「无断言 ⇒ 无症状」。
 *
 * 判据⑥ 的定位（**最小必要**）：只断言「每个 ≥ 下限的发布标签，其**待发布树**内存在
 * 与版本号同名的产物 `opencode-wps-v<X.Y.Z>.tar.gz`」—— 把「产物是否存在且与版本连通」这一
 * **可见形态**纳入门禁。**不**校验产物内容/体积/校验和（属人工评审，见自限）。
 */
const ARTIFACT_NAME_PATTERN = /^opencode-wps-v(\d+\.\d+\.\d+)\.tar\.gz$/;

/**
 * 判据⑥ 的产物文件名**唯一构造函数**（R1 评审 · 铁律 24 第 2 维「契约唯一」）。
 *
 * 为什么必须单源：命名口径 `opencode-wps-v<版本>.tar.gz` 曾在本 PR 里**三处各写一遍**
 * （CLI 两次字面量 + scope 默认兜底）—— 同一语义多份实现，改口径要动多处（本仓反复在治的形态）。
 * 现构造与校验**同处**：`artifactName` 造出的名字必然匹配 `ARTIFACT_NAME_PATTERN`
 * （守卫内另有自证分支，防两处漂移）。改名口径只此一处。
 *
 * @param {string} version 版本号（`x.y.z`）
 * @returns {string} 产物文件名
 */
function artifactName(version) {
  return `opencode-wps-v${version}.tar.gz`;
}

/**
 * 判据⑦ 的**打包排除口径**（Issue #417 · 铁律 22 预防性闭环）—— 唯一事实源。
 *
 * 病灶（实测）：`git archive` 打包**全部 git 跟踪文件**，而历史产物 `opencode-wps-v<X.Y.Z>.tar.gz`
 * 自 v1.14.1 起均被提交 ⇒ 新产物**递归包含全部历史产物** ⇒ 体积逐版本约翻倍（实测 1.14.1 2.9M
 * → 1.14.6 93M → 1.14.7 186M）。判据⑥ 只断言产物「存在性/命名」，**内容/体积**属其显式自限。
 *
 * 本常量是仓库根 `.gitattributes` 里那行 `export-ignore` 的**唯一声明**；判据⑦ 断言「文件里的 pattern
 * ↔ 本常量」且「本常量 ↔ 唯一构造函数 `artifactName()`」同源 —— 改一处漏一处即报红。
 *
 * ⚠️ 不用更宽的 `*.tar.gz`：与产物命名口径**不同源**（匹配任意归档），改名口径时两处不同步。
 */
const ARTIFACT_EXPORT_IGNORE_PATTERN = 'opencode-wps-v*.tar.gz';

/**
 * 判据⑦ 的**体积基线**（= 本仓产物应有的量级；**实测值**，非估计，Issue #417）。
 *
 * 实测依据：排除历史产物后源码 archive 的 gzip 后体积 = **1,634,373 B ≈ 1.6 MiB**
 * （`git archive --format=tar HEAD | gzip -9 | wc -c`；修正前 389,341,079 B）。
 *
 * ⚠️ 判据⑦ 的**自由参数只保留 2 个绝对量**（本基线 + 下面的余量倍率），其余全部派生。
 *   为什么（第 3~5 轮评审实测的结构性结论）：首版 1 个自由量（上界）→ 加锚成 2 个（+基线）
 *   → 加判据面成 4 个（+倍率 +漂移）——每加一个「防护参数」就多一处**可被同步放大**的文本
 *   （#416 的 E1 记账链同构形态），实测「两处同步」「三处同步」均 `EXIT=0` 零信号。
 *   ⇒ 收敛：`ARTIFACT_SIZE_LIMIT_BYTES` 改为**派生量**（恒等式），只剩本基线与余量倍率两个自由量。
 */
const ARTIFACT_SIZE_BASELINE_BYTES = 1634373;

/**
 * 判据⑦ 的**唯一自由倍率** —— 上界由它**派生**（`上界 = 基线 × 本倍率`，恒等式）。
 *
 * 余量设计：16× ⇒ 基线 1,634,373 B 时上界 ≈ 25 MiB（与放宽前的硬上界同阶，构造保证 16× 余量）。
 * `ARTIFACT_SIZE_LIMIT_BYTES` 不再独立声明 ⇒ 「只改上界」在语法上不可能（恒等式由构造保证）；
 * 「同步放大基线 + 倍率」由判据⑦ 的**倍率绝对上限**与**基线↔实测对账**两条独立断言拦住。
 */
const ARTIFACT_SIZE_TOLERANCE_RATIO = 16;

/**
 * 判据⑦ 的**产物体积硬上界** —— **派生量**（`= 基线 × 唯一自由倍率`），非独立字面量。
 *
 * 为什么不独立声明（第 5 轮评审实测真缺陷 CR5-1）：独立声明即多一处可被**同步放大**的文本；
 * 派生后「上界 ↔ 基线 × 倍率」是**恒等式**（构造保证），杜绝「改一侧漏另一侧」。
 */
const ARTIFACT_SIZE_LIMIT_BYTES = ARTIFACT_SIZE_BASELINE_BYTES * ARTIFACT_SIZE_TOLERANCE_RATIO;

/**
 * 判据⑦ 漂移对账的**独立参照**（防判据面自排除 —— CR4-1 实测真缺陷）。
 *
 * 为什么必须独立：判据面若锚在 `BASELINE` / `LIMIT` / `TOLERANCE_RATIO` 任一上，而三者
 * 均可被同步放大 ⇒ 判据面**自己把自己排除**（实测：基线放大后 `live × drift < base`；
 * 上界放大后 `live × ratio < limit` ⇒ 两次都跳出面 ⇒ 零信号）。
 * 本参照 = 「本仓产物应有的量级下界」，与上述三者**互不派生**：
 * 判据面 = `当场实测 × 漂移上限 ≥ 本参照`。小仓库实测极小 ⇒ 不在面内（防假红）。
 */
const ARTIFACT_SIZE_REF_BYTES = 1024 * 1024;

/**
 * 判据⑦ 基线相对**当场实测**的漂移上限（CR4-1）。
 * 口径：`基线 ≤ 当场实测 × 本值` —— 防「基线与上界同步放大」。
 */
const ARTIFACT_SIZE_BASELINE_MAX_DRIFT = 4;

/**
 * 判据⑦ 余量倍率的**绝对上限**（CR5-1）。
 *
 * 为什么需要：第 5 轮实测发现「倍率 + 基线 + 上界**三处同步放大**」仍 `EXIT=0` 零信号 ——
 * 倍率本身也是自由参数。故给倍率一个**绝对上限**（声明式常量，与其它量均无派生关系）：
 * `TOLERANCE_RATIO ≤ 本值`。定值：现值 16 ⇒ 上限 32 留 2× 放宽余量，拦住数量级级别的放宽。
 */
const ARTIFACT_SIZE_RATIO_CEILING = 32;
/**
 * 判据⑥ 的版本下限（声明式截断，非逐条豁免）。
 *
 * 为什么需要：产物 tarball 惯例自 **v1.14.1** 起建立（实测 `main` 树内 `opencode-wps-v1.14.0.tar.gz`
 * **不存在**，1.14.1 起才逐版本提交产物）⇒ 对更早标签断言会误伤「惯例建立前」的历史。
 * 与判据④ 同口径：一条均匀下限，无例外口；下限只可**不变或下调**（更严），上调即放宽须评审留痕。
 *
 * ⚠️ **不是同一个 floor**：`RELEASE_NOTES_CONTENT_FLOOR` 量的是「**文档/提交**惯例建立点」，
 * 本常量量的是「**产物**惯例建立点」——两者数值接近但**口径不同**，**勿同步改**（改一处漏一处
 * ⇒ 判据面漂移）。各自有独立的「不得静默放宽」断言（判据⑥ 见 CLI 的「判据面为空即报红」）。
 */
const RELEASE_ARTIFACT_FLOOR = '1.14.1';

/**
 * 判据⑨ 的**历史产物处置决策**（Issue #419 · 铁律 22 预防性闭环）—— 唯一事实源。
 *
 * 病灶（#419 = #417 AC-6 拆分，实测）：1.14.1~1.14.6 六个历史 tarball ≈186MB，而判据⑥ 的**判据面
 * 恰好就是它们**（`RELEASE_ARTIFACT_FLOOR` = 产物惯例建立点 ⇒ 判据面 = 这六个版本）⇒ 「删历史产物」
 * = 掏空判据面本身（实测报红 6 条）。处置结论若只写在 Issue 文字里，那是**人类纪律**不是断言。
 *
 * 本常量把结论落成**声明式登记**（改它必产生 diff ⇒ 可评审），由判据⑨ 断言「曾入库的产物不得
 * 从待发布树内静默消失」。⚠️ **不**用「历史版本豁免清单」（Issue 候选方案 B）：实测把
 * `ARTIFACT_FLOOR_EXEMPT_TAGS = ['v1.14.1']` 埋进本文件，轴 I 归属侧**零信号**（该文件早已命中
 * `guard-source-budget` 语义键 ⇒ 同文件内新符号结构性不可见）⇒ 那正是静默放宽口袋，故否决 B。
 */
const ARTIFACT_FLOOR_DECISION_REFS = ['#417', '#419'];
/** 判据⑨ 的「未决处置」下限：`[FLOOR, 本值)` 区间是 #419 的**待处置对象**（保留、不动，不做断言）；
 *  `>= 本值` 的产物**必须**在树内。声明式常量，改它必产生 diff。（#419 决策：1.14.1~1.14.6 不动） */
const ARTIFACT_FLOOR_UNDECIDED_BELOW = '1.14.7';

/**
 * 判据⑤ 的「CHANGELOG 声称行」识别口径（Issue #399 13/13 复盘）—— message 内同一行同时出现
 * 「CHANGELOG」关键词与「写入动词」（新增/补/写入/补录），即为一条「声称 CHANGELOG 已落地 X」的行。
 *
 * 为什么用「关键词共现」而非固定句式：message 写法多样（`- CHANGELOG：新增 ## [1.14.2] 段（…）`），
 * 固定句式必然漏；共现口径把「提到 CHANGELOG 且声称写入」的都拉进判据面。
 */
const RELEASE_COMMIT_CHANGELOG_CLAIM_PATTERN = /CHANGELOG/i;

/**
 * 判据⑤ 的「写入动词」口径 —— 与 CHANGELOG 关键词**在同一行共现**才算一条「声称已落地 X」的行。
 *
 * 为什么必须共现（本轮实测假红修正）：只认「出现 CHANGELOG」会把标题前缀（`docs(changelog):`）、
 * 范围名、普通提及全部拉进判据面，其行内无关的 `#NNN`（如 PR 号 `(#411)`）被误判为「声称落地的引用」
 * ⇒ 对合法提交大面积假红（实测：39cc33f / e32d250 / 7e321de 等 6 条被误报）。名实一致要求
 * 「CHANGELOG + 写入动词」共现，才构成「声称 CHANGELOG 已写入」。
 */
const RELEASE_COMMIT_WRITE_VERB_PATTERN = /(新增|补录|补写|写入|加上|添加|补记)/;

/**
 * 判据⑤ 的「**见证词**」口径（Issue #399 13/13 复盘第二轮 · 真缺陷修正）。
 *
 * 病灶（本轮实测，真缺陷 · 判据⑤ 对**自身头号反例**假阴性）：原判据⑤ 的「声称集合」只收
 * 声称行内的 `#<数字>` ⇒ 当 message 声称的是**非编号见证词**（如 `G3 跨 app 恒拦修复` 的 `G3`）
 * 时，该见证词**永不进入声称集合**。实测反例 `77d9e76`：
 *   message 声称「CHANGELOG：新增 ## [1.14.2] 段（**G3** 跨 app 恒拦修复 + …），并把 #400 内容归位到 1.14.1」
 *   其 CHANGELOG diff 新增行 **0 处**提及 `G3`/`#399`/`#404`，但该行内唯一的 `#<数字>` 是 `#400`，
 *   而 `#400` **恰好在**同提交 diff 新增行中（另一条目）⇒ 子集断言**通过** = 假阴性。
 *   ⇒ PR #413 宣称的「变异自证（还原修复前 ⇒ 报红 #399/#404/G3）」**实为判据④ 的行为**，
 *   判据⑤ 自身对 `77d9e76` **放行**（本轮实测：`checkReleaseCommitClaim` errors 为空）。
 *
 * 修正：声称集合 = 声称行内的**见证词**（编号 `#<数字>` **或** 功能代号 `G<数字>`/`P<数字>`/`T<数字>`），
 * 逐个断言「真在该提交 diff 新增行中出现」。功能代号口径与本仓治理规则编号同形
 * （`governance.js` 的 G/P/T 分区），非本模块自造。
 */
const RELEASE_COMMIT_WITNESS_PATTERN = /#[0-9]+|\b[GPT][0-9]{1,2}\b/g;


/**
 * 判据⑤ 的扫描**语义边界**（R5 评审修）—— 与判据④ 同源：只扫 **>= 判据④ 版本下限** 的提交。
 *
 * 为什么不用条数窗口（`-n 40`）：条数窗口会随主线提交密度**静默收窄**判据面
 * （实测：40 条窗口内仅 9 条 release 提交，全历史 81 条）⇒ 仍 >= 下限的旧 release 提交会悄悄掉出窗口
 * （与 Issue #352 第十一刀「静默降级为假绿」同族）。改用**版本边界**（下限 tag 的提交范围）
 * 后，判据面不随提交密度漂移；下限本身是声明式常量（`RELEASE_NOTES_CONTENT_FLOOR`），改它必产生 diff。
 *
 * 上限（防全历史扫描的**兜底**，非判据面主口径）：仅当仓库异常庞大时截断，正常情况不触发。
 */
const RELEASE_COMMIT_SCAN_LIMIT = 500;

/**
 * 判据⑤ 的**历史边界**（Issue #399 13/13 复盘第二轮 · 真缺陷修正的配套口径）。
 *
 * 为什么需要：判据⑤ 的第二轮修正把「见证词」扩为「编号 ∪ 功能代号」后，**真实捕获**了它自己宣称的
 * 头号反例 `77d9e76`（v1.14.2 发布提交：message 称含 `G3`，diff 新增行 0 处提及 `G3`）。
 * 但 `77d9e76` 是**不可变的历史提交** —— 其缺陷已由 PR #411（v1.14.3）**补录 CHANGELOG 闭环**，
 * 提交 diff 本身无法回改。若不设边界，判据⑤ 会对这条**已闭环的历史**永久报红 ⇒ 门禁不可用。
 *
 * 口径（**声明式、可审计**，非「静默豁免」）：只对 **本提交之后** 产生的提交断言判据⑤。
 * 边界提交**本身及其祖先**不在判据面（`<SINCE>..HEAD` 用 git range 语义 = **不含** SINCE）—— 这是**一条**
 * 均匀适用的时间边界（不是逐提交白名单口袋），
 * 改它必然产生本文件 diff（可评审）。边界 = `77d9e76`（**不含**该提交）—— 即判据⑤ 尚未生效的**最后一条**
 * 历史发布提交；判据⑤ 的语义起点是它**之后**的提交。
 *
 * ⚠️ 与 `RELEASE_NOTES_CONTENT_FLOOR` 的区别：后者按**版本号**截断（判据④ 面）；本常量按**提交**
 * 截断（判据⑤ 面）—— 因为判据⑤ 的判据面本就是「提交集合」，用提交边界才是同一维度的口径。
 */
const RELEASE_COMMIT_CLAIM_SINCE = '77d9e76';

/**
 * 判据⑤ 历史边界的**已验证反例登记**（可审计：边界内的已知假留痕，如实列出而非假装不存在）。
 * 用途：① 文档化「为什么需要这条边界」；② 专测据此断言边界**确实**排除了该反例（防边界被误删）。
 */
const RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES = [
  {
    sha: '77d9e76',
    why: 'v1.14.2 发布提交 message 称 CHANGELOG 含 G3 修复，diff 新增行 0 处提及 G3（假留痕）；已由 PR #411 补录闭环，提交不可改',
  },
];

module.exports = {
  TAG_VERSION_PATTERN,
  VERSION_FLOOR,
  VERSION_SOURCE,
  RELEASE_BRANCH,
  CHANGELOG_FILE,
  CHANGELOG_SECTION_PATTERN,
  RELEASE_NOTES_DIR,
  RELEASE_NOTES_PATTERN,
  RELEASE_NOTES_CONTENT_SECTION_PATTERN,
  REF_NUMBER_PATTERN,
  RELEASE_NOTES_CONTENT_FLOOR,
  RELEASE_COMMIT_CHANGELOG_CLAIM_PATTERN,
  RELEASE_COMMIT_WRITE_VERB_PATTERN,
  RELEASE_COMMIT_WITNESS_PATTERN,
  RELEASE_COMMIT_SCAN_LIMIT,
  RELEASE_COMMIT_CLAIM_SINCE,
  RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES,
  ARTIFACT_NAME_PATTERN,
  artifactName,
  RELEASE_ARTIFACT_FLOOR,
  ARTIFACT_FLOOR_DECISION_REFS,
  ARTIFACT_FLOOR_UNDECIDED_BELOW,
  ARTIFACT_EXPORT_IGNORE_PATTERN,
  ARTIFACT_SIZE_LIMIT_BYTES,
  ARTIFACT_SIZE_BASELINE_BYTES,
  ARTIFACT_SIZE_TOLERANCE_RATIO,
  ARTIFACT_SIZE_REF_BYTES,
  ARTIFACT_SIZE_BASELINE_MAX_DRIFT,
  ARTIFACT_SIZE_RATIO_CEILING,
  parseVersion,
  versionGte,
};
