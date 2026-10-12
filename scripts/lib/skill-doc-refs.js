'use strict';

/**
 * 收集 SKILL.md 中的相对文档引用 `docs/xxx.md`（单一实现源）。
 *
 * 方案 C（根 docs/ 单一来源 + 安装期派生）下，derive-skill-docs.js 与
 * validate-skill-docs.js 都需从 SKILL.md 解析其引用的 docs/ 文件。本模块是
 * 唯一实现，避免两处逐字重复导致未来改格式时一处改一处漏（呼应 normalize.js
 * 单一实现源先例）。
 *
 * @param {string} skillFile SKILL.md 的绝对路径
 * @returns {Set<string>} 去重后的相对引用集合，如 Set{'docs/xxx.md'}
 */
function collectSkillDocRefs(skillFile) {
  const fs = require('fs');
  const refs = new Set();
  if (!fs.existsSync(skillFile)) return refs;
  let content;
  try {
    content = fs.readFileSync(skillFile, 'utf-8');
  } catch (e) {
    return refs;
  }
  // 匹配 `docs/xxx.md`（允许反引号包裹）形式的相对文档引用
  const re = /`?docs\/[A-Za-z0-9_.-]+\.md`?/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const raw = m[0].replace(/`/g, '');
    if (/^docs\/[A-Za-z0-9_.-]+\.md$/.test(raw)) refs.add(raw);
  }
  return refs;
}

module.exports = { collectSkillDocRefs };
