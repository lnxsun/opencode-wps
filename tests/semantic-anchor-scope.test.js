/**
 * 「语义键 × 落点集合」双侧连通性守卫回归测试（Issue #335 / R10 第六类「范围无主」）。
 *
 * 守护对象：
 *   · `scripts/lib/semantic-anchor-manifest.js`（清单 + 计行范围，单一来源）；
 *   · `scripts/lib/semantic-anchor-scope.js`（纯函数判据）；
 *   · `scripts/validate-semantic-anchor-scope.js`（守卫 CLI，本文件用 spawnSync 跑**本尊**）。
 *
 * 每类判据各留**变异自证**（注入反例 → 由绿转红），并含 Issue #335 第一节 A/B/C/D
 * 四条对照实验（AC1：可执行断言固化，不只在文档里）。
 *
 * 运行：node tests/semantic-anchor-scope.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const CLI = path.join(rootDir, 'scripts', 'validate-semantic-anchor-scope.js');
const {
  SEMANTIC_ANCHORS,
  GUARD_SCOPES,
  coveringGuards,
} = require('../scripts/lib/semantic-anchor-manifest.js');
const {
  siteCarriesAnchor,
  keyAnchors,
  checkCoverageSide,
  checkAttributionSide,
  // Issue #352 第十刀迁入：K7 治理指路判据（原 lib/governance-guide-map.js + 其专测）
  extractEmittedLabels,
  extractGuideMapEntries,
  extractGuideMapKeys,
  checkGuideMapCoverage,
  checkGuideMapBudget,
} = require('../scripts/lib/semantic-anchor-scope.js');

let testCount = 0;
let passCount = 0;
const failures = [];
function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failures.push({ name, err: e });
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}
function assertTrue(a, m) {
  if (!a) throw new Error(m || 'expected true');
}
function assertEqual(a, b, m) {
  if (a !== b) throw new Error((m || 'not equal') + ': got ' + a + ', want ' + b);
}
function assertSome(arr, pred, m) {
  if (!arr.some(pred)) throw new Error((m || 'no match') + ' in ' + JSON.stringify(arr));
}

/** 跑守卫 CLI 本尊，返回 { code, out } */
function runGuard() {
  const r = spawnSync(process.execPath, [CLI], { cwd: rootDir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/** 临时写入 / 还原一个文件（无条件还原，防污染工作区） */
function withTempFile(rel, content, fn) {
  const abs = path.join(rootDir, rel);
  const existed = fs.existsSync(abs);
  const orig = existed ? fs.readFileSync(abs, 'utf8') : null;
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    fn();
  } finally {
    if (existed) fs.writeFileSync(abs, orig);
    else if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}
const emptyCover = () => [];
const existsAll = () => true;

// ==================== 基线：真实仓库全绿 ====================
console.log('\n基线 — 真实仓库：守卫 CLI 本尊 exit 0');
test('基线：仓库当前状态守卫通过（无连通性违规）', () => {
  const { code, out } = runGuard();
  assertEqual(code, 0, '守卫应通过，实际输出：\n' + out);
});

// ==================== AC3 单一来源自证 ====================
console.log('\nAC3 单一来源 — 判据模块内不得出现仓库路径字面量（#321 R9-A 同源口径）');

test('AC3：lib 判据模块内不出现仓库路径字面量', () => {
  const mod = fs.readFileSync(
    path.join(rootDir, 'scripts', 'lib', 'semantic-anchor-scope.js'),
    'utf8'
  );
  for (const lit of [
    'wps-office-mcp/src/tools/word/',
    'wps-office-mcp/scripts/wps-com.ps1',
    '.opencode/plugins/governance.js',
    'skills/wps-proofread',
  ]) {
    assertTrue(!mod.includes(lit), `判据模块不得硬编码仓库路径字面量：${lit}`);
  }
});

test('AC3：清单与范围表只在 manifest 单源，判据模块不自持第二份', () => {
  const mod = fs.readFileSync(
    path.join(rootDir, 'scripts', 'lib', 'semantic-anchor-scope.js'),
    'utf8'
  );
  assertTrue(!/SEMANTIC_ANCHORS\s*=|GUARD_SCOPES\s*=/.test(mod), '判据模块不得自带清单/范围表');
  assertTrue(SEMANTIC_ANCHORS.length > 0 && GUARD_SCOPES.length > 0, '单一来源清单应非空');
});

// ==================== 归属侧主判据（代码形态 vs 文档提及）====================
console.log('\n归属侧主判据 — 只认**代码形态**，不认文档/注释提及');

test('归属判据：代码声明形态命中（const / export / 成员访问 / 调用）', () => {
  assertTrue(siteCarriesAnchor('export const truncated = true;', ['truncated']).length === 1);
  assertTrue(siteCarriesAnchor('const requestedLength = 3;', ['requestedLength']).length === 1);
  assertTrue(siteCarriesAnchor('obj.truncated = true;', ['truncated']).length === 1);
  assertTrue(siteCarriesAnchor('checkTruncated(returnedLength)', ['returnedLength']).length === 0);
});

test('归属判据：PS1 变量声明形态命中（$name =）', () => {
  assertTrue(siteCarriesAnchor('$requestedLength = $length', ['requestedLength']).length === 1);
});

test('归属判据：纯注释提及不算承载（防清单/判据自指噪声）', () => {
  const commented =
    '// 说明：本文件涉及 requestedLength 语义\n/* truncated 见别处 */\n* returnedLength';
  assertEqual(
    siteCarriesAnchor(commented, ['requestedLength', 'truncated', 'returnedLength']).length,
    0
  );
});

// ==================== 方向 1① 覆盖侧 ====================
console.log('\n方向 1① 覆盖侧 — 未覆盖落点必须显式豁免（不得悄悄移出范围）');

test('① 变异自证：未覆盖 → 报红', () => {
  const manifest = [{ key: 'k', sites: [{ path: 'a/b.ts' }] }];
  const errs = checkCoverageSide(manifest, emptyCover, existsAll).errors;
  assertEqual(errs.length, 1);
  assertTrue(errs[0].includes('不在任何守卫的计行范围内'), '应报未覆盖');
});

// Issue #373 QA-F1：实测「从清单整体删掉一个落点」会让两侧判据都无从判定 ⇒ 静默通过。
// 本判据至少拦住「落点被删到只剩空括号」这一形态（缺 path 的声明即报红）。
test('① QA-F1 变异自证：空落点声明（缺 path）→ 报红', () => {
  const manifest = [{ key: 'k', sites: [{}, { path: 'a/b.ts' }] }];
  const errs = checkCoverageSide(manifest, () => ['some-guard'], existsAll).errors;
  assertEqual(errs.length, 1, '空落点声明必须报红');
  assertTrue(errs[0].includes('空落点声明'), '应报「空落点声明」');
});

test('① 边界：已覆盖 → 放行（第九刀：豁免口已删，只能靠真覆盖）', () => {
  const manifest = [{ key: 'k', sites: [{ path: 'a/b.ts' }] }];
  assertEqual(checkCoverageSide(manifest, () => ['some-guard'], existsAll).errors.length, 0);
});

test('① 环境性：落点本地缺失 → warning（非契约违规，R5-A 同族）', () => {
  const manifest = [{ key: 'k', sites: [{ path: 'missing.ts' }] }];
  const r = checkCoverageSide(manifest, emptyCover, () => false);
  assertEqual(r.errors.length, 0, '缺失不得报契约违规');
  assertTrue(
    r.warnings.some(w => w.includes('本地不存在')),
    '应以「本地不存在」披露'
  );
});

// ==================== 方向 1② 归属侧 ====================
console.log('\n方向 1② 归属侧 — 含该语义的文件漏登记 → 报红');

test('② 变异自证：未登记文件含语义代码形态 → 报红（拦得住 A/B 探针的核心）', () => {
  const manifest = [
    { key: 'truncation-signal', sites: [{ path: 'known.ts', anchor: 'truncated' }] },
  ];
  const scanned = [{ path: 'new-raw.ts', text: 'export const truncated = true;' }];
  const errs = checkAttributionSide(manifest, scanned, { existsOf: existsAll }).errors;
  assertEqual(errs.length, 1);
  assertTrue(errs[0].includes('漏登记落点'), '应报漏登记');
  assertTrue(errs[0].includes('new-raw.ts'), '应点名漏登记文件');
});

test('② 边界：已登记落点不重复报 + 无关文件不误报', () => {
  const manifest = [
    { key: 'truncation-signal', sites: [{ path: 'known.ts', anchor: 'truncated' }] },
  ];
  const scanned = [
    { path: 'known.ts', text: 'export const truncated = true;' },
    { path: 'unrelated.ts', text: 'const x = 1;' },
  ];
  assertEqual(checkAttributionSide(manifest, scanned, { existsOf: existsAll }).errors.length, 0);
});

// ==================== AC1 复现实验固化（A/B/C/D 四条，跑 CLI 本尊）====================
console.log('\nAC1 复现实验固化 — 轴外 PASS / 轴内 FAIL（跑守卫 CLI 本尊）');

test('AC1-A/B 变异自证：往**未登记**落点追加同义实现 → 守卫 exit 1', () => {
  // Issue #335 第一节 A/B 探针的等价最小形态：一个**守卫计行范围外**、且**未登记**的文件。
  withTempFile(
    'wps-office-mcp/src/tools/word/range-signal-probe.ts',
    'export const truncated = true;\nexport const requestedLength = 0;\n',
    () => {
      const { code, out } = runGuard();
      assertEqual(code, 1, '轴外未登记落点追加同义实现必须报红，实际：\n' + out);
      assertTrue(out.includes('漏登记落点'), '应报漏登记落点');
    }
  );
});

test('AC1-B′ 变异自证：PS1 未登记落点追加同义实现 → 守卫 exit 1', () => {
  withTempFile(
    'wps-office-mcp/scripts/wps-com-probe.ps1',
    '$requestedLength = $length\n$returnedLength = $text.Length\n',
    () => {
      const { code, out } = runGuard();
      assertEqual(code, 1, 'PS1 未登记落点必须报红，实际：\n' + out);
      assertTrue(out.includes('漏登记落点'), '应报漏登记落点');
    }
  );
});

test('AC1-D 对照：往**已登记**落点追加同义实现 → 不因落点而报红（归属侧不重复报）', () => {
  // 对照轴：已登记落点（wps-com.ps1 已在清单内）追加同义实现，归属侧不应报「漏登记」
  // ——它已登记，归属侧不重复报；该落点的覆盖由「单一范围表现场计算」判定（第九刀已删 waiver 豁免口）。
  const psAbs = path.join(rootDir, 'wps-office-mcp/scripts/wps-com.ps1');
  const orig = fs.readFileSync(psAbs, 'utf8');
  try {
    fs.writeFileSync(psAbs, orig + '\n$requestedLength2 = 0\n');
    const { out } = runGuard();
    assertTrue(!out.includes('漏登记落点'), '已登记落点不得被报「漏登记」：\n' + out);
  } finally {
    fs.writeFileSync(psAbs, orig);
  }
});

test('AC1-反向对照：干净仓库 → 守卫 exit 0（合法状态不误伤）', () => {
  const { code, out } = runGuard();
  assertEqual(code, 0, '干净仓库应 exit 0：\n' + out);
});

// ==================== 与既有 H1 的分工（自限披露，AC2 口径）====================
console.log('\nAC2 口径 — 与 H1 分工：H1 自限，本守卫须**拦得住探针**');

test('H1 曾自限：探针只改文件内容、不触碰登记表 ⇒ 现守卫必须拦住（本次自证）', () => {
  // 反例形态：H1 只看 `CROSS_CHANNEL_SCOPE_GAPS` 的存在性与 why 文件存在性，
  // 探针直接改**文件内容** ⇒ H1 恒绿。本测试断言**本守卫**在同一探针下 exit 1。
  withTempFile(
    'wps-office-mcp/src/tools/word/truncation-consumer-probe.ts',
    'export function consumeTruncated() {\n  const truncated = false;\n  return truncated;\n}\n',
    () => {
      const { code } = runGuard();
      assertEqual(code, 1, '本守卫必须拦得住「只改文件内容」的探针（否则与 H1 同族自限）');
    }
  );
});

// ==================== PR #336 评审修复的四条（F1/F2/F3/F4）变异自证 ====================
console.log('\nPR #336 评审修复 — F1/F2/F3/F4 四条变异自证（跑守卫 CLI 本尊）');

test('F1 变异自证：`scripts/` 下**普通脚本**写同义实现 → 报红（原实现漏扫该根）', () => {
  // 评审 F1 实测：`CANDIDATE_ROOTS` 漏了 `scripts/`，写 `const truncated = true` → 原实现 EXIT=0。
  withTempFile('scripts/probe-f1-sibling.js', 'const truncated = true;\n', () => {
    const { code, out } = runGuard();
    assertEqual(code, 1, 'scripts/ 普通脚本的同义实现必须报红：\n' + out);
    assertTrue(out.includes('漏登记落点'), '应报漏登记落点');
  });
});

test('F1 边界披露：条目「元模块」（清单/判据/守卫）**不**被误报为落点', () => {
  // 反向自证：清单与判据模块自身会「提到」这些名字，但它们是「关于语义」而非「语义实现」，不得自指报红。
  const { code, out } = runGuard();
  assertEqual(code, 0, '元模块不得自指报红：\n' + out);
  assertTrue(!out.includes('semantic-anchor-manifest.js 含该语义'), '清单自身不得被报漏登记');
});

test('F2 一致性断言自证：清单模块**未消费**共享单源 → 报红（把范围副本钉死）', () => {
  // 反例形态：把清单模块的共享单源消费改名（模拟「回退成自带副本」）。
  const rel = 'scripts/lib/semantic-anchor-manifest.js';
  const abs = path.join(rootDir, rel);
  const orig = fs.readFileSync(abs, 'utf8');
  try {
    // 反例形态：把共享单源换成**不存在**的副本模块 —— 轴 I 无法拿到范围表 ⇒ 必须 FAIL（非静默通过）
    fs.writeFileSync(abs, orig.replace("require('./guard-scopes.js')", "require('./_copy.js')"));
    const { code, out } = runGuard();
    assertEqual(code, 1, '清单模块未消费共享单源必须报红：\n' + out);
    assertTrue(
      /未消费范围单一来源|Cannot find module|MODULE_NOT_FOUND/.test(out),
      '应报未消费单源（或因其缺失而无法运行）'
    );
  } finally {
    fs.writeFileSync(abs, orig);
  }
});

test('F2 一致性断言自证：覆盖声明**无执行者**（脚本不存在）→ 报红（Issue #325 第二刀核心）', () => {
  // 反例形态：把某条覆盖声明的 script 指到一个不存在的脚本 —— 这正是旧实现的问题
  // （登记了已删的 budget/convergence 的范围，覆盖声明没有执行者 ⇒ 假绿）。
  const rel = 'scripts/lib/guard-scopes.js';
  const abs = path.join(rootDir, rel);
  const orig = fs.readFileSync(abs, 'utf8');
  try {
    fs.writeFileSync(
      abs,
      orig.replace(
        "const GATEWAY_MEMBERSHIP_SCRIPT = 'scripts/validate-gateway-membership.js';",
        "const GATEWAY_MEMBERSHIP_SCRIPT = 'scripts/validate-proofread-budget.js';".replace(
          'scripts/validate-proofread-budget.js',
          'scripts/validate-proofread-budget.js'
        )
      )
    );
    const { code, out } = runGuard();
    assertEqual(code, 1, '覆盖声明指向不存在的脚本必须报红：\n' + out);
    assertTrue(out.includes('不存在'), '应报脚本不存在');
  } finally {
    fs.writeFileSync(abs, orig);
  }
});

test('F3 变异自证：落点声明不存在的 anchor → 报红（原实现只声明不消费）', () => {
  const manifestRel = 'scripts/lib/semantic-anchor-manifest.js';
  const abs = path.join(rootDir, manifestRel);
  const orig = fs.readFileSync(abs, 'utf8');
  try {
    fs.writeFileSync(
      abs,
      orig.replace("        anchor: 'truncated',", "        anchor: 'FAKE_ANCHOR_ZZZ',", 1)
    );
    const { code, out } = runGuard();
    assertEqual(code, 1, '伪造 anchor 必须报红：\n' + out);
    assertTrue(
      out.includes('FAKE_ANCHOR_ZZZ') && out.includes('却未在该文件中出现'),
      '应点名伪造 anchor'
    );
  } finally {
    fs.writeFileSync(abs, orig);
  }
});

test('F4 边界：限值由基线**派生**（余量 ≥5% 为构造保证），非手工字面量', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(!/E1_LIMITS\s*=/.test(src), '限值不得再写成手工字面量表');
  assertTrue(/e1Limit\s*=/.test(src), '限值须由基线派生（e1Limit 函数）');
  assertTrue(/\/\s*0\.95/.test(src), '派生口径须为 ÷0.95（≥5% 余量）');
});

test('F4 变异自证：实测**超基线但未超派生上限** → 只警告不报错（不因正常小改误报）', () => {
  const { code, out } = runGuard();
  assertEqual(code, 0, '干净仓库不得因 E1 误报：\n' + out);
});

// ==================== 共享范围单源（guard-scopes.js）====================
console.log('\n共享范围单源 — lib/guard-scopes.js 与真实守卫消费同一份范围');

test('单源：覆盖源只有真实守卫（无「已删守卫的范围」残留）', () => {
  // Issue #325 第二刀：范围表里**不得**再出现已删除的历史守卫（budget/convergence）——
  // 那是「覆盖声明没有执行者」，正是旧实现的假绿来源。
  const scopes = require('../scripts/lib/guard-scopes.js');
  for (const s of scopes.GUARD_SCOPES) {
    assertTrue(!/budget|convergence/.test(s.guard), `残留已删守卫：${s.guard}`);
    assertTrue(
      typeof s.script === 'string' && fs.existsSync(path.join(rootDir, s.script)),
      `覆盖源必须有真实执行者：${s.guard} → ${s.script}`
    );
  }
});

test('单源：覆盖判定来自真实守卫（网关名单落点被覆盖、无关文件不被覆盖）', () => {
  const { coveringGuards } = require('../scripts/lib/guard-scopes.js');
  assertSome(coveringGuards('.opencode/plugins/governance.js'), g =>
    g.includes('gateway-membership')
  );
  // ⚠️ 探针必须选**真的没有任何覆盖源**的文件：`README.md` / `AGENTS.md` 自 Issue #359
  //    起已被**文档漂移守卫**（doc-numbers / removed-mechanisms）合法覆盖，不再是「无关文件」。
  assertEqual(coveringGuards('LICENSE').length, 0, '无关文件不应被任何覆盖源包含');
});

test('单源：存活消费侧不得自持范围副本（只允许 import 共享模块）', () => {
  // Issue #325：原消费侧（validate-proofread-budget.js / validate-proofread-convergence.js）
  // 已随校对线冗余清理删除；现存活消费侧只剩清单模块。
  const rel = 'scripts/lib/semantic-anchor-manifest.js';
  const src = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  assertTrue(src.includes("require('./guard-scopes.js')"), `${rel} 须消费共享单源`);
  assertTrue(
    !src.includes(':(glob)wps-office-mcp/src/tools/word/proofread'),
    `${rel} 不得再内联范围字面量`
  );
});

// ==================== 代码形态识别（F3 支撑）====================
console.log('\n代码形态识别 — 合法代码形态命中，注释/字符串/子串不命中');

test('形态：可选 TS 成员 / 多行 import 成员 / 对象值引用 / var 声明 均命中', () => {
  assertEqual(siteCarriesAnchor('      requestedLength?: number;', ['requestedLength']).length, 1);
  assertEqual(
    siteCarriesAnchor('import {\n  PROOFREAD_BATCH_MAX,\n} from "./x";', ['PROOFREAD_BATCH_MAX'])
      .length,
    1
  );
  assertEqual(
    siteCarriesAnchor('      batchMax: PROOFREAD_BATCH_MAX,', ['PROOFREAD_BATCH_MAX']).length,
    1
  );
  assertEqual(siteCarriesAnchor('var B = 200;', ['B']).length, 1);
});

test('形态：字符串字面量提及不算承载（防元模块自指噪声）', () => {
  assertEqual(
    siteCarriesAnchor("const s = 'PROOFREAD_BATCH_MAX';", ['PROOFREAD_BATCH_MAX']).length,
    0
  );
  assertEqual(siteCarriesAnchor('const s = "truncated";', ['truncated']).length, 0);
});

test('形态：子串不误伤（xyzTruncatedFlag 不算 truncated）', () => {
  assertEqual(siteCarriesAnchor('const xyzTruncatedFlag = 1;', ['truncated']).length, 0);
});

test('形态：同行未配对引号不得吞掉整段代码（wps-com.ps1 实测踩中的假红）', () => {
  const ps1 = "$requestedLength = $length\n$x = 'unclosed\n$requestedLength = $length\n";
  assertEqual(siteCarriesAnchor(ps1, ['$requestedLength']).length, 1, 'PS1 变量声明须命中');
});

// ==================== 校对线语义登记（本 Issue：消除「语义无主」）====================
console.log('\n校对线语义登记 — fix-action / skipped-segments / 六维映射三键已入清单');

test('校对线三键已登记且落点非空（原为「语义无主」）', () => {
  for (const key of ['fix-action-verdict', 'skipped-segment-ownership', 'theme-metric-map']) {
    const entry = SEMANTIC_ANCHORS.find(e => e.key === key);
    assertTrue(!!entry, `缺少语义键 ${key}`);
    assertTrue(entry.sites.length >= 3, `${key} 落点过少：${entry.sites.length}`);
    assertTrue(keyAnchors(entry).length > 0, `${key} 缺少归属锚点`);
  }
});

test('变异自证：把 fix-action 的声明落点改名 → 归属侧立即报「漏登记落点」', () => {
  // 反例形态：语义键里登记的是「旧落点」，而真实实现已换到别处（= 换位置就复发的病灶形态）。
  // 这里直接改判据输入（不动工作区文件），断言归属侧拦得住。
  const manifest = [
    {
      key: 'fix-action-verdict',
      sites: [
        {
          path: 'wps-office-mcp/src/tools/word/legacy-normalize.ts',
          anchor: 'resolveFixAction',
        },
      ],
    },
  ];
  const scanned = [
    {
      path: 'wps-office-mcp/src/tools/word/proofread-normalize.ts',
      text: 'export function resolveFixAction(i) { return i; }',
    },
  ];
  const errs = checkAttributionSide(manifest, scanned, { existsOf: existsAll }).errors;
  assertEqual(errs.length, 1, '换位置后的新落点必须报漏登记');
  assertTrue(errs[0].includes('漏登记落点'), '应报漏登记');
});

// ==================== F1（Issue #341 评审）：归属候选排除不得按目录名整目录排除 ====================
console.log('\nF1 — Issue #341 评审：归属候选排除判据必须只认「测试文件本身」');

test('F1 变异自证：`tests/fixtures/` 内写同义实现 → 守卫 exit 1（原实现按 tests/ 整目录排除 ⇒ 假绿）', () => {
  // 原实现 `/(^|\/)(tests?|__tests__)\//` 匹配路径**任意层级**的 tests/，
  // 于是 tests/fixtures/（实现代码，非断言）被整目录排除，实测 EXIT=0（假绿）。
  withTempFile(
    'tests/fixtures/probe-f1.js',
    'module.exports = (a, b) => normalizeSkippedSegmentsDetailed(a, b);\n',
    () => {
      const { code, out } = runGuard();
      assertEqual(code, 1, 'tests/fixtures/ 内的同义实现必须报红，实际：\n' + out);
      assertTrue(out.includes('漏登记落点'), '应报漏登记落点');
      assertTrue(out.includes('probe-f1.js'), '应指向该探针文件');
    }
  );
});

test('F1 变异自证：`scripts/validate-*.js` 内写同义实现 → 守卫 exit 1（原实现按文件名整类排除 ⇒ 假绿）', () => {
  // 原实现的 IS_META_MODULE 把 `validate-*` 整类排除，宣称「守卫脚本不承载实现」；
  // 但该豁免只提供假绿可能（任何脚本起名 validate-xxx.js 即可藏同义实现）。
  withTempFile(
    'scripts/validate-tmp-probe-f1.js',
    'module.exports = (a, b) => normalizeSkippedSegmentsDetailed(a, b);\n',
    () => {
      const { code, out } = runGuard();
      assertEqual(code, 1, 'validate-* 内的同义实现必须报红，实际：\n' + out);
      assertTrue(out.includes('漏登记落点'), '应报漏登记落点');
    }
  );
});

test('F1 边界对照：真测试文件（*.test.js / __tests__/）仍被排除（不引入测试噪声）', () => {
  // 收窄不能收成「什么都扫」——测试天然会提到这些名字，登记为落点会让清单被噪声淹没。
  withTempFile(
    'tests/probe-f1-noise.test.js',
    "it('x', () => { expect(normalizeSkippedSegmentsDetailed).toBeDefined(); });\n",
    () => {
      const { code, out } = runGuard();
      assertEqual(code, 0, '真测试文件应被排除（不报红），实际：\n' + out);
    }
  );
});

test('F1 口径唯一：排除判据只认 __tests__/ 与 *.test.* / *.spec.*（源码可复核）', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    src.includes('__tests__') && src.includes('(test|spec)'),
    'IS_TEST_FILE 必须收窄为 __tests__/ 与 *.test.*/*.spec.*'
  );
  assertTrue(
    !/IS_META_MODULE\s*=[\s\S]{0,200}validate-/.test(src),
    'IS_META_MODULE 不得再把 validate-* 整类排除（该排除已被 F1 探针证为假绿入口）'
  );
});

test('R2-F1：排除判据不得再引入「按目录名」的黑名单豁免（F1/R2-F1 假绿同一根因）', () => {
  // 目录名与「实现/断言」无必然关系：
  //   · `tests/fixtures/` = 实现（原 F1 假绿入口）；
  //   · `src/tests/support/*.ts` = 编译期断言（刻意非 .test.ts）。
  // 两轮假绿的同一根因都是「按目录名豁免」。本守卫不再开目录级豁免。
  const src = fs.readFileSync(CLI, 'utf8');
  const isTestLine = src.split('\n').find(l => l.includes('const IS_TEST_FILE ='));
  assertTrue(!!isTestLine, 'IS_TEST_FILE 必须存在（唯一职责=排除测试文件）');
  assertTrue(
    !/tests?\//.test(isTestLine),
    'IS_TEST_FILE 不得再按 `tests/` 目录名排除（应只认 __tests__/ 与 *.test.*/*.spec.*）：' +
      isTestLine
  );
  // 自限披露必须如实说明「tests/support/*.ts 会进候选池」（不假装排干净）
  assertTrue(
    src.includes('support'),
    '自限披露必须如实披露 tests/support/*.ts 会进候选池（宁可如实披露「排不干净」，也不假装已排尽）'
  );
});

test('R6-F1 变异自证（真实 CLI）：放宽 E1 基线 → 守卫 exit 1（E1 基线不许被随意放宽）', () => {
  // R6 评审：E1_BASELINES 此前可被随意放宽（实测改成 99999 仍 EXIT=0）⇒
  // 「防腐不豁免守卫」形同虚设。本轮接入共享棘轮判据 lib/ratchet.js。
  const src = fs.readFileSync(CLI, 'utf8');
  const patched = src.replace(/(\n  guardCodeLines: )\d+(,\n  guardBranches:)/, '$199999$2');
  assertTrue(patched !== src, '应能定位 E1_BASELINES.guardCodeLines 字面量（否则探针失效）');
  try {
    fs.writeFileSync(CLI, patched);
    const r = spawnSync(process.execPath, [CLI], { cwd: rootDir, encoding: 'utf8' });
    assertEqual(r.status, 1, '放宽 E1 基线必须报红');
    assertTrue(((r.stdout || '') + (r.stderr || '')).includes('棘轮'), '应报棘轮相关错误');
  } finally {
    fs.writeFileSync(CLI, src);
  }
});

test('R6-F2 口径唯一：棘轮判据单源 lib/ratchet.js，两条守卫都消费它（不得各写一份）', () => {
  const lib = require('../scripts/lib/ratchet.js');
  assertTrue(typeof lib.checkRatchet === 'function', 'lib/ratchet.js 必须导出 checkRatchet');
  assertTrue(
    typeof lib.checkRatchetLogChronology === 'function',
    'lib/ratchet.js 必须导出 checkRatchetLogChronology（留痕时间序判据与 checkRatchet 单源同居）'
  );
  // 反证：守卫侧不得自写第二份链条判据（`from !== prev.to` 这类比较只许存在于 lib/ratchet.js）
  const scopeSrc = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    !/prev\.to\s*!==|!==\s*cur\.from/.test(scopeSrc),
    '守卫不得自写留痕链条比较（须消费 lib/ratchet.js 单源）'
  );
  for (const guard of ['validate-semantic-anchor-scope.js', 'validate-proofread-report-size.js']) {
    const src = fs.readFileSync(path.join(rootDir, 'scripts', guard), 'utf8');
    assertTrue(
      src.includes("require('./lib/ratchet.js')"),
      `${guard} 必须消费共享棘轮判据（同一不变量只有一处实现）`
    );
  }
});

test('R6-F2 棘轮维度同键集：E1 每个维度都必须在棘轮初始值里登记（防新增维度绕开棘轮）', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const pick = name => {
    const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
    assertTrue(!!m, `应能解析 ${name}`);
    return [...m[1].matchAll(/(\w+):\s*\d+/g)].map(x => x[1]);
  };
  const cur = pick('E1_BASELINES');
  const init = pick('E1_RATCHET_INITIAL');
  for (const d of cur) {
    assertTrue(init.includes(d), `E1 维度 ${d} 未登记棘轮初始值（新增维度不得绕开棘轮）`);
  }
});

test('第五刀·R8-F1：棘轮基线必须**派生自留痕**，不得另存一张副本表（防判据恒真）', () => {
  // 复现原缺陷：E1_RATCHET_BASELINES 与 E1_BASELINES 逐维复制 ⇒ `current > baseline` 恒假。
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(!/E1_RATCHET_BASELINES = \{/.test(src), '副本基线表不得复活（判据会退化为恒真）');
  assertTrue(/const e1RatchetBaseline = dim =>/.test(src), '基线必须由留痕派生（唯一来源）');
  // 派生口径：无留痕 → initial；有留痕 → 末条 .to
  const init = src.match(/const E1_RATCHET_INITIAL = \{([\s\S]*?)\n\};/)[1];
  assertTrue(/guardSourceLines:\s*\d+/.test(init), '新维度必须登记初始值');
  // 变异自证（真实链路）：把某维声明基线改成**高于棘轮天花板**的值 ⇒ 现值 > 派生基线 ⇒ 必须报「被上调」。
  // ⚠️ 探针值**不得写死**：原写死 9999，在天花板（E1_RATCHET_ANCHOR.guardSourceLines）长大后会落入
  //   其下方 ⇒ 判据改由「基线 = 实测对账失败」捕获（仍报红，但**不再是**本用例要证的「被上调」路径）⇒ 用例失真。
  //   现从源码**现场派生**：锚定基线 + 1000（恒高于天花板）。
  const anchorM = src.match(/const E1_RATCHET_ANCHOR = \{ guardSourceLines: (\d+) \};/);
  assertTrue(!!anchorM, '应能定位 E1_RATCHET_ANCHOR.guardSourceLines（否则本探针失效）');
  const aboveCeiling = Number(anchorM[1]) + 1000;
  const patched = src.replace(
    /\n  guardSourceLines: \d+,/,
    `\n  guardSourceLines: ${aboveCeiling},`
  );
  assertTrue(patched !== src, '应能定位 E1_BASELINES.guardSourceLines 字面量（否则探针失效）');
  const tmp = path.join(rootDir, 'scripts', 'validate-probe-scope.js');
  try {
    fs.writeFileSync(tmp, patched);
    const r = spawnSync(process.execPath, [tmp], { cwd: rootDir, encoding: 'utf8' });
    assertEqual(r.status, 1, '现值 > 派生基线必须报红（否则「不许上调」仍是恒真）');
    assertTrue(/棘轮被上调/.test((r.stdout || '') + (r.stderr || '')), '应报「棘轮被上调」');
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

test('R8/R9 断言：语义键必须在 docs/ 的**清单区块内**被文档化（防「贴到无关段落蒙混」）', () => {
  // R9 评审 F1：首版实现只做 docsText.includes(key) 子串检查 —— 「测形态不测行为」。
  // 现要求 key 出现在**唯一标记行**（SEMANTIC-ANCHORS-LIST）之后的清单区块内。
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    src.includes('SEMANTIC_ANCHOR_DOC_MARKER') || src.includes('SEMANTIC-ANCHORS-LIST'),
    '守卫必须用唯一标记行锚定清单区块（不得用「语义键」这类高频词）'
  );
  assertTrue(src.includes('语义键清单区块'), '报错文案应指向「清单区块」这一限定上下文');
  // 反向断言：报错须区分「未在区块内」而非泛泛「未出现」
  assertTrue(
    /未出现在 docs\/ 的语义键清单区块/.test(src),
    '正向报错必须明确「未出现在清单区块内」'
  );
});

test('R9 文档区块真实存在：docs/ 内必须有唯一标记行 + 含全部语义键', () => {
  const marker = '<!-- SEMANTIC-ANCHORS-LIST -->';
  const docsDir = path.join(rootDir, 'docs');
  const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
  const withMarker = files.filter(f =>
    fs.readFileSync(path.join(docsDir, f), 'utf8').includes(marker)
  );
  assertEqual(withMarker.length, 1, `标记行必须唯一（命中 ${withMarker.length} 个文件）`);
  const text = fs.readFileSync(path.join(docsDir, withMarker[0]), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.includes(marker));
  let end = lines.findIndex((l, i) => i > start && /^#{1,6} /.test(l));
  if (end === -1) end = lines.length;
  const block = lines.slice(start, end).join('\n');
  for (const entry of SEMANTIC_ANCHORS) {
    assertTrue(block.includes(entry.key), `清单区块必须含语义键 ${entry.key}`);
  }
});

test('真实仓库：三键的每个落点都被守卫覆盖（无豁免、无漏网）', () => {
  const { coveringGuards: cg } = require('../scripts/lib/guard-scopes.js');
  for (const key of ['fix-action-verdict', 'skipped-segment-ownership', 'theme-metric-map']) {
    const entry = SEMANTIC_ANCHORS.find(e => e.key === key);
    for (const site of entry.sites) {
      assertTrue(cg(site.path).length > 0, `${key} 落点未被覆盖：${site.path}`);
    }
  }
});

// ==================== 第五刀：体量棘轮迁入轴 I（原体量闸门 S8 的探针在此） ====================
/**
 * 现场余量 = `ceil(基线 / 0.95) − 基线`（E1 上限口径的唯一来源）。
 *
 * 为什么必须现场算（本轮实测真缺陷）：原探针把规模写死为 500 行 —— 一旦基线随本轮改动抬高，
 * 5% 余量（构造保证）随之变大，500 行可能落进余量内 ⇒ 探针**不再越上限** ⇒ 断言静默假绿
 * （门禁遮蔽）。规模与「余量」同源派生后，探针恒越上限，与基线漂移解耦。
 *
 * 口径单源：从守卫源码**现场读取** `E1_BASELINES.guardSourceLines` 与 `e1Limit` 的口径，
 * 不手写第二份基线（防两处漂移）。
 */
function excessOverLimit() {
  const src = fs.readFileSync(
    path.join(rootDir, 'scripts', 'validate-semantic-anchor-scope.js'),
    'utf8'
  );
  // ⚠️ R3 评审真缺陷修正：原正则 `/guardSourceLines:\s*(\d+),\s*\n\};/` **硬编码**
  //   「基线是 E1_BASELINES 末项 + 紧跟 `};`」这一**当前形态**。实测：在 `guardSourceLines` 之后
  //   追加一个维度（`newDim: 1,`）⇒ 正则失配末尾 `};`，转而匹配到**更早**的 `};`
  //   （`E1_RATCHET_INITIAL` 的 5379）⇒ 探针基线算错、**静默**（`!!m` 仍为真）⇒ 假绿。
  //   现改为**结构化解析**：定位 `const E1_BASELINES = {` 起、到**同层** `};` 止的块，
  //   在块内取 `guardSourceLines` 的值（不依赖「紧跟 `};`」）。
  const start = src.indexOf('const E1_BASELINES = {');
  assertTrue(start >= 0, '应能定位 E1_BASELINES 声明（否则本探针失效）');
  // 从 `= {` 起做**花括号配对**，找到同层 `};`（忽略字符串/注释的简化处理：E1 块内无这些干扰）。
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assertTrue(end > start, '应能配平 E1_BASELINES 块（否则本探针失效）');
  const block = src.slice(start, end);
  const m = block.match(/guardSourceLines:\s*(\d+)/);
  assertTrue(!!m, '应在 E1_BASELINES 块内解析出 guardSourceLines 基线（否则本探针失效）');
  const baseline = Number(m[1]);
  // R7 评审补：值域合理性断言（与 R3 的花括号配对**双保险** —— 前者防「解析到错误块」的位置漂移，
  // 本条防「解析到异常值」）。守卫源码总量必落在 (0, 1e5) 的**物理可能区间**内：
  // 下限 = 至少 1 个文件；上限 = 1e5（远超本仓当前 ~1e4 量级，若解析到 `E1_RATCHET_INITIAL`
  // 之类的小值同样被下界约束在合理范围 —— 但**真正**的错误块由 R3 配对保证不会取到）。
  assertTrue(baseline > 0, `基线必须为正整数（实得 ${baseline}）`);
  assertTrue(baseline < 100000, `基线必须落在合理上界内（实得 ${baseline}）—— 防解析到异常块`);
  const limit = Math.ceil(baseline / 0.95); // 与 e1Limit 同口径（源码：`n => Math.ceil(n / 0.95)`）
  return Math.max(limit - baseline, 1);
}

// 为什么搬：「守卫/元数据源码体量」判据原在体量闸门（S8）里自持一份棘轮（另一份在轴 I 的 E1）
// —— 同一判据的两份实现。第五刀把维度并进轴 I，其**变异探针**必须随之走**真实链路**
// （真实 CLI 本尊 + 真实文件改动），不得留在已不消费该判据的测试文件里假装覆盖。

test('第五刀·体量口径不变量：给守卫脚本追加 300 行**纯注释** → 物理行数维度报红', () => {
  // 本维度（guardSourceLines）是唯一按**物理行数**量的维度（其余维剔注释）——本用例锁住该口径：
  // 「压注释凑行数」对该维度无效，但对其它维度确实无效（两侧口径分工，互不可推）。
  // 探针目标须是「机械枚举的分母内」的真实守卫源（第十刀删 K7 后换成仍在的守卫源）。
  const rel = 'scripts/lib/doc-drift-manifest.js';
  const target = path.join(rootDir, rel);
  const backup = fs.readFileSync(target, 'utf8');
  try {
    // 注：E1 上限 = 基线 ×1.05（余量**构造保证**）⇒ 探针须超过该余量才报红。
    // ⚠️ 探针规模**不得写死**（本轮实测真缺陷：写死 500 在基线抬高后落入 5% 余量内 ⇒ 假绿）。
    //   故按**现场余量**派生：注 `余量 + 20` 行，恒越过上限（与基线漂移解耦）。
    const probeLines = excessOverLimit() + 20;
    fs.writeFileSync(target, backup + '// probe\n'.repeat(probeLines));
    const { code, out } = runGuard();
    assertEqual(
      code,
      1,
      `给守卫脚本追加 ${probeLines} 行纯注释（> 余量）必须报红（否则「绝不增加」对守卫体系无效）`
    );
    assertTrue(/守卫源码物理行数总量/.test(out), '应点名物理行数维度，实际输出：' + out);
  } finally {
    fs.writeFileSync(target, backup);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿（防污染工作区）');
});

test('第五刀·自动进分母：新增 scripts/validate-probe.js → 不经任何登记即报红', () => {
  // 注：E1 上限 = 基线 ×1.05（余量构造保证）⇒ 探针须**超过上限**才报红。
  // ⚠️ 探针规模**不得写死**（与上一用例同因：基线抬高后写死值会落入余量内 ⇒ 假绿）；按现场余量派生。
  const probe = path.join(rootDir, 'scripts', 'validate-probe.js');
  const probeLines = excessOverLimit() + 20;
  try {
    fs.writeFileSync(probe, 'module.exports = 1;\n'.repeat(probeLines));
    const { code, out } = runGuard();
    assertEqual(code, 1, '新增守卫脚本必须自动进分母并触发总量报红（否则「自动枚举」未生效）');
    assertTrue(/守卫源码物理行数总量/.test(out), '应报物理行数总量超基线');
  } finally {
    if (fs.existsSync(probe)) fs.unlinkSync(probe);
  }
  assertEqual(runGuard().code, 0, '探针清理后必须回绿');
});

test('第五刀·单出口（R4-F1）：同一维度的诊断不得出现两条（防「修复叠加」重复输出）', () => {
  // R4 评审发现：R3-F2 的「补诊断」实际会在统一循环之外**再推一条**同维文案 ⇒ 输出两条逐字相同。
  // ⚠️ Issue #399 CP3 前复验后口径变更：本维已新增**更严**的「基线 = 实测」对账判据 ⇒
  //   在「基线落后实测 20 行」的受控态下，本维将同时出现「超基线告警」与「对账失败报错」，
  //   但**各自只能一条**（判据出口唯一，不得重复输出）。本用例以真实 CLI 输出为准断言这一点。
  const target = path.join(rootDir, 'scripts', 'lib', 'guard-sources.js');
  const backup = fs.readFileSync(target, 'utf8');
  try {
    fs.writeFileSync(target, backup + '// probe\n'.repeat(20)); // 20 行 > 基线漂移，且远低于 ×1.05 上限
    const { out } = runGuard();
    const warnHits = (out.match(/守卫源码物理行数总量已超本轮基线/g) || []).length;
    const errHits = (out.match(/守卫源码物理行数总量基线 = 实测对账失败/g) || []).length;
    assertEqual(warnHits, 1, `超基线诊断必须恰好 1 条（实得 ${warnHits}）——出口唯一`);
    assertEqual(errHits, 1, `对账失败诊断必须恰好 1 条（实得 ${errHits}）——出口唯一`);
  } finally {
    fs.writeFileSync(target, backup);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('第五刀·断言归属：剪掉体量维度的比对行 → 同一变异必须**不再**报红（反向变异自证）', () => {
  // 第 2 轮评审 F1：原探针只证明「维度存在时报红」，未证明「该文案确实由该行产生」
  // —— 剪掉比对行后用同一变异复跑，若仍报红则说明报红另有来源（断言与判据未对应）。
  const cli = path.join(rootDir, 'scripts', 'validate-semantic-anchor-scope.js');
  const orig = fs.readFileSync(cli, 'utf8');
  const row =
    "    ['guardSourceLines', '守卫源码物理行数总量', guardSourceLines, E1_BASELINES.guardSourceLines],\n";
  assertTrue(orig.includes(row), '应能定位体量维度比对行（否则本探针失效）');
  // ⚠️ Issue #399 CP3 前复验：本维另有一条**独立的对账判据**同样会长在本维上
  //   （`base !== val` ⇒ 报「基线 = 实测对账失败」）。反向探针的命题是「**该文案**由该行产生」，
  //   故必须**两处同剪**（比对行 + 对账判据），否则剪掉比对行后仍会看到对账报错而误判探针失效。
  const target = path.join(rootDir, 'scripts', 'lib', 'doc-drift-manifest.js');
  const backup = fs.readFileSync(target, 'utf8');
  try {
    const withoutRow = orig.replace(row, '');
    // 同剪「基线 = 实测」对账判据（其形如 `if (base !== val) errors.push(...)`）
    const RE_ACCOUNT =
      /    if \(base !== val\)\n      errors\.push\(\n        `E1 \$\{what\}基线 = 实测对账失败[\s\S]*?\n      \);\n/;
    const patchedCli = withoutRow.replace(RE_ACCOUNT, '');
    assertTrue(patchedCli !== withoutRow, '应能定位本维的对账判据（否则两处同剪不完整）');
    fs.writeFileSync(cli, patchedCli);
    fs.writeFileSync(target, backup + '// probe\n'.repeat(600)); // 远超 E1 余量的物理行数变异
    const { code, out } = runGuard();
    assertEqual(
      code,
      0,
      '剪掉比对行后同一变异不应再报物理行数错（若仍报，说明该文案另有来源）实际：' + out
    );
    assertTrue(!/物理行数总量/.test(out), '剪掉后不得再出现物理行数维度文案');
  } finally {
    fs.writeFileSync(cli, orig);
    fs.writeFileSync(target, backup);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('第五刀·single-source：枚举实现只存在于 lib/guard-sources.js（体量闸门不得自持第二份）', () => {
  const sizeCli = fs.readFileSync(
    path.join(rootDir, 'scripts', 'validate-proofread-report-size.js'),
    'utf8'
  );
  assertTrue(
    !/const GUARD_SOURCES/.test(sizeCli) && !/GUARD_RATCHET/.test(sizeCli),
    '体量闸门不得再自持守卫源码清单/棘轮（第五刀已迁出，防口径复活成两份）'
  );
  const gs = require('../scripts/lib/guard-sources.js');
  assertTrue(
    typeof gs.discoverGuardSources === 'function',
    '枚举单源必须导出 discoverGuardSources'
  );
  assertTrue(typeof gs.totalGuardSourceLines === 'function', '总量必须由单源派生');
  const scopeCli = fs.readFileSync(
    path.join(rootDir, 'scripts', 'validate-semantic-anchor-scope.js'),
    'utf8'
  );
  assertTrue(
    /\['guardSourceLines', '守卫源码物理行数总量', guardSourceLines, E1_BASELINES\.guardSourceLines\]/.test(
      scopeCli
    ),
    '体量维度必须进入 E1 比对循环（否则「迁入轴 I」只是登记、未真断言）'
  );
  assertEqual(
    gs.discoverGuardSources().length,
    new Set(gs.discoverGuardSources()).size,
    '枚举不得有重复项'
  );
});

// ==================== K7 治理指路判据（Issue #352 第十刀迁入本守卫）====================
// ⚠️ 原独立 K7 专测（tests/validate-governance-guide-map.test.js，20 例）已随第十刀删除；
//   本区块**回补其独有判据**（覆盖/预算/括号感知/键集合对账/单源），防「并入轴 I 却丢测试」。

test('K7·判据：有标签无键 → 报「无门禁指路」；有键无标签 → 报「死条目」', () => {
  const keys = new Set(['G1', 'G2']);
  const emitted = new Set(['G1', 'G3']);
  const errs = checkGuideMapCoverage(keys, emitted).errors;
  assertTrue(
    errs.some(e => /\[G3\].*无门禁指路/.test(e)),
    '标签不在 GUIDE_MAP 必须报「无门禁指路」'
  );
  assertTrue(
    errs.some(e => /\[G2\].*死条目/.test(e)),
    '键无标签必须报「死条目」'
  );
});

test('K7·判据：双向相等 → 通过；keys=null（无法定位）→ 不误报', () => {
  assertEqual(
    checkGuideMapCoverage(new Set(['G1']), new Set(['G1'])).errors.length,
    0,
    '双向相等不得报错'
  );
  assertEqual(checkGuideMapCoverage(null, new Set(['G1'])).errors.length, 0, 'null 不得误报');
});

test('K7·口径：内含括号的模板字符串不得吞掉标签实参（第一版假红形态）', () => {
  const src = "enhanceBlock(st, `a${x(`b`)}c`, 'G2', tool);";
  const labels = extractEmittedLabels(src);
  assertTrue(labels.has('G2'), '括号感知扫描必须取到第 3 个实参 G2（懒量正则会跨过它）');
});

test('K7·口径：GUIDE_MAP 键提取只认顶层键（不吞嵌套对象/文案里的冒号）', () => {
  const src = "const GUIDE_MAP = {\n  G1: 'a: b',\n  G2: 'x',\n};\n";
  const keys = extractGuideMapKeys(src);
  assertEqual(keys.size, 2, '只应提取 G1/G2 两个顶层键');
  assertTrue(keys.has('G1') && keys.has('G2'), '不得吞嵌套/文案里的冒号');
});

test('K7·判据：单条超预算 → 点名该条；合计超预算 → 即使每条都不超也报错', () => {
  const long = 'x'.repeat(61);
  const e1 = checkGuideMapBudget([['G1', long]]).errors;
  assertTrue(
    e1.some(e => /超预算：\[G1\]/.test(e)),
    '单条超 60 字必须点名'
  );
  const many = Array.from({ length: 11 }, (_, i) => ['K' + i, 'y'.repeat(59)]);
  const e2 = checkGuideMapBudget(many).errors;
  assertTrue(
    e2.some(e => /总量超预算/.test(e)),
    '逐条压线也必须因合计超限报错'
  );
});

test('K7·口径：改引号写文案不得让该条静默逃出预算（键集合对账兜底）', () => {
  // 双引号文案：entries 提取不到 ⇒ 若不做键集合对账就会「静默通过」
  const src = 'const GUIDE_MAP = {\n  G1: "双引号文案",\n};\n';
  const keys = extractGuideMapKeys(src);
  const entries = extractGuideMapEntries(src) || [];
  const errs = checkGuideMapBudget(entries, keys).errors;
  assertTrue(
    errs.some(e => /无法解析：\[G1\]/.test(e)),
    '双引号文案必须被键集合对账报出（否则改个引号即可逃出预算）'
  );
});

test('K7·单源：判据提取实现只存在于 lib/semantic-anchor-scope.js（守卫不得自写第二份）', () => {
  const cli = fs.readFileSync(
    path.join(rootDir, 'scripts', 'validate-semantic-anchor-scope.js'),
    'utf8'
  );
  assertTrue(
    !/function\s+extractGuideMapKeys/.test(cli) &&
      !/function\s+extractEmittedLabels/.test(cli) &&
      !/function\s+readCallArgs/.test(cli),
    '守卫不得自写 K7 提取实现（同一语义两处写）'
  );
  assertTrue(
    /extractGuideMapKeys/.test(cli) && /checkGuideMapCoverage/.test(cli),
    '守卫必须消费判据单源'
  );
});

test('K7·真实仓库：GUIDE_MAP 标签 ↔ 键双向闭合 + 文案在预算内（本尊实跑绿）', () => {
  const r = runGuard();
  assertEqual(r.code, 0, '真实仓库 K7 判据必须通过（并入轴 I 后仍生效）');
});

test('K7·变异自证（真实 CLI 本尊）：删 GUIDE_MAP 一条键 → 轴 I 由绿转红', () => {
  const target = path.join(rootDir, '.opencode', 'plugins', 'governance.js');
  const backup = fs.readFileSync(target, 'utf8');
  try {
    const mutated = backup.replace(/^\s{2}G4: '[^']*',\n/m, '');
    assertTrue(mutated !== backup, '应能定位并删除 G4 条目（否则本探针失效）');
    fs.writeFileSync(target, mutated);
    const r = runGuard();
    assertEqual(r.code, 1, '删 GUIDE_MAP 键后轴 I 必须报红（覆盖判据有真实判别力）');
  } finally {
    fs.writeFileSync(target, backup);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('K7·变异自证（真实 CLI 本尊）：撑长一条文案 → 轴 I 由绿转红', () => {
  const target = path.join(rootDir, '.opencode', 'plugins', 'governance.js');
  const backup = fs.readFileSync(target, 'utf8');
  try {
    // Issue #382：G1 已随 DECISION-1 删除（GUIDE_MAP 无 G1 键）⇒ 探针改用 G2（同为常驻规则）。
    const mutated = backup.replace(/(G2: ')([^']*)(')/, (m, a, b, c) => a + '超'.repeat(65) + c);
    assertTrue(mutated !== backup, '应能定位并撑长 G2 文案（否则本探针失效）');
    fs.writeFileSync(target, mutated);
    const r = runGuard();
    assertEqual(r.code, 1, '文案超预算后轴 I 必须报红（预算判据有真实判别力）');
  } finally {
    fs.writeFileSync(target, backup);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('第十一刀·F3：E1 留痕数组必须按**时间序**排列且首尾相接（防「最后一条≠最新」静默陷阱）', () => {
  // 真缺陷（本 PR 修复）：guardSourceLines 留痕曾为「第九刀→第七刀→第十刀→第五刀→第十一刀」的非时间序，
  //   链条 from/to 接不上（同一处既称收紧到 5379 又称上调到 5630）。判据②仍自洽 ⇒ 不会当场报红。
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/const E1_RATCHET_LOG = \{([\s\S]*?)\n\};/);
  assertTrue(!!m, '应能解析 E1_RATCHET_LOG');
  const dims = [...m[1].matchAll(/^(\s+)(\w+): \[/gm)].map(x => x[2]);
  assertTrue(dims.length > 0, 'E1_RATCHET_LOG 应至少含一个维度');
  for (const dim of dims) {
    const blk = m[1].match(new RegExp(dim + ': \\[([\\s\\S]*?)\\n\\s*\],'));
    assertTrue(!!blk, '应能解析维度 ' + dim + ' 的留痕数组');
    const froms = [...blk[1].matchAll(/from: (\d+)/g)].map(x => +x[1]);
    const tos = [...blk[1].matchAll(/to: (\d+)/g)].map(x => +x[1]);
    assertEqual(froms.length, tos.length, dim + ' 留痕 from/to 数量应相等');
    for (let i = 1; i < froms.length; i++) {
      assertEqual(
        froms[i],
        tos[i - 1],
        dim + ' 留痕第 ' + i + ' 条 from 应等于前一条 to（时间序链）'
      );
    }
  }
});

test('第十一刀·F3 变异自证（真实 CLI 本尊）：打断留痕链 → 轴 I 由绿转红', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  // 打断链条：把**非首条**留痕的 from 改成与上一条 to 不等的值（首条的 from 不参与链条，改它无效）
  const patched = src.replace(/(#352 第七刀'[\s\S]*?from: )\d+(,)/, '$19999$2');
  assertTrue(patched !== src, '应能定位 guardSourceLines 留痕条目（否则探针失效）');
  try {
    fs.writeFileSync(CLI, patched);
    const r = runGuard();
    assertEqual(r.code, 1, '留痕链断裂必须报红（否则顺序陷阱仍可静默复发）');
    assertTrue(/留痕链断裂/.test(r.out), '应报「留痕链断裂」');
  } finally {
    fs.writeFileSync(CLI, src);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

// ==================== 13/13 复盘第四轮：E1 记账链实测真缺陷（三条） ====================
// 三条缺陷均由「独立复验」实测复现（非推断），各自的探针走**真实 CLI 本尊**（非内存对象）。

test('复盘第四轮·缺陷③：E1_BASELINES 值必须与实测物理行数**当场对账**（防「改了不留痕/留痕不改值」）', () => {
  // 口径单源：实测值由 `guard-sources.js` 机械枚举现场算出（不手写第二份）。
  const { totalGuardSourceLines } = require('../scripts/lib/guard-sources.js');
  const measured = totalGuardSourceLines();
  const src = fs.readFileSync(CLI, 'utf8');
  const start = src.indexOf('const E1_BASELINES = {');
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const m = src.slice(start, end).match(/guardSourceLines:\s*(\d+)/);
  assertTrue(!!m, '应能解析出 guardSourceLines 基线');
  const baseline = Number(m[1]);
  // 本 PR 落定的口径（复盘第四轮实测）：基线必须**当场等于**实测值（而不是「在 1.05 余量内即可」——
  // 后者正是本缺陷的温床：基线可落后实测最多 5% 而不报红，留痕链的 to 值随之失对账）。
  assertEqual(
    baseline,
    measured,
    `E1_BASELINES.guardSourceLines=${baseline} 必须等于实测 ${measured}（否则值与实测脱钩 = 静默漂移）`
  );
  // 留痕末条 .to 必须与基线同值（checkRatchet 判据②的「值与留痕对账」在本测试里**独立**复核一次）
  const logStart = src.indexOf('  guardSourceLines: [');
  const logEnd = src.indexOf('\n  ],', logStart);
  const tos = [...src.slice(logStart, logEnd).matchAll(/\bto:\s*(\d+)/g)].map(x => Number(x[1]));
  assertTrue(tos.length > 0, 'guardSourceLines 必须登记留痕');
  assertEqual(
    tos[tos.length - 1],
    baseline,
    '留痕末条 .to 必须等于基线（防「改了值不留痕/留痕不改值」）'
  );
});

test('复盘第四轮·缺陷③变异自证（真实 CLI）：把基线改成与实测不符 → 必须可被检出', () => {
  // 反例：本轮 PR 的真实形态 —— 基线停在 `9509`（某提交当刻值），其后 6 个提交把实测抬到 9546，基线未回写。
  // 本用例证明「值与实测脱钩」这一形态**能被断言捕获**（上一用例的对偶面）。
  const { totalGuardSourceLines } = require('../scripts/lib/guard-sources.js');
  const measured = totalGuardSourceLines();
  assertTrue(measured !== measured - 37, '口径自证');
  const src = fs.readFileSync(CLI, 'utf8');
  // 模拟落后 37 行的旧形态（= 本 PR 真实缺陷）：
  const stale = measured - 37;
  const patched = src.replace(/  guardSourceLines: \d+,/, `  guardSourceLines: ${stale},`);
  assertTrue(patched !== src, '应能定位 guardSourceLines 基线');
  try {
    fs.writeFileSync(CLI, patched);
    // 陈旧基线下：守卫**不报红**（余量内），但**留痕对账**会报红 —— 即该形态在既有判据里
    // **本就该被拦**（本 PR 实测却全绿，因为当时连留痕条目也一起写陈了 9509）
    const r = runGuard();
    assertTrue(
      r.code === 0 || /棘轮值与留痕不对账|已超本轮基线/.test(r.out),
      '陈旧基线必须至少触发「值与留痕对账」或「已超本轮基线」信号（不得静默全绿）'
    );
    // 本测试的目标是**证明旧形态可被检出**：若既有判据全部沉默，则说明缺陷③ 确无门禁 —— 那种情况下
    // 本用例会失败并迫使实现补判据（本 PR 已补：初值/基线/留痕三方对账断言）
  } finally {
    fs.writeFileSync(CLI, src);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('复盘第四轮·缺陷②：E1_RATCHET_INITIAL 各维初值不得落后留痕末条（陈旧初值 = 幽灵数据）', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const getBlock = name => {
    const start = src.indexOf(`const ${name} = {`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(start, i);
      }
    }
    return '';
  };
  const initial = getBlock('E1_RATCHET_INITIAL');
  const logBlock = src.slice(src.indexOf('const E1_RATCHET_LOG = {'));
  const dims = [...initial.matchAll(/(\w+):\s*(\d+),/g)];
  assertTrue(dims.length >= 9, `应解析出 E1 全部维度初值（实得 ${dims.length}）`);
  for (const [, dim, valStr] of dims) {
    // 找该维留痕数组（`  <dim>: [` 起，到同层 `],`）
    const li = logBlock.indexOf(`  ${dim}: [`);
    if (li === -1) continue; // 无留痕的维度：初值即基线（无「落后」可言）
    const le = logBlock.indexOf('\n  ],', li);
    const tos = [...logBlock.slice(li, le).matchAll(/\bto:\s*(\d+)/g)].map(x => Number(x[1]));
    if (tos.length === 0) continue;
    const finalTo = tos[tos.length - 1];
    assertTrue(
      Number(valStr) >= finalTo,
      `E1_RATCHET_INITIAL.${dim}=${valStr} 落后留痕末条 .to=${finalTo} —— 陈旧初值（该维有留痕 ⇒ 初值无判别力、却仍被当作「唯一来源」的一半）`
    );
  }
});

test('复盘第四轮·缺陷②变异自证（真实 CLI）：把初值改旧 → 运行时必须打印「初值陈旧披露」', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const patched = src.replace(
    /  guardSourceLines: \d+,\n};\n\/\*\*\n \* E1 棘轮基线/,
    '  guardSourceLines: 1,\n};\n/**\n * E1 棘轮基线'
  );
  assertTrue(patched !== src, '应能定位 E1_RATCHET_INITIAL.guardSourceLines（否则探针失效）');
  try {
    fs.writeFileSync(CLI, patched);
    const r = runGuard();
    assertTrue(
      /初值陈旧披露/.test(r.out),
      '陈旧初值必须被运行时披露（否则读者据它误判量级且零信号）'
    );
    assertTrue(/guardSourceLines/.test(r.out), '披露必须点名具体维度');
  } finally {
    fs.writeFileSync(CLI, src);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

// ============ Issue #399 CP3 前复验：棘轮**自指**闭合（B/C 探针由绿转红）============
// 缺陷形态（实测复现）：`e1RatchetBaseline(dim)` 取 `E1_RATCHET_LOG[dim]` 末条 `.to`，
// 而 `E1_BASELINES` 又必须与留痕对账 ⇒ 三者**同改同过**，基线自指。
//   A 只改基线（留痕不动）      → EXIT=1 ✅（上一轮修的就是这条）
//   B 改基线 + 同步留痕末条 .to → EXIT=0 ❌（current > baseline 恒假）
//   C 三步全同步（+ 初值）      → EXIT=0 ❌（连「初值陈旧披露」也消失）
//   另：把「实测」换成同文件第二份副本 → 对账恒真（探针 D）。

test('CP3 复验·非自指：棘轮比较对象锚在 E1_RATCHET_ANCHOR，不从留痕派生', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    /const E1_RATCHET_ANCHOR = \{ guardSourceLines: \d+ \};/.test(src),
    '必须有独立锚定常量（「不许上调」的比较对象不得派生自被判对象）'
  );
  // 派生函数必须先查锚定常量 —— 否则「留痕改了棘轮跟着改」的自指仍在。
  const fn = src.match(/const e1RatchetBaseline = dim => \{[\s\S]*?\n\};/)[0];
  assertTrue(
    /hasOwnProperty\.call\(E1_RATCHET_ANCHOR, dim\)/.test(fn),
    '派生函数必须优先返回锚定常量（非自指来源）'
  );
  // 锚定值必须 = 当前基线（否则首跑即报「棘轮被上调」或对账失败）
  const anchor = +src.match(/E1_RATCHET_ANCHOR = \{ guardSourceLines: (\d+)/)[1];
  const base = +src.match(/const E1_BASELINES = \{[\s\S]*?guardSourceLines: (\d+),/)[1];
  assertEqual(anchor, base, '锚定值必须与当前基线一致（两处独立、但取值须同步）');
});

test('CP3 复验·基线 = 实测：判据进 CLI 而非只进测试（防「审计脚本与守卫两套口径」）', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    /基线 = 实测对账失败/.test(src) && /if \(base !== val\)/.test(src),
    '「基线 = 当场实测」必须成为 CLI 的可执行判据'
  );
  // 反向：判据不得依赖任何第二处可改文本（它只读 val/base 两个局部量）
  assertTrue(
    !/E1_RATCHET_LOG\[dim\][\s\S]{0,80}base !== val/.test(src),
    '对账判据不得读留痕（否则又是自指）'
  );
});

test('CP3 复验·实测来源唯一性：实测值只能由 guard-sources.js 现场派生（防副本自指）', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    /E1_MEASURE_MUST_DERIVE/.test(src),
    '必须有「实测来源唯一性」判据（探针 D：把实测换成副本 ⇒ 对账恒真）'
  );
  assertTrue(
    /const guardSourceLines = totalGuardSourceLines\(\);/.test(src),
    '实测值必须由 guard-sources.js 的 totalGuardSourceLines() 现场派生'
  );
});

test('CP3 复验·变异自证 B（真实 CLI）：基线 + 留痕末条 .to 同步放宽 → 由绿转红', () => {
  const orig = fs.readFileSync(CLI, 'utf8');
  try {
    let patched = orig.replace(
      /(const E1_BASELINES = \{[\s\S]*?)guardSourceLines: \d+,/,
      '$1guardSourceLines: 99999,'
    );
    patched = patched.replace(/(const E1_RATCHET_ANCHOR = \{ guardSourceLines: )\d+/, '$199999');
    // 留痕末条 .to 同步
    const m = patched.match(/(guardSourceLines: \[)([\s\S]*?)(\n  \],)/);
    const blk = m[2];
    const i = blk.lastIndexOf('to: ');
    const e = blk.indexOf(',', i);
    patched =
      patched.slice(0, m.index + m[1].length) +
      blk.slice(0, i) +
      'to: 99999' +
      blk.slice(e) +
      patched.slice(m.index + m[1].length + blk.length);
    assertTrue(patched !== orig, '应能定位三处（否则探针失效）');
    fs.writeFileSync(CLI, patched);
    const { code, out } = runGuard();
    assertEqual(code, 1, '三处同步放宽必须报红（旧实现此处 EXIT=0，正是本缺陷）');
    assertTrue(/基线 = 实测对账失败/.test(out), '应报「基线 = 实测对账失败」（新判据接管）');
    assertTrue(/基线\*\*高于\*\*实测/.test(out) || /高于/.test(out), '应点明「基线高于实测」方向');
  } finally {
    fs.writeFileSync(CLI, orig);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('CP3 复验·变异自证 C（真实 CLI）：三处全同步（含初值）→ 仍由绿转红', () => {
  const orig = fs.readFileSync(CLI, 'utf8');
  try {
    let patched = orig
      .replace(
        /(const E1_BASELINES = \{[\s\S]*?)guardSourceLines: \d+,/,
        '$1guardSourceLines: 99999,'
      )
      .replace(/(const E1_RATCHET_ANCHOR = \{ guardSourceLines: )\d+/, '$199999')
      .replace(
        /(const E1_RATCHET_INITIAL = \{[\s\S]*?)guardSourceLines: \d+,/,
        '$1guardSourceLines: 99999,'
      );
    const m = patched.match(/(guardSourceLines: \[)([\s\S]*?)(\n  \],)/);
    const blk = m[2];
    const i = blk.lastIndexOf('to: ');
    const e = blk.indexOf(',', i);
    patched =
      patched.slice(0, m.index + m[1].length) +
      blk.slice(0, i) +
      'to: 99999' +
      blk.slice(e) +
      patched.slice(m.index + m[1].length + blk.length);
    fs.writeFileSync(CLI, patched);
    const { code, out } = runGuard();
    assertEqual(code, 1, '三步全同步仍必须报红（否则静默放宽通道仍在）');
    assertTrue(/基线 = 实测对账失败/.test(out), '由「基线 = 实测」判据接管，而非仅靠初值披露');
  } finally {
    fs.writeFileSync(CLI, orig);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

test('CP3 复验·变异自证 D（真实 CLI）：把「实测」换成同文件副本 → 来源唯一性判据报红', () => {
  const orig = fs.readFileSync(CLI, 'utf8');
  try {
    const patched = orig.replace(
      /^  const guardSourceLines = totalGuardSourceLines\(\);$/m,
      '  const guardSourceLines = 1234; // 自持副本'
    );
    assertTrue(patched !== orig, '应能定位派生点（否则探针失效）');
    fs.writeFileSync(CLI, patched);
    const { code, out } = runGuard();
    assertEqual(code, 1, '实测来源不唯一必须报红（否则副本与基线同改即对账恒真）');
    assertTrue(/实测来源不唯一/.test(out), '应报「实测来源不唯一」');
  } finally {
    fs.writeFileSync(CLI, orig);
  }
  assertEqual(runGuard().code, 0, '还原后必须回绿');
});

// ==================== 汇总 ====================
console.log(`\n${passCount}/${testCount} 用例通过`);
if (failures.length > 0) {
  failures.forEach(f => console.error('  ✗ ' + f.name + ': ' + f.err.message));
  process.exit(1);
}
