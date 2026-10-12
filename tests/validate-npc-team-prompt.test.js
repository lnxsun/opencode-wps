/**
 * NPC Team 提示词校验脚本回归测试（PR #88 第 7 轮评审整改）
 *
 * 背景：scripts/validate-npc-team-prompt.js 是"防假装进行/防编造全绿"的最后防线，
 * 但此前无自动化测试，第 4/5/6/7 轮评审发现的"删约束仍通过"类逃生口
 * 全部依赖评审轮次的手工负向验证才能暴露。本文件将各轮实跑的负向攻击
 * 固化为回归用例，守护校验防线本身不被未来修改静默破坏。
 *
 * 运行：node tests/validate-npc-team-prompt.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FILE = path.join(__dirname, '..', 'docs', 'NPC_TEAM.md');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'validate-npc-team-prompt.js');
const SKILL_FILE = path.join(__dirname, '..', '.codebuddy', 'skills', 'npc-team', 'SKILL.md');

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

// ---- 提取提示词代码块（与校验脚本同一锚点逻辑）----
function readPrompt() {
  const content = fs.readFileSync(FILE, 'utf8');
  const m = content.match(/```text\n# NPC_TEAM_PROMPT_START[^\n]*\n([\s\S]*?)\n```/);
  if (!m) throw new Error('未找到提示词代码块锚点');
  return { content, prompt: m[1] };
}

// ---- 在临时副本上改写提示词并运行校验脚本，返回退出码 ----
function runValidate(rewriteFn) {
  return runValidateCapture(rewriteFn).code;
}

// 在临时副本上改写提示词并运行校验脚本，返回 { code, output }（第 1 轮评审 C2：
// 部分用例需要断言拦截路径，区分「接力校验错误」与「双源一致性错误」假阳性）
function runValidateCapture(rewriteFn) {
  const { content, prompt } = readPrompt();
  const rewritten = content.replace(prompt, rewriteFn(prompt));
  // 备份并写入临时改写
  const tmp = FILE + '.tmp';
  const backup = FILE + '.bak';
  fs.writeFileSync(tmp, rewritten);
  fs.renameSync(FILE, backup);
  fs.renameSync(tmp, FILE);
  let code;
  let output = '';
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    code = r.status;
    output = (r.stdout || '') + (r.stderr || '');
  } finally {
    // 无论成功失败都还原，并清理临时文件（第 8 轮评审：防工作区残留 .tmp/.bak）
    fs.renameSync(FILE, tmp);
    fs.renameSync(backup, FILE);
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* 已不存在则忽略 */
    }
    try {
      fs.unlinkSync(backup);
    } catch (_) {
      /* 已不存在则忽略 */
    }
  }
  return { code, output };
}

// ---- 第 3 轮评审新增：全文改写辅助函数（文档级校验用例用）----
// 与 runValidateCapture 的区别：改写整个 content（含提示词代码块外的文档结构：
// 工作流程、门禁表、暂停确认表等），并同步 skill 双源（防双源不一致干扰断言）。
function runValidateCaptureFull(rewriteFn) {
  const { content } = readPrompt();
  const rewritten = rewriteFn(content);
  const tmp = FILE + '.tmp';
  const backup = FILE + '.bak';
  const tmpS = SKILL_FILE + '.tmp';
  const bakS = SKILL_FILE + '.bak';
  // CR 第 20 轮修复（追加 12 轮循环 R1）：先备份原始 SKILL.md 内容——
  // sync-npc-team-skill.js 是直接 writeFileSync 写入（不产生 .tmp 文件），
  // 旧还原条件 fs.existsSync(SKILL_FILE + '.tmp') 永远不成立，导致变异提示词
  // 永久污染 SKILL.md（实测 diff 45 字符）。改为 finally 无条件按原内容写回。
  const origSkill = fs.readFileSync(SKILL_FILE, 'utf8');
  fs.writeFileSync(tmp, rewritten);
  fs.renameSync(FILE, backup);
  fs.renameSync(tmp, FILE);
  // 同步 skill：运行 sync 脚本使双源一致（文档级改动会同时影响正文）
  let syncOut = '';
  try {
    const { spawnSync } = require('child_process');
    const s = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'sync-npc-team-skill.js')], {
      encoding: 'utf8',
    });
    syncOut = (s.stdout || '') + (s.stderr || '');
  } catch (_) {}
  let code;
  let output = '';
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    code = r.status;
    output = (r.stdout || '') + (r.stderr || '');
  } finally {
    fs.renameSync(FILE, tmp);
    fs.renameSync(backup, FILE);
    // 还原 skill：无条件按备份原内容写回（sync 直接 writeFileSync，无 .tmp 可探测）
    fs.writeFileSync(SKILL_FILE, origSkill);
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
    try {
      fs.unlinkSync(backup);
    } catch (_) {}
  }
  return { code, output, syncOut };
}

// ---- 用例 ----

test('正向：现有提示词通过校验（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '正向应 exit 0');
});

test('负向：删铁律 8「至少进行 10 轮彻底循环」（第 4 轮逃生口回归）', function () {
  const code = runValidate(p =>
    p.replace(
      '6/13 至少进行 10 轮彻底的 PR review 与修复循环（**评审轮数不得以简单为由缩减**）',
      '**至少进行 PR review 与修复循环**'
    )
  );
  assertEqual(code, 1, '删 10 轮要求应拦截（exit 1）');
});

test('负向：删铁律 8「每一步（评审棒/修复棒/复评棒）都必须在 PR 中分别回复留痕」（第 4 轮逃生口回归）', function () {
  const code = runValidate(p =>
    p.replace(
      '**每一步（评审棒 / 修复棒 / 复评棒）都必须在 PR 中分别回复留痕**（评审记录 / 修复说明+提交 / 复评记录）',
      ''
    )
  );
  assertEqual(code, 1, '删每步留痕声明应拦截（exit 1）');
});

test('负向：删铁律 8「循环执行直至问题清零」（第 5 轮逃生口回归）', function () {
  const code = runValidate(p => p.replace('**循环执行直至问题清零**，', '修复后复评；'));
  assertEqual(code, 1, '删循环清零应拦截（exit 1）');
});

test('负向：删铁律 8「禁止以简单为由缩减轮数」句（CR 第 28 轮回归）', function () {
  const code = runValidate(p =>
    p.replace('**评审轮数不得以简单为由缩减**）', '**评审轮数不得以简单为由缩减**。')
  );
  assertEqual(code, 1, '删禁止简单可缩句应拦截（exit 1）');
});

test('负向：删铁律 7 反幻觉细节（第 6 轮逃生口回归）', function () {
  const code = runValidate(p =>
    p.replace(
      '；**禁止假装执行**（禁止只输出一句"已完成"却没有可核实的痕迹，禁止用不存在的模拟器/测试谎报结果，禁止未真实合并却宣称已合并、未真实发布却宣称已发布）',
      '；**禁止假装执行**'
    )
  );
  assertEqual(code, 1, '删可核实/谎报应拦截（exit 1）');
});

test('负向：铁律 8 插入干扰句打乱顺序（第 6 轮顺序校验回归）', function () {
  const code = runValidate(p =>
    p.replace(
      '6/13 至少进行 10 轮彻底的 PR review 与修复循环（**评审轮数不得以简单为由缩减**）',
      '**评审轮数不得以简单为由缩减**；发现的问题必须全部修复'
    )
  );
  assertEqual(code, 1, '打乱顺序应拦截（exit 1）');
});

test('负向：删铁律 7「留下可见回复/记录」句（第 7 轮 9.1 跨行贪婪回归）', function () {
  const code = runValidate(p =>
    p.replace(
      '并在对应 Issue 或 PR 上留下**可见回复/记录**（评论、评审、提交、CI 记录、合并记录、Release 等）；',
      '；'
    )
  );
  assertEqual(code, 1, '删铁律 7 留痕句应拦截（exit 1）');
});

// ---- Issue #76：接力模式（每步独立调用 @CodeBuddy）回归用例 ----
// 背景：用户最新要求"每一步都独立调一次 @CodeBuddy NPC，而不是调一次 @CodeBuddy 跑完全部步骤"。
// 提示词默认改为「接力模式」：每次召唤只执行一步并输出【接力卡】，逐步接力跑完全流程。
// 若接力核心要素被删（回退为"一次跑完"旧行为），CI 必须拦截。

test('正向：接力模式要素完整（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '接力模式要素完整应 exit 0');
});

test('负向：删「接力模式（默认、推荐）」应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace(
      '【运行模式（每次调用先自检）】接力模式（默认）：每次召唤',
      '- 全程模式：用户每次召唤你，'
    )
  );
  assertEqual(code, 1, '删接力默认声明应拦截（exit 1）');
});

test('负向：删「只执行一个步骤」应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace(
      '接力模式（默认）：每次召唤**只执行一个步骤**，执行完输出【接力卡】后停下',
      '你**一次跑完全部步骤**，'
    )
  );
  assertEqual(code, 1, '删只执行一步应拦截（exit 1）');
});

test('负向：删铁律 11「接力只执行一步」应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace('11. 接力只执行一步：每次被召唤只执行一个步骤，', '11. ')
  );
  assertEqual(code, 1, '删铁律 11 应拦截（exit 1）');
});

test('负向：删【接力卡】段应拦截（exit 1）', function () {
  const code = runValidate(p => p.replace('【接力卡（接力模式每步结束时必须输出）】', ''));
  assertEqual(code, 1, '删接力卡段应拦截（exit 1）');
});

test('负向：删「下一步召唤话术」应拦截（exit 1）', function () {
  // 第 1 轮评审 C2 修复：原用例用 String.replace 只替换第一个匹配，实际删的是【接力卡】段句子，
  // 评审/修复留痕卡段仍含相同句式 → 接力校验未真正失效，exit=1 靠「双源一致性」假阳性拦截。
  // 现改用全量替换（split/join 删除所有出现处），并断言拦截路径为接力校验错误。
  const { code, output } = runValidateCapture(p =>
    p.split('- 下一步召唤话术：').join('- 下一步：')
  );
  assertEqual(code, 1, '删下一步召唤话术应拦截（exit 1）');
  assertTrue(
    /接力卡缺少「下一步召唤话术」/.test(output),
    '应命中接力校验错误（而非双源一致性假阳性），实际输出：' + output
  );
});

test('负向：删「绝不自行继续、绝不代替用户召唤下一棒」应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace('执行完必须输出【接力卡】并立即停下', '执行完必须输出【接力卡】并立即停下；')
  );
  assertEqual(code, 1, '删绝不自行继续、绝不代替用户召唤下一棒应拦截（exit 1）');
});

test('负向：删【任务书】段应拦截（exit 1）', function () {
  const code = runValidate(p => p.replace('【任务书（1/13 创建，随接力卡逐棒传递）】', ''));
  assertEqual(code, 1, '删任务书段应拦截（exit 1）');
});

test('负向：删接力卡召唤话术示例「@CodeBuddy 接力 NPC_TEAM skill」应拦截（exit 1）', function () {
  // 第 1 轮评审 C2 修复：原用例只替换第一个匹配（删的是【接力卡】段），评审/修复留痕卡段仍含
  // 相同句式 → 接力校验未真正失效，exit=1 靠「双源一致性」假阳性拦截。
  // 现改为：仅删除【接力卡】段内的召唤话术示例（定位到该段再替换），并断言命中接力校验错误。
  // PR #123 第 5 轮修复：结束锚点从旧「【评审接力卡】」改为新「【评审-修复循环留痕卡】」。
  const { code, output } = runValidateCapture(p => {
    const sectionStart = p.indexOf('【接力卡（接力模式每步结束时必须输出）】');
    const sectionEnd = p.indexOf('【评审-修复循环留痕卡（6/13 自动连续执行时使用）】');
    const head = p.slice(0, sectionStart);
    const section = p
      .slice(sectionStart, sectionEnd)
      .replace(
        '@CodeBuddy 接力 NPC_TEAM skill，执行下一步 N+1/13 <阶段名>：',
        '@CodeBuddy 执行下一步：'
      );
    const tail = p.slice(sectionEnd);
    return head + section + tail;
  });
  assertEqual(code, 1, '删接力召唤话术示例应拦截（exit 1）');
  assertTrue(
    /接力卡缺少「下一步召唤话术」/.test(output),
    '应命中接力校验错误（而非双源一致性假阳性），实际输出：' + output
  );
});

// ---- Issue #76：评审-修复循环自动连续执行 + 每步留痕（用户最新要求：自动继续、不用暂停、每步在 PR 留痕而非每轮）----
// 背景：用户要求"5 轮独立的 PR review 与修复循环还是不能自动进行，中间还是会暂停，要求...采用接力模式（自动继续，不用暂停），
// 每步独立调用 @CodeBuddy"；并澄清"是每步在 PR 留痕，而不是每轮"。
// 因此 6/13 评审-修复循环在接力模式下**自动连续执行**：用户要求跑 N 轮时，同一次召唤内自动跑完 N 轮直至清零，
// 中途不暂停、无需逐棒手动召唤；但**每一步（评审/修复/复评）都必须在 PR 分别回复留痕（留痕以「每步」为粒度而非「每轮」）**。
// 若评审-修复循环核心要素被删（回退为手动逐棒暂停、或漏步留痕），CI 必须拦截。

test('正向：评审-修复自动连续循环要素完整（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '评审-修复自动连续循环要素完整应 exit 0');
});

test('负向：删铁律 8「接力模式下自动连续执行」声明应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace('8. 评审-修复循环（接力模式下自动连续执行）：', '8. 评审-修复循环（10 轮彻底循环）：')
  );
  assertEqual(code, 1, '删评审-修复自动连续声明应拦截（exit 1）');
});

test('负向：删铁律 8「每步留痕/非每轮」声明应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => {
    const start = p.indexOf('8. 评审-修复循环（接力模式下自动连续执行）');
    const end = p.indexOf('9. 测试失败跳转');
    const head = p.slice(0, start);
    const rule8 = p.slice(start, end).replace('**留痕以「每步」为粒度而非「每轮」**', '');
    const tail = p.slice(end);
    return head + rule8 + tail;
  });
  assertEqual(code, 1, '删每步留痕声明应拦截（exit 1）');
  assertTrue(
    /评审-修复自动连续循环缺少完整句式/.test(output),
    '应命中铁律 8 段内校验，实际输出：' + output
  );
});

test('负向：删铁律 8「无需逐棒手动召唤、中途不暂停」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => {
    const start = p.indexOf('8. 评审-修复循环（接力模式下自动连续执行）');
    const end = p.indexOf('9. 测试失败跳转');
    const head = p.slice(0, start);
    const rule8 = p.slice(start, end).replace('（无需逐棒手动召唤、中途不暂停）', '');
    const tail = p.slice(end);
    return head + rule8 + tail;
  });
  assertEqual(code, 1, '删自动连续（不暂停）声明应拦截（exit 1）');
  assertTrue(
    /评审-修复自动连续循环缺少完整句式/.test(output),
    '应命中铁律 8 段内校验，实际输出：' + output
  );
});

test('负向：删铁律 8「同一次召唤内自动连续执行」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '**接力模式下同一次召唤内自动连续执行（无需逐棒手动召唤、中途不暂停）**',
      '接力模式下不自动连续执行'
    )
  );
  assertEqual(code, 1, '删同一次召唤内自动连续执行应拦截（exit 1）');
  assertTrue(
    /评审-修复自动连续循环缺少完整句式/.test(output),
    '应命中铁律 8 段内校验，实际输出：' + output
  );
});

test('负向：删铁律 8「每步留痕必须真实可核实，否则视为假装执行」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('；**接力模式下同一次召唤内自动连续执行（无需逐棒手动召唤、中途不暂停）**；', '。')
  );
  assertEqual(code, 1, '删每步留痕真实可核实应拦截（exit 1）');
  assertTrue(
    /评审-修复自动连续循环缺少完整句式/.test(output),
    '应命中铁律 8 段内校验，实际输出：' + output
  );
});

test('负向：删【评审-修复循环留痕卡】段应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace('【评审-修复循环留痕卡（6/13 自动连续执行时使用）】', '')
  );
  assertEqual(code, 1, '删评审-修复循环留痕卡段应拦截（exit 1）');
});

test('负向：删【评审留痕·第 R 轮·评审棒】块应拦截（exit 1）', function () {
  const code = runValidate(p => p.replace('【评审留痕·第 R 轮·评审棒】', ''));
  assertEqual(code, 1, '删评审留痕块应拦截（exit 1）');
});

test('负向：删【修复留痕·第 R 轮·修复棒】块应拦截（exit 1）', function () {
  const code = runValidate(p => p.replace('【修复留痕·第 R 轮·修复棒】', ''));
  assertEqual(code, 1, '删修复留痕块应拦截（exit 1）');
});

test('负向：删【复评留痕·第 R 轮·复评棒】块应拦截（exit 1）', function () {
  const code = runValidate(p => p.replace('【复评留痕·第 R 轮·复评棒】', ''));
  assertEqual(code, 1, '删复评留痕块应拦截（exit 1）');
});

test('负向：删评审留痕块「本步留痕」位置字段应拦截（exit 1）', function () {
  // 每步在 PR 留痕以「本步留痕」位置字段为落点，删除后该步即失去留痕要求 → 应拦截。
  const { code, output } = runValidateCapture(p => {
    const sectionStart = p.indexOf('【评审留痕·第 R 轮·评审棒】');
    const sectionEnd = p.indexOf('【修复留痕·第 R 轮·修复棒】');
    const head = p.slice(0, sectionStart);
    const section = p
      .slice(sectionStart, sectionEnd)
      .replace('本步留痕：<PR 评审记录位置>', '本步结论：已评审');
    const tail = p.slice(sectionEnd);
    return head + section + tail;
  });
  assertEqual(code, 1, '删评审本步留痕字段应拦截（exit 1）');
  assertTrue(
    /评审留痕块缺少「本步留痕：<PR 评审记录位置>」/.test(output),
    '应命中评审留痕块段化校验，实际输出：' + output
  );
});

test('负向：删复评留痕块「本步留痕」位置字段应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => {
    const sectionStart = p.indexOf('【复评留痕·第 R 轮·复评棒】');
    const sectionEnd = p.indexOf('【暂停确认】');
    const head = p.slice(0, sectionStart);
    const section = p
      .slice(sectionStart, sectionEnd)
      .replace('本步留痕：<复评记录位置>', '本步结论：已复评');
    const tail = p.slice(sectionEnd);
    return head + section + tail;
  });
  assertEqual(code, 1, '删复评本步留痕字段应拦截（exit 1）');
  assertTrue(
    /复评留痕块缺少「本步留痕：<复评记录位置>」/.test(output),
    '应命中复评留痕块段化校验，实际输出：' + output
  );
});

test('负向：删【评审-修复循环汇总卡】卡名应拦截（exit 1）', function () {
  // PR #123 第 6 轮评审 C6：循环收尾须输出【评审-修复循环汇总卡】，卡名自身强校验。
  // 若仅删卡名（保留内容短语），LOOP_CARD_CORE 的「转 7/13」「每步留痕必须真实可核实」仍命中，
  // 但汇总卡审计语义被削弱——本用例确保卡名丢失被拦截。
  const { code, output } = runValidateCapture(p =>
    p.replace('【评审-修复循环汇总卡】', '【循环汇总卡】')
  );
  assertEqual(code, 1, '改汇总卡卡名应拦截（exit 1）');
  assertTrue(
    /循环收尾缺少「【评审-修复循环汇总卡】」卡名/.test(output),
    '应命中汇总卡卡名校验，实际输出：' + output
  );
});

test('负向：删循环留痕卡「已累计轮次」句应拦截（exit 1）', function () {
  // 已累计轮次在评审/修复/复评三个留痕块各出现一次；全部删除才会触发循环留痕卡段内强校验。
  const { code, output } = runValidateCapture(p => {
    const sectionStart = p.indexOf('【评审-修复循环留痕卡（6/13 自动连续执行时使用）】');
    const sectionEnd = p.indexOf('【暂停确认】');
    const head = p.slice(0, sectionStart);
    const section = p.slice(sectionStart, sectionEnd).replace(/ - 已累计轮次：第 R 轮/g, '');
    const tail = p.slice(sectionEnd);
    return head + section + tail;
  });
  assertEqual(code, 1, '删循环留痕卡已累计轮次句应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式/.test(output),
    '应命中循环留痕卡段内句式校验，实际输出：' + output
  );
});

test('负向：删循环留痕卡「每步留痕必须真实可核实，缺任一步即视为假装执行」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('缺任一步留痕即视为假装执行', '留痕以轮为单位汇总。')
  );
  assertEqual(code, 1, '删缺步即假装执行句应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式「缺任一步留痕即视为假装执行」/.test(output),
    '应命中循环留痕卡段内句式校验，实际输出：' + output
  );
});

test('负向：删循环留痕卡「转 7/13 测试需独立召唤下一棒」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('；转 7/13 测试需独立召唤下一棒（铁律 11）', '（继续执行 7/12 测试）')
  );
  assertEqual(code, 1, '删转 7/13 独立召唤句应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式/.test(output),
    '应命中循环留痕卡段内句式校验，实际输出：' + output
  );
});

test('负向：删复评结论双分支应拦截（exit 1）', function () {
  const code = runValidate(p =>
    p.replace(
      '- 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） / 🟢已清零（已达有效下限轮次 max(10, 用户要求 N)，转 7/13 测试）',
      '- 复评结论：🟢通过'
    )
  );
  assertEqual(code, 1, '删复评结论双分支应拦截（exit 1）');
});

test('负向：双源同步删循环留痕卡「每步留痕」字段应拦截（exit 1）', function () {
  // 模拟用户改 docs 提示词（删循环留痕卡本步留痕字段）未同步 skill，段化校验应拦截。
  const code = withSkillFile(fs.readFileSync(SKILL_FILE, 'utf8'), () => {
    const { content, prompt } = readPrompt();
    const rewritten = content.replace(
      prompt,
      prompt.replace('本步留痕：<PR 评审记录位置>', '本步结论：已评审')
    );
    // 与 runValidateCapture 相同的临时副本机制
    const tmp = FILE + '.tmp';
    const backup = FILE + '.bak';
    fs.writeFileSync(tmp, rewritten);
    fs.renameSync(FILE, backup);
    fs.renameSync(tmp, FILE);
    try {
      const { spawnSync } = require('child_process');
      const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
      return { code: r.status, output: (r.stdout || '') + (r.stderr || '') };
    } finally {
      fs.renameSync(FILE, tmp);
      fs.renameSync(backup, FILE);
      try {
        fs.unlinkSync(tmp);
        fs.unlinkSync(backup);
      } catch (_) {}
    }
  });
  assertEqual(code.code, 1, '双源删循环留痕卡每步留痕字段应拦截（exit 1）');
  assertTrue(
    /评审留痕块缺少「本步留痕：<PR 评审记录位置>」/.test(code.output),
    '应命中评审留痕块段化校验，实际输出：' + code.output
  );
});

// ---- Issue #76 第 2 轮评审 C1/C2：复评闭环（复评留痕 + 循环留痕卡强校验）----
// 背景：自动连续循环声明「评审棒→修复棒→复评棒→下一轮…」，复评棒行为须定义在循环留痕卡中；
// 且每步（评审/修复/复评）都必须在 PR 分别留痕。若复评结论/留痕要求被删，CI 必须拦截。

test('正向：复评留痕闭环要素完整（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '复评留痕闭环要素完整应 exit 0');
});

test('负向：删【暂停确认】锚点应报「段化校验区间不可达」（exit 1）', function () {
  // 第 7 轮评审 W1 新增：sliceSection 区间不可达（锚点被删）时须显式报错，而非静默跳过段化校验。
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '【暂停确认】到 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 时输出暂停卡并停下',
      '【暂停点】到 ⏸CP1/⏸CP2 时输出暂停卡并停下'
    )
  );
  assertEqual(code, 1, '删暂停确认锚点应拦截（exit 1）');
  assertTrue(/【暂停确认】/.test(output), '应命中段化校验区间不可达错误，实际输出：' + output);
});

// ---- Issue #76：PR 合并（合并前暂停待用户确认）与发布（四要素）回归用例 ----
// 背景：用户最新要求"再加上PR合并（在合并前需暂停待用户确认）、发布（更新版本号、发布形成changelog、发布产物）"
// + "补充：发布（补充形成Release Notes）"。因此 9/13 PR 合并前必须停到 ⏸CP3（输出【合并确认卡】，
// 只有用户本人回复「确认合并/继续」才放行合并，禁止未确认就合并/假装已合并）；
// 10/13 发布必须真实执行四要素（① 更新版本号 ② 形成 CHANGELOG ③ 发布产物 ④ 形成 Release Notes）并留痕。

// 段内定位【合并确认卡】段并改写的辅助函数
function replaceInMergeCard(p, fn) {
  const sectionStart = p.indexOf(
    '【合并确认卡（⏸CP3：9/13 文档后、10/13 合并前，待用户确认合并）】'
  );
  const sectionEnd = p.indexOf('【角色切换】');
  const head = p.slice(0, sectionStart);
  const section = fn(p.slice(sectionStart, sectionEnd));
  const tail = p.slice(sectionEnd);
  return head + section + tail;
}

test('正向：合并确认（⏸CP3）要素完整（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '合并确认要素完整应 exit 0');
});

test('负向：删铁律 13「合并前暂停确认」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '13. 合并前暂停确认：到 ⏸CP3（9/13 文档后、10/13 合并前）停下输出【合并确认卡】',
      '13. 合并前自动执行：流水线到 ⏸CP3'
    )
  );
  assertEqual(code, 1, '删合并前暂停声明应拦截（exit 1）');
  assertTrue(
    /合并确认缺少完整句式「13\. 合并前暂停确认」/.test(output),
    '应命中合并确认强校验，实际输出：' + output
  );
});

test('负向：删【合并确认卡】段应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('【合并确认卡（⏸CP3：9/13 文档后、10/13 合并前，待用户确认合并）】', '')
  );
  assertEqual(code, 1, '删合并确认卡段应拦截（exit 1）');
  assertTrue(
    /合并确认缺少完整句式「【合并确认卡/.test(output),
    '应命中合并确认卡段缺失校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「合并前置状态」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s =>
      s.replace(
        '- 合并前置状态：评审 ✔ 问题清零（位置）/ 测试 ✔ 通过（位置）/ CI ✔ success（位置）',
        '- 前置状态：已就绪'
      )
    )
  );
  assertEqual(code, 1, '删合并前置状态应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「只有用户确认才放行」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s =>
      s.replace('只有用户本人回复「确认合并/继续」才放行执行 10/13 PR 合并', '确认后自动合并')
    )
  );
  assertEqual(code, 1, '删用户确认才放行应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「禁止未确认就合并/假装已合并」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s =>
      s.replace('禁止代替用户确认、禁止未获确认就合并、禁止假装已合并', '禁止跳过流程')
    )
  );
  assertEqual(code, 1, '删禁止未确认就合并应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡 9/13 合并召唤话术示例应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s =>
      s.replace('@CodeBuddy 接力 NPC_TEAM skill，执行 10/13 PR 合并：', '@CodeBuddy 执行合并：')
    )
  );
  assertEqual(code, 1, '删合并召唤话术应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

// ---- Issue #76 第 2 轮评审：合并门禁（9.5）段内校验盲区回归用例 ----
// 背景：实测删除「收到确认前不得执行合并」/「确认合并/继续→放行」映射 / 用户命令三选一（补充/停止）/ 铁律 13 禁止细节
// 后 validate 均 exit 0 未拦截（校验盲区）。本次补齐段内强校验并新增 5 个负向用例。

test('负向：删合并确认卡「收到确认前不得执行合并」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s => s.replace('- 收到确认前不得执行合并，不得输出 10/13 内容 /', ''))
  );
  assertEqual(code, 1, '删收到确认前不得执行合并应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「待合并 PR」字段应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s => s.replace('- 待合并 PR：#<编号>（commit <sha>） /', ''))
  );
  assertEqual(code, 1, '删待合并 PR 字段应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「用户已确认合并」留痕位置应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s => s.replace('用户已确认合并，见：<位置>', ''))
  );
  assertEqual(code, 1, '删用户已确认合并留痕位置应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「确认合并/继续→放行」映射应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s =>
      s.replace('- 用户命令三选一：「确认合并/继续」→ 放行 10/13 PR 合并；', '')
    )
  );
  assertEqual(code, 1, '删确认合并放行映射应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「补充：<意见>」命令应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s => s.replace('「补充：<意见>」→ 结合意见修正 PR 后重新确认；', ''))
  );
  assertEqual(code, 1, '删合并卡补充命令应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「停止」命令应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    replaceInMergeCard(p, s => s.replace('「停止」→ 终止后续阶段，按用户意见处理 /', ''))
  );
  assertEqual(code, 1, '删合并卡停止命令应拦截（exit 1）');
  assertTrue(
    /合并确认卡缺少必要要素/.test(output),
    '应命中合并确认卡段化校验，实际输出：' + output
  );
});

test('负向：删铁律 13「禁止未获确认就合并/假装已合并」细节应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '**只有用户本人回复「确认合并/继续」才放行执行 10/13 合并**；禁止代替用户确认、禁止未获确认就合并、禁止假装已合并（未真实 merge-pull 不得宣称已合并）。',
      '**只有用户本人回复「确认合并/继续」才放行执行 9/12 合并**。'
    )
  );
  assertEqual(code, 1, '删铁律 13 禁止细节应拦截（exit 1）');
  assertTrue(/铁律 13 缺少禁止细节/.test(output), '应命中铁律 13 强校验，实际输出：' + output);
});

test('正向：发布四要素要素完整（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '发布四要素完整应 exit 0');
});

// ---- Issue #76 第 3 轮评审：文档级合并/发布覆盖回归用例（9.7 新增）----
// 背景：实测删提示词【流水线】主链合并/发布节点、工作流程三行、门禁表两行、暂停确认表 CP3 行、
// 角色卡片 PM/DEV 职责后 validate 均 exit 0 漏检（9.5/9.6 只覆盖铁律与模板卡段）。
// 本次新增 9.7 文档级覆盖校验 + 5 个负向用例。

test('负向：删提示词流水线 ⏸CP3 合并确认节点应拦截（exit 1）', function () {
  // fixture 跟随 #318：流水线段现在每环节带「本环节：」保护行，故按节点逐段删除（不依赖相邻完整句）
  const { code, output } = runValidateCapture(p =>
    p
      .replace(' → ⏸CP3 合并确认 → 10/13 PR 合并', '')
      .replace(' → 10/13 PR 合并(PM，真实 merge-pull 留痕)', '')
      .replace(' → 11/13 发布(DEV)', '')
  );
  assertEqual(code, 1, '删流水线合并/发布节点应拦截（exit 1）');
  assertTrue(
    /提示词【流水线】段缺少合并\/发布节点/.test(output),
    '应命中流水线主链校验，实际输出：' + output
  );
});

test('负向：删工作流程阶段 10/13 发布行应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '阶段 11/13 发布（DEV）→ **四要素**：① 更新版本号（package.json 等）② 形成 CHANGELOG ③ 发布产物（构建/制品/标签）④ 形成 Release Notes（发布说明，发布到 Release/对应页面）\n',
      ''
    )
  );
  assertEqual(code, 1, '删工作流程发布行应拦截（exit 1）');
  assertTrue(
    /工作流程缺少合并\/发布阶段行/.test(output),
    '应命中工作流程校验，实际输出：' + output
  );
});

test('负向：删门禁表「合并前暂停确认（⏸CP3）」行应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(/\| \*\*合并前暂停确认（⏸CP3）\*\*[^\n]*\n/, '')
  );
  assertEqual(code, 1, '删门禁表合并行应拦截（exit 1）');
  assertTrue(/门禁表缺少合并\/发布门禁行/.test(output), '应命中门禁表校验，实际输出：' + output);
});

test('负向：删暂停确认表 ⏸ CP3 合并确认行应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '| **⏸ CP3 合并确认** | 9/13 文档完成后、10/13 合并前 | 待合并 PR 的前置状态是否齐备（评审清零/测试通过/CI success），是否确认合并 |\n',
      ''
    )
  );
  assertEqual(code, 1, '删暂停确认表 CP3 行应拦截（exit 1）');
  assertTrue(
    /暂停确认表缺少「⏸ CP3 合并确认」行/.test(output),
    '应命中暂停确认表校验，实际输出：' + output
  );
});

test('负向：删角色卡片 PM 合并职责应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('主持全部暂停点、进度风险、验收汇报、执行 10/13 合并', '')
  );
  assertEqual(code, 1, '删 PM 合并职责应拦截（exit 1）');
  assertTrue(/角色卡片 PM 缺少合并职责/.test(output), '应命中角色卡片校验，实际输出：' + output);
});

// ---- Issue #76 第 9 轮评审：留痕纪律多处覆盖盲区回归用例 ----
// 背景：实测删 CR 角色卡片「每轮 review 与每次修复均须在 PR 中分别回复留痕」或工作流程评审行同句式
// 后 validate 均 exit 0 漏检（铁律 8 留痕纪律在多处声明的落点未全部纳入强校验）。
// 本次修复：角色卡片 CR 卡 + 工作流程评审行补强校验，新增 2 个负向用例。

test('负向：删角色卡片 CR 留痕纪律应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '每一步（评审棒/修复棒/复评棒）均须在 PR 中分别回复留痕（留痕以「每步」为粒度而非「每轮」）',
      ''
    )
  );
  assertEqual(code, 1, '删 CR 卡留痕纪律应拦截（exit 1）');
  assertTrue(
    /角色卡片 CR 缺少留痕纪律/.test(output),
    '应命中角色卡片 CR 校验，实际输出：' + output
  );
});

test('负向：删工作流程评审行留痕纪律应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '每一步（评审/修复/复评）均须在 PR 中分别回复留痕，留痕以「每步」为粒度而非「每轮」；',
      '**'
    )
  );
  assertEqual(code, 1, '删工作流程评审行留痕纪律应拦截（exit 1）');
  assertTrue(
    /工作流程合并\/发布\/评审\/文档行语义不完整/.test(output),
    '应命中工作流程内容校验，实际输出：' + output
  );
});

// ---- Issue #76 第 4 轮评审：文档级校验锚点缺失回归用例（9.7 sliceContentSection）----
// 背景：实测删/改工作流程、门禁表、暂停确认表的章节标题后，9.7 区间定位静默跳过（exit 0 漏检）。
// 本次修复：新增 sliceContentSection（锚点缺失/区间不可达显式报错），新增 3 个负向用例。

test('负向：改工作流程标题锚点应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('## 工作流程（13 阶段流水线）', '## 工作流程')
  );
  assertEqual(code, 1, '改工作流程标题应拦截（exit 1）');
  assertTrue(
    /文档级校验锚点缺失：「## 工作流程/.test(output),
    '应命中工作流程锚点校验，实际输出：' + output
  );
});

test('负向：改门禁表标题锚点应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('### 真实执行与循环门禁（防幻觉，2026-08 补充）', '### 真实执行门禁（防幻觉）')
  );
  assertEqual(code, 1, '改门禁表标题应拦截（exit 1）');
  assertTrue(
    /文档级校验锚点缺失：「### 真实执行与循环门禁」/.test(output),
    '应命中门禁表锚点校验，实际输出：' + output
  );
});

test('负向：改暂停确认表标题锚点应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('### 暂停确认机制（防跑偏，2026-08 新增）', '### 暂停确认（防跑偏）')
  );
  assertEqual(code, 1, '改暂停确认表标题应拦截（exit 1）');
  assertTrue(
    /文档级校验锚点缺失：「### 暂停确认机制」/.test(output),
    '应命中暂停确认表锚点校验，实际输出：' + output
  );
});

// ---- Issue #76 第 6 轮评审：9.7 文档级校验「内容级」盲区回归用例 ----
// 背景：实测行保留但关键语义被删/改（门禁表四要素/流水线主链顺序/暂停确认表前置状态/工作流程合并语义/门禁表禁止细节）
// 后 validate 均 exit 0 漏检（9.7 只校验存在性不校验内容）。本次修复增加内容级强校验 + 5 个负向用例。

test('负向：删门禁表发布行四要素内容应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      /(\| \*\*发布真实执行（四要素）\*\*[^\n]*?① 更新版本号[^\n]*?④ 形成 Release Notes[^\n]*?\|)/,
      '| **发布真实执行（四要素）** | 10/12 发布必须真实执行 |'
    )
  );
  assertEqual(code, 1, '删门禁表发布行四要素应拦截（exit 1）');
  assertTrue(
    /门禁表合并\/发布行语义不完整/.test(output),
    '应命中门禁表内容校验，实际输出：' + output
  );
});

test('负向：打乱流水线主链合并/发布顺序应拦截（exit 1）', function () {
  // fixture 跟随 #318：把「10/13 发布」整段前移，制造主链顺序错乱（CP3 → 9/13 → 10/13 被打破）
  const { code, output } = runValidateCapture(p => {
    const release = ' → 11/13 发布(DEV)';
    if (!p.includes(release)) throw new Error('测试锚点缺失');
    const cp3 = ' → ⏸CP3 合并确认 → 10/13 PR 合并';
    return p.replace(release, '').replace(cp3, release + cp3);
  });
  assertEqual(code, 1, '打乱流水线主链顺序应拦截（exit 1）');
  assertTrue(
    /提示词【流水线】段缺少合并\/发布节点或顺序错乱/.test(output),
    '应命中流水线主链顺序校验，实际输出：' + output
  );
});

test('负向：删暂停确认表 CP3 前置状态应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '| **⏸ CP3 合并确认** | 9/13 文档完成后、10/13 合并前 | 待合并 PR 的前置状态是否齐备（评审清零/测试通过/CI success），是否确认合并 |\n',
      '| **⏸ CP3 合并确认** | 8/12 文档完成后、9/12 合并前 | 是否确认合并 |'
    )
  );
  assertEqual(code, 1, '删 CP3 前置状态应拦截（exit 1）');
  assertTrue(
    /暂停确认表 CP3 行缺少前置状态可核实性/.test(output),
    '应命中暂停确认表内容校验，实际输出：' + output
  );
});

test('负向：改工作流程 9/13 合并行为自动合并应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '阶段 10/13 PR 合并（PM）→ **真实 merge-pull**（合并前 CI 须 success）→ 在 Issue/PR 留痕合并结果',
      '阶段 9/12 PR 合并（PM）→ 自动合并'
    )
  );
  assertEqual(code, 1, '改工作流程合并语义应拦截（exit 1）');
  assertTrue(
    /工作流程合并\/发布\/评审\/文档行语义不完整/.test(output),
    '应命中工作流程内容校验，实际输出：' + output
  );
});

test('负向：删门禁表合并行禁止细节应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      /(\| \*\*合并前暂停确认（⏸CP3）\*\*[^\n]*?禁止代替确认、禁止未获确认就合并、禁止假装已合并[^\n]*?\|)/,
      '| **合并前暂停确认（⏸CP3）** | 9/12 合并前须确认 |'
    )
  );
  assertEqual(code, 1, '删门禁表合并禁止细节应拦截（exit 1）');
  assertTrue(
    /门禁表合并\/发布行语义不完整/.test(output),
    '应命中门禁表内容校验，实际输出：' + output
  );
});

// ---- Issue #76 第 7 轮评审：9.7 内容级校验误报/漏检修正回归用例 ----
// 背景：① 正则过严（行内加空格/文本重排误拦）；② 工作流程合并行删「留痕合并结果」漏检。
// 本次修复：放宽空白分隔正则 + 补「留痕合并结果」强校验；新增 2 正向（防误报）+ 1 负向（补漏检）用例。

test('正向：门禁表合并行加空格不误拦（exit 0）', function () {
  const code = runValidateCaptureFull(p =>
    p.replace(
      '只有用户本人回复「确认合并/继续」才放行合并',
      '只有 用户本人 回复「确认合并/继续」才放行合并'
    )
  ).code;
  assertEqual(code, 0, '门禁表行内加空格不应误拦（exit 0）');
});

test('正向：暂停确认表 CP3 行文本重排不误拦（exit 0）', function () {
  const code = runValidateCaptureFull(p =>
    p.replace(
      '待合并 PR 的前置状态是否齐备（评审清零/测试通过/CI success），是否确认合并',
      '待合并 PR 前置状态：评审清零 / 测试通过 / CI success；是否确认合并'
    )
  ).code;
  assertEqual(code, 0, 'CP3 行文本重排不应误拦（exit 0）');
});

test('负向：工作流程合并行删留痕合并结果应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '阶段 10/13 PR 合并（PM）→ **真实 merge-pull**（合并前 CI 须 success）→ 在 Issue/PR 留痕合并结果',
      '阶段 9/12 PR 合并（PM）→ **真实 merge-pull**（合并前 CI 须 success）'
    )
  );
  assertEqual(code, 1, '删留痕合并结果应拦截（exit 1）');
  assertTrue(
    /工作流程合并\/发布\/评审\/文档行语义不完整/.test(output),
    '应命中工作流程内容校验，实际输出：' + output
  );
});

test('负向：工作流程 8/13 文档行删「按本次需求/bug 整改」应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '阶段 9/13 文档更新（DEV+PO）→ **按本次需求开发 / bug 整改对应的实际改动，同步修改完善项目相关文档**',
      '阶段 8/12 文档更新（DEV+PO）→ README / CHANGELOG / 使用文档'
    )
  );
  assertEqual(code, 1, '删按本次需求开发/bug 整改同步文档声明应拦截（exit 1）');
  assertTrue(
    /工作流程合并\/发布\/评审\/文档行语义不完整/.test(output),
    '应命中工作流程内容校验，实际输出：' + output
  );
});

test('负向：删铁律 14「发布真实执行」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '14. 发布真实执行：11/13 发布必须**真实产出四要素**并留痕：',
      '14. 发布：10/12 发布可以'
    )
  );
  assertEqual(code, 1, '删发布真实执行声明应拦截（exit 1）');
  assertTrue(
    /发布四要素缺少完整句式「14\. 发布真实执行」/.test(output),
    '应命中发布四要素强校验，实际输出：' + output
  );
});

test('负向：删发布要素①「更新版本号」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('① 版本号（package.json 等）', '① 更新版本')
  );
  assertEqual(code, 1, '删更新版本号要素应拦截（exit 1）');
  assertTrue(
    /发布四要素缺少完整句式「① 版本号（package\.json 等）」/.test(output),
    '应命中发布四要素强校验，实际输出：' + output
  );
});

test('负向：删发布要素②「形成 CHANGELOG」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('② CHANGELOG（含本次变更）', '② 补充变更说明')
  );
  assertEqual(code, 1, '删形成 CHANGELOG 要素应拦截（exit 1）');
  assertTrue(
    /发布四要素缺少完整句式「② CHANGELOG（含本次变更）」/.test(output),
    '应命中发布四要素强校验，实际输出：' + output
  );
});

test('负向：删发布要素③「发布产物」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('③ 发布产物（构建/制品/标签）', '③ 产出构建物')
  );
  assertEqual(code, 1, '删发布产物要素应拦截（exit 1）');
  assertTrue(
    /发布四要素缺少完整句式「③ 发布产物（构建\/制品\/标签）」/.test(output),
    '应命中发布四要素强校验，实际输出：' + output
  );
});

test('负向：删发布要素④「形成 Release Notes」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('④ Release Notes（发布到 Release/对应页面）', '④ 写发布说明')
  );
  assertEqual(code, 1, '删形成 Release Notes 要素应拦截（exit 1）');
  assertTrue(/发布四要素缺少完整句式/.test(output), '应命中发布四要素强校验，实际输出：' + output);
});

test('负向：删发布禁止缺要素句应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('禁止只输出"已发布"却缺任一要素', '禁止只输出"已发布"')
  );
  assertEqual(code, 1, '删发布禁止缺要素句应拦截（exit 1）');
  assertTrue(/发布四要素缺少完整句式/.test(output), '应命中发布四要素强校验，实际输出：' + output);
});

// ---- Issue #76：NPC_TEAM Skill 一键调用方案回归用例 ----

// 统一「临时改坏 SKILL.md → 运行 → finally 还原」的健壮模式（防中途异常污染工作区）
function withSkillFile(content, fn) {
  const original = fs.readFileSync(SKILL_FILE, 'utf8');
  fs.writeFileSync(SKILL_FILE, content);
  let ret;
  try {
    ret = fn();
  } finally {
    fs.writeFileSync(SKILL_FILE, original);
  }
  return ret;
}

test('正向：Skill 与 docs 提示词双源一致（exit 0）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '双源一致应 exit 0');
});

test('负向：Skill 文件缺失应拦截（exit 1）', function () {
  const backup = SKILL_FILE + '.bak';
  const original = fs.readFileSync(SKILL_FILE, 'utf8');
  fs.renameSync(SKILL_FILE, backup);
  let code;
  try {
    const { spawnSync } = require('child_process');
    code = spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status;
  } finally {
    fs.renameSync(backup, SKILL_FILE);
  }
  assertEqual(code, 1, '删 Skill 文件应拦截（exit 1）');
});

test('负向：Skill 正文与 docs 提示词漂移应拦截（exit 1）', function () {
  const code = withSkillFile(
    fs
      .readFileSync(SKILL_FILE, 'utf8')
      .replace('你是「NPC Team 总指挥」', '你是「NPC Team 总指挥官」'),
    () => {
      const { spawnSync } = require('child_process');
      return spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status;
    }
  );
  assertEqual(code, 1, 'Skill 正文漂移应拦截（exit 1）');
});

test('负向：Skill frontmatter name 非 npc-team 应拦截（exit 1）', function () {
  const code = withSkillFile(
    fs.readFileSync(SKILL_FILE, 'utf8').replace('name: npc-team', 'name: npc-teamx'),
    () => {
      const { spawnSync } = require('child_process');
      return spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status;
    }
  );
  assertEqual(code, 1, 'frontmatter name 错误应拦截（exit 1）');
});

test('负向：Skill frontmatter description 缺触发词应拦截（exit 1）', function () {
  const code = withSkillFile(
    fs
      .readFileSync(SKILL_FILE, 'utf8')
      .replace('当用户说"调用 NPC_TEAM skill"、"npc-team"、"NPC Team"', '当用户提到 NPC Team 时'),
    () => {
      const { spawnSync } = require('child_process');
      return spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status;
    }
  );
  assertEqual(code, 1, 'description 缺触发词应拦截（exit 1）');
});

test('负向：Skill description 缺调用短语「调用 NPC_TEAM skill」应拦截（exit 1）', function () {
  const code = withSkillFile(
    fs.readFileSync(SKILL_FILE, 'utf8').replace('当用户说"调用 NPC_TEAM skill"、', '当用户说、'),
    () => {
      const { spawnSync } = require('child_process');
      return spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status;
    }
  );
  assertEqual(code, 1, 'description 缺调用短语应拦截（exit 1）');
});

test('负向：同步脚本 --check 对正文漂移应拦截（exit 1）', function () {
  // 先制造正文漂移：直接改 SKILL 正文身份声明句（不经过 sync），再跑 --check
  const code = withSkillFile(
    fs
      .readFileSync(SKILL_FILE, 'utf8')
      .replace(
        '你是「NPC Team 总指挥」，由官方免费',
        '你是「NPC Team 总指挥」，由官方免费（测试漂移）'
      ),
    () => {
      const { spawnSync } = require('child_process');
      const r = spawnSync(
        'node',
        [path.join(__dirname, '..', 'scripts', 'sync-npc-team-skill.js'), '--check'],
        { encoding: 'utf8' }
      );
      return r.status;
    }
  );
  assertEqual(code, 1, '正文漂移时 --check 应 exit 1');
});

test('负向：同步脚本 --check 对 description 缺触发词应拦截（exit 1）', function () {
  const code = withSkillFile(
    fs
      .readFileSync(SKILL_FILE, 'utf8')
      .replace('当用户说"调用 NPC_TEAM skill"、"npc-team"、"NPC Team"', '当用户提到 NPC Team 时'),
    () => {
      const { spawnSync } = require('child_process');
      const r = spawnSync(
        'node',
        [path.join(__dirname, '..', 'scripts', 'sync-npc-team-skill.js'), '--check'],
        { encoding: 'utf8' }
      );
      return r.status;
    }
  );
  assertEqual(code, 1, 'description 缺触发词时 --check 应 exit 1');
});

test('正向：同步脚本 --check 对一致的双源返回 0', function () {
  const { spawnSync } = require('child_process');
  const r = spawnSync(
    'node',
    [path.join(__dirname, '..', 'scripts', 'sync-npc-team-skill.js'), '--check'],
    {
      encoding: 'utf8',
    }
  );
  assertEqual(r.status, 0, '--check 一致应 exit 0');
});

test('负向：SKILL 缩进漂移应被 validate formatDiff 拦截（exit 1）', function () {
  // 第 10 轮评审 W2 新增：normalize 去空白比较忽略行首缩进，缩进漂移须由 formatDiff 拦截。
  const code = withSkillFile(
    fs
      .readFileSync(SKILL_FILE, 'utf8')
      .replace(
        '（commit <sha>） / - 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） /',
        '（commit <sha>） /  - 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） /'
      ),
    () => {
      const { spawnSync } = require('child_process');
      return spawnSync('node', [SCRIPT], { encoding: 'utf8' }).status;
    }
  );
  assertEqual(code, 1, 'SKILL 缩进漂移应拦截（exit 1）');
});

test('负向：sync --check 对 SKILL 缩进漂移应拦截（exit 1）', function () {
  // 第 10 轮评审 W2 新增：sync --check 须与 validate 口径一致，缩进漂移也拦截。
  const code = withSkillFile(
    fs
      .readFileSync(SKILL_FILE, 'utf8')
      .replace(
        '（commit <sha>） / - 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） /',
        '（commit <sha>） /  - 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） /'
      ),
    () => {
      const { spawnSync } = require('child_process');
      return spawnSync(
        'node',
        [path.join(__dirname, '..', 'scripts', 'sync-npc-team-skill.js'), '--check'],
        {
          encoding: 'utf8',
        }
      ).status;
    }
  );
  assertEqual(code, 1, 'sync --check 缩进漂移应拦截（exit 1）');
});

test('正向：sync 非 check 模式自动修正 SKILL 缩进漂移', function () {
  // 第 10 轮评审 W2 新增：非 check 模式须感知缩进差异并重写修正（此前 normalize 假通过不重写）。
  const drifted = fs
    .readFileSync(SKILL_FILE, 'utf8')
    .replace(
      '（commit <sha>） / - 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） /',
      '（commit <sha>） /  - 复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） /'
    );
  const code = withSkillFile(drifted, () => {
    const { spawnSync } = require('child_process');
    return spawnSync('node', [path.join(__dirname, '..', 'scripts', 'sync-npc-team-skill.js')], {
      encoding: 'utf8',
    }).status;
  });
  assertEqual(code, 0, 'sync 自动修正应 exit 0');
  // 修正后 SKILL 应与 docs 无格式差异（formatDiff 通过）
  const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
  assertEqual(r.status, 0, '修正后 validate 应 exit 0');
});

test('负向：删【流水线】段 1/13 与 2/13 节点字面量应拦截（exit 1）', function () {
  // CR 第 11 轮（追加 9 轮循环 R1）新增：原 includes 子串校验命中 11/13 的 1/13、12/13 的 2/13
  // 子串，删 1/13/2/13 节点仍 exit 0；改【流水线】段内全序校验后必须拦截。
  const { code, output } = runValidateCapture(p => {
    const secStart = p.indexOf('【流水线（13 阶段');
    const secEnd = p.indexOf('\n【', p.indexOf('\n', p.indexOf('\n', secStart)));
    const head = p.slice(0, secStart);
    const section = p
      .slice(secStart, secEnd)
      .replace('1/13 深入分析+需求接收（RES 主持 + PO 提问） → ', '')
      .replace('2/13 拆解分派(PM) → ', '');
    return head + section + p.slice(secEnd);
  });
  assertEqual(code, 1, '删 1/13、2/13 节点应拦截（exit 1）');
  assertTrue(
    /阶段编号 1\/13 缺失|阶段编号 2\/13 缺失|提示词缺少【流水线】段/.test(output),
    '应命中【流水线】段阶段完整性校验，实际输出：' + output
  );
});

test('负向：改【流水线】段 6/13 字面量为 5 应拦截（exit 1）', function () {
  // CR 第 11 轮（追加 9 轮循环 R1）新增：改 6/13 → 5 字面量（保留 11/13/13/13）后仍应拦截。
  const { code, output } = runValidateCapture(p => {
    const secStart = p.indexOf('【流水线（13 阶段');
    const secEnd = p.indexOf('\n【', p.indexOf('\n', p.indexOf('\n', secStart)));
    const head = p.slice(0, secStart);
    const section = p.slice(secStart, secEnd).replace('6/13 评审(', '5 评审(');
    return head + section + p.slice(secEnd);
  });
  assertEqual(code, 1, '改 6/13 → 5 应拦截（exit 1）');
  assertTrue(
    /阶段编号 6\/13 缺失/.test(output),
    '应命中【流水线】段阶段完整性校验，实际输出：' + output
  );
});

test('负向：循环留痕卡已清零分支缺失「至少 10 轮」应拦截（exit 1）', function () {
  // CR 第 21 轮（追加 12 轮循环 R2）新增：已清零分支须重申「至少 10 轮」下限，
  // 改成「已清零 → 转 7/13 测试」应拦截（防第 1 轮清零即放行）。
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） / 🟢已清零（已达有效下限轮次 max(10, 用户要求 N)，转 7/13 测试）',
      '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮评审棒） / 🟢通过（结束循环转 7/12 测试）'
    )
  );
  assertEqual(code, 1, '复评留痕已清零分支缺 10 轮下限应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式「复评结论/.test(output),
    '应命中循环留痕卡段内句式校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 C 残留旧口径（手动逐棒）应拦截（exit 1）', function () {
  // CR 第 12 轮（追加 9 轮循环 R2）新增：方法 C 未同步自动连续语义（残留手动逐棒召唤）时须由 9.7 ⑥ 拦截。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '**方法 C（评审-修复自动连续循环，仅当用户明确要求跑 N 轮时适用）**：跑到 6/13 评审时，若用户明确要求跑 N 轮评审-修复，预期在**同一次召唤内自动连续执行**',
      '**方法 C（评审-修复自动连续循环，仅当用户明确要求跑 N 轮时适用）**：跑到 6/12 评审时，若用户明确要求跑 N 轮评审-修复，预期每轮评审/修复/复评各为独立一次召唤'
    )
  );
  assertEqual(code, 1, '方法 C 残留旧口径应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 C 未同步新语义/.test(output),
    '应命中 9.7 ⑥ 冒烟测试方法 C 校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 C 已清零分支缺失「至少 10 轮」应拦截（exit 1）', function () {
  // CR 第 21 轮（追加 12 轮循环 R2）新增：方法 C 已清零分支须重申「至少 10 轮」下限，
  // 改成「已清零 → 转 7/13 测试」应拦截（防复评棒提前放行进 7/13）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '复评结论未清零 → 自动继续下一轮评审；已清零（且已达有效下限轮次 max(10, 用户要求 N)）→ 独立召唤 7/13 测试',
      '复评结论未清零 → 自动继续下一轮评审；已清零 → 独立召唤 7/12 测试'
    )
  );
  assertEqual(code, 1, '方法 C 已清零分支缺 10 轮下限应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 C 未同步新语义/.test(output),
    '应命中 9.7 ⑥ 冒烟测试方法 C 校验，实际输出：' + output
  );
});

test('负向：复评留痕已清零分支加回「简单可缩」后缀应拦截（CR 第 28 轮回归）', function () {
  // CR 第 28 轮（删除简单可缩）新增：已清零分支硬性要求完整句
  // 「清零且已达至少 10 轮，结束循环转 7/13 测试」——加回「（简单改动可缩）」后缀
  // 违反「至少 10 轮无条件硬性下限」，循环留痕卡完整句匹配失配 → 拦截。
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） / 🟢已清零（已达有效下限轮次 max(10, 用户要求 N)，转 7/13 测试）',
      '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮评审棒） / 🟢通过（清零且已达至少 10 轮（简单改动可缩），结束循环转 7/12 测试）'
    )
  );
  assertEqual(code, 1, '复评留痕加回简单可缩后缀应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式「复评结论/.test(output),
    '应命中循环留痕卡段内句式校验，实际输出：' + output
  );
});

test('负向：循环留痕卡复评结论加回「简单可缩」后缀应拦截（CR 第 28 轮回归）', function () {
  // CR 第 28 轮（删除简单可缩）新增：循环留痕卡复评结论已清零分支硬性要求
  // 「清零且已达至少 10 轮，结束循环转 7/13 测试」——加回「（简单改动可缩）」后缀
  // 违反「至少 10 轮无条件硬性下限」，段内完整句匹配失配 → 拦截。
  const { code, output } = runValidateCapture(p => {
    const sectionStart = p.indexOf('【评审-修复循环留痕卡（6/13 自动连续执行时使用）】');
    const sectionEnd = p.indexOf('【暂停确认】');
    const head = p.slice(0, sectionStart);
    const section = p
      .slice(sectionStart, sectionEnd)
      .replace(
        '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮） / 🟢已清零（已达有效下限轮次 max(10, 用户要求 N)，转 7/13 测试）',
        '复评结论：🔴仍需修复（未清零，自动继续第 R+1 轮评审棒） / 🟢通过（清零且已达至少 10 轮（简单改动可缩），结束循环转 7/12 测试）'
      );
    const tail = p.slice(sectionEnd);
    return head + section + tail;
  });
  assertEqual(code, 1, '循环留痕卡复评结论加回简单可缩后缀应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式「复评结论/.test(output),
    '应命中循环留痕卡复评结论段内校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 C 已清零分支加回「简单可缩」后缀应拦截（CR 第 28 轮回归）', function () {
  // CR 第 28 轮（删除简单可缩）新增：方法 C 已清零分支硬性要求完整句
  // 「已清零（且已达有效下限轮次 max(10, 用户要求 N)）→ 独立召唤 7/13 测试」——加回「（简单改动可缩）」后缀
  // 违反「至少 10 轮无条件硬性下限」，9.7 ⑥ 完整句校验失配 → 拦截。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '复评结论未清零 → 自动继续下一轮评审；已清零（且已达有效下限轮次 max(10, 用户要求 N)）→ 独立召唤 7/13 测试',
      '复评结论未清零 → 自动继续下一轮评审；已清零（且已达至少 10 轮（简单改动可缩））→ 独立召唤 7/12 测试'
    )
  );
  assertEqual(code, 1, '方法 C 加回简单可缩后缀应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 C 未同步新语义/.test(output),
    '应命中 9.7 ⑥ 冒烟测试方法 C 校验，实际输出：' + output
  );
});

test('负向：删【暂停·CP2 开发确认】模板应拦截（exit 1）', function () {
  // CR 第 13 轮（追加 9 轮循环 R3）新增：全程模式第二个强制暂停点须有输出模板，删模板须拦截。
  const code = runValidate(p =>
    p.replace('【暂停·CP2 开发确认】（5/13 后）已完成：1/13→5/13 开发（PR 已建）', '')
  );
  assertEqual(code, 1, '删 CP2 暂停模板应拦截（exit 1）');
});

test('负向：冒烟测试方法 E 删全程模式边界约束应拦截（exit 1）', function () {
  // CR 第 13 轮（追加 9 轮循环 R3）新增：方法 E 声明全程模式暂停确认仍生效，删约束须拦截。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '**方法 E（全程模式回退验证）**：明确说「一次跑完全部步骤」→ 预期：单次会话跑完，但 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5/⏸CP3 暂停确认与留痕门禁仍生效。',
      '**方法 E（全程模式回退验证）**：明确说「一次跑完全部步骤」→ 预期：单次会话跑完，暂停确认失效。'
    )
  );
  assertEqual(code, 1, '方法 E 删边界约束应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 E 缺少全程模式边界约束/.test(output),
    '应命中 9.7 ⑦ 方法 E 校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 C 删自动连续语义应拦截（exit 1）', function () {
  // CR 第 25 轮（本轮 5 轮循环 R3/W1）新增：方法 C 须保留自动连续执行 + 每步留痕语义，
  // 删除方法 C 段内「同一次召唤内自动连续执行」应拦截（防回退为手动逐棒）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '**方法 C（评审-修复自动连续循环，仅当用户明确要求跑 N 轮时适用）**：跑到 6/13 评审时，若用户明确要求跑 N 轮评审-修复，预期在**同一次召唤内自动连续执行**',
      '**方法 C（评审-修复自动连续循环，仅当用户明确要求跑 N 轮时适用）**：跑到 6/12 评审时，若用户明确要求跑 N 轮评审-修复，预期在**分多次召唤执行**'
    )
  );
  assertEqual(code, 1, '方法 C 删自动连续语义应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 C 未同步新语义/.test(output),
    '应命中 9.7 ⑥ 方法 C 校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 D 删「未获用户回复绝不执行 9/13 合并」应拦截（exit 1）', function () {
  // CR 第 25 轮（本轮 5 轮循环 R3/W2）新增：方法 D 是 ⏸CP3 合并确认接力验收标准，
  // 删「未获用户回复绝不执行 9/13 合并」（铁律 13 冒烟层落点）此前实测 exit 0 漏检。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '**未获用户回复「确认合并/继续」绝不执行 10/13 合并**；',
      '**用户确认后可自动执行 9/12 合并**；'
    )
  );
  assertEqual(code, 1, '方法 D 删合并前确认约束应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 D 缺少合并确认接力语义/.test(output),
    '应命中 9.7 ⑧ 方法 D 校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 D 删「真实 merge-pull 并留痕」应拦截（exit 1）', function () {
  // CR 第 27 轮（本轮 5 轮循环 R4/W1）新增：方法 D 除确认前暂停外，还须含「真实 merge-pull 并留痕」——
  // 删「真实」/删「9/13 棒真实 merge-pull 并留痕合并结果」整句此前实测 exit 0 漏检（防假装合并）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '用户确认后，把合并召唤话术发给下一次召唤 → 10/13 棒真实 merge-pull 并留痕合并结果。',
      '用户确认后，把合并召唤话术发给下一次召唤。'
    )
  );
  assertEqual(code, 1, '方法 D 删真实合并留痕语义应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 D 缺少合并确认接力语义/.test(output),
    '应命中 9.7 ⑧ 方法 D 校验，实际输出：' + output
  );
});

test('负向：冒烟测试方法 C 删「中途不暂停、无需逐棒手动召唤」应拦截（exit 1）', function () {
  // CR 第 27 轮（本轮 5 轮循环 R4/W2）新增：方法 C 还须含「中途不暂停、无需逐棒手动召唤」——
  // 用户要求「自动继续、不用暂停」，删后应拦截（防回退为中途暂停等手动召唤）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('，中途不暂停、无需逐棒手动召唤', '')
  );
  assertEqual(code, 1, '方法 C 删不暂停声明应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 C 未同步新语义/.test(output),
    '应命中 9.7 ⑥ 方法 C 校验，实际输出：' + output
  );
});

test('负向：暂停确认引导语未区分 CP3 输出应拦截（exit 1）', function () {
  // CR 第 14 轮（追加 9 轮循环 R4）新增：引导语把 CP3 也归为暂停卡时须拦截（CP3 应输出合并确认卡）。
  const code = runValidate(p =>
    p.replace(
      '【暂停确认】到 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 时输出暂停卡并停下；到 ⏸CP3 时输出【合并确认卡】并停下',
      '【暂停确认】到 ⏸CP1/⏸CP2/⏸CP3 时输出暂停卡并停下'
    )
  );
  assertEqual(code, 1, '引导语未区分 CP3 应拦截（exit 1）');
});

test('负向：删【暂停·CP2 开发确认】模板命令三选一应拦截（exit 1）', function () {
  // CR 第 14 轮（追加 9 轮循环 R4）新增：CP2 模板命令三选一不完整须拦截（防模板与暂停确认表漂移）。
  const code = runValidate(p =>
    p.replace('「继续」→ 确认实现方向正确，继续流水线', '「继续」→ 继续流水线')
  );
  assertEqual(code, 1, 'CP2 模板命令三选一不完整应拦截（exit 1）');
});

test('负向：接力卡段首引导语残留旧口径（CP3 也归暂停卡）应拦截（exit 1）', function () {
  // CR 第 16 轮（追加 9 轮循环 R6）新增：全程模式不输出接力卡、CP3 输出合并确认卡的引导语契约，
  // 残留旧口径「⏸CP1/⏸CP2/⏸CP3 暂停卡」时须拦截。
  const code = runValidate(p =>
    p.replace(
      '> 仅接力模式需输出；全程模式不输出接力卡，改为 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 暂停卡 + ⏸CP3【合并确认卡】。',
      '> 仅接力模式需输出；全程模式（用户明确要求一次跑完）不输出接力卡，改为 ⏸CP1/⏸CP2/⏸CP3 暂停卡。'
    )
  );
  assertEqual(code, 1, '接力卡引导语残留旧口径应拦截（exit 1）');
});

test('负向：删接力卡段首引导语应拦截（exit 1）', function () {
  // CR 第 16 轮（追加 9 轮循环 R6）新增：引导语整体删除须拦截（防全程/接力输出契约丢失）。
  const code = runValidate(p =>
    p.replace(
      '> 仅接力模式需输出；全程模式不输出接力卡，改为 ⏸CP0/⏸CP1/⏸CP2/⏸CP2.5 暂停卡 + ⏸CP3【合并确认卡】。',
      ''
    )
  );
  assertEqual(code, 1, '删接力卡引导语应拦截（exit 1）');
});

test('负向：删运行模式判断全程模式分支应拦截（exit 1）', function () {
  // CR 第 17 轮（追加 9 轮循环 R7）新增：判断逻辑缺全程模式触发分支须拦截（防全程模式不可达）。
  const code = runValidate(p =>
    p.replace(
      '判断：① 明确要求一次跑完 → 全程；② 带上一棒【接力卡】/任务书 → 接力续棒；③ 新需求 → 默认接力；④ 只回「继续」且未带接力卡时，**先按本 Issue 最新一条 NPC 评论的【接力卡】/任务书认领下一步**（认不出即**反问**，禁止默认重跑已完成步骤——如已有 open PR 时禁止再出 4/13；确已发现前序真实问题时可依铁律 20 例外回退）。',
      '判断：若消息带上一棒【接力卡】/任务书 → 接力模式续棒；若为新需求 → 默认接力模式。'
    )
  );
  assertEqual(code, 1, '删全程模式分支应拦截（exit 1）');
});

test('负向：删运行模式判断接力续棒分支应拦截（exit 1）', function () {
  // CR 第 17 轮（追加 9 轮循环 R7）新增：判断逻辑缺接力续棒分支须拦截（防接力模式续棒契约丢失）。
  const code = runValidate(p => p.replace('② 带上一棒【接力卡】/任务书 → 接力续棒；', ''));
  assertEqual(code, 1, '删接力续棒分支应拦截（exit 1）');
});

test('负向：删运行模式接力描述中的评审-修复循环例外应拦截（exit 1）', function () {
  // PR #123 第 3 轮评审 C3 新增：运行模式「接力模式」描述中的评审-修复循环自动连续执行例外被删
  // （仅保留铁律 8/11 中的例外）时须拦截（防运行模式硬性措辞覆盖铁律 8 例外语义）。
  const { code, output } = runValidateCapture(p => {
    const start = p.indexOf('【运行模式（每次调用先自检）】');
    const end = p.indexOf('【铁律（最高优先级）】');
    if (start === -1 || end === -1) return p;
    const head = p.slice(0, start);
    const relayMode = p
      .slice(start, end)
      .replace(
        '**例外：6/13 评审-修复循环自动连续执行（铁律 8）** —— 同一次召唤内自动跑完所要求的 N 轮直至清零，每步在 PR 分别留痕。',
        ''
      );
    const tail = p.slice(end);
    return head + relayMode + tail;
  });
  assertEqual(code, 1, '删运行模式评审-修复例外应拦截（exit 1）');
  assertTrue(
    /运行模式「接力模式」描述缺少评审-修复循环自动连续执行例外声明/.test(output),
    '应命中运行模式例外校验，实际输出：' + output
  );
});

test('负向：删合并确认卡 9/13→10/13 接力衔接应拦截（exit 1）', function () {
  // CR 第 18 轮（追加 9 轮循环 R8）新增：合并棒完成后如何进入 10/13 发布（独立发布棒召唤）链路
  // 被删时须拦截（防接力模式下合并后无法规范进入发布阶段）。
  const code = runValidate(p =>
    p.replace(
      '> 🔗 10/13 合并棒完成后输出【接力卡·10/13】（本步产物：合并记录位置），下一步 11/13 发布，召唤话术：@CodeBuddy 接力 NPC_TEAM skill，执行 11/13 发布：任务书：<...>；合并记录见：<位置>（11/13 由 DEV 执行四要素：版本号/CHANGELOG/发布产物/Release Notes，铁律 14）',
      ''
    )
  );
  assertEqual(code, 1, '删 9/13→10/13 接力衔接应拦截（exit 1）');
});

test('负向：删 10/13 发布召唤话术应拦截（exit 1）', function () {
  // CR 第 18 轮（追加 9 轮循环 R8）新增：10/13 发布独立召唤话术被删须拦截。
  const code = runValidate(p =>
    p.replace('@CodeBuddy 接力 NPC_TEAM skill，执行 11/13 发布：', '@CodeBuddy 继续执行发布：')
  );
  assertEqual(code, 1, '删 10/13 发布召唤话术应拦截（exit 1）');
});

test('负向：删评审留痕块已累计轮次句（含 10 轮结束条件）应拦截（exit 1）', function () {
  // CR 第 22 轮（追加 12 轮循环 R3）新增：评审留痕块「已累计轮次」
  // 「清零且已达至少 10 轮则结束循环」被删须拦截（缺结束条件则无法判断何时循环完毕）。
  // 注：已累计轮次在评审/修复/复评三块各一次，全删才会触发循环留痕卡段内强校验。
  const { code, output } = runValidateCapture(p => {
    const sectionStart = p.indexOf('【评审-修复循环留痕卡（6/13 自动连续执行时使用）】');
    const sectionEnd = p.indexOf('【暂停确认】');
    const head = p.slice(0, sectionStart);
    const section = p.slice(sectionStart, sectionEnd).replace(/ - 已累计轮次：第 R 轮/g, '');
    const tail = p.slice(sectionEnd);
    return head + section + tail;
  });
  assertEqual(code, 1, '删评审留痕块已累计轮次应拦截（exit 1）');
  assertTrue(
    /评审-修复循环留痕卡缺少完整句式/.test(output),
    '应命中循环留痕卡段内句式校验，实际输出：' + output
  );
});

test('负向：删任务书用户命令记录 CP3 确认合并说明应拦截（exit 1）', function () {
  // CR 第 19 轮（追加 9 轮循环 R9）新增：任务书字段遗漏 CP3 确认合并命令说明须拦截。
  const code = runValidate(p =>
    p.replace('用户命令记录（继续/补充/停止，CP3 含确认合并）', '用户命令记录（继续/补充/停止）')
  );
  assertEqual(code, 1, '删任务书 CP3 确认合并说明应拦截（exit 1）');
});

// ---- CR 第 20 轮修复（追加 12 轮循环 R1）回归用例 ----
// 背景：① runValidateCaptureFull 的 SKILL.md 还原条件 fs.existsSync(SKILL_FILE + '.tmp') 永远不成立
// （sync 脚本直接 writeFileSync，不产生 .tmp），变异提示词被永久写入 SKILL.md（实测 diff 45 字符），
// 污染工作区且会被 git 提交带上；② 阶段完整性校验的边界进入条件（stageIdRe(0)||stageIdRe(11)）在
// 1/13 与 12/13 同时被删时走 else 只发 warning，13 阶段流水线删掉首尾仍放行。

test('负向：删流水线 1/13 与 12/13 边界节点应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p
      .replace(
        '1/13 深入分析+需求接收（RES 主持 + PO 提问；可一轮一轮盘清：未盘清可再跑第 R+1 轮，不前进） → ',
        '需求接收+PO澄清 → '
      )
      .replace(' → 13/13 复盘(全员)', ' → 复盘(全员)')
  );
  assertEqual(code, 1, '删 1/13 与 12/13 应拦截（exit 1）');
  assertTrue(
    /阶段编号 1\/13 缺失|提示词缺少【流水线】段/.test(output),
    '应命中阶段完整性校验，实际输出：' + output
  );
});

test('负向：runValidateCaptureFull 不污染 SKILL.md（工作区还原回归）', function () {
  const before = fs.readFileSync(SKILL_FILE, 'utf8');
  // 使用会触发 sync 改写提示词的 Full 变体（删 PM 卡合并职责）
  const { code } = runValidateCaptureFull(content =>
    content.replace('主持全部暂停点、进度风险、验收汇报、执行 10/13 合并', '')
  );
  const after = fs.readFileSync(SKILL_FILE, 'utf8');
  assertEqual(code, 1, '删 PM 合并职责应拦截（exit 1）');
  assertEqual(after, before, '测试后 SKILL.md 必须与测试前完全一致（不得被变异提示词污染）');
});

// ---- Issue #147 补充：6 个改造点门禁回归用例 ----
// 改造点 1：暂停点不得静默跳过
test('负向：删铁律 6「任何模式不得静默跳过」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => p.replace('任何模式不得静默跳过', ''));
  assertEqual(code, 1, '删「任何模式不得静默跳过」应拦截（exit 1）');
  assertTrue(
    /暂停点不得静默跳过|NPC_TEAM Skill 正文与 docs/.test(output),
    '应命中暂停点不得静默跳过门禁，实际输出：' + output
  );
});

// 改造点 2：未设暂停点自动接续
test('负向：删运行模式「未设暂停点自动触发下一步」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('未设 ⏸CP 的步骤由系统按接力卡自动触发下一步，用户无需逐棒复制召唤话术', '')
  );
  assertEqual(code, 1, '删自动接续声明应拦截（exit 1）');
  assertTrue(/未设暂停点自动接续/.test(output), '应命中改造点 2 门禁，实际输出：' + output);
});

// 改造点 2 门禁正则加固回归：门禁须锚定「运行模式原句」独有的「无需用户逐棒手动复制召唤话术」短语，
// 不得因铁律 11 澄清句（含「未设…暂停点的步骤…自动触发下一步」）而误命中放行。
// 正路径验证：仅删除铁律 11 澄清句、保留运行模式原句时，改造点 2 门禁不应报错（不得过度收紧）。
test('正路径：删铁律 11 澄清句但保留运行模式原句，改造点 2 门禁不误报（exit 1 仅因双源不一致）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('未设 ⏸CP 的步骤由系统按接力卡自动触发下一步，用户无需逐棒复制召唤话术', '')
  );
  // 删除 docs 正文铁律 11 澄清句后，docs 与 SKILL 双源不一致 → exit 1（属预期双源拦截）；
  // 但改造点 2 门禁依赖运行模式原句，不应因此误报「未设暂停点自动接续」。
  assertEqual(code, 1, '删铁律 11 澄清句应双源不一致 exit 1');
  assertTrue(
    /未设暂停点自动接续|NPC_TEAM Skill 正文与 docs/.test(output),
    '删运行模式原句后应命中改造点 2 门禁或双源不一致，实际输出：' + output
  );
});

// 改造点 3：每步留痕粒度强化
test('负向：删铁律 7「缺任一步即视为假装执行」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '**评审-修复循环中，评审棒/修复棒/复评棒每一步各自独立留痕，缺任一步即视为假装执行。**',
      ''
    )
  );
  assertEqual(code, 1, '删「缺任一步即视为假装执行」应拦截（exit 1）');
  assertTrue(/每步留痕粒度强化/.test(output), '应命中改造点 3 门禁，实际输出：' + output);
});

// 改造点 4：新增研究员 RES 角色
test('负向：删研究员 RES 角色卡片应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('🔬 RES｜职责=深入分析主持、需求背景调研、根因定位、方案可行性研究、bug 复现定位', '')
  );
  assertEqual(code, 1, '删 RES 角色卡片应拦截（exit 1）');
  assertTrue(
    /角色卡片缺失：研究员 RES/.test(output),
    '应命中角色卡片缺失校验，实际输出：' + output
  );
});

// 补充（Issue #147 用户补充：RES 角色介入 6/13）：RES 6/13 介入独立留痕门禁
// 背景：RES 在 6/13 介入不能只“名义挂名”（角色卡片/工作流程标注 CR+RES 但 RES 不真正执行评审、
// 无独立留痕即视为未介入）。本用例验证：删除角色卡片 RES 卡中的独立留痕声明（唯一锚点）应拦截。
test('负向：删 RES 6/13 介入独立留痕声明应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '6/13 必须独立执行研究员视角评审并以「🔬 RES 研究员评审」单独留痕于 PR，缺独立留痕即视为假介入。',
      ''
    )
  );
  assertEqual(code, 1, '删 RES 6/13 介入独立留痕声明应拦截（exit 1）');
  assertTrue(
    /RES 6\/12 介入独立留痕|RES 研究员评审独立留痕锚点/.test(output),
    '应命中 RES 6/13 介入独立留痕门禁，实际输出：' + output
  );
});

// 负向：仅删除工作流程 6/13 的「🔬 RES 研究员评审」独立留痕锚点（角色卡片保留），应命中 RES 研究员评审锚点门禁
// 说明：锚点短语「以「🔬 RES 研究员评审」独立留痕于 PR」在角色卡片与工作流程各出现一次，
// 本用例同时删除两处以精确验证该锚点门禁独立生效（不依赖 RES 6/13 介入独立留痕声明门禁）。
test('负向：删「🔬 RES 研究员评审」独立留痕锚点应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p
      .replace(
        '6/13 必须独立执行研究员视角评审并以「🔬 RES 研究员评审」单独留痕于 PR，缺独立留痕即视为假介入',
        'RES 在 6/12 的评审结论须独立留痕于 PR'
      )
      .replace(
        '（需求背景核实/方案可行性复核/根因定位/复现定位，以「🔬 RES 研究员评审」独立留痕于 PR）',
        '（需求背景核实/方案可行性复核/根因定位/复现定位，独立留痕于 PR）'
      )
  );
  assertEqual(code, 1, '删「🔬 RES 研究员评审」独立留痕锚点应拦截（exit 1）');
  assertTrue(
    /RES 研究员评审独立留痕锚点/.test(output),
    '应命中 RES 研究员评审独立留痕锚点门禁，实际输出：' + output
  );
});

// 改造点 5：评审范围纪律
test('负向：删铁律 15「评审范围纪律」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('15. 评审范围纪律：CR 只评审 PR diff 新增/改动行', '')
  );
  assertEqual(code, 1, '删评审范围纪律应拦截（exit 1）');
  assertTrue(
    /评审范围纪律|RES 定位范围纪律|NPC_TEAM Skill 正文与 docs/.test(output),
    '应命中评审范围纪律门禁，实际输出：' + output
  );
});

// 改造点 6：N 轮评审-修复循环验收标准
test('负向：删铁律 8「有效下限 = max(10, 用户指定 N)」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => p.replace('有效下限 = max(10, 用户要求 N)', ''));
  assertEqual(code, 1, '删 N 轮验收标准应拦截（exit 1）');
  assertTrue(/N 轮评审-修复验收标准/.test(output), '应命中改造点 6 门禁，实际输出：' + output);
});

// ---- 9.8 十四条质量红线纪律（铁律 16~18）负向回归 ----
// 思维纪律（铁律 16）
test('负向：删铁律 16「充分分析需求或定位问题真正原因」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('充分分析需求或定位问题**真正原因**', '充分分析需求或定位问题大致原因')
  );
  assertEqual(code, 1, '删充分分析真正原因应拦截（exit 1）');
  assertTrue(/思维纪律-充分分析/.test(output), '应命中思维纪律门禁，实际输出：' + output);
});

test('负向：删铁律 16「方案须充分求证」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('动手前须充分求证（读代码/跑测试/查文档确认可行性）', '直接按直觉动手；')
  );
  assertEqual(code, 1, '删方案求证应拦截（exit 1）');
  assertTrue(/思维纪律-方案求证/.test(output), '应命中思维纪律门禁，实际输出：' + output);
});

test('负向：删铁律 16「每一轮充分发现问题」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('每一轮都要**充分发现问题**', '每一轮都快速通过')
  );
  assertEqual(code, 1, '删充分发现问题应拦截（exit 1）');
  assertTrue(/思维纪律-评审实事求是/.test(output), '应命中思维纪律门禁，实际输出：' + output);
});

test('负向：删铁律 16「自相矛盾的兜底」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('不做自相矛盾的兜底。', '做冗余兜底。')
  );
  assertEqual(code, 1, '删逻辑清晰兜底纪律应拦截（exit 1）');
  assertTrue(/思维纪律-逻辑清晰/.test(output), '应命中思维纪律门禁，实际输出：' + output);
});

// 改动纪律（铁律 17）
test('负向：删铁律 17「最小必要改动」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**最小必要改动**，不盲目扩大', '做尽可能大的改动，覆盖更多文件')
  );
  assertEqual(code, 1, '删最小必要改动应拦截（exit 1）');
  assertTrue(/改动纪律-最小必要改动/.test(output), '应命中改动纪律门禁，实际输出：' + output);
});

test('负向：删铁律 17「原子化 PR」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('小型的、原子化的 PR', '大型的综合 PR')
  );
  assertEqual(code, 1, '删原子化 PR 应拦截（exit 1）');
  assertTrue(/改动纪律-原子化 PR/.test(output), '应命中改动纪律门禁，实际输出：' + output);
});

test('负向：删铁律 17「无关问题单独拆」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('单独拆 issue 及 PR，不混入当前 PR', '并入当前 PR 一并解决；')
  );
  assertEqual(code, 1, '删无关问题单独拆应拦截（exit 1）');
  assertTrue(/改动纪律-无关问题单独拆/.test(output), '应命中改动纪律门禁，实际输出：' + output);
});

test('负向：删铁律 17「更新 /docs」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**更新 /docs 目录中的相关文档**', '无需更新文档')
  );
  assertEqual(code, 1, '删更新 docs 应拦截（exit 1）');
  assertTrue(/改动纪律-更新 docs/.test(output), '应命中改动纪律门禁，实际输出：' + output);
});

// 8/13 文档阶段按当次需求/bug 整改同步修改完善项目相关文档（Issue #147 补充）
test('负向：流水线 8/13 文档删「按当次需求/bug 整改同步文档」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('9/13 文档(DEV+PO)', '10/13 文档(DEV+PO)')
  );
  assertEqual(code, 1, '删按当次需求/bug 整改同步文档应拦截（exit 1）');
  assertTrue(
    /阶段编号 9\/13 缺失|9\/13 文档/.test(output),
    '应命中文档阶段落点校验，实际输出：' + output
  );
});

// 测试纪律（铁律 18）
test('负向：删铁律 18「逐条真测」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('逐条**真测**，不能假装测试', '要快速测一下，能过就行')
  );
  assertEqual(code, 1, '删逐条真测应拦截（exit 1）');
  assertTrue(/测试纪律-逐条真测/.test(output), '应命中测试纪律门禁，实际输出：' + output);
});

test('负向：删铁律 18「单测+集成测试」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('执行**单元测试与集成测试**', '只需手动点测')
  );
  assertEqual(code, 1, '删单测+集成测试应拦截（exit 1）');
  assertTrue(/测试纪律-单测\+集成测试/.test(output), '应命中测试纪律门禁，实际输出：' + output);
});

test('负向：删铁律 18「npm run preflight」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('运行 **`npm run preflight`**', '直接提交即可')
  );
  assertEqual(code, 1, '删 preflight 应拦截（exit 1）');
  assertTrue(/测试纪律-preflight/.test(output), '应命中测试纪律门禁，实际输出：' + output);
});

test('负向：删铁律 18「npm run format」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('用 **`npm run format`** 格式化', '不格式化代码；')
  );
  assertEqual(code, 1, '删 format 应拦截（exit 1）');
  assertTrue(/测试纪律-format/.test(output), '应命中测试纪律门禁，实际输出：' + output);
});

test('负向：删铁律 18「npm run lint」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('用 **`npm run lint`** 检查', '不检查代码')
  );
  assertEqual(code, 1, '删 lint 应拦截（exit 1）');
  assertTrue(/测试纪律-lint/.test(output), '应命中测试纪律门禁，实际输出：' + output);
});

test('负向：删铁律 18「暂未建立的测试单独开 issue」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('单独开 issue 及 PR 完善。', '可暂不处理。')
  );
  assertEqual(code, 1, '删补建测试声明应拦截（exit 1）');
  assertTrue(/测试纪律-补建测试/.test(output), '应命中测试纪律门禁，实际输出：' + output);
});

test('负向：删「需求覆盖度检查」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => p.replace(/需求覆盖度检查/g, '常规检查'));
  assertEqual(code, 1, '删需求覆盖度检查应拦截（exit 1）');
  assertTrue(/需求覆盖度检查/.test(output), '应命中需求覆盖度检查门禁，实际输出：' + output);
});

test('负向：删「⏸CP2.5 需求覆盖确认」暂停点应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(/⏸CP2\.5 需求覆盖确认/g, '⏸ 需求覆盖确认')
  );
  assertEqual(code, 1, '删⏸CP2.5需求覆盖确认应拦截（exit 1）');
  assertTrue(/需求覆盖确认/.test(output), '应命中需求覆盖度暂停点门禁，实际输出：' + output);
});

test('负向：删「开发落点/测试覆盖矩阵」应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(p => p.replace(/开发落点/g, '实现落点'));
  assertEqual(code, 1, '删需求覆盖度矩阵应拦截（exit 1）');
  assertTrue(/需求覆盖度矩阵/.test(output), '应命中需求覆盖度矩阵门禁，实际输出：' + output);
});

test('负向：删「需求全覆盖确认」语义应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p => p.replace(/需求全覆盖/g, '需求全部实现'));
  assertEqual(code, 1, '删需求全覆盖确认语义应拦截（exit 1）');
  assertTrue(/需求全覆盖确认/.test(output), '应命中需求全覆盖确认语义门禁，实际输出：' + output);
});

test('负向：删「暂停卡模板·CP2.5」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(/【暂停·CP2\.5 需求覆盖确认】/g, '【暂停·CP2.5 需求确认】')
  );
  assertEqual(code, 1, '删暂停卡模板·CP2.5应拦截（exit 1）');
  assertTrue(/暂停·CP2\.5 需求覆盖确认/.test(output), '应命中暂停卡模板门禁，实际输出：' + output);
});

test('负向：删暂停确认表 CP2.5 行应拦截（exit 1）', function () {
  // R4-1 修复：文档级暂停确认表 CP2.5 行（防文档与实际流水线脱节，删行 CI 不拦截）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(/^\| \*\*⏸ CP2\.5 需求覆盖确认\*\*.*$/m, '')
  );
  assertEqual(code, 1, '删暂停确认表 CP2.5 行应拦截（exit 1）');
  assertTrue(
    /暂停确认表缺少「⏸ CP2\.5 需求覆盖确认」/.test(output),
    '应命中暂停确认表 CP2.5 行校验，实际输出：' + output
  );
});

test('负向：删工作流程 7/13 需求覆盖度检查行应拦截（exit 1）', function () {
  // R5-1 修复：工作流程段（文档级）7/13 需求覆盖度检查行（防文档与实际流水线脱节）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(/阶段 8\/13 需求覆盖度检查（QA）[^\n]*\n/, '')
  );
  assertEqual(code, 1, '删工作流程 7/13 需求覆盖度检查行应拦截（exit 1）');
  assertTrue(
    /工作流程缺少需求覆盖度检查|阶段编号/.test(output),
    '应命中工作流程需求覆盖度检查行校验，实际输出：' + output
  );
});

test('负向：删 QA 卡片需求覆盖度检查职责应拦截（exit 1）', function () {
  // R6-1 修复：QA 角色卡片需求覆盖度检查职责（与主链 7/13、工作流程同步）。
  const { code, output } = runValidateCapture(p =>
    p.replace('；覆盖度矩阵经 ⏸CP2.5 确认全覆盖。', '')
  );
  assertEqual(code, 1, '删 QA 卡片需求覆盖度职责应拦截（exit 1）');
  assertTrue(
    /角色卡片 QA 缺少需求覆盖度检查职责|NPC_TEAM Skill 正文与 docs/.test(output),
    '应命中 QA 卡片需求覆盖度检查职责校验，实际输出：' + output
  );
});

test('负向：删门禁表需求覆盖度检查行应拦截（exit 1）', function () {
  // R7-1 修复：门禁表（文档级）需求覆盖度检查行（与合并/发布门禁行同级）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(/^\| \*\*需求覆盖度检查（⏸CP2\.5）\*\*.*$/m, '')
  );
  assertEqual(code, 1, '删门禁表需求覆盖度检查行应拦截（exit 1）');
  assertTrue(
    /门禁表缺少「需求覆盖度检查（⏸CP2\.5）」门禁行/.test(output),
    '应命中门禁表需求覆盖度检查行校验，实际输出：' + output
  );
});

test('负向：删冒烟测试方法 F 需求覆盖度语义应拦截（exit 1）', function () {
  // R8-1 修复：冒烟测试方法 F（需求覆盖度检查验证）语义（防端到端验收缺失需求覆盖门禁）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('**用户确认需求全覆盖后才进入 9/13 文档**', '**进入 8/12 文档**')
  );
  assertEqual(code, 1, '删方法 F 需求覆盖度语义应拦截（exit 1）');
  assertTrue(
    /冒烟测试方法 F 缺少需求覆盖度检查语义/.test(output),
    '应命中方法 F 需求覆盖度语义校验，实际输出：' + output
  );
});

test('负向：删冒烟测试验证点表 CP2.5/需求覆盖度应拦截（exit 1）', function () {
  // R9-1 修复：冒烟测试验证点表须含 CP2.5 暂停确认 + 需求覆盖度检查验证点（防验收标准脱节）。
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('**到 CP0/CP1/CP2/CP2.5/CP3 时输出暂停卡', '**到 CP1/CP2/CP3 时输出暂停卡')
  );
  assertEqual(code, 1, '删验证点表 CP2.5 应拦截（exit 1）');
  assertTrue(
    /冒烟测试验证点表缺少需求覆盖度\/CP2\.5/.test(output),
    '应命中验证点表 CP2.5 校验，实际输出：' + output
  );
});

// ---- 三条防重规则门禁（Issue #284：防重复 PR / 交接只用 PR 编号 / 判阻塞前对照实验）----
test('正向：三条防重规则铁律 19/20/21 与落点齐全时校验通过（exit 0）', function () {
  // 基线（未改写）即应通过——防新增门禁误伤正常提示词。
  assertEqual(
    runValidate(p => p),
    0,
    '未改写的提示词应通过校验'
  );
});

test('负向：删铁律 19「防重复 PR（开发前先查）」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('19. 防重复 PR（开发前先查，防 36 分钟 3 个 PR 重演）', '19. 无标题规则')
  );
  assertEqual(code, 1, '删铁律 19 标题应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删「必须查同 Issue 是否已有 open PR」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('必须先查同 Issue 是否已有 open PR', '先干活')
  );
  assertEqual(code, 1, '删开发前先查 open PR 应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删「已有 open PR 则复用…禁止新建分支/PR」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('已有则一律复用该 PR 与其 head 分支继续推提交，禁止新建分支、禁止新建 PR', '随便处理')
  );
  assertEqual(code, 1, '删除复用约束应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删「一个 Issue 一个 PR 一条分支」口径应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('一个 Issue 一个 PR 一条分支', '一句话')
  );
  assertEqual(code, 1, '删唯一 PR 口径应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删铁律 20「交接一律用 PR 编号，禁用分支名」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('20. 交接一律用 PR 编号，禁用分支名（防评审环节选错半成品）', '20. 无标题规则')
  );
  assertEqual(code, 1, '删铁律 20 应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删「禁止只写分支名」约束应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**禁止只写分支名**（分支名易撞名、易被"最新交棒指令"指向半成品', '**随便**')
  );
  assertEqual(code, 1, '删禁写分支名约束应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删铁律 21「判"阻塞"前必须做对照实验」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('21. 判"阻塞"前必须做对照实验（防假阻塞）', '21. 无标题规则')
  );
  assertEqual(code, 1, '删铁律 21 应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删对照实验判据「本次改动后失败、基线通过」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('只有"本次改动后失败、基线通过"才可判为本次改动导致的阻塞', '只要失败就算阻塞')
  );
  assertEqual(code, 1, '删对照实验判据应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：删「环境性失败不得记为本次改动的阻塞」应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '基线同样失败（含环境/工具链/网络/平台差异），则属**环境性失败，不得记为本次改动的阻塞**',
      '基线失败也当作本次改动阻塞'
    )
  );
  assertEqual(code, 1, '删环境性失败免责应拦截（exit 1）');
  assertTrue(/防重规则缺少完整句式/.test(output), '应命中防重规则门禁，实际输出：' + output);
});

test('负向：流水线 5/13 开发删「开工前先查 open PR」落点应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('5/13 开发(DEV) → 本环节', '5/12 开发(DEV，')
  );
  assertEqual(code, 1, '删 5/13 落点应拦截（exit 1）');
  assertTrue(
    /流水线 5\/13 开发与 DEV 卡片未绑定防重复 PR 门禁|阶段编号 5\/13 缺失/.test(output),
    '应命中开发阶段落点校验，实际输出：' + output
  );
});

test('负向：删任务书「PR 编号」字段应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**PR 编号（本 Issue 的唯一 PR', '**随便字段（')
  );
  assertEqual(code, 1, '删任务书 PR 编号字段应拦截（exit 1）');
  assertTrue(
    /流水线 5\/13 开发与 DEV 卡片未绑定防重复 PR 门禁|任务书缺少「PR 编号」字段/.test(output),
    '应命中防重复 PR 门禁（开发阶段 + DEV 卡片），实际输出：' + output
  );
});

test('负向：删接力卡「交接 PR」字段应拦截（exit 1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('交接 PR：<#<编号>（commit <sha>）——只认 PR 编号', '交接对象：<随便>')
  );
  assertEqual(code, 1, '删接力卡交接 PR 字段应拦截（exit 1）');
  assertTrue(
    /接力卡召唤话术「交接 PR」字段不完整/.test(output),
    '应命中接力卡交接 PR 校验，实际输出：' + output
  );
});

test('负向：文档级删门禁表「防重复 PR（铁律 19）」行应拦截（exit 1）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace('| **防重复 PR（铁律 19）**', '| **XX**')
  );
  assertEqual(code, 1, '删门禁表防重复 PR 行应拦截（exit 1）');
  assertTrue(
    /门禁表缺少防重规则行/.test(output),
    '应命中门禁表防重规则行校验，实际输出：' + output
  );
});

// ---- 三条防重规则门禁 E1~E7 逃生口回归（PR #285 第 1 轮评审修复）----
// 背景：第 1 轮评审用变异攻击发现 9.10 门禁只覆盖「铁律区间 + 流水线 5/13 + 任务书/接力卡字段 +
// 门禁表三行 + 工作流程 5/13 行」，以下 7 处新增落点被删后校验仍 exit 0（逃生口）。
// 本组用例逐条固化「删除落点必须被拦截」，防未来再次出现「加了落点却没加门禁」。

test('负向：删铁律 19「判定口径」句应拦截（exit 1，E3）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '判定口径：open PR 的标题/body `Ref: #<Issue>`/head 分支任一指向本 Issue 即视为"已有 PR"。',
      ''
    )
  );
  assertEqual(code, 1, '删判定口径应拦截（exit 1）');
  assertTrue(/铁律 19 缺少「判定口径」句/.test(output), '应命中判定口径校验，实际输出：' + output);
});

test('负向：删铁律 20 末句「一次流水线同一 Issue 只认一个 PR 编号」应拦截（exit 1，E1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('，一次流水线同一 Issue 只认一个 PR 编号，发现对象歧义先停下核对再动手。', '。')
  );
  assertEqual(code, 1, '删唯一 PR 编号口径应拦截（exit 1）');
  assertTrue(
    /铁律 20 缺少「一次流水线同一 Issue 只认一个 PR 编号」句/.test(output),
    '应命中唯一 PR 编号口径校验，实际输出：' + output
  );
});

test('负向：删铁律 21 证据句「对照实验的证据…必须写入 Issue/PR 留痕」应拦截（exit 1，E2）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('对照实验的证据（两条命令 + 两处输出摘要）必须写入 Issue/PR 留痕。', '')
  );
  assertEqual(code, 1, '删对照实验证据句应拦截（exit 1）');
  assertTrue(
    /铁律 21 缺少「对照实验证据须写入 Issue\/PR 留痕」句/.test(output),
    '应命中对照实验证据句校验，实际输出：' + output
  );
});

test('负向：删铁律 12「交接对象一律用 PR 编号而非分支名」应拦截（exit 1，E5）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**交接对象一律用 PR 编号而非分支名（铁律 20）**。', '')
  );
  assertEqual(code, 1, '删铁律 12 交接 PR 编号句应拦截（exit 1）');
  assertTrue(
    /铁律 12 缺少「交接对象一律用 PR 编号而非分支名（铁律 20）」句/.test(output),
    '应命中铁律 12 交接句校验，实际输出：' + output
  );
});

test('负向：删角色卡片 PM 铁律 19 落点应拦截（exit 1，E4）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('2/13 先查 open PR 有则复用不新建（19）；审核交接对象一律用 PR 编号（20）', '')
  );
  assertEqual(code, 1, '删 PM 卡片铁律 19 落点应拦截（exit 1）');
  assertTrue(
    /PM 卡片缺少铁律 19\/20 落点/.test(output),
    '应命中 PM 卡片落点校验，实际输出：' + output
  );
});

test('负向：删角色卡片 DEV 铁律 19 落点应拦截（exit 1，E4）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('5/13 开工前先查 open PR 有则复用（19）', '')
  );
  assertEqual(code, 1, '删 DEV 卡片铁律 19 落点应拦截（exit 1）');
  assertTrue(
    /DEV 卡片缺少铁律 19 落点/.test(output),
    '应命中 DEV 卡片落点校验，实际输出：' + output
  );
});

test('负向：删角色卡片 CR 铁律 20 落点应拦截（exit 1，E4）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('留痕与被评对象一律写 PR 编号（20）；', '')
  );
  assertEqual(code, 1, '删 CR 卡片铁律 20 落点应拦截（exit 1）');
  assertTrue(
    /CR 卡片缺少铁律 20\/21 落点/.test(output),
    '应命中 CR 卡片落点校验，实际输出：' + output
  );
});

test('负向：删角色卡片 QA 铁律 21 落点应拦截（exit 1，E4）', function () {
  const { code, output } = runValidateCapture(p => p.replace('判阻塞前做对照实验（21）；', ''));
  assertEqual(code, 1, '删 QA 卡片铁律 21 落点应拦截（exit 1）');
  assertTrue(
    /QA 卡片缺少铁律 21 落点|CR 卡片缺少铁律 20\/21 落点/.test(output),
    '应命中 QA 卡片铁律 21 落点校验，实际输出：' + output
  );
});

test('负向：删合并确认卡「交接对象唯一性」行应拦截（exit 1，E6）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '- 交接对象唯一性：**只认 PR 编号不认分支名（铁律 20）；本 Issue 下 open PR 必须 ≤1（铁律 19）**',
      ''
    )
  );
  assertEqual(code, 1, '删合并卡交接对象唯一性行应拦截（exit 1）');
  assertTrue(
    /【合并确认卡】缺少「交接对象唯一性」行/.test(output),
    '应命中合并卡交接对象唯一性校验，实际输出：' + output
  );
});

test('负向：文档级删工作流程 7/13 铁律 21 落点应拦截（exit 1，E7）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '**判"阻塞"前必须做对照实验**（同代码另建目录/另用基线 commit 各跑一遍，只有"本次改动后失败、基线通过"才算本次改动导致的阻塞，环境性失败不得记为本次改动的阻塞，须附两条命令与输出，铁律 21）',
      '修复回 DEV 遵循铁律16⑤先验证后整改）'
    )
  );
  assertEqual(code, 1, '删工作流程 7/13 铁律 21 落点应拦截（exit 1）');
  assertTrue(
    /工作流程 7\/13 行缺少对照实验门禁/.test(output),
    '应命中工作流程 7/13 落点校验，实际输出：' + output
  );
});

test('正向：E1~E7 门禁补齐后未改写的提示词仍通过校验（exit 0）', function () {
  assertEqual(
    runValidate(p => p),
    0,
    '未改写的提示词应通过校验（防新增门禁误伤）'
  );
});

// ---- 第 2 轮评审 U1/U2/U5 逃生口回归（文档级落点 + 接力卡本步产物字段）----
test('负向：文档级删「方法 G（三条防重规则验证）」应拦截（exit 1，U1）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace('**方法 G（三条防重规则验证）**', '**方法 X**')
  );
  assertEqual(code, 1, '删方法 G 应拦截（exit 1）');
  assertTrue(
    /文档缺少「方法 G（三条防重规则验证）」/.test(output),
    '应命中方法 G 校验，实际输出：' + output
  );
});

test('负向：文档级删【注意事项】三条防重规则 bullet 应拦截（exit 1，U2）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace('- **三条防重规则（铁律 19/20/21，Issue #284）**', '- **XX**')
  );
  assertEqual(code, 1, '删注意事项 bullet 应拦截（exit 1）');
  assertTrue(
    /【注意事项】缺少「三条防重规则（铁律 19\/20\/21，Issue #284）」说明 bullet/.test(output),
    '应命中注意事项 bullet 校验，实际输出：' + output
  );
});

test('负向：删【接力卡】本步产物 PR 编号约束应拦截（exit 1，U5）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '- 本步产物：<留痕位置与结论；涉及 PR 的必须写 PR 编号 `#<编号>` + commit sha，禁止只写分支名（铁律 20）>',
      '- 本步产物：<...>'
    )
  );
  assertEqual(code, 1, '删本步产物 PR 编号约束应拦截（exit 1）');
  assertTrue(
    /【接力卡】「本步产物」字段缺少 PR 编号约束/.test(output),
    '应命中本步产物字段校验，实际输出：' + output
  );
});

// ---- 第 3 轮评审 N4/N5/N7/N8 语义弱化逃生口回归 ----
test('负向：流水线 5/13 弱化「禁止新建」应拦截（exit 1，N4）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('5/13 开发(DEV)', '5/13 开发(DEV，可随意思考)')
  );
  assertEqual(code, 1, '弱化 5/13 禁止新建应拦截（exit 1）');
  assertTrue(
    /流水线 5\/13 开发与 DEV 卡片未绑定防重复 PR 门禁|阶段编号 5\/13 缺失/.test(output),
    '应命中防重复 PR 门禁，实际输出：' + output
  );
});

test('负向：门禁表铁律 19 行语义弱化应拦截（exit 1，N5）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '**已有 open PR 一律复用该 PR 与其 head 分支继续推提交，禁止新建分支、禁止新建 PR**',
      '**随便处理**'
    )
  );
  assertEqual(code, 1, '门禁表行语义弱化应拦截（exit 1）');
  assertTrue(
    /门禁表防重规则行语义不完整/.test(output),
    '应命中门禁表语义校验，实际输出：' + output
  );
});

test('负向：方法 G 保留标题但正文弱化应拦截（exit 1，N7）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '**方法 G（三条防重规则验证）**：① 5/13 开发前先查同 Issue 是否已有 open PR，有则复用不新建（收尾本 Issue 下 open PR ≤1）',
      '**方法 G（三条防重规则验证）**：随便看看'
    )
  );
  assertEqual(code, 1, '方法 G 正文弱化应拦截（exit 1）');
  assertTrue(/方法 G 语义不完整/.test(output), '应命中方法 G 语义校验，实际输出：' + output);
});

test('负向：注意事项 bullet 保留标题但正文弱化应拦截（exit 1，N8）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '③ **判"阻塞"前必须做对照实验**——同一份代码另建目录/另用基线 commit 各跑一遍，只有"本次改动后失败、基线通过"才算本次改动导致的阻塞，环境性失败不得记为本次改动阻塞',
      '③ 随便'
    )
  );
  assertEqual(code, 1, '注意事项 bullet 正文弱化应拦截（exit 1）');
  assertTrue(
    /【注意事项】三条防重规则 bullet 语义不完整/.test(output),
    '应命中注意事项语义校验，实际输出：' + output
  );
});

// ---- 第 4 轮评审 B4 修复回归：强语义门禁须容忍排版差异（防过度校验误报）----
test('正向：方法 G 标题多一个空格仍应通过（exit 0，B4 防误报）', function () {
  const code = runValidateCaptureFull(c =>
    c.replace('**方法 G（三条防重规则验证）**', '**方法 G （三条防重规则验证）**')
  ).code;
  assertEqual(code, 0, '方法 G 标题空格差异不应误拦（exit 0）');
});

test('负向：方法 G 正文语义弱化仍须拦截（exit 1，B4 防漏报不放松）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '**方法 G（三条防重规则验证）**：① 5/13 开发前先查同 Issue 是否已有 open PR，有则复用不新建（收尾本 Issue 下 open PR ≤1）',
      '**方法 G（三条防重规则验证）**：随便看看'
    )
  );
  assertEqual(code, 1, '方法 G 正文弱化仍须拦截（exit 1）');
  assertTrue(/方法 G 语义不完整/.test(output), '应命中方法 G 语义校验，实际输出：' + output);
});

test('正向：注意事项 bullet 行内多空格仍应通过（exit 0，B4 同类防误报）', function () {
  const code = runValidateCaptureFull(c =>
    c.replace(
      '- **三条防重规则（铁律 19/20/21，Issue #284）**：① **防重复 PR**',
      '- **三条防重规则（铁律 19/20/21，Issue #284）**：①  **防重复 PR**'
    )
  ).code;
  assertEqual(code, 0, '注意事项 bullet 空格差异不应误拦（exit 0）');
});

test('负向：注意事项 bullet 正文弱化仍须拦截（exit 1，防漏报不放松）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '③ **判"阻塞"前必须做对照实验**——同一份代码另建目录/另用基线 commit 各跑一遍，只有"本次改动后失败、基线通过"才算本次改动导致的阻塞，环境性失败不得记为本次改动阻塞',
      '③ 随便'
    )
  );
  assertEqual(code, 1, '注意事项 bullet 正文弱化仍须拦截（exit 1）');
  assertTrue(
    /【注意事项】三条防重规则 bullet 语义不完整/.test(output),
    '应命中注意事项 bullet 语义校验，实际输出：' + output
  );
});

// ---- 第 5 轮评审 O2/O3 顺序校验健壮性回归 ----
test('负向：铁律 19~21 区间插入未声明干扰行应拦截（exit 1，O2）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '21. 判"阻塞"前必须做对照实验',
      '插入干扰：随便一句话。\n21. 判"阻塞"前必须做对照实验'
    )
  );
  assertEqual(code, 1, '插入干扰行应拦截（exit 1）');
  assertTrue(
    /铁律 19~2[13] 区间存在未声明的干扰行/.test(output),
    '应命中干扰行校验，实际输出：' + output
  );
});

test('负向：铁律标题被重复注入应拦截（exit 1，O3）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '20. 交接一律用 PR 编号',
      '19. 防重复 PR（开发前先查，防 36 分钟 3 个 PR 重演）\n20. 交接一律用 PR 编号'
    )
  );
  assertEqual(code, 1, '重复注入铁律标题应拦截（exit 1）');
  assertTrue(
    /铁律标题被重复注入|铁律 19~2[13] 区间存在未声明的干扰行|铁律 19~2[13] 区间应为紧邻的(三|五)条规则/.test(
      output
    ),
    '应命中重复标题/干扰校验，实际输出：' + output
  );
});

test('正向：未改写的三铁律紧邻结构仍通过（exit 0，防误拦）', function () {
  assertEqual(
    runValidate(p => p),
    0,
    '未改写应通过（防干扰/唯一性校验误伤）'
  );
});

// ---- 第 6 轮评审 Z1/Z2 文档级「自动校验说明」承诺句回归 ----
test('负向：删「自动校验说明」三条防重规则门禁摘要应拦截（exit 1，Z1）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(/\*\*三条防重规则门禁存在（铁律 19\/20\/21[\s\S]*?）\*\*。/, '。')
  );
  assertEqual(code, 1, '删自动校验说明摘要应拦截（exit 1）');
  assertTrue(
    /「自动校验说明」段落缺少三条防重规则门禁摘要/.test(output),
    '应命中自动校验说明校验，实际输出：' + output
  );
});

test('负向：弱化「自动校验说明」三条防重规则门禁描述应拦截（exit 1，Z2）', function () {
  const { code, output } = runValidateCaptureFull(c =>
    c.replace(
      '三条防重规则门禁存在（铁律 19/20/21：防重复 PR / 交接只用 PR 编号 / 判「阻塞」前对照实验',
      'XX'
    )
  );
  assertEqual(code, 1, '弱化自动校验说明应拦截（exit 1）');
  assertTrue(
    /「自动校验说明」段落缺少三条防重规则门禁摘要/.test(output),
    '应命中自动校验说明校验，实际输出：' + output
  );
});

// ---- 第 8 轮评审 V3 角色卡片 PM 双落点回归 ----
test('负向：删 PM 卡片铁律 20 落点（仅留铁律 19）应拦截（exit 1，V3）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('；审核交接对象一律用 PR 编号（20）', '，有则复用不新建（铁律 19）')
  );
  assertEqual(code, 1, '删 PM 卡片铁律 20 落点应拦截（exit 1）');
  assertTrue(
    /PM 卡片缺少铁律 19\/20 落点/.test(output),
    '应命中 PM 卡片落点校验，实际输出：' + output
  );
});

// ---- 第 9 轮评审 W2/W4 第二落点/字段后缀回归 ----
test('负向：删 CR 卡片铁律 21 落点（仅留铁律 20）应拦截（exit 1，W2）', function () {
  const { code, output } = runValidateCapture(p => p.replace('判阻塞前做对照实验（21）；', ''));
  assertEqual(code, 1, '删 CR 卡片铁律 21 落点应拦截（exit 1）');
  assertTrue(
    /CR 卡片缺少铁律 20\/21 落点/.test(output),
    '应命中 CR 卡片落点校验，实际输出：' + output
  );
});

test('负向：弱化接力卡「交接 PR」字段后缀应拦截（exit 1，W4）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '交接 PR：<#<编号>（commit <sha>）——只认 PR 编号，禁止按分支名/最新指令猜对象（铁律 20）；尚无 PR 则写「尚无 PR（未到 5/13 开发棒）」>',
      '交接 PR：<#<编号>（commit <sha>）>'
    )
  );
  assertEqual(code, 1, '弱化交接 PR 字段后缀应拦截（exit 1）');
  assertTrue(
    /接力卡召唤话术「交接 PR」字段不完整/.test(output),
    '应命中交接 PR 字段完整性校验，实际输出：' + output
  );
});

// ---- 第 10 轮评审 Y2/Y3 铁律正文尾句回归 ----
test('负向：删铁律 20 案例锚点尾句应拦截（exit 1，Y2）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('，本仓评审环节曾因指向半成品 #279 而选错交接对象）', '）')
  );
  assertEqual(code, 1, '删铁律 20 案例锚点应拦截（exit 1）');
  assertTrue(/铁律 20 缺少案例锚点句/.test(output), '应命中案例锚点校验，实际输出：' + output);
});

test('负向：删铁律 21 行为禁令尾句应拦截（exit 1，Y3）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('对照实验的证据（两条命令 + 两处输出摘要）必须写入 Issue/PR 留痕。', '')
  );
  assertEqual(code, 1, '删铁律 21 行为禁令尾句应拦截（exit 1）');
  assertTrue(
    /铁律 21 缺少「对照实验证据须写入 Issue\/PR 留痕」句/.test(output),
    '应命中铁律 21 证据句校验，实际输出：' + output
  );
});

// ---- Issue #292 复盘（12/13）：复盘门禁铁律 22/23 回归用例 ----
// 背景：#292 复盘暴露两类真实盲区——① 可预防类改进项（写标签绕过守卫 / 环境性失败误判 / 模板占位符误发）
// 复盘后无人守卫，下次改动可静默回退；② 复盘结论可能仅凭历史留痕宣称落地（文案漂移无法发现）。
// 故新增铁律 22/23 + 方法 H/I + 【注意事项】bullet 四处落点，并逐条负向攻击验证门禁真实生效。
// 变异手法沿用 R6「删掉守卫即静默通过」的教训：采用**字面量精确替换**（而非宽松正则），
// 避免「替换表达式与实际文本错配导致变量未变、断言假阴性」的假绿。

test('正向：复盘门禁铁律 22/23 与文档级方法 H/I 齐备时通过（exit 0，防误拦）', function () {
  assertEqual(
    runValidate(p => p),
    0,
    '未改写的复盘门禁结构应通过（防误拦）'
  );
});

test('负向：删铁律 22 标题应拦截（exit 1，Z22）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('22. 复盘改进项必须预防性闭环（防"复盘全是空话"）：', '')
  );
  assertEqual(code, 1, '删铁律 22 标题应拦截（exit 1）');
  assertTrue(
    /复盘门禁缺少完整句式|复盘门禁铁律 22\/23|防重规则缺少完整句式/.test(output),
    '应命中铁律 22 缺失校验，实际输出：' + output
  );
});

test('负向：把铁律 22 正文弱化为口头承诺应拦截（exit 1，Z23）', function () {
  // 语义弱化攻击：保留标题锚点，把实质约束（当轮落成可执行产物 + 变异自证）替换为"后续加强"
  const { code, output } = runValidateCapture(p =>
    p.replace(
      '必须在复盘当轮落成可执行产物**——新增或升级守卫断言、校验脚本、CI 门禁，并**至少跑 1 组变异自证（注入反例后断言由绿转红）**',
      '后续加强守卫'
    )
  );
  assertEqual(code, 1, '弱化铁律 22 正文应拦截（exit 1）');
  assertTrue(
    /铁律 22 语义不完整/.test(output),
    '应命中铁律 22 语义完整性校验，实际输出：' + output
  );
});

test('负向：删铁律 23 的"禁止凭历史宣称"约束应拦截（exit 1，Z24）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('禁止仅凭历史留痕中的"已完成"宣称落地', '允许只按历史留痕认定')
  );
  assertEqual(code, 1, '弱化铁律 23 约束应拦截（exit 1）');
  assertTrue(
    /铁律 23 语义不完整/.test(output),
    '应命中铁律 23 语义完整性校验，实际输出：' + output
  );
});

test('负向：删文档级方法 H 标题应拦截（exit 1，Z25）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('**方法 H（复盘改进项预防性闭环验证，铁律 22）**', '')
  );
  assertEqual(code, 1, '删方法 H 标题应拦截（exit 1）');
  assertTrue(/文档缺少「方法 H/.test(output), '应命中方法 H 缺失校验，实际输出：' + output);
});

test('负向：删文档级方法 I 语义应拦截（exit 1，Z26）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('用脚本/断言/命令**重新复验**是否真实落地', '看看就好')
  );
  assertEqual(code, 1, '弱化方法 I 语义应拦截（exit 1）');
  assertTrue(/方法 I 语义不完整/.test(output), '应命中方法 I 语义完整性校验，实际输出：' + output);
});

test('负向：删【注意事项】复盘铁律 23 bullet 应拦截（exit 1，Z27）', function () {
  const { code, output } = runValidateCaptureFull(p => {
    const i = p.indexOf('- **复盘必须对照原始需求逐条复验（铁律 23）**');
    if (i === -1) throw new Error('测试自身锚点缺失：铁律 23 注意事项 bullet 未找到');
    const end = p.indexOf('\n', i);
    return p.slice(0, i) + p.slice(end + 1);
  });
  assertEqual(code, 1, '删铁律 23 注意事项 bullet 应拦截（exit 1）');
  assertTrue(
    /【注意事项】缺少「复盘必须对照原始需求逐条复验（铁律 23）」/.test(output),
    '应命中注意事项 bullet 缺失校验，实际输出：' + output
  );
});

test('负向：删门禁表铁律 22 行应拦截（exit 1，Z28）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    // 仅改「门禁表」那一行（表头带管道），不动【注意事项】bullet
    p.replace('| **复盘改进项必须预防性闭环（铁律 22）**', '| **复盘闭环**')
  );
  assertEqual(code, 1, '删门禁表铁律 22 行应拦截（exit 1）');
  assertTrue(
    /门禁表缺少「复盘改进项必须预防性闭环（铁律 22）」/.test(output),
    '应命中门禁表行缺失校验，实际输出：' + output
  );
});

test('负向：删工作流程 12/13 行的复盘门禁落点应拦截（exit 1，Z29）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace(
      '（**铁律 22：可预防类改进项须当轮落成守卫断言/校验脚本/CI 门禁并变异自证；铁律 23：对照 Issue 原始需求逐条复验落地，禁止凭历史宣称**）',
      ''
    )
  );
  assertEqual(code, 1, '删工作流程 12/13 复盘门禁落点应拦截（exit 1）');
  assertTrue(
    /工作流程 13\/13 行缺少复盘门禁落点/.test(output),
    '应命中工作流程复盘门禁落点校验，实际输出：' + output
  );
});

// ---- Issue #312：防腐四维（铁律 24）+ 【防腐检查清单】+ 守卫脚本门禁回归用例 ----
// 背景：#312 揭示 NPC Team 只加不删 → 补丁栈单调增厚 → 上下文装不下 → 约定必漏读。
// 故新增铁律 24（防腐四维：全局观/契约唯一/模块化/敢删）+ 【防腐检查清单】6 条自检问句
// + 角色卡片 PM/ARCH/DEV/CR 落点 + 守卫脚本 scripts/validate-npc-team-bloat.js。
// 本节逐条负向攻击，验证门禁真实生效（防"改完即被静默回退"）。

test('正向：防腐四维门禁齐备时校验通过（exit 0，防误拦）', function () {
  assertEqual(
    runValidate(p => p),
    0,
    '未改写的防腐四维结构应通过'
  );
});

test('负向：删铁律 24 标题应拦截（exit 1，K1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('24. 防腐四维（防"越修越多、越修越乱"，反例见 #314）：', '')
  );
  assertEqual(code, 1, '删铁律 24 标题应拦截');
  assertTrue(
    /防腐四维铁律 24 未紧随铁律 23 之后|铁律 24 语义不完整|防重规则缺少完整句式/.test(output),
    '应命中铁律 24 缺失校验，实际输出：' + output
  );
});

test('负向：铁律 24 弱化四维之一「敢删」应拦截（exit 1，K2）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**敢删**（每轮给出能删什么', '**精简**——每轮改动尽量写短一点')
  );
  assertEqual(code, 1, '弱化敢删维度应拦截');
  assertTrue(
    /铁律 24 语义不完整/.test(output),
    '应命中铁律 24 语义完整性校验，实际输出：' + output
  );
});

test('负向：铁律 24 删「#314 反例锚点」应拦截（exit 1，K3）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('（防"越修越多、越修越乱"，反例见 #314）', '（防越修越乱）')
  );
  assertEqual(code, 1, '删反例锚点应拦截');
  assertTrue(/铁律 24 语义不完整|防腐四维铁律 24/.test(output), '应命中校验，实际输出：' + output);
});

test('负向：删【防腐检查清单】段应拦截（exit 1，K4）', function () {
  const { code, output } = runValidateCapture(p => {
    const i = p.indexOf('【防腐检查清单（铁律 24 展开');
    if (i === -1) throw new Error('测试锚点缺失');
    const e = p.indexOf('【流水线（12 阶段', i);
    return p.slice(0, i) + p.slice(e);
  });
  assertEqual(code, 1, '删防腐检查清单段应拦截');
  assertTrue(/缺少【防腐检查清单】段/.test(output), '应命中清单缺失校验，实际输出：' + output);
});

test('负向：防腐检查清单少一条问句应拦截（exit 1，K5）', function () {
  const { code, output } = runValidateCapture(p => {
    const i = p.indexOf('问 6 上限余量：');
    if (i === -1) throw new Error('测试锚点缺失');
    const e = p.indexOf('\n', i);
    return p.slice(0, i) + p.slice(e + 1);
  });
  assertEqual(code, 1, '少问句应拦截');
  assertTrue(
    /【防腐检查清单】缺自检问句/.test(output),
    '应命中清单完整性校验，实际输出：' + output
  );
});

test('负向：防腐检查清单外链到外部文档应拦截（exit 1，K6）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('答不出即停下补课）】', '详见 docs 外部文档）】')
  );
  assertEqual(code, 1, '外链承载应拦截');
  // PR #315 评审 K1 修复：原断言用 `|缺少【防腐检查清单】段` 兜底，使「4.9b 正则恒不命中」也能通过
  // （间接触发即绿灯）——这正是守卫假绿。现改为**必须**命中 4.9b 外链规则本体，禁止兜底。
  assertTrue(
    /【防腐检查清单】不得外链到外部文档承载/.test(output),
    '须命中 4.9b 外链规则本体（K1：禁止用「缺少段」兜底掩盖死规则），实际输出：' + output
  );
});

// ---- PR #315 评审 K1 变体：段头保留、清单整段移出正文（4.9a 会放行的形态）----
test('负向：防腐检查清单保留段头但问句移出正文应拦截（exit 1，K6b）', function () {
  const { code, output } = runValidateCapture(p => {
    const start = p.indexOf('【防腐检查清单（铁律 24 展开');
    if (start === -1) throw new Error('测试锚点缺失');
    const end = p.indexOf('【流水线（12 阶段', start);
    const head =
      '【防腐检查清单（铁律 24 展开，动手前逐条自答 6 问；任一条答不出即停下补课，答不出即停下补课）】';
    return p.slice(0, start) + head + '\n' + p.slice(end);
  });
  assertEqual(code, 1, '问句移出正文应拦截');
  assertTrue(
    /问句未内联在段头之后的正文内|缺自检问句/.test(output),
    '应命中 K1 新增的内联块断言，实际输出：' + output
  );
});

test('负向：删角色卡片 DEV 铁律 24 落点应拦截（exit 1，K7）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('开发前跑【防腐检查清单】6 问，PR 写明', '开发前请自行注意并在 PR 写明')
  );
  assertEqual(code, 1, '删 DEV 落点应拦截');
  assertTrue(
    /角色卡片 DEV 缺少铁律 24 防腐落点/.test(output),
    '应命中落点校验，实际输出：' + output
  );
});

// ---- Issue #312 用户补充（PR #318）：1-12 各环节防腐与解耦（铁律 24 第 6 维：环节覆盖）----
// 用户要求「1-12 各个环节都要有防腐和解耦意识」。本节逐条负向攻击 9.13 门禁，
// 验证「环节悬空/环节膨胀/清单退化为只自答一次/角色卡片未接」四类逃逸口确实被拦。

test('正向：环节覆盖门禁齐备时校验通过（exit 0，防误拦）', function () {
  assertEqual(
    runValidate(p => p),
    0,
    '未改写的环节覆盖结构应通过'
  );
});

test('负向：删 7/13 环节的「本环节」判据应拦截（exit 1，S1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace(/ → 本环节：① 防腐=测试不入库腐肉[^→]*/, '')
  );
  assertEqual(code, 1, '删环节保护行应拦截');
  assertTrue(
    /环节「7\/13 测试」缺少本环节防腐/.test(output),
    '应命中 9.13 逐环节校验（环节标记缺失），实际输出：' + output
  );
});

test('负向：弱化 5/13 环节判据关键词应拦截（exit 1，S2）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('① 防腐=最小必要改动', '① 防腐=注意一下')
  );
  assertEqual(code, 1, '弱化环节判据应拦截');
  assertTrue(
    /环节「5\/13 开发」缺少本环节防腐/.test(output),
    '应命中 9.13 判据关键词校验，实际输出：' + output
  );
});

test('负向：某环节缺「解耦=」维度应拦截（exit 1，S3）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('② 解耦=文档单向派生自代码/提示词（同一事实只有一个作者）；', '')
  );
  assertEqual(code, 1, '缺维度应拦截');
  assertTrue(/环节覆盖不完整/.test(output), '应命中 9.13 三维修正校验，实际输出：' + output);
});

test('负向：防腐检查清单段头删「每环节自答」语义应拦截（exit 1，S4）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('每个环节动手前答本环节的防腐/解耦/度量三项并留痕', '')
  );
  assertEqual(code, 1, '清单段头弱化应拦截');
  assertTrue(
    /【防腐检查清单】段头缺「每环节防腐与解耦」语义|铁律 24 语义不完整/.test(output),
    '应命中 4.9d 段头语义校验（防守则退化为「只在开头自答一次」），实际输出：' + output
  );
});

test('负向：删角色卡片 CR 逐环节核对落点应拦截（exit 1，S5）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('评审须核铁律 24 四维与第 6 维逐环节要求', '')
  );
  assertEqual(code, 1, '删 CR 环节落点应拦截');
  assertTrue(
    /角色卡片 CR 缺少铁律 24 第 6 维（环节覆盖）落点/.test(output),
    '应命中角色卡片落点校验，实际输出：' + output
  );
});

test('负向：删铁律 24 第 6 维「环节覆盖」语义应拦截（exit 1，S6）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**环节覆盖（第 6 维，防"环节悬空"', '**另记一句')
  );
  assertEqual(code, 1, '弱化第 6 维应拦截');
  assertTrue(
    /铁律 24 语义不完整/.test(output),
    '应命中铁律 24 语义完整性校验，实际输出：' + output
  );
});

test('负向：铁律 24 第 5/6 维掏空为「只含关键词的空壳」应拦截（exit 1，S9=QA-F8 锚点式假绿）', function () {
  // QA 7/13 独立探针（QA-F8）：ANTICORRUPT_SEMANTICS 原只校验关键词是否出现，
  // 于是把第 6 维整段实质内容替换成「只含关键词、不含判据」的空壳句仍可全绿
  // —— 与本次改造要消灭的「守卫假绿」同构，且长在本次改造自己的新增锚点里。
  // 修复：对第 5/6 维追加**实质判据短语**断言（实锚判据）。
  const t6 = '；保护行是为环节内逐条执行而定，流水线级声明不得顶替（合取式，非析取式）。';
  const { code, output } = runValidateCapture(p => p.replace(t6, '。'));
  assertEqual(code, 1, '掏空第 6 维判据（仅留关键词）应拦截');
  assertTrue(
    /铁律 24 语义不完整/.test(output),
    '应命中铁律 24 语义完整性校验（实质判据短语并入同一断言），实际输出：' + output
  );
  assertTrue(
    /合取式，非析取式/.test(output),
    '缺失项须点名实质判据短语（防仅关键词即放行），实际输出：' + output
  );
});

test('负向：铁律 24 第 7 维「断言归属」掏空应拦截（exit 1，S10=#314 comment 2099345506 教训）', function () {
  // Issue #314 comment 2099345506 的三条教训（本轮吸取并刻进第 7 维）：
  //   ① 测行为不测形态（断言只查源码字符串 → 拷贝实现即绕过）
  //   ② 不变量必须归属门禁（只在测试不在守卫 CLI = 契约无主）
  //   ③ 变异自证须走真实链路（只改内存对象/与线上形态不一致的 fixture → 单测绿但线上不生效）
  // 本用例：删掉第 7 维实质判据（只留关键词）必须报红。
  const t7 =
    '**不变量必须归属门禁**（防腐不变量须由可独立执行的守卫/CI 拥有，不得只由测试文件承载）';
  const { code, output } = runValidateCaptureFull(c => c.replace(t7, '②**归属**——不变量须有主'));
  assertEqual(code, 1, '删第 7 维反例锚点应拦截');
  assertTrue(
    /铁律 24 语义不完整/.test(output),
    '应命中铁律 24 语义完整性校验，实际输出：' + output
  );
});

test('负向：第 7 维实质判据短语被弱化应拦截（exit 1，S11=测行为不测形态）', function () {
  const t = '**测行为不测形态**（断言须验证真实链路行为，不得只查源码里有无某字符串）';
  const { code, output } = runValidateCaptureFull(c => c.replace(t, '**测形态**——断言须看源码'));
  assertEqual(code, 1, '弱化「测行为不测形态」判据应拦截');
  assertTrue(
    /铁律 24 语义不完整/.test(output) && /测行为不测形态/.test(output),
    '缺失项须点名实质判据短语，实际输出：' + output
  );
});

test('负向：删本环节子句 + 关键词跨环节借位 + decoy 补计数应拦截（exit 1，S7=评审 K1 逃生口）', function () {
  // PR #317 评审 K1：原 9.13 正则 `stage[^\n]*本环节[^\n]*key` 在单行内无界，
  // 可被「删本环节子句 → 把关键词搬到下一环节子句 → 补 decoy 把声明数补回 12」绕过。
  // 修复后须逐环节限定在**本环节自身子句**内校验，本用例即该修复的变异自证。
  const { code, output } = runValidateCapture(p => {
    const i = p.indexOf('3/13 需求分析(PO+RES)');
    const j = p.indexOf(' → 本环节：', i);
    const end = p.indexOf(' → 4/13', j);
    assertTrue(i !== -1 && j !== -1 && end > j, 'fixture 失效：未定位到 3/12 环节子句');
    let m = p.slice(0, j) + p.slice(end);
    m = m.replace('① 防腐=先验证后设计', '① 防腐=先验证后设计 验收标准可核实');
    m = m.replace(
      '③ 度量=对照原始需求逐条复验（铁律 23，附复验命令与输出）',
      '③ 度量=对照原始需求逐条复验（铁律 23，附复验命令与输出） → 本环节：① 防腐=d ② 解耦=d ③ 度量=d'
    );
    return m;
  });
  assertEqual(code, 1, '关键词跨环节借位应拦截（K1 逃生口）');
  assertTrue(
    /环节「3\/13 需求分析」缺少本环节防腐/.test(output),
    '应命中 9.13 逐环节子句校验，实际输出：' + output
  );
});

test('负向：仅在【流水线】段外补「本环节：」不得绕过计数口径（口径唯一，S8=评审 K4）', function () {
  // PR #317 评审 K4：守卫量整段提示词、校验器量【流水线】段 → 两套口径。
  // 修复后守卫与校验器共享 countStageProtection（范围固定【流水线】段）。
  // 本用例断言：把「本环节：」写在【流水线】段外，不足以改变判定（保持一致，不产生假绿/假红）。
  const { output } = runValidateCaptureFull(c =>
    c.replace('问 6 上限余量', '问 6 上限余量 本环节：decoy')
  );
  assertTrue(
    !/环节覆盖声明数异常|环节覆盖不完整/.test(output),
    '段外插入「本环节：」不得触发环节覆盖判定（守范围=【流水线】段，口径唯一），实际输出：' + output
  );
});

// ---- Issue #383 C1 / 评审 CR2-1：阶段数单源化的反向断言（防「判据派生、文案手写」回归）----
test('正向：校验器可执行行内无 /12 形态阶段号字面量（阶段数单源化，C1/CR2-1）', function () {
  const code = runValidate(p => p);
  assertEqual(code, 0, '未改写时应通过（阶段数单源化门禁不误报）');
});

test('负向：校验器错误文案内注入手写 /12 应拦截（C1/CR2-1 变异自证，真实链路）', function () {
  // 真实链路变异自证：改写**被校验文件之外**的校验器自身源码（模拟 CR2-1 回归形态：
  // 判据已派生、但错误文案手写旧阶段号），跑真实门禁须由绿转红。
  const VALIDATOR = path.join(__dirname, '..', 'scripts', 'validate-npc-team-prompt.js');
  const orig = fs.readFileSync(VALIDATOR, 'utf8');
  const victim = '`工作流程 5/${M} 行缺少防重复 PR 门禁';
  assertTrue(orig.includes(victim), 'fixture 失效：未定位到可注入的错误文案');
  try {
    fs.writeFileSync(VALIDATOR, orig.replace(victim, '`工作流程 5/12 行缺少防重复 PR 门禁'));
    const { status, stdout, stderr } = require('child_process').spawnSync('node', [VALIDATOR], {
      encoding: 'utf8',
    });
    const output = (stdout || '') + (stderr || '');
    assertEqual(status, 1, '注入手写 /12 后门禁须 exit 1（真实链路），实际输出：' + output);
    assertTrue(/阶段数单源化残留/.test(output), '应命中阶段数单源化门禁，实际输出：' + output);
  } finally {
    fs.writeFileSync(VALIDATOR, orig); // 无条件还原
  }
});

// ---- 评审 CR5-1：暂停卡内容强校验（防「保留标题、掏空含义」）----
test('负向：掏空 ⏸CP0 暂停卡含义（保留标题）应拦截（CR5-1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('「继续」→ 确认分析无遗漏（已盘清），继续流水线', '「继续」→ 继续')
  );
  assertEqual(code, 1, '掏空 CP0 卡含义应拦截（exit 1）');
  assertTrue(
    /暂停卡「【暂停·CP0 分析确认】」内容不完整/.test(output),
    '应命中暂停卡内容校验，实际输出：' + output
  );
});

test('负向：掏空 ⏸CP2.5 暂停卡「需求全覆盖」语义应拦截（CR5-1）', function () {
  const { code, output } = runValidateCapture(p =>
    p.replace('**用户确认需求全覆盖后才进入文档**', '**进入文档**')
  );
  assertEqual(code, 1, '掏空 CP2.5 卡含义应拦截（exit 1）');
  assertTrue(
    /暂停卡「【暂停·CP2.5 需求覆盖确认】」内容不完整|缺少「需求全覆盖确认」语义/.test(output),
    '应命中暂停卡内容校验，实际输出：' + output
  );
});

// ---- Issue #383 QA-D1：关键能力断言（防「能力被删/改写」无门禁）----
test('正向：提示词块含 1/13 多轮盘清能力 + ⏸CP0（QA-D1 防误拦）', function () {
  const { code } = runValidateCaptureFull(p => p);
  assertEqual(code, 0, '未改写时应通过（exit 0）');
});

test('负向：删提示词块内「可一轮一轮盘清」应拦截（QA-D1 变异自证，真实链路）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('；可一轮一轮盘清：未盘清可再跑第 R+1 轮，不前进', '')
  );
  assertEqual(code, 1, '删多轮盘清能力应拦截（exit 1），实际输出：' + output);
  assertTrue(
    /关键能力「1\/13 深入分析可多轮盘清」缺失/.test(output),
    '应命中关键能力断言，实际输出：' + output
  );
});

test('负向：删 1/13「未盘清可再跑」多轮口径应拦截（QA-D1 变异自证）', function () {
  const { code, output } = runValidateCaptureFull(p => p.replace('未盘清可再跑', ''));
  assertEqual(code, 1, '删多轮再跑口径应拦截（exit 1），实际输出：' + output);
  assertTrue(
    /关键能力「1\/13 未盘清可再跑/.test(output),
    '应命中未盘清可再跑断言，实际输出：' + output
  );
});

// ---- Issue #383 QA-D2：description 阶段号一致性（防 frontmatter 编号漂移）----
test('负向：SKILL description 写回旧阶段号 6/12 应拦截（QA-D2 变异自证，真实链路）', function () {
  const orig = fs.readFileSync(SKILL_FILE, 'utf8');
  try {
    fs.writeFileSync(SKILL_FILE, orig.replace('6/13 评审-修复循环', '6/12 评审-修复循环'));
    const { status, stdout, stderr } = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    const output = (stdout || '') + (stderr || '');
    assertEqual(status, 1, 'description 写回 6/12 应 exit 1，实际输出：' + output);
    assertTrue(
      /Skill description 阶段号与阶段总数不一致/.test(output),
      '应命中 description 阶段号一致性门禁，实际输出：' + output
    );
  } finally {
    fs.writeFileSync(SKILL_FILE, orig); // 无条件还原
  }
});

test('正向：description 中「铁律 19/20/21」规则编号链不误报为阶段号（QA-D2 防误拦）', function () {
  const { code, output } = runValidateCaptureFull(p => p);
  assertEqual(code, 0, '规则编号链不得误报（exit 0），实际输出：' + output);
});

// ---- Issue #395 复盘：进度认领 / 防回退 / 回退留痕及例外（新增关键能力断言，条数以 CAPABILITY_ASSERTIONS 为准，不手写）----
test('负向：删「裸继续先认领下一步」句式应拦截（Issue #395 变异自证，真实链路）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('先按本 Issue 最新一条 NPC 评论的【接力卡】/任务书认领下一步', '')
  );
  assertEqual(code, 1, '删认领下一步能力应拦截（exit 1），实际输出：' + output);
  assertTrue(
    /关键能力「裸「继续」先认领下一步（不默认重跑）」缺失/.test(output),
    '应命中认领下一步断言，实际输出：' + output
  );
});

test('负向：删「已完成步骤不得回退重跑」句式应拦截（Issue #395 变异自证）', function () {
  const { code, output } = runValidateCaptureFull(p => p.replace('**已完成步骤不得回退重跑**', ''));
  assertEqual(code, 1, '删防回退口径应拦截（exit 1），实际输出：' + output);
  assertTrue(
    /关键能力「已完成步骤不得回退重跑（真发现问题可回退）」缺失/.test(output),
    '应命中防回退断言，实际输出：' + output
  );
});

test('负向：删「回退原因 + 依据」留痕口径应拦截（Issue #395 变异自证）', function () {
  const { code, output } = runValidateCaptureFull(p => p.replace('「回退原因 + 依据」', ''));
  assertEqual(code, 1, '删回退留痕口径应拦截（exit 1），实际输出：' + output);
  assertTrue(
    /关键能力「回退须写明原因与依据」缺失/.test(output),
    '应命中回退留痕断言，实际输出：' + output
  );
});

test('正向：新增能力断言在原有提示词上不得误拦（恒等输入，Issue #395 防误拦）', function () {
  const { code } = runValidateCaptureFull(p => p);
  assertEqual(code, 0, '未改写时应通过（exit 0）');
});

test('负向：删「例外可回退」从句应拦截（Issue #395 例外侧变异自证，真实链路）', function () {
  const { code, output } = runValidateCaptureFull(p => p.replace('**可以回退重跑**', ''));
  assertEqual(code, 1, '删用户授权的例外侧能力应拦截（exit 1），实际输出：' + output);
  assertTrue(
    /关键能力「防回退须保留例外（真发现问题可回退）」缺失/.test(output),
    '应命中例外侧断言，实际输出：' + output
  );
});

test('负向：删「例外优先级高于禁止再出 4/13 卡」裁决句应拦截（Issue #395 R3 变异自证）', function () {
  const { code, output } = runValidateCaptureFull(p =>
    p.replace('优先级高于「禁止再出 4/13 卡」', '')
  );
  assertEqual(code, 1, '删例外裁决句应拦截（exit 1），实际输出：' + output);
  assertTrue(
    output.includes('例外优先级高于「禁止再出 4/13 卡」（防自相矛盾）'),
    '应命中裁决句断言，实际输出：' + output
  );
});

test('负向：删任务书「进度游标」口径应拦截（Issue #395 变异自证）', function () {
  const { code, output } = runValidateCaptureFull(p => p.replace('进度游标', '进度'));
  assertEqual(code, 1, '删进度游标口径应拦截（exit 1），实际输出：' + output);
  assertTrue(/关键能力「进度游标唯一定义/.test(output), '应命中进度游标断言，实际输出：' + output);
});

// ---- 汇总 ----
console.log('\n========== 测试结果 ==========');
console.log('总计: ' + testCount + ' 个测试');
console.log('通过: ' + passCount + ' 个');
console.log('失败: ' + (testCount - passCount) + ' 个');

if (passCount === testCount) {
  console.log('\n✓ NPC Team 提示词校验脚本回归测试全部通过!\n');
  process.exit(0);
} else {
  console.log('\n✗ 部分测试失败!\n');
  process.exit(1);
}
