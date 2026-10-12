/**
 * G3 app 归属表守卫（Issue #399 评审 R1-🔴A/🔴B）——「注册表 ⇔ 治理层派生表」双向闭合。
 *
 * 背景：G3「读前必写」需答「工具属于哪个 app」才能查对应 app 的「已读」标记。
 *   历史上治理层用关键词/前缀**猜**（先后两版黑名单），实测漏掉 9 个 Excel/PPT 写工具 ⇒ G3 恒拦。
 *   现改为「权威来源优先」：直连通道取工具名应用段（精确），网关裸短名查 `COM_ACTION_APP` 表
 *   （该表由 `gateway/com-actions.ts` 的 `COM_ACTIONS[].appType` **机械派生**）。
 *
 * 判据（三条，均为源码可验 + 双向）：
 *   A. **区块一致性**：`governance.js` 的 `COM_ACTION_APP` 区块 == 从注册表派生的结果（逐条相等；
 *      多写/漏写/改值均报红）—— 防「表与注册表各写一份」（同一语义两处写的复发形态）。
 *   B. **覆盖闭合**：注册表全集 ⊆ 表（`COM_ACTION_APP` 覆盖每一个 COM Action）——
 *      这使 `getAppType` 的兜底 `'word'` 在网关通道**不可达**（兜底降级为「不可达的断言」而非判据）。
 *   C. **无残留猜测**：`governance.js` 内**不得**再出现「按名字关键词/前缀猜 app」的旧形态
 *      （`/Slide|Cell|Range/` 之类 app 关键词正则、`startsWith('getCell')` 之类前缀白名单）——
 *      防「修一处、另一处悄悄加回」的自我许可通道。
 *
 * 变异自证在 `tests/validate-com-action-app.test.js`（注入反例 → 断言由绿转红）。
 * 用法：node scripts/validate-com-action-app.js [--root <dir>]
 * 退出码：0 = 通过；1 = 违规（CI FAIL）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { deriveComActionApp, renderBlock } = require('./lib/com-action-app.js');

const ROOT = (() => {
  const i = process.argv.indexOf('--root');
  return i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(__dirname, '..');
})();
const GOV_REL = '.opencode/plugins/governance.js';
const BEGIN = '// >>> BEGIN COM_ACTION_APP';
const END = '// <<< END COM_ACTION_APP';

const errors = [];
const fail = m => errors.push(m);

// ---- 判据 A + B ----
const { byName, count, error } = deriveComActionApp(ROOT);
if (!byName) {
  fail(`派生失败：${error}`);
} else if (count === 0) {
  fail('派生表为空（COM_ACTIONS 结构已变）—— 拒绝以空表冒充真值。');
} else {
  const gov = fs.readFileSync(path.join(ROOT, GOV_REL), 'utf8');
  const m = gov.match(
    new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END)
  );
  if (!m) {
    fail(`${GOV_REL} 未找到 COM_ACTION_APP 登记区块（BEGIN/END 标记缺失）。`);
  } else {
    const body = m[0].slice(m[0].indexOf('{') + 1, m[0].lastIndexOf('}'));
    const declared = {};
    for (const kv of body.matchAll(/([A-Za-z0-9_]+):\s*'(\w+)'/g)) declared[kv[1]] = kv[2];
    // A：逐条相等（双向 —— 多写/漏写/改值都报红）
    for (const n of Object.keys(byName)) {
      if (!(n in declared)) fail(`A: 注册表有 ${n}（${byName[n]}）但表中缺失。`);
      else if (declared[n] !== byName[n])
        fail(`A: ${n} 表值 ${declared[n]} != 注册表 ${byName[n]}。`);
    }
    for (const n of Object.keys(declared)) {
      if (!(n in byName)) fail(`A: 表中有 ${n} 但注册表无同名 COM Action（多余登记）。`);
    }
    // B：覆盖闭合（同上断言，显式再述：兜底 'word' 在网关通道不可达）
    const missing = Object.keys(byName).filter(n => !(n in declared));
    if (missing.length)
      fail(
        `B: 表未覆盖 ${missing.length} 个注册表条目，兜底 'word' 可达：${missing.slice(0, 5).join(',')}…`
      );
    if (!errors.length) {
      console.log(`✅ A/B: COM_ACTION_APP 区块与注册表派生结果逐条一致（${count} 条），覆盖闭合。`);
    }
  }
}

// ---- 判据 C：无残留「按关键词/前缀猜 app」的旧形态 ----
const govRaw = fs.readFileSync(path.join(ROOT, GOV_REL), 'utf8');
// 只扫**代码**（剥注释/字符串里的路径形态）——注释里提到历史形态不应报红。
const govSrc = govRaw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/`[^`]*`/g, '')
  .replace(/'[^']*'/g, '')
  .replace(/"[^"]*"/g, '');
const guessPatterns = [
  { re: /\/[^/\n]*(Slide|Presentation|Shape|Textbox|Animation)[^/\n]*\//, what: 'ppt 关键词正则' },
  { re: /\/[^/\n]*(Cell|Range|Workbook|PivotTable)[^/\n]*\//, what: 'excel 关键词正则' },
  { re: /startsWith\('getCell'\)/, what: 'excel 前缀白名单' },
  { re: /startsWith\('getActivePresentation'\)/, what: 'ppt 前缀白名单' },
];
for (const g of guessPatterns) {
  if (g.re.test(govSrc))
    fail(`C: ${GOV_REL} 残留「按名字猜 app」的旧形态（${g.what}）—— app 归属须取自应用段/注册表。`);
}
if (!errors.some(e => e.startsWith('C:'))) console.log('✅ C: 未残留「按名字猜 app」的旧形态。');

// ---- 判据 E：表查询须 **own property**（防原型链键泄漏成 app 值）----
// ⚠️ Issue #399 评审 R2-🟡E：`COM_ACTION_APP` 是对象字面量 ⇒ `COM_ACTION_APP[name]` 对
//   `constructor` / `toString` / `valueOf` / `__proto__` 等**原型链键**会返回继承函数（truthy），
//   使 `getAppType` 返回非 app 值 ⇒ `appReadState[<fn>]` 为 undefined ⇒ G3 静默绕过。
//   判据：读取处必须经 `hasOwnProperty.call`（不许裸下标）且只接受三个合法 app 值。
{
  // 用**未剥字符串**的原文匹配（app 值字面量需保留）。
  const fn = govRaw.match(/function getAppType\(toolName, app\)\s*\{([\s\S]*?)\n\}/);
  if (!fn) fail('E: 未定位 getAppType 函数（结构已变）。');
  else {
    if (!/Object\.prototype\.hasOwnProperty\.call\(COM_ACTION_APP, name\)/.test(fn[1]))
      fail('E: getAppType 须以 own-property 读取 COM_ACTION_APP（防原型链键泄漏），未检出 hasOwnProperty.call。');
    if (/return\s+COM_ACTION_APP\[name\]/.test(fn[1]))
      fail('E: getAppType 不得裸下标读 COM_ACTION_APP（原型链键会泄漏成非 app 值）。');
    const legalOk =
      /v === 'word'/.test(fn[1]) && /v === 'excel'/.test(fn[1]) && /v === 'ppt'/.test(fn[1]);
    if (!legalOk) fail('E: getAppType 须只接受 word/excel/ppt 三个合法 app 值（防非 app 值流入）。');
  }
  if (!errors.some(e => e.startsWith('E:'))) console.log('✅ E: 表查询经 own-property 且只接受合法 app 值。');
}

// ---- 判据 F：G3 的 app 归属**不得**读调用参数（防跨 app 绕过）----
// ⚠️ Issue #399 评审 R3-🟡F：`appTypeFromConfig(innerArgs.appType)` 曾是**第二份 app 真值**，
//   且可被调用方注入 —— 实测「读 Word 后 用 appType:'word' 调 Excel 写工具」⇒ G3 查 Word 标记 ⇒ 放行。
//   判据：G3 判据处不得出现 `innerArgs.appType`（app 只取权威来源：应用段/注册表表）。
{
  // 取 G3 块（代码锚点：`if (requiresReadBeforeWrite(toolName)) {`）到 `getAppType(` 之间。
  const g3 = govSrc.match(/requiresReadBeforeWrite\(toolName\)\)\s*\{[\s\S]{0,900}?getAppType\(/);
  if (!g3) fail('F: 未定位 G3 判据块（结构已变）。');
  else {
    if (/innerArgs\.appType/.test(g3[0]))
      fail('F: G3 不得读 innerArgs.appType（第二份 app 真值，可被注入 ⇒ 跨 app 绕过）。');
    if (/appTypeFromConfig/.test(govSrc))
      fail('F: appTypeFromConfig 已删（app 归属只取权威来源），不得复活。');
  }
  if (!errors.some(e => e.startsWith('F:'))) console.log('✅ F: G3 app 归属只取权威来源，未读调用参数。');
}

// ---- 判据 G：`common` 段须登记为 app 无关（防「common 工具被当某 app 误拦」）----
// ⚠️ Issue #399 评审 R4-🟡G：`wps_common_*`（save/saveAs/convertFormat…）跨 app 共用，
//   若被当某 app ⇒ 在其它 app 上下文恒拦（与本 Issue 同类误拦）。判据：归一化须把 common 段映射为
//   `'common'`（app 无关）且 G3 对 `'common'` 走「任一 app 已读即放行」。
{
  if (!/m\[1\] === 'common' \? 'common'/.test(govRaw))
    fail("G: normalizeToolCall 须把 common 段登记为 app 'common'（不得映射成 word）。");
  if (!/appType === 'common'/.test(govRaw) || !/\[\s*'word', 'excel', 'ppt'\s*\]\.some\(hasRead\)/.test(govRaw))
    fail("G: G3 对 'common' 须按「任一 app 已读即放行」判定。");
  if (!errors.some(e => e.startsWith('G:'))) console.log("✅ G: common 段登记为 app 无关且 G3 按任一 app 已读判定。");
}

// ---- 判据 D：表格与守卫都有执行者（防「删执行者留孤儿」）----
// 生成器与守卫必须并存且真的 require 派生单源 —— 无执行者的登记即假覆盖。
for (const rel of ['scripts/gen-com-action-app.js', 'scripts/validate-com-action-app.js']) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) fail(`D: ${rel} 缺失（登记区块无生成器/守卫 = 无执行者的假覆盖）。`);
  else if (!/require\(['"]\.\/lib\/com-action-app\.js['"]\)/.test(fs.readFileSync(p, 'utf8')))
    fail(`D: ${rel} 未 require 派生单源 lib/com-action-app.js。`);
}
if (!errors.some(e => e.startsWith('D:'))) console.log('✅ D: 生成器与守卫均存在且消费派生单源。');

if (errors.length) {
  console.error('\n❌ COM_ACTION_APP 守卫未通过：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('\n✅ validate-com-action-app 通过。');
