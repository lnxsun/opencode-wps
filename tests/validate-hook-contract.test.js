/**
 * 钩子调用契约守卫的**专测 + 变异自证**（Issue #395 RC-6 防腐，铁律 24 第 7 维）。
 *
 * 断言对象 = `scripts/validate-hook-contract.js` 的判据纯函数 `findLegacyBeforeCalls`：
 *   · 正向：官方契约形态（args 在第二参）不报；
 *   · 变异自证：注入旧契约形态（args 在第一参、第二参空）⇒ 由绿转红。
 * 另断言仓库当前测试面**真的**全为官方契约（守卫在真实树上的落点非空壳）。
 */
'use strict';

const assert = require('assert');
const path = require('path');
const { findLegacyBeforeCalls, collectTestFiles } = require('../scripts/validate-hook-contract.js');

let pass = 0;
const failures = [];
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('官方契约形态（args 在第二参）→ 不报', () => {
  const src = `
    await before({ tool: 'x', sessionID: s, callID: 'c' }, { args: { a: 1 } });
    await plugin['tool.execute.before'](
      { tool: 'x', sessionID: s, callID: 'c' },
      { args: {} }
    );
  `;
  assert.deepStrictEqual(findLegacyBeforeCalls(src), []);
});

test('变异自证：旧契约形态（args 在第一参、第二参空）→ 由绿转红', () => {
  const bad = `
    await before(
      { tool: 'x', sessionID: s, callID: 'c', args: { a: 1 } },
      {}
    );
  `;
  const v = findLegacyBeforeCalls(bad);
  assert.strictEqual(v.length, 1, '旧契约形态必须被报出');
  assert.strictEqual(v[0].line, 2, '行号须指向调用行（模板串首行为空行）');
});

test('变异自证：双引号方括号形态（CR1-3 逃逸面）→ 必须被报出', () => {
  const bad = `
    await plugin["tool.execute.before"](
      { tool: 'x', sessionID: s, callID: 'c', args: { a: 1 } },
      {}
    );
  `;
  const v = findLegacyBeforeCalls(bad);
  assert.strictEqual(v.length, 1, '双引号方括号旧契约形态必须被报出（CR1-3）');
});

test('变异自证：args 简写形态（{ tool, args } 无冒号）也必须被报出', () => {
  const bad = `
    await plugin["tool.execute.before"]({ tool: 'x', sessionID: s, callID: 'c', args }, {});
  `;
  assert.strictEqual(findLegacyBeforeCalls(bad).length, 1, 'args 简写旧契约形态必须被报出');
});

test('变异自证：第二参包裹括号 ({}) 形态也必须被报出', () => {
  const bad = `await before({ tool: 'x', args: { a: 1 } }, ({}));`;
  assert.strictEqual(findLegacyBeforeCalls(bad).length, 1, '第二参 ({}) 形态必须被报出');
});

test('边界：形近键名（myArgs / argsList）不误报', () => {
  assert.deepStrictEqual(findLegacyBeforeCalls(`before({ myArgs: 1 }, {});`), []);
  assert.deepStrictEqual(findLegacyBeforeCalls(`before({ argsList: 1 }, {});`), []);
});

test('边界：单参调用（无第二参）不误报', () => {
  assert.deepStrictEqual(findLegacyBeforeCalls(`await before({ tool: 'x', args: {} });`), []);
});

test('边界：第二参非空对象不误报（官方形态的等价写法）', () => {
  assert.deepStrictEqual(
    findLegacyBeforeCalls(`await before({ tool: 'x', args: {} }, { args: {} });`),
    []
  );
});

test('真实树：tests/** 全为官方契约（守卫落点非空壳）', () => {
  const files = collectTestFiles(path.join(__dirname, '..', 'tests'));
  assert(files.length > 0, 'tests 目录不应为空');
  const hits = [];
  for (const f of files) {
    if (f === __filename) continue; // 排除本专测自身（含旧契约的**字符串字面量**，非真实调用）
    const src = require('fs').readFileSync(f, 'utf8');
    hits.push(...findLegacyBeforeCalls(src));
  }
  assert.deepStrictEqual(hits, [], '仓库测试面存在旧契约调用：' + JSON.stringify(hits));
});

for (const c of cases) {
  try {
    c.fn();
    pass++;
    console.log('  ✓ ' + c.name);
  } catch (e) {
    failures.push(c);
    console.log('  ✗ ' + c.name + ' → ' + e.message);
  }
}
console.log(`\n${pass}/${cases.length} 通过`);
if (failures.length) process.exit(1);
