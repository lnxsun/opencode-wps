/**
 * 工具结果**信封契约**守卫的变异自证（Issue #401 W-2）
 *
 * 本文件是 `scripts/validate-tool-result-payload.js` 的**专测**：把「守卫断言非恒真」钉死 ——
 * 手法 = 把源文件拷进临时 fixture 目录（`--root` 不可用，故按守卫的相对路径铺平目录），
 * 逐一注入反例后 spawnSync 守卫 CLI，断言「基线绿 + 变异红」。
 *
 * 四条独立变异（任一变得恒绿 ⇒ 本专测转红）：
 *   M1 消费点改读 `success`（投影中已被剥离的键）→ 守卫须报红；
 *   M2 兜底文案写回字段名标记 `success:false` → 守卫须报红；
 *   M3 契约派生源失效（`tools.ts` 无 ToolCallResult/CallToolResponse）→ 守卫须报红（不得退化为空集恒真）；
 *   M4 基线（真源）→ 守卫须绿（防「一律拦」）。
 *
 * 运行：node tests/validate-tool-result-payload.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CLI_REL = 'scripts/validate-tool-result-payload.js';
const FIXTURE_FILES = [
  CLI_REL,
  'scripts/lib/semantic-anchor-scope.js',
  '.opencode/plugins/governance.js',
  'wps-office-mcp/src/types/tools.ts',
  // R8-1：判据④ 的**独立来源** = mcp-server.ts 的投影公式（缺它会被判「无对照」）⇒ 基线夹具必须含。
  'wps-office-mcp/src/server/mcp-server.ts',
];

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
function assertTrue(v, msg) {
  if (!v) throw new Error(msg || 'expected true');
}

/** 铺一个 fixture 目录：拷贝枚举的真实源文件（保证基线可绿）。 */
function mkFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payload-'));
  for (const rel of FIXTURE_FILES) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dest);
  }
  return dir;
}
const write = (dir, rel, content) => fs.writeFileSync(path.join(dir, rel), content, 'utf8');
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
function runGuard(dir) {
  const r = spawnSync(process.execPath, [path.join(dir, CLI_REL)], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const cleanup = dir => fs.rmSync(dir, { recursive: true, force: true });

// ---- 基线 ----
test('基线（真实源拷贝）→ 守卫通过（防恒拦）', () => {
  const dir = mkFixture();
  const { code, out } = runGuard(dir);
  assertTrue(code === 0, '基线应 EXIT=0，实际 ' + code + '\n' + out);
  assertTrue(out.includes('✓ 通过'), '基线应打印通过');
  cleanup(dir);
});

// ---- M1：读投影中不存在的键 ----
test('M1 消费点改读 `output.success` → 守卫报红（唯一键名闭合）', () => {
  const dir = mkFixture();
  const rel = '.opencode/plugins/governance.js';
  const src = read(dir, rel);
  const injected = src.replace(
    'output && output.isError !== true && !failedByText',
    'output && output.success !== false && !failedByText'
  );
  assertTrue(injected !== src, '注入点未命中（源已变？）');
  write(dir, rel, injected);
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M1 应 EXIT=1，实际 ' + code + '\n' + out);
  assertTrue(out.includes('[.success]'), 'M1 报错须指向 .success，实际：' + out.slice(0, 200));
  cleanup(dir);
});

// ---- M2：字段名进文案 ----
test('M2 兜底文案写回 `success:false` → 守卫报红（契约键名不得进文案）', () => {
  const dir = mkFixture();
  const rel = '.opencode/plugins/governance.js';
  const src = read(dir, rel);
  const marker = 'const failureMarkers = [';
  const injected = src.replace(marker, "const failureMarkers = ['success:false',");
  assertTrue(injected !== src, '注入点未命中');
  write(dir, rel, injected);
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M2 应 EXIT=1，实际 ' + code + '\n' + out);
  assertTrue(out.includes('[payload-marker]'), 'M2 报错须指向 payload-marker');
  cleanup(dir);
});

// ---- M3：派生源失效（防「允许集合退化为空集恒真」）----
test('M3 契约派生源失效（tools.ts 无 ToolCallResult）→ 守卫报红', () => {
  const dir = mkFixture();
  write(dir, 'wps-office-mcp/src/types/tools.ts', '// 契约被删\n');
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M3 应 EXIT=1，实际 ' + code + '\n' + out);
  assertTrue(out.includes('契约字段名枚举为空'), 'M3 报错须点明派生源缺失');
  cleanup(dir);
});

// ---- M4：消费侧源缺失 ----
test('M4 消费侧 governance.js 缺失 → 守卫报红（不静默通过）', () => {
  const dir = mkFixture();
  fs.rmSync(path.join(dir, '.opencode/plugins/governance.js'));
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M4 应 EXIT=1，实际 ' + code + '\n' + out);
  assertTrue(out.includes('消费侧源文件缺失'), 'M4 报错须点明消费侧缺失');
  cleanup(dir);
});

// ---- M5：判据② 不得因判据③ 先报红而静默跳过（R5-1 第 5 轮复评）----
test('M5 派生源失效时判据② 必须显式登记「未执行」（不得静默跳过）', () => {
  const dir = mkFixture();
  write(dir, 'wps-office-mcp/src/types/tools.ts', '// 契约被删\n');
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M5 应 EXIT=1，实际 ' + code);
  assertTrue(
    out.includes('未执行'),
    'M5：判据② 的缺席必须显式可见（否则它可能在无人察觉时消失）· 实际输出：' + out.slice(0, 300)
  );
  cleanup(dir);
});

// ---- M6：允许集合不得被静默放宽（R8-1 第 8 轮评审，实测假绿）----
test('M6 把 ENVELOPE_ALLOWED_KEYS 放宽到含 `success` → 守卫报红（独立来源约束）', () => {
  const dir = mkFixture();
  const rel = 'scripts/lib/semantic-anchor-scope.js';
  const src = read(dir, rel);
  const injected = src.replace(
    "const ENVELOPE_ALLOWED_KEYS = ['isError'];",
    "const ENVELOPE_ALLOWED_KEYS = ['isError', 'success'];"
  );
  assertTrue(injected !== src, 'M6 注入点未命中');
  write(dir, rel, injected);
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M6 应 EXIT=1（放宽允许集合必须报红），实际 ' + code + '\n' + out);
  assertTrue(out.includes('[allowlist]'), 'M6 报错须指向 allowlist');
  cleanup(dir);
});

// ---- M7：投影公式源失效（独立来源缺失 ⇒ 不得恒绿）----
test('M7 投影公式源缺失（mcp-server.ts 无投影 return）→ 守卫报红', () => {
  const dir = mkFixture();
  write(dir, 'wps-office-mcp/src/server/mcp-server.ts', '// 投影被删\n');
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M7 应 EXIT=1，实际 ' + code);
  assertTrue(out.includes('[allowlist]'), 'M7 报错须指向 allowlist（独立来源缺失）');
  cleanup(dir);
});

// ---- M8：消费点不得完全不读信封键（R9-1 第 9 轮评审，实测假绿）----
test('M8 消费侧完全不读信封键（只读 outText）→ 守卫报红', () => {
  const dir = mkFixture();
  const rel = '.opencode/plugins/governance.js';
  const src = read(dir, rel);
  let injected = src.replace(
    'const failedByEnvelope = output?.isError === true;',
    'const failedByEnvelope = false;'
  );
  injected = injected.replace(
    'output && output.isError !== true && !failedByText',
    'output && !failedByText'
  );
  injected = injected.replace(
    'const ok = output && output.isError !== true && !hasFailureMarker;',
    'const ok = output && !hasFailureMarker;'
  );
  // 注释里仍会提到 `.isError`（那是说明文字），故只断言**代码形态**的读取被清空。
  const codeOnly = injected
    .split('\n')
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  assertTrue(injected !== src && !/\.isError/.test(codeOnly), 'M8 注入未生效');
  write(dir, rel, injected);
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M8 应 EXIT=1，实际 ' + code + '\n' + out.slice(0, 300));
  assertTrue(out.includes('[envelope-consumption]'), 'M8 报错须指向 envelope-consumption');
  cleanup(dir);
});

// ---- M9：间接读形态（13/13 复盘加固，闭合自限 ①）----
// 原判据只拦成员访问 `.success`；把键名绑到标识符再用计算成员 `output[k]` 读取可逃逸（实测假绿）。
test("M9 间接读 `const k='success'; output[k]` → 守卫报红（13/13 复盘加固）", () => {
  const dir = mkFixture();
  const rel = '.opencode/plugins/governance.js';
  const src = read(dir, rel);
  const injected = src.replace(
    'output && output.isError !== true && !failedByText',
    "(function(){const k='success';return output && output[k] !== false && !failedByText})()"
  );
  assertTrue(injected !== src, 'M9 注入未命中');
  write(dir, rel, injected);
  const { code, out } = runGuard(dir);
  assertTrue(code === 1, 'M9 应 EXIT=1，实际 ' + code + '\n' + out.slice(0, 300));
  assertTrue(out.includes('[indirect:'), 'M9 报错须指向间接读面，实际：' + out.slice(0, 200));
  cleanup(dir);
});

// ---- M10：防误报 —— 与信封无关的同名局部变量（循环计数器）不得被判为间接读 ----
test('M10 无关同名标识符（循环计数器 k）→ 守卫不误报（基线绿）', () => {
  const dir = mkFixture();
  const rel = '.opencode/plugins/governance.js';
  const src = read(dir, rel);
  // 追加一段与信封无关的循环（用 k 作计数器 + 计算成员读取无关数组），不得触发间接读面。
  const injected =
    src + '\n;(function(){const arr=[1,2,3];for(var k=0;k<arr.length;k++){void arr[k];}})();\n';
  write(dir, rel, injected);
  const { code, out } = runGuard(dir);
  assertTrue(code === 0, 'M10 应 EXIT=0（不误报），实际 ' + code + '\n' + out.slice(0, 300));
  cleanup(dir);
});

// ---- 真实仓库：本仓当前必须绿 ----
test('真实仓库：当前 governance.js 只读信封上真实存在的键（EXIT=0）', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, CLI_REL)], { encoding: 'utf8' });
  assertTrue(r.status === 0, '本仓守卫应 EXIT=0，实际 ' + r.status + '\n' + r.stdout + r.stderr);
});

console.log(`\nvalidate-tool-result-payload: ${passCount}/${testCount} 通过`);
if (failures.length > 0) {
  failures.forEach(f => console.error('  - ' + f.name + ': ' + f.err.message));
  process.exit(1);
}
