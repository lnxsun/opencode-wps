/**
 * 已删机制守卫回归测试（Issue #359「文档形态盲区」的落地守卫）。
 *
 * 守护对象：
 *   · `scripts/validate-removed-mechanisms.js` —— ① 已删机制的非历史区现在时陈述（#357）；
 *                                              ② 断档编号（#353，第十二刀）；
 *   · `scripts/lib/doc-drift-scope.js`          —— 判据纯函数；
 *   · `scripts/lib/doc-drift-manifest.js`       —— 数据单源。
 *
 * 立项命题（#359 核心洞察）：现有守卫覆盖的是**代码形态**的同一语义多处写；
 * 「已删机制描述」不是代码符号 ⇒ 天然落在轴 I 自限之外（本批 6 条全部落在该自限里）。
 * 本测试是该文档守卫的**执行者**（铁律 24 第 7 维②：声明与执行者同时存在）。
 *
 * 运行：node tests/validate-doc-drift.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const REM_CLI = path.join(rootDir, 'scripts', 'validate-removed-mechanisms.js');
const {
  isInHistoricalSection,
  checkRemovedMechanisms,
  checkDanglingRuleRefs,
} = require('../scripts/lib/doc-drift-scope.js');
const {
  REMOVED_MECHANISM_KEYWORDS,
  RULE_REF_DERIVE,
  deriveValidRuleIds,
  HISTORICAL_FULL_FILES,
  HISTORICAL_SECTION_ANCHORS,
  ANNOTATION_MARKERS,
  ACTIVE_VOICE_MARKERS,
} = require('../scripts/lib/doc-drift-manifest.js');

// 派生合法编号集合：**消费单源实现** `deriveValidRuleIds`（不在此重写第二份派生），
// 与守卫 CLI 完全同口径。
const VALID_IDS = deriveValidRuleIds(
  fs.readFileSync(path.join(rootDir, RULE_REF_DERIVE.source), 'utf8')
);

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
function runGuard(cli) {
  const r = spawnSync(process.execPath, [cli], { cwd: rootDir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/** 临时变异某文档并**无条件还原**（防污染工作区） */
function withFileMutation(rel, fn) {
  const abs = path.join(rootDir, rel);
  const orig = fs.readFileSync(abs, 'utf8');
  try {
    const next = fn(orig);
    assertTrue(next !== orig, '变异必须真的改动源文件（否则探针失效）');
    fs.writeFileSync(abs, next);
    return { rem: runGuard(REM_CLI) };
  } finally {
    fs.writeFileSync(abs, orig);
  }
}

// ==================== 基线 ====================
console.log('\n基线 — 真实仓库：两条守卫 CLI 本尊 exit 0');
test('基线：已删机制守卫通过', () => {
  const { code, out } = runGuard(REM_CLI);
  assertEqual(code, 0, '守卫应通过，实际：\n' + out);
});

// ==================== 判据 B：已删机制 ====================
console.log('\n判据 B — 已删机制的非历史区现在时陈述（#357 剩余面）');
test('判据 B：非历史区命中 → 报红', () => {
  const e = checkRemovedMechanisms(
    { path: 'x.md', text: '`proofreadAccumulate` 首次初始化自动分批落盘' },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertTrue(e.length > 0, '非历史区命中应报红');
});
test('判据 B：历史区 + 显式标注 → 不报红（合法历史记录）', () => {
  const text = [
    '# 历史存档（现行机制已删除）',
    '- 曾用 `generateAutoBatches` 自动分批落盘（已删除）',
  ].join('\n');
  const e = checkRemovedMechanisms(
    { path: 'x.md', text },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertEqual(e.length, 0, '历史区带标注应放行');
});
test('判据 B：历史区但**缺显式标注** → 报红（防「挪进历史区即豁免」）', () => {
  const text = ['# 历史存档', '- 曾用 `generateAutoBatches` 自动分批（无标注词）'].join('\n');
  const e = checkRemovedMechanisms(
    { path: 'x.md', text },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertTrue(e.length > 0, '历史区缺标注必须报红');
});
test('判据 B：标题是段落硬边界（「历史存档」不得向下无限延伸）', () => {
  const lines = ['# 历史存档', '- 旧机制', '', '## 现行机制', '自动分批落盘'];
  assertTrue(isInHistoricalSection(lines, 4, HISTORICAL_SECTION_ANCHORS) === false, '标题后应重置');
  assertTrue(isInHistoricalSection(lines, 1, HISTORICAL_SECTION_ANCHORS) === true, '标注后应命中');
});

// ==================== 第十一刀：自限②「可收口的部分」+ 洞 A ====================
console.log('\n第十一刀 — 标注与陈述行内自相矛盾 / 非历史区靠「顺带写已删除」逃逸');
test('洞 A：**非历史区**顺带写「已删除」不得逃逸（原判据 annotated 先短路）', () => {
  const e = checkRemovedMechanisms(
    { path: 'x.md', text: '本系统仍在使用自动分批落盘（另两个旧机制已删除）。' },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertTrue(e.length > 0, '非历史区带「已删除」字样仍应报红');
});
test('自限②：历史区 + 标注 + 行内「仍生效」⇒ 报红（自相矛盾）', () => {
  const text = ['## 历史存档', '（历史存档）本机制仍生效，推荐使用自动分批落盘。'].join('\n');
  const e = checkRemovedMechanisms(
    { path: 'x.md', text },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertTrue(e.length > 0, '行内自相矛盾必须报红');
  assertTrue(
    e.some(x => x.includes('自相矛盾')),
    '应报「自相矛盾」'
  );
});
test('自限②：历史区 + 标注 + 无现行时断言 ⇒ 仍放行（不误伤合法历史记录）', () => {
  const text = ['## 历史存档', '- 曾用自动分批落盘（机制已删除，历史存档）。'].join('\n');
  const e = checkRemovedMechanisms(
    { path: 'x.md', text },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertEqual(e.length, 0, '合法历史记录不得误报');
});
test('自限②：现行时断言词表非空且单一来源（数据单源，不得在判据里再抄一份）', () => {
  assertTrue(ACTIVE_VOICE_MARKERS.length > 0, '必填');
  const scope = fs.readFileSync(path.join(rootDir, 'scripts/lib/doc-drift-scope.js'), 'utf8');
  // 判据模块**注释**中提及（自限披露）是允许的；禁止的是**再声明一份数组字面量**。
  assertTrue(
    !/ACTIVE_VOICE_MARKERS\s*=\s*\[/.test(scope),
    '判据模块不得自写第二份断言词表（须由单源传入）'
  );
  assertTrue(!/const\s+\w+\s*=\s*\[\s*'仍生效'/.test(scope), '判据模块不得自写第二份断言词数组');
});

test('评审判据：**缺传** ACTIVE_VOICE_MARKERS ⇒ 报红（防「漏参 ⇒ 判据静默降级」假绿）', () => {
  // 实测反例：原实现 `(activeVoiceMarkers || [])` 漏参时静默跳过 ⇒ 守卫 EXIT=0 + 专测全绿。
  const e = checkRemovedMechanisms(
    { path: 'x.md', text: '## 历史存档\n（历史存档）本机制仍生效，推荐使用自动分批落盘。' },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS
    // 故意不传第 6 参
  );
  assertTrue(e.length > 0, '缺传单源必须报红（不得静默降级）');
  assertTrue(
    e.some(x => x.includes('activeVoiceMarkers')),
    '报错应点明缺传的参数名'
  );
});
test('评审判据：**缺传**时守卫 CLI 端到端亦报红（真实链路，非仅判据直调）', () => {
  const src = fs.readFileSync(REM_CLI, 'utf8');
  // 断言 CLI **确实**传了该单源（少传即漏参 ⇒ 守卫静默失效）
  assertTrue(
    /ACTIVE_VOICE_MARKERS\s*\n?\s*\)/.test(src) || src.includes('ACTIVE_VOICE_MARKERS'),
    '守卫 CLI 必须把 ACTIVE_VOICE_MARKERS 传入判据'
  );
  // ⚠️ 只断言**代码**里不得兜底（注释里如实披露「原实现曾 || [] 兜底」是允许的、也是要求留痕的）。
  const scope = fs.readFileSync(path.join(rootDir, 'scripts/lib/doc-drift-scope.js'), 'utf8');
  const codeOnly = scope
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
  assertTrue(
    !/activeVoiceMarkers\s*\|\|\s*\[\]/.test(codeOnly),
    '判据模块代码里不得对 activeVoiceMarkers 做 || [] 兜底（那正是静默降级入口）'
  );
  assertTrue(
    /!Array\.isArray\(activeVoiceMarkers\)/.test(codeOnly),
    '判据模块必须显式断言「该单源已传入」'
  );
});
test('残余自限措辞与实测一致：同段落相邻行不拦（如实披露，非放宽）', () => {
  // 判据只作用于「命中关键词的那一行」⇒ 现行时词在**另一行**时不拦（已如实披露）。
  const text = [
    '## 历史存档',
    '（历史存档）本系统自动分批落盘（机制已删除）。',
    '本系统仍在用该能力。',
  ].join('\n');
  const e = checkRemovedMechanisms(
    { path: 'x.md', text },
    REMOVED_MECHANISM_KEYWORDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    ACTIVE_VOICE_MARKERS
  );
  assertEqual(e.length, 0, '相邻行形态实测不拦 ⇒ 措辞必须与实测一致（不得声称拦住）');
});

// ==================== 判据 C：断档编号（#353 / 第十二刀）====================
console.log('\n判据 C — 断档编号（引用源码中不存在的治理规则编号，#353 同族）');
/** 判据 C 直调便捷入口 */
function dangling(text, ids) {
  return checkDanglingRuleRefs(
    { path: 'x.md', text },
    ids || VALID_IDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS,
    RULE_REF_DERIVE
  );
}
test('判据 C：合法编号集合派生自 governance.js（非手写清单，实测恰为源码声明数）', () => {
  assertTrue(VALID_IDS.size > 0, '派生集合不得为空');
  // Issue #382：G1 已随 DECISION-1 删除（合法集合派生自源码，故不再含 G1）⇒ 探针改用常驻编号。
  assertTrue(VALID_IDS.has('P2') && VALID_IDS.has('G2') && VALID_IDS.has('T1'), '应含现存编号');
  assertTrue(!VALID_IDS.has('G1'), 'G1 已删除，合法集合不得再含它（派生自源码，非手写）');
  assertTrue(!VALID_IDS.has('P16') && !VALID_IDS.has('P25'), '已归并编号不得出现在合法集合');
});
test('判据 C：非历史区引用不存在编号 → 报红', () => {
  const e = dangling('校对流程由治理插件 P16 拦截。');
  assertTrue(e.length > 0, 'P16 不在源码 ⇒ 必须报红');
  assertTrue(e[0].includes('断档编号') && e[0].includes('P16'), '报错应点明编号');
});
test('判据 C：合法编号 → 放行（不误伤）', () => {
  assertEqual(dangling('校对流程由治理插件 P2 拦截。').length, 0, 'P2 合法应放行');
});
test('判据 C：问题 ID 前缀 `P0-1` 不误判（负向断言 (?![-_])）', () => {
  const e = dangling('| **P0-1 零修复**：用截断标记作 findText | 现归 **P3** |');
  assertEqual(e.length, 0, 'P0-1 是问题 ID 而非规则编号，不得误报');
});
test('判据 C：区间写法 `G1-G7` 的**首编号**也不漏判（第 1 轮评审 F1 锁）', () => {
  // 原 (?![-_]) 过宽 ⇒ 实测只检出 G7、吞掉 G1。区间写法在本仓文档大量使用 ⇒ 必须锁住。
  const e = dangling('治理规则 G1-G7 完整生效。', new Set(['P2']));
  const ids = [...new Set(e.flatMap(x => x.match(/`\w+`/g) || []))];
  assertTrue(ids.includes('`G1`'), '区间首编号 G1 必须检出（原缺陷：被负向断言吞掉）');
  assertTrue(ids.includes('`G7`'), '区间末编号 G7 必须检出');
});
test('判据 C：区间 `P16-P18` 两端均检出（第 1 轮评审 F1 锁）', () => {
  const e = dangling('P16-P18 已归并。', new Set(['P2']));
  const ids = [...new Set(e.flatMap(x => x.match(/`\w+`/g) || []))];
  assertTrue(ids.includes('`P16`') && ids.includes('`P18`'), '区间两端均须检出');
});
test('判据 C：派生实现**单源**（专测与 CLI 共用 `deriveValidRuleIds`，不重写第二份）', () => {
  // 断言专测里确有一条 for-matchAll 的自写派生（即第二份实现）——若有则报错。
  const t = fs.readFileSync(__filename, 'utf8');
  assertTrue(t.includes('deriveValidRuleIds'), '专测必须消费单源派生实现 deriveValidRuleIds');
  assertTrue(
    !/matchAll\([^)]*declaration/.test(t),
    '专测不得自写第二份派生（matchAll declaration）——须调单源'
  );
});
test('判据 C：历史区无显式标注 → 报红（防「挪进历史区即豁免」）', () => {
  const e = dangling('# 历史存档\n\n校对流程由治理插件 P16 拦截。');
  assertTrue(e.length > 0, '历史区缺标注必须报红');
});
test('判据 C：历史区 + 显式标注 → 放行（合法历史记录）', () => {
  // ⚠️ 标注须在**命中行**（与判据 B 同口径：判据只作用于命中关键词的那一行）。
  const e = dangling('# 历史存档\n\n（历史存档）曾用治理插件 P16 拦截，编号仅作历史坐标。');
  assertEqual(e.length, 0, '历史区带标注应放行');
});
test('判据 C：合法编号集合为空 ⇒ 报红（不得把「源头没了」当通过）', () => {
  const e = dangling('校对流程由治理插件 P2 拦截。', new Set());
  assertTrue(e.length > 0 && e[0].includes('为空'), '空集合必须报红而非误报/静默');
});
test('判据 C：**缺传** derive 单源 ⇒ 报红（防漏参静默降级，同判据 B）', () => {
  const e = checkDanglingRuleRefs(
    { path: 'x.md', text: '治理插件 P16 拦截。' },
    VALID_IDS,
    HISTORICAL_FULL_FILES,
    HISTORICAL_SECTION_ANCHORS,
    ANNOTATION_MARKERS
    // 故意不传 derive
  );
  assertTrue(e.length > 0 && e[0].includes('derive'), '缺传 derive 必须报红');
});
test('判据 C：判据模块内无编号清单字面量（单源，不写第二份）', () => {
  const scope = fs.readFileSync(path.join(rootDir, 'scripts/lib/doc-drift-scope.js'), 'utf8');
  const codeOnly = scope
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
  assertTrue(!/'P16'|"P16"|P16:/.test(codeOnly), '判据模块不得手写编号清单');
});

// ==================== 变异自证（真实 CLI 本尊）====================
console.log('\n变异自证 — 注入反例必须由绿转红（真实 CLI 链路）');
test('变异 1：向 docs/MCP.md 注入非历史区已删机制关键词 → 机制守卫 exit 1', () => {
  // ⚠️ 必须以**非历史区**文件为注入目标：FEATURES.md 尾部本身在「历史存档」小节内，
  //    注入进去会被合法豁免（探针失效）。
  const r = withFileMutation(
    'docs/MCP.md',
    s => s + '\n\n服务端会自动分批落盘，批次分配表永远非空。\n'
  );
  assertEqual(r.rem.code, 1, '注入已删机制必须报红：\n' + r.rem.out);
  assertTrue(r.rem.out.includes('已删机制'), '应报已删机制');
});
test('变异 2：注入后守卫复原仍绿（还原可靠，防污染工作区）', () => {
  assertEqual(runGuard(REM_CLI).code, 0, '还原后机制守卫应绿');
});
test('变异 3：向 docs/MCP.md 注入非历史区断档编号 P16 → 守卫 exit 1', () => {
  const r = withFileMutation('docs/MCP.md', s => s + '\n\n校对流程由治理插件 P16 拦截。\n');
  assertEqual(r.rem.code, 1, '注入断档编号必须报红：\n' + r.rem.out);
  assertTrue(r.rem.out.includes('断档编号'), '应报断档编号');
});
test('变异 4：注入历史区**无标注**断档编号 → 守卫 exit 1（防作弊口袋）', () => {
  const r = withFileMutation(
    'docs/MCP.md',
    s => s + '\n\n## 历史存档\n\n校对流程由治理插件 P16 拦截。\n'
  );
  assertEqual(r.rem.code, 1, '历史区缺标注必须报红：\n' + r.rem.out);
});
test('变异 5：注入历史区**带标注**断档编号 → 守卫仍 exit 0（不误伤合法历史记录）', () => {
  const r = withFileMutation(
    'docs/MCP.md',
    s => s + '\n\n## 历史存档\n\n（历史存档）曾用治理插件 P16 拦截，编号仅作历史坐标。\n'
  );
  assertEqual(r.rem.code, 0, '历史区带标注应放行：\n' + r.rem.out);
});
test('变异 6：注入合法编号 P2 → 守卫仍 exit 0（编号存在即放行）', () => {
  const r = withFileMutation('docs/MCP.md', s => s + '\n\n校对流程由治理插件 P2 拦截。\n');
  assertEqual(r.rem.code, 0, '合法编号应放行：\n' + r.rem.out);
});

// ==================== 发布说明归档入面（Issue #388 13/13 复盘加固）====================
console.log('\n发布说明归档 — `docs/releases/*.md` 机械枚举入面（#388 复盘加固）');
test('入面：`docs/releases/*.md` 被**机械枚举**进 DOC_SCAN_FILES（非手写清单）', () => {
  const {
    DOC_SCAN_FILES,
    discoverReleaseNoteFiles,
  } = require('../scripts/lib/doc-drift-manifest.js');
  const rel = discoverReleaseNoteFiles();
  assertTrue(rel.length > 0, '应枚举到发布说明文件');
  for (const f of rel) assertTrue(DOC_SCAN_FILES.includes(f), '未入面：' + f);
  assertTrue(
    rel.every(f => /^docs\/releases\/.+\.md$/.test(f)),
    '枚举口径应为 docs/releases/*.md'
  );
});
test('入面：机械枚举（新增一份发布说明即自动进面，无需登记动作）', () => {
  const abs = path.join(rootDir, 'docs', 'releases', '__probe__.md');
  const { discoverReleaseNoteFiles } = require('../scripts/lib/doc-drift-manifest.js');
  try {
    fs.writeFileSync(abs, '# probe\n');
    // 重新 require 以触发模块级枚举（清缓存后重载）
    delete require.cache[require.resolve('../scripts/lib/doc-drift-manifest.js')];
    const m2 = require('../scripts/lib/doc-drift-manifest.js');
    assertTrue(
      m2.discoverReleaseNoteFiles().includes('docs/releases/__probe__.md'),
      '新增发布说明应自动进面（机械枚举）'
    );
    assertTrue(
      m2.DOC_SCAN_FILES.includes('docs/releases/__probe__.md'),
      '新增发布说明应自动进 DOC_SCAN_FILES'
    );
  } finally {
    fs.unlinkSync(abs);
    delete require.cache[require.resolve('../scripts/lib/doc-drift-manifest.js')];
    require('../scripts/lib/doc-drift-manifest.js'); // 复原缓存
  }
});
test('变异 R-1：向发布说明注入断档编号 `G1` → 守卫 exit 1（#388 复盘堵漏）', () => {
  const r = withFileMutation('docs/releases/v1.11.0.md', s => s + '\n\n本段由 G1 规则守护。\n');
  assertEqual(
    r.rem.code,
    1,
    '发布说明内的断档编号应被拦（原缺口即「无守卫兜底」）：\n' + r.rem.out
  );
  assertTrue(/断档编号[\s\S]*docs\/releases\/v1\.11\.0\.md/.test(r.rem.out), '报红须指向该文件');
});
test('变异 R-2：注入后守卫复原仍绿（还原可靠，防污染工作区）', () => {
  const { code } = runGuard(REM_CLI);
  assertEqual(code, 0, '复原后应仍绿：\n');
});
test('变异 R-3：向发布说明注入**已删机制关键词** → 守卫 exit 1（同口径兜底）', () => {
  const r = withFileMutation(
    'docs/releases/v1.13.0.md',
    s => s + '\n\n首次初始化**自动分批落盘**。\n'
  );
  assertEqual(r.rem.code, 1, '发布说明内的已删机制现在时陈述应被拦：\n' + r.rem.out);
});
test('自限披露：扫描面自限 ④ 已如实登记 `docs/releases/*.md` 入面', () => {
  const src = fs.readFileSync(REM_CLI, 'utf8');
  assertTrue(src.includes('docs/releases/*.md'), '自限披露须点明发布说明入库');
  assertTrue(src.includes('opencode-wps-assistant'), '须如实披露仍未纳入的子目录文档');
});

// ==================== 覆盖声明有真实执行者（单源，Issue #359 防腐要求 3）====================
console.log('\n单源 — 覆盖声明必须有真实执行者（与 K7/轴 I 同口径）');
{
  const name = 'removed-mechanisms';
  test(`单源：${name} 在 GUARD_SCOPES 登记，且覆盖落点与实做同源`, () => {
    const { GUARD_SCOPES, DOC_DRIFT_PATHS } = require('../scripts/lib/guard-scopes.js');
    const s = GUARD_SCOPES.find(x => x.script === 'scripts/validate-removed-mechanisms.js');
    assertTrue(!!s, `${name} 必须在 GUARD_SCOPES 单源登记`);
    assertTrue(
      s.matchers.some(m => m('docs/FEATURES.md')),
      '覆盖声明必须含扫描落点'
    );
    assertTrue(
      fs.existsSync(path.join(rootDir, s.script)),
      '覆盖声明必须有真实执行者：' + s.script
    );
    assertTrue(DOC_DRIFT_PATHS.length >= 10, '扫描落点常量应登记');
  });
}
test('单源：守卫 CLI 消费判据单源（不得自写第二份提取实现）', () => {
  for (const cli of [REM_CLI]) {
    const src = fs.readFileSync(cli, 'utf8');
    assertTrue(src.includes('doc-drift-scope.js'), cli + ' 必须 require 判据单源');
    assertTrue(src.includes('doc-drift-manifest.js'), cli + ' 必须 require 数据单源');
    assertTrue(src.includes('guard-scopes.js'), cli + ' 必须 require 范围单源');
  }
});
test('单源：新守卫已进体量分母（机械枚举单源，防「不入分母即逃出闸门」）', () => {
  // 第五刀：体量分母的枚举单源下沉为 `scripts/lib/guard-sources.js`（体量闸门 / 轴 I / 测试三方共用），
  // 守卫文件**自动进分母**——本用例改为断言「机械枚举确实覆盖到它们」。
  const { discoverGuardSources } = require('../scripts/lib/guard-sources.js');
  const rels = discoverGuardSources();
  for (const f of [
    'scripts/validate-removed-mechanisms.js',
    'scripts/lib/doc-drift-manifest.js',
    'scripts/lib/doc-drift-scope.js',
  ])
    assertTrue(rels.includes(f), '机械枚举未覆盖：' + f);
});
test('单源：新守卫已接入 preflight（声明必须有执行者）', () => {
  const pkg = require('../package.json');
  assertTrue(
    pkg.scripts.preflight.includes('validate:removed-mechanisms'),
    'preflight 缺 removed-mechanisms'
  );
});
test('R2-6/R3-1：preflight 必须跑 MCP 集成测试（wps-office-mcp npm test），否则测试面 < 门禁面', () => {
  // Issue #395 评审实测：preflight 原只跑 `(cd wps-office-mcp && npm run lint)`，不含 `npm test`，
  // 使 skills-consistency 等**集成测试**不在提交门禁内 —— 本 PR 的 SKILL.md 改动正是靠这一缺口
  // 逃过 preflight「全绿」而 CI 会红。本断言锁住「门禁面 ≥ 集成测试面」。
  const pkg = require('../package.json');
  assertTrue(
    /\(cd wps-office-mcp && npm test\)/.test(pkg.scripts.preflight),
    'preflight 缺 MCP 集成测试 (cd wps-office-mcp && npm test)'
  );
});

// ==================== 汇总 ====================
console.log(`\n${passCount}/${testCount} 用例通过`);
if (failures.length > 0) {
  failures.forEach(f => console.error('  ✗ ' + f.name + ': ' + f.err.message));
  process.exit(1);
}
