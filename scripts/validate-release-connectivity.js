#!/usr/bin/env node
/**
 * 发布留痕连通性守卫（Issue #380 12/12 复盘 · 铁律 22 预防性闭环）。
 *
 * 防什么：**发布标签与代码/文档真值之间无连通断言** ⇒ 同一类「断档」换形态复发。
 *   ① `git tag vX.Y.Z` 指向的提交里版本源版本 ≠ X.Y.Z（本轮实测反例：`v1.11.0` → `1.10.0`）；
 *   ② 打了 `vX.Y.Z` 标签却在 CHANGELOG 里找不到 `## [X.Y.Z]` 段。
 * 与 #353（断档编号）/ #357（已删机制）同族：文档/标签的「名」与真值之间无连通断言。
 *
 * 单一来源：数据单源 = `lib/release-connectivity-manifest.js`；判据纯函数 = `lib/release-connectivity-scope.js`；
 * 本文件只做编排 + IO（git 读取由 CLI 承担，判据模块内无仓库路径字面量）。
 *
 * 用法：node scripts/validate-release-connectivity.js [--root <dir>] [--json]
 * 退出码：0 = 通过；1 = 存在违规
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
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
  versionGte,
} = require('./lib/release-connectivity-manifest.js');
const {
  checkTagVersionConnectivity,
  checkTagChangelogSections,
  checkTagsReachableFromBranch,
  checkReleaseNotesConnectivity,
  checkTagReleaseNotesExistence,
  checkReleaseCommitClaim,
  checkArtifactConnectivity,
  checkFloorHistoryIntegrity,
  checkArtifactPacking,
  resolveReleaseBranchRef,
} = require('./lib/release-connectivity-scope.js');

const argIdx = process.argv.indexOf('--root');
const rootDir =
  argIdx !== -1 && process.argv[argIdx + 1]
    ? path.resolve(process.argv[argIdx + 1])
    : path.resolve(__dirname, '..');

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// 读取该标签所指向提交里的版本源版本（`git show <tag>:package.json`）。
function versionAtTag(tag) {
  try {
    const raw = git(['show', `${tag}:${VERSION_SOURCE}`]);
    const obj = JSON.parse(raw);
    return typeof obj.version === 'string' ? obj.version : null;
  } catch {
    return null;
  }
}

// 判断某标签所指向提交是否**可达发布分支**（判据③）。
// 口径：`git merge-base --is-ancestor <tag> <branch>`（exit 0 = 可达）。
// 分支撑不存在/未 fetch 时返回 null（无法判定 → 判据③如实报红提示核对，不假装通过）。
function tagReachableFromBranch(tag, branch) {
  // ⚠️ Issue #395 13/13 复盘（实测真缺陷）：原实现**探测的是 `refs/remotes/origin/<branch>`，
  //   比较的却是裸 `branch`（本地分支）** —— 两者可指向不同提交，本地 `main` 落后时
  //   会误报「标签不可达 main」（本轮实测：`origin/main` 已含该 tag，裸 `main` 未含 ⇒ 假红）。
  //   现修正为**先探后比同一引用**：优先用 `refs/remotes/origin/<branch>`（真实发布主线），
  //   不存在再退本地 `refs/heads/<branch>`，并把选中的引用名传给 `merge-base`。
  const ref = resolveReleaseBranchRef(
    [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`],
    cand => {
      try {
        git(['rev-parse', '--verify', '--quiet', cand]);
        return true;
      } catch {
        return false;
      }
    }
  );
  if (!ref) return null; // 分支撑缺失：无法判定
  try {
    git(['merge-base', '--is-ancestor', tag, ref]);
    return true;
  } catch (e) {
    // exit 1 = 不可达；其他错误（1 之外的 status）也按不可达处理并提示。
    return false;
  }
}

const errors = [];

let tags = [];
try {
  tags = git(['tag', '--list'])
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
} catch {
  // 非 git 环境（如解包产物内）：无标签可比 ⇒ 如实跳过，不假装通过。
  console.log('⚠️  非 git 工作区：无标签可比，跳过发布标签连通性判据（不视为通过）。');
  process.exit(0);
}

const entries = tags.map(tag => ({ tag, match: tag.match(TAG_VERSION_PATTERN), version: null }));
for (const e of entries) if (e.match) e.version = versionAtTag(e.tag);

// 下限防退化（真实反例：把下限从 1.9.8 抬到 1.11.0 即可让坏标签 v1.11.0 逃逸）。
// 断言：下限**不得高于**「现存任意受判据约束过的标签」—— 本仓的合法下限 1.9.8 远低于
// 现行所有版本；一旦有人把下限抬到某现存标签之上，须走 PR 评审留痕（本断言自证）。
const versionTags = entries.filter(e => e.match).map(e => e.match[1]);
const belowFloor = versionTags.filter(v => !versionGte(v, VERSION_FLOOR));
// 下限不得 ≥**当前根版本源版本**（否则连现行发布版本都被划出判据面 = 静默放宽）。
let currentVersion = null;
try {
  currentVersion = JSON.parse(fs.readFileSync(path.join(rootDir, VERSION_SOURCE), 'utf8')).version;
} catch {
  /* 读不到版本源：由判据①的「读不到即报红」承担，此处不重复 */
}
if (currentVersion && !versionGte(currentVersion, VERSION_FLOOR)) {
  errors.push(
    `版本下限 ${VERSION_FLOOR} 高于当前版本源版本 ${currentVersion} —— ` +
      `下限把现行发布版本都划出判据面 = 静默放宽（须走 PR 评审留痕）`
  );
}
if (belowFloor.length > 0) {
  console.log(
    `ℹ️  版本下限 ${VERSION_FLOOR}：以下 ${belowFloor.length} 个历史标签不在判据面` +
      `（先于发布标签惯例建立）：${belowFloor.map(v => 'v' + v).join(', ')}`
  );
}

errors.push(...checkTagVersionConnectivity(entries, { floor: VERSION_FLOOR, versionGte }));

let changelog = '';
const clPath = path.join(rootDir, CHANGELOG_FILE);
if (fs.existsSync(clPath)) changelog = fs.readFileSync(clPath, 'utf8');
else errors.push(`缺少 ${CHANGELOG_FILE} —— 发布段的唯一文档真值不存在`);

errors.push(
  ...checkTagChangelogSections(tags, changelog, {
    tagPattern: TAG_VERSION_PATTERN,
    sectionPattern: /^##\s+\[(\d+\.\d+\.\d+)\]/,
    changelogFile: CHANGELOG_FILE,
    floor: VERSION_FLOOR,
    versionGte,
  })
);

// 判据③（Issue #383 13/13 复盘 · 铁律 22）：发布标签必须可达发布分支。
const reachEntries = entries.map(e => ({
  tag: e.tag,
  match: e.match,
  reachable: e.match ? tagReachableFromBranch(e.tag, RELEASE_BRANCH) : null,
}));
errors.push(
  ...checkTagsReachableFromBranch(reachEntries, {
    branch: RELEASE_BRANCH,
    floor: VERSION_FLOOR,
    versionGte,
  })
);

// 判据④（Issue #399 11/13 发布补正 · 铁律 22）：发布说明「§一 本次发布内容」引用 ⊆ CHANGELOG 版本段引用。
// 读 `docs/releases/vX.Y.Z.md`，切出「§一 本次发布内容」章节内的编号；与 CHANGELOG 各版本段的编号集合对账。
function collectRefs(text, pattern) {
  const out = [];
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let m;
  while ((m = re.exec(text)) !== null) out.push('#' + m[1]);
  return out;
}

// 切出「§一 本次发布内容」章节（标题命中 → 下一个 `## ` 标题为止）。
function contentSection(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (RELEASE_NOTES_CONTENT_SECTION_PATTERN.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s/.test(line)) break;
    if (inSection) out.push(line);
  }
  return out.join('\n');
}

// 判据④ 生效下限：正式 = 声明式常量；**仅测试**可用环境变量覆盖（用于端到端验证「下限防退化」断言，
// 不改变正式行为 —— 环境变量在正常 CI/本地运行中恒未设置）。
const releaseNotesFloor = process.env.RELEASE_NOTES_CONTENT_FLOOR_OVERRIDE || RELEASE_NOTES_CONTENT_FLOOR;

const rnDir = path.join(rootDir, RELEASE_NOTES_DIR);
const notesEntries = [];
if (fs.existsSync(rnDir)) {
  for (const f of fs.readdirSync(rnDir)) {
    const m = RELEASE_NOTES_PATTERN.exec(f);
    if (!m) continue;
    const body = fs.readFileSync(path.join(rnDir, f), 'utf8');
    const section = contentSection(body);
    notesEntries.push({
      version: m[1],
      refs: [...new Set(collectRefs(section, REF_NUMBER_PATTERN))],
      // 章节未被识别（如标题写成 `## 一. xxx` / `# 一、`）⇒ 判据会**静默降级为「无引用」**，
      // 属「假绿」形态（Issue #352 第十一刀 F3 同族）。此处如实标记，由 CLI 报红提示核对。
      sectionFound: section.trim() !== '',
    });
  }
}

// CHANGELOG 各版本段的编号集合（段标题口径与判据②同源）。
const changelogRefsByVersion = {};
{
  const lines = String(changelog).split('\n');
  let current = null;
  let buf = [];
  const flush = () => {
    if (current) changelogRefsByVersion[current] = new Set(collectRefs(buf.join('\n'), REF_NUMBER_PATTERN));
  };
  for (const line of lines) {
    const m = CHANGELOG_SECTION_PATTERN.exec(line);
    if (m) {
      flush();
      current = m[1];
      buf = [];
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
}

// 判据④ 的版本下限同样受「不得静默放宽」约束（与判据⓪ 同口径）：
// 下限若 ≥ 某现存发布说明的版本，即把该版划出判据面 = 静默放宽（须走 PR 评审留痕）。
if (currentVersion && !versionGte(currentVersion, releaseNotesFloor)) {
  errors.push(
    `判据④ 版本下限 ${releaseNotesFloor} 高于当前版本源版本 ${currentVersion} —— ` +
      `下限把现行发布说明都划出判据面 = 静默放宽（须走 PR 评审留痕）`
  );
}
{
  // 「全部发布说明均不在判据面」= 下限形同虚设 ⇒ 报红（同判据⓪ 的「下限不得使判据面为空」口径）。
  const noteVersions = notesEntries.map(n => n.version).filter(Boolean);
  const covered = noteVersions.filter(v => versionGte(v, releaseNotesFloor));
  if (noteVersions.length > 0 && covered.length === 0) {
    errors.push(
      `判据④ 版本下限 ${releaseNotesFloor} 高于现存全部 ${noteVersions.length} 份发布说明 ` +
        `（最高 v${noteVersions.sort((a, b) => (versionGte(a, b) ? 1 : -1))[0]}）—— ` +
        `下限使判据面为空 = 静默放宽（须走 PR 评审留痕）`
    );
  }
}

// 静默降级防护：Release Notes 存在却识别不到「§一 本次发布内容」章节 ⇒ 判据④ 会退化为「无引用即放行」。
// 如实报红提示核对标题口径（不假装通过）—— 与判据模块「无法判定不得视为通过」同口径。
{
  const noSection = notesEntries
    .filter(n => !n.sectionFound)
    .filter(n => versionGte(n.version, releaseNotesFloor))
    .map(n => 'v' + n.version);
  if (noSection.length > 0) {
    errors.push(
      `以下 Release Notes 未识别到「## 一、本次发布内容」章节：${noSection.join('、')} —— ` +
        `章节未被识别会使判据④ 静默降级为「无引用即放行」（假绿）；请核对章节标题口径`
    );
  }
}

errors.push(
  ...checkReleaseNotesConnectivity(notesEntries, changelogRefsByVersion, {
    floor: releaseNotesFloor,
    versionGte,
  })
);

// 判据⑧（Issue #420 13/13 复盘 · 铁律 22）：标签 ↔ 发布说明**存在性**反向断言。
// 判据④ 是「有 RN 则对账引用」，本判据补「有标签则必须有 RN」—— 堵住「四要素之一被整份省略」。
// 下限与判据④ 同源（`RELEASE_NOTES_CONTENT_FLOOR`）：RN 惯例建立点之前的标签不在判据面
// （与判据⑥ 的 `RELEASE_ARTIFACT_FLOOR` 同一「惯例建立点」语义；两 floor 数值接近但口径不同，勿同步改）。
errors.push(
  ...checkTagReleaseNotesExistence(tags, {
    tagPattern: TAG_VERSION_PATTERN,
    noteVersions: notesEntries.map(n => n.version),
    notesDir: RELEASE_NOTES_DIR + '/',
    floor: releaseNotesFloor,
    versionGte,
  })
);

// 判据⑤（Issue #399 13/13 复盘 · 铁律 22）：发布提交 message 的「CHANGELOG 声称」↔ 该提交 diff 真实落地。
// 防「假留痕」—— message 声称「CHANGELOG 新增 X」而 diff 新增行 0 处提及（实测反例：77d9e76）。
//
// ⚠️ 13/13 复盘**第二轮**真缺陷修正（名实一致，铁律 24 第 2 维）：本函数原**只收 `#<数字>`**，
//   而声称侧（`checkReleaseCommitClaim`）已扩为「编号 ∪ 功能代号」见证词 ⇒ 两侧口径**不对称**：
//   声称 `P2` 而 diff 真含 `P2` 时会被误报「0 处提及」= **假红**（实测反例：49bb613 声称 `P2`，
//   其 diff 新增行确含 `P2`，原实现报红）。现真值侧同口径收「编号 ∪ 功能代号」，
//   两端口径由**同一个** `RELEASE_COMMIT_WITNESS_PATTERN` 单源界定。
function changelogAddedRefsOf(sha) {
  let diff = '';
  try {
    // 只看 CHANGELOG 的 diff；`--no-color` 保证纯文本；新增行以 `+` 开头。
    diff = git(['show', '--no-color', '--format=', sha, '--', CHANGELOG_FILE]);
  } catch {
    return [];
  }
  const added = diff
    .split('\n')
    .filter(l => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  // 见证词口径单源：`#<数字>` 与功能代号 `G/P/T<数字>` 同收（与声称侧同源同口径）。
  return [...new Set(added.match(RELEASE_COMMIT_WITNESS_PATTERN) || [])];
}

// 发布提交候选：**>= 判据④ 版本下限** 的「触及 CHANGELOG」提交（语义边界，非条数窗口 —— R5 评审修）。
// 优化：sha 与 message 用**一次** `git log` 取回（原实现每条提交各起一次 `git show -s`），
// diff 仍逐条取（需精确到单提交的 CHANGELOG 新增行）。
let releaseCommits = [];
let floorTagExists = false;
try {
  // 语义边界 = 下限 tag 的提交范围（`refs/tags/v<floor>^..HEAD`）；tag 不存在则退回 `HEAD` 全历史（有上限兜底）。
  const floorTag = 'v' + RELEASE_NOTES_CONTENT_FLOOR;
  try {
    git(['rev-parse', '--verify', '--quiet', floorTag + '^{commit}']);
    floorTagExists = true;
  } catch {
    floorTagExists = false;
  }
  // `<floorTag>^..HEAD`：从下限 tag 起（含自身）到 HEAD；下限 tag 指向**根提交**时 `^` 无效
  // ⇒ 退回该 tag 本身..HEAD（等价「从下限起」）；tag 不存在则退回全历史（有 SCAN_LIMIT 兜底）。
  let range = [];
  if (floorTagExists) {
    let hasParent = false;
    try {
      git(['rev-parse', '--verify', '--quiet', floorTag + '~1']);
      hasParent = true;
    } catch {
      hasParent = false;
    }
    range = [hasParent ? floorTag + '^..HEAD' : floorTag + '..HEAD'];
  }
  // 判据⑤ 的**历史边界**（第二轮修正配套，声明式、可审计）：只对边界提交**之后**的提交断言。
  // ⚠️ 必须是**下界的收紧**（与版本下限**取交**），不是「追加第二个 range」—— `git log a..HEAD b..HEAD`
  //   会取**并集**，把 a 的祖先重新纳入 ⇒ 边界失效（本轮实测：并集写法下 `77d9e76` 仍被判红）。
  //   故此处把 range 改为**单一**收紧区间 `<判据⑤ 边界>..HEAD`（边界在版本下限之后，取交天然成立）。
  // 边界**不是**白名单口袋：它是一条均匀的时间边界，改它必然产生本文件 diff（可评审）。
  {
    // 判据⑤ 边界（`77d9e76`）在版本下限 tag（v1.13.0）**之后** ⇒ 以它作下界即与版本下限取交。
    // （若将来边界早于版本下限，此处需显式取更晚者；当前顺序已核，见专测「边界不得早于版本下限」。）
    // ⚠️ 边界提交在**本仓库**内必然存在；但守卫可对任意 \`--root\` 运行（专测的临时仓库、浅克隆），
    //   边界提交可能不存在 ⇒ 此时 \`A..HEAD\` 会让整块抛错、候选集静默为空（假绿）。
    //   故**先探边界提交是否存在**：不存在则**退回未收紧的范围**（版本下限界）—— 宁可多判（可能
    //   对临时仓库里的旧提交报红），也不静默空跑。这与「不可判定不得视为通过」同口径。
    let sinceExists = false;
    try {
      git(['rev-parse', '--verify', '--quiet', RELEASE_COMMIT_CLAIM_SINCE + '^{commit}']);
      sinceExists = true;
    } catch {
      sinceExists = false;
    }
    if (sinceExists) {
      range = [RELEASE_COMMIT_CLAIM_SINCE + '..HEAD'];
    } else {
      console.log(
        `ℹ️  判据⑤ 历史边界 ${RELEASE_COMMIT_CLAIM_SINCE} 在本次工作区不存在（非本仓库？浅克隆？）` +
          `—— 如实退回未收紧的版本下限范围（多判，不静默空跑）`
      );
    }
  }
  // `%x00` 分隔 sha 与 body，`%x01` 分隔条目 —— 避免 message 内含换行/空行时与下一条混淆。
  // `--no-merges`（R2 评审修）：merge 提交的 `git show` 给 **combined diff**（与相对主线的实际新增行不等价）
  // ⇒ 若 merge message 恰含声称行会让 changelogAddedRefs 系统性偏小 ⇒ 假红。merge 不「编写」CHANGELOG 内容
  // （内容编辑在其并入的提交里，同样在候选集内），故**排除 merge** 后判据才名实一致。
  // `-n <SCAN_LIMIT>`：防全历史扫描的兜底上限（非判据面主口径；正常情况远不触发）。
  const raw = git([
    'log',
    '--no-merges',
    '--format=%H%x00%B%x01',
    '-n',
    String(RELEASE_COMMIT_SCAN_LIMIT),
    ...range,
    '--',
    CHANGELOG_FILE,
  ]);
  releaseCommits = raw
    .split('\x01')
    .map(s => s.replace(/^\n+/, ''))
    .filter(s => s.trim() !== '')
    .map(entry => {
      const sep = entry.indexOf('\x00');
      const sha = sep === -1 ? entry.trim() : entry.slice(0, sep).trim();
      const message = sep === -1 ? '' : entry.slice(sep + 1);
      return { sha, message, changelogAddedRefs: changelogAddedRefsOf(sha) };
    })
    .filter(c => c.sha);
} catch {
  /* 无 git 历史：跳过（不假装通过，由外层「非 git 工作区」分支已处理） */
}

// 判据面为空的**显式披露**（R6 评审修）：下限 tag 存在却 0 条候选 ⇒ 判据⑤ 退化空跑。
// 口径说明（不报红，改为**可见跳过**）：此类仓库可能是「下限 tag 之后确无 CHANGELOG 变更」的
// 真实情形（如刚打 tag 的仓库），报红会误伤；但**不得静默** —— 故打印显式告警（与「非 git 工作区」
// 的「如实跳过、不假装通过」同口径）。判据④ 的「判据面为空即报红」针对**声明式下限被上调**的
// 特定放宽路径，与此处「真实无变更」不同，故两者口径**有意不同**（已在此显式说明，非疏漏）。
// 判据⑤ 历史边界的**显式披露**（不静默）：列出边界内已登记的真实反例，说明其已被闭环、不可回改。
console.log(
  `ℹ️  判据⑤ 历史边界 ${RELEASE_COMMIT_CLAIM_SINCE}（判据⑤ 首次生效后的首个发布提交）：` +
    `边界内已登记的已知假留痕 ${RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES.length} 条` +
    `（${RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES.map(w => w.sha.slice(0, 7)).join(', ')}；` +
    `提交不可改，缺陷已分别由后续补录闭环——不在判据面，非静默豁免）`
);
if (floorTagExists && releaseCommits.length === 0) {
  console.warn(
    `⚠️  判据⑤ 判据面为空（下限 tag v${RELEASE_NOTES_CONTENT_FLOOR} 之后 0 条触及 CHANGELOG 的提交）：` +
      `判据⑤ 本轮空跑（如实跳过，不视为通过）`
  );
}

errors.push(
  ...checkReleaseCommitClaim(releaseCommits, {
    claimLinePattern: RELEASE_COMMIT_CHANGELOG_CLAIM_PATTERN,
    writeVerbPattern: RELEASE_COMMIT_WRITE_VERB_PATTERN,
    refNumberPattern: REF_NUMBER_PATTERN,
    witnessPattern: RELEASE_COMMIT_WITNESS_PATTERN,
  })
);

// 判据⑥（Issue #399 13/13 复盘第三轮 · 铁律 22 预防性闭环）：发布标签 ↔ 发布产物连通。
// 断言「每个 >= 产物下限 的发布标签，其**待发布树（HEAD）**内存在与版本号同名的产物」。
// 为什么用树而非标签提交：本仓产物惯例为「四要素提交 → 产物提交」两段（标签指向前者，
// 其树内无 tarball）⇒ 对标签提交断言系统性假红。树口径稳定反映「产物确已入库」。
// **待发布树**的文件名集合（一次 `git ls-tree HEAD`，判据⑥ 消费）。
//
// ⚠️ 为什么口径是 `HEAD` 而不是 `refs/heads/main`（第 1 轮评审 CR419-1 实测真缺陷）：
//   原实现读 `refs/heads/main`，而**被断言的对象是 HEAD 的树**（判据⑦ 跑 `git archive HEAD`、
//   发布产物也由 HEAD 生成）⇒ 两个口径可以背离：在**未合并到 main 的发布分支**上删产物，
//   判据⑥/⑧ 读 main（未删，8/8）⇒ 全绿，而**真实产物**已由 HEAD 生成（缺文件）。
//   实测：`git rm v1.14.7 && git commit` 于 feature 分支 ⇒ 原实现 EXIT=0（假绿）。
//   统一到 HEAD 后：HEAD ↔ archive ↔ 产物 三者同源，**且该判据可在 PR 合并前跑**（本仓 CI 即如此）。
//   `RELEASE_BRANCH` 仍由判据③（标签可达性）消费 —— 那一条问的才是「发布分支」。
let releaseTreeNames = null;
try {
  releaseTreeNames = new Set(
    git(['ls-tree', '--name-only', 'HEAD'])
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  );
} catch {
  releaseTreeNames = null; // 不可读 ⇒ 无法判定（判据⑥ 如实报红，不假装通过）
}
{
  const artifactNames = releaseTreeNames;
  const artifactEntries = entries.map(e => {
    if (!e.match) return { tag: e.tag, match: null, artifactOnBranch: undefined };
    const v = e.match[1];
    if (artifactNames === null) return { tag: e.tag, match: e.match, artifactOnBranch: undefined };
    const name = artifactName(v);
    // 命名口径单源自证：唯一构造函数造出的名字**必须**匹配同一处声明的命名口径（防两处漂移）。
    if (!ARTIFACT_NAME_PATTERN.test(name)) {
      return { tag: e.tag, match: e.match, artifactOnBranch: undefined };
    }
    return { tag: e.tag, match: e.match, artifactOnBranch: artifactNames.has(name) };
  });
  errors.push(
    ...checkArtifactConnectivity(artifactEntries, {
      floor: RELEASE_ARTIFACT_FLOOR,
      versionGte,
      artifactName,
    })
  );
  const inScope = artifactEntries.filter(
    e => e.match && versionGte(e.match[1], RELEASE_ARTIFACT_FLOOR)
  );
  // ⚠️ 「下限防退化」断言**本轮评审后撤回**（铁律 24 第 4 维「敢删」）：R4 提议像判据④ 那样补断言，
  //   但 `RELEASE_ARTIFACT_FLOOR`(1.14.1) **高于**共享夹具版本(1.13.0) ⇒ 对合法旧版本夹具仓库
  //   系统性假红（实测打红 4 个既有端到端用例）。退化风险的真实防线 = 该下限是**声明式常量**，
  //   改它必产生本文件 diff（可评审）—— 不为「与判据④ 对称」而制造与夹具相斥的约束。
  console.log(
    `ℹ️  判据⑥ 产物下限 ${RELEASE_ARTIFACT_FLOOR}（产物 tarball 惯例建立版本）：` +
      `判据面 ${inScope.length} 个标签，待发布树内命中 ` +
      `${inScope.filter(e => e.artifactOnBranch).length} 个产物`
  );
}

// 判据⑦（Issue #417）：发布产物的打包口径 / 体积连通（三条断言见判据模块）。
// ⚠️ 断言钉在 `git archive` **输出**上（不用 `git check-attr` 代替）：实测 `export-ignore` 是 attribute，
//   `git archive HEAD` 读 **HEAD 树**的 attribute ⇒「check-attr 绿 + archive 仍含产物」可同时为真（假绿）。
// 口径：对**当前工作区 HEAD** 断言（发布产物由此生成），不逐标签回溯（历史产物是既成事实）。
{
  const pipe = cmd => {
    try {
      return String(
        execFileSync('bash', ['-c', cmd], {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 1024 * 1024 * 1024, // 修正前产物可达 389M
        })
      );
    } catch {
      return null;
    }
  };
  // `git archive` 输出是二进制 tar，不能按 utf8 读 ⇒ 用 `tar -t` 列条目名（文本）。
  const listing = pipe('git archive --format=tar HEAD | tar -t');
  // 判据面开关：该仓库是否**有产物入库**（`git ls-files` 现场判，不手写清单）。
  const tracked = pipe('git ls-files');
  const hasArtifacts =
    tracked !== null && tracked.split('\n').some(f => ARTIFACT_NAME_PATTERN.test(f.trim()));
  const bytes = pipe('git archive --format=tar HEAD | gzip -9 | wc -c');
  const size = bytes === null ? null : parseInt(bytes.trim(), 10);
  let attributesText = null;
  try {
    attributesText = fs.readFileSync(path.join(rootDir, '.gitattributes'), 'utf8');
  } catch {
    attributesText = null;
  }
  errors.push(
    ...checkArtifactPacking({
      archiveEntries: listing === null ? null : listing.split('\n').map(l => l.trim()).filter(Boolean),
      archiveBytes: Number.isFinite(size) ? size : null,
      attributesText,
      exportIgnorePattern: ARTIFACT_EXPORT_IGNORE_PATTERN,
      artifactName,
      hasArtifacts,
      sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES,
      sizeBaselineBytes: ARTIFACT_SIZE_BASELINE_BYTES,
      sizeLimitRatio: ARTIFACT_SIZE_TOLERANCE_RATIO,
      sizeBaselineMaxDrift: ARTIFACT_SIZE_BASELINE_MAX_DRIFT,
      sizeRefBytes: ARTIFACT_SIZE_REF_BYTES,
      sizeRatioCeiling: ARTIFACT_SIZE_RATIO_CEILING,
    })
  );
  if (!hasArtifacts) {
    console.log('ℹ️  判据⑦ 该工作区无产物入库（产物惯例自 v1.14.1 起）—— 不在判据面（声明式边界）');
  } else {
  console.log(
    `ℹ️  判据⑦ 打包口径：archive 条目 ${listing === null ? '无法判定' : listing.trim().split('\n').length} 个 / ` +
      `gzip 后 ${Number.isFinite(size) ? size + ' B' : '无法判定'}（上界 ${ARTIFACT_SIZE_LIMIT_BYTES} B）/ ` +
      `排除口径单源 \`${ARTIFACT_EXPORT_IGNORE_PATTERN}\``
  );
  }
}

// 判据⑨（Issue #419 = #417 AC-6 拆分）：历史产物**处置完整性**。
// 病灶：判据⑥ 的判据面 = floor(1.14.1) 以上全部标签，而 1.14.1~1.14.6 正是 #419 的处置对象
//   ⇒ 「删历史产物」= 掏空判据面（实测报红 6 条）；处置结论若只写在 Issue 文字里 = 人类纪律。
// 本判据固化为断言：待处置区间（floor ≤ v < 未决下限）不动；其上**曾入库就必须仍在树内**。
// ⚠️ 「曾入库 + 仍在树」而非「可达同名标签」：实测本仓无该稳定关系（v1.14.1 的 A 提交早于 tag、
//   v1.14.6/7/8 晚于 tag ⇒ 两段式不一致）⇒ 该口径系统性假红 8/8（本轮实测推翻自己的首版口径）。
{
  // ⚠️ 「曾入库」用 `git log HEAD`（而非默认全 ref）：从 main 拉出的分支上也能判定 ——
  //    若用全 ref，产物只在**未合并**的 feature 分支上出现过也会被判「曾入库」（本仓 git 层合并
  //    口径，实测：轴上分支的产物提交被全-ref log 看见 ⇒ 与「已入库」的语义不符）。
  // ⚠️ 判据⑨ 只取「曾入库」这一事实（**不**取「在树内」——那是判据⑥ 的 owner，
  //    同一事实不两处断言，见判据模块头部）。
  const histEntries = entries
    .filter(e => e.match)
    .map(e => {
      const v = e.match[1];
      let added = null;
      try {
        added = git(['log', 'HEAD', '--diff-filter=A', '--format=%H', '-1', '--', artifactName(v)]).trim();
      } catch {
        added = null;
      }
      return { version: v, everCommitted: added === null ? undefined : added !== '' };
    });
  // ⚠️ 未决下限的「不得静默放宽」断言（第 2 轮评审 CR419-11 实测真缺陷）：
  //   与判据⑨ 内部的 `② undecided >= floor` **方向相反、互为对偶** —— 那条拦**下调**（区间为空），
  //   本条拦**上调**：把未决下限抬到「最高的**在树产物**版本」之上 ⇒ 全部历史产物落入「待处置区间」⇒
  //   判据⑨ 判据面**为空**、零信号（实测：`ARTIFACT_FLOOR_UNDECIDED_BELOW` 1.14.7 → 99.0.0，
  //   守卫仍 `EXIT=0` 且打印「冻结下限 99.0.0 以上 0 个版本」）。这正是本 PR 自己批判的
  //   「方案 B 豁免口袋」同构形态 —— 只是把口袋从「标签清单」换成「一条可上调的下限」。
  //
  // ⚠️ 判据面锚**在树产物**而非「当前版本源版本」（第 2 轮自测发现：锚版本源对**合法的旧版本夹具**
  //   系统性假红 —— 夹具版本 1.13.0 低于产物惯例建立点 1.14.1 时判据⑨ 本就无判据面，报红即误伤）。
  //   锚「在树产物」后：本仓（含 1.14.7/1.14.8 产物）把下限抬到 99.0.0 ⇒ 报红；而**无产物**的
  //   夹具仓库（判据⑨ 按定义无判据面）不报 ⇒ 与「判据面为空才报」同口径、不与夹具相斥。
  // 判据面 = 「在树产物版本 ∈ [产物下限, +∞)」——只在**它非空**时才对未决下限设「不得抬高」约束：
  //   非空 ⇒ 抬高下限把它清空 = 静默放宽（报红）；本就为空（如产物全在下限之下的合法夹具）
  //   ⇒ 无判据面可清空，不得报红（否则与夹具相斥，正是本 PR 为判据⑥ 撤回同类断言的原因）。
  const treeArtifactVersions = [];
  for (const e of entries) {
    if (!e.match || releaseTreeNames === null) continue;
    const v = e.match[1];
    if (versionGte(v, RELEASE_ARTIFACT_FLOOR) && releaseTreeNames.has(artifactName(v))) {
      treeArtifactVersions.push(v);
    }
  }
  if (treeArtifactVersions.length > 0) {
    const highestArtifactVersion = treeArtifactVersions.reduce((a, b) => (versionGte(a, b) ? a : b));
    if (!versionGte(highestArtifactVersion, ARTIFACT_FLOOR_UNDECIDED_BELOW)) {
      errors.push(
        `判据⑨ 未决处置下限 ${ARTIFACT_FLOOR_UNDECIDED_BELOW} 高于最高的在树产物版本 ${highestArtifactVersion} —— ` +
          `全部在判据面的产物落入「待处置区间」⇒ 判据⑨ 判据面为空 = 静默放宽（须走 PR 评审留痕）`
      );
    }
  }
  errors.push(
    ...checkFloorHistoryIntegrity(histEntries, {
      floor: RELEASE_ARTIFACT_FLOOR,
      undecidedBelow: ARTIFACT_FLOOR_UNDECIDED_BELOW,
      versionGte,
      artifactName,
      decisionRefs: ARTIFACT_FLOOR_DECISION_REFS,
    })
  );
  const frozen = histEntries.filter(e => versionGte(e.version, ARTIFACT_FLOOR_UNDECIDED_BELOW));
  console.log(
    `ℹ️  判据⑨ 历史产物处置：待处置区间 [${RELEASE_ARTIFACT_FLOOR}, ${ARTIFACT_FLOOR_UNDECIDED_BELOW})` +
      `（Issue #419 决策：${ARTIFACT_FLOOR_DECISION_REFS.join('、')} 判定保留、不动）；` +
      `冻结下限 ${ARTIFACT_FLOOR_UNDECIDED_BELOW} 以上 ${frozen.length} 个版本，` +
      `曾入库 ${frozen.filter(e => e.everCommitted).length} 个（是否仍在树内由判据⑥ 断言）`
  );
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ tags: tags.length, errors }, null, 2));
}

if (errors.length > 0) {
  console.error('❌ 发布留痕连通性校验失败：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(
  `✅ 发布留痕连通性通过（本地可见版本标签 ${entries.filter(e => e.match).length} 个，` +
    `发布说明 ${notesEntries.length} 份，发布提交 ${releaseCommits.length} 条；` +
    `标签 ↔ 版本号 ↔ CHANGELOG 段存在 ↔ 可达 ${RELEASE_BRANCH} ↔ 段内容 ↔ 发布提交 message 声称 ↔ diff 落地 ↔ 发布产物存在 ↔ 打包口径/体积）`
);
