'use strict';

/**
 * 「P2 覆盖全文后禁止推进」**不变量行为断言**判据纯函数（Issue #400）。
 *
 * 防什么（Issue #400 现象）：`governance.js` 的 P2「覆盖全文后禁止推进」门禁有一个**前置**
 *   ——「本批已上报」（`batchAccumulatedThisBatch`，Issue #395 RC-2 引入）。该前置保证
 *   单批（≤200 段）文档「首批取段即达文末」时，尚未上报 ⇒ ③取文本 + ④校对**均不被拦**（否则闭环死锁）。
 *   把该前置整块删除 ⇒ `tests/` 察觉（整链 e2e），但 `scripts/` 层守卫**全 exit 0**（未察觉）
 *   ⇒ 铁律 24 第 7 维「**不变量必须归属门禁**」缺口：语义被测试承载，却没有可独立执行的守卫拥有它。
 *
 * 判据口径（**行为断言，非形态断言**，铁律 24 第 7 维「测行为不测形态」）：
 *   本模块不读源码字符串、不复述判据实现 —— 它只**消费行为**：给链路注入一串工具调用，
 *   断言 `tool.execute.before` 在特定环节**抛 / 不抛**。
 *   ① 单批不变量：单批文档取段后，③取文本 + ④校对 **均不抛**（否则闭环死锁，CR1-1）；
 *   ② 对偶面：多批末批上报（覆盖全文）后继续推进 **抛**（且消息含 `P2`），
 *      防「为过 ① 而整块删门禁」。
 *
 * ⚠️ 单一来源（沿用 #321 R9-A）：本模块**不出现任何仓库路径字面量** —— 插件对象、工具名、
 *   链路构造参数一律由 caller（守卫 CLI）传入。
 *
 * ⚠️ 自限（显式披露，非放宽）：判据是**行为**断言，覆盖「本批已上报」前置被删 / P2 门禁整块被删
 *   这两类**语义破坏**；它**不声称**拦住「不改行为、只改判据写法」的重构（那不该被拦）。
 */

/** 由 caller 传入的工具名集合（SKILL.md 实际教 AI 调用的形态：内置名 + 下划线键名）。 */
const REQUIRED_TOOLS = ['active', 'para', 'text', 'proofread', 'confirm', 'accumulate'];

/**
 * 构造内置名 / 段输出的**契约形状**（caller 只需给工具名，形状由本模块给 —— 单一来源）。
 * 内置名成功体是 **JSON**（`wps_get_active_document`），段输出形态见 `paraOut`。
 */
function builtinJson(total, docPath) {
  return JSON.stringify({
    name: 'a.docx',
    path: docPath,
    paragraphCount: total,
    wordCount: 9,
    channelReady: true,
  });
}

function paraOut(a, b) {
  return (
    Array.from({ length: b - a + 1 }, (_, i) => {
      const idx = a + i;
      return `[${idx}] (正文) [${(idx - 1) * 10}-${(idx - 1) * 10 + 9}] 第${idx}段`;
    }).join('\n') + `\n共${b}段`
  );
}

/** 该对象是否具备两个治理钩子（缺任一即不是有效插件实例）。 */
function hasHooks(plugin) {
  const obj = plugin || {};
  return (
    typeof obj['tool.execute.before'] === 'function' && typeof obj['tool.execute.after'] === 'function'
  );
}

/** 取插件钩子（兼容 `tool.execute.before` / `tool.execute.after` 两个函数）。
 *  钩子存在性判定**唯一来源 = `hasHooks`**（CR1-3：此前 `hooksOf` 内又判一遍 = 同一语义两处写）。 */
function hooksOf(plugin) {
  const obj = plugin || {};
  return { before: obj['tool.execute.before'], after: obj['tool.execute.after'] };
}

function makeRunner(plugin, sid) {
  const { before, after } = hooksOf(plugin);
  if (!hasHooks(plugin)) {
    throw new Error('P2 不变量判据：插件对象缺少 tool.execute.before / tool.execute.after 钩子');
  }
  const ev = (tool, args) => ({ tool, sessionID: sid, callID: 'c', args: args || {} });
  const out = text => ({ output: text });
  const step = async (tool, args, outText) => {
    await before(ev(tool, args), {});
    if (outText !== undefined) await after(ev(tool, args), out(outText));
  };
  return { ev, step, before };
}

/**
 * ① 单批不变量：单批（≤200 段）文档「首批取段即达文末」，③取文本 + ④校对 **均不抛**。
 *
 * @param {object} plugin prod 插件对象（caller 传入）
 * @param {object} tools  `{ active, para, text, proofread, ... }` 工具名
 * @param {number} total  单批文档总段数（默认 56，≤200）
 * @param {string} passId 会话隔离 id（caller 给，保证重复调用互不污染）
 */
async function singleBatchTextAllowed(plugin, tools, total, passId, opts) {
  const options = opts || {};
  const { ev, step, before } = makeRunner(plugin, passId);
  await step(tools.active, {}, builtinJson(total, '/p/a.docx'));
  await step(tools.para, { start_paragraph: 1, end_paragraph: total }, paraOut(1, total));
  const text = 'x'.repeat(total * 10);
  // ③ 取文本（CR1-1：R1 原文 = 「校对**前**不被拦」—— ③与④**两环**都须断言，缺 ④ 即覆盖不足）
  //   `options.skipText`：为「只断言 ④校对」的专测而设（抽掉 ③ 环节以证明 ④ 被独立断言，非空跑）。
  if (!options.skipText) {
    const textArgs = { start_offset: 0, length: total * 10 };
    try {
      await before(ev(tools.text, textArgs), {});
    } catch (e) {
      return { ok: false, message: '③取文本被拦：' + String((e && e.message) || e) };
    }
    await fakeAfter(plugin, ev(tools.text, textArgs), text);
  }
  // ④ 校对（proofreadBasic）—— 同样不得被 P2 拦
  try {
    await before(ev(tools.proofread, { start_offset: 0, text }), {});
  } catch (e) {
    return { ok: false, message: '④校对被拦：' + String((e && e.message) || e) };
  }
  return { ok: true, message: '' };
}

/** 触发 after 钩子（供取文本等环节补全链路状态；无 after 时静默跳过 —— hasHooks 已前置校验）。 */
async function fakeAfter(plugin, event, outText) {
  const { after } = hooksOf(plugin);
  if (typeof after === 'function') await after(event, { output: outText });
}

/**
 * ② 对偶面：多批末批上报（覆盖全文）后继续推进 仍被 P2 拦。
 *
 * @param {object} plugin prod 插件对象
 * @param {object} tools  工具名集合
 * @param {number} perBatch 单批段数（默认 200）
 * @param {number} batches  批数（默认 2 ⇒ 总 400 段）
 * @param {string} passId  会话隔离 id
 */
async function multiBatchAdvanceBlocked(plugin, tools, perBatch, batches, passId) {
  const { ev, step, before } = makeRunner(plugin, passId);
  const total = perBatch * batches;
  // ⚠️ 前置链（取文档→各批取段/取文本/校对/确认/上报）**允许中途被拦** —— 若变异破坏 P2 前置，
  //   链路可能在取文本/校对环节即被拦（结果仍是「不变量被破坏」，须如实报红而非抛未捕获异常）。
  //   故逐条 try/catch：前置链被拦即视为「P2 前置已失效 ⇒ 不变量被破坏」，返回 ok:false。
  try {
    await step(tools.active, {}, `路径: /p/b.docx\n总段数: ${total}`);
    for (let b = 0; b < batches; b++) {
      const start = b * perBatch + 1;
      const end = start + perBatch - 1;
      await step(tools.para, { start_paragraph: start, end_paragraph: end }, paraOut(start, end));
      await step(
        tools.text,
        { start_offset: (start - 1) * 10, length: perBatch * 10 },
        'x'.repeat(perBatch * 10)
      );
      await step(
        tools.proofread,
        { start_offset: (start - 1) * 10, text: 'x'.repeat(perBatch * 10) },
        'no issues'
      );
      await step(tools.confirm, {}, 'ok');
      await step(tools.accumulate, {}, 'ok');
    }
  } catch (e) {
    return {
      ok: false,
      message:
        '前置链在「取段/取文本/校对/上报」环节被拦 ⇒ P2 前置已失效（不变量被破坏）：' +
        String((e && e.message) || e).slice(0, 120),
    };
  }
  try {
    await before(
      ev(tools.para, { start_paragraph: total + 1, end_paragraph: total + perBatch }),
      {}
    );
  } catch (e) {
    return { ok: true, message: String((e && e.message) || e) };
  }
  return { ok: false, message: '' };
}

/**
 * 汇总判据：两条行为断言，返回错误清单（空 = 通过）。
 * caller 负责提供插件对象与工具名集合（单一来源在 caller 侧）。
 */
async function checkP2Invariant(plugin, tools, opts) {
  const options = opts || {};
  const total = typeof options.total === 'number' ? options.total : 56;
  const perBatch = typeof options.perBatch === 'number' ? options.perBatch : 200;
  const batches = typeof options.batches === 'number' ? options.batches : 2;
  const errors = [];

  for (const k of REQUIRED_TOOLS) {
    if (!tools || !tools[k]) errors.push(`P2 不变量判据：工具名集合缺 '${k}'（caller 须提供）`);
  }
  // ⚠️ 缺钩子属**结构性错误**（插件对象不是有效治理插件）——须作为 error 返回，
  //   不得抛未捕获异常（否则调用方只见崩溃、拿不到可读的失败原因）。
  if (!hasHooks(plugin)) {
    errors.push(
      'P2 不变量判据：插件对象缺少 tool.execute.before / tool.execute.after 钩子 ——' +
        '不是有效治理插件实例，无法断言不变量'
    );
    return { errors, warnings: [] };
  }
  if (errors.length > 0) return { errors, warnings: [] };

  const r1 = await singleBatchTextAllowed(plugin, tools, total, `p2-single-${Math.random()}`);
  if (!r1.ok) {
    errors.push(
      `单批（${total} 段）文档「首批取段即达文末」时，③取文本 / ④校对**被 P2 拦** ⇒ 闭环死锁 ` +
        `（Issue #395 RC-2 / Issue #400 不变量被破坏）。实际：${r1.message.slice(0, 120)}`
    );
  }

  const r2 = await multiBatchAdvanceBlocked(
    plugin,
    tools,
    perBatch,
    batches,
    `p2-multi-${Math.random()}`
  );
  if (!r2.ok) {
    errors.push(
      `多批末批上报（覆盖全文）后继续推进**未被 P2 拦** ⇒ 覆盖全文门禁失效 ` +
        `（对偶面：不得为过单批断言而整块删门禁）。` +
        (r2.message || '')
    );
  } else if (r2.message.indexOf('P2') === -1) {
    errors.push(
      `多批末批推进虽被拦，但拦截消息不含 'P2' ⇒ 可能由其它门禁误拦。实际：${r2.message.slice(0, 120)}`
    );
  }

  return { errors, warnings: [] };
}

module.exports = {
  REQUIRED_TOOLS,
  hasHooks,
  builtinJson,
  paraOut,
  singleBatchTextAllowed,
  multiBatchAdvanceBlocked,
  checkP2Invariant,
};
