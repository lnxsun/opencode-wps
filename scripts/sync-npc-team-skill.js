#!/usr/bin/env node
/**
 * 将 docs/NPC_TEAM.md 中的提示词同步到 .codebuddy/skills/npc-team/SKILL.md
 *
 * 背景：docs/NPC_TEAM.md 是提示词唯一权威源，.codebuddy/skills/npc-team/SKILL.md 是可自动加载的 skill 版。
 * 改提示词时只需改 docs，然后运行本脚本同步 skill，避免双源漂移。
 * CI 中 scripts/validate-npc-team-prompt.js 会强校验两者正文一致（归一化空白后）。
 *
 * 用法：node scripts/sync-npc-team-skill.js
 *       （--check 模式：只检查是否一致，不一致则 exit 1，供 CI 使用）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { normalize } = require('./lib/normalize');
const { isFormatConsistent } = require('./lib/format-compare');
const { checkDesc } = require('./lib/npc-team-triggers');
const { extractPrompt } = require('./lib/npc-team-prompt-source');

const DOC_FILE = path.resolve(__dirname, '../docs/NPC_TEAM.md');
const SKILL_FILE = path.resolve(__dirname, '../.codebuddy/skills/npc-team/SKILL.md');

const CHECK_ONLY = process.argv.includes('--check');

const docContent = fs.readFileSync(DOC_FILE, 'utf8');
// 单一契约：提取正则唯一定义在 scripts/lib/npc-team-prompt-source.js（PR #315 评审 K4）
const promptSource = extractPrompt(docContent);
if (!promptSource.ok) {
  console.error('✖ ' + promptSource.reason);
  process.exit(1);
}
const prompt = promptSource.prompt;

// 校验 docs 中的提示词自身满足基本结构（防止错误代码块被同步）
if (!/你是「NPC Team 总指挥」/.test(prompt)) {
  console.error('✖ 提示词缺少身份声明，疑似捕获到错误代码块，已中止同步');
  process.exit(1);
}

if (!fs.existsSync(SKILL_FILE)) {
  console.error(
    '✖ 目标 SKILL.md 不存在（' +
      SKILL_FILE +
      '），无法同步。请检查 .codebuddy/skills/npc-team/ 目录是否完整'
  );
  process.exit(1);
}

const skillContent = fs.readFileSync(SKILL_FILE, 'utf8');
const fmMatch = skillContent.match(/^---\r?\n(?<fm>[\s\S]*?)\r?\n---\r?\n/);
if (!fmMatch) {
  console.error('✖ SKILL.md frontmatter 缺失，无法定位正文插入点');
  process.exit(1);
}
const frontmatter = fmMatch[0];

// description 一致性：sync 只维护正文，description 是 frontmatter 固定字段（人工维护）。
// 但 description 是 NPC 自动加载的唯一依据，若缺触发词则 Skill 静默不加载。
// 故 --check 模式须与 validate 第 11.1b 口径一致：description 缺触发词也视为不一致，exit 1。
// 规则单一源：scripts/lib/npc-team-triggers.js（与 validate 共用，防两处硬编码失同步）。
const fmText = fmMatch.groups.fm || '';
const descLine = fmText.match(/^description:\s*.+$/m);
const desc = descLine ? descLine[0] : '';
const { ok: descOk } = checkDesc(desc);
if (!descOk) {
  console.error(
    '✖ SKILL.md description 缺少必要触发词（npc-team / NPC_TEAM skill / 全流程语义 / 调用短语），' +
      'NPC 可能无法自动加载。请手动修正 description（sync 不自动改写 frontmatter）'
  );
  process.exit(1);
}

// 提取 skill 正文（去掉 frontmatter 与开头的说明段，起点为身份声明句）
const skillBody = skillContent.replace(frontmatter, '');
const bodyStart = skillBody.indexOf('你是「NPC Team 总指挥」，由官方免费');
if (bodyStart === -1) {
  console.error('✖ SKILL.md 缺少身份声明句，无法定位正文插入点');
  process.exit(1);
}
const preamble = skillBody.slice(0, bodyStart); // 说明段（保留）
const currentPrompt = skillBody.slice(bodyStart).trim();

// 第 10 轮评审 W2：normalize 去空白比较忽略「行首缩进」等纯格式差异（如 docs 缩进统一而 skill 未重新生成），
// 导致 --check 与 validate 的 formatDiff 结论不一致、且非 check 模式不修正缩进。
// 与 validate 保持同一口径（共享 scripts/lib/format-compare.js）：normalize 内容一致 + 行首缩进级一致才算「已是最新」。
if (normalize(currentPrompt) === normalize(prompt) && isFormatConsistent(currentPrompt, prompt)) {
  console.log('✅ NPC_TEAM Skill 已是最新，无需同步');
  process.exit(0);
}

if (CHECK_ONLY) {
  console.error('✖ NPC_TEAM Skill 与 docs 提示词不一致（--check 模式，已拒绝写入）');
  process.exit(1);
}

// 重写 SKILL.md：frontmatter + 说明段 + 最新提示词
const newSkill = frontmatter + preamble + prompt + '\n';
fs.writeFileSync(SKILL_FILE, newSkill);
console.log('✅ 已同步 docs/NPC_TEAM.md 提示词 → .codebuddy/skills/npc-team/SKILL.md');
