'use strict';

/**
 * 文档形态「漂移」判据纯函数（Issue #359，元问题本体）。
 *
 * 与轴 I（`semantic-anchor-scope.js`）的分工 —— **这就是本 Issue 存在的理由**：
 *   · 轴 I：以**代码形态**的导出符号 / 具名常量 / 具名函数为归属主判据；
 *   · 本模块：同一「双向连通」思想，作用于**文档形态**（已删机制描述）——
 *     它们不是代码符号，天然落在轴 I 自限之外（#359 实测：本批 6 条**全部**落在该自限里）。
 *
 * ⚠️ 单一来源（#321 R9-A 同口径）：本模块**不出现任何仓库路径字面量**，
 *    关键词表 / 扫描范围 / 历史区豁免一律由 caller 单源传入
 *    （数据单源 = `doc-drift-manifest.js`）。本模块只提供纯判据。
 *
 * ⚠️ 自限（显式披露，非放宽）：
 *   ① 只拦**关键词命中**（`term` 字面出现）；换一种说法描述同一已删机制的
 *      「隐性同义描述」不声称拦住（同轴 I 的「不用新符号、只改语义细节」自限）；
 *   ② 历史区豁免只**要求显式标注**，不校验标注**是否说的是同一件事**（那需要人工评审）。
 *      ⇒ **Issue #352 第十一刀已把其中「可收口的部分」收口**：原自限②被这一形态当场利用 ——
 *      「`## 历史存档` + （历史存档）本机制**仍生效**，**推荐使用**自动分批落盘」曾 **EXIT=0** 放行。
 *      该形态不是「标注说什么」的语义判断题，而是**行内自相矛盾**（同一行既称已删又称仍生效）。
 *      现判据：历史区命中带标注、**但同时含 `ACTIVE_VOICE_MARKERS`** ⇒ 报红。
 *      **残余自限如实披露（第十一刀评审按实测收窄）**：
 *      ① 换说法的「隐性同义描述」仍不声称拦住；
 *      ② 自相矛盾判定只作用于**命中关键词的那一行** —— 现行时断言词若出现在**另一行**
 *      （同段落相邻行 / 跨段落，实测均 `EXIT=0`），不声称拦住。
 *      ⚠️ 原措辞「标注与陈述不在同一行不声称拦住」意思接近但未点明「判据只看一行」这一机制，
 *      故按实测改写为可核对的表述（逐形态实测：同行 `EXIT=1`；相邻行/跨段落 `EXIT=0`）。
 *      ②**为何不扩到段落窗口**：判据须作用在**单行**上才能避免把相邻段落的**合法历史记录**卷入
 *      （真实文档里「已删机制说明」与「仍生效的安全规则说明」常同段出现）⇒ 收益 < 误报风险，
 *      如实保留为自限，不假装拦住。
 */

/**
 * 判断某行是否落在**历史区**内。
 *
 * 口径：取该行**上方**最近的一个「段落锚点行」，若命中 `anchors` 则认为进入历史区；
 *   「段落」以 markdown 标题（`#` 开头）为**硬边界** —— 一旦遇到标题则历史区重置
 *   （防止一个「历史存档」小节的豁免向下无限延伸到整篇文档）。
 *
 * @param {string[]} lines  文档按行切分
 * @param {number} idx      目标行下标
 * @param {string[]} anchors 历史区锚点（子串匹配）
 * @returns {boolean}
 */
function isInHistoricalSection(lines, idx, anchors) {
  const list = Array.isArray(lines) ? lines : [];
  const marks = Array.isArray(anchors) ? anchors : [];
  for (let i = idx; i >= 0; i--) {
    const line = list[i] || '';
    const isHeading = /^#{1,6}\s/.test(line.trim());
    // 锚点行本身（含**标题行**，如 `## 历史存档`）即宣告进入历史区。
    if (marks.some(a => a && line.includes(a))) return true;
    // 未命中锚点的标题行是**段落硬边界**：历史区不得跨标题向下延伸。
    if (isHeading) return false;
  }
  return false;
}

/**
 * 判据 B：**已删机制关键词**在非历史区出现（#357 剩余面）。
 *
 * 双向口径（防作弊口袋）：
 *   · 非历史区命中 ⇒ 报红（读者会以为机制还在）；
 *   · 落入历史区但仍**无显式标注** ⇒ 同样报红（防「挪进历史区即豁免」）。
 *
 * @param {{path:string,text:string}} file 扫描对象
 * @param {Array} keywords `REMOVED_MECHANISM_KEYWORDS`（单源传入）
 * @param {string[]} historicalFiles 全文豁免的文件
 * @param {string[]} sectionAnchors  段落级历史区锚点
 * @param {string[]} annotationMarkers 历史区内的显式标注标记
 * @param {string[]} activeVoiceMarkers 现行时断言词（`ACTIVE_VOICE_MARKERS`，单源传入）
 * @returns {string[]} errors
 */
/**
 * ⚠️ 第十一刀评审判据（防结构性假绿）：`activeVoiceMarkers` **必须由调用方单源传入** ——
 * 缺传即**报红**（不得 `|| []` 兜底静默跳过）。
 *
 * 为什么必须这样（实测反例）：`activeVoiceMarkers` 以位置参数追加到既有 5 参之后，若遗漏
 * 则原实现 `(activeVoiceMarkers || [])` 把判据**静默降级为「不启用」**：守卫 `EXIT=0`、
 * 真实注入的行内自相矛盾**不再被拦**，而专测仍 15/15 全绿 ⇒ 一处漏参 = 整条新判据假绿，
 * 且无任何信号。判据「必须传」后，漏参在**调用点**即报红，专测亦有对应用例兜住。
 */
function checkRemovedMechanisms(
  file,
  keywords,
  historicalFiles,
  sectionAnchors,
  annotationMarkers,
  activeVoiceMarkers
) {
  const errors = [];
  if (!file || typeof file.text !== 'string' || !file.path) return errors;
  if ((historicalFiles || []).includes(file.path)) return errors;
  // 第十一刀评审判据：断言词表必须单源传入 —— 缺传即报红（防「漏参 ⇒ 判据静默降级」）。
  if (!Array.isArray(activeVoiceMarkers) || activeVoiceMarkers.length === 0) {
    return [
      `[已删机制] 判据调用缺 \`activeVoiceMarkers\` 单源（须传入 doc-drift-manifest.js 的 ` +
        `ACTIVE_VOICE_MARKERS）—— 缺传会让「标注与陈述行内自相矛盾」判据**静默失效**（假绿）；` +
        `本判据不接受 \`|| []\` 兜底（Issue #352 第十一刀评审）`,
    ];
  }
  const lines = file.text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const kw of keywords || []) {
      if (!kw || !kw.term || !line.includes(kw.term)) continue;
      const annotated = (annotationMarkers || []).some(a => a && line.includes(a));
      const inHistorical = isInHistoricalSection(lines, i, sectionAnchors);
      if (!inHistorical) {
        errors.push(
          `[已删机制] ${file.path}:${i + 1} 出现已删机制关键词「${kw.term}」（${kw.title}）——` +
            `现行机制已不存在，文档不得以现在时陈述它（否则成为「第二份真值」）；` +
            `若确为历史记录，须移入**历史存档区**并加显式标注（Issue #359 防腐要求 4）`
        );
      } else if (!annotated) {
        errors.push(
          `[已删机制] ${file.path}:${i + 1} 关键词「${kw.term}」位于历史区但**缺少显式标注**` +
            `—— 历史区内的命中必须写明「历史存档 / 已删除 / 已弃用 / 机制已删除」，` +
            `否则「挪进历史区」就成了免检的作弊口袋（Issue #359 防腐要求 4）`
        );
      } else {
        // 第十一刀：标注与陈述**自相矛盾** ⇒ 报红（原自限②「可收口的部分」）。
        const conflict = activeVoiceMarkers.filter(a => a && line.includes(a));
        if (conflict.length > 0) {
          errors.push(
            `[已删机制] ${file.path}:${i + 1} 关键词「${kw.term}」行内**自相矛盾**：` +
              `已标「历史存档/已删除」却又出现现行时断言词 ${conflict.map(c => `「${c}」`).join(' / ')}` +
              `—— 两者不可能同时为真；「顺手写个『历史存档』字样」不能把『仍生效』带过闸门。` +
              `请删掉现行时陈述，或改为纯历史记录（Issue #352 第十一刀）`
          );
        }
      }
    }
  }
  return errors;
}


/**
 * 判据 C：**断档编号**（#353 / #359 第十二刀）——非历史区引用源码中**不存在**的治理规则编号。
 * 与判据 B 同族（文档的「名」与实现真值之间无连通断言；编号非代码符号 ⇒ 轴 I 拦不住）。
 * 立案与派生口径见 `doc-drift-manifest.js` 的 `RULE_REF_DERIVE`（本模块不重抄，避免第二份真值）。
 *
 * ⚠️ 自限（显式披露，非放宽）：① 只拦 `P/G/T + 数字` token，「第 16 条规则」之类自然语言指代
 * 不声称拦住；② 只校验编号**是否存在**，不校验「用得对不对」（需人工评审）。
 * ⚠️ `validIds` / `derive.token` **必须单源传入**：缺传即报红，不得兜底静默跳过
 * （防「漏参 ⇒ 判据降级为不启用」的结构性假绿，同判据 B）。
 */
function checkDanglingRuleRefs(file, validIds, historicalFiles, sectionAnchors, annotationMarkers, derive) {
  if (!file || typeof file.text !== 'string' || !file.path) return [];
  const valid = validIds instanceof Set ? validIds : new Set(Array.isArray(validIds) ? validIds : []);
  if (valid.size === 0)
    return ['[断档编号] 合法编号集合为空 —— 须传入从 governance 源码（头部声明行）派生的编号集合；空集会误报全部编号或静默失效，本判据不接受空集'];
  if (!derive || !(derive.token instanceof RegExp))
    return ['[断档编号] 判据缺 `derive.token` 单源（须传入 doc-drift-manifest.js 的 RULE_REF_DERIVE）—— 缺传会让编号检出静默失效（假绿），不接受兜底'];
  if ((historicalFiles || []).includes(file.path)) return [];

  const errors = [];
  const lines = file.text.split('\n');
  const flags = derive.token.flags.includes('g') ? derive.token.flags : derive.token.flags + 'g';
  for (let i = 0; i < lines.length; i++) {
    const token = new RegExp(derive.token.source, flags);
    const missing = [];
    let m;
    while ((m = token.exec(lines[i])) !== null) if (!valid.has(m[1] + m[2])) missing.push(m[1] + m[2]);
    if (!missing.length) continue;
    const uniq = [...new Set(missing)].map(x => `\`${x}\``).join(' / ');
    if (!isInHistoricalSection(lines, i, sectionAnchors))
      errors.push(`[断档编号] ${file.path}:${i + 1} 引用了源码中**不存在**的治理规则编号 ${uniq} —— 按编号去源码查会**查不到**；请改为环节名或删掉编号（#353 同族）`);
    else if (!(annotationMarkers || []).some(a => a && lines[i].includes(a)))
      errors.push(`[断档编号] ${file.path}:${i + 1} 编号 ${uniq} 位于历史区但**缺显式标注** —— 须写明「历史存档/已删除/历史坐标」，否则「挪进历史区」成免检口袋（与判据 B 同口径）`);
  }
  return errors;
}

module.exports = { isInHistoricalSection, checkRemovedMechanisms, checkDanglingRuleRefs };

