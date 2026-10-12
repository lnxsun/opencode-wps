#!/usr/bin/env node
/**
 * 校验 docs/NPC_TEAM.md 提示词的结构完整性、逻辑一致性与零积分原则
 *
 * 背景：NPC Team 提示词是 Issue #76 的核心交付物（零积分方案）。
 * 一旦角色卡片缺失、阶段编号错乱、或「零积分/不召唤自建 NPC」红线被误删，
 * 用户粘贴后 CodeBuddy 可能行为失控（如真的去召唤自建 NPC → 消耗积分）。
 * 本脚本在 CI 中执行，作为提示词质量的回归防线。
 *
 * 用法：node scripts/validate-npc-team-prompt.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { normalize } = require('./lib/normalize');
const { formatDiff } = require('./lib/format-compare');
const {
  checkDesc,
  checkDescAgainstDocs,
  checkDescStageNumbers,
} = require('./lib/npc-team-triggers');
const {
  extractPrompt,
  STAGE_COUNT,
  CAPABILITY_ASSERTIONS,
  STAGE_PROTECT_MARK,
  checkStageProtection,
  countStageProtection,
  countStageDecls,
  countCoveredStages,
} = require('./lib/npc-team-prompt-source');

const FILE = path.resolve(__dirname, '../docs/NPC_TEAM.md');
const errors = [];
const warnings = [];

const content = fs.readFileSync(FILE, 'utf8');

// ---- 1. 提取提示词代码块（单一契约：scripts/lib/npc-team-prompt-source.js，禁止本文件再写提取正则）----
const promptSource = extractPrompt(content);
if (!promptSource.ok) {
  errors.push('未找到带锚点 # NPC_TEAM_PROMPT_START 的提示词代码块（核心交付物缺失或锚点被删）');
} else {
  const prompt = promptSource.prompt;
  // ⚠️ Issue #383 整改（C1 阶段数单源化）：原实现把「12」硬编码在三处 —— `(?:^|[^0-9/])${i}\\/12` 正则以
  // 及 `for (let i = 1; i <= 12; i++)` 循环上界。STAGE_COUNT 是唯一真值却**绕过了它** ⇒ 改阶段数须手改三处。
  // 现一律派生自 lib 的 STAGE_COUNT（M = 阶段总数），提示词内**不得**再出现手写的阶段总数。
  const M = STAGE_COUNT;
  const stageIdRe = i => new RegExp(`(?:^|[^0-9/])${i}\\/${M}(?:[^0-9]|$)`);
  // 【流水线】段定位专用：阶段行**必须以 `N/M` 开头** —— 上面的通用正则会命中正文里任意位置出现的
  // `13/13`（如铁律 10「13/13 复盘」），若用它取段起点会取到别处（实测取到铁律行 → 段内 0 环节覆盖）。
  const pipelineLineRe = () => new RegExp(`^1\\/${M}(?!\\d)`);
  // 区间式段派生（用于「段内含以【开头的子卡/子块」的多行段）：head 起，到 headFrag 出现前一行止。
  const sectionBetween = (head, nextHead) => {
    const i = PROMPT_LINES.findIndex(l => l.startsWith(head));
    if (i === -1) return null;
    const j = PROMPT_LINES.findIndex((l, k) => k > i && l.startsWith(nextHead));
    return j === -1 ? null : PROMPT_LINES.slice(i, j).join('\n');
  };
  // 合并确认卡段头（唯一字面量来源；Issue #383：随阶段数派生，不再手写 8/12、9/12）
  const MERGE_CARD_HEAD = `【合并确认卡（⏸CP3：${M - 4}/${M} 文档后、${M - 3}/${M} 合并前，待用户确认合并）】`;
  // 段锚点派生（同「阶段数单源」口径）：[流水线] 段 = 含 `1/${M}` 阶段行的行；[任务书] 段 = 其后首个以【开头的行。
  // 派生式定位取代手写段落标题字面量 —— 改阶段数/改段名不需同步改校验器锚点（原为同步点之一）。
  const PROMPT_LINES = prompt.split('\n');
  // 段落派生 helper（Issue #383 单一化）：段 =「以 `【…` 开头的那一行」起，到**下一个以 `【…` 开头的行之前**的连续块。
  // 取代原先散落 3 处的 `prompt.match(/^【XX…\n([\s\S]*?)(?=\n【|$)/m)` —— 该正则在 `m` 标志下 `$` 匹配行尾，
  // 惰性量词会**立刻收尾于首行末**（实测段内容只捕获 1 行 → 角色卡片校验全部误报）。
  // 行式派生不受此影响，且改段名/加段不需同步改锚点。
  const sectionOf = head => {
    const i = PROMPT_LINES.findIndex(l => l.startsWith(head));
    if (i === -1) return null;
    let j = i + 1;
    while (j < PROMPT_LINES.length && !PROMPT_LINES[j].startsWith('【')) j++;
    // body = 段头行**之后**的内容（用于「段内容」断言）；full = 含段头行（用于段头行即承载内容的卡，如合并确认卡）。
    return {
      full: PROMPT_LINES.slice(i, j).join('\n'),
      body: PROMPT_LINES.slice(i + 1, j).join('\n'),
      startLine: i,
      endLine: j,
    };
  };
  const pipelineLineIdx = PROMPT_LINES.findIndex(l => pipelineLineRe().test(l));
  const bookLineIdx = PROMPT_LINES.findIndex((l, i) => i > pipelineLineIdx && /^【/.test(l));
  if (pipelineLineIdx === -1) {
    errors.push(`提示词缺少【流水线】段（未找到含 1/${M} 阶段行的段）`);
  } else {
    const pipelineSection = PROMPT_LINES.slice(pipelineLineIdx, bookLineIdx).join('\n');
    {
      let lastIdx = -1;
      for (let i = 1; i <= M; i++) {
        const mm = stageIdRe(i).exec(pipelineSection);
        if (!mm) {
          errors.push(`阶段编号 ${i}/${M} 缺失（${M} 阶段流水线不完整，【流水线】段未包含该节点）`);
          break;
        }
        if (mm.index < lastIdx) {
          errors.push(`阶段编号 ${i}/${M} 顺序错乱（【流水线】段节点未按 1/${M}→${M}/${M} 递增排列）`);
          break;
        }
        lastIdx = mm.index;
      }
    }
  }

  if (prompt.length < 500)
    errors.push('提示词过短（不足 500 字符），疑似捕获到错误代码块，请检查锚点位置');

  // 提示词代码块应包含暂停确认段（【暂停确认】）
  if (!/【暂停确认】/.test(prompt))
    errors.push('提示词缺少「【暂停确认】」段（暂停卡格式说明缺失）');

  // ---- 2. 身份声明 ----
  if (!/NPC Team 总指挥/.test(prompt)) warnings.push('提示词缺少「NPC Team 总指挥」身份声明');
  if (!/官方 CodeBuddy|CodeBuddy 化身/.test(prompt))
    errors.push('提示词缺少「由官方 CodeBuddy 化身」声明');

  // ---- 3. 7 位专家角色卡片（强校验：必须在【角色卡片】段内逐行匹配到每张卡片行）----
  // 避免「开发/评审/测试」等词在流水线正文高频出现导致的弱校验误放行：
  // 要求卡片行格式「emoji 缩写：」或「全称：」，且必须位于【角色卡片】段内。
  const cardSeg = sectionOf('【角色卡片');
  if (!cardSeg) {
    errors.push('提示词缺少「【角色卡片】」段');
  } else {
    const cards = cardSeg.body;
    // 卡片行格式（Issue #383 角色卡片统一形状后）：`<emoji> <缩写>｜职责=…｜输入=…｜输出=…｜纪律=…`
    // 兼容旧写法（`<emoji> <缩写>：`）以免未来小改即误拦；两种形态都以「emoji + 缩写 + 分隔符」为锚。
    const requiredCards = [
      { key: '项目经理 PM', re: /🎯\s*PM\s*[｜：:]/ },
      { key: '产品经理 PO', re: /📋\s*PO\s*[｜：:]/ },
      { key: '架构师 ARCH', re: /🏗️?\s*ARCH\s*[｜：:]/ },
      { key: '全栈开发 DEV', re: /💻\s*DEV\s*[｜：:]/ },
      { key: '代码评审员 CR', re: /🔍\s*CR\s*[｜：:]/ },
      { key: '测试工程师 QA', re: /🧪\s*QA\s*[｜：:]/ },
      { key: '研究员 RES', re: /🔬\s*(?:研究员\s*)?RES\s*[｜：:]/ },
    ];
    for (const c of requiredCards) {
      if (!c.re.test(cards))
        errors.push(`角色卡片缺失：${c.key}（需在【角色卡片】段内存在对应卡片行）`);
    }
    // R6-1 修复：QA 卡片需求覆盖度检查职责（与主链检查环节、工作流程同步），
    // 防 QA 角色卡片未同步需求覆盖度/⏸CP2.5 职责而 CI 不拦截（角色职责与执行流程脱节）。
    if (!/QA｜.*需求覆盖度检查/s.test(cards))
      errors.push('角色卡片 QA 缺少需求覆盖度检查职责（须含：测试通过后做需求覆盖度检查）');
  }

  // ---- 4. 零积分红线 ----
  if (!/零积分|不召唤任何自建 NPC|不消耗积分/.test(prompt)) {
    errors.push('缺少零积分红线声明（全程不召唤自建 NPC）');
  }

  // CR 第 11 轮修复（R1）：原 includes 子串校验有双重逃生口（① '1/12' 命中 11/12；② 删【流水线】段节点后
  // 仍被暂停卡字面量掩盖）。故限定【流水线】段内做 1..N 全序出现校验（词边界 + indexOf 递增）。
  //
  // ---- 阶段数单源化的**反向断言**（Issue #383 C1 评审 CR2-1 根因修复）----
  // 病灶：C1 首版只把**判据表达式**改为派生 `M`，**错误文案/注释里的 `${N}/12` 字面量**未同步 ⇒
  //   阶段数一改，「提示 9/12 合并前暂停」会把 AI 引到**不存在的步骤**（与本Issue 要消灭的
  //   「阶段数未单源化」同一病灶，只是从判据层挪到文案层）。
  // 判据（**行为性**，不靠人工记得同步）：本校验器**自身源码**内不得再出现 `/12` 形态的阶段号字面量；
  //   唯一合法写法是派生式 `${...}/${M}` 或模板串 `1/${M}`。判红文案须点名行号，便于直接定位。
  //   ⚠️ 只扫**本文件**（守卫/契约模块的同类字面量由 scripts/validate-npc-team-bloat.js 的 F1 环节覆盖与
  //   本条同口径承担；此处不跨文件扫，避免与轴 I 归属池重叠）。
  // GATE_383_SELF_BEGIN
  // 判据口径（名实一致）：只扫**可执行行**（剔注释与空行）——注释里说明「本条判据拦 /12 字面量」
  // 属正常表述，不构成缺陷；被扫对象是「会随阶段数变化而给出误导文案的字符串」。
  {
    const stripComment = l => {
      const t = l.trim();
      return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : l;
    };
    const selfLines = fs.readFileSync(__filename, 'utf8').split('\n');
    // 自指豁免：本条判据**自身**必然出现 `/12` 形态（正则字面量与报错文案），
    // 用「本条判据的代码块行区间」显式排除（不是按内容猜，避免「加个注释即绕过」）。
    // 哨兵检索：从**注释行**（`// GATE…`）里取，避免命中本条检索代码自身（它含同样字面量）。
    const sentinel = tag => selfLines.findIndex(l => l.trim() === `// GATE_383_SELF_${tag}`);
    const selfBlockStart = sentinel('BEGIN');
    const selfBlockEnd = sentinel('END');
    const offenders = [];
    selfLines.forEach((l, i) => {
      if (selfBlockStart !== -1 && i >= selfBlockStart && i <= selfBlockEnd) return;
      const code = stripComment(l);
      if (code && /\/12(?![0-9])/.test(code)) offenders.push(`第 ${i + 1} 行`);
    });
    if (offenders.length > 0)
      errors.push(
        `阶段数单源化残留：本校验器**可执行行**仍出现 /12 形态的阶段号字面量（${offenders.slice(0, 5).join('、')}` +
          `${offenders.length > 5 ? ` 等 ${offenders.length} 处` : ''}）——` +
          `阶段号一律写派生式（Issue #383 C1；评审 CR2-1）`
      );
  }
  // GATE_383_SELF_END

  // 历史 10 阶段编号（0/10~9/10）不应残留（先剔除评审轮次计轮 R/10、R+1/10 的合法用法，再检查）
  // 说明：当前提示词已改 1/12~12/12 编号且评审轮次改为「第 R 轮」描述，R/10、R+1/10 模式不再出现，
  // 但保留此剔除作为防御性逻辑——防止未来旧编号重新引入或历史计轮描述重新出现时误判为 0/10~9/10 残留。
  const withoutReviewRounds = prompt.replace(/R\+1\/10/g, '').replace(/R\/10/g, '');
  for (let i = 0; i <= 9; i++) {
    if (new RegExp(`(?:^|[^0-9/])${i}\\/10(?:[^0-9]|$)`).test(withoutReviewRounds))
      errors.push(`阶段编号 ${i}/10 残留（历史编号未清理；现行编号为 1/${M}~${M}/${M}）`);
  }

  // 流水线关键阶段覆盖
  const stages = [
    '需求',
    '拆解',
    '分析',
    '设计',
    '开发',
    '评审',
    '测试',
    '文档',
    '合并',
    '发布',
    '汇报',
    '复盘',
  ];
  for (const s of stages) {
    if (!prompt.includes(s)) warnings.push(`流水线可能缺少「${s}」阶段`);
  }

  // ---- 6. 角色切换卡 ----
  if (!/角色切换/.test(prompt)) warnings.push('缺少「角色切换卡」格式说明');

  // ---- 7. 硬性规则 ----
  if (!/安全红线|敏感信息|凭据/.test(prompt))
    errors.push('缺少安全红线（禁输出 Token/密码/密钥、禁硬编码凭据）');
  if (!/诚实|不编造|如实/.test(prompt)) warnings.push('缺少诚实汇报规则（不编造测试结果）');
  if (!/省 Token|不重复/.test(prompt)) warnings.push('缺少省 Token/增量输出规则');
  if (!/语言/.test(prompt)) warnings.push('缺少语言匹配规则');

  // ---- 8. 暂停确认机制（Issue #76 补充：人工确认防跑偏）+ 合并确认（⏸CP3）----
  // 两个开发暂停点必须以完整定义存在：⏸CP1 计划确认 / ⏸CP2 开发确认
  // （用完整词而非子串，避免「到 ⏸CP1/⏸CP2 时输出暂停卡」这类引用句被误算为暂停点声明）
  // 三个暂停点（CP1/CP2/CP3）以表驱动统一校验（同一形态收敛，避免逐点重复展开）
  for (const [pt, why] of [
    ['⏸CP0 分析确认', '深入分析后须等用户确认「盘清了」才进拆解'],
    ['⏸CP1 计划确认', '人工确认防跑偏机制缺失'],
    ['⏸CP2 开发确认', '人工确认防跑偏机制缺失'],
    ['⏸CP2.5 需求覆盖确认', '需求覆盖度检查后须暂停待用户确认全覆盖'],
    ['⏸CP3 合并确认', 'PR 合并前须暂停待用户确认，禁止未确认就合并'],
  ])
    if (!prompt.includes(pt)) errors.push(`缺少暂停点「${pt}」（${why}）`);
  // ---- 评审 CR5-1：暂停卡**内容**强校验（防「保留标题、掏空含义」）----
  // 原实现：5 个暂停点只做**存在性**断言（`for (const [pt, why] of [...])`），
  // 只有 ⏸CP2 另有「命令三选一」内容校验 ⇒ 其余 4 点可被「保留标题、清空说明」绕过（口径不一致）。
  // 本条把内容校验**表驱动**化（与暂停点表同形，不再逐点手写 if）。
  for (const [head, mustContain] of [
    ['【暂停·CP0 分析确认】', ['确认分析无遗漏', '用户命令三选一']],
    ['【暂停·CP1 计划确认】', ['里程碑表', '其余同上三选一']],
    ['【暂停·CP2.5 需求覆盖确认】', ['需求覆盖度矩阵', '用户确认需求全覆盖后才进入文档']],
  ]) {
    const seg = sectionOf(head);
    if (seg === null) {
      errors.push(`缺少暂停卡模板「${head}」（全程模式强制暂停点须有输出模板）`);
      continue;
    }
    const missing = mustContain.filter(f => !seg.full.includes(f));
    if (missing.length > 0)
      errors.push(
        `暂停卡「${head}」内容不完整（缺：${missing.join('、')}）——防「保留标题、掏空含义」`
      );
  }

  // CR 第 13 轮修复（追加 9 轮循环 R3）：仅校验「⏸CP2 开发确认」字样可被流水线段引用命中，
  // 但【暂停确认】段的【暂停·CP2 开发确认】模板被删时 CI 不拦截。故强校验模板段存在。
  if (!prompt.includes(`【暂停·CP2 开发确认】（5/${M} 后）已完成：1/${M}→5/${M} 开发（PR 已建）`))
  // CR 第 14 轮修复（追加 9 轮循环 R4）：
  // ① 暂停确认引导语须明确 CP1/CP2 → 暂停卡、CP3 → 合并确认卡（此前「⏸CP1/⏸CP2/⏸CP3 时输出暂停卡」
  //    把 CP3 也归为暂停卡，与铁律 13/合并确认卡模板矛盾，CodeBuddy 可能输出通用暂停卡而非合并确认卡）；
  // ② CP2 模板内容强校验（命令三选一完整 + 已完成行），防模板与暂停确认表/工作流程漂移。
  if (!/到 ⏸CP0\/⏸CP1\/⏸CP2\/⏸CP2\.5 时输出暂停卡并停下；到 ⏸CP3 时输出【合并确认卡】/.test(prompt))
    errors.push(
      '暂停确认引导语未区分 CP3 输出（须为：到 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 时输出暂停卡；到 ⏸CP3 时输出【合并确认卡】）'
    );
  const cp2Section = prompt.match(/【暂停·CP2 开发确认】[\s\S]*?(?=\n【合并确认卡|$)/);
  if (
    cp2Section !== null &&
    (!cp2Section[0].includes('「继续」→ 确认实现方向正确') ||
      !cp2Section[0].includes('「补充：<意见>」→ 结合意见修正当前产物后继续') ||
      !cp2Section[0].includes('「停止」→ 终止后续阶段'))
  )
    errors.push(
      '暂停卡模板【暂停·CP2 开发确认】命令三选一不完整（须含：继续→确认实现方向正确 / 补充：<意见>→修正后继续 / 停止→终止）'
    );

  // 三个命令词必须以完整形式存在（「继续」「补充：<意见>」「停止」），防止子串误放行
  const cmds = [
    { name: '「继续」', re: /「继续」/ },
    { name: '「补充：<意见>」', re: /「补充：<意见>」|「补充：/ },
    { name: '「停止」', re: /「停止」/ },
  ];
  for (const c of cmds) {
    if (!c.re.test(prompt)) errors.push(`缺少用户命令词 ${c.name}（暂停确认三命令不完整）`);
  }
  // 铁律：禁止代替用户确认（反幻觉红线），要求完整句式
  if (!/禁止代替用户确认、禁止假装已确认/.test(prompt))
    errors.push('缺少暂停确认铁律（禁止代替用户确认、禁止假装已确认）');
  if (!/收到命令前不得输出下一阶段内容/.test(prompt))
    errors.push('缺少暂停确认铁律（未获命令不放行，收到命令前不得输出下一阶段内容）');

  // ---- 9. 真实执行与循环门禁（Issue #76 补充：防假装执行/防流于形式）----
  // 9.1 每步真实执行 + 留痕（禁止假装执行、禁止无痕迹宣称完成）
  // 强校验：锁定铁律 7 的反幻觉细节（可核实痕迹 + 不存在的模拟器/测试谎报）+ 特有表述「可见回复/记录」，
  // 防"编造全绿"红线被删只留"禁止假装执行"空壳。注：文档工作流程/门禁表另有"留下可核实痕迹"等价表述，
  // 故此处强校验铁律 7 特有的「可见回复/记录」句式，确保铁律 7 自身受控。
  const RULE7_ANTI_HALLUCINATION = ['可核实', '谎报', '可见回复/记录'];
  if (!/禁止假装执行/.test(prompt))
    errors.push('缺少「禁止假装执行」铁律（每步必须单独真实执行并留痕）');
  if (!/留下.{0,60}痕迹|可核实.{0,60}痕迹|可被第三方核实/.test(prompt))
    errors.push('缺少「留痕检查」要求（每阶段须在 Issue/PR 留下可核实痕迹）');
  for (const frag of RULE7_ANTI_HALLUCINATION) {
    if (!prompt.includes(frag))
      errors.push(
        `铁律 7 缺少反幻觉细节「${frag}」（防"编造测试全绿"：不得无痕迹宣称完成/不得用不存在的模拟器谎报结果）`
      );
  }
  // 9.2 评审-修复循环至问题清零（要求"循环"与"清零"同时出现，避免被"全部修复"单点绕过）
  if (!/循环.{0,40}清零|清零.{0,40}循环/.test(prompt))
    errors.push('缺少「评审-修复循环直至问题清零」门禁（须同时含"循环"与"清零"语义）');
  if (!/复评|修复后.*复评/.test(prompt))
    errors.push('缺少「修复后复评」要求（评审发现问题须修复后复评）');
  // 9.2.1 10 轮彻底 review-修复循环（Issue #76 补充：每步（评审/修复/复评）均须在 PR 分别回复留痕，留痕以「每步」为粒度而非「每轮」，禁止跳过任何一步假装进行）
  // 强校验：锁定铁律 8 完整句式（防 OR 正则逃生口——铁律 8 核心约束被删光、仅靠 CR 卡片等残留"分别回复"字样仍放行）
  // 已知局限（第 6 轮评审记录）：includes 子串校验防"删约束"，但防不了"保留字面量改写语义"（插入干扰文本拆解语义）。
  // 因此叠加**顺序校验**：要求 7 个子串在提示词中按声明顺序递增出现，拦截"打乱顺序/插入拆解"类改写。
  const RULE8_CORE = [
    `6/${M} 至少进行 10 轮彻底的 PR review 与修复循环`,
    '评审轮数不得以简单为由缩减',
    '循环执行直至问题清零',
    '每一步（评审棒 / 修复棒 / 复评棒）都必须在 PR 中分别回复留痕',
    '留痕以「每步」为粒度而非「每轮」',
    '绝不允许跳过任何一步假装进行',
    // A1/A2 整改（Issue #383）：原另有一句「不得以简单可缩为名跳轮偷懒」与「评审轮数不得以简单为由缩减」
    // 同义复述——同一约束在同条铁律内说两遍即腐肉（C1 同族），本次整改删除冗余复述，保留唯一表述。
  ];
  let lastIdx = -1;
  for (const frag of RULE8_CORE) {
    const idx = prompt.indexOf(frag);
    if (idx === -1)
      errors.push(`铁律 8 缺少完整句式「${frag}」（10 轮循环必须真实逐轮执行，防 OR 正则逃生口）`);
    else if (idx < lastIdx)
      errors.push(
        `铁律 8 句式顺序错乱：「${frag}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
      );
    else lastIdx = idx;
  }
  // 9.3 测试失败跳转重跑（三段式强校验：失败 + 跳回 + 重新执行，避免单宽松正则误放行）
  if (!/不通过|失败/.test(prompt))
    errors.push('缺少「测试失败跳转重跑」门禁（缺少"验收不通过/失败"语义）');
  if (!/跳回|回退|回.*重新执行|跳转到之前|跳到之前/.test(prompt))
    errors.push('缺少「测试失败跳转重跑」门禁（缺少"跳回/回退"语义）');
  if (!/重新执行|重新跑|重跑/.test(prompt))
    errors.push('缺少「测试失败跳转重跑」门禁（缺少"重新执行/重跑"语义）');
  // 9.4 充分复盘四要素
  if (!/根因|怎么造成|原因/.test(prompt)) errors.push('缺少复盘要素①「问题是怎么造成的（根因）」');
  if (!/教训/.test(prompt)) errors.push('缺少复盘要素②「应吸取什么教训」');
  if (!/避免.*再发生|避免类似问题|预防/.test(prompt))
    errors.push('缺少复盘要素③「后续如何避免类似问题（预防机制）」');
  if (!/措施|加固/.test(prompt)) errors.push('缺少复盘要素④「采取什么措施（加固动作）」');

  // ---- 9.5 6 个改造点门禁（Issue #147 补充：暂停点不静默跳过 / 自动接续 / 留痕粒度强化 / 评审范围纪律）----
  // 改造点 1：暂停点任何模式不得静默跳过
  if (!/任何模式不得静默跳过/.test(prompt))
    errors.push(
      '缺少「暂停点不得静默跳过」门禁（铁律 6：无论接力/全程/自动连续模式，到 CP1/CP2/CP3 必须停下等用户命令）'
    );
  // 改造点 2：未设暂停点自动接续
  // 铁律 11 澄清自动接续时也会出现「未设 ⏸CP 暂停点的步骤…自动触发下一步」，为避免与铁律 11
  // 澄清句形成误命中（负向回归：删除运行模式自动接续句后，仅凭铁律 11 的澄清句仍能通过门禁），
  // 将门禁锚定到运行模式独有的「无需用户逐棒手动复制召唤话术」短语，确保门禁只校验运行模式原句。
  // 注：门禁依赖该单一锚点短语，属正则门禁固有取舍；若未来该短语被改写，需同步更新本门禁正则及
  // tests 负向回归用例（见「删运行模式…应拦截」）。
  if (!/未设 ⏸CP 的步骤由系统按接力卡自动触发下一步，用户无需逐棒复制召唤话术/.test(prompt))
    errors.push(
      '缺少「未设暂停点自动接续」门禁（运行模式：未设 ⏸CP 的步骤由系统自动触发下一步，无需用户逐棒手动复制召唤话术；用户可在暂停点确认/纠正/停止）'
    );
  // 改造点 3：每步留痕粒度强化（评审棒/修复棒/复评棒独立留痕，缺任一步即视为假装执行）
  if (
    !/评审-修复循环中，评审棒\/修复棒\/复评棒每一步各自独立留痕，缺任一步即视为假装执行/.test(
      prompt
    )
  )
    errors.push(
      '缺少「每步留痕粒度强化」门禁（铁律 7：评审棒/修复棒/复评棒每一步各自独立留痕，缺任一步即视为假装执行）'
    );
  // 改造点 5：评审范围纪律（只评 PR diff 新增/改动行，不泛化）
  if (!/只评审 PR diff 新增.{0,20}改动行|只评 PR diff 新增.{0,20}改动行/.test(prompt))
    errors.push(
      '缺少「评审范围纪律」门禁（铁律 15/CR 卡片：只评审 PR diff 新增/改动行，不得评审历史代码/无关文件/发表与 diff 无关的泛化意见）'
    );
  // 改造点 5 联动：RES 定位问题只能针对 PR diff 范围内代码
  if (!/RES 定位问题只能针对 PR diff 范围/.test(prompt))
    errors.push(
      '缺少「RES 定位范围纪律」门禁（铁律 15：RES 定位问题只能针对 PR diff 范围内的代码，不得借调研之名泛化到无关模块）'
    );
  // 改造点 4：新增🔬研究员 RES 角色（角色卡片已 7 张强校验，此处再校验 RES 介入流水线）
  if (!/🔬 RES｜职责=深入分析主持、需求背景调研/.test(prompt))
    errors.push(
      '缺少「研究员 RES 角色」声明（第 7 位专家：需求背景调研、问题根因定位、方案可行性研究）'
    );
  // 补充（Issue #147 用户补充）：RES 角色介入评审环节（6/M）——RES 须独立执行研究员视角评审并单独留痕，
  // 缺独立留痕即视为 RES 未介入（假介入）。阶段号派生自 M（Issue #383 C1）。
  if (
    !/🔬 RES｜职责=深入分析主持、需求背景调研/.test(prompt) ||
    !prompt.includes(`6/${M} 必须独立执行研究员视角评审并以「🔬 RES 研究员评审」单独留痕于 PR`)
  )
    errors.push(
      '缺少「RES 评审环节介入独立留痕」声明（角色卡片：RES 须独立执行研究员视角评审并单独留痕，缺独立留痕即视为假介入）'
    );
  if (!/「🔬 RES 研究员评审」/.test(prompt))
    errors.push(
      `缺少「RES 研究员评审独立留痕锚点」门禁（RES 在 ${M - 7}/${M} 的评审结论须以「🔬 RES 研究员评审」独立留痕于 PR）`
    );
  // 改造点 6：N 轮评审-修复循环验收标准（有效下限 = max(10, 用户指定 N)）
  if (!/有效下限 = max\(10, 用户要求 N\)/.test(prompt))
    errors.push(
      '缺少「N 轮评审-修复验收标准」门禁（铁律 8：有效下限 = max(10, 用户要求 N)，可核实验收）'
    );

  // ---- 9.8 十四条质量红线纪律门禁（Issue #147：防「垒屎山」铁律 16~18）----
  // 思维纪律（铁律 16）：充分分析根因 / 方案切实可行须求证 / 评审整改实事求是 / 逻辑清晰无矛盾兜底
  if (!/充分分析需求或定位问题.{0,30}真正原因/.test(prompt))
    errors.push(
      '缺少「思维纪律-充分分析」门禁（铁律 16：充分分析需求或定位问题真正原因，不能假装分析）'
    );
  if (!/方案应切实可行，不能想当然.{0,40}充分求证/.test(prompt))
    errors.push('缺少「思维纪律-方案求证」门禁（铁律 16：方案应切实可行，动手前须充分求证）');
  if (!/每一轮都要.{0,20}充分发现问题/.test(prompt))
    errors.push(
      '缺少「思维纪律-评审实事求是」门禁（铁律 16：每一轮都要充分发现问题，不能假装凑数）'
    );
  if (!/自相矛盾的兜底/.test(prompt))
    errors.push('缺少「思维纪律-逻辑清晰」门禁（铁律 16：不做自相矛盾的兜底）');
  // 改动纪律（铁律 17）：最小必要改动 / 小型原子化 PR / 无关问题单独拆 issue / 用户可见变更更新 docs
  if (!/最小必要改动.{0,20}不盲目扩大/.test(prompt))
    errors.push('缺少「改动纪律-最小必要改动」门禁（铁律 17：做最小必要改动，不盲目扩大）');
  if (!/小型的、原子化的 PR/.test(prompt))
    errors.push(
      '缺少「改动纪律-原子化 PR」门禁（铁律 17：采取小型原子化 PR，必要时一个 issue 拆为多个 PR）'
    );
  if (!/单独拆 issue 及 PR/.test(prompt))
    errors.push('缺少「改动纪律-无关问题单独拆」门禁（铁律 17：无关问题单独拆 issue 及 PR）');
  if (!/更新.{0,10}\/docs 目录中的相关文档/.test(prompt))
    errors.push('缺少「改动纪律-更新 docs」门禁（铁律 17：用户可见变更须更新 /docs 文档）');
  // 文档阶段按当次需求同步修改完善项目相关文档（Issue #147 补充；阶段号派生自 M，Issue #383 C1）
  if (!prompt.includes(`${M - 4}/${M} 文档(DEV+PO)`))
    errors.push(
      `缺少「${M - 4}/${M} 文档」流水线落点（文档阶段须按本次需求/整改同步修改完善项目相关文档）`
    );
  // 测试纪律（铁律 18）：充分测试逐条真测 / 单测+集成测试 / preflight / format / lint
  if (!/逐条.{0,10}真测/.test(prompt))
    errors.push('缺少「测试纪律-逐条真测」门禁（铁律 18：逐条真测，禁止假装测试/空断言）');
  if (!/单元测试.{0,30}集成测试/.test(prompt))
    errors.push('缺少「测试纪律-单测+集成测试」门禁（铁律 18：必须执行单元测试与集成测试）');
  if (!/npm run preflight/.test(prompt))
    errors.push('缺少「测试纪律-preflight」门禁（铁律 18：提交 PR 前必须运行 npm run preflight）');
  if (!/npm run format/.test(prompt))
    errors.push('缺少「测试纪律-format」门禁（铁律 18：用 npm run format 格式化代码）');
  if (!/npm run lint/.test(prompt))
    errors.push('缺少「测试纪律-lint」门禁（铁律 18：用 npm run lint 检查代码）');
  if (!/暂未建立的测试.{0,20}单独开 issue/.test(prompt))
    errors.push('缺少「测试纪律-补建测试」门禁（铁律 18：暂未建立的测试单独开 issue 及 PR 完善）');

  // ---- 9.9 需求覆盖度检查 + ⏸CP2.5 需求覆盖确认（Issue #147 补充：加一步检查开发及测试是否覆盖全部需求，检查完设置暂停点）----
  // 测试通过后必须做需求覆盖度检查（逐条需求 ↔ 开发落点 ↔ 测试覆盖），完成后经 ⏸CP2.5 暂停待用户确认
  if (!/需求覆盖度检查/.test(prompt))
    errors.push(
      `缺少「需求覆盖度检查」门禁（${M - 6}/${M} 测试通过后须逐条核对开发落点/测试覆盖是否覆盖全部需求）`
    );
  if (
    !/需求覆盖度矩阵（需求｜开发落点｜测试覆盖｜结论/.test(prompt) &&
    !/矩阵可核实（需求↔开发落点↔测试覆盖逐条可验）/.test(prompt)
  )
    errors.push('缺少「需求覆盖度矩阵」门禁（须逐条核对开发落点与测试覆盖，输出覆盖度矩阵）');
  if (!/⏸CP2.5 需求覆盖确认/.test(prompt))
    errors.push('缺少暂停点「⏸CP2.5 需求覆盖确认」（需求覆盖度检查完成后须暂停待用户确认）');
  if (!/用户确认需求全覆盖后才进入文档/.test(prompt))
    errors.push('缺少「需求全覆盖确认」语义（⏸CP2.5 暂停须等用户确认需求全覆盖后才进入下一阶段）');
  if (!/【暂停·CP2.5 需求覆盖确认】/.test(prompt))
    errors.push(
      '缺少暂停卡模板「【暂停·CP2.5 需求覆盖确认】」（全程模式需求覆盖确认须有输出模板）'
    );

  // 空白归一化工具（第 4 轮评审 B4 修复）：校验「强语义」时先去除所有空白再比对，
  // 兼顾「防语义弱化」与「容忍排版差异」，避免正常等价格式改动（空格/换行）被误拦（过度校验）。
  // 定义于 9.10 段之前，供方法 G / 注意事项 bullet / 门禁表语义校验共用（避免 TDZ）。
  const stripWs = str => str.replace(/\s+/g, '');

  // 段内断言公共守卫（PR #318 敢删动作之二）：收敛「section !== null && !section.includes(x) → errors.push」
  // 这一在本文件重复 ~30 次的形态为单一实现。
  // 语义不变：section 为 null 时（锚点缺失）已由 sliceSection/sliceContentSection 显式报错，
  // 此处只负责「区间可达时逐条断言其内容」，故不重复报错、不静默跳过。
  const checkSection = (section, frags, message) => {
    if (section === null) return;
    const list = Array.isArray(frags) ? frags : [frags];
    if (list.some(f => !section.includes(f))) errors.push(message);
  };

  // ---- 9.10 三条防重规则门禁（Issue #284：防重复 PR / 交接只用 PR 编号 / 判阻塞前对照实验）----
  // 背景：Issue #277 在 36 分钟内产出 3 个同题 PR（#278/#279/#280），并新建两个几乎相同的 Issue（#281/#282），
  // 7/12 又因「最新交棒指令」指向半成品 #279 而选错交接对象；另有不做对照实验就判"阻塞"的假阻塞。
  // 因此提示词新增铁律 19/20/21 三条防重规则，本节强校验其完整句式与顺序（防未来被删/被改写语义）。
  // 单一契约（PR #318 防腐改造「敢删」动作）：铁律 19~24 标题**只在本数组定义一次**，
  // 供 ① DEDUP_CORE 顺序链 ② O3 唯一性校验 两处消费。
  // 反例（本文件自身，本轮 Q1 自查命中）：原两处各写一份标题字面量（各 6 行），
  // 改一处必漏另一处 —— 即「同一约定抄成多份 ⇒ 必然失同步」（#314 i1 教训的新实例）。
  const RULE_19_24_TITLES = [
    '19. 防重复 PR（开发前先查，防 36 分钟 3 个 PR 重演）',
    '20. 交接一律用 PR 编号，禁用分支名（防评审环节选错半成品）',
    '21. 判"阻塞"前必须做对照实验（防假阻塞）',
    '22. 复盘改进项必须预防性闭环（防"复盘全是空话"）',
    '23. 复盘必须对照原始需求逐条复验（防"凭历史宣称已完成"）',
    '24. 防腐四维（防"越修越多、越修越乱"，反例见 #314）',
  ];
  const DEDUP_CORE = [
    RULE_19_24_TITLES[0],
    '必须先查同 Issue 是否已有 open PR',
    '已有则一律复用该 PR 与其 head 分支继续推提交，禁止新建分支、禁止新建 PR',
    '一个 Issue 一个 PR 一条分支',
    RULE_19_24_TITLES[1],
    '**禁止只写分支名**（分支名易撞名、易被"最新交棒指令"指向半成品',
    RULE_19_24_TITLES[2],
    '只有"本次改动后失败、基线通过"才可判为本次改动导致的阻塞',
    '基线同样失败（含环境/工具链/网络/平台差异），则属**环境性失败，不得记为本次改动的阻塞**',
    // #292：铁律 22/23 紧接 21 之后纳入同一顺序链（防挪位/夹带内容）
    RULE_19_24_TITLES[3],
    RULE_19_24_TITLES[4],
    // #312：铁律 24 紧接 23 之后纳入同一顺序链（防挪位/夹带内容）
    RULE_19_24_TITLES[5],
  ];
  // 顺序校验限定在「铁律 19~24」区间内——同一句式在角色卡片/流水线/门禁表重复出现，全局 indexOf 会误判错乱。
  // 注：sliceSection 定义在本段之后（const 不提升），此处内联定位锚点，避免 TDZ 报错。
  const dedupStart = prompt.indexOf('19. 防重复 PR（开发前先查');
  const dedupEnd = prompt.indexOf('【角色卡片', dedupStart);
  const dedupTarget =
    dedupStart !== -1 && dedupEnd > dedupStart ? prompt.slice(dedupStart, dedupEnd) : prompt;
  // 第 5 轮 O2/O3 修复：原只比 indexOf 递增，无法发现 O2 片段间插入干扰内容、O3 标题被重复注入。
  // 改为：① 搜索游标推进确保按序紧邻命中；② 铁律 19/20/21 标题须全局唯一。
  let dedupCursor = 0;
  for (const frag of DEDUP_CORE) {
    const idx = dedupTarget.indexOf(frag, dedupCursor);
    if (idx === -1)
      errors.push(
        `防重规则缺少完整句式「${frag}」（铁律 19/20/21：防重复 PR / 交接只用 PR 编号 / 判阻塞前对照实验，防 36 分钟 3 个 PR 与选错交接对象重演）`
      );
    else dedupCursor = idx + frag.length;
  }
  // O2：铁律 19~23 区间须「紧邻五条规则、无未声明干扰行」——
  // 原 cursor 推进允许片段间插入任意内容（如「插入干扰：随便一句话。」），导致语义被拆解仍放行。
  // 校验：区间内每个非空行都必须以 19./20./21. 开头（即只有三条铁律本体，无夹带段落）。
  const dedupLines = dedupTarget
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  // 铁律 22/23/24 属规则本体（非干扰行）予以放行；其余行不得混入（防插入干扰文本拆解规则语义）。
  const strayLines = dedupLines.filter(l => !/^(19|20|21|22|23|24)\. /.test(l));
  if (strayLines.length > 0)
    errors.push(
      `铁律 19~23 区间存在未声明的干扰行（共 ${strayLines.length} 行，首行：「${strayLines[0].slice(0, 30)}」）——防插入干扰文本拆解防重规则语义`
    );
  if (dedupLines.length !== 6)
    errors.push(
      `铁律 19~24 区间应为紧邻的六条规则（实际 ${dedupLines.length} 行）——防拆解结构/夹带内容`
    );
  // O3：铁律 19~24 标题须在提示词内唯一（防重复注入干扰片段定位/拆解结构）
  for (const title of RULE_19_24_TITLES) {
    const occurrences = prompt.split(title).length - 1;
    if (occurrences > 1)
      errors.push(
        `铁律标题被重复注入：「${title}」在提示词内出现 ${occurrences} 次（应唯一，防拆解结构/干扰顺序校验）`
      );
  }
  // 5/12 开发阶段须在流水线主链内绑定"开工前先查 open PR"（防只加铁律、流程不落点）
  const mustMatch = (src, frags, message) => {
    if (src === null) return; // 区间不可达已由 sliceSection/sliceContentSection 显式报错（同 checkSection）
    for (const f of Array.isArray(frags) ? frags : [frags]) {
      if (!(f instanceof RegExp ? f.test(src) : src.includes(f))) {
        errors.push(message);
        return;
      }
    }
  };
  mustMatch(
    prompt,
    [
      /5\/\d+ 开发\(DEV\)/,
      /5\/\d+ 开工前先查 open PR 有则复用（19）/,
      /PR 编号（本 Issue 的唯一 PR/,
    ],
    `流水线 5/${M} 开发与 DEV 卡片未绑定防重复 PR 门禁（须含：5/${M} 开发（DEV）、开工前先查 open PR 有则复用、任务书 PR 编号字段）`
  );
  // 任务书 / 接力卡须带 PR 编号字段（防交接退回分支名）
  // 第 9 轮评审 W4 修复：原先只校验字段头「交接 PR：<#<编号>（commit <sha>）」，
  // 后缀「只认 PR 编号，禁止按分支名/最新指令猜对象（铁律 20）」可被删仍放行 → 补校验后缀。
  if (
    !/交接 PR：<#<编号>（commit <sha>）——只认 PR 编号，禁止按分支名\/最新指令猜对象（铁律 20）；尚无 PR 则写/.test(
      prompt
    )
  )
    errors.push(
      '接力卡召唤话术「交接 PR」字段不完整（须含：交接 PR：<#<编号>（commit <sha>）——只认 PR 编号，禁止按分支名/最新指令猜对象（铁律 20）；并给出「尚无 PR」兜底（铁律 12），防 1~4 步无 PR 时可写字段缺失）'
    );
  // 文档级：门禁表须含三条防重规则行（防只加提示词铁律、文档防幻觉清单脱节）
  const dedupGateStart = content.indexOf('### 真实执行与循环门禁');
  const dedupGateEnd = content.indexOf('## 与"逐个召唤自建 NPC"的对比', dedupGateStart);
  const dedupGateSection =
    dedupGateStart !== -1 && dedupGateEnd > dedupGateStart
      ? content.slice(dedupGateStart, dedupGateEnd)
      : null;
  checkSection(
    dedupGateSection,
    ['防重复 PR（铁律 19）', '交接只用 PR 编号（铁律 20）', '判"阻塞"前必须对照实验（铁律 21）'],
    '门禁表缺少防重规则行（须含：防重复 PR（铁律 19）/ 交接只用 PR 编号（铁律 20）/ 判"阻塞"前必须对照实验（铁律 21））'
  );
  // 第 3 轮评审 N5 修复：门禁表防重规则三行不仅要有行头，还须含实质约束语义
  // （此前只校验行头关键字，把行内约束替换为"随便处理"仍放行 → 语义弱化逃生口）。
  // 第 4 轮评审：同样改用空白归一化匹配，避免「行内多空格即误拦」（与 B4 同类误报）。
  // 归一化匹配（第 4 轮评审：行内多空格不应误拦）——对区间与目标同时 stripWs 后比对
  checkSection(
    dedupGateSection === null ? null : stripWs(dedupGateSection),
    [
      '已有 open PR 一律复用该 PR 与其 head 分支继续推提交，禁止新建分支、禁止新建 PR',
      '一个 Issue 一个 PR 一条分支',
      '禁止只写分支名',
      '一次流水线同一 Issue 只认一个 PR 编号',
      '只有"本次改动后失败、基线通过"才算本次改动导致的阻塞',
      '环境性失败，**不得记为本次改动阻塞**',
    ].map(stripWs),
    '门禁表防重规则行语义不完整（须含：已有 open PR 一律复用…禁止新建分支/PR、一个 Issue 一个 PR 一条分支、禁止只写分支名、一次流水线同一 Issue 只认一个 PR 编号、只有"本次改动后失败、基线通过"才算阻塞、环境性失败不得记为本次改动阻塞）'
  );
  // 第 1 轮 E1~E7 修复：9.10 此前漏覆盖 7 处落点（铁律 20 末句 / 铁律 21 证据句 / 铁律 19 判定口径 /
  // 角色卡片 PM·DEV·CR·QA 落点 / 铁律 12 交接对象句 / 合并确认卡唯一性行 / 工作流程 7/12 行），
  // 删除后 CI 仍放行。修复原则：逐条补齐与落点一一对应的门禁（防「加了落点没加门禁」再次逃逸）。
  // 以下为提示词内补充约束句（追加进 DEDUP_CORE 顺序校验之外单独校验，因其分布在铁律 12/19/20/21 多处）。
  const dedupExtraPrompt = [
    [
      '判定口径：open PR 的标题/body `Ref: #<Issue>`/head 分支任一指向本 Issue 即视为"已有 PR"',
      '铁律 19 缺少「判定口径」句（防删除判定标准后"已有 PR"判据失效）',
    ],
    [
      '一次流水线同一 Issue 只认一个 PR 编号',
      '铁律 20 缺少「一次流水线同一 Issue 只认一个 PR 编号」句',
    ],
    [
      '对照实验的证据（两条命令 + 两处输出摘要）必须写入 Issue/PR 留痕',
      '铁律 21 缺少「对照实验证据须写入 Issue/PR 留痕」句',
    ],
    [
      '**交接对象一律用 PR 编号而非分支名（铁律 20）**',
      '铁律 12 缺少「交接对象一律用 PR 编号而非分支名（铁律 20）」句',
    ],
    // 第 10 轮评审 Y2/Y3 修复：铁律 20/21 的补充禁止性尾句此前未受门禁保护（可被静默删除）。
    [
      '本仓评审环节曾因指向半成品 #279 而选错交接对象',
      '铁律 20 缺少案例锚点句（本仓评审环节曾因指向半成品 #279 而选错交接对象）',
    ],
  ];
  for (const [frag, msg] of dedupExtraPrompt) {
    if (!prompt.includes(frag)) errors.push(msg + '（防重规则门禁覆盖缺失）');
  }
  // E4：角色卡片 PM/DEV/CR/QA 的铁律 19/20/21 职责落点（9.10 此前未覆盖角色卡片段）
  const dedupCardSeg = sectionOf('【角色卡片');
  if (dedupCardSeg) {
    const dedupCards = dedupCardSeg.body;
    const cardJobs = [
      [
        'PM',
        /PM｜.*2\/\d+ 先查 open PR 有则复用不新建（19）；审核交接对象一律用 PR 编号（20）/s,
        `PM 卡片缺少铁律 19/20 落点（2/${M} 拆解先查 open PR + 审核交接对象一律用 PR 编号）`,
      ],
      [
        'DEV',
        /DEV｜.*5\/\d+ 开工前先查 open PR 有则复用（19）/s,
        `DEV 卡片缺少铁律 19 落点（5/${M} 开工前先查 open PR）`,
      ],
      [
        'CR',
        /CR｜.*留痕与被评对象一律写 PR 编号（20）；判阻塞前做对照实验（21）/s,
        'CR 卡片缺少铁律 20/21 落点（评审留痕与被评对象一律写 PR 编号 + 判阻塞前对照实验）',
      ],
      [
        'QA',
        /QA｜.*判阻塞前做对照实验，环境性失败不得记为本次改动阻塞（21）/s,
        'QA 卡片缺少铁律 21 落点（判阻塞前对照实验 + 环境性失败免责）',
      ],
    ];
    for (const [who, re, msg] of cardJobs) {
      if (!re.test(dedupCards)) errors.push(msg + '（角色卡片与防重规则脱节）');
    }
  }
  // E6：【合并确认卡】交接对象唯一性行（提示词内）
  const dedupMergeCard = sectionOf(MERGE_CARD_HEAD);
  if (!dedupMergeCard) {
    errors.push('未找到【合并确认卡】卡段（防重规则合并前置校验无法定位）');
  } else if (
    !/交接对象唯一性：.*只认 PR 编号不认分支名（铁律 20）；本 Issue 下 open PR 必须 ≤1（铁律 19）/s.test(
      dedupMergeCard.full
    )
  ) {
    errors.push(
      '【合并确认卡】缺少「交接对象唯一性」行（须含：只认 PR 编号不认分支名（铁律 20）；本 Issue 下 open PR 必须 ≤1（铁律 19））'
    );
  }
  // 文档级：工作流程 5/12 行须含"开工前先查同 Issue 是否已有 open PR"（防流程与铁律脱节）
  const dedupWfStart = content.indexOf(`## 工作流程（${M} 阶段流水线）`);
  const dedupWfEnd = content.indexOf('### 两种执行方式', dedupWfStart);
  const dedupWorkflowSection =
    dedupWfStart !== -1 && dedupWfEnd > dedupWfStart
      ? content.slice(dedupWfStart, dedupWfEnd)
      : null;
  checkSection(
    dedupWorkflowSection,
    '开工前先查同 Issue 是否已有 open PR',
    `工作流程 5/${M} 行缺少防重复 PR 门禁（须含：开工前先查同 Issue 是否已有 open PR，有则复用同一 PR/分支继续推，禁止新建）`
  );

  // E7：工作流程 7/12 行的铁律 21 落点（文档级，此前只校验 5/12 行）
  if (
    dedupWorkflowSection !== null &&
    !new RegExp(`阶段 7\\/${M} 测试验证（QA）[^\\n]*判"阻塞"前必须做对照实验[^\\n]*铁律 21`, 's').test(
      dedupWorkflowSection
    )
  ) {
    errors.push(`工作流程 7/${M} 行缺少对照实验门禁（须含：判"阻塞"前必须做对照实验…铁律 21）`);
  }

  // 第 2 轮评审 U1/U2/U5 修复：补齐 3 处未覆盖落点（U1 文档级方法 G；U2 文档级【注意事项】防重规则 bullet；
  // U5 【接力卡】本步产物 PR 编号约束行）——原则：文档级说明/验收方法与门禁同步，防再次脱节。
  // U1/U2：文档级落点（防用户按文档验收时拿到错误预期 / 注意事项说明被静默删除）
  if (!stripWs(content).includes(stripWs('**方法 G（三条防重规则验证）**')))
    errors.push(
      '文档缺少「方法 G（三条防重规则验证）」（防重规则端到端验收方法被删，用户无法按文档验收）'
    );
  // 第 3 轮评审 N7 修复：方法 G 不仅要有标题，还须含三步实质验收语义
  // （此前保留标题、正文替换为"随便看看"仍放行 → 语义弱化逃生口）。
  // 第 4 轮评审 B4 修复：改用「去空白再比对」的归一化匹配——
  // 既是强语义校验（防弱化），又容忍排版差异（空格/换行），避免正常等价格式改动被误拦（过度校验）。
  const METHOD_G_SEMANTICS =
    `**方法G（三条防重规则验证）**：①5/${M}开发前先查同Issue是否已有openPR，有则复用不新建（收尾本Issue下openPR≤1）；②任务书/接力卡/召唤话术中的交接对象均为PR编号\`#<编号>\`（非分支名）；③判「阻塞」前先做对照实验（同代码另建目录/另用基线commit各跑一遍），只有"本次改动后失败、基线通过"才算本次改动导致的阻塞，环境性失败须附两条命令与输出作证据并继续推进，禁止以"阻塞"名义跳过留痕。`;
  if (!stripWs(content).includes(stripWs(METHOD_G_SEMANTICS)))
    errors.push(
      '方法 G 语义不完整（须含：①先查 open PR 复用不新建 ②交接对象为 PR 编号 ③判阻塞前对照实验）'
    );
  if (!stripWs(content).includes(stripWs('- **三条防重规则（铁律 19/20/21，Issue #284）**')))
    errors.push('【注意事项】缺少「三条防重规则（铁律 19/20/21，Issue #284）」说明 bullet');
  // 第 3 轮评审 N8 修复：注意事项 bullet 不仅要有标题，还须含三条约束实质语义
  // （此前保留标题、正文替换为"随便"仍放行 → 语义弱化逃生口）。
  // 第 4 轮评审 B4 修复：同方法 G，改用空白归一化匹配（容忍排版差异、防误报）。
  const NOTE_BULLET_SEMANTICS =
    `-**三条防重规则（铁律19/20/21，Issue#284）**：①**防重复PR**——5/${M}开发开工前先查同Issue是否已有openPR，有则复用同一PR/分支继续推，禁止新建（一个Issue一个PR一条分支，防36分钟3个PR重演）；②**交接只能用PR编号**——任务书/接力卡/留痕/召唤话术中的交接对象写\`#<编号>\`，禁止只写分支名（防"最新交棒指令"指向半成品而选错对象）；③**判"阻塞"前必须做对照实验**——同一份代码另建目录/另用基线commit各跑一遍，只有"本次改动后失败、基线通过"才算本次改动导致的阻塞，环境性失败不得记为本次改动阻塞（须附两条命令与输出作证据）`;
  if (!stripWs(content).includes(stripWs(NOTE_BULLET_SEMANTICS)))
    errors.push(
      '【注意事项】三条防重规则 bullet 语义不完整（须含：①防重复 PR 复用不新建 ②交接只能用 PR 编号 ③判阻塞前对照实验）'
    );
  // U5：提示词内【接力卡】「本步产物」字段须含 PR 编号约束（衔接铁律 20）
  if (
    !/本步产物：<[^>]*涉及 PR 的必须写 PR 编号 `#<编号>` \+ commit sha，禁止只写分支名（铁律 20）>/.test(
      prompt
    )
  )
    errors.push(
      '【接力卡】「本步产物」字段缺少 PR 编号约束（须含：涉及 PR 的必须写 PR 编号 `#<编号>` + commit sha，禁止只写分支名（铁律 20））'
    );

  // 第 6 轮评审 Z1/Z2 修复：文档级「自动校验说明」段落中的防重规则门禁摘要句（即文档对 CI 校验项的显式承诺）
  // 此前未受门禁保护，可被静默删除/弱化 → 文档承诺与实际校验脱节。改用空白归一化强匹配。
  const AUTOCHECK_DEDUP_SUMMARY =
    `**三条防重规则门禁存在（铁律19/20/21：防重复PR/交接只用PR编号/判「阻塞」前对照实验，含铁律正文判定口径与证据句、开发环节落点、任务书/接力卡PR编号字段、角色卡片PM/DEV/CR/QA落点、【合并确认卡】交接对象唯一性行、门禁表三行、工作流程开发+测试落点、【接力卡】本步产物PR编号字段、方法G与【注意事项】防重规则说明）**。`;
  if (!stripWs(content).includes(stripWs(AUTOCHECK_DEDUP_SUMMARY)))
    errors.push(
      '「自动校验说明」段落缺少三条防重规则门禁摘要（文档对 CI 校验项的承诺被删/弱化，须含：三条防重规则门禁存在（铁律 19/20/21…））'
    );

  // ---- 9.11 复盘门禁（Issue #292 复盘：防"复盘全是空话"与"凭历史宣称已完成"）----
  // #292 暴露两类盲区：① 可预防类改进项（写标签绕过守卫 / 环境性失败误判 / 模板占位符误发）复盘后无人守卫；
  // ② 复盘结论仅凭历史留痕宣称落地。故新增铁律 22/23 + 方法 H/I + 【注意事项】bullet + 门禁表行
  // + 工作流程 12/12 行共五处落点，每处既校验标题存在又校验实质语义完整（防语义弱化逃生口）；
  // 匹配用 stripPunct 归一化（去空白/引号/强调符/连接号），兼顾防弱化与容忍排版差异。
  const stripPunct = t => stripWs(t).replace(/[”“"'‘’`*·—－-]+/g, '');

  // 4.1 顺序链必须登记 22/23（R5 变异自证：删掉登记即静默放行，故显式反向校验）
  for (const frag of [
    '22. 复盘改进项必须预防性闭环（防"复盘全是空话"）',
    '23. 复盘必须对照原始需求逐条复验（防"凭历史宣称已完成"）',
  ]) {
    if (!DEDUP_CORE.includes(frag))
      errors.push(
        `防重规则顺序链 DEDUP_CORE 缺少复盘门禁片段「${frag.slice(0, 8)}…」——删掉登记即静默放行，禁止缩减`
      );
  }
  // 4.2 位置跟随性硬校验（不依赖顺序链登记）：22 紧随 21、23 紧随 22
  const idxR21 = prompt.indexOf('21. 判"阻塞"前必须做对照实验（防假阻塞）');
  const idxR22 = prompt.indexOf('22. 复盘改进项必须预防性闭环（防"复盘全是空话"）');
  const idxR23 = prompt.indexOf('23. 复盘必须对照原始需求逐条复验（防"凭历史宣称已完成"）');
  if (idxR21 !== -1 && idxR22 !== -1) {
    if (/\n(19|20|23)\. /.test(prompt.slice(idxR21, idxR22)))
      errors.push('铁律 22 未紧随铁律 21（中间插入其它铁律行，疑似重排/夹带）——防复盘门禁被挪位');
  } else {
    errors.push('复盘门禁铁律 22 未紧随铁律 21 之后（锚点缺失或位置错乱，疑似被删/挪位）');
  }
  if (idxR23 === -1 || (idxR22 !== -1 && idxR23 <= idxR22))
    errors.push('复盘门禁铁律 23 未紧随铁律 22 之后（锚点缺失或顺序错乱，疑似被删/挪位）');

  // ---- 4.2b 铁律 24 防腐四维语义完整性（#312：防"保留标题、正文改空话"）----
  const idxR24 = prompt.indexOf('24. 防腐四维（防"越修越多、越修越乱"，反例见 #314）');
  if (idxR24 === -1 || (idxR23 !== -1 && idxR24 <= idxR23))
    errors.push('防腐四维铁律 24 未紧随铁律 23 之后（锚点缺失或顺序错乱，疑似被删/挪位）');
  // 四维 + 反例锚点 + 可核实判据逐条强校验（防语义弱化）
  const ANTICORRUPT_SEMANTICS = [
    '全局观',
    '契约唯一',
    '模块化',
    '敢删',
    '#314',
    '唯一定义者',
    '净增/净删',
    // A1/A2 整改（Issue #383）后提示词保留的防「假绿」判据短语（与铁律 24 正文同措辞）
    '名实一致',
    // 第 5 维「防御式度量」（Issue #314 comment 2099309996「假绿」教训）：
    // 名实一致（不得把未达成写成已达成）+ 口径唯一（同一断言对所有被守卫对象用同一口径实现）
    '防御式度量',
    '假绿',
    '名实一致',
    '口径唯一',
    // 第 6 维「环节覆盖」（用户 #312 补充：1-12 各个环节都要有防腐和解耦意识）：
    // 每环节动手前须答「本环节」的防腐/解耦/度量三项，缺任一项即视为本环节未真实执行。
    '环节覆盖',
    '本环节',
    '环节悬空',
  ];
  // QA 7/12 修复（QA-F8）：**实质判据锚点**——仅校验关键词会出现「锚点式假绿」：
  // 把第 5/6 维实质内容换成只含关键词的空壳句仍全绿（与本次要消灭的守卫假绿同构）。
  // 故把这些**判据短语**并入 ANTICORRUPT_SEMANTICS 一次校验（不另立数组/分支，省代码行）。
  ANTICORRUPT_SEMANTICS.push(
    '文案与阈值口径同义',
    '同一口径实现',
    '注入反例须由绿转红',
    '名实一致',
    '三项并留痕',
    '合取式，非析取式',
    '未真实执行',
    // 第 7 维「断言归属」（Issue #314 comment 2099345506 教训）：
    // 测行为不测形态 + 不变量必须归属门禁 + 变异自证须走真实链路。
    '断言归属',
    '测行为不测形态',
    '归属门禁',
    '变异自证须走真实链路'
  );
  if (idxR24 !== -1) {
    const r24 = prompt.slice(idxR24, prompt.indexOf('\n', idxR24));
    const missing24 = ANTICORRUPT_SEMANTICS.filter(f => !r24.includes(f));
    if (missing24.length > 0)
      errors.push(
        '铁律 24 语义不完整（须含：全局观 / 契约唯一 / 模块化 / 敢删 四维 + 防御式度量（假绿/名实一致/口径唯一）+ 环节覆盖（本环节/环节悬空）+ #314 反例 + 唯一定义者 + 净增/净删 + 可核实判据；缺失：' +
          missing24.join('、') +
          '）'
      );
  }

  // 4.3 铁律 22 实质语义（防"保留标题、正文改空话"）
  const RETRO_CLOSED_LOOP_SEMANTICS =
    '必须在复盘当轮落成可执行产物——新增或升级守卫断言、校验脚本、CI 门禁，并至少跑 1 组变异自证（注入反例后断言由绿转红）；无法当轮落地的必须写明跟踪 Issue 编号与责任阶段；禁止只写"后续如何避免"的口头承诺就宣称复盘完成';
  if (!stripPunct(prompt).includes(stripPunct(RETRO_CLOSED_LOOP_SEMANTICS)))
    errors.push(
      '铁律 22 语义不完整（须含：当轮落成可执行产物 + 变异自证 + 跟踪 Issue 编号 + 禁止只在口头承诺下宣称复盘完成）'
    );
  // 4.4 铁律 23 实质语义（防"凭历史宣称已完成"）
  const RETRO_REVERIFY_SEMANTICS =
    '须把 Issue 原始需求文本逐条拉出，用可核实手段（脚本扫描/断言/命令输出）重新复验是否真实落地（需求原文 ↔ 开发落点 ↔ 守卫断言），并附复验命令与输出摘要；禁止仅凭历史留痕中的"已完成"宣称落地；任一无法复验者当场登记为遗留项';
  if (!stripPunct(prompt).includes(stripPunct(RETRO_REVERIFY_SEMANTICS)))
    errors.push(
      '铁律 23 语义不完整（须含：原始需求逐条拉出 + 可核实手段复验 + 禁止凭历史宣称 + 遗留登记）'
    );

  // 4.5 文档级落点：验收方法 H/I（用户按文档验收的入口）
  if (!stripPunct(content).includes(stripPunct('**方法 H（复盘改进项预防性闭环验证，铁律 22）**')))
    errors.push(
      '文档缺少「方法 H（复盘改进项预防性闭环验证，铁律 22）」（复盘改进项验收方法被删）'
    );
  const METHOD_H_SEMANTICS =
    '预期复盘的每一条可预防类改进项都落成可执行产物——新增/升级守卫断言、校验脚本或 CI 门禁（留存 1 组变异自证：注入反例后断言由绿转红），无法当轮落地的写明跟踪 Issue 编号；禁止只输出后续加强守卫/加强校验这类口头承诺就宣称复盘完成';
  if (!stripPunct(content).includes(stripPunct(METHOD_H_SEMANTICS)))
    errors.push(
      '方法 H 语义不完整（须含：改进项落成可执行产物 + 变异自证 + 禁止口头承诺下宣称复盘完成）'
    );
  if (!stripPunct(content).includes(stripPunct('**方法 I（复盘对照原始需求逐条复验，铁律 23）**')))
    errors.push('文档缺少「方法 I（复盘对照原始需求逐条复验，铁律 23）」（复盘复验方法被删）');
  const METHOD_I_SEMANTICS =
    '用脚本/断言/命令重新复验是否真实落地（需求原文 ↔ 开发落点 ↔ 守卫断言），附复验命令与输出摘要；禁止仅凭历史已完成宣称落地，任一无法复验者当场登记为遗留';
  if (!stripPunct(content).includes(stripPunct(METHOD_I_SEMANTICS)))
    errors.push(
      '方法 I 语义不完整（须含：原始需求逐条复验 + 复验命令与输出 + 禁止仅凭历史宣称 + 遗留登记）'
    );
  // 4.6 文档级落点：【注意事项】两条 bullet
  if (!stripPunct(content).includes(stripPunct('- **复盘改进项预防性闭环（铁律 22）**')))
    errors.push('【注意事项】缺少「复盘改进项预防性闭环（铁律 22）」说明 bullet');
  if (!stripPunct(content).includes(stripPunct('- **复盘必须对照原始需求逐条复验（铁律 23）**')))
    errors.push('【注意事项】缺少「复盘必须对照原始需求逐条复验（铁律 23）」说明 bullet');
  // 4.7 文档级落点：门禁表两行
  if (!stripPunct(content).includes(stripPunct('**复盘改进项必须预防性闭环（铁律 22）**')))
    errors.push('门禁表缺少「复盘改进项必须预防性闭环（铁律 22）」行（复盘门禁承诺被删）');
  if (!stripPunct(content).includes(stripPunct('**复盘必须对照原始需求逐条验证（铁律 23）**')))
    errors.push('门禁表缺少「复盘必须对照原始需求逐条验证（铁律 23）」行（复盘门禁承诺被删）');
  // 4.8 文档级落点：工作流程 12/12 行
  if (!new RegExp(`阶段 ${M}/${M} 复盘（PM\\+全员）[^\\n]*铁律 22[^\\n]*铁律 23`).test(content))
    errors.push(
      `工作流程 ${M}/${M} 行缺少复盘门禁落点（须含：铁律 22 预防性闭环 + 铁律 23 对照原始需求复验）`
    );

  // ---- 9.12 防腐四维 + 防腐检查清单门禁（#312：防 NPC Team 自身腐烂）----
  // #312：只加不删 → 补丁栈增厚 → 上下文装不下 → 约定必漏读。故新增铁律 24（四维）+ 6 条自检问句，
  // 落点：角色卡片 PM/ARCH/DEV/CR 各一句 + 守卫脚本 validate-npc-team-bloat.js（本节强校验存在性与语义）。
  // 4.9 铁律 24 已由 4.2b 强校验（标题唯一 + 紧随 23 + 四维/反例/判据），此处只校验文档级落点。
  // 4.9a 【防腐检查清单】段存在 + 6 条问句逐条命中（防"删段/少条"）
  // 单一契约（PR #318 防腐改造）：段头锚点与 6 问句清单**只在本处定义一次**，
  // 4.9a / 4.9b / 4.9d 三处断言一律引用本常量，不再各写一份字面量
  // （反例 #314：同一约定在两处各实现一套 ⇒ 必然失同步 ⇒ 假绿；本轮 Q1 自查即命中该类）。
  const CHECKLIST_HEAD = '【防腐检查清单（铁律 24 展开';
  const REQUIRED_CHECKS = [
    '问 1 全局观',
    '问 2 契约唯一',
    '问 3 模块化',
    '问 4 敢删',
    '问 5 防腐自证',
    '问 6 上限余量',
  ];
  // 4.9d 清单须含「每环节自答」语义（用户 #312 补充：1-12 各个环节都要有防腐和解耦意识）
  const CHECKLIST_STAGE_SEMANTICS = ['本环节', '防腐', '解耦', '度量'];
  // 清单段头须声明「每环节自答三项」——提示词现写法把该语义下沉到【流水线】段头（避免同一约定两处写），
  // 故此处接受「清单段头自带」或「流水线段头承接」二者之一（二者都与下一处断言合取，不放松）。
  const checklistStageDeclared = head =>
    CHECKLIST_STAGE_SEMANTICS.every(k => head.includes(k)) ||
    (PROMPT_LINES.find(l => l.startsWith('【流水线')) || '').includes('本环节');
  if (!prompt.includes(CHECKLIST_HEAD)) {
    errors.push('缺少【防腐检查清单】段（铁律 24 展开的自检入口被删/改名，AI 无动手前自检依据）');
  } else {
    const missingChecks = REQUIRED_CHECKS.filter(k => !prompt.includes(k));
    if (missingChecks.length > 0)
      errors.push(
        '【防腐检查清单】缺自检问句：' +
          missingChecks.join('、') +
          '（清单不完整即无法覆盖铁律 24 四维 + 防腐自证/上限余量）'
      );
    const checklistHeadIdx = prompt.indexOf(CHECKLIST_HEAD);
    const checklistHeadLine = prompt.slice(
      checklistHeadIdx,
      prompt.indexOf('\n', checklistHeadIdx)
    );
    const missingStageSem = checklistStageDeclared(checklistHeadLine)
      ? []
      : CHECKLIST_STAGE_SEMANTICS.filter(k => !checklistHeadLine.includes(k));
    if (missingStageSem.length > 0)
      errors.push(
        '【防腐检查清单】段头缺「每环节防腐与解耦」语义（须含：' +
          CHECKLIST_STAGE_SEMANTICS.join(' / ') +
          '；缺失：' +
          missingStageSem.join('、') +
          '）——防清单退化为「只在开头自答一次」而 1-12 各环节无人自答'
      );
  }
  // 4.9b 防腐检查清单须内联在提示词正文（AC5：不新增外部文档承载）。
  // PR #315 K1 修复：原正则 `见s*` 缺反斜杠 → 对「见 docs 外部文档/详见外部文档/参见外部文档」恒不命中
  // （门禁零拦截＝守卫假绿）。改两条互补断言：① 不得出现外链指示词；② 6 问句须与段头同处内联块
  //（否则 4.9a 的段头命中即可放行——评审探针 7/8 实测的间接触发路径）。
  const EXTERNAL_HINT_RE =
    /(见|参见|详见|参见于|移步|外链|外置)[^。\n]{0,80}(docs\/|外部文档|EXTERNAL\.md)/;
  if (EXTERNAL_HINT_RE.test(prompt))
    errors.push('【防腐检查清单】不得外链到外部文档承载（AC5：须内联在提示词正文）');
  // ② 问句须与段头同处「内联块」（从段头起按序出现）
  const checklistStart = prompt.indexOf(CHECKLIST_HEAD);
  if (checklistStart !== -1) {
    const checklistBlock = prompt.slice(checklistStart, checklistStart + 2400);
    const misplaced = REQUIRED_CHECKS.filter(k => !checklistBlock.includes(k));
    if (misplaced.length > 0)
      errors.push(
        '【防腐检查清单】问句未内联在段头之后的正文内（缺失：' +
          misplaced.join('、') +
          '）——AC5：清单须内联承载，不得仅保留段头后把清单移出'
      );
  }
  // 4.9c 角色卡片落点：PM/ARCH/DEV/CR 各含铁律 24 落点（防"铁律在、职责未接"）
  if (cardSeg) {
    const card24 = [
      { key: 'PM', re: /PM｜.*拆解时先答【防腐检查清单】6 问（24）/s },
      { key: 'ARCH', re: /ARCH｜.*本概念的唯一定义者（契约落点）/s },
      { key: 'DEV', re: /DEV｜.*开发前跑【防腐检查清单】6 问/s },
      { key: 'CR', re: /CR｜.*评审须核铁律 24 四维/s },
    ];
    for (const c of card24) {
      if (!c.re.test(cardSeg.body))
        errors.push(`角色卡片 ${c.key} 缺少铁律 24 防腐落点（须含：${c.re}）`);
    }
  }

  // ---- 通用段化工具：截取 startFrag→endFrag（W1：区间不可达显式报错返回 null，不静默跳过）----
  const sliceSection = (startFrag, endFrag) => {
    const s = prompt.indexOf(startFrag);
    if (s === -1) {
      errors.push(`段化校验锚点缺失：「${startFrag}」不存在（段化校验无法定位，疑似该段被删）`);
      return null;
    }
    const e = endFrag ? prompt.indexOf(endFrag, s) : prompt.length;
    if (e === -1 || e <= s) {
      errors.push(
        `段化校验区间不可达：「${endFrag}」未出现在「${startFrag}」之后（疑似段落顺序错乱或锚点被删）`
      );
      return null;
    }
    return prompt.slice(s, e);
  };

  // 文档级区间定位（CR 第 4 轮新增）：与 sliceSection 语义一致，作用于整个文档 content
  // （提示词代码块外的文档结构：工作流程/门禁表/暂停确认表等）。锚点缺失/区间不可达时显式报错，
  // 禁止静默返回 null 跳过校验（防删章节标题绕过文档级覆盖校验）。
  const sliceContentSection = (startFrag, endFrag) => {
    const s = content.indexOf(startFrag);
    if (s === -1) {
      errors.push(
        `文档级校验锚点缺失：「${startFrag}」不存在（文档级校验无法定位，疑似该章节被删/改名）`
      );
      return null;
    }
    const e = endFrag ? content.indexOf(endFrag, s) : content.length;
    if (e === -1 || e <= s) {
      errors.push(
        `文档级校验区间不可达：「${endFrag}」未出现在「${startFrag}」之后（疑似章节顺序错乱或锚点被删）`
      );
      return null;
    }
    return content.slice(s, e);
  };

  // ---- 9.13 环节覆盖门禁（用户 #312 补充：1-12 各个环节都要有防腐和解耦意识）----
  // 背景：#312 的防腐改造原先只在「动手前自答 6 问」（环节入口）与「铁律 24 四维」（静态原则）落点，
  // 1-12 各环节内部仍无「本环节要防腐什么/解耦什么」的逐环节约束 —— 即「环节悬空」：
  // 环节做完即可宣称完成，无需自证该环节的防腐/解耦，与 #312 想消灭的「局部修好、全局更乱」同构。
  // 本节把「每环节逐条自答 + 留痕」变成可核实的 CI 断言（每环节的判据以提示词【流水线】段为准）。
  // 环节保护表（STAGE_PROTECTION / STAGE_COUNT）与逐环节校验实现**唯一定义者 = scripts/lib/npc-team-prompt-source.js**
  // （PR #317 评审 K2/K4：此前「12」在本文件 n<12、守卫 LIMITS、本数组长度三处各写一份 → 契约无主）。
  const stageSeg = (sectionOf('【流水线') || {}).full || null;
  if (stageSeg === null) errors.push('环节覆盖门禁无法执行：【流水线】段区间不可达（每环节防腐/解耦判据失去承载）');
  if (stageSeg === null) {
    errors.push('环节覆盖门禁无法执行：【流水线】段区间不可达（每环节防腐/解耦判据失去承载）');
  } else {
    // 逐环节校验：只在**环节自身子句**（按 ' → ' 切分）内查标记与关键词，关键词不得跨环节借位
    // （PR #317 评审 K1 修复：原 `[^\n]*` 在单行内无界 → 删本环节子句 + 关键词搬到下一环节 + decoy 补计数即可放行）。
    for (const r of checkStageProtection(stageSeg)) {
      if (r.ok) continue;
      const why =
        r.reason === 'missing-stage'
          ? '该环节子句缺失'
          : r.reason === 'missing-mark'
            ? '缺少「本环节」标记段'
            : `缺少判据「${r.key}」`;
      errors.push(
        `环节「${r.stage}」缺少本环节防腐/解耦要求（${why}）——防环节悬空：环节做完即可宣称完成而无需自证该环节的防腐/解耦`
      );
    }
    // 计数口径唯一：与守卫 F1 共享 countStageProtection（范围固定为【流水线】段）
    const stageDims = [
      `${STAGE_PROTECT_MARK}`,
      ...[...CHECKLIST_STAGE_SEMANTICS.slice(1)].map(s => s + '='),
    ];
    for (const dim of stageDims) {
      const n = (stageSeg.match(new RegExp(dim.replace('=', '\\s*='), 'g')) || []).length;
      if (n < STAGE_COUNT)
        errors.push(
          `环节覆盖不完整：【流水线】段「${dim}」仅 ${n}/${STAGE_COUNT} 个环节声明（${STAGE_COUNT} 个环节须逐条自答防腐/解耦/度量）`
        );
    }
    // F3：结构度量（环节覆盖数）须与 STAGE_COUNT 一致；字面计数仅诊断。
    const covered = countCoveredStages(stageSeg);
    if (covered !== STAGE_COUNT)
      errors.push(
        `环节覆盖数异常：【流水线】段实际覆盖 ${covered}/${STAGE_COUNT} 个环节（与守卫 F1 同一结构度量）`
      );
    // 双向判定（评审 F5+F6）：结构数须 == STAGE_COUNT；
    // 环节子句段数不得 > STAGE_COUNT（防环节膨胀；只数子句段，说明行同字面不计入，F6）
    const decls = countStageDecls(stageSeg);
    if (decls > STAGE_COUNT)
      errors.push(`环节子句段数 ${decls} > ${STAGE_COUNT}——疑似环节膨胀（计划外环节段）`);
    // 关键能力断言（Issue #383 QA-D1）：用户显式要求的核心能力须出现在**提示词块**内，
    // 否则「能力被删/被改写」无任何断言感知（断言无主）。判据单源 = CAPABILITY_ASSERTIONS。
    for (const [name, literal] of CAPABILITY_ASSERTIONS) {
      if (!prompt.includes(literal))
        errors.push(
          `关键能力「${name}」缺失：提示词块未包含字面「${literal}」（唯一来源 = CAPABILITY_ASSERTIONS，Issue #383 QA-D1）`
        );
    }
  }
  // 角色卡片落点：PM 汇报环节 + CR 逐环节核对（防「铁律在、职责未接」）
  if (cardSeg) {
    const cardStage = [
      { key: 'PM', re: new RegExp(`PM｜.*${M - 1}\\/${M} 汇报只报已留痕事实`) },
      { key: 'CR', re: /CR｜.*第 6 维逐环节要求/s },
    ];
    for (const c of cardStage) {
      if (!c.re.test(cardSeg.body))
        errors.push(`角色卡片 ${c.key} 缺少铁律 24 第 6 维（环节覆盖）落点（须含：${c.re}）`);
    }
  }
  // 文档级落点：【注意事项】bullet + 工作流程「本环节要求」（各 4 条）
  // 断言口径：整份文档中须存在「- **环节覆盖（铁律 24 第 6 维…」bullet 且同段内含「1-12 每个环节」语义
  //（不锚定 bullet 结尾符，容忍行内补充说明；改锚定开头 + 关键语义双条件，防「改个尾注即绕过」）。
  mustMatch(
    stripPunct(content),
    ['- **环节覆盖（铁律 24 第 6 维', '1-12 每个环节都要有防腐和解耦意识'].map(stripPunct),
    '【注意事项】缺少「环节覆盖（铁律 24 第 6 维）」说明 bullet（须含：1-12 每个环节都要有防腐和解耦意识）'
  );
  const wfStageReq = (content.match(/本环节要求（铁律 24 第 6 维）/g) || []).length;
  if (wfStageReq < 4)
    errors.push(
      `工作流程段缺少「本环节要求（铁律 24 第 6 维）」落点（实测 ${wfStageReq} 处，须 ≥4）`
    );

  // ---- 9.5 PR 合并门禁（Issue #76 最新补充：合并前暂停待用户确认，防未确认/假装合并）----
  // 用户要求"再加上PR合并（在合并前需暂停待用户确认）"。因此 9/12 PR 合并前必须停到 ⏸CP3：
  // 输出【合并确认卡】（待合并 PR + 前置状态记录位置），只有用户本人回复「确认合并/继续」才放行合并；
  // 禁止代替用户确认、禁止未获确认就合并、禁止假装已合并（未真实 merge-pull 不得宣称已合并）。
  // 铁律 13 声明（全局唯一）与【合并确认卡】段内要素（段内唯一，避免与铁律 13 重复句式干扰顺序校验）
  const RELAY_MERGE_CORE = ['13. 合并前暂停确认', MERGE_CARD_HEAD];
  let mergeLastIdx = -1;
  for (const frag of RELAY_MERGE_CORE) {
    const idx = prompt.indexOf(frag);
    if (idx === -1)
      errors.push(
        `合并确认缺少完整句式「${frag}」（${M - 3}/${M} PR 合并前必须暂停待用户确认，防未确认就合并/假装已合并）`
      );
    else if (idx < mergeLastIdx)
      errors.push(
        `合并确认句式顺序错乱：「${frag}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
      );
    else mergeLastIdx = idx;
  }
  // 合并确认卡必须含「合并前置状态」字段（评审清零/测试通过/CI success 的可核实记录位置）
  // 以及「确认合并/继续」放行句、禁止未确认就合并/假装已合并句、9/12 合并召唤话术示例（段内强校验）
  // CR 第 2 轮修复：补齐段内要素校验盲区——「收到确认前不得执行合并」硬约束句、
  // 「确认合并/继续→放行」映射句、用户命令三选一完整性（继续/补充/停止三行齐全），
  // 并补铁律 13 段内禁止细节校验（与合并确认卡段内校验双保险）。
  const mergeCardSection = (sectionOf(MERGE_CARD_HEAD) || {}).full || null;
  // 铁律 13 段：从铁律 13 声明到铁律 14 声明之间
  const rule13Start = prompt.indexOf('13. 合并前暂停确认');
  const rule13End = prompt.indexOf('14. 发布真实执行');
  const rule13Section =
    rule13Start !== -1 && rule13End !== -1 && rule13End > rule13Start
      ? prompt.slice(rule13Start, rule13End)
      : null;
  mustMatch(
    mergeCardSection,
    [
      '合并前置状态',
      /评审.{0,30}清零.{0,60}测试.{0,30}通过.{0,60}CI.{0,20}success/,
      `只有用户本人回复「确认合并/继续」才放行执行 ${M - 3}/${M} PR 合并`,
      '禁止代替用户确认、禁止未获确认就合并、禁止假装已合并',
      `收到确认前不得执行合并，不得输出 ${M - 3}/${M} 内容`,
      `「确认合并/继续」→ 放行 ${M - 3}/${M} PR 合并`,
      '「补充：<意见>」→ 结合意见修正 PR 后重新确认',
      '「停止」→ 终止后续阶段，按用户意见处理',
      /待合并 PR：#<编号>（commit <sha>）/,
      '用户已确认合并，见：<位置>',
      new RegExp(`@CodeBuddy 接力 NPC_TEAM skill，执行 ${M - 3}\\/${M} PR 合并：`),
    ],
    `合并确认卡缺少必要要素（须含合并前置状态：评审清零/测试通过/CI success、用户确认才放行、收到确认前不得执行合并、确认合并/继续→放行映射、用户命令三选一完整（继续/补充/停止）、禁止未确认就合并/假装已合并、${M - 3}/${M} 合并召唤话术示例）`
  );
  // CR 第 18 轮修复（追加 9 轮循环 R8）：合并确认卡段内补「9/12 → 10/12 接力衔接」强校验——
  // 此前 9.5 只校验 9/12 合并召唤话术，合并棒完成后如何进入 10/12 发布（独立发布棒召唤）无校验，
  // 若该链路描述被删/改 CI 不拦截，接力模式下合并后无法规范进入发布阶段。
  mustMatch(
    mergeCardSection,
    [
      new RegExp(`@CodeBuddy 接力 NPC_TEAM skill，执行 ${M - 2}\\/${M} 发布：`),
      new RegExp(`${M - 3}\\/${M} 合并棒完成后`),
      new RegExp(`${M - 2}\\/${M} 发布`),
    ],
    `合并确认卡缺少 ${M - 3}/${M}→${M - 2}/${M} 接力衔接（须含：${M - 3}/${M} 合并棒完成后输出【接力卡】、${M - 2}/${M} 发布召唤话术 @CodeBuddy 接力 NPC_TEAM skill，执行 ${M - 2}/${M} 发布：、${M - 2}/${M} 发布棒由 DEV 执行四要素）`
  );
  // 铁律 13 禁止细节强校验（CR 第 2 轮修复：防铁律 13 被删空壳仍通过）
  checkSection(
    rule13Section,
    [
      `只有用户本人回复「确认合并/继续」才放行执行 ${M - 3}/${M} 合并`,
      '禁止代替用户确认、禁止未获确认就合并、禁止假装已合并',
      '未真实 merge-pull 不得宣称已合并',
    ],
    `铁律 13 缺少禁止细节（须含：只有用户回复「确认合并/继续」才放行 ${M - 3}/${M} 合并、禁止代替用户确认/未获确认就合并/假装已合并、未真实 merge-pull 不得宣称已合并）`
  );

  // ---- 9.6 发布真实执行（Issue #76 最新补充：发布形成四要素）----
  // 用户要求"发布（更新版本号、发布形成changelog、发布产物）" + "补充：发布（补充形成Release Notes）"。
  // 因此 10/12 发布必须真实执行四要素并留痕：① 更新版本号 ② 形成 CHANGELOG ③ 发布产物 ④ 形成 Release Notes；
  // 禁止只输出"已发布"却缺任一要素（防发布造假）。
  const RELAY_RELEASE_CORE = [
    '14. 发布真实执行',
    '① 版本号（package.json 等）',
    '② CHANGELOG（含本次变更）',
    '③ 发布产物（构建/制品/标签）',
    '④ Release Notes（发布到 Release/对应页面）',
    '禁止只输出"已发布"却缺任一要素',
  ];
  let releaseLastIdx = -1;
  for (const frag of RELAY_RELEASE_CORE) {
    const idx = prompt.indexOf(frag);
    if (idx === -1)
      errors.push(
        `发布四要素缺少完整句式「${frag}」（${M - 2}/${M} 发布必须真实执行版本号/CHANGELOG/发布产物/Release Notes 四要素并留痕）`
      );
    else if (idx < releaseLastIdx)
      errors.push(
        `发布四要素句式顺序错乱：「${frag}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
      );
    else releaseLastIdx = idx;
  }

  // ---- 10. 接力模式（每步独立调用 @CodeBuddy，Issue #76 最新补充）----
  // 背景：用户要求"每一步都独立调一次 @CodeBuddy NPC，而不是调一次 @CodeBuddy 跑完全部步骤"。
  // 因此提示词默认改为「接力模式」：每次召唤只执行一个步骤，输出【接力卡】后停下，用户逐步召唤下一棒。
  // 全程模式（一次跑完全部步骤）仅在用户明确要求时可用。
  // 本节强校验：若「每步独立调用/接力」核心要素被删，CI 拦截（防回退为"一次跑完"旧行为）。
  const RELAY_CORE = [
    '【运行模式（每次调用先自检）】',
    '接力模式（默认）',
    '只执行一个步骤',
    '绝不自行继续',
    '11. 接力只执行一步',
    '12. 接力卡必含召唤话术',
    `【任务书（1/${M} 创建，随接力卡逐棒传递）】`,
    '用户命令记录（继续/补充/停止，CP3 含确认合并）',
    '【接力卡（接力模式每步结束时必须输出）】',
    `【接力卡·N/${M} 阶段名】`,
    '下一步召唤话术',
  ];
  // CR 第 17 轮修复（追加 9 轮循环 R7）：RELAY_CORE 补充运行模式判断逻辑句式——
  // 判断逻辑是每次调用先自检的入口，此前仅校验模式声明，判断逻辑被删/改（如删全程模式触发分支、
  // 改默认模式）时 CI 不拦截，接力/全程切换契约可能被静默破坏。
  const RELAY_JUDGE_CORE = [
    '判断：① 明确要求一次跑完 → 全程',
    '② 带上一棒【接力卡】/任务书 → 接力续棒',
    '③ 新需求 → 默认接力',
  ];
  let relayJudgeLastIdx = -1;
  for (const frag of RELAY_JUDGE_CORE) {
    const idx = prompt.indexOf(frag);
    if (idx === -1)
      errors.push(
        `运行模式判断缺少完整句式「${frag}」（每次调用须先自检：明确要求一次跑完→全程模式；带接力卡/任务书→接力续棒；新需求→默认接力）`
      );
    else if (idx < relayJudgeLastIdx)
      errors.push(
        `运行模式判断句式顺序错乱：「${frag}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
      );
    else relayJudgeLastIdx = idx;
  }
  let relayLastIdx = -1;
  for (const frag of RELAY_CORE) {
    const idx = prompt.indexOf(frag);
    if (idx === -1)
      errors.push(
        `接力模式缺少完整句式「${frag}」（每次召唤必须只执行一步并输出接力卡，防回退为一次跑完全部步骤）`
      );
    else if (idx < relayLastIdx)
      errors.push(
        `接力模式句式顺序错乱：「${frag}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
      );
    else relayLastIdx = idx;
  }
  // 评审-修复循环例外（PR #123 第 2 轮评审 W3）：运行模式「接力模式」描述须同步声明评审-修复循环自动连续执行例外
  // （与铁律 8/11 一致，防运行模式硬性措辞覆盖铁律 8 的例外语义）
  const relayModeSection = (sectionOf('【运行模式') || {}).full || null;
  if (
    relayModeSection !== null &&
    !/接力模式（默认）：每次召唤\*\*只执行一个步骤\*\*/.test(relayModeSection)
  )
    errors.push('运行模式缺少「接力模式（默认）」声明（每次召唤须默认只执行一步并输出接力卡）');
  if (relayModeSection === null)
    errors.push(
      '运行模式段落不可达：无法校验「评审-修复循环自动连续执行」例外声明（运行模式/铁律锚点缺失或顺序错乱）'
    );
  checkSection(
    relayModeSection,
    '6/13 评审-修复循环自动连续执行',
    `运行模式「接力模式」描述缺少评审-修复循环自动连续执行例外声明（须同步铁律 8，防运行模式覆盖铁律 8 例外语义）`
  );
  // 接力卡必含「下一步召唤话术」格式（用户原样复制即可触发下一棒）。须限定【接力卡】段内校验，
  // 否则留痕卡段（10b）同句式跨段假阳性（实测段内示例被删仍 exit 0，第 1 轮 C1 盲区）。
  // 标签与示例句都须在段内（C2）；第 7 轮 W1/W2 统一用 sliceSection（区间不可达显式报错）。
  // 接力卡段：**内含以【开头的子卡**（【接力卡·N/M 阶段名】），故按「段头 .. 下一个顶层段」区间取，
  // 不能用「下一行以【开头」截断（会只截到引导语）。
  const relayCardSection = sectionBetween('【接力卡（', `【评审-修复循环留痕卡`);
  mustMatch(
    relayCardSection,
    [
      '- 下一步召唤话术：',
      new RegExp(`@CodeBuddy 接力 NPC_TEAM skill，执行下一步 N\\+1\\/${M} <阶段名>：`),
    ],
    `接力卡缺少「下一步召唤话术」（含标签与示例 @CodeBuddy 接力 NPC_TEAM skill，执行下一步 N+1/${M} <阶段名>：）`
  );
  // CR 第 16 轮修复（追加 9 轮循环 R6）：【接力卡】段首引导语强校验——
  // 此前仅校验召唤话术，引导语「全程模式不输出接力卡、改为 ⏸CP1/⏸CP2 暂停卡 + ⏸CP3【合并确认卡】」
  // 被删/改（如改成全程模式也输出接力卡）时 CI 不拦截，全程/接力模式输出契约可能被静默破坏；
  // 且第 4 轮修复只改了【暂停确认】段引导语，本段残留旧口径「⏸CP1/⏸CP2/⏸CP3 暂停卡」未被发现（漏网之鱼）。
  mustMatch(
    relayCardSection,
    [
      '仅接力模式需输出',
      /全程模式不输出接力卡，改为 ⏸CP0\/⏸CP1\/⏸CP2\/⏸CP2\.5 暂停卡 \+ ⏸CP3【合并确认卡】/,
    ],
    '接力卡段首引导语不符合全程/接力输出契约（须含：仅接力模式需输出；全程模式不输出接力卡，改为 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 暂停卡 + ⏸CP3【合并确认卡】）'
  );
  // 全程模式仅为可选（默认必须为接力模式）：若提示词缺失「接力模式（默认、推荐）」已在上方强校验，
  // 再校验「全程模式」声明存在（防只剩接力没有全程，或两者都丢）
  if (!/全程模式/.test(prompt))
    warnings.push('提示词未声明「全程模式」（可选：用户明确要求一次跑完时使用）');

  // ---- 10b. 评审-修复循环自动连续执行 + 每步留痕（Issue #76 最新补充）----
  // 背景：用户要求"6/12 评审-修复循环自动进行，不用暂停、采用接力模式（自动继续），每步独立调用 @CodeBuddy"；
  // 并澄清"是每步在 PR 留痕，而不是每轮"。
  // 因此 6/12 评审-修复循环在接力模式下**自动连续执行**：用户要求跑 N 轮时，同一次召唤内自动跑完 N 轮直至清零，
  // 中途不暂停、无需逐棒手动召唤；但**每一步（评审/修复/复评）都必须在 PR 分别回复留痕（留痕以「每步」为粒度而非「每轮」）**。
  // 本节强校验：若「每步留痕 / 自动连续执行」核心要素被删，CI 拦截（防评审-修复假装进行/漏步留痕）。
  const RELAY_REVIEW_CORE = [
    `8. 评审-修复循环（接力模式下自动连续执行）`,
    '循环执行直至问题清零',
    '每一步（评审棒 / 修复棒 / 复评棒）都必须在 PR 中分别回复留痕',
    '留痕以「每步」为粒度而非「每轮」',
    '同一次召唤内自动连续执行',
    '无需逐棒手动召唤、中途不暂停',
    '每步留痕必须真实可核实，否则视为假装执行',
    `【评审-修复循环留痕卡（${M - 7}/${M} 自动连续执行时使用）】`,
    '【评审留痕·第 R 轮·评审棒】',
    '【修复留痕·第 R 轮·修复棒】',
    '【复评留痕·第 R 轮·复评棒】',
  ];
  // 自动连续执行铁律 8 段限定校验 + 全局卡标题校验：前 6 句在铁律 8 段（8. 至 9. 之间），卡标题全局唯一。
  const rule8Start = prompt.indexOf(`8. 评审-修复循环（接力模式下自动连续执行）`);
  const rule8End = prompt.indexOf('9. 测试失败跳转');
  const rule8Section =
    rule8Start !== -1 && rule8End !== -1 && rule8End > rule8Start
      ? prompt.slice(rule8Start, rule8End)
      : null;
  const coreSearchTarget = rule8Section !== null ? rule8Section : prompt;
  let relayReviewLastIdx = -1;
  const coreFrags = RELAY_REVIEW_CORE.slice(0, 6); // 铁律 8 专属
  const cardFrags = RELAY_REVIEW_CORE.slice(6); // 卡段标题（全局唯一，用 prompt）
  const searchTargets = [
    ...coreFrags.map(f => ({ f, scope: coreSearchTarget })),
    ...cardFrags.map(f => ({ f, scope: prompt })),
  ];
  for (const { f, scope } of searchTargets) {
    const idx = scope.indexOf(f);
    if (idx === -1)
      errors.push(
        `评审-修复自动连续循环缺少完整句式「${f}」（${M - 7}/${M} 评审-修复循环须自动连续执行，且每一步（评审/修复/复评）在 PR 分别留痕，留痕以「每步」为粒度而非「每轮」，防假装进行）`
      );
    else if (idx < relayReviewLastIdx)
      errors.push(
        `评审-修复自动连续循环句式顺序错乱：「${f}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
      );
    else relayReviewLastIdx = idx;
  }
  // 循环留痕卡段内专属字段（复评结论/已累计轮次/留痕要求）段内顺序校验
  // 循环留痕卡段：**多行**（含评审/修复/复评三块），故不能按「下一行以【开头」截断 ——
  // 用「段头 .. 【暂停确认】」区间（暂停确认是本段之后的固定段，属结构不变量，非阶段号）。
  const loopCardStart = PROMPT_LINES.findIndex(l => l.startsWith('【评审-修复循环留痕卡'));
  const loopCardEnd = PROMPT_LINES.findIndex((l, i) => i > loopCardStart && l.startsWith('【暂停确认'));
  const loopCardSection =
    loopCardStart === -1 || loopCardEnd === -1
      ? null
      : PROMPT_LINES.slice(loopCardStart, loopCardEnd).join('\n');
  const LOOP_CARD_CORE = [
    '本轮评审结论：🔴需修复（问题清单）',
    '已累计轮次：第 R 轮',
    '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） / 🟢已清零（已达有效下限轮次 max(10, 用户要求 N)，转 7/13 测试）',
    '转 7/13 测试需独立召唤下一棒',
    '缺任一步留痕即视为假装执行',
  ];
  if (loopCardSection !== null) {
    let loopCardLastIdx = -1;
    for (const f of LOOP_CARD_CORE) {
      const idx = loopCardSection.indexOf(f);
      if (idx === -1)
        errors.push(
          `评审-修复循环留痕卡缺少完整句式「${f}」（6/${M} 循环内每步留痕/计轮口径/转 7/${M} 语义须完整，防提前放行）`
        );
      else if (idx < loopCardLastIdx)
        errors.push(
          `评审-修复循环留痕卡句式顺序错乱：「${f}」出现在其声明顺序之前（疑似插入干扰文本拆解语义）`
        );
      else loopCardLastIdx = idx;
    }
  }
  // 循环收尾必须输出【评审-修复循环汇总卡】（PR #123 第 6 轮评审 C6）：汇总 R 轮每步 PR 留痕位置，
  // 是自动连续循环审计产物。卡名自身须强校验——LOOP_CARD_CORE 的「转 7/12」「每步留痕必须真实可核实」
  // 恰巧来自汇总卡这一行，删整行会间接拦截，但改名/挪走该行则 CI 漏检，故补卡名硬校验。
  checkSection(
    loopCardSection,
    '【评审-修复循环汇总卡】',
    '循环收尾缺少「【评审-修复循环汇总卡】」卡名（须输出汇总卡汇总 R 轮每步 PR 留痕位置，防审计语义被削弱）'
  );
  const reviewMarkSection = (sectionOf('【评审留痕·第 R 轮·评审棒】') || {}).full || null;
  if (reviewMarkSection !== null && !/本步留痕：<PR 评审记录位置>/.test(reviewMarkSection))
    errors.push('评审留痕块缺少「本步留痕：<PR 评审记录位置>」字段（每步须在 PR 留痕）');
  const fixMarkSection = (sectionOf('【修复留痕·第 R 轮·修复棒】') || {}).full || null;
  if (fixMarkSection !== null && !/本步留痕：<修复提交位置>/.test(fixMarkSection))
    errors.push('修复留痕块缺少「本步留痕：<修复提交位置>」字段（每步须在 PR 留痕）');
  const reReviewMarkSection = (sectionOf('【复评留痕·第 R 轮·复评棒】') || {}).full || null;
  if (
    reReviewMarkSection !== null &&
    !/本步留痕：<复评记录位置>/.test(reReviewMarkSection)
  )
    errors.push('复评留痕块缺少「本步留痕：<复评记录位置>」字段（每步须在 PR 留痕）');

  // ---- 9.7 文档级合并/发布覆盖（CR 第 3 轮评审）----
  // 9.5/9.6 只覆盖提示词内部；【流水线】主链 / 工作流程三行 / 门禁表两行 / 暂停确认表 CP3 行 /
  // 角色卡片 PM·DEV 合并发布职责被整删时仍漏检。修复：存在性强校验（只保证未被整删）。

  // ① 提示词【流水线】段主链（段内定位，防其他段落同词命中）
  // CR 第 6 轮修复：三节点除存在性校验外增加顺序校验（⏸CP3 合并确认 → 9/12 PR 合并 → 10/12 发布 递增 indexOf）
  const pipelineSection = (sectionOf('【流水线') || {}).body || null;
  if (pipelineSection !== null) {
    const pipelineFrags = [
      '⏸CP3 合并确认',
      `${M - 3}/${M} PR 合并`,
      `${M - 2}/${M} 发布`,
    ];
    let pipelineLastIdx = -1;
    let pipelineBroken = false;
    for (const frag of pipelineFrags) {
      const idx = pipelineSection.indexOf(frag);
      if (idx === -1) {
        pipelineBroken = true;
        break;
      }
      if (idx < pipelineLastIdx) pipelineBroken = true;
      pipelineLastIdx = idx;
    }
    if (pipelineBroken)
      errors.push(
        `提示词【流水线】段缺少合并/发布节点或顺序错乱（须含 ⏸CP3 合并确认 → ${M - 3}/${M} PR 合并 → ${M - 2}/${M} 发布 完整主链，防主流程丢失合并/发布阶段）`
      );
  }

  // ② 工作流程三行（文档级）——CR 第 4 轮修复：改用 sliceContentSection 统一区间定位，
  // 锚点缺失时显式报错（此前 indexOf 失败静默返回 null，删标题即可绕过校验）
  // CR 第 6 轮修复：三行除存在性校验外增加关键语义强校验（防行保留但语义被删）
  const workflowSection = sliceContentSection(`## 工作流程（${M} 阶段流水线）`, '### 两种执行方式');
  checkSection(
    workflowSection,
    ['⏸ CP3 合并确认', `阶段 ${M - 3}/${M} PR 合并`, `阶段 ${M - 2}/${M} 发布`],
    `工作流程缺少合并/发布阶段行（须含 ⏸ CP3 合并确认 / 阶段 ${M - 3}/${M} PR 合并 / 阶段 ${M - 2}/${M} 发布，防执行细化丢失合并/发布）`
  );
  // R5-1 修复：工作流程 7/12 需求覆盖度检查行（文档级）——新增需求覆盖度检查 + ⏸CP2.5 后
  // 须在工作流程段补充校验，防文档工作流程与实际流水线脱节（实测删除后 exit 0）。
  checkSection(
    workflowSection,
    ['需求覆盖度检查', '⏸ CP2.5 需求覆盖确认', '覆盖度矩阵'],
    '工作流程缺少需求覆盖度检查/⏸CP2.5 行（须含 需求覆盖度检查 / 覆盖度矩阵 / ⏸ CP2.5 需求覆盖确认，防执行细化丢失需求覆盖确认）'
  );
  // CR 第 6 轮修复：行内关键语义强校验（合并行须真实 merge-pull + CI success + 留痕；发布行须四要素）
  // CR 第 7 轮修复：正则放宽空白（防行内加空格/文本重排误拦），并补「留痕合并结果」语义强校验（防漏检）
  // CR 第 9 轮修复：评审行「每步分别回复留痕」句式强校验（防工作流程评审行丢留痕纪律）
  mustMatch(
    workflowSection,
    [
      new RegExp(`阶段 ${M - 3}\\/${M} PR 合并（PM）→ \\*\\*真实 merge-pull\\*\\*`),
      /合并前 CI 须 success/,
      /留痕合并结果/,
      new RegExp(`阶段 ${M - 2}\\/${M} 发布（DEV）→ \\*\\*四要素\\*\\*`),
      /每一步（评审\/修复\/复评）均须在 PR 中分别回复留痕，留痕以「每步」为粒度而非「每轮」/,
      new RegExp(`阶段 ${M - 4}\\/${M} 文档更新（DEV\\+PO）→ \\*\\*按本次需求开发 \\/ bug 整改`),
    ],
    '工作流程合并/发布/评审/文档行语义不完整（合并行须含：真实 merge-pull、合并前 CI 须 success、留痕合并结果；发布行须含：**四要素**；评审行须含：每一步（评审/修复/复评）均须在 PR 中分别回复留痕，留痕以「每步」为粒度而非「每轮」；文档行须含：按本次需求开发/bug 整改同步修改完善项目相关文档）'
  );

  // ③ 门禁表两行（文档级）
  const gateSection = sliceContentSection(
    '### 真实执行与循环门禁',
    '## 与"逐个召唤自建 NPC"的对比'
  );
  checkSection(
    gateSection,
    ['合并前暂停确认（⏸CP3）', '发布真实执行（四要素）'],
    '门禁表缺少合并/发布门禁行（须含「合并前暂停确认（⏸CP3）」与「发布真实执行（四要素）」，防防幻觉清单缺失）'
  );
  // R7-1 修复：门禁表需求覆盖度检查行（文档级）——需求覆盖度检查是与合并/发布同级的质量门禁，
  // 防门禁表未补需求覆盖度行而 CI 不拦截（文档防幻觉清单与新增门禁脱节）。
  checkSection(
    gateSection,
    '需求覆盖度检查（⏸CP2.5）',
    '门禁表缺少「需求覆盖度检查（⏸CP2.5）」门禁行'
  );
  // CR 第 6 轮修复：门禁表行内关键语义强校验（防行保留但禁止细节/四要素被删）
  // CR 第 7 轮修复：正则放宽空白分隔（防行内加空格/重排误拦）
  mustMatch(
    gateSection,
    [
      /只有\s*用户\s*本人\s*回复「确认合并\/继续」\s*才\s*放行合并/,
      /禁止代替确认、禁止未获确认就合并、禁止假装已合并/,
      /① 更新版本号（package\.json 等）/,
      /④ 形成 Release Notes/,
    ],
    '门禁表合并/发布行语义不完整（合并行须含：只有用户确认才放行、禁止代替确认/未获确认就合并/假装已合并；发布行须含四要素 ① 更新版本号 ② CHANGELOG ③ 发布产物 ④ Release Notes）'
  );

  // ④ 暂停确认表 CP3 行（文档级）
  const pauseSection = sliceContentSection('### 暂停确认机制', '### 真实执行与循环门禁');
  checkSection(
    pauseSection,
    '⏸ CP3 合并确认',
    '暂停确认表缺少「⏸ CP3 合并确认」行（4 暂停点体系不完整）'
  );
  // R4-1 修复：暂停确认表 CP2.5 行（文档级）——新增 ⏸CP2.5 后须与 CP3 行对称校验，
  // 防文档暂停确认表被删 CP2.5 行而 CI 不拦截（实测删除后 exit 0）。
  checkSection(
    pauseSection,
    '⏸ CP2.5 需求覆盖确认',
    '暂停确认表缺少「⏸ CP2.5 需求覆盖确认」行（4 暂停点体系不完整）'
  );
  // CR 第 6 轮修复：CP3 行前置状态可核实性强校验（评审清零/测试通过/CI success 关键词）
  // CR 第 7 轮修复：正则放宽空白（防文本重排误拦），改为宽松的关键词组合校验
  mustMatch(
    pauseSection,
    [/评审\s*清零/, /测试\s*通过/, /CI\s*success/],
    '暂停确认表 CP3 行缺少前置状态可核实性（须含：评审清零/测试通过/CI success）'
  );

  // ⑤ 角色卡片职责（提示词内）
  if (cardSeg) {
    const cards = cardSeg.body;
    if (!/PM｜.*主持全部暂停点.*执行 10\/\d+ 合并/s.test(cards))
      errors.push(`角色卡片 PM 缺少合并职责（须含：主持全部暂停点、执行 ${M - 3}/${M} 合并）`);
    if (!/DEV｜.*\d+\/\d+ 发布四要素/s.test(cards))
      errors.push(`角色卡片 DEV 缺少发布职责（须含：${M - 2}/${M} 发布四要素）`);
    // CR 第 9 轮修复：CR 卡「每步（评审棒/修复棒/复评棒）分别回复留痕」强校验
    // （铁律 8 留痕纪律在 CR 角色行为契约中的落点，删除后评审角色可能只循环不留痕）
    if (
      !/CR｜.*每一步（评审棒\/修复棒\/复评棒）均须在 PR 中分别回复留痕（留痕以「每步」为粒度而非「每轮」）/s.test(
        cards
      )
    )
      errors.push(
        '角色卡片 CR 缺少留痕纪律（须含：每一步（评审棒/修复棒/复评棒）均须在 PR 中分别回复留痕（留痕以「每步」为粒度而非「每轮」））'
      );
  }

  // ⑥ 冒烟测试方法 C 段落（文档级）——CR 第 12 轮修复（追加 9 轮循环 R2）新增：
  // 第 11 轮将 R 计轮口径统一为「三棒同轮、复评未清零转第 R+1 轮、清零独立召唤 7/12」，
  // 但方法 C 段落（评审-修复自动连续循环的端到端验收标准）若残留旧口径（R+1/12、已清零直接转），
  // 用户按文档验收会得到错误预期。该段此前不在 9.7 文档级覆盖范围，删改后 CI 不拦截。
  const smokeCSection = sliceContentSection(
    '**方法 C（评审-修复自动连续循环，仅当用户明确要求跑 N 轮时适用）**',
    '**方法 D（合并确认接力）**'
  );
  // CR 第 28 轮修复：移除简单可缩豁免后缀（用户明确要求「至少 10 轮 保留」）——
  // 已清零分支硬性要求完整句（已清零（且已达至少 10 轮）→ 独立召唤 7/12 测试）。
  // 最新修订：用户要求「每步在 PR 留痕，而不是每轮」+「评审-修复循环自动连续执行（不用暂停）」——
  // 方法 C 须验收：同一次召唤内自动连续跑完 N 轮、每步（评审/修复/复评）在 PR 分别留痕、中途不暂停。
  mustMatch(
    smokeCSection,
    [
      '同一次召唤内自动连续执行',
      /每一步（评审\/修复\/复评）都必须在 PR 中分别回复留痕（留痕以「每步」为粒度而非「每轮」）/,
      /复评结论未清零 → 自动继续下一轮评审/,
      new RegExp(`已清零（且已达有效下限轮次 max\\(10, 用户要求 N\\)）→ 独立召唤 7\\/${M} 测试`),
      /中途不暂停、无需逐棒手动召唤/,
    ],
    `冒烟测试方法 C 未同步新语义（须含：同一次召唤内自动连续执行；每一步（评审/修复/复评）在 PR 分别回复留痕，留痕以「每步」为粒度而非「每轮」；复评未清零 → 自动继续下一轮；已清零（且已达有效下限轮次 max(10, 用户要求 N)）→ 独立召唤 7/${M} 测试；中途不暂停、无需逐棒手动召唤）`
  );

  // ⑦ 冒烟测试方法 E（全程模式回退验证）——CR 第 13 轮修复（追加 9 轮循环 R3）新增：
  // 方法 E 声明「一次跑完全部步骤 → 单次会话跑完，但 ⏸CP1/⏸CP2/⏸CP3 暂停确认与留痕门禁仍生效」，
  // 是全程模式与接力模式边界约束的验收标准；此前无文档级覆盖，删改后 CI 不拦截。
  const smokeESection = sliceContentSection(
    '**方法 E（全程模式回退验证）**',
    '### 2. 冒烟测试（端到端，2 分钟）'
  );
  mustMatch(
    smokeESection,
    /⏸CP1\/⏸CP2\/⏸CP2\.5\/⏸CP3 暂停确认与留痕门禁仍生效/,
    '冒烟测试方法 E 缺少全程模式边界约束（须含：一次跑完全部步骤时 ⏸CP1/⏸CP2/⏸CP2.5/⏸CP3 暂停确认与留痕门禁仍生效）'
  );

  // ⑨ 冒烟测试方法 F（需求覆盖度检查验证）——R8-1 修复新增：
  // 方法 F 声明需求覆盖度检查 + ⏸CP2.5 确认全覆盖后才进入文档，是需求覆盖门禁的端到端验收标准。
  const smokeFSection = sliceContentSection(
    '**方法 F（需求覆盖度检查验证）**',
    '### 2. 冒烟测试（端到端，2 分钟）'
  );
  mustMatch(
    smokeFSection,
    [
      '需求覆盖度检查',
      '⏸CP2.5 需求覆盖确认',
      '覆盖度矩阵',
      new RegExp(`用户确认需求全覆盖后才进入 ${M - 4}\\/${M} 文档`),
    ],
    '冒烟测试方法 F 缺少需求覆盖度检查语义（须含：需求覆盖度检查 / 覆盖度矩阵 / ⏸CP2.5 需求覆盖确认 / 用户确认需求全覆盖后才进入文档）'
  );

  // ⑧ 冒烟测试方法 D（合并确认接力）——CR 第 25 轮修复新增，为 ⏸CP3 的端到端验收标准：
  // ① 未获用户回复绝不执行 9/12 合并（铁律 13 在冒烟层的落点）；② 确认后把合并话术发给下一次召唤
  // → 9/12 真实 merge-pull 并留痕。此前无文档级覆盖（实测删两处关键句均 exit 0）。
  const smokeDSection = sliceContentSection(
    '**方法 D（合并确认接力）**',
    '**方法 E（全程模式回退验证）**'
  );
  // CR 第 27 轮修复（本轮 5 轮循环 R4/W1）：方法 D 除确认前暂停外，还须含「真实 merge-pull 并留痕」
  // ——删「真实」/删「9/12 棒真实 merge-pull 并留痕合并结果」整句此前实测 exit 0 漏检（防假装合并）。
  mustMatch(
    smokeDSection,
    [
      new RegExp(`未获用户回复「确认合并\\/继续」绝不执行 ${M - 3}\\/${M} 合并`),
      /把合并召唤话术发给下一次召唤/,
      new RegExp(`${M - 3}\\/${M} 棒真实 merge-pull 并留痕`),
    ],
    `冒烟测试方法 D 缺少合并确认接力语义（须含：未获用户回复「确认合并/继续」绝不执行 ${M - 3}/${M} 合并；用户确认后把合并召唤话术发给下一次召唤 → ${M - 3}/${M} 棒真实 merge-pull 并留痕合并结果）`
  );

  // ⑩ 冒烟测试验证点表（需求覆盖度 + 暂停确认含 CP2.5）——R9-1 修复新增：
  // 冒烟测试「验证点/通过标准」表须含 CP2.5 暂停确认与需求覆盖度检查验证点，
  // 防冒烟验收标准与实际流水线（4 暂停点 + 需求覆盖度检查）脱节。
  const smokeVerifyTable = sliceContentSection('| 验证点', '> 实测');
  mustMatch(
    smokeVerifyTable,
    [
      /到 CP0\/CP1\/CP2\/CP2\.5\/CP3 时输出暂停卡/,
      /CP2\.5 未获「需求全覆盖确认」不进入文档/,
      '需求覆盖度检查（⏸CP2.5）',
    ],
    '冒烟测试验证点表缺少需求覆盖度/CP2.5（须含：到 CP1/CP2/CP2.5/CP3 暂停确认、CP2.5 未获需求全覆盖确认不进入文档、需求覆盖度检查（⏸CP2.5）验证点）'
  );
}

// ---- 11. 文档级边界声明 ----
const docSections = ['关键边界', '本地', '平台'];
for (const s of docSections) {
  if (!content.includes(s)) warnings.push(`文档缺少「${s}」相关边界说明`);
}

// ---- 12. NPC_TEAM Skill 双源一致性（Issue #76 新增：一键调用 skill 方案）----
// 背景：docs/NPC_TEAM.md 是提示词唯一权威源，.codebuddy/skills/npc-team/SKILL.md 是可自动加载的 skill 版。
// 若两者正文漂移（skill 改老 / 提示词改新），用户用 skill 一句话调用时行为可能与文档不一致。
// 因此 CI 强制校验：skill 存在 + frontmatter 合法 + 提示词正文与 docs 提示词完全一致（归一化空白后）。
const SKILL_FILE = path.resolve(__dirname, '../.codebuddy/skills/npc-team/SKILL.md');
if (!fs.existsSync(SKILL_FILE)) {
  errors.push(
    '缺少 NPC_TEAM Skill（.codebuddy/skills/npc-team/SKILL.md 不存在，一键调用方案不可用）'
  );
} else {
  const skillContent = fs.readFileSync(SKILL_FILE, 'utf8');

  // 11.1 frontmatter 必须合法（name/description 齐全）
  const fm = skillContent.match(/^---\r?\n(?<fm>[\s\S]*?)\r?\n---\r?\n/);
  if (!fm || !/^name:\s*.+$/m.test(fm.groups.fm) || !/^description:\s*.+$/m.test(fm.groups.fm)) {
    errors.push('NPC_TEAM Skill frontmatter 非法（需含 name 与 description 字段）');
    // frontmatter 缺失时无有效锚点，跳过 11.2 正文校验（避免报错叠加与逻辑穿透）
  } else {
    // name 应为 npc-team
    if (!/^name:\s*npc-team\s*$/m.test(fm.groups.fm))
      errors.push(
        'NPC_TEAM Skill 的 name 应为 npc-team（当前不匹配，导致无法被 @CodeBuddy 按名加载）'
      );

    // 11.1b description 触发词一致性（防静默失效：description 缺触发词 → NPC 不加载 Skill）
    // 触发词须与 docs/NPC_TEAM.md「使用方式一」保持一致；description 是 NPC 自动加载的唯一依据，
    // 若只更新正文而漏掉 description，用户仍无法用一句话触发，双源校验必须覆盖到 description。
    // 规则单一源：scripts/lib/npc-team-triggers.js（validate 与 sync 共用，防两处硬编码失同步）。
    const descLine = fm.groups.fm.match(/^description:\s*.+$/m);
    const desc = descLine ? descLine[0] : '';
    const { ok, missing } = checkDesc(desc);
    if (!ok)
      errors.push(
        'NPC_TEAM Skill description 缺少必要触发词：' +
          missing.join('、') +
          '（NPC 可能无法自动加载）'
      );

    // 11.1c docs 触发词交集校验：docs/NPC_TEAM.md「使用方式一」明示的触发短语必须全部出现在 description 中，
    // 防单边新增（docs 新加触发词但 description 未同步）导致用户按新文档说法无法触发。
    // 规则单一源：scripts/lib/npc-team-triggers.js 的 DOC_DESC_TRIGGERS。
    const { missing: missingDoc } = checkDescAgainstDocs(desc);
    if (missingDoc.length > 0)
      errors.push(
        'NPC_TEAM Skill description 与 docs 触发词交集缺失：' +
          missingDoc.join('、') +
          '（docs 使用方式一已明示，description 未同步，用户按文档说法将无法触发）'
      );

    // 11.1d description 阶段号一致性（Issue #383 QA-D2）：
    // description 是人工维护字段（sync 不自动改写），曾残留旧阶段号（6/12 等）而正文已迁 13。
    // 判据单源 = checkDescStageNumbers（STAGE_COUNT 为唯一真值），M !== STAGE_COUNT 即报。
    const descStage = checkDescStageNumbers(desc, STAGE_COUNT);
    if (!descStage.ok)
      errors.push(
        'NPC_TEAM Skill description 阶段号与阶段总数不一致：' +
          descStage.stale.join('、') +
          `（应为 N/${STAGE_COUNT}，唯一真值 = STAGE_COUNT，Issue #383 QA-D2）`
      );

    // 11.2 提取 skill 正文（去掉 frontmatter 与开头的说明段，起点为身份声明句）
    // 仅在 frontmatter 合法时执行（fm 存在且 name/description 齐全），避免报错叠加与逻辑穿透
    const skillBody = skillContent.replace(fm[0], '');
    const bodyStart = skillBody.indexOf('你是「NPC Team 总指挥」，由官方免费');
    if (bodyStart === -1) {
      errors.push('NPC_TEAM Skill 缺少身份声明句（你是「NPC Team 总指挥」，由官方免费...）');
    } else {
      // 11.2a preamble（说明段）语义检查：说明段须明确引用 docs/NPC_TEAM.md 并声明「一致/等价」，
      // 防止说明段与实际关系脱钩（docs 提示词大改而 SKILL 说明段仍声称“完全一致”）。
      const preamble = skillBody.slice(0, bodyStart);
      if (!/docs\/NPC_TEAM\.md/.test(preamble) || !/完全一致|一致|等价/.test(preamble))
        warnings.push(
          'NPC_TEAM Skill 说明段未明确声明“与 docs/NPC_TEAM.md 一致/等价”（建议补充，防声明与实际脱钩）'
        );

      const skillPrompt = skillBody.slice(bodyStart).trim();
      const docPrompt = promptSource.ok ? promptSource.prompt : '';
      if (!docPrompt) {
        errors.push('无法提取 docs 提示词正文，无法进行 Skill 双源一致性校验');
      } else if (normalize(skillPrompt) !== normalize(docPrompt)) {
        errors.push(
          'NPC_TEAM Skill 正文与 docs/NPC_TEAM.md 提示词不一致（改提示词须同步改 skill，或反之）。' +
            '请运行 scripts/sync-npc-team-skill.js 自动同步，或手动保持一致'
        );
      } else {
        // 第 10 轮评审 W2：normalize 去空白比较会忽略「行首缩进」等纯格式差异，
        // 导致第 5 轮 I1 类修复（docs 缩进统一、SKILL 未重新生成）静默失同步。
        // 增加格式级比较：按行比较「行首缩进 + 行内内容（去行尾空白）」，缩进差异直接拦截。
        const fmtDiff = formatDiff(skillPrompt, docPrompt);
        if (fmtDiff.length > 0) {
          errors.push(
            'NPC_TEAM Skill 正文与 docs/NPC_TEAM.md 提示词存在格式级差异（行首缩进不一致）：' +
              fmtDiff.slice(0, 3).join('； ') +
              '。请运行 scripts/sync-npc-team-skill.js 自动同步'
          );
        }
      }
    }
  }
}

// ---- 输出 ----
let failed = false;
for (const e of errors) {
  failed = true;
  console.error(`❌ ${e}`);
}
for (const w of warnings) console.warn(`⚠️  ${w}`);

if (failed) {
  console.error(`\n✖ NPC Team 提示词校验失败：${errors.length} 个错误`);
  process.exit(1);
}
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ NPC Team 提示词校验通过（无错误、无警告）');
} else {
  console.log(
    `\n✅ NPC Team 提示词校验通过（${errors.length} 错误 / ${warnings.length} 警告，警告不阻塞）`
  );
}
