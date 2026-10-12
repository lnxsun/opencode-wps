#!/usr/bin/env node
/**
 * 「语义键 × 落点集合」双侧连通性守卫（Issue #335 / R10 第六类「范围无主」）。
 *
 * 立项命题：「一个概念被哪几条守卫覆盖」这件事实身没有唯一归属 —— 守卫的**计行范围**
 * 与语义的**实际落点**之间无连通性断言。实测（Issue #335 第一节，命令可复算）：
 * 同一改动只换落点，轴外（`wps-com.ps1` / `range-signal.ts`）追加同义实现 → 守卫**全绿**；
 * 轴内（`proofread-types.ts`）追加同量 → **exit 1**。
 *
 * 本守卫实现 Issue #335「判据设计方向 1①②」（Issue #352 第九刀已删「方向 2 / AC4」两个零判别力自指判据），与既有 H1 的分工：
 *   · H1（`validate-npc-team-bloat.js`）：**只**断言登记表存在 + `why` 指向的文件存在（自限判据）；
 *   · 本守卫：对**实际落点内容**取特征 + **双向集合相等** ⇒ 新增同义实现即报红（拦得住 A/B 探针）。
 *
 * 单一来源（AC3，沿用 #321 R9-A）：清单与计行范围**只在**
 * `scripts/lib/semantic-anchor-manifest.js`；判据纯函数**只在**
 * `scripts/lib/semantic-anchor-scope.js`（模块内无仓库路径字面量）。本文件只做编排 + IO。
 *
 * 用法：node scripts/validate-semantic-anchor-scope.js [--json]
 * 退出码：0 = 通过；1 = 存在连通性违规
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkRatchet, checkRatchetLogChronology } = require('./lib/ratchet.js');
// E1 度量口径唯一来源（Issue #408）：守卫与 `npm run ratchet:rechain` 共用，禁止各写一份。
const { countCodeLines, countBranches } = require('./lib/e1-metrics.js');

const {
  SEMANTIC_ANCHORS,
  GUARD_SCOPES,
  coveringGuards,
} = require('./lib/semantic-anchor-manifest.js');
const { GUARD_SCOPE_ROOTS } = require('./lib/guard-scopes.js');
const {
  checkCoverageSide,
  checkAttributionSide,
  checkSiteAnchors,
  extractEmittedLabels,
  extractGuideMapEntries,
  extractGuideMapKeys,
  checkGuideMapCoverage,
  checkGuideMapBudget,
} = require('./lib/semantic-anchor-scope.js');

const rootDir = path.resolve(__dirname, '..');
const asJson = process.argv.includes('--json');

const readIfExists = rel => {
  const abs = path.join(rootDir, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};
const relExists = rel => fs.existsSync(path.join(rootDir, rel));

// 覆盖侧的唯一判据源：范围表现场计算（清单不再自持 `covered` 第二份真值 —— 第九刀已删）。
const coveringOf = rel => coveringGuards(rel, GUARD_SCOPES);

// ---- 归属侧扫描候选 = **全仓文本类源码树**（比守卫范围更宽）----
// 为什么必须更宽（Issue #335 方向 1② + 探针形态）：探针恰恰是「把同义实现追加到**守卫范围外**」，
// 若候选池只有范围内文件，归属侧永远看不到新落点 ⇒ 判据退化为自限判据（= 现行 H1 老路）。
// ⚠️ 候选根必须覆盖**全部**「可能承载校对语义」的源码树（PR #336 评审 F1）：
//    原实现漏了 `scripts/` 与 `tests/`，却在输出里写「全仓源码树」——措辞不实 + 未披露盲区。
//    实测：在 `scripts/probe-sibling.js` 写 `const truncated = true` → 原实现 EXIT=0（漏报）。
//    现补 `scripts` / `tests`，并把自限（只扫文本类源码树、跳过 node_modules/dist 等）**显式打印**。
const CANDIDATE_ROOTS = [
  'wps-office-mcp/src',
  'wps-office-mcp/scripts',
  '.opencode/plugins',
  'scripts',
  'tests',
  'skills',
];
/** 语义键清单区块的**唯一标记行**（docs/ 内必须出现且仅在一处；R8/R9 评审断言用） */
const SEMANTIC_ANCHOR_DOC_MARKER = '<!-- SEMANTIC-ANCHORS-LIST -->';
const TEXT_EXT = /\.(ts|js|tsx|jsx|md|ps1)$/i;
// ⚠️ 不再跳过 `tests/`（F1：原实现漏扫 → 在 `scripts/probe-sibling.js` 写同义实现可绕过[已修]）；
//    **测试文件**仍从归属候选排除 —— 它们是对语义的**断言**，不是语义的**实现落点**。
//    但排除判据必须**只认「测试文件本身」**，不得按目录名整目录排除（Issue #341 评审 F1）：
//      原实现 `/(^|\/)(tests?|__tests__)\//` 匹配路径**任意层级**的 `tests/`，
//      于是 `tests/fixtures/`（实现代码，非断言）被整目录排除。实测探针：
//        · `tests/fixtures/probe-f.js` 写同义实现 → 轴 I **EXIT=0（假绿）**；
//        · `scripts/probe-f.js` 同一内容            → 轴 I **EXIT=1（报红）**。
//      ⇒ 这正是 R10「同一语义换位置就复发」在**守卫自身**上的复发形态。
//      现判据 = `__tests__/` 目录 + `*.test.*` / `*.spec.*` 文件（与「测试」的常识外延同义）。
//    该排除**显式披露**（见下方自限输出），不是悄悄放宽。
//
// ⚠️ R2 评审（同一形态的第二处）：排除判据是**黑名单**（列「不扫什么」），黑名单必然追不上新形态。
//    本轮的 `validate-*` 整类排除是这一形态，`src/tests/support/*.ts`（**编译期断言**，刻意非
//    `.test.ts` 以求参与 tsc）也是这一形态 —— 它们**会进入候选池**（实测候选 102 → 115）。
//    本轮如实处理：**不**再新增「按目录名」的豁免（目录名与「实现/断言」无必然关系），
//    改为在自限输出里**如实披露这一边界**：候选池含 `tests/support/*.ts` 等编译期断言文件，
//    它们不命中锚点即无影响；一旦命中，须**登记**进语义清单（第九刀已删 waiver 豁免口），
//    不得再开目录级豁免。⇒ 宁可**如实披露「排不干净」**，也不假装「已排除所有断言文件」。
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const IS_TEST_FILE = rel => /(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.[a-z]+$/i.test(rel);
// 归属侧只问「**语义的实现落点**是否登记」，不问「谁**提到**过该名字」。
// 因此只保留一类「关于语义的元模块」排除（**这不是放宽，是判据语义边界**，且逐条披露）：
//   ① 语义清单/判据模块本身（`semantic-anchor-*`）：它们以数据形式**列出**这些名字，
//      不登记会自指报红、登记则让清单收纳自己（自指噪声）。
//
// ⚠️ 本轮**删除**了原「③ 守卫脚本（`validate-*`）整类排除」（Issue #341 评审 F1）：
//    该排除宣称「守卫脚本对语义做体检、不承载实现」，但它**按文件名整类豁免**——
//    任何脚本只要起名 `validate-xxx.js` 就能在里面写该语义的同义实现而不被发现。
//    实测探针：`scripts/validate-tmp-probe.js` 内写 `normalizeSkippedSegmentsDetailed` 调用
//    → 轴 I **EXIT=0（假绿）**。同时 **0** 个现存 `validate-*.js` 真的命中锚点（已实测），
//    即该排除**只提供假绿可能、不解决任何真实噪声** ⇒ 直接删除（敢删，铁律 24 问 4）。
// 其余任何文本源码树（含 `scripts/validate-*.js` 与 `tests/fixtures/`）**都要报**。
const IS_META_MODULE = rel => /(^|\/)semantic-anchor-[a-z-]+\.js$/.test(rel);

function walkTextFiles(rootRel, out) {
  const absRoot = path.join(rootDir, rootRel);
  if (!fs.existsSync(absRoot)) return;
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIR.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (TEXT_EXT.test(e.name))
        out.add(path.relative(rootDir, abs).split(path.sep).join('/'));
    }
  };
  walk(absRoot);
}

function scanCandidates() {
  const set = new Set();
  for (const rel of CANDIDATE_ROOTS) walkTextFiles(rel, set);
  // 守卫范围枚举根（单源 = guard-scopes.js）：根只决定「从哪找」，命中仍由 matchers 判定
  for (const rel of GUARD_SCOPE_ROOTS) {
    if (relExists(rel) && !fs.statSync(path.join(rootDir, rel)).isDirectory()) set.add(rel);
    else walkTextFiles(rel, set);
  }
  for (const entry of SEMANTIC_ANCHORS) {
    for (const site of entry.sites || []) if (site.path) set.add(site.path);
  }
  return [...set]
    .filter(rel => !IS_TEST_FILE(rel) && !IS_META_MODULE(rel))
    .map(rel => ({ path: rel, text: readIfExists(rel) }))
    .filter(f => typeof f.text === 'string');
}

// ---- 跑判据（Issue #352 第九刀：删 checkScopeOwnership / checkWaiverFreshness 两个零判别力自指判据）----
const errors = [];
const warnings = [];

const cov = checkCoverageSide(SEMANTIC_ANCHORS, coveringOf, relExists);
errors.push(...cov.errors);
warnings.push(...cov.warnings);

// F3（评审）：落点级 `anchor` 必须有真实消费点（防「有声明无消费」的死元数据）。
const sa = checkSiteAnchors(SEMANTIC_ANCHORS, readIfExists);
errors.push(...sa.errors);
warnings.push(...sa.warnings);

// ---- F2 一致性断言（PR #336 评审 F2）----
// 范围数据的唯一来源必须是 `lib/guard-scopes.js`，且**消费侧不得自持副本**。若谁把范围字面量
// **重新内联**回自己的脚本，则「同一语义两处写」会复活，且轴 I 会退化为「跟自己的副本对账」。
//
// ⚠️ Issue #325 第二刀：**每条覆盖声明必须有一个真实执行者**。
//    原实现把 `validate-proofread-budget.js`（轴 A）与 `validate-proofread-convergence.js`（轴 F）
//    的范围数据登记为覆盖源，而两脚本已删除 ⇒ 「覆盖侧」是拿清单与**没有执行者的范围**对账
//    （假绿，F2 同型复发）。现断言三件事（三项均保留独立断言，第九刀只删了轴 I 的「方向 2 / AC4」，未动本处）：
//      ① 清单模块必须消费共享单源；
//      ② 清单模块不得重新内联范围字面量；
//      ③ **每条 GUARD_SCOPES 声明的 `script` 必须真实存在、且必须 require 共享单源**
//         —— 消除「覆盖声明无执行者」。
{
  const MANIFEST_REL = 'scripts/lib/semantic-anchor-manifest.js';
  const manifestSrc = readIfExists(MANIFEST_REL);
  if (typeof manifestSrc !== 'string') {
    warnings.push(`⚠️ ${MANIFEST_REL} 本地不存在（环境性，非契约违规）`);
  } else {
    if (!manifestSrc.includes("require('./guard-scopes.js')")) {
      errors.push(
        `F2 ${MANIFEST_REL} 未消费范围单一来源（require('./guard-scopes.js')）—— 范围必须由 ` +
          `lib/guard-scopes.js 单源提供，不得自持副本（否则轴 I 只是拿清单跟自家副本对账）`
      );
    }
    if (/:\(glob\)wps-office-mcp\/src\/tools\/word\/proofread/.test(manifestSrc)) {
      errors.push(`F2 ${MANIFEST_REL} 重新内联了范围字面量 —— 只能从 lib/guard-scopes.js 单源取用`);
    }
  }
  // ③ 覆盖声明必须有执行者：`script` 存在 + 该脚本真的 import 共享单源。
  for (const scope of GUARD_SCOPES) {
    const rel = scope.script;
    if (typeof rel !== 'string' || rel.length === 0) {
      errors.push(
        `F2 覆盖源「${scope.guard}」未声明 \`script\` —— 没有执行者的覆盖声明是假绿（Issue #325 第二刀）`
      );
      continue;
    }
    const src = readIfExists(rel);
    if (typeof src !== 'string') {
      errors.push(
        `F2 覆盖源「${scope.guard}」声明的脚本 ${rel} 不存在 —— 覆盖声明必须对应真实执行的守卫`
      );
      continue;
    }
    if (!src.includes('guard-scopes.js')) {
      errors.push(
        `F2 覆盖源「${scope.guard}」的脚本 ${rel} 未 import 共享单源（guard-scopes.js）` +
          `—— 范围必须单源，否则轴 I 只是跟自家副本对账`
      );
    }
  }
}

const candidates = scanCandidates();
// ---- 死元数据闸门（R11 评审）：清单登记的落点**必须真实存在** ----
// ⚠️ 为什么必须单独扫清单（而不是靠候选池）：原实现把「树中不存在的落点」在归并候选池时静默丢弃
//    （readIfExists → null → filter 掉），于是「改名/删除后留下指向旧路径的 site」既不进候选池
//    （无从报漏登记）、也不报错。实测注入幽灵落点后守卫只打印「落点本地不存在（**环境性**，非契约
//    违规）」——环境性提示不拦 CI，EXIT 仍为 0。清单是**人写的数据**：条目指向不存在的文件即数据
//    错误（改名漏同步），不是环境性缺失。判据：sites[].path 非空却不存在 → 报红。
{
  const ghosts = [];
  for (const entry of SEMANTIC_ANCHORS)
    for (const site of entry.sites || [])
      if (site.path && !relExists(site.path)) ghosts.push(`[${entry.key}] ${site.path}`);
  for (const g of ghosts)
    errors.push(
      `死元数据：清单登记的落点 ${g} 不存在 —— 清单是数据，条目必须指向真实文件；改名/删除落点后必须同步登记`
    );
}
const att = checkAttributionSide(SEMANTIC_ANCHORS, candidates, { existsOf: relExists });
errors.push(...att.errors);
warnings.push(...att.warnings);

// ---- K7 治理指路（Issue #352 第十刀：由独立 CLI 迁入）----
// 原 K7 由独立 CLI + 独立判据模块 + 专测承载；第十刀统一重构：判据并入本守卫（单一连通性守卫）。
// 两条独立判据不变：① 「标签集合 ≡ GUIDE_MAP 键集合」双向闭合；② 指路文案预算（每条 ≤60 / 合计 ≤600）。
{
  const GOV_REL = '.opencode/plugins/governance.js';
  const govSrc = readIfExists(GOV_REL);
  if (typeof govSrc !== 'string') {
    warnings.push(`⚠️ K7 ${GOV_REL} 本地不存在（环境性，非契约违规）`);
  } else {
    const keys = extractGuideMapKeys(govSrc);
    if (!keys) {
      errors.push(`K7 无法在 ${GOV_REL} 定位 GUIDE_MAP 常量块 —— 结构已变，请同步本守卫`);
    } else {
      const emitted = extractEmittedLabels(govSrc);
      errors.push(...checkGuideMapCoverage(keys, emitted).errors);
      const entries = extractGuideMapEntries(govSrc) || [];
      errors.push(...checkGuideMapBudget(entries, keys).errors);
    }
  }
}

// ---- AC5：守卫自身复杂度（E1 同族）----
// 「防腐不豁免守卫」：守卫自身的有效代码行 / 分支数上限由本脚本自持（口径 = 有效代码行，剔除空行与注释行）。
//
// ⚠️ F4 修复（PR #336 评审）：原实现把**限值**写成手工字面量（140 / 64 …），而**余量**又是
//    「限值 − 实测」现场算 —— 于是「基线 133 / 限值 140」只剩 5.0%，**加一条登记（8 行）即误报**，
//    且每次功能新增都得手工重算限值（正是「0/27 余量」那条假红的来源）。
//    现改为**基线与限值分离**：基线 = 上一轮实测的**声明值**（本 PR 只允许在改变更集内更新），
//    限值 = `ceil(基线 ÷ 0.95)` **自动派生** ⇒ 余量恒 ≥5% 是**构造保证**，不靠手工凑数；
//    同时保留「实测 ≤ 限值」的增长闸门（超限仍报红，只是不会因正常小改误报）。
//
// 基线更新史（每次**实测值写入**，非估）：
//   · #343：清单模块 96 → 205（+109：新增 3 个语义键共 16 个落点，属该 Issue 目的而非副作用）。
//   · #341（本轮·次）：守卫脚本 232 → 233（+1：R2 评审把「不开目录级豁免」的边界如实写进自限披露）。
//   · #341（本轮）：清单模块 205 → 214（**收紧**，非扩张）—— #343 的登记未同步基线，
//     实测 214 > 基线 205 使守卫长期挂着「请在本 PR 内同步收紧基线」的 warning。
//     本轮同轮收紧到实测 214，消除「基线落后于现实」的告警漂移（铁律 24 第 5 维：名实一致）。
//     ⚠️ 收紧后余量 = 上限 226 − 实测 214 = 12 行（限值 = ceil(214 / 0.95) = 226，构造保证 ≥5%）。
const E1_BASELINES = {
  guardCodeLines: 1702,
  guardBranches: 58,
  libCodeLines: 397,
  libBranches: 133,
  manifestCodeLines: 370,
  manifestBranches: 0,
  scopesCodeLines: 112,
  scopesBranches: 4,
  // 第五刀：体量闸门（原 `guard-source-lines` 键 × S8）收敛为本维。口径与其它维**不同**：
  //   物理行数（含注释/空行），其余维为有效代码行（剔注释）。两个口径**互不可推**
  //   （实测给它加 300 行注释：物理行数维度报红、其它维不为所动 ⇒ 「压注释凑行数」无效）。
  guardSourceLines: 11053,
};

/**
 * E1 棘轮（R6 评审 F1/F2）：E1_BASELINES **此前可被随意放宽**——实测把基线改成 99999，
 * 守卫照样 EXIT=0 ⇒ 「防腐不豁免守卫」形同虚设（它连自己都防不住）。
 *
 * 这与体量守卫 R4/R5 修的洞**是同一个不变量**。R6 评审把二者收成**共享判据**
 * `scripts/lib/ratchet.js`（同一语义只有一处实现），两条守卫都消费它。
 *
 * 口径：`E1_RATCHET_INITIAL` = 各维度初始值；`E1_RATCHET_LOG` = 各维度上调留痕。
 *   判据 = 「当前基线 ≤ 棘轮基线」+「棘轮基线 = 留痕最后一条 .to」+「留痕必填字段」。
 */
const E1_RATCHET_INITIAL = {
  // ⚠️ 13/13 复盘第四轮（实测真缺陷②）：本表**初值**此前长期陈留（`guardSourceLines: 5379` 落后现基线 7 个版本 / 4167 行），
  //   `e1RatchetBaseline()` 的定义是「有留痕即取留痕末条 `.to`，**不用**初值」⇒ 只要该维有留痕，初值就**不参与任何判据**
  //   （实测：把初值改成 `1` / `99999` 跑守卫**恒为全绿**，零信号），却仍被留在源码里充当「唯一来源」的一半，
  //   读者据此会误判体量量级。本轮把各维初值**前移至当前实测值**（= 留痕末条 `.to`，如实记账、不改判据语义），
  //   并在守卫内加「初值陈旧可见披露」（本表一旦再次落后，运行时会打印指出）。
  //   残余自限（如实披露）：初值前移只保证**当刻**一致；它不会自动随留痕漂移（下一轮的漂移由上述运行时披露负责报出）。
  guardCodeLines: 1702,
  guardBranches: 58,
  libCodeLines: 397,
  libBranches: 133,
  manifestCodeLines: 370,
  manifestBranches: 0,
  scopesCodeLines: 112,
  scopesBranches: 4,
  guardSourceLines: 11053,
};
/**
 * E1 棘轮基线（**派生，不是第二份副本**）——Issue #352 第五刀（R8-F1）。
 * 口径与体量闸门注释一致：「现值唯一合法来源 = `E1_RATCHET_LOG[dim]` 最后一条 `.to`（无留痕时 = `E1_RATCHET_INITIAL[dim]`）」。
 * 此前该值另有 `E1_RATCHET_BASELINES` 表**逐维复制一遍** ⇒ 与 `E1_BASELINES` 恒等、
 * 「不许上调」判据恒真（9 个维度白写），属 `tests/ratchet.test.js` R3-F1 的同族形态。
 */
/**
 * 棘轮**锚定基线**（Issue #399 CP3 前复验真缺陷修复，铁律 24 第 6 维）——`guardSourceLines` 维
 * 「不许上调」的**比较对象唯一来源**，与 `E1_RATCHET_LOG` **互不派生**。
 *
 * ⚠️ 为什么必须独立成一份：旧口径 `e1RatchetBaseline(dim) = log.at(-1).to`，而 `E1_BASELINES`
 *   又必须与留痕对账（`checkRatchet` 判据②）⇒ 三者同改同过，**基线自指**：留痕一改，棘轮自动跟着改。
 *   实测（复验探针，三条缺一不可）：
 *     A 只改 `E1_BASELINES`（留痕不动） → `EXIT=1`「棘轮被上调」（上一轮修的正是这条）；
 *     B 改基线 + 同步留痕末条 `.to`    → `EXIT=0`（`current > baseline` 恒假）；
 *     C 三步全同步（+ 初值）           → `EXIT=0`（连「初值陈旧披露」这条唯一出界信号也消失）。
 *   ⇒ B/C 即「同一语义两处写 ⇒ 同改同过」在本守卫**自身**上的实例。
 *
 * ⚠️ 本常量**不是**防篡改机制（有写权限的人当然能一起改）—— 它提供的是**互相可见性**：
 *   原设计里「改基线」与「改留痕」是**同一处文本**（改一次即合法），现在是**两处**（漏改任一处即报红）。
 * ⚠️ 同维另有一条独立判据：实测值必须**当场派生自 `guard-sources.js` 机械枚举**（见下方 E1 循环），
 *   且不得换成同文件第二份副本 —— 静态判据覆盖该形态。
 */
// ⚠️ PR #415 × main v1.14.7 合并后按实测重锚：本 PR 新增 `lib/e1-metrics.js`（度量单源）、
//   `lib/ratchet-rechain.js` + `ratchet-rechain.js`（重链 CLI），经 `guard-sources.js` 机械枚举计入分母；
//   合并同时把守卫内联计数函数下沉到 lib 单源（-20 有效行）⇒ `guardCodeLines`/`guardBranches` 实测下降。
//   上调来源 = 合并引入的新机制代码（非放宽），与 `E1_RATCHET_LOG.guardSourceLines` 末条同步（Issue #408）。
const E1_RATCHET_ANCHOR = { guardSourceLines: 11053 };

const e1RatchetBaseline = dim => {
  // ① 锚定来源（**非自指**）：登记即以此为「不许上调」的比较对象，**不**从留痕派生。
  if (Object.prototype.hasOwnProperty.call(E1_RATCHET_ANCHOR, dim)) return E1_RATCHET_ANCHOR[dim];
  // ② 未登记锚定值的维度：沿用旧口径（末条 `.to` / 无留痕时初始值）。
  //    ⚠️ 残余自限（如实披露）：该口径下「基线 + 留痕同改同过」**仍成立** —— 本轮只把
  //    `guardSourceLines` 维（唯一「物理行数」维，也是复验探针 B/C 的现场）锚成独立来源；
  //    其余 8 维按同法推广属后续工作，本轮**不声称**已覆盖。
  const log = E1_RATCHET_LOG[dim] || [];
  return log.length ? log[log.length - 1].to : E1_RATCHET_INITIAL[dim];
};
/** 各维度上调留痕（#341：manifest 收紧同步 / guard R2 披露 +1 行；#354：guard 接入 K7 覆盖源校验 + 收紧同步） */
const E1_RATCHET_LOG = {
  libCodeLines: [
    {
      issue: '#352 第十刀',
      reason:
        '「统一重构 B」：K7 判据纯函数（extractEmittedLabels / extractGuideMapEntries / extractGuideMapKeys / ' +
        'checkGuideMapCoverage / checkGuideMapBudget，原 lib/governance-guide-map.js）**迁入本判据模块** ⇒ 有效代码行 +98',
      from: 183,
      to: 281,
      netDeletion: '总账净删 335 物理行（K7 三文件 615 行 > 并入 98 行）',
    },
    {
      issue: '#373',
      reason:
        'QA-F1 收口（+8 行有效代码）：覆盖侧补「空落点声明即报红」判据。' +
        '⚠️ 自限（显式披露）：本判据**不声称**拦住「把落点整条删掉且不留空括号」—— 落点不存在时' +
        '两侧判据均无从判定（属归属侧的结构性边界，已在 PR 留痕中如实记账）。',
      from: 281,
      to: 289,
      netDeletion: '0（新增判据；被取代机制见 guardSourceLines 维留痕）',
    },
    {
      issue: '#401 W-2',
      reason:
        '新增「工具结果信封」判据两条（checkEnvelopeKeyUsage / checkPayloadMarkerGuard）+ ENVELOPE_ALLOWED_KEYS 单源：' +
        '把「消费点只读投影后仍存在的键」与「字段名不得进兜底文案」落成可独立执行的判据（原仅由 e2e stub 承担）。' +
        'effective 行数随实测上调（本文件内为纯函数实现 + 注释块）。',
      from: 289,
      to: 333,
      netDeletion: '0（新增判据；被取代机制见 guardSourceLines 维留痕）',
    },
    {
      issue: '#401 R8 判据④（允许集合独立约束）',
      reason:
        '新增 `checkEnvelopeAllowlist`（允许键必须 ∈ 投影键集，**独立来源**不读本常量）⇒ 判据模块有效代码行随实测上调。' +
        '⚠️ 本条修复的是**实测假绿**：放宽 `ENVELOPE_ALLOWED_KEYS` 曾使守卫全绿（自指）。',
      from: 333,
      to: 350,
      netDeletion: '0（新增判据；被取代机制见 guardSourceLines 维留痕）',
    },
    {
      issue: '#401 R9 判据①′（消费侧必须真的读信封键）',
      reason:
        '新增 `checkEnvelopeConsumption`：判据① 只断言「读的键 ∈ 允许集合」，若消费点改成完全不读信封键' +
        '则恒真（实测假绿：整段去掉 `.isError` 读取后 EXIT=0）⇒ 补「至少读一枚」自检。',
      from: 350,
      to: 374,
      netDeletion: '0（新增判据）',
    },
    {
      issue: '#401 13/13 复盘',
      reason:
        '闭合自限 ①「间接读」：判据① 增「值为字段名的标识符 + 计算成员读取」面（原只拦成员访问 `.key`，' +
        '实测 `const k=\'success\'; output[k]` 全绿，与本源 bug 同族）⇒ 判据模块有效代码行随实测上调。',
      from: 374,
      to: 397,
      netDeletion: '0（新增判据面；本条即复盘改进项落成的门禁）',
    },
  ],
  libBranches: [
    {
      issue: '#352 第十刀',
      reason: 'K7 两条判据的纯函数迁入本判据模块（括号感知扫描 / 预算与覆盖判据）⇒ 分支数 +18',
      from: 80,
      to: 98,
      netDeletion: '总账净删 335 物理行（K7 三文件 615 行 > 并入 18 分支）',
    },
    {
      issue: '#373',
      reason:
        'QA-F1 收口：覆盖侧（`checkCoverageSide`）新增「空落点声明（缺 path）即报红」判据 —— ' +
        '实测「从清单整体删掉一个落点」原会**静默通过**（两侧判据都无从判定），属归属侧盲区；' +
        '该判据至少把「落点被删到只剩空括号」这一形态拦下',
      from: 98,
      to: 100,
      netDeletion: '0（新增判据 +2 分支；判据本体是本轮目的：堵静默通过口）',
    },
    {
      issue: '#401 W-2',
      reason: '新增两条信封判据的内部分支（注释剔除 / 字符串剥离 / 逐行扫描 ×2）随实测回写。',
      from: 100,
      to: 113,
      netDeletion: '0（新增判据；被取代机制见 guardSourceLines 维留痕）',
    },
    {
      issue: '#401 R8 判据④（允许集合独立约束）',
      reason: '判据④ 的内部分支（空集合 / 空投影键集 / 逐键归属）随实测回写。',
      from: 113,
      to: 118,
      netDeletion: '0（新增判据）',
    },
    { issue: '#401 R9 判据①′', reason: '判据①′ 的内部分支（空集合 / 零读取）随实测回写。', from: 118, to: 126, netDeletion: '0（新增判据）' },
    {
      issue: '#401 13/13 复盘',
      reason: '间接读面新增分支（别名 Hint 过滤 / 计算成员匹配 / 去重）随实测回写。',
      from: 126,
      to: 133,
      netDeletion: '0（新增判据面）',
    },
  ],
  guardBranches: [
    {
      issue: '#341',
      reason: 'R6 评审：E1 棘轮判据接入 + 同键集校验（+2 分支）',
      from: 34,
      to: 46,
      netDeletion: '0（判据单源化的必要分支：棘轮判据调用 + 缺维度校验）',
    },
    {
      issue: '#341',
      reason: '本轮新增「死元数据闸门」：清单落点指向幽灵路径即报红（+3 分支）',
      from: 46,
      to: 49,
      netDeletion: '同轮删除体量守卫内只护报告层的旧口径（净减那边）',
    },
    {
      issue: '#352 第十刀',
      reason: '「统一重构 B」并入 K7 两条判据（标签↔键闭合 + 文案预算）⇒ 本守卫分支数 +3',
      from: 49,
      to: 52,
      netDeletion: '总账净删 335 物理行（K7 三文件 615 > 轴 I 新增）',
    },
    {
      issue: '#352 第十一刀 F3',
      reason: '留痕时间序判据（checkRatchetLogChronology）接入本守卫循环编排（+1 分支）',
      from: 52,
      to: 53,
      netDeletion: '0（新增判据调用分支；判据本体单源在 lib/ratchet.js，未在此处复述）',
    },
    {
      issue: '#399 G3 跨 app 恒拦修复（守卫侧分支数记账）',
      reason:
        '同上（被动记账）：E1 留痕条目内的字面量使守卫脚本分支计数上调（`&&`/`||`/三元），非新增判据分支。',
      from: 53,
      to: 55,
      netDeletion: '0（被动记账；值按实测，见 from/to）',
    },
    {
      issue: '#395 校对抽风修复 × #403 合并（守卫侧分支数合并记账）',
      reason:
        '同源被动记账：合并 #403（整链报告环）后，本守卫内新增的 #399/#395 系列 E1 留痕条目（含 `&&`/`||`/三元字面量）' +
        '使守卫脚本分支计数（实测 75）高于原棘轮 55 ⇒ 按实测同步棘轮基线。' +
        '⚠️ 本条为**被动记账**：不新增任何判据分支（新增分支全在 E1 留痕对象的字面量内）。',
      from: 55,
      to: 57,
      netDeletion: '0（被动记账；值按实测 wc 计数，见 from/to）',
    },
    {
      issue: '#399 13/13 复盘第四轮',
      reason:
        '复盘第四轮独立复验实测：判据⑥ 的 CLI 编排 + 错误分支 + 命名口径自证分支使本守卫分支数实测 57 → 61，' +
        '原基线 57 的 1.05 余量（上限 60）已不足以容纳 ⇒ 实测 61 **越上限**（实测命令：`node scripts/validate-semantic-anchor-scope.js` 报 ' +
        '「E1 守卫脚本分支数超上限：61 > 60」）。本 PR 在此分支闭合，故按实测同步基线（57 → 61），非扩容。' +
        '⚠️ 边际警告（如实记账）：基线 61 × 1.05 = 上限 65，余量 4 分支 —— 本维已进入「每加一个分支都逼近上限」的边际区间，' +
        '后续若再增分支须先做等量删除（本守卫已有 1 次「R4-1 断言撤回」先例）。',
      from: 57,
      to: 61,
      netDeletion: '0（判据⑥ 编排/错误分支的必然分支；专测不计入本维）',
    },
    {
      issue: '#399 CP3 前复验（铁律 24 第 6 维）',
      reason:
        '**记账回写**（非新增判据）：对账判据新增分支（`base ≠ val` 二分诊断）+ 实测来源唯一性判据 + `hasOwnProperty` 锚定分支。',
      from: 61,
      to: 65,
      netDeletion: '0（本条为对齐实测的机械记账）',
    },
    {
      issue: '#408',
      reason:
        '与 main v1.14.7 合并后**按实测收紧**（Issue #408）：本 PR 把守卫内联的计数函数 `stripComments`/`countCodeLines`/`countBranches` **下沉到 `lib/e1-metrics.js` 单源**（守卫与 `npm run ratchet:rechain` 共用），守卫脚本自身有效代码行/分支数随之**下降**（同轮新增重链相关判据与留痕对象部分抵消）。',
      from: 65,
      to: 58,
      netDeletion: '7（同上：`stripComments`/`countCodeLines`/`countBranches` 移出守卫）',
    },
  ],
  guardCodeLines: [
    {
      issue: '#341',
      reason: 'R2 评审把「不开目录级豁免」的边界如实写进自限披露（+1 行代码）',
      from: 232,
      to: 233,
      netDeletion: '同轮删除 validate-* 整类排除与旧注释（净减）',
    },
    {
      issue: '#341',
      reason:
        'R6 评审：E1 基线此前可被随意放宽（实测放宽到 99999 仍 EXIT=0）。' +
        '本轮为 E1 接入共享棘轮判据 lib/ratchet.js（不许放宽 + 值与留痕对账）',
      from: 233,
      to: 387,
      netDeletion: '同轮删除体量守卫内本地重复的 S3/S4/S5 实现，改消费同一判据（净减那边）',
    },
    {
      issue: '#341',
      reason: '新增「死元数据闸门」（清单落点必须真实存在）：实测注入幽灵落点此前不报红',
      from: 387,
      to: 411,
      netDeletion: '0（闸门本体是本次目的；覆盖侧缺此断言＝假绿）',
    },
    {
      issue: '#341',
      reason: 'PR #345 第 1 轮评审：登记 guard-source-budget 语义键（+同键集校验的文档断言）',
      from: 411,
      to: 425,
      netDeletion: '同轮删除体量守卫内只护报告层的旧口径（净减在体量守卫侧）',
    },
    {
      issue: '#354',
      reason:
        'K7 覆盖源接入 GUARD_SCOPES 后，本守卫须断言「覆盖声明有真实执行者 + 落点与实做同源」' +
        '（+18 行）；同轮同 PR 内**同步收紧基线**到实测 452（非扩张，是把实测写回）',
      from: 425,
      to: 452,
      netDeletion: '同轮删除 README 中无执行者的声明（净减在文档侧）',
    },
    { issue: '#359', reason: '新增文档漂移覆盖源的「声明与实做同源」断言（+7 行有效代码）', from: 452, to: 466, netDeletion: '同轮删除文档侧手写工具数量（净减在文档侧）' },
    { issue: '#352 第二刀', reason: '删 doc-numbers 全链后回写本守卫实测有效代码行', from: 466, to: 462, netDeletion: '净删 4 行（本守卫侧覆盖源断言收窄；物理行数降 203 行）' },
    {
      issue: '#352 第十刀',
      reason:
        '「统一重构 B」：把原独立 K7 CLI 的两条判据（标签↔键闭合 + 文案预算）**并入轴 I**（编排放本守卫），' +
        '并同步回写实测有效代码行。⚠️ 本维**增**但**总账负**（`guardSourceLines` 按实测收紧，见该维留痕）：' +
        '同刀删除 K7 独立构件 615 行（lib 226 + CLI 99 + 专测 290）；评审-修复轮回补测试与消费端登记 +9 行。',
      from: 462,
      to: 554,
      netDeletion: '本维净增 82 行有效代码（并入 K7 判据编排）；物理行数总账随实测收紧，见 guardSourceLines 维',
    },
    {
      issue: '#352 第十一刀',
      reason:
        '文档形态守卫自限收口：本守卫侧新增「覆盖源声明与实做同源」类断言的**输出文案**同步（守卫 CLI 自限披露改为区分「已收口 / 残余」），' +
        '+ 洞 A 修复（历史区判定前置）+ 自限②行内矛盾判定编排；按 `wc -l` 实测回写',
      from: 554,
      to: 575,
      netDeletion: '本维 +18 行有效代码（新增判据编排 + 评审轮「缺传单源即报红」判据；数据单源与专测在其它文件）',
    },
    {
      issue: '#352 第十一刀 F3',
      reason:
        'F3 收口（留痕时间序）：本守卫新增 checkRatchetLogChronology 调用编排 + 留痕数组按时间序重排（同一处不再既称收紧到 5379 又称上调到 5630）；' +
        '按实测回写有效代码行',
      from: 575,
      to: 606,
      netDeletion: '本维 +6 行有效代码（消费单源判据的编排；判据本体在 lib/ratchet.js 与专测在 tests/）',
    },
    {
      issue: '#373',
      reason:
        '方案 A 落地：本守卫按 E1 既有流程**同步回写**三处实测值（`guardCodeLines` / `guardSourceLines` / ' +
        '`manifestCodeLines`）——#373 新增判据 G 的消费与第 9 语义键登记改变了守卫体量与清单体量，' +
        '按实测收紧而非扩容（`≤ 基线 ×1.05` 构造余量不变）',
      from: 606,
      to: 659,
      netDeletion: '本维 +23 行有效代码（E1 三处回写 + 判据 G 配套）；被取代机制见 guardSourceLines 维留痕',
    },
    {
      issue: '#373 第 1 轮评审',
      reason:
        'CR 第 1 轮修复后按 E1 既有流程**同步回写**实测值（`guardCodeLines` 659→682）：本守卫新增' +
        '「文档声明数 == 派生真值」对账编排 + 判据去重叠/口径归一；按实测收紧而非扩容（≤ 基线 ×1.05 构造余量不变）',
      from: 659,
      to: 682,
      netDeletion: '本维 +14 行有效代码（对账判据编排）；被取代机制见 guardSourceLines 维留痕',
    },
    {
      issue: '#373 第 2 轮评审',
      reason:
        'CR2-2 根因修复：第 1 轮「删文档数字」使判据与修复互相拆台（数字一删即离开对账视野）⇒ ' +
        '本轮新增**清单完整性**判据 + 清单**机械枚举**；按 E1 既有流程同步回写实测值（按实测收紧，非扩容）',
      from: 682,
      to: 692,
      netDeletion: '本维 +10 行有效代码（第 2 轮对账判据落在 `validate-tool-counts.js`；本守卫侧为基线回写 + 新增留痕条目）',
    },
    {
      issue: '#373 第 3 轮评审',
      reason:
        'CR3-2 根因修复：本守卫新增**判据 H**（网关索引条目 ↔ 有执行者，读 VERIFIED_TOOLS + PS1 switch + tools 全树 handler）' +
        '并把设计教训（「只读 `tools/index.ts` 会漏掉全部 sub-module handler ⇒ 首版产 4 条误报」）写入注释；按实测收紧',
      from: 692,
      to: 729,
      netDeletion: '本维 +37 行有效代码（判据 H 编排 + 自检路径扩充）；被取代机制见 guardSourceLines 维留痕',
    },
    {
      issue: '#373 第 4 轮评审',
      reason:
        'CR4-3 根因修复（本守卫侧 0 改动，仅同步基线）：数字对账扫描面扩到 `.opencode/plugins/*.js` 与 ' +
        '`wps-office-mcp/src/**/*.ts` 后，本守卫的 E1 三处基线按实测收紧',
      from: 729,
      to: 748,
      netDeletion: '本维 0（本轮改动落在 `validate-tool-counts.js`，本守卫仅同步基线 + 新增留痕条目）',
    },
    {
      issue: '#373 第 5 轮评审',
      reason:
        'CR5-2 删除黑名单 / CR5-1 消除第二份手写文件清单（均在 `validate-tool-counts.js`）；' +
        '本守卫侧仅同步 E1 基线 + 新增留痕条目',
      from: 748,
      to: 770,
      netDeletion: '本维 0（改动落在 `validate-tool-counts.js`；本守卫仅基线回写）',
    },
    {
      issue: '#373 第 7 轮评审',
      reason: 'CR7-1 语序穷举（改动在 `validate-tool-counts.js`）；本守卫侧仅同步 E1 基线 + 留痕条目',
      from: 770,
      to: 796,
      netDeletion: '本维 0（本守卫仅基线回写）',
    },
    {
      issue: '#352 第十二刀（12/12 复盘）',
      reason:
        '本守卫侧新增「断档编号」判据（②）的**派生 + 编排 + 输出文案**：合法编号集合运行时从 ' +
        '`governance.js` 头部声明行派生（不手写清单），并按 `wc -l` 实测回写有效代码行',
      from: 796,
      to: 821,
      netDeletion: '本维 +17 行有效代码（编排 + 派生 + 文案；判据本体在 lib/doc-drift-scope.js、数据单源在 doc-drift-manifest.js、专测在 tests/）',
    },
    {
      issue: '#380 12/12 复盘',
      reason:
        'E1 基线随实测回写（本守卫内新增 E1 留痕条目 + 引入发布留痕连通性守卫）' +
        '—— 属本守卫自身编排账',
      from: 821,
      to: 839,
      netDeletion: '本维 +N 行有效代码（E1 留痕条目 ×2 + 基线常量回写）',
    },
    {
      issue: '#382 DECISION-1',
      reason:
        '守卫重写（工具成员一致性判据 A~E：纯 TS 工具必直连注册 / 同名不得双通道 / 索引条目必有执行者 / ' +
        '不得再有网关专属黑名单）+ 本文档内同步登记 E1 留痕条目；有效代码行随实测上调（839 → 857）',
      from: 839,
      to: 857,
      netDeletion:
        '本维 +18 行有效代码（判据 A~E + allTools 装配链解析；被取代机制：旧判据 A~H 与 DTG 命名域/孤儿键转换，' +
        '见 `validate-gateway-membership.js` 净删 208 行）',
    },
    {
      issue: '#382 销项补漏（遗漏 3：AI 可见面纳入扫描）',
      reason:
        '文档漂移守卫扫描面纳入 9 份 AI 可见面文档（skills/agents）+ 清单去重（guard-scopes 派生引用）；' +
        '本守卫内同步登记 E1 留痕条目 ×2；有效代码行随实测 857 → 885',
      from: 857,
      to: 885,
      netDeletion:
        '本维 +17 行有效代码（E1 留痕条目 ×2 + 自限文案改述）；被取代机制：`guard-scopes.js` 手抄的第二份' +
        '扫描名单（19 行 → 3 行派生引用），见 guardSourceLines 维留痕',
    },
    {
      issue: '#383',
      reason:
        'NPC Team 提示词整改（13 阶段 + 5 暂停点）牵连本守卫：把「阶段总数 12」三处硬编码' +
        '（正则 / 循环上界 / 段锚点字面量）改为一律派生自 lib 的 STAGE_COUNT，并把三处' +
        '`prompt.match(段正则)` 换成行式 `sectionOf` 派生（原正则在 `m` 标志下惰性收尾于首行末，' +
        '实测段内容只捕获 1 行）。按 E1 既有流程同步回写实测值（≤ 基线 ×1.05 构造余量不变）',
      from: 885,
      to: 934,
      netDeletion:
        '本维 +49 行有效代码（段派生 helper + 阶段数单源 + **阶段数单源化反向断言**（评审 CR2-1 ' +
        '根因修复：错误文案内 `/12` 字面量亦须派生）+ 注释）；**被取代机制同步删除**：' +
        '三处手写阶段总数（`\\/12` 正则 / `i <= 12` / 「12 阶段」字面量）、两处手写段标题字面量，' +
        '以及**11 处错误文案内手写旧阶段号**（评审 CR2-1 当场删除）',
    },
    {
      issue: '#383 13/13 复盘（铁律 22 当轮落地）',
      reason:
        '发布留痕连通性守卫新增判据③（标签↔发布分支可达）⇒ 本守卫 E1 棘轮同步回写实测值：' +
        '`guardSourceLines` 6847→6974、`guardCodeLines` 934→960（后者因本守卫内棘轮留痕条目 + 基线回写），' +
        '按 E1 既有流程写声明值，余量仍由 ×1.05 构造保证',
      from: 934,
      to: 960,
      netDeletion:
        '本维 +15 行有效代码（E1 两条留痕条目 + 基线回写）；被取代机制见 guardSourceLines 维留痕（本条为记账连带，非新判据实现）',
    },
    {
      issue: '#382 12/12 复盘（判据 F 落成）',
      reason:
        '复盘铁律 22/23：把 6/12 评审 CR10-1 根因（直连通道绕过 P1~P4）钉成**判据 F** —— '
        + '`normalizeToolCall` 归一化唯一定义者 + before/after 双钩子消费 + 判据不得在定义体之外读 `args.tool_name`。'
        + '本守卫（`validate-gateway-membership.js`）新增判据 F 编排 + 文件头/失败提示文案，有效代码行随实测上调；'
        + '专测（`tests/validate-gateway-f-criterion.test.js`，8/8）不计入本维（tests/ 不在机械枚举范围）。',
      from: 960,
      to: 976,
      netDeletion: '0（**新增不变量**，不取代既有代码 —— 把一次性修复升为持续可验守卫）',
    },
    {
      issue: '#389（判据 G 披露带编号，复盘铁律 22）',
      reason:
        '本守卫新增判据 G 编排（读单源编号 + 缺编号报红 + 派生披露文案），有效代码行随实测上调；'
        + '专测（tests/validate-gateway-membership.test.js 新增 3 例）不计入本维（tests/ 不在机械枚举范围）。',
      from: 976,
      to: 1013,
      netDeletion: '0（**新增不变量**：把「无编号待后续」落成可验守卫）',
    },
    {
      issue: '#388 13/13 复盘（发布说明归档入扫描面）',
      reason:
        '本守卫编排 + 自限披露 ④ 随覆盖面扩大按实测上调（`docs/releases/*.md` 机械枚举入面）；'
        + '专测（tests/validate-doc-drift.test.js 新增 6 例）不计入本维（tests/ 不在机械枚举范围）。',
      from: 1013,
      to: 1034,
      netDeletion: '0（**新增覆盖面**：把「#393 修的同类漂移无守卫兜底」落成可验门禁）',
    },
    {
      issue: '#395 校对抽风修复（同批两维联动记账）',
      reason:
        '上一条 `guardSourceLines` 留痕本身增有效代码行 ⇒ 本维 1034→1055（实测计数，不手写）。' +
        '⚠️ 本条为**被动记账**：只登记「记录增长」这一动作的成本，不新增任何判据/机制。',
      from: 1034,
      to: 1055,
      netDeletion: '0（同一条留痕的第二维记账，无新增机制）',
    },
    {
      issue: '#399 G3 跨 app 恒拦修复（守卫侧有效代码行记账）',
      reason:
        '本 PR 在 `validate-semantic-anchor-scope.js` 的 `E1_RATCHET_LOG` 内新增本组留痕条目（#399 三维一次记账）' +
        '⇒ 守卫脚本有效代码行随实测上调。⚠️ 本条为**被动记账**（只登记本 PR 已发生的守卫侧增长），不新增判据。',
      from: 1055,
      to: 1096,
      netDeletion: '0（新增内容 = E1 留痕条目本身；逻辑判据未变，属守卫侧纯记账净增）',
    },
    {
      issue: '#395 第 1 轮评审 CR1-2/1-3/1-4（含 #402 合并顺延）',
      reason:
        '上一条记账后本轮又改本守卫（CR1-4 prose 去手写数字 + CR1-2/1-3 留痕编排）⇒ 有效代码行随实测上调；' +
        '本条为 #403 合并后联合实测值（含 CR1-x 与合并顺延留痕条目）。' +
        '⚠️ 本条为**被动记账**：只登记「记录增长」这一动作，不新增任何判据/机制。',
      from: 1096,
      to: 1131,
      netDeletion: '0（同一条留痕的第二维记账，无新增机制）',
    },
    {
      issue: '#400 P2 不变量守卫（守卫侧有效代码行记账）',
      reason:
        '本守卫编排侧新增：`proofread-p2-invariant` 覆盖源登记后的 E1 各维留痕条目、基线回写与判据编排。' +
        '有效代码行随实测回写（1131 → 1141，含 #403/#404 合并后的联合实测值）。' +
        '⚠️ 本条为**被动记账**：只登记编排侧记账成本，不新增判据分支。',
      from: 1131,
      to: 1183,
      netDeletion: '本维 +10 行有效代码（E1 留痕条目 + 基线常量回写）；被取代机制见 guardSourceLines 维留痕（本条为记账连带）',
    },
    {
      issue: '#401 W-2 留痕自记账',
      reason:
        '本 PR 为 E1 四维回写上调留痕条目（libCodeLines / libBranches / manifestCodeLines / scopesCodeLines / ' +
        'guardSourceLines）⇒ 本守卫脚本自身有效代码行随实测上调（1055→1101，含 5 个留痕对象 + 本条目）。' +
        '⚠️ 本条为**机械自记账**（只登记已发生的增长），不新增任何判据。',
      from: 1183,
      to: 1248,
      netDeletion: '0（新增内容 = 棘轮留痕对象；判据未变）',
    },
    {
      issue: '#401 R5/R7 守卫加固与文案收窄',
      reason:
        'R5-1 修「判据② 静默缺席」+ R7-1 按实测收窄守卫文案自限 ⇒ 本守卫脚本有效代码行随实测上调（1120）。' +
        '⚠️ 机械自记账（只登记已发生的增长），不新增判据。',
      from: 1248,
      to: 1303,
      netDeletion: '0（本条为对齐实测的机械记账；判据未变）',
    },
    {
      issue: '#399 11/13 发布补正',
      reason:
        '本 PR 为 `guardSourceLines` 维回写上调留痕条目 ⇒ 本守卫脚本自身有效代码行随实测上调（1303→1315，+12）。' +
        '⚠️ 本条为**机械自记账**（只登记已发生的增长），不新增任何判据。',
      from: 1303,
      to: 1324,
      netDeletion: '0（本条为新留痕对象自身；判据未变）',
    },
    {
      issue: '#399 13/13 复盘',
      reason:
        '本 PR 为 `guardSourceLines` 维回写判据⑤ 留痕条目 + 基线回写 ⇒ 本守卫脚本自身有效代码行随实测上调（1324→1336，+12）。' +
        '⚠️ 本条为**机械自记账**（只登记已发生的增长），不新增任何判据。',
      from: 1324,
      to: 1345,
      netDeletion: '0（本条为新留痕对象自身；判据未变）',
    },
    {
      issue: '#401 13/13 复盘（#412 合并）',
      reason:
        '本条复盘留痕条目（三处 `.to` 回写 + 判据头自限收窄 + 间接读面登记；#412 与 main 合并后按实测回写）' +
        '⇒ 本守卫脚本有效代码行随实测上调（1345→1371，含 #399 两条留痕与本条）。⚠️ 机械自记账，不新增判据。',
      from: 1345,
      to: 1371,
      netDeletion: '0（新增内容 = 棘轮留痕对象；判据未变）',
    },
    {
      issue: '#399 13/13 复盘第二轮',
      reason:
        '本守卫（轴 I CLI）为 `guardSourceLines` 维回写判据⑤ 第二轮修正的留痕条目 ⇒ 本脚本自身有效代码行随实测上调' +
        '（1371→1426；含 2 个留痕对象 + 基线回写）。⚠️ 本维为**机械自记账**（记账连带），非新增判据实现。',
      from: 1371,
      to: 1426,
    },
    {
      issue: '#399 13/13 复盘第四轮',
      reason:
        '复盘第四轮独立复验实测：新增「E1 初值陈旧可见披露」判据（缺陷② 的可执行落点）使本守卫有效代码行' +
        '实测 1426 → 1454（含本条目自身），按实测同步基线（非扩容，属新增判据的必然记账）。',
      from: 1426,
      to: 1454,
      netDeletion: '0（新增判据；被取代机制：无）',
    },
    {
      issue: '#399 CP3 前复验（铁律 24 第 6 维）',
      reason:
        '**记账回写**（非新增判据）：把 E1 的「基线 = 实测」立为独立 CLI 判据后，基线必须与当场派生一致 ⇒ 本维按实测回写。本 PR 内本守卫自身增长来自：判据编排（dim 列 + 对账判据 + 来源唯一性判据）、`E1_RATCHET_ANCHOR` 常量与注释、`selfSource()` 提升、以及本维留痕条目自身。',
      from: 1454,
      to: 1506,
      netDeletion: '0（本条为对齐实测的机械记账）',
    },
    {
      issue: '#408',
      reason:
        '同 PR 内重锚收尾（注释行同步）：与 main v1.14.7 合并后按实测收敛。',
      from: 1506,
      to: 1518,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#408',
      reason:
        '与 main v1.14.7 合并后**按实测记账**（Issue #408）：本 PR 把守卫内联的计数函数 `stripComments`/`countCodeLines`/`countBranches` **下沉到 `lib/e1-metrics.js` 单源**（守卫与 `npm run ratchet:rechain` 共用，守卫侧净减 8 行有效代码）；同轮新增的重链相关判据与**本留痕条目自身**使本维实测净增至此值（留痕条目本身计入守卫源码）。⚠️ 两侧口径如实并列：判据逻辑因下沉而变短，记账文本因留痕而变长。',
      from: 1518,
      to: 1526,
      netDeletion: '守卫侧逻辑净减 8（计数函数下沉到 lib 单源）；本维实测净增 = 该 8 行让位于留痕条目与重链判据的记账增长',
    },
    {
      issue: '#408',
      reason:
        '重链 CLI 支持 E1_RATCHET_ANCHOR 同步（与 main Issue #399 CP3 的锚机制对齐）：授权上调时锚随留痕末条同改，否则重链后轴 I 报「棘轮被上调」。本条目为 CLI 自身增长（setAnchor + 定式锚同步）的机械记账。',
      from: 1526,
      to: 1542,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#417',
      reason:
        '判据⑦ 发布产物打包口径守卫：release-connectivity-scope.js 新增 checkArtifactPacking（三条断言：产物不入产物 / 排除口径同源 / 体积上界）+ release-connectivity-manifest.js 两个声明式单源（ARTIFACT_EXPORT_IGNORE_PATTERN / ARTIFACT_SIZE_*）+ validate-release-connectivity.js CLI 编排。物理行数随 guard-sources.js 机械枚举按实测回写。与 main v1.14.7（Issue #408）合并后重链：main 链条末条 10273，本 PR 新增判据⑦ 使实测增至 10593。',
      from: 1542,
      to: 1558,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#420',
      reason:
        'Issue #420：治理层 P1「已覆盖区间只读重读」豁免（governance.js）+ path-safety.ts 新增 buildWriteRootsWithDocDir 单源助手 + 两个守卫脚本自身的增改 —— 均在 guard-sources.js 枚举面内。增量取实测（`to` 由 rechain 派生，非手抄）。',
      from: 1558,
      to: 1574,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#420',
      reason:
        'Issue #420 13/13 复盘 · 铁律 22 预防性闭环：新增判据⑧（标签 ↔ 发布说明存在性反向断言，release-connectivity-scope.js +43 行）+ 7 例专测（含真实 CLI 端到端变异自证）—— 均为新增校验能力，非放宽',
      from: 1574,
      to: 1590,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 1~3 轮评审修复的机械记账：CR419-1（判据⑥/⑧ 待发布树口径统一到 HEAD —— 原读 refs/heads/main 与实际被断言的 HEAD 背离 ⇒ 未合并分支上删产物假绿）+ CR419-2（判据面补 >= floor，防低于产物下限的历史版本被拉进面内假红）+ CR419-3（判据⑥ 文档口径同步为「待发布树」）+ 反重复（判据⑨ 删除与判据⑥ 重复的「在树内」断言，仅保留 everCommitted / 接口自洽 / 决策落点三条独立断言）。',
      from: 1590,
      to: 1614,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 4 轮评审 CR419-4（根因修复）：把「历史产物处置完整性」登记为轴 I 语义键 artifact-floor-integrity（manifest 单源 + 判据 + 编排三落点 + 文档），闭合 1/13 实测出的归属侧盲区 —— 此前 release-connectivity-manifest.js 仅**间接**命中 guard-source-budget 锚点，导致该文件内新同义实现（如历史版本豁免清单）在轴 I 归属侧零信号。落点登记后，该文件内以代码形态承载新语义将被归属侧看见。',
      from: 1614,
      to: 1630,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 5~9 轮评审修复机械记账：CR419-5（决策登记断言空心化 —— 实测 [\'x\']/[\'\'] 放行 ⇒ 收为 ^#\d+$ 校验，与 lib/ratchet.js「空壳留痕不受理」同口径）+ CR419-6（判据⑥ 口径澄清后的旧措辞「发布分支树」在源码/注释/用例名中的残留同步为「待发布树」；历史记录与 E1 留痕不改写）。',
      from: 1630,
      to: 1646,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        '第 2 轮评审 CR419-11 修复：判据⑧ 补「未决下限不得抬高致判据面为空」对偶断言（原仅拦下调）；净增 31 行（守卫 + 专测）',
      from: 1646,
      to: 1662,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 与 main v1.14.9（Issue #420）合并的机械记账：留痕链由两侧拼接（main #420 条目在前、本 PR #419 五条顺延），物理行数随 guard-sources.js 机械枚举按当场实测回写。',
      from: 1662,
      to: 1674,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#421',
      reason:
        'main（Issue #420 判据⑧ 标签↔发布说明存在性 + 治理层 P1 豁免）与 PR #421（Issue #419 判据⑨ 历史产物处置完整性）合并的机械记账：两侧均新增守卫源码与专测；判据编号碰撞收敛为 main ⑧ 保留、本 PR ⑨；物理行数/有效行数按合并后当场实测回写，非放宽',
      from: 1674,
      to: 1702,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
  ],
  manifestCodeLines: [
    {
      issue: '#343',
      reason: '登记校对线三个语义无主的语义键（16 个落点），属该 Issue 目的',
      from: 96,
      to: 205,
      netDeletion: '0（数据登记，非判据复杂度）',
    },
    {
      issue: '#341',
      reason: '同轮收紧到实测值 214（#343 登记未同步基线，长期挂 warning）',
      from: 205,
      to: 214,
      netDeletion: '0（收紧，非扩张）',
    },
    {
      issue: '#341',
      reason: 'R7 评审：登记新契约 lib/ratchet.js 为轴 I 语义键 ratchet-verdict（3 个落点）',
      from: 214,
      to: 245,
      netDeletion: '0（登记落点，是该评审的目的；棘轮本身即为此类「新增语义无主」而设）',
    },
    {
      issue: '#341',
      reason: 'PR #345 第 1 轮评审：登记轴 I 新语义键 guard-source-budget（1 个落点）',
      from: 245,
      to: 256,
      netDeletion: '0（登记落点，是该评审的目的：新契约 guard-source-budget 须有归属）',
    },
    {
      issue: '#354',
      reason:
        'K7 守卫（GUIDE_MAP 指路完整性）使治理插件成为本清单的**被覆盖落点**：' +
        '登记语义键 governance-guide-map（3 个落点），属该 Issue 目的（把「无执行者的声明」落成契约）',
      from: 256,
      to: 284,
      netDeletion: '0（数据登记，非判据复杂度）',
    },
    {
      issue: '#352 第十刀',
      reason:
        '第十刀评审 F3：K7 判据并入轴 I 后，其**消费端落点随实现同步登记**（`semantic-anchor-scope.js` ' +
        '+ 其 CLI）——不留「消费端未登记」的孤儿（与 F6 同构形态）',
      from: 284,
      to: 222,
      netDeletion: '净删 62 行（同刀删 entry 级 anchorNames 6 处；新增 2 个落点登记 < 删除量）',
    },
    {
      issue: '#373',
      reason:
        '登记第 9 个语义键 `tool-count-source`（4 个落点：mcp-server 内置注册清单 / validate-tool-counts ' +
        '数值传递 / gateway-membership 判据 G / DEVELOPMENT_GUIDE 语义键清单区块）——属该 Issue 目的' +
        '（「哪些工具可直连调用」这一概念此前无主，治理/注册/文档/校验四处各写一份）',
      from: 222,
      to: 252,
      netDeletion: '0（数据登记，非判据复杂度；「只增不减」说明见 PR 描述）',
    },
    {
      issue: '#400',
      reason:
        '登记第 10 个语义键 `proofread-p2-invariant`（3 个落点：治理插件 P2 判据 / 行为守卫 CLI / 判据纯函数）' +
        '——属该 Issue 目的（「P2「本批已上报」前置不变量」此前只由 tests/ 承载、scripts/ 层无断言）。' +
        '有效代码行随实测回写（252 → 276，含第 5 轮格式修复 +1 行）',
      from: 252,
      to: 276,
      netDeletion: '0（数据登记，非判据复杂度）',
    },
    {
      issue: '#401 W-2',
      reason:
        '新增语义键 `tool-result-payload` 及其 37 个落点登记（契约定义者 2 + 投影 1 + 消费面 1 + 33 个 impl 落点，' +
        '后者由轴 I 归属侧机械枚举报出、必须登记以闭合「同一语义的落点集」）⇒ 清单模块有效代码行随实测上调。',
      from: 276,
      to: 338,
      netDeletion: '0（新增登记；被取代机制见 guardSourceLines 维留痕）',
    },
    { issue: '#401 9/13 文档（DO 落点登记）', reason: '新增 `docs/DEVELOPMENT_GUIDE.md` 作为 `tool-result-payload` 的 docs 落点 —— 文档承载该语义即须登记（轴 I 归属侧明文要求，非宽松化）。', from: 338, to: 344, netDeletion: '0（新增登记）' },
    {
      issue: '#408',
      reason:
        'E1 重链机制落地：新增 `lib/e1-metrics.js`（E1 度量口径单源）+ `lib/ratchet-rechain.js`（重链判据纯函数）+ `ratchet-rechain.js`（CLI，`npm run ratchet:rechain`）；并把守卫源码枚举面从 `validate-*.js` 扩到 `validate|ratchet-*.js`（防「改前缀逃出体量分母」）；`semantic-anchor-manifest.js` 同步登记重链 CLI 为 `guard-source-budget` 消费端。',
      from: 344,
      to: 345,
      netDeletion: '0（新增机制，无同范围旧机制可删；被取代的**人工拼接动作**非代码）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 4 轮评审 CR419-4（根因修复）：把「历史产物处置完整性」登记为轴 I 语义键 artifact-floor-integrity（manifest 单源 + 判据 + 编排三落点 + 文档），闭合 1/13 实测出的归属侧盲区 —— 此前 release-connectivity-manifest.js 仅**间接**命中 guard-source-budget 锚点，导致该文件内新同义实现（如历史版本豁免清单）在轴 I 归属侧零信号。落点登记后，该文件内以代码形态承载新语义将被归属侧看见。',
      from: 345,
      to: 370,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
  ],
  scopesCodeLines: [
    {
      issue: '#354',
      reason: '登记 K7 覆盖源（governance-guide-map）到 GUARD_SCOPES 单源 + 其覆盖落点常量',
      from: 68,
      to: 80,
      netDeletion: '0（覆盖声明必须为真实守卫建档，属该 Issue 目的；同轮删掉 README 的不实声明）',
    },
    {
      issue: '#359',
      reason: '登记文档形态漂移守卫（doc-drift / validate-removed-mechanisms）的覆盖源与扫描落点常量',
      from: 80,
      to: 114,
      netDeletion: '0（覆盖声明必须为真实守卫建档；同轮删掉文档侧手写数字与旧示例）',
    },
    { issue: '#352 第二刀', reason: '删 doc-numbers 守卫全链（含其在 GUARD_SCOPES 的覆盖源与常量）⇒ 有效代码行收紧', from: 114, to: 106, netDeletion: '净删 8 行有效代码（guard-scopes 移除 DOC_NUMBERS_SCRIPT / 覆盖源条目 / 常量）' },
    { issue: '#352 第十刀', reason: '删 K7 独立 CLI 常量（GOVERNANCE_GUIDE_MAP_SCRIPT）⇒ 范围单源模块收紧到实测 104', from: 106, to: 104, netDeletion: '净删 2 行有效代码' },
    {
      issue: '#373 第 3 轮评审',
      reason:
        'CR3-2 根因修复：判据 H「网关索引条目 ↔ 有执行者」把覆盖范围扩到 PS1 桥接（`wps-com.ps1`）' +
        '与网关索引（`gateway/index.ts`）⇒ GUARD_SCOPES 的 GATEWAY_MEMBERSHIP_PATHS 新增 2 个落点，' +
        '范围单源模块按实测收紧',
      from: 104,
      to: 106,
      netDeletion: '0（覆盖声明必须为真实守卫建档，属该 Issue 目的）',
    },
    {
      issue: '#382 DECISION-1',
      reason:
        '`GATEWAY_MEMBERSHIP_PATHS` 随守卫重写同步：删掉的 2 个落点（proofread.ts / 旧网关索引口径）与新增的 3 个落点' +
        '（mcp-server.ts / tools/index.ts / 网关 schema 转换）净增 1 处覆盖声明；物理行数随实测上调（106 → 107）',
      from: 106,
      to: 107,
      netDeletion: '0（覆盖声明须与守卫实做同源，非扩容；本守卫自身由 324 → 287 行净删）',
    },
    {
      issue: '#400',
      reason:
        '登记 P2 不变量守卫（`proofread-p2-invariant`）的覆盖源与 3 个覆盖落点常量（`P2_INVARIANT_PATHS`）；' +
        '有效代码行随实测回写（107 → 112）',
      from: 107,
      to: 112,
      netDeletion: '0（覆盖声明须为真实守卫建档，属该 Issue 目的）',
    },
    {
      issue: '#401 W-2',
      reason:
        'guard-scopes.js 的 `ANCHOR_SCAN_ROOTS` 等不再重复登记（本维**收紧**）：随本 PR 实测回写。' +
        '⚠️ 本条为**净减**（107→97，实测 wc/计数），非扩面。',
      from: 112,
      to: 112,
      netDeletion: '净删 10 行有效代码（原手抄第二份路径清单的残余随实测撤销）',
    },
  ],
  // 第五刀：本维**由体量闸门迁入**（原键 `guard-source-budget` × 断言 S8），口径 = 守卫源码物理行数总量。
  //   5519 是第三刀机械枚举后的实测值（负棘轮，非扩容），此处取其现值作为唯一来源，禁止第二份副本。
  guardSourceLines: [
    {
      issue: '#352 第五刀',
      reason:
        '体量棘轮并入轴 I 单一来源：原 `guardSourceLines` 维度（原 `guard-source-budget` 键 × S8）删除 —— 实测它与轴 I 的 E1 是**同一判据的两份实现**（各自维护「不许上调 / 值与留痕对账 / 达标即收紧」），' +
        '且同刀发现并闭合一个真弱点：原 S8 的「达标即收紧」用实测值比对，而棘轮表由人手写 ⇒ **首跑即报红、只能改棘轮表放行**（不是靠人工「记得同步」）',
      from: 5519,
      to: 5630,
      netDeletion:
        '净删 ≥ 本刀新增行（守卫源码 -191 / 测试 -150，实测见 PR）；另有 -4 行**不变量**：`checkRatchet` 的「达标即收紧」分支（全仓零有效调用）',
    },
    {
      issue: '#352 第七刀',
      reason:
        '（第七刀 rebase 到第五刀之后同步）删 npc-team-bloat 的 E1/H1 两自指层后，守卫源码物理行数总量实测 5630 → 5518，随实测**收紧**基线（只降不升，防基线松于实际造成盲区）',
      from: 5630,
      to: 5526,
      netDeletion: '净删 112 行（npc-team-bloat 守卫 −112）',
    },
    {
      issue: '#352 第九刀',
      reason:
        '（第九刀 rebase 到第五刀之后同步）删轴 I 的「方向 2 / AC4」两个零判别力自指判据 + 清单 54 行死字段后，守卫源码物理行数总量实测 5526 → 5371，随实测**收紧**基线（只降不升）',
      from: 5526,
      to: 5379,
      netDeletion: '净删 155 行（轴 I CLI/判据/清单）',
    },
    {
      issue: '#352 第十刀',
      reason:
        '「统一重构 B + 第十刀」：删 K7 独立构件（lib 226 + CLI 99 + 专测 290 = 615 行），' +
        '两条判据并入轴 I（判据模块 +98 行）；评审-修复轮回补 K7 专测 + 消费端落点登记（本守卫 +44 行），' +
        '守卫源码物理行数总量按 `wc -l` 实测收紧（见 from/to，不手写中间快照）',
      from: 5379,
      to: 5363,
      netDeletion: '净删 16 物理行（K7 独立构件 −615 含专测 290 > 轴 I 新增 +133 + 评审回补 +61）；实测 main 5379 → head 5362',
    },
    {
      issue: '#352 第十一刀',
      reason:
        '文档形态守卫「显式自限继续收口」：收口自限②的**可收口部分** + 闭合实测出的**洞 A** + 回补 4 例专测；' +
        '守卫源码物理行数随 `wc -l` 实测**上调**（+58），见 from/to（不手写中间快照）',
      from: 5363,
      to: 5475,
      netDeletion:
        '本维**增 110 行**（收口真判据 + 数据单源 + 专测；评审轮再加「缺传单源即报红」判据 + 3 例专测 —— ' +
        '属「新增判据 + 回补测试」，非放宽）；其余 E1 维不变',
    },
    {
      issue: '#352 第十一刀 F3',
      reason:
        'F3 收口：新增留痕时间序判据（lib/ratchet.js +45 物理行；与 checkRatchet 单源同居）+ 本守卫调用编排；' +
        'guardSourceLines 物理行数随 wc -l 实测上调，见 from/to；同 PR 内把 guardSourceLines 留痕数组重排为时间序（纯重排，不改值）',
      from: 5475,
      to: 5545,
      netDeletion: '本维 +45 物理行（新增判据 + 编排；专测不计入本维 —— tests/ 不在枚举范围）',
    },
    {
      issue: '#373',
      reason:
        '方案 A（治理层服从注册层）落地：`validate-gateway-membership.js` 新增判据 G 双向断言（+判定单源函数）；' +
        '`validate-tool-counts.js` 两处假绿改为**全部派生自代码**；`semantic-anchor-manifest.js` 登记第 9 语义键；' +
        '物理行数随 `wc -l` 实测上调，见 from/to（不手写中间快照）',
      from: 5545,
      to: 5742,
      netDeletion:
        '本维 +133 物理行（判据 G + 数量派生 + 语义键登记 + 守卫编排）；' +
        '**被取代机制同步删除**：`governance.js` 的 6 条双路径拦截（G1 只拦网关专属）+ `console.log(\'内置工具: 12\')` 手写常量 + 读已迁移数组的 COM Actions 假绿分支',
    },
    {
      issue: '#373 第 1 轮评审',
      reason:
        'CR 第 1 轮修复：① `validate-tool-counts.js` 新增「文档声明数 == 派生真值」对账判据 + registry.register 口径交叉核；' +
        '② `validate-gateway-membership.js` G-1/G-2 判据域**去重叠** + 统一 full name 口径 + 去掉 `opts` 空壳参数。' +
        '物理行数随 `wc -l` 实测上调，见 from/to',
      from: 5742,
      to: 5830,
      netDeletion:
        '本维 +88 物理行（**全部为判据/对账新增**，无新实现）：文档数对账判据 + registry 口径交叉核 + ' +
        '`--root` 支持（供真实链路变异自证）；同轮 CR1-1 使 G-2 减少一条重复诊断分支、CR1-5 去掉空壳参数，属净删方向',
    },
    {
      issue: '#373 第 2 轮评审',
      reason:
        'CR2-2 根因修复：第 1 轮「删文档数字」使判据前提（文档写数字）失效 ⇒ 4 份 skill/agent 清单漏项无人报红；' +
        '本轮新增**清单完整性**判据 + 清单**机械枚举**（防新增文档脱离对账视野）；物理行数随 `wc -l` 实测上调',
      from: 5830,
      to: 5921,
      netDeletion:
        '本维 +82 物理行（**全部为判据/对账新增**）：清单完整性判据 + 机械枚举 + 范围纪律（区分本 PR 文件与既有债）',
    },
    {
      issue: '#373 第 3 轮评审',
      reason:
        'CR3-2 根因修复：新增**判据 H**（网关索引条目 ↔ 有执行者）+ 覆盖范围扩到 PS1 桥接与网关索引；' +
        '物理行数随 `wc -l` 实测上调',
      from: 5921,
      to: 6022,
      netDeletion: '本维 +73 物理行（判据 H 本体 + 全树 handler 扫描 + 覆盖落点登记；专测不计入本维）',
    },
    {
      issue: '#373 第 4 轮评审',
      reason:
        'CR4-3 根因修复：数字对账的**扫描面按载体枚举**（原只扫文档类目录）—— 新增 `.opencode/plugins/*.js` ' +
        '与 `wps-office-mcp/src/**/*.ts`；物理行数随 `wc -l` 实测上调',
      from: 6022,
      to: 6065,
      netDeletion: '本维 +24 物理行（addDeepByExt 深度枚举 + 载体清单注释；专测不计入本维）',
    },
    {
      issue: '#373 第 5 轮评审',
      reason:
        'CR5-2 / RES5-1：**删除**手写旧数字黑名单 `stalePatterns`（无变异自证的空断言）；其职责由「声明数 == 派生真值」覆盖并扩到三类数量；' +
        'CR5-1：消除同一脚本内第二份手写文件清单',
      from: 6065,
      to: 6103,
      netDeletion:
        '本维账（黑名单 −11 行 / 文件清单 −6 行）与新增（三类对账模式 +4 条 / 三段斜杠上下文锚定 +8 行）相抵；' +
        '净增主体为「把手写黑名单换成派生对账」的口径修正',
    },
    {
      issue: '#373 第 7 轮评审',
      reason:
        'CR7-1/7-2：数字声明判据的**语序穷举**（原只覆盖「内置工具在前」的三模式，「N 个内置工具」全部漏判 ' +
        '⇒ 静默假绿）；同时把两类对象（内置 / COM Actions）的口径对齐',
      from: 6103,
      to: 6125,
      netDeletion: '本维 +5 物理行（1 条语序模式 + 注释说明；专测不计入本维）',
    },
    {
      issue: '#373 第 10 轮评审',
      reason:
        'CR10-1：三数语序覆盖**对等化**（第 7 轮声明「已对齐」实测未对齐：模式数 4/2/1）；物理行数随 `wc -l` 实测上调',
      from: 6125,
      to: 6141,
      netDeletion: '本维 +7 物理行（3 条语序模式 + 注释；专测不计入本维）',
    },
    {
      issue: '#352 第十二刀（12/12 复盘，铁律 22 当轮落地）',
      reason:
        '新增「断档编号」判据：文档形态漂移守卫原只治「已删机制」①，「引用了不存在的治理规则编号」②' +
        '（#353 原始形态）本轮把 ② 与 ① 合并进**同一守卫与同一文档树**；守卫源码物理行数随 `wc -l` 实测上调',
      from: 6141,
      to: 6265,
      netDeletion:
        '本维 **+95 物理行**（新增判据 ② + 数据单源派生口径 + CLI 编排；已把注释压到最小并删掉与 manifest 重复的复述）。' +
        '本刀为**新增判据能力**（#353 原形态此前后无门禁可拦），无同范围被取代机制可删 ⇒ 据实登记为净增并同步基线',
    },
    {
      issue: '#380 12/12 复盘',
      reason:
        '新增发布留痕连通性守卫（CLI + 两个 lib 模块 + 专测）：断言「发布标签 ↔ 版本号 ↔ CHANGELOG 段」连通 —— ' +
        '本轮实测真缺陷即其反例（`v1.11.0` 标签指向提交的版本竟是 1.10.0）。物理行数随 `wc -l` 实测上调',
      from: 6265,
      to: 6596,
      netDeletion: '本维 +N 物理行（新守卫 CLI + 数据单源 + 判据纯函数；专测不计入本维）',
    },
    {
      issue: '#382 DECISION-1',
      reason:
        '「纯 TS 逻辑工具直连注册」落地：`validate-gateway-membership.js` 由 324 → 287 行（判据 A~E 重写，' +
        '删掉旧判据 A~H 与两套命名域转换/孤儿键逻辑）、`guard-scopes.js` +1 覆盖声明、' +
        '本守卫内新增 E1 留痕条目 ×2 ⇒ 守卫源码物理行数总量随 `wc -l` 实测 6596 → 6577',
      from: 6596,
      to: 6577,
      netDeletion:
        '净删 19 物理行（该成员一致性守卫 -208 行，> 本守卫 + 覆盖声明 + 留痕条目的净增）；' +
        '本维**上调**仅为把「守卫重写后的真实总量」如实入账，不是扩容',
    },
    {
      issue: '#382 销项补漏（遗漏 3：AI 可见面纳入扫描 + 清单去重）',
      reason:
        '用户复验指出：`validate:removed-mechanisms` 的扫描面**不含 `skills/*/SKILL.md` 与 `agents/*.md`**，' +
        '故「已删机制（网关强制）的现在时陈述」在 AI 每会话必读的文件里存活（实测 6 处）。' +
        '本刀把 9 份 AI 可见面文档纳入 `DOC_SCAN_FILES`，并将 `guard-scopes.js` 的 `DOC_DRIFT_PATHS`' +
        '改为**派生引用**该单源（删除第二份手抄同名单）；同类守卫自限文案同步更新。' +
        '守卫源码物理行数随 `wc -l` 实测 6577 → 6627',
      from: 6577,
      to: 6627,
      netDeletion:
        '本维 **+22 物理行**（扫描面 +9 条目注释、`guard-scopes` 派生引用、自限文案改述）。' +
        '⚠️ **本维为净增**：新增能力 = 「AI 可见面文档形态漂移」此前后无门禁可拦（#382 实测 6 处真漂移）；' +
        '同批已删等量第三份清单（`guard-scopes.js` 19 行手抄名单 → 3 行派生引用）；' +
        '该「删除」发生在**另一个文件**，本维（物理行数总量）无法感知 ⇒ 据实登记为净增并同步基线',
    },
    {
      issue: '#383',
      reason:
        'NPC Team 提示词整改（13 阶段 + 5 暂停点 + 提示词 159→85 行 / 硬上限 190→90）牵连两条守卫与契约模块：' +
        '① `lib/npc-team-prompt-source.js` 的 STAGE_PROTECTION 由 12 条改 13 条；' +
        '② `validate-npc-team-prompt.js` 把「阶段总数 12」三处硬编码（正则 / 循环上界 / 段锚点字面量）' +
        '改为一律派生自 STAGE_COUNT，并把三处 `prompt.match(段正则)` 换成行式 `sectionOf` 派生；' +
        '③ `validate-npc-team-bloat.js` 的【流水线】段锚点与 LIMITS.promptLines 随实测收紧。' +
        '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）',
      from: 6627,
      to: 6713,
      netDeletion:
        '本维 +117 物理行（均为**派生式判据编排**：段派生 helper + 阶段数单源 + 阶段数单源化反向断言 + 暂停卡内容强校验（评审 CR5-1）' +
        '+ 注释说明；被取代机制同步删除：三处手写阶段总数、两处手写段标题字面量、11 处错误文案内手写旧阶段号）。' +
        '提示词侧净删 74 行、硬上限 190→90。',
    },
    {
      issue: '#383 第 1 轮测试评审（QA-D1/D2）',
      reason:
        '7/13 测试阶段查出两处真实缺口并当轮闭环（铁律 9 回炉 + 铁律 24 第 7 维②「不变量必须归属门禁」）：' +
        '① **QA-D1**：Issue 核心能力「1/13 可一轮一轮盘清」原先只写在 docs 工作流程散文里，**提示词块内零编码**' +
        '（实测删该能力门禁全绿 ⇒ 断言无主）——现把多轮口径写进提示词块（1/13 行 + ⏸CP0 卡），' +
        '并于 `lib/npc-team-prompt-source.js` 新增单源 `CAPABILITY_ASSERTIONS`（3 条关键能力字面），' +
        '由校验器断言「提示词块须含该字面」；② **QA-D2**：`SKILL.md` frontmatter `description`（人工维护、sync 不改写）' +
        '残留旧阶段号（6/12 / 9/12 / 10/12 / 5/12）而正文已迁 13 ⇒ 用户可见的「编号漂移」无门禁；' +
        '现修值 + 新增单源判据 `checkDescStageNumbers`（`lib/npc-team-triggers.js`，M !== STAGE_COUNT 即报，' +
        '并按实测排除「铁律 19/20/21」规则编号链误报）。两条新判据均有真实链路变异自证（注入反例 → CLI exit 1）。' +
        '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）',
      from: 6713,
      to: 6847,
      netDeletion:
        '本维 +68 物理行（均为**新增判据**：CAPABILITY_ASSERTIONS 单源 + 校验器断言 + checkDescStageNumbers 判据 + 调用编排 + 注释；' +
        '专测不计入本维 —— tests/ 不在机械枚举范围）。**被取代机制同步删除**：description 内 4 处旧阶段号（6/12 / 9/12 / 10/12 / 5/12 → 13 系列）。' +
        '提示词块内多轮口径为**行内改写**（85 行不变，未触 90 行上限）。',
    },
    {
      issue: '#383 13/13 复盘（铁律 22 当轮落地）',
      reason:
        '发布留痕连通性守卫新增**判据③「发布标签必须可达发布分支 main」**（`release-connectivity-scope.js` ' +
        '纯函数 `checkTagsReachableFromBranch` + `release-connectivity-manifest.js` 单源 `RELEASE_BRANCH` + ' +
        'CLI 可达性探测与编排）。病灶（本轮实测反例）：`v1.13.0` 标签已创建且判据①②自洽，但其指向提交' +
        '**不可达 main**（发布变更 PR #390 未合并）⇒ main 上版本仍是 `1.12.0`，「已发布」与「发布变更未入库」并存；' +
        '原守卫只校验**标签自身**，对「标签游离在主线之外」完全无感。物理行数随 `wc -l` 实测上调（见 from/to）。',
      from: 6847,
      to: 6974,
      netDeletion:
        '本维 +101 物理行（新增判据③ 纯函数 + 单源常量 + CLI 探测编排 + 注释；专测不计入本维 —— tests/ 不在机械枚举范围）。' +
        '**被取代机制**：无同范围旧机制可删（判据①②只覆盖「标签自身自洽」，本判据覆盖「标签↔主线」这一此前**无门禁**的维度）' +
        '⇒ 据实登记为净增并同步基线。自限于窄口径：只判**本地可见引用**可达性，平台侧是否合并到主线不声称拦住。',
    },
    {
      issue: '#382 12/12 复盘（判据 F 落成）',
      reason:
        '复盘铁律 22/23：把 6/12 评审 CR10-1 根因（直连通道绕过 P1~P4）钉成**判据 F**。'
        + '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）；专测不计入本维（tests/ 不在机械枚举范围）。'
        + '自限：形态断言（查调用点/定义点形态），行为断言在 `tests/governance-direct-call.test.js`，'
        + '变异自证在 `tests/validate-gateway-f-criterion.test.js`（8/8）。',
      from: 6974,
      to: 7003,
      netDeletion: '0（**新增不变量**，不取代任何代码 —— 把 CR10-1 的一次性修复升为持续可验守卫）',
    },
    {
      issue: '#389（判据 G 披露带编号，复盘铁律 22）',
      reason:
        '闭合 #388 前置：原「范围外历史债」披露文案写「待独立 Issue 处理」**不带编号**（铁律 22 禁止的形态）。'
        + '新增单源 `scripts/lib/legacy-debt-manifest.js`（编号唯一事实源）+ 守卫判据 G（凡披露项必须有正整数 Issue 编号，'
        + '缺则报红）+ 3 例专测（正向带 #388 / 清空编号报红 / 删登记报红）。'
        + '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）；专测不计入本维（tests/ 不在机械枚举范围）。',
      from: 7003,
      to: 7130,
      netDeletion: '0（**新增不变量 + 编号单源**：把「无编号待后续」这一铁律 22 形态落成可验守卫，不取代任何代码）',
    },
    {
      issue: '#388（清偿 generateFormula / writeFile 双入口历史债）',
      reason:
        '从 `COM_ACTIONS` 删除 `generateFormula` / `writeFile` 两条（schema 唯一定义者收敛为其 `definition`）；'
        + '守卫判据 G 升级为**双向**（披露项须有编号 + 登记项须对应真实披露项）+ 台账清空 + 4 例变异自证'
        + '（含 #388 要求的「删→披露清零；还原→披露复现」负向自证）。'
        + '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）；专测不计入本维（tests/ 不在机械枚举范围）。',
      from: 7130,
      to: 7156,
      netDeletion: '0（**判据升级为双向** + 台账与实做强制同源；不取代既有代码）',
    },
    {
      issue: '#388 13/13 复盘（发布说明归档入扫描面）',
      reason:
        '复盘加固（铁律 22）：把 `docs/releases/*.md` **机械枚举**进 `DOC_SCAN_FILES` —— 原缺口即' +
        '「#393 修的同类漂移（历史债段落过期 + 断档编号 G1）无任何守卫兜底、全靠评审偶然抓到」（v1.11.0.md 亦存活 3 处）；' +
        '并同步修 v1.11.0.md 的 3 处 `G1` 断档编号 + 新增 6 例专测（含变异 R-1/R-3 注入即报红）。' +
        '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）；专测不计入本维（tests/ 不在机械枚举范围）。',
      from: 7156,
      to: 7214,
      netDeletion:
        '0（**新增覆盖面 + 机械枚举**，不取代既有代码；自限如实披露：仍未纳入 `opencode-wps*/` 子目录文档与 `CODE_REVIEW_GUIDE.md` 的 P0/P95 语境）',
    },
    {
      issue: '#395 校对抽风修复（9/13 文档环节同步收紧，两维一次记账）',
      reason:
        '本 PR 修复校对链路时 `validate-proofread-report-size.js` 的 `RATCHET.upgradeLog` 新增一条留痕（+11 物理行），' +
        '本守卫又为该增长补记一条留痕 ⇒ 两维联动：`guardSourceLines` 7214→7246、`guardCodeLines` 1034→1055。' +
        '⚠️ 本条为**被动记账**（只登记该 PR 已发生的守卫侧增长），不新增任何判据/机制；' +
        '两维**同一次**记账联动上调，非两次独立扩面；值均实测（`wc -l` / 计数），不手写中间快照。',
      from: 7214,
      to: 7246,
      netDeletion:
        '0（新增内容 = 一个 upgradeLog 留痕对象；不取代既有代码，逻辑判据未变。自限如实披露：本次为守卫侧**纯记账净增**，未新增守卫能力）',
    },
    {
      issue: '#395 RC-6 防腐（新增钩子契约守卫）',
      reason:
        'RC-6 根因是「测试面复刻缺陷面」（测试把 args 塞第一参、与治理层同一错误约定 ⇒ 全绿掩盖线上死锁 + P2 防伪静默失守）。' +
        '按铁律 24 第 7 维「不变量必须归属门禁」，新增可独立执行的 `validate-hook-contract.js`（物理 +105 行）' +
        '断言 `tests/**` 中 `tool.execute.before` 调用形态 = 官方契约；并接入 preflight + 专测（5 例含变异自证）。' +
        '物理行数随 `wc -l` 实测同步收紧基线（值见本对象 from/to，不在 prose 另写数字 —— 防手写计数漂移）。',
      from: 7246,
      to: 7375,
      netDeletion:
        '0（**新增覆盖面**，不取代既有代码；自限如实披露：经辅助函数间接调用 before 的形态不声称拦住，已在守卫自限节说明）'
    },
    {
      issue: '#395 第 1 轮评审 CR1-3',
      reason:
        'CR1-3：钩子契约守卫原锚点只覆盖单引号方括号与裸别名，实跑漏报双引号方括号形态 ' +
        '（`plugin["tool.execute.before"]({args}, {})` ⇒ EXIT=0 逃逸）。本轮锚点兼容单/双引号 + 补 1 例专测；' +
        '物理行数随 `wc -l` 实测（+2），值见本对象 from/to。',
      from: 7375,
      to: 7403,
      netDeletion:
        '0（判据覆盖面修正 + 1 例专测 + 本留痕条目；无被取代机制，属假绿漏洞闭合。值 = 本 PR 收口后实测总量）'
    },
    {
      issue: '#399 G3 跨 app 恒拦修复（app 归属改为权威来源 + 新增守卫）',
      reason:
        'G3「读前必写」的 app 归属此前是**关键词/前缀黑名单**（实测漏 9 个 Excel/PPT 写工具 ⇒ 恒拦），' +
        '改为「权威来源优先」：直连通道取工具名应用段（精确），网关裸短名查 `COM_ACTION_APP` 表' +
        '（由 `gateway/com-actions.ts` 的 `COM_ACTIONS[].appType` 机械派生）。' +
        '新增 `scripts/lib/com-action-app.js`（派生单源）+ `scripts/gen-com-action-app.js`（生成器）' +
        '+ `scripts/validate-com-action-app.js`（守卫：区块一致性 / 覆盖闭合 / 无残留猜测 / 执行者存在，4 条判据）。' +
        '物理行数随 `wc -l` 实测上调（见 from/to，不手写中间快照）；专测不计入本维（tests/ 不在机械枚举范围）。',
      from: 7403,
      to: 7672,
      netDeletion:
        '本维 +110 物理行（**新增守卫体系**：派生单源 + 生成器 + 4 判据守卫；专测不计入）。' +
        '**被取代机制同步删除**：`governance.js` 内两版「按名字猜 app」的关键词/前缀表（RC-2 的 ppt/excel/word 三段正则）' +
        '整体删除，改由 `getAppType(toolName, app)` 一级取值 —— 属「把手写猜测换成派生来源」的口径修正。'
    },
    {
      issue: '#400 P2 不变量行为性守卫（新增 #400 守卫体系）',
      reason:
        '新增 P2 不变量**行为性守卫**（`validate-proofread-p2-invariant.js` CLI + `lib/proofread-p2-invariant.js` ' +
        '判据纯函数），并在 `guard-scopes.js` 登记其覆盖源与落点、`semantic-anchor-manifest.js` 登记第 10 语义键、' +
        'E1 各维同步回写实测值。物理行数随 `wc -l` 实测上调（7672 → 8119，含 #403/#404 合并后的联合实测值）',
      from: 7672,
      to: 8119,
      netDeletion:
        '本维 **+345 物理行**（新守卫 CLI + 判据纯函数 + 覆盖声明 + 语义键登记 + 各维留痕条目；专测不计入本维 —— tests/ 不在枚举范围）。' +
        '**被取代机制**：无同范围旧机制可删（该不变量此前**只由 tests/ 承载**、scripts/ 层无门禁 —— Issue #400 现象）' +
        '⇒ 据实登记为净增并同步基线。自限如实披露：覆盖「前置被删 / 门禁整块被删」两类语义破坏，' +
        '不改行为只改写法的重构不声称拦住。'
    },
    {
      issue: '#400（同维二次记账）',
      reason:
        '上一条 `guardSourceLines` 留痕 + `guardCodeLines` 维留痕本身增物理行 ⇒ 本维 7591 → 7693（实测计数，不手写）。' +
        '⚠️ 本条为**被动记账**：只登记「记录增长」这一动作的成本，不新增任何判据/机制。',
      from: 8119,
      to: 8119,
      netDeletion: '0（同一条留痕的第二维记账，无新增机制）',
    },
    {
      issue: '#401 W-2',
      reason:
        '本 PR 新增守卫 CLI `scripts/validate-tool-result-payload.js`（+92 物理行）+ 判据/清单模块扩写 + ' +
        '轴 I 内本维度留痕条目 ⇒ 机械枚举分母随之增大。物理行数随 `guard-sources.js` 实测上调（不手写中间快照）。',
      from: 8119,
      to: 8370,
      netDeletion:
        '0（新增内容 = 一条守卫 + 两条判据 + 一个语义键登记；不取代既有代码。自限如实披露：本次为守卫侧**净增**，' +
        '未删除既有机制）'
    },
    {
      issue: '#401 W-2 留痕自记账',
      reason:
        '上一条目本身使物理行数再增（留痕对象 ×7 + 本对象）⇒ 按实测同步（7497→7562）。' +
        '⚠️ 同上：机械自记账，非新增判据。',
      from: 8370,
      to: 8435,
      netDeletion: '0（新增内容 = 棘轮留痕对象）',
    },
    {
      issue: '#401 R5/R7 守卫加固与文案收窄',
      reason: '同上：守卫脚本 + 其专测增例使机械枚举分母增大 ⇒ 按 guard-sources.js 实测上调（7593）。',
      from: 8435,
      to: 8482,
      netDeletion: '0（机械记账）',
    },
    {
      issue: '#401 R8 判据④ + R5 加固 + R7 文案收窄',
      reason:
        '本 PR 的守卫侧增量（新守卫 CLI + 4 条判据 + 其 9 例专测对应的守卫侧登记）经机械枚举计入分母，' +
        '按 `guard-sources.js` 实测上调（7609→7661）。⚠️ 机械记账，非新增机制。',
      from: 8482,
      to: 8559,
      netDeletion: '0（机械记账；净删已在`校对线体量`维体现）',
    },
    {
      issue: '#401 R9 判据①′', reason: '守卫侧随判据④/①′ 与专测增例的增量，按 guard-sources.js 机械枚举实测上调。', from: 8559, to: 8616, netDeletion: '0（机械记账）' },
    { issue: '#401 9/13 文档', reason: '落点登记使清单模块体量增大 ⇒ 机械枚举分母随之，按实测回写。', from: 8616, to: 8624, netDeletion: '0（机械记账）' },
    {
      issue: '#399 11/13 发布补正',
      reason:
        '发布留痕连通性守卫新增**判据④**（Release Notes「§一 本次发布内容」引用 ⊆ CHANGELOG 版本段引用）' +
        '—— 拦「发布说明列了、CHANGELOG 段没写」的内容级漏记（本轮实测反例：v1.14.2 RN §一 列 #399/#404，' +
        'CHANGELOG 1.14.2 段 0 处提及）。非机械记账：新增 1 条独立判据（纯函数 + CLI 编排 + 数据单源 3 常量）' +
        '+ 7 例回归（含 CLI 端到端变异自证）+ 合并模块内一处重复 `module.exports`（净删 5 行死代码）。' +
        '⚠️ 自限如实披露：判据只认「编号引用」形态，「既无 Release Notes、CHANGELOG 又漏记」不在面内。',
      from: 8624,
      to: 8906,
      netDeletion: '0（守卫侧净增；合并模块内重复 exports 已顺带净删 5 行）',
    },
    {
      issue: '#399 13/13 复盘',
      reason:
        '发布留痕连通性守卫新增**判据⑤**（发布提交 message 的「CHANGELOG 声称」↔ 该提交 CHANGELOG diff 新增行真实落地）' +
        '—— 拦 commit message 的**假留痕**（message 称「CHANGELOG 新增 X」而 diff 新增行 0 处提及；本轮实测反例：77d9e76）。' +
        '名实一致口径：须「CHANGELOG 关键词 + 写入动词」**同行共现**才算声称行（只认关键词会对 docs(changelog): 类合法提交大面积假红，实测 6 条误报已修）；' +
        '编号口径**复用既有 REF_NUMBER_PATTERN**（契约唯一，未新增第二份编号单源）。+6 例回归（含 5 组变异自证）。' +
        '⚠️ 自限如实披露：只认「同一行内关键词 + 编号」可见形态，跨行/自然语言声称不声称拦住。',
      from: 8906,
      to: 9144,
      netDeletion: '0（守卫侧净增；被取代机制：无 —— 既有判据①②④ 均只看真值侧，对「message 声称」侧无覆盖）',
    },
    { issue: '#401 13/13 复盘（#412 合并）', reason: '闭合自限① 的判据面新增（别名过滤 / 计算成员匹配）+ 专测 +2 例(M9/M10) + 本复盘三处留痕对象，经 `guard-sources.js` 机械枚举计入分母，按实测回写。⚠️ 机械记账，非新增机制。', from: 9144, to: 9213, netDeletion: '0（机械记账）' },
    {
      issue: '#399 13/13 复盘第二轮',
      reason:
        '判据⑤ **自身实测真缺陷**修正（三个缺陷，均为实测，非推断）：' +
        '①**假阴性**：原「声称集合」只收 `#<数字>` ⇒ message 声称**功能代号**（`G3`）时该见证词永不入集合，' +
        '而该行唯一的 `#400` 恰在同提交 diff 中 ⇒ 子集断言通过 = **对自身头号反例 `77d9e76` 放行**' +
        '（实测：`checkReleaseCommitClaim` errors 为空；PR #413 宣称的「变异自证」实为判据④ 的行为）。' +
        '修法：见证词口径 = 编号 ∪ 功能代号 `G/P/T<数字>`（新增单源 `RELEASE_COMMIT_WITNESS_PATTERN`），' +
        '声称侧与真值侧**同源**；实测 `77d9e76` 现报红 `G3`。' +
        '②**假阳性**：真值侧原只收 `#<数字>`，与扩口径后的声称侧**不对称** ⇒ 声称 `P2` 而 diff 真含 `P2` 被误报' +
        '（实测反例 `49bb613`）。修法：真值侧 `changelogAddedRefsOf` 改用同一 `RELEASE_COMMIT_WITNESS_PATTERN`。' +
        '③**假阳性**：声称行判定把**提交标题**（工作描述，如 `fix: … CHANGELOG 补记 …`）计入，' +
        '其 Issue/PR 追溯号被误判为「声称落地的条目」（实测反例 `b7d7757`）。修法：排除首行（实测 27 body vs 6 subject）。' +
        '配套：判据⑤ 加**历史边界** `RELEASE_COMMIT_CLAIM_SINCE`（声明式，含已登记反例 `RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES`）' +
        '—— 边界非白名单口袋（一条均匀时间边界，改它必产生 diff）；边界提交不存在时**如实退回**未收紧范围（不静默空跑）。' +
        '+8 例回归（含 3 组变异自证：去掉边界 ⇒ `77d9e76` 报红；还原 witnessPattern ⇒ 假阴性复现；登记反例可被判据捕获）。' +
        '物理行数随 `guard-sources.js` 机械枚举实测上调（见 from/to，不手写中间快照）。',
      from: 9213,
      to: 9368,
      netDeletion:
        '本维 +155 物理行（判据修正 + 单源常量 + 历史边界常量与登记 + 编排 + 本守卫留痕对象；' +
        '枚举含守卫脚本自身，专测不计入本维）。' +
        '⚠️ 换取的是**判据⑤ 从「对头号反例假阴性」变为真实捕获** —— 非扩容，是修缺陷。',
    },
    {
      issue: '#399 13/13 复盘第三轮',
      reason:
        '铁律 22 预防性闭环（当轮落成守卫断言 + 变异自证）：新增**判据⑥ 发布产物 ↔ 版本号连通** —— ' +
        '闭合实测出的「③ 发布产物」门禁遮蔽（判据 ⓪~⑤ 全不看产物本身，实测逐版本 `tar -tzf` 才发现' +
        '产物链**逐版本翻倍** 2.9M→93M，正是「无断言 ⇒ 无症状」）。落点：manifest 新增命名口径单源 ' +
        '`ARTIFACT_NAME_PATTERN` + 下限 `RELEASE_ARTIFACT_FLOOR`（1.14.1，产物惯例建立版本）；' +
        'scope 新增纯函数 `checkArtifactConnectivity`；CLI 编排（查发布分支树而非标签提交 —— ' +
        '本仓产物惯例为「四要素提交 → 产物提交」两段，标签树内无 tarball，对标签提交断言会系统性假红）。' +
        '变异自证 3 组（走真实链路，临时仓库）：删产物 ⇒ 报红「找不到产物」；产物名版本号不符 ⇒ 报红；' +
        '真实仓库 ⇒ EXIT=0（无误报）。+7 例回归（含命名口径单源自证 + 真实链路绿侧）。',
      from: 9368,
      to: 9594,
      netDeletion:
        '本维 +220 物理行（判据⑥ 纯函数 + 命名/下限单源 + CLI 编排 + manifest 说明；专测不计入本维）。' +
        '⚠️ 本条目 to 值经**复盘第四轮实测复核**修正：原写 `9509`（= 该提交当刻实测），' +
        '但本 PR 其后又落了 6 个提交（R1/R3/R4/R8/R9 修复 + e49dd3c 去别名），物理行数随之上抬至 `9546`，' +
        '而基线未随之回写（留痕链「值与实测对账」断裂，属本仓反复在治的「改了不留痕 / 留了痕不改值」形态）。' +
        '现按实测回写：`9588`（口径 = `guard-sources.js` 机械枚举 `scripts/validate-*.js` + `scripts/lib/*.js` 的物理行数总量）。',
    },
    {
      issue: '#399 CP3 前复验（铁律 24 第 6 维）',
      reason:
        '**修缺陷 + 记账回写**：本轮按用户「补充：先修上面这条」落成**非自指**的独立 CLI 判据 —— ① `E1_RATCHET_ANCHOR`（「不许上调」的比较对象，与留痕**互不派生**）；② 「基线 = 当场实测」对账判据（实测由 `guard-sources.js` 现场派生，与 `E1_BASELINES` 无写关系）；③ 实测来源唯一性判据（防把实测换成同文件第二份副本 ⇒ 对账退化为自指）。四条变异自证（走真实 CLI 本尊）：A 棘轮上调 / B 基线偏高 / C 三处同步 / D 实测来源不唯一 —— 全部由绿转红。',
      from: 9594,
      to: 9684,
      netDeletion: '0（本维为**判据加固**：修复的是判据自身「比较对象与被判对象同一处文本」的自指形态，非扩容）',
    },
    {
      issue: '#408',
      reason:
        'E1 棘轮留痕重链 ratchet:rechain 落地（与 main v1.14.7 合并）：本 PR 新增 lib/e1-metrics.js（度量单源）/ lib/ratchet-rechain.js + ratchet-rechain.js（重链 CLI）/ tests 不计入分母，经 guard-sources.js 机械枚举后实测 10193。合并同时把守卫内联计数函数下沉到 lib 单源（-20 有效行），故 guardCodeLines/guardBranches 实测下降（按实测收紧）。',
      from: 9684,
      to: 10229,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#408',
      reason:
        '重链 CLI 支持 E1_RATCHET_ANCHOR 同步（与 main Issue #399 CP3 的锚机制对齐）：授权上调时锚随留痕末条同改，否则重链后轴 I 报「棘轮被上调」。本条目为 CLI 自身增长（setAnchor + 定式锚同步）的机械记账。',
      from: 10229,
      to: 10273,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#417',
      reason:
        '判据⑦ 发布产物打包口径守卫：release-connectivity-scope.js 新增 checkArtifactPacking（三条断言：产物不入产物 / 排除口径同源 / 体积上界）+ release-connectivity-manifest.js 两个声明式单源（ARTIFACT_EXPORT_IGNORE_PATTERN / ARTIFACT_SIZE_*）+ validate-release-connectivity.js CLI 编排。物理行数随 guard-sources.js 机械枚举按实测回写。与 main v1.14.7（Issue #408）合并后重链：main 链条末条 10273，本 PR 新增判据⑦ 使实测增至 10593。',
      from: 10273,
      to: 10609,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#420',
      reason:
        'Issue #420：治理层 P1「已覆盖区间只读重读」豁免（governance.js）+ path-safety.ts 新增 buildWriteRootsWithDocDir 单源助手 + 两个守卫脚本自身的增改 —— 均在 guard-sources.js 枚举面内。增量取实测（`to` 由 rechain 派生，非手抄）。',
      from: 10609,
      to: 10638,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#420',
      reason:
        'Issue #420 13/13 复盘 · 铁律 22 预防性闭环：新增判据⑧（标签 ↔ 发布说明存在性反向断言，release-connectivity-scope.js +43 行）+ 7 例专测（含真实 CLI 端到端变异自证）—— 均为新增校验能力，非放宽',
      from: 10638,
      to: 10713,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419（#417 AC-6 拆分）判据⑨ 历史产物处置完整性：新增 checkFloorHistoryIntegrity 纯函数（lib 判据模块）+ 单源 ARTIFACT_FLOOR_DECISION_REFS/ARTIFACT_FLOOR_UNDECIDED_BELOW（manifest）+ CLI 编排 + 共用待发布树读数（CR419-1 修复：原读 refs/heads/main 与实际被断言的 HEAD 树背离 ⇒ 未合并分支上删产物假绿）。物理行数随 guard-sources.js 机械枚举按实测回写。',
      from: 10713,
      to: 10739,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 1~3 轮评审修复的机械记账：CR419-1（判据⑥/⑨ 待发布树口径统一到 HEAD —— 原读 refs/heads/main 与实际被断言的 HEAD 背离 ⇒ 未合并分支上删产物假绿）+ CR419-2（判据面补 >= floor，防低于产物下限的历史版本被拉进面内假红）+ CR419-3（判据⑥ 文档口径同步为「待发布树」）+ 反重复（判据⑨ 删除与判据⑥ 重复的「在树内」断言，仅保留 everCommitted / 接口自洽 / 决策落点三条独立断言）。',
      from: 10739,
      to: 10767,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 4 轮评审 CR419-4（根因修复）：把「历史产物处置完整性」登记为轴 I 语义键 artifact-floor-integrity（manifest 单源 + 判据 + 编排三落点 + 文档），闭合 1/13 实测出的归属侧盲区 —— 此前 release-connectivity-manifest.js 仅**间接**命中 guard-source-budget 锚点，导致该文件内新同义实现（如历史版本豁免清单）在轴 I 归属侧零信号。落点登记后，该文件内以代码形态承载新语义将被归属侧看见。',
      from: 10767,
      to: 10794,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 第 5~9 轮评审修复机械记账：CR419-5（决策登记断言空心化 —— 实测 [\'x\']/[\'\'] 放行 ⇒ 收为 ^#\d+$ 校验，与 lib/ratchet.js「空壳留痕不受理」同口径）+ CR419-6（判据⑥ 口径澄清后的旧措辞「发布分支树」在源码/注释/用例名中的残留同步为「待发布树」；历史记录与 E1 留痕不改写）。',
      from: 10794,
      to: 10816,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        '第 2 轮评审 CR419-11 修复：判据⑨ 补「未决下限不得抬高致判据面为空」对偶断言（原仅拦下调）；净增 31 行（守卫 + 专测）',
      from: 10816,
      to: 10844,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#419',
      reason:
        'Issue #419 与 main（Issue #420 / #421 期间）合并的机械记账：留痕链由两侧拼接（main #420 条目在前、本 PR #419 顺延），物理行数随 guard-sources.js 机械枚举按当场实测回写。',
      from: 10844,
      to: 10966,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
    {
      issue: '#421',
      reason:
        'main（Issue #420 判据⑧ 标签↔发布说明存在性 + 治理层 P1 豁免）与 PR #421（Issue #419 判据⑨ 历史产物处置完整性）合并的机械记账：两侧均新增守卫源码与专测；判据编号碰撞收敛为 main ⑧ 保留、本 PR ⑨；物理行数/有效行数按合并后当场实测回写，非放宽',
      from: 10966,
      to: 11053,
      netDeletion: '（重链追加：数字由实测派生，见 PR 说明）',
    },
  ],
};
/** 限值 = 基线 ÷ 0.95 上取整 ⇒ 余量**构造保证** ≥5%（不靠手工凑） */
const e1Limit = n => Math.ceil(n / 0.95);
const selfSource = () => fs.readFileSync(__filename, 'utf8');
{
  const src = selfSource();
  const selfSrc = src;
  const libSrc = fs.readFileSync(path.join(__dirname, 'lib', 'semantic-anchor-scope.js'), 'utf8');
  const manifestSrc = fs.readFileSync(
    path.join(__dirname, 'lib', 'semantic-anchor-manifest.js'),
    'utf8'
  );
  const scopesSrc = fs.readFileSync(path.join(__dirname, 'lib', 'guard-scopes.js'), 'utf8');
  // 第五刀：本维口径 = 守卫/元数据源码**物理行数总量**（机械枚举 scripts/validate-*.js + scripts/lib/*.js）。
  //   枚举唯一来源 = `scripts/lib/guard-sources.js`（体量闸门/测试/本守卫三方共用同一实现）。
  const { totalGuardSourceLines } = require('./lib/guard-sources.js');
  const guardSourceLines = totalGuardSourceLines();
  // R6 评审 F1：E1 基线本身必须受棘轮约束（不许放宽；放宽须留痕）——共享判据单源。
  {
    const dims = Object.keys(E1_BASELINES);
    // R6 评审 F2：棘轮维度必须与限值表同键集（防「加一维忘了同步棘轮留痕/初始值」）
    const missing = dims.filter(d => !(d in E1_RATCHET_INITIAL));
    if (missing.length > 0)
      errors.push(`E1 棘轮缺维度：${missing.join('/')} 未登记棘轮初始值（防「新增维度绕开棘轮」）`);
    for (const dim of dims) {
      const ratchet = e1RatchetBaseline(dim);
      errors.push(
        ...checkRatchet({
          name: `E1 ${dim}`,
          initial: E1_RATCHET_INITIAL[dim],
          current: E1_BASELINES[dim],
          baseline: ratchet,
          log: E1_RATCHET_LOG[dim] || [],
        }).map(e => e.replace(`E1 ${dim} `, ''))
      );
      // 第十一刀评审 F3 收口：留痕须为**时间序**链（否则「最后一条 = 最新」不成立，属静默陷阱）。
      errors.push(
        ...checkRatchetLogChronology({
          name: `E1 ${dim}`,
          log: E1_RATCHET_LOG[dim] || [],
        }).map(e => e.replace(`E1 ${dim} `, ''))
      );
      // ⚠️ 13/13 复盘第四轮实测真缺陷②（可见性，非放宽）：初值必须随留痕链同步前移。
      //   口径 = `e1RatchetBaseline()` 的定义「有留痕时**不用**初值」⇒ 只要该维有留痕，
      //   初值就**不参与任何判据**（无判别力），却被留在源码里当作「唯一来源」的一半。
      //   实测：`E1_RATCHET_INITIAL.guardSourceLines = 5379`（第九刀）而现基线 `9546`（落后 4167 行 / 7 个版本），
      //   且把该初值改成 `1`/`99999` 跑守卫 **恒为全绿**（零信号）—— 读者据此会以为「守卫源码体量只有 5k 行」。
      //   本条**只做可见披露**（不报红）：初值陈旧是「记账滞后」，与体量超限是两件事；
      //   且**诚实边界**：本守卫只对**已登记留痕**的维度有信息，对「其余 8 维初值是否陈旧」无法判定 ⇒ 不假装全查。
      const finalTo = (E1_RATCHET_LOG[dim] || []).length
        ? E1_RATCHET_LOG[dim][E1_RATCHET_LOG[dim].length - 1].to
        : null;
      if (finalTo !== null && E1_RATCHET_INITIAL[dim] < finalTo) {
        warnings.push(
          `E1 ${dim} 初值陈旧披露：\`E1_RATCHET_INITIAL.${dim} = ${E1_RATCHET_INITIAL[dim]}\` ` +
            `落后留痕末条 \`.to = ${finalTo}\`（该维有留痕 ⇒ 初值不参与判据、无判别力，但读者会据它误判量级）—— ` +
            `请在本 PR 内把初值前移至当前实测（如实记账，非报红）`
        );
      }
    }
  }
  // ⚠️ 每条含 dim：仅供「基线 = 实测」对账判据定位（判据文本不依赖它）。
  for (const [dim, what, val, base] of [
    ['guardCodeLines', '守卫脚本有效代码行', countCodeLines(selfSrc), E1_BASELINES.guardCodeLines],
    ['guardBranches', '守卫脚本分支数', countBranches(selfSrc), E1_BASELINES.guardBranches],
    ['libCodeLines', '判据模块有效代码行', countCodeLines(libSrc), E1_BASELINES.libCodeLines],
    ['libBranches', '判据模块分支数', countBranches(libSrc), E1_BASELINES.libBranches],
    ['manifestCodeLines', '清单模块有效代码行', countCodeLines(manifestSrc), E1_BASELINES.manifestCodeLines],
    ['manifestBranches', '清单模块分支数', countBranches(manifestSrc), E1_BASELINES.manifestBranches],
    ['scopesCodeLines', '范围单源模块有效代码行', countCodeLines(scopesSrc), E1_BASELINES.scopesCodeLines],
    ['scopesBranches', '范围单源模块分支数', countBranches(scopesSrc), E1_BASELINES.scopesBranches],
    ['guardSourceLines', '守卫源码物理行数总量', guardSourceLines, E1_BASELINES.guardSourceLines],
  ]) {
    const lim = e1Limit(base);
    if (val > lim)
      errors.push(`E1 ${what}超上限：${val} > ${lim}（基线 ${base} ×1.05 余量）——防腐不豁免守卫`);
    else if (val > base)
      warnings.push(
        `E1 ${what}已超本轮基线（${val} > ${base}，上限 ${lim}）——请在本 PR 内同步收紧基线`
      );
    // ⚠️ Issue #399 CP3 前复验（铁律 24 第 6 维）真缺陷修复 —— **非自指的「基线 = 实测」对账判据**。
    //   旧形态的洞：`E1_BASELINES[dim]` 的**唯一**判据是「不许上调」（current ≤ 棘轮基线 + 与留痕对账），
    //   而两侧都锚在**同一处可改文本**（基线与留痕末条 `.to`）⇒ 同步改即 `EXIT=0`（实测探针 B/C）。
    //   本判据把比较对象换成**当场从源码实测的值**（与 `E1_BASELINES` 无写关系）：
    //     ① 基线**高于**实测 ⇒ 余量被吃掉（探针 B：基线 99999 / 实测 9624 / 上限 105263 ⇒ 约束失效）；
    //     ② 基线**低于**实测 ⇒ 「已超本轮基线」成为常态噪声（本 PR 第四轮缺陷①：9509 / 9546）。
    //   两条合起来 = 基线必须**恒等于**当场实测 ⇒ 单独改基线再无任何放宽效果。
    if (base !== val)
      errors.push(
        `E1 ${what}基线 = 实测对账失败（维度 \`${dim}\`）：基线 ${base} ≠ 当场实测 ${val}（差 ${base - val}）—— ` +
          (base > val
            ? `基线**高于**实测 ⇒ 余量被吃掉（E1 上限 = 基线 ×1.05；实测探针 B：三处同步放宽后基线 99999、` +
              `实测 9624、上限 105263 ⇒ 守卫源码体量约束当场失效）`
            : `基线**低于**实测 ⇒ 「已超本轮基线」成为常态噪声（本 PR 第四轮缺陷①：基线 9509 / 实测 9546）`) +
          `。基线唯一合法值是**当场实测**（本守卫现场从源码算出，不读任何可被同步修改的第二处文本，无自指）`
      );
  }
}

// ---- 判据：E1 的「实测」必须**唯一来源**（Issue #399 CP3 前复验，探针 D）----
// ⚠️ 上面刚把「基线 = 实测」立为判据 —— 但若「实测」本身可被换成同文件里的第二份副本
//   （`const guardSourceLines = <字面量>`），对账就退化为**自指**（副本与基线同改即恒真）。
//   故在跑 E1 之前先断言「实测值只能由 guard-sources.js 现场派生」——不得自持副本、不得读常量表。
{
  // ⚠️ 判据自身的 needle 也出现在**本文件文本内**（上面那行字符串字面量）—— 必须**按行**匹配
  //   并排除承载 needle 的那一行，否则「把派生点换成副本」后判据仍会命中自己（实测探针 D 首版未拦）。
  const E1_MEASURE_MUST_DERIVE = /^\s*const guardSourceLines = totalGuardSourceLines\(\);\s*$/m;
  const deriveLines = selfSource()
    .split('\n')
    .filter(l => E1_MEASURE_MUST_DERIVE.test(l));
  if (deriveLines.length !== 1) {
    errors.push(
      'E1 守卫源码物理行数总量的**实测来源不唯一**：本文件内 `const guardSourceLines = ' +
        'totalGuardSourceLines();` 出现 ' +
        deriveLines.length +
        ' 次（应恰好 1 次）—— 实测值必须当场派生（guard-sources.js 机械枚举 + 计行），' +
        '不得换成同文件里的第二份副本字面量（实测探针 D：副本与基线同改即对账恒真，判据退化为自指）'
    );
  }
}

// ---- R8/R9 评审：语义键必须可被人在文档里查到（防「有契约，但没人知道」）----
// ⚠️ R9 评审 F1：首版实现只做 `docsText.includes(key)` 子串检查 —— 那正是「测形态不测行为」，
//   在任意位置贴一行键名即可蒙混。现升级为**结构化的两向检查**：
//     ① 正向：key 必须出现在 docs/ 的**语义键清单区块**内（以固定标记锚定上下文），
//        而非文档任意位置 ⇒ 「贴到无关段落」不再能过。
//     ② 反向：docs/ 中形如 `'som-key'` 的语义键风格字样，若不在清单里 → 报红
//        （防「文档写了不存在的键 / 拼写错误」）。
{
  // ⚠️ R9 评审 F2：上下文锚点必须是**唯一且显式**的标记行，不能用「语义键」这类高频词
  //   （实测：bash 注释里的「语义键」也在 8 行窗口内 ⇒ 把键名贴到无关段落照样过）。
  const DOC_MARKER = SEMANTIC_ANCHOR_DOC_MARKER;
  const docsDir = path.join(rootDir, 'docs');
  let docsFiles = [];
  try {
    docsFiles = fs
      .readdirSync(docsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f, text: fs.readFileSync(path.join(docsDir, f), 'utf8') }));
  } catch {
    warnings.push('⚠️ docs/ 目录不存在（环境性，非契约违规）');
  }
  if (docsFiles.length > 0) {
    // 提取「语义键清单区块」：从唯一标记行起，到下一个同级标题或文末（**限定上下文**）
    const blocks = [];
    for (const f of docsFiles) {
      const lines = f.text.split('\n');
      const start = lines.findIndex(l => l.includes(DOC_MARKER));
      if (start === -1) continue;
      // 区块 = 标记行之后，直到下一个 markdown 标题（# 开头）或文末
      let end = lines.findIndex((l, i) => i > start && /^#{1,6} /.test(l));
      if (end === -1) end = lines.length;
      blocks.push({ name: f.name, text: lines.slice(start, end).join('\n') });
    }
    if (blocks.length === 0) {
      errors.push(
        `docs/ 中未找到语义键清单区块（须含唯一标记行「${DOC_MARKER}」）—— ` +
          `语义键必须在**该区块内**被文档化，不得靠文档任意位置出现一次蒙混`
      );
    } else {
      const listingText = blocks.map(b => b.text).join('\n');
      // ① 正向：key 必须在清单区块内
      for (const entry of SEMANTIC_ANCHORS) {
        if (!listingText.includes(entry.key)) {
          errors.push(
            `[${entry.key}] 语义键未出现在 docs/ 的语义键清单区块（标记「${DOC_MARKER}」）内 —— ` +
              `登记了语义却不写文档，下一个人无从知道该机制存在（「有契约，但没人知道」）`
          );
        }
      }
      // ② 反向：清单区块内形如 `xxx-yyy` 的键名若不在清单里 → 报红（防拼写错/写不存在的键）
      const known = new Set(SEMANTIC_ANCHORS.map(e => e.key));
      const re = /`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g;
      let m;
      const seen = new Set();
      while ((m = re.exec(listingText)) !== null) {
        const cand = m[1];
        const sameFamily = [...known].some(k => k.split('-')[0] === cand.split('-')[0]);
        if (known.has(cand) || sameFamily) seen.add(cand);
      }
      for (const cand of seen) {
        if (!known.has(cand)) {
          errors.push(
            `docs/ 语义键清单区块里出现未登记的键名「${cand}」—— 文档写了清单里没有的键` +
              `（拼写错或已删），须在 SEMANTIC_ANCHORS 登记或改正拼写`
          );
        }
      }
    }
  }
}

const keysCount = SEMANTIC_ANCHORS.length;
const sitesCount = SEMANTIC_ANCHORS.reduce((n, e) => n + (e.sites || []).length, 0);

if (asJson) {
  console.log(
    JSON.stringify(
      { keysCount, sitesCount, candidates: candidates.length, errors, warnings },
      null,
      2
    )
  );
  process.exit(errors.length > 0 ? 1 : 0);
}

console.log('【轴 I】语义键 × 落点集合双侧连通性（Issue #335 / R10 第六类）');
console.log(`  语义键: ${keysCount} 个 / 落点: ${sitesCount} 个`);
console.log(
  `  归属侧扫描候选: ${candidates.length} 个文件（${CANDIDATE_ROOTS.length} 个源码根 + 已登记落点；` +
    `排除 测试/清单/判据/守卫 元模块与构建产物）`
);
console.log(
  `  计行范围: ${GUARD_SCOPES.map(s => s.guard).join(' / ')}（单一来源 = lib 的 GUARD_SCOPES）`
);
for (const w of warnings) console.log('  ' + w);

if (errors.length > 0) {
  console.error('\n❌ 轴 I 违规（语义落点与守卫范围未连通）：');
  for (const e of errors) console.error('   - ' + e);
  console.error(
    '\n  ⇒ 修复：在 scripts/lib/semantic-anchor-manifest.js 里登记该落点，' +
      '或为其在 guard-scopes.js 的计行范围内加覆盖（第九刀已删豁免口，不得悄悄移出范围）。'
  );
  process.exit(1);
}

console.log(
  '  ✅ 覆盖侧（每条落点被单一范围表现场计算判定为已覆盖）/ 归属侧（含该语义的文件均已登记）'
);
console.log(
  '  ⚠️ 自限披露（三条，均为**显式边界**而非放宽）：' +
    '① 以**代码形态**的导出符号 / 具名常量 / 具名函数为归属主判据，' +
    '不用新符号、只改语义细节的「隐性同义实现」不声称拦住；' +
    '② 归属候选排除**仅**两类可确定性形态：测试文件（`*.test.*` / `*.spec.*` / `__tests__/`）' +
    '与清单/判据模块（`semantic-anchor-*`）；**不**开任何「按目录名」的豁免；' +
    '③ 因此 `src/tests/support/*.ts` 这类**编译期断言文件会进入候选池**（它们刻意非 `.test.ts`）——' +
    '不命中锚点即无影响，一旦命中须登记进语义清单（不得再开目录级豁免）；' +
    '含 scripts/ 下的普通脚本与 `tests/fixtures/` 仍会报（F1/R2 探针已自证）。'
);
