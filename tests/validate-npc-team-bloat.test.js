/**
 * NPC Team 提示词防腐守卫回归测试（Issue #312）
 *
 * 背景：#312 揭示 NPC Team 自身「只加不删 → 补丁栈单调增厚 → 上下文装不下 → 约定必漏读」。
 * 本文件为 scripts/validate-npc-team-bloat.js 的回归防线，核心不是「跑一遍不出错」，
 * 而是**每类断言各留 1 组变异自证**：注入反例后断言必须由绿转红（防「断言写空 → 假绿」）。
 *
 * 运行：node tests/validate-npc-team-bloat.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HELPERS = path.join(__dirname, 'helpers', 'facts-snapshot.js');
const { snapshot, evict, requireFresh } = require('./helpers/facts-snapshot.js');
const BLoat = require(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'));
const BLOAT = BLoat; // 快照键 = 模块实例（非路径——防「按路径绕开单一出口」）

/**
 * 变异后取**新鲜**度量（Issue #347 K5 合法写法）。
 * ⚠️ 这是测试侧**唯一**的「新鲜取数」出口：失效共享快照 → 重载被变异模块 → 取数。
 *    语义 = 「这次变异必须被真实看到」；直接读 shared snapshot 只会得到变异前状态（静默假绿）。
 *    K5 的「调用点必须为 0」判据把**裸 symbol**作为行为不变量：调用点**必须**写 symbol
 *    （故豁免它自身这一处），任何新加的裸调用会被立刻拦住。
 */
const GUARD_PATH = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
function freshLoader() {
  evict([BLOAT, BLoat]); // 语义 = 「这次变异必须被真实看到」，不是「读上次的快照」
  return requireFresh(GUARD_PATH);
}
function freshFacts() {
  return freshLoader().collectFacts();
}

// ---- mini 测试框架 ----
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
function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg || 'expected true');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error((msg || 'not equal') + ': got ' + actual + ', want ' + expected);
}

/**
 * 变异自证：把 checkBloat 的输入 facts 就地变异，断言 errors 中出现 matchRe。
 * 这是「注入反例 → 断言由绿转红」的最小可核实实现（不依赖改写磁盘文件，避免污染工作区）。
 */
function assertBlocks(facts, mutate, matchRe, label) {
  const base = BLoat.checkBloat(facts);
  assertEqual(base.errors.length, 0, label + '：基线应无错误（防「本来就红」假自证）');
  const mutated = mutate(JSON.parse(JSON.stringify(facts)));
  const { errors } = BLoat.checkBloat(mutated);
  assertTrue(
    errors.some(e => matchRe.test(e)),
    label + '：变异后应命中 ' + matchRe + '，实际：' + JSON.stringify(errors)
  );
}

// ============ 正向：当前仓库通过 ============
test('正向：当前提示词通过防腐校验（exit 0）', function () {
  const r = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js')],
    {
      encoding: 'utf8',
    }
  );
  assertEqual(r.status, 0, '防腐校验应 exit 0，实际输出：' + r.stdout + r.stderr);
});

test('正向：collectFacts 度量落在阈值内', function () {
  const f = snapshot(BLOAT);
  assertTrue(f.promptLines <= BLoat.LIMITS.promptLines, '提示词行数应在阈值内');
  assertTrue(f.ruleCount <= BLoat.LIMITS.ruleCount, '铁律条数应在阈值内');
  assertEqual(f.duplicateSentences.length, 0, '应无重复长句');
  assertEqual(f.brokenRefs.length, 0, '应无未登记引用');
});

// ============ A1 变异自证：提示词行数超上限 ============
test('变异自证 A1：提示词行数超上限应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.promptLines = BLoat.LIMITS.promptLines + 1;
      return f;
    },
    /A1 提示词行数超上限/,
    'A1'
  );
});

// ============ B1 变异自证：铁律条目数超上限 ============
test('变异自证 B1：铁律条目数超上限应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.ruleCount = BLoat.LIMITS.ruleCount + 1;
      return f;
    },
    /B1 铁律条目数超上限/,
    'B1'
  );
});

// ============ C1 变异自证：注入重复长句（腐肉）= ============
test('变异自证 C1：注入重复长句应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.duplicateSentences = [
        { kind: '行', times: 2, sample: '这是一段被复制粘贴的重复约定文本占位' },
      ];
      return f;
    },
    /C1 检测到重复长句/,
    'C1'
  );
});

test('K5 反向保护（Issue #347）：单一出口不得退化为「mutation 感知」缓存', function () {
  // Issue #347 明令禁止的形态：给度量加**内容/时间戳感知**的记忆化 ⇒ 改文件后取数自动重算，
  // 变异自证（改文件 → 重跑应报红）从此**恒绿**（假绿）。本用例把该形态做成可执行的反向保护：
  // 真实改写文档 → 共享出口取到的快照必须**仍是变异前状态**（= 出口不是 mutation 感知的）。
  const DOC = path.join(ROOT, 'docs', 'NPC_TEAM.md');
  const orig = fs.readFileSync(DOC, 'utf8');
  try {
    const before = snapshot(BLOAT);
    fs.writeFileSync(DOC, orig + '\n新增一行：这条约定必须被 C1 看到\n');
    assertEqual(
      snapshot(BLOAT),
      before,
      '共享出口不得随磁盘内容自动失效：否则「改文件 → 重跑」的变异自证静默失效（Issue #347 明确禁止）'
    );
  } finally {
    fs.writeFileSync(DOC, orig);
  }
});

test('变异自证 C1（真实端到端）：真实复制一段正文到提示词末尾应报红', function () {
  // 端到端变异：真实改写 docs 副本 → 用同一锚点重新度量 → 断言 C1 命中 → 还原。
  const DOC = path.join(ROOT, 'docs', 'NPC_TEAM.md');
  const orig = fs.readFileSync(DOC, 'utf8');
  try {
    // 复制一段「能独立成句」的正文（长度 ≥ 60，内部不含 。/；，避免与相邻文本并句后不再是独立重复句），
    // 插到提示词末尾制造重复。
    // 先验证后修复：初版 fixture 取 38 字符片段，与相邻文本并句成 722 字符长句 → 不构成「同一条重复句」，
    // 故 C1 未命中（守卫本身正确，是 fixture 选材错误）。
    const prompt = orig.match(/```text\n# NPC_TEAM_PROMPT_START[^\n]*\n([\s\S]*?)\n```/)[1];
    const dup = prompt
      .split('\n')
      .map(l => l.trim())
      .filter(
        l => l.length >= 60 && l.length <= 200 && !/[。；！？!?]/.test(l) // 与守卫 C1 切分符一致（含 ！？），保证素材能独立成句
      )[0];
    assertTrue(!!dup, '测试自身锚点缺失：未找到可用作重复素材的独立长句');
    const end = orig.indexOf('\n```', orig.indexOf('# NPC_TEAM_PROMPT_START'));
    fs.writeFileSync(DOC, orig.slice(0, end) + '\n' + dup + '\n' + orig.slice(end));
    const f = freshFacts(); // K5：失效共享快照 + 重载 + 取数（变异必须被真实看到）
    assertTrue(f.duplicateSentences.length > 0, '真实复制长句后 collectFacts 应检出重复');
    const { errors } = BLoat.checkBloat(f);
    assertTrue(
      errors.some(e => /C1 检测到重复长句/.test(e)),
      '端到端变异应命中 C1，实际：' + JSON.stringify(errors)
    );
  } finally {
    fs.writeFileSync(DOC, orig); // 无条件还原，防污染工作区
  }
});

// ============ C1 计数值语义（PR #315 评审 K3 修复）：不得被句/行双通道重复计数 ============
test('K5 单一出口（Issue #347）：跨文件原位全量取数调用点必须为 0，入口唯一', function () {
  // 本文件此前 43 处原位全量取数（每处 = 一次全量文件 I/O，成本随用例数放大）。
  // 判据：度量与「全量取数」两个符号在所有根仓库层/测试层调用点都不出现 —— 单源 = 唯一入口。
  const modules = ['validate-npc-team-bloat.js', 'validate-proofread-report-size.js'].map(f =>
    path.join(ROOT, 'scripts', f)
  );
  const tests = ['validate-npc-team-bloat.test.js', 'validate-proofread-report-size.test.js'].map(
    f => path.join(__dirname, f)
  );
  // 判据口径 = 「测试侧**任意别名**的原位全量取数」：不只认 `BLoat.` 前缀（换标识符即绕过），
  // 而是「任意接收者的点调用」——把绕过口收成一条**正则级**判据（非源码文本猜语法）。
  const count = (files, re) =>
    files.reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(re) || []).length, 0);
  // ① 本文件：全仓唯一的「新鲜取数」出口内**恰好 1 处**调用（其余一律不得出现）
  assertEqual(
    count([tests[0]], /collectFacts\(\)/g) - count([tests[0]], /[\w$]+\.collectFacts\(\)/g),
    1,
    '裸 symbol 仅允许出现在唯一「新鲜取数」出口内（本文件恰好 1 处）'
  );
  // ② 两个文件：任何**别名**调用（形如 `<接收者>.collectFacts(...)`）必须为 0
  assertEqual(
    count(tests, /[\w$.]+\.collectFacts\(\)/g),
    0,
    '测试不得以任何别名原位调用守卫度量（唯一入口 = helpers/facts-snapshot.js 的 snapshot()）'
  );
  // 每文件各自**定义/赋值**度量函数恰好 1 次（口径不变式；改名/改写法同样受约束）。
  // 判据只认定义形态 `function collectFacts(` / `collectFacts =`（调用点必须自由使用该符号）。
  for (const m of modules)
    assertEqual(
      (fs.readFileSync(m, 'utf8').match(/function collectFacts\(|collectFacts\s*=/g) || []).length,
      1,
      '度量定义者必须唯一：' + path.basename(m)
    );
  assertTrue(
    fs.readFileSync(HELPERS, 'utf8').includes('SNAPSHOTS'),
    '单一入口模块必须持有快照表（防有人把出口改成「无状态转发」，回到逐次全量 I/O）'
  );
});

test('K3：单次复制只计 1 次出现（times 不得被双通道放大）', function () {
  const f = snapshot(BLOAT);
  assertEqual(f.duplicateSentences.length, 0, '基线应无重复');
  // 分桶后同一内容至多在一个桶里被计（kind 字段存在），times 即真实出现次数
  for (const d of f.duplicateSentences)
    assertTrue(
      (d.kind === '句' || d.kind === '行') && d.times >= 2,
      'duplicateSentences 条目须带 kind（句/行）且 times 为真实出现次数，实际：' + JSON.stringify(d)
    );
});

// ============ K4：提示词正文提取必须过单一契约（防再次复制实现） ============
// Issue #314 comment 2099345506 的 i2/QA-F2 教训（本轮吸取）：
//   「只检查源码里有没有某字符串」的断言 = 测**形态**不测**行为**，可被「拷贝实现」绕过
//   （保留 require 行、同时自写一份等价正则，字符串断言照样绿）。
// 修复：把 K4 由「字符串存在性」升级为**行为断言**——
//   ① 泛化判据：守卫源码内不得出现任何自写的提示词提取正则（锚点 token 与 `.match(` 的组合）；
//   ② 行为自证：真实改写盘上脚本，把 require 调用替换为**内联拷贝实现**（保留 require 行），
//      断言守卫的提取结果**必须**随之不可用/不一致 —— 即拷贝实现会被真实抓住。
//      （若守卫真的只在 lib 里实现，则无法构造出「保留 require 但走自写实现」的绿态；
//        故此处用「以 lib 导出为唯一入口」的行为证据：删 lib 导出 → 守卫必须显式失败而非静默。）

// K4 行为断言（R1-K1 修复：从「形态检查」升级为**真实链路行为断言**）：
//   原实现用 SELF_IMPL_RE 查「源码里有无 NPC_TEAM_PROMPT_START..match(」= 测**形态**，
//   实测可被 exec / split / indexOf+slice 等自写实现绕过（探针 D2/D3/D4 均静默放行）——
//   即本断言自己又犯了一次 #314 i2「测形态不测行为」。#314 i3 给出正解：**变异自证须走真实链路**。
//   现改为：把守卫内的 extractPrompt(content) 调用点**真实替换**为一组「保留 require 行的自写实现」，
//   端到端跑守卫 CLI，断言其行为**必须发生变化**（被抓住 / 报错 / 结果不一致）。
//   判据泛化：不点名任何具体写法（exec/split/indexOf/RegExp 构造器皆覆盖）。
const GUARD_SRC = () =>
  fs.readFileSync(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'), 'utf8');
const EXTRACT_CALL = 'contractExtract(content)'; // R7/R8：唯一取正文出口（内部经 lib 契约）

/** 以「保留 require 行 + 自写实现」的方式替换调用点，返回新源码（fixture 失效则返回 null）
 *  注意：基准源码须由调用方传入（避免逐次迭代读到上一次的变异体，导致 fixture 失效）。 */
function withSelfImpl(baseSrc, implBody) {
  if (!baseSrc.includes(EXTRACT_CALL)) return null;
  return baseSrc.replace(
    '  const r = ' + EXTRACT_CALL + ';',
    '  const r = (function (c) {\n' + implBody + '  })(content);'
  );
}

/** 跑守卫 CLI（真实链路），返回 { status, output } */
function runGuardCli() {
  const r = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js')],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );
  return { status: r.status, output: (r.stdout || '') + (r.stderr || '') };
}

// R2-K1 修复（第 2 轮评审）：R1 的「行为变化」判据是**假绿** —— 注入任何改动都会改变
//   守卫自身的度量输出 ⇒ output 必变 ⇒ 断言必 pass，无法区分「自写实现」与「无关改动」
//   （实测：注入 `const NOISE = 1;` 无关一行，断言照样 pass；第七刀删除 E1 后该假绿源亦消失）。
//   正解：断言须锚定 **K4 语义本身** ——「守卫在存在自写实现时必须**报错/拒绝**」。
//   落地方式：守卫新增一条 K4 自检断言（见 validate-npc-team-bloat.js 的 K4 检查），
//   把「守卫源码不得自写提取实现」变成**门禁自身的断言**（不变量归属门禁，铁律 24 第 7 维②）。
//   本用例只做变异自证：注入任一自写实现 → 守卫 CLI 必须 **exit 1 且输出含 K4**。
// R4-K1 修复：删除「用源码文本猜 token」的形态判据（被证明可被运行时构造绕过，且给假的安全感）。
//   新判据（**fail-closed**）：自写实现无论写法，只要其结果与契约不一致 → 守卫**必须非 0 退出**
//   （readPrompt 行为断言抛错 / K4 结构断言 / 其它断言命中皆可）；逐输入等价者不构成契约漂移（登记为边界）。
test('K4 行为断言：非等价自写实现须 fail-closed（守卫非 0 退出，不得静默）', function () {
  const guardPath = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
  const orig = fs.readFileSync(guardPath, 'utf8');
  const baseline = runGuardCli();
  assertEqual(baseline.status, 0, '基线守卫应 exit 0（防「本来就红」假自证）');
  // **非等价**自写实现（结果与契约不一致 —— 必然可被 fail-closed 捕获）。
  //   注：与契约**逐输入等价**的实现（如照抄同一正则 + trim）不构成契约漂移，属**已知不可检测边界**，
  //   不列入本用例（R4-K1 已删除「用源码文本猜 token」的形态判据，故不再声称能拦等价实现）。
  const selfImpls = {
    'String.split()（缺 trim 语义差异）':
      "    const p = c.split('# NPC_TEAM_PROMPT_START');\n" +
      "    return p.length < 2 ? { ok: false, reason: 'x' } : { ok: true, prompt: 'WRONG-CONTENT' };\n",
    'indexOf + slice()（结果不一致）':
      "    const i = c.indexOf('# NPC_TEAM_PROMPT_START');\n" +
      "    return i < 0 ? { ok: false, reason: 'x' } : { ok: true, prompt: 'WRONG-CONTENT' };\n",
    '运行时数组 join 构造 token':
      "    const p = ['NPC_TEAM', 'PROMPT', 'START'].join('_');\n" +
      '    const i = c.indexOf(p);\n' +
      "    return i < 0 ? { ok: false, reason: 'x' } : { ok: true, prompt: 'WRONG-CONTENT' };\n",
    直接返回不一致内容: "    return { ok: true, prompt: 'WRONG-CONTENT' };\n",
  };
  try {
    for (const [name, body] of Object.entries(selfImpls)) {
      const mutated = withSelfImpl(orig, body);
      assertTrue(!!mutated && mutated !== orig, 'fixture 失效：无法替换调用点（' + name + '）');
      fs.writeFileSync(guardPath, mutated);
      const r = runGuardCli();
      // fail-closed：非等价自写实现必须使守卫非 0 退出（K4 断言 或 readPrompt 行为断言 或其它断言）
      assertTrue(
        r.status !== 0,
        '非等价自写实现「' +
          name +
          '」须 fail-closed（守卫非 0 退出），实际 exit ' +
          r.status +
          '，输出：' +
          r.output
      );
    }
  } finally {
    fs.writeFileSync(guardPath, orig); // 无条件还原
  }
});

// R4 变异自证：运行时构造 token 的自写实现（split/reverse/join/fromCharCode）也须 fail-closed。
//   R4-K1 教训：文本形态判据（.match( → 完整 token → 归并序列）都会被运行时构造绕过；
//   唯一可靠的是**行为断言**：结果与契约不一致 → fail-closed。等价实现不构成漂移（已知边界）。
test('K4 变异自证：运行时构造 token 的自写实现须 fail-closed（R4-K1）', function () {
  const guardPath = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
  const orig = fs.readFileSync(guardPath, 'utf8');
  const runtimeBuilt = {
    '数组 join 构造（非等价内容）':
      "    const p = ['NPC_TEAM', 'PROMPT', 'START'].join('_');\n" +
      '    const i = c.indexOf(p);\n' +
      "    return i < 0 ? { ok: false, reason: 'x' } : { ok: true, prompt: 'WRONG' };\n",
    'reverse 构造（错误 token → 提取失败）':
      "    const p = 'TRATS_TROPM_MAET_PCN #'.split('').reverse().join('');\n" +
      '    const i = c.indexOf(p);\n' +
      "    return i < 0 ? { ok: false, reason: 'x' } : { ok: true, prompt: 'WRONG' };\n",
  };
  try {
    for (const [name, body] of Object.entries(runtimeBuilt)) {
      const mutated = withSelfImpl(orig, body);
      assertTrue(!!mutated && mutated !== orig, 'fixture 失效（' + name + '）');
      fs.writeFileSync(guardPath, mutated);
      const r = runGuardCli();
      assertTrue(
        r.status !== 0,
        '运行时构造写法「' + name + '」须 fail-closed，实际 exit ' + r.status
      );
    }
  } finally {
    fs.writeFileSync(guardPath, orig);
  }
});

// R8 变异自证（防「自洽假出口」）：把守卫自身的取正文出口（contractExtract）替换为自写实现，
//   extractViaContract 必须因「与直连契约结果不一致」而判 K4 红 —— 不得自洽通过（R8 收敛引入的回归）。
test('K4 变异自证：替换守卫取正文出口须被 K4 抓住（防自洽假出口）', function () {
  const guardPath = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
  const orig = fs.readFileSync(guardPath, 'utf8');
  const impls = {
    直接返回不一致内容: "    return { ok: true, prompt: 'WRONG-CONTENT' };\n",
    'split 自写（非等价）':
      "    const p = c.split('# NPC_TEAM_PROMPT_START');\n" +
      "    return { ok: true, prompt: p.length < 2 ? 'W' : p[1].split('```')[1].trim() };\n",
  };
  try {
    for (const [name, body] of Object.entries(impls)) {
      const mutated = withSelfImpl(orig, body);
      assertTrue(!!mutated && mutated !== orig, 'fixture 失效（' + name + '）');
      fs.writeFileSync(guardPath, mutated);
      const r = runGuardCli();
      assertEqual(r.status, 1, '替换取正文出口「' + name + '」须使守卫 exit 1，实际 ' + r.status);
      assertTrue(
        /K4 /.test(r.output),
        '「' + name + '」须被 K4 点名（防自洽假出口），实际：' + r.output
      );
    }
  } finally {
    fs.writeFileSync(guardPath, orig);
  }
});

test('K4 契约归属：守卫本尊须拥有 K4 断言（不得只由测试承载 → 契约无主）', function () {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'), 'utf8');
  const inCheck = src.slice(src.indexOf('function checkBloat'), src.indexOf('module.exports'));
  assertTrue(/K4 /.test(inCheck), '守卫 checkBloat 须含 K4 断言（否则契约单一性无人守卫）');
  assertTrue(
    typeof snapshot(BLOAT).guardExtractViaContract === 'boolean',
    '守卫应度量 guardExtractViaContract（运行期契约出口，供 K4 断言消费）'
  );
});

// 反证（对应 R2-K1 的假绿）：**无关改动不得触发 K4 报错**（证明 K4 断言锚定语义、非「输出变化」）
test('K4 反证：无关改动（加一行代码）不得触发 K4 报错', function () {
  const guardPath = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
  const orig = fs.readFileSync(guardPath, 'utf8');
  const anchor = '  const errors = [];';
  assertTrue(orig.includes(anchor), 'fixture 失效：未定位到 checkBloat 内 errors 初始化点');
  try {
    fs.writeFileSync(guardPath, orig.replace(anchor, anchor + '\n  const NOISE = 1;'));
    const r = runGuardCli();
    assertTrue(!/K4 /.test(r.output), '无关改动不得触发 K4 报错（否则 K4 是「变化即拦」假绿）');
  } finally {
    fs.writeFileSync(guardPath, orig);
  }
});

// R7 变异自证（方案 b）：K4 判据**不依赖任何源码文本**，故「注释注入」对其完全无影响。
//   R5/R6 的「剔注释」修补已被 R7 证明不可穷尽（`;://` 逃生口 + 正则字面量状态泄漏），
//   现 K4 改由运行期 extractViaContract + readPrompt 行为断言承担 → 注释/文本注入天然免疫。
test('K4 运行期判据：源码文本（注释/字符串）注入不得影响 K4 结果（R7 方案 b）', function () {
  const guardPath = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
  const orig = fs.readFileSync(guardPath, 'utf8');
  const base = snapshot(BLOAT);
  const label = 'NPC_TEAM_' + 'PROMPT_START'; // 拼接构造，防本测试源码被误判
  try {
    // 在注释与字符串中注入大量 token 片段与 extractPrompt( ——旧文本判据会被虚增/绕过
    const noise =
      '// require("./lib/npc-team-prompt-source") extractPrompt( extractPrompt( ' + label + '\n';
    const mutated1 = orig.replace(
      'function checkBloat(facts) {',
      noise + 'function checkBloat(facts) {'
    );
    fs.writeFileSync(guardPath, mutated1);
    const mutated = freshFacts();
    assertEqual(
      mutated.guardExtractViaContract,
      base.guardExtractViaContract,
      'K4 运行期判据不得受注释/字符串文本注入影响（判据不读源码文本）'
    );
  } finally {
    fs.writeFileSync(guardPath, orig);
    freshLoader(); // 还原后重载（下个用例看到干净实例）
  }
});

test('K4 契约：三处消费者均引用单一契约模块（lib 为唯一入口）', function () {
  assertTrue(
    fs
      .readFileSync(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'), 'utf8')
      .includes("require('./lib/npc-team-prompt-source')"),
    '守卫须引用单一契约模块'
  );
  for (const f of ['validate-npc-team-prompt.js', 'sync-npc-team-skill.js']) {
    const t = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
    assertTrue(
      t.includes("require('./lib/npc-team-prompt-source')"),
      f + ' 须引用单一契约模块（不得自写提取正则）'
    );
  }
});

// ============ F3 变异自证（QA 7/13 发现）：锚点变体必须显式失败 ============
// QA 发现：契约正则原写法 `NPC_TEAM_PROMPT_START[^\n]*` 无法区分「锚点 token」与「锚点变体」——
// `# NPC_TEAM_PROMPT_START_BROKEN` 会被静默接受，于是「锚点缺失必须显式失败」在「前缀相同、后缀不同」时失效。
// 修复：锚点 token 后必须为非标识符字符（`(?![A-Za-z0-9_-])`）。本组用例即该修复的变异自证。
const SRC_MOD = require(path.join(ROOT, 'scripts', 'lib', 'npc-team-prompt-source.js'));

function readDoc() {
  return fs.readFileSync(path.join(ROOT, 'docs', 'NPC_TEAM.md'), 'utf8');
}

test('F3 变异自证：锚点直接拼接 _BROKEN 必须显式失败（不得静默通过）', function () {
  const mutated = readDoc().replace('# NPC_TEAM_PROMPT_START', '# NPC_TEAM_PROMPT_START_BROKEN');
  const r = SRC_MOD.extractPrompt(mutated);
  assertTrue(!r.ok, '锚点变体 _BROKEN 应显式失败，实际静默通过（守卫会读到非权威块）');
  assertTrue(
    /标识符/.test(r.reason || ''),
    '报错文案应指明「锚点被拼接标识符字符」，实际：' + r.reason
  );
});

test('F3 变异自证：锚点直接拼接 V2 必须显式失败', function () {
  const mutated = readDoc().replace('# NPC_TEAM_PROMPT_START', '# NPC_TEAM_PROMPT_STARTV2');
  assertTrue(!SRC_MOD.extractPrompt(mutated).ok, '锚点变体 STARTV2 应显式失败');
});

test('F3 反向保护：生产锚点与其行尾备注形态必须仍然可用（防修复过激）', function () {
  // 生产锚点行实际写法：`# NPC_TEAM_PROMPT_START（以下为 NPC Team 提示词，本行仅供校验锚点，可忽略）`
  const real = readDoc();
  const base = SRC_MOD.extractPrompt(real);
  assertTrue(base.ok, '生产文档锚点（含中文括号备注）必须可提取，实际：' + base.reason);
  const forms = [
    ['行尾纯空白', '# NPC_TEAM_PROMPT_START   '],
    ['行尾 HTML 注释', '# NPC_TEAM_PROMPT_START <!-- 权威源 -->'],
    ['行尾空格 + 中文备注', '# NPC_TEAM_PROMPT_START 旧锚点说明'],
  ];
  for (const [label, line] of forms) {
    const mutated = real.replace(/# NPC_TEAM_PROMPT_START[^\n]*/, line);
    const r = SRC_MOD.extractPrompt(mutated);
    assertTrue(r.ok, '合法备注形态（' + label + '）应可提取，实际：' + r.reason);
    assertTrue(
      r.prompt === base.prompt,
      '合法备注形态（' + label + '）提取正文应与生产一致（备注不得进入正文）'
    );
  }
});

test('F3 变异自证：锚点整行删除仍须显式失败且文案为「锚点缺失」', function () {
  const mutated = readDoc().replace(/# NPC_TEAM_PROMPT_START[^\n]*\n/, '');
  const r = SRC_MOD.extractPrompt(mutated);
  assertTrue(!r.ok, '锚点整行删除应显式失败');
  assertTrue(/未找到带锚点/.test(r.reason || ''), '文案应为「锚点缺失」，实际：' + r.reason);
});

// ============ D1 变异自证：注入未登记引用 = ============
test('变异自证 D1：注入未登记引用应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.brokenRefs = ['99999'];
      return f;
    },
    /D1 检测到未登记引用/,
    'D1'
  );
});

test('变异自证 D1（真实端到端）：提示词写入未登记编号 #99999 应报红', function () {
  const DOC = path.join(ROOT, 'docs', 'NPC_TEAM.md');
  const orig = fs.readFileSync(DOC, 'utf8');
  try {
    const end = orig.indexOf('\n```', orig.indexOf('# NPC_TEAM_PROMPT_START'));
    fs.writeFileSync(DOC, orig.slice(0, end) + '（引用 #99999 未登记）\n' + orig.slice(end));
    const f = freshFacts();
    assertTrue(f.brokenRefs.includes('99999'), '应检出未登记引用 99999');
    const { errors } = BLoat.checkBloat(f);
    assertTrue(
      errors.some(e => /D1 检测到未登记引用/.test(e)),
      '端到端变异应命中 D1，实际：' + JSON.stringify(errors)
    );
  } finally {
    fs.writeFileSync(DOC, orig);
  }
});

// ============ F1 变异自证：环节覆盖（防「环节悬空」/「环节膨胀」）============
// 用户 #312 补充「1-12 各个环节都要有防腐和解耦意识」→ 提示词【流水线】段每行须带「本环节：」三项判据。
// F1 断言取「=12 精确值」：少一处＝环节悬空（环节没给自己的防腐/解耦判据），
// 多一处＝环节膨胀（偷偷加环节绕开审查），两向都必须由绿转红。
test('正向：F1 环节覆盖声明数 = STAGE_COUNT 且与共享实现的复算一致', function () {
  const f = snapshot(BLOAT);
  assertEqual(
    f.stageProtection,
    BLoat.LIMITS.stageProtection,
    '环节覆盖声明数应为 STAGE_COUNT（实际 ' + f.stageProtection + '）'
  );
  // 名实一致自证：度量值必须等于**共享实现** countStageProtection 对【流水线】段的复算
  // （防「度量字段与判据脱钩」的假绿；范围与校验器 9.13 一致 = 【流水线】段，非整段提示词）
  const prompt = BLoat.readPrompt().prompt;
  // 段范围派生与守卫同一口径（Issue #383）：按「以 `1/M` 开头的阶段行」到下一个 `【` 段头行。
  const lines = prompt.split('\n');
  const re = new RegExp(`^1\\/${SRC_MOD.STAGE_COUNT}(?!\\d)`);
  const stageLine = lines.findIndex(l => re.test(l));
  const a =
    stageLine > 0 && lines[stageLine - 1].startsWith('【流水线') ? stageLine - 1 : stageLine;
  const b = lines.findIndex((l, i) => i > stageLine && l.startsWith('【'));
  const seg = stageLine !== -1 ? lines.slice(a, b === -1 ? lines.length : b).join('\n') : '';
  assertEqual(
    SRC_MOD.countCoveredStages(seg),
    f.stageProtection,
    'F1 度量须等于共享结构度量 countCoveredStages(【流水线】段)（防度量写死/口径漂移）'
  );
  assertEqual(SRC_MOD.STAGE_COUNT, 13, 'STAGE_COUNT（唯一来源）应为 13');
});

test('变异自证 F1：环节悬空（少一处环节保护）应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.stageProtection = BLoat.LIMITS.stageProtection - 1;
      return f;
    },
    /F1 环节覆盖数异常/,
    'F1-missing'
  );
});

test('变异自证 F1：环节膨胀（多一处环节保护）应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.stageProtection = BLoat.LIMITS.stageProtection + 1;
      return f;
    },
    /F1 环节覆盖数异常/,
    'F1-extra'
  );
});

test('变异自证 F1（真实端到端）：删掉一个环节的「本环节：」判据应报红', function () {
  const DOC = path.join(ROOT, 'docs', 'NPC_TEAM.md');
  const orig = fs.readFileSync(DOC, 'utf8');
  try {
    // 真实改写：删掉 7/13 测试行的「本环节：…」段（模拟「该环节没给自己的防腐/解耦判据」）
    const rewritten = orig.replace(
      / → 本环节：[^→\n]*?(?= → ⏸CP2\.5| → ⏸CP3| → 8\/12| → 9\/12| → 10\/12| → 11\/12| → 12\/12)/,
      ''
    );
    assertTrue(rewritten !== orig, 'fixture 失效：未找到可删除的「本环节：」片段');
    fs.writeFileSync(DOC, rewritten);
    const f = freshFacts();
    const { errors } = BLoat.checkBloat(f);
    assertTrue(
      errors.some(e => /F1 环节覆盖数异常/.test(e)),
      '删掉一个环节保护行后 F1 应报红，实际：' + JSON.stringify(errors)
    );
  } finally {
    fs.writeFileSync(DOC, orig); // 无条件还原
  }
});

// ============ 单一契约：F1 判据与范围唯一（守卫与校验器共享 lib，防两套口径失同步）============
test('单一契约：守卫与校验器的环节覆盖判据/范围均由 lib 共享（防两套口径失同步）', function () {
  const bloatSrc = fs.readFileSync(
    path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'),
    'utf8'
  );
  const promptSrc = fs.readFileSync(
    path.join(ROOT, 'scripts', 'validate-npc-team-prompt.js'),
    'utf8'
  );
  // 判据字面量与计数实现须来自共享 lib（PR #317 评审 K2/K4）：禁止任一消费者自写 /本环节：/g
  assertTrue(
    SRC_MOD.STAGE_PROTECT_MARK === '本环节：',
    'lib 应定义 STAGE_PROTECT_MARK = 「本环节：」（唯一判据字面量）'
  );
  for (const [name, src] of [
    ['守卫', bloatSrc],
    ['校验器', promptSrc],
  ]) {
    assertTrue(
      /require\(['"]\.\/lib\/npc-team-prompt-source/.test(src),
      name + ' 应消费 lib 的共享契约（不得自写判据）'
    );
    assertTrue(
      !/prompt\.match\(\/本环节：\/g\)/.test(src),
      name + ' 不得自写 /本环节：/g（须用 countStageProtection 共享实现）'
    );
  }
});

// ============ F5 回归（PR #317 评审 F5）：F3 修复不得丢「环节膨胀」检测 ============
test('变异自证 F5：新增计划外环节段必须报红（环节膨胀，与结构度量合取）', function () {
  const DOC = path.join(ROOT, 'docs', 'NPC_TEAM.md');
  const orig = fs.readFileSync(DOC, 'utf8');
  try {
    // 在【流水线】末尾追加一个 decoy 环节段（不在 STAGE_PROTECTION 内）——
    // 结构度量仍 12/13（不数计划外段），但字面计数 13 → 必须由「字面 > STAGE_COUNT」拦截
    const rewritten = orig.replace(
      '③ 度量=对照原始需求逐条复验（铁律 23，附复验命令与输出）',
      '③ 度量=对照原始需求逐条复验（铁律 23，附复验命令与输出） → 13/12 假环节 → 本环节：① 防腐=d ② 解耦=d ③ 度量=d'
    );
    assertTrue(rewritten !== orig, 'fixture 失效：未定位插入点');
    fs.writeFileSync(DOC, rewritten);
    const f = freshFacts();
    assertEqual(f.stageProtection, BLoat.LIMITS.stageProtection, '结构度量应仍 12（不数计划外段）');
    assertEqual(
      f.stageDecls,
      BLoat.LIMITS.stageProtection + 1,
      '环节子句段数应为 13（含计划外段）'
    );
    const { errors } = BLoat.checkBloat(f);
    assertTrue(
      errors.some(e => /F1 环节覆盖声明数异常/.test(e)),
      '计划外环节段应报红（环节膨胀），实际：' + JSON.stringify(errors)
    );
  } finally {
    fs.writeFileSync(DOC, orig);
  }
});

// ============ F3 回归（PR #317 评审 F3）：结构度量不受说明行同字面干扰 ============
test('变异自证 F3：说明行含「本环节：」不得触发 F1 误报（结构度量）', function () {
  const DOC = path.join(ROOT, 'docs', 'NPC_TEAM.md');
  const orig = fs.readFileSync(DOC, 'utf8');
  try {
    // 在【流水线】段头说明行里**追加**一处「本环节：」字面（说明行原文已含该字面，故此处按追加构造）——
    // 字面计数 +1，但**环节覆盖数不应变**（结构度量只数子句段）。
    const rewritten = orig.replace(
      '答不出即本环节未真实执行**）】',
      '答不出即本环节：未真实执行**）】'
    );
    assertTrue(rewritten !== orig, 'fixture 失效：未找到【流水线】说明行');
    fs.writeFileSync(DOC, rewritten);
    const f = freshFacts();
    assertEqual(
      f.stageProtection,
      BLoat.LIMITS.stageProtection,
      'F1 结构度量应不变（说明行同字面不改变环节覆盖数）'
    );
    // 基线字面计数 = 段头 1 处 + N 个环节声明各 1 处；本次变异在段头**追加**一处 → +1。
    assertEqual(
      f.stageProtectionLiteral,
      BLoat.LIMITS.stageProtection + 2,
      '字面计数应 +1（仅诊断用；基线 = 段头 1 + N 个环节声明）'
    );
    assertEqual(
      f.stageDecls,
      BLoat.LIMITS.stageProtection,
      '环节子句段数应不变（说明行同字面不在子句段内，不计入）'
    );
    const { errors } = BLoat.checkBloat(f);
    assertTrue(
      !errors.some(e => /F1 环节覆盖/.test(e)),
      '说明行同字面不得触发 F1 报红（子句段度量），实际：' + JSON.stringify(errors)
    );
  } finally {
    fs.writeFileSync(DOC, orig); // 无条件还原
  }
});

// ============ 名实一致：断言清单文案与实际断言数一致 ============
// R1-K2/K3 修复（本轮评审）：原实现把「标签字母域」硬编码为 `[A-G]`（跟随当前最大字母），
//   ① 下次新增 H 类断言须手改域，且**不改就漏检**（H 域外）；
//   ② 只比「数量」不比「集合」，新增断言而复用现有字母（如 G2）且声明数量不动 → 静默放过。
//   修复：域改为**开集**（任意字母+数字），并从守卫头注释的**声明清单**反向核对
//   「声明 = 实测」——名实一致须是「集合相等」而非「数量相等」（铁律 24 第 5 维 名实一致 + 口径唯一）。
test('名实一致：守卫头注释声明的「类断言」清单与实际断言标签集合一致', function () {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'), 'utf8');
  const inCheck = src.slice(src.indexOf('function checkBloat'), src.indexOf('module.exports'));
  // 口径唯一（R2 复评修复）：标签只从 **errors.push 的错误文案**中抽取（`\`X1 …\`` 形式），
  //   不得从注释里抽（否则注释中的「R1」会被误当标签 → 假红）。
  const pushMsgs = [...inCheck.matchAll(/errors\.push\(\s*`([A-Z]\d[a-z]?) /g)].map(m => m[1]);
  const labels = [...new Set(pushMsgs)].sort();
  // 头注释声明的清单（A1/B1/... 段）——与实测标签做**集合**比较，而非数量比较
  const declaredListMatch = src.match(/\*\s*\d+\s*类断言（([^）]*)）/);
  // 注记剥离（R10-B1）：清单后可附「；唯一来源 = …」说明，不属于类目标签（只取「；」之前）。
  assertTrue(!!declaredListMatch, '头注释应声明类断言清单（形如「N 类断言（A1/B1/…）」）');
  const declared = declaredListMatch[1]
    .split('；')[0]
    .split('/')
    .map(x => x.trim())
    .filter(Boolean)
    .sort();
  assertEqual(
    labels.join(','),
    declared.join(','),
    '头注释声明的类断言清单应与 checkBloat 实际标签集合完全一致（集合相等，非仅数量相等）'
  );
  // R10-B1（铁律 24 第 7 维②「不变量必须归属门禁」+ 第 5 维②「口径唯一」）：
  //   上一版只比「头注释 vs 运行期标签」——**类目表 ASSERTION_CLASSES 完全没被校验**，
  //   于是「头注释与运行期都漏了同一类」会静默通过（= 不变量无主）。
  //   现把**唯一来源表**也拉进来做三方集合相等：类目表 = 头注释 = 运行期标签。
  const tableLabels = Object.keys(BLoat.ASSERTION_CLASSES).sort();
  assertEqual(
    tableLabels.join(','),
    declared.join(','),
    'ASSERTION_CLASSES（唯一来源）应与头注释声明集合相等（否则「同一语义两处各写一份」）'
  );
  assertEqual(
    tableLabels.join(','),
    labels.join(','),
    'ASSERTION_CLASSES 应与 checkBloat 运行期标签集合相等（类目表不含空类目、不遗漏实断言）'
  );
});

test('变异自证 名实一致：新增一类断言但 HEAD 声明不同步须报红（防「数量相等」漏检）', function () {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'), 'utf8');
  // 注入一条 G2 断言文案（复用字母、数量不变）→ 集合比较必须报红
  const anchor = '  // D1 未登记引用（登记表只保证';
  const mut = src.replace(anchor, '  if (false) errors.push(`G2 假断言`);\n' + anchor);
  assertTrue(mut !== src, 'fixture 失效：未定位到注入点');
  const inCheck = mut.slice(mut.indexOf('function checkBloat'), mut.indexOf('module.exports'));
  const labels = [
    ...new Set([...inCheck.matchAll(/errors\.push\(\s*`([A-Z]\d[a-z]?) /g)].map(m => m[1])),
  ].sort();
  const declared = src
    .match(/\*\s*\d+\s*类断言（([^）]*)）/)[1]
    .split('/')
    .map(x => x.trim())
    .filter(Boolean)
    .sort();
  assertTrue(
    labels.join(',') !== declared.join(','),
    '新增 G2 断言后集合应不一致（若仍相等，说明断言只比数量 → 漏检）'
  );
});

// ============ D2 变异自证：引用登记表膨胀 ============
test('变异自证 D2：引用登记表膨胀应报红', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      f.knownRefsCount = 61;
      return f;
    },
    /D2 引用登记表膨胀/,
    'D2'
  );
});

// ============ 单一契约：口径不得被复制实现 ============
test('单一契约：LIMITS 为唯一阈值源且被 checkBloat 消费', function () {
  assertTrue(typeof BLoat.LIMITS === 'object', 'LIMITS 应导出');
  assertTrue(typeof BLoat.collectFacts === 'function', 'collectFacts 应导出');
  assertTrue(typeof BLoat.checkBloat === 'function', 'checkBloat 应导出');
  // 反向保护：阈值被清零/置极大时断言必须仍然生效（防「把阈值调大即静默放行」）
  const f = snapshot(BLOAT);
  const mutated = Object.assign({}, f, { ruleCount: BLoat.LIMITS.ruleCount + 50 });
  assertTrue(
    BLoat.checkBloat(mutated).errors.some(e => /B1 铁律条目数超上限/.test(e)),
    '阈值消费链应真实生效'
  );
});

// ============ G1 文档级腐肉（#314 启发：防腐不豁免「承载提示词的文档」） ============
// 背景：#314 的实测给出一个可复用的判据 —— 「同一约定被抄成多份后必然失同步」（腐肉）。
// 守卫的 C1 只扫**提示词正文**（docs/NPC_TEAM.md 锚点代码块内），而该文档的锚点**之外**正文
// （快速开始/工作流程/门禁表/有效性测试/注意事项）此前**无人去重**：即「防腐守卫自己不防腐」。
//
// Issue #314 comment 2099345506 的 i1「概念无主」教训（本轮吸取）：上述去重**此前只由本测试文件断言**，
// 守卫 CLI（= CI 门禁 `npm run validate:npc-team-bloat`）对文档级重复长行**静默放行** ——
// 即「不变量无主、门禁不覆盖」，与「同一约定被抄成多份」同构。本轮把该口径**升格为守卫第一类断言 G1**，
// 使门禁本尊拥有它；本测试只做**变异自证**（不再承载口径本身）。
//
// 单源纪律：本用例**不复制**守卫的归一化/计数逻辑，而是消费：
//   - `snapshot(BLOAT).docDuplicateLines`（守卫的度量出口，经单一出口模块）
//   - `BLoat.DOC_LONG_LINE_MIN`（守卫的阈值唯一来源）
// 若守卫口径演进，本用例随之演进，不会各自漂移（这正是要防的腐烂）。
const DOC_FILE = path.join(ROOT, 'docs', 'NPC_TEAM.md');
const DOC_DUP_LIMIT = BLoat.LIMITS.docDuplicateLines;

test('G1 文档级腐肉：守卫本尊须拥有该断言（不得只由测试承载 → 契约无主）', function () {
  // 名实一致自证：G1 必须在**守卫**里出现（错误文案含 G1 标签），而非只在测试中
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js'), 'utf8');
  const inCheck = src.slice(src.indexOf('function checkBloat'), src.indexOf('module.exports'));
  assertTrue(/G1 /.test(inCheck), '守卫 checkBloat 须含 G1 断言（否则文档级腐肉无人守卫）');
  assertTrue(
    typeof BLoat.DOC_LONG_LINE_MIN === 'number',
    'DOC_LONG_LINE_MIN 应由守卫导出（阈值唯一来源）'
  );
  assertEqual(
    typeof snapshot(BLOAT).docDuplicateLines,
    'number',
    '守卫应度量 docDuplicateLines（供断言消费）'
  );
});

test('正向：docs/NPC_TEAM.md 全文无重复长行（当前基线，走守卫度量出口）', function () {
  assertEqual(
    snapshot(BLOAT).docDuplicateLines,
    DOC_DUP_LIMIT,
    '文档出现重复长行（腐肉，与提示词同口径判红）'
  );
});

test('变异自证 G1（真实端到端）：把长行复制到文档正文后，守卫 CLI 本尊须由绿转红', function () {
  const orig = fs.readFileSync(DOC_FILE, 'utf8');
  try {
    // 取文档中一条长度 ≥ 阈值的长行，复制到文档末尾（模拟「抄一份到别处」）
    const longLine = orig
      .split('\n')
      .find(l => l.trim().length >= BLoat.DOC_LONG_LINE_MIN && /^\d+\.\s/.test(l.trim()));
    assertTrue(!!longLine, 'fixture 失效：未能在文档中找到可用于复制的长行');
    fs.writeFileSync(DOC_FILE, orig + '\n' + longLine + '\n');
    const facts = freshFacts();
    assertTrue(facts.docDuplicateLines >= 1, '复制一部长行后应被判为重复（口径写空 → 假绿）');
    const { errors } = BLoat.checkBloat(facts);
    assertTrue(
      errors.some(e => /G1 /.test(e)),
      '守卫本尊须报 G1（不得仅在测试层报红），实际：' + JSON.stringify(errors)
    );
    // 真实链路自证：直接跑守卫 CLI（CI 门禁用的就是它），须 exit 1
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assertEqual(r.status, 1, '守卫 CLI 须 exit 1（真实门禁链路），实际 exit ' + r.status);
    assertTrue(/G1 /.test(r.stderr || ''), '守卫 CLI stderr 须含 G1 报错');
  } finally {
    fs.writeFileSync(DOC_FILE, orig); // 无条件还原，防污染工作区
  }
});

// ============ B1b：铁律 24「防腐维数」名实一致（R10-B1）============
test('B1b 正向：守卫代码内的防腐维数不超过断言类目数（唯一来源 = ASSERTION_CLASSES）', function () {
  const facts = snapshot(BLOAT);
  assertTrue(facts.guardDimMax > 0, '应能从守卫源码测到「第 N 维」维数（否则判据空转）');
  assertTrue(
    facts.guardDimMax <= BLoat.LIMITS.ruleDimensions,
    '防腐维数应 ≤ 断言类目数，实际：' + facts.guardDimMax + ' / ' + BLoat.LIMITS.ruleDimensions
  );
});

test('变异自证 B1b：守卫出现未登记类目的新维数应报红（防「文案说 N 类、实际 M 类」）', function () {
  const facts = snapshot(BLOAT);
  assertBlocks(
    facts,
    f => {
      // 模拟「提示词/守卫新增一维但类目表未同步登记」
      f.guardDimMax = BLoat.LIMITS.ruleDimensions + 1;
      return f;
    },
    /B1b /,
    '新增一维而未登记类目应报红'
  );
});

test('变异自证 B1b：文案声明类目数与守则维数不同步须报红（真实链路：改源码后重测）', function () {
  // 真实链路（铁律 24 第 7 维③）：把守卫源码里一个真实存在的「第 N 维」引用改成大于类目数的编号，
  //   运行期测量必须跳到该编号 → 报 B1b；还原后恢复绿。
  //   ⚠️ Issue #352 第七刀修复：原实现注入的是**中文数字**「第一维/第十二维」，而守卫源码中的
  //   维数引用一律是**阿拉伯数字**（如「第 7 维」，B1b 正则也只认 `\d+`）⇒ 该 `replace` 恒为 no-op、
  //   断言恒红。更有甚者，本块原先位于「汇总 + process.exit」**之后** = 从不执行（死代码，
  //   故该缺陷此前从未暴露）。本轮把汇总块移回文件末尾（让本类断言真正被执行）并改为
  //   注入真实存在的阿拉伯数字维数。
  const guardPath = path.join(ROOT, 'scripts', 'validate-npc-team-bloat.js');
  const orig = fs.readFileSync(guardPath, 'utf8');
  const over = BLoat.LIMITS.ruleDimensions + 3; // 大于类目数，确保报 B1b
  const mutated = orig.replace(/第\s*7\s*维/, '第 ' + over + ' 维');
  assertTrue(mutated !== orig, 'fixture 失效：守卫源码中未定位到可注入的阿拉伯数字维数引用');
  try {
    fs.writeFileSync(guardPath, mutated);
    const mut = requireFresh(guardPath);
    const facts = freshFacts();
    const { errors } = mut.checkBloat(facts);
    assertTrue(
      facts.guardDimMax >= over,
      '运行期应测到 ' + over + ' 维，实际：' + facts.guardDimMax
    );
    assertTrue(
      errors.some(e => /B1b /.test(e)),
      '维数超类目数应报红，实际：' + JSON.stringify(errors)
    );
  } finally {
    fs.writeFileSync(guardPath, orig);
    evict([BLOAT, BLoat]);
    requireFresh(guardPath);
  }
});

// ---- 汇总 ----
console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');
if (passCount === testCount) {
  console.log('\n✓ NPC Team 提示词防腐守卫回归测试全部通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
