'use strict';

/**
 * 版本源一致性纯函数（Issue #295 复盘 · 铁律 22 预防性闭环）。
 *
 * 背景：`scripts/validate-versions.js` 历史断言只覆盖 `wps-office-mcp/package-lock.json`，
 * **漏了根 `package-lock.json`** —— 于是根 `package.json`(1.9.27) 与根
 * `package-lock.json`(1.9.26) 可长期漂移而门禁全绿（#295 复盘 10/12 实探）。
 *
 * 本模块把「lockfile 顶层 + packages[""] 两处 version 是否等于期望版本」抽为**纯函数**，
 * 供校验脚本调用，并被 `tests/validate-versions.test.js` 以窄用例 + 变异自证守护
 * （注入反例 → 断言由绿转红），保证该守卫本身有回归保护。
 */

/**
 * 校验一个 lockfile 对象的版本字段是否与期望一致。
 *
 * @param {string} label    展示标签（如 `package-lock.json`）
 * @param {string} file     来源文件相对路径（写进错误信息）
 * @param {object} lockObj  已解析的 lockfile 对象
 * @param {string} expected 期望版本（单一版本源 = 根 package.json.version）
 * @returns {string[]} 错误信息清单（空数组 = 一致）
 */
function checkLockfileVersions(label, file, lockObj, expected) {
  const errors = [];
  const top = lockObj && lockObj.version;
  if (top !== expected) {
    errors.push(`${label} (顶层) (${file}) 版本「${top}」与根 package.json「${expected}」不一致`);
  }
  const pkgEntry = lockObj && lockObj.packages && lockObj.packages[''];
  if (pkgEntry) {
    const inner = pkgEntry.version;
    if (inner !== expected) {
      errors.push(
        `${label} (packages[""]) (${file}) 版本「${inner}」与根 package.json「${expected}」不一致`
      );
    }
  }
  return errors;
}

module.exports = { checkLockfileVersions };
