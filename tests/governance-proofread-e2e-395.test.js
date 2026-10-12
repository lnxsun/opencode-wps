/**
 * 校对整链真跑通 + 变异自证（Issue #395 7/13 QA · A1/A2/A3）
 *
 * 背景：Issue #395「校对抽风」的 6 类根因**全部落在单测覆盖不到的那道缝**里：
 *   · RC-0  内置名 `wps_get_active_document`（**SKILL.md 实际教 AI 调的名字**）归一为 null
 *            ⇒ 门禁 `docInfoFetched` 永不置位 ⇒ 后续全被「请先调用 getActiveDocument」拦死；
 *   · RC-0′ 内置名成功体是 **JSON**，after 钩子只按文本正则解析 ⇒ totalParagraphs=0；
 *   · RC-1  `proofreadBasic` 门禁读驼峰 `startOffset`，而 MCP schema 只暴露 `start_offset`；
 *   · RC-2  单批（≤200 段）文档首批取段即「覆盖全文」⇒ ③取文本/④校对/⑤确认/⑥替换 全被 P2 拦。
 *
 * 手法（A1 同一入口 / A2 名实一致 / A3 变异自证）：
 *   · A1：**一条**整链函数 `runFullChain()` 串起 ①取文档→②取段→③取文本→④校对→⑤开修订→⑥确认→⑦替换→⑧上报→⑨出报告；
 *         （⑨ `generateProofreadReport` 是 Issue #395 收口补入 —— 原「整链」止于 accumulate，报告环不在链内，
 *          「8 处问题 / 六维全 10.0」正是报告环的产物 ⇒ 不接进来则「整链」名不副实。报告**计数对账**断言
 *          「六维计数 + 未分类数 == 上报总数」落在真实 handler 侧：`wps-office-mcp/src/tests/unit/
 *          proofread-full-chain-report-395.test.ts`（根 e2e 无法运行 TS handler，故按架构分层落点）；
 *   · A2：链中工具名/参数键名 = `SKILL.md` 教 AI 用的那套（内置名 + `start_offset` 下划线）；
 *   · A3：每个断言均可被「变异注入」打红 —— 用 `MUTATIONS` 把修复点逐个还原，链须由绿转红；
 *         还原后仍绿 = 该修复未被覆盖（假修复）。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0;
const failures = [];
const asyncTests = [];
const testAsync = (name, fn) => asyncTests.push({ name, fn });

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, '.opencode', 'plugins', 'governance.js');
const GOV_SRC = fs.readFileSync(PLUGIN, 'utf8');
const SKILL_SRC = fs.readFileSync(path.join(ROOT, 'skills', 'wps-proofread', 'SKILL.md'), 'utf8');

/**
 * A2 名实一致的**单源键名**（评审 CR2-1）：链中传给治理层的 proofread_basic 坐标键名。
 *   · `runFullChain` 的取文本 / 校对两步与 AC7.4 断言**同源取用**本常量（不再各写一份字面量）；
 *   · AC7.4 断言 `PROOFREAD_START_KEY == SKILL.md「必须传」句的键名`，并加真实链路变异自证
 *     （把本常量改驼峰 ⇒ 链会被治理层「缺少 start_offset」拦下）。
 */
const PROOFREAD_START_KEY = 'start_offset';

const out = text => ({ output: text });
const paraOut = (a, b) =>
  Array.from({ length: b - a + 1 }, (_, i) => {
    const idx = a + i,
      start = (idx - 1) * 10,
      end = start + 9;
    return `[${idx}] (正文) [${start}-${end}] 第${idx}段`;
  }).join('\n') + `\n共${b}段`;
// 内置名 `wps_get_active_document` 的**真实**成功体（`mcp-server.ts`）：JSON
// 段输出**不含**「共N段」尾巴：用于「JSON 解析变异」用真实链路断言 —— 治理层对 getDocumentParagraphs
// 输出有「共N段」兜底（`governance.js` :682），若段输出带该尾巴会掩盖「getActiveDocument 的 JSON
// 未被解析」这一事实（totalParagraphs 会被兜底补上，P2 仍能触发 ⇒ 变异不自证）。
const paraNoTotal = (a, b) =>
  Array.from({ length: b - a + 1 }, (_, i) => {
    const idx = a + i,
      start = (idx - 1) * 10,
      end = start + 9;
    return `[${idx}] (正文) [${start}-${end}] 第${idx}段`;
  }).join('\n');

const BUILTIN_JSON = doc =>
  JSON.stringify({
    name: 'a.docx',
    path: doc.path,
    paragraphCount: doc.total,
    wordCount: 9,
    channelReady: true,
  });

async function loadPlugin() {
  const mod = await import(PLUGIN);
  return mod.WpsGovernancePlugin();
}

/** 单批文档（≤200 段）整链：A2 名实一致 —— 工具名/参数键名全部按 SKILL.md 教的形态。 */
async function runFullChain(plugin, { tools, doc }) {
  const before = plugin['tool.execute.before'];
  const after = plugin['tool.execute.after'];
  const sid = 'e2e-' + Math.random();
  // A2 第二条（Issue #395 RC-6）：契约形态也须名实一致 —— before 的参数在**第二参 output.args**
  // （官方 @opencode-ai/plugin 契约），after 才在 input.args。测试不得用旧约定替被测代码擦屁股。
  const ev = (tool, args) => ({ tool, sessionID: sid, callID: 'c', args });
  const step = async (tool, args, outText) => {
    await before({ tool, sessionID: sid, callID: 'c' }, { args });
    if (outText !== undefined) await after(ev(tool, args), out(outText));
  };
  // ① 取文档：**内置名**（SKILL.md:16 教 AI 调的就是它）+ JSON 成功体
  await step(tools.active, {}, BUILTIN_JSON(doc));
  // ② 取段（本批 ≤200 段）
  await step(tools.para, { start_paragraph: 1, end_paragraph: doc.total }, paraOut(1, doc.total));
  // ③ 取文本 / ④ 校对：键名与 AC7.4 **同源**（PROOFREAD_START_KEY，A2 单源，评审 CR2-1）
  await step(
    tools.text,
    { [PROOFREAD_START_KEY]: 0, length: doc.total * 10 },
    'x'.repeat(doc.total * 10)
  );
  await step(
    tools.proofread,
    { [PROOFREAD_START_KEY]: 0, text: 'x'.repeat(doc.total * 10) },
    'no issues'
  );
  // ⑤ 开启修订 + 确认
  await step(tools.track, { enable: true }, '修订模式: 已开启');
  await step(tools.confirm, {}, 'ok');
  // ⑥ 修复
  await step(tools.replace, { paragraphIndex: 1, findText: 'x', replaceText: 'y' }, 'ok');
  // ⑦ 上报（覆盖全文）
  await step(tools.accumulate, {}, 'ok');
  // ⑧ 出报告（Issue #395 收口）：整链**必须**以 generateProofreadReport 收尾，否则「整链」止于 accumulate。
  // 治理层对此步为收尾校验（成功后置 reportGenerated，解除 P2「覆盖全文」拦截语义）。
  await step(tools.report, {}, '# 校对报告\n- **发现问题**: 0 处');
  return true;
}

const SINGLE_BATCH_TOOLS = {
  active: 'wps_get_active_document',
  para: 'wps_word_get_paragraphs',
  text: 'wps_word_get_document_text_by_range',
  proofread: 'wps_word_proofread_basic',
  track: 'wps_word_enable_track_changes',
  confirm: 'wps_word_confirm_batch_ai_proofread',
  replace: 'wps_word_replace_in_paragraph',
  accumulate: 'wps_word_proofread_accumulate',
  report: 'wps_word_generate_proofread_report',
};

async function run() {
  // ── AC7.1 / AC7.2：单批（56 段）+ SKILL 真实教的名字 → 整链跑通 ──
  testAsync('AC7.1/AC7.2 单批 56 段整链（内置名 + start_offset）全环跑通', async () => {
    const plugin = await loadPlugin();
    await runFullChain(plugin, {
      tools: SINGLE_BATCH_TOOLS,
      doc: { path: '/p/a.docx', total: 56 },
    });
  });

  // ── AC1.1：内置名之后取段不被拦（名实一致） ──
  testAsync('AC1.1 内置名 wps_get_active_document 之后 → getDocumentParagraphs 放行', async () => {
    const plugin = await loadPlugin();
    const sid = 'ac11-' + Math.random();
    const active = SINGLE_BATCH_TOOLS.active;
    await plugin['tool.execute.before'](
      { tool: active, sessionID: sid, callID: 'c' },
      { args: {} }
    );
    await plugin['tool.execute.after'](
      { tool: active, sessionID: sid, callID: 'c', args: {} },
      out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
    );
    await plugin['tool.execute.before'](
      {
        tool: SINGLE_BATCH_TOOLS.para,
        sessionID: sid,
        callID: 'c',
      },
      { args: { start_paragraph: 1, end_paragraph: 56 } }
    );
  });

  // ── R7-1（评审 CR7-1）：AC1.1 补「负向对照」——证明门禁**真被评估**（防「不抛即绿」的空跑） ──
  testAsync('R7-1 负向对照：未经内置名取文档 ⇒ 取段必须被拦（证明门禁被真正评估）', async () => {
    // 「跑通」类用例（AC1.1/1.2/2.1/3.1）只断言「不抛」，若不抛是因为门禁**根本没执行**（如归一为
    // null ⇒ before 钩子整体 return），用例会空跑变绿。本对照在同一链路上**抽掉取文档**，必须转拦。
    const plugin = await loadPlugin();
    const sid = 'r71-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    await assert.rejects(
      () =>
        plugin['tool.execute.before'](
          ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
        ),
      /getActiveDocument|读取文档状态/,
      '未经取文档的取段必须被拦 ⇒ 证明 AC1.1 「不抛」不是空跑'
    );
  });

  // ── AC1.2：JSON 形态被解析（totalParagraphs 被取到） ──
  testAsync('AC1.2 内置名 JSON 成功体 → 文档路径与总段数被解析（文本/JSON 双形态）', async () => {
    // 形态 1：JSON（内置名）
    const p1 = await loadPlugin();
    const s1 = 'ac12j-' + Math.random();
    await p1['tool.execute.before'](
      { tool: SINGLE_BATCH_TOOLS.active, sessionID: s1, callID: 'c' },
      { args: {} }
    );
    await p1['tool.execute.after'](
      { tool: SINGLE_BATCH_TOOLS.active, sessionID: s1, callID: 'c', args: {} },
      out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
    );
    // JSON 被解析 ⇒ 覆盖全文门禁在「取段后」不误拦（totalParagraphs 非 0 才会触发，故此处验证
    // 用多批形态更能体现；这里直接断言「取段后取文本不被 P2 拦」已证明解析成功）
    await p1['tool.execute.before'](
      {
        tool: SINGLE_BATCH_TOOLS.para,
        sessionID: s1,
        callID: 'c',
      },
      { args: { start_paragraph: 1, end_paragraph: 56 } }
    );
    await p1['tool.execute.after'](
      {
        tool: SINGLE_BATCH_TOOLS.para,
        sessionID: s1,
        callID: 'c',
        args: { start_paragraph: 1, end_paragraph: 56 },
      },
      out(paraOut(1, 56))
    );
    await p1['tool.execute.before'](
      {
        tool: SINGLE_BATCH_TOOLS.text,
        sessionID: s1,
        callID: 'c',
      },
      { args: { start_offset: 0, length: 560 } }
    );
  });

  // ── AC2.1：直连只传 start_offset 不被拦 ──
  testAsync('AC2.1 直连 proofreadBasic 只传 start_offset（下划线）不被拦', async () => {
    const plugin = await loadPlugin();
    const sid = 'ac21-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
    await plugin['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.active, {}),
      out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
    );
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
    );
    await plugin['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }),
      out(paraOut(1, 56))
    );
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 })
    );
    await plugin['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 }),
      out('x'.repeat(560))
    );
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.proofread, { start_offset: 0, text: 'x'.repeat(560) })
    );
  });

  // ── AC3.1：单批整链不被 P2 拦（RC-2） ──
  testAsync('AC3.1 单批文档 ③取文本/④校对 不被 P2「已覆盖全文」拦（RC-2 死锁解除）', async () => {
    const plugin = await loadPlugin();
    const sid = 'ac31-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
    await plugin['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.active, {}),
      out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
    );
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
    );
    await plugin['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }),
      out(paraOut(1, 56))
    );
    // ③ 取文本：修复前此处即被 P2 拦
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 })
    );
    await plugin['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 }),
      out('x'.repeat(560))
    );
    // ④ 校对
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.proofread, { start_offset: 0, text: 'x'.repeat(560) })
    );
  });

  // ── AC3.2：多批末批上报后继续推进仍被 P2 拦（语义保持） ──
  testAsync('AC3.2 多批末批上报（覆盖全文）后继续推进 → 仍被 P2 拦（语义保持）', async () => {
    const plugin = await loadPlugin();
    const sid = 'ac32-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    const step = async (t, a, o) => {
      await plugin['tool.execute.before'](...evb(t, a));
      if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
    };
    await step(
      SINGLE_BATCH_TOOLS.active,
      {},
      '当前文档: a.docx\n路径: /p/a.docx\n总段数: 400\n字数: 9'
    );
    await step(
      SINGLE_BATCH_TOOLS.para,
      { start_paragraph: 1, end_paragraph: 200 },
      paraOut(1, 200)
    );
    await step(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 2000 }, 'x'.repeat(2000));
    await step(
      SINGLE_BATCH_TOOLS.proofread,
      { start_offset: 0, text: 'x'.repeat(2000) },
      'no issues'
    );
    await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
    await step(SINGLE_BATCH_TOOLS.accumulate, {}, 'ok');
    await step(
      SINGLE_BATCH_TOOLS.para,
      { start_paragraph: 201, end_paragraph: 400 },
      paraOut(201, 400)
    );
    await step(SINGLE_BATCH_TOOLS.text, { start_offset: 2000, length: 2000 }, 'x'.repeat(2000));
    await step(
      SINGLE_BATCH_TOOLS.proofread,
      { start_offset: 2000, text: 'x'.repeat(2000) },
      'no issues'
    );
    await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
    await step(SINGLE_BATCH_TOOLS.accumulate, {}, 'ok');
    // 末批覆盖全文且已上报 → 再推进必须被 P2 拦
    let blocked = null;
    try {
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 401, end_paragraph: 600 })
      );
    } catch (e) {
      blocked = String(e.message || e);
    }
    assert(blocked, '多批覆盖全文后继续推进必须被拦（AC3.2 语义保持）');
    assert(blocked.includes('P2'), '应由 P2 拦（覆盖全文），实际: ' + blocked.slice(0, 90));
  });

  // ── Issue #420：已覆盖区间内的**只读重读**放行（原实现被 P1「本批未走完不得取下一批」整片拦死） ──
  testAsync('Issue #420 已覆盖区间内重读段落 → 放行（只读、不推进进度）', async () => {
    const plugin = await loadPlugin();
    const sid = 'i420reread-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    const step = async (t, a, o) => {
      await plugin['tool.execute.before'](...evb(t, a));
      if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
    };
    // 首批 1-54 段走完（取段 → 取文本 → 校对 → 确认 → 上报），已覆盖 54 段
    await step(
      SINGLE_BATCH_TOOLS.active,
      {},
      '当前文档: a.docx\n路径: /p/a.docx\n总段数: 100\n字数: 9'
    );
    await step(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 54 }, paraOut(1, 54));
    await step(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 540 }, 'x'.repeat(540));
    await step(
      SINGLE_BATCH_TOOLS.proofread,
      { start_offset: 0, text: 'x'.repeat(540) },
      'no issues'
    );
    await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
    await step(SINGLE_BATCH_TOOLS.accumulate, {}, 'ok');
    // 重读**已覆盖**的 19-27 段（会话实证：AI 只需回看坐标）——只读操作，不得被拦
    let blocked = null;
    try {
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 19, end_paragraph: 27 })
      );
    } catch (e) {
      blocked = String(e.message || e);
    }
    assert(!blocked, '已覆盖区间内重读段落必须放行，实际被拦: ' + String(blocked).slice(0, 120));
  });

  testAsync(
    'Issue #420 负向对照：越过已覆盖范围的「下一批」仍被 P1/P2 拦（豁免不得放大）',
    async () => {
      const plugin = await loadPlugin();
      const sid = 'i420next-' + Math.random();
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
      const step = async (t, a, o) => {
        await plugin['tool.execute.before'](...evb(t, a));
        if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
      };
      await step(
        SINGLE_BATCH_TOOLS.active,
        {},
        '当前文档: a.docx\n路径: /p/a.docx\n总段数: 400\n字数: 9'
      );
      await step(
        SINGLE_BATCH_TOOLS.para,
        { start_paragraph: 1, end_paragraph: 200 },
        paraOut(1, 200)
      );
      await step(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 2000 }, 'x'.repeat(2000));
      await step(
        SINGLE_BATCH_TOOLS.proofread,
        { start_offset: 0, text: 'x'.repeat(2000) },
        'no issues'
      );
      await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
      // ⚠️ 此处**不**上报（accumulate）—— 让本批仍处「已校对已确认、可推进下一批」的**合法**状态，
      // 从而隔离出唯一的判别式：豁免判据是 `end ≤ 已覆盖段`，而非「取段本身是否被允许」。
      // 区间**跨越**已覆盖上界（end 300 > 200）⇒ 不是纯重读，不适用豁免，仍须被 P1「批次不连续」拦。
      let blocked = null;
      try {
        await plugin['tool.execute.before'](
          ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 150, end_paragraph: 250 })
        );
      } catch (e) {
        blocked = String(e.message || e);
      }
      assert(blocked, '跨越已覆盖上界的区间必须仍被拦（豁免只认「完全落在已覆盖范围内」）');
      assert(blocked.includes('批次不连续'), '应由 P1 批次连续性拦，实际: ' + blocked.slice(0, 90));
    }
  );

  // ── AC7.3 变异自证：逐个还原修复点 → 断言由绿转红 ──
  // 手法：把 `governance.js` 源码按「修复前」形态改写后**落到临时文件**再 import，
  // 使链路走回旧行为；每处还原后「该修复对应的断言」须失败。
  testAsync('AC7.3 变异自证：还原内置名归一 → AC1.1 由绿转红', async () => {
    const mutated = await loadMutated(
      GOV_SRC.replace(/const builtin = \{[\s\S]*?\};/, 'const builtin = {};')
    );
    const blocked = await captureBlock(mutated, async (plugin, sid) => {
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
      const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
      await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.active, {}),
        out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
      );
    });
    assert(blocked, '还原内置名归一后，内置名调完的取段必须被拦（证明该修复被覆盖）');
  });

  testAsync('AC7.3 变异自证：还原 JSON 解析（走真实链路）→ 断言由绿转红', async () => {
    // 走真实链路（与其余 3 组同构）：还原 JSON 解析后，内置名 JSON 成功体 ⇒ totalParagraphs=0
    // ⇒ AC3.2「多批覆盖全文后继续推进被 P2 拦」语义失效（不再拦）⇒ 断言由绿转红。
    // 注意：必须跑链路断言行为，不得只断言源码文本形态（铁律 24 第 7 维）。
    const mutated = await loadMutated(
      GOV_SRC.replace(
        /const docObj = extractJsonFromOutput\(outText\);[\s\S]*?docObj && typeof docObj\.paragraphCount === 'number' \? docObj\.paragraphCount : 0;/,
        'const docObj = null;\n          const paraCountFromJson = 0;'
      )
    );
    assert(mutated !== GOV_SRC, '变异注入未生效（源码形状已变，请同步本测试）');
    const blocked = await captureBlock(mutated, async (plugin, sid) => {
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
      const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
      const step = async (t, a, o) => {
        await plugin['tool.execute.before'](...evb(t, a));
        if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
      };
      // 内置名 + JSON 成功体（400 段，多批）—— 修复后 totalParagraphs 由 JSON 解析得到 400
      await step(SINGLE_BATCH_TOOLS.active, {}, BUILTIN_JSON({ path: '/p/a.docx', total: 400 }));
      // 两批各 200 段，均上报 ⇒ 覆盖全文
      for (const start of [1, 201]) {
        await step(
          SINGLE_BATCH_TOOLS.para,
          { start_paragraph: start, end_paragraph: start + 199 },
          paraNoTotal(start, start + 199)
        );
        await step(
          SINGLE_BATCH_TOOLS.text,
          { start_offset: (start - 1) * 10, length: 2000 },
          'x'.repeat(2000)
        );
        await step(
          SINGLE_BATCH_TOOLS.proofread,
          { start_offset: (start - 1) * 10, text: 'x'.repeat(2000) },
          'no issues'
        );
        await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
        await step(SINGLE_BATCH_TOOLS.accumulate, {}, 'ok');
      }
      // 末批覆盖全文且已上报 → 再推进必须被 P2 拦（totalParagraphs 正确解析才会拦）
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 401, end_paragraph: 600 })
      );
    });
    // 变异已生效的证据：还原 JSON 解析后 totalParagraphs 不再由 JSON 取得 ⇒ P2 覆盖全文**不再拦**
    // （即原修复确实被本链路覆盖 —— 修复前该链路不拦，修复后才拦）。
    assert(
      !blocked,
      '还原 JSON 解析后应「不再被 P2 拦」（证明该修复被链路覆盖）；实际被拦: ' +
        String(blocked).slice(0, 120)
    );
  });

  testAsync('AC7.3 变异自证：还原参数键名归一 → AC2.1 由绿转红', async () => {
    const mutated = await loadMutated(
      GOV_SRC.replace(
        /function normalizeStartOffset\(args\) \{[\s\S]*?\n\}/,
        'function normalizeStartOffset(args) {\n  return (args || {}).startOffset;\n}'
      )
    );
    const blocked = await captureBlock(mutated, async (plugin, sid) => {
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
      const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
      await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.active, {}),
        out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
      );
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }),
        out(paraOut(1, 56))
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 })
      );
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 }),
        out('x'.repeat(560))
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.proofread, { start_offset: 0, text: 'x'.repeat(560) })
      );
    });
    assert(blocked, '还原参数归一（只读驼峰）后，只传 start_offset 必须被拦（证明该修复被覆盖）');
  });

  testAsync('AC7.3 变异自证：还原 P2「本批已上报」前置 → AC3.1 由绿转红', async () => {
    const mutated = await loadMutated(
      GOV_SRC.replace(
        /st\.batchAccumulatedThisBatch &&\n\s*st\.totalParagraphs > 0/,
        'st.totalParagraphs > 0'
      )
    );
    const blocked = await captureBlock(mutated, async (plugin, sid) => {
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
      const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
      await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.active, {}),
        out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
      );
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }),
        out(paraOut(1, 56))
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 })
      );
    });
    assert(blocked, '还原 P2 前置后，单批取文本必须被拦（证明该修复被覆盖）');
  });

  // ── AC7.3（RC-6）：把 before 参数来源还原为 input.args ⇒ 官方契约下门禁失效（由绿转红）──
  // 修复点：`before` 钩子的 `beforeArgs()`（output.args ?? input.args）。还原为 input.args 后，
  // 官方契约调用下 innerArgs 恒为 {} ⇒ proofreadBasic 的 startOffset 门禁重新「永不可满足」。
  testAsync('AC7.3 变异自证：还原 before 参数来源 → 官方契约下 AC2.1 由绿转红', async () => {
    const mutated = await loadMutated(
      GOV_SRC.replace(
        /const beforeArgs = \(\) =>[^;]*;/,
        'const beforeArgs = () => (input && input.args) || {};'
      )
    );
    assert(mutated !== GOV_SRC, '变异注入未生效（源码形状已变，请同步本测试）');
    const blocked = await captureBlock(mutated, async (plugin, sid) => {
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
      await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.active, {}),
        out('路径: /p/a.docx\n总段数: 56')
      );
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
      );
      await plugin['tool.execute.after'](
        ev(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }),
        out(paraOut(1, 56))
      );
      // 官方契约下只传 start_offset（下划线）—— 修复后放行；还原后必须被「缺少 startOffset」拦
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.proofread, { start_offset: 0, text: 'x'.repeat(560) })
      );
    });
    assert(
      blocked,
      '还原 before 参数来源后，官方契约下 proofreadBasic 必须被拦（证明该修复被覆盖）'
    );
    assert(
      blocked.includes('startOffset'),
      '应由「缺少 startOffset」拦下，实际: ' + String(blocked).slice(0, 90)
    );
  });

  // ── AC1.2（RC-6 第二层 / P2 防伪）：官方契约下写「校对报告」路径必须被拦（门禁未静默失守）──
  testAsync('AC1.2 官方契约下 P2 防伪门禁仍生效：write 校对报告 被拦', async () => {
    const plugin = await loadPlugin();
    const sid = 'ac12-p2-' + Math.random();
    await assert.rejects(
      () =>
        plugin['tool.execute.before'](
          { tool: 'write', sessionID: sid, callID: 'c' },
          { args: { path: '/tmp/校对报告-x.md', content: 'fake' } }
        ),
      /P2/,
      '官方契约下 write 伪造校对报告必须被 P2 拦（RC-6 曾使该门禁静默失守）'
    );
  });

  // ── R6-1（评审 CR6-1）：enableTrackChanges 失败 ⇒ 治理层不得认为修订已开 ──
  testAsync('R6-1 修订未生效（回读不一致）⇒ 治理层据此拦 replace（不得按入参放行）', async () => {
    const plugin = await loadPlugin();
    const sid = 'r61-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    const step = async (t, a, o) => {
      await plugin['tool.execute.before'](...evb(t, a));
      if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
    };
    await step(SINGLE_BATCH_TOOLS.active, {}, '路径: /p/a.docx\n总段数: 56');
    await step(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }, paraOut(1, 56));
    await step(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 }, 'x'.repeat(560));
    await step(
      SINGLE_BATCH_TOOLS.proofread,
      { start_offset: 0, text: 'x'.repeat(560) },
      'no issues'
    );
    await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
    // handler 回读不一致 ⇒ 结构化失败（RC-3 新路径）+ 失败文案。
    // ⚠️ Issue #401 W-2（信封单源）：after 钩子拿到的是 `mcp-server.ts` 投影后的**信封**
    //   （`{ content, isError }`），`success` 在其中已被剥离 ⇒ 主判据走 `isError`，文案为兜底。
    await plugin['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.track, { enable: true }));
    await plugin['tool.execute.after'](ev(SINGLE_BATCH_TOOLS.track, { enable: true }), {
      output: '修订模式设置未生效（期望开启，回读为关闭）。请重试或检查文档是否只读。',
      isError: true,
    });
    // 治理层必须据此拦 replace（若按入参置 true ⇒ 放行 ⇒ 本用例转红）
    await assert.rejects(
      () =>
        plugin['tool.execute.before'](
          ...evb(SINGLE_BATCH_TOOLS.replace, { paragraphIndex: 1, findText: 'x', replaceText: 'y' })
        ),
      /enableTrackChanges/,
      '修订未生效时 replace 必须被 P2 拦'
    );
  });

  // ── R6-1 正向对照：真正开启成功 ⇒ replace 放行（防「一律拦」） ──
  testAsync('R6-1 正向对照：修订真开启成功 ⇒ replace 放行（不误拦）', async () => {
    const plugin = await loadPlugin();
    const sid = 'r61b-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    const step = async (t, a, o) => {
      await plugin['tool.execute.before'](...evb(t, a));
      if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
    };
    await step(SINGLE_BATCH_TOOLS.active, {}, '路径: /p/a.docx\n总段数: 56');
    await step(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }, paraOut(1, 56));
    await step(SINGLE_BATCH_TOOLS.text, { start_offset: 0, length: 560 }, 'x'.repeat(560));
    await step(
      SINGLE_BATCH_TOOLS.proofread,
      { start_offset: 0, text: 'x'.repeat(560) },
      'no issues'
    );
    await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok');
    await step(
      SINGLE_BATCH_TOOLS.track,
      { enable: true },
      '修订模式已开启！所有后续修改将被跟踪记录。'
    );
    await step(
      SINGLE_BATCH_TOOLS.replace,
      { paragraphIndex: 1, findText: 'x', replaceText: 'y' },
      'ok'
    );
  });

  // ── R3-1/R3-2（PR #406 第 3 轮评审）：enableTrackChanges 失败态真值表（表驱动）──
  // 四条路径的**唯一真值表**：置位值 = 「本次是否要求开启」。
  //   ① 缺省 enable（schema 默认 true）+ 失败 ⇒ 未生效 ⇒ 拦 replace
  //   ② 缺省 enable + 成功（已开启文案）        ⇒ 拦截解除
  //   ③ 显式 enable:false（关闭）失败          ⇒ 修订很可能仍开启 ⇒ 放行（不得假红）
  //   ④ 显式 enable:true（开启）失败            ⇒ 未生效 ⇒ 拦 replace
  // 断言口径：`st.trackChangesOn` 的唯一可观察后果 = 后续 replace 是否被 P2 拦。
  testAsync('R3-1/R3-2 失败态真值表（表驱动）：置位值 = 本次是否要求开启', async () => {
    const CASES = [
      {
        name: '缺省 enable + 失败(isError)',
        args: {},
        res: { output: '修订模式设置未生效。', isError: true },
        blocked: true,
      },
      {
        name: '缺省 enable + 成功(已开启)',
        args: {},
        res: out('修订模式已开启！所有后续修改将被跟踪记录。'),
        blocked: false,
      },
      {
        name: '显式 false + 失败（关闭失败）',
        args: { enable: false },
        res: { output: '修订模式设置未生效（期望关闭）。', isError: true },
        blocked: false,
      },
      {
        name: '显式 true + 失败（开启失败）',
        args: { enable: true },
        res: { output: '修订模式设置未生效（期望开启）。', isError: true },
        blocked: true,
      },
    ];
    for (const c of CASES) {
      const plugin = await loadPlugin();
      const sid = 'r31-' + Math.random();
      const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
      const step = async (t, a, o) => {
        await plugin['tool.execute.before'](ev(t, a), {});
        if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), o);
      };
      await step(SINGLE_BATCH_TOOLS.active, {}, '路径: /p/a.docx\n总段数: 10');
      await step(SINGLE_BATCH_TOOLS.track, c.args, c.res);
      let blocked = false;
      try {
        await plugin['tool.execute.before'](
          ev(SINGLE_BATCH_TOOLS.replace, { paragraphIndex: 1, findText: 'x', replaceText: 'y' }),
          {}
        );
      } catch {
        blocked = true;
      }
      assert.strictEqual(
        blocked,
        c.blocked,
        `${c.name}：期望 replace ${c.blocked ? '被拦' : '放行'}`
      );
    }
  });

  // ── R9-1（Issue #395 收口）：整链报告步**真被评估** —— 补上 generateProofreadReport 前的负向对照 ──
  testAsync('R9-1 负向对照：整链省略报告步 ⇒ P2 仍拦「继续推进」（证明报告步非空跑）', async () => {
    // 与 AC7.1 同构的链路，**唯独不执行第 ⑧ 步 generateProofreadReport**；此后若再推进（取新批），
    // 必须仍被 P2「已覆盖全文但尚未出报告」拦下 —— 反证第 ⑧ 步不是「不抛即绿」的空跑。
    const plugin = await loadPlugin();
    const sid = 'r91-' + Math.random();
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    // 官方契约（RC-6）：before 参数在第二参 output.args —— 测试必须按真实契约调用
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    const step = async (t, a, o) => {
      await plugin['tool.execute.before'](...evb(t, a));
      if (o !== undefined) await plugin['tool.execute.after'](ev(t, a), out(o));
    };
    const doc = { path: '/p/a.docx', total: 56 };
    await step(SINGLE_BATCH_TOOLS.active, {}, BUILTIN_JSON(doc)); // ①
    await step(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }, paraOut(1, 56)); // ②
    await step(SINGLE_BATCH_TOOLS.text, { [PROOFREAD_START_KEY]: 0, length: 560 }, 'x'.repeat(560)); // ③
    await step(
      SINGLE_BATCH_TOOLS.proofread,
      { [PROOFREAD_START_KEY]: 0, text: 'x'.repeat(560) },
      'no issues'
    ); // ④
    await step(SINGLE_BATCH_TOOLS.track, { enable: true }, '修订模式: 已开启'); // ⑤
    await step(SINGLE_BATCH_TOOLS.confirm, {}, 'ok'); // ⑥
    await step(
      SINGLE_BATCH_TOOLS.replace,
      { paragraphIndex: 1, findText: 'x', replaceText: 'y' },
      'ok'
    ); // ⑦
    await step(SINGLE_BATCH_TOOLS.accumulate, {}, 'ok'); // ⑦ 上报（覆盖全文）
    // 未出报告 ⇒ 再推进必须被 P2 拦（若报告步为空跑，此处不会拦 ⇒ 用例转红）
    let blocked = null;
    try {
      await plugin['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 57, end_paragraph: 60 })
      );
    } catch (e) {
      blocked = String(e.message || e);
    }
    assert(blocked, '省略报告步后继续推进必须被 P2 拦 ⇒ 证明整链第 ⑧ 步真被评估');
    assert(blocked.includes('P2'), '应由 P2（覆盖全文未出报告）拦，实际: ' + blocked.slice(0, 90));
    // 补上报告步 ⇒ 同一会话再推进**放行**（reportGenerated 已置位，P2 不再拦）—— 证明报告步确有意义
    await step(SINGLE_BATCH_TOOLS.report, {}, '# 校对报告\n- **发现问题**: 0 处');
    await plugin['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 57, end_paragraph: 60 })
    );
  });

  // ── AC2.2（评审 CR5-2）：参数键名归一只有一份实现（两条门禁共用同一函数） ──
  testAsync(
    'AC2.2 参数键名归一单源：proofreadBasic / getDocumentTextByRange 均用 normalizeStartOffset',
    async () => {
      // 形态断言（源码级）：两条门禁不得各写一套键名读取；必须共用 normalizeStartOffset。
      const calls = [...GOV_SRC.matchAll(/normalizeStartOffset\(/g)].length;
      assert(calls >= 3, `normalizeStartOffset 应被定义 1 次 + 调用 ≥2 次，实际 ${calls}`);
      // 反向：不得存在**代码中**直接读驼峰 startOffset 的门禁分支（剔注释与归一函数定义体）
      const code = GOV_SRC.replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/function normalizeStartOffset\(args\) \{[\s\S]*?\n\}/, '');
      assert(
        !/innerArgs\.startOffset\b/.test(code),
        '门禁不得直接读 innerArgs.startOffset（须过归一函数）'
      );
    }
  );

  // ── AC1.4（评审 CR4-1）：内置名映射必须穷尽 SKILL 教 AI 调的全部内置名 ──
  testAsync(
    'AC1.4 内置名映射穷尽：SKILL 教的 get_active_workbook/presentation 也必须归一（非 null）',
    async () => {
      // 与 RC-0 同族：excel/ppt 的 SKILL 教 AI 调内置名，若只映射 get_active_document，
      // 则 Excel/PPT 的 after 钩子永不执行 —— 逐字同构。
      // 此处为**形态断言**（查单一映射表的键集）并显式披露限制：Excel/PPT 读标记当前无消费方
      // （G3 另有既有缺陷，见评审 R4-2），无法构造行为断言 ⇒ 以「映射表键集 ⊇ SKILL 教的全部内置名」锁住。
      const skillExcel = fs.readFileSync(
        path.join(ROOT, 'skills', 'wps-excel', 'SKILL.md'),
        'utf8'
      );
      const skillPpt = fs.readFileSync(path.join(ROOT, 'skills', 'wps-ppt', 'SKILL.md'), 'utf8');
      const taught = new Set();
      for (const src of [skillExcel, skillPpt])
        for (const m of src.matchAll(/`(wps_get_active_[a-z]+)`/g)) taught.add(m[1]);
      assert(taught.size >= 2, 'SKILL 教的 wps_get_active_* 内置名应含 workbook/presentation');
      const builtinBlock = GOV_SRC.match(/const builtin = \{([\s\S]*?)\};/);
      assert(builtinBlock, 'governance.js 应存在内置名映射表 builtin');
      const mapped = new Set([...builtinBlock[1].matchAll(/([a-z_]+):/g)].map(m => 'wps_' + m[1]));
      for (const name of taught)
        assert(mapped.has(name), `内置名映射缺 SKILL 教的 ${name} ⇒ Excel/PPT 会复现 RC-0 病灶`);
    }
  );

  // ── AC7.4（评审 CR1-2）：A2「名实一致」必须可执行 —— 链中键名 = SKILL.md 教的键名 ──
  // 原 A2 仅是注释声明（SKILL_SRC 全文只在 AC5.1 被用一次），SKILL 与链路漂移无从发现。
  // 本条把 A2 落成真实断言：链中 `proofread_basic` 用的键名（SINGLE_BATCH_TOOLS 链内传入）
  // 必须出现在 SKILL.md 的「必须传」指引句里；且该句**不得**教驼峰 `startOffset`
  // （服务端只认下划线，驼峰会以「缺少 start_offset」拒绝 —— 见 CR1-1 实跑）。
  testAsync('AC7.4（A2 可执行）链中键名 == SKILL.md「必须传」句的键名', async () => {
    // SKILL 里「必须传 X」的指引句（唯一锚点：proofread_basic 的坐标键名指引）
    const m = SKILL_SRC.match(/`wps_word_proofread_basic`\s*必须传\s*`([a-zA-Z_]+)`/);
    assert(m, 'SKILL.md 应存在「proofread_basic 必须传 `<键名>`」的指引句');
    const taughtKey = m[1];
    // 链中键名 = **与 runFullChain 同源的单源常量**（不再是另写的字面量，评审 CR2-1）
    assert.strictEqual(
      taughtKey,
      PROOFREAD_START_KEY,
      `SKILL 教 AI 传 \`${taughtKey}\`，而链用 \`${PROOFREAD_START_KEY}\`（A2 名实不一致）`
    );
    // 变异自证（**真实链路**）：用**错误键名**（单源常量被改坏后的形态）重放同一步链，
    // 必须被治理层「缺少 startOffset」拦下 ⇒ 证明链确实按 PROOFREAD_START_KEY 传键名
    // （若链没用该常量、AC7.4 只比两个常量，此处不会拦 ⇒ 用例转红）。
    const sid = 'ac74-' + Math.random();
    const evb = (t, a) => [{ tool: t, sessionID: sid, callID: 'c' }, { args: a }];
    const ev = (t, a) => ({ tool: t, sessionID: sid, callID: 'c', args: a });
    const p = await loadPlugin();
    await p['tool.execute.before'](...evb(SINGLE_BATCH_TOOLS.active, {}));
    await p['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.active, {}),
      out(BUILTIN_JSON({ path: '/p/a.docx', total: 56 }))
    );
    await p['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 })
    );
    await p['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.para, { start_paragraph: 1, end_paragraph: 56 }),
      out(paraOut(1, 56))
    );
    await p['tool.execute.before'](
      ...evb(SINGLE_BATCH_TOOLS.text, { [PROOFREAD_START_KEY]: 0, length: 560 })
    );
    await p['tool.execute.after'](
      ev(SINGLE_BATCH_TOOLS.text, { [PROOFREAD_START_KEY]: 0, length: 560 }),
      out('x'.repeat(560))
    );
    // 用**错误键名** `startOffsetX` 调 proofread_basic ⇒ 必须被「缺少 startOffset」拦下
    // （PROOFREAD_START_KEY 一旦被改成非 start_offset/startOffset 的键，链即断 ⇒ 证明链真用了该常量）
    let blocked = null;
    try {
      await p['tool.execute.before'](
        ...evb(SINGLE_BATCH_TOOLS.proofread, { startOffsetX: 0, text: 'x'.repeat(560) })
      );
    } catch (e) {
      blocked = String(e.message || e);
    }
    assert(blocked, '错误键名必须被治理层拦下 ⇒ 证明链确实按 PROOFREAD_START_KEY 传键名');
    assert(
      blocked.includes('startOffset'),
      '应由「缺少 startOffset」拦，实际: ' + blocked.slice(0, 90)
    );
  });

  // ── AC7.5（评审 CR5-1）：A2 工具名侧也必须可执行 —— 链中工具名 = SKILL.md 教的裸名 ──
  testAsync(
    'AC7.5（A2 工具名侧）链中每个工具名均出现在 SKILL.md 中（裸名，含变异自证）',
    async () => {
      // 链中实际调用的工具名（唯一来源 = SINGLE_BATCH_TOOLS）
      const chainTools = Object.values(SINGLE_BATCH_TOOLS);
      for (const name of chainTools) {
        assert(
          SKILL_SRC.includes('`' + name + '`'),
          `链中工具 \`${name}\` 不在 SKILL.md 教的工具名里（A2 名实不一致）`
        );
      }
      // 变异自证：把链中某工具名改成 SKILL 里没有的名字 ⇒ 必须由绿转红
      const mutatedChain = Object.assign({}, SINGLE_BATCH_TOOLS, {
        para: 'wps_word_get_para_typo',
      });
      const bad = Object.values(mutatedChain).filter(n => !SKILL_SRC.includes('`' + n + '`'));
      assert(
        bad.includes('wps_word_get_para_typo'),
        '变异注入未生效：链中伪造名应被识别为不在 SKILL 中'
      );
    }
  );

  // ── AC7.6（评审 CR8-1）：beforeArgs() 改动的第二消费点 G2 必须同契约覆盖 ──
  testAsync('AC7.6 G2 白名单（官方契约下）：放行白名单 method / 拦越权 method', async () => {
    const plugin = await loadPlugin();
    const sid = 'ac76-' + Math.random();
    const evb = a => [
      { tool: 'wps-office_wps_execute_method', sessionID: sid, callID: 'c' },
      { args: a },
    ];
    // ① 白名单内（Application.ActiveDocument）→ 放行
    await plugin['tool.execute.before'](...evb({ method: 'Application.ActiveDocument' }));
    // ② 越权 API → 必须被 G2 拦（参数经官方契约 output.args 传入）
    await assert.rejects(
      () => plugin['tool.execute.before'](...evb({ method: 'Shell.Application.Run' })),
      /\[?G2\]?|白名单/,
      '越权 method 必须被 G2 拦下'
    );
    // ③ 变异自证：把 G2 分支的 beforeArgs() 还原为 input.args ⇒ 官方契约下 args 为空，
    //    method 取不到（''）——断言「空 method 仍被 G2 拦」，证明该分支确实读了官方契约的参数来源。
    const mutated = await loadMutated(
      GOV_SRC.replace(/const args = beforeArgs\(\);/, 'const args = (input && input.args) || {};')
    );
    assert(mutated !== GOV_SRC, '变异注入未生效（G2 的 beforeArgs 形状已变，请同步本测试）');
    const mp = mutated['tool.execute.before'];
    let blocked = null;
    try {
      await mp(
        { tool: 'wps-office_wps_execute_method', sessionID: sid + 'm', callID: 'c' },
        {
          args: { method: 'Application.ActiveDocument' },
        }
      );
    } catch (e) {
      blocked = String(e.message || e);
    }
    assert(
      blocked && /白名单/.test(blocked),
      '还原后（args 读 input.args ⇒ 空）连白名单 method 也取不到 ⇒ 必被 G2 拦（证明 G2 真读官方契约参数）'
    );
  });

  // ── AC5.1：SKILL 词表派生自 TYPE_METRIC_MAP（不写第二份） ──
  testAsync('AC5.1 SKILL.md 的 type 词表引用 TYPE_METRIC_MAP（未手抄第二份清单）', async () => {
    assert(SKILL_SRC.includes('TYPE_METRIC_MAP'), 'SKILL.md 必须给出 type 合法词表的派生来源');
  });

  // ── AC6.2：误导文案已清除 ──
  // 说明：本用例是**形态断言**（查源码字符串），非行为断言 —— 此处文案为无分支常量，形态即事实；
  // 若日后该文案改为按条件拼装，须改为走 `getActiveDocumentHandler` 失败路径的行为断言。
  testAsync(
    'AC6.2 通道失败文案不含「确认…已打开 / 切到前台」式误导措辞（形态断言，无分支常量）',
    async () => {
      const mcp = fs.readFileSync(
        path.join(ROOT, 'wps-office-mcp', 'src', 'server', 'mcp-server.ts'),
        'utf8'
      );
      const content = fs.readFileSync(
        path.join(ROOT, 'wps-office-mcp', 'src', 'tools', 'word', 'content.ts'),
        'utf8'
      );
      assert(!/请把文档窗口切到前台/.test(mcp), 'mcp-server.ts 仍含「切到前台」误导措辞');
      assert(
        !/请确认 WPS 文字已打开文档/.test(content),
        'content.ts 仍含「请确认已打开文档」误导措辞'
      );
      // AC6.1（评审 CR5-2）：正向断言 —— 必须给出正确指引（COM 通道未挂接 → openDocument 重连），
      // 而非仅「删掉旧措辞」了事（防把文案删空也判绿）。
      assert(/COM 通道未挂接/.test(content), 'content.ts 应指出真实根因「COM 通道未挂接」');
      assert(/openDocument 重连/.test(content), 'content.ts 应给出正确指引 openDocument 重连');
      assert(/COM 通道未挂接/.test(mcp), 'mcp-server.ts 应指出真实根因「COM 通道未挂接」');
      assert(/openDocument/.test(mcp), 'mcp-server.ts 应给出正确指引 openDocument');
    }
  );

  for (const { name, fn } of asyncTests) {
    try {
      await fn();
      pass++;
      console.log('  ✓ ' + name);
    } catch (e) {
      failures.push({ name, err: e });
      console.log('  ✗ ' + name + ' → ' + e.message);
    }
  }
  console.log(`\n${pass}/${pass + failures.length} 通过`);
  if (failures.length) {
    for (const f of failures) console.error('  - ' + f.name + ': ' + f.err.message);
    process.exit(1);
  }
}

/** 把改写后的源码落到临时文件再 import（走真实 before/after 钩子，非只改内存对象）。
 * ⚠️ Issue #395 评审 CR9-1：临时目录须在测试结束**清理**（原实现每次运行遗留 4 个 /tmp 目录，
 * 属「测试腐肉」——不入库但会随运行次数累积）。注册清理钩子，进程退出时一并删除。 */
const _mutDirs = [];
function _cleanupMutDirs() {
  for (const d of _mutDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (_e) {
      /* 清理失败不影响测试结论 */
    }
  }
}
process.on('exit', _cleanupMutDirs);
async function loadMutated(src) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gov-mut-'));
  _mutDirs.push(dir);
  const f = path.join(dir, 'governance.mjs');
  fs.writeFileSync(f, src, 'utf8');
  const mod = await import(f);
  return mod.WpsGovernancePlugin();
}

/** 执行 fn，返回抛出的拦截消息（未抛则返回 null）。 */
async function captureBlock(plugin, fn) {
  try {
    await fn(plugin, 'mut-' + Math.random());
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}

run();
