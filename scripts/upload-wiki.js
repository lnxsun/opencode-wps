#!/usr/bin/env node
/**
 * 将仓库 docs/ 文档上传到 CNB Code Wiki（绕过 codewiki 插件 LLM 生成缺陷）。
 *
 * 背景（Issue #117/#204）：
 *   仓库已通过 codewiki 插件尝试自动生成 Wiki，但平台侧 codewiki 插件调用 LLM
 *   持续返回空响应（"LLM响应中未找到有效的Action标签"），导致 Wiki 从未自动生成。
 *   此前已通过 `upload/wiki/file` API 手动上传 22 篇文档成功，仓库因此出现 Wiki
 *   导航入口（flags 含 Wiki）。但手动上传的是 v1.9.3 时代使用**相对链接**的旧版文档，
 *   点击 Wiki 内链接会 404。
 *
 *   方案 A：在 `.cnb.yml` 的 `tag_push` 中新增一个 stage，构建容器内用脚本把
 *   docs/（已由 scripts/rewrite-wiki-links.js 改写为 CNB blob 绝对链接）重新上传为
 *   Wiki 页面，从而修复 Wiki 内链接 404。
 *
 * ⚠️ 实测结论（Issue #117 2026-08-23 已验证）：
 *   本脚本在 tag_push（CI）环境下**无法通过 upload/wiki/file API 上传 Wiki**：
 *   - JSON body（{path,content,branch}）→ 401 errcode:16「user is not logged in」
 *   - multipart（file/content + path + branch）→ 400 errcode:3「Invalid argument」
 *   即流水线临时令牌 CNB_TOKEN 对该内部 API 无认证/授权权限（docker login 有效但
 *   HTTP 上传接口不可用）。上传修正后的 docs/ 至 Wiki 需用户本人（OAuth 权限）
 *   通过网页手动上传，或等待平台修复 codewiki 插件 LLM 缺陷后自动生成。
 *   本脚本保留作平台能力恢复后的自动尝试。
 *
 * 用法（CI，tag_push 事件）：
 *   node scripts/upload-wiki.js
 *
 * 依赖环境变量（CNB 构建容器自动注入）：
 *   CNB_REPO_SLUG       仓库路径，如 lnxsun/opencode-wps
 *   CNB_TOKEN           流水线运行期临时令牌（OCI 凭证，可调用 wiki 上传 API）
 *   CNB_API_ENDPOINT    CNB API 地址，默认 https://api.cnb.cool
 *   CNB_DEFAULT_BRANCH  默认分支（可选，默认 main）
 *
 * 本脚本在构建容器内运行，仅依赖内置 Node.js，无第三方依赖。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 环境变量（CNB 构建容器自动注入）
const REPO_SLUG = process.env.CNB_REPO_SLUG || 'lnxsun/opencode-wps';
const CNB_TOKEN = process.env.CNB_TOKEN;
const API_BASE = process.env.CNB_API_ENDPOINT || 'https://api.cnb.cool';
const DEFAULT_BRANCH = process.env.CNB_DEFAULT_BRANCH || 'main';
// 当前提交 SHA（用于 wiki 预上传协议 ext.commit_sha）
const BRANCH_SHA =
  process.env.CNB_BRANCH_SHA || process.env.CNB_COMMIT || process.env.CI_COMMIT_SHA || '';

// 当前 Wiki 菜单结构（与仓库首页 wiki 菜单保持一致，含 4 大分类）
// 每项：{ dir: 上传到 Wiki 的路径前缀, files: [docs/ 下文件名] }
const WIKI_MENU = [
  { dir: '', files: ['README.md'] },
  { dir: '使用指南', files: ['USAGE.md', 'INSTALLATION.md', 'TROUBLESHOOTING.md', 'FEATURES.md'] },
  {
    dir: '开发指南',
    files: [
      'DEVELOPMENT_GUIDE.md',
      'SKILLS.md',
      'ARCHITECTURE.md',
      'CODE_REVIEW_GUIDE.md',
      'WPSJS_DEVELOPMENT.md',
      'INSTALL_SCRIPT.md',
    ],
  },
  { dir: '平台专题', files: ['WINDOWS.md', 'MAC.md', 'LINUX.md'] },
  {
    dir: '内部参考',
    files: [
      'MCP.md',
      'OPENCODE_API.md',
      'WPS_COM_API.md',
      'WPS_COM_PS1.md',
      'POWERSHELL_COM.md',
      'SECURITY.md',
      'NPC_TEAM.md',
      'HISTORY.md',
    ],
  },
];

// 源文件名 → Wiki 中文显示名 映射（导航显示名 = wiki 路径文件名）
// 用途：让 Wiki 左侧导航显示中文而非英文文件名（Issue #210 用户反馈）
// 说明：仅影响 Wiki 路径/导航显示名，不改变 docs/ 下实际源文件名。
// 命名规范：优先使用纯中文；英文专有名词（MCP/OpenCode/WPS/API/Skills）保留原拼写；
//          缩写组合（WPSJS/WPS_COM_PS1）保留下划线转空格（WPS COM PS1），不拆分缩写字母；格式统一为「英文 中文」或「纯中文」。
const WIKI_NAME_MAP = {
  'USAGE.md': '使用说明.md',
  'INSTALLATION.md': '安装指南.md',
  'TROUBLESHOOTING.md': '问题排查.md',
  'FEATURES.md': '功能特性.md',
  'DEVELOPMENT_GUIDE.md': '开发手册.md',
  'SKILLS.md': '技能.md',
  'ARCHITECTURE.md': '架构设计.md',
  'CODE_REVIEW_GUIDE.md': '代码审查.md',
  'WPSJS_DEVELOPMENT.md': 'WPSJS 开发.md',
  'INSTALL_SCRIPT.md': '安装脚本.md',
  'WINDOWS.md': 'Windows 支持.md',
  'MAC.md': 'macOS 支持.md',
  'LINUX.md': 'Linux 支持.md',
  'MCP.md': 'MCP 协议.md',
  'OPENCODE_API.md': 'OpenCode API.md',
  'WPS_COM_API.md': 'WPS COM 接口.md',
  'WPS_COM_PS1.md': 'WPS COM PS1 解析.md',
  'POWERSHELL_COM.md': 'PowerShell 桥接.md',
  'SECURITY.md': '安全模型.md',
  'NPC_TEAM.md': 'NPC Team.md',
  'HISTORY.md': '演进历史.md',
};

/** 获取 Wiki 显示文件名（源文件名 → 中文显示名，未映射则原样返回） */
function wikiName(sourceFile) {
  const mapped = WIKI_NAME_MAP[sourceFile];
  if (mapped === undefined && sourceFile !== 'README.md') {
    // 防遗漏保护：新增文档到 WIKI_MENU 时若忘记登记中文名，提示维护者
    console.warn(
      `  ⚠ wikiName: 「${sourceFile}」未在 WIKI_NAME_MAP 中登记中文名，将使用英文原文件名`
    );
  }
  if (mapped !== undefined && !mapped.endsWith('.md')) {
    // 防后缀遗漏：Wiki 中文显示名应带 .md 后缀，与源文件名保持一致
    console.warn(`  ⚠ wikiName: 「${sourceFile}」的映射值「${mapped}」缺少 .md 后缀`);
  }
  if (mapped !== undefined && mapped.includes('/')) {
    // 防路径分隔符：Wiki 显示名不应包含 /，否则会拼接出错误的多级路径
    console.warn(`  ⚠ wikiName: 「${sourceFile}」的映射值「${mapped}」包含路径分隔符 /`);
  }
  return mapped || sourceFile;
}

// 一级目录落地页（Issue #210）：Wiki 导航会把每个一级目录渲染成一个“与一级目录同名”的
// 首个子节点（指向裸目录路径，如 /-/wiki/使用指南）。此前只上传了 `使用指南/USAGE.md` 这类
// 带子路径的页面，裸目录路径上没有页面，导致点击同名节点 → 404。
//
// 修复：为每个一级目录额外上传一页“裸路径落地页”（路径 = 目录名本身），使点击同名节点可落到
// 真实内容而非 404。落地内容规则：
//   - 存在“同名文档”（标题与一级目录完全一致）的目录 → 复用该文档内容（使用指南→USAGE.md，
//     开发指南→DEVELOPMENT_GUIDE.md）；
//   - 无同名文档的目录（平台专题/内部参考）→ 生成一篇“分类索引页”，列出本目录全部文档链接。
// 每项：{ dir: 一级目录名, indexSourceFile?: 复用的同名文档路径 }
const CATEGORY_INDEX = [
  { dir: '使用指南', indexSourceFile: 'USAGE.md' },
  { dir: '开发指南', indexSourceFile: 'DEVELOPMENT_GUIDE.md' },
  { dir: '平台专题' },
  { dir: '内部参考' },
];

/**
 * 生成“分类索引页”内容（用于无同名文档的一级目录落地页）。
 * 索引页包含标题、说明和文档链接表格，链接指向 Wiki 内页面。
 * @param {string} dir 一级目录名（须在 WIKI_MENU 中定义）
 * @returns {string} 生成的 Markdown 索引页内容
 * @throws {Error} 如果 dir 不在 WIKI_MENU 中，抛出「未知 Wiki 分类」错误
 */
function buildCategoryIndex(dir) {
  const cat = WIKI_MENU.find(c => c.dir === dir);
  if (!cat) {
    throw new Error(`未知 Wiki 分类: ${dir}`);
  }
  // 索引页链接指向 Wiki 内页面（/-/wiki/<dir>/<file>），让用户停留在 Wiki 内浏览
  const wikiBase = `https://cnb.cool/${REPO_SLUG}/-/wiki/${encodeURIComponent(dir)}`;
  const lines = [`# ${dir}`, ''];
  lines.push(`> 本文档是「${dir}」分类的索引页，汇总该分类下的全部 Wiki 文档。`, '');
  lines.push('| 文档 | 说明 |', '|------|------|');
  for (const file of cat.files) {
    const wikiFileName = wikiName(file);
    const displayName = wikiFileName.replace(/\.md$/, '');
    lines.push(
      `| [${displayName}](${wikiBase}/${encodeURIComponent(wikiFileName)}) | ${displayName} |`
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * 一级目录 → 落地页配置 的 Map 缓存（避免逐 cat 线性查找 CATEGORY_INDEX）。
 * @type {Map<string, {dir: string, indexSourceFile?: string}>}
 */
const CATEGORY_INDEX_MAP = new Map(CATEGORY_INDEX.map(c => [c.dir, c]));

/**
 * 汇总待上传的文档条目：{ wikiPath, sourceFile, content? }（content 优先于 sourceFile）。
 * @param {string} [docsDir] 可选：docs 目录绝对路径，默认 path.join(rootDir, 'docs')；
 *   供测试注入隔离目录使用，避免读写真实工作区文件。
 */
function collectEntries(docsDir = path.join(rootDir, 'docs')) {
  const entries = [];
  // 防冲突保护：检查 WIKI_NAME_MAP 中是否有重复的目标文件名（两个源文件映射到同一个中文名）
  const seenWikiNames = new Set();
  for (const cat of WIKI_MENU) {
    for (const file of cat.files) {
      // README.md 在仓库根，其余在 docs/ 下。README 的 cat.dir 为空字符串，
      // wikiPath 直接为 'README.md'（根级路径），作为 Wiki 入口/首页页面处理。
      const sourceFile =
        file === 'README.md' ? path.join(rootDir, 'README.md') : path.join(docsDir, file);
      const wikiFileName = wikiName(file);
      const wikiPath = cat.dir ? `${cat.dir}/${wikiFileName}` : wikiFileName;
      if (seenWikiNames.has(wikiPath)) {
        console.warn(`  ⚠ 重复 wiki 路径: 「${file}」与已有文档冲突，跳过该条目（避免重复上传）`);
        continue;
      }
      seenWikiNames.add(wikiPath);
      entries.push({ wikiPath, sourceFile });
    }
    // 一级目录“同名”落地页（Issue #210）：让裸目录路径（/-/wiki/<dir>）可访问
    const landing = CATEGORY_INDEX_MAP.get(cat.dir);
    if (cat.dir && !landing) {
      // 一级目录未配置落地页：提示维护者，避免同名节点 404 复发且不可察觉（P13）
      console.warn(`  ⚠ 分类「${cat.dir}」未配置落地页，一级目录同名节点可能 404`);
    }
    if (landing && cat.dir) {
      let content;
      if (landing.indexSourceFile) {
        // 复用同名文档作为落地页，顶部加一行入口说明以区分文档页与入口页
        if (WIKI_NAME_MAP[landing.indexSourceFile] === undefined) {
          console.warn(
            `  ⚠ 分类「${cat.dir}」落地页源文件 ${landing.indexSourceFile} 未在 WIKI_NAME_MAP 登记中文名`
          );
        }
        const srcPath = path.join(docsDir, landing.indexSourceFile);
        if (fs.existsSync(srcPath)) {
          const src = fs.readFileSync(srcPath, 'utf8');
          content = `> 本页为「${cat.dir}」分类入口页，完整文档见左侧导航或下方链接。\n\n${src}`;
        } else {
          // 同名文档缺失时回退为索引页，避免抛 ENOENT 终止整个上传流程
          console.warn(`  ⚠ ${cat.dir}：同名文档 ${landing.indexSourceFile} 缺失，回退为索引页`);
          content = buildCategoryIndex(cat.dir);
        }
      } else {
        content = buildCategoryIndex(cat.dir);
      }
      const landingPath = `${cat.dir}.md`; // 落地页须带 .md 后缀（平台要求，否则 errcode 10402）
      if (seenWikiNames.has(landingPath)) {
        console.warn(`  ⚠ 重复 wiki 路径: 落地页「${landingPath}」与已有文档路径冲突`);
      }
      seenWikiNames.add(landingPath);
      entries.push({ wikiPath: landingPath, content });
    }
  }
  return entries;
}

/**
 * 上传单篇文档到 Wiki（两步协议，Issue #210 实测修正）。
 *
 * ⚠️ 协议修正（2026-08-24 实测，Issue #210）：
 *   此前对 `/-/upload/wiki/file` 直接发 multipart 文件上传，平台返回
 *   `HTTP 400 {"errcode":3,"errmsg":"Invalid argument"}`（即使 CNB_TOKEN 在
 *   tag_push 下具有 OCI 权限也全部失败）。经对照官方 codewiki 插件
 *   `post_process/upload_wiki2cos.py`，正确上传需两步：
 *
 *   ① 预上传：`POST /-/upload/wiki/file`，JSON body `{name, size, ext:{commit_sha}}`，
 *      Bearer CNB_TOKEN 认证 → 返回 `upload_url`；
 *   ② 上传：把文件内容以 multipart 上传到该 `upload_url`。
 *
 * @param {string} wikiPath Wiki 路径（含 .md 后缀，如 `使用指南.md`）
 * @param {string} content 文档内容
 * @returns {Promise<{ok: boolean, status?: number, body?: string}>}
 */
async function uploadFile(wikiPath, content) {
  if (!CNB_TOKEN) {
    throw new Error('环境变量 CNB_TOKEN 未设置，无法调用 wiki 上传 API');
  }
  const preUrl = `${API_BASE}/${REPO_SLUG}/-/upload/wiki/file`;
  const size = Buffer.byteLength(content, 'utf8');

  // ① 预上传：JSON 获取上传 URL
  const preResp = await fetch(preUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CNB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: wikiPath,
      size,
      ext: { commit_sha: BRANCH_SHA },
    }),
  });
  const preText = await preResp.text();
  if (!preResp.ok) {
    return { ok: false, status: preResp.status, body: preText };
  }
  let uploadUrl;
  try {
    uploadUrl = JSON.parse(preText).upload_url;
  } catch (_) {
    return {
      ok: false,
      status: preResp.status,
      body: `预上传响应缺少 upload_url：${preText.slice(0, 200)}`,
    };
  }
  if (!uploadUrl) {
    return {
      ok: false,
      status: preResp.status,
      body: `预上传响应缺少 upload_url：${preText.slice(0, 200)}`,
    };
  }

  // ② 上传文件内容（multipart）到 upload_url
  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/markdown' }), path.basename(wikiPath));
  const resp = await fetch(uploadUrl, {
    method: 'POST',
    // 不手动设置 Content-Type，让 fetch 自动生成 multipart boundary
    body: form,
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, body: text };
}

async function main() {
  console.log(`[upload-wiki] 仓库: ${REPO_SLUG}, 分支: ${DEFAULT_BRANCH}`);
  const entries = collectEntries();
  console.log(`[upload-wiki] 共 ${entries.length} 篇文档待上传：`);
  for (const e of entries) {
    console.log(`  - ${e.wikiPath}`);
  }

  let success = 0;
  let failed = 0;
  const failures = [];

  for (const e of entries) {
    // 一级目录索引页走内置生成的 content；普通文档页读 sourceFile
    let content;
    if (e.content !== undefined) {
      content = e.content;
    } else {
      if (!fs.existsSync(e.sourceFile)) {
        console.log(`  ✗ ${e.wikiPath}：源文件不存在 ${e.sourceFile}`);
        failed++;
        failures.push(`${e.wikiPath}（源文件缺失）`);
        continue;
      }
      content = fs.readFileSync(e.sourceFile, 'utf8');
    }
    try {
      const result = await uploadFile(e.wikiPath, content);
      if (result.ok) {
        console.log(`  ✓ ${e.wikiPath}（HTTP ${result.status}）`);
        success++;
      } else if (result.status === 403 && /oci token/i.test(result.body)) {
        // 认证失败：当前 token 无 OCI 权限（需在 push/tag_push 类事件中运行）
        console.error(
          `✗ 认证失败：CNB_TOKEN 无 OCI 权限（HTTP 403）` +
            `。请确认本脚本在 push/tag_push 类事件中运行（该事件下 CNB_TOKEN 具有制品库/OCI 权限）。`
        );
        console.error(`  响应：${result.body.slice(0, 200)}`);
        process.exit(2);
      } else {
        console.log(`  ✗ ${e.wikiPath}（HTTP ${result.status}）：${result.body.slice(0, 200)}`);
        failed++;
        failures.push(`${e.wikiPath}（HTTP ${result.status} ${result.body.slice(0, 80)}）`);
      }
    } catch (err) {
      console.log(`  ✗ ${e.wikiPath}：${err.message}`);
      failed++;
      failures.push(`${e.wikiPath}（${err.message}）`);
    }
  }

  console.log(`\n[upload-wiki] 完成：成功 ${success} / ${failed} 失败`);
  if (failures.length) {
    console.log('[upload-wiki] 失败明细：');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectEntries,
  uploadFile,
  buildCategoryIndex,
  CATEGORY_INDEX,
  WIKI_MENU,
  WIKI_NAME_MAP,
  wikiName,
};
