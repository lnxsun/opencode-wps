'use strict';

/**
 * E1 棘轮留痕**重链**判据纯函数（Issue #408）。
 *
 * 背景（现象）：E1 留痕是 append-only 链（`E1_RATCHET_LOG[dim]` 每条 `from == 上一条 to`）。
 * 两个并发「加守卫」PR 各自 append 一条时，git 合并落在**同一个数组**上 ⇒ 需人工：
 * ① 保留两侧条目；② 把后侧条目的 `from` 改为前侧最后 `to`；③ 把末条 `to` 改为合并后**实测值**。
 * 本轮手工拼接时漏写一个 `},`（两对象粘连）⇒ 轴 I 报「留痕链断裂」（判据有效），
 * 但**拼接动作本身仍是手工**、按次数线性增长 ⇒ 属流程自动化缺口（非判据漏洞）。
 *
 * 本模块把该动作落成**可执行计划**（纯函数，无 IO、无仓库路径字面量）：
 *   · **补齐算术**：`from_{i}` ← `to_{i-1}`（i≥1）—— 纯算术，不可能抬高任何上限；
 *   · **收紧声明**：`E1_BASELINES[dim]` ← 实测（只在 `实测 ≤ 棘轮天花板` 时）；
 *   · **拒绝发明**：`实测 > 天花板` 时**不自行放行** —— 必须由人给出 `--issue` + `--reason`
 *     才能追加一条留痕（`from` = 旧天花板、`to` = 实测，两数由本模块算好，人不写数字）。
 *
 * ⚠️ 判据边界（显式披露，非放宽）：本模块**不**阻止「有权限且有决心同时改基线与留痕的人」——
 *   它与 `lib/ratchet.js` 同属「静态守卫不能阻止维护者改守卫」。它保证的是：任何**上调**
 *   都留下 `issue` + `reason` 显式痕迹，且**数字由实测派生**而非人手抄。
 *
 * ⚠️ 为什么不做「`to` 全量派生自实测」（Issue #408 方案 A 的评估结论，据实记账）：
 *   留痕条目是**历史**记录（`to_i` = 当时的实测），只有**末条**的语义与「现值」重合。
 *   若让留痕只记 `from` + 理由、把 `to` 全派生自**当前**实测，则天花板 ≡ 当前实测
 *   ⇒ `checkRatchet` 的「不许上调」判据退化为恒真（与 R3-F1/F1 删除的 `E1_RATCHET_BASELINES`
 *   副本表同族：判据恒真 = 白写）。故本 Issue 采**方案 B**（可执行重链），保留两条原判据。
 */

/** 留痕必填字段（与 `lib/ratchet.js` 的判据③同口径，用于追加条目时自检）。 */
const REQUIRED_FIELDS = ['issue', 'reason', 'from', 'to'];

/**
 * 计算重链计划（纯函数）。
 *
 * @param {object} o
 * @param {Array<{dim:string, measured:number}>} o.dims  维度 + 实测值（顺序即报告顺序）
 * @param {Record<string, Array<object>>} o.logs          各维留痕（**原样**传入，不改写调用方数据）
 * @param {Record<string, number>} o.initial              各维棘轮初始值
 * @param {Record<string, number>} o.baselines            各维声明基线（`E1_BASELINES`）
 * @param {string} [o.issue]                              追加留痕用的 Issue 编号（缺省则上调需人工）
 * @param {string} [o.reason]                             追加留痕用的理由
 * @param {string} [o.netDeletion]                        追加留痕用的净删/净增说明
 * @returns {{dims: Array<object>, refusals: Array<object>, errors: string[]}}
 *   `dims[i]` = `{ dim, measured, ceiling, entries(深拷贝), stitch:[{index,from,to}], append:entry|null,
 *                 baseline:number|null, changed:boolean }`
 */
function planRechain(o) {
  const errors = [];
  const dims = Array.isArray(o && o.dims) ? o.dims : [];
  const logs = (o && o.logs) || {};
  const initial = (o && o.initial) || {};
  const baselines = (o && o.baselines) || {};
  if (dims.length === 0) errors.push('重链计划无维度（dims 为空）');

  const out = [];
  const refusals = [];
  for (const { dim, measured } of dims) {
    if (typeof measured !== 'number' || Number.isNaN(measured))
      errors.push(`维度 ${dim} 的实测值非法：${measured}`);
    const src = Array.isArray(logs[dim]) ? logs[dim] : [];
    const entries = src.map(e => ({ ...e })); // 深拷贝一层（本判据不改写调用方数据）
    const init = initial[dim];
    const ceiling = entries.length ? entries[entries.length - 1].to : init;

    // ---- 补齐算术：from_i ← to_{i-1}（i≥1）----
    const stitch = [];
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].from !== entries[i - 1].to) {
        stitch.push({ index: i, from: entries[i].from, to: entries[i - 1].to });
        entries[i].from = entries[i - 1].to;
      }
    }

    // ---- 天花板 vs 实测 ----
    let append = null;
    if (measured > ceiling) {
      // 不得自行放行：须由人给出 issue + reason（数字由本模块算好，人不写数字）
      if (o && o.issue && o.reason) {
        append = {
          issue: o.issue,
          reason: o.reason,
          from: ceiling,
          to: measured,
          netDeletion: o.netDeletion || '（重链追加：数字由实测派生，见 PR 说明）',
        };
      } else {
        refusals.push({
          dim,
          measured,
          ceiling,
          required: `npm run ratchet:rechain -- --write --issue <编号> --reason "<理由>"`,
        });
      }
    }

    // ---- 声明基线：只在「实测 ≤ 天花板」时收紧（等于实测即现行稳态口径）----
    const decidable = append || measured <= ceiling;
    const baseline = decidable && baselines[dim] !== measured ? measured : null;

    const changed = stitch.length > 0 || !!append || baseline !== null;
    out.push({ dim, measured, ceiling, entries, stitch, append, baseline, changed });
  }
  return { dims: out, refusals, errors };
}

/** 追加条目自检（防「重链写出空壳留痕」—— 与 `checkRatchet` 判据③同口径）。 */
function checkAppendedEntry(entry) {
  const errors = [];
  const missing = REQUIRED_FIELDS.filter(k => entry[k] === undefined || entry[k] === '');
  if (missing.length > 0) errors.push(`重链追加留痕缺字段：${missing.join('/')} —— 空壳留痕不受理`);
  if (typeof entry.from === 'number' && typeof entry.to === 'number' && entry.to < entry.from)
    errors.push(`重链追加留痕 from=${entry.from} > to=${entry.to} —— 留痕不得记录「下调」`);
  return errors;
}

module.exports = { planRechain, checkAppendedEntry, REQUIRED_FIELDS };
