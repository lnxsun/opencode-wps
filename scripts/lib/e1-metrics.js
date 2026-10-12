'use strict';

/**
 * E1 度量口径的**唯一来源**（Issue #408）。
 *
 * 背景：E1 各维「实测值」此前只在 `validate-semantic-anchor-scope.js` 内部计算
 * （`stripComments` / `countCodeLines` / `countBranches` + `guard-sources.js` 的物理行数）。
 * `npm run ratchet:rechain`（本 Issue 引入）需要**同一份实测值** —— 若在重链脚本里
 * 复制一份计数逻辑，就是本仓反复在治的「同一语义两处写」（且两份分叉后重链会写回错值）。
 * ⇒ 口径下沉到本模块（**数据/度量单源，无判据、无断言**），守卫与重链脚本共用。
 *
 * ⚠️ 两种口径**互不可推**（沿用 Issue #341/#352 的结论）：
 *   · `codeLines`  = **有效代码行**（剔空行与注释行）—— 量逻辑复杂度；
 *   · `branches`   = 分支数（`if(` / 三元 / `&&`/`||`）；
 *   · `guardSourceLines` = 守卫/元数据源码**物理行数总量**（含注释/空行）—— 量篇幅。
 *   给守卫追加 300 行纯注释：物理行数维度报红、其余维不为所动 ⇒ 「压注释凑行数」无效。
 */

/** 剔注释行（`//` / `*` / `/*` 开头；与守卫历史口径逐字一致，含其已知粗糙性）。 */
function stripComments(src) {
  return src
    .split('\n')
    .filter(l => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

/** 有效代码行数（剔空行与注释行）。 */
function countCodeLines(src) {
  return stripComments(src)
    .split('\n')
    .filter(l => l.trim() !== '').length;
}

/** 分支数（唯一实现）：`if (` / 三元 / `&&`/`||`。 */
function countBranches(src) {
  return (
    (src.match(/\bif\s*\(/g) || []).length +
    (src.match(/\?[^?]*:/g) || []).length +
    (src.match(/&&|\|\|/g) || []).length
  );
}

module.exports = { stripComments, countCodeLines, countBranches };
