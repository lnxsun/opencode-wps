/**
 * Issue #314 R6-2：`getDocumentParagraphs` 的截断信号必须在 MCP 侧闭环。
 *
 * 背景：PS 侧（wps-com.ps1）已返回 `textTruncated` / `textLength`，但 content.ts 此前
 * 既未在类型中承接、也未在输出中呈现 → AI 看不到信号，Issue #314「截断显式化」未闭环。
 */
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));
jest.mock('../../client/wps-client', () => ({
  wpsClient: { executeMethod: jest.fn() },
  WpsAppType: { WRITER: 'writer', SPREADSHEET: 'spreadsheet', PRESENTATION: 'presentation' },
}));

import { getParagraphsHandler } from '../../tools/word/content';
import { wpsClient } from '../../client/wps-client';

const mockExecute = wpsClient.executeMethod as jest.Mock;

describe('Issue #314 R6-2：段落截断信号闭环', () => {
  beforeEach(() => mockExecute.mockReset());

  it('未截断时不加标记、不出现截断提示', async () => {
    mockExecute.mockResolvedValue({
      success: true,
      data: {
        paragraphs: [{ index: 1, text: '正常段落', style: '正文', start: 0, end: 5 }],
        totalCount: 1,
        returnedCount: 1,
      },
    });
    const r = await getParagraphsHandler({ start_paragraph: 1, end_paragraph: 1 });
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('正常段落');
    expect(text).not.toContain('被截断');
    expect(text).not.toContain('不可作为替换原文');
  });

  it('截断段被显式标注（含真实长度）且给出禁止用作 findText 的提示', async () => {
    mockExecute.mockResolvedValue({
      success: true,
      data: {
        paragraphs: [
          {
            index: 1,
            text: '前200字符...',
            textTruncated: true,
            textLength: 512,
            style: '正文',
            start: 0,
            end: 512,
          },
          { index: 2, text: '第二段', style: '正文', start: 512, end: 516 },
        ],
        totalCount: 2,
        returnedCount: 2,
      },
    });
    const r = await getParagraphsHandler({ start_paragraph: 1, end_paragraph: 2 });
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('文本被截断');
    expect(text).toContain('512'); // 真实长度（textLength）
    expect(text).toContain('不可作为替换原文');
    // 汇总提示：1 段被截断
    expect(text).toContain('1 段的 text 已被截断');
    // 未截断的段落不得被误标
    const secondLine = text.split('\n').find(l => l.startsWith('[2]'))!;
    expect(secondLine).not.toContain('被截断');
  });

  it('缺 textLength 时标注降级为 ?（不崩、不伪装成已知值）', async () => {
    mockExecute.mockResolvedValue({
      success: true,
      data: {
        paragraphs: [
          { index: 1, text: 'abc...', textTruncated: true, style: '正文', start: 0, end: 200 },
        ],
        totalCount: 1,
        returnedCount: 1,
      },
    });
    const r = await getParagraphsHandler({ start_paragraph: 1, end_paragraph: 1 });
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('/? 字符');
  });
});
