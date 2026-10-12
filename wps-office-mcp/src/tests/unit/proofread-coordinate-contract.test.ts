/**
 * Input: `runBasicProofreading` / `proofreadBasicHandler` / `getDocumentTextByRangeHandler`
 *        的真实返回值 + tests/support 的坐标契约（**re-export** 自生产 `proofread-types.ts`）
 * Output: 坐标契约的**回归断言** —— 「同一个 offset 数字被两种坐标系消费」不再可达
 * Pos: Issue #325「坐标系归一」**段 1（复现）+ 段 2（定契约）** 的交付物。
 *
 * ── 段 1 → 段 2 的状态变迁（红/绿分类已由段 2 复核，见下）──────────────────────
 * 段 1 刻意保留了 **4 条红**作为「缺陷存在过」的证据。段 2 按 D1（硬报错）+ D2（复用
 * `proofread-types.ts`）定点修复后，这 4 条**全部转绿**，且**转绿方式各不相同**——
 * 逐条说清，防「用修 bug 顺手把复现测试改成期望输出」：
 *   ① 用例 A · `runBasicProofreading` 缺省 `baseOffset`（2 条）：
 *      **引擎语义未变**（纯函数，缺省仍按「本段相对偏移」产出）——这是**引擎的契约**，
 *      不是缺陷。缺陷在于「handler 静默地以 0 当 baseOffset 去调它」。段 2 把该语义
 *      **显式化为断言**（引擎缺省即相对坐标系），并新增 ② 证明该路径**经工具不可达**。
 *   ② 用例 A · `proofreadBasicHandler` 缺省 `start_offset`（真实链路，1 条）：
 *      **行为已变**——D1 硬报错，`success === false`。断言由「错位成立」改为「拒绝执行
 *      + 给出正解」。
 *   ③ 用例 C · `getDocumentTextByRange` 信号缺 `baseOffset`（1 条）：
 *      **已回填**——`renderRangeText` 把 `baseOffset`（= `startOffset`）写进信号行。
 *
 * 判据（**唯一实现**）在 `tests/support/document-text-coordinate-contract.ts`；契约类型在
 * 生产 `proofread-types.ts`（D2 复用，**唯一声明处**）。本文件不重复定义二者。
 *
 * 已转红 0 条（段 1 曾 4 条，段 2 · D1 硬报错 + D2 复用后全部关闭并转为回归断言）。
 * 本文件的断言由 `npm run mcp:test`（jest）**真实执行** —— 这是行为判据的归属处。
 *
 * ⚠️ Issue #325 第二刀：原先另有一个「不变量归属门禁」脚本
 * （`validate-coordinate-contract.js` 轴 K）与一个「复现锁」脚本（`validate-proofread-repro-lock.js` 轴 R）
 * 只**查名字是否出现**（不执行行为）+ 依赖已删的矩阵文件（空断言），已随本次收尾整体删除。
 * 行为断言回归到 jest（本文件）这一处真实执行者。
 */

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));

jest.mock('../../client/wps-client', () => ({
  wpsClient: { executeMethod: jest.fn() },
  WpsAppType: { WRITER: 'writer', SPREADSHEET: 'spreadsheet', PRESENTATION: 'presentation' },
}));

import { runBasicProofreading, proofreadBasicHandler } from '../../tools/word/proofread';
import { getDocumentTextByRangeHandler } from '../../tools/word/document';
import { wpsClient } from '../../client/wps-client';
import {
  isDocumentAbsoluteSlice,
  probeBasicProofreadOffsetSpace,
  type OffsetCarrier,
} from '../support/document-text-coordinate-contract';
// L1/L2 分层：编译期断言在 coordinate-layer-typecheck.ts（受 tsc 检查），
// 此处仅取其样本做运行期存在性/保真验证；收窄入口从生产单源 re-export。
import {
  asDocumentAbsoluteOffset,
  asParagraphIndex,
} from '../support/document-text-coordinate-contract';
import { typecheckSamples } from '../support/coordinate-layer-typecheck';

/** 仅用于运行期读取被类型断言遮蔽的字段（不影响编译期判据） */
type ParagraphRangeLike = { start: number; end: number };

const mockExecute = wpsClient.executeMethod as jest.Mock;

/** 与 governance.js / range-signal-contract 同契约的信号行解析（不得各写一套形态） */
function parseSignal(text: string): Record<string, unknown> | null {
  const m = text.match(/\[README_SIGNAL (\{[^\n]*\})\]/);
  return m ? JSON.parse(m[1]) : null;
}

/** 从 handler 返回文本里取结构化 issues（与生产消费方同口径：末尾可 JSON.parse 的那行） */
function extractIssues(text: string): Array<OffsetCarrier> | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines.slice(i).join('\n').trim();
    if (!candidate.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(candidate) as { issues?: Array<OffsetCarrier> };
      if (Array.isArray(parsed.issues)) return parsed.issues;
    } catch {
      /* 继续往前找 */
    }
  }
  return null;
}

const LEAD = '前言部分。';
const SEGMENT_TEXT = '进行研究后记部分。';
const WHOLE_TEXT = LEAD + SEGMENT_TEXT;
const SEGMENT_START = LEAD.length; // 5

describe('Issue #325 段1 · 坐标契约复现（纯测试，零生产代码改动）', () => {
  beforeEach(() => mockExecute.mockReset());

  // ================================================================
  // 用例 A：缺省 baseOffset ⇒ 命中项被静默按「本段相对偏移」输出
  //        消费方按「文档绝对偏移」读 ⇒ 指向别的文本（且不报错）
  // ================================================================
  describe('用例 A：漏传 start_offset 的错位（段 1 复现 → 段 2 定点关闭）', () => {
    // ① 引擎契约（显式化，非缺陷）：缺省 baseOffset ⇒ 产出的是「本段相对偏移」。
    //    段 2 不修改该语义（它是纯函数的定义），而是**禁止** handler 以缺省方式调它。
    it('引擎契约：runBasicProofreading 缺省 baseOffset ⇒ 产出「本段相对偏移」，不是文档绝对偏移', () => {
      const probe = probeBasicProofreadOffsetSpace(runBasicProofreading, LEAD, SEGMENT_TEXT);

      expect(probe.segmentStart).toBe(SEGMENT_START);
      // 缺省时 offset = 0（段内相对）；按整篇原文解释**不成立** —— 这正是必须由
      // 调用方显式声明坐标系的原因（谁生产谁负责声明）。
      expect(probe.observedOffset).toBe(0);
      expect(probe.missingBaseOffsetIsDocumentAbsolute).toBe(false);
      // 同一载体在「本段」参照下成立（相对坐标系），与上面恰好互补 ⇒ 判据非恒真
      const hit = runBasicProofreading(SEGMENT_TEXT)[0];
      expect(isDocumentAbsoluteSlice(SEGMENT_TEXT, hit)).toBe(true);
    });

    // ② 缺陷本体（真实链路，行为已变）：handler 缺 start_offset ⇒ **拒绝执行**（D1 硬报错）。
    //    这条替代了段 1 的「同一错位（故意红）」，把「错位可达」变为「错位不可达」。
    it('proofreadBasicHandler 缺省 start_offset ⇒ 硬报错（拒绝执行，不再静默按 0 顶替）', async () => {
      const result = await proofreadBasicHandler({ text: SEGMENT_TEXT });
      expect(result.success).toBe(false);
      const text = (result.content[0] as { text: string }).text;
      // 错误消息必须**自带正解**（与治理层 GUIDE_MAP 同风格：拦 + 指路）
      expect(text).toContain('start_offset');
      expect(text).toContain('getDocumentTextByRange');
      // 反向断言：不得再产出可被消费的 issues（防「报错但结果照旧返回」）
      expect(extractIssues(text)).toBeNull();
    });

    it('start_offset 传非数值（null / NaN / 字符串）同样硬报错，不得被当作 0', async () => {
      for (const bad of [null, NaN, '0', '10'] as unknown[]) {
        const r = await proofreadBasicHandler({ text: SEGMENT_TEXT, start_offset: bad });
        expect(r.success).toBe(false);
      }
    });

    it('file_path 通道同样受 start_offset 强制约束（不得绕过）', async () => {
      const r = await proofreadBasicHandler({ file_path: 'C:/tmp/nonexistent-proofread.txt' });
      expect(r.success).toBe(false);
      expect((r.content[0] as { text: string }).text).toContain('start_offset');
    });
  });

  // ================================================================
  // 用例 B：显式传 baseOffset ⇒ 正确（锁定 #296 既有契约，必须保持绿）
  // ================================================================
  describe('用例 B：显式传 start_offset → 文档绝对偏移自洽（既有契约，保持绿）', () => {
    it('runBasicProofreading(text, baseOffset) 三者自洽且落在文档绝对坐标', () => {
      const probe = probeBasicProofreadOffsetSpace(runBasicProofreading, LEAD, SEGMENT_TEXT);
      expect(probe.explicitBaseOffsetIsDocumentAbsolute).toBe(true);

      const hit = runBasicProofreading(SEGMENT_TEXT, SEGMENT_START)[0];
      expect(hit.offset).toBe(SEGMENT_START);
      expect(WHOLE_TEXT.slice(hit.offset, hit.offset + hit.length)).toBe(hit.original);
      expect(hit.original.length).toBe(hit.length);
    });

    it('proofreadBasicHandler 显式 start_offset：真实链路同样自洽（回归锚点，保持绿）', async () => {
      const result = await proofreadBasicHandler({
        text: SEGMENT_TEXT,
        start_offset: SEGMENT_START,
      });
      expect(result.success).toBe(true);
      const issues = extractIssues((result.content[0] as { text: string }).text);
      const hit = issues![0];
      expect(isDocumentAbsoluteSlice(WHOLE_TEXT, hit)).toBe(true);
      expect(hit.offset).toBe(SEGMENT_START);
    });

    it('无控制字符样本的既有口径逐字不变（#296 回归锚点，保持绿）', () => {
      const issues = runBasicProofreading('进行研究');
      expect(issues[0].offset).toBe(0);
      expect(issues[0].length).toBe(4);
      expect(issues[0].original).toBe('进行研究');
    });
  });

  // ================================================================
  // 用例 C：消费方无从得知「该 +多少」——区间读取输出不含 baseOffset 字段
  //        （段 2 定点修复的靶子；正例已就位，字段一出现即自动接管）
  // ================================================================
  describe('用例 C：getDocumentTextByRange 输出回填 baseOffset（段 2 已定点修复）', () => {
    const rangeData = {
      text: SEGMENT_TEXT,
      startOffset: SEGMENT_START,
      length: SEGMENT_TEXT.length,
      docLength: WHOLE_TEXT.length,
      requestedLength: SEGMENT_TEXT.length,
      returnedLength: SEGMENT_TEXT.length,
      truncated: false,
      docEndReached: false,
    };

    it('信号行含 baseOffset（= startOffset）⇒ 消费方能把「本段相对偏移」换算成文档绝对偏移', async () => {
      mockExecute.mockResolvedValue({ success: true, data: rangeData });
      const r = await getDocumentTextByRangeHandler({
        start_offset: SEGMENT_START,
        length: SEGMENT_TEXT.length,
      });
      const sig = parseSignal((r.content[0] as { text: string }).text);
      expect(sig).not.toBeNull();
      expect(sig).toHaveProperty('baseOffset');
      // 同值：不得是第二套口径（第二套口径 = 本 Issue 要治的「同一语义多源」）
      expect(sig!.baseOffset).toBe(sig!.startOffset);
      expect(sig!.baseOffset).toBe(SEGMENT_START);
    });

    it('PS 侧返回的 startOffset 与请求不一致时，baseOffset 仍锚在**真实返回**偏移（不得回显请求值）', async () => {
      // PS 可能 clamp/fill 起始偏移；baseOffset 必须描述「这份 text 实际从哪开始」，
      // 否则消费方按请求值换算就会再次错位。
      mockExecute.mockResolvedValue({
        success: true,
        data: { ...rangeData, startOffset: 7 },
      });
      const r = await getDocumentTextByRangeHandler({
        start_offset: SEGMENT_START,
        length: SEGMENT_TEXT.length,
      });
      const sig = parseSignal((r.content[0] as { text: string }).text);
      expect(sig!.baseOffset).toBe(7);
      expect(sig!.baseOffset).toBe(sig!.startOffset);
    });

    // ── 变异③：baseOffset 由**信号渲染唯一实现**派生，不得是「另填一个数」──
    // 判据：给 PS 返回值注入一个与 startOffset 无关的 baseOffset 字段，信号**必须忽略它**
    // （若 renderRangeText 变成「透传 PS 的 baseOffset」，本用例立即转红 ⇒ 判据非恒真）。
    it('变异③：信号里的 baseOffset 只由 startOffset 派生，不采信 PS 端同名字段（防第二套口径）', async () => {
      mockExecute.mockResolvedValue({
        success: true,
        data: { ...rangeData, baseOffset: SEGMENT_START + 3 },
      });
      const r = await getDocumentTextByRangeHandler({
        start_offset: SEGMENT_START,
        length: SEGMENT_TEXT.length,
      });
      const sig = parseSignal((r.content[0] as { text: string }).text);
      expect(sig!.baseOffset).toBe(SEGMENT_START);
      expect(sig!.baseOffset).toBe(sig!.startOffset);
    });
  });

  // ================================================================
  // 变异自证：断言测「行为」不测「形态」
  //   ① 把期望改成「相对偏移」→ 用例 A 转绿（证明断言真的在测坐标系，不是恒真）
  //   ② 打桩注入 baseOffset（不改生产源码）→ 用例 A 转绿（证明修好即绿，不会永远红）
  // ================================================================
  describe('变异自证：断言锚在行为，不锚在字符串', () => {
    // ── 变异①：把判据的「参照原文」换掉（等价于把期望改成「相对偏移坐标系」）──
    // 判据的坐标系由**参照原文**决定：传整篇 = 文档绝对，传本段 = 相对。
    // 同一载体在两种参照下必须给出**相反**结论 —— 否则判据区分不了坐标系（恒真假闸门）。
    it('变异①：参照原文换成「本段文本」（= 相对坐标系）→ 用例 A 的判据立即翻转', () => {
      const hit = runBasicProofreading(SEGMENT_TEXT)[0];
      const asDocumentAbsolute = isDocumentAbsoluteSlice(WHOLE_TEXT, hit);
      const asSegmentRelative = isDocumentAbsoluteSlice(SEGMENT_TEXT, hit);
      // 现状：相对坐标系成立、文档绝对坐标系不成立 ⇒ 恰好互补，判据有效
      expect(asSegmentRelative).toBe(true);
      expect(asDocumentAbsolute).toBe(!asSegmentRelative);
    });

    // ── 变异②：打桩注入 baseOffset（不改生产源码）→ 用例 A 的判据转绿 ──
    // 证明「修好即绿」：这些复现用例不是永远红的墓碑，而是可被定点修复关闭的活断言。
    it('变异②：打桩令 offset 加上 segmentStart（不改生产源码）→ 用例 A 的判据转绿', () => {
      const injected = (text: string): OffsetCarrier[] =>
        runBasicProofreading(text).map(i => ({ ...i, offset: i.offset + SEGMENT_START }));
      const probe = probeBasicProofreadOffsetSpace(injected, LEAD, SEGMENT_TEXT);
      expect(probe.missingBaseOffsetIsDocumentAbsolute).toBe(true);
      expect(probe.observedOffset).toBe(SEGMENT_START);
    });

    it('反暗桩：契约的正判据必须能拒绝「坐标系不符」的载体（防判据恒真）', () => {
      // offset=0 相对坐标 + 整篇原文 ⇒ 判据须判否
      expect(
        isDocumentAbsoluteSlice(WHOLE_TEXT, { offset: 0, length: 4, original: '进行研究' })
      ).toBe(false);
      // length 与 original 长度不一致 ⇒ 判据须判否
      expect(
        isDocumentAbsoluteSlice(WHOLE_TEXT, {
          offset: SEGMENT_START,
          length: 3,
          original: '进行研究',
        })
      ).toBe(false);
      // 超界 ⇒ 判据须判否
      expect(
        isDocumentAbsoluteSlice(WHOLE_TEXT, { offset: 999, length: 4, original: '进行研究' })
      ).toBe(false);
      // 正确载体 ⇒ 判据须判是
      expect(
        isDocumentAbsoluteSlice(WHOLE_TEXT, {
          offset: SEGMENT_START,
          length: 4,
          original: '进行研究',
        })
      ).toBe(true);
    });
  });

  // ── 段 3（L1 + L2）：坐标层的分离 ────────────────────────────────────────────
  // **编译期**判据在 `src/tests/support/coordinate-layer-typecheck.ts`（`.ts` 而非 `.test.ts`，
  // 故受 `tsc --noEmit` 检查 —— `.test.ts` 被 tsconfig exclude，写在那里就是假绿）；
  // 本块只做**运行期**取值往返，保证编译期断言引用的值是真实的（非悬空符号）。
  describe('段 3 · L1 字符偏移 与 L2 段落索引 分层', () => {
    it('品牌收窄入口保真（品牌不改变数值语义）', () => {
      expect(asDocumentAbsoluteOffset(123) as number).toBe(123);
      expect(asParagraphIndex(7) as number).toBe(7);
    });

    it('编译期断言样本真实存在（与 coordinate-layer-typecheck.ts 同源）', () => {
      expect(typecheckSamples.asL1 as number).toBe(1);
      expect(typecheckSamples.asL2 as number).toBe(0);
      expect(typecheckSamples.bare as number).toBe(3);
      expect(typecheckSamples.range.end as number).toBe(200);
      // 类型断言不改变运行期值：`asTuple` 运行期仍是 `{start,end}` 对象（`[1]` 为 undefined）
      expect((typecheckSamples.asTuple as unknown as ParagraphRangeLike).end as number).toBe(200);
      expect((typecheckSamples.fromTuple as unknown as number[])[1]).toBe(200);
    });
  });
});
