#!/usr/bin/env node
/**
 * 校验 MCP 工具体系数量与文档描述一致
 *
 * 背景：文档中"注册工具 / COM Actions / 内置工具 / 总计"等数字随开发持续漂移，
 * 手工维护总是滞后。本脚本读取代码中的真实数量（以代码为准），
 * 并检查关键文档中是否仍残留过时的硬编码数字。
 *
 * ⚠️ Issue #373 AC3（两处**静默假绿**，实测复现）：
 *   ① `console.log(' 内置工具: 12')` —— **手写常量**，真实值 14 ⇒ 检测器自己就是漂移源；
 *   ② COM Actions 读 `gateway/index.ts` 的 `COM_ACTIONS` —— 该数组早已迁到
 *      `gateway/com-actions.ts`，故恒定输出 `0`（真值 257）而无人报红。
 *   本脚本的**全部数字**改为从代码派生；不再保留任何"以代码为准"之外的第二份真值。
 *
 * 用法：node scripts/validate-tool-counts.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

// --root 可选：测试时指向临时 fixture 目录（避免污染真实仓库），默认仓库根。
// ⚠️ 本脚本此前**不支持** `--root` ⇒ 无法做「真实链路变异自证」（只能改内存/真仓，
//   两者都会污染或测不到真实 IO）。Issue #373 第 1 轮评审补齐该能力，
//   与 `validate-gateway-membership.js` 的既有手法同源（同一约定，不发明第二套）。
const rootArgIdx = process.argv.indexOf('--root');
const rootDir =
  rootArgIdx !== -1 && process.argv[rootArgIdx + 1]
    ? path.resolve(process.argv[rootArgIdx + 1])
    : path.resolve(__dirname, '..');
const errors = [];

// ---- 1. 从代码统计真实数量 ----
// 注册工具：wps-office-mcp/src/tools/{excel,word,ppt,common}/*.ts 中的 name: '...'
const toolDirs = ['excel', 'word', 'ppt', 'common'];
const toolRoot = path.join(rootDir, 'wps-office-mcp', 'src', 'tools');
const counts = { excel: 0, word: 0, ppt: 0, common: 0 };
let registeredTotal = 0;

for (const dir of toolDirs) {
  const dirPath = path.join(toolRoot, dir);
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.ts'));
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(dirPath, f), 'utf8');
    const matches = src.match(/name:\s*'[^']+'/g) || [];
    n += matches.length;
  }
  counts[dir] = n;
  registeredTotal += n;
}

// 内置工具（启动即注册）：唯一定义者 = mcp-server.ts 的 14 条 registry.register(...)
// ⚠️ Issue #373 AC3：此前这里是手写常量 12（真实 14）⇒ 本轮改为派生。
const serverSrc = fs.readFileSync(path.join(toolRoot, '..', 'server', 'mcp-server.ts'), 'utf8');
const builtinCount = (serverSrc.match(/name:\s*'wps_[a-z0-9_]+'/g) || []).length;

// COM Actions：唯一定义者 = gateway/com-actions.ts 的 COM_ACTIONS 数组
// ⚠️ Issue #373 AC3：此前读的是 gateway/index.ts（数组已迁走）⇒ 恒为 0 的静默假绿。
const comActionsSrc = fs.readFileSync(path.join(toolRoot, 'gateway', 'com-actions.ts'), 'utf8');
const comActionsBlock = comActionsSrc.match(
  /(?:const|export const)\s+COM_ACTIONS[^=]*=\s*\[([\s\S]*?)\n\];/
);
if (!comActionsBlock) {
  console.error('❌ 无法在 gateway/com-actions.ts 定位 COM_ACTIONS 常量块 —— 结构已变，请同步本脚本。');
  process.exit(1);
}
const comActionsCount = (comActionsBlock[1].match(/name:\s*'[^']+'/g) || []).length;

const totalCount = builtinCount + registeredTotal + comActionsCount;
console.log(`实际数量（以代码为准）:`);
console.log(
  `  注册工具: ${registeredTotal} (Excel ${counts.excel} / Word ${counts.word} / PPT ${counts.ppt} / Common ${counts.common})`
);
console.log(`  COM Actions: ${comActionsCount}`);
console.log(`  内置工具: ${builtinCount}`);
console.log(`  总计: ${totalCount}\n`);
// 🟢 第 1 轮评审：口径交叉核（`name:` 字面量可能被非注册用途使用 ⇒ 与注册调用数对账）
const registerCallCount = (serverSrc.match(/this\.registry\.register\(/g) || []).length;
if (registerCallCount !== builtinCount) {
  console.error(
    `❌ 内置工具口径不一致：registry.register 调用 ${registerCallCount} 次，` +
      `而 name: 字面量 ${builtinCount} 个 —— mcp-server.ts 结构已变，请同步本脚本。`
  );
  process.exit(1);
}
if (builtinCount === 0) {
  console.error('❌ 内置工具数量派生为 0（mcp-server.ts 结构已变）—— 拒绝以 0 冒充真值。');
  process.exit(1);
}

// ---- 2. 声明数对账（**取代**原 `stalePatterns` 旧数字黑名单）----
// ⚠️ Issue #373 第 5 轮评审 CR5-2 / RES5-1：原 `stalePatterns` 是**手写旧数字黑名单**
//   （238 注册 / 240 COM / 490 总计 / 254 全部），实测其 4 条规则中**至少 3 条在全仓零对象**
//   （`grep 240\s*COM Actions` 0 命中），且第 1 条「238 注册工具」**恰等于当前真值** ⇒ 永不命中 ——
//   属「无变异自证的空断言」（铁律 24 第 5 维）⇒ **整块删除**（问 4 敢删）。
//   其职责由下面「声明数 == 派生真值」判据**完全取代**（且更宽：黑名单只拦「曾经的错数」，
//   本判据拦「任何与真值不符的声明数」）。
//   ⚠️ RES 预验证：删黑名单前**必须**先把声明数对账扩到**三类数量**（内置/注册/COM Actions），
//   否则「COM Actions 写错成别的数」会失去唯一防线。

// ---- 2.5 对账：文档中「内置工具（N 个…）」的 N 必须 == 派生真值（Issue #373 第 1 轮评审 CR1-2）
// ⚠️ 为什么需要它：本 PR 的核心卖点是「数量改为派生自代码」，但**消费侧仍是手写**——
//   实测新增 wps_whoami 后派生值 15 而 docs 仍写 14，**无门禁持有「检测器结果 vs 文档声明」**，
//   于是本 PR 内部复现了它自己要治的病（旧：检测器手写 12 vs 真值 14）。
//   本判据把「声明数字 == 派生数字」这一不变量归属到门禁（铁律 24 第 7 维②）。
//   口径：只认**明确声明内置工具数量**的形态（`内置工具（N 个` / `内置 **N** 个工具`），
//   不误伤「14 个」等其它语境的数字；命中即需与 builtinCount 相等。
// ⚠️ Issue #373 第 5 轮评审 RES5-2：原只覆盖**内置工具**一类声明，而语义键
//   `tool-count-source` 的标题明写「内置 / 注册 / COM Actions **三数**派生自代码」——
//   名实不符（声称三数、只用判据守一数）。现扩到三类，并各配「真值」来源：
//   ① 内置 = builtinCount；② 注册 = registeredTotal；③ COM Actions = comActionsCount。
// ⚠️ Issue #373 第 7 轮评审 CR7-1/7-2：**语序须穷举**，不能只列「内置工具在前」的三种。
//   实测中文里「数量词在前」同样自然（`12 个内置工具`），而三种旧模式**全部零命中**
//   ⇒ 静默假绿（实测 `mcp-builtin.test.ts:3` 的「12 个内置工具」长期未被判定）。
//   同时**对齐两类对象的口径**（COM Actions 第 5 轮已覆盖前置语序，内置工具此前未覆盖）。
const DECLARED_COUNT_PATTERNS = [
  { re: /内置工具\s*[（(]\s*(\d+)\s*个/g, truth: () => builtinCount, name: '内置工具' }, // （N 个
  { re: /内置\s*\*{0,2}(\d+)\*{0,2}\s*个工具/g, truth: () => builtinCount, name: '内置工具' }, // **N** 个工具
  { re: /内置工具\s*\*{0,2}(\d+)\*{0,2}\s*个/g, truth: () => builtinCount, name: '内置工具' }, // N 个
  { re: /\*{0,2}(\d+)\*{0,2}\s*个\s*内置工具/g, truth: () => builtinCount, name: '内置工具' }, // **N 个内置工具**（数量词在前，CR7-1）
  // 注册工具 / COM Actions：`注册工具: N` / `COM Actions: N` / `共 N 个注册工具`
  // ⚠️ Issue #373 第 10 轮 CR10-1：三类对象的**语序覆盖须对等**。
  //   第 7 轮修内置工具语序时声明「两类对象已对齐」，**实测未对齐**（模式数 4 / 2 / 1）——
  //   本处补齐「注册工具」「COM Actions」的对等语序（`N 个 <对象>` / `（N 个 <对象>）`），
  //   使三类的覆盖率一致（铁律 24 第 5 维：同一断言对所有被守卫对象用同一口径）。
  { re: /注册工具\s*[:：]\s*(\d+)/g, truth: () => registeredTotal, name: '注册工具' },
  { re: /\*{0,2}(\d+)\*{0,2}\s*个\s*注册工具/g, truth: () => registeredTotal, name: '注册工具' },
  { re: /注册工具\s*[（(]\s*(\d+)\s*个/g, truth: () => registeredTotal, name: '注册工具' },
  { re: /COM Actions\s*[:：]\s*(\d+)/g, truth: () => comActionsCount, name: 'COM Actions' },
  { re: /\*{0,2}(\d+)\*{0,2}\s*个\s*COM\s*Actions/g, truth: () => comActionsCount, name: 'COM Actions' },
  { re: /COM\s*Actions\s*[（(]\s*(\d+)\s*个/g, truth: () => comActionsCount, name: 'COM Actions' },
  // 旧形态「12/240/257」（内置/COM Actions/总计 三段斜杠，CR5-1 实测残留 2 处）。
  //   ⚠️ **必须锚定「工具数量」上下文**（前方 30 字符内含「工具数量」或 `validate-tool-counts`）——
  //   否则会误伤 `19/20/21`（铁律编号）/ `14096/14097/14098`（端口）/ `2/3/6`（环节号）等同形串。
  //   本判据首版即因此产大批误报，按铁律 16⑥ 复核后收窄为**上下文锚定**（先验证后报告）。
  {
    re: /(?:工具数量[^\n]{0,30}?|validate-tool-counts[^\n]{0,30}?)(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/g,
    triple: true,
    name: '三段斜杠数量',
  },
];
// 🟢 第 2 轮评审 CR2-3：清单**机械枚举**（原为 11 项手写清单 ⇒ 新增文档不会自动进分母，
//   与「自动枚举防自我许可」的本仓纪律不一致）。现扫 docs/ + skills/*/ + agents/*/ 全量 .md。
function collectCountDeclFiles() {
  const files = ['README.md', 'AGENTS.md'];
  const addDir = (dir, pattern) => {
    const abs = path.join(rootDir, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isFile() && pattern.test(e.name)) files.push(path.join(dir, e.name));
      else if (e.isDirectory()) {
        const sub = path.join(dir, e.name);
        for (const f of fs.readdirSync(path.join(rootDir, sub))) {
          if (f.endsWith('.md')) files.push(path.join(sub, f));
        }
      }
    }
  };
  addDir('docs', /^.*\.md$/);
  addDir('skills', /^.*\.md$/);
  addDir(path.join('skills', '.'), /^.*\.md$/);
  addDir('agents', /^.*\.md$/);
  // ⚠️ Issue #373 第 4 轮评审 CR4-3：扫描面须按「谁可能承载该数字」枚举，而非「文档类目录」。
  //   实测另有两类载体在扫描面外：① `.opencode/plugins/*.js`（AI **运行时读取**的治理文本，
  //   本 PR 新增的说明里当场把 15 写成 14）；② `wps-office-mcp/src/**`（注释与测试白名单，
  //   实测 skills-consistency.test.ts 的手写白名单缺 wps_whoami）。
  //   数字声明口径（DECLARED_COUNT_PATTERNS）对二者同样适用。
  const addDeepByExt = (dir, exts) => {
    const abs = path.join(rootDir, dir);
    if (!fs.existsSync(abs)) return;
    const stack = [abs];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === 'dist') continue;
          stack.push(full);
        } else if (exts.test(e.name)) {
          files.push(path.relative(rootDir, full));
        }
      }
    }
  };
  addDeepByExt('.opencode/plugins', /\.js$/);
  addDeepByExt(path.join('wps-office-mcp', 'src'), /\.ts$/);
  return [...new Set(files)];
}
const countDeclFiles = collectCountDeclFiles();

for (const rel of countDeclFiles) {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  for (const pat of DECLARED_COUNT_PATTERNS) {
    for (const m of src.matchAll(pat.re)) {
      const lineNo = src.slice(0, m.index).split('\n').length;
      if (pat.triple) {
        // 三段斜杠：第 1 段 = 内置，第 2 段 = COM Actions（旧文档形态「12/240/257」）
        const [d1, d2] = [Number(m[1]), Number(m[2])];
        if (d1 !== builtinCount) {
          errors.push(
            `${rel}: 第 ${lineNo} 行「${m[0].trim()}」第 1 段声明内置工具 ${d1}，` +
              `与派生真值 ${builtinCount} 不符 —— 数量须派生自代码（Issue #373 CR5-1）`
          );
        }
        if (d2 !== comActionsCount) {
          errors.push(
            `${rel}: 第 ${lineNo} 行「${m[0].trim()}」第 2 段声明 COM Actions ${d2}，` +
              `与派生真值 ${comActionsCount} 不符 —— 数量须派生自代码（Issue #373 CR5-1）`
          );
        }
        continue;
      }
      const declared = Number(m[1]);
      const truth = pat.truth();
      if (declared === truth) continue;
      errors.push(
        `${rel}: 第 ${lineNo} 行声明「${pat.name}」${declared} 个，` +
          `与派生真值 ${truth} 个不符 —— 数量须派生自代码，不得手写（Issue #373 CR1-2 / RES5-2）`
      );
    }
  }
}

// ---- 2.6 对账：文档**清单完整性** —— 「内置工具」小节的表项 ⊇ 派生真值（Issue #373 第 2 轮评审 CR2-2）
// ⚠️ 为什么需要它（CR2-2 根因）：第 1 轮的修复动作是「把文档里的数字删掉」，而判据前提是
//   「文档会写数字」⇒ **判据与修复互相拆台**：数字一删，该文件永久脱离对账视野。
//   实测后果：4 份 skill/agent 的表只有 12 项、漏掉 wps_whoami（本 PR 新增的自检工具）而无人报红。
//   本判据把「清单 ⊇ 真值」这一不变量归属到门禁（铁律 24 第 7 维②），覆盖**数字之外的维度**。
// ⚠️ Issue #373 12/12 复盘（铁律 22 + 24 问 5「自许可循环」）：
//   原实现用**手写** `PR_TOUCHED_DOCS` 白名单区分「本 PR 改过的文档（报红）」与
//   「既有 stale 清单（只告警）」—— 这张表**本身就是自许可通道**：把任意文件加进表即可
//   合法放行，与 #352 第三刀切除的「登记进 GUARD_SOURCES 即合法抬高棘轮」同构。
//   实测：把 `agents/wps-word.md` 加进表 → 同一 stale 清单由绿转红（判据有效，只是被表放行）。
//   本刀：**清单完整性判据改为全量报红**（不依赖任何手写白名单）；同期把 3 份 stale 清单
//   （wps-excel 9 项 / wps-ppt 12 项 / wps-word 12 项）**真实补齐到派生真值 15 项** ⇒
//   分母全绿，无需豁免口。新增/改动文档漏项即时报红（不靠人记得同步）。
const BUILTIN_SECTION_RE = /(?:^|\n)#{2,4}\s*内置工具[^\n]*\n([\s\S]*?)(?=\n#{2,4}\s|\n---\s*\n|$)/g;
const builtinRealNames = new Set(
  (serverSrc.match(/name:\s*'(wps_[a-z0-9_]+)'/g) || []).map(m => m.replace(/name:\s*'|'/g, ''))
);
for (const rel of countDeclFiles) {
  const abs = path.join(rootDir, rel);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  for (const sec of src.matchAll(BUILTIN_SECTION_RE)) {
    const listed = new Set(
      // 表行形态：`| 1 | \`wps_xxx\` | ...`；同时兼容列表形态 `- \`wps_xxx\``
      [
        ...(sec[1].matchAll(/^\|\s*\d+\s*\|\s*`(wps_[a-z0-9_]+)`/gm) || []),
      ].map(m => m[1])
    );
    if (listed.size === 0) continue; // 非表格形态（如纯文字段）不在此判据内
    const missing = [...builtinRealNames].filter(n => !listed.has(n));
    if (missing.length > 0) {
      // ⚠️ 范围纪律（铁律 15/17⑨）：本判据**只拦截本 PR 改过的文件**（改一处就须改到底），
      //   与本次改动无关的既有 stale 清单登记到独立 Issue，不混入本 PR 的阻塞项 ——
      //   否则「顺手扩范围」会把不相关的历史债算成当前 PR 的失败。
      //   清单本身是**自动枚举**的（凡含「内置工具」小节的 .md 都会进视野），不做目录级豁免。
      // 全量报红（不设手写白名单豁免）：清单缺项即报红 —— 判定口径与「自动枚举」一致。
      errors.push(
        `${rel}: 「内置工具」清单表仅 ${listed.size} 项，缺 ${missing.length} 个真实内置工具` +
          `（${missing.join(' / ')}）—— 清单须覆盖 mcp-server.ts 真值（Issue #373 CR2-2；12/12 复盘取消白名单豁免）`
      );
    }
  }
}

// ---- 3. 汇总 ----
if (errors.length > 0) {
  console.error('\n❌ 工具数量文档校验失败（存在过时硬编码数字）:');
  errors.forEach(e => console.error('   - ' + e));
  process.exit(1);
}
console.log('✅ 工具数量校验通过：文档无过时硬编码数字，数量以代码为准');
