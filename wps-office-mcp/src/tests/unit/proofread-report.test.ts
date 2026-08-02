/**
 * Unit tests for proofread-report.ts
 *
 * Tests the TYPE_METRIC_MAP, METRIC_WEIGHT_FORMULA, normalizeToTwoPointScale,
 * session management, and the two new MCP tools.
 */

// We need to import directly from the module — but we first need to
// set up mocks since the module uses uuid, fs, etc.
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-12345'),
}));

// 包装 fs.writeFileSync 为可控 mock（默认调用真实实现），用于确定性模拟写入失败
// （评审 Critical：原 /tmp/not-a-file-dir 会被 writeFileSync 自动创建文件，导致 flaky）
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    writeFileSync: jest.fn(actual.writeFileSync),
  };
});

jest.mock('../../utils/path-safety', () => ({
  validateFilePath: jest.fn((p: string) => p),
  ALLOWED_WRITE_ROOTS: [],
}));

import {
  proofreadAccumulateHandler,
  generateProofreadReportHandler,
  sessionIssues,
  inferIssueType,
  inferTypeFromContent,
  normalizeIssueType,
  normalizeIssueSource,
  AI_ONLY_PATTERN,
} from '../../tools/word/proofread-report';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// 评审建议：重试用例真实写盘不再用 /tmp（Windows 上解析为盘符根，且残留垃圾文件），
// 改用 os.tmpdir() 并每次生成唯一子目录，用例结束后清理。
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofread-report-test-'));

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 清理失败不影响测试结果
  }
});

// Reset sessionIssues before each test
beforeEach(() => {
  sessionIssues.clear();
});

// ==================== Session Management & Accumulate ====================

describe('proofreadAccumulateHandler', () => {
  it('should reject empty session_id', async () => {
    const result = await proofreadAccumulateHandler({ session_id: '', issues: [] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id');
  });

  it('should reject non-array issues', async () => {
    const result = await proofreadAccumulateHandler({
      session_id: 'test-session-1',
      issues: 'not-an-array' as unknown as any[],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('格式错误');
  });

  it('should require doc_info on first call', async () => {
    const result = await proofreadAccumulateHandler({
      session_id: 'test-session-1',
      issues: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('doc_info');
  });

  it('should create a new session with doc_info', async () => {
    const result = await proofreadAccumulateHandler({
      session_id: 'test-session-1',
      issues: [
        {
          offset: 10,
          length: 2,
          original: '的的',
          suggestion: '的',
          type: '重复字符',
          context: '...测试的的内容...',
          source: 'mcp',
        },
      ],
      doc_info: {
        fileName: 'test.docx',
        filePath: 'C:\\test.docx',
        totalParagraphs: 50,
        totalWords: 5000,
      },
    });

    expect(result.success).toBe(true);
    expect(sessionIssues.has('test-session-1')).toBe(true);
    expect(sessionIssues.get('test-session-1')!.issues.length).toBe(1);
    expect(sessionIssues.get('test-session-1')!.docInfo.fileName).toBe('test.docx');
  });

  it('should accumulate issues on repeated calls', async () => {
    // First call
    await proofreadAccumulateHandler({
      session_id: 'test-session-2',
      issues: [
        { offset: 10, length: 2, original: '的的', suggestion: '的', type: '重复字符', context: '...', source: 'mcp' },
      ],
      doc_info: { fileName: 'test.docx', filePath: 'C:\\test.docx', totalParagraphs: 50, totalWords: 5000 },
    });

    // Second call — no doc_info needed
    await proofreadAccumulateHandler({
      session_id: 'test-session-2',
      issues: [
        { offset: 50, length: 2, original: '的了', suggestion: '得了', type: '的得混淆', context: '...', source: 'mcp' },
      ],
    });

    const session = sessionIssues.get('test-session-2')!;
    expect(session.issues.length).toBe(2);
  });

  it('should deduplicate issues by offset+original', async () => {
    await proofreadAccumulateHandler({
      session_id: 'test-session-3',
      issues: [
        { offset: 10, length: 2, original: '的的', suggestion: '的', type: '重复字符', context: '...', source: 'mcp' },
      ],
      doc_info: { fileName: 'test.docx', filePath: 'C:\\test.docx', totalParagraphs: 50, totalWords: 5000 },
    });

    // Same issue again
    await proofreadAccumulateHandler({
      session_id: 'test-session-3',
      issues: [
        { offset: 10, length: 2, original: '的的', suggestion: '的', type: '重复字符', context: '...', source: 'mcp' },
      ],
    });

    const session = sessionIssues.get('test-session-3')!;
    expect(session.issues.length).toBe(1); // deduplicated
  });

  it('should update total_revisions when provided', async () => {
    await proofreadAccumulateHandler({
      session_id: 'test-session-4',
      issues: [],
      doc_info: { fileName: 'test.docx', filePath: 'C:\\test.docx', totalParagraphs: 50, totalWords: 5000 },
      total_revisions: 15,
    });

    expect(sessionIssues.get('test-session-4')!.totalRevisions).toBe(15);
  });
});

// ==================== Report Generation ====================

describe('generateProofreadReportHandler', () => {
  it('should reject empty session_id', async () => {
    const result = await generateProofreadReportHandler({ session_id: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id');
  });

  it('should reject non-existent session', async () => {
    const result = await generateProofreadReportHandler({ session_id: 'nonexistent' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('会话不存在');
  });

  it('should generate empty report for session with no issues', async () => {
    sessionIssues.set('empty-session', {
      issues: [],
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 10, totalWords: 100 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'empty-session' });
    expect(result.success).toBe(true);
    const text = result.content[0].text!;
    expect(text).toContain('校对报告');
    expect(text).toContain('0 处');
    expect(text).toContain('10.0/10');
    expect(text).toContain('未发现任何问题');
  });

  it('should classify 少字 as fluency', async () => {
    sessionIssues.set('fluency-test', {
      issues: [
        {
          offset: 10, length: 2, original: '三方', suggestion: '三方面',
          type: '少字', context: '...以下三方...', source: 'mcp',
        },
      ],
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 10, totalWords: 100 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'fluency-test' });
    const text = result.content[0].text!;
    // Verify fluency has 1 issue
    expect(text).toContain('流畅度');
    expect(text).toContain('1'); // count
  });

  it('should classify 占位文本 as completeness and score 0', async () => {
    sessionIssues.set('completeness-test', {
      issues: [
        {
          offset: 10, length: 10, original: 'xxx有限公司', suggestion: '[名称]有限公司',
          type: '占位文本', context: '...xxx有限公司...', source: 'mcp',
        },
      ],
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 10, totalWords: 100 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'completeness-test' });
    const text = result.content[0].text!;
    // completeness should be 0/10 due to placeholder
    expect(text).toContain('完整度');
    expect(text).toContain('0.0/10');
  });

  it('should calculate fluency score correctly (25 issues → 0)', async () => {
    const issues = Array.from({ length: 25 }, (_, i) => ({
      offset: i * 10,
      length: 2,
      original: '的得',
      suggestion: '得',
      type: '的得混淆',
      context: '...',
      source: 'mcp' as const,
    }));

    sessionIssues.set('fluency-25', {
      issues,
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 100, totalWords: 1000 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'fluency-25' });
    const text = result.content[0].text!;
    // fluency raw score = 5 - 25*0.2 = 0; normalized = 0; display = 0.0
    expect(text).toContain('0.0/10');
  });

  it('should include radar chart JSON data', async () => {
    sessionIssues.set('radar-test', {
      issues: [
        { offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', context: '...', source: 'mcp' },
      ],
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 10, totalWords: 100 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'radar-test' });
    const text = result.content[0].text!;
    expect(text).toContain('雷达图数据');
    expect(text).toContain('"key": "fluency"');
    expect(text).toContain('"name": "流畅度"');
  });

  it('should handle unknown types gracefully', async () => {
    sessionIssues.set('unknown-test', {
      issues: [
        {
          offset: 0, length: 5, original: 'abcde', suggestion: 'abc',
          type: '未来新类型', context: '...', source: 'ai' as const, reason: 'test',
        },
      ],
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 10, totalWords: 100 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'unknown-test' });
    const text = result.content[0].text!;
    expect(text).toContain('未分类问题');
  });
});

// ==================== normalizeToTwoPointScale ====================

// Import the function via a workaround (it's not exported, but we can test indirectly through reports)
// We bake a separate describe that tests it via the weight formula results

describe('normalizeToTwoPointScale (indirect)', () => {
  // Test via the report output: we know rawScore=5 → normalized=2.0 → display=10.0
  // rawScore=3 → normalized=1.0 → display=5.0
  // rawScore=1 → normalized=0.0 → display=0.0

  it('maps rawScore=5 → 10.0/10 (5 conciseness issues = 5-5*0.3=3.5 → norm=1.25 → 6.3)', async () => {
    // Actually let's use a precise test: 0 issues → rawScore=5 → norm=2 → 10.0/10
    sessionIssues.set('normalize-5', {
      issues: [],
      docInfo: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'normalize-5' });
    const text = result.content[0].text!;
    // All dimensions should be 10.0/10
    expect(text).toContain('10.0/10');
    expect(text).toContain('5.0'); // raw
    expect(text).toContain('2.00'); // normalized
  });

  it('maps rawScore=1 → normalized=0 → 0.0/10 (20 fluency issues = 5-4=1 → norm=0)', async () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      offset: i * 10, length: 2, original: '的的', suggestion: '的',
      type: '的得混淆', context: '...', source: 'mcp' as const,
    }));

    sessionIssues.set('normalize-1', {
      issues,
      docInfo: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 100, totalWords: 1000 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'normalize-1' });
    const text = result.content[0].text!;
    // fluency: 20 issues → raw = 5-20*0.2 = 1 → norm = 0 → display = 0.0/10
    expect(text).toContain('0.0/10');
    expect(text).toContain('0.00'); // normalized
  });

  it('handles the completeness blocker (hasPlaceholder → 0)', async () => {
    sessionIssues.set('blocker', {
      issues: [
        { offset: 0, length: 5, original: 'xxx公司', suggestion: '[名称]', type: '占位文本', context: '...', source: 'mcp' },
      ],
      docInfo: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'blocker' });
    const text = result.content[0].text!;
    // completeness: hasPlaceholder → raw=0 → norm=0 → display=0.0/10
    expect(text).toContain('完整度');
    expect(text).toContain('0.0');
  });
});

// ==================== TYPE_METRIC_MAP verification ====================

describe('TYPE_METRIC_MAP classification', () => {
  // We verify via report output which bucket each type falls into

  const testTypeClassification = async (type: string, expectedMetric: string) => {
    sessionIssues.clear();
    sessionIssues.set('cls-test', {
      issues: [
        { offset: 0, length: 2, original: 'xx', suggestion: 'yy', type, context: '...', source: 'mcp' },
      ],
      docInfo: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
      createdAt: new Date().toISOString(),
    });

    const result = await generateProofreadReportHandler({ session_id: 'cls-test' });
    const text = result.content[0].text!;
    const lines = text.split('\n');

    // The metric section line should show count of 1
    const metricLabels: Record<string, string> = {
      fluency: '流畅度',
      conciseness: '简洁度',
      accuracy: '准确性',
      consistency: '一致性',
      completeness: '完整度',
    };
    const expectedLabel = metricLabels[expectedMetric];

    // Check that the expected metric row has count 1
    let found = false;
    for (const line of lines) {
      if (line.includes(expectedLabel) && line.includes('| 1 |')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  };

  // ── fluency ──
  it('少字 → fluency', async () => {
    await testTypeClassification('少字', 'fluency');
  });

  it('的得混淆 → fluency', async () => {
    await testTypeClassification('的得混淆', 'fluency');
  });

  it('口语化 → fluency', async () => {
    await testTypeClassification('口语化', 'fluency');
  });

  it('常见错别字 → fluency', async () => {
    await testTypeClassification('常见错别字', 'fluency');
  });

  // ── conciseness ──
  it('重复字符 → conciseness', async () => {
    await testTypeClassification('重复字符', 'conciseness');
  });

  it('句式冗余 → conciseness', async () => {
    await testTypeClassification('句式冗余', 'conciseness');
  });

  // ── accuracy ──
  it('法律术语 → accuracy', async () => {
    await testTypeClassification('法律术语', 'accuracy');
  });

  it('工程术语 → accuracy', async () => {
    await testTypeClassification('工程术语', 'accuracy');
  });

  // ── consistency ──
  it('中英混排 → consistency', async () => {
    await testTypeClassification('中英混排', 'consistency');
  });

  it('用词统一 → consistency', async () => {
    await testTypeClassification('用词统一', 'consistency');
  });

  // ── completeness ──
  it('占位文本 → completeness', async () => {
    await testTypeClassification('占位文本', 'completeness');
  });
});

// ==================== Session isolation ====================

describe('Session isolation', () => {
  it('sessions should be independent (different session_ids)', async () => {
    await proofreadAccumulateHandler({
      session_id: 'session-a',
      issues: [{ offset: 1, length: 1, original: 'a', suggestion: 'b', type: '的得混淆', context: '...', source: 'mcp' }],
      doc_info: { fileName: 'a.docx', filePath: '/a.docx', totalParagraphs: 1, totalWords: 10 },
    });

    await proofreadAccumulateHandler({
      session_id: 'session-b',
      issues: [{ offset: 2, length: 1, original: 'c', suggestion: 'd', type: '重复字符', context: '...', source: 'ai', reason: 'test' }],
      doc_info: { fileName: 'b.docx', filePath: '/b.docx', totalParagraphs: 2, totalWords: 20 },
    });

    expect(sessionIssues.size).toBe(2);
    expect(sessionIssues.get('session-a')!.issues.length).toBe(1);
    expect(sessionIssues.get('session-b')!.issues.length).toBe(1);
    expect(sessionIssues.get('session-a')!.docInfo.fileName).toBe('a.docx');
    expect(sessionIssues.get('session-b')!.docInfo.fileName).toBe('b.docx');
  });
});

// ==================== inferIssueType 兜底推断（T2，#55） ====================

describe('inferIssueType — type 兜底推断（#55 P0-2）', () => {
  it('有效 type 直接返回（不推断）', () => {
    expect(inferIssueType({ type: '的得混淆', original: '跑的很快' })).toBe('的得混淆');
    expect(inferIssueType({ type: '重复字符', original: '了了' })).toBe('重复字符');
  });

  it('type 缺失（undefined）时按文本推断', () => {
    expect(inferIssueType({ original: '进行了研究', suggestion: '研究' })).toBe('冗余词');
    expect(inferIssueType({ original: '通过加强监督使', suggestion: '加强监督使' })).toBe('句式杂糅');
    expect(inferIssueType({ original: '根据调查结果显示', suggestion: '调查结果' })).toBe('句式杂糅');
    expect(inferIssueType({ original: '由于天气的原因导致', suggestion: '由于天气导致' })).toBe('句式杂糅');
  });

  it('type 为占位值 ai（旧代码覆盖 bug）时兜底推断', () => {
    // 旧 SKILL 合并代码把 Layer 2 的 type 覆盖为 'ai' → 需兜底
    expect(inferIssueType({ type: 'ai', original: '加强重视安全问题', suggestion: '重视安全问题' })).toBe('动宾不当');
    expect(inferIssueType({ type: 'ai', original: '他取得了显著的进步提高', suggestion: '他取得了显著的进步' })).toBe('语义重复');
    expect(inferIssueType({ type: 'ai', original: '会议讨论了很多丰富的内容', suggestion: '会议讨论了很多内容' })).toBe('修饰不当');
    expect(inferIssueType({ type: 'ai', original: '这一发现具有着深远的意义', suggestion: '这一发现具有深远的意义' })).toBe('搭配冗余');
    expect(inferIssueType({ type: 'ai', original: '这个方案存在着很多不足之处', suggestion: '这个方案有很多不足之处' })).toBe('搭配冗余');
  });

  it('F11–F15 语料推断为 fluency 类型', () => {
    const f11 = inferIssueType({ original: '这个方案存在着很多不足之处', suggestion: '这个方案有很多不足之处' });
    expect(['搭配冗余', '冗余+搭配', '冗余搭配']).toContain(f11);
    expect(inferIssueType({ original: '我们需要加强重视安全问题', suggestion: '我们需要重视安全问题' })).toBe('动宾不当');
    expect(inferIssueType({ original: '他取得了显著的进步提高', suggestion: '他取得了显著的进步' })).toBe('语义重复');
    expect(inferIssueType({ original: '会议讨论了很多丰富的内容', suggestion: '会议讨论了很多内容' })).toBe('修饰不当');
    expect(inferIssueType({ original: '这一发现具有着深远的意义', suggestion: '这一发现具有深远的意义' })).toBe('搭配冗余');
  });

  it('完全无法推断时返回未分类', () => {
    expect(inferIssueType({ original: '未知内容abc', suggestion: 'def' })).toBe('未分类');
  });

  it('占位文本推断为占位文本（completeness）', () => {
    expect(inferIssueType({ original: 'xxx有限公司', suggestion: '[名称]有限公司' })).toBe('占位文本');
  });
});

// ==================== proofreadAccumulate type 兜底（T2，#55） ====================

describe('proofreadAccumulateHandler — type 兜底累加（#55 P0-2）', () => {
  it('缺 type 的 issue 累加时自动补齐 type', async () => {
    await proofreadAccumulateHandler({
      session_id: 't2-infer-1',
      issues: [
        {
          offset: 0, length: 5, original: '加强重视安全问题', suggestion: '重视安全问题',
          context: '...', source: 'ai', reason: '动宾不当',
          // 无 type 字段
        } as any,
      ],
      doc_info: { fileName: 'd.docx', filePath: '/d.docx', totalParagraphs: 1, totalWords: 10 },
    });

    const session = sessionIssues.get('t2-infer-1')!;
    expect(session.issues.length).toBe(1);
    expect(session.issues[0].type).toBe('动宾不当');
  });

  it('type 为 ai 占位值（旧 SKILL 合并 bug）时兜底推断', async () => {
    await proofreadAccumulateHandler({
      session_id: 't2-infer-2',
      issues: [
        {
          offset: 0, length: 6, original: '进行了研究', suggestion: '研究',
          context: '...', source: 'ai', type: 'ai',
        } as any,
      ],
      doc_info: { fileName: 'd.docx', filePath: '/d.docx', totalParagraphs: 1, totalWords: 10 },
    });

    const session = sessionIssues.get('t2-infer-2')!;
    expect(session.issues[0].type).toBe('冗余词');
  });

  it('报告五维评分不再全 10 分（AI 层无 type 也能归入 fluency）', async () => {
    await proofreadAccumulateHandler({
      session_id: 't2-report',
      issues: [
        {
          offset: 0, length: 8, original: '加强重视安全问题', suggestion: '重视安全问题',
          context: '...', source: 'ai', reason: '动宾不当',
        } as any,
      ],
      doc_info: { fileName: 'd.docx', filePath: '/d.docx', totalParagraphs: 1, totalWords: 10 },
    });

    const result = await generateProofreadReportHandler({ session_id: 't2-report' });
    const text = result.content[0].text!;
    // fluency 问题数为 1，原始分 = 5 - 1*0.2 = 4.8 → 归一化 (4.8-1)/2 = 1.9 → 9.5/10
    expect(text).toContain('流畅度');
    expect(text).toContain('| 1 |');
    // 不再是全 10.0/10（至少 fluency 因 1 个问题降分）
    expect(text).toContain('9.5/10');
    // 统计摘要：AI 1 处，合计 1 处
    expect(text).toContain('| AI 智能校对 | 1 处 |');
    expect(text).toContain('| **合计** | **1 处** |');
  });

  it('完全无法推断的 issue 进未分类并降级提示', async () => {
    await proofreadAccumulateHandler({
      session_id: 't2-unclassified',
      issues: [
        { offset: 0, length: 4, original: 'zzzz', suggestion: 'yyyy', context: '...', source: 'ai', reason: 'x' } as any,
      ],
      doc_info: { fileName: 'd.docx', filePath: '/d.docx', totalParagraphs: 1, totalWords: 10 },
    });

    const result = await generateProofreadReportHandler({ session_id: 't2-unclassified' });
    const text = result.content[0].text!;
    expect(text).toContain('未分类问题');
    expect(text).toContain('未计入五维评分');
  });
});

// ==================== TC-12 修订数口径（T3，#55） ====================

describe('TC-12 修订数口径（#55 P1-3）', () => {
  it('报告展示修订总数与口径说明', async () => {
    await proofreadAccumulateHandler({
      session_id: 't3-tc12',
      issues: [
        { offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', context: '...', source: 'mcp' },
      ],
      doc_info: { fileName: 'd.docx', filePath: '/d.docx', totalParagraphs: 1, totalWords: 10 },
      total_revisions: 2,
    });

    const result = await generateProofreadReportHandler({ session_id: 't3-tc12' });
    const text = result.content[0].text!;
    expect(text).toContain('修订总数');
    expect(text).toContain('2');
    expect(text).toContain('问题数 = 修订记录数 ÷ 2');
  });
});


describe('releaseSession 时序：文件写入失败时保留会话', () => {
  const sessId = 'retry-session';

  const setupSession = (issues: Array<Record<string, unknown>> = []) => {
    sessionIssues.set(sessId, {
      issues: issues as any,
      docInfo: { fileName: 'doc.docx', filePath: '/path/doc.docx', totalParagraphs: 10, totalWords: 100 },
      createdAt: new Date().toISOString(),
    });
  };

  it('不指定 output_file 时：报告生成后会话被回收', async () => {
    setupSession([{ offset: 0, length: 2, original: 'xx', suggestion: 'yy', type: '的得混淆', context: '...', source: 'mcp' }]);
    const result = await generateProofreadReportHandler({ session_id: sessId });
    expect(result.success).toBe(true);
    expect(sessionIssues.has(sessId)).toBe(false);
  });

  it('output_file 写入成功时：报告生成后会话被回收', async () => {
    setupSession([{ offset: 0, length: 2, original: 'xx', suggestion: 'yy', type: '的得混淆', context: '...', source: 'mcp' }]);
    const result = await generateProofreadReportHandler({
      session_id: sessId,
      output_file: path.join(tmpDir, `proofread-report-${Date.now()}.md`),
    });
    expect(result.success).toBe(true);
    expect(sessionIssues.has(sessId)).toBe(false);
  });

  it('output_file 写入失败时：返回 success=false + 失败原因，会话保留（可重试）', async () => {
    // mock fs.writeFileSync 必抛错，保证写入失败确定性（评审 Critical：原 /tmp/not-a-file-dir 会被
    // writeFileSync 自动创建文件导致 flaky；评审建议：不用硬编码 /path 根目录路径——
    // 主分支 mkdirSync(recursive) 会在根目录真实创建 /path 目录，与 PR 自己修复
    // /tmp 残留的方向矛盾）；用 mock 而非真实路径，跨平台（Linux/Windows）均稳定
    setupSession([{ offset: 0, length: 2, original: 'xx', suggestion: 'yy', type: '的得混淆', context: '...', source: 'mcp' }]);
    (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });
    const result = await generateProofreadReportHandler({
      session_id: sessId,
      output_file: path.join(tmpDir, 'unwritable-report.md'),
    });
    // 评审建议：落盘失败必须向上游暴露明确信号，禁止静默吞错（用户多次遇到"落盘失败但提示已生成"）
    expect(result.success).toBe(false); // 不再伪装成功
    expect(result.error).toContain('写入文件失败');
    expect(result.content[0].text).toContain('写入文件失败');
    expect(result.content[0].text).toContain('未完成落盘');
    expect(sessionIssues.has(sessId)).toBe(true); // 会话保留，可重试
  });

  it('output_file 写入失败后：修正路径重试可成功，且会话回收', async () => {
    setupSession([{ offset: 0, length: 2, original: 'xx', suggestion: 'yy', type: '的得混淆', context: '...', source: 'mcp' }]);
    // 第一次写入失败
    (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });
    const failed = await generateProofreadReportHandler({
      session_id: sessId,
      output_file: path.join(tmpDir, 'unwritable-report.md'),
    });
    expect(failed.success).toBe(false);
    expect(sessionIssues.has(sessId)).toBe(true); // 会话保留
    // 第二次（不 mock → 真实写入）重试成功：写入 os.tmpdir() 唯一目录，用例结束后统一清理
    const retry = await generateProofreadReportHandler({
      session_id: sessId,
      output_file: path.join(tmpDir, `proofread-report-retry-${Date.now()}.md`),
    });
    expect(retry.success).toBe(true);
    expect(sessionIssues.has(sessId)).toBe(false); // 成功后回收
  });

  it('空报告（0 问题）+ output_file 写入失败：返回 success=false，会话保留', async () => {
    setupSession([]);
    (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });
    const result = await generateProofreadReportHandler({
      session_id: sessId,
      output_file: path.join(tmpDir, 'unwritable-report.md'),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('写入文件失败');
    expect(sessionIssues.has(sessId)).toBe(true);
  });

  it('评审建议：空报告（0 问题）+ output_file 父目录不存在 → 自动创建父目录并写盘成功', async () => {
    // 与主分支（L936-937）行为一致：同一 output_file 因问题数不同不应出现建目录/不建目录的差异
    setupSession([]);
    const nestedDir = path.join(tmpDir, 'nested-empty', 'sub');
    const outFile = path.join(nestedDir, 'empty-report.md');
    const result = await generateProofreadReportHandler({
      session_id: sessId,
      output_file: outFile,
    });
    expect(result.success).toBe(true);
    expect(fs.existsSync(outFile)).toBe(true); // 父目录被自动创建并成功落盘
    expect(sessionIssues.has(sessId)).toBe(false); // 写盘成功 → 回收会话
  });
});

// ==================== AI_ONLY_PATTERN 模块级常量（评审建议 #70） ====================

describe('AI_ONLY_PATTERN（评审建议：不再每条重建 RegExp）', () => {
  it('F11–F15 AI 专属模式全部命中', () => {
    expect(AI_ONLY_PATTERN.test('这个方案存在着很多不足之处')).toBe(true); // F11 搭配冗余
    expect(AI_ONLY_PATTERN.test('这一发现具有着深远的意义')).toBe(true); // F15 搭配冗余
    expect(AI_ONLY_PATTERN.test('我们需要加强重视安全问题')).toBe(true); // F12 动宾不当
    expect(AI_ONLY_PATTERN.test('他取得了显著的进步提高')).toBe(true); // F13 语义重复
    expect(AI_ONLY_PATTERN.test('会议讨论了很多丰富的内容')).toBe(true); // F14 修饰不当
  });

  it('F14 修正：正常表达“丰富的经验”不命中（数量词+丰富/充分 需同时出现）', () => {
    expect(AI_ONLY_PATTERN.test('他有着丰富的经验')).toBe(false);
    expect(AI_ONLY_PATTERN.test('他经验丰富')).toBe(false);
  });

  it('普通表达不误命中', () => {
    expect(AI_ONLY_PATTERN.test('会议讨论了丰富的内容')).toBe(false); // 无数词+充分/丰富 双修
    expect(AI_ONLY_PATTERN.test('的的')).toBe(false);
  });
});

// ==================== #55 T2：type/metric 兜底推断 ====================

describe('inferTypeFromContent（#55 T2 兜底推断）', () => {
  it('原文含"通过…使" → 句式杂糅', () => {
    expect(inferTypeFromContent('通过这次学习使我受益匪浅', '这次学习使我受益匪浅')).toBe('句式杂糅');
  });

  it('原文含"根据…显示" → 句式杂糅', () => {
    expect(inferTypeFromContent('根据调查结果显示', '调查结果')).toBe('句式杂糅');
  });

  it('原文含"进行…研究" → 冗余词', () => {
    expect(inferTypeFromContent('进行了研究', '研究')).toBe('冗余词');
  });

  it('原文含"由于…的原因导致" → 句式杂糅', () => {
    expect(inferTypeFromContent('由于天气的原因导致了航班延误', '由于天气导致了航班延误')).toBe('句式杂糅');
  });

  it('原文含"并（非|不）是" → 多字', () => {
    expect(inferTypeFromContent('并不是', '并不')).toBe('多字');
  });

  it('原文含"占位文本" → 占位文本', () => {
    expect(inferTypeFromContent('check test sample', '[需补充正式内容]')).toBe('占位文本');
  });

  it('评审建议：F14 不再误判正常表达——"丰富的经验"不被推断为修饰不当', () => {
    // 原模式 `(很多|许多|大量|丰富).{0,6}(内容|经验|知识)` 会把"丰富的经验"（丰富→经验
    // 间隔 0）命中为修饰不当；修正后 F14 需数量词+丰富/充分 同时出现（如"很多丰富的内容"）。
    expect(inferTypeFromContent('他有着丰富的经验', '他经验丰富')).toBeUndefined();
    // F14 真阳性：数量词+丰富/充分 修饰名词 → 修饰不当
    expect(inferTypeFromContent('会议讨论了很多丰富的内容', '会议讨论了很多内容')).toBe('修饰不当');
  });

  it('评审建议：F14 修正同时影响 inferIssueType（F14_MODIFIER_PATTERN 复用）', () => {
    // "丰富的经验"（正常搭配）不再推断为修饰不当，落入后续规则（占位/重复等不命中 → 未分类）
    expect(inferIssueType({ original: '他有着丰富的经验', suggestion: '他经验丰富' })).toBe('未分类');
    // 真阳性仍命中
    expect(inferIssueType({ original: '会议讨论了很多丰富的内容', suggestion: '会议讨论了很多内容' })).toBe('修饰不当');
  });

  it('无法推断 → undefined', () => {
    expect(inferTypeFromContent('完全陌生的内容xyz', '也陌生')).toBeUndefined();
  });
});

describe('normalizeIssueType（#55 T2）', () => {
  it('缺 type 的 issue 被兜底推断', () => {
    const issue: any = { offset: 0, length: 4, original: '进行了研究', suggestion: '研究', source: 'mcp' };
    const normalized = normalizeIssueType(issue);
    expect(normalized.type).toBe('冗余词');
  });

  it('type="ai"（SKILL 合并 bug 产物）被兜底推断', () => {
    const issue: any = { offset: 0, length: 4, original: '通过管理使效率提升', suggestion: '管理使效率提升', type: 'ai', source: 'ai' };
    const normalized = normalizeIssueType(issue);
    expect(normalized.type).toBe('句式杂糅');
  });

  it('type 正常时保持不变', () => {
    const issue: any = { offset: 0, length: 4, original: '的的', suggestion: '的', type: '重复字符', source: 'mcp' };
    const normalized = normalizeIssueType(issue);
    expect(normalized.type).toBe('重复字符');
  });

  it('评审建议：type 带前后空格时 trim 归一化，TYPE_METRIC_MAP 查表不再落入未分类', () => {
    // 与 normalizeIssueSource 对称：有效 type 返回 trim 后归一化值，
    // 避免 ' 的得混淆 ' 在报告 metricForIssue 严格 === 查表时落入"未分类"（TC-13 同源）
    const issue: any = { offset: 0, length: 4, original: '的的', suggestion: '的', type: ' 重复字符 ', source: 'mcp' };
    const normalized = normalizeIssueType(issue);
    expect(normalized.type).toBe('重复字符');
  });

  it('无法推断 → 未分类', () => {
    const issue: any = { offset: 0, length: 4, original: '完全陌生的内容xyz', suggestion: '也陌生', source: 'ai' };
    const normalized = normalizeIssueType(issue);
    expect(normalized.type).toBe('未分类');
  });

  it('F11–F15 不合理搭配缺 type 时兜底为细粒度类型（#55 T3 凭据同步）', () => {
    expect(
      normalizeIssueType({ offset: 0, length: 8, original: '这个方案存在着很多不足之处', suggestion: '这个方案存在很多不足之处', source: 'ai' } as any).type
    ).toBe('搭配冗余');
    expect(
      normalizeIssueType({ offset: 0, length: 6, original: '我们需要加强重视安全问题', suggestion: '我们需要重视安全问题', source: 'ai' } as any).type
    ).toBe('动宾不当');
    expect(
      normalizeIssueType({ offset: 0, length: 6, original: '他取得了显著的进步提高', suggestion: '他取得了显著的进步', source: 'ai' } as any).type
    ).toBe('语义重复');
    expect(
      normalizeIssueType({ offset: 0, length: 10, original: '会议讨论了很多丰富的内容', suggestion: '会议讨论了很多内容', source: 'ai' } as any).type
    ).toBe('修饰不当');
    expect(
      normalizeIssueType({ offset: 0, length: 8, original: '这一发现具有着深远的意义', suggestion: '这一发现具有深远的意义', source: 'ai' } as any).type
    ).toBe('搭配冗余');
  });
});

describe('normalizeIssueSource（验收遗留 TC-13）', () => {
  it('source 已为 mcp / ai 时保持不变', () => {
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', source: 'mcp' } as any).source).toBe('mcp');
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '存在着', suggestion: '', type: '搭配冗余', source: 'ai' } as any).source).toBe('ai');
  });

  it('评审建议：大小写变体（MCP/AI）归一化为小写，报告统计 === 不再失真', () => {
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', source: 'MCP' } as any).source).toBe('mcp');
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', source: 'Mcp' } as any).source).toBe('mcp');
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '存在着', suggestion: '', type: '搭配冗余', source: 'AI' } as any).source).toBe('ai');
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '存在着', suggestion: '', type: '搭配冗余', source: 'Ai' } as any).source).toBe('ai');
  });

  it('缺 source 时，Layer 1 规则命中（如 的的/句式杂糅）兜底为 mcp', () => {
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符' } as any).source).toBe('mcp');
    expect(normalizeIssueSource({ offset: 0, length: 7, original: '通过加强监督使效率提升', suggestion: '加强监督使效率提升' } as any).source).toBe('mcp');
    expect(normalizeIssueSource({ offset: 0, length: 4, original: '进行了研究', suggestion: '研究' } as any).source).toBe('mcp');
  });

  it('评审建议：两层判断顺序——先 AI 专属后 Layer 1，F11–F15 不因 inferTypeFromContent 命中而误归 mcp', () => {
    // inferTypeFromContent 也能命中 F11–F15 模式（加强重视→动宾不当/存在着→搭配冗余），
    // 旧实现"非 AI 专属 → 全部 mcp"若先走 Layer 1 判断，会把这类 AI 专属问题误计为 MCP
    // （TC-13 来源失真反向复现）。修复后必须先判 AI 专属模式再判 Layer 1。
    expect(
      normalizeIssueSource({ offset: 0, length: 6, original: '我们需要加强重视安全问题', suggestion: '我们需要重视安全问题' } as any).source
    ).toBe('ai'); // F12 动宾不当（AI 专属）→ ai，而非 mcp
    expect(
      normalizeIssueSource({ offset: 0, length: 8, original: '这个方案存在着很多不足之处', suggestion: '这个方案存在很多不足之处' } as any).source
    ).toBe('ai'); // F11 搭配冗余（AI 专属）→ ai
  });

  it('评审建议：无法识别的未知内容（Layer 1 不命中、非 F11–F15）保守兜底为 mcp', () => {
    // 口语化/语序不当等 Layer 1 规则与 F11–F15 正则均不检出的语义类问题，
    // 按注释第 4 步保守兜底为 mcp（Layer 1 规则引擎命中优先，AI 补充场景由 SKILL 约束）。
    expect(normalizeIssueSource({ offset: 0, length: 4, original: '语气很口语化呢', suggestion: '语气较为书面' } as any).source).toBe('mcp');
  });

  it('评审建议：F14 不再误判正常表达——"丰富的经验"（丰富直接修饰经验）不归为 ai', () => {
    // 原 aiOnlyPattern `(很多|许多|大量|丰富).{0,6}(内容|经验|知识)` 会把正常搭配
    // "丰富的经验" 命中（丰富→经验 间隔 0）→ 误判 ai。修正后 F14 需数量词+丰富/充分
    // 同时出现（如"很多丰富的内容"），"丰富的经验"正常表达不再被 AI 专属模式捕获。
    expect(normalizeIssueSource({ offset: 0, length: 5, original: '他有着丰富的经验', suggestion: '他经验丰富' } as any).source).toBe('mcp');
    // F14 真阳性：数量词+丰富/充分 修饰名词 → ai
    expect(normalizeIssueSource({ offset: 0, length: 10, original: '会议讨论了很多丰富的内容', suggestion: '会议讨论了很多内容' } as any).source).toBe('ai');
  });

  it('缺 source 时，F11–F15 AI 专属模式（存在着/加强重视/进步提高等）兜底为 ai', () => {
    expect(normalizeIssueSource({ offset: 0, length: 8, original: '这个方案存在着很多不足之处', suggestion: '这个方案存在很多不足之处' } as any).source).toBe('ai');
    expect(normalizeIssueSource({ offset: 0, length: 6, original: '我们需要加强重视安全问题', suggestion: '我们需要重视安全问题' } as any).source).toBe('ai');
    expect(normalizeIssueSource({ offset: 0, length: 6, original: '他取得了显著的进步提高', suggestion: '他取得了显著的进步' } as any).source).toBe('ai');
    expect(normalizeIssueSource({ offset: 0, length: 10, original: '会议讨论了很多丰富的内容', suggestion: '会议讨论了很多内容' } as any).source).toBe('ai');
  });

  it('缺 source 且无法按内容推断时，保守兜底为 mcp', () => {
    expect(normalizeIssueSource({ offset: 0, length: 2, original: '完全陌生的内容xyz', suggestion: '也陌生' } as any).source).toBe('mcp');
  });
});

describe('proofreadAccumulate — 缺 type 自动兜底（#55 T2）', () => {
  it('累加时缺 type 的 issue 自动推断为冗余词，报告不再全 undefined/全 10 分', async () => {
    await proofreadAccumulateHandler({
      session_id: 't2-session-1',
      issues: [
        { offset: 0, length: 4, original: '进行了研究', suggestion: '研究', source: 'mcp' as const },
      ],
      doc_info: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
    });

    const session = sessionIssues.get('t2-session-1')!;
    expect(session.issues[0].type).toBe('冗余词'); // 兜底成功

    const result = await generateProofreadReportHandler({ session_id: 't2-session-1' });
    const text = result.content[0].text!;
    // 简洁度行应有 1 个问题，且不再全 10 分
    expect(text).toContain('简洁度');
    // 冗余词 → conciseness：raw = 5 - 1*0.3 = 4.7 → norm = (4.7-1)/2 = 1.85 → 9.3/10
    expect(text).toContain('9.3/10');
    // 不应有未分类问题
    expect(text).not.toContain('未分类问题');
  });

  it('type="ai" 的 issue 累加时被兜底为真实类型', async () => {
    await proofreadAccumulateHandler({
      session_id: 't2-session-2',
      issues: [
        { offset: 0, length: 8, original: '通过管理使效率提升', suggestion: '管理使效率提升', type: 'ai', source: 'ai' as const },
      ],
      doc_info: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
    });
    const session = sessionIssues.get('t2-session-2')!;
    expect(session.issues[0].type).toBe('句式杂糅');
  });
});

// ==================== #55 T3：TC-12 修订数口径 ====================

describe('generateProofreadReport — TC-12 修订数口径（#55 T3）', () => {
  it('报告标注修订数换算口径：问题数 = 修订记录数 ÷ 2', async () => {
    await proofreadAccumulateHandler({
      session_id: 't3-session-1',
      issues: [
        { offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', source: 'mcp' as const },
        { offset: 10, length: 2, original: '在去', suggestion: '再去', type: '在再混淆', source: 'mcp' as const },
      ],
      doc_info: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
      total_revisions: 60, // 30 处问题 × 2 条修订记录
    });

    const result = await generateProofreadReportHandler({ session_id: 't3-session-1' });
    const text = result.content[0].text!;
    expect(text).toContain('修订总数');
    expect(text).toContain('60');
    expect(text).toContain('修订记录数 ÷ 2');
    expect(text).toContain('30'); // 60 ÷ 2 = 30
  });

  it('验收遗留：奇数修订数（删除类修复只产生 1 条修订）时明确提示不整除、不再硬算整除', async () => {
    await proofreadAccumulateHandler({
      session_id: 't3-session-odd',
      issues: [
        { offset: 0, length: 8, original: '这个方案存在着很多不足之处', suggestion: '这个方案存在很多不足之处', type: '搭配冗余', source: 'ai' as const },
      ],
      doc_info: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
      total_revisions: 63, // 验收现场：63 条修订（含删除类“存在着→空”等奇数修订）
    });

    const result = await generateProofreadReportHandler({ session_id: 't3-session-odd' });
    const text = result.content[0].text!;
    expect(text).toContain('修订总数');
    expect(text).toContain('63');
    // 评审建议：奇数修订显示 ≈31.5（63 ÷ 2），不再向下取整为 31
    expect(text).toContain('≈31.5');
    expect(text).toContain('修订数为奇数');
    expect(text).toContain('换算不整除');
    expect(text).toContain('人工核对');
    // 不再出现误导性的"等价于修订记录数 ÷ 2"表述
    expect(text).not.toContain('等价于修订记录数 ÷ 2');
  });

  it('偶数修订数时无奇数提示（回归：正常成对替换）', async () => {
    await proofreadAccumulateHandler({
      session_id: 't3-session-even',
      issues: [
        { offset: 0, length: 2, original: '在去', suggestion: '再去', type: '在再混淆', source: 'mcp' as const },
      ],
      doc_info: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 10 },
      total_revisions: 2,
    });

    const result = await generateProofreadReportHandler({ session_id: 't3-session-even' });
    const text = result.content[0].text!;
    expect(text).toContain('修订总数');
    expect(text).not.toContain('修订数为奇数');
  });
});
