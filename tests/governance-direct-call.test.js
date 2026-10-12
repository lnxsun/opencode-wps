/**
 * 治理层「直连调用也必须受校对门禁约束」回归（Issue #382 第 10 轮评审 CR10-1）
 *
 * 背景：DECISION-1 后校对 4 个纯 TS 工具**直连可调**，而 P1~P4 校对门禁此前**只写在
 * `wps_office_execute` 分支里** ⇒ 直连调用会**整体绕过**校对治理（覆盖门禁 / 替换前置 /
 * 进度真实性 / 批次推进全部失守）。本测试锁住「两条通道同一口径」。
 *
 * 手法：动态 import 治理插件，走**真实** `tool.execute.before/after` 钩子，
 * 断言「直连取下一批」与「网关取下一批」**同样被 P1 拦下**（防归一化被改回单通道）。
 */
'use strict';

const assert = require('assert');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];
const asyncTests = [];
function testAsync(name, fn) {
  asyncTests.push({ name, fn });
}

const PLUGIN = path.join(__dirname, '..', '.opencode', 'plugins', 'governance.js');
const paraOut = (a, b) =>
  Array.from(
    { length: b - a + 1 },
    (_, i) => `[${a + i}] (正文) [${i * 10}-${i * 10 + 9}] 第${a + i}段`
  ).join('\n') + '\n共1000段';

async function loadPlugin() {
  const mod = await import(PLUGIN);
  return mod.WpsGovernancePlugin();
}
const out = text => ({ output: text });

/** 走「先取总量 → 取第 1 批 → 再取下一批」链路，返回第二次取批是否被拦 */
async function advanceWithoutProofread(plugin, sessionID, callDirect) {
  const { before, after } = {
    before: plugin['tool.execute.before'],
    after: plugin['tool.execute.after'],
  };
  if (callDirect) {
    await before(
      { tool: 'wps-office_wps_word_get_active_document', sessionID, callID: 'c' },
      { args: {} }
    );
    await after(
      { tool: 'wps-office_wps_word_get_active_document', sessionID, callID: 'c', args: {} },
      out(JSON.stringify({ name: 'a.docx', path: '/p/a.docx', wordCount: 9, paragraphCount: 1000 }))
    );
    await after(
      {
        tool: 'wps-office_wps_word_get_paragraphs',
        sessionID,
        callID: 'c',
        args: { start_paragraph: 1, end_paragraph: 200 },
      },
      out(paraOut(1, 200))
    );
    try {
      await before(
        {
          tool: 'wps-office_wps_word_get_paragraphs',
          sessionID,
          callID: 'c',
        },
        { args: { start_paragraph: 201, end_paragraph: 400 } }
      );
      return null;
    } catch (e) {
      return String(e.message || e);
    }
  }
  // 网关通道对照
  await before(
    {
      tool: 'wps-office_wps_office_execute',
      sessionID,
      callID: 'c',
    },
    { args: { tool_name: 'getActiveDocument', arguments: {} } }
  );
  await after(
    {
      tool: 'wps-office_wps_office_execute',
      sessionID,
      callID: 'c',
      args: { tool_name: 'getActiveDocument', arguments: {} },
    },
    out(JSON.stringify({ name: 'a.docx', path: '/p/a.docx', wordCount: 9, paragraphCount: 1000 }))
  );
  await before(
    {
      tool: 'wps-office_wps_office_execute',
      sessionID,
      callID: 'c',
    },
    {
      args: {
        tool_name: 'getDocumentParagraphs',
        arguments: { start_paragraph: 1, end_paragraph: 200 },
      },
    }
  );
  await after(
    {
      tool: 'wps-office_wps_office_execute',
      sessionID,
      callID: 'c',
      args: {
        tool_name: 'getDocumentParagraphs',
        arguments: { start_paragraph: 1, end_paragraph: 200 },
      },
    },
    out(paraOut(1, 200))
  );
  try {
    await before(
      {
        tool: 'wps-office_wps_office_execute',
        sessionID,
        callID: 'c',
      },
      {
        args: {
          tool_name: 'getDocumentParagraphs',
          arguments: { start_paragraph: 201, end_paragraph: 400 },
        },
      }
    );
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}

async function run() {
  testAsync('直连通道：跳过 proofreadBasic 取下一批 → P1 拦截（CR10-1）', async () => {
    const plugin = await loadPlugin();
    const msg = await advanceWithoutProofread(plugin, 'direct-' + Math.random(), true);
    assert(msg, '直连通道必须被 P1 拦下（否则校对门禁被绕过）');
    assert(msg.includes('P1'), '拦截消息应标 P1，实际: ' + msg.slice(0, 80));
  });

  testAsync('网关通道：同一场景 → 同样 P1 拦截（两条通道同口径）', async () => {
    const plugin = await loadPlugin();
    const msg = await advanceWithoutProofread(plugin, 'gateway-' + Math.random(), false);
    assert(msg, '网关通道必须被 P1 拦下');
    assert(msg.includes('P1'), '拦截消息应标 P1，实际: ' + msg.slice(0, 80));
  });

  testAsync('归一化不误伤：仅 P/T 规则分支参与，内置自检工具不被拦', async () => {
    const plugin = await loadPlugin();
    const sid = 'passthru-' + Math.random();
    // wps_check_connection（内置、无应用段）→ 归一化返回 null → 直接放行
    await plugin['tool.execute.before'](
      { tool: 'wps-office_wps_check_connection', sessionID: sid, callID: 'c' },
      { args: {} }
    );
  });

  for (const { name, fn } of asyncTests) {
    try {
      await fn();
      pass++;
      console.log('  ✓ ' + name);
    } catch (e) {
      fail++;
      failures.push({ name, err: e });
      console.log('  ✗ ' + name + ' → ' + e.message);
    }
  }

  console.log(`\n${pass}/${pass + fail} 通过`);
  if (fail > 0) {
    console.error('存在失败用例：');
    for (const f of failures) console.error('  - ' + f.name + ': ' + f.err.message);
    process.exit(1);
  }
}
run();
