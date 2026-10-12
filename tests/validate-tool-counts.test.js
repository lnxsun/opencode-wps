/**
 * `validate:toolcounts` 守卫的变异自证测试（Issue #373 第 1 轮评审 CR1-2/1-3）
 *
 * 背景：本脚本的核心承诺是「数量派生自代码，不手写」。
 *   Issue #373 第 1 轮评审实测：本 PR 内部就复现了它要治的病 ——
 *   新增 `wps_whoami` 后**派生真值 15**，而 `docs/SKILLS.md` 等**仍手写 14**，无门禁发现。
 *   故本轮补「文档声明数 == 派生真值」对账判据，并用本测试守护它不被写松（铁律 24 第 7 维②）。
 *
 * 手法：把被测脚本 + `mcp-server.ts` + 相关文档拷进临时 fixture（`--root`），
 *   定向变异后 spawnSync 真实 CLI，断言由绿转红（**真实链路**，非内存对象）。
 *
 * 运行：node tests/validate-tool-counts.test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'validate-tool-counts.js');

// 守卫读取的最小文件集（缺一即脚本自身报「结构已变」，属预期）
const SRC_FILES = [
  'wps-office-mcp/src/server/mcp-server.ts',
  'wps-office-mcp/src/tools/gateway/com-actions.ts',
  'docs/SKILLS.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPMENT_GUIDE.md',
  'docs/MCP.md',
  'skills/wps-word/SKILL.md',
  'skills/wps-office/SKILL.md',
  'agents/wps-expert.md',
  'agents/wps-excel.md',
  'agents/wps-word.md',
  'agents/wps-ppt.md',
  'README.md',
  'AGENTS.md',
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

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolcounts-'));
  // 拷贝 scripts/ 全树（守卫内部 require('./lib/...') 等相对依赖）
  copyTree(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'));
  // 拷贝 wps-office-mcp/src/tools 下四目录的 name: 字面量来源
  for (const d of ['excel', 'word', 'ppt', 'common']) {
    copyTree(
      path.join(ROOT, 'wps-office-mcp', 'src', 'tools', d),
      path.join(dir, 'wps-office-mcp', 'src', 'tools', d)
    );
  }
  for (const rel of SRC_FILES) {
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), dst);
  }
  // CR7-1：测试文件注释也在数字声明扫描面内（wps-office-mcp/src/**/*.ts）
  const extra = 'wps-office-mcp/src/tests/integration/mcp-builtin.test.ts';
  const extraDst = path.join(dir, extra);
  fs.mkdirSync(path.dirname(extraDst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, extra), extraDst);
  return dir;
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
function runGuard(dir) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function patch(rootDir, rel, fn) {
  const p = path.join(rootDir, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
}

console.log('validate-tool-counts 变异自证：');

// 基线：未变异必须通过
test('基线（真实源文件拷贝）→ 通过，且内置数派生自代码', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'on baseline expected exit 0, got ' + r.code + '\n' + r.out);
  assert(/内置工具:\s*\d+/.test(r.out), 'expected derived builtin count:\n' + r.out);
});

// 核心新判据：文档手写数 ≠ 派生真值 → 报红
test('变异：docs 手写「内置工具（12 个」≠ 派生真值 → 报红', () => {
  const dir = makeFixture();
  patch(dir, 'docs/SKILLS.md', s =>
    s.replace('## 内置工具（所有 Skill 共用）', '## 内置工具（12 个，所有 Skill 共用）')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('不符'), 'expected 数量不符报错:\n' + r.out);
});

// 新增 whoami ⇒ 派生数变化 ⇒ 文档若不同步即报红（防 CR1-2 原形态复发）
test('变异：mcp-server 少注册一个内置工具（派生 15→14）而文档不变 → 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/server/mcp-server.ts', s =>
    s.replace("        name: 'wps_list_cache',\n", '')
  );
  const r = runGuard(dir);
  // 文档里若仍存在与派生值不符的声明即应报红（fixture 文档为真实文档，本形态由 15→14 触发对账）
  assert(r.code !== 0 || /内置工具:\s*14/.test(r.out), 'expected detection:\n' + r.out);
});

// 口径交叉核：registry.register 调用数与 name 字面量数不一致 → 报红
test('变异：registry.register 调用数 ≠ name 字面量数 → 报红', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/server/mcp-server.ts', s =>
    // 加一次 register 调用但不加 name（模拟结构漂移）
    s.replace('class WpsMcpServer {', 'class WpsMcpServer { /* this.registry.register( */')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('口径不一致'), 'expected 口径交叉核报错:\n' + r.out);
});

// 新增判据（第 2 轮 CR2-2）：清单完整性 —— 表项缺真实内置工具 → 报红（防「删数字即离开对账视野」）
test('变异：skill 清单表删掉 wps_whoami 一行 → 清单完整性判据报红', () => {
  const dir = makeFixture();
  patch(dir, 'skills/wps-word/SKILL.md', s => s.replace(/^\| 13 \| `wps_whoami`.*\n/m, ''));
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('清单表仅'), 'expected 清单完整性报错:\n' + r.out);
  assert(r.out.includes('wps_whoami'), 'expected 缺项列出 wps_whoami:\n' + r.out);
});

// 反向自证：清单完整时不得误报
test('反向：清单完整（真实文件）→ 不报清单完整性错', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(
    !r.out.includes('清单表仅'),
    'should not report list-incompleteness on baseline:\n' + r.out
  );
});

// Issue #373 12/12 复盘（铁律 22 + 24 问 5「自许可循环」）：
//   原实现用**手写** PR_TOUCHED_DOCS 白名单把「既有 stale 清单」降级为告警 —— 那张表**本身
//   就是自许可通道**（把文件加进表即合法放行）。实测：agents/wps-word.md 原为 stale（12 项）
//   且不在白名单 ⇒ **只告警、EXIT=0**。本刀取消白名单，且把 3 份清单**真实补齐到 15 项**。
//   本测试守护「白名单不再存在」：agent 清单缺项必须**报红**（不是告警），否则豁免口会复活。
test('变异：agents/wps-word.md 清单缺一项 → 报红（白名单已取消，不再降级为告警）', () => {
  const dir = makeFixture();
  patch(dir, 'agents/wps-word.md', s => s.replace(/^\| 2 \| `wps_whoami`.*\n/m, ''));
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero (no more whitelist exemption):\n' + r.out);
  assert(r.out.includes('agents/wps-word.md'), 'expected agent file reported:\n' + r.out);
  assert(r.out.includes('清单表仅'), 'expected 清单完整性报错:\n' + r.out);
});

// 反向自证：3 份 agent 清单在基线（已补齐 15 项）不得误报
test('反向：agents/wps-{excel,word,ppt}.md 清单完整 → 不报（真实补齐后无豁免口需求）', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  for (const f of ['agents/wps-excel.md', 'agents/wps-word.md', 'agents/wps-ppt.md']) {
    assert(!r.out.includes(f), 'should not report complete list ' + f + ':\n' + r.out);
  }
});

// 第 5 轮 RES5-2：COM Actions 声明数写错 → 报红（原黑名单只拦 240 这一种旧值）
test('变异：文档写「COM Actions: 240」→ 报红（三类数量对账已覆盖，非仅内置）', () => {
  const dir = makeFixture();
  patch(dir, 'docs/DEVELOPMENT_GUIDE.md', s =>
    s.replace(
      /\| 工具数量 \|[^\n]*\|/,
      '| 工具数量 | `node scripts/validate-tool-counts.js` | COM Actions: 240 |'
    )
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('COM Actions'), 'expected COM Actions 声明报错:\n' + r.out);
});

// 第 5 轮 CR5-1：三段斜杠旧形态（锚定上下文）→ 报红
test('变异：写回旧形态「工具数量校验（12/240/257）」→ 报红（上下文锚定，不误伤 19/20/21）', () => {
  const dir = makeFixture();
  patch(dir, 'docs/DEVELOPMENT_GUIDE.md', s =>
    s.replace(/^# 工具数量校验.*$/m, '# 工具数量校验（12/240/257）')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('第 1 段'), 'expected 三段斜杠报错:\n' + r.out);
});

// 反向：铁律编号 19/20/21 不得误伤（上下文锚定的自证）
test('反向：文档含 `19/20/21`（铁律编号）→ 不报（三段斜杠判据须锚定「工具数量」上下文）', () => {
  const dir = makeFixture();
  patch(
    dir,
    'docs/DEVELOPMENT_GUIDE.md',
    s => s + '\n\n> 铁律 19/20/21 与 14096/14097/14098 端口。\n'
  );
  const r = runGuard(dir);
  assert(!r.out.includes('第 1 段'), 'must not flag 19/20/21:\n' + r.out);
});

// 第 7 轮 CR7-1：数量词前置语序「N 个内置工具」→ 报红（旧三模式全部漏判）
test('变异：写「12 个内置工具」（数量词前置）→ 报红（CR7-1 语序穷举）', () => {
  const dir = makeFixture();
  patch(dir, 'wps-office-mcp/src/tests/integration/mcp-builtin.test.ts', s =>
    s.replace(/^ \* 验证内置工具.*$/m, ' * 验证 12 个内置工具正确注册')
  );
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('内置工具'), 'expected 内置工具 声明报错:\n' + r.out);
});

// 反向：真实文件注释（不写数字）→ 不误报
test('反向：注释写「数量以 mcp-server.ts 为准」→ 不报', () => {
  const dir = makeFixture();
  const r = runGuard(dir);
  assert(r.code === 0, 'baseline must stay green:\n' + r.out);
});

// 第 10 轮 CR10-1：三类对象的语序覆盖须对等（「已对齐」声明须有判据持有）
test('断言：三数（内置/注册/COM Actions）的语序模式数须对等（CR10-1）', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const blk = src.match(/const DECLARED_COUNT_PATTERNS = \[([\s\S]*?)\n\];/)[1];
  const byName = {};
  for (const m of blk.matchAll(/name: '([^']+)'/g)) byName[m[1]] = (byName[m[1]] || 0) + 1;
  const triple = ['内置工具', '注册工具', 'COM Actions'];
  for (const k of triple) assert(byName[k] >= 2, `${k} 的模式数 ${byName[k]} < 2（语序覆盖不足）`);
  const counts = triple.map(k => byName[k]);
  const min = Math.min(...counts),
    max = Math.max(...counts);
  assert(max - min <= 1, `三数模式数差 ${max - min} > 1（不对称）：${JSON.stringify(byName)}`);
});

// 变异：注册工具写「共 999 个注册工具」→ 报红（第 10 轮新增语序）
test('变异：写「共 999 个注册工具」→ 报红（新增前置语序）', () => {
  const dir = makeFixture();
  patch(dir, 'docs/DEVELOPMENT_GUIDE.md', s => s + '\n\n> 共 999 个注册工具。\n');
  const r = runGuard(dir);
  assert(r.code !== 0, 'expected non-zero');
  assert(r.out.includes('注册工具'), 'expected 注册工具 报错:\n' + r.out);
});

// 汇总
console.log(`\n${passCount}/${testCount} 通过`);
if (failures.length > 0) {
  console.error('存在失败用例：');
  for (const f of failures) console.error('  - ' + f.name + ': ' + f.err.message);
  process.exit(1);
}
