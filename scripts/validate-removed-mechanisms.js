#!/usr/bin/env node
/**
 * 文档形态漂移守卫（Issue #359 元问题收口）：两条同族判据 ——
 *   ① **已删机制**非历史区的现在时陈述（#357）：机制删了、描述没删 ⇒ 文档成「第二份真值」
 *      （实测：`docs/USAGE.md` 曾写「首次初始化**自动分批落盘**」而该机制已删）。
 *   ② **断档编号**（#353 / 第十二刀）：引用了 `governance.js` 并不存在的治理规则编号
 *      （如 P16/P17/P25）⇒ 按编号去源码查**查不到**（实测注入 `P16` 时全部守卫全绿）。
 * 二者同族：**文档的「名」与实现的真值之间无连通断言** —— 编号/机制描述不是代码符号，
 * 天然落在 `validate:semantic-anchor-scope`（轴 I，以**代码形态**符号为归属主判据）的自限之外。
 *
 * 双向口径（防作弊口袋）：非历史区命中 ⇒ 报红；历史区命中但**缺显式标注** ⇒ 同样报红。
 * 单一来源：数据单源 = `doc-drift-manifest.js`（含编号派生口径）；判据纯函数 = `doc-drift-scope.js`；
 * 覆盖范围 = `guard-scopes.js`；本文件只做编排 + IO（合法编号集合运行时从源码派生，不手写清单）。
 *
 * 用法：node scripts/validate-removed-mechanisms.js [--root <dir>] [--json]
 * 退出码：0 = 通过；1 = 存在违规
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { GUARD_SCOPES, REMOVED_MECHANISMS_SCRIPT } = require('./lib/guard-scopes.js');
const {
  REMOVED_MECHANISM_KEYWORDS,
  RULE_REF_DERIVE,
  deriveValidRuleIds,
  DOC_SCAN_FILES,
  HISTORICAL_FULL_FILES,
  HISTORICAL_SECTION_ANCHORS,
  ANNOTATION_MARKERS,
  ACTIVE_VOICE_MARKERS,
} = require('./lib/doc-drift-manifest.js');
const { checkRemovedMechanisms, checkDanglingRuleRefs } = require('./lib/doc-drift-scope.js');

const SELF_SCOPE = GUARD_SCOPES.find(s => s.script === REMOVED_MECHANISMS_SCRIPT);
if (!SELF_SCOPE) {
  console.error(
    `❌ lib/guard-scopes.js 的 GUARD_SCOPES 中未登记本守卫（${REMOVED_MECHANISMS_SCRIPT}）——` +
      `覆盖声明必须有真实执行者。`
  );
  process.exit(1);
}
for (const rel of DOC_SCAN_FILES) {
  if (!(SELF_SCOPE.matchers || []).some(m => m(rel))) {
    console.error(`❌ 本守卫实际校验 ${rel}，但覆盖声明未包含它 —— 声明与实做必须同源。`);
    process.exit(1);
  }
}

const argIdx = process.argv.indexOf('--root');
const rootDir =
  argIdx !== -1 && process.argv[argIdx + 1]
    ? path.resolve(process.argv[argIdx + 1])
    : path.resolve(__dirname, '..');

// 派生合法编号集合（唯一事实源 = governance.js 头部规则声明行）；不做第二份编号清单，
// 源缺失 ⇒ 报红而非静默跳过（防「源头没了，判据装作通过」）。
const errors = [];
const validRuleIds = new Set();
const deriveSrc = path.join(rootDir, RULE_REF_DERIVE.source);
if (!fs.existsSync(deriveSrc))
  errors.push(`[断档编号] 唯一事实源 ${RULE_REF_DERIVE.source} 不存在 —— 无法派生合法编号集合；源头缺失时必须报红（不得静默跳过，否则门禁消失）`);
else for (const id of deriveValidRuleIds(fs.readFileSync(deriveSrc, 'utf8'))) validRuleIds.add(id);
const scanned = [];
for (const rel of DOC_SCAN_FILES) {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) continue;
  scanned.push(rel);
  const file = { path: rel, text: fs.readFileSync(abs, 'utf8') };
  errors.push(
    ...checkRemovedMechanisms(
      file,
      REMOVED_MECHANISM_KEYWORDS,
      HISTORICAL_FULL_FILES,
      HISTORICAL_SECTION_ANCHORS,
      ANNOTATION_MARKERS,
      ACTIVE_VOICE_MARKERS
    ),
    ...checkDanglingRuleRefs(
      file,
      validRuleIds,
      HISTORICAL_FULL_FILES,
      HISTORICAL_SECTION_ANCHORS,
      ANNOTATION_MARKERS,
      RULE_REF_DERIVE
    )
  );
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ scanned, errors }, null, 2));
  process.exit(errors.length > 0 ? 1 : 0);
}

console.log('【文档形态漂移】① 已删机制的现在时陈述（#357）+ ② 断档编号（#353）（Issue #359）');
console.log(
  `  扫描文档: ${scanned.length} 份 / 已删机制关键词 ${REMOVED_MECHANISM_KEYWORDS.length} 个` +
    ` / 合法编号 ${validRuleIds.size} 个（派生自 ${RULE_REF_DERIVE.source}）` +
    `（全文豁免：${HISTORICAL_FULL_FILES.join(' / ')}）`
);
if (errors.length > 0) {
  console.error('\n❌ 文档形态漂移违规（已删机制 / 断档编号）：');
  for (const e of errors) console.error('   - ' + e);
  console.error(
    '\n  ⇒ 修复：删掉该描述，或移入**历史存档区**并加显式标注（「历史存档」/「已删除」/「机制已删除」）。'
  );
  process.exit(1);
}
console.log(
  '  ✅ ① 非历史区无已删机制的现在时陈述；历史区命中均带显式标注且无行内自相矛盾\n' +
    '  ✅ ② 全文档树未引用源码中不存在的治理规则编号（合法集合派生自源码，非手写清单）\n' +
    '  ⚠️ 自限披露（残余，如实记账，与判据模块同措辞）：\n' +
    '     ① 只拦**关键词命中**，换一种说法描述同一已删机制的「隐性同义描述」不声称拦住；\n' +
    '     ② 自相矛盾判定只作用于**命中关键词的那一行** —— 现行时断言词出现在**另一行**\n' +
    '     （同段落相邻行 / 跨段落，实测 EXIT=0）不声称拦住（行内已由第十一刀收口，\n' +
    '     见 doc-drift-manifest.js 的 ACTIVE_VOICE_MARKERS；该表缺传时本守卫**报红**而非静默跳过）。\n' +
    '     ③（断档编号，第十二刀新增）只拦 `P/G/T + 数字` **半角** token 形态（含小写后缀如 `P16b`）；\n' +
    '     全角编号（`Ｐ１６`）与「第 16 条规则」之类的自然语言指代不声称拦住（全仓实测零出现）；\n' +
    '     只校验**编号是否存在**，不校验「该编号用得对不对」（需人工评审）。\n' +
    '     ④ 扫描范围限于 `DOC_SCAN_FILES`；Issue #382 已把 **AI 可见面**（`skills/*/SKILL.md` /\n' +
    '     `agents/*.md`）纳入 —— 原缺口即「已删机制陈述在 AI 每会话必读的文件里存活」。\n' +
    '     Issue #388 13/13 复盘再纳入 **`docs/releases/*.md`**（发布说明归档，**机械枚举**，\n' +
    '     新增一份自动进面）—— 原缺口即「#393 修的同类漂移无守卫兜底、评审偶然抓到」。\n' +
    '     仍未纳入：`docs/CODE_REVIEW_GUIDE.md` 等含 `P0/P95` 优先级语境的文件（纳入会大量假红）；\n' +
    '     以及 `opencode-wps/README.md` / `opencode-wps-assistant/` / `opencode-wps-linux/` 等\n' +
    '     子目录文档（纳入需另评一批新命中，不擅自扩面 —— 铁律 17⑨）。'
);
