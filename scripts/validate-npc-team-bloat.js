#!/usr/bin/env node
/**
 * NPC Team 提示词「防腐守卫」——防止 NPC Team 自身腐烂（Issue #312）
 *
 * 背景（Issue #312 / #314）：NPC Team 的提示词与守卫脚本历史上「只加不删」——
 *   ① 提示词正文已达 150+ 行、23 条铁律，任何新需求都靠「再加一条铁律/再加一段说明」承载；
 *   ② 守卫脚本本尊（validate-npc-team-prompt.js）已 1458 行、含 12 个编号段与多层「11.1b/11.1c/11.2a」加码；
 *   ③ 契约靠「约定」而非「断言」——靠人（和 AI）记忆遵守，而 AI 的上下文装不下 → 约定必然被漏读。
 * 于是「每修一次必然多一个缝」。本脚本把「防腐」从口号变成可核实的 CI 断言。
 *
 * 单一契约（本脚本自身即示范）：
 *   - 口径唯一定义者 = 本文件的 collectFacts() + LIMITS（断言/测试/未来校验一律消费它，禁止各自重写一份）；
 *     测试侧读**已收集快照**的唯一出口 = tests/helpers/facts-snapshot.js（不重复全量 I/O，见 Issue #347）
 *   - 提示词正文唯一定义者 = docs/NPC_TEAM.md 的 # NPC_TEAM_PROMPT_START 代码块（与校验器同锚点，不另写正则）
 *
 * 9 类断言（A1/B1/B1b/C1/D1/D2/F1/G1/K4；唯一来源 = ASSERTION_CLASSES）：
 *   （本行清单为「名实一致」断言的**声明来源**——tests 侧按集合严格核对，非仅数量；
 *     每类在 tests/validate-npc-team-bloat.test.js 有对应变异自证：注入反例后断言由绿转红）
 *   A1 提示词行数上限      —— 防「越加越长」
 *   B1 铁律条目数上限      —— 防「再加一条铁律」式膨胀
 *   B1b 铁律 24 维数上限    —— 防「文案说 N 类、实际 M 类」的名实漂移：铁律 24 的防腐维数
 *                             与守卫断言类目数本是**同一语义**（Issue #314 i3 文档侧同构），
 *                             此前分写两处 ⟹ 必然失同步。现令类目数为唯一真值并运行期测量维数。
 *   C1 重复段落 / 重复长句  —— 防腐肉（同一约定被抄成多份后必然失同步；句级/行级分桶计数）
 *   D1 未登记引用          —— 防静默写入未登记编号（登记表不保证编号真实存在，见 KNOWN_REFS 注释）
 *   F1 环节覆盖            —— 防「环节悬空」：1-12 每个环节须逐条给出本环节的防腐/解耦/度量判据（=12 精确值）
 *                            （QA F1：校验器口径为有效代码行，剔除空行与纯注释行，杜绝压注释凑行数）
 *   G1 文档级腐肉          —— 防腐不豁免「承载提示词的文档」：docs/NPC_TEAM.md 全文的长行腐肉也须由**守卫本尊**拦截。
 *                            （Issue #314 comment 2099345506 i1「概念无主」教训：该不变量此前只由测试断言承载，
 *                             守卫 CLI 对文档级重复长行**静默放行** ⇒ 契约无主、CI 门禁不覆盖 ⇒ 与「同一约定被抄成多份」同构。）
 *   K4 契约单一性          —— 守卫须调用 lib 契约 extractPrompt() 且不得自写提示词提取实现
 *                            （#314 i2「测形态不测行为」教训：此前该不变量只在测试层做「字符串/变化」检查 ⇒ 契约无主；现升格为门禁断言）
 *
 * ⚠️ Issue #352 第七刀（减法系列）：**删除 E1 / H1 两类**——它们是「守卫给自己量的账」，不是防腐：
 *   · 原 E1「守卫与校验器自身复杂度」= 守卫量**自己**的有效代码行/分支数。其唯一效果是形成
 *     「改守卫 → 调自己的上限 → 通关」的**自我许可循环**，不保护提示词。同型层已在第六刀
 *     从轴 I 删除（`validate-semantic-anchor-scope.js` 的 E1 守卫自身体量度量层）。
 *     守卫源码体积现由**体量闸门**（`validate-proofread-report-size.js`，物理行数）与代码评审承接。
 *   · 原 H1「跨通道范围登记」= 其自身注释即承认是**自限判据**（「不声称已拦范围漂移」），
 *     已被轴 I（`validate:semantic-anchor-scope`，语义键 ↔ 落点双向集合相等）**完全取代**；
 *     且其登记项 3 指向的治理侧「截断信号」消费已在 Issue #325 删除 ⇒ 属**陈旧登记**。
 *
 * 用法：
 *   node scripts/validate-npc-team-bloat.js          # 校验，违规 exit 1
 *   node scripts/validate-npc-team-bloat.js --json   # 输出度量 JSON（供测试/排查）
 */
'use strict';

const fs = require('fs');
const path = require('path');
// 单一契约：提示词正文提取唯一定义在 scripts/lib/npc-team-prompt-source.js（PR #315 评审 K4）
const {
  extractPrompt,
  STAGE_COUNT,
  STAGE_PROTECT_MARK,
  countStageProtection,
  countStageDecls,
  countCoveredStages,
} = require('./lib/npc-team-prompt-source');

const ROOT = path.resolve(__dirname, '..');
const DOC_FILE = path.join(ROOT, 'docs', 'NPC_TEAM.md');
const SKILL_FILE = path.join(ROOT, '.codebuddy', 'skills', 'npc-team', 'SKILL.md');
// 腐肉判据「长行」长度阈值（唯一来源：C1 与 G1 共用同一实现与同一阈值 —— 铁律 24 第 2 维）。
const DUPLICATE_LONG_MIN = 40;
// G1 文档级腐肉判据长度阈值别名（对外导出名，测试消费；与 DUPLICATE_LONG_MIN 同值，语义 = 文档级长行）
const DOC_LONG_LINE_MIN = DUPLICATE_LONG_MIN;

// ---- 断言类目对照表（唯一来源）----
// 类目表 = 头注释声明的**可执行集合**（测试侧按集合严格核对，防「文案说 N 类、实际 M 类」），
// 同时是 B1b「防腐维数 ≤ 类目数」的**唯一查表依据**（禁止在断言处另写类目数）。
const ASSERTION_CLASSES = Object.freeze({
  A1: '提示词行数',
  B1: '铁律条目数',
  B1b: '铁律 24 防腐维数',
  C1: '重复段落/重复长句',
  D1: '未登记引用',
  D2: '登记表膨胀',
  F1: '环节覆盖',
  G1: '文档级腐肉',
  K4: '契约单一性',
});

// ---- 单一契约：全部阈值集中一处（禁用散落魔数）----
// 阈值口径 = 「当前基线 + 约 20% 余量」：不允许超标即意味着新改动必须删等量内容 ——
// 这是把铁律 24「敢删」从口号变成硬约束的机制（Issue #312 验收标准 AC7）。
const LIMITS = {
  promptLines: 90, // Issue #383 用户明确要求「严格控制上限为 90」（本次整改后 85 行 → 余量 5.5%）
  ruleCount: 24, // 基线 24 条（铁律 1~24）；再加即红，须先删等量
  // B1b 铁律 24「防腐维数」上限 = 守卫可执行断言类目数（口径 = ASSERTION_CLASSES，唯一来源）。
  // 唯一真值 = 断言类目数；B1b 断言「守卫代码内出现的防腐维数 ≤ 类目数」——提示词新增一维
  // 而守卫未登记类目即报红（走升级路径，不得静默漂移）。
  ruleDimensions: Object.keys(ASSERTION_CLASSES).length,
  duplicateSentences: 0, // 归一化后长度 ≥ 40 的重复长句数必须为 0
  docDuplicateLines: 0, // G1：docs/NPC_TEAM.md **全文**归一化后长度 ≥ 40 的重复长行数必须为 0（单一契约：DOC_LONG_LINE_MIN）
  brokenRefs: 0, // 提示词内 #<数字> 引用失效数必须为 0
  // F1 环节覆盖声明数上限（精确值）——唯一来源 = lib 的 STAGE_COUNT（PR #317 评审 K2：禁在此另写 12）
  stageProtection: STAGE_COUNT,
};

// 已登记引用白名单：指向本仓历史 Issue/PR 的编号。
// **真实保证边界（PR #315 评审 K2 名实对齐）**：本表只保证「新增编号必须先登记」——无法悄悄写入
// 未登记/笔误编号；它**不保证**已登记编号真实存在（离线 CI 无法逐个请求核对，且多数编号是 PR 号
// 而非 Issue 号：`cnb issues get` 对 PR 号返回 404）。故 D1 报错文案为「未登记引用」而非「失效引用」，
// 引用真实存在性由人工在合并前抽查 + 登记时注明类型（issue/pr）保证。
//   ① 新引用必须先登记（否则 D1 报红）；
//   ② 登记表自身膨胀受显式长度检查约束（见 checkBloat D2）。
const KNOWN_REFS = new Set([
  '76',
  '78',
  '88',
  '123',
  '147',
  '277',
  '278',
  '279',
  '280',
  '281',
  '282',
  '284',
  '285',
  '290',
  '292',
  '294',
  '295',
  '296',
  '297',
  '303',
  '306',
  '312',
  '313',
  '314',
  '383',
]);

/**
 * **K4 契约一致性单一判据**（R8-K2 修复：converge 到唯一实现，禁止 readPrompt/extractViaContract 各写一份）。
 * 语义：给定 content，断言「正文只可能经 lib 契约得到」——
 *   ① 契约提取必须 ok；② 独立 require 契约实例复算结果 == 首次结果（防局部 shadow / 生效实现漂移）。
 * 返回 { ok, prompt }；不一致时 ok=false（调用方决定抛错或返回 false）。
 * 注（R8-K1 修复，名实一致）：`require()` 同一路径返回**同一缓存实例**，故此处**不声称**「新鲜实例」；
 *   它验证的是「契约导出未被替换/未漂移」（同一 path 的导出恒等），而非缓存隔离 —— 如实描述。
 */
function contractExtract(content) {
  const first = extractPrompt(content);
  if (!first.ok) return { ok: false, prompt: '', reason: first.reason };
  const again = require('./lib/npc-team-prompt-source').extractPrompt(content);
  if (!again.ok || again.prompt !== first.prompt)
    return { ok: false, prompt: '', reason: 'contract-drift' };
  return { ok: true, prompt: first.prompt };
}

/**
 * 读取提示词（唯一入口 = lib 契约）。K4 运行期裁定（R7 方案 b）：不读任何源码文本，
 * 一律经 contractExtract 单一判据；不一致即 fail-closed。
 */
function readPrompt() {
  const content = fs.readFileSync(DOC_FILE, 'utf8');
  const r = contractExtract(content);
  if (!r.ok) throw new Error(r.reason + '（防腐度量无法进行 / 疑似自写提取实现绕过单一契约）');
  return { content, prompt: r.prompt };
} /**
 * K4 运行期唯一出口探针（R7 方案 b；R8-K2 修复：复用 contractExtract 单一判据）。
 * 判据（**独立于守卫自身取正文路径**，防「自洽的假出口」）：把守卫**实际使用**的正文
 * （readPrompt 结果）与**直接调用 lib 契约**的结果比对 —— 若守卫内嵌了自写实现而其结果与契约
 * 不一致，则此处暴露（readPrompt 会抛错或与直连结果不等）。返回布尔。
 */
function extractViaContract() {
  try {
    const viaGuard = readPrompt().prompt; // 守卫取正文路径（可能被自写实现替换）
    const content = fs.readFileSync(DOC_FILE, 'utf8');
    const viaDirect = require('./lib/npc-team-prompt-source').extractPrompt(content);
    return viaDirect.ok && viaDirect.prompt === viaGuard; // 独立直连契约比对
  } catch (e) {
    return false;
  }
}
/**
 * 归一化：去空白 + 去零宽/不可见字符（与 scripts/lib/normalize.js 同口径，防腐度量用局部实现避免循环依赖）。
 *
 * 判据（R1-K5，铁律 24 第 2 维「契约唯一」）：腐肉检测的归一化必须对「同义不同字节」鲁棒 ——
 * 若只去 `\s`，则把复制行的行尾追加一个零宽字符（U+200B/U+FEFF/软连字符等，均非 `\s`）
 * 即可让「同一约定」在归一化后不再相等 ⇒ 静默绕过（实测：加 U+200B 后守卫 exit 0）。
 * 故此处统一剔除零宽/方向控制字符（单一实现，C1 句级/行级、G1 文档级共用）。
 */
const ZERO_WIDTH_RE = /[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g;
const norm = s => s.replace(ZERO_WIDTH_RE, '').replace(/\s+/g, '');

/**
 * 单一契约：所有防腐度量集中此处。
 * 断言函数、测试、未来新增校验一律消费本函数，禁止各自重写一份口径。
 */
function collectFacts() {
  const { content, prompt } = readPrompt();
  const promptLines = prompt.split('\n').length;
  const ruleCount = prompt.split('\n').filter(l => /^\d+\.\s/.test(l.trim())).length;

  // C1 重复腐肉：句级（按 。；！？!? 切分，长度 ≥ 40 的同一句 ≥ 2 次）+ 行级（整行归一化后 ≥ 40 且 ≥ 2 次）
  // 双通道互补；两通道**分桶计数**（同一复制不得被双计，否则 times 被放大、守卫输出不可信）。
  //
  // 契约唯一：分桶计数**只此一份** countDup，C1 句级/行级与 G1 文档级一律复用它（禁止各写一套）。
  const DUP_MIN_LEN = DUPLICATE_LONG_MIN;
  function countDup(parts) {
    const counter = new Map();
    for (const k of parts.filter(x => x.length >= DUP_MIN_LEN))
      counter.set(k, (counter.get(k) || 0) + 1);
    return counter;
  }
  /** 分桶计数中「出现 ≥ 2 次」的桶数（唯一实现，供 C1 判红与 G1 判红共用） */
  const dupCount = counter => [...counter.values()].filter(v => v >= 2).length;
  const sentenceCounter = countDup(norm(prompt).split(/[。；！？!?]/));
  const lineCounter = countDup(prompt.split('\n').map(l => norm(l)));
  // G1 文档级腐肉：**docs/NPC_TEAM.md 全文**长行去重，口径与 C1 行级**同实现同阈值同归一化**。
  const docLineCounter = countDup(content.split('\n').map(norm));
  const docDuplicateLines = dupCount(docLineCounter);
  const duplicateSentences = [];
  for (const [kind, counter] of [
    ['句', sentenceCounter],
    ['行', lineCounter],
  ])
    for (const [k, v] of counter.entries())
      if (v >= 2) duplicateSentences.push({ kind, times: v, sample: k.slice(0, 40) });

  // D1 未登记引用：提示词 + 文档级的 #<数字> 引用必须已在 KNOWN_REFS 登记
  const refs = [...new Set([...content.matchAll(/#(\d{2,})/g)].map(m => m[1]))];
  const brokenRefs = refs.filter(r => !KNOWN_REFS.has(r));

  // 守卫本尊源码（B1b 运行期测量 + K4 契约一致性判据共用）
  const guardSrc = fs.readFileSync(__filename, 'utf8');
  // B1b 铁律 24 防腐维数（运行期测量，非查注释）：守卫代码内出现的「第 N 维」编号最大值。
  // 运行期测量（非查注释）＋ LIMITS.ruleDimensions（= 类目数）双向约束，防「提示词说 N 维、守卫查 M 类」。
  const guardDimMax = Math.max(
    0,
    ...[...guardSrc.matchAll(/第\s*(\d+)\s*维/g)].map(m => Number(m[1]))
  );
  // K4 契约单一性：**放弃源码文本判据**（用文本猜语法不可穷尽），改**运行期**判据 ——
  //   extractViaContract() 实际执行守卫的取正文路径，验证其**只经契约**得到正文；
  //   与之配合的 readPrompt() 行为断言保证「守卫取得的正文 == 契约对同一 content 的提取结果」。
  //   已知边界（如实登记，不假装已拦）：与契约**逐输入等价**的自写实现不可检测（结果恒等 ⇒ 不构成契约漂移）。
  const guardExtractViaContract = extractViaContract(guardSrc);

  // F1 环节覆盖：口径 = 【流水线】段内、共享实现 countStageProtection（守卫与校验器同范围同实现，防两套口径）。
  // 环节覆盖段定位（Issue #383 C1 同口径）：按「以 `1/M` 开头的阶段行」到下一个 `【` 段头行派生 ——
  // 取代原先手写的「【流水线（13 阶段 + 4 暂停点」锚点（该字面量随阶段数演进必然失同步）。
  // 段范围 = 【流水线】**段头行**（含「本环节：」说明字面，供字面计数诊断）到下一个 `【` 段头行之前；
  // 结构度量只数子句段（以 `防腐=` 为签名的子句），故段头说明行的同字面不影响覆盖数。
  const stageSeg = (() => {
    const lines = prompt.split('\n');
    const re = new RegExp(`^1\\/${STAGE_COUNT}(?!\\d)`);
    const stageLine = lines.findIndex(l => re.test(l));
    if (stageLine === -1) return '';
    const header = stageLine > 0 && lines[stageLine - 1].startsWith('【流水线') ? stageLine - 1 : stageLine;
    const b = lines.findIndex((l, i) => i > stageLine && l.startsWith('【'));
    return lines.slice(header, b === -1 ? lines.length : b).join('\n');
  })();
  // stageProtection=结构覆盖数（子句齐备）；stageDecls=环节子句段声明数（防膨胀，说明行不计入）；
  // stageProtectionLiteral 仅作 CLI 诊断。
  const stageProtection = countCoveredStages(stageSeg);
  const stageDecls = countStageDecls(stageSeg);
  const stageProtectionLiteral = countStageProtection(stageSeg);

  return {
    promptLines,
    ruleCount,
    stageProtection,
    stageDecls,
    stageProtectionLiteral,
    duplicateSentences,
    docDuplicateLines,
    refs,
    brokenRefs,
    knownRefsCount: KNOWN_REFS.size,
    guardDimMax,
    guardExtractViaContract,
    promptChars: prompt.length,
  };
}

/**
 * 9 类断言（A1 行数 / B1 铁律数 / B1b 铁律 24 维数 / C1 重复腐肉 / D1 未登记引用 /
 * D2 登记表膨胀 / F1 环节覆盖 / G1 文档级腐肉 / K4 契约单一性）。
 * 返回 { errors: string[], facts }。
 * 名实一致（R1-K2 附带发现）：本清单曾漏写 G1 且仍称「7 类」——与头注释清单不一致；
 * 现与头注释同步，并由 tests「名实一致（集合相等）」断言守护。
 */
function checkBloat(facts) {
  facts = facts || collectFacts();
  const errors = [];

  // A1 提示词行数上限
  if (facts.promptLines > LIMITS.promptLines)
    errors.push(
      `A1 提示词行数超上限：${facts.promptLines} > ${LIMITS.promptLines}——防「越加越长」；` +
        `本次新增须先删等量内容（铁律 24 敢删）`
    );

  // B1 铁律条目数上限
  if (facts.ruleCount > LIMITS.ruleCount)
    errors.push(
      `B1 铁律条目数超上限：${facts.ruleCount} > ${LIMITS.ruleCount}——防「再加一条铁律」式膨胀；` +
        `须先合并/删除等量铁律（铁律 24 敢删）`
    );

  // B1b：防腐维数 ≤ 断言类目数（同一语义只有一处实现：见 LIMITS.ruleDimensions）。
  if (facts.guardDimMax > LIMITS.ruleDimensions)
    errors.push(
      `B1b 铁律 24 防腐维数 ${facts.guardDimMax} 超断言类目数 ${LIMITS.ruleDimensions}——` +
        `守卫新增一维但未登记类目（ASSERTION_CLASSES 为唯一来源；须同步登记并保证名实一致）`
    );

  // C1 重复段落 / 重复长句
  if (facts.duplicateSentences.length > LIMITS.duplicateSentences)
    errors.push(
      `C1 检测到重复长句 ${facts.duplicateSentences.length} 处（上限 ${LIMITS.duplicateSentences}）——防腐肉：` +
        facts.duplicateSentences
          .slice(0, 3)
          .map(d => `${d.kind}级 ${d.times} 次「${d.sample}…」`)
          .join('；')
    );

  // K4 契约单一性（运行期，铁律 24 第 7 维②「不变量必须归属门禁」）：守卫须存在经契约取正文的唯一出口。
  if (!facts.guardExtractViaContract)
    errors.push(
      `K4 守卫须经 lib 契约 extractPrompt() 取正文（运行期未检出唯一契约出口）——` +
        `守卫可能已自写提取实现或契约已不可用（铁律 24 契约唯一）`
    );

  // G1 文档级腐肉（防腐不豁免承载提示词的文档；Issue #314 i1「概念无主」教训）
  if (facts.docDuplicateLines > LIMITS.docDuplicateLines)
    errors.push(
      `G1 docs/NPC_TEAM.md 全文出现重复长行 ${facts.docDuplicateLines} 处（上限 ${LIMITS.docDuplicateLines}）——` +
        `防腐不豁免承载提示词的文档：同一约定抄成多份后必然失同步（须删除重复行或提取为单一来源）`
    );

  // D1 未登记引用（登记表只保证"新编号必须先登记"，不保证编号真实存在）
  if (facts.brokenRefs.length > LIMITS.brokenRefs)
    errors.push(
      `D1 检测到未登记引用 ${facts.brokenRefs.length} 处（上限 ${LIMITS.brokenRefs}）：` +
        facts.brokenRefs.map(r => '#' + r).join('、') +
        '——新引用须先登记进 KNOWN_REFS（登记仅保证"新增编号不被静默写入"，不保证编号真实存在；' +
        '真实存在性由 CI 联网核对，见 KNOWN_REFS 注释）'
    );

  // D2 登记表自身膨胀（引用白名单不得无上限增长）
  if (facts.knownRefsCount > 60)
    errors.push(
      `D2 引用登记表膨胀：${facts.knownRefsCount} > 60——防「登记表变垃圾桶」；应先合并同源引用`
    );

  // F1 环节覆盖（= 12 精确值）：防「环节悬空」（新增环节却不给该环节防腐/解耦判据）
  // 与「环节膨胀」（偷偷加第 13 个环节绕开审查）双向拦截。
  // F1 双向判定（合取，评审 F3+F5）：
  // ① 结构度量 == STAGE_COUNT —— 每个已知环节的子句齐备（防「环节悬空」：删本环节子句）
  // ② 字面计数 <= STAGE_COUNT —— 无计划外「本环节：」声明（防「环节膨胀」：偷偷加第 13 个环节段）
  // 单独任一条都不够：只看结构会漏「新增 decoy 环节段」（F5），只看字面会被说明行同字面误报（F3）。
  if (facts.stageProtection !== LIMITS.stageProtection)
    errors.push(
      `F1 环节覆盖数异常：【流水线】段实际覆盖 ${facts.stageProtection}/${LIMITS.stageProtection} 个环节` +
        `——${LIMITS.stageProtection} 个环节各须给出本环节的防腐/解耦/度量判据（少＝环节悬空）`
    );
  const declExtra = `【流水线】段环节子句 ${facts.stageDecls} 段 > ${LIMITS.stageProtection}`;
  if (facts.stageDecls > LIMITS.stageProtection)
    errors.push(`F1 环节覆盖声明数异常：${declExtra}——疑似环节膨胀（偷偷加计划外环节段绕开审查）`);

  return { errors, facts };
}

module.exports = {
  collectFacts,
  checkBloat,
  LIMITS,
  KNOWN_REFS,
  readPrompt,
  DOC_LONG_LINE_MIN,
  ASSERTION_CLASSES,
};

// ---- CLI ----
if (require.main === module) {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(collectFacts(), null, 2));
    process.exit(0);
  }
  let facts;
  try {
    facts = collectFacts();
  } catch (e) {
    console.error('✖ ' + e.message);
    process.exit(1);
  }
  const { errors } = checkBloat(facts);
  console.log(
    `度量：提示词 ${facts.promptLines}/${LIMITS.promptLines} 行、${facts.ruleCount}/${LIMITS.ruleCount} 条铁律、` +
      `重复长句 ${facts.duplicateSentences.length}、文档级重复长行 ${facts.docDuplicateLines}、未登记引用 ${facts.brokenRefs.length}、` +
      `铁律24维数 ${facts.guardDimMax}/${LIMITS.ruleDimensions}、` +
      `环节覆盖 ${facts.stageProtection}/${LIMITS.stageProtection}（子句段 ${facts.stageDecls}、` +
      `字面 ${facts.stageProtectionLiteral}=段头 1 处+环节声明数，仅诊断用；判红只看前两值）`
  );
  if (errors.length > 0) {
    console.error('✖ NPC Team 提示词防腐校验失败：' + errors.length + ' 个错误');
    for (const e of errors) console.error('  ❌ ' + e);
    process.exit(1);
  }
  console.log('✅ NPC Team 提示词防腐校验通过（未超上限、无重复腐肉、无未登记引用）');
}
