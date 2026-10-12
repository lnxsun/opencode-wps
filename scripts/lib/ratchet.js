'use strict';

/**
 * 守卫上限「棘轮」共享判据（唯一来源；Issue #341 R6 评审，Issue #352 第五刀收敛）。
 *
 * ⚠️ 本判据此前在**两条守卫**里各有一份：轴 I（`E1_BASELINES`：有效代码行 / 分支数）
 *   与体量闸门（S8：守卫源码物理行数总量）。Issue #352 第五刀把体量闸门收敛为轴 I 的
 *   一个维度（`guardSourceLines` —— 物理行数，剔注释与否为另一口径）⇒ **第二份实现删除**。
 *
 * 三类判据（体量闸门与轴 I 共用同口径）：
 *   ① 不许上调 —— `current ≤ baseline`；上调即报红（须走「留痕 + 同步基线」的显式流程）。
 *   ② 值 = 留痕 —— `baseline` 必须等于 `log` 最后一条 `.to`（无留痕时 = `initial`）。
 *      ⇒ 让 `log` 成为**活的**（有执行者），防「改了值不留痕 / 留了痕不改值」。
 *   ③ 留痕必填字段（防空壳留痕）。
 *
 * ⚠️ 第五刀删除原「④ 达标即收紧」判据 —— 实测该分支**零调用**：体量的「达标」由
 *   「实测 ≤ 上限」直接承担（`超上限` 即报红），另一份实现的存在只因两条守卫各写了一遍。
 *   参数入口（`achieved` / `target`）**同刀一并删除** —— 保留永不生效的入口会让下一读者把它当活机制。
 *
 * ⚠️ 自限（显式披露，非放宽）：本判据**不声称**拦住「有权限且有决心同时改基线与留痕两处的人」
 *   —— 静态守卫不能阻止维护者改守卫。它保证的是：任何放宽都**留下语义后果显式的痕迹**
 *   （值与留痕必须对账），而非静默放宽。
 *
 * @param {object} o
 * @param {string} o.name      度量名（用于报错定位，如 'E1 清单模块有效代码行'）
 * @param {number} o.initial   棘轮初始值（= log 为空时的唯一合法 baseline）
 * @param {number} o.current   当前限值（如 LIMITS.totalLines / E1_BASELINES[dim]）
 * @param {number} o.baseline  棘轮基线（current 不得大于它）
 * @param {Array<{issue:string,reason:string,from:number,to:number,netDeletion?:string}>} o.log 上调留痕
 * @returns {string[]} errors（空 = 通过）
 */
function checkRatchet(o) {
  const errors = [];
  const { name, initial, current, baseline } = o;
  const log = Array.isArray(o.log) ? o.log : [];

  // ① 不许上调
  if (current > baseline) {
    errors.push(
      `${name} 棘轮被上调：当前限值 ${current} > 棘轮基线 ${baseline} ——` +
        `棘轮只能下降不能上升。确需扩容须先留痕（Issue + 理由 + 等量删除证明）并同步棘轮基线`
    );
  }
  // ② 棘轮基线必须与留痕自洽（让 log 成为活的）
  const expectBaseline = log.length ? log[log.length - 1].to : initial;
  if (baseline !== expectBaseline) {
    errors.push(
      `${name} 棘轮值与留痕不对账：棘轮基线 ${baseline} ≠ 留痕最后一条 .to ${expectBaseline}` +
        `（无留痕时应为初始值 ${initial}）—— 棘轮值必须与批准留痕自洽` +
        `（防「改了值不留痕 / 留了痕不改值」）`
    );
  }
  // ③ 留痕必填字段（防空壳留痕）
  for (let i = 0; i < log.length; i++) {
    const e = log[i] || {};
    const missing = ['issue', 'reason', 'from', 'to'].filter(
      k => e[k] === undefined || e[k] === ''
    );
    if (missing.length > 0) {
      errors.push(`${name} 上调留痕第 ${i + 1} 条缺字段：${missing.join('/')} —— 空壳留痕不受理`);
    }
  }
  // ⚠️ Issue #352 第五刀删除原「④ 达标即收紧」判据**及其参数入口**（见文件头）——
  //   体量的「达标」由「实测 ≤ 上限」直接承担（`超上限` 即报红），同一语义不必第二处复述。
  return errors;
}


/**
 * 棘轮留痕**链条连续性**判据（Issue #352 第十一刀 F3 收口，与 `checkRatchet` 单源同居）。
 *
 * 背景（实测出的真缺陷）：`checkRatchet` 判据②只取 `log` **最后一条** `.to` 作基线
 * ⇒ 若数组**顺序被打乱**（本仓 `guardSourceLines` 曾为「第九刀→第七刀→第十刀→第五刀→第十一刀」
 * 的非时间序），「最后一条」既不等于「最新一条」，`from/to` 链条也接不上
 * （同一处既称「收紧到 5379」又称「上调到 5630」）。这不会当场报红（判据②仍自洽），
 * 但会让下一读者无法判断真实时序，且「上调」判据锚在一个**任意位置**的条目上 —— 属静默陷阱。
 *
 * 判据（两条独立断言）：
 *   ① **链条连续**：每条 `from` 必须等于前一条 `to`（无留痕 / 仅一条时跳过）；
 *   ② **时序可达**：末条 `.to` 即基线（由 `checkRatchet` 判据②承担，此处不重复）。
 * ⚠️ 本判据**不声称**校验「刀次序号」——刀次名是自由文本，编号断档由文档形态守卫另治；
 *   它只保证「留痕数组作为一条可读的变更链是自洽的」。
 *
 * @param {object} o
 * @param {string} o.name  度量名（报错定位）
 * @param {Array<{from:number,to:number}>} o.log 上调留痕（应按时间序排列）
 * @returns {string[]} errors（空 = 通过）
 */
function checkRatchetLogChronology(o) {
  const errors = [];
  const { name } = o;
  const log = Array.isArray(o.log) ? o.log : [];
  for (let i = 1; i < log.length; i++) {
    const prev = log[i - 1] || {};
    const cur = log[i] || {};
    if (prev.to !== cur.from) {
      errors.push(
        `${name} 留痕链断裂：第 ${i} 条 from=${cur.from} ≠ 第 ${i - 1} 条 to=${prev.to}` +
          ` —— 留痕须按**时间序**排列且首尾相接（顺序错乱会让「最后一条 = 最新」不再成立）`
      );
    }
  }
  return errors;
}

module.exports = { checkRatchet, checkRatchetLogChronology };
