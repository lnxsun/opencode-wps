#!/usr/bin/env node
/**
 * 校对源码体量守卫（Issue #341「只大幅压缩，绝不增加」；Issue #352 第五刀收敛）。
 * 计行口径唯一定义者 = `scripts/lib/guard-sources.js` 的 countLines()（**物理行数**）。
 * 计行对象 = REPORT_SOURCES（校对源码显式清单，改名/搬家不登记即 S0 报红）。
 * 断言：S0 归属 / S1 总量 / S2 单文件 / S3~S5 棘轮（共享判据 scripts/lib/ratchet.js）。
 *
 * ⚠️ 第五刀（Issue #352）：**守卫源码体量的「载体」已迁出本文件**（原为断言 S8）——
 *   它与轴 I 的 E1 是**同一判据的两份实现**（各自维护「不许上调 / 值与留痕对账」）。
 *   现由轴 I 的一个维度承担（`guardSourceLines`，口径 = 物理行数），唯一入口
 *   `npm run validate:semantic-anchor-scope`；本文件不再量守卫源码，也不再持棘轮常量。
 *   ℹ️ 注意区分：语义键 `guard-source-budget` **未迁出**（它仍在 `semantic-anchor-manifest.js` 登记，
 *   落点已改指 `lib/guard-sources.js` + 轴 I）——迁出的只是**本文件里的断言载体**。
 *   用法：[--json]；退出码 0 通过 / 1 超限
 *
 * ⚠️ 自限（显式披露）：不声称拦住「把注释塞进字符串」等规避形态，也不声称拦住有权限且同时改限值与棘轮两处的人。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { checkRatchet } = require('./lib/ratchet.js');
const { countLines } = require('./lib/guard-sources.js');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'wps-office-mcp', 'src', 'tools', 'word');

/** 校对线全部源码（唯一来源；相对 `DIR` 精确路径）。显式清单而非 glob：改名/搬家必须同步登记（S0 报红）。 */
const REPORT_SOURCES = [
  'proofread.ts', // 校对入口 handler + 基础规则引擎 + 修订模式/按段替换工具
  'proofread-rules.ts', // 80 条规则本体 + 上下文守卫 + 白名单
  'proofread-normalize.ts', // 归一化层（type/source/位置/修复动作/评分/跳过归属）
  'proofread-accumulate-helpers.ts', // 累加侧纯函数（校验/去重/进度门禁/跳过归属）
  'proofread-report.ts', // 报告生成（编排 + 统计 + 渲染）
  'proofread-report-copy.ts', // 报告文案与口径声明（面向用户的唯一输出源）
  'proofread-types.ts', // 共享类型 + 跨运行时常量（坐标契约 / 六维维度 / 会话数据 / 批次上限 / 规则类型契约）
  'proofread-session.ts', // 会话 Map（进程内短生命周期状态）
];

/** 棘轮值（[rel, note]；`ratchet` 由 S3~S5 现场取 LIMITS/RATCHET，不再逐文件登记）。 */
const REPORT_FILES = REPORT_SOURCES.map(rel => [rel, '']);

/** 上限与棘轮（Issue #341 定值；只降不升，收紧须走 upgradeLog 留痕）。 */
const LIMITS = { totalLines: 1927, perFileLines: 420 };
const RATCHET_INITIAL_TOTAL_LINES = 1824;
const RATCHET = {
  totalLines: 1927,
  upgradeLog: [
    {
      issue: '#382 DECISION-1',
      reason:
        '「纯 TS 逻辑工具直连注册」把 2 个报告工具的 `ToolDefinition` 从 `gateway/com-actions.ts` **迁入**' +
        '`proofread-report.ts`（定义与 handler 同居，唯一来源）；同批新增：`deriveSessionKey`（会话身份唯一定义者）' +
        '+ `ai_issue_count` 必填校验。校对线合计 1824 → 1884（+60）。',
      from: 1824,
      to: 1898,
      netDeletion:
        '本维为**净增**（该闸门只量校对线 9 文件；迁出的定义本不计入本闸门，故此处无等量删除可抵）。' +
        '请配合看**本次改动的全仓账**：`gateway/com-actions.ts` −85 行、`tree/tool-registry.ts` −27 行、' +
        '`governance.js` −22 行、`validate-gateway-membership.js` **482 → 274 行（−208）** ⇒ ' +
        '改动整体净删；校对线这一 +60 是「把契约从网关表搬到与实现同居处」的**搬家成本**，' +
        '该闸门（只量校对线）无法感知搬家来源，故如实上调基线并留痕（非自我许可：全仓净删已在同 PR 可见）。',
    },
    {
      issue: '#382 销项补漏（C2 / B5）',
      reason:
        '用户复验指出两项「宣称已修、实测未落地」：① C2 —— `confirmBatchAiProofread` 只做了「必填 `ai_issue_count`」，' +
        '**无交叉核对、报告零披露**（Layer2 产出仍无人验收）；② B5 —— `doc_info` 子字段**未标 `required`**（AI 看 schema 仍不知 `totalWords` 必填）。' +
        '本刀补齐：服务端捕获 Layer 1 实测条数 + 申报入队 + 累积入会话 + 报告新增「Layer 2 产出」披露节；`doc_info.required` 四字段齐备。' +
        '校对线 1898 → 1936（+38）。',
      from: 1898,
      to: 1936,
      netDeletion:
        '本维为**净增**（新增能力：C2 交叉核对链路 + 披露渲染）。已就同 PR 做压缩：`layer2Disclosure` 与 confirm 回执文案' +
        '两处由初稿 22 行压至 9 行（−13），`proofread-types` 注释合并（−3）。' +
        '残余 +38 为「把 Layer2 产出从无人验收变为可核对」的最小实现成本；全仓侧同批为**净删**' +
        '（`doc-drift-manifest`/`guard-scopes` 去掉第二份同名清单、`index.ts` 注释替换）。',
    },
    {
      issue: '#395 评审 CR1-2',
      reason:
        'RC-4 修复补齐「非法 type 不静默改判」分支（`normalizeIssueType` 三分支）——按本仓「只降不升」纪律，' +
        '在 `proofread-normalize.ts` 同文件压缩注释与实现（合并 `const`/分支为单行三元 + 注释并段），' +
        '实测净减 1 行 ⇒ 收紧棘轮 1936 → 1935（收紧无需等量删除证明，此处顺带留痕）。',
      from: 1936,
      to: 1935,
      netDeletion:
        '净删 1 行（`proofread-normalize.ts` 同文件压缩：注释合并 + 分支单行化），非净增，故无需等量删除证明。',
    },
    {
      issue: '#401 R4-1（第 4 轮评审：删 10 个对象）',
      reason:
        '第 4 轮评审核对「handler 缺省语义与治理层同口径」时，handler 侧必须新增 3 行注释 + 1 行 `wantEnable`；' +
        '按本闸门「只大幅压缩、绝不增加」纪律，**同轮删除 ≥ 等量对象**（真删，非压缩注释）：' +
        '① 删除 `wps-office-mcp/src/index.ts` 的 **40 行 barrel 再导出**（全仓零消费者；' +
        '`grep "from \'../index\'"` 仅命中无关的 `gateway/index.ts:19`）—— 同时清掉一道架构债；' +
        '② 合并 `proofread-rule-types.ts`（单类型模块，20 行）入 `proofread-types.ts`，**删除整个文件**；' +
        '③ 同步压缩 `proofread-session.ts` 头部注释。' +
        '⚠️ 同轮把治理侧/R7 的缺省语义统一（`wantEnable` 唯一定义者），本维为**净减**（1935→1932）。' +
        '⚠️ 自限（如实披露）：S1 口径含注释行，故「压缩注释」与「删对象」在本闸门内同权；' +
        '本条只报**净减结论**，不声称所有删除都是结构性删除（10 个对象中 2 个是文件级、其余为注释合并）。',
      from: 1935,
      to: 1932,
      netDeletion:
        '净删 3 行（1935→1932）：删除一个 barrel 区块（40 行）+ 一个文件（20 行），' +
        '其中绝大部分为**非本闸门计量对象**（index.ts 不在 REPORT_SOURCES），故本维只记净减 3 行。',
    },
    {
      issue: '#420 会话复盘（收紧 1932 → 1927）',
      reason:
        'Issue #420 为校对会话（ses_f0fc）补两处「已检出/已修复却不计分」的缺口：`TYPE_METRIC_MAP` 增加' +
        '`网络用语`（consistency）与 `编号不连续`（format）两个键，并为其加 Layer 1 规则（`3W`→`3万`、裸 `xxx…` 占位）。' +
        '按本仓「只降不升」纪律，**同批在同文件内压缩 ≥ 等量行**：`proofread-normalize` 的 format 组 8 键并行为 4 行、' +
        '来源归一注释并段；`proofread-rules` 头注并段；`proofread-report` 会话回收注释并段。' +
        '实测净减 5 行 ⇒ 收紧棘轮 1932 → 1927（收紧无需等量删除证明，此处顺带留痕）。',
      from: 1932,
      to: 1927,
      netDeletion:
        '净删 5 行（1932→1927），全部为同语义压缩（键并排 / 注释并段），非净增，故无需等量删除证明。',
    },
  ],
};
/** 已达成值（S4 收紧基准）；棘轮现值上调须走 upgradeLog（此前可被任意上调，实测 999999 → EXIT=0）。 */
const ACHIEVED_TOTAL_LINES = 1927;

/** 解析为绝对路径（精确相对路径，语义 = 「就是这一份」；不做 basename 模糊匹配以免歧义静默放行）。 */
function resolveSource(rel) {
  const abs = path.join(DIR, rel);
  try {
    return fs.statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}
/** 计行（唯一入口）：解析项 → 记录；abs 为 null 时 lines = −1（哨兵，由 S0 报红）。 */
function measure(list) {
  return list.map(({ rel, note, abs }) => ({ name: rel, note, lines: abs ? countLines(abs) : -1 }));
}
/** 收集度量（唯一实现；CLI 与测试共用，禁止各自重写一份）。 */
function collectFacts() {
  const files = measure(REPORT_FILES.map(([rel, note]) => ({ rel, note, abs: resolveSource(rel) })));
  return {
    files,
    // 缺失文件（lines = −1）按 0 计入总行数：它已由 S0 单独报红，无需在 S1 重复报
    totalLines: files.reduce((n, f) => n + Math.max(f.lines, 0), 0),
    maxFileLines: files.reduce((n, f) => Math.max(n, f.lines), 0),
  };
}

/** 断言（返回错误清单；空 = 通过） */
function checkSize(facts) {
  facts = facts || collectFacts();
  const errors = [];
  // S0 归属：清单声明的必须真实存在（改名/搬家必须同步登记）
  for (const f of facts.files)
    if (f.lines < 0)
      errors.push(`S0 计行对象缺失：${f.name} 在树中找不到——改名/搬家必须同步登记 REPORT_SOURCES`);
  if (facts.totalLines > LIMITS.totalLines)
    errors.push(`S1 校对源码总行数超上限：${facts.totalLines} > ${LIMITS.totalLines}——「只大幅压缩、绝不增加」`);
  for (const f of facts.files)
    if (f.lines > LIMITS.perFileLines)
      errors.push(`S2 单文件超上限：${f.name} ${f.lines} > ${LIMITS.perFileLines}——防「把行数藏进巨型文件」`);
  // S3/S4/S5 棘轮三类判据：**共享判据**（lib/ratchet.js），与轴 I 的 E1 上限同源消费
  errors.push(
    ...checkRatchet({
      name: '棘轮',
      initial: RATCHET_INITIAL_TOTAL_LINES,
      current: LIMITS.totalLines,
      baseline: RATCHET.totalLines,
      log: RATCHET.upgradeLog,
    }).map(e => e.replace(/^棘轮\s/, ''))
  );
  return { errors, facts };
}

module.exports = {
  RATCHET_INITIAL_TOTAL_LINES, REPORT_SOURCES, REPORT_FILES, LIMITS, RATCHET,
  ACHIEVED_TOTAL_LINES, countLines, collectFacts, checkSize,
};

// ---- CLI ----
if (require.main === module) {
  const facts = collectFacts();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...facts, limits: LIMITS }, null, 2));
    process.exit(0);
  }
  const { errors } = checkSize(facts);
  console.log(
    `度量：${facts.files.length} 个文件 / 总 ${facts.totalLines}/${LIMITS.totalLines} 行 / ` +
      `最大单文件 ${facts.maxFileLines}/${LIMITS.perFileLines} 行`
  );
  for (const f of facts.files) console.log(`  - ${f.name}: ${f.lines} 行`);
  if (errors.length > 0) {
    console.error('✖ 校对线体量校验失败：' + errors.length + ' 个错误');
    for (const e of errors) console.error('  ❌ ' + e);
    process.exit(1);
  }
  const ok = facts.totalLines <= ACHIEVED_TOTAL_LINES;
  console.log(
    `✅ 校对线体量校验通过（校对源码棘轮 ${LIMITS.totalLines} 行）——` +
      (ok
        ? `已达成值 ${ACHIEVED_TOTAL_LINES} 行（实测 ${facts.totalLines}）`
        : `⚠️ 已达成值 ${ACHIEVED_TOTAL_LINES} 行未达成（实测 ${facts.totalLines}），仅防「回升」`)
  );
  console.log(
    '   ℹ️ 守卫/元数据源码体量（物理行数总量）已并入轴 I 维度 guardSourceLines —— 见 npm run validate:semantic-anchor-scope'
  );
  console.log('   ℹ️ 自限：不声称拦住「同时改限值与棘轮两处」的人；它保证的是语义后果显式化（值与留痕对账）');
}
