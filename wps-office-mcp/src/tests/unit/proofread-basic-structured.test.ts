/**
 * Input: proofread.ts 的 proofreadBasicHandler 返回结果
 * Output: T1 验证 — 返回文本包含可 JSON.parse 的结构化 issues 字段
 * Pos: unit test for proofreadBasic structured output (T1, #55)
 *
 * #55 P0-1 修复验证：
 * - governance.js P15/P16 依赖 JSON.parse(outText).issues 判定 proofreadHadIssues
 * - 修复前 proofreadBasic 返回纯文本，parse 必然失败 → P15/P16 从未生效
 * - 修复后返回文本末尾追加 JSON 行：{"issues":[...]}，可被 JSON.parse 解析
 */

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../../client/wps-client', () => ({
  wpsClient: {
    executeMethod: jest.fn(),
  },
}));

jest.mock('../../utils/path-safety', () => ({
  validateFilePath: jest.fn((p: string) => p),
}));

import { proofreadBasicHandler } from '../../tools/word/proofread';

/** 从返回文本末尾提取可解析的 JSON 对象 */
function extractIssuesJson(text: string): { issues: Array<Record<string, unknown>> } | null {
  const lines = text.split('\n');
  // JSON 行是最后一行（整个 JSON.stringify 单行输出）
  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = lines.slice(i).join('\n').trim();
    if (candidate.startsWith('{')) {
      try {
        return JSON.parse(candidate);
      } catch {
        // 继续往前找
      }
    }
  }
  return null;
}

describe('proofreadBasicHandler — T1 结构化输出（#55 P0-1）', () => {
  it('发现问题时：返回文本包含可 JSON.parse 的 issues 字段', async () => {
    const result = await proofreadBasicHandler({
      text: '这个方案存在着很多不足之处，进行了研究。',
    });
    expect(result.success).toBe(true);

    const text = result.content[0].text!;
    // 保留原有文本展示
    expect(text).toContain('基础校对完成，发现');
    expect(text).toContain('问题：');

    // 结构化 JSON 可解析
    const parsed = extractIssuesJson(text);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed!.issues)).toBe(true);
    expect(parsed!.issues.length).toBeGreaterThan(0);

    // 每项含 type/offset/length/original/suggestion/context
    const first = parsed!.issues[0] as Record<string, unknown>;
    expect(typeof first.type).toBe('string');
    expect(typeof first.offset).toBe('number');
    expect(typeof first.length).toBe('number');
    expect(typeof first.original).toBe('string');
    expect(typeof first.suggestion).toBe('string');
    expect(typeof first.context).toBe('string');
  });

  it('未发现问题时：返回文本同样包含 issues: [] 可解析', async () => {
    const result = await proofreadBasicHandler({
      text: '这是一段完全正常没有问题的中文文本内容。',
    });
    expect(result.success).toBe(true);
    const text = result.content[0].text!;
    expect(text).toContain('未发现明显问题');

    const parsed = extractIssuesJson(text);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed!.issues)).toBe(true);
    expect(parsed!.issues.length).toBe(0);
  });

  it('P16 场景：issue.original 为完整短语（可被子串匹配）', async () => {
    const result = await proofreadBasicHandler({
      text: '通过加强监督使产品质量提升',
    });
    expect(result.success).toBe(true);
    const parsed = extractIssuesJson(result.content[0].text!);
    expect(parsed).not.toBeNull();
    const issue = parsed!.issues[0] as Record<string, unknown>;
    expect(String(issue.original)).toContain('通过加强监督使');
  });

  it('metric 字段在通顺/简洁规则上正确携带', async () => {
    const result = await proofreadBasicHandler({
      text: '通过加强监督使产品质量提升，我们对数据进行了研究。',
    });
    const parsed = extractIssuesJson(result.content[0].text!);
    expect(parsed).not.toBeNull();
    const metrics = parsed!.issues.map((i) => (i as Record<string, unknown>).metric);
    // 通顺/简洁规则应携带 metric（fluency/conciseness）
    expect(metrics).toContain('fluency');
    expect(metrics).toContain('conciseness');
  });

  it('旧规则（的得混淆等）无 metric 字段但 type 完整', async () => {
    const result = await proofreadBasicHandler({
      text: '他跑的很快。',
    });
    const parsed = extractIssuesJson(result.content[0].text!);
    expect(parsed).not.toBeNull();
    const issue = parsed!.issues.find(
      (i) => (i as Record<string, unknown>).type === '的得混淆'
    ) as Record<string, unknown> | undefined;
    expect(issue).toBeDefined();
    expect(issue!.metric).toBeUndefined();
  });

  it('start_offset 正确传递到结构化 offset', async () => {
    const result = await proofreadBasicHandler({
      text: '通过加强监督使产品质量提升',
      start_offset: 100,
    });
    const parsed = extractIssuesJson(result.content[0].text!);
    expect(parsed).not.toBeNull();
    expect(parsed!.issues.length).toBeGreaterThan(0);
    const first = parsed!.issues[0] as Record<string, unknown>;
    expect(first.offset).toBeGreaterThanOrEqual(100);
  });

  it('空文本返回失败（不产生 JSON）', async () => {
    const result = await proofreadBasicHandler({ text: '' });
    expect(result.success).toBe(false);
  });
});
