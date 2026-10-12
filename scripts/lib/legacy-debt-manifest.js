'use strict';

/**
 * 「范围外既有历史债」跟踪 Issue 单一来源（Issue #388 / 复盘铁律 22）。
 *
 * 背景：`scripts/validate-gateway-membership.js` 对「PS1 无同名分支却仍在 COM_ACTIONS 索引」
 *   的历史债**只披露、不阻断**（它不在当前 PR 改动范围内）。披露文案**必须**带跟踪 Issue 编号
 *   ——「无编号的待后续」是铁律 22 明令禁止的形态（债会静默沉淀）。
 *
 * 本清单把「哪条债由哪个 Issue 跟踪」收敛为**唯一事实源**：
 *   - 披露文案的 `#<issue>` 由本单源**派生**；
 *   - 守卫断言**双向**一致：凡披露项必须有正整数编号（缺即报红）；凡登记项必须对应真实披露项
 *     （债已清偿却仍登记 = 台账说谎，同样报红）。
 *
 * 判据形态：`<工具短名>: { issue: <正整数>, note }`。`issue` 必须为正整数（缺 / 非正整数即报红）。
 *
 * ⚠️ **当前为空集**：原登记项 `generateFormula` / `writeFile` 已在 Issue #388 从 `COM_ACTIONS`
 *   删除（schema 唯一定义者收敛为其 `definition`）⇒ 债已清偿，登记项随之删除（双向一致）。
 *   若未来再现同类历史债，重新在此登记并写跟踪 Issue 编号。
 */
const LEGACY_DEBT = {};

module.exports = { LEGACY_DEBT };
