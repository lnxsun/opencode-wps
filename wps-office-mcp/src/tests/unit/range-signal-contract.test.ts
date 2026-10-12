/**
 * Issue #314 QA-F1：`getDocumentTextByRange` 的截断信号必须到达消费方（MCP 侧契约）。
 *
 * 假绿根因：handler 只渲染人类可读纯文本；治理层用全文正则取信号 → 真实链路上
 * 永不命中（对照实验：JSON 形态 blocked=true / 真实形态 blocked=false）。
 * 本条锁住**真实输出形态**：必须含 `[README_SIGNAL {...}]`，且字段与 PS 数据层同源。
 */
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid') }));
jest.mock('../../client/wps-client', () => ({
  wpsClient: { executeMethod: jest.fn() },
  WpsAppType: { WRITER: 'writer', SPREADSHEET: 'spreadsheet', PRESENTATION: 'presentation' },
}));

import { getDocumentTextByRangeHandler } from '../../tools/word/document';
import { wpsClient } from '../../client/wps-client';

const mockExecute = wpsClient.executeMethod as jest.Mock;

/** 与 governance.js `parseReadmeSignal` 同契约的解析（不得各写一套形态） */
function parseSignal(text: string): Record<string, unknown> | null {
  const m = text.match(/\[README_SIGNAL (\{[^\n]*\})\]/);
  return m ? JSON.parse(m[1]) : null;
}

describe('Issue #314 QA-F1：区间读取信号行契约', () => {
  beforeEach(() => mockExecute.mockReset());

  it('截断响应必须带 [README_SIGNAL]，且 truncated=true 可被解析', async () => {
    mockExecute.mockResolvedValue({
      success: true,
      data: {
        text: '部分文本',
        startOffset: 0,
        length: 3196,
        docLength: 11158,
        requestedLength: 11158,
        clampedLength: 3196,
        returnedLength: 3196,
        truncated: true,
        docEndReached: false,
      },
    });
    const r = await getDocumentTextByRangeHandler({ start_offset: 0, length: 11158 });
    const text = (r.content[0] as { text: string }).text;
    const sig = parseSignal(text);
    expect(sig).not.toBeNull();
    expect(sig!.truncated).toBe(true);
    expect(sig!.docLength).toBe(11158);
    expect(sig!.clampedLength).toBe(3196);
    expect(sig!.returnedLength).toBe(3196);
    // 可读摘要仍保留（不为了信号牺牲人读性）
    expect(text).toContain('本次读取被截断');
  });

  it('未截断响应的 truncated=false（不得把「拿全量」渲染成截断）', async () => {
    mockExecute.mockResolvedValue({
      success: true,
      data: {
        text: '完整文本',
        startOffset: 0,
        length: 4,
        docLength: 4,
        requestedLength: 100,
        clampedLength: 4,
        returnedLength: 4,
        truncated: false,
        docEndReached: true,
      },
    });
    const r = await getDocumentTextByRangeHandler({ start_offset: 0, length: 100 });
    const sig = parseSignal((r.content[0] as { text: string }).text);
    expect(sig!.truncated).toBe(false);
    expect(sig!.docEndReached).toBe(true);
  });

  it('信号渲染单源：document.ts 与 content.ts 均从 range-signal.ts 派生（禁止内联第二份模板）', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const dir = path.join(__dirname, '../../tools/word');
    const docSrc = fs.readFileSync(path.join(dir, 'document.ts'), 'utf8');
    const contentSrc = fs.readFileSync(path.join(dir, 'content.ts'), 'utf8');
    expect(docSrc).toContain("from './range-signal'");
    expect(contentSrc).toContain("from './range-signal'");
    // 唯一生产者：模板字符串只允许出现在 range-signal.ts
    expect(docSrc).not.toContain('README_SIGNAL');
    expect(contentSrc).not.toContain('README_SIGNAL');
  });
});
