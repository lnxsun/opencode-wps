#!/usr/bin/env node
/**
 * 发布留痕连通性守卫的回归测试（Issue #380 12/12 复盘 · 铁律 22）。
 *
 * 断言口径（铁律 24 第 7 维：测行为不测形态）：
 *   - 直接调用**判据纯函数**（真实链路），不用「源码里有无某字符串」的形态检查；
 *   - 变异自证：注入反例（标签 ↔ 版本号不一致 / 缺 CHANGELOG 段）→ 断言由绿转红；
 *   - 真实 CLI 端到端：以临时 git 仓库跑 CLI，确认 exit code 由绿转红（走真实输出形态）。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const {
  TAG_VERSION_PATTERN,
  VERSION_FLOOR,
  versionGte,
  parseVersion,
  ARTIFACT_NAME_PATTERN,
  artifactName,
  RELEASE_ARTIFACT_FLOOR,
  ARTIFACT_EXPORT_IGNORE_PATTERN,
  ARTIFACT_SIZE_LIMIT_BYTES,
  ARTIFACT_SIZE_BASELINE_BYTES,
  ARTIFACT_SIZE_TOLERANCE_RATIO,
  ARTIFACT_SIZE_BASELINE_MAX_DRIFT,
  ARTIFACT_SIZE_REF_BYTES,
  ARTIFACT_SIZE_RATIO_CEILING,
  ARTIFACT_FLOOR_DECISION_REFS,
  ARTIFACT_FLOOR_UNDECIDED_BELOW,
} = require('../scripts/lib/release-connectivity-manifest.js');
const {
  checkTagVersionConnectivity,
  checkTagChangelogSections,
  checkTagsReachableFromBranch,
  checkReleaseNotesConnectivity,
  resolveReleaseBranchRef,
  checkArtifactConnectivity,
  checkArtifactPacking,
  checkFloorHistoryIntegrity,
} = require('../scripts/lib/release-connectivity-scope.js');

let passed = 0;
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('validate-release-connectivity');

// ---------- 判据①：标签 ↔ 版本号 ----------
it('① 标签指向提交版本与标签号一致 → 无错误', () => {
  const e = [{ tag: 'v1.11.0', match: 'v1.11.0'.match(TAG_VERSION_PATTERN), version: '1.11.0' }];
  assert.deepStrictEqual(checkTagVersionConnectivity(e, { floor: '1.9.8', versionGte }), []);
});

it('① 变异：标签号 1.11.0 但提交内版本 1.10.0 → 报红（本轮真缺陷形态）', () => {
  const e = [{ tag: 'v1.11.0', match: 'v1.11.0'.match(TAG_VERSION_PATTERN), version: '1.10.0' }];
  const errs = checkTagVersionConnectivity(e, { floor: '1.9.8', versionGte });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /v1\.11\.0/);
});

it('① 标签指向提交内读不到版本源 → 报红（不静默放行）', () => {
  const e = [{ tag: 'v1.12.0', match: 'v1.12.0'.match(TAG_VERSION_PATTERN), version: null }];
  const errs = checkTagVersionConnectivity(e, { floor: '1.9.8', versionGte });
  assert.strictEqual(errs.length, 1);
});

it('① 低于版本下限的历史标签不参与判据（声明式截断，非豁免）', () => {
  const e = [{ tag: 'v1.9.2', match: 'v1.9.2'.match(TAG_VERSION_PATTERN), version: '1.9.1' }];
  assert.deepStrictEqual(checkTagVersionConnectivity(e, { floor: '1.9.8', versionGte }), []);
});

it('① 非版本标签（如 release-x）不在判据面', () => {
  const e = [
    { tag: 'release-foo', match: 'release-foo'.match(TAG_VERSION_PATTERN), version: '1.0.0' },
  ];
  assert.deepStrictEqual(checkTagVersionConnectivity(e, { floor: '1.9.8', versionGte }), []);
});

// ---------- 判据②：标签 ↔ CHANGELOG 段 ----------
const OPTS = {
  tagPattern: TAG_VERSION_PATTERN,
  sectionPattern: /^##\s+\[(\d+\.\d+\.\d+)\]/,
  changelogFile: 'CHANGELOG.md',
  floor: '1.9.8',
  versionGte,
};

it('② 每个标签都有对应 CHANGELOG 段 → 无错误', () => {
  const cl = '## [Unreleased]\n\n## [1.11.0] - 2026-09-23\n';
  assert.deepStrictEqual(checkTagChangelogSections(['v1.11.0'], cl, OPTS), []);
});

it('② 变异：打了 v1.11.0 标签但 CHANGELOG 无该段 → 报红', () => {
  const cl = '## [Unreleased]\n\n## [1.10.0] - 2026-09-22\n';
  const errs = checkTagChangelogSections(['v1.11.0'], cl, OPTS);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /1\.11\.0/);
});

it('② 低于版本下限的历史标签缺段不报红（声明式截断）', () => {
  const cl = '## [Unreleased]\n\n## [1.10.0]\n';
  assert.deepStrictEqual(checkTagChangelogSections(['v1.9.7'], cl, OPTS), []);
});

// ---------- 判据③：标签 ↔ 发布分支可达（Issue #383 13/13 复盘 · 铁律 22） ----------
const R3_OPTS = { branch: 'main', floor: '1.9.8', versionGte };

it('③ 标签可达发布分支 → 无错误', () => {
  const e = [{ tag: 'v1.11.0', match: 'v1.11.0'.match(TAG_VERSION_PATTERN), reachable: true }];
  assert.deepStrictEqual(checkTagsReachableFromBranch(e, R3_OPTS), []);
});

it('③ 变异：标签不可达发布分支 → 报红（本轮真缺陷形态：v1.13.0 游离在 main 之外）', () => {
  const e = [{ tag: 'v1.13.0', match: 'v1.13.0'.match(TAG_VERSION_PATTERN), reachable: false }];
  const errs = checkTagsReachableFromBranch(e, R3_OPTS);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /不可达发布分支 main/);
});

it('③ 无法判定（reachable=null）→ 报红，不假装通过', () => {
  const e = [{ tag: 'v1.13.0', match: 'v1.13.0'.match(TAG_VERSION_PATTERN), reachable: null }];
  const errs = checkTagsReachableFromBranch(e, R3_OPTS);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /无法判定/);
});

it('③ 非版本标签不在判据面（reachable=null 也不报）', () => {
  const e = [{ tag: 'release-x', match: null, reachable: null }];
  assert.deepStrictEqual(checkTagsReachableFromBranch(e, R3_OPTS), []);
});

it('③ 低于版本下限的历史标签不参与判据（声明式截断）', () => {
  const e = [{ tag: 'v1.9.7', match: 'v1.9.7'.match(TAG_VERSION_PATTERN), reachable: false }];
  assert.deepStrictEqual(checkTagsReachableFromBranch(e, R3_OPTS), []);
});

// ---------- 发布分支引用解析（Issue #395 13/13 复盘 · 铁律 22） ----------
it('resolveReleaseBranchRef：优先远端引用、退化到本地引用', () => {
  const existing = new Set(['refs/heads/main']);
  const ref = resolveReleaseBranchRef(['refs/remotes/origin/main', 'refs/heads/main'], r =>
    existing.has(r)
  );
  assert.strictEqual(ref, 'refs/heads/main');
});

it('resolveReleaseBranchRef：远端存在时优先取远端（与比较引用同一）', () => {
  const existing = new Set(['refs/remotes/origin/main', 'refs/heads/main']);
  const ref = resolveReleaseBranchRef(['refs/remotes/origin/main', 'refs/heads/main'], r =>
    existing.has(r)
  );
  assert.strictEqual(ref, 'refs/remotes/origin/main');
});

it('resolveReleaseBranchRef：全部缺失 → null（无法判定，不假装通过）', () => {
  assert.strictEqual(
    resolveReleaseBranchRef(['refs/remotes/origin/main'], () => false),
    null
  );
});

it('变异自证：改回「探远端、比裸名」两处写 ⇒ 探到的引用不再被比较（断言由绿转红）', () => {
  // 复刻旧实现缺陷：探测 refs/remotes/origin/main 存在，但比较用裸 'main'
  const existing = new Set(['refs/remotes/origin/main']);
  const oldImplRef = existing.has('refs/remotes/origin/main') ? 'main' : null;
  const newImplRef = resolveReleaseBranchRef(['refs/remotes/origin/main', 'refs/heads/main'], r =>
    existing.has(r)
  );
  assert.strictEqual(oldImplRef, 'main', '旧实现比较的是裸名');
  assert.strictEqual(newImplRef, 'refs/remotes/origin/main', '新实现比较的是同一引用');
  assert.notStrictEqual(oldImplRef, newImplRef, '两者必须不同（否则本变异无意义）');
});

// ---------- 版本比较工具（唯一实现） ----------
it('versionGte 正确比较（补零 + 主次补丁位）', () => {
  assert.strictEqual(versionGte('1.9.8', '1.9.8'), true);
  assert.strictEqual(versionGte('1.9.7', '1.9.8'), false);
  assert.strictEqual(versionGte('1.11.0', '1.9.8'), true);
  assert.strictEqual(parseVersion('2')[0], 2);
});

// ---------- 真实 CLI 端到端（走真实输出形态，铁律 24 第 7 维③） ----------
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-conn-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  // 版本取 1.13.0（>= 判据④ 版本下限 1.13.0），使既有判据①/②/③ 用例与新判据④ 共存不冲突。
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.13.0' }));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '## [Unreleased]\n\n## [1.13.0] - x\n');
  // 判据⑧（Issue #420）：标签存在 ⇒ 必须有发布说明文件。本 fixture 是「合法发布态」，
  // 故补上 docs/releases/v1.13.0.md（否则会与判据⑧ 语义冲突 —— 那才是误伤）。
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.13.0.md'),
    '# Release Notes — v1.13.0\n\n## 一、本次发布内容\n\n- fixture\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'rel');
  g('tag', 'v1.13.0');
  return { dir, g };
}
const CLI = path.resolve(__dirname, '..', 'scripts', 'validate-release-connectivity.js');

it('CLI 端到端：标签版本一致 + 有 CHANGELOG 段 → EXIT=0', () => {
  const { dir } = makeRepo();
  const out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  assert.match(out, /通过/);
});

it('CLI 端到端变异：篡改提交内版本为 1.10.0 → EXIT=1（由绿转红）', () => {
  const { dir, g } = makeRepo();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.10.0' }));
  g('add', '-A');
  g('commit', '-qm', 'bump-wrong');
  g('tag', '-f', 'v1.12.0');
  let code = 0;
  try {
    execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
  }
  assert.strictEqual(code, 1, 'CLI 应在标签版本不一致时报红');
});

it('CLI 端到端变异：标签提交游离在 main 之外 → EXIT=1（判据③ 由绿转红）', () => {
  const { dir, g } = makeRepo();
  // 另起一条游离分支（不复用 main），在其上打 v1.12.0 标签 —— 模拟「发布变更未合并入 main」。
  g('checkout', '-q', '-b', 'release/free');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.14.0' }));
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]\n\n## [1.14.0] - x\n\n## [1.13.0] - x\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'free-floating release');
  g('tag', 'v1.14.0');
  g('checkout', '-q', 'main');
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  assert.strictEqual(code, 1, 'CLI 应在标签不可达 main 时报红');
  assert.match(out, /不可达发布分支/);
});

it('CLI 端到端：标签可达 main → EXIT=0（判据③ 绿）', () => {
  const { dir } = makeRepo();
  const out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  assert.match(out, /通过/);
});

it('CLI：非 git 目录 → 跳过但不报红（如实披露，不假装通过）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-'));
  const out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  assert.match(out, /非 git 工作区/);
});

it('CLI 端到端回归（Issue #395 13/13）：本地 main 落后、origin/main 已含标签 → 不得误报 ❌', () => {
  // 复刻本轮 10/13 实测假红：`refs/remotes/origin/main` 已含发布提交（v1.12.0），
  // 但本地 `main` 落后（停在 v1.11.0 之前）—— 旧实现「探远端、比裸名」会误报不可达。
  const { dir, g } = makeRepo(); // v1.13.0 已在 main
  // 前进一个提交打 v1.14.0，并把 origin/main 指到该提交
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.14.0' }));
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]\n\n## [1.14.0] - x\n\n## [1.13.0] - x\n'
  );
  // 判据⑧：多出的 v1.14.0 标签同样需要发布说明（否则报红来自判据⑧，非本用例要测的判据③ 口径）。
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.14.0.md'),
    '# Release Notes — v1.14.0\n\n## 一、本次发布内容\n\n- fixture\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'future');
  g('tag', 'v1.14.0');
  g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  // 本地 main 回退到 v1.13.0（落后，不含 v1.14.0 提交）
  g('update-ref', 'refs/heads/main', 'refs/tags/v1.13.0');
  g('checkout', '-q', 'main');
  const out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  assert.match(out, /通过/, 'origin/main 已含标签 ⇒ 不得因本地 main 落后而误报 ❌');
});

// ---- 判据④：发布说明「§一」引用 ↔ CHANGELOG 段引用（Issue #399 11/13 发布补正）----

it('判据④：发布说明 §一 引用了 CHANGELOG 段未提及的编号 → 报红（本轮实测反例）', () => {
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.14.2', refs: ['#399', '#404', '#401'] }],
    { '1.14.2': new Set(['#401']) },
    { versionGte }
  );
  assert.strictEqual(errs.length, 1, '缺 #399/#404 应报红一条');
  assert.match(errs[0], /#399/);
  assert.match(errs[0], /#404/);
});

it('判据④：同一编号出现在更早版本段 → 放行（发布说明可回引前序版本）', () => {
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.14.2', refs: ['#405'] }],
    { '1.14.2': new Set(['#401']), '1.14.1': new Set(['#405']) },
    { versionGte }
  );
  assert.deepStrictEqual(errs, [], '前序版本段已留痕 ⇒ 不得报红');
});

it('判据④：编号仅出现在**更晚**版本段 → 仍报红（不得预支未来留痕）', () => {
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.14.1', refs: ['#999'] }],
    { '1.14.1': new Set([]), '1.14.2': new Set(['#999']) },
    { versionGte }
  );
  assert.strictEqual(errs.length, 1, '更晚版本段的引用不得回填早版本');
});

it('判据④：§一 与原段完全一致 → 放行（正例）', () => {
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.14.2', refs: ['#395', '#401'] }],
    { '1.14.2': new Set(['#395', '#401', '#406']) },
    { versionGte }
  );
  assert.deepStrictEqual(errs, []);
});

it('判据④：可达集合按版本升序累加（中间版本只见 ≤ 自身）', () => {
  // 1.13.0 引用 #100（仅 1.14.0 段有）⇒ 报红；引用 #50（1.13.0 段有）⇒ 放行。
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.13.0', refs: ['#50', '#100'] }],
    { '1.13.0': new Set(['#50']), '1.14.0': new Set(['#100']) },
    { versionGte }
  );
  assert.strictEqual(errs.length, 1, '仅更晚版本的 #100 应报红');
  assert.match(errs[0], /#100/);
  assert.doesNotMatch(errs[0], /#50/);
});

it('判据④：低于版本下限的版本不参与判据（声明式截断，非逐条豁免）', () => {
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.10.0', refs: ['#370', '#371'] }],
    { '1.10.0': new Set([]) },
    { floor: '1.13.0', versionGte }
  );
  assert.deepStrictEqual(errs, [], '低于下限的历史版本不在判据面');
});

it('判据④：CHANGELOG 缺该版本段时不重复报红（交由判据②承担）', () => {
  const errs = checkReleaseNotesConnectivity(
    [{ version: '1.14.2', refs: ['#399'] }],
    {},
    { versionGte }
  );
  assert.deepStrictEqual(errs, [], '缺段由判据②报，避免同一事实两处报');
});

it('CLI 端到端变异：发布说明 §一 引用 CHANGELOG 段未提及的编号 → EXIT=1（判据④ 由绿转红）', () => {
  // 版本须 >= 判据④ 的版本下限（默认 1.13.0），故用 1.13.0（下限本身在判据面内）。
  const { dir, g } = makeRepo();
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.13.0.md'),
    '# Release Notes — v1.13.0\n\n## 一、本次发布内容\n\n- fix（PR #777）\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'rn');
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  assert.strictEqual(code, 1, '§一 引用未在 CHANGELOG 段留痕 ⇒ 应报红');
  assert.match(out, /#777/);
});

it('CLI 端到端变异：判据④ 下限使判据面为空（全部发布说明均低于下限）→ EXIT=1（防静默放宽）', () => {
  // 把判据④ 下限临时抬高到高于全部发布说明 ⇒ 应报「下限使判据面为空」。
  // 走真实 CLI：以环境变量注入越界下限（仅在测试中，正式代码用声明式常量）。
  const { dir, g } = makeRepo();
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  // 发布说明 v1.10.0（低于正式下限 1.13.0），CHANGELOG 段与之对齐 ⇒ 判据④ 正常应放行；
  // 但若下限被抬到 1.99.0，则「判据面为空」必须报红。
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.10.0.md'),
    '# RN v1.10.0\n\n## 一、本次发布内容\n\n- x（#111）\n'
  );
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]\n\n## [1.11.0] - x\n\n## [1.10.0] - x（#111）\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'rn');
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, RELEASE_NOTES_CONTENT_FLOOR_OVERRIDE: '1.99.0' },
    });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  assert.strictEqual(code, 1, '下限使判据面为空 ⇒ 应报红');
  assert.match(out, /判据面为空|划出判据面/);
});

it('CLI 端到端变异：待发布树不可读 → 判据⑥ 报红「无法判定」（不静默放行）', () => {
  // R9 评审：判据⑥ 的「树读取失败 ⇒ 报红」只有纯函数级专测，本用例走**真实 CLI** 证明「不可判定
  // 不得视为通过」。
  // ⚠️ 第 10 轮评审 CR419-10（**本用例此前是空断言**，如实记账 · 铁律 24 第 7 维）：
  //   判据⑥ 口径由 `refs/heads/main` 改为 `HEAD`（CR419-1）后，仅把 `main` 改名**不再命中判据⑥**
  //   —— 实测该夹具下判据⑥ 打印「判据面 0 个标签」（无事发生），而 `assert.match(out, /无法判定/)`
  //   命中的是**判据③** 的「是否可达发布分支 main 无法判定」。即：用例名说判据⑥、断言实由判据③
  //   满足（**断言无主**）；只把用例名/消息里的「分支树」改成「待发布树」**不解决**这一点。
  //   现改为**直接构造判据⑥ 的不可判定态**：让 `ls-tree HEAD` 也失败 + 判据⑥ 判据面非空
  //   （HEAD 指向不存在的引用 + 删除 main ⇒ 两 ref 皆不可解析；有产物名文件 + v1.14.8 标签）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-conn-noref-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.14.8' }));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '## [Unreleased]\n\n## [1.14.8] - x\n');
  // 产物名文件（内容任意）⇒ 开启判据⑥ 判据面；打 v1.14.8 标签使其**非空**（否则不触发「无法判定」）。
  fs.writeFileSync(path.join(dir, artifactName('1.14.8')), 'x');
  g('add', '-A');
  g('commit', '-qm', 'rel');
  g('tag', 'v1.14.8');
  // 让两个 ref 都无法解析：HEAD 指向不存在的分支 + 删除 main。
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/ghost'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['branch', '-D', 'main'], { cwd: dir, stdio: 'ignore' });
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  assert.strictEqual(code, 1, '待发布树不可读 ⇒ 判据⑥ 应报红，不得静默放行');
  // 断言有主（铁律 24 第 7 维）：必须是**判据⑥** 的独有文案（判据③ 的同词「无法判定」不算）。
  assert.match(out, /产物存在性\*\*无法判定\*\*/);
});

it('CLI 端到端变异：Release Notes 章节标题不被识别 → EXIT=1（防判据④ 静默降级为假绿）', () => {
  const { dir, g } = makeRepo();
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  // 标题写成 `## 一. …`（句点）⇒ 章节未被识别 ⇒ 若静默放行即假绿。
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.13.0.md'),
    '# RN v1.13.0\n\n## 一. 本次发布内容\n\n- x（#777）\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'rn');
  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  assert.strictEqual(code, 1, '章节未识别 ⇒ 应报红提示核对（不得静默放行）');
  assert.match(out, /未识别到/);
});

// ---------- 判据⑤：发布提交 message 声称 ↔ diff 真实落地（Issue #399 13/13 复盘） ----------
const {
  RELEASE_COMMIT_CHANGELOG_CLAIM_PATTERN,
  RELEASE_COMMIT_WRITE_VERB_PATTERN,
  RELEASE_COMMIT_WITNESS_PATTERN,
  RELEASE_COMMIT_CLAIM_SINCE,
  RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES,
  REF_NUMBER_PATTERN,
} = require('../scripts/lib/release-connectivity-manifest.js');
const { checkReleaseCommitClaim } = require('../scripts/lib/release-connectivity-scope.js');

const claimOpts = {
  claimLinePattern: RELEASE_COMMIT_CHANGELOG_CLAIM_PATTERN,
  writeVerbPattern: RELEASE_COMMIT_WRITE_VERB_PATTERN,
  refNumberPattern: REF_NUMBER_PATTERN,
  witnessPattern: RELEASE_COMMIT_WITNESS_PATTERN,
};

// 见证词口径 = 编号 ∪ 功能代号（声称侧与真值侧**同源**，见 CLI changelogAddedRefsOf）。
const witnessesOf = txt => [...new Set(String(txt).match(RELEASE_COMMIT_WITNESS_PATTERN) || [])];

it('⑤ 负向对照：message 声称的引用真在 diff 新增行中 → 放行', () => {
  const c = [
    {
      sha: 'abc1234',
      message: '- CHANGELOG：新增 ## [1.14.3] 段（补录 #399）',
      changelogAddedRefs: ['#399'],
    },
  ];
  assert.deepStrictEqual(checkReleaseCommitClaim(c, claimOpts), []);
});

it('⑤ 变异自证：message 声称 #399 而 diff 未含 #399 → 报红（假留痕）', () => {
  const c = [
    {
      sha: 'deadbee',
      // 真实形态：标题 + 空行 + body 声称行（标题行现被豁免为「工作描述」，声称须在 body）。
      message:
        'release: v9.9.9 发布四要素' +
        String.fromCharCode(10) +
        String.fromCharCode(10) +
        '- CHANGELOG：新增 ## [9.9.9] 段（补录 #399 漏记）',
      changelogAddedRefs: ['#400'],
    },
  ];
  const errs = checkReleaseCommitClaim(c, claimOpts);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /#399/);
  assert.match(errs[0], /空头承诺|假留痕/);
});

it('⑤ 普通提交（无 CHANGELOG 声称行）→ 不在判据面（放行，防误报）', () => {
  const c = [{ sha: 'c000', message: 'fix: 修 bug (#411)', changelogAddedRefs: [] }];
  assert.deepStrictEqual(checkReleaseCommitClaim(c, claimOpts), []);
});

it('⑤ 标题前缀含 changelog 但无写入动词 → 不在判据面（防误报）', () => {
  // 实测假红修正：`docs(changelog): …(#395)` 会把无关 PR 号误判为「声称落地的引用」。
  const c = [
    { sha: 'c000', message: 'docs(changelog): 修评审问题 (#395)', changelogAddedRefs: [] },
  ];
  assert.deepStrictEqual(checkReleaseCommitClaim(c, claimOpts), []);
});

it('⑤ 缺传单源口径 → 报红（不接受兜底，防静默降级为「不启用」）', () => {
  const c = [{ sha: 'c000', message: '- CHANGELOG：新增 #1', changelogAddedRefs: [] }];
  const errs = checkReleaseCommitClaim(c, {});
  assert.ok(errs.length > 0);
  assert.match(errs[0], /缺少单源口径/);
});

it('⑤ 多条声称行：仅「CHANGELOG + 写入动词同行共现」的编号计入', () => {
  const c = [
    {
      sha: 'c000',
      message: 'Ref: #100\n\n- CHANGELOG：新增 ## [9.9.9] 段（补录 #399）\n- 其他：#200',
      changelogAddedRefs: ['#399'],
    },
  ];
  // `Ref: #100` 与 `- 其他：#200` 均无写入动词 → 不计入；只有 #399 被声称且已落地 ⇒ 放行。
  assert.deepStrictEqual(checkReleaseCommitClaim(c, claimOpts), []);
});

it('CLI 端到端：merge 提交（解析 CHANGELOG 冲突）的 message 含「CHANGELOG 声称」不误报', () => {
  // 复现路径（R2 评审）：merge 提交**本身触及 CHANGELOG**（解析冲突）时，`git show` 对 merge 给
  // combined diff（实测 754eedc：默认 68 行 vs -m 逐父 123 行）⇒ 与「相对主线的实际新增行」不等价。
  // 若把 merge 纳入候选，其 message 的声称行会因 changelogAddedRefs 偏小而**假红**。
  const { dir, g } = makeRepo(); // 初始：package.json 1.13.0 + CHANGELOG 含 ## [1.13.0]
  const NL = String.fromCharCode(10);
  // 分支 A：在 CHANGELOG 追加一行
  g('checkout', '-q', '-b', 'feat');
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]' + NL + NL + '## [1.13.0] - x' + NL + NL + '- 分支 A 内容' + NL
  );
  g('add', '-A');
  g('commit', '-qm', 'feat: CHANGELOG 追加');
  // 主线：也改 CHANGELOG 同一区域 ⇒ 制造冲突
  g('checkout', '-q', 'main');
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]' + NL + NL + '## [1.13.0] - x' + NL + NL + '- 主线内容' + NL
  );
  g('add', '-A');
  g('commit', '-qm', 'main: CHANGELOG 追加');
  // merge 解析冲突：message 声称「补录 #999」；合并结果含主线与分支两行（无 #999）
  try {
    g('merge', '--no-ff', 'feat');
  } catch {
    /* 冲突：继续手动解析 */
  }
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]' +
      NL +
      NL +
      '## [1.13.0] - x' +
      NL +
      NL +
      '- 主线内容' +
      NL +
      '- 分支 A 内容' +
      NL
  );
  g('add', '-A');
  g('commit', '--no-edit', '-m', 'merge: 解析 CHANGELOG 冲突（CHANGELOG 新增段，补录 #999）');
  // 用例有效性自证：merge 提交确实触及 CHANGELOG（否则该 merge 不在候选集，用例不达意）。
  const touchedLines = execFileSync('git', ['log', '--format=%H', '--', 'CHANGELOG.md'], {
    cwd: dir,
    encoding: 'utf8',
  })
    .split(NL)
    .filter(Boolean);
  assert.ok(touchedLines.length >= 2, '用例有效性：merge 应触及 CHANGELOG（候选集需含 merge）');

  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  assert.strictEqual(code, 0, 'merge 提交不应触发假红；输出：' + out);
  assert.doesNotMatch(out, /#999/);
});

it('CLI 端到端：判据⑤ 判据面按**版本下限 tag** 界定（下限前的旧 release 提交不在面，不因条数窗口漂移）', () => {
  // R5 评审：原条数窗口（-n 40）会随提交密度静默收窄判据面；现改为版本下限 tag 的提交范围。
  // 本用例证明「下限前」的坏提交**不在判据面**（不报红），而「下限后」的坏提交**在判据面**（报红）。
  const { dir, g } = makeRepo(); // 初始 tag v1.13.0（= 判据④ 下限）
  const NL = String.fromCharCode(10);
  // 下限之前的坏提交（声称 #888 而 diff 不含）—— 初始提交位于 v1.13.0 tag 之前？
  // makeRepo 已把初始提交打上 v1.13.0；故在其**之前**再插一条坏提交需重建历史 ⇒ 改为：
  // 在 v1.13.0 之后造一条坏提交（应在判据面内 → 报红）。
  fs.writeFileSync(
    path.join(dir, 'CHANGELOG.md'),
    '## [Unreleased]' + NL + NL + '## [1.13.0] - x' + NL + '- 新增内容' + NL
  );
  g('add', '-A');
  // 真实形态：标题 + 空行 + body 声称行（标题行被豁免为「工作描述」，声称须在 body ——
  // 判据⑤ 第二轮修正：标题里的 #编号 是 Issue/PR 追溯，非「已写入 CHANGELOG」声称）。
  g(
    'commit',
    '-qm',
    'release: v1.14.0 四要素' + NL + NL + '- CHANGELOG：新增 ## [1.14.0] 段（补录 #888 漏记）'
  ); // 声称 #888
  // 版本下限前（v1.13.0 之前）无提交 —— 用「tag v1.13.0 存在」证明边界被采用。

  let code = 0;
  let out = '';
  try {
    out = execFileSync('node', [CLI, '--root', dir], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = e.status;
    out = String(e.stderr || '') + String(e.stdout || '');
  }
  // 下限内的坏提交（声称 #888 而 diff 无 #888）⇒ 应报红（证明判据面确实覆盖下限后的提交）。
  assert.strictEqual(code, 1, '下限后的坏提交应在判据面内并报红；输出：' + out);
  assert.match(out, /#888/);
});

it('CLI 端到端：判据⑤ 判据面为空（下限 tag 后无触及 CHANGELOG 的提交）→ 可见告警不静默（防假绿）', () => {
  // R6 评审：下限 tag 存在却 0 条候选时，判据⑤ 会空跑；口径 = **可见告警**（不报红以免误伤真实
  // 「无变更」仓库，但不得静默）—— 与「非 git 工作区」的如实跳过同口径。
  const { dir, g } = makeRepo(); // 初始 tag v1.13.0
  // 下限 tag 之后提交**不触及 CHANGELOG** ⇒ 判据面为空。
  fs.writeFileSync(path.join(dir, 'other.txt'), 'x' + String.fromCharCode(10));
  g('add', '-A');
  g('commit', '-qm', 'chore: 不触及 CHANGELOG');

  const res = spawnSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.strictEqual(res.status, 0, '判据面为空不应报红（真实无变更的仓库）；输出：' + out);
  assert.match(out, /判据面为空/, '必须**可见披露**，不得静默跳过');
  assert.match(out, /空跑/, '应说明判据空跑、不视为通过');
});

console.log(`\n${passed} 例通过`);

// ---------- 判据⑤ 第二轮修正（Issue #399 13/13 复盘实测真缺陷） ----------

it('⑤【真缺陷修正·假阴性】功能代号见证词：message 称含 G3 而 diff 无 G3 → 报红', () => {
  // 本轮实测反例 77d9e76：message 声称「CHANGELOG 新增 1.14.2 段（G3 跨 app 恒拦修复…），并把 #400 内容归位到 1.14.1」
  // 其 CHANGELOG diff 新增行 0 处提及 G3，但该行唯一的 # 编号 #400 **恰在** diff 中
  // ⇒ 原判据（只收 # 编号）子集断言**通过** = 对头号反例假阴性。
  const c = [
    {
      sha: '77d9e76',
      // 真实形态：标题（工作描述）+ 空行 + body 声称行。
      message:
        'release: v1.14.2 发布四要素' +
        String.fromCharCode(10) +
        String.fromCharCode(10) +
        '- CHANGELOG：新增 ## [1.14.2] 段（G3 跨 app 恒拦修复 + 信封契约单源 + 守卫扩面），并把 #400 内容归位到 1.14.1',
      // 真值侧：diff 含 #400（另一条目）但**不含** G3 —— 与原实现下 77d9e76 的真值侧同形。
      changelogAddedRefs: witnessesOf('无关条目 #400'),
    },
  ];
  const errs = checkReleaseCommitClaim(c, claimOpts);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /G3/);
  assert.match(errs[0], /假留痕|空头承诺/);
});

it('⑤【真缺陷修正·假阴性】变异自证：去掉 witnessPattern 单源 → 报红（防静默降级）', () => {
  const c = [{ sha: 'c000', message: '- CHANGELOG：新增 #1', changelogAddedRefs: [] }];
  const errs = checkReleaseCommitClaim(c, {
    claimLinePattern: RELEASE_COMMIT_CHANGELOG_CLAIM_PATTERN,
    writeVerbPattern: RELEASE_COMMIT_WRITE_VERB_PATTERN,
    refNumberPattern: REF_NUMBER_PATTERN,
  });
  assert.ok(errs.length > 0);
  assert.match(errs[0], /缺少单源口径/);
});

it('⑤【真缺陷修正·假阳性】声称 P2 而 diff 真含 P2 → 放行（两端口径必须同源）', () => {
  // 实测反例 49bb613：声称 P2，其 diff 新增行确含 P2，而原真值侧只收 # 编号 ⇒ 误报「0 处提及」。
  const c = [
    {
      sha: '49bb613',
      message: '- CHANGELOG：新增 [1.14.1] 段（P2 不变量行为守卫 + 净增/净删）',
      changelogAddedRefs: witnessesOf(
        '**P2「覆盖全文后禁止推进」不变量新增行为守卫（Issue #400）**'
      ),
    },
  ];
  assert.deepStrictEqual(checkReleaseCommitClaim(c, claimOpts), []);
});

it('⑤【真缺陷修正·假阳性】提交标题行不视为声称（标题是工作描述，非「已写入」声称）', () => {
  // 实测反例 b7d7757 标题：fix: PR #321 评审 R6 修复 CHANGELOG 补记 R2-R5 且用例数对齐实测 #314
  // 含 CHANGELOG 关键词 + 写入动词「补记」，其 #314/#321 是 Issue/PR 追溯（**非**声称落地的条目）
  // ⇒ 原判据计入标题 ⇒ 误报「假留痕」。
  const c = [
    {
      sha: 'b7d7757',
      // 标题（第 1 行）含「CHANGELOG + 补记」；body 无声称行。
      message:
        'fix: PR #321 评审 R6 修复 CHANGELOG 补记 R2-R5 且用例数对齐实测 #314' +
        String.fromCharCode(10) +
        String.fromCharCode(10) +
        'Ref: #314' +
        String.fromCharCode(10) +
        'Ref: #312',
      changelogAddedRefs: witnessesOf('无关内容 #321'),
    },
  ];
  assert.deepStrictEqual(checkReleaseCommitClaim(c, claimOpts), []);
});

it('⑤ 标题行豁免的边界：body 内的真声称行**仍**受判据（豁免不得扩到 body）', () => {
  const NL = String.fromCharCode(10);
  const c = [
    {
      sha: 'c000',
      message:
        'docs: CHANGELOG 补记 (#1)' + NL + NL + '- CHANGELOG：新增 ## [9.9.9] 段（补录 #999）',
      changelogAddedRefs: [],
    },
  ];
  const errs = checkReleaseCommitClaim(c, claimOpts);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /#999/);
});

it('⑤ 历史边界单源：常量存在且登记了已验证反例（防边界被误删）', () => {
  assert.strictEqual(typeof RELEASE_COMMIT_CLAIM_SINCE, 'string');
  assert.ok(RELEASE_COMMIT_CLAIM_SINCE.length > 0);
  assert.ok(Array.isArray(RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES));
  assert.ok(RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES.length > 0);
  for (const w of RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES) {
    assert.ok(typeof w.sha === 'string' && w.sha.length > 0);
    assert.ok(typeof w.why === 'string' && w.why.length > 0);
  }
});

it('⑤ 历史边界不早于版本下限（取交顺序成立 —— 否则 range 语义会静默失效）', () => {
  const { execFileSync } = require('child_process');
  const git = args =>
    execFileSync('git', args, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  const since = git([
    'rev-parse',
    '--verify',
    '--quiet',
    RELEASE_COMMIT_CLAIM_SINCE + '^{commit}',
  ]).trim();
  const floorTag =
    'v' + require('../scripts/lib/release-connectivity-manifest.js').RELEASE_NOTES_CONTENT_FLOOR;
  const floor = git(['rev-parse', '--verify', '--quiet', floorTag + '^{commit}']).trim();
  let sinceIsLaterOrEqual = true;
  try {
    git(['merge-base', '--is-ancestor', floor, since]);
  } catch {
    sinceIsLaterOrEqual = false;
  }
  assert.ok(
    sinceIsLaterOrEqual,
    '判据⑤ 边界 ' +
      RELEASE_COMMIT_CLAIM_SINCE +
      ' 早于版本下限 tag ' +
      floorTag +
      ' —— range 取交会静默失效'
  );
});

it('CLI 端到端：判据⑤ 边界登记的真实反例**确实**能被判据捕获（先红后绿的「红」侧）', () => {
  // 防「边界把真实反例悄悄吃掉」的假绿：直接以登记反例的形态调判据，断言它**会**报红
  // （即：反例不在判据面，是**边界**的效果，而非判据判不出）。
  const w = RELEASE_COMMIT_CLAIM_KNOWN_WITNESSES[0];
  assert.ok(w, '必须登记至少一条已验证反例');
  const c = [
    {
      sha: w.sha,
      message:
        'release: v1.14.2 发布四要素' +
        String.fromCharCode(10) +
        String.fromCharCode(10) +
        '- CHANGELOG：新增 ## [1.14.2] 段（G3 跨 app 恒拦修复 + 信封契约单源 + 守卫扩面），并把 #400 内容归位到 1.14.1',
      changelogAddedRefs: witnessesOf('#400'),
    },
  ];
  const errs = checkReleaseCommitClaim(c, claimOpts);
  assert.ok(errs.length > 0, '登记反例必须能被判据捕获（否则「边界」掩盖了判据失效）');
  assert.match(errs[0], /G3/);
});

// ===== 判据⑥：发布产物 ↔ 版本号连通（Issue #399 13/13 复盘第二轮 · 铁律 22）=====
// 单一来源自证：命名口径必须来自 manifest（本测试内**不**手写第二份 pattern）。
const artifactOpts = {
  floor: RELEASE_ARTIFACT_FLOOR,
  versionGte,
  artifactName,
};
const mkEntry = (v, onBranch) => ({
  tag: `v${v}`,
  match: [`v${v}`, v],
  artifactOnBranch: onBranch,
});

it('⑥ 产物在场 → 放行（基线绿）', () => {
  const errs = checkArtifactConnectivity([mkEntry('1.14.6', true)], artifactOpts);
  assert.deepStrictEqual(errs, []);
});

it('⑥【真缺陷修正·门禁遮蔽】产物缺失 → 报红（变异自证：删产物由绿转红）', () => {
  const errs = checkArtifactConnectivity([mkEntry('1.14.6', false)], artifactOpts);
  assert.ok(errs.length > 0, '产物缺失必须报红');
  assert.match(errs[0], /找不到产物/);
});

it('⑥ 产物名版本号与标签不符 → 报红（命名连通性）', () => {
  // 分支树内存在的是 v1.14.9.tar.gz，而标签是 v1.14.6 ⇒ 该标签对应产物不存在
  const errs = checkArtifactConnectivity([mkEntry('1.14.6', false)], artifactOpts);
  assert.ok(errs.length > 0);
});

it('⑥ 产物下限之外的历史标签不参与判据（声明式截断，非豁免口袋）', () => {
  // v1.14.0 低于产物下限 1.14.1 ⇒ 即便产物缺失也不报红（惯例建立前）
  const errs = checkArtifactConnectivity([mkEntry('1.14.0', false)], artifactOpts);
  assert.deepStrictEqual(errs, []);
});

it('⑥ 存在性无法判定（树读取失败）→ 报红，不假装通过', () => {
  const errs = checkArtifactConnectivity([mkEntry('1.14.6', undefined)], artifactOpts);
  assert.ok(errs.length > 0, '不可判定不得视为通过');
  assert.match(errs[0], /无法判定/);
});

it('⑥ 缺传命名口径单源 artifactName → 报红（不接受兜底，防静默降级为第二份实现）', () => {
  // 与判据⑤「缺传单源即报红」同口径：命名口径必须**单源传入**（manifest 的 artifactName），
  // 判据内不得自带兜底字面量 —— 否则出现第二份命名实现，与 caller 漂移即静默误判。
  const errs = checkArtifactConnectivity([mkEntry('1.14.6', true)], {
    floor: RELEASE_ARTIFACT_FLOOR,
    versionGte,
    // artifactName 故意缺传
  });
  assert.ok(errs.length > 0, '缺传 artifactName 必须报红');
  assert.match(errs[0], /artifactName/);
});

it('⑥ 命名口径单源：manifest 的 ARTIFACT_NAME_PATTERN 必须匹配判据构造的名字', () => {
  assert.ok(
    ARTIFACT_NAME_PATTERN.test(artifactName('1.14.6')),
    '命名口径必须匹配判据构造的产物名（防两处口径漂移）'
  );
  assert.ok(!ARTIFACT_NAME_PATTERN.test('opencode-wps-1.14.6.tar.gz'));
  // 唯一构造函数 × 命名口径**同处声明**：构造必然匹配（防两处漂移）
  assert.ok(ARTIFACT_NAME_PATTERN.test(artifactName('0.0.1')));
  // 更强的单向闭环：命名口径的捕获组必须能**解析出构造函数嵌入的版本号** ——
  // 才能拦住「构造函数改名成别的形态（如 x-<v>.tgz）而 pattern 未同步」的漂移
  // （仅 `test()` 恒真不足；`exec` 取回版本号才是「同源」的行为断言）。
  const m = ARTIFACT_NAME_PATTERN.exec(artifactName('0.0.1'));
  assert.ok(m, '构造函数产物必须被命名口径匹配');
  assert.strictEqual(m[1], '0.0.1', '命名口径必须能从构造函数产物解析出同一版本号（同源闭环）');
});

it('⑥ 真实仓库：当前标签的产物确实在待发布树内（先红后绿的「绿」侧）', () => {
  const repo = path.resolve(__dirname, '..');
  // 只对产物下限之上的标签断言；用 git ls-tree 现场读取待发布树（走真实链路）。
  const gitTree = args =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
      .split('\n')
      .map(l => l.trim());
  const branch = require('../scripts/lib/release-connectivity-manifest.js').RELEASE_BRANCH;
  let names;
  try {
    names = new Set(gitTree(['ls-tree', '--name-only', `refs/heads/${branch}`]));
  } catch {
    names = null;
  }
  assert.ok(names, '本地必须能读取待发布树（否则判据⑥ 无法判定）');
  const version = require('../package.json').version;
  // 现行版本（根 package.json）必须有产物落在待发布树内
  assert.ok(
    names.has(artifactName(version)),
    `现行版本 v${version} 的产物必须在待发布树（HEAD）内（实测反例：产物缺失=四要素之三空）`
  );
});

// ===== 判据⑦：发布产物的打包口径 / 体积（Issue #417 · 铁律 22）=====
// 单一来源自证：排除口径 / 上界 / 命名口径**全部**取 manifest（本测试内不手写第二份）。
const packingBase = {
  archiveEntries: ['package.json', 'src/index.js'],
  archiveBytes: 1634373, // 实测：排除历史产物后的 gzip 体积
  attributesText: ARTIFACT_EXPORT_IGNORE_PATTERN + ' export-ignore',
  exportIgnorePattern: ARTIFACT_EXPORT_IGNORE_PATTERN,
  artifactName,
  hasArtifacts: true,
  sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES,
  sizeBaselineBytes: ARTIFACT_SIZE_BASELINE_BYTES,
  sizeLimitRatio: ARTIFACT_SIZE_TOLERANCE_RATIO,
  sizeBaselineMaxDrift: ARTIFACT_SIZE_BASELINE_MAX_DRIFT,
  sizeRefBytes: ARTIFACT_SIZE_REF_BYTES,
  sizeRatioCeiling: ARTIFACT_SIZE_RATIO_CEILING,
};
const pack = o => checkArtifactPacking(Object.assign({}, packingBase, o));

it('⑦ 基线绿：产物内无产物、口径同源、体积在上界内 → 放行', () => {
  assert.deepStrictEqual(pack({}), []);
});

it('⑦【变异自证】产物内递归包含历史产物 → 报红（由绿转红）', () => {
  const errs = pack({ archiveEntries: ['package.json', 'opencode-wps-v1.14.7.tar.gz'] });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /递归包含/);
});

it('⑦ 前缀路径（--prefix=）下的嵌套产物同样被识别 → 报红', () => {
  const errs = pack({ archiveEntries: ['opencode-wps/opencode-wps-v1.14.7.tar.gz'] });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /递归包含/);
});

it('⑦ 合法非产物名（.zip / 其它 tar.gz 命名）不误报 → 放行', () => {
  assert.deepStrictEqual(
    pack({ archiveEntries: ['opencode-wps-v1.14.7.zip', 'notes-v1.2.3.tar.gz', 'src/a.js'] }),
    []
  );
});

it('⑦【真缺陷修正·口径漂移】.gitattributes 的 export-ignore 与单源不一致 → 报红', () => {
  // 实测反例形态：把 pattern 写成更宽的 `*.tar.gz`（与产物命名口径不同源）。
  const errs = pack({ attributesText: '*.tar.gz export-ignore' });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /不一致/);
});

it('⑦ 缺少 export-ignore 行 → 报红（排除口径缺失）', () => {
  const errs = pack({ attributesText: '# 无规则\n* text=auto' });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /不一致/);
});

it('⑦【名实一致】单源 pattern 必须能匹配唯一构造函数产物名（否则报红）', () => {
  // 反例：单源常量被改成与 artifactName() 不同源的形态 —— 两处口径实为不同语义。
  const errs = pack({ exportIgnorePattern: 'totally-different-*.xz' });
  assert.ok(errs.length >= 1, '不同源的单源口径必须报红');
  assert.match(errs.join('\n'), /不同语义|不一致/);
});

it('⑦【变异自证】体积越过上界 → 报红（由绿转红）', () => {
  const errs = pack({ archiveBytes: 300 * 1024 * 1024 });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /越过上界/);
});

it('⑦ 上界 = manifest 单源常量，且相对实测基线有充足余量', () => {
  // 名实一致：上界必须**远大于**实测基线（1.6M），否则正常源码增长会误伤。
  assert.ok(ARTIFACT_SIZE_LIMIT_BYTES > 1634373 * 5, '上界相对实测基线应有 ≥5× 余量');
  assert.ok(ARTIFACT_SIZE_LIMIT_BYTES < 100 * 1024 * 1024, '上界必须能拦住「再递归一个历史产物」');
});

it('⑦ 无法判定（条目清单 / 体积 / attribute 文本缺失）→ 逐条报红，不假装通过', () => {
  assert.match(pack({ archiveEntries: undefined })[0], /无法判定/);
  assert.match(pack({ archiveBytes: undefined })[0], /无法判定/);
  assert.match(pack({ attributesText: undefined })[0], /无法判定/);
});

it('⑦ 缺传单源（artifactName / exportIgnorePattern）→ 报红，不接受兜底', () => {
  assert.match(pack({ artifactName: undefined })[0], /artifactName/);
  assert.match(pack({ exportIgnorePattern: undefined })[0], /exportIgnorePattern/);
});

it('⑦ 排除口径单源与命名口径同源（ARTIFACT_NAME_PATTERN 派生闭环）', () => {
  // 单源 pattern 必须匹配唯一构造函数产物名；且命名口径能从产物名解析出同一版本号。
  const globRe = new RegExp(
    '^' +
      ARTIFACT_EXPORT_IGNORE_PATTERN.split('*')
        .map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$'
  );
  assert.ok(globRe.test(artifactName('1.14.8')), '排除口径必须匹配产物命名');
  const m = ARTIFACT_NAME_PATTERN.exec(artifactName('1.14.8'));
  assert.strictEqual(m[1], '1.14.8');
});

it('⑦ 真实仓库端到端：CLI 在真实仓上跑判据⑦ 并输出打包口径（走真实链路）', () => {
  const repo = path.resolve(__dirname, '..');
  const res = spawnSync('node', [path.join(repo, 'scripts/validate-release-connectivity.js')], {
    cwd: repo,
    encoding: 'utf8',
  });
  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.match(out, /判据⑦ 打包口径/, 'CLI 必须真实输出判据⑦ 口径');
  assert.match(out, /archive 条目 \d+ 个/, '必须现场测算条目数（非硬编码）');
});

it('⑦ 真实仓库：当前 HEAD 的 archive **不含**产物命名形态（先红后绿的「绿」侧）', () => {
  // 真实链路：现场跑 `git archive | tar -t`，断言产物形态确实为 0（修正前为 8）。
  const repo = path.resolve(__dirname, '..');
  let listing;
  try {
    listing = execFileSync('bash', ['-c', 'git archive --format=tar HEAD | tar -t'], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
    });
  } catch (e) {
    throw new Error('无法读取 archive 清单（判据⑦ 无法判定）: ' + e.message);
  }
  const names = listing
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const nested = names.filter(n => ARTIFACT_NAME_PATTERN.test(n.split('/').pop()));
  assert.deepStrictEqual(nested, [], 'HEAD 的 archive 不得递归包含发布产物');
  // 且体积必须在上界内（现场实测，非复用常量）
  const bytes = parseInt(
    execFileSync('bash', ['-c', 'git archive --format=tar HEAD | gzip -9 | wc -c'], {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
    }).trim(),
    10
  );
  assert.ok(bytes > 0 && bytes <= ARTIFACT_SIZE_LIMIT_BYTES, `实测体积 ${bytes} 必须 ≤ 上界`);
});

it('⑦ 判据面：该仓库无产物入库 → 整体不参与（声明式边界，非豁免口）', () => {
  // 守卫可对任意 --root 运行（专测夹具 / 其它仓库）：无产物则「必须有排除口径」是与夹具相斥的约束。
  assert.deepStrictEqual(
    checkArtifactPacking({
      hasArtifacts: false,
      archiveEntries: ['a.txt', 'opencode-wps-v1.14.7.tar.gz'],
      archiveBytes: 300 * 1024 * 1024,
      attributesText: '# 无规则',
      exportIgnorePattern: ARTIFACT_EXPORT_IGNORE_PATTERN,
      artifactName,
      sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES,
    }),
    []
  );
});

it('⑦ 判据面开关缺传（undefined）→ 不参与（与 hasArtifacts=false 同口径，非隐式放宽）', () => {
  assert.deepStrictEqual(
    checkArtifactPacking({ artifactName, exportIgnorePattern: ARTIFACT_EXPORT_IGNORE_PATTERN }),
    []
  );
});

it('⑦ 真实仓库端到端：CLI 现场判定「有产物入库」并输出判据⑦ 判据面（走真实链路）', () => {
  const repo = path.resolve(__dirname, '..');
  const res = spawnSync('node', [path.join(repo, 'scripts/validate-release-connectivity.js')], {
    cwd: repo,
    encoding: 'utf8',
  });
  const out = String(res.stdout || '') + String(res.stderr || '');
  // 本仓**有**产物入库 ⇒ 必须真的判（不得落到「无产物不在判据面」分支）
  assert.match(out, /判据⑦ 打包口径：archive 条目/);
  assert.ok(!/判据⑦ 该工作区无产物入库/.test(out), '本仓有产物，不得走「不在判据面」分支');
});

it('⑦【第 1 轮评审 CR1-1 修复】缺上界单源 sizeLimitBytes → 报红（原实现静默放过）', () => {
  // 实测反例：上界未传 + 体积已传时，原条件 `typeof limit === 'number' && ...` 短路 ⇒ 零信号。
  const errs = pack({ sizeLimitBytes: undefined });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /上界单源 `sizeLimitBytes` 缺失/);
  // 变异自证：缺上界 + 超大体积也不得「因为体积大反而靠另一条通过」——仍必须报红
  const errs2 = pack({ sizeLimitBytes: undefined, archiveBytes: 300 * 1024 * 1024 });
  assert.ok(
    errs2.some(e => /sizeLimitBytes/.test(e)),
    '缺上界必须独立报红（不得被其它断言掩盖）'
  );
});

it('⑦【第 2 轮评审】CLI 端到端变异自证：有产物仓库 + 排除口径被破坏 → 三条断言全部报红（EXIT=1）', () => {
  // 走**真实 CLI 本尊**（非纯函数）：临时仓提交 30MB 产物 + 破坏 pattern，
  // 断言 archive 清单与体积均现场重测（铁律 24 第 7 维③：变异自证必须走真实链路）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-pack-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.13.0' }));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '## [Unreleased]\n\n## [1.13.0] - x\n');
  // 判据⑧：造了标签必须有发布说明（否则报红含判据⑧，掩盖被测的判据⑦ 三条断言）。
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.13.0.md'),
    '# Release Notes — v1.13.0\n\n## 一、本次发布内容\n\n- fixture\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'rel');
  g('tag', 'v1.13.0');
  // 产物入库（30MB 随机字节 ⇒ gzip 后仍 ≈30MB，越界；`Buffer.alloc` 全零会被压到极小，测不出体积）
  fs.writeFileSync(
    path.join(dir, 'opencode-wps-v1.13.0.tar.gz'),
    crypto.randomBytes(30 * 1024 * 1024)
  );
  // 排除口径被破坏（与单源不同源 ⇒ 断言② 报红；产物未被排除 ⇒ 断言① 报红）
  fs.writeFileSync(path.join(dir, '.gitattributes'), 'never-matches-*.xz export-ignore\n');
  g('add', '-A');
  g('commit', '-qm', 'artifact + broken pattern');

  const res = spawnSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.strictEqual(res.status, 1, '三条断言均应报红 ⇒ EXIT=1；输出：' + out);
  assert.match(out, /递归包含/, '断言①（产物不入产物）必须报红');
  assert.match(out, /不一致/, '断言②（排除口径同源）必须报红');
  assert.match(out, /越过上界/, '断言③（体积上界）必须报红');
});

it('⑦【第 2 轮评审】CLI 端到端：有产物仓库 + 排除口径正确 → EXIT=0（先红后绿的「绿」侧）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-pack-ok-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.13.0' }));
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '## [Unreleased]\n\n## [1.13.0] - x\n');
  // 判据⑧（Issue #420）：本 fixture 造了 v1.13.0 标签 ⇒ 必须有对应发布说明，
  // 否则报红来自判据⑧ 而非被测的判据⑦（会掩盖本用例的意图）。
  fs.mkdirSync(path.join(dir, 'docs', 'releases'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'releases', 'v1.13.0.md'),
    '# Release Notes — v1.13.0\n\n## 一、本次发布内容\n\n- fixture\n'
  );
  fs.writeFileSync(
    path.join(dir, '.gitattributes'),
    ARTIFACT_EXPORT_IGNORE_PATTERN + ' export-ignore\n'
  );
  g('add', '-A');
  g('commit', '-qm', 'rel');
  g('tag', 'v1.13.0');
  fs.writeFileSync(
    path.join(dir, 'opencode-wps-v1.13.0.tar.gz'),
    crypto.randomBytes(30 * 1024 * 1024)
  );
  g('add', '-A');
  g('commit', '-qm', 'artifact');

  const res = spawnSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.strictEqual(res.status, 0, '产物被正确排除 ⇒ 判据⑦ 应放行；输出：' + out);
  assert.match(out, /判据⑦ 打包口径：archive 条目 \d+ 个/);
});

it('⑦【第 2 轮评审·单源缺失矩阵】六路单源逐路缺传 → 逐路独立报红（不被其它通路掩盖）', () => {
  const full = {
    archiveEntries: ['a.txt'],
    archiveBytes: 1000,
    attributesText: ARTIFACT_EXPORT_IGNORE_PATTERN + ' export-ignore',
    exportIgnorePattern: ARTIFACT_EXPORT_IGNORE_PATTERN,
    sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES,
    artifactName,
    hasArtifacts: true,
  };
  const expect = {
    artifactName: /artifactName/,
    exportIgnorePattern: /exportIgnorePattern/,
    sizeLimitBytes: /sizeLimitBytes/,
    archiveBytes: /gzip 后字节数缺失/,
    archiveEntries: /archive 条目清单缺失/,
    attributesText: /文本缺失/,
  };
  for (const [k, re] of Object.entries(expect)) {
    const o = Object.assign({}, full);
    delete o[k];
    const errs = checkArtifactPacking(o);
    assert.strictEqual(errs.length, 1, `缺 ${k} 应恰好报 1 条；实得 ${JSON.stringify(errs)}`);
    assert.match(errs[0], re);
  }
});

it('⑦【第 2 轮评审】断言① 的「任意版本」派生真跟随 artifactName 改名（非写死口径）', () => {
  // 改名命名口径后，断言① 必须按新口径识别嵌套产物（否则「改名即假绿」）。
  const myName = v => `pkg-v${v}.tgz`;
  const errs = checkArtifactPacking({
    archiveEntries: ['pkg-v1.0.0.tgz'],
    archiveBytes: 1000,
    attributesText: 'pkg-v*.tgz export-ignore',
    exportIgnorePattern: 'pkg-v*.tgz',
    sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES,
    artifactName: myName,
    hasArtifacts: true,
  });
  // 改名后断言① 应**跟随**新口径识别出嵌套产物（若写死旧口径则识别不到 = 假绿）
  assert.strictEqual(
    errs.length,
    1,
    '改名后断言① 必须跟随新口径识别嵌套产物；实得 ' + JSON.stringify(errs)
  );
  assert.match(errs[0], /pkg-v1\.0\.0\.tgz/);
  // 对照：同一条目在**旧**口径下必须**不被**识别为空
  const errs2 = checkArtifactPacking({
    archiveEntries: ['pkg-v1.0.0.tgz'],
    archiveBytes: 1000,
    attributesText: ARTIFACT_EXPORT_IGNORE_PATTERN + ' export-ignore',
    exportIgnorePattern: ARTIFACT_EXPORT_IGNORE_PATTERN,
    sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES,
    artifactName,
    hasArtifacts: true,
  });
  assert.deepStrictEqual(errs2, [], '旧口径下 pkg-v1.0.0.tgz 不是产物形态，不误报');
});

it('⑦【第 3/5 轮评审】放宽倍率（上界已派生 ⇒ 等价于放宽上界）→ 报红', () => {
  // 上界已收敛为**派生量**（= 基线 × 倍率）⇒「单改上界」在语法上不可能；
  // 等价攻击是「放宽倍率」。实测反例：倍率 16→200 曾零信号（CR5-1）。
  const errs = pack({ sizeLimitRatio: 200, sizeLimitBytes: ARTIFACT_SIZE_BASELINE_BYTES * 200 });
  assert.ok(errs.length >= 1, '放宽倍率必须报红');
  assert.match(errs.join(String.fromCharCode(10)), /绝对上限|静默放宽|倍率/);
});

it('⑦【第 3/5 轮评审】恒等基线绿：现行上界 == 基线 × 倍率（派生构造保证）→ 放行', () => {
  assert.deepStrictEqual(pack({}), []);
  // 名实一致：现行常量必须与「基线 × 倍率」自洽（否则守卫自身自相矛盾）
  assert.ok(
    ARTIFACT_SIZE_LIMIT_BYTES === ARTIFACT_SIZE_BASELINE_BYTES * ARTIFACT_SIZE_TOLERANCE_RATIO,
    '现行上界必须**恒等于**基线 × 倍率（派生构造保证）'
  );
  assert.ok(ARTIFACT_SIZE_BASELINE_BYTES > 0, '声明式基线必须为正');
});

it('⑦ 超上界与放宽倍率是两条**独立**诊断（不得互相掩盖）', () => {
  // 超上界（体积真的爆了）：archiveBytes 远超 limit ⇒ 报「越过上界」
  const a = pack({ archiveBytes: 200 * 1024 * 1024 });
  assert.ok(
    a.some(e => /越过上界/.test(e)),
    '体积爆表必须报「越过上界」'
  );
  // 放宽倍率（体积没变但门槛被抬）：ratio 越绝对上限 ⇒ 报「绝对上限」
  const b = pack({ sizeLimitRatio: 200, sizeLimitBytes: ARTIFACT_SIZE_BASELINE_BYTES * 200 });
  assert.ok(
    b.some(e => /绝对上限/.test(e)),
    '放宽门槛必须报「绝对上限」'
  );
});

it('⑦【第 3/4 轮评审】小仓库不得被漂移锚误伤；但放宽倍率仍报红（判据面外非豁免口）', () => {
  // 守卫可对任意 --root 运行：小仓库实测 335 B ⇒ 漂移对账跳出判据面（防假红）。
  assert.deepStrictEqual(pack({ archiveBytes: 335 }), [], '小仓库现状不得误伤');
  // 但「放宽倍率」（与实测无关的绝对约束）在小仓库下**仍报红** —— 判据面外不是豁免口
  assert.match(
    pack({
      archiveBytes: 335,
      sizeLimitRatio: 200,
      sizeLimitBytes: ARTIFACT_SIZE_BASELINE_BYTES * 200,
    })[0],
    /绝对上限/
  );
});

it('⑦【第 5 轮评审】CLI 端到端变异：放宽倍率（真实门禁本尊）→ 由绿转红', () => {
  // 铁律 24 第 7 维③：变异自证必须走**真实门禁**，不得只改内存对象规避。
  const repo = path.resolve(__dirname, '..');
  const mfPath = path.join(repo, 'scripts', 'lib', 'release-connectivity-manifest.js');
  const original = fs.readFileSync(mfPath, 'utf8');
  const pattern = /^const ARTIFACT_SIZE_TOLERANCE_RATIO = .*;$/m;
  assert.ok(pattern.test(original), '必须能定位倍率常量声明行');
  try {
    fs.writeFileSync(
      mfPath,
      original.replace(pattern, 'const ARTIFACT_SIZE_TOLERANCE_RATIO = 200;')
    );
    const res = spawnSync(
      'node',
      [path.join(repo, 'scripts', 'validate-release-connectivity.js')],
      {
        cwd: repo,
        encoding: 'utf8',
      }
    );
    const out = String(res.stdout || '') + String(res.stderr || '');
    assert.strictEqual(res.status, 1, '放宽倍率必须 EXIT=1；输出：' + out);
    assert.match(out, /绝对上限/);
  } finally {
    fs.writeFileSync(mfPath, original); // 必须还原（防污染后续用例）
  }
  const res2 = spawnSync('node', [path.join(repo, 'scripts', 'validate-release-connectivity.js')], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.strictEqual(res2.status, 0, '还原后必须 EXIT=0');
});

it('⑦【第 4 轮评审 CR4-1 修复】上界 + 基线**两处同步放大** → 报红（原零信号）', () => {
  // 实测真缺陷：CR3-1 只锚了「上界 ≤ 基线 × 倍率」，而两处同步改 ⇒ 守卫 `EXIT=0`
  // （与 #416 的 E1「基线 + 留痕同改同过」同族）。
  // 修法：基线必须与**当场实测体积**对账（同阶时 `基线 ≤ 实测 × 漂移上限`）。
  // 取**同阶**（实测 ≈ 基线量级）的同步放大，确保走到漂移对账分支：
  const live = 1644445; // 本仓实测量级（在判据面内）
  const errs = pack({
    archiveBytes: live,
    sizeBaselineBytes: live * 10, // 基线被同步放大
    sizeLimitBytes: live * 10 * ARTIFACT_SIZE_TOLERANCE_RATIO, // 上界与放大后的基线自洽（绕过形态）
  });
  assert.ok(errs.length >= 1, '两处同步放大必须报红');
  assert.match(errs.join('\n'), /漂移上限|静默放宽/);
});

it('⑦【第 4 轮评审 CR4-1】放宽倍率（基线不动，与实测自洽）→ 仍报红（CR3-1/CR5-1 保障不回退）', () => {
  const errs = pack({ sizeLimitRatio: 200, sizeLimitBytes: ARTIFACT_SIZE_BASELINE_BYTES * 200 });
  assert.ok(
    errs.some(e => /绝对上限|倍率/.test(e)),
    '放宽倍率必须报红'
  );
});

it('⑦【第 4 轮评审 CR4-1】基线自身与实测对账：**同阶**下基线脱离实测 → 报红', () => {
  // 同阶前提（实测 2M ≈ 基线 1.6M ⇒ 在判据面内），把基线放大到脱离实测 ⇒ 必须报红。
  const live = 1644445; // 本仓实测量级（在判据面内）
  const errs = pack({
    archiveBytes: live,
    sizeBaselineBytes: live * ARTIFACT_SIZE_BASELINE_MAX_DRIFT + 1,
    sizeLimitBytes: live * 100,
  });
  assert.ok(
    errs.some(e => /漂移上限/.test(e)),
    '同阶下基线脱离实测必须报红'
  );
});

it('⑦【第 4 轮评审 CR4-1 配套】小仓库（实测远小于基线）不得被漂移锚误伤', () => {
  // 守卫可对任意 --root 运行：小仓库实测 335 B ⇒ 漂移对账跳出判据面（防假红）。
  assert.deepStrictEqual(
    pack({ archiveBytes: 335, sizeLimitBytes: ARTIFACT_SIZE_LIMIT_BYTES }),
    [],
    '小仓库现状不得被漂移锚误伤'
  );
  // 但小仓库**放宽倍率**仍必须报红（判据面外不是豁免口）
  assert.match(
    pack({
      archiveBytes: 335,
      sizeLimitRatio: 200,
      sizeLimitBytes: ARTIFACT_SIZE_BASELINE_BYTES * 200,
    })[0],
    /绝对上限/
  );
});

it('⑦【第 4 轮评审 CR4-1】自洽基线绿：基线 == 实测（本仓形态）→ 放行', () => {
  // 本仓：实测 1,644,445 ≈ 基线 1,634,373（同阶）⇒ 漂移对账通过
  assert.deepStrictEqual(pack({ archiveBytes: 1644445 }), []);
});

it('⑦【第 4/5 轮评审】CLI 端到端变异：**放大基线**（真实门禁本尊）→ 由绿转红', () => {
  // 铁律 24 第 7 维③：变异自证必须走**真实门禁**。上界已派生 ⇒ 等价攻击是「放大基线」
  //（上界随基线联动放大），由「基线 ↔ 当场实测对账」拦住。
  const repo = path.resolve(__dirname, '..');
  const mfPath = path.join(repo, 'scripts', 'lib', 'release-connectivity-manifest.js');
  const original = fs.readFileSync(mfPath, 'utf8');
  try {
    const mutated = original.replace(
      /^const ARTIFACT_SIZE_BASELINE_BYTES = .*;$/m,
      'const ARTIFACT_SIZE_BASELINE_BYTES = 1634373 * 20;'
    );
    assert.notStrictEqual(mutated, original, '基线常量必须能被定位');
    fs.writeFileSync(mfPath, mutated);
    const res = spawnSync(
      'node',
      [path.join(repo, 'scripts', 'validate-release-connectivity.js')],
      {
        cwd: repo,
        encoding: 'utf8',
      }
    );
    const out = String(res.stdout || '') + String(res.stderr || '');
    assert.strictEqual(res.status, 1, '放大基线必须 EXIT=1；输出：' + out);
    assert.match(out, /漂移上限|静默放宽/);
  } finally {
    fs.writeFileSync(mfPath, original);
  }
  const res2 = spawnSync('node', [path.join(repo, 'scripts', 'validate-release-connectivity.js')], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.strictEqual(res2.status, 0, '还原后必须 EXIT=0');
});

// ===== 判据⑨：历史产物处置完整性（Issue #419 = #417 AC-6 拆分 · 铁律 22）=====
// 单一来源自证：下限 / 命名口径 / 决策登记全部取 manifest（本测试内**不**手写第二份）。
const floorOpts = {
  floor: RELEASE_ARTIFACT_FLOOR,
  undecidedBelow: ARTIFACT_FLOOR_UNDECIDED_BELOW,
  versionGte,
  artifactName,
  decisionRefs: ARTIFACT_FLOOR_DECISION_REFS,
};
const mkFloor = (v, ever) => ({ version: v, everCommitted: ever });
const floorCheck = entries => checkFloorHistoryIntegrity(entries, floorOpts);

it('⑨ 基线绿：冻结下限以上的产物曾入库 → 放行', () => {
  assert.deepStrictEqual(
    floorCheck([mkFloor(ARTIFACT_FLOOR_UNDECIDED_BELOW, true), mkFloor('1.14.8', true)]),
    []
  );
});

it('⑨【变异自证·核心】从未入库（`--diff-filter=A` 无记录）→ 报红', () => {
  const errs = floorCheck([mkFloor('1.14.7', false)]);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /从未入库/);
  assert.match(errs[0], /1\.14\.7/);
});

it('⑨【反重复·第 1 轮评审 CR419-1】**不**重复判据⑥ 的「在树内」断言（同一事实不两处断言）', () => {
  // 「已从树内消失」是判据⑥ 的 owner：本判据对该形态**零信号**（否则即同一事实两处断言）。
  // 该事实由判据⑥ 承担（见本文件 ⑥ 组的「产物缺失 → 报红」用例）。
  assert.deepStrictEqual(floorCheck([mkFloor('1.14.7', true)]), []);
  // 对照：判据⑥ 对「当前树内无该产物」确实报红（证明上面「不报」是分工，不是盲区）
  const errs6 = checkArtifactConnectivity(
    [{ tag: 'v1.14.7', match: ['v1.14.7', '1.14.7'], artifactOnBranch: false }],
    { floor: RELEASE_ARTIFACT_FLOOR, versionGte, artifactName }
  );
  assert.strictEqual(errs6.length, 1);
  assert.match(errs6[0], /找不到产物/);
});

it('⑨【独立判别力自证】本判据捕获的形态，判据⑥ 结构上做不到', () => {
  // 「从未入库 + 当前树内有同名文件」：判据⑥（只看当前树）⇒ 空数组；判据⑨ ⇒ 报红。
  const errs6 = checkArtifactConnectivity(
    [{ tag: 'v1.14.7', match: ['v1.14.7', '1.14.7'], artifactOnBranch: true }],
    { floor: RELEASE_ARTIFACT_FLOOR, versionGte, artifactName }
  );
  assert.deepStrictEqual(errs6, [], '判据⑥ 对该形态零信号（只看当前树）');
  assert.strictEqual(floorCheck([mkFloor('1.14.7', false)]).length, 1, '判据⑨ 必须捕获');
});

it('⑨【第 2 轮评审 CR419-2】低于产物下限的标签不在判据面（惯例建立前按定义无产物）', () => {
  // 实测真缺陷：原实现只判 `>= undecidedBelow` ⇒ 当未决下限被改到低于 floor 时，
  // v1.14.0（产物惯例建立**之前**）被拉进判据面 ⇒ 对合法历史假红「从未入库」。
  assert.deepStrictEqual(floorCheck([mkFloor('1.14.0', false)]), []);
  // 对照：同一形态在判据面内（冻结下限以上）必须报红
  assert.strictEqual(floorCheck([mkFloor('1.14.7', false)]).length, 1);
});

it('⑨ 待处置区间（floor ≤ v < 未决下限）不做断言（Issue #419 决策：保留、不动）', () => {
  assert.deepStrictEqual(floorCheck([mkFloor('1.14.1', false), mkFloor('1.14.6', false)]), []);
  // 对照：同一形态在下限**之上**必须报红（证明上面的「不报」是边界效果，不是判据判不出）
  assert.ok(floorCheck([mkFloor('1.14.7', false)]).length > 0);
});

it('⑨ 入库记录无法判定 → 报红，不假装通过', () => {
  const errs = floorCheck([mkFloor('1.14.7', undefined)]);
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /无法判定/);
});

it('⑨ 缺传单源（artifactName / versionGte / floor / undecidedBelow）→ 逐路报红', () => {
  const e = [mkFloor('1.14.7', false)];
  const expect = {
    artifactName: /artifactName/,
    versionGte: /versionGte/,
    floor: /floor/,
    undecidedBelow: /floor/,
  };
  for (const [k, re] of Object.entries(expect)) {
    const o = Object.assign({}, floorOpts);
    o[k] = undefined;
    const errs = checkFloorHistoryIntegrity(e, o);
    assert.strictEqual(errs.length, 1, `缺 ${k} 应恰好报 1 条；实得 ${JSON.stringify(errs)}`);
    assert.match(errs[0], re);
  }
});

it('⑨ 非法决策登记（空 / 缺传 / 空壳非编号）→ 报红（空壳登记不受理）', () => {
  // ⚠️ 用**合规条目**（曾入库）作陪跑：本用例只断言 decisionRefs 这一条独立报错，
  //    不被「从未入库」的报错掩盖（第 1 轮评审：原用例用 everCommitted=false ⇒ 两条报错互掩）。
  // ⚠️ 第 5 轮评审 CR419-5：断言口径从「非空」收为「形如 `#<编号>`」——实测 `['x']` / `['']`
  //    原样放行 ⇒ 「决策有落点」断言空心化（与 lib/ratchet.js 的「空壳留痕不受理」同口径）。
  for (const bad of [[], undefined, ['x'], [''], ['#419', 'nope']]) {
    const errs = checkFloorHistoryIntegrity(
      [mkFloor('1.14.7', true)],
      Object.assign({}, floorOpts, { decisionRefs: bad })
    );
    assert.strictEqual(
      errs.length,
      1,
      `decisionRefs=${JSON.stringify(bad)} 必须恰好报 1 条；实得 ${JSON.stringify(errs)}`
    );
    assert.match(errs[0], /decisionRefs/);
  }
  // 绿侧：合规登记（`#<编号>`）放行
  assert.deepStrictEqual(checkFloorHistoryIntegrity([mkFloor('1.14.7', true)], floorOpts), []);
});

it('⑨ 未决下限低于产物下限（区间被静默归零）→ 报红', () => {
  const errs = checkFloorHistoryIntegrity(
    [],
    Object.assign({}, floorOpts, { undecidedBelow: '1.14.0' })
  );
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /区间为空|静默归零/);
});

it('⑨ 决策登记与下限均为 manifest 单源（本测试不手写第二份）', () => {
  assert.ok(ARTIFACT_FLOOR_DECISION_REFS.length > 0, '决策登记不得为空');
  assert.ok(
    versionGte(ARTIFACT_FLOOR_UNDECIDED_BELOW, RELEASE_ARTIFACT_FLOOR),
    '未决下限必须 ≥ 产物下限（否则待处置区间为空）'
  );
});

it('⑨ 真实仓库端到端：CLI 现场输出判据⑨ 口径（走真实链路）', () => {
  const repo = path.resolve(__dirname, '..');
  const res = spawnSync('node', [path.join(repo, 'scripts', 'validate-release-connectivity.js')], {
    cwd: repo,
    encoding: 'utf8',
  });
  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.match(out, /判据⑨ 历史产物处置/, 'CLI 必须真实输出判据⑨ 口径');
  assert.match(out, /曾入库 \d+ 个/, '必须现场测算（非硬编码）');
});

// ===== 判据⑧：标签 ↔ 发布说明文件**存在性**（Issue #420 13/13 复盘 · 铁律 22）=====
// 判据④ 是**正向**对账（有 RN 则校验 §一 引用 ⊆ CHANGELOG）；本判据补**反向**断言
// （有标签则必须有 RN 文件）—— 堵住「发布四要素之一被整份省略」。
const { checkTagReleaseNotesExistence } = require('../scripts/lib/release-connectivity-scope.js');

const exOpts = {
  tagPattern: TAG_VERSION_PATTERN,
  floor: '1.14.0',
  versionGte,
};

it('⑧ 每个 ≥ floor 的标签都有对应发布说明 → 零问题', () => {
  const errs = checkTagReleaseNotesExistence(['v1.14.0', 'v1.14.1'], {
    ...exOpts,
    noteVersions: ['1.14.0', '1.14.1'],
    notesDir: 'docs/releases/',
  });
  assert.deepStrictEqual(errs, []);
});

it('⑧【核心判据】标签存在但发布说明缺失 → 报红（判据④ 的正向对账对此零信号）', () => {
  const errs = checkTagReleaseNotesExistence(['v1.14.0', 'v1.14.1'], {
    ...exOpts,
    noteVersions: ['1.14.0'], // 缺 1.14.1
    notesDir: 'docs/releases/',
  });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /标签 v1\.14\.1 缺少发布说明/);
  assert.match(errs[0], /docs\/releases\/v1\.14\.1\.md/);
  assert.match(errs[0], /整份省略/);
});

it('⑧ 低于 floor 的标签不参与（声明式截断，与判据④ 同源下限）', () => {
  const errs = checkTagReleaseNotesExistence(['v1.13.0', 'v1.14.0'], {
    ...exOpts,
    noteVersions: ['1.14.0'],
    notesDir: 'docs/releases/',
  });
  assert.deepStrictEqual(errs, [], 'v1.13.0 低于 floor ⇒ 不在判据面');
});

it('⑧ 非版本标签（如 pull/NN/merge）被忽略，不误报', () => {
  const errs = checkTagReleaseNotesExistence(['pull/422/merge', 'v1.14.0'], {
    ...exOpts,
    noteVersions: ['1.14.0'],
    notesDir: 'docs/releases/',
  });
  assert.deepStrictEqual(errs, []);
});

it('⑧ 发布说明版本清单缺失 → 报红（不接受兜底，与判据模块「无法判定不得视为通过」同口径）', () => {
  const errs = checkTagReleaseNotesExistence(['v1.14.0'], { ...exOpts, noteVersions: null });
  assert.strictEqual(errs.length, 1);
  assert.match(errs[0], /不得视为通过/);
});

it('⑧ 真实仓库端到端：CLI 在真实仓上跑判据⑧ 且当前不报红（走真实链路）', () => {
  const repo = path.resolve(__dirname, '..');
  const res = spawnSync('node', [path.join(repo, 'scripts', 'validate-release-connectivity.js')], {
    cwd: repo,
    encoding: 'utf8',
  });
  const out = String(res.stdout || '') + String(res.stderr || '');
  if (res.status !== 0) {
    // 本环境可能无 tag（浅克隆）⇒ 判据⑧ 判据面为空；但**不得**因判据⑧ 自身报红。
    assert.ok(!/判据⑧|缺少发布说明/.test(out), '不得因判据⑧ 报红：' + out);
  }
});

it('⑨【第 2 轮评审 CR419-11·真缺陷】未决下限被**上调**（豁免全部历史）→ 报红（原零信号）', () => {
  // 实测真缺陷：判据⑨ 内部的 `② undecided >= floor` 只拦**下调**（区间为空）；把未决下限
  // **上调**到当前版本之上（实测 1.14.7 → 99.0.0）⇒ 全部历史产物落入「待处置区间」⇒
  // 判据⑨ 判据面**为空**、仍 `EXIT=0`（本 PR 自己批判的「方案 B 豁免口袋」同构形态）。
  // 修法：与判据⓪/④ 同口径 —— 未决下限不得高于当前版本源版本（判据面为空 = 静默放宽）。
  // ⚠️ 断言口径（铁律 24 第 7 维③）：只对**判据⑨ 自己的输出**断言，且必须点名「静默放宽」
  //   （不得只对 EXIT 断言 —— 那会被无关判据污染）。
  const repo = path.resolve(__dirname, '..');
  const mfPath = path.join(repo, 'scripts', 'lib', 'release-connectivity-manifest.js');
  const original = fs.readFileSync(mfPath, 'utf8');
  const outOf = r => String(r.stdout || '') + String(r.stderr || '');
  const run = () =>
    spawnSync('node', [path.join(repo, 'scripts/validate-release-connectivity.js')], {
      cwd: repo,
      encoding: 'utf8',
    });
  try {
    assert.doesNotMatch(
      outOf(run()),
      /判据⑨ 未决处置下限 .* 高于最高的在树产物版本/,
      '绿侧：不得有此诊断'
    );
    const mutated = original.replace(
      /^const ARTIFACT_FLOOR_UNDECIDED_BELOW = .*;$/m,
      "const ARTIFACT_FLOOR_UNDECIDED_BELOW = '99.0.0';"
    );
    assert.notStrictEqual(mutated, original, '未决下限常量必须能被定位');
    fs.writeFileSync(mfPath, mutated);
    const out = outOf(run());
    assert.match(
      out,
      /判据⑨ 未决处置下限 99\.0\.0 高于最高的在树产物版本 .* 判据面为空 = 静默放宽/,
      '上调未决下限必须报红（点名判据面为空 = 静默放宽）；输出：' + out
    );
  } finally {
    fs.writeFileSync(mfPath, original); // 必须还原（防污染后续用例）
  }
  assert.doesNotMatch(
    outOf(run()),
    /判据⑨ 未决处置下限 .* 高于最高的在树产物版本/,
    '还原后必须回到绿'
  );
});

it('⑨【变异自证·真实链路】改小未决下限/清空决策登记 → 判据⑨ 由绿转红（走真实门禁本尊）', () => {
  // ⚠️ 断言口径（铁律 24 第 7 维③）：只对**判据⑨ 自己的输出**断言红/绿 —— 临时夹具最小化，
  //   对**其它**判据报红是预期的（不属于本用例判据面）；只对 EXIT 断言会被无关报红污染（假红）。
  const repo = path.resolve(__dirname, '..');
  const mfPath = path.join(repo, 'scripts', 'lib', 'release-connectivity-manifest.js');
  const original = fs.readFileSync(mfPath, 'utf8');
  const outOf = r => String(r.stdout || '') + String(r.stderr || '');
  const floorErrorsOf = out =>
    out.split('\n').filter(l => l.includes('判据⑨') && l.trim().startsWith('- '));
  const run = () =>
    spawnSync('node', [path.join(repo, 'scripts/validate-release-connectivity.js')], {
      cwd: repo,
      encoding: 'utf8',
    });
  try {
    const green = outOf(run());
    assert.deepStrictEqual(floorErrorsOf(green), [], '绿侧：判据⑨ 不得报红');
    // 变异：把未决下限改成低于产物下限（区间被静默归零）
    const mutated = original.replace(
      /^const ARTIFACT_FLOOR_UNDECIDED_BELOW = .*;$/m,
      "const ARTIFACT_FLOOR_UNDECIDED_BELOW = '1.14.0';"
    );
    assert.notStrictEqual(mutated, original, '未决下限常量必须能被定位');
    fs.writeFileSync(mfPath, mutated);
    const red = floorErrorsOf(outOf(run()));
    // 变异后报错 ≥1 条且**必含**「静默归零」（区间被归零后，1.14.0 也落进判据面 ⇒ 另有「从未入库」，
    // 属预期：本用例只要求**由绿转红**且含目标诊断，不要求「恰好 1 条」）。
    assert.ok(red.length >= 1, '红侧：判据⑨ 必须报红；输出：' + JSON.stringify(red));
    assert.ok(
      red.some(x => /静默归零/.test(x)),
      '必须含「静默归零」诊断；实得 ' + JSON.stringify(red)
    );
  } finally {
    fs.writeFileSync(mfPath, original); // 必须还原（防污染后续用例）
  }
  assert.deepStrictEqual(floorErrorsOf(outOf(run())), [], '还原后必须回到绿');
});

it('⑧ CLI 端到端变异自证：删掉发布说明 → 判据⑧ 报红（EXIT=1，走真实链路）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-rn-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  const write = (p, s) => {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), s);
  };
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  write('package.json', JSON.stringify({ version: '1.14.0' }));
  write('CHANGELOG.md', '## [Unreleased]\n\n## [1.14.0] - x\n');
  // 故意**不写** docs/releases/v1.14.0.md（变异点）
  g('add', '-A');
  g('commit', '-qm', 'release 1.14.0');
  g('tag', 'v1.14.0');

  const res = spawnSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  const out = String(res.stdout || '') + String(res.stderr || '');
  assert.strictEqual(res.status, 1, '缺发布说明必须 EXIT=1；输出：' + out);
  assert.match(out, /缺少发布说明/, '判据⑧ 必须报红');
  assert.match(out, /v1\.14\.0\.md/, '报红信息须点明缺失文件');

  // 补上发布说明后必须转绿（先红后绿的「绿」侧，证明报红确由本变异引起）
  write('docs/releases/v1.14.0.md', '# Release Notes — v1.14.0\n\n## 一、本次发布内容\n\n- x\n');
  g('add', '-A');
  g('commit', '-qm', 'add rn');
  const res2 = spawnSync('node', [CLI, '--root', dir], { encoding: 'utf8' });
  assert.strictEqual(
    res2.status,
    0,
    '补上发布说明后必须 EXIT=0；输出：' + String(res2.stdout || '')
  );
});
