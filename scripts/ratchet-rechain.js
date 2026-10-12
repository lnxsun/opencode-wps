#!/usr/bin/env node
/**
 * E1 棘轮留痕**重链** CLI（Issue #408：把「并发加守卫」的手工拼接降为一条命令）。
 *
 * 用法：
 *   npm run ratchet:rechain                       # 只体检（不改文件；有需改动时 EXIT=1）
 *   npm run ratchet:rechain -- --write            # 应用「补齐 from 链 + 收紧声明基线」
 *   npm run ratchet:rechain -- --write --issue '#N' --reason "…"   # 显式授权把天花板抬到实测
 *
 * 判据纯函数在 `scripts/lib/ratchet-rechain.js`（唯一来源）；实测口径在 `scripts/lib/e1-metrics.js`；
 * 棘轮本身在 `scripts/lib/ratchet.js`（**未改** —— 本 CLI 不新增/删除判据）。本文件**只做 IO 与文本手术**。
 *
 * ⚠️ 文本手术的边界（显式披露）：改写只经**锚定正则 + 条目原文定位**（`E1_BASELINES` 的逐键行；
 *   留痕条目按大括号配对取原文后替换其 `from:` / `to:` 数字），不做 AST 重写 —— 目的是**保住注释**
 *   （AST 序列化会清空注释，而本仓注释承载沿革与自限披露，清空即信息丢失）。因此对**块内格式**有依赖：
 *   改写后**立即重跑轴 I**做端到端校验（`--write` 内置），结构不符即报红而非静默写坏。
 *
 * ⚠️ 实测踩过的三坑（均已在对应代码处注明，留档以防复发）：
 *   ① `bodyStart` 曾误用 `index + 1` ⇒ 追加落进上一条文本中间；
 *   ② 条目曾按 `^\s+from:` 行锚定 ⇒ **单行条目漏改且静默**（`E1_RATCHET_LOG` 两种写法并存）；
 *   ③ 追加留痕**本身写长守卫源码** ⇒ 「测→追加」无不动点 ⇒ 拆为「结构改写 + 数值定式」。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'scripts', 'validate-semantic-anchor-scope.js');
const { planRechain, checkAppendedEntry } = require('./lib/ratchet-rechain.js');
const { countCodeLines, countBranches } = require('./lib/e1-metrics.js');
const { totalGuardSourceLines } = require('./lib/guard-sources.js');

// ---- 参数 ----
const argv = process.argv.slice(2);
const flag = name => argv.includes('--' + name);
const opt = name => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? undefined : argv[i + 1];
};
const WRITE = flag('write');
const ISSUE = opt('issue');
const REASON = opt('reason');
const NET_DELETION = opt('netDeletion');

// ---- 源文件与静态表 ----
const src = fs.readFileSync(CLI, 'utf8');
/** 取 `const NAME = { … };` 的**顶层块**（非贪婪到首个独占 `};`，与静态表实现一致）。 */
function pickBlock(text, name) {
  const re = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`);
  const m = text.match(re);
  if (!m) return null;
  // ⚠️ `bodyStart` = 块体在**全文**中的绝对起点 —— 此前误用 `index + 1`（`index` 指向
  //   `const` 而非 `{`），整块偏移约 24 字符 ⇒ 追加条目会插进**上一条的文本中间**
  //   （本 CLI 初版实测即此坑，且报告仍称「已追加」）。故显式给出并断言其正确性。
  const bodyStart = m.index + m[0].indexOf('{') + 1;
  return { body: m[1], index: m.index, bodyStart, raw: m[0] };
}
/** 取 `E1_BASELINES` 形式的「键 → 数字」表；可选对给定文本取（定式阶段要用**当前工作文本**）。 */
function pickNumberMap(name, text) {
  const b = pickBlock(text === undefined ? src : text, name);
  if (!b) return null;
  const out = {};
  for (const mm of b.body.matchAll(/^\s+(\w+):\s*(\d+),/gm)) out[mm[1]] = +mm[2];
  return out;
}
const BASELINES = pickNumberMap('E1_BASELINES');
const INITIAL = pickNumberMap('E1_RATCHET_INITIAL');
if (!BASELINES || !INITIAL) {
  console.error('✗ 无法解析 E1_BASELINES / E1_RATCHET_INITIAL —— 结构已变，请同步本脚本');
  process.exit(2);
}

/** 解析某维留痕数组（对象序列；`from`/`to` 按行锚定，避免误伤 reason 文本里的同名子串）。 */
function pickLog(dim, text) {
  const b = pickBlock(text === undefined ? src : text, 'E1_RATCHET_LOG');
  if (!b) return null;
  const body = b.body;
  const start = body.search(new RegExp(`\\n  ${dim}: \\[\\n`));
  if (start === -1) return null;
  const rest = body.slice(start);
  const end = rest.indexOf('\n  ],');
  if (end === -1) return null;
  const block = rest.slice(0, end);
  // 条目提取：按**大括号配对**切分（单行条目的旧正则漏解析 ⇒ 链被误判为断裂）。
  const entries = [];
  const blocks = [];
  let depth = 0;
  let cur = -1;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === '{') {
      if (depth === 0) cur = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && cur !== -1) {
        blocks.push(block.slice(cur, i + 1));
        cur = -1;
      }
    }
  }
  for (const raw of blocks) {
    const num = k => {
      const mm = raw.match(new RegExp(`(?:^|[{\\s,])${k}: (\\d+)`));
      return mm ? +mm[1] : undefined;
    };
    const str = k => {
      const mm = raw.match(new RegExp(`(?:^|[{\\s,])${k}: '((?:[^'\\\\]|\\\\.)*)'`));
      return mm ? mm[1] : undefined;
    };
    entries.push({
      issue: str('issue'),
      reason: str('reason'),
      from: num('from'),
      to: num('to'),
      netDeletion: str('netDeletion'),
      _raw: raw,
    });
  }
  return { entries, absStart: b.bodyStart + start, absEnd: b.bodyStart + start + end };
}

// ---- 实测（对**给定文本**取数：重链会写长/写短守卫自身，故必须在循环里对「当前文本」重测）----
const LIB_DIR = path.join(ROOT, 'scripts', 'lib');
const readLib = f => fs.readFileSync(path.join(LIB_DIR, f), 'utf8');
/** 定长文件（口径与轴 I 逐字一致；不随重链变动）。 */
const FIXED = {
  libCodeLines: countCodeLines(readLib('semantic-anchor-scope.js')),
  libBranches: countBranches(readLib('semantic-anchor-scope.js')),
  manifestCodeLines: countCodeLines(readLib('semantic-anchor-manifest.js')),
  manifestBranches: countBranches(readLib('semantic-anchor-manifest.js')),
  scopesCodeLines: countCodeLines(readLib('guard-scopes.js')),
  scopesBranches: countBranches(readLib('guard-scopes.js')),
};
/** 口径唯一来源：`lib/guard-sources.js` 的枚举 + 计行；此处把**本守卫自身**换成「当前工作文本」。 */
const OTHER_GUARD_LINES = (() => {
  const { ROOT: R, discoverGuardSources, countLines } = require('./lib/guard-sources.js');
  const selfRel = 'scripts/validate-semantic-anchor-scope.js';
  return discoverGuardSources()
    .filter(rel => rel !== selfRel)
    .reduce((n, rel) => n + countLines(path.join(R, rel)), 0);
})();
/** 对给定文本取全套实测（「本守卫」用 `text` 而非磁盘内容）。 */
function measureFor(text) {
  const lines = text.split('\n');
  const selfLines = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  return {
    ...FIXED,
    guardCodeLines: countCodeLines(text),
    guardBranches: countBranches(text),
    guardSourceLines: OTHER_GUARD_LINES + selfLines,
  };
}

const DIMS = Object.keys(BASELINES);

/** 文本手术：在 `next` 上按计划改写（返回新文本）。 */
function applyPlan(next, plan, writeNotes) {
  let out = next;
  const setBaseline = (dim, value) => {
    const re = new RegExp(`(\\n  ${dim}: )\\d+(,)`);
    if (!re.test(out)) throw new Error(`无法定位 E1_BASELINES.${dim} 字面量`);
    out = out.replace(re, `$1${value}$2`);
  };
  /**
   * 同步 `E1_RATCHET_ANCHOR`（Issue #399 CP3 引入的「不许上调」**非自指**比较对象）。
   *
   * ⚠️ 为什么重链必须同时改锚：轴 I 的「棘轮被上调」判据比的是
   *   `E1_BASELINES[dim]` vs `e1RatchetBaseline(dim)`，而后者对已登记维度**直接取锚**（不从留痕派生）。
   *   若本 CLI 只追加留痕 / 抬升声明基线而不动锚，则重链后立即出现
   *   「当前限值 > 棘轮基线」（实测：本 PR 与 main 合并后 ④ 变异自证用例由「重链后回绿」变「重链后仍红」）。
   *   ⇒ 锚必须与留痕末条 `.to` **同改**（授权上调是同一个动作的两处可见留痕，正是锚机制要的「互相可见性」）。
   */
  const setAnchor = (dim, value) => {
    const re = new RegExp(`(const E1_RATCHET_ANCHOR = \\{[\\s\\S]*?\\b${dim}: )\\d+`);
    // ⚠️ 锚是**逐维登记**的（Issue #399 CP3 只锚了 `guardSourceLines`；其余 8 维仍是「留痕末条」口径，
    //   已在锚常量注释里如实披露为残余自限）。未登记锚的维度**不新增锚条目** —— 本 CLI 不扩大锚覆盖面
    //   （那是 Issue #399 的后续工作，不属本次「重链↔锚对齐」的目的域）。
    if (!re.test(out)) return;
    out = out.replace(re, `$1${value}`);
  };
  for (const d of plan.dims) {
    const notes = [];
    for (const st of d.stitch) notes.push(`from 第 ${st.index} 条 ${st.from} → ${st.to}`);
    if (d.append) notes.push(`追加留痕 from=${d.append.from} to=${d.append.to}`);
    if (d.baseline !== null) notes.push(`E1_BASELINES ← ${d.baseline}`);
    if (notes.length === 0) continue;
    writeNotes.push(`· ${d.dim}（实测 ${d.measured} / 天花板 ${d.ceiling}）：${notes.join('；')}`);
    if (d.stitch.length > 0 || d.append) {
      // ⚠️ 必须从**当前工作文本**重定位（前几次改写已移动偏移）——否则插入落到错误位置且**静默**。
      const loc = pickLog(d.dim, out);
      if (!loc) throw new Error(`改写期无法重定位维度 ${d.dim} 的留痕块`);
      let block = out.slice(loc.absStart, loc.absEnd);
      for (const st of d.stitch) {
        const raw = loc.entries[st.index] && loc.entries[st.index]._raw;
        // 条目原文定位（不按 `from:` 行数）——`E1_RATCHET_LOG` 里多行/单行两种写法并存；
        // 初版按 `^\s+from:` 行锚定 ⇒ 单行条目的 `from:` 不在行首、**漏改且静默**（假留痕同族）。
        if (raw === undefined || !block.includes(raw))
          throw new Error(`改写期无法定位维度 ${d.dim} 第 ${st.index} 条原文（结构已变）`);
        const fixed = raw.replace(/(\bfrom:\s*)\d+/, `$1${st.to}`);
        if (fixed === raw)
          throw new Error(`维度 ${d.dim} 第 ${st.index} 条原文内无 from: 数字可改`);
        block = block.replace(raw, fixed);
      }
      if (d.append) {
        const ind = '    ';
        const entry =
          `${ind}{\n` +
          `${ind}  issue: '${d.append.issue}',\n` +
          `${ind}  reason:\n${ind}    '${String(d.append.reason).replace(/'/g, "\\'")}',\n` +
          `${ind}  from: ${d.append.from},\n` +
          `${ind}  to: ${d.append.to},\n` +
          `${ind}  netDeletion: '${String(d.append.netDeletion).replace(/'/g, "\\'")}',\n` +
          `${ind}},\n`;
        // `block` 不含块尾 `\n  ],` ⇒ 直接追加；**必须补 `\n`**，否则两条条目粘连（正是本 Issue
        //   描述的「漏写 `},`」的机器版）。改写后一律以**重跑轴 I** 为准，不信报告。
        block = block + '\n' + entry.replace(/\n$/, '');
      }
      out = out.slice(0, loc.absStart) + block + out.slice(loc.absEnd);
    }
    if (d.baseline !== null) setBaseline(d.dim, d.baseline);
    // 授权上调 ⇒ 锚同步（同一动作的两处留痕；见 setAnchor 注释）
    if (d.append) setAnchor(d.dim, d.append.to);
  }
  return out;
}

// ---- 主流程：结构改写（一次）+ 数值定式（迭代）----
//
let next = src;
const writeNotes = []; // 结构改写报告（补齐 from / 追加条目 / 收紧声明）
const settleNotes = []; // 数值定式报告
const appendedOnce = new Set(); // 每个维度**最多追加一条**（防「追加剧增 ⇒ 又超 ⇒ 再追加」发散）
const authorized = new Set(); // 已被授权「可上调」的维度（本 CLI 追加过留痕者）
const touchedDims = new Set(); // 本轮改编过声明基线的维度（定式阶段须回写）
let refusals = [];

function buildLogs(text) {
  const logs = {};
  for (const dim of DIMS) {
    const p = pickLog(dim, text);
    if (!p) {
      if (new RegExp(`\n  ${dim}: \\[`).test(pickBlock(text, 'E1_RATCHET_LOG').body))
        throw new Error(`维度 ${dim} 的留痕块非空但解析不出条目 —— 结构已变`);
      logs[dim] = [];
      continue;
    }
    logs[dim] = p.entries;
  }
  return logs;
}

/**
 * 单轮「测 → 计划 → 改写」。`allowAppend` = 本轮是否允许追加（每家最多一次，见 `appendedOnce`）。
 *
 * ⚠️ 为什么要**多轮**且**每家最多追加一次**：追加留痕本身会**写长守卫源码** ⇒
 *   写后实测大于写前 ⇒ 若每轮都允许追加，则「超天花板 → 追加 → 又超 → 再追加」**发散**
 *   （初版实测 6 轮后仍在追加）。故每家只追加一次，其余靠 ② 定式把刚追加条目的 `to`
 *   回写到**改写后**实测（只改数字、不改行数 ⇒ 必收敛）。
 */
function round(text, allowAppend) {
  const measured = measureFor(text);
  const plan = planRechain({
    dims: DIMS.map(d => ({ dim: d, measured: measured[d] })),
    logs: buildLogs(text),
    initial: INITIAL,
    baselines: pickNumberMap('E1_BASELINES', text),
    issue: allowAppend ? ISSUE : undefined,
    reason: allowAppend ? REASON : undefined,
    netDeletion: NET_DELETION,
  });
  if (plan.errors.length > 0) {
    plan.errors.forEach(e => console.error('✗ ' + e));
    process.exit(2);
  }
  // 已追加过的维度不再追加（其 `to` 由 ② 定式回写）——否则发散。
  for (const d of plan.dims) {
    if (d.append && appendedOnce.has(d.dim)) d.append = null;
  }
  for (const d of plan.dims)
    if (d.append) checkAppendedEntry(d.append).forEach(e => console.error('✗ ' + e));
  refusals = plan.refusals;
  for (const d of plan.dims) {
    if (d.append) {
      appendedOnce.add(d.dim);
      authorized.add(d.dim);
      touchedDims.add(d.dim);
    }
    // 声明基线在任一轮被改写过的维度也要定式 —— 否则基线停在**改前**实测，
    //   而追加/补齐本身写长了文件 ⇒ 基线立刻落后（「请在本 PR 内同步收紧基线」告警漂移）。
    if (d.baseline !== null) touchedDims.add(d.dim);
  }
  return { next: applyPlan(text, plan, writeNotes), changed: plan.dims.some(d => d.changed) };
}

// ① 结构 + 数值：轮询至稳定（上限 = 维度数 + 2，远大于实际所需）
let rounds = 0;
for (let i = 0; i < DIMS.length + 2; i++) {
  rounds = i + 1;
  const r = round(next, true);
  next = r.next;
  // ② 定式：把 `to` / 声明基线回写到**改写后**实测（只改数字 ⇒ 不改行数 ⇒ 稳定）
  for (let k = 0; k < 4; k++) {
    const measured = measureFor(next);
    let changed = false;
    for (const dim of touchedDims) {
      const loc = pickLog(dim, next);
      const tail = loc && loc.entries[loc.entries.length - 1];
      const ceiling = tail ? tail.to : INITIAL[dim];
      // (a) 本 CLI 权限内的维（追加过）：末条 `to` ← 改写后实测（同一次上调的收尾，非新上调）
      if (authorized.has(dim) && tail && tail.to !== measured[dim]) {
        const fixed = tail._raw.replace(/(\bto:\s*)\d+/, `$1${measured[dim]}`);
        if (fixed !== tail._raw) {
          next = next.replace(tail._raw, fixed);
          changed = true;
          if (k === 0) settleNotes.push(`· ${dim}：末条 to → ${measured[dim]}（改写后实测，定式）`);
        }
      }
      // (a') 锚同步：授权维的末条 `to` 既已定式到实测，锚必须跟随（否则轴 I 报「棘轮被上调」）
      if (authorized.has(dim)) {
        const reA = new RegExp(`(const E1_RATCHET_ANCHOR = \\{[\\s\\S]*?\\b${dim}: )\\d+`);
        if (reA.test(next)) {
          const before = next;
          next = next.replace(reA, `$1${measured[dim]}`);
          if (before !== next) changed = true;
        }
      }
      // (b) 声明基线 ← 实测，但**只在实测 ≤ 天花板时**（无授权绝不上调天花板）
      const c = tail && tail.to !== undefined && authorized.has(dim) ? measured[dim] : ceiling;
      if (measured[dim] > c) continue;
      if (pickNumberMap('E1_BASELINES', next)[dim] !== measured[dim]) {
        const re = new RegExp(`(\\n  ${dim}: )\\d+(,)`);
        if (!re.test(next)) throw new Error(`定式期无法定位 E1_BASELINES.${dim} 字面量`);
        next = next.replace(re, `$1${measured[dim]}$2`);
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (!r.changed) break;
}

writeNotes.forEach(n => console.log(n));
settleNotes.forEach(n => console.log(n));

if (refusals.length > 0) {
  console.error('\n✗ 以下维度**实测已超天花板**，重链不自行放行（须显式授权后才追加留痕）：');
  for (const r of refusals)
    console.error(`  · ${r.dim}：实测 ${r.measured} > 天花板 ${r.ceiling} ⇒ 需 ${r.required}`);
  console.error('  （这是「不许静默上调」判据的落点：数字由实测派生，但**授权必须显式**。）');
}

if (next === src && refusals.length === 0) {
  console.log('✓ 留痕链完整、天花板与实测自洽、声明基线与实测一致 —— 无需重链');
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n（体检模式）上述维度待改写；加 --write 应用。`);
  process.exit(1);
}
if (next !== src) {
  fs.writeFileSync(CLI, next);
  console.log(`\n已写入 ${path.relative(ROOT, CLI)}`);
}
// ---- 写后自校验：端到端重跑轴 I（结构不符即报红，不静默写坏）----
const r = spawnSync(process.execPath, [CLI], { cwd: ROOT, encoding: 'utf8' });
const out = (r.stdout || '') + (r.stderr || '');
if (r.status !== 0) {
  console.error('✗ 重链后轴 I 未通过 —— 已写入但校验不过，请检查：');
  console.error(out);
  process.exit(1);
}
console.log('✓ 重链后轴 I 通过');
process.exit(refusals.length > 0 ? 1 : 0);
