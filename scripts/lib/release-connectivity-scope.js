'use strict';

/**
 * 发布留痕连通性判据纯函数（Issue #380 12/12 复盘 · 铁律 22）。
 *
 * 单一来源（#321 R9-A 同口径）：本模块**不出现任何仓库路径字面量**，
 * 标签口径 / 版本源 / CHANGELOG 口径一律由 caller 单源传入
 * （数据单源 = `release-connectivity-manifest.js`）。本模块只提供纯判据。
 *
 * 六条判据（同为「发布标签/发布提交/发布产物 ↔ 代码/文档真值」的连通断言）：
 *   ⓪ 版本下限：只对 `>= floor` 的标签断言（声明式截断，非逐标签豁免；floor 口径由 caller 单源传入）。
 *   ① 标签 ↔ 版本号：`vX.Y.Z` 标签所指向提交里的版本源版本，必须等于 `X.Y.Z`。
 *      反例（本轮实测，真缺陷）：`v1.11.0` → `package.json.version = "1.10.0"`。
 *   ② 标签 ↔ CHANGELOG 段：每个 `vX.Y.Z` 标签，CHANGELOG 必须存在 `## [X.Y.Z]` 段。
 *      反例：打了 tag 却没把 `[Unreleased]` 归档成对应版本段。
 *   ③ 标签 ↔ 发布分支可达（Issue #383 13/13 复盘 · 铁律 22）：`vX.Y.Z` 标签必须**可达发布分支**
 *      （`main`）。反例（本轮实测，真缺陷）：`v1.13.0` 标签已创建、其指向提交版本号/CHANGELOG 段
 *      自洽，但该标签提交**不可达 main**（发布变更 PR #390 未合并）⇒ main 上仍是 `1.12.0`，
 *      「已发布」与「发布变更未入库」并存 —— 判据①②只校验**标签自身**，对「标签游离在主线之外」无感。
 *   ④ 发布说明 ↔ CHANGELOG 段**内容**连通（Issue #399 11/13 发布补正 · 铁律 22）：`docs/releases/vX.Y.Z.md`
 *      的「§一 本次发布内容」引用的编号，必须出现在 CHANGELOG 的 `## [X.Y.Z]` 段**或任一更早版本段**。
 *      反例（本轮实测，真缺陷）：`docs/releases/v1.14.2.md` §一 列 PR #404/Issue #399/#405，
 *      而 CHANGELOG 1.14.2 段 0 处提及 —— **发布四要素之二（CHANGELOG）与之三（Release Notes）
 *      各写一份、互无连通断言** ⇒ 内容级漏记可长期存在（原自限②的可见形态）。
 *   ⑤ 发布提交 message ↔ 其 CHANGELOG diff 落地（Issue #399 13/13 复盘 · 铁律 22）：发布提交
 *      message 声称「CHANGELOG 新增 X」时，其 CHANGELOG diff **新增行**必须提及该引用。
 *      反例（本轮实测，真缺陷）：`77d9e76` message 称「CHANGELOG 新增 1.14.2 段（G3 跨 app 恒拦修复）」，
 *      而其 CHANGELOG diff 新增行 0 处提及 #399/#404/G3 = **message 层空头承诺（假留痕）**；
 *      判据①②④ 均只看真值侧，对「message 声称」侧无覆盖 ⇒ 本判据补上这一维。
 *
 * ⚠️ 自限（显式披露，非放宽）：
 *   ① 只校验**本地可见的标签**（`git tag`）—— 平台侧 Release 是否创建、附件是否上传
 *      **不声称**由本守卫拦住（需平台 API，CI 无凭据；铁律 24 防御式度量：不假装拦住）；
 *   ② 判据②只校验 CHANGELOG「段**是否存在**」，不校验段内容是否完整覆盖已合入 main 的变更
 *      —— 该缺口**已部分收口**：判据④（Issue #399 补正）新增「发布说明 §一 引用 ⊆ CHANGELOG 段（含更早段）引用」
 *      连通断言，可拦「发布说明列了、CHANGELOG 段没写」这一**可见形态**（本轮 #399/#404 即被拦）。
 *      **残余自限**：「变更 ↔ 条目」的完整语义映射仍属人工评审（如既无 Release Notes、
 *      CHANGELOG 又漏记的情形不在判据面），不假装拦住；
 *   ③ 只认 `v<数字>.<数字>.<数字>` 形态的标签；其他命名（如 `release-*`）不在判据面；
 *   ④ 判据③只校验「标签 vs 发布分支**本地可见引用**」的可达性 —— 平台侧是否已把发布 PR
 *      合并到主线**不声称**由本守卫拦住（需平台 API，CI 无凭据）；分支撑未 fetch 时如实报
 *      「无法判定」而非假装通过；
 *   ⑤ 判据④ 只校验**编号引用是否存在**（`#<数字>` token 是否出现在 §一 / CHANGELOG 段），
 *      **不校验语义归属** —— 「贴一个编号凑留痕」（编号出现在段内但与该条目无关）不声称拦住
 *      （那需要「条目 ↔ 编号」的语义映射，属人工评审）。本判据的定位是**可自动化的可见形态**守卫：
 *      拦「发布说明列了、CHANGELOG 段整段没写」这一最常见漏记，第 2 轮评审已实测并如实登记。
 *   ⑥ 判据⑤ 只认「**同一行内** CHANGELOG 关键词 + 写入动词 + **见证词**」的**可见形态** ——
 *      见证词 = 编号（`#<数字>`）**或**功能代号（`G<数字>`/`P<数字>`/`T<数字>`）。
 *      跨行声称（`- CHANGELOG：` 换行后列编号）、**纯自然语言无见证词**的声称（「修了校对抽风」）
 *      **不声称**拦住；且只校验「声称的见证词是否真在 diff 新增行出现」，**不校验** diff 条目的语义正确性
 *      （属人工评审）。
 *      ⚠️ 第 13/13 复盘**第二轮**实测真缺陷（原自限①的可见形态）：原实现只收 `#<数字>` ⇒
 *      对**自身头号反例** `77d9e76` **假阴性**（其见证词 `G3` 非编号，该行唯一的 `#400` 恰在 diff 中
 *      ⇒ 子集断言通过 ⇒ 放行）。现扩为「编号 ∪ 功能代号」见证词口径后该反例被真实捕获。
 *   ⑥ 发布产物 ↔ 版本号连通（Issue #399 13/13 复盘第三轮 · 铁律 22 预防性闭环）：
 *      每个 `>= 产物下限` 的发布标签 `vX.Y.Z`，其**待发布树**内必须存在与版本号同名的产物
 *      `opencode-wps-vX.Y.Z.tar.gz`（存在性 + 版本号同名；**不**校验内容/体积/校验和，见自限）。
 *      为何查分支树而非标签提交：本仓产物惯例为「四要素提交 → 产物提交」两段，标签树内无 tarball。
 */

/**
 * 判据①：标签 ↔ 版本号连通。
 *
 * @param {Array<{tag:string, match:RegExpMatchArray|null, version:string|null}>} entries
 *   每项 = 一个标签、其命名匹配结果、该标签所指向提交里的版本源版本（读不到为 null）。
 * @param {object} [o]
 * @param {string} [o.floor]          版本下限（低于它的标签不参与判据）
 * @param {Function} [o.versionGte]   `(a,b)=>a>=b` 版本比较（单源传入）
 * @returns {string[]} errors（空 = 通过）
 */
function checkTagVersionConnectivity(entries, o) {
  const errors = [];
  const opts = o || {};
  const floor = opts.floor;
  const gte = opts.versionGte || (() => true);
  const list = Array.isArray(entries) ? entries : [];
  for (const e of list) {
    if (!e || !e.match) continue; // 非版本标签：不在判据面（自限③）
    const want = e.match[1];
    if (floor && !gte(want, floor)) continue; // 低于版本下限：不参与（声明式截断）
    if (e.version === null || e.version === undefined) {
      errors.push(
        `标签 ${e.tag} 指向提交内读不到版本源版本（标题口径 ${want}）——` +
          `发布标签必须指向含版本源的真实提交`
      );
      continue;
    }
    if (e.version !== want) {
      errors.push(
        `标签 ${e.tag} 与其指向提交的版本号不一致：标签称 ${want}，提交内版本源却是 ${e.version}` +
          ` —— 发布标签与代码真值必须同一版本（本轮实测反例：v1.11.0 → 1.10.0）`
      );
    }
  }
  return errors;
}

/**
 * 判据②：标签 ↔ CHANGELOG 段落连通。
 *
 * @param {string[]} tags        本地版本标签（如 ['v1.10.0','v1.11.0']）
 * @param {string}   changelog    CHANGELOG 全文
 * @param {object}   o
 * @param {RegExp}   o.tagPattern            标签命名口径（取捕获组 1 为版本号）
 * @param {RegExp}   o.sectionPattern        CHANGELOG 段标题口径
 * @param {string}   [o.changelogFile]       文件名（仅用于报错定位）
 * @param {string}   [o.floor]               版本下限（低于它的标签不参与判据）
 * @param {Function} [o.versionGte]          `(a,b)=>a>=b` 版本比较（单源传入）
 * @returns {string[]} errors
 */
function checkTagChangelogSections(tags, changelog, o) {
  const errors = [];
  const opts = o || {};
  const tagPattern = opts.tagPattern;
  const sectionPattern = opts.sectionPattern;
  const file = opts.changelogFile || 'CHANGELOG.md';
  const floor = opts.floor;
  const gte = opts.versionGte || (() => true);
  const lines = String(changelog || '').split('\n');

  const sectionVersions = new Set();
  for (const line of lines) {
    const m = sectionPattern.exec(line);
    if (m) sectionVersions.add(m[1]);
  }

  for (const tag of Array.isArray(tags) ? tags : []) {
    const m = tagPattern.exec(String(tag));
    if (!m) continue;
    const ver = m[1];
    if (floor && !gte(ver, floor)) continue; // 低于版本下限：不参与（声明式截断）
    if (!sectionVersions.has(ver)) {
      errors.push(
        `标签 ${tag} 在 ${file} 中找不到对应版本段「## [${ver}]」——` +
          `发布了就必须把 [Unreleased] 归档成该版本段（防「打了 tag 没写 CHANGELOG」）`
      );
    }
  }
  return errors;
}

/**
 * 判据③：标签 ↔ 发布分支可达（Issue #383 13/13 复盘 · 铁律 22 预防性闭环）。
 *
 * 防什么：判据①②只校验**标签自身**是否自洽（提交内版本号 / CHANGELOG 段）—— 对
 * 「标签游离在发布主线之外」完全无感。本轮实测反例：`v1.13.0` 标签已创建、自身自洽，
 * 但其指向提交**不可达 main**（发布变更 PR #390 未合并）⇒ main 上版本仍是 `1.12.0`，
 * 「已发布」与「发布变更未入库」并存（发布四要素的『版本号/CHANGELOG』并未落到主线）。
 * ⇒ 与判据①②同族：**「发布了」的『名』与主线代码真值之间无连通断言**。
 *
 * @param {Array<{tag:string, match:RegExpMatchArray|null, reachable:boolean|null}>} entries
 *   每项 = 一个标签、其命名匹配结果、该标签是否**可达发布分支**（无法判定为 null）。
 * @param {object} [o]
 * @param {string} [o.branch]         发布分支名（仅用于报错定位）
 * @param {string} [o.floor]          版本下限（低于它的标签不参与判据）
 * @param {Function} [o.versionGte]   `(a,b)=>a>=b` 版本比较（单源传入）
 * @returns {string[]} errors（空 = 通过）
 */
function checkTagsReachableFromBranch(entries, o) {
  const errors = [];
  const opts = o || {};
  const branch = opts.branch || 'main';
  const floor = opts.floor;
  const gte = opts.versionGte || (() => true);
  const list = Array.isArray(entries) ? entries : [];
  for (const e of list) {
    if (!e || !e.match) continue; // 非版本标签：不在判据面（自限③）
    const want = e.match[1];
    if (floor && !gte(want, floor)) continue; // 低于版本下限：不参与（声明式截断）
    if (e.reachable === null || e.reachable === undefined) {
      // 无法判定（如分支撑未 fetch）：不假装通过，如实报红提示核对。
      errors.push(
        `标签 ${e.tag} 是否可达发布分支 ${branch} 无法判定（分支撑缺失？）——` +
          `发布标签必须可达 ${branch}，无法判定不得视为通过`
      );
      continue;
    }
    if (!e.reachable) {
      errors.push(
        `标签 ${e.tag} 不可达发布分支 ${branch} —— ` +
          `发布四要素（版本号/CHANGELOG）必须落在 ${branch} 上；` +
          `标签自洽不等于已发布（本轮实测反例：v1.13.0 标签自洽但发布变更 PR 未合并）`
      );
    }
  }
  return errors;
}

/**
 * 判据④：Release Notes「本次发布内容」引用 ↔ CHANGELOG 版本段引用（Issue #399 11/13 发布补正 · 铁律 22）。
 *
 * 防什么（本轮实测真缺陷）：发布**四要素之三（Release Notes）与之二（CHANGELOG）各写一份**，
 * 二者之间**无连通断言** ⇒ 「发布说明列了某修复、CHANGELOG 段却没写」这种**内容级漏记**可长期存在
 * （实测：`docs/releases/v1.14.2.md` §一 列 PR #404/Issue #399，而 `CHANGELOG.md` 1.14.2 段 0 处提及）。
 * 既有判据②只校验「CHANGELOG 段**是否存在**」，对「段**内容是否覆盖已发布变更**」无感
 * （该自限原样披露在模块头部）；本判据补上这一维：**发布说明 §一 引用的编号 ⊆ CHANGELOG 同版本段引用的编号**。
 *
 * 单一来源（#321 R9-A 同口径）：本模块无仓库路径字面量 —— 章节标题口径 / 编号口径 / 版本下限
 * 一律由 caller 单源传入。
 *
 * @param {Array<{version:string|null, refs:Array<string>}>} notes
 *   `refs` = 该版本 Release Notes「§一 本次发布内容」章节内出现的编号（如 `['#399','#404']`）。
 * @param {Object<string, Set<string>>|null} changelogRefsByVersion
 *   版本号 → CHANGELOG 该版本段内出现的编号集合。
 * @param {object} o
 * @param {string} [o.floor]                  版本下限（低于它的版本不参与判据）
 * @param {Function} [o.versionGte]           `(a,b)=>a>=b` 版本比较（单源传入）
 * @returns {string[]} errors（空 = 通过）
 */
function checkReleaseNotesConnectivity(notes, changelogRefsByVersion, o) {
  const errors = [];
  const opts = o || {};
  const floor = opts.floor;
  const gte = opts.versionGte || (() => true);
  const byVersion = changelogRefsByVersion || {};
  // 预计算「≤ 本版本」可达编号集合：按版本升序遍历累加，避免在内层循环里逐版本重建（O(n·m) → O(n)）。
  const versionsAsc = Object.keys(byVersion).sort((a, b) => (gte(a, b) ? 1 : -1));
  const reachableUpTo = {};
  {
    let acc = new Set();
    for (const ver of versionsAsc) {
      acc = new Set([...acc, ...byVersion[ver]]);
      reachableUpTo[ver] = acc;
    }
  }
  for (const n of Array.isArray(notes) ? notes : []) {
    if (!n || !n.version) continue;
    if (floor && !gte(n.version, floor)) continue; // 低于版本下限：不参与（声明式截断）
    const refs = Array.isArray(n.refs) ? n.refs : [];
    const clSet = byVersion[n.version];
    if (!clSet) {
      // CHANGELOG 缺该版本段：判据②已承担，此处不重复报红（避免同一事实两处报）。
      continue;
    }
    // 允许「引用的编号出现在**本版本或任一更早**的 CHANGELOG 段」—— 发布说明可显式回引
    // 之前版本已发布的内容（如 v1.14.2 §一「P2 不变量守卫（PR #405）已随 v1.14.1 发布」）。
    // 判据不变：该编号必须在**某个 ≤ 本版本**的段里真实留痕（不得凭空引用）。
    const reachable = reachableUpTo[n.version] || clSet;
    const missing = refs.filter(r => !reachable.has(r));
    if (missing.length > 0) {
      errors.push(
        `发布说明 docs/releases/v${n.version}.md 的「一、本次发布内容」引用了 ${missing.join('、')}，` +
          `但 CHANGELOG 的「## [${n.version}]」段及任何更早版本段均未提及 —— ` +
          `发布说明与 CHANGELOG 必须同口径（本轮实测反例：v1.14.2 §一 列 #399/#404，` +
          `CHANGELOG 全篇该两号仅 v1.14.2 RN 有、段内 0 处提及）`
      );
    }
  }
  return errors;
}

/**
 * 判据⑧（Issue #420 13/13 复盘 · 铁律 22 预防性闭环）：**发布说明文件的存在性反向断言**。
 *
 * 防什么：判据④ 是**正向**对账（Release Notes 存在时，其 §一 引用的编号须在 CHANGELOG ≤ 本版本段留痕）
 *   —— 于是「**打了 `vX.Y.Z` 标签、CHANGELOG 有 `## [X.Y.Z]` 段，却没有 `docs/releases/vX.Y.Z.md`**」
 *   这个方向**无断言覆盖**，发布四要素之一可被整份省略而门禁全绿。
 *
 * 实测复现（本轮，守卫 EXIT=0 的静默态）：
 *   mv docs/releases/v1.14.9.md /tmp/ && node scripts/validate-release-connectivity.js  → EXIT=0
 *   （输出仅显示「发布说明 14 份」——**没有**任何报红）
 *
 * 判据：`>= floor` 的每个标签 `vX.Y.Z`，都必须存在对应 `RELEASE_NOTES_PATTERN` 匹配的发布说明文件；
 *   缺失即报红（**不接受**「RN 缺失即视为判据面外」的兜底 —— 那正是本条要堵的静默省略口）。
 * 自限：只断言文件**存在**，不校验其内容完整性（内容正确性属人工评审，见判据④ 与 RN 编写规范）。
 */
function checkTagReleaseNotesExistence(tags, o) {
  const errors = [];
  const opts = o || {};
  const floor = opts.floor;
  const gte = opts.versionGte || (() => true);
  const noteVersions = Array.isArray(opts.noteVersions) ? opts.noteVersions : null;
  if (noteVersions === null) {
    errors.push(
      '判据⑧ 无法判定「每个标签是否都有发布说明」（发布说明版本清单缺失）—— 不得视为通过'
    );
    return errors;
  }
  const have = new Set(noteVersions);
  for (const t of Array.isArray(tags) ? tags : []) {
    const m = opts.tagPattern ? opts.tagPattern.exec(String(t)) : null;
    if (!m) continue;
    const ver = m[1];
    if (floor && !gte(ver, floor)) continue;
    if (!have.has(ver)) {
      errors.push(
        `标签 v${ver} 缺少发布说明 \`${(opts.notesDir || '') + 'v' + ver + '.md'}\` —— ` +
          `发布四要素之一被整份省略（判据④ 只做「有则对账」，无「缺则报红」的反向断言）`
      );
    }
  }
  return errors;
}

/**
 * 发布分支引用解析（Issue #395 13/13 复盘 · 铁律 22 预防性闭环）。
 *
 * 防什么：CLI 层原实现**探测 `refs/remotes/origin/<branch>`、却把裸 `branch`（本地分支）
 * 传给 `merge-base`** —— 两者可指向不同提交，本地 `main` 落后时误报「标签不可达 main」
 * （本轮 10/13 实测假红：`origin/main` 已含 tag，裸 `main` 未含）。「探一个、比另一个」
 * 是**同一语义两处写**的形态（铁律 24 第 2 维）。
 *
 * @param {string[]} candidates 候选引用名（按优先级排列：远端 → 本地）
 * @param {(ref:string)=>boolean} refExists 引用存在性判定（注入，便于测试）
 * @returns {string|null} 选中的引用名；全部不存在时为 null（无法判定）
 */
function resolveReleaseBranchRef(candidates, refExists) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const ref of list) {
    if (refExists(ref)) return ref;
  }
  return null;
}

/**
 * 判据⑤：发布提交 message 的「声称」↔ 该提交 diff 真实落地（Issue #399 13/13 复盘 · 铁律 22）。
 *
 * 防什么（本轮实测真缺陷 · 假留痕）：发布提交的 message **声称**「CHANGELOG：新增 ## [X.Y.Z] 段
 * （<某变更>）」，而其 CHANGELOG diff **0 处提及**该变更的引用编号 —— 即 message 是**空头承诺**，
 * 留痕在 commit message 层「看起来有了」，在真值层（diff）却不存在。
 * 实测反例：`77d9e76`（v1.14.2 发布提交）message 称「CHANGELOG 新增 1.14.2 段（G3 跨 app 恒拦修复）」，
 * `git show 77d9e76 -- CHANGELOG.md | grep -E '^\+.*(#399|#404|G3)'` **0 命中**。
 *
 * 既有判据①②④ 均**只看真值侧**（标签/段存在/段内容），对「message 声称」这一侧无感
 * ⇒ 同一形态（message 与 diff 各说各话）可长期存在。本判据补上这一维。
 *
 * 口径（名实一致，防假绿）：
 *   - **声称侧**：message 行内同时出现「CHANGELOG 关键词 + 写入动词」（`新增/补录/写入/…`，**同行共现**）
 *     才算一条声称行；该行内出现的全部**见证词**（编号 `#<数字>` 或功能代号 `G/P/T<数字>`）
 *     即「被声称落地的见证词集合」。
 *   - **真值侧**：该提交 CHANGELOG diff 的**新增行**（`+` 开头）中出现的见证词集合。
 *   - **断言**：声称集合 ⊆ 真值集合（声称的见证词必须真在 diff 新增行里出现）。
 *   - 只在「message 含 CHANGELOG 声称行」时才判（不声称即不在判据面，避免对普通提交泛化误报）。
 *
 * 残余自限（显式披露，非放宽）：只认「同一行内 CHANGELOG 关键词 + **写入动词** + **见证词**」这一**可见形态**；
 * 跨行声称（`- CHANGELOG：` 换行后列编号）、**无见证词**的自然语言声称（「修了校对抽风」）不声称拦住。
 *
 * @param {Array<{sha:string, message:string, changelogAddedRefs:string[]}>} commits
 *   `changelogAddedRefs` = 该提交 CHANGELOG diff 新增行中出现的 `#<数字>` 编号集合。
 * @param {object} [o]
 * @param {RegExp} o.claimLinePattern  message 中的「CHANGELOG 关键词」口径（单源传入）
 * @param {RegExp} o.writeVerbPattern  「写入动词」口径（单源传入）—— 须与关键词**同行共现**才算声称行
 * @param {RegExp} o.refNumberPattern  引用编号口径 `#<数字>`（**已由 \`witnessPattern\` 口径包含**，保留入参仅为
 *   兼容既有调用与「缺传即报红」断言；判据内**不再独立使用**它做匹配 —— 见 R1 评审：同一编号口径两处匹配
 *   属「同一语义两处写」，\`witnessPattern\` 已 ⊇ \`refNumberPattern\`（\`#<数字>\` ∪ \`G/P/T<数字>\`）。
 * @returns {string[]} errors（空 = 通过）
 */
function checkReleaseCommitClaim(commits, o) {
  const errors = [];
  const opts = o || {};
  const claimLine = opts.claimLinePattern;
  const writeVerb = opts.writeVerbPattern;
  const refPat = opts.refNumberPattern;
  // 判据依赖单源口径：缺传即报红（不接受 `|| /…/ ` 兜底 —— 那会把判据静默降级为「不启用」）。
  const witnessPat = opts.witnessPattern;
  if (
    !(claimLine instanceof RegExp) ||
    !(writeVerb instanceof RegExp) ||
    !(refPat instanceof RegExp) ||
    !(witnessPat instanceof RegExp)
  ) {
    errors.push(
      '判据⑤ 缺少单源口径（claimLinePattern / writeVerbPattern / refNumberPattern / witnessPattern）—— 不接受兜底，缺传即视为配置错误'
    );
    return errors;
  }
  for (const c of Array.isArray(commits) ? commits : []) {
    if (!c || !c.sha || !c.message) continue;
    const lines = String(c.message).split(/\r?\n/);
    const claimed = new Set();
    // ⚠️ 13/13 复盘第二轮真缺陷修正（假红）：**排除提交标题行（首行）**。
    //   标题是「本次提交做了什么」的**工作描述**（Conventional Commits 惯例：`docs: CHANGELOG 新增…`、
    //   `fix: 修复 CHANGELOG 补记…`），其中出现的编号是**上下文引用**（Issue/PR 追溯，如 `Ref: #314` 的兄弟项），
    //   **不是**「我把该编号写进了 CHANGELOG」的声称 ⇒ 计入会产生假红。
    //   实测反例（本轮真缺陷）：`b7d7757` 标题 `fix: PR #321 评审 R6 修复 CHANGELOG 补记 R2-R5 且用例数对齐实测 #314`
    //   —— 含 CHANGELOG 关键词 + 写入动词「补记」，其 `#314`/`#321` 是 Issue/PR 追溯，
    //   而该提交 diff 未提及 `#314` ⇒ 被误报「假留痕」。真实声称均出现在 **body 正文**（实测 27 body vs 6 subject）。
    //   残余自限：body 内的「上下文提及」无法与「声称」自动区分，仍不声称拦住（见头部自限⑥）。
    for (let li = 0; li < lines.length; li++) {
      if (li === 0) continue; // 标题行：工作描述，非声称（本轮真缺陷修正）
      const line = lines[li];
      // 名实一致：「CHANGELOG 关键词 + 写入动词」**同行共现**才算一条声称行（否则普通提及/标题前缀被误判）。
      if (!claimLine.test(line) || !writeVerb.test(line)) continue;
      // 仅「同一行内」的见证词计入声称集合（残余自限：跨行声称不在判据面，见头部披露）。
      // 见证词口径 = **单一** `witnessPat`（编号 `#<数字>` ∪ 功能代号 `G/P/T<数字>`）。
      // ⚠️ 13/13 复盘第二轮真缺陷修正：原实现只收 `#<数字>` ⇒ message 声称非编号见证词
      //    （`G3 跨 app 恒拦修复` 的 `G3`）时永不进入声称集合，而该行内唯一的 `#400`
      //    恰在 diff 中 ⇒ 子集通过 = 对头号反例 77d9e76 **假阴性**（本轮实测）。
      // ⚠️ R1 评审：曾同时用 `refPat` + `witnessPat` 两次 match（`#` 编号被匹配两遍）——
      //    `witnessPat` 已 ⊇ `refPat`，双重匹配属「同一语义两处写」，故只保留 `witnessPat`。
      for (const tok of line.match(witnessPat) || []) {
        const t = String(tok).trim();
        if (t) claimed.add(t);
      }
    }
    if (claimed.size === 0) continue; // 未声称具体编号：不在判据面
    const actual = new Set(Array.isArray(c.changelogAddedRefs) ? c.changelogAddedRefs : []);
    const missing = [...claimed].filter(r => !actual.has(r));
    if (missing.length > 0) {
      errors.push(
        `发布提交 ${c.sha.slice(0, 7)} 的 message 声称 CHANGELOG 已写入 ${missing.join('、')}，` +
          `但其 CHANGELOG diff 新增行中 0 处提及 —— commit message 的空头承诺（假留痕）；` +
          `message 声称的见证词（编号或功能代号）必须真在该提交 diff 新增行中出现` +
          `（本轮实测反例：77d9e76 称含 G3/#399，其 diff 新增行 0 处提及 G3，而该行唯一的 #400 恰在 diff 中 ⇒ 原判据放行）`
      );
    }
  }
  return errors;
}

/**
 * 判据⑥：发布产物 ↔ 版本号连通（Issue #399 13/13 复盘第三轮 · 铁律 22 预防性闭环）。
 *
 * 不变量：每个 `>= 下限` 的发布标签 `vX.Y.Z`，其**待发布树**内必须存在与版本号同名的产物
 * `opencode-wps-vX.Y.Z.tar.gz` —— 即「发布四要素之三（产物）」确有落点且与版本号连通。
 *
 * ⚠️ 为什么查**待发布树**而非标签指向提交：本仓产物惯例为「四要素提交 → 产物提交」两段
 * （实测：`v1.14.6` 标签指向四要素提交 `967ee3a`，其树内**无** tarball；tarball 在其后的
 * `71f1c6c`）⇒ 对「标签指向提交」断言会系统性假红。
 *
 * ⚠️ 「待发布树」= **`HEAD` 树**（Issue #419 第 1 轮评审 CR419-1 澄清）：原措辞「发布分支树」由
 * caller 读 `refs/heads/main`，而**被断言的对象是 HEAD**（判据⑦ 跑 `git archive HEAD`、产物也由
 * HEAD 生成），且 CI 在 **PR 分支**上跑 preflight（main 尚未含本次改动）⇒ 二者背离时该判据假绿
 * （实测：feature 分支上 `git rm` 产物 ⇒ 原口径读 main 未删 ⇒ EXIT=0）。现口径 = HEAD，
 * 与 archive/产物三者同源，且**合并前可判**。`RELEASE_BRANCH` 仍归判据③（标签可达性）消费。
 *
 * 名实一致（铁律 24 第 5 维）：本判据只断言**存在性 + 版本号同名**（可见形态），
 * **不**断言产物内容/体积/校验和 —— 那是人工评审面（自限，见模块头部）。
 *
 * @param {Array<{tag:string, match:RegExpMatchArray|null, artifactOnBranch:boolean|undefined}>} entries
 *   每项 = 一个标签、命名匹配结果、该版本产物在**待发布树**内是否存在（无法判定为 undefined）。
 * @param {object} [o]
 * @param {string}   [o.floor]        版本下限（低于它的标签不参与判据）
 * @param {Function} [o.versionGte]   `(a,b)=>a>=b` 版本比较（单源传入）
 * @param {Function} [o.artifactName] `(version)=>产物文件名`（命名口径单源由 caller 传入）
 * @returns {string[]} errors（空 = 通过）
 */
function checkArtifactConnectivity(entries, o) {
  const errors = [];
  const opts = o || {};
  const floor = opts.floor;
  const gte = opts.versionGte || (() => true);
  // 命名口径**必须**由 caller 单源传入（manifest 的 `artifactName`）——不接受兜底字面量
  // （否则判据内出现**第二份**命名实现，与 caller 漂移即静默误判；与判据⑤ 的「缺传单源即报红」同口径）。
  const nameOf = opts.artifactName;
  if (typeof nameOf !== 'function') {
    return [
      '判据⑥ 缺少命名口径单源 `artifactName` —— 不接受兜底，请在 caller 传入 manifest 的 `artifactName`',
    ];
  }
  const list = Array.isArray(entries) ? entries : [];
  for (const e of list) {
    if (!e || !e.match) continue; // 非版本标签：不在判据面
    const v = e.match[1];
    if (floor && !gte(v, floor)) continue; // 低于下限：惯例建立前，不参与
    if (e.artifactOnBranch === undefined) {
      errors.push(
        `标签 ${e.tag} 的产物存在性**无法判定**（待发布树读取失败）——` +
          `不得视为通过，请核对 git 工作区`
      );
      continue;
    }
    if (!e.artifactOnBranch) {
      errors.push(
        `标签 ${e.tag} 在待发布树内**找不到产物** ${nameOf(v)} ——` +
          `发布四要素之三（产物）缺失或命名与版本号不连通` +
          `（实测反例：v1.14.0 无产物；产物惯例自 v1.14.1 起建立）`
      );
    }
  }
  return errors;
}

/**
 * 判据⑦：发布产物的**打包口径 / 体积**连通（Issue #417 · 铁律 22 预防性闭环）。
 *
 * 不变量：发布产物 tarball **不得递归包含历史产物**，且体积**不得越过声明式上界**。
 *
 * 为何新立判据而非扩判据⑥：判据⑥ 只断言产物「存在于待发布树 + 与版本号同名」（可见形态），
 * **内容/体积**写在其自限内 —— 正是该自限让「产物逐版本翻倍」长期静默通过（实测 1.14.1 2.9M
 * → 1.14.7 186M，`tar -tzf` 各含 1~7 个 tarball）。本判据承接该自限。
 *
 * 三条断言（各自独立）：① 产物内不得出现产物命名形态的条目（读 `git archive` **输出**，
 * 不用 `git check-attr` 代替 —— 实测 `export-ignore` 是 attribute，`check-attr` 在索引/工作树
 * 已 set 而 `git archive HEAD` 读的是 **HEAD 树**的 attribute ⇒「check-attr 绿 + archive 仍含产物」
 * 二者可同时为真，属假绿形态）；② `.gitattributes` 的 `export-ignore` 行必须**等于**单源 pattern
 * 且该 pattern 必须能匹配唯一构造函数产物名；③ archive 的 gzip 后字节 ≤ `sizeLimitBytes`。
 *
 * ⚠️ **判据面 = 「该仓库有产物入库」**（`hasArtifacts`）：本仓的产物惯例自 v1.14.1 起建立，
 * 而守卫可对任意 `--root` 运行（专测的临时仓库、其它仓库）—— 对**没有产物**的仓库断言
 * 「`.gitattributes` 必须有排除口径」是与夹具相斥的约束（既无产物要排除，何来排除口径）。
 * ⇒ 无产物时**三条断言整体不参与**（如实打印「不在判据面」，不假装通过也不误报）。
 * 这与 `RELEASE_ARTIFACT_FLOOR` 同口径：**声明式边界**，非逐条豁免。
 *
 * 单源一律 `caller` 传入（缺失即报红，不接受兜底 —— 与判据⑤/⑥ 同口径）；无法判定不得视为通过。
 *
 * @param {object} o
 * @param {string[]} [o.archiveEntries]  `git archive` 条目路径清单（undefined = 无法判定）
 * @param {number}   [o.archiveBytes]    archive 的 gzip 后字节数（undefined = 无法判定）
 * @param {string}   [o.attributesText]  仓库根 `.gitattributes` 文本（undefined = 无法判定）
 * @param {string}   o.exportIgnorePattern 排除口径单源
 * @param {boolean}  o.hasArtifacts      该仓库是否有产物入库（判据面开关，caller 现场判定）
 * @param {number}   [o.sizeLimitBytes]  体积上界（单源传入）
 * @param {number}   [o.sizeBaselineBytes] 体积上界的**声明式基线**（单源；与 `sizeLimitRatio` 共同锚定上界）
 * @param {number}   [o.sizeRefBytes] 漂移对账的**独立参照**（防判据面自排除）
 * @param {number}   [o.sizeRatioCeiling] 倍率的**绝对上限**（防「三处同步放大」）
 * @param {number}   [o.sizeLimitRatio]  上界倍率锚（单源传入；上界 ≤ 声明式基线 × 倍率）
 * @param {Function} o.artifactName      产物命名构造函数（单源传入）
 * @returns {string[]} errors（空 = 通过；无产物 ⇒ 恒空 = 不在判据面）
 */
function checkArtifactPacking(o) {
  const opts = o || {};
  const errors = [];
  if (opts.hasArtifacts !== true) return []; // 无产物入库 ⇒ 判据面外（声明式边界，非豁免口）
  const nameOf = opts.artifactName;
  const pattern = opts.exportIgnorePattern;
  if (typeof nameOf !== 'function') return ['判据⑦ 缺少命名口径单源 `artifactName` —— 不接受兜底'];
  if (typeof pattern !== 'string' || pattern === '') {
    return ['判据⑦ 缺少排除口径单源 `exportIgnorePattern` —— 不接受兜底'];
  }
  const sample = nameOf('1.0.0');
  const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ① 产物不入产物：由**唯一构造函数**派生「任意版本」形态（整串转义后换回通配，不手写第二份 pattern）。
  const entries = Array.isArray(opts.archiveEntries) ? opts.archiveEntries : null;
  if (entries === null) {
    errors.push('判据⑦ 无法判定「产物是否递归包含历史产物」（archive 条目清单缺失）—— 不得视为通过');
  } else {
    const anyVer = new RegExp('^' + escRe(sample).replace(/1\\.0\\.0/, '\\d+\\.\\d+\\.\\d+') + '$');
    const nested = [...new Set(entries.map(e => String(e).split('/').pop()).filter(n => anyVer.test(n)))];
    if (nested.length > 0) {
      errors.push(
        `发布产物 tarball 内**递归包含**了 ${nested.length} 个历史产物（${nested.slice(0, 3).join('、')}…）` +
          `—— 打包口径未排除产物形态 ⇒ 体积逐版本翻倍（实测反例：v1.14.7 内含 7 个 tarball / 186M；` +
          `修法见单源 \`${pattern}\`）`
      );
    }
  }

  // ② 排除口径同源：`export-ignore` 行的 pattern 必须等于单源，且单源必须能匹配产物名。
  const attrs = typeof opts.attributesText === 'string' ? opts.attributesText : null;
  if (attrs === null) {
    errors.push('判据⑦ 无法判定「排除口径同源」（仓库根 .gitattributes 文本缺失）—— 不得视为通过');
  } else {
    const declared = attrs
      .split('\n')
      .map(l => l.replace(/#.*$/, '').trim().split(/\s+/))
      .filter(parts => parts.length >= 2 && parts[1] === 'export-ignore')
      .map(parts => parts[0]);
    if (!declared.includes(pattern)) {
      errors.push(
        `仓库根 .gitattributes 的 export-ignore pattern 与单源声明 \`${pattern}\` 不一致（实测声明：` +
          `${declared.length ? declared.join('、') : '无'}）—— 改一处漏一处即报红`
      );
    }
    const globRe = new RegExp('^' + pattern.split('*').map(escRe).join('.*') + '$');
    if (!globRe.test(sample)) {
      errors.push(
        `排除口径单源 \`${pattern}\` 无法匹配唯一构造函数产物名 \`${sample}\` —— 两处口径实为不同语义`
      );
    }
  }

  // ③ 体积上界：未传 = 无法判定（报红，不假装通过）。
  if (typeof opts.archiveBytes !== 'number' || !Number.isFinite(opts.archiveBytes)) {
    errors.push('判据⑦ 无法判定「产物体积上界」（gzip 后字节数缺失）—— 不得视为通过');
  } else if (typeof opts.sizeLimitBytes !== 'number' || !Number.isFinite(opts.sizeLimitBytes)) {
    // ⚠️ CR1-1（第 1 轮评审实测真缺陷）：原实现把「上界未传」与「体积已传」的组合**静默放过**
    //   （条件写成 `typeof limit === 'number' && ...`，缺上界即短路为不报错）—— 与另两条
    //   「无法判定不得视为通过」口径**不对称**：缺上界 = 判定不了，必须报红（实测：缺上界 + 300M
    //   体积 `errors` 仅剩另一条，本断言零信号）。
    errors.push('判据⑦ 无法判定「产物体积上界」（上界单源 `sizeLimitBytes` 缺失）—— 不得视为通过');
  } else {
    // 判据⑦ 体积断言（第 3~5 轮评审：**自由参数收敛**为 2 个绝对量 + 全派生，见 manifest 注释）。
    //
    // 三条独立断言（各自防一类静默放宽形态，均已实测复现过零信号）：
    //   ① 上界 ↔ 基线 × 倍率 **恒等**（防「只改一侧」）——CR3-1；
    //   ② 基线 ↔ **当场实测** 对账（防「基线与上界同步放大」）——CR4-1；
    //   ③ 倍率 ≤ **独立绝对上限** `sizeRatioCeiling`（防「三处同步放大」，含倍率本身）——CR5-1。
    //
    // ⚠️ 自限（显式披露，非放宽）：本组断言**不声称**拦住「有权限且有决心**同时**放宽
    //   `TOLERANCE_RATIO` + `BASELINE` + `RATIO_CEILING` + `BASELINE_MAX_DRIFT`（+ REF）五处」
    //   的维护者动作 —— 与本仓棘轮判据（`lib/ratchet.js`）同口径：「静态守卫不能阻止改守卫，
    //   它保证的是任何放宽都**留下语义后果显式的痕迹**」。第 5 轮已实测：上述**任一/任二/任三**
    //   单点或部分同步均报红；仅「五处齐改」不报（那是显式的自我许可，必产生本文件 diff，可评审）。
    // ⚠️ 残余自限（第 7 轮评审实测披露，非放宽）：本判据的 archive 断言用 `git archive HEAD`
    //   默认语义（读 **HEAD 树** 的 `.gitattributes`）。若构建方改用 `--worktree-attributes`
    //   （读**工作树** attribute），则「工作树里把 pattern 改坏」可使真实产物重新含产物，
    //   而本判据仍按 HEAD 树判定 ⇒ 该形态不声称拦住（实测：`--worktree-attributes` 下产物条目 0 → 1）。
    //   为何不加固：① 本仓发布命令与 CI 均**未**使用该选项（`grep -r worktree-attributes` 零命中）；
    //   ② 加固需让守卫复现构建方的选项（多一处与构建口径耦合的文本，正是本 PR 在治的形态）。
    //   ⇒ 如实记为自限：使用 `--worktree-attributes` 时须人工核对。
    // ⚠️ 判据面（防误伤小仓库）：只在「当场实测与本仓同阶」时做 ②（小仓库实测天然极小，
    //   基线仍指本仓量级，二者无因果关系）。参照 = **独立传入**的 `sizeRefBytes`（1 MiB 量级下界），
    //   不锚在 base / limit / ratio 上（那三者均可被同步放大 ⇒ 判据面自排除，CR4-1 实测真缺陷）。
    const base = opts.sizeBaselineBytes;
    const ratio = opts.sizeLimitRatio;
    const drift = opts.sizeBaselineMaxDrift;
    const ref = opts.sizeRefBytes;
    const ceiling = opts.sizeRatioCeiling;
    if (typeof base === 'number' && base > 0 && typeof ratio === 'number' && ratio > 0) {
      const live = opts.archiveBytes;
      const inScope =
        typeof drift === 'number' && drift > 0 && live > 0 && typeof ref === 'number' && ref > 0 && live * drift >= ref;
      // ① 恒等：上界必须 = 基线 × 倍率（构造保证，防漂移）。
      if (opts.sizeLimitBytes !== base * ratio) {
        errors.push(
          `产物体积上界 ${opts.sizeLimitBytes} B ≠ 基线 ${base} B × 倍率 ${ratio}（= ${base * ratio} B）——` +
            `上界与基线/倍率必须**恒等**（改一侧漏另一侧即报红）`
        );
      }
      // ③ 倍率绝对上限（判据面外同样生效 —— 这是拦「三处同步放大」的那一条）。
      if (typeof ceiling === 'number' && ceiling > 0 && ratio > ceiling) {
        errors.push(
          `产物体积余量倍率 ${ratio} 越过绝对上限 ${ceiling} —— 倍率被放宽` +
            `（实测反例：倍率 + 基线 + 上界三处同步放大 ⇒ 守卫原本零信号）`
        );
      }
      if (inScope) {
        // ② 基线 ↔ 当场实测对账（防「基线与上界同步放大」）。
        if (base > live * drift) {
          errors.push(
            `体积基线 ${base} B 相对**当场实测** ${live} B 超出 ${drift}× 漂移上限` +
              `（基线不得脱离实测；实测反例：基线与上界同步放大 ⇒ 守卫原本零信号）`
          );
        } else if (opts.archiveBytes > opts.sizeLimitBytes) {
          errors.push(
            `发布产物体积 ${opts.archiveBytes} B 越过上界 ${opts.sizeLimitBytes} B` +
              `（≈${(opts.sizeLimitBytes / 1048576).toFixed(1)} MiB）—— 打包面失控（实测基线：修正后 ≈1.6M）`
          );
        }
      } else if (opts.archiveBytes > opts.sizeLimitBytes) {
        errors.push(
          `发布产物体积 ${opts.archiveBytes} B 越过上界 ${opts.sizeLimitBytes} B` +
            `（≈${(opts.sizeLimitBytes / 1048576).toFixed(1)} MiB）—— 打包面失控（实测基线：修正后 ≈1.6M）`
        );
      }
    } else if (opts.archiveBytes > opts.sizeLimitBytes) {
      errors.push(
        `发布产物体积 ${opts.archiveBytes} B 越过上界 ${opts.sizeLimitBytes} B` +
          `（≈${(opts.sizeLimitBytes / 1048576).toFixed(1)} MiB）—— 打包面失控（实测基线：修正后 ≈1.6M）`
      );
    }
  }
  return errors;
}

/**
 * 判据⑨：历史产物的**处置完整性**（Issue #419 = #417 AC-6 拆分 · 铁律 22 预防性闭环）。
 *
 * 不变量：**曾入库**的产物不得被从待发布树里静默抹去 —— `>= undecidedBelow` 区间一律断言；
 * `[floor, undecidedBelow)` = #419 待处置对象（保留、不动），不做「必在树内」断言。
 *
 * 病灶（实测）：判据⑥ 判据面 = floor(1.14.1) 以上全部标签，而 1.14.1~1.14.6 正是 #419 的处置
 * 对象 ⇒ 「删历史产物」= 掏空判据面（报红 6 条）。处置结论若只写在 Issue 文字里 = 人类纪律。
 *
 * ⚠️ **本判据只断言判据⑥ 断言不了的那部分**（反重复，铁律 17④/24 第 2 维）——第 1 轮评审实测：
 * 「在树内」这一事实的 owner 是判据⑥（`checkArtifactConnectivity`），若本判据**也**断言它，
 * 就是**同一事实两处断言**（换一处改口径即静默分叉，正是本仓反复在治的形态）。
 * 故本判据的三条断言**各自**都是判据⑥ 结构上做不到的：
 *   ① **曾入库**（`git log --diff-filter=A`）——「历史上有没有落过点」；判据⑥ 只看**当前树**，
 *      对「从未入库过、但树里有同名文件」零信号；
 *   ② **接口自洽**：`undecidedBelow >= floor`（区间为空 ⇒ #419 待处置对象被静默归零）；
 *   ③ **决策有落点**：`decisionRefs` 非空（结论必须可评审，不接受「写在 Issue 里就算」）。
 * ⇒ 判据⑨ 对判据⑥ **无重复断言**：删掉本判据后判据⑥ 不会捕获 ①（实测：从未入库 + 树内有同名
 *    文件 ⇒ 判据⑥ 空数组）。反过来，本判据不重复 ② 之外判据⑥ 已覆盖的「在树内」。
 *
 * ⚠️ 为什么口径用「曾入库」而非「可达同名标签」（本轮实测推翻自己的首版口径）：本仓不存在
 * 「产物可达其同名标签」的稳定关系 —— v1.14.1 的产物 A 提交**早于** tag（沿用 v1.14.0 文件名），
 * v1.14.6/7/8 则**晚于** tag（两段式：四要素提交 → 产物提交）⇒ 该口径**系统性假红 8/8**。
 *
 * 单源一律 caller 传入（缺失即报红，不接受兜底 —— 与判据⑤/⑥/⑦ 同口径）。
 *
 * @param {Array<{version:string, everCommitted:boolean|undefined}>} entries
 * @param {object} o
 * @param {string}   [o.floor]          产物下限（`RELEASE_ARTIFACT_FLOOR`）
 * @param {string}   [o.undecidedBelow] 未决处置下限（`ARTIFACT_FLOOR_UNDECIDED_BELOW`）
 * @param {Function} [o.versionGte]     版本比较（单源传入）
 * @param {Function} [o.artifactName]   产物命名口径（单源传入）
 * @param {string[]} [o.decisionRefs]   决策引用登记（单源传入；空数组即报红）
 * @returns {string[]} errors（空 = 通过）
 */
function checkFloorHistoryIntegrity(entries, o) {
  const opts = o || {};
  const errors = [];
  const floor = opts.floor;
  const undecided = opts.undecidedBelow;
  const gte = opts.versionGte;
  const nameOf = opts.artifactName;
  const refs = opts.decisionRefs;
  // 单源缺失即报红（防静默降级为「不判」——与判据⑤/⑥/⑦ 同口径）。
  if (typeof nameOf !== 'function') {
    return ['判据⑨ 缺少命名口径单源 `artifactName` —— 不接受兜底，请在 caller 传入 manifest 的 `artifactName`'];
  }
  if (typeof gte !== 'function') return ['判据⑨ 缺少版本比较单源 `versionGte` —— 不接受兜底'];
  if (typeof floor !== 'string' || floor === '' || typeof undecided !== 'string' || undecided === '') {
    return ['判据⑨ 缺少下限单源 `floor` / `undecidedBelow` —— 不接受兜底'];
  }
  // ② 接口自洽：未决下限必须 ≥ 产物下限（否则区间为空，「待处置对象」被静默归零）。
  if (!gte(undecided, floor)) {
    errors.push(
      `判据⑨ 未决处置下限 ${undecided} 低于产物下限 ${floor} —— ` +
        `区间为空 ⇒ #419 的「待处置对象」被静默归零（改下限必产生 diff，可评审）`
    );
  }
  // ③ 决策登记必须存在**且形如 `#<编号>`**：空数组 = 「结论没留痕」（写在 Issue 文字里不算落点）；
  //    纯非空不够（第 5 轮评审 CR419-5：实测 `['x']` / `['']` 也放行 ⇒ 断言空心化）——
  //    与 `lib/ratchet.js` 的「空壳留痕不受理」同口径，编号必须可被评审追溯。
  const badRefs = Array.isArray(refs) ? refs.filter(r => !/^#\d+$/.test(String(r))) : [];
  if (!Array.isArray(refs) || refs.length === 0 || badRefs.length > 0) {
    errors.push(
      '判据⑨ 决策登记 `decisionRefs` 不合法（须为非空数组，且每条形如 `#<编号>`；' +
        `实测：${JSON.stringify(refs)}）—— 处置结论必须有**可追溯**的评审落点，空壳登记不受理`
    );
  }
  // ① 曾入库：本判据**唯一**对判据⑥ 独立的断言（判据⑥ 只看当前树，结构上看不到「曾经有没有」）。
  // ⚠️ 判据面 = `[undecidedBelow, +∞)` **且** `>= floor`（第 2 轮评审 CR419-2 实测真缺陷）：
  //   原实现只判 `>= undecided`，而 `undecidedBelow < floor`（② 已报红但不中断）时，
  //   低于产物下限的标签（如 v1.14.0，产物惯例建立**之前**）也被拉进判据面 ⇒ 对合法历史
  //   假红「从未入库」（实测）。惯例建立前的版本按定义没有产物，不得断言。
  const list = Array.isArray(entries) ? entries : [];
  for (const e of list) {
    if (!e || !e.version || !gte(e.version, floor) || !gte(e.version, undecided)) continue;
    if (e.everCommitted === false) {
      errors.push(
        `判据⑨ v${e.version} 的产物 ${nameOf(e.version)} **从未入库**（\`git log --diff-filter=A\` 无记录）—— ` +
          `发布四要素之三（产物）从未落点；判据⑥ 只看「当前树内有没有」，对该形态零信号`
      );
    } else if (e.everCommitted !== true) {
      errors.push(
        `判据⑨ v${e.version} 的产物入库记录**无法判定** —— 不得视为通过，请核对 git 工作区`
      );
    }
  }
  // ⚠️ 判据⑨ **不**断言「在树内/已消失」：那是判据⑥ 的 owner（同一事实不两处断言）。
  //   删产物 ⇒ 判据⑥ 报「在待发布树内找不到产物」（实测：6 条），本判据不重复报第二份。
  return errors;
}

module.exports = {
  checkFloorHistoryIntegrity,
  checkArtifactPacking,
  checkTagVersionConnectivity,
  checkTagChangelogSections,
  checkTagsReachableFromBranch,
  checkReleaseNotesConnectivity,
  checkTagReleaseNotesExistence,
  resolveReleaseBranchRef,
  checkReleaseCommitClaim,
  checkArtifactConnectivity,
};
