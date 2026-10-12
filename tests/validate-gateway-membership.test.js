/**
 * 轴 I「工具成员一致性（直连注册 ⇔ 网关索引）」守卫的变异自证测试
 * （Issue #325 立项，**Issue #382 DECISION-1 重写**）
 *
 * 背景：#325 原守卫治「校对工具必须 ∈ GATEWAY_ONLY_TOOLS（禁止直连）」，而被禁直连的副作用
 * （不进 `tools/list` ⇒ AI 靠 search 猜词 + 拿残缺 schema）正是 #382 的物理成因。DECISION-1 定
 * 「纯 TS 逻辑工具一律直连注册」后本守卫按新规则重写，本测试随之重写 —— 逐条判据注入反例，
 * 断言守卫 CLI **真实抓红**（防「守卫存在但拦不住」的假绿）。
 *
 * 手法：把源文件拷进临时 fixture 目录（`--root` 指向它），逐一变异后 spawnSync 守卫 CLI。
 *
 * 运行：node tests/validate-gateway-membership.test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'validate-gateway-membership.js');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwmem-'));
  for (const rel of SRC_FILES) {
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
  // allTools 装配链 + handler 源需整个 tools 子树；判据 C 需 PS1 桥接
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

console.log('validate-gateway-membership 轴 I 变异自证（Issue #382 DECISION-1 重写）：');

// 基线：未变异必须通过
test('基线（真实源文件拷贝）→ 通过', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'on baseline expected exit 0, got ' + r.code + '\n' + r.out);
  assert(r.out.includes('纯 TS 逻辑工具'), 'expected 纯 TS 工具 report line:\n' + r.out);
});

// 判据 A：纯 TS 校对工具从 allTools 移除（= 又藏回「不可见」）
test('变异 A：从 wordTools 移除 reportTools → 判据 A 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/word/index.ts', s => s.replace('  ...reportTools,\n', ''));
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 A'), 'expected 判据 A in output:\n' + r.out);
});

// 判据 A 的另一形态：proofreadTools 整个移除（4 个纯 TS 工具全丢）
test('变异 A-2：从 wordTools 移除 proofreadTools → 判据 A 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/word/index.ts', s =>
    s.replace('  ...proofreadTools,\n', '')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 A'), 'expected 判据 A in output:\n' + r.out);
});

// 判据 B：把纯 TS 工具又塞回网关索引（同名双通道）
test('变异 B：把 proofreadBasic 塞回 COM_ACTIONS → 判据 B 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/gateway/com-actions.ts', s =>
    s.replace(
      '  // Excel 操作 (~120)',
      "  {\n    name: 'proofreadBasic',\n    description: 'X',\n    keywords: ['x'],\n" +
        "    category: 'word',\n    appType: WpsAppType.WRITER,\n    paramsSchema: {},\n  },\n  // Excel 操作 (~120)"
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 B'), 'expected 判据 B in output:\n' + r.out);
});

// 判据 C：网关条目无执行者（TS handler 与 PS1 分支都没有）
test('变异 C：索引加一个无实现条目 → 判据 C 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/gateway/com-actions.ts', s =>
    s.replace(
      '  // Excel 操作 (~120)',
      "  {\n    name: 'zzzGhostTool',\n    description: 'X',\n    keywords: ['x'],\n" +
        "    category: 'word',\n    appType: WpsAppType.WRITER,\n    paramsSchema: {},\n  },\n  // Excel 操作 (~120)"
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 C'), 'expected 判据 C in output:\n' + r.out);
  assert(r.out.includes('zzzGhostTool'), 'expected ghost named in output:\n' + r.out);
});

// 判据 D：注册层黑名单复活
test('变异 D：tool-registry.ts 把黑名单加回来 → 判据 D 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/server/tool-registry.ts', s =>
    s.replace(
      'export class ToolRegistry {',
      "const GATEWAY_ONLY_TOOLS = new Set(['wps_word_proofread_basic']);\nexport class ToolRegistry {"
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 D'), 'expected 判据 D in output:\n' + r.out);
});

// 判据 D：治理层拦截表复活
test('变异 D-2：governance.js 把 DIRECT_TO_GATEWAY 拦截表加回来 → 判据 D 报红', () => {
  const dir = makeFixture();
  patch(dir, '.opencode/plugins/governance.js', s =>
    s.replace(
      'const WRITE_TOOLS = new Set([',
      "const DIRECT_TO_GATEWAY = { 'wps-office_wps_word_proofread_basic': 'proofreadBasic' };\nconst WRITE_TOOLS = new Set(["
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 D'), 'expected 判据 D in output:\n' + r.out);
});

// 判据 E：schema 转换不再搬运 required
test('变异 E：网关 schema 转换丢掉 required → 判据 E 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/gateway/index.ts', s =>
    s.replace(/requiredSet\.has\(key\)|prop\.required/g, 'false')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 E'), 'expected 判据 E in output:\n' + r.out);
});

// 判据 A（CR5-1 补强）：mcp-server 删掉 registerAll(allTools) → 判据 A 报红（非恒真）
test('变异 A-3：mcp-server 删掉 registerAll(allTools) → 判据 A 报红', () => {
  const dir = makeFixture();
  // 同时改注释里的字面提及（否则 ——「删调用但注释仍在」—— 正则仍命中；这也正是本判据要防的形态）
  patch(dir, 'wps-office-mcp/src/server/mcp-server.ts', s =>
    s.replaceAll('registerAll(allTools)', 'registerAll_RENAMED(allTools)')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 A'), 'expected 判据 A in output:\n' + r.out);
  assert(r.out.includes('registerAll'), 'expected registerAll named:\n' + r.out);
});

// 反向：真实文件（G1 已删、4 个校对工具直连）→ 不报红
test('反向：真实文件 → 全部判据（A~E）全绿、不报红', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'baseline must stay green, got ' + r.code + '\n' + r.out);
  assert(r.out.includes('allTools（直连注册'), 'expected allTools report line:\n' + r.out);
});

// 判据 G（复盘铁律 22，双向）：历史债披露项须带跟踪 Issue 编号；单源登记项须对应真实披露项。
// Issue #388 清偿后：披露项清零 + 台账空集 ⇒ 判据 G 正向 = 双向一致（空 ↔ 空）。
test('判据 G 正向（#388 清偿后）：披露项清零且台账空集（双向一致）', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'baseline must stay green, got ' + r.code + '\n' + r.out);
  assert(r.out.includes('披露项清零'), 'expected zeroed disclosure:\n' + r.out);
  assert(
    !r.out.includes('范围外的既有重复入口'),
    'disclosure must be zeroed (no legacy warning):\n' + r.out
  );
});

// #388 AC 负向自证：还原（把 writeFile 塞回 COM_ACTIONS）→ 披露复现，且因台账空 ⇒ 判据 G 报红。
// 这同时证明披露机制**非恒空**（不是「永远不报」的假绿）。
test('变异 G-1（#388 负向自证）：还原 COM_ACTIONS 一条 → 披露复现 + 判据 G 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/gateway/com-actions.ts', s =>
    s.replace(
      "    name: 'remove_duplicates',",
      "    name: 'writeFile',\n    description: 'X',\n    keywords: ['x'],\n" +
        "    category: 'common',\n    appType: WpsAppType.WRITER,\n    paramsSchema: {},\n  },\n  {\n" +
        "    name: 'remove_duplicates',"
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 G'), 'expected 判据 G in output:\n' + r.out);
  assert(r.out.includes('writeFile'), 'expected writeFile named:\n' + r.out);
});

// 反向：登记项给正整数编号后，还原的债被如实披露（披露文案携带编号）⇒ 双向一致、绿。
test('变异 G-2：还原 + 台账补 #388 编号 → 披露复现且带编号、绿', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/gateway/com-actions.ts', s =>
    s.replace(
      "    name: 'remove_duplicates',",
      "    name: 'writeFile',\n    description: 'X',\n    keywords: ['x'],\n" +
        "    category: 'common',\n    appType: WpsAppType.WRITER,\n    paramsSchema: {},\n  },\n  {\n" +
        "    name: 'remove_duplicates',"
    )
  );
  patch(dir, 'scripts/lib/legacy-debt-manifest.js', s =>
    s.replace('const LEGACY_DEBT = {};', 'const LEGACY_DEBT = {\n  writeFile: { issue: 388 },\n};')
  );
  const r = runGuard(dir);
  assert(r.code === 0, 'expected green with numbered disclosure, got ' + r.code + '\n' + r.out);
  assert(r.out.includes('跟踪 Issue：#388'), 'expected disclosure to carry #388:\n' + r.out);
});

// 变异 G-3：披露项无编号（还原 + 台账给 0）→ 判据 G 报红（铁律 22「无编号待后续」）
test('变异 G-3：还原 + 台账编号给 0 → 判据 G 报红（无编号）', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tools/gateway/com-actions.ts', s =>
    s.replace(
      "    name: 'remove_duplicates',",
      "    name: 'writeFile',\n    description: 'X',\n    keywords: ['x'],\n" +
        "    category: 'common',\n    appType: WpsAppType.WRITER,\n    paramsSchema: {},\n  },\n  {\n" +
        "    name: 'remove_duplicates',"
    )
  );
  patch(dir, 'scripts/lib/legacy-debt-manifest.js', s =>
    s.replace('const LEGACY_DEBT = {};', 'const LEGACY_DEBT = {\n  writeFile: { issue: 0 },\n};')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 G'), 'expected 判据 G in output:\n' + r.out);
});

// 变异 G-4：台账登记一条**不存在**的债（stale 台账说谎）→ 判据 G 报红
test('变异 G-4：台账登记幽灵债 → 判据 G 报红（台账与实做不同源）', () => {
  const dir = makeFixture();
  patch(dir, 'scripts/lib/legacy-debt-manifest.js', s =>
    s.replace(
      'const LEGACY_DEBT = {};',
      'const LEGACY_DEBT = {\n  zzzGhostDebt: { issue: 388 },\n};'
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero\n' + r.out);
  assert(r.out.includes('判据 G'), 'expected 判据 G in output:\n' + r.out);
  assert(r.out.includes('zzzGhostDebt'), 'expected ghost debt named:\n' + r.out);
});

// 覆盖声明一致性（**静态断言**，不走 --root）：本守卫的 USED_PATHS 必须与
// `lib/guard-scopes.js` 的声明同源。⚠️ 该自检在守卫内以**仓库真实路径** require 单源
// （`--root` 只影响被检查的源文件，不影响单源模块的加载路径）⇒ 无法用 fixture 变异验证，
// 此处改为**源码级双向断言**（防「声明与实做两处漂移」= 本仓反复在治的形态）。
test('覆盖声明同源：guard-scopes.js 声明的 GATEWAY_MEMBERSHIP_PATHS 必须覆盖守卫用到的全部落点', () => {
  const guardSrc = fs.readFileSync(SCRIPT, 'utf8');
  // USED_PATHS 由具名常量组成（`[GOV_REL, REGISTRY_REL, ...]`）⇒ 先把每个常量的**值**解析出来
  const constOf = name => {
    const m = new RegExp('const ' + name + " = '([^']+)'").exec(guardSrc);
    return m ? m[1] : null;
  };
  const names = [.../# 从 USED_PATHS/.source] && [];
  const listSrc = guardSrc.slice(
    guardSrc.indexOf('const USED_PATHS'),
    guardSrc.indexOf('];', guardSrc.indexOf('const USED_PATHS'))
  );
  const used = [...listSrc.matchAll(/\b([A-Z][A-Z0-9_]*_REL)\b/g)]
    .map(m => constOf(m[1]))
    .filter(Boolean);
  assert(used.length >= 6, 'USED_PATHS 解析为 ' + used.length + ' 项（期望 ≥6）');
  const scopesSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'guard-scopes.js'), 'utf8');
  const i = scopesSrc.indexOf('const GATEWAY_MEMBERSHIP_PATHS');
  const declBlock = scopesSrc.slice(i, scopesSrc.indexOf('];', i));
  const declared = [...declBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
  const missing = used.filter(u => !declared.includes(u));
  assert(missing.length === 0, '守卫用到但声明未覆盖：' + missing.join(' / '));
});
console.log(`\n${passCount}/${testCount} 通过`);
if (failures.length > 0) {
  console.error('存在失败用例：');
  for (const f of failures) console.error('  - ' + f.name + ': ' + f.err.message);
  process.exit(1);
}
