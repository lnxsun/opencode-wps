#!/usr/bin/env node
/**
 * 校验所有 skill 的 SKILL.md 相对文档引用都能在根 docs/ 命中（单一来源方案 C）
 *
 * 背景：wps-proofread 的 SKILL.md 用 `docs/xxx.md` 引用设计文档。B2 曾 git 复制
 * 双份到 skill 内；方案 C 改为根 docs/ 单一来源、安装期派生。本脚本静态校验：
 *   - 每个 skill 的 SKILL.md 引用的每个 docs/xxx.md 都能在根 docs/ 找到同名源文件
 *     （否则安装后派生会断链 → 运行时 skill 缺失说明）
 *   - 附带校验 git 中 skills 子目录的 docs 不残留 B2 时代的 git 双份（避免重新引入漂移）
 *
 * 用法：node scripts/validate-skill-docs.js
 * 失败退出码非 0（供 CI / preflight 门禁）。
 * 文档引用解析复用 scripts/lib/skill-doc-refs.js（单一实现源，与派生共用）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { collectSkillDocRefs } = require('./lib/skill-doc-refs.js');

const rootDir = path.resolve(__dirname, '..');
const skillsDir = path.join(rootDir, 'skills');
const rootDocsDir = path.join(rootDir, 'docs');

const errors = [];
const warnings = [];

if (!fs.existsSync(skillsDir)) {
  console.log('skills/ 目录不存在，跳过校验。');
  process.exit(0);
}

const skillNames = fs
  .readdirSync(skillsDir)
  .filter(name => fs.existsSync(path.join(skillsDir, name, 'SKILL.md')));

for (const skillName of skillNames) {
  const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
  const refs = collectSkillDocRefs(skillFile);

  for (const rel of refs) {
    const srcFile = path.join(rootDir, rel); // rel 形如 docs/xxx.md
    if (!fs.existsSync(srcFile)) {
      errors.push(
        `${skillName}/SKILL.md 引用 ${rel}，但根目录下不存在该源文件（将导致安装期派生断链）。`
      );
    }
  }

  // 校验 git 中 skills/<skill>/docs 无 git 双份（B2 镜像产物，方案 C 应移除）
  const skillDocsDir = path.join(skillsDir, skillName, 'docs');
  if (fs.existsSync(skillDocsDir)) {
    const trackedDocs = fs
      .readdirSync(skillDocsDir)
      .filter(f => f.endsWith('.md') && fs.existsSync(path.join(rootDocsDir, f)));
    if (trackedDocs.length > 0) {
      warnings.push(
        `${skillName}/docs/ 下存在与根 docs/ 同名的 git 双份文件 [${trackedDocs.join(', ')}]，` +
          '方案 C 单一来源下应移除，避免镜像漂移。'
      );
    }
  }
}

if (warnings.length) {
  console.log('[警告]');
  warnings.forEach(w => console.log('  - ' + w));
}
if (errors.length) {
  console.error('[校验失败] 以下 skill 文档引用无法命中根 docs/ 单一来源：');
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
} else {
  console.log(
    `[通过] 共校验 ${skillNames.length} 个 skill，所有 docs 引用均命中根 docs/ 单一来源。`
  );
}
