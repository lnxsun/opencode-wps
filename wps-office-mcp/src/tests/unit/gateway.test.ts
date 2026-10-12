/**
 * Gateway 工具测试 - 验证搜索索引、搜索功能、执行功能
 *
 * @date 2026-05-18
 */

// uuid v14 是 ESM-only，Jest CJS 无法解析，手动 mock
jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

import { searchTools, executeTool, TOOLS_INDEX } from '../../tools/gateway';
import { allTools } from '../../tools';

// Mock logger
jest.mock('../../utils/logger', () => ({
  log: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock wpsClient
jest.mock('../../client/wps-client', () => ({
  wpsClient: {
    executeMethod: jest.fn(),
  },
}));

import { wpsClient } from '../../client/wps-client';
import { sessionIssues } from '../../tools/word/proofread-session';

const mockedWpsClient = wpsClient as jest.Mocked<typeof wpsClient>;

// 模块级 sessionIssues Map 在用例间会残留，隔离避免顺序/状态耦合（评审建议）
afterEach(() => {
  sessionIssues.clear();
});

describe('TOOLS_INDEX 完整性验证', () => {
  it('索引数量与 COM_ACTIONS 单源一致（不手写数字，Issue #373）', () => {
    // Issue #373：此处原为手写 `toBe(257)` —— 与 `validate-tool-counts.js` 的手写 12 同族形态
    // （数字一旦漂移就红，但红的是「人没记得改」而不是「真值不对」）。改为**派生自唯一来源**：
    // COM_ACTIONS 数据表 + TOOLS_INDEX 是它的 1:1 映射（含全部网关条目；whoami 是内置工具，
    // 不经网关 —— 见 Issue #373 第 3 轮 CR3-1）。
    const { COM_ACTIONS } = require('../../tools/gateway/com-actions');
    expect(TOOLS_INDEX.length).toBe(COM_ACTIONS.length);
    // 且真值源不得退化（实测曾因数组迁走而恒 0）
    expect(COM_ACTIONS.length).toBeGreaterThan(200);
  });

  it('索引名称应该唯一（无重复）', () => {
    const names = TOOLS_INDEX.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(TOOLS_INDEX.length);
  });

  it('所有条目必须有 name、description、category、appType', () => {
    TOOLS_INDEX.forEach(item => {
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
      'setFormula',
      'getRangeData',
      'setRangeData',
      'createSheet',
      'createPivotTable',
      'createChart',
      'cleanData',
      'removeDuplicates',
      'sortRange',
      'autoFilter',
      'diagnoseFormula',
    ];
    const names = TOOLS_INDEX.map(t => t.name);
    required.forEach(name => {
      expect(names).toContain(name);
    });
  });

  it('关键 Word 工具必须存在', () => {
    const required = [
      'setFont',
      'applyStyle',
      'generateTOC',
      'findReplace',
      'insertTable',
      'insertImage',
      'getDocumentParagraphs',
      'smartFillField',
      'replaceBookmarkContent',
    ];
    const names = TOOLS_INDEX.map(t => t.name);
    required.forEach(name => {
      expect(names).toContain(name);
    });
  });

  it('校对 4 个纯 TS 工具已直连注册（不再在网关索引，Issue #382 DECISION-1）', () => {
    // DECISION-1：PS1 无同名分支的纯 TS 工具一律直连注册 —— 它们应出现在 allTools（tools/list 可见面），
    // 且**不再**出现在 COM_ACTIONS（否则 AI 看到同名双通道 + 两套 schema，正是 #382 的病灶）。
    const directNames = allTools.map(t => t.definition.name);
    for (const n of [
      'wps_word_proofread_basic',
      'wps_word_confirm_batch_ai_proofread',
      'wps_word_proofread_accumulate',
      'wps_word_generate_proofread_report',
    ])
      expect(directNames).toContain(n);
    const gwNames = TOOLS_INDEX.map(t => t.name);
    for (const n of [
      'proofreadBasic',
      'confirmBatchAiProofread',
      'proofreadAccumulate',
      'generateProofreadReport',
    ])
      expect(gwNames).not.toContain(n);
    // 真 COM Action（PS1 有同名分支）仍留在索引
    for (const n of ['enableTrackChanges', 'getTrackChangesStatus', 'replaceInParagraph'])
      expect(gwNames).toContain(n);
    // schema 说真话：_processed_to_paragraph 必填（服务端会硬拒，不得「可选的外表 + 必填的内核」）
    const accTool = allTools.find(t => t.definition.name === 'wps_word_proofread_accumulate')!;
    expect(
      (accTool.definition.inputSchema.required as string[]).includes('_processed_to_paragraph')
    ).toBe(true);
    expect((accTool.definition.inputSchema.required as string[]).includes('doc_info')).toBe(true);
  });

  it('关键 PPT 工具必须存在', () => {
    const required = [
      'addSlide',
      'deleteSlide',
      'beautifySlide',
      'beautifyAllSlides',
      'unifyFont',
      'setSlideTransition',
      'addAnimation',
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
      // searchTools 是 name/description/keywords 三路匹配，命中任一即可
      // （results 不返回 keywords，回溯 TOOLS_INDEX 原始条目验证）
      const indexItem = TOOLS_INDEX.find(t => t.name === r.name);
      expect(indexItem).toBeDefined();
      const matched =
        indexItem!.name.includes('字体') ||
        indexItem!.description.includes('字体') ||
        indexItem!.keywords.some(k => k.includes('字体'));
      expect(matched).toBe(true);
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

  it('setCellFormat schema 应含 format 可选 + 顶层 numberFormat 兼容', () => {
    const result = searchTools({ query: 'setCellFormat' });
    const tool = result.results.find(r => r.name === 'setCellFormat');
    expect(tool).toBeDefined();
    const params = tool!.params as Record<string, { required: boolean; description?: string }>;
    // format 应为可选（兼容仅传 numberFormat 的旧式调用）
    expect(params.format.required).toBe(false);
    // 顶层 numberFormat 兼容参数应存在且可选
    expect(params.numberFormat).toBeDefined();
    expect(params.numberFormat.required).toBe(false);
    // range 仍为必填
    expect(params.range.required).toBe(true);
    // format 描述应包含 numberFormat 子属性说明
    expect(params.format.description).toContain('numberFormat');
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
    expect(mockedWpsClient.executeMethod).toHaveBeenCalledWith('openFile', {}, expect.anything());
    expect(result.success).toBe(true);
  });

  it('存在的工具名, 有对应 TS handler 应走 handler 路径', async () => {
    mockedWpsClient.executeMethod.mockResolvedValue({
      success: true,
      data: { settings: { fontName: '微软雅黑' } },
    });
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

  it('setCellFormat 仅传 range+numberFormat 应透传并成功', async () => {
    mockedWpsClient.executeMethod.mockResolvedValue({ success: true });
    const result = await executeTool({
      tool_name: 'setCellFormat',
      arguments: { range: 'A1:B2', numberFormat: '0.00%' },
    });
    // format 缺省时 handler 应默认 {}，顶层 numberFormat 应透传到 PS1
    expect(mockedWpsClient.executeMethod).toHaveBeenCalledWith(
      'setCellFormat',
      expect.objectContaining({ range: 'A1:B2', numberFormat: '0.00%' }),
      expect.anything()
    );
    expect(result.success).toBe(true);
  });

  it('setCellFormat 传 format 对象应保留透传', async () => {
    mockedWpsClient.executeMethod.mockResolvedValue({ success: true });
    const result = await executeTool({
      tool_name: 'setCellFormat',
      arguments: { range: 'A1:C3', format: { bold: true, numberFormat: '#,##0.00' } },
    });
    expect(mockedWpsClient.executeMethod).toHaveBeenCalledWith(
      'setCellFormat',
      expect.objectContaining({ range: 'A1:C3', format: { bold: true, numberFormat: '#,##0.00' } }),
      expect.anything()
    );
    expect(result.success).toBe(true);
  });
});

describe('网关路由 proofread 报告工具（#25 验收 TC-13）', () => {
  it('search 返回的 params 必须保留 required（行为断言，CR6-1：非形态检查）', () => {
    // #382 黑盒通道③：`inputSchemaToParamsSchema` 若丢 `required`，AI 看不到必填 ⇒ 只能靠散文（SKILL）记。
    // 走**真实** searchTools（不查源码字面量）：`proofreadAccumulate` 的 `_processed_to_paragraph` / `doc_info`
    // 在 definition 里是 required ⇒ 网关 schema 必须如实反映。
    // `setCellValue` 的 row/col/value 在 definition 里 required ⇒ 网关 schema 必须如实反映
    const r = searchTools({ query: 'setCellValue' });
    const tool = r.results.find(x => x.name === 'setCellValue');
    expect(tool).toBeTruthy();
    expect(tool!.params.row.required).toBe(true);
    expect(tool!.params.value.required).toBe(true);
  });

  it('空搜索结果给出可自纠提示（Issue #382 §五黑盒通道①）', () => {
    const r = searchTools({ query: '这是一个绝不存在的工具名xyz' });
    expect(r.total).toBe(0);
    expect(r.results.length).toBe(0);
    // 提示必须含「怎么自纠」而非只给空数组（原实现 next_steps 恒为「使用 wps_office_execute 执行」）
    expect(r.next_steps).toContain('自纠');
    expect(r.next_steps).toContain('全量');
  });

  it('直连 handler：session 身份由文档路径派生（Issue #382，不传 session_id）', async () => {
    // DECISION-1 后这 4 个工具直连调用（不再经网关）；会话 key = deriveSessionKey(doc_info.filePath)
    const { proofreadAccumulateHandler } = await import('../../tools/word/proofread-report');
    const result = await proofreadAccumulateHandler({
      issues: [
        {
          offset: 0,
          length: 4,
          original: '测试',
          suggestion: '测试2',
          type: '测试',
          source: 'mcp',
        },
      ],
      doc_info: {
        fileName: '测试.docx',
        filePath: 'C:/test/测试.docx',
        totalParagraphs: 1,
        totalWords: 2,
      },
      _processed_to_paragraph: 1,
    });
    expect(result.success).toBe(true);
    expect(result.content[0].text).toContain('已累加');
  });

  it('直连 handler：无 filePath 即拒绝（不回落 fileName，Issue #382）', async () => {
    const { proofreadAccumulateHandler } = await import('../../tools/word/proofread-report');
    const result = await proofreadAccumulateHandler({
      issues: [
        {
          offset: 0,
          length: 4,
          original: '测试',
          suggestion: '测试2',
          type: '测试',
          source: 'mcp',
        },
      ],
      doc_info: { fileName: 'x.docx', totalParagraphs: 1, totalWords: 2 },
      _processed_to_paragraph: 1,
    });
    expect(result.success).toBe(false);
    expect(result.content[0].text).toContain('无法定位校对会话');
  });

  it('直连 handler：报告生成闭环（accumulate→generate，同一文档派生 key）', async () => {
    const { proofreadAccumulateHandler, generateProofreadReportHandler } =
      await import('../../tools/word/proofread-report');
    const doc = {
      fileName: '闭环.docx',
      filePath: 'C:/test/闭环.docx',
      totalParagraphs: 1,
      totalWords: 2,
    };
    const acc = await proofreadAccumulateHandler({
      issues: [
        {
          offset: 0,
          length: 4,
          original: '测试',
          suggestion: '测试2',
          type: '测试',
          source: 'mcp',
        },
      ],
      doc_info: doc,
      _processed_to_paragraph: 1,
    });
    expect(acc.success).toBe(true);
    const rep = await generateProofreadReportHandler({ doc_info: doc });
    expect(rep.success).toBe(true);
    expect(rep.content[0].text).toContain('校对报告');
  });
});
