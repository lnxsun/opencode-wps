/**
 * Input: 文档校对工具参数
 * Output: 校对结果和修订跟踪
 * Pos: Word 校对工具实现。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * Word校对Tools - 文档校对与修订模块
 * 处理文档校对、修订模式控制、精确范围替换等操作
 *
 * 包含：
 * - wps_word_enable_track_changes: 开启/关闭修订模式
 * - wps_word_get_track_changes_status: 获取修订模式状态
 * - wps_word_replace_range: 按字符范围替换文本（修订模式下跟踪）
 * - wps_word_proofread_basic: 基础文本校对（正则检测错别字/语病）
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ToolDefinition,
  ToolHandler,
  ToolCallResult,
  ToolCategory,
  RegisteredTool,
} from '../../types/tools';
import { wpsClient } from '../../client/wps-client';
import { WpsAppType } from '../../types/wps';

/**
 * 开启/关闭修订模式
 * 在执行校对修改前必须先开启修订模式，确保所有修改可追溯
 */
export const enableTrackChangesDefinition: ToolDefinition = {
  name: 'wps_word_enable_track_changes',
  description: `开启或关闭Word文档的修订模式（Track Changes）。
在执行校对修改前必须先开启修订模式，确保所有修改可追溯。

使用场景：
- "开始校对，开启修订模式"
- "关闭修订模式"
- "开启修订，我要开始改文档了"`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      enable: {
        type: 'boolean',
        description: 'true=开启修订模式，false=关闭修订模式。默认true',
      },
    },
    required: ['enable'],
  },
};

export const enableTrackChangesHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { enable } = args as { enable: boolean };

  try {
    const response = await wpsClient.executeMethod<{
      success: boolean;
      trackChanges: boolean;
      active: boolean;
    }>(
      'enableTrackChanges',
      { enable: enable === true },
      WpsAppType.WRITER
    );

    if (response.success && response.data) {
      const status = response.data.active ? '已开启' : '已关闭';
      return {
        id: uuidv4(),
        success: true,
        content: [
          {
            type: 'text',
            text: `修订模式${status}！所有后续修改将被跟踪记录。`,
          },
        ],
      };
    }
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `设置修订模式失败: ${response.error}` }],
      error: response.error,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `设置修订模式出错: ${errMsg}` }],
      error: errMsg,
    };
  }
};

/**
 * 获取修订模式状态
 */
export const getTrackChangesStatusDefinition: ToolDefinition = {
  name: 'wps_word_get_track_changes_status',
  description: `获取当前文档的修订模式状态。

使用场景：
- "看看修订模式开了没"
- "当前文档有多少处修订"
- "检查修订状态"`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const getTrackChangesStatusHandler: ToolHandler = async (
  _args: Record<string, unknown>
): Promise<ToolCallResult> => {
  try {
    const response = await wpsClient.executeMethod<{
      success: boolean;
      trackChanges: boolean;
      revisionCount: number;
    }>(
      'getTrackChangesStatus',
      {},
      WpsAppType.WRITER
    );

    if (response.success && response.data) {
      const d = response.data;
      const status = d.trackChanges ? '已开启' : '已关闭';
      return {
        id: uuidv4(),
        success: true,
        content: [
          {
            type: 'text',
            text: `修订模式: ${status}\n当前修订数量: ${d.revisionCount}`,
          },
        ],
      };
    }
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `获取修订状态失败: ${response.error}` }],
      error: response.error,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `获取修订状态出错: ${errMsg}` }],
      error: errMsg,
    };
  }
};

/**
 * 按字符范围替换文本（修订模式下跟踪）
 * 在校对时用于精确替换指定范围的内容
 */
export const replaceRangeDefinition: ToolDefinition = {
  name: 'wps_word_replace_range',
  description: `按字符范围精确替换Word文档中的文本。
在修订模式下，此操作会自动产生修订标记。

使用场景：
- 校对时替换指定位置的错别字
- 精确替换某一段落中的文本
- 在已知字符起止位置时替换内容

注意：请先调用 wps_word_enable_track_changes 开启修订模式。`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      start_pos: {
        type: 'number',
        description: '起始字符位置（从0开始）',
      },
      end_pos: {
        type: 'number',
        description: '结束字符位置',
      },
      text: {
        type: 'string',
        description: '替换后的文本内容',
      },
    },
    required: ['start_pos', 'end_pos', 'text'],
  },
};

export const replaceRangeHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { start_pos, end_pos, text } = args as {
    start_pos: number;
    end_pos: number;
    text: string;
  };

  if (start_pos === undefined || end_pos === undefined) {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: '必须指定起始和结束位置！' }],
      error: '缺少位置参数',
    };
  }

  if (typeof start_pos !== 'number' || typeof end_pos !== 'number' || !Number.isInteger(start_pos) || !Number.isInteger(end_pos)) {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: '起始和结束位置必须是整数！' }],
      error: '位置参数类型错误',
    };
  }

  if (start_pos < 0 || end_pos < 0) {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: '位置参数不能为负数！' }],
      error: '位置参数为负数',
    };
  }

  if (start_pos >= end_pos) {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: '起始位置必须小于结束位置！' }],
      error: '位置范围无效',
    };
  }

  if (text == null || text === '') {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: '替换文本不能为空！' }],
      error: '替换文本为空',
    };
  }

  try {
    const response = await wpsClient.executeMethod<{
      success: boolean;
      startPos: number;
      endPos: number;
      originalText: string;
      newText: string;
    }>(
      'replaceRange',
      { startPos: start_pos, endPos: end_pos, text },
      WpsAppType.WRITER
    );

    if (response.success && response.data) {
      const d = response.data;
      return {
        id: uuidv4(),
        success: true,
        content: [
          {
            type: 'text',
            text: `替换成功！\n原文: "${d.originalText}"\n修改为: "${d.newText}"\n位置: ${d.startPos}-${d.endPos}`,
          },
        ],
      };
    }
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `替换失败: ${response.error}` }],
      error: response.error,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `替换出错: ${errMsg}` }],
      error: errMsg,
    };
  }
};

/**
 * 基础文本校对工具
 * 使用正则规则快速检测中文文本中的常见问题
 * 不需调用AI，零token成本
 */
export const proofreadBasicDefinition: ToolDefinition = {
  name: 'wps_word_proofread_basic',
  description: `对中文文本进行基础校对，检测常见问题。
使用正则规则快速检测，零token成本。

检测范围：
- 常见易混淆字（的/得/地、在/再、的/地 等）
- 重复字符（如"了了"、"的的"）
- 重复标点（如。。、，，、！！、？？）
- 中英文标点混用
- 常见错误搭配
- 数字前后异常空格
- 常见网络用语/拼写错误

返回每个问题的位置、原文、建议修改和问题类型。

使用场景：
- 校对前先做基础检查
- 批量处理段落文本
- 快速定位文档中的常见错误`,
  category: ToolCategory.DOCUMENT,
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '要校对的文本内容',
      },
      start_offset: {
        type: 'number',
        description: '文本在文档中的起始偏移位置，用于定位问题在文档中的准确位置',
      },
    },
    required: ['text'],
  },
};

/**
 * 基础校对规则引擎
 * 返回检测到的问题列表
 */
interface ProofreadIssue {
  offset: number;
  length: number;
  original: string;
  suggestion: string;
  type: string;
  context: string;
}

function runBasicProofreading(text: string, baseOffset: number = 0): ProofreadIssue[] {
  const issues: ProofreadIssue[] = [];
  const offset = baseOffset || 0;

  type Rule = {
    pattern: RegExp;
    type: string;
    getSuggestion: (match: string) => string;
  };

  const rules: Rule[] = [
    // ===== 的/得/地 混淆 =====
    {
      pattern: /(狠|很|真|非|极|异|格|大|更|最|顶|十|万)的(好|坏|快|慢|多|少|高|低|长|短|大|小|厚|薄|深|浅|早|晚|对|像|开心|难过|高兴|努力)/g,
      type: '的得混淆',
      getSuggestion: (m) => m.replace('的', '得'),
    },
    {
      pattern: /(?:(?:动词|形容|努力|飞快|慢慢|静静|默默|悄悄|使劲|不断|不停|一口|一致|大力|全力|肆意)的|不停的)/g,
      type: '的地混淆',
      getSuggestion: (m) => m.replace('的', '地'),
    },
    // 常见"的得地"上下文模式
    {
      pattern: /(做|搞|弄|写|说|画|跑|跳|走|看|听|吃|喝)的(太|很|非常|比较|极为|十分|挺|有点|有些)/g,
      type: '的得混淆',
      getSuggestion: (m) => m.replace(/(做|搞|弄|写|说|画|跑|跳|走|看|听|吃|喝)的/, '$1得'),
    },
    {
      pattern: /(笑|哭|叫|闹|做)的(合不拢嘴|不停|不亦乐乎|很|出神)/g,
      type: '的得混淆',
      getSuggestion: (m) => m.replace(/(笑|哭|叫|闹|做)的/, '$1得'),
    },

    // ===== 在/再 混淆 =====
    // 只保留确定性高的替换（在次→再次、在来→再来），
    // 避免误报正确用法（如"正在做"、"在考虑"）
    {
      pattern: /在(次|来)/g,
      type: '在再混淆',
      getSuggestion: (m) => '再' + m.substring(1),
    },

    // ===== 重复字符 =====
    {
      pattern: /([\u4e00-\u9fff])\1{2,}/g,
      type: '重复字符',
      getSuggestion: (m) => m[0],
    },

    // ===== 重复标点 =====
    {
      pattern: /([，。；：、！？]){2,}/g,
      type: '重复标点',
      getSuggestion: (m) => m[0],
    },
    {
      pattern: /(\.\.\.+|……+)\.*/g,
      type: '重复标点',
      getSuggestion: () => '……',
    },
    {
      pattern: /(---|—————)/g,
      type: '重复标点',
      getSuggestion: () => '——',
    },

    // ===== 中英文标点混用 =====
    {
      pattern: /[a-zA-Z]+[，]/g,
      type: '中英混排',
      getSuggestion: (m) => m.replace('，', ','),
    },
    {
      pattern: /[，][a-zA-Z]+/g,
      type: '中英混排',
      getSuggestion: (m) => m.replace('，', ','),
    },
    {
      pattern: /[。][a-zA-Z]/g,
      type: '中英混排',
      getSuggestion: (m) => m.replace('。', '.'),
    },

    // ===== 数字前后异常空格 =====
    {
      pattern: /(\d) ([,.;:!?])/g,
      type: '数字空格',
      getSuggestion: (m) => m.replace(' ', ''),
    },
    {
      pattern: /([,.;:!?]) (\d)/g,
      type: '数字空格',
      getSuggestion: (m) => m.replace(' ', ''),
    },

    // ===== 常见错误搭配 =====
    {
      pattern: /的原因是因为/g,
      type: '句式冗余',
      getSuggestion: () => '是因为',
    },
    {
      pattern: /的原因是由于/g,
      type: '句式冗余',
      getSuggestion: () => '是由于',
    },
    {
      pattern: /大约(左右|上下)/g,
      type: '句式冗余',
      getSuggestion: (m) => m.includes('左右') ? '大约' : '大约',
    },
    {
      pattern: /目的是为了/g,
      type: '句式冗余',
      getSuggestion: () => '是为了',
    },
    {
      pattern: /可以(说|看成|认为)是/g,
      type: '句式冗余',
      getSuggestion: (m) => '可' + m.substring(2),
    },
    {
      pattern: /被(广大|众多)所/g,
      type: '句式冗余',
      getSuggestion: () => '被',
    },

    // ===== 过于口语化 =====
    {
      pattern: /好的吧/g,
      type: '口语化',
      getSuggestion: () => '好的',
    },
    {
      pattern: /这样子/g,
      type: '口语化',
      getSuggestion: () => '这样',
    },
    {
      pattern: /那样子/g,
      type: '口语化',
      getSuggestion: () => '那样',
    },
    // "搞"在正式文档中应替换
    {
      pattern: /去搞/g,
      type: '口语化',
      getSuggestion: () => '处理',
    },
    {
      pattern: /在搞/g,
      type: '口语化',
      getSuggestion: () => '在处理',
    },
    {
      pattern: /搞(定|完|好|妥)/g,
      type: '口语化',
      getSuggestion: () => '完成',
    },
    // "弄"在正式文档中应替换
    {
      pattern: /弄(好|完|妥|出来)/g,
      type: '口语化',
      getSuggestion: () => '完成',
    },
    {
      pattern: /去弄/g,
      type: '口语化',
      getSuggestion: () => '处理',
    },
    // "啥"太口语化
    {
      pattern: /(干|有|说|做)啥/g,
      type: '口语化',
      getSuggestion: (m) => m.replace('啥', '什么'),
    },
    {
      pattern: /啥(都|也|的|呀)/g,
      type: '口语化',
      getSuggestion: (m) => '什' + '么' + m[1],
    },
    // "挺"在正式文档中应替换
    {
      pattern: /挺(好|大|多|快|高|长|难|重|重要|不错|合适|特别|关键)/g,
      type: '口语化',
      getSuggestion: (m) => '很' + m.substring(1),
    },
    // "反正"太口语化
    {
      pattern: /(这|那)反正/g,
      type: '口语化',
      getSuggestion: (m) => m[0].includes('这') ? '这无论如何' : '那无论如何',
    },
    {
      pattern: /反正(说|就是|都|也)/g,
      type: '口语化',
      getSuggestion: (m) => '无论' + (m.substring(2) === '说' ? '如何' : m.substring(2)),
    },
    // "然后"过多（仅在句号/逗号后）
    {
      pattern: /([。，])然后/g,
      type: '口语化',
      getSuggestion: (m) => m.startsWith('。') ? '。随后' : '，接着',
    },
    // "就是说"在正式文档中可优化
    {
      pattern: /就是(说|讲)/g,
      type: '口语化',
      getSuggestion: () => '即',
    },
    // "什么的"在正式文档中应替换
    {
      pattern: /什么的/g,
      type: '口语化',
      getSuggestion: () => '等',
    },
    {
      pattern: /特别(好|大|多|快|高|长|重要|明显|突出|优秀)/g,
      type: '口语化',
      getSuggestion: (m) => '十分' + m.substring(2),
    },

    // ===== 常见错别字模式 =====
    // 即/既混淆：即然→既然（应为"既然"）、即而→既而（应为"既而"）
    // 但 即使、即便、即刻、即将 等都是正确写法，不替换
    {
      pattern: /即(然|而)/g,
      type: '即既混淆',
      getSuggestion: (m) => '既' + m.substring(1),
    },
    {
      pattern: /变的/g,
      type: '的地得混淆',
      getSuggestion: () => '变得',
    },
    {
      pattern: /做的/g,
      type: '的地得混淆',
      getSuggestion: () => '做得',
    },

    // ===== 合同/法律术语常见错误 =====
    // 签定→签订（仅限合同签署语境）
    {
      pattern: /签定(合同|协议|合约|约定)/g,
      type: '法律术语',
      getSuggestion: (m) => '签订' + m.substring(2),
    },
    // 权力→权利（法律/知识产权语境）
    {
      pattern: /(知识|所有|著作|专利|商标|许可)(权)力/g,
      type: '法律术语',
      getSuggestion: (m) => m.replace(/权力$/, '权利'),
    },
    {
      pattern: /权力(维护|保护|保障|归属)/g,
      type: '法律术语',
      getSuggestion: (m) => '权利' + m.substring(2),
    },

    // ===== 工程/技术术语常见错误 =====
    {
      pattern: /隐蔽性工程/g,
      type: '工程术语',
      getSuggestion: () => '隐蔽工程',
    },
    {
      pattern: /算数(错误|问题|计算|统计)/g,
      type: '常见错别字',
      getSuggestion: (m) => '算术' + m.substring(2),
    },

    // ===== 数字量词搭配不当 =====
    {
      pattern: /([2-9])大(方面|部分|模块|功能|内容|阶段|类型|类别|层次|层面)/g,
      type: '量词搭配',
      getSuggestion: (m) => m.replace(/(\d)大/, '$1个'),
    },

    // ===== "其它"→"其他" =====
    // 现代汉语中"其他"已统括"其它"，除法律条文外建议统一
    {
      pattern: /其它(人|事|物|方面|单位|情况|问题|费用|知识产权|的|，|。|；|：)/g,
      type: '用词统一',
      getSuggestion: (m) => '其他' + m.substring(2),
    },

    // ===== 多余点号 =====
    // "3.2.2.2. .总监理" → 多余空格+点号
    {
      pattern: /\. \./g,
      type: '多余点号',
      getSuggestion: () => '.',
    },
    // 连续2+中文句号
    {
      pattern: /([\u4e00-\u9fff])(\.\.|。\.)/g,
      type: '多余点号',
      getSuggestion: (m) => m[1] + '.',
    },
    // 句号后直接跟中文（标准编号如GB/T内带"."的不在此列）
    {
      pattern: /([\u4e00-\u9fff])\。\.([\u4e00-\u9fff])/g,
      type: '多余点号',
      getSuggestion: (m) => m[1] + '。' + m[2],
    },

    // ===== 中文标点规范 =====
    // 英文冒号在中文文本中
    {
      pattern: /([\u4e00-\u9fff]):([\u4e00-\u9fff])/g,
      type: '中文标点',
      getSuggestion: (m) => m[0].replace(':', '：'),
    },
    // 英文逗号在中文文本中
    {
      pattern: /([\u4e00-\u9fff]),([\u4e00-\u9fff])/g,
      type: '中文标点',
      getSuggestion: (m) => m[0].replace(',', '，'),
    },
    // 分号误用为冒号场景
    {
      pattern: /(包括|以下|如下|例如|比如|主要有)(的|以下)?；(?!\s)/g,
      type: '中文标点',
      getSuggestion: (m) => m.replace('；', '：'),
    },
    // 中文正文中英文句点不应直接跟随中文（排除标准编号如GB/T）
    // 此场景过于复杂，留AI处理

    // ===== 多字（赘字/冗余） =====
    // 冗余"的"
    {
      pattern: /偏离程度的很/g,
      type: '多字',
      getSuggestion: () => '偏离程度很',
    },
    {
      pattern: /的的程度/g,
      type: '多字',
      getSuggestion: () => '的程度',
    },
    {
      pattern: /进行了一次/g,
      type: '口语化',
      getSuggestion: (m) => m.replace('进行了一次', '进行了'),
    },
    // 冗余"到"
    {
      pattern: /涉及到/g,
      type: '多字',
      getSuggestion: () => '涉及',
    },
    {
      pattern: /付诸于/g,
      type: '多字',
      getSuggestion: () => '付诸',
    },
    {
      pattern: /诉诸于/g,
      type: '多字',
      getSuggestion: () => '诉诸',
    },
    // 冗余"来/去"
    {
      pattern: /归结为(说|讲)是/g,
      type: '多字',
      getSuggestion: () => '归结为',
    },
    // 冗余"说"
    {
      pattern: /也就是说/g,
      type: '多字',
      getSuggestion: () => '即',
    },
    // "进行"冗余
    {
      pattern: /进行(研究|分析|讨论|审查|调查|检查|测试|验证|处理|整改|排查|评估)/g,
      type: '口语化',
      getSuggestion: (m) => m.substring(2),
    },
    // 冗余判断
    {
      pattern: /并非是/g,
      type: '多字',
      getSuggestion: () => '并非',
    },
    {
      pattern: /必须要/g,
      type: '多字',
      getSuggestion: () => '必须',
    },
    {
      pattern: /全部都/g,
      type: '多字',
      getSuggestion: () => '全部',
    },
    {
      pattern: /进一步地/g,
      type: '多字',
      getSuggestion: () => '进一步',
    },
    {
      pattern: /现如今/g,
      type: '多字',
      getSuggestion: () => '如今',
    },
    {
      pattern: /最为(重要|关键|核心|突出|显著)/g,
      type: '多字',
      getSuggestion: (m) => '最' + m[1],
    },


    // ===== 少字（缺字） =====
    // 数字缺少量词（以下三→以下三种）
    {
      pattern: /以下([一二三四五六七八九十两])(控制|方面|类型|方式|阶段|部分|模块|方法|条件|要求|类别|层次|层面)/g,
      type: '少字',
      getSuggestion: (m) => m.replace(/([一二三四五六七八九十两])/, '$1种'),
    },

    // ===== 评测/测评 混淆 =====
    {
      pattern: /安全评测/g,
      type: '常见错别字',
      getSuggestion: () => '安全测评',
    },
    {
      pattern: /软件评测/g,
      type: '常见错别字',
      getSuggestion: () => '软件测评',
    },
  ];

  for (const rule of rules) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(rule.pattern.source, 'g');
    while ((match = regex.exec(text)) !== null) {
      const orig = match[0];
      const suggestion = rule.getSuggestion(orig);
      if (orig !== suggestion) {
        const start = match.index;
        const beforeCtx = text.substring(Math.max(0, start - 10), start);
        const afterCtx = text.substring(start + orig.length, start + orig.length + 10);
        issues.push({
          offset: offset + start,
          length: orig.length,
          original: orig,
          suggestion,
          type: rule.type,
          context: `...${beforeCtx}[${orig}]${afterCtx}...`,
        });
      }
    }
  }

  return issues;
}

export const proofreadBasicHandler: ToolHandler = async (
  args: Record<string, unknown>
): Promise<ToolCallResult> => {
  const { text, start_offset } = args as {
    text: string;
    start_offset?: number;
  };

  if (!text || text.trim() === '') {
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: '文本内容不能为空！' }],
      error: '文本内容为空',
    };
  }

  try {
    const baseOffset = typeof start_offset === 'number' ? start_offset : 0;
    const issues = runBasicProofreading(text, baseOffset);

    if (issues.length === 0) {
      return {
        id: uuidv4(),
        success: true,
        content: [
          {
            type: 'text',
            text: '基础校对完成，未发现明显问题。',
          },
        ],
      };
    }

    const lines = issues.map(
      (issue, i) =>
        `${i + 1}. [${issue.type}] 位置 ${issue.offset}\n` +
        `   原文: "${issue.original}"\n` +
        `   建议: "${issue.suggestion}"\n` +
        `   上下文: ${issue.context}`
    );

    return {
      id: uuidv4(),
      success: true,
      content: [
        {
          type: 'text',
          text: `基础校对完成，发现 ${issues.length} 个问题：\n\n${lines.join('\n\n')}`,
        },
      ],
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      id: uuidv4(),
      success: false,
      content: [{ type: 'text', text: `基础校对出错: ${errMsg}` }],
      error: errMsg,
    };
  }
};

/**
 * 导出所有校对相关的Tools
 */
export const proofreadTools: RegisteredTool[] = [
  { definition: enableTrackChangesDefinition, handler: enableTrackChangesHandler },
  { definition: getTrackChangesStatusDefinition, handler: getTrackChangesStatusHandler },
  { definition: replaceRangeDefinition, handler: replaceRangeHandler },
  { definition: proofreadBasicDefinition, handler: proofreadBasicHandler },
];

export default proofreadTools;
