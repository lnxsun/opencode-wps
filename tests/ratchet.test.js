/**
 * 棘轮共享判据专测（Issue #341 R7 评审）
 *
 * 背景：`scripts/lib/ratchet.js` 是唯一契约（不许上调 / 值与留痕对账 / 留痕必填 **三类**判据；
 *   Issue #352 第五刀删掉了「达标即收紧」——该分支在同刀后全仓**零有效调用**，其原语义
 *   由「实测 ≤ 上限」直接承担）。R7 评审发现它**无任何直接断言**——
 *   删掉其中一条判据，两条守卫都可能部分失灵而无人发现。
 *   ⇒ 本文件给契约建**独立执行者**，并对**每条判据**做变异自证。
 *
 * 运行：node tests/ratchet.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const LIB = path.join(rootDir, 'scripts', 'lib', 'ratchet.js');
const { checkRatchet } = require(LIB);

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
const base = { name: 'X', initial: 100, current: 100, baseline: 100, log: [] };
const hit = (errs, kw) => errs.some(e => e.includes(kw));

// ── ① 不许上调 ──────────────────────────────────────────────
test('① 基线内（current == baseline）→ 无错', () => {
  assertEqual(checkRatchet({ ...base }).length, 0);
});
test('① 变异自证：current > baseline → 报「棘轮被上调」', () => {
  const errs = checkRatchet({ ...base, current: 101 });
  assertTrue(hit(errs, '棘轮被上调'), '应报棘轮被上调：' + errs.join(' | '));
});

// ── ② 值与留痕对账 ──────────────────────────────────────────
test('② 无留痕时 baseline == initial → 无错', () => {
  assertEqual(checkRatchet({ ...base }).length, 0);
});
test('② 变异自证：无留痕但 baseline != initial → 报「不对账」', () => {
  const errs = checkRatchet({ ...base, baseline: 999 });
  assertTrue(hit(errs, '不对账'), '应报不对账：' + errs.join(' | '));
});
test('② 有留痕时 baseline == 最后一条 .to → 无错', () => {
  const log = [{ issue: '#1', reason: 'r', from: 100, to: 120, netDeletion: 'x' }];
  assertEqual(checkRatchet({ ...base, baseline: 120, current: 120, log }).length, 0);
});
test('② 变异自证：baseline != 最后一条 .to → 报「不对账」', () => {
  const log = [{ issue: '#1', reason: 'r', from: 100, to: 120, netDeletion: 'x' }];
  const errs = checkRatchet({ ...base, baseline: 121, current: 121, log });
  assertTrue(hit(errs, '不对账'), '应报不对账：' + errs.join(' | '));
});

// ── ③ 留痕必填字段（防空壳留痕）────────────────────────────
test('③ 变异自证：留痕缺字段 → 报「空壳留痕」', () => {
  for (const missing of ['issue', 'reason', 'from', 'to']) {
    const e = { issue: '#1', reason: 'r', from: 1, to: 2 };
    delete e[missing];
    const errs = checkRatchet({ ...base, baseline: 100, current: 100, log: [e] });
    assertTrue(hit(errs, '缺字段'), `缺 ${missing} 必须报「缺字段」：` + errs.join(' | '));
  }
});

// ── ⑤ 判据不可缺（直接对治「删掉判据即假绿」）────────────────
test('⑤ 判据完整性：完整契约下，每条判据的变异场景都报出**各自专属错误**', () => {
  // 正向：在没有剪任何判据时，各变异场景必须各报出「它自己的」错误文案（第五刀后 = 3 条）。
  // 若某判据其实不存在（被人删了），其专属错误必然缺失 ⇒ 本用例转红。
  const probes = {
    不许上调: [{ name: 'X', initial: 100, current: 101, baseline: 100, log: [] }, '棘轮被上调'],
    值与留痕对账: [{ name: 'X', initial: 100, current: 100, baseline: 999, log: [] }, '不对账'],
    留痕必填字段: [
      {
        name: 'X',
        initial: 100,
        current: 100,
        baseline: 100,
        log: [{ issue: '', reason: '', from: 1, to: 1 }],
      },
      '缺字段',
    ],
  };
  for (const [label, [probe, kw]] of Object.entries(probes)) {
    const errs = checkRatchet(probe);
    assertTrue(
      hit(errs, kw),
      `判据「${label}」未生效：应报「${kw}」，实得 ${JSON.stringify(errs)}`
    );
  }
});

test('⑤ 变异自证（子进程，真实链路）：剪掉任一判据 → 其**专属错误**必消失（证明出错的确实是它）', () => {
  const orig = fs.readFileSync(LIB, 'utf8');
  const cuts = [
    {
      name: '不许上调',
      re: /if \(current > baseline\) \{[\s\S]*?\n  \}/,
      probe: { name: 'X', initial: 100, current: 101, baseline: 100, log: [] },
      kw: '棘轮被上调',
    },
    {
      name: '值与留痕对账',
      re: /if \(baseline !== expectBaseline\) \{[\s\S]*?\n  \}/,
      probe: { name: 'X', initial: 100, current: 100, baseline: 999, log: [] },
      kw: '不对账',
    },
    {
      name: '留痕必填字段',
      re: /for \(let i = 0; i < log\.length; i\+\+\) \{[\s\S]*?\n  \}/,
      probe: {
        name: 'X',
        initial: 100,
        current: 100,
        baseline: 100,
        log: [{ issue: '', reason: '', from: 1, to: 1 }],
      },
      kw: '缺字段',
    },
  ];
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ratchet-'));
  try {
    for (const cut of cuts) {
      assertTrue(cut.re.test(orig), `应能定位判据「${cut.name}」的源码（否则它已被删改）`);
      const patched = orig.replace(cut.re, '');
      const p = path.join(tmpDir, `r-${Buffer.from(cut.name).toString('hex')}.js`);
      fs.writeFileSync(p, patched);
      const r = spawnSync(
        process.execPath,
        [
          '-e',
          `const {checkRatchet}=require(${JSON.stringify(p)});process.stdout.write(JSON.stringify(checkRatchet(${JSON.stringify(cut.probe)})));`,
        ],
        { encoding: 'utf8' }
      );
      assertEqual(r.status, 0, `剪后契约应可加载（语法未被破坏）：${r.stderr}`);
      const errs = JSON.parse(r.stdout || '[]');
      assertTrue(
        !hit(errs, cut.kw),
        `剪掉判据「${cut.name}」后仍报出「${cut.kw}」⇒ 该文案并非由该判据产生（断言与判据未对应）`
      );
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.writeFileSync(LIB, orig);
  }
});

// ── ⑥ 文档与代码同源（8/12 环节防腐）────────────────────────
test('⑥ 文档同源：docs 棘轮判据表行数 === 实现判据数（防文档随实现漂移）', () => {
  const impl = fs.readFileSync(LIB, 'utf8');
  const implChecks = (impl.match(/\/\/ [①②③④]/g) || []).length;
  assertTrue(implChecks >= 3, `实现应有 ≥3 条判据（实测 ${implChecks}）`);
  const docPath = path.join(rootDir, 'docs', 'DEVELOPMENT_GUIDE.md');
  const doc = fs.readFileSync(docPath, 'utf8');
  const lines = doc.split('\n');
  const s = lines.findIndex(l => l.includes('### 4.2 守卫上限'));
  assertTrue(s !== -1, 'docs 必须有「守卫上限棘轮机制」小节');
  let e = lines.findIndex((l, i) => i > s && /^#{1,6} /.test(l));
  if (e === -1) e = lines.length;
  const block = lines.slice(s, e).join('\n');
  const docRows = (block.match(/^\| (?!判据|------)/gm) || []).length;
  assertEqual(
    docRows,
    implChecks,
    `docs 判据表 ${docRows} 行 ≠ 实现 ${implChecks} 条（文档必须与代码同源）`
  );
});

test('⑥ CHANGELOG 同源：本次改动须有对应条目（防「改了代码不改日志」）', () => {
  const cl = fs.readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
  assertTrue(cl.includes('#341'), 'CHANGELOG 须含本次 Issue 编号');
  assertTrue(/ratchet|棘轮/.test(cl), 'CHANGELOG 须记录本次新增的棘轮机制');
});

console.log('\n========== 棘轮契约专测结果 ==========');
console.log(
  `总计: ${testCount} 个测试 / 通过: ${passCount} 个 / 失败: ${testCount - passCount} 个`
);
if (passCount === testCount) {
  console.log('\n✓ 棘轮共享判据专测全部通过!\n');
  process.exit(0);
}
for (const f of failures) console.error('  ✗ ' + f.name + ': ' + f.err.message);
process.exit(1);
