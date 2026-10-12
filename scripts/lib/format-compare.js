'use strict';

/**
 * 行级格式比较：去行尾空白、保留行首缩进，逐行比较两段文本的格式是否一致。
 * 单一实现源：validate-npc-team-prompt.js（formatDiff）与 sync-npc-team-skill.js（formatConsistent）
 * 共用，避免两处重复实现导致未来调整比较规则时静默失同步。
 *
 * 背景（第 10 轮评审 W2 / 第 13 轮评审 W1）：normalize() 去所有空白比较会忽略「行首缩进」等纯格式差异
 * （如 docs 缩进统一而 skill 未重新生成），双源校验"假通过"。本模块提供行级缩进级比较作为补充防线：
 * - formatDiff(a, b)：返回差异描述数组（最多 maxDiffs 条），一致时返回空数组
 * - isFormatConsistent(a, b)：返回布尔（formatDiff 是否为空的简写）
 *
 * 规则：两行「去行尾空白后的原样文本」相等才算一致（保留行首缩进与行内空白）。
 */

/** 去行尾空白（保留行首缩进与行内空白） */
function trimTrailing(s) {
  return s.replace(/\s+$/g, '');
}

/**
 * 行级格式 diff。返回差异描述数组（最多 maxDiffs 条，默认 3 条）。
 * @param {string} a 文本 A
 * @param {string} b 文本 B
 * @param {number} [maxDiffs=3] 最多返回差异条数
 * @returns {string[]} 差异描述，一致时返回 []
 */
function formatDiff(a, b, maxDiffs = 3) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const diffs = [];
  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    const la = i < linesA.length ? linesA[i] : null;
    const lb = i < linesB.length ? linesB[i] : null;
    if (trimTrailing(la === null ? '' : la) !== trimTrailing(lb === null ? '' : lb)) {
      diffs.push(
        `L${i + 1} A=「${la === null ? '<缺行>' : la.trim().slice(0, 30)}」 B=「${lb === null ? '<缺行>' : lb.trim().slice(0, 30)}」`
      );
      if (diffs.length >= maxDiffs) break;
    }
  }
  return diffs;
}

/** 行级格式是否一致（formatDiff 为空的布尔简写） */
function isFormatConsistent(a, b) {
  return formatDiff(a, b).length === 0;
}

module.exports = { formatDiff, isFormatConsistent, trimTrailing };
