'use strict';

/**
 * 测试侧读守卫度量的**唯一出口**（Issue #347 观察项：collectFacts() 每次调用重复全量 I/O）。
 *
 * 为什么要它（Issue #347）：
 *   `collectFacts()` 是度量口径的唯一定义者（CLI 与测试共用，禁止各自重写），但每次调用都重做
 *   全套文件系统 I/O（读全部文档 + 全部计行对象）。测试按**用例**反复调用 ⇒ I/O 成本随用例数增长，
 *   而非随被测代码规模。此前 `tests/validate-*.test.js` 内 43 处原地 `collectFacts()`。
 *
 * 判据：**每文件每次进程运行至多一次** `BLoat.collectFacts()` —— 放在单一出口模块里（单一来源
 *   = `SNAPSHOTS` 表；测试侧**不得**内联保存该调用的结果，否则等于把缓存逻辑抄回每个测试文件，
 *   正是本仓反复在治的「同一语义两处写」）。
 *
 * ⚠️ 为什么是「每文件每次运行一次」而不是「每次调用一次」（**不回退 Issue #347 的症状**）：
 *   测试进程每次运行至多调一次 `collectFacts()` ⇒ 与用例数**解耦**（用例再多也不放大 I/O）。
 *   为何不做得更强（如「当前文件内容哈希」或「mutation 感知」）：两者都会让「改文件后重跑」的
 *   变异自证**恒绿**（假绿），正是 Issue #347 明令禁止的方向。本出口只做**进程内至多一次**，
 *   `collectFacts()` 本体**保持无缓存**：新起进程（`spawnSync` 跑 CLI）仍立刻看到磁盘新状态。
 *
 * 变异自证的**唯一合法写法**：注入变异后必须**重新加载被变异模块**再取度量，即
 *   `evict([模块路径])` → `requireFresh(模块路径)` → 在该**新实例**上调 `collectFacts()`。
 *   直接对 `requireFresh(m)` 的返回值调 `collectFacts()` 是允许的（它消费的是新加载实例，不是本表）。
 *
 * @param {object} m 守卫模块实例（其 `collectFacts()` 是被本表记忆的出口）
 * @returns {object} 该模块的已收集快照（同一进程内对同一模块恒返回同一对象）
 */
const SNAPSHOTS = new Map();
function snapshot(m) {
  if (!SNAPSHOTS.has(m)) SNAPSHOTS.set(m, m.collectFacts());
  return SNAPSHOTS.get(m);
}

/** 失效出口：**仅**在变异自证重载了被变异模块时调用（否则快照会指向旧实例）。 */
function evict(modules) {
  for (const m of [].concat(modules)) SNAPSHOTS.delete(m);
}

/** 重载模块并返回**新鲜实例**（清 require 缓存后重新 require）——变异自证的合法取数路径。 */
function requireFresh(absPath) {
  delete require.cache[require.resolve(absPath)];
  return require(absPath);
}

module.exports = { snapshot, evict, requireFresh };
