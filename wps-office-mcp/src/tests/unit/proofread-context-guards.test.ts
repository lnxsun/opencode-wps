/**
 * Input: `rules`（生产 `proofread-rules.ts`）中「变的/做的」「中英混排」「通过A使B」「由于A的原因使…」
 *        五条规则经 `runBasicProofreading` 的行为输出
 * Output: 六个**上下文守卫**的语义回归断言（误报刹车 / 真问题仍报）
 * Pos: Issue #341 / PR #342 —— 守卫「声明层收敛」（去 export、删死参数、删重复重读）的**行为锁**。
 *
 * 为什么需要本文件（防「文档与实现再度漂移」）：
 *   C1-4 的历史文档曾把 `isLeftContextCjk` 描述为「匹配前 3 字」，而实现读的是「变」字**紧邻的单字**
 *   （`text[index-1]`）。守卫收敛（PR #342）同步校正了该口径 —— 本文件把**单字语义**钉成可执行断言，
 *   任何「改成 2/3 字窗口」的隐性改动都会在此转红，而不是只在文档里漂。
 *
 * 判据归属：行为的唯一执行者 = jest（本文件）。守卫本体在 `proofread-rules.ts`（单一来源）。
 *
 * Issue #352 压缩方案 A 追加：`Rule.optionalGroup` 可选规则组默认关闭 + 显式 opt-in 的行为锁。
 */

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

import { runBasicProofreading } from '../../tools/word/proofread';
import { rules } from '../../tools/word/proofread-rules';

/** 便捷：文本中是否产出包含 `original` 的建议命中 */
function reports(text: string, original: string): boolean {
  return runBasicProofreading(text).some(i => i.original === original);
}

describe('Issue #341 上下文守卫语义锁（PR #342 声明层收敛的行为等价性）', () => {
  describe('isLeftContextCjk：读「变」字紧邻的**单字**（非前 3 字）', () => {
    it('左邻为否定/变更词 → 白名单豁免（不变的前提）', () => {
      expect(reports('不变的前提需要确认。', '变的')).toBe(false);
      expect(reports('未变的结果已经归档。', '变的')).toBe(false);
      expect(reports('可变的参数必须收敛。', '变的')).toBe(false);
      expect(reports('已变的流程需要复核。', '变的')).toBe(false);
    });

    it('左邻非否定/变更词 → 主语+谓语语境，仍报（数值变的很少）', () => {
      expect(reports('数值变的很少了。', '变的')).toBe(true);
      expect(reports('结论变的很明确。', '变的')).toBe(true);
    });

    it('单字语义锚定：豁免只看**紧邻**左字，不看更左侧的字（若实现误读成多字窗口，本用例转红）', () => {
      // 判别式对照：右邻同为名词「前提」（右判据不豁免），**仅左邻不同** —— 隔离出左判据的单字语义。
      // 左邻=「不」（否定词，紧邻）⇒ 豁免；左邻=「值」（非否定词）⇒ 仍报。
      // 若实现把窗口放宽到「前 2/3 字」，「数值变的」里更左的字被读进来也可能误豁免 ⇒ 本用例转红。
      expect(reports('不变的前提。', '变的')).toBe(false);
      expect(reports('数值变的前提。', '变的')).toBe(true);
      // 对照：右邻非名词时，左邻是否否定词都不影响（仍报）—— 左判据**只在右判据不豁免时才起作用**
      expect(reports('不变的很快。', '变的')).toBe(true);
      expect(reports('数值变的很快。', '变的')).toBe(true);
      // 变异判别（本用例的灵魂）：右邻=名词「前提」（右判据不豁免），左邻「的」非否定词 ⇒ 仍报；
      // 若实现把窗口放宽到「前 2 字」（读进更左的「不」）⇒ 会被误豁免 ⇒ 本轮由绿转红。
      expect(reports('不的变的前提。', '变的')).toBe(true);
      expect(reports('未的变的前提。', '变的')).toBe(true);
    });

    it('左邻为 CJK 但非否定词时，仍报（防「只看左侧有无 CJK」的过宽实现）', () => {
      expect(reports('温度变的很低。', '变的')).toBe(true);
    });
  });

  describe('isNounLikeFollower：名词表单一来源（变的/做的 同表）', () => {
    it('右接名词性成分 → 定语结构，豁免', () => {
      expect(reports('不变的前提成立。', '变的')).toBe(false);
      // 「做的方案」：右接名词「方案」→ 定语结构，豁免（同表 NOUN_LIKE_BIAN）
      expect(reports('做的方案。', '做的')).toBe(false);
    });

    it('右接非名词 → 仍报', () => {
      expect(reports('他变的更好了。', '变的')).toBe(true);
      expect(reports('他做的很好。', '做的')).toBe(true);
    });
  });

  describe('isWesternBoundaryChar / 中英混排词边界', () => {
    it('≥2 字母西文词 + 全角标点 → 真混排，报（命中含「词+全角标点+后继字」）', () => {
      expect(reports('hello world，世界', 'world，世')).toBe(true);
    });

    it('单字母代号（QPS，/ D1，）→ 不构成西文词边界，豁免', () => {
      expect(reports('QPS，目录', 'QPS，')).toBe(false);
      expect(reports('参见 D1，后续', 'D1，')).toBe(false);
    });
  });

  describe('isUsageObjectAfter / isEnvCauseUseAsVerb：「使/使用」同形裁决', () => {
    it('使用+名物化宾语 → 正常动宾，豁免（使用意见/使用范围/使用了）', () => {
      expect(reports('通过使用意见可以发现。', '使用')).toBe(false);
      expect(reports('由于A的原因使用了该材料。', '使用')).toBe(false);
    });

    it('使+用户/人员 → 真杂糅，仍报（通过A使B 命中，不因「使|使用」同形被吞）', () => {
      expect(reports('通过优化使用户体验提升。', '通过优化使')).toBe(true);
      expect(reports('通过优化使 用户满意。', '通过优化使')).toBe(true);
    });
  });
});

describe('Issue #352 压缩方案 A：风格偏好规则默认关闭（Rule.optionalGroup）', () => {
  it('默认（不含 optionalGroup）：口语化「搞定」不报，避免默认噪音冲淡报告信噪比', () => {
    expect(runBasicProofreading('这个任务今天搞定了。').some(i => i.type === '口语化')).toBe(false);
  });

  it('默认：格式类「多余空格/重复标点」不报（同样属 optional 组）', () => {
    const hits = runBasicProofreading('这是  两空格。注意！！这里。');
    expect(hits.some(i => i.type === '异常空格' || i.type === '重复标点')).toBe(false);
  });

  it('显式 opt-in（includeOptional=true）：口语化规则恢复启用，能力未丢', () => {
    const hits = runBasicProofreading('这个任务今天搞定了。', 0, true);
    expect(hits.some(i => i.type === '口语化')).toBe(true);
  });

  it('默认启用的核心规则（如常见错别字）不受影响 —— optional 只收敛风格类，不误伤实质校对', () => {
    // 「的得混淆」规则组默认启用（不属 optionalGroup）
    expect(runBasicProofreading('数值变的很少了。').some(i => i.type === '的得混淆')).toBe(true);
  });

  it('规则表计数契约：登记规则总数 + 恰 30 条标 optional（防「静默改默认开关」漂移）', () => {
    const optionalCount = rules.filter(r => r.optionalGroup).length;
    // Issue #420 新增 2 条**默认启用**规则（网络用语 / 裸占位文本）⇒ 总数 80 → 82，optional 数不变。
    expect(rules.length).toBe(82);
    expect(optionalCount).toBe(30);
  });
});
