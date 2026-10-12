/**
 * 轴 I · **判据 F** 专用变异自证测试（Issue #382 12/12 复盘，CR10-1 根因守卫）
 *
 * 判据 F 治的是：**治理层校对门禁必须对「直连 / 网关」两条通道同一口径**。
 *   CR10-1（第 10 轮评审实测复现）：DECISION-1 后 4 个纯 TS 校对工具**直连可调**，而 P1~P4 门禁
 *   原先**只写在 `wps_office_execute` 分支内** ⇒ 直连通道整体绕过校对治理。修复 = `normalizeToolCall`
 *   单点归一 + before/after 双钩子消费。本判据把该不变量**钉死**，防「删一处归一化 ⇒ 直连通道又静默失守」。
 *
 * 三条独立判据（任一被削弱 ⇒ 本测试必须转红）：
 *   ① 归一化函数**定义恰好一处**（两份解析 = 两条通道各一套口径）；
 *   ② **两个钩子**（before / after）都必须调用它（只归一化一条通道 = CR10-1 原样复发）；
 *   ③ 判据**不得**在归一化定义体之外直接读 `args.tool_name` 取工具身份（旧「只认网关外形」形态）。
 *
 * 手法：把源文件拷进临时 fixture 目录（`--root` 指向它），逐一变异后 spawnSync 守卫 CLI。
 * 本文件**只**测判据 F（判据 A~E 的变异自证在各自主测文件 / `validate-gateway-membership.test.js`），
 * 故对每个反例都断言「基线（未变异）绿 + 变异后报红且命中 `判据 F`」，证明断言非恒真。
 *
 * 运行：node tests/validate-gateway-f-criterion.test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'validate-gateway-membership.js');

// 判据 F 只消费 governance.js（治理插件本体）；其余源文件按守卫要求一并拷入以满足其结构解析。
const SRC_FILES = [
  '.opencode/plugins/governance.js',
  'scripts/lib/legacy-debt-manifest.js',
  'wps-office-mcp/src/server/tool-registry.ts',
  'wps-office-mcp/src/server/mcp-server.ts',
  'wps-office-mcp/src/tools/index.ts',
  'wps-office-mcp/src/tools/gateway/com-actions.ts',
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
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwmem-f-'));
  for (const rel of SRC_FILES) {
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
  copyTree(
    path.join(ROOT, 'wps-office-mcp', 'src', 'tools'),
    path.join(dir, 'wps-office-mcp', 'src', 'tools')
  );
  const ps1Dst = path.join(dir, 'wps-office-mcp', 'scripts', 'wps-com.ps1');
  fs.mkdirSync(path.dirname(ps1Dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'wps-office-mcp', 'scripts', 'wps-com.ps1'), ps1Dst);
  return dir;
}
function runGuard(dir) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function patch(rootDir, rel, fn) {
  const p = path.join(rootDir, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
}
/** 断言 CLI 输出的**失败块**中含判据 F（排除 ok.push 的绿行误命中：绿行含「判据 F：治理层」）。 */
function assertFRed(out) {
  assert(out.includes('❌'), '期望守卫报红（含 ❌）：\n' + out);
  const errBlock = out.slice(out.indexOf('❌'));
  assert(errBlock.includes('判据 F'), '期望失败块命中判据 F（而非其它判据或绿行）：\n' + out);
}

console.log('validate-gateway-membership 判据 F 变异自证（Issue #382 12/12 复盘 · CR10-1 根因）：');

// ── 0. 基线：未变异必须绿，且判据 F 正例行存在 ──
test('基线（真实源文件拷贝）→ 通过，且判据 F 正例行存在', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'baseline expected exit 0, got ' + r.code + '\n' + r.out);
  assert(
    r.out.includes('判据 F：治理层校对门禁对「直连 / 网关」两通道同口径'),
    'expected 判据 F positive line:\n' + r.out
  );
});

// ── 判据 F-①：归一化函数定义被删（两条通道不再归一）──
test('变异 F-1：删掉 normalizeToolCall 定义 → 判据 F 报红', () => {
  const dir = makeFixture();
  patch(dir, '.opencode/plugins/governance.js', s =>
    s.replace(/function\s+normalizeToolCall\s*\(/, 'function normalizeToolCall_DISABLED(')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assertFRed(r.out);
  assert(r.out.includes('未定义'), 'expected 「未定义」 message:\n' + r.out);
});

// ── 判据 F-①：归一化函数出现**第二份定义**（两条通道各一套口径）──
test('变异 F-2：再加一份 normalizeToolCall 定义（双份解析）→ 判据 F 报红', () => {
  const dir = makeFixture();
  patch(dir, '.opencode/plugins/governance.js', s =>
    s.replace(
      'const WRITE_TOOLS = new Set([',
      'function normalizeToolCall(outerTool, args) {\n  return { toolName: null, innerArgs: args || {} };\n}\nconst WRITE_TOOLS = new Set(['
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assertFRed(r.out);
  assert(
    r.out.includes('唯一定义者') || r.out.includes('2 处'),
    'expected 「唯一定义者 / 2 处」 message:\n' + r.out
  );
});

// ── 判据 F-②：before 钩子不再消费归一化（只归一化 after ⇒ CR10-1 半边复发）──
test('变异 F-3：before 钩子删掉 normalizeToolCall 调用 → 判据 F 报红', () => {
  const dir = makeFixture();
  patch(dir, '.opencode/plugins/governance.js', s => {
    // 只改 tool.execute.before 段内的那处调用（after 段保留，用于证明判据按钩子边界分判）
    const at = s.indexOf("'tool.execute.before'");
    assert(at !== -1, 'fixture 未定位到 before 钩子');
    const head = s.slice(0, at);
    const tail = s.slice(at);
    return (
      head +
      tail.replace(
        'const _call = normalizeToolCall(outerTool, beforeArgs());',
        'const _call = { toolName: input.args?.tool_name, innerArgs: input.args?.arguments || {} };'
      )
    );
  });
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assertFRed(r.out);
  assert(r.out.includes('before'), 'expected 「before」钩子被点名：\n' + r.out);
});

// ── 判据 F-②：两钩子调用点总数不足（只归一化一条通道）──
test('变异 F-4：两钩子都删掉归一化调用 → 判据 F 报红（调用点 < 2）', () => {
  const dir = makeFixture();
  patch(dir, '.opencode/plugins/governance.js', s =>
    s.replaceAll(
      'normalizeToolCall(outerTool, beforeArgs())',
      '({ toolName: null, innerArgs: {} })'
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assertFRed(r.out);
});

// ── 判据 F-③：归一化定义体之外直接读 args.tool_name 取工具身份（第二处网关外形解析）──
test('变异 F-5：定义体之外直接读 args.tool_name → 判据 F 报红', () => {
  const dir = makeFixture();
  patch(dir, '.opencode/plugins/governance.js', s =>
    s.replace(
      '// ==================== 插件导出 ====================',
      'function legacyGatewayIdentity(args) {\n  return args.tool_name;\n}\n// ==================== 插件导出 ===================='
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assertFRed(r.out);
  assert(r.out.includes('tool_name'), 'expected 「tool_name」被点名：\n' + r.out);
});

// ── 反向：真实文件（归一化单点 + 双钩子消费）→ 判据 F 不报红 ──
test('反向：真实文件 → 判据 F 绿、不报红', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'baseline must stay green, got ' + r.code + '\n' + r.out);
  assert(
    r.out.includes('判据 F：治理层校对门禁对「直连 / 网关」两通道同口径'),
    'expected 判据 F positive line:\n' + r.out
  );
});

// ── 断言非恒真（元自证）：判据 F 的正则**确实**能匹配真实源码的归一化定义与调用 ──
test('元自证：真实 governance.js 中 normalizeToolCall 定义 1 处、调用 ≥2 处（断言非恒真）', () => {
  const src = fs.readFileSync(path.join(ROOT, '.opencode/plugins/governance.js'), 'utf8');
  const defs = (
    src.match(/(function\s+normalizeToolCall\s*\(|const\s+normalizeToolCall\s*=)/g) || []
  ).length;
  const calls = (src.match(/normalizeToolCall\s*\(/g) || []).length - defs;
  assert(defs === 1, 'expected exactly 1 definition, got ' + defs);
  assert(calls >= 2, 'expected >=2 call sites, got ' + calls);
});

console.log(`\n${passCount}/${testCount} 通过`);
if (failures.length > 0) {
  console.error('存在失败用例：');
  for (const f of failures) console.error('  - ' + f.name + ': ' + f.err.message);
  process.exit(1);
}
