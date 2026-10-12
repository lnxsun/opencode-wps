/**
 * rewrite-wiki-links 工具测试套件（Issue #204）
 *
 * 测试 scripts/rewrite-wiki-links.js 的链接改写逻辑：
 *  - 相对链接 ./xxx.md、../xxx.md → CNB blob 绝对链接
 *  - 锚点链接保留、目录链接 → tree 链接
 *  - 外部 http(s)、锚点 #、mailto 等不被误改
 *  - rewriteFileContent 不误改代码块 / 行内代码中的相对路径
 */

// ==================== 待测试模块 ====================

var rewriteTarget = require('../scripts/rewrite-wiki-links.js').rewriteTarget;
var rewriteFileContent = require('../scripts/rewrite-wiki-links.js').rewriteFileContent;

// 仓库根目录：基于测试文件自身定位，禁止硬编码 checkout 目录名。
// 背景（Issue #277 附带缺陷）：原先硬编码 '/workspace/...' 作为 fileAbs，
// 而 scripts/rewrite-wiki-links.js 用 path.resolve(__dirname, '..') 计算仓库根，
// 导致测试仅在「checkout 目录恰好叫 workspace」时通过，换任何路径必挂（假失败）。
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

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

// ==================== 测试用例 ====================

var BLOB = 'https://cnb.cool/lnxsun/opencode-wps/-/blob/main';
var TREE = 'https://cnb.cool/lnxsun/opencode-wps/-/tree/main';

// --- rewriteTarget：docs/ 下文件 ---

test('docs 内 ./xxx.md → blob/docs/xxx.md', function () {
  assertEqual(
    rewriteTarget('./INSTALLATION.md', path.join(ROOT, 'docs/USAGE.md')),
    BLOB + '/docs/INSTALLATION.md',
    'docs 内相对链接应改写为 blob 链接'
  );
});

test('docs 内 ../xxx.md → blob/xxx.md（回仓库根）', function () {
  assertEqual(
    rewriteTarget('../README.md', path.join(ROOT, 'docs/USAGE.md')),
    BLOB + '/README.md',
    '返回仓库根的相对链接应改写为 blob 链接'
  );
});

test('docs 内 ../AGENTS.md → blob/AGENTS.md', function () {
  assertEqual(
    rewriteTarget('../AGENTS.md', path.join(ROOT, 'docs/README.md')),
    BLOB + '/AGENTS.md',
    'docs 指向根文件应改写正确'
  );
});

test('docs 内 ./xxx.md#锚点 → blob/xxx.md#锚点（锚点保留）', function () {
  assertEqual(
    rewriteTarget('./USAGE.md#63-端口速查', path.join(ROOT, 'docs/DEVELOPMENT_GUIDE.md')),
    BLOB + '/docs/USAGE.md#63-端口速查',
    '带锚点的相对链接应改写并保留锚点'
  );
});

test('docs 内 ./目录/ → tree/目录/', function () {
  assertEqual(
    rewriteTarget('./superpowers/specs/', path.join(ROOT, 'docs/README.md')),
    TREE + '/docs/superpowers/specs/',
    '目录链接应改写为 tree 链接'
  );
});

test('docs 内 ./子目录/xxx.md → blob/docs/子目录/xxx.md', function () {
  assertEqual(
    rewriteTarget('./specs/2026-05-05-port-kill-design.md', path.join(ROOT, 'docs/README.md')),
    BLOB + '/docs/specs/2026-05-05-port-kill-design.md',
    '子目录相对链接应改写正确'
  );
});

// --- rewriteTarget：根 README.md ---

test('根 README 内 ./docs/xxx.md → blob/docs/xxx.md', function () {
  assertEqual(
    rewriteTarget('./docs/USAGE.md', path.join(ROOT, 'README.md')),
    BLOB + '/docs/USAGE.md',
    '根 README 指向 docs 应改写为 blob/docs 链接'
  );
});

test('根 README 内 ./LICENSE → blob/LICENSE', function () {
  assertEqual(
    rewriteTarget('./LICENSE', path.join(ROOT, 'README.md')),
    BLOB + '/LICENSE',
    '根 README 指向根文件应改写正确'
  );
});

// --- rewriteTarget：外部 / 锚点 / 非相对链接不被改写 ---

test('外部 http(s) 链接不被改写', function () {
  assertEqual(
    rewriteTarget('https://github.com/lnxsun/opencode-wps', path.join(ROOT, 'README.md')),
    'https://github.com/lnxsun/opencode-wps',
    '外部链接应原样保留'
  );
});

test('纯锚点 #章节 不被改写', function () {
  assertEqual(
    rewriteTarget('#章节', path.join(ROOT, 'docs/README.md')),
    '#章节',
    '页内锚点应原样保留'
  );
});

test('mailto: 链接不被改写', function () {
  assertEqual(
    rewriteTarget('mailto:test@example.com', path.join(ROOT, 'README.md')),
    'mailto:test@example.com',
    'mailto 链接应原样保留'
  );
});

test('非相对链接（无 ./ 或 ../）不被改写', function () {
  assertEqual(
    rewriteTarget('docs/INSTALLATION.md', path.join(ROOT, 'docs/USAGE.md')),
    'docs/INSTALLATION.md',
    '非相对链接应原样保留'
  );
});

// --- rewriteFileContent：整体改写与误改防护 ---

test('rewriteFileContent 改写真实链接且不改写代码块/行内代码/锚点', function () {
  var content =
    '普通链接 [INSTALLATION](./INSTALLATION.md)\n' +
    '行内代码 `./xxx.md` 不应被改\n' +
    '```bash\ncd ./wps-office-mcp && npm install\ngit_doc_dir: /data/codewiki/xxx\n```\n' +
    '目录 [specs](./superpowers/specs/)\n' +
    '锚点 [跳转](#章节)\n';
  var result = rewriteFileContent(content, path.join(ROOT, 'docs/USAGE.md'));
  // 只应改写 2 处：普通链接 + 目录链接
  assertEqual(result.rewritten, 2, '应恰好改写 2 处');
  assertTrue(
    result.content.indexOf('blob/main/docs/INSTALLATION.md') !== -1,
    '普通链接应被改写为 blob 链接'
  );
  assertTrue(
    result.content.indexOf('tree/main/docs/superpowers/specs/') !== -1,
    '目录链接应被改写为 tree 链接'
  );
  // 代码块、行内代码、锚点应原样保留
  assertTrue(result.content.indexOf('`./xxx.md`') !== -1, '行内代码应保留');
  assertTrue(result.content.indexOf('cd ./wps-office-mcp') !== -1, '代码块路径应保留');
  assertTrue(result.content.indexOf('git_doc_dir: /data/codewiki/xxx') !== -1, '代码块配置应保留');
  assertTrue(result.content.indexOf('(#章节)') !== -1, '锚点应保留');
});

test('rewriteFileContent 对已改写链接幂等（不重复改写）', function () {
  var content =
    '[INSTALLATION](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md)\n';
  var result = rewriteFileContent(content, path.join(ROOT, 'docs/USAGE.md'));
  assertEqual(result.rewritten, 0, '已改写的 blob 链接不应被重复处理');
});

// ==================== 测试结果汇总 ====================

console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ 所有 rewrite-wiki-links 测试通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
