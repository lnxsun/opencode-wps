'use strict';

/**
 * 归一化：去除所有空白字符，用于双源（docs 提示词 / Skill 正文）严格比较。
 * 单一实现源：validate-npc-team-prompt.js 与 sync-npc-team-skill.js 共用，
 * 避免两处重复实现导致未来升级规则时静默失同步。
 */
function normalize(s) {
  return s.replace(/\s+/g, '');
}

module.exports = { normalize };
