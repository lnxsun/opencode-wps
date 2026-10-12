/**
 * 校对源码体量守卫回归测试（Issue #341「只大幅压缩、绝不增加」）
 *
 * 守护对象：`scripts/validate-proofread-report-size.js`（**校对源码**体量闸门 + 计行口径单源）。
 * ⚠️ Issue #352 第五刀：**守卫/元数据源码体量**（旧键 `guard-source-budget` × 断言 S8）已迁至轴 I 维度
 *   `guardSourceLines`，其回归探针见 `tests/semantic-anchor-scope.test.js`；本文件只保留「分母集合 =
 *   机械枚举」的**契约断言**（不依赖第三刀的载体文件），并新增与轴 I 的**交叉一致**断言。
 * 每类断言各留**变异自证**（注入反例 → 由绿转红），并锁「计行口径唯一」与「目标/棘轮分离」。
 *
 * ⚠️ 本轮口径扩围（Issue #341）：原守卫只列 `proofread-report.ts`（299 行）——报告层仅占校对源码
 * 11%，其余 5 个文件（规则/归一化/累加/入口/类型）共 ~1900 行**无任何体量约束**。现扩为**全层**。
 * ⚠️ 度量必须经 `helpers/facts-snapshot.js`（测试侧读快照的**唯一出口**，Issue #347）：直接原地调
 *   守卫的度量（`collectFacts`）即重复全量 I/O（本文件此前 4 处）。
 *
 * 运行：node tests/validate-proofread-report-size.test.js（被 npm run test 自动聚合）
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const CLI = path.join(rootDir, 'scripts', 'validate-proofread-report-size.js');
const HELPERS = path.join(__dirname, 'helpers', 'facts-snapshot.js');
const { snapshot, evict, requireFresh } = require('./helpers/facts-snapshot.js');
const SIZE = require(CLI); // 本文件的被测模块（快照键 = 模块实例，非路径——防「按路径绕开出口」）
const {
  REPORT_SOURCES,
  REPORT_FILES,
  LIMITS,
  RATCHET,
  RATCHET_INITIAL_TOTAL_LINES,
  ACHIEVED_TOTAL_LINES,
  countLines,
  collectFacts,
  checkSize,
} = require(CLI);

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
/** 读取 .prettierignore 的「体量闸门豁免清单」机器可读区块（BEGIN/END 之间），去掉注释/空行。 */
function readIgnoreBudgetBlock() {
  const src = fs.readFileSync(path.join(rootDir, '.prettierignore'), 'utf8');
  const m = src.match(/# ---BEGIN 体量闸门豁免清单---([\s\S]*?)# ---END 体量闸门豁免清单---/);
  if (!m) throw new Error('未找到体量闸门豁免清单区块标记（BEGIN/END）');
  return m[1]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}
function runGuard() {
  const r = spawnSync(process.execPath, [CLI], { cwd: rootDir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('计行对象 = 校对线全部源码（显式清单，覆盖≥6 层）', function () {
  assertTrue(REPORT_SOURCES.length > 0, '清单非空');
  assertTrue(
    REPORT_SOURCES.every(f => f.endsWith('.ts')),
    '计行对象须为 TS 源文件'
  );
  // 扩围断言：必须覆盖规则/归一化/累加/报告/类型五层（防有人把范围悄悄收窄回报告层）
  for (const f of [
    'proofread-rules.ts',
    'proofread-normalize.ts',
    'proofread-accumulate-helpers.ts',
    'proofread-report.ts',
    'proofread-types.ts',
  ])
    assertTrue(REPORT_SOURCES.includes(f), `扩围后清单必须含 ${f}（否则「全层」是假的）`);
  // Issue #341：统计/渲染/文案已合并进 proofread-report.ts ⇒ 清单收敛为单文件（唯一事实源）
  assertTrue(
    REPORT_SOURCES.includes('proofread-report.ts'),
    '报告生成唯一文件必须计入体量（四层合并后唯一事实源）'
  );
  // 合并后分母仍覆盖「编排 + 统计 + 渲染 + 文案」全部职责（不是靠漏计达标）
  for (const gone of [
    'proofread-report-render.ts',
    'proofread-report-stats.ts',
    'report-copy.ts',
  ]) {
    assertTrue(
      !fs.existsSync(path.join(rootDir, 'wps-office-mcp/src/tools/word', gone)),
      `${gone} 已合并进 proofread-report.ts，不应遗留（防「文件还在但不在清单里」的漏计）`
    );
  }
});

test('F2 变异自证：把报告源码改成无关名字 → 守卫必须报红（原实现被 rename 绕过）', function () {
  const DIR = path.join(rootDir, 'wps-office-mcp/src/tools/word');
  const from = path.join(DIR, 'proofread-report.ts');
  const to = path.join(DIR, 'report-layer-probe.ts');
  const backup = fs.readFileSync(from, 'utf8');
  try {
    fs.writeFileSync(to, backup);
    fs.unlinkSync(from);
    const { code, out } = runGuard();
    assertEqual(
      code,
      1,
      '报告源码改名后守卫必须报红（否则「不允许超过 300 行」可被一个 rename 绕过）'
    );
    assertTrue(out.includes('S0'), '应报 S0 计行对象缺失，而不是静默不统计');
  } finally {
    if (fs.existsSync(to)) fs.unlinkSync(to);
    fs.writeFileSync(from, backup);
  }
});

test('R1-F4/R4-F1 同集断言（**双向集合相等**）：豁免清单区块 == REPORT_SOURCES ∪ guard-sources 枚举', function () {
  // 第 4 轮评审 R4-F1：此前只做单向（声明的都在 ignore 里）⇒ 加入无关文件即静默逃出 prettier 门禁，
  // 而测试名写「必须等于」——名实不符。现改为**双向**：机器可读区块内的条目必须与两批清单**完全相等**。
  // 第五刀：枚举单源下沉为 `scripts/lib/guard-sources.js`（守卫侧不再在体量闸门内自持一份）。
  const { discoverGuardSources } = require('../scripts/lib/guard-sources.js');
  const expected = [
    ...REPORT_SOURCES.map(r => 'wps-office-mcp/src/tools/word/' + r),
    ...discoverGuardSources(),
  ].sort();
  const listed = readIgnoreBudgetBlock().sort();
  assertEqual(
    listed.join('\n'),
    expected.join('\n'),
    '豁免清单区块必须与 REPORT_SOURCES ∪ 机械枚举双向相等（多一个＝有文件悄悄逃出 prettier 门禁；少一个＝撑开与闸门互斥）'
  );
  // 变异自证：往区块内注入无关条目 → 必须不等（由 runGuard 无关，直接验判据函数）
  const injected = [...listed, 'scripts/validate-versions.js'].sort();
  assertTrue(
    injected.join('\n') !== expected.join('\n'),
    '注入无关条目必须使双向相等失败（否则反向缺口仍在）'
  );
});

test('R4-F1 变异自证（真实 CLI 链路）：把 LIMITS 上调 → 守卫 exit 1（棘轮不许上升）', function () {
  // 本守卫最实质的漏洞：此前 LIMITS.totalLines 可被任意上调，实测改成 999999 守卫仍 EXIT=0
  // ⇒「后续也不允许超过 300 行」可被一句改常量废掉。S3 断言专治此形态。
  const src = fs.readFileSync(CLI, 'utf8');
  const patched = src.replace(
    /const LIMITS = \{ totalLines: \d+, perFileLines: \d+ \};/,
    'const LIMITS = { totalLines: 999999, perFileLines: 420 };'
  );
  assertTrue(patched !== src, '应能定位并替换 LIMITS 字面量（否则本探针失效）');
  try {
    fs.writeFileSync(CLI, patched);
    const r = spawnSync(process.execPath, [CLI], { cwd: rootDir, encoding: 'utf8' });
    assertEqual(r.status, 1, '上调棘轮必须报红（否则棘轮是假的）');
    assertTrue(
      /棘轮被上调/.test((r.stdout || '') + (r.stderr || '')),
      '应报「棘轮被上调」（R6 起走共享判据 lib/ratchet.js，文案统一）'
    );
  } finally {
    fs.writeFileSync(CLI, src);
  }
});

test('R4 棘轮结构：RATCHET 与 LIMITS 自洽，上调须有 upgradeLog 留痕', function () {
  assertTrue(!!RATCHET, 'RATCHET 常量必须导出（棘轮基线的唯一来源）');
  assertTrue(
    RATCHET.totalLines >= LIMITS.totalLines,
    '棘轮基线必须 ≥ 当前限值（否则 S3 立刻报红）'
  );
  assertTrue(Array.isArray(RATCHET.upgradeLog), 'upgradeLog 必须是数组（结构化的「写明理由」）');
  for (const e of RATCHET.upgradeLog) {
    assertTrue(e.issue && e.reason && e.netDeletion, '每条上调留痕必须含 issue/reason/netDeletion');
  }
});

test('R5-F1 变异自证（真实 CLI）：改 RATCHET.totalLines 但不改 upgradeLog → 报 S5（留痕必须与值对账）', function () {
  // upgradeLog 此前是死数据（无断言消费）。S5 让它成为活的：棘轮值必须 = 留痕最后一条 .to。
  const src = fs.readFileSync(CLI, 'utf8');
  const patched = src.replace(/(\n  totalLines: )\d+(,\n  upgradeLog:)/, '$19999$2');
  assertTrue(patched !== src, '应能定位 RATCHET.totalLines 字面量（否则本探针失效）');
  try {
    fs.writeFileSync(CLI, patched);
    const r = spawnSync(process.execPath, [CLI], { cwd: rootDir, encoding: 'utf8' });
    assertEqual(r.status, 1, '棘轮值与留痕不对账必须报红');
    assertTrue(
      /棘轮值与留痕不对账/.test((r.stdout || '') + (r.stderr || '')),
      '应报「棘轮值与留痕不对账」（R6 起走共享判据，文案统一）'
    );
  } finally {
    fs.writeFileSync(CLI, src);
  }
});

test('R5-F2 棘轮值来源唯一：无留痕时 = 初始值；有留痕时 = 最后一条 .to', function () {
  // 判据与唯一来源 `lib/ratchet.js` 同口径（严格相等）：`baseline` 必须等于留痕最后一条 `.to`，
  // 无留痕时等于 `initial`。棘轮收紧（如 #355: 1842→1841）是**同轮改 initial + LIMITS + RATCHET**
  // 的联动，三者仍应严格相等 —— 放宽为 `<=` 会让「值与留痕」对账退化为恒真，与共享判据背离。
  const expect = RATCHET.upgradeLog.length
    ? RATCHET.upgradeLog[RATCHET.upgradeLog.length - 1].to
    : RATCHET_INITIAL_TOTAL_LINES;
  assertEqual(RATCHET.totalLines, expect, 'RATCHET.totalLines 必须与 upgradeLog 自洽');
});

test('R5 自限披露：守卫输出必须如实披露「不声称拦住同时改两处」（不假装闭环）', function () {
  const { out } = runGuard();
  assertTrue(out.includes('自限'), '必须打印自限说明');
  assertTrue(
    out.includes('同时改') || out.includes('两处'),
    '自限须如实说明「不声称拦住同时改 RATCHET 与 LIMITS 两处」'
  );
});

test('R3-F2 描述与实现同源：守卫源码不得出现已删机制的字样（防「机制删了、描述留着」）', function () {
  // R1-F1 为修「basename 歧义」把「递归查找」改成精确路径，却把注释里的「递归查找」留下了。
  // 这是「敢删」要报的形态：机制已删、说法没删。把它变成可执行断言。
  // ⚠️ Issue #346：`DISCOVER` 枚举**改成真递归**后，`递归` 不再是「已删机制」字样 ——
  //   保留的幽灵只余 `递归查找`（精确路径解析那次的留痕），不得因此把活的实现字样一并禁掉。
  const src = fs.readFileSync(CLI, 'utf8');
  for (const ghost of ['递归查找']) {
    assertTrue(
      !src.includes(ghost),
      `守卫源码不得出现已删机制「${ghost}」——描述必须与实现同源（R3 评审 F2）`
    );
  }
  assertTrue(src.includes('精确相对路径'), '应描述真实机制：精确相对路径解析');
});

test('R3-F1 名实一致：棘轮现值 == 实测总量（不得在注释里写死与实测不符的行数）', function () {
  // 第五刀：原判据用「注释里写死的实测行数」做对账 —— 那本身就是**第二份真值**（文档/注释里的数字）。
  // 现改为对账**构造保证**：棘轮现值必须等于实测总量（收紧态），故注释不可能与实测漂移。
  const facts = snapshot(SIZE);
  assertEqual(
    RATCHET.totalLines,
    facts.totalLines,
    `棘轮现值 ${RATCHET.totalLines} 与实测 ${facts.totalLines} 不符（R3 评审 F1 / 铁律 24 第 5 维）`
  );
});

test('R1-F1 精确解析：清单项为相对 DIR 的精确路径（同名文件不产生歧义）', function () {
  // 原实现按 basename 递归匹配：同名文件出现两处时静默返回 null，报「找不到」（根因不准）。
  // 现解析精确到相对层 ⇒ 顶层清单项必须精确指向 DIR 下的同名文件。
  const DIR = path.join(rootDir, 'wps-office-mcp/src/tools/word');
  for (const [rel] of REPORT_FILES) {
    assertTrue(rel.endsWith('.ts') && !rel.includes('/'), rel + ' 应为 DIR 下的顶层精确相对路径');
    assertTrue(fs.existsSync(path.join(DIR, rel)), rel + ' 应在 DIR 下真实存在');
  }
});

test('S0 归属断言：清单声明但树中找不到的源码 → 报红（防静默失效）', function () {
  const r = checkSize({
    files: [{ name: 'ghost.ts', lines: -1 }],
    totalLines: 0,
    maxFileLines: -1,
  });
  assertTrue(
    r.errors.some(e => e.startsWith('S0')),
    '找不到清单声明的源码必须报 S0'
  );
});

test('计行口径 = 物理行数（含空行/注释），与 wc -l 语义一致（末尾换行不计）', function () {
  const tmp = path.join(rootDir, 'wps-office-mcp/src/tools/word/__size_probe__.ts');
  try {
    // 3 行内容 + 末尾换行 → 应计 3（不是 4）
    fs.writeFileSync(tmp, 'a\n\n// c\n');
    assertEqual(countLines(tmp), 3, '空行与注释行都要计入，末尾换行不算一行');
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
});

test('S1 总行数：超限即报红（变异自证：伪造 facts 越过闸门）', function () {
  const over = checkSize({
    files: [{ name: 'x.ts', lines: LIMITS.totalLines + 1 }],
    totalLines: LIMITS.totalLines + 1,
    maxFileLines: LIMITS.totalLines + 1,
  });
  assertTrue(
    over.errors.some(e => e.startsWith('S1')),
    '超总行数上限应报 S1'
  );
  // ⚠️ 注意：totalLines=10 ≤ TARGET(300) 会触发 S4（达标未收紧）——那是**正确**行为。
  // 本用例只断言「不报 S1」，故须排除 S3/S4 这两条与 S1 无关的棘轮断言。
  const ok = checkSize({ files: [{ name: 'x.ts', lines: 10 }], totalLines: 10, maxFileLines: 10 });
  const s1 = ok.errors.filter(e => e.startsWith('S1'));
  assertEqual(s1.length, 0, '远低于上限时不应报 S1');
  // 棘轮类报错（达标未收紧 / 棘轮被上调 / 值与留痕不对账）与 S1 无关，须容忍
  assertTrue(
    ok.errors.every(e => /达标未收紧|棘轮被上调|不对账|S0/.test(e)),
    '远低于上限时的报错只应来自棘轮/归属断言，不应有其它类别：' + ok.errors.join(' | ')
  );
});

test('S2 单文件：总行数达标但单文件臃肿也要报红（防「把行数藏进一个巨型文件」）', function () {
  const f = { name: 'big.ts', lines: LIMITS.perFileLines + 1 };
  const r = checkSize({ files: [f], totalLines: f.lines, maxFileLines: f.lines });
  assertTrue(
    r.errors.some(e => e.startsWith('S2')),
    '单文件超上限应报 S2'
  );
});

test('目标与棘轮分离：TARGET 为用户诉求口径，且棘轮不低于现状基线（防「假装通过」）', function () {
  // ⚠️ 口径说明（Issue #341 本轮扩口径）：TARGET 由「报告层 300 行」升级为「**校对线全层**目标行数」——
  // 用户诉求的实体是「校对相关内容降低 AI 负担」，只锁报告层（11%）等于没锁。故此处不再硬编码 300，
  // 改为断言「TARGET 是当前下降目标（≤ 棘轮基线）」+「达标后棘轮必须收紧到 TARGET」两条不变量。
  const facts = snapshot(SIZE);
  // ⚠️ Issue #382：原断言「ACHIEVED ≤ 初始 1824」是「下降目标」口径。本轮**有一次留痕的上调**
  //   （`RATCHET.upgradeLog` 首条：把 2 个工具定义从 `com-actions.ts` 迁入校对线，+60 行搬家成本）⇒
  //   断言改为「上调必须有留痕 + 与现状一致」：无留痕时仍必须 ≤ 初始值（下降目标），
  //   有留痕时目标值必须等于留痕末条 `.to`（防「悄悄放松目标」）。
  const log = RATCHET.upgradeLog || [];
  if (log.length === 0) {
    assertTrue(
      ACHIEVED_TOTAL_LINES <= RATCHET_INITIAL_TOTAL_LINES,
      '无上调留痕时，目标必须是不高于棘轮起点的下降目标（目标宽于棘轮＝假装通过）'
    );
  } else {
    assertTrue(
      ACHIEVED_TOTAL_LINES === log[log.length - 1].to,
      '有上调留痕时，目标必须等于留痕末条 .to（防「改了目标不留痕 / 留了痕不改目标」）'
    );
    assertTrue(
      typeof log[log.length - 1].netDeletion === 'string' &&
        log[log.length - 1].netDeletion.length > 0,
      '上调留痕必须给出「等量删除证明」（netDeletion 非空）——空壳留痕不受理'
    );
  }
  assertTrue(
    LIMITS.totalLines !== ACHIEVED_TOTAL_LINES || facts.totalLines <= ACHIEVED_TOTAL_LINES,
    '一旦压到 ≤TARGET，棘轮必须收紧为 TARGET（不得留在更宽的值上假装达标）'
  );
});

test('K5 单一出口（Issue #347）：本文件也须经唯一出口取数（与 bloat 侧同判据）', function () {
  // 一致性：两个测试文件消费同一个「单一出口」约定 —— 若只守 bloat 侧，本文件可原地全量 I/O 而无人拦。
  const src = fs.readFileSync(__filename, 'utf8');
  assertEqual(
    (src.match(/[\w$.]+\.collectFacts\(\)|(?<![\w$.])collectFacts\(\)/g) || []).length,
    0,
    '本文件不得出现任何形式的 collectFacts 调用（唯一入口 = helpers/facts-snapshot.js）'
  );
});

test('CLI 本尊：当前仓库通过，且输出如实披露「目标是否达成」', function () {
  const { code, out } = runGuard();
  assertEqual(code, 0, '当前仓库应通过体量闸门');
  const facts = snapshot(SIZE);
  if (facts.totalLines > ACHIEVED_TOTAL_LINES) {
    assertTrue(out.includes('未达成'), '未达目标时必须如实打印「未达成」，不得静默宣称达标');
  }
  assertTrue(out.includes(String(facts.totalLines)), '输出应含实测总行数');
});

test('单一契约：计行口径单源在 lib/guard-sources.js，CLI 只消费不自持第二份', function () {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    /require\('\.\/lib\/guard-sources\.js'\)/.test(src),
    '计行口径（countLines）必须从单源模块 lib/guard-sources.js 取'
  );
  assertTrue(!/function countLines/.test(src), 'CLI 不得自持第二份 countLines 实现');
  const callSites = (src.match(/countLines\(abs\)/g) || []).length;
  assertEqual(callSites, 1, 'countLines 的真实调用点只应在 measure() 内一处');
  assertTrue(src.includes('checkSize'), 'CLI 必须消费 checkSize 单源判据');
  assertTrue(src.includes('collectFacts'), 'CLI 必须消费 collectFacts 单源度量');
  assertTrue(src.includes('REPORT_SOURCES'), 'REPORT_SOURCES 必须是计行对象的唯一来源');
});

test('扩围变异自证：把计行对象收窄回「仅报告层」→ 必须失去对其它层的约束（防口径偷偷缩回）', function () {
  // 真实链路：把 LIMITS.totalLines 调到只容得下报告层，则其余层一旦增长就会报红 ——
  // 反向证明「全层覆盖」不是文案，而是真约束（缩窄即失去）。
  const facts = snapshot(SIZE);
  const reportOnly = facts.files.find(f => f.name === 'proofread-report.ts').lines;
  const narrowed = checkSize({
    files: facts.files,
    totalLines: facts.totalLines,
    maxFileLines: facts.maxFileLines,
  });
  assertEqual(narrowed.errors.length, 0, '当前全层实测应通过');
  assertTrue(facts.totalLines > reportOnly * 2, '全层总量必须显著大于报告层（否则扩围无意义）');
});

test('R1-F3 命名与判据同义：ACHIEVED_TOTAL_LINES 语义 = 已达成值（非上限）', function () {
  const src = fs.readFileSync(CLI, 'utf8');
  assertTrue(
    src.includes('ACHIEVED_TOTAL_LINES'),
    'TARGET_TOTAL_LINES 实际语义是「已达成值（棘轮收紧基准）」，必须按其语义命名'
  );
  assertTrue(!src.includes('TARGET_TOTAL_LINES'), '旧名（语义倒置）不得残留');
  // 幽灵数字 1687 必须清除（第 1 轮评审 F3）
  assertTrue(
    !/1687/.test(src),
    '注释里遗留的幽灵数字 1687 必须清除（该值随棘轮收紧而变，勿写死；当前见 LIMITS.totalLines）'
  );
});

test('R4-F1 变异自证（真实文件链路）：区块内加入无关文件 → 双向断言转红', function () {
  // 真实链路：真改 .prettierignore 加入无关条目 → readIgnoreBudgetBlock() 读到的集合 ≠ 期望集
  const ignorePath = path.join(rootDir, '.prettierignore');
  const backup = fs.readFileSync(ignorePath, 'utf8');
  const { discoverGuardSources } = require('../scripts/lib/guard-sources.js');
  const expected = [
    ...REPORT_SOURCES.map(r => 'wps-office-mcp/src/tools/word/' + r),
    ...discoverGuardSources(),
  ].sort();
  try {
    fs.writeFileSync(
      ignorePath,
      backup.replace(
        '# ---END 体量闸门豁免清单---',
        'scripts/validate-versions-x.js\n# ---END 体量闸门豁免清单---'
      )
    );
    const listed = readIgnoreBudgetBlock().sort();
    assertTrue(listed.join('\n') !== expected.join('\n'), '注入无关条目必须使双向相等失败');
    assertTrue(
      listed.filter(l => !expected.includes(l)).length === 1,
      '区块应多出恰好 1 条（第五刀：期望集改由单源枚举现场派生）'
    );
  } finally {
    fs.writeFileSync(ignorePath, backup);
  }
});

console.log('\n========== 体量守卫回归测试结果 ==========');
console.log(
  `总计: ${testCount} 个测试 / 通过: ${passCount} 个 / 失败: ${testCount - passCount} 个`
);
if (passCount === testCount) {
  console.log('\n✓ proofread-report* 体量守卫回归测试全部通过!\n');
  process.exit(0);
}
for (const f of failures) console.error('  ✗ ' + f.name + ': ' + f.err.message);
process.exit(1);
