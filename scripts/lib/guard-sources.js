'use strict';

/**
 * 守卫/元数据源码集合的**唯一来源**（Issue #352 第五刀）。
 *
 * 第三刀把分母从手写清单改为机械枚举，但枚举实现留在**体量闸门**内；第五刀之后体量棘轮
 * 由轴 I（`validate-semantic-anchor-scope.js`）承担，而轴 I 的量是**源码文件自身** ——
 * 若枚举仍留在体量闸门，就会出现「守卫量自己时要求先加载体量闸门 → 循环」。
 * ⇒ 枚举下沉到本模块（数据/度量单源，无判据、无断言），三方（体量闸门 / 轴 I / 测试）共用。
 *
 * ⚠️ 自限（显式披露）：枚举**不递归子目录**，只两个显式目录（当前二者均无子目录）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** 枚举范围（唯一来源）：`scripts/validate-*.js`（全部守卫 CLI）+ `scripts/lib/*.js`（全部判据/数据/工具）
 *  + `scripts/ratchet-*.js`（棘轮工具 CLI，Issue #408）。
 *
 * ⚠️ 为什么把 `ratchet-*.js` 纳入（Issue #408）：若按「是不是守卫」人工挑选，则**改个文件名的
 *   前缀**（`validate-x.js` → `x.js`）即可逃出体量分母 —— 正是第三刀治掉的「合法抬高/逃出棘轮」形态。
 *   该 CLI 能**改写棘轮基线**（能力上会影响闸门强弱），故与守卫同口径计入**机械枚举**。
 * ⚠️ 自限（显式披露，非放宽）：其余 `scripts/*.js` 工具（`gen-` / `lint-` / `run-` / `sync-` /
 *   `upload-` / `rewrite-`）**不入分母** —— 它们不读写任何棘轮/契约值，改它们不改变闸门强弱；
 *   若将来其中某个获得了改写契约值的能力，须并入本枚举（不得靠人工记得登记）。 */
const GUARD_SOURCE_DIRS = [
  [path.join(ROOT, 'scripts'), /^(validate|ratchet)-.*\.js$/],
  [path.join(ROOT, 'scripts', 'lib'), /\.js$/],
];

/** 枚举守卫/元数据源码（相对 ROOT，posix 分隔、**排序**保证输出稳定）。 */
function discoverGuardSources() {
  const out = [];
  for (const [dir, re] of GUARD_SOURCE_DIRS)
    for (const name of fs.readdirSync(dir))
      if (re.test(name)) out.push(path.relative(ROOT, path.join(dir, name)).split(path.sep).join('/'));
  return out.sort();
}

/** 计行口径（唯一来源）：文件**物理行数**（末尾换行不计，与 `wc -l` 对齐）。 */
function countLines(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

/** 守卫/元数据源码**物理行数总量**（枚举 + 计行；缺失文件按 0 计）。 */
function totalGuardSourceLines() {
  return discoverGuardSources().reduce(
    (n, rel) => n + Math.max(countLines(path.join(ROOT, rel)), 0),
    0
  );
}

module.exports = { ROOT, GUARD_SOURCE_DIRS, discoverGuardSources, countLines, totalGuardSourceLines };
