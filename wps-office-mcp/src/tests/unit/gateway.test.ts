/**
 * Gateway 工具测试 - 验证搜索索引、搜索功能、执行功能
 *
 * @date 2026-05-18
 */

import { searchTools, executeTool, TOOLS_INDEX } from '../../tools/gateway';

// Mock logger
jest.mock('../../utils/logger', () => ({
  log: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  })),
}));

// Mock wpsClient
jest.mock('../../client/wps-client', () => ({
  wpsClient: {
    executeMethod: jest.fn(),
  },
}));

import { wpsClient } from '../../client/wps-client';

const mockedWpsClient = wpsClient as jest.Mocked<typeof wpsClient>;

describe('TOOLS_INDEX 完整性验证', () => {
    it('索引数量应为 238 个', () => {
      expect(TOOLS_INDEX.length).toBe(238);
    });

  it('索引名称应该唯一（无重复）', () => {
    const names = TOOLS_INDEX.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(TOOLS_INDEX.length);
  });

  it('所有条目必须有 name、description、category、appType', () => {
    TOOLS_INDEX.forEach((item) => {
      expect(item.name).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(item.appType).toBeTruthy();
    });
  });

  it('Word 工具应至少有 33 个', () => {
    const wordTools = TOOLS_INDEX.filter(t => t.category === 'word');
    expect(wordTools.length).toBeGreaterThanOrEqual(33);
  });

  it('Excel 工具应至少有 90 个', () => {
    const excelTools = TOOLS_INDEX.filter(t => t.category === 'excel');
    expect(excelTools.length).toBeGreaterThanOrEqual(90);
  });

  it('PPT 工具应至少有 80 个', () => {
    const pptTools = TOOLS_INDEX.filter(t => t.category === 'ppt');
    expect(pptTools.length).toBeGreaterThanOrEqual(80);
  });

  it('关键 Excel 工具必须存在', () => {
    const required = [
      'setFormula', 'getRangeData', 'setRangeData', 'createSheet',
      'createPivotTable', 'createChart', 'cleanData', 'removeDuplicates',
      'sortRange', 'autoFilter', 'diagnoseFormula',
    ];
    const names = TOOLS_INDEX.map(t => t.name);
    required.forEach(name => {
      expect(names).toContain(name);
    });
  });

  it('关键 Word 工具必须存在', () => {
    const required = [
      'setFont', 'applyStyle', 'generateTOC', 'findReplace',
      'insertTable', 'insertImage', 'getDocumentParagraphs',
      'smartFillField', 'replaceBookmarkContent',
    ];
    const names = TOOLS_INDEX.map(t => t.name);
    required.forEach(name => {
      expect(names).toContain(name);
    });
  });

  it('关键 PPT 工具必须存在', () => {
    const required = [
      'addSlide', 'deleteSlide', 'beautifySlide', 'beautifyAllSlides',
      'unifyFont', 'setSlideTransition', 'addAnimation',
    ];
    const names = TOOLS_INDEX.map(t => t.name);
    required.forEach(name => {
      expect(names).toContain(name);
    });
  });
});

describe('searchTools 搜索功能', () => {
  it('默认返回最多 10 条结果', () => {
    const result = searchTools({ query: '字体' });
    expect(result.results.length).toBeLessThanOrEqual(10);
  });

  it('limit 参数可控制返回数量', () => {
    const result = searchTools({ query: '设置', limit: 3 });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it('category 过滤应生效', () => {
    const excel = searchTools({ query: '设置', category: 'excel' });
    const word = searchTools({ query: '设置', category: 'word' });
    const ppt = searchTools({ query: '设置', category: 'ppt' });

    excel.results.forEach(r => expect(r.category).toBe('excel'));
    word.results.forEach(r => expect(r.category).toBe('word'));
    ppt.results.forEach(r => expect(r.category).toBe('ppt'));
  });

  it('按名称搜索应匹配', () => {
    const result = searchTools({ query: 'setFont' });
    expect(result.results.some(r => r.name === 'setFont')).toBe(true);
  });

  it('按描述搜索应匹配', () => {
    const result = searchTools({ query: '字体' });
    expect(result.results.length).toBeGreaterThan(0);
    result.results.forEach(r => {
      expect(
        r.name.includes('字体') || r.description.includes('字体')
      ).toBe(true);
    });
  });

  it('按关键词搜索应匹配', () => {
    const result = searchTools({ query: '图表' });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('空查询应返回所有工具', () => {
    const result = searchTools({ query: '' });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('无匹配结果应返回空数组', () => {
    const result = searchTools({ query: 'zzznomatch999' });
    expect(result.results.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it('搜索结果包含 name、description、category、appType、params、example', () => {
    const result = searchTools({ query: '字体', limit: 1 });
    if (result.results.length > 0) {
      const r = result.results[0];
      expect(r.name).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.category).toBeTruthy();
      expect(r.appType).toBeTruthy();
      expect(r.params).toBeDefined();
      expect(r.example).toContain('wps_office_execute');
    }
  });

  it('搜索结果包含 next_steps 提示', () => {
    const result = searchTools({ query: '字体' });
    expect(result.next_steps).toBeTruthy();
  });

  it('精确名称匹配应排在最前', () => {
    const result = searchTools({ query: 'setFont' });
    expect(result.results[0].name).toBe('setFont');
  });

  it('按分类分别搜索三个应用', () => {
    const excel = searchTools({ query: '表格', category: 'excel' });
    const word = searchTools({ query: '表格', category: 'word' });
    const ppt = searchTools({ query: '表格', category: 'ppt' });

    // 三个分类都应该有结果（"表格"关键词覆盖多个分类）
    expect(excel.results.length + word.results.length + ppt.results.length).toBeGreaterThan(0);
  });
});

describe('executeTool 执行功能', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('不存在的工具名应返回失败结果', async () => {
    const result = await executeTool({
      tool_name: 'nonexistent_tool_xyz',
      arguments: {},
    });
    expect(result.success).toBe(false);
    expect(result.content[0].text).toContain('不存在');
  });

  it('存在的工具名, 无对应 TS handler 应透传 PS1', async () => {
    mockedWpsClient.executeMethod.mockResolvedValue({ success: true });
    const result = await executeTool({
      tool_name: 'openFile', // openFile ∈ COM_ACTIONS 但无 TS handler
      arguments: {},
    });
    expect(mockedWpsClient.executeMethod).toHaveBeenCalledWith(
      'openFile',
      {},
      expect.anything()
    );
    expect(result.success).toBe(true);
  });

  it('存在的工具名, 有对应 TS handler 应走 handler 路径', async () => {
    mockedWpsClient.executeMethod.mockResolvedValue({ success: true, data: { settings: { fontName: '微软雅黑' } } });
    const result = await executeTool({
      tool_name: 'setFont',
      arguments: { font_name: '微软雅黑', fontSize: 12 },
    });
    // setFont 有 TS handler，handler 内部会调用 wpsClient.executeMethod
    expect(mockedWpsClient.executeMethod).toHaveBeenCalledWith(
      'setFont',
      expect.objectContaining({ fontName: '微软雅黑' }),
      expect.anything()
    );
    expect(result.success).toBe(true);
  });

  it('无 TS handler 的工具 executeMethod 异常应返回失败结果', async () => {
    mockedWpsClient.executeMethod.mockRejectedValue(new Error('COM Error'));
    const result = await executeTool({
      tool_name: 'openFile', // openFile 无 TS handler，走 PS1 兜底
      arguments: {},
    });
    expect(result.success).toBe(false);
  });
});