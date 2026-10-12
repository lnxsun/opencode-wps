/**
 * 校对报告**头部结论 ↔ 全文证据同口径**回归（Issue #395 RC-7）
 *
 * 背景：`emptyReport(doc, false, 6)` 曾同时输出「修订总数 6」+「发现问题 0 处」+
 * 「全部已修复 ✅（本轮未发现待修复问题）」——文档上已躺着 6 条修订，头部却说「未发现待修复问题」，
 * 头部结论区与尾部解释区（EMPTY_WITH_REVS「注意：文档当前有 N 条修订记录」）**分裂**，
 * 用户视角是「报告自己在跟自己打架」。
 *
 * 断言口径：
 *   · AC3.1：revs>0 时，同页不得同时出现「修订总数 >0」与「本轮未发现待修复问题」式断言；
 *   · AC3.2：头部口径与尾部 verdict 引用**同一 revs 判据**（revs=false 时不得出现「待核对」）。
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → 按既有惯例手动 mock
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import { emptyReport } from '../../tools/word/proofread-report';

const DOC = {
  fileName: 'head-tail.docx',
  filePath: '/p/head-tail.docx',
  totalParagraphs: 56,
  totalWords: 900,
} as never;

describe('Issue #395 RC-7：报告头部结论 ↔ 全文证据同口径', () => {
  it('AC3.1 revs>0：不得同时出现「修订总数 N」与「本轮未发现待修复问题」式断言', () => {
    const text = emptyReport(DOC, false, 6);
    expect(text).toMatch(/- \*\*修订总数\*\*: 6/);
    // 头部「全部已修复」一栏不得再说「本轮未发现待修复问题」（与上一行直接对撞）
    const headFixedLine = text.split('\n').find(l => l.startsWith('| 全部已修复 |'))!;
    expect(headFixedLine).toBeDefined();
    expect(headFixedLine).not.toContain('本轮未发现待修复问题');
    expect(headFixedLine).toContain('待核对');
  });

  it('AC3.1 变异自证：还原头部口径为「本轮未发现待修复问题」⇒ 断言由绿转红', () => {
    // 直接注入旧口径文本，证明本断言能识别自相矛盾（形态注入，非内存对象）
    const broken = emptyReport(DOC, false, 6).replace(
      /\| 全部已修复 \|.*\|/,
      '| 全部已修复 | ✅（本轮未发现待修复问题） |'
    );
    const headFixedLine = broken.split('\n').find(l => l.startsWith('| 全部已修复 |'))!;
    expect(headFixedLine).toContain('本轮未发现待修复问题'); // 注入生效
    expect(() => expect(headFixedLine).not.toContain('本轮未发现待修复问题')).toThrow();
  });

  it('AC3.2 revs=0/undefined：口径与尾部 verdict 同源，不得出现「待核对」', () => {
    const zero = emptyReport(DOC, false, 0);
    const none = emptyReport(DOC, false, undefined);
    for (const t of [zero, none]) {
      const headFixedLine = t.split('\n').find(l => l.startsWith('| 全部已修复 |'))!;
      expect(headFixedLine).not.toContain('待核对');
      expect(headFixedLine).toContain('不适用');
    }
  });
});
