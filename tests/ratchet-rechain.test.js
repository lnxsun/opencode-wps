/**
 * E1 棘轮**重链**专测（Issue #408）
 *
 * 背景：E1 留痕是 append-only 链（每条 `from == 上一条 to`）。两个并发「加守卫」PR 各自 append 时，
 * git 合并落在同一数组 ⇒ 需人工拼接（保留两侧 / 改 `from` / 末条 `to` 回写实测）。
 * 本轮手工拼接漏写一个 `},`（两对象粘连）⇒ 轴 I 报「留痕链断裂」（**判据有效**），
 * 但**拼接动作**仍是手工、按次数线性增长 ⇒ 属流程自动化缺口。
 *
 * 本文件给 `npm run ratchet:rechain` 建独立执行者，并做**变异自证**：
 *   ① 原状（并发两条留痕、链断裂）→ 轴 I EXIT≠0；
 *   ② 重链后 → 轴 I EXIT=0；
 *   ③ 重链**不擅自抬高天花板**（无 `--issue/--reason` 时对该维**拒绝**）。
 *
 * 运行：node tests/ratchet-rechain.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const CLI = path.join(rootDir, 'scripts', 'ratchet-rechain.js');
const SCOPE = path.join(rootDir, 'scripts', 'validate-semantic-anchor-scope.js');
const RECHAIN_LIB = path.join(rootDir, 'scripts', 'lib', 'ratchet-rechain.js');
const METRICS_LIB = path.join(rootDir, 'scripts', 'lib', 'e1-metrics.js');
const { planRechain, checkAppendedEntry } = require(RECHAIN_LIB);

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
  if (a !== b)
    throw new Error(
      (m || 'not equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)
    );
}
/**
 * 跑**真实**轴 I（本尊）：`node scripts/validate-semantic-anchor-scope.js`。
 *
 * ⚠️ 为什么不再用「`scripts/` 内的探针副本」：本 Issue 把枚举面扩到 `scripts/validate-*.js`
 *   与 `scripts/ratchet-*.js` 后，**探针副本自身会进 `guardSourceLines` 分母** ⇒ 它一存在，
 *   物理行数总量就偏大，可能**因体量**报红而非因被测判据 —— 于是「变异后报红」的断言可能
 *   被**假红**满足（方向 1 的探针自证失效：「还原后必须回绿」也会被它拖红）。
 *   故本文件的红/绿判定一律**跑本尊**（探针只用于「纯函数单测」，那部分根本不落盘）。
 */
function runRealScope() {
  const r = spawnSync(process.execPath, [SCOPE], { cwd: rootDir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/** 在**本尊文件**上跑给定文本（写入 → 跑 → 由调用方负责还原）。 */
function runScopeOn(text) {
  fs.writeFileSync(SCOPE, text);
  return runRealScope();
}

const basePlan = extra => ({
  dims: [{ dim: 'd', measured: 100 }],
  logs: { d: [{ issue: '#1', reason: 'r', from: 1, to: 100 }] },
  initial: { d: 1 },
  baselines: { d: 100 },
  ...extra,
});

// ── ① 补齐算术：from_i ← to_{i-1} ─────────────────────────────
test('① 并发两条留痕（链断裂）→ 计划给出 stitch，且目标值 = 前一条 to', () => {
  const plan = planRechain(
    basePlan({
      // 两侧各 append 一条后合并：末条 from=777 ≠ 首条 to=500（链断）
      logs: {
        d: [
          { issue: '#A', reason: 'a', from: 400, to: 500 },
          { issue: '#B', reason: 'b', from: 777, to: 100 },
        ],
      },
    })
  );
  assertEqual(plan.errors.length, 0, '不应有错误：' + plan.errors.join('|'));
  assertEqual(plan.dims[0].stitch.length, 1, '应恰有 1 处 stitch');
  assertEqual(plan.dims[0].stitch[0].index, 1, 'stitch 目标是第 1 条（0 起）');
  assertEqual(plan.dims[0].stitch[0].from, 777, '原值应如实记录');
  assertEqual(plan.dims[0].stitch[0].to, 500, '新值 = 前一条 to');
  assertEqual(plan.dims[0].entries[1].from, 500, '计划内条目应已改好');
});

test('① 链完整 → 无 stitch（不无中生有）', () => {
  const plan = planRechain(
    basePlan({
      logs: {
        d: [
          { issue: '#A', reason: 'a', from: 1, to: 50 },
          { issue: '#B', reason: 'b', from: 50, to: 100 },
        ],
      },
    })
  );
  assertEqual(plan.dims[0].stitch.length, 0, '链完整时不得产生 stitch');
});

// ── ② 「不许静默上调」：无授权则拒绝 ──────────────────────────
test('② 实测 > 天花板 且无 --issue/--reason → **拒绝**（不自行放行）', () => {
  const plan = planRechain(basePlan({ dims: [{ dim: 'd', measured: 200 }] }));
  assertEqual(plan.dims[0].append, null, '不得自行追加留痕');
  assertEqual(plan.refusals.length, 1, '应有一条拒绝');
  assertTrue(plan.refusals[0].required.includes('--issue'), '拒绝文案须给出可执行命令');
});

test('② 实测 > 天花板 且有 --issue/--reason → 追加留痕，数字**由实测派生**（人不写）', () => {
  const plan = planRechain(
    basePlan({ dims: [{ dim: 'd', measured: 200 }], issue: '#408', reason: '新增守卫' })
  );
  assertEqual(plan.refusals.length, 0, '授权后不应拒绝');
  const a = plan.dims[0].append;
  assertTrue(!!a, '应有 append');
  assertEqual(a.from, 100, 'append.from = 旧天花板（派生）');
  assertEqual(a.to, 200, 'append.to = 实测（派生）');
  assertEqual(a.issue, '#408', 'issue 应取自参数');
});

test('② 实测 ≤ 天花板 → 不追加留痕（只在「上调」时留痕）', () => {
  const plan = planRechain(basePlan({ dims: [{ dim: 'd', measured: 80 }] }));
  assertEqual(plan.dims[0].append, null, '下调不得产生 append');
  assertEqual(plan.dims[0].baseline, 80, '声明基线应收紧到实测');
});

test('② 声明基线只在可判定时改写：拒绝的维度不得写基线', () => {
  const plan = planRechain(basePlan({ dims: [{ dim: 'd', measured: 200 }] }));
  assertEqual(plan.dims[0].baseline, null, '拒绝时不得改写声明基线');
});

// ── ③ 追加条目自检（防空壳）────────────────────────────────
test('③ 追加条目自检：缺字段 / from>to → 报错', () => {
  assertTrue(
    checkAppendedEntry({ issue: '', reason: 'r', from: 1, to: 2 }).length > 0,
    '空 issue 应报错'
  );
  assertTrue(
    checkAppendedEntry({ issue: '#1', reason: 'r', from: 5, to: 2 }).length > 0,
    'from > to 应报错（留痕不得记录下调）'
  );
  assertEqual(
    checkAppendedEntry({ issue: '#1', reason: 'r', from: 1, to: 2 }).length,
    0,
    '合法条目应通过'
  );
});

// ── ④ 变异自证（真实 CLI 本尊）：并发两条留痕 → 重链前后 ─────────
test('④ 变异自证：注入「并发两条留痕」（粘连 + 链断）→ 轴 I 报红；重链后回绿', () => {
  const orig = fs.readFileSync(SCOPE, 'utf8');
  // 注入：在 scopesCodeLines 维末尾追加一条**链断**的留痕（from 与前一条 to 不等）
  //   —— 模拟「两侧各自 append 后手工拼接出错」的真实形态。
  const marker = `      netDeletion: '净删 10 行有效代码（原手抄第二份路径清单的残余随实测撤销）',\n    },\n  ],\n  docDrift`;
  const hasMarker = orig.includes(marker);
  // 退路：用更宽松的锚点（该维末条 netDeletion 行 + 块尾）
  const looseIdx = orig.indexOf('  scopesCodeLines: [');
  assertTrue(looseIdx !== -1, '应能定位 scopesCodeLines 维');
  const endIdx = orig.indexOf('\n  ],', looseIdx);
  assertTrue(endIdx !== -1, '应能定位该维块尾');
  const inject =
    `\n    { issue: '#408 变异探针 A', reason: '并发侧 A 追加', from: 106, to: 130, netDeletion: 'x' },` +
    `\n    { issue: '#408 变异探针 B', reason: '并发侧 B 追加', from: 999, to: 112, netDeletion: 'y' },`;
  const broken = orig.slice(0, endIdx) + inject + orig.slice(endIdx);
  assertTrue(broken !== orig, '注入应产生 diff');

  const backup = orig;
  try {
    const before = runScopeOn(broken);
    assertTrue(before.code !== 0, '链断（并发拼接出错）必须使轴 I 报红');
    assertTrue(/留痕链断裂/.test(before.out), '应报「留痕链断裂」：' + before.out.slice(0, 400));

    // 重链：把 broken 落到真实文件后跑 `ratchet:rechain --write`（内含写后轴 I 自校验）
    fs.writeFileSync(SCOPE, broken);
    const r = spawnSync(
      process.execPath,
      [CLI, '--write', '--issue', '#408', '--reason', '变异自证：重链并发留痕'],
      { cwd: rootDir, encoding: 'utf8' }
    );
    const out = (r.stdout || '') + (r.stderr || '');
    assertEqual(r.status, 0, '重链后应 EXIT=0：' + out.slice(0, 800));
    assertTrue(/重链后轴 I 通过/.test(out), '应打印写后自校验通过：' + out.slice(0, 800));
    // 链必须接上（轴 I 复绿已由写后自校验证明；此处再断言文本层面 `from` 已改）
    const after = fs.readFileSync(SCOPE, 'utf8');
    assertTrue(!/from: 999,/.test(after), '链断处的 from 应已重链为前一条 to');
    assertEqual(runRealScope().code, 0, '重链后本尊必须回绿');
  } finally {
    fs.writeFileSync(SCOPE, backup);
  }
  assertEqual(runRealScope().code, 0, '还原后必须回绿');
});

test('④ 变异自证：实测超天花板且**无授权** → CLI 拒绝并 EXIT=1（不擅自抬高天花板）', () => {
  const orig = fs.readFileSync(SCOPE, 'utf8');
  // 造「实测已超天花板」：把 `scopesCodeLines` 维**末条**的 `to` 压到 1（天花板 := 1）
  //   —— 比「压基线」有效：天花板**派生自留痕末条 `.to`**，改基线不影响天花板（初版探针改基线，
  //   实测被误判为「无越界」）。
  const i = orig.indexOf('  scopesCodeLines: [');
  const j = orig.indexOf('\n  ],', i);
  assertTrue(i !== -1 && j !== -1, '应能定位 scopesCodeLines 维');
  const blk = orig.slice(i, j);
  const blk2 = blk.replace(/to: 112,\n\s+netDeletion: '净删 10 行有效代码[^']*',/, m =>
    m.replace('to: 112,', 'to: 1,')
  );
  assertTrue(blk2 !== blk, '应能把该维末条天花板压到 1（否则探针失效）');
  const patched = orig.slice(0, i) + blk2 + orig.slice(j);
  try {
    fs.writeFileSync(SCOPE, patched);
    const r = spawnSync(process.execPath, [CLI, '--write'], { cwd: rootDir, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    assertEqual(r.status, 1, '拒绝时必须 EXIT=1（拒绝 ≠ 崩溃）：' + out.slice(0, 600));
    assertTrue(
      /不自行放行|需 npm run ratchet:rechain/.test(out),
      '应给出拒绝文案与可执行命令：' + out.slice(0, 600)
    );
    const after = fs.readFileSync(SCOPE, 'utf8');
    assertTrue(
      after.includes('to: 1,'),
      '拒绝时**不得**改写被拒维度的天花板（防「无授权静默抬高」）'
    );
  } finally {
    fs.writeFileSync(SCOPE, orig);
  }
});

// ── ⑤ 口径单源（防第二份实现）──────────────────────────────
test('⑤ 口径单源：E1 计数实现只在 lib/e1-metrics.js，守卫与重链 CLI 都消费它', () => {
  const metrics = fs.readFileSync(METRICS_LIB, 'utf8');
  assertTrue(/function countCodeLines/.test(metrics), 'lib/e1-metrics.js 必须定义 countCodeLines');
  assertTrue(/function countBranches/.test(metrics), 'lib/e1-metrics.js 必须定义 countBranches');
  for (const rel of ['scripts/validate-semantic-anchor-scope.js', 'scripts/ratchet-rechain.js']) {
    const src = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    assertTrue(
      src.includes("require('./lib/e1-metrics.js')"),
      `${rel} 必须消费口径单源（不得自写第二份计数）`
    );
    assertTrue(
      !/function countCodeLines|function countBranches/.test(src),
      `${rel} 不得自写 countCodeLines/countBranches（同一语义两处写）`
    );
  }
});

test('⑤ 重链 CLI 必须在**体量分母**内（防「改前缀逃出棘轮」）', () => {
  const { discoverGuardSources } = require(
    path.join(rootDir, 'scripts', 'lib', 'guard-sources.js')
  );
  const files = discoverGuardSources();
  assertTrue(
    files.includes('scripts/ratchet-rechain.js'),
    'ratchet-*.js 必须进机械枚举（否则改个文件名前缀即可逃出体量棘轮）'
  );
  assertTrue(
    files.includes('scripts/lib/ratchet-rechain.js'),
    'lib/ratchet-rechain.js 必须在分母内'
  );
});

// ── ⑥ 文档/入口连通 ────────────────────────────────────────
test('⑥ 入口连通：package.json 暴露 ratchet:rechain，且指向真实脚本', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assertEqual(
    pkg.scripts['ratchet:rechain'],
    'node scripts/ratchet-rechain.js',
    'npm run ratchet:rechain 必须存在且指向真实脚本'
  );
  assertTrue(fs.existsSync(CLI), 'scripts/ratchet-rechain.js 必须存在');
});

console.log(`\n${passCount}/${testCount} 用例通过（棘轮重链专测）`);
if (failures.length > 0) {
  failures.forEach(f => console.error('  ✗ ' + f.name + ': ' + f.err.message));
  process.exit(1);
}
