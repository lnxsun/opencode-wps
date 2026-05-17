/**
 * MCP Server 内置工具测试
 * 验证 14 个内置工具正确注册、gateway 工具正确注册
 *
 * @date 2026-05-18
 */

import { WpsMcpServer } from '../../server/mcp-server';
import { ToolRegistry } from '../../server/tool-registry';

// Mock MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    onerror: null,
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { method: 'tools/call' },
  ListToolsRequestSchema: { method: 'tools/list' },
  ErrorCode: { InternalError: -32603, InvalidParams: -32602 },
  McpError: class MockMcpError extends Error {
    constructor(public code: number, message: string) {
      super(message);
    }
  },
}));

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
    checkConnection: jest.fn().mockResolvedValue(true),
    getStatus: jest.fn().mockReturnValue({ connected: true }),
    getActiveDocument: jest.fn().mockResolvedValue({ name: 'test.docx' }),
    getActiveWorkbook: jest.fn().mockResolvedValue({ name: 'test.xlsx' }),
    getActivePresentation: jest.fn().mockResolvedValue({ name: 'test.pptx', slideCount: 5 }),
    insertText: jest.fn().mockResolvedValue(true),
    getCellValue: jest.fn().mockResolvedValue(42),
    setCellValue: jest.fn().mockResolvedValue(true),
    executeMethod: jest.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock错误类
jest.mock('../../utils/error', () => ({
  McpError: class McpError extends Error {
    constructor(message: string, public code: string, public details?: unknown) {
      super(message);
      this.name = 'McpError';
    }
  },
  ErrorCode: { TOOL_NOT_FOUND: 'TOOL_NOT_FOUND' },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-mcp-test'),
}));

describe('MCP Server 内置工具注册', () => {
  let server: WpsMcpServer;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = ToolRegistry.getInstance();
    registry.clear();
    server = new WpsMcpServer();
    server.registerBuiltinTools();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('内置工具数量验证', () => {
    it('应注册 14 个内置工具', () => {
      // 内置 12 个 + gateway 2 个
      expect(registry.size).toBe(14);
    });
  });

  describe('12 个内置工具必须存在', () => {
    const builtinTools = [
      'wps_check_connection',
      'wps_get_active_document',
      'wps_insert_text',
      'wps_get_active_workbook',
      'wps_get_cell_value',
      'wps_set_cell_value',
      'wps_get_active_presentation',
      'wps_execute_method',
      'wps_cache_data',
      'wps_get_cached_data',
      'wps_list_cache',
      'wps_clear_cache',
    ];

    builtinTools.forEach(name => {
      it(`工具 ${name} 应该存在`, () => {
        expect(registry.hasTool(name)).toBe(true);
      });
    });
  });

  describe('Gateway 工具必须存在', () => {
    it('wps_office_search 应该存在', () => {
      expect(registry.hasTool('wps_office_search')).toBe(true);
    });

    it('wps_office_execute 应该存在', () => {
      expect(registry.hasTool('wps_office_execute')).toBe(true);
    });
  });

  describe('listTools 应返回 14 个工具', () => {
    it('listTools 返回数量应为 14', () => {
      const { tools } = registry.listTools();
      expect(tools).toHaveLength(14);
    });

    it('listTools 包含所有内置工具名称', () => {
      const { tools } = registry.listTools();
      const names = tools.map(t => t.name);

      expect(names).toContain('wps_check_connection');
      expect(names).toContain('wps_get_active_document');
      expect(names).toContain('wps_get_active_workbook');
      expect(names).toContain('wps_get_cell_value');
      expect(names).toContain('wps_set_cell_value');
      expect(names).toContain('wps_get_active_presentation');
      expect(names).toContain('wps_execute_method');
      expect(names).toContain('wps_cache_data');
      expect(names).toContain('wps_get_cached_data');
      expect(names).toContain('wps_list_cache');
      expect(names).toContain('wps_clear_cache');
      expect(names).toContain('wps_insert_text');
      expect(names).toContain('wps_office_search');
      expect(names).toContain('wps_office_execute');
    });
  });

  describe('搜索功能验证', () => {
    it('wps_office_search 应可被调用', async () => {
      const request = ToolRegistry.createRequest('wps_office_search', {
        query: '字体',
        category: 'word',
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
      // 返回内容应该包含搜索结果
      const text = result.content[0].text ?? '';
      const parsed = JSON.parse(text);
      expect(parsed.results).toBeDefined();
      expect(Array.isArray(parsed.results)).toBe(true);
    });
  });

  describe('执行功能验证', () => {
    it('wps_office_execute 应可执行 setFont', async () => {
      const request = ToolRegistry.createRequest('wps_office_execute', {
        tool_name: 'setFont',
        arguments: { fontName: '微软雅黑', fontSize: 12 },
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });

    it('wps_office_execute 执行不存在的工具应失败', async () => {
      const request = ToolRegistry.createRequest('wps_office_execute', {
        tool_name: 'zzz_nonexistent_xyz',
        arguments: {},
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(false);
    });
  });

  describe('其他内置工具调用验证', () => {
    it('wps_get_active_workbook 应返回工作簿信息', async () => {
      const request = ToolRegistry.createRequest('wps_get_active_workbook', {});
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });

    it('wps_get_cell_value 应返回单元格值', async () => {
      const request = ToolRegistry.createRequest('wps_get_cell_value', {
        sheet: 'Sheet1',
        row: 1,
        col: 1,
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });

    it('wps_set_cell_value 应设置单元格值', async () => {
      const request = ToolRegistry.createRequest('wps_set_cell_value', {
        sheet: 'Sheet1',
        row: 1,
        col: 1,
        value: 'Test',
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });

    it('wps_execute_method 应执行方法', async () => {
      const request = ToolRegistry.createRequest('wps_execute_method', {
        method: 'ping',
        params: {},
        appType: 'wps',
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });
  });

  describe('缓存工具验证', () => {
    it('wps_cache_data 应缓存数据', async () => {
      const request = ToolRegistry.createRequest('wps_cache_data', {
        key: 'test_key',
        data: { foo: 'bar' },
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });

    it('wps_get_cached_data 应获取缓存数据', async () => {
      // 先缓存
      await registry.callTool(ToolRegistry.createRequest('wps_cache_data', {
        key: 'test_key',
        data: { foo: 'bar' },
      }));
      // 再获取
      const request = ToolRegistry.createRequest('wps_get_cached_data', {
        key: 'test_key',
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
      const text = result.content[0].text ?? '';
      const parsed = JSON.parse(text);
      expect(parsed.data).toEqual({ foo: 'bar' });
    });

    it('wps_get_cached_data 获取不存在的键应返回失败', async () => {
      const request = ToolRegistry.createRequest('wps_get_cached_data', {
        key: 'nonexistent_key',
      });
      const result = await registry.callTool(request);
      expect(result.success).toBe(false);
    });

    it('wps_clear_cache 应清除缓存', async () => {
      const request = ToolRegistry.createRequest('wps_clear_cache', {});
      const result = await registry.callTool(request);
      expect(result.success).toBe(true);
    });
  });
});