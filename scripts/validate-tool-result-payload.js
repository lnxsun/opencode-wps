#!/usr/bin/env node
/**
 * 工具结果**信封契约**守卫（Issue #401 W-2，轴 I 语义键 `tool-result-payload` 的执行者）。
 *
 * 问题（Issue #401）：治理层与 handler 之间「成功/失败」的唯一契约面，是
 * `ToolCallResult` → `mcp-server.ts` 投影 → 治理插件消费点这条链上的**信封**。
 * 此前该契约**没有独立守卫**：e2e 用自带 stub 构造 handler 返回，字段名随便写都吃得下
 * ⇒ 治理层一旦读了**投影后不存在的键**，门禁静默失效而测试全绿。
 *
 * 本守卫把「消费点只能读信封上真实存在的键」落成可独立执行的判据（**不依赖测试文件**）：
 *   ① 单向闭合：治理层读信封顶层键的位置必须 ⊆ 允许集合（唯一来源 = TS 契约字段的**投影面**）。
 *   ② 文案纪律：兜底文案不得把**字段名**当标记（契约键名不得进入人类可读文案）。
 *   ③ 探针闭合：TS 契约里的**真实字段名**必须能从源码枚举出来（防「允许集合写死成空集」）。
 *
 * ⚠️ 自限（显式披露，R7-1 第 7 轮评审按实测收窄文案；13/13 复盘再收一条）：
 *   ① **间接读（`const k='success'; out[k]`）原不在覆盖内 —— 13/13 复盘已闭合**：
 *      原判据只按成员访问 `.key` 判「读过该键」，实测 `const k='success'; output[k] !== false`
 *      全绿（假绿，与本源 bug 同族）；现判据① 同时拦「**值为信封字段名的标识符** + 计算成员读取」，
 *      并**只登记「绑定值 = 字段名」的别名**（与信封无关的同名变量如循环计数器不误报）。
 *      残留自限：别名若经**再赋值/函数参数/对象属性**间接传递（非直接 `const k = '<字段名>'`）
 *      则不声称拦住 —— 本仓 `grep` 无该形态；
 *   ② 判据② 只拦**同类字段名紧跟 true/false** 的标记形态，不拦「用别的字面量拼字段名」；
 *   ③ **键名同一 ≠ 取值语义同一**（R10 终审实测撤回一次误报后收窄此条）：判据④ 断言的是
 *      「允许键 ∈ 投影公式产出的**键集**」，**不**断言投影式 `isError = !result.success` 的
 *      **取值语义**（实测：把投影式改成常量后派生键集不变，本守卫**不报**）。
 *      取值语义由 MCP 侧真实链路测试承担（`proofread-envelope-contract-401.test.ts`
 *      用真实 handler 走两条路径断言 `isError` 的真值），本守卫**不声称**覆盖该面。
 *
 * 单一来源（R5「不引入第二份真值」）：
 *   · 消费侧源码 = `.opencode/plugins/governance.js`（消费方本体，**唯一消费面**）；
 *   · 契约字段名 = `wps-office-mcp/src/types/tools.ts` 的 `ToolCallResult` / `CallToolResponse`
 *     **源码枚举**（不手写字段名清单）；
 *   · 允许读的键 = `scripts/lib/semantic-anchor-scope.js` 的 `ENVELOPE_ALLOWED_KEYS`
 *     （判据纯函数同源，本 CLI 不自持第二份常量）。
 *
 * 用法：node scripts/validate-tool-result-payload.js [--json]
 * 退出码：0 = 通过；1 = 存在信封契约违规。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ENVELOPE_ALLOWED_KEYS,
  checkEnvelopeKeyUsage,
  checkEnvelopeAllowlist,
  checkEnvelopeConsumption,
  checkPayloadMarkerGuard,
} = require('./lib/semantic-anchor-scope.js');

const rootDir = path.resolve(__dirname, '..');
const asJson = process.argv.includes('--json');
const read = rel => {
  const abs = path.join(rootDir, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

const GOV_SRC_REL = '.opencode/plugins/governance.js';
const CONTRACT_SRC_REL = 'wps-office-mcp/src/types/tools.ts';
const MCP_SERVER_REL = 'wps-office-mcp/src/server/mcp-server.ts';

/** 从 mcp-server.ts 的**投影公式**派生投影后键集（独立来源，R8-1）。 */
function deriveProjectedKeys(src) {
  if (typeof src !== 'string') return [];
  const m = /return\s*\{\s*([A-Za-z_]+)\s*:\s*result\.content\s*,\s*([A-Za-z_]+)\s*:\s*!result\.success/.exec(
    src
  );
  return m ? [m[1], m[2]] : [];
}

/** 从 TS 契约源码枚举信封字段名（**唯一来源 = 源码**，不手写清单）。 */
function deriveEnvelopeFieldNames(src) {
  if (typeof src !== 'string') return [];
  const names = new Set();
  for (const iface of ['ToolCallResult', 'CallToolResponse']) {
    const m = new RegExp(`interface\\s+${iface}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src);
    if (!m) continue;
    for (const f of m[1].matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)) names.add(f[1]);
  }
  return [...names].sort();
}

const errors = [];
const warnings = [];

const govSrc = read(GOV_SRC_REL);
// 判据④ 输入：投影键集（独立来源 = mcp-server.ts 的投影公式，不读 ENVELOPE_ALLOWED_KEYS）。
const projectedKeys = deriveProjectedKeys(read(MCP_SERVER_REL));
{
  const al = checkEnvelopeAllowlist(ENVELOPE_ALLOWED_KEYS, projectedKeys);
  errors.push(...al.errors);
  warnings.push(...al.warnings);
}

const contractSrc = read(CONTRACT_SRC_REL);
// 字段名派生**无条件**先做（它不依赖消费侧）：缺派生源即报红，且下游两条判据都以它为输入。
const fieldNames = deriveEnvelopeFieldNames(contractSrc);
if (fieldNames.length === 0) {
  errors.push(
    `契约字段名枚举为空：无法从 ${CONTRACT_SRC_REL} 的 ToolCallResult / CallToolResponse 派生字段` +
      ` —— 派生源缺失时**报红**（不得让「允许集合」凭此退化为空集而恒真）`
  );
}
if (typeof govSrc !== 'string') {
  errors.push(`消费侧源文件缺失：${GOV_SRC_REL}（无法判定信封契约）`);
} else {
  // 间接读面需「字段名单源」（TS 契约派生）以识别「绑定值 = 字段名」的别名（13/13 复盘加固）。
  const ku = checkEnvelopeKeyUsage(govSrc, ENVELOPE_ALLOWED_KEYS, fieldNames);
  errors.push(...ku.errors);
  warnings.push(...ku.warnings);
  const ec = checkEnvelopeConsumption(govSrc, ENVELOPE_ALLOWED_KEYS);
  errors.push(...ec.errors);
  warnings.push(...ec.warnings);
  // ⚠️ R5-1（第 5 轮复评）：判据② **不得**因判据③ 先报红而被静默跳过 ——
  //   此前写成 `else if (typeof govSrc === 'string')`，缺派生源时判据② 整条不执行（缺席不可见）。
  //   现改为「两条判据各自独立执行、各报各的」，让「哪条缺席」在输出里可见。
  if (fieldNames.length > 0) {
    const mg = checkPayloadMarkerGuard(govSrc, fieldNames);
    errors.push(...mg.errors);
    warnings.push(...mg.warnings);
  } else {
    errors.push(
      '判据②（字段名不得进兜底文案）**未执行** —— 缺字段名单源；不得静默跳过（R5-1）'
    );
  }
}

const result = {
  ok: errors.length === 0,
  allowedKeys: ENVELOPE_ALLOWED_KEYS,
  projectedKeys,
  derivedFieldNames: fieldNames,
  errors,
  warnings,
};
if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('工具结果信封契约守卫（Issue #401 W-2）');
  console.log(`  允许读的信封顶层键：{${ENVELOPE_ALLOWED_KEYS.join(', ')}}`);
  console.log(`  从 TS 契约派生的字段名：{${fieldNames.join(', ')}}`);
  for (const w of warnings) console.log('  ⚠️ ' + w);
  if (errors.length) for (const e of errors) console.error('  ✗ ' + e);
  console.log(result.ok ? '✓ 通过' : `✗ 存在 ${errors.length} 处违规`);
}
process.exit(result.ok ? 0 : 1);
