'use strict';

/**
 * 根侧运行时依赖前置检查（`npm test` 入口的「先装依赖」指引，Issue #297）。
 *
 * 背景：无 `node_modules` 时 `npm test` 直接以裸 `Cannot find module 'fs-extra'`
 * 崩溃——报错不指向「先装依赖」，易被误读为代码缺陷（#277/#291 曾因此多绕一圈排查）。
 *
 * 本模块提供**纯函数**缺失探测（不 spawn、不抛错、只读），供 `run-root-tests.js`
 * 在聚合测试前调用；抽出 lib 是为了让「缺依赖 → 缺失清单」这一逻辑可被窄用例
 * 直接断言（无需 spawn 子进程），保证门禁本身有回归保护。
 *
 * 设计要点：
 *   - 依赖清单**从根 package.json 的 dependencies 动态读取**，不硬编码，加依赖自动纳入；
 *   - 探测用 `require.resolve(name, { paths: [rootDir] })`，与 Node 实际解析路径一致；
 *   - 读取/解析 package.json 失败时返回空清单（不拦截，交回调用方按原流程处理）。
 *
 * @param {string} rootDir 仓库根目录（含 package.json）
 * @returns {string[]} 缺失的运行时依赖名清单（已安装则为空数组）
 */
function findMissingRootDeps(rootDir) {
  const fs = require('fs');
  const path = require('path');

  let deps;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    deps = pkg && pkg.dependencies ? pkg.dependencies : {};
  } catch (e) {
    return [];
  }

  const missing = [];
  for (const name of Object.keys(deps)) {
    try {
      require.resolve(name, { paths: [rootDir] });
    } catch (e) {
      missing.push(name);
    }
  }
  return missing;
}

module.exports = { findMissingRootDeps };
