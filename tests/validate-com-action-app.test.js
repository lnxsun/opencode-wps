/**
 * `validate-com-action-app` 守卫的变异自证（Issue #399 评审 R1-🔴A/🔴B，铁律 24 第 5 维）。
 *
 * 锁「守卫真的能拦」：三个判据（A 区块一致性 / B 覆盖闭合 / C 无残留猜测）各注入反例 ⇒ 由绿转红。
 * 反例在**临时副本**上构造（不污染仓库），守卫以 `--root <tmp>` 运行（真实进程 + 真实退出码）。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0;
const failures = [];
const test = (name, fn) => {
  try {
    fn();
    pass++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failures.push({ name, err: e });
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
};

const ROOT = path.join(__dirname, '..');
const GUARD = path.join(ROOT, 'scripts', 'validate-com-action-app.js');

/** 复制「守卫所需的最小树」到临时目录，供注入反例后运行。 */
function makeTmpTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comapp-'));
  for (const rel of [
    '.opencode/plugins/governance.js',
    'wps-office-mcp/src/tools/gateway/com-actions.ts',
    'scripts/gen-com-action-app.js',
    'scripts/validate-com-action-app.js',
    'scripts/lib/com-action-app.js',
  ]) {
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
  return dir;
}

const tmpDirs = [];
function tmp() {
  const d = makeTmpTree();
  tmpDirs.push(d);
  return d;
}
process.on('exit', () => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (_e) {
      /* 清理失败不影响测试结论 */
    }
  }
});

/** 运行守卫，返回 { code, out }。 */
function runGuard(root) {
  try {
    const out = execFileSync('node', [GUARD, '--root', root], { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

const GOV_REL = '.opencode/plugins/governance.js';

// ── 基线：不改 → 绿 ──
test('基线：未注入反例时守卫通过（EXIT=0）', () => {
  const r = runGuard(ROOT);
  assert.strictEqual(r.code, 0, `基线应通过，实际退出码 ${r.code}：${r.out}`);
});

// ── A：改表中的一个值 → 报红 ──
test('变异 A：篡改 COM_ACTION_APP 中某条 app 值 ⇒ 报红（区块 vs 注册表不一致）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/(\n\s*setFormula:\s*')excel(')/, '$1word$2');
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, '篡改表值后应报红');
  assert(
    /A: setFormula 表值 word != 注册表 excel/.test(r.out),
    `报红文案应定位到 setFormula：${r.out}`
  );
});

// ── B：删除表中一条 → 覆盖闭合失败 → 报红 ──
test('变异 B：从 COM_ACTION_APP 删除一条 ⇒ 报红（覆盖不闭合，兜底 word 可达）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/\n\s*addTextBox:\s*'ppt',/, '');
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, '删表项后应报红');
  assert(/addTextBox/.test(r.out), `报红文案应提到 addTextBox：${r.out}`);
});

// ── A：表中多写一条（注册表无） → 报红 ──
test('变异 A′：表里多登记一条注册表不存在的项 ⇒ 报红（多余登记）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/(\n\s*addTextBox:\s*'ppt',)/, "$1\n  notARealComAction: 'ppt',");
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, '多余登记应报红');
  assert(/notARealComAction/.test(r.out), `报红文案应提到多余项：${r.out}`);
});

// ── C：把旧关键词正则加回治理层 → 报红 ──
test('变异 C：治理层加回「按名字猜 app」的关键词正则 ⇒ 报红（旧形态复活）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(
    'function getAppType(toolName, app) {',
    "function getAppType(toolName, app) {\n  if (/(Slide|Presentation|Shape|Textbox)/.test(String(toolName))) return 'ppt';"
  );
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, '残留关键词猜测应报红');
  assert(/C: .*按名字猜 app/.test(r.out), `报红文案应命中判据 C：${r.out}`);
});

// ── E：把 own-property 读法改回裸下标 → 报红 ──
test('变异 E：把 getAppType 改回裸下标读 COM_ACTION_APP ⇒ 报红（原型链键泄漏）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(
    /const v = Object\.prototype\.hasOwnProperty\.call\(COM_ACTION_APP, name\)[\s\S]*?: null;/,
    'const v = COM_ACTION_APP[name];'
  );
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, '裸下标读取应报红');
  assert(/E: getAppType/.test(r.out), `报红文案应命中判据 E：${r.out}`);
});

// ── F：把 app 归属改回读调用参数 → 报红 ──
test('变异 F：G3 读回 innerArgs.appType ⇒ 报红（跨 app 绕过）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(
    /const appType = getAppType\(toolName, _call\.app\);/,
    'const appType = innerArgs.appType || getAppType(toolName, _call.app);'
  );
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, '读调用参数作 app 归属应报红');
  assert(/F: G3 不得读 innerArgs\.appType/.test(r.out), `报红文案应命中判据 F：${r.out}`);
});

// ── G：把 common 段映射回 word → 报红 ──
test('变异 G：把 common 段映射回 word ⇒ 报红（common 工具被当 word 误拦）', () => {
  const d = tmp();
  const f = path.join(d, GOV_REL);
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace("m[1] === 'common' ? 'common' : m[1]", "m[1] === 'common' ? 'word' : m[1]");
  fs.writeFileSync(f, s, 'utf8');
  const r = runGuard(d);
  assert.notStrictEqual(r.code, 0, 'common 段映射回 word 应报红');
  assert(/G: normalizeToolCall/.test(r.out), `报红文案应命中判据 G：${r.out}`);
});

console.log(`\n${pass}/${pass + failures.length} 通过`);
if (failures.length) {
  for (const f of failures) console.error('  - ' + f.name + ': ' + f.err.message);
  process.exit(1);
}
