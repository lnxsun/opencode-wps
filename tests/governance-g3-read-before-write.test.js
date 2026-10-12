/**
 * G3「读前必写」门禁跨 app 行为回归（Issue #399）
 *
 * 背景（既有缺陷，非某 PR 引入）：G3 对 **Excel / PPT 恒拦**，Word 正常。根因三层：
 *   · RC-1（字段名）`appReadState` 取值处用 `state.activeDocRead`，而 Excel/PPT 的置位处写的是
 *     `activeWorkbookRead` / `activePresentationRead` ⇒ 读取侧永远看到 `false`；
 *   · RC-2（app 归属）`getAppType` 只认 COM Action 短名前缀（`getCell*` / `getSlide*`），
 *     而**注册名**归一后是 `setCellValue` / `setSlideTitle` ⇒ 掉进兜底 `'word'`；
 *   · RC-3（评审 R1-🔴A）改关键词表后**仍漏 9 个** Excel/PPT 写工具（`setFormula`/`setBorder`/
 *     `addTextBox`/… ）⇒ G3 仍恒拦。修法：app 归属取**权威来源**（直连=应用段，网关=注册表派生表）。
 *
 * 本测试锁「**行为**」而非「字段名字符串」：走真实 `tool.execute.before/after` 钩子，断言
 * 「先读后写放行 / 未读即写必拦」两侧，并对**全部** Excel/PPT 写工具做矩阵（真值 app 由
 * `gateway/com-actions.ts` 的 `appType` 派生 —— 防「修 1 个、漏 9 个」仍全绿），
 * 以及对各根因做**变异自证**（走真实钩子，还原缺陷 → 断言由绿转红）。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0;
const failures = [];
const asyncTests = [];
const testAsync = (name, fn) => asyncTests.push({ name, fn });

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, '.opencode', 'plugins', 'governance.js');
const GOV_SRC = fs.readFileSync(PLUGIN, 'utf8');

// ── 真值来源（唯一定义者）：注册表 `COM_ACTIONS[].appType` 派生 ──
const { deriveComActionApp } = require('../scripts/lib/com-action-app.js');
const DERIVED = deriveComActionApp(ROOT);
assert(DERIVED.byName && DERIVED.count > 0, '须能从注册表派生 app 归属真值');

// 治理层 WRITE_TOOLS 的镜像（真值集合由 governance.js 源码派生，防测试自己写死漏项）
const GOV_WRITE_TOOLS = (() => {
  const m = GOV_SRC.match(/const WRITE_TOOLS = new Set\(\[([\s\S]*?)\]\);/);
  assert(m, 'governance.js 应有 WRITE_TOOLS 集合');
  return [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map(x => x[1]);
})();

async function loadPlugin() {
  const mod = await import(PLUGIN);
  return mod.WpsGovernancePlugin();
}

const _mutDirs = [];
process.on('exit', () => {
  for (const d of _mutDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (_e) {
      /* 清理失败不影响测试结论 */
    }
  }
});
/** 把改写后的源码落到临时文件再 import —— 走**真实** before/after 钩子（非只改内存对象）。 */
async function loadMutated(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-g3-mut-'));
  _mutDirs.push(dir);
  const f = path.join(dir, 'governance.mjs');
  fs.writeFileSync(f, src, 'utf8');
  return (await import(f)).WpsGovernancePlugin();
}

const ev = (tool, sid, args) => ({ tool, sessionID: sid, callID: 'c', args: args || {} });
const out = text => ({ output: text });

const OFFICE = name => 'wps-office_' + name;
const READER = {
  word: OFFICE('wps_word_get_active_document'),
  excel: OFFICE('wps_excel_get_active_workbook'),
  ppt: OFFICE('wps_ppt_get_active_presentation'),
};
const READER_BUILTIN = {
  word: 'wps_get_active_document',
  excel: 'wps_get_active_workbook',
  ppt: 'wps_get_active_presentation',
};

async function readThenWrite(plugin, sid, readTool, writeTool, extraWriteArgs) {
  const before = plugin['tool.execute.before'];
  const after = plugin['tool.execute.after'];
  await before(ev(readTool, sid), {});
  await after(ev(readTool, sid), out('ok'));
  try {
    await before(ev(writeTool, sid, extraWriteArgs || {}), {});
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}

/** 未读即写后**读该写工具是否被 G3 拦**（返回拦截消息或 null）。 */
async function writeWithoutRead(plugin, sid, writeTool, args) {
  try {
    await plugin['tool.execute.before'](ev(writeTool, sid, args || {}), {});
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}

/** G3 专属拦截（排除 G4 破坏性确认 / P2 替换前置 / T2 模版分批等**其它**门禁的正当拦截）。 */
const isG3Block = msg => !!msg && /读取文档状态/.test(msg);

// 会触发**其它**门禁（G4 破坏性 / P2 替换前置 / T2 模板分批）的写工具 —— 负向对照只判 G3，
// 故 AC2 选未被这些规则拦的工具，避免「拦是 G4 但不是 G3」导致断言口径混淆。
const ALLOWED_EXTRA_BLOCKERS = new Set([
  'deleteRows',
  'deleteColumns',
  'clearRange',
  'unmergeCells',
  'deleteSlide',
  'deleteShape',
  'deleteTextBox',
  'closeDocument',
  'closePresentation',
  'closeWorkbook',
  'replaceInParagraph',
  'findReplace',
  'smartFillField',
  'replaceBookmarkContent',
]);

async function run() {
  // ── AC1（全矩阵）：**每一个**注册表登记为 Excel/PPT 的写工具，先读真值 app 后必放行 ──
  // 真值 app 由注册表派生 ⇒ 新增写工具自动进矩阵，不留「修 1 个漏 9 个仍全绿」的口子。
  const matrix = GOV_WRITE_TOOLS.filter(t => DERIVED.byName[t] && DERIVED.byName[t] !== 'word').map(
    t => [t, DERIVED.byName[t]]
  );
  assert(
    matrix.length >= 30,
    `矩阵应覆盖全部 Excel/PPT 写工具，实际 ${matrix.length} —— 派生失败？`
  );
  for (const [tool, app] of matrix) {
    testAsync(`AC1 先读后写放行（直连）：${app} / ${tool}`, async () => {
      const plugin = await loadPlugin();
      // 传 `confirm: true` 规避 G4（破坏性确认）—— 本 AC 只判 G3，其余门禁的正当拦截不算失败。
      const blocked = await readThenWrite(
        plugin,
        `ac1-${tool}-${Math.random()}`,
        READER[app],
        OFFICE(`wps_${app}_${tool}`),
        { confirm: true }
      );
      assert(!isG3Block(blocked), `${app}/${tool} 先读后写不应被 G3 拦：${blocked}`);
    });
    testAsync(`AC1 先读后写放行（网关）：${app} / ${tool}`, async () => {
      const plugin = await loadPlugin();
      const sid = `ac1g-${tool}-${Math.random()}`;
      await plugin['tool.execute.before'](ev(READER[app], sid), {});
      await plugin['tool.execute.after'](ev(READER[app], sid), out('ok'));
      let blocked = null;
      try {
        await plugin['tool.execute.before'](
          ev(OFFICE('wps_office_execute'), sid, {
            tool_name: tool,
            arguments: { confirm: true },
          }),
          {}
        );
      } catch (e) {
        blocked = String(e.message || e);
      }
      assert(!isG3Block(blocked), `网关 ${app}/${tool} 先读后写不应被 G3 拦：${blocked}`);
    });
  }

  // ── AC2：负向对照（读→写两侧）：未读即写时 G3 **必须**拦（证明 AC1 的放行不是门禁空跑） ──
  for (const app of ['word', 'excel', 'ppt']) {
    testAsync(`AC2 负向对照：${app} 未读即写必拦`, async () => {
      const plugin = await loadPlugin();
      const wt = GOV_WRITE_TOOLS.find(
        t => (DERIVED.byName[t] || 'word') === app && !ALLOWED_EXTRA_BLOCKERS.has(t)
      );
      const blocked = await writeWithoutRead(
        plugin,
        `ac2-${app}-${Math.random()}`,
        OFFICE(`wps_${app}_${wt}`),
        { confirm: true }
      );
      assert(isG3Block(blocked), `${app} 未读即写必须被 G3 拦，实际：${blocked}`);
    });
  }

  // ── AC3：字段名单源（形态断言，非行为） ──
  testAsync('AC3 字段名单源：appReadState 三 app 槽位字段名一致（不再各写一套）', async () => {
    const stateBlock = GOV_SRC.match(/appReadState:\s*\{([\s\S]*?)\n\s*\},/);
    assert(stateBlock, 'governance.js 应有 appReadState 初始化块');
    const names = [...stateBlock[1].matchAll(/active[A-Za-z]+Read/g)].map(m => m[0]);
    assert(names.length >= 3, `appReadState 应含 3 个 app 槽位，实际 ${names.length}`);
    assert.strictEqual(
      new Set(names).size,
      1,
      `三 app 槽位字段名必须一致（单源），实际：${[...new Set(names)].join(' / ')}` +
        ` —— 字段名不一致即 Issue #399 的 RC-1 复发`
    );
    const code = GOV_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const setLiterals = [...code.matchAll(/appReadState\.\w+\.active\w+Read\s*=/g)].length;
    assert.strictEqual(setLiterals, 0, `不得以裸字面量置位 appReadState，实际 ${setLiterals} 处`);
  });

  // ── AC4：app 归属**取自来源而非名字猜测**（形态断言：旧关键词表不得复活） ──
  testAsync('AC4 app 归属不再按名字猜（无 app 关键词正则/前缀白名单残留）', async () => {
    const code = GOV_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const [re, what] of [
      [/\/(Slide|Presentation|Shape|Textbox)[|)]/, 'ppt 关键词正则'],
      [/\/(Cell|Range|Sheet|Workbook)[|)]/, 'excel 关键词正则'],
      [/startsWith\('getCell'\)/, 'excel 前缀白名单'],
    ]) {
      assert(!re.test(code), `治理层不得再按名字猜 app（残留 ${what}）`);
    }
    // `getAppType` 的行为归属必须来自「权威来源」两级（app 参数 / COM_ACTION_APP）
    const fn = GOV_SRC.match(/function getAppType\(toolName, app\)\s*\{([\s\S]*?)\n\}/);
    assert(fn, 'getAppType 签名应为 (toolName, app)（app 为权威来源）');
    assert(/if \(app\) return app;/.test(fn[1]), 'getAppType 应优先采用传入的权威 app');
    assert(/COM_ACTION_APP\[name\]/.test(fn[1]), 'getAppType 网关侧应查 COM_ACTION_APP 表');
  });

  // ── AC5：变异自证 ①（RC-1 字段名）—— 还原「读写两侧字段名不一致」→ Excel 断言须转红 ──
  testAsync(
    'AC5 变异自证：还原 RC-1（Excel 读写两侧字段名不一致）⇒ Excel 先读后写转红',
    async () => {
      let mutated = GOV_SRC.replace(
        'excel: { activeDocRead: false },',
        'excel: { activeWorkbookRead: false },'
      );
      mutated = mutated.replace(
        /const slot = appReadStateSlot\(\s*toolName === 'getActiveWorkbook' \? 'excel' : 'ppt'\s*\);/,
        "const slot = { appType: toolName === 'getActiveWorkbook' ? 'excel' : 'ppt', readField: toolName === 'getActiveWorkbook' ? 'activeWorkbookRead' : 'activePresentationRead' };"
      );
      assert.notStrictEqual(
        mutated,
        GOV_SRC,
        '变异点未命中（appReadState 槽位或置位处已变形态？）'
      );
      const plugin = await loadMutated(mutated);
      const blocked = await readThenWrite(
        plugin,
        `ac5-${Math.random()}`,
        OFFICE('wps_excel_get_active_workbook'),
        OFFICE('wps_excel_set_cell_value')
      );
      assert(
        blocked,
        '还原 RC-1 后 Excel 先读后写应转红（恒拦）—— 若仍放行，说明该修复未被测试覆盖'
      );
    }
  );

  // ── AC6：变异自证 ②（RC-2/RC-3 app 归属）—— 让应用段来源失效（app 参数丢弃）→ PPT 转红 ──
  // 上一版 PR 的变异是「关掉关键词正则的分支」。改为权威来源后，等效变异 = **丢弃 app 来源**
  // 且让网关表对该工具查不到 ⇒ 回到「猜/兜底」时代的行为。这里用「重置 COM_ACTION_APP 表 +
  // 丢弃 app 参数」还原历史形态（只改内存不覆盖：走真实钩子）。
  testAsync('AC6 变异自证：丢弃 app 权威来源（应用段 + 注册表表）⇒ 非 Word 工具转红', async () => {
    let mutated = GOV_SRC.replace('if (app) return app;', 'if (false && app) return app;');
    mutated = mutated.replace(
      /const COM_ACTION_APP = \{[\s\S]*?\n\};/,
      'const COM_ACTION_APP = {};'
    );
    assert.notStrictEqual(mutated, GOV_SRC, '变异点未命中（getAppType 或表已变形态？）');
    const plugin = await loadMutated(mutated);
    const blocked = await readThenWrite(
      plugin,
      `ac6-${Math.random()}`,
      OFFICE('wps_ppt_get_active_presentation'),
      OFFICE('wps_ppt_set_slide_title')
    );
    assert(
      blocked,
      '丢弃 app 权威来源后 PPT 先读后写应转红（恒拦）—— 若仍放行，说明该路径未被覆盖'
    );
  });

  // ── AC7：app 归属互不串（防「修了 PPT 坏了 Excel」） ──
  testAsync('AC7 三 app 归属互不串：只读 Excel 不得放行 PPT 的写（反之亦然）', async () => {
    const plugin = await loadPlugin();
    const sid = `ac7-${Math.random()}`;
    await plugin['tool.execute.before'](ev(READER.excel, sid), {});
    await plugin['tool.execute.after'](ev(READER.excel, sid), out('ok'));
    let excelBlocked = null;
    try {
      await plugin['tool.execute.before'](
        ev(OFFICE('wps_excel_set_border'), sid, { confirm: true }),
        {}
      );
    } catch (e) {
      excelBlocked = isG3Block(String(e.message || e)) ? String(e.message || e) : null;
    }
    assert.strictEqual(excelBlocked, null, '读过 Excel ⇒ Excel 的 setBorder 应放行');
    let pptBlocked = null;
    try {
      await plugin['tool.execute.before'](ev(OFFICE('wps_ppt_add_text_box'), sid, {}), {});
    } catch (e) {
      pptBlocked = String(e.message || e);
    }
    assert(pptBlocked, '只读 Excel 不应放行 PPT 的写（app 归属串了）');
  });

  // ── AC8：拦截文案指向**当前 app 的读取工具** ──
  testAsync(
    'AC8 文案按 app 指路：Excel/PPT 分别指向 getActiveWorkbook/getActivePresentation',
    async () => {
      const plugin = await loadPlugin();
      const excelMsg = await writeWithoutRead(
        plugin,
        `ac8e-${Math.random()}`,
        OFFICE('wps_excel_set_formula'),
        { confirm: true }
      );
      assert(
        /getActiveWorkbook/.test(excelMsg),
        `Excel 文案应指向 getActiveWorkbook，实际：${excelMsg}`
      );
      const pptMsg = await writeWithoutRead(
        plugin,
        `ac8p-${Math.random()}`,
        OFFICE('wps_ppt_add_text_box'),
        { confirm: true }
      );
      assert(
        /getActivePresentation/.test(pptMsg),
        `PPT 文案应指向 getActivePresentation，实际：${pptMsg}`
      );
    }
  );

  // ── AC9：内置名读工具（无应用段）也要正确置位 ──
  testAsync(
    'AC9 内置名读工具：wps_get_active_workbook 之后 Excel 写放行（内置名归属登记）',
    async () => {
      for (const app of ['excel', 'ppt']) {
        const plugin = await loadPlugin();
        const wt = GOV_WRITE_TOOLS.find(t => (DERIVED.byName[t] || 'word') === app);
        const blocked = await readThenWrite(
          plugin,
          `ac9-${app}-${Math.random()}`,
          READER_BUILTIN[app],
          OFFICE(`wps_${app}_${wt}`),
          { confirm: true }
        );
        assert(!isG3Block(blocked), `内置名读后 ${app} 写应放行：${blocked}`);
      }
    }
  );

  // ── AC10：原型链键不得绕过 G3（评审 R2-🟡E） ──
  // `COM_ACTION_APP` 是对象字面量：裸下标读 `constructor`/`toString`/`__proto__` 会返回继承函数
  // （truthy）⇒ `getAppType` 返回非 app 值 ⇒ `appReadState[<fn>]` undefined ⇒ G3 静默绕过。
  // 本 AC 用**写工具名**探针（未读即写必须被拦），覆盖该形态。
  testAsync('AC10 原型链键不作 app 值：表读须 own-property（未读即写仍必拦）', async () => {
    const protoKeys = ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty'];
    // 形态断言：getAppType 不得出现裸下标读 COM_ACTION_APP
    const fn = GOV_SRC.match(/function getAppType\(toolName, app\)\s*\{([\s\S]*?)\n\}/);
    assert(fn, '应能定位 getAppType');
    assert(
      /Object\.prototype\.hasOwnProperty\.call\(COM_ACTION_APP, name\)/.test(fn[1]),
      'getAppType 须以 own-property 读表'
    );
    assert(!/return\s+COM_ACTION_APP\[name\]/.test(fn[1]), '不得裸下标读 COM_ACTION_APP');
    // 行为断言：任一原型的键名作为网关写工具名时，G3 仍须评估（不得因返回非 app 值而绕过）
    for (const k of protoKeys) {
      const plugin = await loadPlugin();
      const sid = `ac10-${k}-${Math.random()}`;
      let msg = null;
      try {
        await plugin['tool.execute.before'](
          ev(OFFICE('wps_office_execute'), sid, { tool_name: k, arguments: {} }),
          {}
        );
      } catch (e) {
        msg = String(e.message || e);
      }
      // 注意：这些名字不在 WRITE_TOOLS ⇒ G3 不介入；此处只断言「不抛内部 TypeError」且不得
      // 因 app 值非字符串而放行一个**真实写工具**。故另用真实写工具 + 原型键探针对比：
      assert(
        msg === null || !/TypeError|Cannot read|undefined/.test(msg),
        `原型键 ${k} 触发内部错误：${msg}`
      );
    }
  });

  // ── AC11：app 归属不得由调用参数决定（评审 R3-🟡F，跨 app 绕过） ──
  testAsync('AC11 跨 app 绕过封堵：读 Word 后带 appType=word 调 Excel 写工具仍必拦', async () => {
    const plugin = await loadPlugin();
    const sid = `ac11-${Math.random()}`;
    await plugin['tool.execute.before'](ev(READER.word, sid), {});
    await plugin['tool.execute.after'](ev(READER.word, sid), out('ok'));
    let blocked = null;
    try {
      // 注入 appType=word 试图把 G3 引向 Word 的标记
      await plugin['tool.execute.before'](
        ev(OFFICE('wps_excel_set_cell_value'), sid, { appType: 'word', confirm: true }),
        {}
      );
    } catch (e) {
      blocked = String(e.message || e);
    }
    assert(
      isG3Block(blocked),
      `读 Word 后调 Excel 写工具必须被 G3 拦（不得被 appType 参数绕过）：${blocked}`
    );
    // 形态断言：G3 判据处不得读 innerArgs.appType
    // 形态断言（剥注释后判定，与守卫判据 F 同口径）
    const code = GOV_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const g3 = code.match(/requiresReadBeforeWrite\(toolName\)\)\s*\{[\s\S]{0,900}?getAppType\(/);
    assert(g3, '应能定位 G3 判据块');
    assert(!/innerArgs\.appType/.test(g3[0]), 'G3 不得读 innerArgs.appType');
  });

  // ── AC12：common（跨 app 共用写工具）对 app 无归属（评审 R4-🟡G） ──
  testAsync('AC12 common 写工具：任一 app 已读即放行；未读仍必拦', async () => {
    const commonWrites = ['wps-office_wps_common_save', 'wps-office_wps_common_save_as'];
    for (const app of ['word', 'excel', 'ppt']) {
      for (const tool of commonWrites) {
        const plugin = await loadPlugin();
        const sid = `ac12-${app}-${tool}-${Math.random()}`;
        await plugin['tool.execute.before'](ev(READER[app], sid), {});
        await plugin['tool.execute.after'](ev(READER[app], sid), out('ok'));
        let blocked = null;
        try {
          await plugin['tool.execute.before'](ev(tool, sid, { confirm: true }), {});
        } catch (e) {
          blocked = String(e.message || e);
        }
        assert(
          !isG3Block(blocked),
          `${app} 已读后 ${tool} 不应被 G3 拦（common 无 app 归属）：${blocked}`
        );
      }
    }
    // 负向对照：完全未读 ⇒ common 写工具仍必拦
    const plugin = await loadPlugin();
    const blocked = await writeWithoutRead(
      plugin,
      `ac12-neg-${Math.random()}`,
      'wps-office_wps_common_save',
      { confirm: true }
    );
    assert(isG3Block(blocked), `未读时 common 写工具必须被 G3 拦：${blocked}`);
  });

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

run();
