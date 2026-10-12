#!/usr/bin/env node
/**
 * 「P2 覆盖全文后禁止推进」不变量**行为性守卫**（Issue #400）。
 *
 * 防什么：`governance.js` 的 P2「覆盖全文后禁止推进」门禁有一个**前置**（「本批已上报」，
 *   Issue #395 RC-2）。删除该前置后，`tests/`（整链 e2e）察觉，但 `scripts/` 层**全 exit 0**
 *   ⇒ 该不变量**只由 `tests/` 承载**（铁律 24 第 7 维「不变量必须归属门禁」缺口）。
 *   本守卫把它升为**可独立执行**的门禁：不依赖 `tests/`，`scripts/` 层自证。
 *
 * 手法（**行为断言，非形态断言** —— 铁律 24 第 7 维）：
 *   加载 **prod** `.opencode/plugins/governance.js`，注入真实 before/after 钩子调用链，断言行为：
 *     ① 单批（≤200 段）文档取段后 ③取文本 + ④校对 **均不抛**（否则闭环死锁，CR1-1）；
 *     ② 多批末批上报（覆盖全文）后继续推进 **抛且含 P2**（对偶面，防整块删门禁）。
 *   判据纯函数在 `lib/proofread-p2-invariant.js`（模块内无仓库路径字面量）；本文件只做编排 + IO。
 *
 * 用法：node scripts/validate-proofread-p2-invariant.js [--root <dir>] [--json]
 * 退出码：0 = 通过；1 = 不变量被破坏
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { checkP2Invariant } = require('./lib/proofread-p2-invariant.js');
// ⚠️ 消费**共享单源**（`lib/guard-scopes.js`）：本守卫是 P2 不变量的覆盖源，其覆盖声明必须与
//   范围单源**同源**（轴 I 的 F2 判据断言「覆盖源脚本必须真的 import 单源」，否则轴 I 只是跟自家副本对账）。
const { GUARD_SCOPES, coveringGuards, P2_INVARIANT_PATHS } = require('./lib/guard-scopes.js');

const argIdx = process.argv.indexOf('--root');
const rootDir =
  argIdx !== -1 && process.argv[argIdx + 1]
    ? path.resolve(process.argv[argIdx + 1])
    : path.resolve(__dirname, '..');
const asJson = process.argv.includes('--json');

/** 工具名集合（SKILL.md 实际教 AI 调的形态：内置名 + 下划线键名）。 */
const TOOLS = {
  active: 'wps_get_active_document',
  para: 'wps-office_wps_word_get_paragraphs',
  text: 'wps-office_wps_word_get_document_text_by_range',
  proofread: 'wps-office_wps_word_proofread_basic',
  confirm: 'wps-office_wps_word_confirm_batch_ai_proofread',
  accumulate: 'wps-office_wps_word_proofread_accumulate',
};

async function loadProdPlugin(root) {
  const pluginPath = path.join(root, '.opencode', 'plugins', 'governance.js');
  if (!fs.existsSync(pluginPath)) {
    return { plugin: null, missing: pluginPath };
  }
  const mod = await import(pathToFileURL(pluginPath).href);
  // ⚠️ WpsGovernancePlugin 是 **async** 工厂（返回 Promise<plugin>）—— 必须 await，
  //   否则拿到的是 Promise，钩子判定会误报「缺钩子」。
  const plugin = await mod.WpsGovernancePlugin();
  return { plugin, missing: null };
}

(async () => {
  const { plugin, missing } = await loadProdPlugin(rootDir);
  if (!plugin) {
    console.error(`❌ 未找到 prod 治理插件：${missing}（路径缺失即无法断言不变量）`);
    process.exit(1);
  }

  const { errors, warnings } = await checkP2Invariant(plugin, TOOLS, {
    total: 56,
    perBatch: 200,
    batches: 2,
  });

  if (asJson) {
    console.log(JSON.stringify({ errors, warnings }, null, 2));
    process.exit(errors.length > 0 ? 1 : 0);
  }

  console.log('【P2 不变量守卫】覆盖全文后禁止推进 · 行为断言（Issue #400）');
  console.log('  ① 单批（56 段）取段后 ③取文本 + ④校对 均不抛（闭环不死锁，CR1-1）');
  console.log('  ② 多批（2×200 段）末批上报后继续推进 抛且含 P2（对偶面）');
  for (const w of warnings) console.log('  ' + w);

  if (errors.length > 0) {
    console.error('\n❌ P2 不变量被破坏：');
    for (const e of errors) console.error('   - ' + e);
    console.error(
      '\n  ⇒ 修复：检查 `.opencode/plugins/governance.js` 的 P2「覆盖全文后禁止推进」判据' +
        '（含「本批已上报」前置 `st.batchAccumulatedThisBatch`）—— 见 Issue #395 RC-2 / Issue #400。'
    );
    process.exit(1);
  }

  // ⚠️ CR2-3：以下自检是**轴 I（validate:semantic-anchor-scope）F2 判据的本地快速镜像**，
  //   **不是第二份权威** —— 权威口径在轴 I（本守卫被 preflight 与轴 I 同时执行，此处只为
  //   单独运行本守卫时也能快速暴露「覆盖声明无执行者」，避免只看本守卫输出就误判为绿）。
  const selfScope = GUARD_SCOPES.find(
    s => s.script === 'scripts/validate-proofread-p2-invariant.js'
  );
  if (!selfScope) {
    console.error('❌ 覆盖源未在 lib/guard-scopes.js 登记（假绿风险）');
    process.exit(1);
  }
  // CR1-2：落点清单**单一来源** = lib 的 `P2_INVARIANT_PATHS`（不在 CLI 内手写第二份）。
  const coveredPaths = P2_INVARIANT_PATHS.filter(p => coveringGuards(p).length === 0);
  if (coveredPaths.length > 0) {
    console.error(`❌ 落点未被任何守卫覆盖：${coveredPaths.join(', ')}`);
    process.exit(1);
  }
  console.log('  ✅ 共享单源（guard-scopes.js）：本守卫覆盖声明已登记且落点全覆盖');
  console.log(
    '  ⚠️ 自限披露：本守卫为**行为**断言，覆盖「前置被删 / 门禁整块被删」两类语义破坏；' +
      '不改行为、只改写法的重构不声称拦住（那不该被拦）。'
  );
})();
