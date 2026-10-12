'use strict';

/**
 * 「语义键 × 落点集合」**双侧连通性判据**纯函数（Issue #335 / R10 第六类「范围无主」）。
 *
 * 立项命题：校对线的复发机制是「同一语义有多处真值 ⇒ 换位置就复发」。第六类是
 * **「一个概念被哪几条守卫覆盖」这件事实身也没有唯一归属** —— 守卫的**计行范围**
 * 与语义的**实际落点**之间没有任何连通性断言，扩大/缩小范围都不报红。
 *
 * 本模块实现 Issue #335「判据设计方向 1」的 ①② 两条 —— **且明确规避**
 * Issue 第五节列出的四个坑（不做自限判据 / 不用行数替代语义 / 不自持第二份真值 / 不把环境状态当契约违规）。
 *
 * ⚠️ Issue #352 第九刀：原「③ 双向集合相等（方向 2）」与「AC4 豁免过期 + 留痕」两个判据已删除 ——
 *    实测掏空二者轴 I CLI 仍 `EXIT=0`（零独立判别力），且清单的 `covered` 恒 `true`、`waiver` 恒 `null`
 *    （零对象）⇒ 互为自指骨架。范围一致性改由 `checkCoverageSide` 用**单一范围表现场计算**承担。
 *
 *   ① 覆盖侧（方向 1①）：清单里声明的每个落点，必须被**至少一条守卫**的计行范围覆盖。
 *   ② 归属侧（方向 1②）：守卫实际计行范围内的文件，若其内容含该语义的实现痕迹
 *      （**导出符号 / 具名常量**为主判据，特征串为辅 —— 见 Issue 第五节风险 1），
 *      则**必须**出现在清单里（漏登记 → 报红）。
 *   ③ 环境状态不误判（#321 R5-A 同族）：落点文件本地缺失 → `⚠️ 本地不存在`，
 *      **不计契约违规**（部分检出 / 浅克隆不得让门禁硬失败）。
 *   ④ 单一来源（#321 R9-A）：判据内**不出现任何仓库路径字面量** —— 清单与范围表
 *      一律由 caller（守卫脚本）单源传入。
 *
 * 与既有 H1 的区别（**这就是本 Issue 的存在理由**）：
 *   H1 只断言「登记表存在 + `why` 指向的文件存在」= **自限判据**（探针改文件不触碰登记表 ⇒ 恒绿）；
 *   本判据对**实际落点内容**取特征 → 新增同义实现（无论落在哪个通道）即报红（拦得住 A/B 探针）。
 */

/**
 * 从「落点内容」判定该落点是否**承载**某语义（归属侧主判据：导出符号 / 具名常量）。
 *
 * 判据口径（Issue 第五节风险 1：以导出符号/具名常量为**主**判据，特征串为辅）：
 *   名字必须以**代码形态**出现 —— `const/let/var NAME =`、`export … NAME`、
 *   `NAME:`（对象 key）、`\.NAME`（成员访问）、`NAME(`（调用）——；
 *   单纯在**文档 / 注释内提及**（如本语义清单本身、守卫模块的注释/字符串）**不算承载**。
 * 为什么必须如此：清单与判据模块天然会「提到」这些名字（它们正是清单的数据），
 * 若以 `includes` 判定，判据会把清单自己报成漏登记落点（自指噪声）——
 * 这是「用特征串当判据」的典型翻车形态，故把**代码形态**做成判据，而非放开排除名单。
 */
function siteCarriesAnchor(text, anchorNames) {
  const src = typeof text === 'string' ? text : '';
  const names = Array.isArray(anchorNames) ? anchorNames : [];
  // 剔除注释行与**字符串字面量**：二者都是「提到名字」，不是「承载语义」。
  // 剔除字符串是必须的 —— 守卫/判据模块常以 `'PROOFREAD_BATCH_MAX'` 这样的字面量做体检，
  // 若算承载，清单就得把自己与全部守卫登记成「语义落点」（自指噪声，见 F3/F1 评审）。
  // ⚠️ 该剔除**不削弱 F1**：F1 探针用的是 `const truncated = true`（真声明形态），仍会命中。
  const codeText = src
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#'));
    })
    .join('\n');
  // 剔除**字符串字面量**（仅同行内成对）：`'…'` / `"…"` / `` `…` ``。
  // ⚠️ 必须**逐行**剔除而非全文正则 —— 多行文件里未配对的引号会让全文正则跨行吞掉整段代码
  //   （实测：`wps-com.ps1` 的 PS1 单引号注释风格会让 `$requestedLength = $length` 被吞 ⇒ 假红）。
  const stripStrings = line => {
    let out = '';
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      out += ch;
    }
    return out;
  };
  const codeNoStrings = codeText.split('\n').map(stripStrings).join('\n');
  const hits = [];
  for (const n of names) {
    if (!n) continue;
    const bare = String(n).replace(/^\$/, ''); // PS1 变量名前缀 `$` 由下面 `\$` 分支统一处理
    const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 「代码形态」判定（**只认代码，不认注释/文档提及**）—— 覆盖本项目实际出现的全部合法形态：
    //   ① 声明/导出：`const|let|var NAME =`（含 `export`）—— 也覆盖 SKILL 里的 `var B = 200;`
    //   ② TS 类型成员 / 对象 key：`NAME:` 与**可选成员** `NAME?:`
    //   ③ 成员访问：`.NAME`
    //   ④ 调用：`NAME(`
    //   ⑤ **裸标识符引用**（多行 `import {` 列表 / 对象字面量值 `key: NAME,`）：
    //      以**整词**出现的 identifier —— 用 `(?<![\w.$])NAME(?![\w$])` 判定；
    //      这不会误伤文档（文档行已被剔除），也不会误伤「名字是更长标识符的一部分」。
    //   ⑥ PS1：`$NAME =`（COM 桥侧变量声明形态）
    const re = new RegExp(
      `(?:^|[\\s,{(])(?:export\\s+)?(?:const|let|var)\\s+${esc}\\s*=` +
        `|(?:^|[\\s,{])(?:readonly\\s+)?${esc}\\s*\\??:` +
        `|\\.${esc}(?![\\w$])` +
        `|(?:^|[^\\w.$])${esc}\\s*\\(` +
        `|(?<![\\w.$])${esc}(?![\\w$()-])` +
        `|\\$${esc}\\s*=`,
      'm'
    );
    if (re.test(codeNoStrings)) hits.push(n);
  }
  return hits;
}

/**
 * 方向 1① 覆盖侧：清单内每个落点必须**被某条守卫的计行范围覆盖**（不再有豁免口）。
 *
 * @param {Array} manifest 语义键清单（单源传入，见 lib/semantic-anchor-manifest.js）
 * @param {(rel:string)=>string[]} coveringOf 由 caller 提供的「该落点被哪些守卫覆盖」函数（单源）
 * @param {(rel:string)=>boolean} existsOf 由 caller 提供的存在性判定（环境性，缺失不报契约违规）
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkCoverageSide(manifest, coveringOf, existsOf) {
  const errors = [];
  const warnings = [];
  const keys = Array.isArray(manifest) ? manifest : [];
  for (const entry of keys) {
    if (!entry || !entry.key || !Array.isArray(entry.sites)) continue;
    // ⚠️ Issue #373 QA-F1（实测洞）：原实现只遍历 `entry.sites`，**落点被整体删掉**时两边都无话可说
    //   （覆盖侧无落点可查、归属侧可能仍命中其它落点）⇒ 实测「从清单删掉注册层落点」守卫 EXIT=0。
    //   现要求每个落点**至少带 path**：缺 path 的落点声明即报红（有声明无落点 = 死元数据）。
    for (const site of entry.sites) {
      if (!site || !site.path) {
        errors.push(
          `[${entry.key}] 存在**缺 path 的空落点声明** —— 落点被删到只剩空括号时两侧判据都无从判定` +
            `（实测可静默通过，Issue #373 QA-F1）。要么补回真实落点，要么删掉这条空声明。`
        );
      }
    }
    for (const site of entry.sites) {
      if (!site || !site.path) continue;
      if (typeof existsOf === 'function' && !existsOf(site.path)) {
        warnings.push(`⚠️ [${entry.key}] 落点本地不存在（环境性，非契约违规）：${site.path}`);
        continue;
      }
      const covered = typeof coveringOf === 'function' ? coveringOf(site.path) : [];
      if (covered.length === 0) {
        errors.push(
          `[${entry.key}] 落点 ${site.path} 不在任何守卫的计行范围内 ——` +
            `覆盖判定由**单一范围表现场计算**（Issue #352 第九刀：已删除恒 null 的 waiver 豁免口，不得靠清单自持"已豁免"第二份真值悄悄移出范围）`
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * 方向 1② 归属侧：守卫计行范围内的文件若承载某语义，就必须出现在清单里。
 *
 * @param {Array} manifest 语义键清单
 * @param {Array<{path:string,text:string}>} scanned 该语义键的**扫描候选**（caller 给出，
 *        通常 = 守卫计行范围内的全部文件 + 清单已登记落点；不含候选即无从判定）
 * @param {object} opts `{ existsOf }`（环境性缺失不报违规）
 * @returns {{errors:string[], warnings:string[]}}
 */
/**
 * 归属锚点的**唯一来源**（Issue #352 第十刀「统一重构 B」）：由每个落点的 `site.anchor`
 * **派生**，不再自持 entry 级 `anchorNames` 第二份列表（原两份列表且无一致性断言 = 同一语义两处写）。
 * 单字母锚点（长度 < 3）**不参与归属判定** —— 实测 `anchor: 'B'` 会命中 `skills/wps-excel/SKILL.md`
 * 里的公式示例（`$B$100` / `B列`）⇒ 误报无关文档（显式披露为自限）。
 */
function keyAnchors(entry) {
  const sites = Array.isArray(entry && entry.sites) ? entry.sites : [];
  return [
    ...new Set(sites.map(s => s && s.anchor).filter(a => typeof a === 'string' && a.length >= 3)),
  ];
}

function checkAttributionSide(manifest, scanned, opts) {
  const errors = [];
  const warnings = [];
  const options = opts || {};
  const keys = Array.isArray(manifest) ? manifest : [];
  const pool = Array.isArray(scanned) ? scanned : [];
  for (const entry of keys) {
    if (!entry || !entry.key || !Array.isArray(entry.sites)) continue;
    const registered = new Set(entry.sites.map(s => s.path));
    // 归属锚点唯一来源 = 落点级 `site.anchor` 派生（第十刀：删 entry 级 `anchorNames` 第二份列表）。
    const anchorNames = keyAnchors(entry);
    for (const file of pool) {
      if (!file || !file.path || typeof file.text !== 'string') continue;
      if (registered.has(file.path)) continue; // 已登记，归属成立
      if (typeof options.existsOf === 'function' && !options.existsOf(file.path)) {
        warnings.push(`⚠️ [${entry.key}] 候选本地不存在（环境性，非契约违规）：${file.path}`);
        continue;
      }
      const hits = siteCarriesAnchor(file.text, anchorNames);
      if (hits.length > 0) {
        errors.push(
          `[${entry.key}] 漏登记落点：${file.path} 含该语义的实现痕迹（${hits.join(' / ')}），` +
            `却未出现在语义清单里 —— 「同一语义的落点集合」必须双向闭合（Issue #335 方向 1②）`
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * F3（PR #336 评审）：清单里每个落点的 `site.anchor` **必须有真实消费点** ——
 * 即「该文件里确实出现该导出符号 / 具名常量（具名函数）/ PS1 变量」。
 *
 * 原实现只读 `entry.anchorNames`（entry 级），`site.anchor`（落点级）**从未被任何判据读**，
 * 只是「有声明、无消费」的死元数据 —— 文档承诺的「防语义无关登记」并未实现（实测：
 * 给 `content.ts` 登记一个不存在的 `anchor`，轴 I 不报该问题）。
 *
 * @param {Array} manifest 语义键清单
 * @param {(rel:string)=>string|null} readOf caller 单源提供的文件读取（缺文件 → null）
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkSiteAnchors(manifest, readOf) {
  const errors = [];
  const warnings = [];
  const keys = Array.isArray(manifest) ? manifest : [];
  for (const entry of keys) {
    if (!entry || !entry.key || !Array.isArray(entry.sites)) continue;
    for (const site of entry.sites) {
      if (!site || !site.path) continue;
      if (!site.anchor) {
        errors.push(
          `[${entry.key}] 落点 ${site.path} **未声明 anchor** —— 落点级 anchor 是「这份落点确实承载` +
            `该语义」的唯一判据（第十刀：缺 anchor 即报红，不再静默跳过）`
        );
        continue;
      }
      const text = typeof readOf === 'function' ? readOf(site.path) : null;
      if (typeof text !== 'string') {
        warnings.push(`⚠️ [${entry.key}] 落点本地不存在（环境性，非契约违规）：${site.path}`);
        continue;
      }
      // 落点级 anchor 是「具名符号 / 常量 / 函数 / PS1 变量」——判定口径比 entry 级更严（必须真出现）。
      const hits = siteCarriesAnchor(text, [site.anchor]);
      if (hits.length === 0) {
        errors.push(
          `[${entry.key}] 落点 ${site.path} 声明了 anchor「${site.anchor}」却未在该文件中出现 ——` +
            `落点级 anchor 是「这份落点确实承载该语义」的判据（防「把文件登记进来却与语义无关」），` +
            `有声明无消费即死元数据（PR #336 评审 F3）`
        );
      }
    }
  }
  return { errors, warnings };
}


/**
 * ── K7 治理指路判据（Issue #352 第十刀：由 `lib/governance-guide-map.js` 迁入本模块）──
 *
 * 背景：原 K7 由独立 CLI（`scripts/validate-governance-guide-map.js`）+ 独立判据模块
 * （`scripts/lib/governance-guide-map.js`）+ 专测组成。第八刀删 CLI 后判据模块**无执行者**（F6），
 * 第十刀统一重构：把两条判据（覆盖 + 预算）**并入轴 I**（单一连通性守卫），删除整套独立构件。
 * 迁入后 `lib/governance-guide-map.js` / 其 CLI / 其专测整体删除（「连同清单登记彻底删除」）。
 *
 * ⚠️ 本模块口径不变（#321 R9-A）：仍**不含任何仓库路径字面量** —— 两个判据只吃 caller 传入的**字符串**。
 */

const LABEL_RE = /^[A-Z]\d+[a-z]?$/;

/**
 * 从 `enhanceBlock(` 调用点提取标签实参（第 3 个实参，单引号字面量）。
 *
 * ⚠️ 必须**括号感知扫描**，不能用正则 `[\s\S]*?` 跨参数匹配 —— 实测第一版我用懒量正则，
 * 在 `enhanceBlock(st, \`…${x(\`a\`)}…\`, 'G2', tool)` 这类**内含括号的模板字符串**上
 * 直接跨过了第三个参数，把真实存在的 `G2` 报成「死条目」（假红）。
 * 这正是「用文本猜语法不可穷尽」的典型翻车形态 ⇒ 改为按顶层逗号切分实参。
 */
function readCallArgs(src, openParenIdx) {
  const args = [];
  let cur = '';
  let depth = 0;
  let quote = null;
  for (let i = openParenIdx + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') {
        cur += src[++i] || '';
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (ch === ')' && depth === 0) {
        args.push(cur);
        break;
      }
      depth--;
      cur += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      args.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  return args;
}

/** 提取标签实参集合（第 3 个实参且为纯字面量——非字面量一律不计，见文件头自限）。 */
function extractEmittedLabels(src) {
  const out = new Set();
  const re = /enhanceBlock\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const third = (readCallArgs(src, m.index + m[0].length - 1)[2] || '').trim();
    const lit = /^'([A-Za-z0-9]+)'$/.exec(third);
    if (lit && LABEL_RE.test(lit[1])) out.add(lit[1]);
  }
  return out;
}

/**
 * 从 `GUIDE_MAP = { ... }` 提取 `[键, 文案]` 条目（顶层 2 空格缩进键；文案取**单引号**字面量）。
 *
 * ⚠️ 只认单引号是**判据口径**（本项目 GUIDE_MAP 一律单引号）。若某条改用双引号/反引号/多行拼接，
 * 它**不会**出现在结果里 —— 调用方**必须**用 `keys` 做键集合对账（见 `checkGuideMapBudget` 的
 * `expectedKeys`），否则「改个引号」即可让该条**静默逃出文案预算**（实测：双引号文案 → entries 为空、
 * 预算判据 `EXIT=0`）。这正是本仓反复复发的「同一语义换位置就逃逸」形态。
 */
function extractGuideMapEntries(src, blockRe) {
  const re = blockRe || /GUIDE_MAP\s*=\s*\{([\s\S]*?)\n\};/;
  const m = re.exec(src);
  if (!m) return null; // 结构变了 ⇒ 由 caller 报「无法定位」
  const out = [];
  for (const line of m[1].matchAll(/^ {2}([A-Za-z0-9]+)\s*:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm))
    out.push([line[1], line[2]]);
  return out;
}

/**
 * 从 `GUIDE_MAP = { ... }` 提取键集合（顶层 2 空格缩进键）。
 *
 * ⚠️ 与 `extractGuideMapEntries` **不是**投影关系（这是刻意的）：本函数**只看键**、不看值的引号形态，
 * 因此「改用双引号写文案」**仍会被计入键集合**，从而落到 `checkGuideMapBudget` 的**键集合对账**里
 * 报出「文案无法解析」——而不是被误诊为「该拦截点无门禁指路」（那会让排查方向完全错）。
 */
function extractGuideMapKeys(src, blockRe) {
  const re = blockRe || /GUIDE_MAP\s*=\s*\{([\s\S]*?)\n\};/;
  const m = re.exec(src);
  if (!m) return null; // 结构变了 ⇒ 由 caller 报「无法定位」
  const out = new Set();
  for (const k of m[1].matchAll(/^ {2}([A-Za-z0-9]+)\s*:/gm)) out.add(k[1]);
  return out;
}

/**
 * 文案预算（Issue #352 第四刀，**唯一来源**）：`GUIDE_MAP` 是 AI **被打断时**要读的字。
 * 实测改前 14 条合计 **1272 字 / 平均 91 / 最长 184**（P2），相当于一份 SKILL 的 13 倍，
 * 且此前**是唯一不受任何闸门约束的膨胀维度**（E1 只量守卫源码、体量闸门只量行数）。
 *
 * 判据（三条）：
 *   ① 每条 **≤ PER_ENTRY_MAX**（禁止在 `Error.message` 里塞小作文）；
 *   ② 全部合计 **≤ TOTAL_MAX**（防「每条都刚好压线」把总量撑回去）；
 *   ③ 文案必须给出**去哪看**或**怎么做**——以「动词/工具名」形态出现，不校验语义正确性（人工评审）。
 *
 * 自限（显式披露，非放宽）：只量**字符数**，不量「是否真的更易懂」；
 * 也不拦「把长文案搬去 SKILL 后 SKILL 自己膨胀」（那由 SKILL 侧口径负责）。
 */
const PER_ENTRY_MAX = 60;
const TOTAL_MAX = 600;

/**
 * 文案预算判据：超限即报错（含最长条目定位，便于整改）。
 *
 * @param {Map<string,string>|Array<[string,string]>|null} entries 键 → 文案
 * @param {Set<string>} [expectedKeys] `GUIDE_MAP` 的**键集合**（来自 extractGuideMapKeys）。
 *        传入时做**键集合对账**：疑似文案没被解析出来的键 ⇒ 报红（否则「换个引号」即可逃出预算）。
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkGuideMapBudget(entries, expectedKeys) {
  const errors = [];
  const warnings = [];
  if (!entries) return { errors, warnings };
  const list = entries instanceof Map ? [...entries] : Array.isArray(entries) ? entries : [];
  if (expectedKeys instanceof Set) {
    const parsed = new Set(list.map(([k]) => k));
    const unparsed = [...expectedKeys].filter(k => !parsed.has(k)).sort();
    for (const k of unparsed)
      errors.push(
        `K7 指路文案无法解析：[${k}] 在 GUIDE_MAP 里存在，但**没被预算判据读到** —— ` +
          `文案须为**单引号**字面量（双引号/反引号/多行拼接会让该条静默逃出预算闸门）`
      );
  }
  let total = 0;
  let longest = ['', 0];
  for (const [key, text] of list) {
    const len = [...String(text || '')].length;
    total += len;
    if (len > longest[1]) longest = [key, len];
    if (len > PER_ENTRY_MAX)
      errors.push(
        `K7 指路文案超预算：[${key}] ${len} 字 > ${PER_ENTRY_MAX} 字 —— ` +
          `指路是 AI **被打断时**要读的字，长正解应放 SKILL（一次性读到），此处只留「怎么做/去哪看」`
      );
  }
  if (total > TOTAL_MAX)
    errors.push(
      `K7 指路文案总量超预算：${total} 字 > ${TOTAL_MAX} 字（当前最长 [${longest[0]}] ${longest[1]} 字）——` +
        `逐条压线也会把总量撑回去，须整段重写而非只改单条`
    );
  return { errors, warnings };
}

/**
 * 主判据：发射侧与指路侧**双向集合相等**。
 *
 * @param {Set<string>|null} keys      GUIDE_MAP 键（null = 无法定位，caller 应先报结构错误）
 * @param {Set<string>}      emitted   enhanceBlock 标签实参
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkGuideMapCoverage(keys, emitted) {
  const errors = [];
  const warnings = [];
  if (!keys || typeof keys.has !== 'function') return { errors, warnings };
  const emit = emitted instanceof Set ? emitted : new Set();
  // 发射侧闭包（不含 G1-G7 中的纯内部键）：G1-G4 有 enhanceBlock 标签，T1-T11 同理。
  const missing = [...emit].filter(k => !keys.has(k)).sort();
  const dead = [...keys].filter(k => !emit.has(k)).sort();
  for (const k of missing)
    errors.push(
      `K7 拦截点 [${k}] 在 enhanceBlock 中有标签、却不在 GUIDE_MAP —— 该拦截点**无门禁指路**：` +
        `AI 只会收到裸报错，正是 README 曾声称「防漏接」的那一类漏接`
    );
  for (const k of dead)
    errors.push(
      `K7 GUIDE_MAP 键 [${k}] 永不被消费（governance.js 内无任何 enhanceBlock 以该标签调用）——` +
        `死条目：永不触发的指路声明比没有更糟（它让「指路齐全」看起来成立）`
    );
  return { errors, warnings };
}

/**
 * 工具结果**信封**（`tool-result-payload`）的消费侧判据（Issue #401 W-2）。
 *
 * 背景（Issue #401）：治理层曾据 `output.success !== false` 判定 handler 成功/失败
 * （R6-1 修复：读 handler 的结构信号，不猜入参）。但真实链路是
 *   `ToolCallResult`（types/tools.ts）
 *     → `mcp-server.ts` 投影 `{ content, isError: !result.success }`（**success 在投影中被剥掉**）
 *     → 治理层 after 钩子入参（TS 无法类型化）
 * ⇒ 跨模块「成功/失败」唯一真实信号只有两个，**且都在同一个信封上**：
 *   ① `isError`（投影后的 TS ↔ 运行时共有一致的键名）；
 *   ② `getOutputText` 能读到的文本位置（信封的 `content[]`）。
 * 二者**没有**互推关系（TS 里 `isError` 可选、`content` 可选 ⇒ 任一侧单用都有静默失配面），
 * 且**都是** TS 侧的具名符号 ⇒ 只能由本判据断言「治理层的消费点用了、且只用这两个」。
 *
 * 判据（**只吃 caller 传入的字符串**，模块内无仓库路径字面量）：
 *   ① `consumeEnvelopeSymbols`：`governance.js` 里**读信封顶层键**的位置
 *      （`\.(isError|success)\b`，剔注释、剔字符串字面量）必须 ⊆ 允许集合
 *      （默认 `['isError']`）—— 出现 `success` 即报红（该键**在投影中不存在**，读到恒 undefined
 *      ⇒ 静默恒 false 或恒 false 判定，正是本 Issue 的伤害面）；
 *   ② `payloadMarkerGuard`：报红文案里不得出现**payload 标记名**（`success:false` 之类）
 *      —— 「文案兜底」只能兜**人类可读中文标记**，拿 handler 字段名当标记 = 同一契约在文案里第二处写。
 *
 * ⚠️ 自限（显式披露）：`getOutputText` 的实现被调用断言，但本判据**不声称**断言
 *     `getOutputText` 覆盖了信封的**全部**形态（只断言它的返回值被用于取文本）。
 */

/**
 * 信封顶层键的**允许集合**（唯一声明处）。
 *
 * ⚠️ R8-1（第 8 轮评审，实测假绿）：本常量此前**可被静默放宽** —— 把集合改成
 * `['isError','success']` 后守卫**全绿**（判据① 拿它自己当依据 = 自指）。
 * 现由 `checkEnvelopeAllowlist()` 以**独立来源**钉死：允许键必须 ∈「投影后可存的键集」，
 * 且该键集由 `mcp-server.ts` 的**投影公式**派生（不读本常量）⇒ 放宽必然报红。
 */
const ENVELOPE_ALLOWED_KEYS = ['isError'];

/**
 * 判据 ④（R8-1）：允许集合不得包含**投影后不存在**的键（自指解除）。
 *
 * @param {string[]} allowed 允许读的信封键（本常量）
 * @param {string[]} projectedKeys mcp-server 投影公式产出的键（**独立来源**）
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkEnvelopeAllowlist(allowed, projectedKeys) {
  const errors = [];
  const allow = Array.isArray(allowed) ? allowed : [];
  const proj = new Set(Array.isArray(projectedKeys) ? projectedKeys : []);
  if (allow.length === 0)
    errors.push('[allowlist] 允许集合为空 —— 空集使判据① 恒真（零信息），必须报红');
  if (proj.size === 0)
    errors.push('[allowlist] 投影键集为空 —— 独立来源缺失时不得放行（防「无对照即恒绿」）');
  for (const k of allow)
    if (!proj.has(k))
      errors.push(
        `[allowlist] 允许读的键「${k}」**不在投影后的信封上** —— 读它必然恒 undefined；` +
          `允许集合不得静默放宽（R8-1 实测：改成 ['isError','success'] 曾使守卫全绿）`
      );
  return { errors, warnings: [] };
}

/**
 * 判据 ①：消费点只读允许的信封顶层键（含 13/13 复盘加固的**间接读**面）。
 * @param {string} govSrc 治理插件源码
 * @param {string[]} allowed 允许读的顶层键
 * @param {string[]} [fieldNames] 信封字段名（**单源 = TS 契约派生**；用于识别「绑定值=字段名」的别名）
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkEnvelopeKeyUsage(govSrc, allowed, fieldNames) {
  const errors = [];
  const allow = new Set((Array.isArray(allowed) ? allowed : ENVELOPE_ALLOWED_KEYS).map(String));
  // 别名候选 = 信封字段名（单源；缺传则退化为「仅允许集合外的成员访问」面，间接读面不启用）。
  const aliasHint = new Set(
    (Array.isArray(fieldNames) && fieldNames.length ? fieldNames : []).map(String)
  );
  const src = typeof govSrc === 'string' ? govSrc : '';
  const lines = src.split('\n');
  const reportedIndirect = new Set(); // 间接读去重（别名级）

  // ⚠️ 13/13 复盘加固（闭合自限 ①「间接读」）：不仅拦成员访问 `.key`，还拦
  //   **间接读**形态——先把被剥离的键名绑到标识符（`const k = 'success'`），再用计算成员
  //   `obj[k]` 读取。二者本质同一（都是读投影后不存在的键），原判据只拦前者 ⇒ 实测
  //   `const k='success'; output[k] !== false` 全绿（假绿，与本源 bug 同族）。
  //
  //   实现约束（**防误报**）：只把「**值 = 被剥离的键名**」的绑定视为别名 —— 因此
  //   与信封无关的同名局部变量（如循环计数器 `for (var k=0; ...)`）**不会**被当成别名
  //   （其绑定值不是字符串键名）。读取侧仍按「别名标识符的计算成员 `obj[alias]`」判定，
  //   并按 (别名, 键名) **去重**，避免同一别名多次出现时重复报红。
  const boundAliases = new Map(); // 别名标识符 → 其字面量键名（仅收「值为键名」的绑定）
  const aliasRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]([A-Za-z_][\w]*)['"`]/g;
  for (const m of src.matchAll(aliasRe)) {
    // 只登记「绑定值 = 信封字段名」的别名；绑定值不是字段名的（含非字段字符串）一律不登记。
    // 只登记「绑定值 = 信封字段名」的别名 —— 与信封无关的同名局部变量（循环计数器等）不误判。
    if (!aliasHint.has(m[2])) continue;
    boundAliases.set(m[1], m[2]);
  }

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue; // 注释不算消费
    const code = lines[i].replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ''); // 剔字符串字面量（标记名不是消费）
    // ① 成员访问形态：`.isError` / `.success`
    for (const m of code.matchAll(/\.(isError|success)\b/g)) {
      const key = m[1];
      if (allow.has(key)) continue;
      errors.push(
        `[\.${key}] 治理层读取了信封顶层键「${key}」—— 该键在 mcp-server 投影中被剥离` +
          `（\`{ content, isError: !result.success }\`），运行时恒为 undefined ⇒ 消费恒 false（静默失配）。` +
          `允许集合 = {${[...allow].join(', ')}}（Issue #401 W-2）`
      );
    }
    // ② 间接读形态：`obj[alias]`，其中 alias 绑定到了被剥离的键名。
    for (const m of code.matchAll(/\[\s*([A-Za-z_$][\w$]*)\s*\]/g)) {
      const alias = m[1];
      if (!boundAliases.has(alias)) continue;
      const key = boundAliases.get(alias);
      if (allow.has(key)) continue;
      if (reportedIndirect.has(alias)) continue; // 去重：(别名) 只报一次
      reportedIndirect.add(alias);
      errors.push(
        `[indirect:.${alias}] 治理层经**间接读**（\`${alias}\` ← \`'${key}'\`）读取了信封顶层键「${key}」` +
          `—— 与成员访问 \`.${key}\` 本质同一（该键在 mcp-server 投影中被剥离，运行时恒 undefined）；` +
          `允许集合 = {${[...allow].join(', ')}}（Issue #401 W-2 / 13/13 复盘加固）`
      );
    }
  }
  return { errors, warnings: [] };
}

/**
 * 判据 ①′（R9-1）：**消费点必须至少读一次**允许集合内的键。
 *
 * 判据① 只断言「读过的键 ∈ 允许集合」—— 若消费点改成**不读任何**信封键（如只读 `outText`），
 * 判据① 恒真（**无信号**），PR 的核心不变量（「失败态须依据结构化信号」）可被静默移除。
 * 实测坐实（R9-1）：把 `enabled` 判定改成 `!!outText` ⇒ 守卫 EXIT=0。
 *
 * @param {string} govSrc 治理插件源码
 * @param {string[]} allowed 允许集合（须非空）
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkEnvelopeConsumption(govSrc, allowed) {
  const errors = [];
  const allow = (Array.isArray(allowed) ? allowed : []).filter(Boolean);
  const src = typeof govSrc === 'string' ? govSrc : '';
  const lines = src.split('\n');
  let reads = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    const code = lines[i].replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
    for (const m of code.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)\b/g))
      if (allow.includes(m[1])) reads++;
  }
  if (allow.length === 0)
    errors.push('[envelope-consumption] 允许集合为空 ⇒ 本判据无对象（须先修判据④）');
  else if (reads === 0)
    errors.push(
      `[envelope-consumption] 消费侧**未读取任何**信封键（允许集合：{${allow.join(', ')}}）——` +
        `本 PR 的核心不变量（失败态依据结构化信号）已被静默移除；至少须读取其中一枚` +
        `（R9-1 实测：改成只读 outText 曾使守卫全绿）`
    );
  return { errors, warnings: [] };
}

/**
 * 判据 ②：报红/兜底文案不得引用 payload **字段名**当标记（只能兜人类可读中文标记）。
 * @param {string} govSrc 治理插件源码
 * @param {string[]} fieldNames payload 字段名（单源 = TS 契约字段，如 ['success','isError','content']）
 * @returns {{errors:string[], warnings:string[]}}
 */
function checkPayloadMarkerGuard(govSrc, fieldNames) {
  const errors = [];
  const names = (Array.isArray(fieldNames) ? fieldNames : []).map(String).filter(Boolean);
  const src = typeof govSrc === 'string' ? govSrc : '';
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    for (const n of names) {
      // 形如 'success:false' / "isError:true" 的**字符串字面量标记** = 把契约键名当文案兜底。
      const re = new RegExp("['\"`]" + n + "\\s*:\\s*(?:true|false)['\"`]");
      if (re.test(lines[i]))
        errors.push(
          `[payload-marker] 兜底文案出现字段名标记 ${n}:true|false —— 契约键名不得进入文案` +
            `（应改人类可读中文标记），否则「同一契约」在文案里第二处写（Issue #401 W-2）`
        );
    }
  }
  return { errors, warnings: [] };
}

module.exports = {
  siteCarriesAnchor,
  ENVELOPE_ALLOWED_KEYS,
  checkEnvelopeKeyUsage,
  checkEnvelopeAllowlist,
  checkEnvelopeConsumption,
  checkPayloadMarkerGuard,
  keyAnchors,
  checkCoverageSide,
  checkAttributionSide,
  checkSiteAnchors,
  // K7（第十刀迁入）：治理层「标签 ↔ GUIDE_MAP 键」双向闭合 + 文案预算
  extractEmittedLabels,
  extractGuideMapEntries,
  extractGuideMapKeys,
  checkGuideMapCoverage,
  checkGuideMapBudget,
  PER_ENTRY_MAX,
  TOTAL_MAX,
};
