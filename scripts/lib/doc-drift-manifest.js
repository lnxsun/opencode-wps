'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 文档形态「漂移」守卫的**单一来源数据清单**（Issue #359，元问题本体）。
 *
 * 背景（#359 核心洞察，实测复算）：现有 14 项守卫已覆盖**代码形态**的「同一语义多处写」
 * （轴 I 语义键 + 落点双向集合）。**缺口在「文档形态」**：编号 / 数字 / 口径 / 已删机制描述
 * **都不是代码符号** ⇒ 天然落在轴 I 归属池之外（轴 I 已如实披露「以代码形态为归属主判据」自限）。
 * 本批 6 条子 Issue（#353~#358）**全部**落在该自限里，这就是「为什么全部逃过守卫」的答案。
 *
 * 本清单是**文档守卫**（`validate-removed-mechanisms.js`）的数据来源，承载两条同族判据的数据：
 *   · ① 已删机制关键词在非历史区出现（#357 剩余面，见 `REMOVED_MECHANISM_KEYWORDS`）；
 *   · ② 断档编号：引用源码中不存在的治理规则编号（#353，第十二刀，见 `RULE_REF_DERIVE`）。
 *
 * ⚠️ 只承载**数据**（关键词表 / 编号派生口径 / 扫描范围 / 历史区豁免），判据纯函数一律在
 * `scripts/lib/doc-drift-scope.js`（判据模块内**无仓库路径字面量**，沿用 #321 R9-A 单源口径）。
 *
 * ⚠️ 数据清单模块**不做文件内容 IO**（读取与判据由守卫 CLI 编排）；
 *    唯一的目录枚举例外 = `discoverReleaseNoteFiles()`（Issue #388 13/13 复盘加固：
 *    `docs/releases/*.md` **机械枚举**，新增发布说明自动进扫描面，无需登记动作）——
 *    沿用 `guard-sources.js` 的 `discoverGuardSources()` 同口径（机械分母 > 手写清单）。
 */

// ==================== 一、已删机制关键词（#357 / #359 AC4）====================
/**
 * 病灶：机制已删除，**描述没删** ⇒ 文档成为「第二份真值」，读者/AI 以为机制还在
 * （实测 `docs/FEATURES.md:74-76` 曾写「批次表/凭证由 …强制」而现在时陈述已不存在的东西）。
 *
 * ⚠️ 判据口径（与 #357 方案 B 一致）：**非历史区**出现即报红。
 *   · 历史区 = `docs/FEATURES.md` 的「历史存档」小节 / `docs/USAGE.md` 的删除线块 /
 *     `docs/SKILLS.md` 的已弃用块 / `docs/HISTORY.md` 全文 / `CHANGELOG.md` 全文；
 *   · 历史区内的命中必须**已带显式标注**（「历史存档」/「已删除」/「已弃用」/「机制已删除」/`~~`），
 *     否则同样报红（防「挪进历史区即豁免」的作弊口袋）。
 */
const REMOVED_MECHANISM_KEYWORDS = [
  {
    id: 'generate-auto-batches',
    term: 'generateAutoBatches',
    title: '服务端自动分批（Issue #179 已由计划/覆盖判定取代，函数已删除）',
  },
  {
    id: 'auto-batch-persist',
    term: '自动分批落盘',
    title: '首次初始化自动分批落盘（批次表已不再落盘）',
  },
  {
    id: 'batch-allocation-table',
    term: '批次分配表',
    title: '批次分配表（`proofread-types.ts` 机制说明：批次分配表/凭证/状态机均已删除）',
  },
  {
    id: 'persist-credential',
    term: '落盘凭证',
    title: '逐步执行凭证落盘（同上，已删除）',
  },
  {
    id: 'proofread-disk-session',
    term: '从磁盘 session 归并',
    title: '从磁盘 session 归并（会话已在进程内、不落盘）',
  },
];

// ============ 一之二、断档编号（#353 / #359 第十二刀）============
/**
 * 病灶（#353 实测）：文档出现源码**并不存在**的治理规则编号（如 P16/P17/P25）⇒ 按编号查不到。
 * 与「已删机制」同族：文档的「名」与实现的真值之间无连通断言（编号不是代码符号 ⇒ 轴 I 拦不住；
 * 实测注入 `P16` 时轴 I / 判据 B / 体量闸门全绿 —— 即 #353 逃过全部守卫的原因）。
 *
 * ⚠️ 合法编号集合**必须运行时从 `governance.js` 派生**，不得在本清单手写第二份：
 * 派生口径 = 插件头部注释的规则声明行 `规则 <ID>：`（G1-G7 / P1-P4 / T1-T11）。
 * 本清单只承载派生规则（正则），编号集合一律运行时派生。本判据防 #353 销项**回潮**。
 * 双向口径同判据 B：非历史区出现未派生编号 ⇒ 报红；历史区命中缺显式标注 ⇒ 亦报红。
 */
const RULE_REF_DERIVE = {
  source: '.opencode/plugins/governance.js', // 唯一事实源：编号在此声明
  declaration: /^\s*\*?\s*规则\s*([GPT]\d+[a-z]?)\s*[:：]/gm, // `规则 G1：`（允许前导 `* `）
  // 编号 token；负向断言 (?!-\d) 只排除「P0-1」这类**复合问题 ID**（`-` 后跟数字）。
  // ⚠️ 第 1 轮评审 F1：原 (?![-_]) **过宽** —— 会连区间写法（`G1-G7` / `P16-P18`）的首编号一起吞掉
  //    （实测 `G1-G7` 只检出 `G7`）。判据：`-` 后是**数字**=复合 ID（排除）；后是**编号前缀**=区间（保留）。
  token: /\b([PGT])(\d+[a-z]?)\b(?!(?:-\d))/g,
};

/**
 * 从源码文本派生合法规则编号集合（**唯一派生实现**，CLI 与专测共用 —— 防第二份实现漂移）。
 * @param {string} src 治理插件源码文本
 * @param {RegExp} [declaration] 声明行正则（默认 `RULE_REF_DERIVE.declaration`）
 * @returns {Set<string>}
 */
function deriveValidRuleIds(src, declaration) {
  const re = declaration || RULE_REF_DERIVE.declaration;
  const set = new Set();
  for (const m of String(src).matchAll(new RegExp(re.source, re.flags))) set.add(m[1]);
  return set;
}

// ==================== 二、扫描范围 / 历史区豁免（唯一来源）====================
/** 文档漂移守卫扫描的**文档树**（文本类；代码树不扫 —— 其数字/机制由编译期与轴 I 约束）。 */
const DOC_SCAN_FILES = [
  'README.md',
  'AGENTS.md',
  'docs/ARCHITECTURE.md',
  'docs/DEVELOPMENT_GUIDE.md',
  'docs/WPS_COM_PS1.md',
  'docs/MCP.md',
  'docs/USAGE.md',
  'docs/FEATURES.md',
  'docs/SKILLS.md',
  'docs/SECURITY.md',
  // ⚠️ Issue #382：原缺口 —— **AI 可见面**（`skills/*/SKILL.md` 安装到 `~/.opencode/skills/`、
  //    `agents/*.md` 安装到 `~/.config/opencode/agents/`）不在扫描面内，故「G1 只拦网关专属工具」
  //    这类**已删机制的现在时陈述**在此存活（AI 每会话都读，产生与实现相反的预期）。现已纳入。
  //    ⚠️ 只要求该文件**存在**，缺文件不报红（防 fork/裁剪仓库误红）。
  'skills/wps-proofread/SKILL.md',
  'skills/wps-word/SKILL.md',
  'skills/wps-excel/SKILL.md',
  'skills/wps-ppt/SKILL.md',
  'skills/wps-office/SKILL.md',
  'agents/wps-expert.md',
  'agents/wps-word.md',
  'agents/wps-excel.md',
  'agents/wps-ppt.md',
  // ⚠️ Issue #388 13/13 复盘加固：发布说明归档（`docs/releases/*.md`）**机械枚举**入面 ——
  //    原先它们不在扫描面内，导致 #393 修的同类漂移无守卫兜底（评审偶然抓到）。
  ...discoverReleaseNoteFiles(),
];

/**
 * **机械枚举**：`docs/releases/*.md`（发布说明归档）。
 *
 * Issue #388 13/13 复盘加固 —— 病根：`docs/releases/*` 原先**不在扫描面内**，
 * 故 #393 修的两处（v1.12.0.md 的历史债段落过期 + `G1` 断档编号）**无任何守卫兜底**，
 * 全靠评审偶然抓到；同类漂移在 v1.11.0.md 仍存活 3 处（`G1` 断档编号）。
 * 现改为**机械枚举**（新增一份发布说明即自动进面，无需「登记」动作 —— 防「登记才进来」的
 * 自我许可通道，见 `guard-sources.js` 同口径）。
 *
 * ⚠️ 自限（显式披露）：只枚举 `docs/releases/*.md`（**不递归子目录**）；
 *    `opencode-wps/README.md` / `opencode-wps-assistant/` / `opencode-wps-linux/` 等
 *    子目录文档仍未纳入（纳入需另评一批新命中，不擅自扩面 —— 铁律 17⑨）。
 */
function discoverReleaseNoteFiles() {
  const dir = path.resolve(__dirname, '..', '..', 'docs', 'releases');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(n => n.endsWith('.md'))
    .map(n => `docs/releases/${n}`)
    .sort();
}

/**
 * **历史区**豁免（全文豁免的文件 / 段落锚点）。
 * ⚠️ 全文件豁免只给「本身就是归档」的两份（`HISTORY.md` / `CHANGELOG.md`），
 *    其余一律按**段落锚点**豁免（更窄），且豁免段内仍要求显式标注（见判据）。
 */
const HISTORICAL_FULL_FILES = ['docs/HISTORY.md', 'CHANGELOG.md'];

/**
 * 段落锚点：命中行位于「最近的上方锚点行」之后即视为历史区。
 * 判据要求历史区内的命中**同时**带 `ANNOTATION_MARKERS` 之一，否则报红。
 * （`FEATURES.md:297` / `USAGE.md:278-280` / `SKILLS.md:265` 均已在 #353~#358 轮次加了标注。）
 */
const HISTORICAL_SECTION_ANCHORS = ['历史存档', '已弃用', '已删除（历史', '（机制已删除）', '留存档案', '历史记录'];

/** 历史区内的「显式标注」标记（缺一即报红，防「挪进历史区即豁免」）。 */
const ANNOTATION_MARKERS = ['历史存档', '已删除', '已弃用', '机制已删除', '~~', '历史坐标', '留存档案', '历史记录'];

/**
 * **现行时断言词**（Issue #352 第十一刀：「自限②」的可收口部分）。
 *
 * 原自限②：「历史区只要求**显式标注**，不校验标注是否说的是同一件事」。
 * 实测该自限被这一形态当场利用（真实探针）：
 *   `## 历史存档` + `（历史存档）本机制仍生效，推荐使用自动分批落盘。` ⇒ 守卫 **EXIT=0** 放行。
 * 即：**顺手写一个「历史存档」字样就能把「仍生效 + 推荐使用」的现在时陈述带过闸门** ——
 * 这不是「标注是否说同一件事」这种需要人工语义判断的问题，而是**行内自相矛盾**：
 * 同一行既声称「已删/历史」，又声称「仍生效」，两者不可能同时为真。
 *
 * 判据：命中已删机制关键词的行，若落在历史区**且**带标注，**但**又含本表中的现行时断言词
 * ⇒ 报红（标注与陈述自相矛盾，须先把「仍生效」改掉）。
 *
 * ⚠️ 仍未收口的残余自限（如实披露，与判据模块同措辞）：
 *    ①「换一种说法描述同一已删机制」（自限①）不声称拦住；
 *    ② 本表只作用于**命中关键词的那一行** —— 现行时断言词出现在**另一行**
 *    （同段落相邻行 / 跨段落，实测 `EXIT=0`）不声称拦住。
 *    ⚠️ 本表**必须**由调用方单源传入；缺传时判据**报红**（不得 `|| []` 静默降级，
 *    见 `doc-drift-scope.js` 的「第十一刀评审判据」）。
 */
const ACTIVE_VOICE_MARKERS = [
  '仍生效',
  '仍然生效',
  '仍在使用',
  '仍在用',
  '推荐使用',
  '现行机制',
  '目前使用',
  '正常使用',
  '依然生效',
  '依旧生效',
];

module.exports = {
  RULE_REF_DERIVE,
  discoverReleaseNoteFiles,
  deriveValidRuleIds,
  REMOVED_MECHANISM_KEYWORDS,
  DOC_SCAN_FILES,
  HISTORICAL_FULL_FILES,
  HISTORICAL_SECTION_ANCHORS,
  ACTIVE_VOICE_MARKERS,
  ANNOTATION_MARKERS,
};
