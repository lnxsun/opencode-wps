/**
 * Input: 文档校对工具参数 Output: 校对结果和修订跟踪
 * Pos: Word 校对工具实现（文档校对 / 修订模式控制 / 精确范围替换）。
 *
 * 单一来源（不在本文件复述别处事实）：
 * - 校对**规则本体与守卫**在 `proofread-rules.ts`（本文件只调用 `runBasicProofreading`）；
 * - 结构化 issues 输出契约的消费方是 `governance.js`（P2 检索 `parsed.issues`）；AI 侧按 issues 数组消费（SKILL 2d）；
 * - 位置字段的坐标系契约 = `proofread-types.ts` 的 `DocumentTextSlice`（`start_offset` **必填**）。
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import {
  ToolDefinition,
  ToolHandler,
  ToolCallResult,
  ToolCategory,
  RegisteredTool,
} from '../../types/tools';
import { wpsClient } from '../../client/wps-client';
import { WpsAppType } from '../../types/wps';
import { validateFilePath } from '../../utils/path-safety';
import { Layer2BatchDeclaration } from './proofread-types';

/* C2 交叉核对（Issue #382）：把 confirmBatchAiProofread 从「空签到」升级为「必须产出可核对」。
   `layer1LastBatchCount` = 最近一次 proofreadBasic 的实测条数（**服务端捕获，AI 不可伪造**）；
   `layer2Pending` = 已申报未并入会话的声明队列（accumulate 经 `drainLayer2Declarations` 出队并入）。 */
let layer1LastBatchCount: number | undefined;
const layer2Pending: Layer2BatchDeclaration[] = [];
/** 出队并清空 Layer 2 申报（唯一定义者；accumulate 只调本函数，不自行实现）。 */
export const drainLayer2Declarations = (): Layer2BatchDeclaration[] => layer2Pending.splice(0);

/** 成功结果构造（**唯一实现**）；失败走 `failResult`。 */
function okResult(text: string): ToolCallResult {
  return { id: uuidv4(), success: true, content: [{ type: 'text', text }] };
}

/** 失败结果构造（**唯一实现**）：此前 8 处各写一遍同形状的错误返回，属「同一语义多源」。 */
function failResult(message: string, error: string): ToolCallResult {
  return { id: uuidv4(), success: false, content: [{ type: 'text', text: message }], error };
}

/** 异常包装：取 stack||message 并加前缀（`${prefix}出错: ${msg}`） */
function caughtResult(prefix: string, error: unknown): ToolCallResult {
  const errMsg = error instanceof Error ? error.stack || error.message : String(error);
  return failResult(`${prefix}出错: ${errMsg}`, errMsg);
}

/** 开启/关闭修订模式：校对修改前必须先开启，确保所有修改可追溯。 */
export const enableTrackChangesDefinition: ToolDefinition = {
  name: 'wps_word_enable_track_changes',
  description: `开启或关闭 Word 文档的修订模式（Track Changes）。执行校对修改前必须先开启，确保修改可追溯。
使用场景：「开始校对，开启修订模式」/「关闭修订模式」/「开启修订，我要开始改文档了」。`,
  category: ToolCategory.DOCUMENT,
  inputSchema: { type: 'object', properties: { enable: { type: 'boolean', description: 'true=开启修订模式，false=关闭修订模式。默认true' } }, required: ['enable'] },
};

export const enableTrackChangesHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { enable } = args as { enable: boolean };
  // ⚠️ Issue #401（R4 评审判据）：**缺省语义只此一处** —— schema 声明的默认值是 `true`，
  //   但此前用 `enable === true` 取值 ⇒ 缺省（undefined）被当成 `false`（**与声明的默认值相反**），
  //   与治理层「缺省 = 请求开启」的置位判据不一致（同一语义两处写）。
  //   现统一为「**仅显式 false 才算请求关闭**」，与 `governance.js` 的 `wantEnable` 同口径
  //   （守卫 `validate-tool-result-payload` 断言消费点；此处为 handler 侧唯一定义者）。
  const wantEnable = !(enable === false);

  try {
    type R = { success: boolean; trackChanges: boolean; active: boolean };
    const response = await wpsClient.executeMethod<R>('enableTrackChanges', { enable: wantEnable }, WpsAppType.WRITER);
    if (!response.success || !response.data) return failResult(`设置修订模式失败: ${response.error}`, response.error ?? '');
    // 独立回读（Issue #395 RC-3）：PS1 `enableTrackChanges` 里 `trackChanges = $enable` 是**回写入参回显**、
    // `active = $doc.TrackRevisions` 是**真实回读**，同属一次往返 ⇒ 无法区分「真生效」与「写入被静默拒绝」。
    // 故**另起一次** `getTrackChangesStatus` 独立往返取真值，文案只依据回读值，不一致即判失败（不留假成功）。
    const status = await wpsClient.executeMethod<{ success: boolean; trackChanges: boolean }>('getTrackChangesStatus', {}, WpsAppType.WRITER);
    const actual = status.success && status.data ? status.data.trackChanges : undefined;
    if (actual !== wantEnable) return failResult(`修订模式设置未生效（期望${wantEnable ? '开启' : '关闭'}，回读为${actual === undefined ? '读取失败' : actual ? '开启' : '关闭'}）。请重试或检查文档是否只读。`, '修订状态回读不一致');
    return okResult(`修订模式${actual ? '已开启' : '已关闭'}！所有后续修改将被跟踪记录。`);
  } catch (error) {
    return caughtResult('设置修订模式', error);
  }
};

/** 获取修订模式状态 */
export const getTrackChangesStatusDefinition: ToolDefinition = {
  name: 'wps_word_get_track_changes_status',
  description: `获取当前文档的修订模式状态。使用场景：「看看修订模式开了没」/「当前文档有多少处修订」/「检查修订状态」。`,
  category: ToolCategory.DOCUMENT,
  inputSchema: { type: 'object', properties: {} },
};

export const getTrackChangesStatusHandler: ToolHandler = async (
  _args: Record<string, unknown>
): Promise<ToolCallResult> => {
  try {
    type R = { success: boolean; trackChanges: boolean; revisionCount: number };
    const response = await wpsClient.executeMethod<R>('getTrackChangesStatus', {}, WpsAppType.WRITER);

    if (response.success && response.data) {
      const d = response.data;
      return okResult(`修订模式: ${d.trackChanges ? '已开启' : '已关闭'}\n当前修订数量: ${d.revisionCount}`);
    }
    return failResult(`获取修订状态失败: ${response.error}`, response.error ?? '');
  } catch (error) {
    return caughtResult('获取修订状态', error);
  }
};

/**
 * 按段落+文本匹配替换（修订模式下跟踪）：`paragraph.Range.Find.Execute` 按
 * 段落索引 + 文本匹配定位，不使用字符偏移（偏移易被域代码/分页符打乱）。
 */
export const replaceInParagraphDefinition: ToolDefinition = {
  name: 'wps_word_replace_in_paragraph',
  description: `按段落索引 + 文本匹配精确替换 Word 文本（避免偏移量不准确）；修订模式下自动产生修订标记。
使用场景：校对时替换指定段落中的错别字 / 已知段落索引时替换文本。
注意：段落索引可用 wps_word_get_paragraphs 获取；请先调用 wps_word_enable_track_changes 开启修订模式。`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      paragraph_index: { type: 'number', description: '段落索引（从1开始）' },
      find_text: { type: 'string', description: '要查找的原始文本' },
      replace_text: { type: 'string', description: '替换后的文本内容' },
      match_case: { type: 'boolean', description: '是否区分大小写，默认false' },
      match_whole_word: { type: 'boolean', description: '是否全词匹配，默认false' },
      replace_all: { type: 'boolean', description: '是否替换全部匹配项，默认false（只替换第一处）' },
    },
    required: ['paragraph_index', 'find_text', 'replace_text'],
  },
};

export const replaceInParagraphHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { paragraph_index, find_text, replace_text, match_case, match_whole_word, replace_all } =
    args as {
      paragraph_index: number;
      find_text: string;
      replace_text: string;
      match_case?: boolean;
      match_whole_word?: boolean;
      replace_all?: boolean;
    };

  if (paragraph_index === undefined || paragraph_index === null) return failResult('必须指定段落索引 paragraph_index！', '缺少段落索引');
  if (typeof paragraph_index !== 'number' || !Number.isInteger(paragraph_index) || paragraph_index < 1) return failResult('段落索引必须是大于0的整数！', '段落索引类型错误');
  if (!find_text || find_text === '') return failResult('查找文本不能为空！', '查找文本为空');
  if (replace_text == null) return failResult('替换文本不能为空（允许空字符串表示删除）！', '替换文本为 null/undefined');

  try {
    type R = { success: boolean; paragraphIndex: number; findText: string; replaceText: string; replacedCount: number };
    const response = await wpsClient.executeMethod<R>(
      'replaceInParagraph',
      {
        paragraphIndex: paragraph_index,
        findText: find_text,
        replaceText: replace_text,
        matchCase: match_case === true,
        matchWholeWord: match_whole_word === true,
        replaceAll: replace_all === true,
      },
      WpsAppType.WRITER
    );

    if (response.success && response.data) {
      const d = response.data;
      return okResult(`替换成功！\n段落: 第 ${d.paragraphIndex} 段\n查找: "${d.findText}"\n替换为: "${d.replaceText}"\n替换次数: ${d.replacedCount}`);
    }
    return failResult(`替换失败: ${response.error}`, response.error ?? '');
  } catch (error) {
    return caughtResult('替换', error);
  }
};

/** 基础文本校对工具：正则规则快速检测中文常见问题，不调用 AI，零 token 成本。 */
export const proofreadBasicDefinition: ToolDefinition = {
  name: 'wps_word_proofread_basic',
  description: `对中文文本进行基础校对（正则规则，零 token 成本）。
检测范围：易混淆字（的/得/地、在/再）、重复字符/标点、中英文标点混用、常见错误搭配、数字前后异常空格、连续空格/全角空格、常见网络用语/拼写错误。
返回每个问题的位置、原文、建议修改和问题类型；格式 = 文本展示 + 结构化 issues 字段（JSON 数组，每项含 type/offset/length/original/suggestion/context/metric，供治理插件消费）。
使用场景：校对前先做基础检查 / 批量处理段落文本 / 快速定位常见错误。`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要校对的文本内容（与 file_path 至少提供一个）。**单批即 200 段**，文本随批走；含 \\f 等控制字符或超长时改用 file_path。' },
      start_offset: { type: 'number', description: '本段文本在文档原文中的起始绝对偏移（UTF-16 code unit，0 起）。**必填**：决定 issues[].offset 所处坐标系；缺省时服务端拒绝执行（防静默错位）。' },
      file_path: { type: 'string', description: '从文件读取文本的路径（与 text 至少提供一个）。文本含 \\f 等控制字符时先写入文件再传此路径。' },
    },
    required: [],
  },
};

/** 基础校对规则引擎：返回检测到的问题列表 */
interface ProofreadIssue {
  offset: number;
  length: number;
  original: string;
  suggestion: string;
  type: string;
  /** 命中上下文：`...<前文>[<原文切片>]<后文>...`，坐标基准为**原文** */
  context: string;
  metric?: 'fluency' | 'conciseness';
}

import { rules } from './proofread-rules';
export function runBasicProofreading(text: string, baseOffset: number = 0, includeOptional: boolean = false): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  // 可选规则组（风格偏好/格式噪音）默认不启用（见 `Rule.optionalGroup`）；`includeOptional` 当前无用户可达路径。
  const activeRules = includeOptional ? rules : rules.filter(r => !r.optionalGroup);
  const offset = baseOffset || 0;

  // 剥离控制字符（保留 \\n \\r \\t）并保持 cleaned→original 偏移映射
  // （WPS COM Range.Text 含 \\f \\a \\u0007 会让正则匹配与偏移失真）
  const charMap: number[] = [];
  let cleaned = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x20 || code === 0x0a || code === 0x0d || code === 0x09) {
      charMap.push(i);
      cleaned += text[i];
    }
  }
  const useCleaned = cleaned.length !== text.length; // 无控制字符时直接用原文本，避免额外开销
  const effectiveText = useCleaned ? cleaned : text;

  for (const rule of activeRules) {
    let match: RegExpExecArray | null;
    // #420 CR-420-4：保留规则声明 flags（原 `'g'` 丢 `i` ⇒ `/gi` 规则大写占位失效）；缺 g 时补 g（exec 循环依赖 g）。
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    while ((match = regex.exec(effectiveText)) !== null) {
      // 归一化 + 上下文裁决（正则扩边界取上下文 → 剔回多余字符 / 整体丢弃）
      if (rule.normalizeMatch) {
        const normalized = rule.normalizeMatch(match, effectiveText);
        if (normalized === null) continue;
        // 归一化只允许**尾部修剪**（结果须为原匹配前缀）⇒ offset 不变、替换区间仍在原匹配内
        if (normalized.length > match[0].length || !match[0].startsWith(normalized)) {
          throw new Error('normalizeMatch 只允许尾部修剪（结果须为原匹配前缀）');
        }
        match[0] = normalized;
      }
      const orig = match[0];
      // 上下文守卫（西文词边界）不通过 → 丢弃该命中
      if (rule.isWesternSegment && !rule.isWesternSegment(match, effectiveText)) continue;
      // 右边界守卫（同形异义规则，如「变的」+ 名词不报）。
      // ⚠️ 需读**真实右邻**的结论必须在 `normalizeMatch` 内先算好——归一化会缩短 `m[0]`，
      // 此后 `m.index + m[0].length` 不再指向真实右邻。
      if (rule.isRightBoundaryOk && !rule.isRightBoundaryOk(match, effectiveText)) continue;
      const suggestion = rule.getSuggestion(orig);
      if (orig !== suggestion) {
        const start = match.index;
        // charMap 与 cleaned 一一对应（每保留一个字符 push 一次），且 start < cleaned.length ⇒ 恒在界内
        const docOffset = useCleaned ? (charMap[start] ?? start) : start;
        // offset/length/original/context 必须**统一到原文坐标系**（UTF-16 code unit），否则
        // text.slice(offset, offset+length) !== original，AI 按偏移改写会定位错位。
        // 匹配命中 cleaned 末字符时 charMap[endCleaned] 越界 → 取「cleaned 末字符原文索引 + 1」，
        // 不得取 text.length（那会把匹配之后的尾部控制字符吞进 original，使 issue.original 作
        // findText 逐字匹配时失配）。
        const endCleaned = start + orig.length;
        const endDoc = useCleaned
          ? endCleaned < charMap.length
            ? charMap[endCleaned]
            : charMap[charMap.length - 1] + 1
          : endCleaned;
        const original = text.slice(docOffset, endDoc);
        const issue: ProofreadIssue = {
          offset: offset + docOffset,
          length: endDoc - docOffset,
          original,
          suggestion,
          type: rule.type,
          context: `...${text.substring(Math.max(0, docOffset - 10), docOffset)}[${original}]${text.substring(endDoc, endDoc + 10)}...`,
        };
        if (rule.metric) issue.metric = rule.metric;
        issues.push(issue);
      }
    }
  }

  return issues;
}

export const proofreadBasicHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { text, start_offset, file_path } = args as {
    text?: string;
    start_offset?: number;
    file_path?: string;
  };

  // `start_offset` 是**坐标系声明**，不是可选优化：缺省时按 0 兜底会产出「本段相对偏移」
  // 却被消费方按「文档绝对偏移」解读 ⇒ 静默错位。故拒绝执行并给出正解。
  if (typeof start_offset !== 'number' || !Number.isFinite(start_offset)) {
    return failResult(
      `基础校对缺少 start_offset（当前值: ${start_offset === undefined ? '未传' : String(start_offset)}）。\n` +
        `start_offset = 本段文本在文档原文中的起始绝对偏移（UTF-16 code unit，0 起），` +
        `**必填**：它决定返回的 issues[].offset 落在哪个坐标系。缺省会被当作「本段相对偏移」产出，` +
        `而消费方（replaceInParagraph / 治理层 P3 替换内容校验）按「文档绝对偏移」解读 ⇒ 静默错位且不报错。\n` +
        `正解：先用 getDocumentTextByRange 按本批 offset 取文本，再把**同一个** start_offset 原样传进来。`,
      '缺少 start_offset（坐标系声明缺失）'
    );
  }

  let content: string;
  if (file_path) {
    try {
      const safePath = validateFilePath(file_path, []);
      content = fs.readFileSync(safePath, 'utf-8');
    } catch (err) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);
      return failResult(`读取文件失败: ${errMsg}`, errMsg);
    }
  } else {
    content = text || '';
  }

  if (!content || content.trim() === '') {
    return failResult('文本内容不能为空！', '文本内容为空');
  }

  try {
    // 已判定为有限数字 ⇒ 恒为显式传入值
    const issues = runBasicProofreading(content, start_offset);
    // C2：捕获本批 Layer 1 实测条数（供 confirmBatchAiProofread 交叉核对，AI 无法伪造）
    layer1LastBatchCount = issues.length;

    // 结构化输出：文本展示 + 可直接 JSON.parse 的 issues 数组
    // （governance.js 依赖 parsed.issues 判定 proofreadHadIssues / proofreadIssueOriginals）
    const issuesJson = JSON.stringify({
      issues: issues.map(({ metric, ...rest }) => (metric ? { ...rest, metric } : rest)),
    });

    if (issues.length === 0) return okResult(`基础校对完成，未发现明显问题。\n\n${issuesJson}`);

    const lines = issues.map(
      (issue, i) =>
        `${i + 1}. [${issue.type}] 位置 ${issue.offset}\n   原文: "${issue.original}"\n   建议: "${issue.suggestion}"\n   上下文: ${issue.context}`
    );

    return okResult(`基础校对完成，发现 ${issues.length} 个问题：\n\n${lines.join('\n\n')}\n\n${issuesJson}`);
  } catch (error) {
    return caughtResult('基础校对', error);
  }
};

/** 确认本批 AI 智能校对已完成（调用 proofreadBasic 后必须确认，才允许替换修复）。 */
export const confirmBatchAiProofreadDefinition: ToolDefinition = {
  name: 'wps_word_confirm_batch_ai_proofread',
  description: `确认本批 AI 智能校对已完成（**必传本批 AI 语义 issue 数**，与 Layer1 交叉核对）。
调用 proofreadBasic 后必须调用此工具确认 AI 校对已完成，才允许执行替换操作（两层都完成才可替换）。
Issue #382：原为空签到（恒返回「已确认完成」，Layer2 产出无人验收）—— 现须传 ai_issue_count。`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      ai_issue_count: {
        type: 'number',
        description: '本批 AI 语义分析（Layer 2）产出的 issue 数（0 = 本批逐句已核、未命中）。**必传**：使「必须产出」可核对，而非只满足「必须调用」。',
      },
    },
    required: ['ai_issue_count'],
  },
};

export const confirmBatchAiProofreadHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const n = (args as { ai_issue_count?: unknown }).ai_issue_count;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0)
    return failResult(
      `确认失败：ai_issue_count 必须是 ≥0 的整数（当前值: ${n === undefined ? '未传' : JSON.stringify(n)}）。\n` +
        `请传入本批 **AI 语义分析（Layer 2）**产出的 issue 数；本批逐句已核但未命中时传 0。`,
      '缺少/非法 ai_issue_count'
    );
  // C2：入队申报 + Layer 1 实测条数（供报告交叉核对）；未捕获时如实记「未知」，不兜底为 0。
  layer2Pending.push({ aiCount: n, layer1Count: layer1LastBatchCount });
  const L1 = layer1LastBatchCount, cross = L1 === undefined ? '；Layer 1 实测未捕获（本批未跑 proofreadBasic？）——报告该批记「未知」' : n === 0 && L1 > 0 ? `；⚠️ Layer 1 实测 ${L1} 条而申报 Layer 2 = 0 —— 报告将标出该批（#382 症状：病句未变成 issue）` : `；Layer 1 实测 ${L1} 条，已记入报告`;
  return okResult(`AI 智能校对已确认完成（本批 Layer 2 产出 ${n} 条 issue）${cross}。现在可以进行替换修复操作。`);
};

/** 导出所有校对相关工具 */

export const proofreadTools: RegisteredTool[] = [
  { definition: enableTrackChangesDefinition, handler: enableTrackChangesHandler },
  { definition: getTrackChangesStatusDefinition, handler: getTrackChangesStatusHandler },
  { definition: replaceInParagraphDefinition, handler: replaceInParagraphHandler },
  { definition: proofreadBasicDefinition, handler: proofreadBasicHandler },
  { definition: confirmBatchAiProofreadDefinition, handler: confirmBatchAiProofreadHandler },
];

export default proofreadTools;
