#!/usr/bin/env node
/**
 * 重写仓库 Markdown 文档中的相对链接为 CNB blob 绝对链接。
 *
 * 背景（Issue #204）：
 *   仓库 docs/ 各文档间、根 README.md 与 docs/ 之间使用**仓库相对路径链接**
 *   （如 ./INSTALLATION.md、../README.md、./docs/USAGE.md）。
 *   这些相对链接在仓库文件浏览（CNB blob / GitHub）中正常，但 codewiki 将文档
 *   生成到 Wiki 平台时**不会重写相对链接**，导致 Wiki 页面内点击链接跳转到不存在的
 *   Wiki 路径 → 404。
 *
 *   对照：仓库知识库入库（knowledge:update）会自动把相对链接重写为 CNB blob
 *   绝对链接，实测可访问、可渲染。故本脚本按同一口径，将 docs/ 与根 README.md 的
 *   相对链接统一改写为 CNB blob 绝对链接，确保 Wiki / 知识库 / 仓库浏览均可正常跳转。
 *
 * 用法：
 *   node scripts/rewrite-wiki-links.js            # 实际改写文件
 *   node scripts/rewrite-wiki-links.js --check    # 仅校验：是否存在尚未改写为绝对链接的相对链接
 *
 * 链接映射规则（基于当前文件位置）：
 *   docs/X.md 内 [t](./Y.md)         → https://cnb.cool/<slug>/-/blob/main/docs/Y.md
 *   docs/X.md 内 [t](./sub/Y.md)     → https://cnb.cool/<slug>/-/blob/main/docs/sub/Y.md
 *   docs/X.md 内 [t](../Y.md)        → https://cnb.cool/<slug>/-/blob/main/Y.md
 *   docs/X.md 内 [t](../sub/Y.md)    → https://cnb.cool/<slug>/-/blob/main/sub/Y.md
 *   docs/X.md 内 [t](./Y.md#锚点)    → https://cnb.cool/<slug>/-/blob/main/docs/Y.md#锚点
 *   docs/X.md 内 [t](./dir/)         → https://cnb.cool/<slug>/-/tree/main/docs/dir/
 *   README.md 内  [t](./docs/Y.md)   → https://cnb.cool/<slug>/-/blob/main/docs/Y.md
 *   README.md 内  [t](./Y.md)        → https://cnb.cool/<slug>/-/blob/main/Y.md
 *   README.md 内  [t](./LICENSE)     → https://cnb.cool/<slug>/-/blob/main/LICENSE
 *
 * 说明：本脚本只处理**仓库内部**的相对链接（./xxx 或 ../xxx），不触碰外部 http(s) 链接。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 仓库 slug 与默认分支（CNB 平台）；优先取环境变量，兜底默认值
const REPO_SLUG = process.env.CNB_REPO_SLUG || 'lnxsun/opencode-wps';
const DEFAULT_BRANCH = process.env.CNB_DEFAULT_BRANCH || 'main';
const BLOB_BASE = `https://cnb.cool/${REPO_SLUG}/-/blob/${DEFAULT_BRANCH}`;
const TREE_BASE = `https://cnb.cool/${REPO_SLUG}/-/tree/${DEFAULT_BRANCH}`;

// 待扫描的 Markdown 文件（docs/ 全部 + 根 README.md）
function collectMdFiles() {
  const files = [];
  const docsDir = path.join(rootDir, 'docs');
  walk(docsDir, files);
  files.push(path.join(rootDir, 'README.md'));
  return files;
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      acc.push(full);
    }
  }
}

/**
 * 将单个相对链接改写为绝对 blob/tree 链接。
 * 返回改写后的链接；若无需改写（外部链接 / 锚点 / 非仓库相对链接）返回原串。
 * @param {string} target  链接目标（如 ./INSTALLATION.md、../README.md、./superpowers/specs/）
 * @param {string} fileAbs 当前文件绝对路径（用于判断在 docs/ 下还是根目录）
 */
function rewriteTarget(target, fileAbs) {
  // 仅处理以 ./ 或 ../ 开头的仓库相对链接
  if (!/^\.\.?\//.test(target)) return target;

  // 拆分锚点（#xxx）；锚点原样保留，Markdown 渲染器（CNB blob）可自动解析中文标题
  let hash = '';
  let body = target;
  const hashIdx = target.indexOf('#');
  if (hashIdx !== -1) {
    hash = target.slice(hashIdx);
    body = target.slice(0, hashIdx);
  }

  // 计算相对当前文件到仓库根的真实路径
  // target 形如 ./x 或 ../x，基于文件所在目录解析
  const fileDir = path.dirname(fileAbs);
  const resolvedAbs = path.resolve(fileDir, body); // 仓库内绝对路径
  let repoPath = path.relative(rootDir, resolvedAbs).split(path.sep).join('/');

  // 判断目标是目录（以 / 结尾）
  const isDir = /\/$/.test(body);
  // 目录在 blob 下不适用，用 tree
  if (isDir) {
    return `${TREE_BASE}/${repoPath}/${hash}`;
  }

  return `${BLOB_BASE}/${repoPath}${hash}`;
}

/**
 * 重写单个文件内容中的所有 Markdown 相对链接。
 * 用正则匹配 [text](target)，对 target 做改写。
 * @returns {{content: string, rewritten: number}}
 */
function rewriteFileContent(content, fileAbs) {
  let rewritten = 0;
  const out = content.replace(/(\[[^\]]*\]\()([^)\s]+)(\))/g, (m, pre, target, post) => {
    // 跳过已经是 http(s) 绝对链接或 blob 链接的
    if (/^(https?:)?\/\//.test(target) || target.startsWith('#')) {
      return m;
    }
    const rewrittenTarget = rewriteTarget(target, fileAbs);
    if (rewrittenTarget !== target) {
      rewritten++;
      return `${pre}${rewrittenTarget}${post}`;
    }
    return m;
  });
  return { content: out, rewritten };
}

function main() {
  const isCheck = process.argv.includes('--check');
  const files = collectMdFiles();
  let totalRewritten = 0;
  const changedFiles = [];

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const { content, rewritten } = rewriteFileContent(original, file);
    if (rewritten > 0) {
      totalRewritten += rewritten;
      changedFiles.push(path.relative(rootDir, file));
      if (!isCheck) {
        fs.writeFileSync(file, content, 'utf8');
      }
    }
  }

  if (isCheck) {
    if (totalRewritten > 0) {
      console.error(`❌ 检测到 ${totalRewritten} 处未改写的相对链接：`);
      for (const f of changedFiles) {
        console.error(`   - ${f}`);
      }
      process.exit(1);
    }
    console.log('✅ 所有 Markdown 相对链接已改写为 CNB blob 绝对链接');
  } else {
    console.log(`✅ 已改写 ${totalRewritten} 处相对链接，涉及 ${changedFiles.length} 个文件`);
    for (const f of changedFiles) {
      console.log(`   - ${f}`);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { collectMdFiles, rewriteTarget, rewriteFileContent };
