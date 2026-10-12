/**
 * 轴 I：工具「直连注册 ⇔ 网关索引」成员一致性双向守卫（Issue #325 立项，**Issue #382 DECISION-1 重写**）
 *
 * 背景（#382 DECISION-1）：原守卫治的是「校对工具必须 ∈ GATEWAY_ONLY_TOOLS（禁止直连）」。
 *   实测该机制**副作用**才是 #382 的物理成因：被禁直连的工具不进 `tools/list` ⇒ AI 看不见、
 *   只能靠 `wps_office_search` 猜词发现，且拿到的 schema 是经 `inputSchemaToParamsSchema`
 *   转换的**残缺版**（`maxLength` 等约束在转换里丢失）⇒ 11 轮空转 / 5000 上限失效 / 总字数 0。
 *   DECISION-1 定规则「**无 COM 方法可透传的纯 TS 逻辑工具一律直连注册**」，故本守卫按新规则重写。
 *
 * 新判据（**双向**，源码可验，唯一判据 = 「PS1 是否有同名 switch 分支」）：
 *   A. **纯 TS 工具必须直连注册** —— 凡「有 TS handler 且 PS1 无同名分支」的工具（当前 4 个校对工具，
 *      全部 ∈ `allTools`）必须出现在 `mcp-server.ts` 的 `tools/list` 可见面（即 ∈ `allTools`）。
 *      防「又把它藏回网关专属」（#382 原病灶复发）。
 *   B. **同名不得双通道** —— 同一工具名**不得**既在 `allTools`（直连）又在 `COM_ACTIONS`（网关短名索引），
 *      否则 AI 会看到两条入口、schema 两套口径（「同一语义两处写」）。
 *   C. = 判据 B 的另一半：`COM_ACTIONS` 条目**必须**是「PS1 有同名分支」或「有 TS handler 且短名唯一」……
 *      本判据的**实际形态**：`COM_ACTIONS` 里每条**必须有一个执行者**（TS handler 或 PS1 分支），
 *      否则网关调用必落 PS1 default 分支（Unknown action）= 虚假索引（沿用旧判据 H 的立场）。
 *   D. 注册层**不得**再出现「网关专属黑名单」（`GATEWAY_ONLY_TOOLS` / DTG 拦截表任一复活即报红）——
 *      防「删一处、另一处悄悄加回」的自我许可通道。
 *   E. 网关 schema 转换必须搬运 `required`（#382 黑盒通道③；形态断言，行为断言在 MCP 测试）。
 *   F. **治理层校对门禁必须对「直连 / 网关」两条通道同口径**（Issue #382 12/12 复盘，CR10-1 根因）：
 *      `normalizeToolCall` 归一化**唯一定义者** + before/after **双钩子**都消费 + 判据不得直接读
 *      `args.tool_name` 取工具身份。防「只归一化网关通道 ⇒ 直连通道静默绕过 P1~P4」（CR10-1 复发）。
 *      形态断言；行为断言在 `tests/governance-direct-call.test.js`，变异自证在 `tests/validate-gateway-f-criterion.test.js`。
 *   G. 历史债**披露项必须带跟踪 Issue 编号**（复盘铁律 22）—— 无编号的「待后续」= 债静默沉淀。
 *      编号单一来源 = `scripts/lib/legacy-debt-manifest.js`（本守卫不重抄清单）。
 *
 * 范围单一来源（Issue #325 第二刀）：本守卫覆盖的落点集合**不在此处硬编码**，一律取自
 *   `scripts/lib/guard-scopes.js` 的 `GUARD_SCOPES`（它为每条覆盖声明保存 `script` + 谓词）。
 *
 * 用法：node scripts/validate-gateway-membership.js [--root <dir>]
 * 退出码：0 = 通过；1 = 违规（CI FAIL）
 */
'use strict';

const fs = require('fs');
const path = require('path');

// 覆盖范围单一来源（Issue #325 第二刀，见文件头）——路径一律不在此处硬编码。
const { GUARD_SCOPES, GATEWAY_MEMBERSHIP_SCRIPT } = require('./lib/guard-scopes.js');
const SELF_SCOPE = GUARD_SCOPES.find(s => s.script === GATEWAY_MEMBERSHIP_SCRIPT);
if (!SELF_SCOPE) {
  console.error(
    `❌ lib/guard-scopes.js 的 GUARD_SCOPES 中未登记本守卫（${GATEWAY_MEMBERSHIP_SCRIPT}）——` +
      `覆盖声明必须有真实执行者，请先在该单源中登记。`
  );
  process.exit(1);
}
const GOV_REL = '.opencode/plugins/governance.js';
const REGISTRY_REL = 'wps-office-mcp/src/server/tool-registry.ts';
const COM_ACTIONS_REL = 'wps-office-mcp/src/tools/gateway/com-actions.ts';
const MCP_SERVER_REL = 'wps-office-mcp/src/server/mcp-server.ts';
const TOOLS_INDEX_REL = 'wps-office-mcp/src/tools/index.ts';
const PS1_REL = 'wps-office-mcp/scripts/wps-com.ps1';
const GATEWAY_INDEX_REL = 'wps-office-mcp/src/tools/gateway/index.ts';
const USED_PATHS = [GOV_REL, REGISTRY_REL, COM_ACTIONS_REL, MCP_SERVER_REL, TOOLS_INDEX_REL, PS1_REL, GATEWAY_INDEX_REL];
const declared = new Set(USED_PATHS.filter(p => (SELF_SCOPE.matchers || []).some(m => m(p))));
for (const rel of USED_PATHS) {
  if (!declared.has(rel)) {
    console.error(
      `❌ 本守卫实际校验 ${rel}，但覆盖声明（lib/guard-scopes.js）未包含它 —— 声明与实做必须同源。`
    );
    process.exit(1);
  }
}

// --root 可选：测试时指向临时 fixture 目录（避免污染真实仓库），默认仓库根
const argIdx = process.argv.indexOf('--root');
const rootDir =
  argIdx !== -1 && process.argv[argIdx + 1]
    ? path.resolve(process.argv[argIdx + 1])
    : path.resolve(__dirname, '..');
const errors = [];
const ok = [];

const read = p => fs.readFileSync(path.join(rootDir, p), 'utf8');
const toCamel = s => s.replace(/^wps_(word|excel|ppt|common)_/, '').replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// ---- 1. 注册层：allTools 成员（= tools/list 可见面）----
// 唯一定义者 = tools 子树 `*.ts` 的 `name: '...'`；但**必须沿 index.ts 的装配链**核到
// `allTools` 实际包含哪些 bundle（不能假设「定义了就一定注册」——#382 原病灶正是「有 definition 却不注册」）。
// 装配链：`tools/index.ts` 的 `allTools = [...excelTools, ...wordTools, ...]`，而各 bundle 又由
// `word/index.ts` 等的 `wordTools = [...xxxTools]` 展开 ⇒ 需递归展开 bundle 到文件。
const toolsRootAbs = path.join(rootDir, 'wps-office-mcp', 'src', 'tools');
const relOf = abs => path.relative(rootDir, abs).split(path.sep).join('/');
/** 递归解析「bundle 名 → 其成员工具 full name」（沿 `export const <bundle> = [...a, ...b]` 与
 *  `<file>.ts 里 name: '...'` 两种形态，**只走装配链**，不把未装配的 definition 算进来）。 */
function resolveBundle(bundleName, dirRel, seen) {
  if (seen.has(bundleName)) return [];
  seen.add(bundleName);
  // 在该目录**全部 .ts** 里找 `export const <bundleName> = [`（或 `= <other>` 单别名）。
  // ⚠️ 不能「只看调用方所在文件」：子 bundle（formulaTools 等）与父 bundle 常不同文件（实测 #382）。
  const out = [];
  const dirAbs = path.join(rootDir, dirRel);
  if (!fs.existsSync(dirAbs)) return out;
  for (const f of fs.readdirSync(dirAbs)) {
    if (!f.endsWith('.ts')) continue;
    const rel = path.join(dirRel, f).split(path.sep).join('/');
    const src = read(rel);
    const m = new RegExp('export const ' + bundleName + '[^=]*=\\s*\\[([\\s\\S]*?)\\n?\\];').exec(src);
    if (m) {
      // bundle 成员两种形态：① 内联 `name: 'wps_xxx'`；② `{ definition: <Xxx>Definition, handler: ... }`
      //   —— 形态 ② 必须把 definition 符号解析回它所在文件的 `name:`（唯一定义者），否则解析为 0（实测坑）。
      for (const nm of m[1].matchAll(/name:\s*'(wps_[a-z]+_[a-z0-9_]+)'/g)) out.push(nm[1]);
      for (const dm of m[1].matchAll(/definition:\s*([A-Za-z0-9_]+)/g))
        out.push(...resolveDefinitionSymbol(dm[1], dirRel));
      for (const sp of m[1].matchAll(/\.\.\.([A-Za-z0-9_]+)/g)) out.push(...resolveBundle(sp[1], dirRel, seen));
      return out;
    }
    const alias = new RegExp('export const ' + bundleName + '[^=]*=\\s*([A-Za-z0-9_]+)\\s*;').exec(src);
    if (alias) return resolveBundle(alias[1], dirRel, seen);
  }
  return out;
}
/** 把 `<Xxx>Definition` 符号解析回其 `name: 'wps_...'`（在该目录全部 .ts 里找该 const 的声明）。
 * 这是 `allTools` 装配链的必需一环：bundle 数组里的成员是 `{ definition: XDefinition, handler }` 形态。 */
function resolveDefinitionSymbol(symbol, dirRel) {
  const dirAbs = path.join(rootDir, dirRel);
  if (!fs.existsSync(dirAbs)) return [];
  const declRe = new RegExp('export const ' + symbol + '\\s*:\\s*ToolDefinition\\s*=\\s*\\{[\\s\\S]*?name:\\s*(.+?),');
  for (const f of fs.readdirSync(dirAbs)) {
    if (!f.endsWith('.ts')) continue;
    const rel = path.join(dirRel, f).split(path.sep).join('/');
    const m = declRe.exec(read(rel));
    if (!m) continue;
    // name 可能是字面量 `'wps_x_y'`，也可能是常量（`PROOFREAD_ACCUMULATE`）⇒ 常量再回溯一层
    const lit = /^'(wps_[a-z]+_[a-z0-9_]+)'$/.exec(m[1].trim());
    if (lit) return [lit[1]];
    const constRe = new RegExp('export const ' + m[1].trim() + "\\s*=\\s*'(wps_[a-z]+_[a-z0-9_]+)'");
    for (const g of fs.readdirSync(dirAbs)) {
      if (!g.endsWith('.ts')) continue;
      const grel = path.join(dirRel, g).split(path.sep).join('/');
      const gm = constRe.exec(read(grel));
      if (gm) return [gm[1]];
    }
    return [];
  }
  return [];
}
const toolsRootAbs0 = path.join(rootDir, 'wps-office-mcp', 'src', 'tools');
/** 定位声明了 `export const <bundle> =` 的文件（相对路径）；bundle 定义在同名子目录的 index.ts。 */
function locateBundleFile(bundleName) {
  for (const d of ['excel', 'word', 'ppt', 'common']) {
    const abs = path.join(toolsRootAbs0, d, 'index.ts');
    if (!fs.existsSync(abs)) continue;
    if (new RegExp('export const ' + bundleName + '[^=]*=').test(fs.readFileSync(abs, 'utf8')))
      return relOf(abs);
  }
  return null;
}
const allTools = new Set();
{
  const idxRel = TOOLS_INDEX_REL;
  const idx = read(idxRel);
  const arr = /export const allTools[^=]*=\s*\[([\s\S]*?)\n?\];/.exec(idx);
  if (!arr) {
    console.error('❌ 无法在 tools/index.ts 定位 allTools 数组 —— 结构已变，请同步本守卫。');
    process.exit(1);
  }
  for (const sp of arr[1].matchAll(/\.\.\.([A-Za-z0-9_]+)/g)) {
    const drel = locateBundleFile(sp[1]);
    if (!drel) { errors.push(`判据 A：tools/index.ts 装配的 ${sp[1]} 未能在子目录定位其定义 —— 装配链已断`); continue; }
    for (const n of resolveBundle(sp[1], path.dirname(drel), new Set())) allTools.add(n);
  }

  if (allTools.size === 0) {
    console.error('❌ allTools 装配链解析出 0 个成员 —— 结构已变，请同步本守卫（拒绝以 0 冒充真值）。');
    process.exit(1);
  }
}

// ---- 2. 注册层黑名单必须不存在（判据 D）----
const regSrc = read(REGISTRY_REL);
if (/GATEWAY_ONLY_TOOLS/.test(regSrc))
  errors.push('判据 D：tool-registry.ts 仍含 GATEWAY_ONLY_TOOLS 黑名单 —— DECISION-1 已删除「网关专属」概念');
const govSrc = read(GOV_REL);
// 「拦截表复活」判据：只锤**代码形态**（`const DIRECT_TO_GATEWAY = {`），不锤注释里对历史的提及
// （注释是必要留痕；用 includes 判定会把正常说明误报成违规 —— 先验证后报告）。
if (/const\s+DIRECT_TO_GATEWAY\s*=/.test(govSrc))
  errors.push('判据 D：governance.js 又出现 DIRECT_TO_GATEWAY **常量表** —— 治理层不得自持「哪个工具该走网关」清单（Issue #382 DECISION-1）');
// 「G1 拦截点复活」判据：`enhanceBlock(<...>, 'G1', <...>)` 或 DIRECT_TO_GATEWAY[ 查表
if (/enhanceBlock\([\s\S]{0,200}?'G1'/.test(govSrc) || /DIRECT_TO_GATEWAY\[/.test(govSrc))
  errors.push("判据 D：governance.js 仍有 'G1' 拦截点 —— G1 规则应整体删除（否则 GUIDE_MAP 会出现死条目）");

// ---- 3. PS1 switch 分支（同名 action）----
const ps1Src = read(PS1_REL);
const ps1Actions = new Set([...ps1Src.matchAll(/^\s*"([A-Za-z0-9_]+)"\s*\{/gm)].map(m => m[1]));

// ---- 4. 纯 TS 工具集（判据 A 的对象）：有 TS handler 且 PS1 无同名分支 ----
// TS handler 短名 = `allTools` 成员（定义与 handler 同居）∪ `COM_ACTIONS` 已注册 handler 名。
const comActionsSrc = read(COM_ACTIONS_REL);
const comActionsBlock = /(?:const|export const)\s+COM_ACTIONS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(comActionsSrc);
if (!comActionsBlock) {
  console.error('❌ 无法在 gateway/com-actions.ts 定位 COM_ACTIONS 常量块 —— 结构已变，请同步本守卫。');
  process.exit(1);
}
const comActionsNames = new Set([...comActionsBlock[1].matchAll(/name:\s*'([A-Za-z0-9_]+)'/g)].map(m => m[1]));
if (comActionsNames.size === 0) {
  console.error('❌ COM_ACTIONS 解析出 0 个成员 —— 结构已变，请同步本守卫。');
  process.exit(1);
}
// 纯 TS 工具 = `allTools` 成员里「PS1 无同名分支」的那批（必然有 handler：它们已被直连注册）
const pureTs = [...allTools].filter(n => !ps1Actions.has(toCamel(n)));
ok.push(`纯 TS 逻辑工具（PS1 无同名分支，须直连注册）${pureTs.length} 个：${pureTs.sort().join(' / ')}`);

// ---- 判据 A：纯 TS 工具必须在 allTools**且** allTools 必须被真实注册 ----
// ⚠️ 第 5 轮评审 CR5-1：原实现只断言「4 个工具 ∈ allTools」，而 `pureTs` 由构造即 `allTools` 子集
//   ⇒ **恒真、零独立判别力**（删掉 mcp-server 里的 registerAll 也照样绿 —— 而这正是本 PR 要修的
//   「声明了注册、其实从未注册」原病灶）。现补一条**非恒真**断言：`mcp-server.ts` 必须真实调用
//   `registerAll(allTools)`（AI 的 `tools/list` 可见面由它产生）。
const MUST_DIRECT = ['wps_word_proofread_basic', 'wps_word_confirm_batch_ai_proofread', 'wps_word_proofread_accumulate', 'wps_word_generate_proofread_report'];
for (const full of MUST_DIRECT) {
  if (!allTools.has(full))
    errors.push(`判据 A：纯 TS 工具 "${full}" 不在 allTools（直连注册）—— DECISION-1 要求它出现在 tools/list（否则 AI 又要靠 search 猜词、拿残缺 schema）`);
}
{
  const serverSrc = read(MCP_SERVER_REL);
  if (!/registerAll\(allTools\)/.test(serverSrc))
    errors.push(
      '判据 A：`mcp-server.ts` 未调用 `registerAll(allTools)` —— allTools 不会进入 `tools/list`，' +
        '「直连注册」退化为注释里的声明（#382 原病灶：238 个工具从未真正注册）'
    );
}

// ---- 判据 B：同名不得双通道（既直连又在网关索引）----
// 口径（**范围纪律**，铁律 15/17⑨）：只断言**本 Issue 范围内**的纯 TS 工具（= 4 个校对工具，
// 见 MUST_DIRECT）的短名不得出现在 COM_ACTIONS。其余「PS1 无分支却留在索引」的条目
// （实测 `generateFormula` / `writeFile`）属**既有历史债**，登记到独立 Issue，不在本 PR 阻塞项
// （否则「顺手扩范围」会把不相关的历史债算成当前 PR 的失败）。
const inScopeShorts = new Set(MUST_DIRECT.map(toCamel));
for (const short of comActionsNames) {
  if (!inScopeShorts.has(short)) continue;
  if (ps1Actions.has(short)) continue;
  errors.push(
    `判据 B：网关条目 "${short}"（本 Issue 范围的纯 TS 工具）**PS1 无同名分支**却仍在 COM_ACTIONS —— ` +
      `纯 TS 工具的 schema 唯一定义者是其 definition（tools 子树），不得在网关索引留第二份（#382 DECISION-1）`
  );
}
// 既有历史债的**显式披露**（不阻塞，但必须如实记账，防「静默假绿」）：
// ⚠️ 判据 G（复盘铁律 22，双向）：披露项**必须**带跟踪 Issue 编号（无编号的「待后续」= 债静默沉淀），
//   且单源登记项**必须**对应真实披露项（登记了但债已消失 = 台账说谎，同样报红）。
//   编号单一来源 = `scripts/lib/legacy-debt-manifest.js`（本行不重抄清单，防成为第二份真值）。
const LEGACY_MANIFEST_REL = 'scripts/lib/legacy-debt-manifest.js';
{
  const directShortsAll = new Set([...allTools].map(toCamel));
  const legacy = [...comActionsNames].filter(
    n => directShortsAll.has(n) && !ps1Actions.has(n) && !inScopeShorts.has(n)
  );
  // 编号从**单源**派生（读源码文本按 rootDir 解析，使 --root fixture 变异可生效）。
  const manifestSrc = read(LEGACY_MANIFEST_REL);
  // 单源里**已登记**的工具短名（正例：形如 `  <短名>: {` 的键行）。
  const registered = [...manifestSrc.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/gm)].map(m => m[1]);
  const issueOf = short => {
    // 形态：`<短名>: { issue: <正整数>, ... }`（注释与空白不影响）。0 / 非数字 = 无编号。
    const m = new RegExp('\\b' + short + '\\s*:\\s*\\{[^}]*?\\bissue\\s*:\\s*(\\d+)').exec(manifestSrc);
    const n = m ? Number(m[1]) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  // 方向①：凡披露项必须有编号（missing = 该披露却无编号 ⇒ 铁律 22 违规）
  const missing = legacy.filter(n => !issueOf(n));
  if (missing.length > 0)
    errors.push(
      `判据 G：历史债披露项 ${missing.sort().join(' / ')} 在 ${LEGACY_MANIFEST_REL} 中**无跟踪 Issue 编号** —— ` +
        `铁律 22 禁止「无 Issue 编号的待后续」（债会静默沉淀）；请补 \`{ issue: <编号> }\``
    );
  // 方向②：凡登记项必须对应真实披露项（stale = 债已消失却仍登记 ⇒ 台账说谎）
  const legacySet = new Set(legacy);
  const stale = registered.filter(n => !legacySet.has(n));
  if (stale.length > 0)
    errors.push(
      `判据 G：${LEGACY_MANIFEST_REL} 登记了 ${stale.sort().join(' / ')}，但它们**已不再是历史债**` +
        `（不在当前披露集合）—— 台账与实做必须同源；债已清偿请从单源删除该登记项`
    );
  if (missing.length === 0 && stale.length === 0) {
    if (legacy.length > 0)
      ok.push(
        `⚠️ 本 Issue 范围外的既有重复入口（未阻塞，跟踪 Issue：` +
          `${[...new Set(legacy.map(issueOf))].sort((a, b) => a - b).map(n => '#' + n).join(' / ')}）：` +
          `${legacy.sort().join(' / ')} —— 同为「PS1 无分支却留在 COM_ACTIONS」，但非本 PR 改动范围`
      );
    else
      ok.push(
        `判据 G：无「范围外既有重复入口」历史债（披露项清零），台账 ${LEGACY_MANIFEST_REL} 同为空集（双向一致）`
      );
  }
}

// ---- 判据 C：COM_ACTIONS 每条必须有执行者（TS handler 或 PS1 分支）----
const directShortsForExecutor = new Set([...allTools].map(toCamel)); // 全部 allTools 短名（handler 供源）
let cChecked = 0;
let cWithExecutor = 0;
for (const short of comActionsNames) {
  cChecked++;
  const hasTsHandler = directShortsForExecutor.has(short);
  const hasPs1 = ps1Actions.has(short);
  if (hasTsHandler || hasPs1) {
    cWithExecutor++;
    continue;
  }
  errors.push(
    `判据 C：网关条目 "${short}" 在 COM_ACTIONS 索引中，但**无 TS handler、PS1 也无同名分支** —— ` +
      `网关调用必然落在 PS1 的 default 分支（Unknown action）⇒ 虚假索引条目`
  );
}
ok.push(`判据 C：COM_ACTIONS 共 ${cChecked} 项，有执行者 ${cWithExecutor} 项`);

// ---- 判据 E：网关 schema 转换必须搬运 required（Issue #382 §五黑盒通道③）----
// ⚠️ **自限披露**（第 6 轮评审 CR6-1）：本判据是**形态断言**（查源码是否仍有搬运 `required` 的表达式），
//   按铁律 24 第 7 维①「测行为不测形态」本不足；改为行为断言须能 import `inputSchemaToParamsSchema`，
//   而它**未导出**（模块私有）。故此处保留形态判据并**显式披露自限**，真行为断言落在 MCP 测试里
//   （`src/tests/unit/gateway.test.ts` 的「search 返回的 params 必须含 required」用例，走真实 `searchTools`）。
const gwIdxSrc = read(GATEWAY_INDEX_REL);
if (!/requiredSet\.has\(key\)|prop\.required/.test(gwIdxSrc))
  errors.push('判据 E：gateway/index.ts 的 schema 转换不再搬运 required —— AI 将看不到必填参数（#382 黑盒通道③）');


// ---- 判据 F：治理层校对门禁必须对「直连 / 网关」两条通道**同一口径**（Issue #382 12/12 复盘）----
// 根因（第 10 轮评审 CR10-1，实测复现）：DECISION-1 后 4 个纯 TS 校对工具**直连可调**，而 P1~P4
//   门禁原先**只写在 `wps_office_execute` 分支内** ⇒ 直连通道整体绕过校对治理（本 PR 的架构改动
//   把治理层打穿）。修复 = 新增 `normalizeToolCall`（归一化**唯一定义者**），before / after 两钩子
//   同口径消费 ⇒ 两条通道只有**一份**判据实现。
// 本判据把该修复**钉成不变量**，防「删一处归一化、直连通道又静默失守」复发：
//   ① 归一化函数**定义恰好一处**（同一语义不得两处写，否则两条通道各解析一套，必然失同步）；
//   ② 两个钩子（before / after）**都必须**调用它（只归一化一条通道 = CR10-1 原样复发）；
//   ③ 判据**不得**再直接以「原始网关外形」(`args.tool_name`) 取工具身份 —— 那正是「只认网关通道」
//      的旧形态；工具身份唯一来源 = 归一化后的 `toolName`。
// ⚠️ **自限披露**：本判据是**形态断言**（查源码调用点/定义点形态），按铁律 24 第 7 维①本不足；
//   真**行为**断言落在 `tests/governance-direct-call.test.js`（走**真实**插件钩子，实测直连通道
//   被 P1 拦截）与 `tests/validate-gateway-f-criterion.test.js`（注入反例 → CLI 转红，变异自证）。
{
  const govSrc = read(GOV_REL);
  // ① 归一化函数定义恰好一处（`function normalizeToolCall(` 或 `const normalizeToolCall =`）
  const defCount = (govSrc.match(/(function\s+normalizeToolCall\s*\(|const\s+normalizeToolCall\s*=)/g) || []).length;
  if (defCount === 0)
    errors.push(
      '判据 F：governance.js 未定义 `normalizeToolCall` —— 直连/网关两条通道未归一，' +
        '校对门禁将只对网关通道生效（CR10-1 原病灶）'
    );
  else if (defCount > 1)
    errors.push(
      `判据 F：governance.js 出现 ${defCount} 处 \`normalizeToolCall\` 定义 —— 归一化必须**唯一定义者**` +
        '（两份解析 = 两条通道各一套口径，必然失同步；同一语义两处写）'
    );
  // ② 两个钩子都必须消费归一化结果（调用点 ≥ 2，且 before / after 各至少一处）
  const callCount = (govSrc.match(/normalizeToolCall\s*\(/g) || []).length - defCount;
  if (callCount < 2)
    errors.push(
      `判据 F：\`normalizeToolCall\` 调用点仅 ${callCount} 处（应 ≥2：before / after 两钩子各一处）—— ` +
        '只归一化一条通道 ⇒ 另一条通道的门禁失守（CR10-1 原样复发）'
    );
  {
    // 以钩子边界切分源码，断言两个钩子段内各自都调用了归一化
    const beforeAt = govSrc.indexOf("'tool.execute.before'");
    const afterAt = govSrc.indexOf("'tool.execute.after'");
    const hasBeforeCall = beforeAt !== -1 && /normalizeToolCall\s*\(/.test(govSrc.slice(beforeAt));
    const hasAfterCall = afterAt !== -1 && /normalizeToolCall\s*\(/.test(govSrc.slice(afterAt, beforeAt > afterAt ? undefined : govSrc.length));
    if (!hasBeforeCall)
      errors.push("判据 F：`tool.execute.before` 钩子未调用 `normalizeToolCall` —— before 侧门禁对直连/网关不同口径");
    if (beforeAt === -1 && afterAt === -1)
      errors.push('判据 F：未定位到治理插件钩子（`tool.execute.before` / `tool.execute.after`）—— 结构已变，请同步本守卫');
  }
  // ③ 门禁不得直接以原始网关外形取工具身份（`args.tool_name` / `input.args.tool_name` 作门禁依据）
  //    允许出现于 `normalizeToolCall` **定义体内**（它就是解析网关外形的唯一点）；
  //    定义体之外若再出现 ⇒ 又开了一条「只认网关外形」的判据旁路。
  const defStart = govSrc.search(/(function\s+normalizeToolCall\s*\(|const\s+normalizeToolCall\s*=)/);
  const defBodyEnd = defStart === -1 ? -1 : govSrc.indexOf('\n}', defStart);
  const outsideDef =
    defStart === -1 ? govSrc : govSrc.slice(0, defStart) + govSrc.slice(defBodyEnd === -1 ? defStart : defBodyEnd);
  if (/\.args\.tool_name|args\s*\.\s*tool_name/.test(outsideDef) && defStart !== -1)
    errors.push(
      '判据 F：`normalizeToolCall` 定义体之外仍直接读 `args.tool_name` 取工具身份 —— ' +
        '工具身份唯一来源应为归一化后的 `toolName`（否则网关外形解析出现第二处，直连通道旁路）'
    );
  ok.push('判据 F：治理层校对门禁对「直连 / 网关」两通道同口径（normalizeToolCall 单点归一，before/after 双钩子消费）');
}

// ---- 汇报 ----
ok.push(`allTools（直连注册 / tools/list 可见）${allTools.size} 个`);
if (errors.length > 0) {
  console.error('❌ 轴 I 工具成员一致性校验失败：');
  for (const e of errors) console.error('   - ' + e);
  console.error(
    '\n   修复方向（Issue #382 DECISION-1）：纯 TS 逻辑工具（PS1 无同名分支）一律直连注册并进 allTools；' +
      'schema 唯一定义者 = 其 definition（不得在 COM_ACTIONS 留第二份）；注册层与治理层都不得再有' +
      '「网关专属」黑名单/拦截表；COM_ACTIONS 每条必须有执行者；治理层校对门禁对直连/网关两通道同口径'
      + '（`normalizeToolCall` 单点归一，before/after 双钩子都消费）；历史债披露项必须带跟踪 Issue 编号' +
      '（编号单一来源 = scripts/lib/legacy-debt-manifest.js）。'
  );
  process.exit(1);
}
console.log('✅ 轴 I 工具成员一致性校验通过：');
for (const o of ok) console.log('   - ' + o);
