/**
 * Issue #420（校对会话 ses_f0fc 复盘）—— 两条「已检出/已修复却不计分」缺口的回归锁。
 *
 * 背景（会话实证）：
 *   ① 会话把 `3W`/`15W`（W=万 网络缩写）**实际修复**了，却因 `TYPE_METRIC_MAP` 无 `网络用语` 键
 *      落「未分类」⇒ 不计六维（报告 3 处未分类里占 2 处，且其中 2 处已产生修订）。
 *   ② 段落 37 缺「三、」编号（SKILL 的 Layer 2 检测范围明列「编号连续性」），同样因词表无键落「未分类」。
 *   ③ `xxxxx` 裸占位未被 Layer 1 检出（旧占位规则强制要求后接「公司/项目/部门/单位」）。
 *
 * 本文件锁三件事：新键的**维度归属**、Layer 1 规则的**正例命中 + 反例不误报**、兜底推断链。
 */
import { runBasicProofreading } from '../../tools/word/proofread';
import { TYPE_METRIC_MAP, normalizeIssueType } from '../../tools/word/proofread-normalize';
import { computeReportData } from '../../tools/word/proofread-report';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const hit = (text: string, original: string) =>
  runBasicProofreading(text).some(i => i.original === original);

describe('① 新类型词的维度归属（否则「已修复」条目落未分类、不计六维）', () => {
  it('网络用语 → consistency（正式文书的用语统一问题）', () => {
    expect(TYPE_METRIC_MAP['网络用语']).toBe('consistency');
  });

  it('编号不连续 → format（SKILL 明列「编号连续性」为 Layer 2 检测范围）', () => {
    expect(TYPE_METRIC_MAP['编号不连续']).toBe('format');
  });

  it('带新 type 的条目进六维计分，不再落 unknownTypeIssues', () => {
    const d = computeReportData([
      { offset: 0, length: 2, original: '3W', suggestion: '3万', type: '网络用语' } as never,
      {
        offset: 5,
        length: 11,
        original: '重要事项跟踪及风险预警',
        suggestion: '三、重要事项跟踪及风险预警',
        type: '编号不连续',
      } as never,
    ]);
    expect(d.unknownTypeIssues).toHaveLength(0);
    expect(d.scores.consistency.count).toBe(1);
    expect(d.scores.format.count).toBe(1);
  });
});

describe('② Layer 1：网络用语（数字 + W + 中文量词）正例命中', () => {
  it.each([
    ['存在约3W路点位离线。', '3W'],
    ['完成15W路视频数据编目。', '15W'],
    ['覆盖20w人次。', '20w'],
  ])('%s → 命中 %s', (text, original) => {
    expect(hit(text, original)).toBe(true);
  });

  it('建议 = W/w → 万（仅替换缩写，不改语义）', () => {
    const one = runBasicProofreading('存在约3W路点位离线。').find(i => i.original === '3W');
    expect(one?.suggestion).toBe('3万');
    expect(one?.type).toBe('网络用语');
  });

  // 第 1 轮评审 CR-420-1：`\s*` 实体消费会把 `3W 路` 的尾随空格打进 original/suggestion
  // （实测 `"3W "`→`"3万 "`）⇒ 量词改走纯前瞻，匹配恒为 `\d+\s*[Ww]`（零尾随字符）。
  it('W 与量词间有空白时，不得把尾随空白打进 original/suggestion', () => {
    const hits = runBasicProofreading('存在约3W 路点位离线。').filter(i => i.type === '网络用语');
    expect(hits).toHaveLength(1);
    expect(hits[0].original).toBe('3W'); // 不得为 '3W '
    expect(hits[0].suggestion).toBe('3万'); // 不得为 '3万 '
    expect(hits[0].length).toBe(hits[0].original.length);
  });
});

describe('② Layer 1：网络用语反例不误报（宁可少报不可误报）', () => {
  it.each([
    '额定功率100W灯泡正常。', // W 后无中文量词 ⇒ 合法单位瓦特
    '连接WiFi6网络。',
    '型号 XXX-200 已到货。',
  ])('%s → 不报', text => {
    expect(runBasicProofreading(text).some(i => i.type === '网络用语')).toBe(false);
  });
});

describe('③ Layer 1：裸 xxx… 占位（旧规则要求后接组织/项目类词 ⇒ 恒漏检）', () => {
  it('裸占位命中（会话实证：段 36 `xxxxx`）', () => {
    expect(hit('（十）2026年度项目，xxxxx。', 'xxxxx')).toBe(true);
  });

  it('≥3 个 x 即可；xx 过短不报（防误伤英文缩写/评分占位）', () => {
    expect(hit('占位 xx 在此。', 'xx')).toBe(false);
  });

  it('左邻为字母的 x 串不报（防吃掉 Maxxxx 类词尾）', () => {
    expect(hit('产品 Maxxxx 已上线。', 'xxxx')).toBe(false);
  });

  // 第 4 轮评审 CR-420-4：规则声明 `/gi`，但引擎 `new RegExp(src, 'g')` 会丢弃 `i` ⇒ 大写占位
  // 恒漏检。修法 = 引擎保留规则声明 flags。下例锁「声明即生效」，并覆盖既有 `/gi` 规则的同类漏检。
  it.each([
    ['评分XXXX分。', 'XXXX'], // 新裸占位规则（/gi）
    ['XXXX有限公司已定。', 'XXXX有限公司'], // 既有占位规则（/gi）同病同修
  ])('%s → 大写占位也命中 %s（声明 flags 必须生效）', (text, original) => {
    expect(hit(text, original)).toBe(true);
  });

  it('保留 flags 不得放大误报：Maxxxx / 100W 仍不报', () => {
    expect(runBasicProofreading('产品 Maxxxx 已上线。额定功率100W灯泡。').length).toBe(0);
  });
});

describe('④ 兜底推断链：AI 漏传 type 时也能落到新维度（不裸奔成未分类）', () => {
  it('原文含 数字+W+量词 → 推断「网络用语」', () => {
    expect(
      normalizeIssueType({
        original: '存在约3W路点位离线',
        suggestion: '存在约3万路点位离线',
        type: '',
      } as never).type
    ).toBe('网络用语');
  });

  it('W 无中文量词 → 推断不出，仍「未分类」（不硬凑）', () => {
    expect(
      normalizeIssueType({ original: '功率100W', suggestion: '功率100瓦', type: '' } as never).type
    ).toBe('未分类');
  });
});
