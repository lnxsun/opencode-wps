#!/usr/bin/env node
/**
 * P2 不变量守卫的回归测试（Issue #400 · 铁律 24 第 7 维：测行为不测形态 + 变异自证）。
 *
 * 断言口径：
 *   - 直接调用**判据纯函数**并加载 **prod** 治理插件跑真实链路（不用「源码里有无某字符串」的形态检查）；
 *   - 变异自证：注入反例（删除 P2「本批已上报」前置）→ 断言由绿转红（走真实链路，非改内存对象）；
 *   - 真实 CLI 端到端：以变异副本跑 CLI，确认 exit code 由绿转红。
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, '.opencode', 'plugins', 'governance.js');
const GOV_SRC = fs.readFileSync(PLUGIN, 'utf8');
const CLI = path.join(ROOT, 'scripts', 'validate-proofread-p2-invariant.js');

const {
  checkP2Invariant,
  singleBatchTextAllowed,
  multiBatchAdvanceBlocked,
  REQUIRED_TOOLS,
} = require('../scripts/lib/proofread-p2-invariant.js');

const TOOLS = {
  active: 'wps_get_active_document',
  para: 'wps-office_wps_word_get_paragraphs',
  text: 'wps-office_wps_word_get_document_text_by_range',
  proofread: 'wps-office_wps_word_proofread_basic',
  confirm: 'wps-office_wps_word_confirm_batch_ai_proofread',
  accumulate: 'wps-office_wps_word_proofread_accumulate',
};

let passed = 0;
const failures = [];
async function it(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

const _mutDirs = [];
process.on('exit', () => {
  for (const d of _mutDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (_e) {
      /* 清理失败不影响结论 */
    }
  }
});

async function loadProdPlugin() {
  const mod = await import(pathToFileURL(PLUGIN).href);
  return mod.WpsGovernancePlugin();
}
async function loadMutatedPlugin(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-mut-'));
  _mutDirs.push(dir);
  const f = path.join(dir, 'governance.mjs');
  fs.writeFileSync(f, src, 'utf8');
  const mod = await import(pathToFileURL(f).href);
  return mod.WpsGovernancePlugin();
}

async function run() {
  console.log('validate-proofread-p2-invariant');

  // ---------- ① 行为断言：prod 通过（单批不死锁 + 多批仍拦） ----------
  await it('① prod 插件：单批（56 段）取文本不被 P2 拦 + 多批末批推进被 P2 拦（两条均绿）', async () => {
    const plugin = await loadProdPlugin();
    const { errors } = await checkP2Invariant(plugin, TOOLS, {
      total: 56,
      perBatch: 200,
      batches: 2,
    });
    assert.deepStrictEqual(errors, [], 'prod 插件下不变量应成立，实际报红：' + errors.join(' | '));
  });

  // ---------- ② 单批正向（不抛） ----------
  await it('② 单批取文本不抛（isolation）：singleBatchTextAllowed.ok === true', async () => {
    const plugin = await loadProdPlugin();
    const r = await singleBatchTextAllowed(plugin, TOOLS, 56, 'ac-single');
    assert.strictEqual(r.ok, true, '单批取文本必须放行（否则闭环死锁）：' + r.message);
  });

  // ---------- ③ 对偶面正向（必须抛且含 P2） ----------
  await it('③ 多批末批推进必须抛且含 P2（对偶面语义保持）', async () => {
    const plugin = await loadProdPlugin();
    const r = await multiBatchAdvanceBlocked(plugin, TOOLS, 200, 2, 'ac-multi');
    assert.strictEqual(r.ok, true, '多批覆盖全文后继续推进必须被拦');
    assert.match(r.message, /P2/, '应由 P2 拦，实际：' + r.message.slice(0, 80));
  });

  // ---------- ④ 变异自证：删 P2「本批已上报」前置 → 由绿转红（真实链路） ----------
  await it('④ 变异自证：删 `st.batchAccumulatedThisBatch &&` → 两条断言均转红（走真实链路）', async () => {
    const mutated = GOV_SRC.replace(
      /st\.batchAccumulatedThisBatch &&\n\s*st\.totalParagraphs > 0/,
      'st.totalParagraphs > 0'
    );
    assert.notStrictEqual(mutated, GOV_SRC, '变异注入未生效（源码形状已变，请同步本测试）');
    const plugin = await loadMutatedPlugin(mutated);
    const { errors } = await checkP2Invariant(plugin, TOOLS, {
      total: 56,
      perBatch: 200,
      batches: 2,
    });
    assert(errors.length > 0, '删除 P2 前置后守卫必须报红（由绿转红）');
    // 单批断言必须转红（这正是 Issue #400 的核心不变量）
    assert(
      errors.some(e => /单批/.test(e)),
      '单批断言须转红：' + errors.join(' | ').slice(0, 120)
    );
  });

  // ---------- ⑤ 变异自证：整块删 P2 门禁 → 对偶面转红 ----------
  await it('⑤ 变异自证：整块删 P2「覆盖全文」门禁 → 对偶面（多批仍拦）转红', async () => {
    // 用「前置恒不成立」模拟整块删门禁：把前置改为 `false &&`。
    const mutated = GOV_SRC.replace(
      /st\.batchAccumulatedThisBatch &&\n\s*st\.totalParagraphs > 0/,
      'false && st.totalParagraphs > 0'
    );
    assert.notStrictEqual(mutated, GOV_SRC, '变异注入未生效');
    const plugin = await loadMutatedPlugin(mutated);
    const r = await multiBatchAdvanceBlocked(plugin, TOOLS, 200, 2, 'mut-off');
    assert.strictEqual(r.ok, false, '门禁失效后多批末批推进不应再被拦（对偶面转红）');
  });

  // ---------- ⑥ CLI 端到端：prod 绿 / 变异红（真实退出码） ----------
  await it('⑥ CLI：prod 副本 EXIT=0，变异副本 EXIT=1（真实退出码由绿转红）', async () => {
    const prodRun = () => {
      try {
        execFileSync('node', [CLI], { cwd: ROOT, stdio: 'pipe' });
        return 0;
      } catch (e) {
        return e.status;
      }
    };
    assert.strictEqual(prodRun(), 0, 'prod 下 CLI 必须 EXIT=0');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-cli-mut-'));
    _mutDirs.push(dir);
    fs.mkdirSync(path.join(dir, '.opencode', 'plugins'), { recursive: true });
    const mutated = GOV_SRC.replace(
      /st\.batchAccumulatedThisBatch &&\n\s*st\.totalParagraphs > 0/,
      'st.totalParagraphs > 0'
    );
    fs.writeFileSync(path.join(dir, '.opencode', 'plugins', 'governance.js'), mutated, 'utf8');
    let code = 0;
    try {
      execFileSync('node', [CLI, '--root', dir], { cwd: ROOT, stdio: 'pipe' });
    } catch (e) {
      code = e.status;
    }
    assert.strictEqual(code, 1, '变异副本下 CLI 必须 EXIT=1（门禁由绿转红）');
  });

  // ---------- ⑦ 名实一致 / 单源：判据模块不得含仓库路径字面量 ----------
  await it('⑦ 判据纯函数模块不含仓库路径字面量（单一来源：不复制仓库路径）', async () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'scripts', 'lib', 'proofread-p2-invariant.js'),
      'utf8'
    );
    assert(!/\.opencode\/plugins|scripts\/lib/.test(src), '判据模块不得出现仓库路径字面量');
    assert.deepStrictEqual(
      REQUIRED_TOOLS,
      ['active', 'para', 'text', 'proofread', 'confirm', 'accumulate'],
      'REQUIRED_TOOLS 工具键集须稳定'
    );
  });

  // ---------- ⑧ R1 覆盖：单批断言须同时覆盖 ③取文本 与 ④校对（CR1-1） ----------
  await it('⑧ 单批断言同时覆盖 ③取文本 + ④校对（R1 原文「校对前不被拦」）', async () => {
    // 两环各自可独立报红：删 P2 前置后，③取文本**先**转红（已由 ④ 用例覆盖）。
    // 本用例专测「④校对 也被断言」：把链路里的「取文本」环节**抽掉**（不触发 ③），
    // 此时若判据只断言 ③ ⇒ 静默绿（空跑）；判据须在 ④校对 处报红才证明 ④ 被断言。
    const plugin = await loadMutatedPlugin(
      GOV_SRC.replace(
        /st\.batchAccumulatedThisBatch &&\n\s*st\.totalParagraphs > 0/,
        'st.totalParagraphs > 0'
      )
    );
    // CR1b-1：改走**判据纯函数**（不自建第二套调用），用 `skipText` 抽掉 ③ 环节 ⇒ 只测 ④。
    const r = await singleBatchTextAllowed(plugin, TOOLS, 56, 'cr11-notext', { skipText: true });
    assert.strictEqual(r.ok, false, '前置失效后 ④校对 必须被 P2 拦（证明 ④ 被断言）');
    assert.match(r.message, /④校对被拦/, '失败消息应指向 ④校对：' + r.message.slice(0, 80));
  });

  // ---------- ⑨ 边界：单批上限 200 段也须放行（R1 原文「≤200 段」） ----------
  await it('⑨ 单批边界（200 段，上限）取文本 + 校对 均放行（R1「≤200 段」口径）', async () => {
    const plugin = await loadProdPlugin();
    const r = await singleBatchTextAllowed(plugin, TOOLS, 200, 'bound-200');
    assert.strictEqual(r.ok, true, '200 段（单批上限）不得被 P2 拦：' + r.message);
  });

  // ---------- ⑪ 文案一致性：4 处断言口径须同源（CR8-2 根因：改一处漏三处） ----------
  await it('⑪ 断言口径文案在 4 处（lib 头 / CLI 头 / guard-scopes title / docs 清单）一致', async () => {
    // 本用例把「同一事实多处写」的漂移钉成可执行断言：凡出现 ③取文本 的 P2 描述处，
    // 必须同时给出 ④校对（不许只写 ③）—— 防「改了 ③ 忘了 ④」再次复发。
    const files = [
      'scripts/lib/proofread-p2-invariant.js',
      'scripts/validate-proofread-p2-invariant.js',
      'scripts/lib/guard-scopes.js',
      'docs/DEVELOPMENT_GUIDE.md',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      // 仅检查**描述性行**（注释 / 文档 / title）：含「③取文本」须同时含「④校对」。
      // 排除**代码行**（如 message: '③取文本被拦：' —— 运行期定位消息，非断言口径描述）。
      const isDesc = l => /^(\s*(\/\/|\*|#|-)|.*title:)/.test(l);
      const offenders = src
        .split('\n')
        .filter(l => isDesc(l) && l.includes('③取文本') && !l.includes('④校对'));
      assert.deepStrictEqual(
        offenders,
        [],
        `${rel} 存在「只写 ③取文本 未写 ④校对」的行 ⇒ 断言口径漂移：\n` + offenders.join('\n')
      );
    }
  });

  // ---------- ⑩ 空断言防护：判据真的会报红（注入「无钩子」插件） ----------
  await it('⑫ 负向对照：无钩子插件 → 报红（证明判据被真正评估，非空跑）', async () => {
    const { errors } = await checkP2Invariant({}, TOOLS, {});
    assert(errors.length > 0, '无钩子插件必须报红 ⇒ 证明断言被真实评估');
  });

  console.log(`\n${passed}/${passed + failures.length} 通过`);
  if (failures.length) process.exit(1);
}

run();
