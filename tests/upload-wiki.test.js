/**
 * upload-wiki 工具测试套件（Issue #210 / PR #211）
 *
 * 测试 scripts/upload-wiki.js 的落地页逻辑：
 *  - buildCategoryIndex：正常生成索引页、未知分类抛错、Wiki 链接中文编码
 *  - collectEntries：总条目数（22 文档 + 4 落地页）、落地页内容正确性
 *  - 同名文档缺失时回退为索引页（P7 健壮性）
 *  - 复用同名文档的落地页顶部含「分类入口页」说明（P6）
 */

'use strict';

// ==================== 环境准备 ====================
// buildCategoryIndex 依赖 REPO_SLUG（默认值即可），显式设置避免环境依赖
process.env.CNB_REPO_SLUG = 'lnxsun/opencode-wps';

const fs = require('fs');
const os = require('os');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

var uploadWiki = require('../scripts/upload-wiki.js');
var collectEntries = uploadWiki.collectEntries;
var buildCategoryIndex = uploadWiki.buildCategoryIndex;
var CATEGORY_INDEX = uploadWiki.CATEGORY_INDEX;
var WIKI_NAME_MAP = uploadWiki.WIKI_NAME_MAP;
var wikiName = uploadWiki.wikiName;

// ==================== 测试框架 ====================

var testCount = 0;
var passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('✓ ' + name);
  } catch (e) {
    console.error('✗ ' + name + ' —— ' + e.message);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      (msg || '断言失败') +
        '\n  期望: ' +
        JSON.stringify(expected) +
        '\n  实际: ' +
        JSON.stringify(actual)
    );
  }
}

function assertTrue(actual, msg) {
  if (!actual) {
    throw new Error((msg || '断言失败') + '，期望为真，实际为假');
  }
}

function assertMatch(str, pattern, msg) {
  if (!pattern.test(str)) {
    throw new Error((msg || '正则断言失败') + '\n  模式: ' + pattern + '\n  实际: ' + str);
  }
}

// ==================== 测试用例 ====================

// --- CATEGORY_INDEX 结构 ---

test('CATEGORY_INDEX 覆盖 4 个一级目录', function () {
  assertEqual(CATEGORY_INDEX.length, 4, '应有 4 个一级目录落地页配置');
  const dirs = CATEGORY_INDEX.map(c => c.dir);
  ['使用指南', '开发指南', '平台专题', '内部参考'].forEach(d => {
    assertTrue(dirs.includes(d), '应包含目录 ' + d);
  });
});

test('CATEGORY_INDEX 无冗余 indexTitle 字段', function () {
  CATEGORY_INDEX.forEach(c => {
    assertTrue(!('indexTitle' in c), c.dir + ' 不应含 indexTitle 死字段');
  });
});

// --- buildCategoryIndex：正常生成索引页 ---

test('buildCategoryIndex 平台专题 生成 Wiki 链接索引页', function () {
  const content = buildCategoryIndex('平台专题');
  assertMatch(content, /^# 平台专题/m, '标题应为平台专题');
  assertMatch(content, /分类的索引页/, '应含索引页说明');
  assertMatch(content, /\[Windows 支持\]/, '应包含中文显示名链接');
  // Wiki 链接 + 中文目录名 URL 编码
  assertMatch(
    content,
    /\/-\/wiki\/%E5%B9%B3%E5%8F%B0%E4%B8%93%E9%A2%98\/Windows%20%E6%94%AF%E6%8C%81\.md/,
    '链接应指向 Wiki 且目录名和中文文件名已编码'
  );
  // 不应再指向 blob
  assertTrue(!content.includes('/-/blob/'), '链接不应指向 blob 源码');
});

test('buildCategoryIndex 内部参考 生成索引页', function () {
  const content = buildCategoryIndex('内部参考');
  assertMatch(content, /^# 内部参考/m, '标题应为内部参考');
  assertMatch(content, /\[MCP 协议\]/, '应包含 MCP 协议链接');
  // 验证该分类下多个文档链接
  assertMatch(content, /\[WPS COM 接口\]/, '应包含 WPS COM 接口链接');
  assertMatch(content, /\[WPS COM PS1 解析\]/, '应包含 WPS COM PS1 解析链接');
  assertMatch(content, /\[PowerShell 桥接\]/, '应包含 PowerShell 桥接链接');
  assertMatch(content, /\[安全模型\]/, '应包含 安全模型 链接');
});

// --- buildCategoryIndex：未知分类抛错 ---

test('buildCategoryIndex 未知分类抛出明确错误', function () {
  var threw = false;
  var message = '';
  try {
    buildCategoryIndex('不存在的分类');
  } catch (e) {
    threw = true;
    message = e.message;
  }
  assertTrue(threw, '未知分类应抛错');
  assertMatch(message, /未知 Wiki 分类/, '错误信息应含「未知 Wiki 分类」');
});

// --- collectEntries：条目数量与结构 ---

test('collectEntries 总条目 = 22 文档 + 4 落地页', function () {
  const entries = collectEntries();
  assertEqual(entries.length, 26, '应有 26 条（22 文档 + 4 落地页）');
});

test('collectEntries 生成 4 个落地页且带 content', function () {
  const entries = collectEntries();
  const landing = entries.filter(e =>
    ['使用指南.md', '开发指南.md', '平台专题.md', '内部参考.md'].includes(e.wikiPath)
  );
  assertEqual(landing.length, 4, '应有 4 个落地页条目');
  landing.forEach(e => {
    assertTrue(e.content !== undefined, e.wikiPath + ' 落地页应带 content');
  });
});

test('collectEntries 复用同名文档的落地页含入口说明（P6）', function () {
  const entries = collectEntries();
  const us = entries.find(e => e.wikiPath === '使用指南.md');
  assertMatch(us.content, /分类入口页/, '使用指南落地页应含入口说明');
  assertMatch(us.content, /# 使用指南（Wiki 级）/, '应复用 USAGE.md 内容');
});

test('collectEntries 无同名文档的落地页为索引页', function () {
  const entries = collectEntries();
  const pt = entries.find(e => e.wikiPath === '平台专题.md');
  assertMatch(pt.content, /分类的索引页/, '平台专题落地页应为索引页');
});

// --- P7：同名文档缺失时回退为索引页（用隔离临时目录，避免污染真实工作区） ---

test('collectEntries 同名文档缺失时回退为索引页（P7，隔离目录）', function () {
  // 构造一个不含 USAGE.md 的隔离 docs 目录，验证缺失回退，不触碰真实 docs/（P10）
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-wiki-test-'));
  try {
    const entries = collectEntries(tmpDir);
    const us = entries.find(e => e.wikiPath === '使用指南.md');
    // 缺失时回退为索引页（标题为「使用指南」而非「使用指南（Wiki 级）」）
    assertMatch(us.content, /^# 使用指南(?![（(]Wiki 级)/m, '缺失时应回退为普通索引页标题');
    // 隔离目录下普通文档 sourceFile 也应指向隔离目录
    const usage = entries.find(e => e.wikiPath === '使用指南/使用说明.md');
    assertTrue(usage.sourceFile.startsWith(tmpDir), 'sourceFile 应指向隔离目录');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('collectEntries 隔离目录下复用同名文档含入口说明（P10 隔离验证）', function () {
  // 构造含 USAGE.md 的隔离目录，验证正常复用路径
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-wiki-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'USAGE.md'), '# 使用指南（Wiki 级）\n测试内容\n');
    const entries = collectEntries(tmpDir);
    const us = entries.find(e => e.wikiPath === '使用指南.md');
    assertMatch(us.content, /分类入口页/, '使用指南落地页应含入口说明');
    assertMatch(us.content, /# 使用指南（Wiki 级）/, '应复用隔离目录中的 USAGE.md 内容');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('collectEntries 开发指南落地页复用 DEVELOPMENT_GUIDE.md（P11）', function () {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-wiki-test-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'DEVELOPMENT_GUIDE.md'),
      '# 开发指南（Wiki 级）\n开发内容\n'
    );
    const entries = collectEntries(tmpDir);
    const dev = entries.find(e => e.wikiPath === '开发指南.md');
    assertMatch(dev.content, /分类入口页/, '开发指南落地页应含入口说明');
    assertMatch(dev.content, /# 开发指南（Wiki 级）/, '应复用 DEVELOPMENT_GUIDE.md 内容');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- WIKI_NAME_MAP 中文显示名映射 ---

test('WIKI_NAME_MAP 覆盖全部非 README 文档', function () {
  const allFiles = [];
  const uploadWikiMod = require('../scripts/upload-wiki.js');
  uploadWikiMod.WIKI_MENU.forEach(cat => {
    cat.files.forEach(f => allFiles.push(f));
  });
  // 每个源文件都应有中文映射（README 除外，保持原名）
  allFiles
    .filter(f => f !== 'README.md')
    .forEach(f => {
      assertTrue(WIKI_NAME_MAP[f] !== undefined, '缺少中文映射: ' + f);
    });
  // README 保持原名
  assertEqual(wikiName('README.md'), 'README.md', 'README 应保持原名');
});

test('wikiName 返回中文显示名', function () {
  assertEqual(wikiName('USAGE.md'), '使用说明.md', 'USAGE.md 应映射为使用说明.md');
  assertEqual(wikiName('INSTALLATION.md'), '安装指南.md', 'INSTALLATION.md 应映射为安装指南.md');
  assertEqual(wikiName('MCP.md'), 'MCP 协议.md', 'MCP.md 应映射为 MCP 协议.md');
  assertEqual(wikiName('SKILLS.md'), '技能.md', 'SKILLS.md 应映射为技能.md');
  assertEqual(
    wikiName('WPS_COM_PS1.md'),
    'WPS COM PS1 解析.md',
    'WPS_COM_PS1.md 应映射为 WPS COM PS1 解析.md'
  );
  // 未映射的文件名原样返回（捕获防遗漏警告避免测试输出噪音）
  const origWarn = console.warn;
  console.warn = function () {};
  try {
    assertEqual(wikiName('NOT_IN_MAP.md'), 'NOT_IN_MAP.md', '未映射文件应原样返回');
  } finally {
    console.warn = origWarn;
  }
});

test('collectEntries 普通文档 wiki 路径使用中文显示名', function () {
  const entries = collectEntries();
  // 使用指南分类下的文档路径应使用中文名
  const usage = entries.find(e => e.wikiPath === '使用指南/使用说明.md');
  assertTrue(usage !== undefined, '应存在 使用指南/使用说明.md 条目');
  assertTrue(usage.sourceFile.endsWith('USAGE.md'), 'sourceFile 应指向 docs/USAGE.md');
  // 不应存在英文名路径
  const oldPath = entries.find(e => e.wikiPath === '使用指南/USAGE.md');
  assertTrue(oldPath === undefined, '不应存在 使用指南/USAGE.md 条目');
  // 多个分类中的文档路径应使用中文名
  const dev = entries.find(e => e.wikiPath === '开发指南/开发手册.md');
  assertTrue(dev !== undefined, '应存在 开发指南/开发手册.md 条目');
  const pt = entries.find(e => e.wikiPath === '平台专题/Windows 支持.md');
  assertTrue(pt !== undefined, '应存在 平台专题/Windows 支持.md 条目');
  const mcp = entries.find(e => e.wikiPath === '内部参考/MCP 协议.md');
  assertTrue(mcp !== undefined, '应存在 内部参考/MCP 协议.md 条目');
  const wps = entries.find(e => e.wikiPath === '内部参考/WPS COM PS1 解析.md');
  assertTrue(wps !== undefined, '应存在 内部参考/WPS COM PS1 解析.md 条目');
  // 各分类 sourceFile 应指向对应英文源文件
  assertTrue(
    dev.sourceFile.endsWith('DEVELOPMENT_GUIDE.md'),
    'sourceFile 应指向 DEVELOPMENT_GUIDE.md'
  );
  assertTrue(pt.sourceFile.endsWith('WINDOWS.md'), 'sourceFile 应指向 WINDOWS.md');
  assertTrue(mcp.sourceFile.endsWith('MCP.md'), 'sourceFile 应指向 MCP.md');
  assertTrue(wps.sourceFile.endsWith('WPS_COM_PS1.md'), 'sourceFile 应指向 WPS_COM_PS1.md');
});

// 防冲突检测：验证 collectEntries 对重复 wiki 路径输出警告（R6 评审）
test('collectEntries 重复 wiki 路径检测（R6）', function () {
  // 捕获 console.warn 输出
  const origWarn = console.warn;
  const warnings = [];
  console.warn = function (msg) {
    warnings.push(String(msg));
  };
  // 临时替换映射，模拟重复
  const origMap = WIKI_NAME_MAP['FEATURES.md'];
  try {
    // 将 FEATURES.md 映射为与 USAGE.md 相同的目标名
    WIKI_NAME_MAP['FEATURES.md'] = '使用说明.md';
    collectEntries();
    // 验证输出了重复路径警告
    const dupWarning = warnings.find(w => w.includes('重复 wiki 路径'));
    assertTrue(dupWarning !== undefined, '应输出重复 wiki 路径警告');
    assertMatch(dupWarning, /FEATURES\.md/, '警告应包含冲突的源文件名');
  } finally {
    // 确保恢复映射和 console.warn，避免测试间污染
    WIKI_NAME_MAP['FEATURES.md'] = origMap;
    console.warn = origWarn;
  }
});

// ==================== 测试结果汇总 ====================

console.log('\n========== upload-wiki 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有 upload-wiki 测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
