/**
 * 校对规则表与上下文守卫（Data + 守卫函数，无 IO、无 session 状态）：
 *   · 82 条规则（pattern / type / metric / getSuggestion / 上下文守卫）
 *     —— 其中 50 条默认启用、30 条风格偏好类标 `optional`（口语化 17 + 格式类 13），默认关闭（Issue #352 压缩方案 A）
 *   · 上下文守卫与白名单（西文词边界、的使用法谓语表、使用 → 动宾白名单）
 *
 * 注释口径：每条规则**只留判据与被误报的反例**；轮次/评审过程/被否方案一律不留（留痕单源 = PR 评论与 git 历史）。
 * 改 pattern 前先跑规则回归 + e2e —— 误报会诱导 AI 改坏正确文本（宁可少报不可误报）。
 */

import type { Rule } from './proofread-types';

const isCjkChar = (ch?: string): boolean => !!ch && ch.charCodeAt(0) >= 0x4e00 && ch.charCodeAt(0) <= 0x9fff;

/** 西文词边界字符：空白（Tab/LF/CR）或 ASCII 可见标点，排除 0-9 A-Z a-z 这些「词内字符」。 */
function isWesternBoundaryChar(ch: string | undefined): boolean {
  if (!ch || isCjkChar(ch)) return false;
  const code = ch.charCodeAt(0);
  if (code === 0x20 || (code >= 0x09 && code <= 0x0d)) return true;
  if (code < 0x21 || code > 0x7e) return false;
  const isAlnum = (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
  return !isAlnum;
}

// 「的得混淆」右边界判定中的**名词性后继词**白名单
const NOUN_LIKE_BIAN = ['前提', '情况', '过程', '结果', '状态', '现象', '趋势', '规律', '程度', '幅度', '范围', '方向', '方式', '方法', '原因', '因素', '条件', '环境', '场景', '模式', '策略', '方案', '目标', '指标', '数据', '参数', '数量', '质量', '性质', '特征', '特点', '关系', '结构', '形式', '内容', '含义', '意义', '作用', '影响', '效果', '问题', '缺陷', '风险', '成本', '收益', '价值', '时间', '频率', '周期', '阶段', '步骤', '流程', '版本', '权限', '规则', '约束', '类型', '名称', '位置', '路径', '界面', '需求', '功能', '组件', '模块', '接口', '文档', '报告', '记录', '项目', '产品', '服务', '系统', '平台', '客户', '用户', '团队', '成员', '部门', '岗位', '职责', '制度', '政策', '法规', '条款', '合同', '协议'];

// 「的得混淆」右边界共用判定：后继词是否以**名词性成分**开头（名词表单一来源 NOUN_LIKE_BIAN）。
const isNounLikeFollower = (follower: string): boolean => !!follower && NOUN_LIKE_BIAN.some(n => follower.startsWith(n));

// 「使用」作动词时的**强搭配**白名单。注：**不得**把 `人` 收入本表（`使用人员`/`使用人才`/`使用人心服`）
const USAGE_OBJECT_AFTER_YONG = ['意见', '时长', '说明', '情况', '方式', '方法', '范围', '权限', '记录', '文档', '系统', '环境'];

// 「使用 + 该宾语」构成**正常动宾搭配**的名物化宾语白名单
const ENV_CAUSE_USE_NOUN_OBJ = ['范围', '意见', '时长', '记录', '系统', '环境', '情况', '方式', '方法', '权限', '说明', '文档', '数据'];

// 判断「[使让令]用」之后是否接「使用」的确定宾语
function isUsageObjectAfter(after: string): boolean {
  if (!after.startsWith('用')) return false;
  const obj = after.slice(1);
  if (!obj) return false;
  // 否则 `记录员`/`文档化`/`系统化`/`环境前` 会被 `记录/文档/系统/环境` 前缀误豁免
  return USAGE_OBJECT_AFTER_YONG.some(n => {
    if (!obj.startsWith(n)) return false;
    const next = obj[n.length];
    return next === undefined || !/^[\u4e00-\u9fff]$/.test(next);
  });
}

// `由于A的原因使…` 中「使」与后继「用」是否实为**动词「使用」**
function isEnvCauseUseAsVerb(after: string): boolean {
  if (!after.startsWith('用')) return false;
  if (after[1] === '了') return true;
  return ENV_CAUSE_USE_NOUN_OBJ.some(n => after.startsWith('用' + n));
}

// 「变的/做的」**左语境**判定
function isLeftContextCjk(text: string, index: number): boolean {
  const left = text[index - 1];
  if (left === undefined) return false; // 串首 → 独立结构，允许白名单豁免
  if (!isCjkChar(left)) return false; // 全角标点/空白 → 独立结构
  // 左邻为汉字：若为「否定/变更词」（`不变的`/`未变的`/`可变的`…），视为独立结构 → 白名单豁免成立
  return !/^[不未没要有会能可变已]$/.test(left);
}

// ==================== 校对规则表（82 条：52 默认 + 30 optionalGroup）====================

export const rules: Rule[] = [
  // ===== 的/得/地 混淆 =====
  // 判据：谓语后**不得紧跟汉字**（`真的好`✓ / `真的好像`✗ / `最大的好处`✗ / `真的对不上`✗）——
  // 误报会建议 AI 把正确文本改坏，方向与 P1-3 一致。
  {
    pattern:
      /(狠|很|真|非|极|异|格|大|更|最|顶|十|万)的(?:开心|难过|高兴|好|坏|快|慢|多|少|高|低|长|短|大|小|厚|薄|深|浅|早|晚|对|像|努力)(?![\u4e00-\u9fff])/g,
    type: '的得混淆',
    getSuggestion: m => m.replace('的', '得'),
  },
  // 的地混淆：判据 = 「的」后必须紧接**动词性谓语**（状中结构），后接名词一律不报。
  // ① 双字谓语后**不得再跟汉字**（`学习`✓ / `学习方式`✗ / `看法`✗）；
  // ② 名词是开放类（`表述/提法/口径/看法/说法/判断`…）无法穷举，故用谓词白名单而非名词黑名单。
  {
    pattern:
      /(?:(?:一致|大力|全力|肆意|努力)的(?!地)(?=(?:执行|进行|完成|对待|推进|落实|开展|看待|学习|工作|分析|判断|检查|评估|比对|核对|验证|操作|使用|调用|访问|响应|运行|实现|支持|提供|获取|设置|更新|删除|创建|加载|保存|构建|部署|发布|测试|协同|配合|遵守|思考|研究|讨论|交流|沟通|反馈|汇报|总结|规划|设计|实施|维护|优化|改进|调整|变更|监控|管理|组织|协调|推动|促进|加强|提升|改善|保障|确保|避免|防止|控制|降低|提高|增加|减少|扩大|缩小|加快|放缓)(?![\u4e00-\u9fff])|处理(?!方式|方法|流程|步骤|结果|过程|程序|意见|情况)|努力(?=[\u4e00-\u9fff]))|(?:飞快|慢慢|静静|默默|悄悄|使劲|不断|不停|一口)的|不停的)/g,
    type: '的地混淆',
    getSuggestion: m => m.replace('的', '地'),
  },
  // 常见"的得地"上下文模式
{ pattern: /(做|搞|弄|写|说|画|跑|跳|走|看|听|吃|喝)的(太|很|非常|比较|极为|十分|挺|有点|有些)/g, type: '的得混淆', getSuggestion: m => m.replace(/(做|搞|弄|写|说|画|跑|跳|走|看|听|吃|喝)的/, '$1得'), },
{ pattern: /(笑|哭|叫|闹|做)的(合不拢嘴|不停|不亦乐乎|很|出神)/g, type: '的得混淆', getSuggestion: m => m.replace(/(笑|哭|叫|闹|做)的/, '$1得'), },

  // ===== 在/再 混淆 =====
  // 判据：前接「正/现」（`正在去`/`现在来`）为合法用法；「在次月/次日/次周」是**介词「在」+ 时间名词**。
  { pattern: /(?<![正现])在次(?![月日周年])|(?<![正现])在(来|去)/g, type: '在再混淆', getSuggestion: m => '再' + m.substring(1) },

  // ===== 重复字符 =====
{ pattern: /([\u4e00-\u9fff])\1{2,}/g, type: '重复字符', getSuggestion: m => m[0], },

  // ===== 重复标点 =====
{ pattern: /([，。；：、！？]){2,}/g, type: '重复标点', getSuggestion: m => m[0], optionalGroup: true, },
{ pattern: /(\.\.\.+|……+)\.*/g, type: '重复标点', getSuggestion: () => '……', optionalGroup: true, },
{ pattern: /(---|—————)/g, type: '重复标点', getSuggestion: () => '——', optionalGroup: true, },

  // ===== 中英文标点混用 =====
  // 两条规则判据不同：① 「标点夹在两个西文词之间」；② 「单个西文词与中文标点相邻」（需词边界守卫）。
{ pattern: /[a-zA-Z]{2,}[，][a-zA-Z]{2,}/g, type: '中英混排', getSuggestion: m => m.replace('，', ','), },
  {
    pattern: /[a-zA-Z]{2,}[，。][\u4e00-\u9fff]/g,
    type: '中英混排',
    getSuggestion: m => m.replace(/[，。]/, c => (c === '，' ? ',' : '.')),
    // 西文词左侧必须存在**明确词边界**：串首不报（`QPS，目录查询` 属标准中文排版）；
    // 左侧为 CJK 不报；越过连续空白/ASCII 标点后撞见 CJK 也不报（实为中文语境中的缩写）。
    isWesternSegment: (m, text) => {
      if (m.index === 0) return false;
      const left = text[m.index - 1];
      if (isCjkChar(left)) return false;
      // 左侧 ASCII 标点（如 `(` `"` `-`）或空白都算词边界；ASCII 字母数字说明西文词被截断 → 不报
      if (!isWesternBoundaryChar(left)) return false;
      // ② 越过连续空白/ASCII 标点，检查是否撞见 CJK（= 实为中文语境中的缩写）
      for (let i = m.index - 2; i >= 0; i--) {
        const ch = text[i];
        if (isCjkChar(ch)) return false;
        if (!isWesternBoundaryChar(ch)) return true;
      }
      // 一路到串首都只有空白/ASCII 标点 → 无 CJK 包夹 → 西文片段
      return true;
    },
  },

  // ===== 数字前后异常空格 =====
{ pattern: /(\d) ([,.;:!?])/g, type: '数字空格', getSuggestion: m => m.replace(' ', ''), optionalGroup: true, },
{ pattern: /([,.;:!?]) (\d)/g, type: '数字空格', getSuggestion: m => m.replace(' ', ''), optionalGroup: true, },

  // ===== 常见错误搭配 =====
{ pattern: /的原因是因为/g, type: '句式冗余', getSuggestion: () => '是因为', },
{ pattern: /的原因是由于/g, type: '句式冗余', getSuggestion: () => '是由于', },
  {
    // 大约 + 数量成分（1-8 字）+ 左右/上下 — 如"大约需要两小时左右"
    pattern: /大约([^，。；！？\n]{1,8})(左右|上下)/g,
    type: '句式冗余',
    getSuggestion: m => '大约' + m.replace(/^大约/, '').replace(/(左右|上下)$/, ''),
  },
{ pattern: /目的是为了/g, type: '句式冗余', getSuggestion: () => '是为了', },
{ pattern: /可以(说|看成|认为)是/g, type: '句式冗余', getSuggestion: m => '可' + m.substring(2), },
{ pattern: /被(广大|众多)所/g, type: '句式冗余', getSuggestion: () => '被', },

  // ===== 过于口语化 =====
{ pattern: /好的吧/g, type: '口语化', getSuggestion: () => '好的', optionalGroup: true, },
{ pattern: /这样子/g, type: '口语化', getSuggestion: () => '这样', optionalGroup: true, },
{ pattern: /那样子/g, type: '口语化', getSuggestion: () => '那样', optionalGroup: true, },
  // "搞"在正式文档中应替换
{ pattern: /去搞/g, type: '口语化', getSuggestion: () => '处理', optionalGroup: true, },
{ pattern: /在搞/g, type: '口语化', getSuggestion: () => '在处理', optionalGroup: true, },
{ pattern: /搞(定|完|好|妥)/g, type: '口语化', getSuggestion: () => '完成', optionalGroup: true, },
  // "弄"在正式文档中应替换
{ pattern: /弄(好|完|妥|出来)/g, type: '口语化', getSuggestion: () => '完成', optionalGroup: true, },
{ pattern: /去弄/g, type: '口语化', getSuggestion: () => '处理', optionalGroup: true, },
  // "啥"太口语化
{ pattern: /(干|有|说|做)啥/g, type: '口语化', getSuggestion: m => m.replace('啥', '什么'), optionalGroup: true, },
{ pattern: /啥(都|也|的|呀)/g, type: '口语化', getSuggestion: m => '什' + '么' + m[1], optionalGroup: true, },
  // "挺"在正式文档中应替换
{ pattern: /挺(好|大|多|快|高|长|难|重|重要|不错|合适|特别|关键)/g, type: '口语化', getSuggestion: m => '很' + m.substring(1), optionalGroup: true, },
  // "反正"太口语化
{ pattern: /(这|那)反正/g, type: '口语化', getSuggestion: m => (m[0].includes('这') ? '这无论如何' : '那无论如何'), optionalGroup: true, },
{ pattern: /反正(说|就是|都|也)/g, type: '口语化', getSuggestion: m => '无论' + (m.substring(2) === '说' ? '如何' : m.substring(2)), optionalGroup: true, },
  // "然后"过多（仅在句号/逗号后）
{ pattern: /([。，])然后/g, type: '口语化', getSuggestion: m => (m.startsWith('。') ? '。随后' : '，接着'), optionalGroup: true, },
  // "就是说"在正式文档中可优化
{ pattern: /就是(说|讲)/g, type: '口语化', getSuggestion: () => '即', optionalGroup: true, },
  // "什么的"在正式文档中应替换
{ pattern: /什么的/g, type: '口语化', getSuggestion: () => '等', optionalGroup: true, },
{ pattern: /特别(好|大|多|快|高|长|重要|明显|突出|优秀)/g, type: '口语化', getSuggestion: m => '十分' + m.substring(2), optionalGroup: true, },

  // ===== 常见错别字模式 =====
{ pattern: /即(然|而)/g, type: '即既混淆', getSuggestion: m => '既' + m.substring(1), },
  // `变的`/`做的` 右边界约束（与 P1-3「一致的成果」同族）：
  // `的` 后紧接**名词性成分**（变更对象）时属定语结构 → 不报。
  {
    pattern: /变的/g,
    type: '的得混淆',
    getSuggestion: () => '变得',
    // 判据：**左语境 + 右词性联合**。左右皆为 CJK（`数值变的很少`）时「变的」跟在主语之后，
    // 故须结合左语境；只按右侧名词前缀匹配会把 `数据/结果/状态` 这类可作主语的名词误豁免。
    isRightBoundaryOk: (m, text) =>
      !isNounLikeFollower(text.slice(m.index + m[0].length, m.index + m[0].length + 4)) ||
      isLeftContextCjk(text, m.index),
  },
  {
    pattern: /做的/g,
    type: '的得混淆',
    getSuggestion: () => '做得',
    isRightBoundaryOk: (m, text) =>
      !isNounLikeFollower(text.slice(m.index + m[0].length, m.index + m[0].length + 4)) ||
      isLeftContextCjk(text, m.index),
  },

  // ===== 合同/法律术语常见错误 =====
{ pattern: /签定(合同|协议|合约|约定)/g, type: '法律术语', getSuggestion: m => '签订' + m.substring(2), },
  // 权力→权利（法律/知识产权语境）
{ pattern: /(知识|所有|著作|专利|商标|许可)(权)力/g, type: '法律术语', getSuggestion: m => m.replace(/权力$/, '权利'), },
{ pattern: /权力(维护|保护|保障|归属)/g, type: '法律术语', getSuggestion: m => '权利' + m.substring(2), },

  // ===== 工程/技术术语常见错误 =====
{ pattern: /隐蔽性工程/g, type: '工程术语', getSuggestion: () => '隐蔽工程', },
{ pattern: /算数(错误|问题|计算|统计)/g, type: '常见错别字', getSuggestion: m => '算术' + m.substring(2), },

  // ===== 数字量词搭配不当 =====
{ pattern: /([2-9])大(方面|部分|模块|功能|内容|阶段|类型|类别|层次|层面)/g, type: '量词搭配', getSuggestion: m => m.replace(/(\d)大/, '$1个'), },

  // ===== "其它"→"其他" =====
{ pattern: /其它(人|事|物|方面|单位|情况|问题|费用|知识产权|的|，|。|；|：)/g, type: '用词统一', getSuggestion: m => '其他' + m.substring(2), },

  // ===== 多余点号 =====
{ pattern: /\. \./g, type: '多余点号', getSuggestion: () => '.', optionalGroup: true, },
  // 连续2+中文句号
{ pattern: /([\u4e00-\u9fff])(\.\.|。\.)/g, type: '多余点号', getSuggestion: m => m[1] + '.', optionalGroup: true, },
  // 句号后直接跟中文（标准编号如GB/T内带"."的不在此列）
{ pattern: /([\u4e00-\u9fff])\。\.([\u4e00-\u9fff])/g, type: '多余点号', getSuggestion: m => m[1] + '。' + m[2], optionalGroup: true, },

  // ===== 中文标点规范 =====
{ pattern: /([\u4e00-\u9fff]):([\u4e00-\u9fff])/g, type: '中文标点', getSuggestion: m => m[0].replace(':', '：'), optionalGroup: true, },
  // 英文逗号在中文文本中
{ pattern: /([\u4e00-\u9fff]),([\u4e00-\u9fff])/g, type: '中文标点', getSuggestion: m => m[0].replace(',', '，'), optionalGroup: true, },
  // 分号误用为冒号场景
{ pattern: /(包括|以下|如下|例如|比如|主要有)(的|以下)?；(?!\s)/g, type: '中文标点', getSuggestion: m => m.replace('；', '：'), optionalGroup: true, },
  // 中文正文中英文句点不应直接跟随中文（排除标准编号如GB/T）

  // ===== 多字（赘字/冗余） =====
{ pattern: /偏离程度的很/g, type: '多字', getSuggestion: () => '偏离程度很', },
{ pattern: /的的程度/g, type: '多字', getSuggestion: () => '的程度', },

  // 冗余"到"
{ pattern: /涉及到/g, type: '多字', getSuggestion: () => '涉及', },
{ pattern: /付诸于/g, type: '多字', getSuggestion: () => '付诸', },
{ pattern: /诉诸于/g, type: '多字', getSuggestion: () => '诉诸', },
  // 冗余"来/去"
{ pattern: /归结为(说|讲)是/g, type: '多字', getSuggestion: () => '归结为', },
  // 冗余"说"
{ pattern: /也就是说/g, type: '多字', getSuggestion: () => '即', },

  // 冗余判断
{ pattern: /并(非|不)是/g, type: '多字', getSuggestion: m => (m.includes('非') ? '并非' : '并不'), },
{ pattern: /必须要/g, type: '多字', getSuggestion: () => '必须', },
{ pattern: /全部都/g, type: '多字', getSuggestion: () => '全部', },
{ pattern: /进一步地/g, type: '多字', getSuggestion: () => '进一步', },
{ pattern: /现如今/g, type: '多字', getSuggestion: () => '如今', },
{ pattern: /最为(重要|关键|核心|突出|显著)/g, type: '多字', getSuggestion: m => '最' + m[1], },

  // ===== 少字（缺字） =====
  {
    pattern:
      /以下([一二三四五六七八九十两])(控制|方面|类型|方式|阶段|部分|模块|方法|条件|要求|类别|层次|层面)/g,
    type: '少字',
    getSuggestion: m => m.replace(/([一二三四五六七八九十两])/, '$1种'),
  },

  // ===== 评测/测评 混淆 =====
{ pattern: /安全评测/g, type: '常见错别字', getSuggestion: () => '安全测评', },
{ pattern: /软件评测/g, type: '常见错别字', getSuggestion: () => '软件测评', },

  // ===== 异常空格检测 =====
{ pattern: /  +/g, type: '异常空格', getSuggestion: () => ' ', optionalGroup: true, },
{ pattern: /\u3000+/g, type: '异常空格', getSuggestion: () => ' ', optionalGroup: true, },

  // ===== 测试/占位文本检测 =====
  {
    pattern:
      /(?:check|test|sample|todo|fixme|placeholder|lorem ipsum)\s+(?:\w+\s+){0,5}(?:check|test|sample|todo|fixme|placeholder|lorem ipsum)/gi,
    type: '占位文本',
    getSuggestion: () => '[需补充正式内容]',
  },
{ pattern: /(?:xx|xxx|xxx|xxxx)\s*(?:有限公司|公司|项目|部门|单位)/gi, type: '占位文本', getSuggestion: m => m.replace(/x+/gi, '[名称]'), },
  // Issue #420 裸占位：旧规则强制后接「公司/项目/部门/单位」⇒ 恒漏检（实证段 36 `xxxxx`）；下界 3 防误伤、左右排字母防吃 `Maxxxx`。
  { pattern: /(?<![A-Za-z])x{3,}(?![A-Za-z])/gi, type: '占位文本', getSuggestion: () => '[需补充正式内容]' },
  // Issue #420 网络用语 `3W路`⇒`3万`；裸 `\d+W` 会误报 `100W 灯泡`。量词**纯前瞻**（`\s*` 入前瞻，防 CR-420-1 尾随空白进 original）。
  { pattern: /\d+\s*[Ww](?=\s*(?:路|人|元|条|台|次|个|平|套|份|辆|头|只))/g, type: '网络用语', getSuggestion: m => m.replace(/[Ww]/, '万') },

  // ===== 通顺/简洁规则 — metric 驱动 =====
  {
    // 判据：A 限定「不含句末标点/换行、≤8 字」（无界 `(.*?)` 会跨句乱吃）。
    // `…使用意见` 不报（使用意见 = 使用 + 意见）；`…使用户体验更好` 仍报（使用户 = 使 + 用户）。
    // 「使用」的排除不能用正则负向断言 `(?![用命])`——正则只能看形态，须由守卫看右邻语义。
    pattern: /通过([^。；！？\n]{1,8}?)([使让令])/g,
    isRightBoundaryOk: (m, text) =>
      // 取匹配后 8 字符（词界判定需看到表项之后的字符，R9-1 修复：
      !isUsageObjectAfter(text.slice(m.index + m[0].length, m.index + m[0].length + 8)),
    type: '句式杂糅',
    metric: 'fluency',
    getSuggestion: m => {
      // "通过A使B" → "A使B" 或 "通过A，B"
      return m.replace(/^通过/, '');
    },
  },
  {
    // 与「通过A使B」同族：无界 `.*?` 会跨句乱吃，故 A 限定「不含句末标点/换行」（含半角 `. ! ?`）。
    // 上界 12 字取自实测：正例最长 `第三方检测机构检验报告` = 12 字（8 字会误伤真杂糅）。
    pattern: /根据((?:(?![.!?]\s)[^。；！？\n\r\v\f\u2028\u2029]){1,12}?)(显示|表明|证实)/g,
    type: '句式杂糅',
    metric: 'fluency',
    getSuggestion: m => {
      // "根据A显示" → "根据A" 或 "A显示"
      return m.replace(/^根据/, '').replace(/(显示|表明|证实)$/, '');
    },
  },
  {
    // 「由于A的原因导致/使/造成」——双重因果句式杂糅。
    // 判据：A 限定「不含句末标点/换行」（**刻意保留 `，`**，正例 `施工方未按图施工` 含逗号时仍成立）；
    // A 上界 **15 字**（实测正例最长 15 字 / 负例 ≥ 22 字）；「使用」双锚点须由守卫裁决右邻。
    pattern:
      /由于((?:(?![.!?]\s)[^。；！？\n\r\v\f\u2028\u2029]){1,15}?)(的原因)(导致|使用|使|造成)/g,
    // 双锚点下尾字「用」有两义，须看后继才能定；而归一化会缩短 `m[0]`，
    // 真实右邻必须在本钩子内先读，故不能用 isRightBoundaryOk（见 proofread-rule-types.ts）。
    normalizeMatch: (m, text) => {
      // 非双锚点命中（末尾不是「用」）→ 无需裁决
      if (!m[0].endsWith('使用')) return m[0];
      // ⚠️ 窗口必须从**「用」字**起（不是「使用」之后）——isEnvCauseUseAsVerb 的首个判据就看它
      const after = text.slice(m.index + m[0].length - 1, m.index + m[0].length + 7);
      // isEnvCauseUseAsVerb 返回 true = 属**正常「使用 + 宾语」** → 整体丢弃该命中
      if (isEnvCauseUseAsVerb(after)) {
        return null;
      }
      // 真杂糅（`使 + 用X`）→ **只剔除落单的尾字「用」**（`…的原因使用` → `…的原因使`）——
      // 不得再补一个「使」，否则会得到 `…使使`。
      return m[0].slice(0, -1);
    },
    type: '句式杂糅',
    metric: 'fluency',
    getSuggestion: m => {
      // "由于A的原因导致B" → "由于A，B" 或 "A导致B"；落单「用」已在 normalizeMatch 唯一收口剔除。
      return m.replace('的原因', '');
    },
  },

  // 冗余词（conciseness）：动词本身已表达完整语义，额外成分是赘余
  {
    pattern:
      /进行(了)?((深入|详细|认真|充分|全面|系统|细致|专门|彻底|有效)[的])?(研究|分析|讨论|处理|调查)/g,
    type: '冗余词',
    metric: 'conciseness',
    getSuggestion: m => m.replace(/^进行(了)?/, ''),
  },
  {
    pattern: /作出(了)?(决定|部署|安排)/g,
    type: '冗余词',
    metric: 'conciseness',
    getSuggestion: m => m.replace(/^作出(了)?/, ''),
  },
  {
    pattern: /予以(了)?(解决|处理|落实)/g,
    type: '冗余词',
    metric: 'conciseness',
    getSuggestion: m => m.replace(/^予以(了)?/, ''),
  },
  {
    pattern: /加以(了)?(解决|完善|规范)/g,
    type: '冗余词',
    metric: 'conciseness',
    getSuggestion: m => m.replace(/^加以(了)?/, ''),
  },
  {
    pattern: /针对(.*?)这一问题/g,
    type: '冗余词',
    metric: 'conciseness',
    getSuggestion: m => {
      // "针对A这一问题" → "针对A" 或 "对A"
      return m.replace(/针对/, '对').replace(/这一问题$/, '');
    },
  },
];
