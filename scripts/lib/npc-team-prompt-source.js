'use strict';

/**
 * NPC Team 提示词正文的**唯一提取契约**（Issue #312 / PR #315 评审 K4 修复）。
 *
 * 背景：提示词正文此前被 3 个消费者各自实现提取正则（sync / validate-prompt / validate-bloat）。
 * 复制实现即「契约无主」——任一处锚点写法演进，其余两处会静默读到不同文本，
 * 这正是铁律 24「契约唯一」要杜绝的形态。
 *
 * 单一契约：
 *   - 锚点定义（PROMPT_ANCHOR）与提取正则（PROMPT_BLOCK_RE）唯一定义在本文件；
 *   - 三个消费者一律调用 extractPrompt()，禁止自行 new RegExp / 写 match 字面量；
 *   - 提取失败（锚点缺失/代码块不完整）统一返回 { ok:false, reason }，由调用方决定报错文案
 *     （避免「谁都可以静默跳过」——失败必须显式）。
 *
 * 用法：
 *   const { extractPrompt } = require('./lib/npc-team-prompt-source');
 *   const r = extractPrompt(content);
 *   if (!r.ok) throw new Error(r.reason);
 *   r.prompt   // 正文（已 trim）
 *   r.block    // 完整代码块（含 ```text 与锚点行）
 */

const PROMPT_ANCHOR = '# NPC_TEAM_PROMPT_START';

// 代码块正则：```text + 锚点行 + 正文 + ```
// 注意：正文用**惰性**匹配到第一个收尾 ```，避免跨块吞并。
// 锚点行后缀规则（QA F3 修复）：锚点 token 后**必须跟非标识符字符**，才允许行尾备注。
// 修复记录：原写法 `NPC_TEAM_PROMPT_START[^\n]*` 把「锚点 token」与「后续任意字符」混在一起，
// 于是 `# NPC_TEAM_PROMPT_START_BROKEN`（直接拼接的锚点变体）与
// `# NPC_TEAM_PROMPT_START（合法备注）` 无法区分 —— 「前缀相同、说明不同」的锚点变体会被静默接受，
// 守卫可能读到非权威块（本 PR 立命之本恰是「不许静默跳过」）。
// 现收紧为：锚点后须为「非 [A-Za-z0-9_-] 字符」（即真正的 token 边界）或行尾，之后才允许任意备注文字。
//   ✅ 合法（锚点后为行尾/非标识符字符）：`…_START`、`…_START（中文备注）`、`…_START <!-- 备注 -->`
//   ❌ 锚点变体（后接标识符字符，拒绝）：`…_START_BROKEN`（`_`）、`…_STARTV2`（`V`）
const PROMPT_BLOCK_RE = /```text\n# NPC_TEAM_PROMPT_START(?![A-Za-z0-9_-])[^\n]*\n([\s\S]*?)\n```/;
// 宽松匹配（仅用于诊断：判断「是否因锚点后缀形态非法而失败」，以便给出精确报错文案）
const PROMPT_BLOCK_LOOSE_RE = /```text\n#[^\n]*NPC_TEAM_PROMPT_START[^\n]*\n[\s\S]*?\n```/;

/**
 * @param {string} content docs/NPC_TEAM.md 全文
 * @returns {{ok:boolean, prompt:string, block:string, bodyStart:number, bodyEnd:number, reason?:string}}
 */
function extractPrompt(content) {
  const m = content.match(PROMPT_BLOCK_RE);
  if (!m) {
    // 诊断：若「宽松匹配」命中，说明锚点存在但**后缀非法**（如 `_BROKEN` / 追加了未白名单的备注）
    // ——必须显式报错而不是静默跳过，否则守卫会读到非权威块（QA F3）。
    const loose = PROMPT_BLOCK_LOOSE_RE.test(content);
    return {
      ok: false,
      prompt: '',
      block: '',
      bodyStart: -1,
      bodyEnd: -1,
      reason: loose
        ? `锚点行出现 ${PROMPT_ANCHOR} 但被直接拼接了标识符字符（疑似锚点变体，如 ` +
          `_BROKEN / V2）——锚点 token 后须为空白或非标识符字符，拒绝提取，防静默读到非权威块`
        : `未找到带锚点 ${PROMPT_ANCHOR} 的提示词代码块（锚点缺失或代码块不完整）`,
    };
  }
  const block = m[0];
  const blockStart = content.indexOf(block);
  // 正文起止：锚点行之后到收尾 ``` 之前（用于需要按偏移插入的场景，如变异自证测试）
  const bodyStart = blockStart + block.indexOf('\n', block.indexOf(PROMPT_ANCHOR)) + 1;
  const bodyEnd = blockStart + block.length - 3; // 去掉结尾的 ```
  return { ok: true, prompt: m[1].trim(), block, bodyStart, bodyEnd };
}

/**
 * 环节保护表（铁律 24 第 6 维「环节覆盖」的**唯一权威定义**，Issue #312 用户补充
 * 「每个环节都要有防腐和解耦意识」；阶段数随流水线演进，唯一真值 = 本表长度 STAGE_COUNT）。
 *
 * 契约唯一：环节数与每环节的判据关键词**只在本处定义一次**，
 * 由校验器（scripts/validate-npc-team-prompt.js 的 9.13 门禁）与守卫
 * （scripts/validate-npc-team-bloat.js 的 F1 断言）共同消费。
 * 背景（PR #317 评审 K2，Issue #314 i1 同构）：此前「12」在守卫 LIMITS、校验器 `n < 12`、
 * 校验器 STAGE_PROTECTION.length 三处各写一份 —— 新增/删除环节须同时改三处，
 * 漏改一处即两侧口径悄然分叉（契约无主）。
 */
const STAGE_PROTECTION = [
  ['1/13 深入分析', '需求边界不扩散'],
  ['2/13 拆解分派', '里程碑不预跑'],
  ['3/13 需求分析', '验收标准可核实'],
  ['4/13 方案设计', '先验证后设计'],
  ['5/13 开发', '最小必要改动'],
  ['6/13 评审', '只评 diff'],
  ['7/13 测试', '测试不入库'],
  ['8/13 需求覆盖度检查', '逐条需求不留白'],
  ['9/13 文档', '文档与代码同源'],
  ['10/13 PR 合并', '不看声明只核事实'],
  ['11/13 发布', '四要素无占位'],
  ['12/13 汇报', '只报已留痕事实'],
  ['13/13 复盘', '改进项当轮落成守卫'],
];

/** 环节数（唯一来源）= STAGE_PROTECTION.length；禁止调用方另写 12（PR #317 评审 K2）。 */
const STAGE_COUNT = STAGE_PROTECTION.length;

/**
 * 关键能力断言（唯一来源，Issue #383 QA-D1）。用户显式要求、且属核心能力的语义必须逐条出现在
 * **提示词块**（AI 实际执行的文本）中，否则「能力被删/被改写」无断言感知（铁律 24 第 7 维②，
 * 反例：QA-D1 实测「可一轮一轮盘清」原先只在散文里 ⇒ 删除门禁全绿）。判据 = `[能力名, 字面]`，**禁止在别处再写一份**。进度认领/防回退（Issue #395）同理纳入：认领、不得回退、回退须留痕、**用户授权的「例外可回退」及其优先级**（禁侧/例外侧对称覆盖，防只守禁侧致删例外仍全绿）。
 */
const CAPABILITY_ASSERTIONS = [
  ['1/13 深入分析可多轮盘清', '可一轮一轮盘清'],
  ['1/13 未盘清可再跑（多轮不前进）', '未盘清可再跑'],
  ['⏸CP0 分析确认暂停点', '⏸CP0 分析确认'],
  ['裸「继续」先认领下一步（不默认重跑）', '先按本 Issue 最新一条 NPC 评论的【接力卡】/任务书认领下一步'],
  ['已完成步骤不得回退重跑（真发现问题可回退）', '已完成步骤不得回退重跑'],
  ['回退须写明原因与依据', '回退原因 + 依据'],
  ['进度游标唯一定义（任务书已完成/当前步骤）', '进度游标'],
  ['防回退须保留例外（真发现问题可回退）', '**可以回退重跑**'],
  ['例外优先级高于「禁止再出 4/13 卡」（防自相矛盾）', '优先级高于「禁止再出 4/13 卡」'],
];

/** 每环节「本环节」保护行的字面量（守卫与校验器同一判据，PR #315 K4 教训：禁止各写一份）。 */
const STAGE_PROTECT_MARK = '本环节：';

/**
 * 按「 → 」把【流水线】段文本切成环节子句，返回 `stageSeg.split(' → ')` 的结果。
 * 单一契约：校验器的逐环节断言与守卫的计数**共享本函数**，避免「同一语义两套口径」
 * （PR #317 评审 K4：守卫在整段提示词计数、校验器在【流水线】段计数 → 段外插入「本环节：」两者分叉）。
 */
function splitPipelineSegments(stageSeg) {
  return String(stageSeg || '').split(' → ');
}

/**
 * 统计「本环节：」保护行声明数（子串次数）。**唯一实现**，供守卫 F1 与校验器共用
 * （范围固定为传入的【流水线】段，杜绝两侧范围不一致）。
 *
 * 注意：这是**字面计数**，仅作与「环节数」的粗对照；结构度量请用 countCoveredStages
 * （PR #317 评审 F3：不变量层级偏低 —— 用字面计数易被「说明行含同字面」干扰）。
 */
function countStageProtection(stageSeg) {
  return (String(stageSeg || '').match(new RegExp(STAGE_PROTECT_MARK, 'g')) || []).length;
}

/**
 * **声明计数（环节子句内）**：统计出现在「环节子句段」（同段含 `防腐=` 判据签名）内的
 * 「本环节：」声明数。
 *
 * PR #317 评审 F5+F6 合取修订：单纯的字面全局计数会**同时**把「说明行提到『本环节：』」（F3 误报）
 * 与「计划外环节段」（F5 真膨胀）算作 13。区分二者的结构特征 = **该声明是否位于一个环节子句段内**
 * （子句段以 `防腐=` 为签名）。故「环节膨胀」判定用本函数（只数子句内的声明），
 * 说明行同字面不计入（F3 绿），计划外环节段计入（F5 红）。
 */
function countStageDecls(stageSeg) {
  return splitPipelineSegments(stageSeg).filter(s => s.includes('防腐=')).length;
}

/**
 * **结构度量**：实际被覆盖（子句齐备：有「本环节」标记 + 判据关键词）的环节数。
 *
 * PR #317 评审 F3：把 F1 的不变量由「『本环节：』子串出现次数」升级为「按 ` → ` 子句解析后
 * 真实覆盖的环节数」——结构度量不受说明行/文案里的同字面干扰，名（环节覆盖数）与实同义。
 * 唯一实现，守卫 F1 与校验器 9.13 共用。
 */
function countCoveredStages(stageSeg) {
  return checkStageProtection(stageSeg).filter(r => r.ok).length;
}

/**
 * 逐环节校验：从**环节自身子句**（` → ` 切分后的那一段）内查「本环节」标记与判据关键词。
 *
 * 修复 PR #317 评审 K1（逃生口）：原实现用 `new RegExp(stage + '[^\n]*本环节[^\n]*key')` 匹配整段
 * 【流水线】——而 12 个环节全写在**同一行**，`[^\n]*` 在单行内无界，于是某环节的正则可以
 * 向后跨到后续环节的子句里取关键词（删掉本环节子句、把关键词搬到下一环节、再补 decoy 即可放行）。
 * 现改为**先按 ` → ` 切分子句**，只在「以本环节名开头的那个子句」内断言标记与关键词，
 * 关键词无法跨环节借位。
 *
 * @returns {Array<{stage:string, key:string, ok:boolean, reason?:string}>}
 */
function checkStageProtection(stageSeg) {
  const segs = splitPipelineSegments(stageSeg);
  const out = [];
  for (const [stage, key] of STAGE_PROTECTION) {
    const idx = segs.findIndex(s => s.includes(stage));
    if (idx === -1) {
      out.push({ stage, key, ok: false, reason: 'missing-stage' });
      continue;
    }
    // 环节子句 = 「环节名段」+ 紧随其后的「本环节：…」段（提示词结构为 `stage → 本环节：… → 下一 stage`）。
    // **不向后多取一段**：否则关键词仍可跨到下一环节（评审 K1 逃生口）。
    const clause = segs[idx + 1] || '';
    if (!clause.includes('本环节')) {
      out.push({ stage, key, ok: false, reason: 'missing-mark' });
      continue;
    }
    if (!clause.includes(key)) {
      out.push({ stage, key, ok: false, reason: 'missing-key' });
      continue;
    }
    out.push({ stage, key, ok: true });
  }
  return out;
}

module.exports = {
  extractPrompt,
  PROMPT_ANCHOR,
  PROMPT_BLOCK_RE,
  PROMPT_BLOCK_LOOSE_RE,
  STAGE_PROTECTION,
  STAGE_COUNT,
  CAPABILITY_ASSERTIONS,
  STAGE_PROTECT_MARK,
  splitPipelineSegments,
  countStageProtection,
  countStageDecls,
  countCoveredStages,
  checkStageProtection,
};
