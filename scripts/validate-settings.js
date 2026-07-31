#!/usr/bin/env node
/**
 * 校验 .cnb/settings.yml 的 YAML 语法与结构
 *
 * 背景：settings.yml 中每个 NPC 角色的 prompt 是长文本块，
 * 一个缩进/语法错误会导致整个 NPC 配置失效且难以察觉。
 * 本脚本在 CI 中（.cnb.yml 的 Validate NPC settings stage）执行，
 * 作为格式回归的最后防线。
 *
 * 用法：node scripts/validate-settings.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const FILE = path.resolve(__dirname, '../.cnb/settings.yml');
const errors = [];

// ---- 1. YAML 语法解析 ----
let doc;
try {
  doc = YAML.parse(fs.readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`❌ YAML 语法错误: ${FILE}`);
  console.error(`   ${e.message}`);
  process.exit(1);
}

// ---- 2. 顶层结构 ----
if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
  errors.push('顶层必须是对象（应包含 npc 节点）');
} else if (!doc.npc || typeof doc.npc !== 'object' || Array.isArray(doc.npc)) {
  errors.push('缺少 npc 节点（npc 必须是对象）');
} else {
  const npc = doc.npc;
  const roles = npc.roles;

  // ---- 3. defaultRole ----
  if (typeof npc.defaultRole !== 'string' || npc.defaultRole.trim() === '') {
    errors.push('npc.defaultRole 必须是非空字符串');
  }

  // ---- 4. roles ----
  if (!Array.isArray(roles) || roles.length === 0) {
    errors.push('npc.roles 必须是非空数组');
  } else {
    const names = new Set();
    roles.forEach((role, i) => {
      const label = `npc.roles[${i}]`;
      if (!role || typeof role !== 'object') {
        errors.push(`${label} 必须是对象`);
        return;
      }
      if (typeof role.name !== 'string' || role.name.trim() === '') {
        errors.push(`${label}.name 不能为空`);
      } else {
        if (names.has(role.name)) {
          errors.push(`${label}.name「${role.name}」重复`);
        }
        names.add(role.name);
      }
      if (typeof role.prompt !== 'string' || role.prompt.trim() === '') {
        errors.push(`${label}.prompt 必须是非空字符串（name=${role.name || '?'}）`);
      }
    });

    // defaultRole 必须存在于 roles 中
    if (typeof npc.defaultRole === 'string' && npc.defaultRole.trim() !== '') {
      if (!names.has(npc.defaultRole)) {
        errors.push(`npc.defaultRole「${npc.defaultRole}」不在 npc.roles 中`);
      }
    }
  }
}

// ---- 5. 输出 ----
if (errors.length > 0) {
  console.error(`❌ .cnb/settings.yml 结构校验失败（${errors.length} 个问题）：`);
  errors.forEach(e => console.error(`   - ${e}`));
  process.exit(1);
}

console.log(
  `✅ .cnb/settings.yml 校验通过（${doc.npc.roles.length} 个角色，defaultRole=${doc.npc.defaultRole}）`
);
