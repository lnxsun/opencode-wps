/**
 * 单一来源方案 C：skill 文档引用解析与安装期派生回归测试（PR #250 第 2 轮评审整改）
 *
 * 背景：方案 C 新增 scripts/lib/skill-doc-refs.js（collectSkillDocRefs）与
 * scripts/lib/derive-skill-docs.js（deriveSkillDocs），并以此支撑
 * scripts/validate-skill-docs.js 门禁。此前这些逻辑仅靠手工验证，无自动化回归用例。
 * 本文件固化正/负向用例，守护派生/校验逻辑不被未来改动静默破坏。
 *
 * 运行：node tests/skill-doc-refs.test.js（被 npm run test 自动聚合）
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { collectSkillDocRefs } = require('../scripts/lib/skill-doc-refs.js');
const { deriveSkillDocs } = require('../scripts/lib/derive-skill-docs.js');

// ---- 自建 mini 测试框架（与 tests/ 其他套件一致，无第三方依赖）----
let testCount = 0;
let passCount = 0;
const failures = [];

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failures.push({ name, err: e });
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}

function assertTrue(actual, msg) {
  if (!actual) throw new Error(msg || 'expected true');
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected)
    throw new Error((msg || 'not equal') + ': got ' + actual + ', want ' + expected);
}

// ---- 夹具：临时目录 + 临时 SKILL.md ----
function mkTempSkill(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillref-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
  return dir;
}

// ---- 用例 ----
test('collectSkillDocRefs 抽取去重 docs/xxx.md 引用', () => {
  const dir = mkTempSkill(
    '正文见 `docs/FEATURES.md`\n' + '规则见 `docs/FEATURES.md`\n' + '设计见 `docs/SKILLS.md`'
  );
  const refs = collectSkillDocRefs(path.join(dir, 'SKILL.md'));
  assertEqual(refs.size, 2, '应有 2 个去重引用');
  assertTrue(refs.has('docs/FEATURES.md'), '缺 FEATURES 引用');
  assertTrue(refs.has('docs/SKILLS.md'), '缺 SKILLS 引用');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('collectSkillDocRefs 无引用时返回空集合', () => {
  const dir = mkTempSkill('无任何文档引用的 SKILL');
  const refs = collectSkillDocRefs(path.join(dir, 'SKILL.md'));
  assertEqual(refs.size, 0, '应无引用');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('collectSkillDocRefs 文件不存在时返回空集合不抛错', () => {
  const refs = collectSkillDocRefs('/nonexistent/path/SKILL.md');
  assertEqual(refs.size, 0, '应返回空');
});

test('deriveSkillDocs 正常从根 docs/ 派生并字节一致', () => {
  const rootDir = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-'));
  const skillDir = mkTempSkill('见 `docs/FEATURES.md` 与 `docs/SKILLS.md`');
  const dest = path.join(tmp, 'wps-proofread');
  fs.mkdirSync(dest, { recursive: true });

  const r = deriveSkillDocs({ rootDir, skillSrcDir: skillDir, skillDestDir: dest });
  assertEqual(r.derived, 2, '应派生 2 个文件');
  assertEqual(r.unmet.length, 0, '不应有未满足引用');

  const rootFile = path.join(rootDir, 'docs', 'FEATURES.md');
  const destFile = path.join(dest, 'docs', 'FEATURES.md');
  assertTrue(fs.existsSync(destFile), '目标 docs 应生成 FEATURES 文件');
  assertEqual(
    fs.readFileSync(rootFile, 'utf8'),
    fs.readFileSync(destFile, 'utf8'),
    '派生文件应与根 docs 字节一致'
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(skillDir, { recursive: true, force: true });
});

test('deriveSkillDocs 根缺文件时 unmet 正确报出', () => {
  const rootDir = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-'));
  const skillDir = mkTempSkill('见 `docs/nonexistent-abc-xyz.md`');
  const dest = path.join(tmp, 'wps-proofread');
  fs.mkdirSync(dest, { recursive: true });

  const r = deriveSkillDocs({ rootDir, skillSrcDir: skillDir, skillDestDir: dest });
  assertEqual(r.derived, 0, '不应派生出文件');
  assertEqual(r.unmet.length, 1, '应有 1 个未满足引用');
  assertEqual(r.unmet[0], 'docs/nonexistent-abc-xyz.md', '未满足引用应为该不存在文件');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(skillDir, { recursive: true, force: true });
});

test('validate-skill-docs 脚本正向通过', () => {
  const { spawnSync } = require('child_process');
  const script = path.join(__dirname, '..', 'scripts', 'validate-skill-docs.js');
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assertEqual(r.status, 0, '正向校验应退出码 0');
});

// ---- 汇总 ----
console.log(`\nskill-doc-refs.test.js: ${passCount}/${testCount} 通过`);
if (failures.length > 0) {
  console.error('失败项：');
  failures.forEach(f => console.error('  ✗ ' + f.name + ' → ' + f.err.message));
  process.exit(1);
}

test('deriveSkillDocs 自愈：清理失效的根镜像派生文档', () => {
  const rootDir = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-'));
  const skillDir = mkTempSkill('见 `docs/FEATURES.md`');
  const dest = path.join(tmp, 'wps-proofread');
  fs.mkdirSync(path.join(dest, 'docs'), { recursive: true });
  // 预置一个"已失效"的根镜像派生文档（根 docs/ 有同名源但 SKILL.md 当前不再引用）
  fs.writeFileSync(path.join(dest, 'docs', 'SKILLS.md'), 'old', 'utf8');

  const r = deriveSkillDocs({ rootDir, skillSrcDir: skillDir, skillDestDir: dest });
  assertEqual(r.derived, 1, '应派生 1 个被引用文件');
  assertTrue(fs.existsSync(path.join(dest, 'docs', 'FEATURES.md')), '应生成 FEATURES 文件');
  assertTrue(!fs.existsSync(path.join(dest, 'docs', 'SKILLS.md')), '失效根镜像应被清理');

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(skillDir, { recursive: true, force: true });
});

test('deriveSkillDocs 自愈仅删根镜像失效文档，保留 skill 自带 docs', () => {
  const rootDir = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-'));
  const skillDir = mkTempSkill('见 `docs/FEATURES.md`');
  const dest = path.join(tmp, 'wps-proofread');
  fs.mkdirSync(path.join(dest, 'docs'), { recursive: true });
  // 根镜像失效文档（根 docs/ 有同名源但不再被引用）
  fs.writeFileSync(path.join(dest, 'docs', 'HISTORY.md'), 'x', 'utf8');
  // skill 自带文档（根 docs/ 无同名源，不应被清理）
  fs.writeFileSync(path.join(dest, 'docs', 'skill-shipped.md'), 'keep me', 'utf8');

  const r = deriveSkillDocs({ rootDir, skillSrcDir: skillDir, skillDestDir: dest });
  assertEqual(r.derived, 1, '应派生被引用的 FEATURES 文档');
  assertTrue(fs.existsSync(path.join(dest, 'docs', 'FEATURES.md')), '应生成 FEATURES 文件');
  assertTrue(!fs.existsSync(path.join(dest, 'docs', 'SKILLS.md')), '失效根镜像应被清理');
  assertTrue(fs.existsSync(path.join(dest, 'docs', 'skill-shipped.md')), 'skill 自带文档应保留');

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(skillDir, { recursive: true, force: true });
});
