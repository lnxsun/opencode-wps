/**
 * Input: MCP 协议请求
 * Output: Tool 调用响应
 * Pos: MCP Server 核心实现。一旦我被修改，请更新我的头部注释，以及所属文件夹的md。
 * MCP Server实现 - 老王的MCP协议实现
 * 这是整个系统的核心，处理MCP协议通信
 * 基于stdio传输，OpenCode 就是通过这种方式连接的
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode as McpErrorCode,
  McpError as SdkMcpError,
} from '@modelcontextprotocol/sdk/types.js';

import { toolRegistry, ToolRegistry } from './tool-registry';
import { wpsClient } from '../client/wps-client';
import { ToolCallResult, ToolCategory } from '../types/tools';
import { createChildLogger } from '../utils/logger';
import { McpError } from '../utils/error';
import { fetchDocInfoFromLauncher } from '../utils/launcher';
import { searchTools, executeTool } from '../tools/gateway';
import { WpsAppType } from '../types/wps';
import { allTools } from '../tools';

const logger = createChildLogger('McpServer');

/**
 * MCP Server配置
 */
export interface McpServerConfig {
  /** 服务器名称 */
  name: string;
  /** 服务器版本 */
  version: string;
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: McpServerConfig = {
  name: 'wps-office-mcp',
  version: '1.0.0',
  debug: false,
};

/**
 * WPS MCP Server - 核心服务器类
 */
export class WpsMcpServer {
  private readonly config: McpServerConfig;
  private readonly server: Server;
  private readonly registry: ToolRegistry;
  private isRunning: boolean = false;

  // 跨应用数据缓存 - 解决macOS WPS无法跨应用操作的P0问题
  private static dataCache: Map<string, { data: unknown; timestamp: number; appType: string }> =
    new Map();
  private static readonly MAX_CACHE_AGE = 30 * 60 * 1000; // 30 分钟 TTL
  private static readonly MAX_CACHE_SIZE = 100;

  // 清除全部缓存（供测试 cleanup 使用）
  public static clearCache(): void {
    WpsMcpServer.dataCache.clear();
  }

  // 淘汰过期缓存条目
  private static evictStaleCache(): void {
    const now = Date.now();
    for (const [key, { timestamp }] of WpsMcpServer.dataCache) {
      if (now - timestamp > WpsMcpServer.MAX_CACHE_AGE) {
        WpsMcpServer.dataCache.delete(key);
      }
    }
    // 超出容量时淘汰最旧条目
    if (WpsMcpServer.dataCache.size > WpsMcpServer.MAX_CACHE_SIZE) {
      const entries = [...WpsMcpServer.dataCache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );
      const toDelete = entries.slice(0, entries.length - WpsMcpServer.MAX_CACHE_SIZE);
      for (const [key] of toDelete) WpsMcpServer.dataCache.delete(key);
    }
  }

  constructor(config?: Partial<McpServerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = toolRegistry;

    // 创建MCP Server实例
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 注册请求处理器
    this.setupRequestHandlers();

    // 错误处理
    this.server.onerror = error => {
      logger.error('MCP Server error', error);
    };

    logger.info('MCP Server created', {
      name: this.config.name,
      version: this.config.version,
    });
  }

  /**
   * 设置请求处理器
   */
  private setupRequestHandlers(): void {
    // 处理 tools/list 请求
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Handling tools/list request');

      const { tools } = this.registry.listTools();

      logger.info(`Returning ${tools.length} tools`);

      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // 处理 tools/call 请求
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      logger.debug('Handling tools/call request', { name, args });

      // 检查Tool是否存在
      if (!this.registry.hasTool(name)) {
        throw new SdkMcpError(McpErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        // 创建调用请求并执行
        const callRequest = ToolRegistry.createRequest(name, args || {});
        const result: ToolCallResult = await this.registry.callTool(callRequest);

        return {
          content: result.content,
          isError: !result.success,
        };
      } catch (error) {
        logger.error('Tool call failed', error);

        if (error instanceof McpError) {
          return {
            content: [{ type: 'text', text: error.message }],
            isError: true,
          };
        }

        throw new SdkMcpError(
          McpErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    });
  }

  /**
   * 注册内置Tools - 一些基础的WPS操作Tool
   */
  registerBuiltinTools(): void {
    logger.info('Registering built-in tools');

    // 连接状态检查Tool
    this.registry.register(
      {
        name: 'wps_check_connection',
        description: '检查WPS Office连接状态',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        category: ToolCategory.COMMON,
      },
      async () => {
        const connected = await wpsClient.checkConnection();
        const status = wpsClient.getStatus();

        return {
          id: '',
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                connected,
                status,
              }),
            },
          ],
        };
      }
    );

    // 通道自检（Issue #373）：一次说清「哪条通道断了」，替代「反复盲试同一个失败调用」
    this.registry.register(
      {
        name: 'wps_whoami',
        description:
          '通道自检：一次输出当前平台通道、连接状态、活动文档与建议的下一步。' +
          '任何工具报「No active document / 没有打开的文档」时，先调本工具自检，不要重复同一个失败调用。' +
          '⚠️ 返回的 success=true 仅表示「自检本身执行成功」，通道是否就绪一律看数据里的 channelReady；' +
          'channelReady=false 时不要重复同一个失败调用。',
        inputSchema: { type: 'object', properties: {} },
        category: ToolCategory.COMMON,
      },
      async () => {
        let activeDocument: { name: string; path: string } | null = null;
        try {
          const doc = await wpsClient.getActiveDocument();
          if (doc) activeDocument = { name: doc.name, path: doc.path };
        } catch {
          activeDocument = null;
        }

        // ⚠️ Issue #373 第 1 轮评审 RES1-1：`success` 描述「调用是否执行成功」，
        //   「通道是否就绪」是另一语义，必须用**独立字段**承载 —— 否则
        //   `success:true` + 内容 `ready:false` 会让 AI 误判「调用成功而工具挑食」，
        //   正是 Issue #373 原病灶（假成功信号诱导盲试）的缩小版。
        const ready = !!activeDocument;
        const result = {
          // ⚠️ 第 2 轮评审 CR2-3/RES2-1：`whoami` 是本 PR **新加**的工具，无旧消费者 ⇒
          //   不再保留 `ready` 别名（空集合兼容 = 无谓的第二份口径）。通道就绪统一用
          //   `channelReady` —— 与本次「口径唯一」纪律一致。
          //   ⚠️ 第 8 轮 CR8-1：原注释称「既有 `getActiveDocument` 侧保留 `ready` 是旧消费者
          //   面内的既成事实」——**实测为假**（`git show 25f0d76` 显示基线该失败体无任何
          //   `ready` 字段，`ready: false` 是本 PR 第 1 轮引入的）⇒ 已据实改写，
          //   并把 `getActiveDocument` 失败体一并统一为 `channelReady`（无历史消费者）。
          channelReady: ready,
          platform: process.platform,
          activeDocument,
          hint: ready
            ? '通道正常：可直接调用内置工具或经 wps_office_execute 调用网关工具。'
            : '通道未就绪：COM 通道未挂接（`GetActiveObject` 取不到 WPS 实例）。可调用 ' +
              '`openDocument` 重连，或检查 WPS 是否在运行；不要重复同一个失败调用。',
        };

        return {
          id: '',
          // 自检工具**本身**执行完毕即 success=true（其职责是「如实报告通道状态」）；
          // 通道就绪与否由 channelReady 承载，二者不共用一个字段。
          success: true,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }
    );

    // 获取当前文档信息
    this.registry.register(
      {
        name: 'wps_get_active_document',
        description: '获取当前打开的WPS文字文档信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        category: ToolCategory.DOCUMENT,
      },
      async () => {
        const doc = await wpsClient.getActiveDocument();

        if (doc) {
          // ⚠️ 第 9 轮 CR9-1：成功体也带 `channelReady: true` —— 与失败体、与 `whoami`
          //   **两侧对称**（否则消费方统一读 `channelReady` 时，成功场景读到 `undefined`
          //   （JS 中为假）⇒ 误判「未就绪」，反诱发盲试）。成功时字段仍为 null 以外的真值。
          return {
            id: '',
            success: true,
            content: [{ type: 'text', text: JSON.stringify({ ...doc, channelReady: true }) }],
          };
        }

        // COM 失败时读 launcher 缓存的**诊断线索**（Issue #373：**不得**据此报成功）
        // 该缓存只证明「WPS 里开过文档」（插件每 500ms 推送），不证明 COM 通道可用 ——
        // 把它包成 success:true 会把「通道断了」伪装成「通道正常」，诱导 AI 盲试
        // （实测 Issue #373 ses_f3d6：38 次 No active document + 整轮零产出）。
        // 故此处**失败就报失败**，缓存降级为显式标注的「诊断线索·非成功」。
        // ⚠️ 第 8 轮 CR8-1：字段名由 `ready` 改为 `channelReady`，与 `whoami` **统一**
        //   —— 二者是同一概念（通道是否就绪），且两个字段名**都是本 PR 引入**的
        //   （基线失败体无任何此类字段）⇒ 不存在兼容负担，不该留两套口径。
        const failBody = (hint: string) => ({
          channelReady: false,
          activeDocument: null,
          hint,
        });
        let diagnostic = '';
        try {
          const launcherDoc = await fetchDocInfoFromLauncher();
          if (launcherDoc) {
            diagnostic =
              `\n[诊断线索·非成功] launcher 缓存显示最近开过文档：${launcherDoc.name}` +
              `（${launcherDoc.path}）—— 仅说明「曾打开」，**不**代表 COM 通道可用。`;
          }
        } catch (e) {
          console.warn('[mcp-server] fetchDocInfoFromLauncher failed:', e);
        }

        return {
          id: '',
          success: false,
          content: [
            {
              type: 'text',
              text:
                JSON.stringify(
                  failBody('COM 通道不可用：未取到活动文档。请调 whoami 自检通道后重试。')
                ) + diagnostic,
            },
          ],
        };
      }
    );

    // 在文档中插入文本
    this.registry.register(
      {
        name: 'wps_insert_text',
        description: '在当前文档中插入文本',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要插入的文本内容',
            },
            position: {
              type: 'number',
              description: '插入位置（可选，不指定则在光标处插入）',
            },
          },
          required: ['text'],
        },
        category: ToolCategory.DOCUMENT,
      },
      async args => {
        const text = args.text as string;
        const position = args.position as number | undefined;

        const success = await wpsClient.insertText(text, position);

        return {
          id: '',
          success,
          content: [
            {
              type: 'text',
              text: success ? '文本插入成功' : '文本插入失败',
            },
          ],
        };
      }
    );

    // 获取当前工作簿信息
    this.registry.register(
      {
        name: 'wps_get_active_workbook',
        description: '获取当前打开的WPS表格工作簿信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        category: ToolCategory.SPREADSHEET,
      },
      async () => {
        const workbook = await wpsClient.getActiveWorkbook();

        return {
          id: '',
          success: workbook !== null,
          content: [
            {
              type: 'text',
              text: workbook ? JSON.stringify(workbook) : '没有打开的工作簿',
            },
          ],
        };
      }
    );

    // 读取单元格值
    this.registry.register(
      {
        name: 'wps_get_cell_value',
        description: '读取指定单元格的值',
        inputSchema: {
          type: 'object',
          properties: {
            sheet: {
              type: 'string',
              description: '工作表名称或索引',
            },
            row: {
              type: 'number',
              description: '行号（从1开始）',
            },
            col: {
              type: 'number',
              description: '列号（从1开始）',
            },
          },
          required: ['sheet', 'row', 'col'],
        },
        category: ToolCategory.SPREADSHEET,
      },
      async args => {
        const sheet = args.sheet as string | number;
        const row = args.row as number;
        const col = args.col as number;

        const value = await wpsClient.getCellValue(sheet, row, col);

        return {
          id: '',
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ value }),
            },
          ],
        };
      }
    );

    // 设置单元格值
    this.registry.register(
      {
        name: 'wps_set_cell_value',
        description: '设置指定单元格的值',
        inputSchema: {
          type: 'object',
          properties: {
            sheet: {
              type: 'string',
              description: '工作表名称或索引',
            },
            row: {
              type: 'number',
              description: '行号（从1开始）',
            },
            col: {
              type: 'number',
              description: '列号（从1开始）',
            },
            value: {
              type: 'string',
              description: '要设置的值',
            },
          },
          required: ['sheet', 'row', 'col', 'value'],
        },
        category: ToolCategory.SPREADSHEET,
      },
      async args => {
        const sheet = args.sheet as string | number;
        const row = args.row as number;
        const col = args.col as number;
        const value = args.value;

        const success = await wpsClient.setCellValue(sheet, row, col, value);

        return {
          id: '',
          success,
          content: [
            {
              type: 'text',
              text: success ? '单元格值设置成功' : '单元格值设置失败',
            },
          ],
        };
      }
    );

    // 获取当前演示文稿信息
    this.registry.register(
      {
        name: 'wps_get_active_presentation',
        description: '获取当前打开的WPS演示文稿信息',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        category: ToolCategory.PRESENTATION,
      },
      async () => {
        const presentation = await wpsClient.getActivePresentation();

        return {
          id: '',
          success: presentation !== null,
          content: [
            {
              type: 'text',
              text: presentation ? JSON.stringify(presentation) : '没有打开的演示文稿',
            },
          ],
        };
      }
    );

    // 执行自定义WPS方法
    this.registry.register(
      {
        name: 'wps_execute_method',
        description: `执行自定义WPS API方法。

**安全警告**：此工具允许执行任意WPS COM方法，绕过了治理插件的精确控制。
仅当标准工具无法满足需求时使用。安全性由 governance.js 插件钩子（G1-G7）保障。`,
        inputSchema: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description: 'API方法名',
            },
            params: {
              type: 'object',
              description: '方法参数',
            },
            appType: {
              type: 'string',
              description: '应用类型：wps（文字）、et（表格）、wpp（演示）',
              enum: ['wps', 'et', 'wpp'],
            },
          },
          required: ['method'],
        },
        category: ToolCategory.COMMON,
      },
      async args => {
        const method = args.method as string;
        const params = args.params as Record<string, unknown> | undefined;
        const appType = args.appType as string | undefined;

        // 禁止执行高危方法 — 按方法名段匹配，防止绕过白名单执行危险 COM API
        // 设计依据：
        //   CreateObject — 可创建任意 COM 对象，包括 WScript.Shell、ADODB.Stream 等
        //   Shell        — Shell.Application，可执行系统命令
        //   Exec / Run   — WScript.Shell.Exec / Shell.Run，命令执行
        //   WScript      — WScript 对象是完整的脚本宿主
        //   ScriptControl — 可动态执行任意脚本代码
        //   Eval / Execute — 动态代码执行
        // 按 . 切分方法名段，检查每段是否以黑名单前缀开头（而非任意位置子串），
        // 避免误伤包含子串的合法方法名（如某方法名包含 "Run" 作为子串而非完整段）。
        // 同时仍能拦截通过 G2 白名单前缀进行的绕过，如：
        //   "Application.ActiveDocument.Application.CreateObject"
        //   虽以 Application.ActiveDocument 开头（通过 G2 白名单），
        //   但黑名单仍能拦截其中的 CreateObject 段。
        // 如需放行，需确认该方法不可能被用于危险操作。
        // 第一层防御：Governance 插件 G2 白名单（governance.js）
        // 第二层防御：MCP Server 端的白名单 + 黑名单
        // 两层必须同步更新。MCP 层做双重校验：若 G2 被绕过仍可拦截。
        const allowPrefixes = [
          'Application.ActiveDocument',
          'Application.ActiveWorkbook',
          'Application.ActivePresentation',
        ];
        const blockedPrefixes = [
          'CreateObject',
          'Shell',
          'Exec',
          'Run',
          'WScript',
          'ScriptControl',
          'Eval',
          'Execute',
        ];
        if (!method) {
          return {
            id: '',
            success: false,
            content: [{ type: 'text', text: 'Error: method is required' }],
          };
        }
        // 白名单检查：方法必须以允许前缀开头
        const allowed = allowPrefixes.some(function (p) {
          return method.startsWith(p);
        });
        if (!allowed) {
          console.warn('[mcp-server] Method "' + method + '" not in allowlist, blocked');
          return {
            id: '',
            success: false,
            content: [
              {
                type: 'text',
                text:
                  'Error: method "' +
                  method +
                  '" is not allowed. Only Application.ActiveDocument / ActiveWorkbook / ActivePresentation are permitted.',
              },
            ],
          };
        }
        const segments = method.split('.');
        for (let i = 0; i < blockedPrefixes.length; i++) {
          for (let j = 0; j < segments.length; j++) {
            if (segments[j].toLowerCase().indexOf(blockedPrefixes[i].toLowerCase()) === 0) {
              console.warn(
                '[mcp-server] Blocked method "' +
                  method +
                  '" (matched prefix "' +
                  blockedPrefixes[i] +
                  '" on segment "' +
                  segments[j] +
                  '")'
              );
              return {
                id: '',
                success: false,
                content: [
                  {
                    type: 'text',
                    text: 'Error: method "' + method + '" is blocked for security reasons',
                  },
                ],
              };
            }
          }
        }

        const response = await wpsClient.executeMethod(method, params, appType as WpsAppType);

        return {
          id: '',
          success: response.success,
          content: [
            {
              type: 'text',
              text: JSON.stringify(response),
            },
          ],
        };
      }
    );

    // ==================== 跨应用数据缓存工具 ====================
    // 解决macOS WPS加载项无法跨应用操作的P0问题
    // Excel读取数据 → 缓存到MCP Server → PPT获取缓存 → 创建演示文稿

    // 缓存数据
    this.registry.register(
      {
        name: 'wps_cache_data',
        description:
          '缓存数据到MCP Server，用于跨应用数据传递。例如：从Excel读取数据后缓存，然后在PPT中使用。',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: '缓存键名，用于后续获取数据',
            },
            data: {
              type: 'object',
              description: '要缓存的数据（任意JSON对象）',
            },
            appType: {
              type: 'string',
              description: '数据来源应用类型：et（表格）、wps（文字）、wpp（演示）',
              enum: ['et', 'wps', 'wpp'],
            },
          },
          required: ['key', 'data'],
        },
        category: ToolCategory.COMMON,
      },
      async args => {
        const key = args.key as string;
        const data = args.data;
        const appType = (args.appType as string) || 'unknown';

        WpsMcpServer.evictStaleCache();
        WpsMcpServer.dataCache.set(key, {
          data,
          timestamp: Date.now(),
          appType,
        });

        logger.info(`Data cached: key=${key}, appType=${appType}`);

        return {
          id: '',
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                key,
                message: `数据已缓存，可在其他应用中通过 wps_get_cached_data 获取`,
                cacheSize: WpsMcpServer.dataCache.size,
              }),
            },
          ],
        };
      }
    );

    // 获取缓存数据
    this.registry.register(
      {
        name: 'wps_get_cached_data',
        description: '从MCP Server获取缓存的数据，用于跨应用数据传递。',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: '缓存键名',
            },
          },
          required: ['key'],
        },
        category: ToolCategory.COMMON,
      },
      async args => {
        const key = args.key as string;
        let cached = WpsMcpServer.dataCache.get(key);

        if (cached && Date.now() - cached.timestamp > WpsMcpServer.MAX_CACHE_AGE) {
          WpsMcpServer.dataCache.delete(key);
          cached = undefined;
        }

        if (!cached) {
          return {
            id: '',
            success: false,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: `缓存键 "${key}" 不存在`,
                  availableKeys: Array.from(WpsMcpServer.dataCache.keys()),
                }),
              },
            ],
          };
        }

        logger.info(`Cache hit: key=${key}, age=${Date.now() - cached.timestamp}ms`);

        return {
          id: '',
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                key,
                data: cached.data,
                appType: cached.appType,
                cachedAt: new Date(cached.timestamp).toISOString(),
              }),
            },
          ],
        };
      }
    );

    // 列出所有缓存
    this.registry.register(
      {
        name: 'wps_list_cache',
        description: '列出MCP Server中所有缓存的数据键名',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        category: ToolCategory.COMMON,
      },
      async () => {
        const cacheList = Array.from(WpsMcpServer.dataCache.entries()).map(([key, value]) => ({
          key,
          appType: value.appType,
          cachedAt: new Date(value.timestamp).toISOString(),
          ageMs: Date.now() - value.timestamp,
        }));

        return {
          id: '',
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                count: cacheList.length,
                caches: cacheList,
              }),
            },
          ],
        };
      }
    );

    // 清除缓存
    this.registry.register(
      {
        name: 'wps_clear_cache',
        description: '清除MCP Server中的缓存数据',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: '要清除的缓存键名，不指定则清除所有缓存',
            },
          },
        },
        category: ToolCategory.COMMON,
      },
      async args => {
        const key = args.key as string | undefined;

        if (key) {
          const deleted = WpsMcpServer.dataCache.delete(key);
          logger.info(`Cache cleared: key=${key}, deleted=${deleted}`);

          return {
            id: '',
            success: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: deleted ? `缓存 "${key}" 已清除` : `缓存 "${key}" 不存在`,
                }),
              },
            ],
          };
        } else {
          const count = WpsMcpServer.dataCache.size;
          WpsMcpServer.dataCache.clear();
          logger.info(`All cache cleared: count=${count}`);

          return {
            id: '',
            success: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `已清除所有缓存，共 ${count} 条`,
                }),
              },
            ],
          };
        }
      }
    );

    logger.info(`Registered ${this.registry.size} built-in tools`);

    // ==================== 注册工具（allTools，Issue #382 DECISION-1）====================
    // 「直连注册」此前是**未兑现的声明**：`allTools`（238 个）从未被 registerAll ⇒ 它们不在
    // `tools/list`、也不在网关（网关只索引 COM_ACTIONS）⇒ 其中纯 TS 的 4 个校对工具
    // 「两处都不在」（#382 实测：AI 只看到 15 个内置 + search/execute）。现于此处**真实注册**。
    this.registry.registerAll(allTools);
    logger.info(`Registered ${allTools.length} registered tools (allTools)`);

    // ==================== 网关工具 (渐进式加载) ====================
    // 只暴露 2 个工具：search 和 execute
    // 具体功能通过这两工具动态发现和执行

    // wps_office_search - 搜索工具
    this.registry.register(
      {
        name: 'wps_office_search',
        description: `WPS Office 工具搜索器。

**使用前必读**：
1. 当用户请求任何 WPS 文档操作时，必须先调用此工具查找相关功能
2. 不要猜测或假设工具名称，所有操作都通过 search->execute 两阶段完成
3. 示例流程：
   - 用户："在文档中插入3行4列的表格"
   - 调用：wps_office_search(query="插入表格", category="word")
   - 根据返回结果，调用 wps_office_execute 执行`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索关键词，如"设置字体"、"插入表格"',
            },
            category: {
              type: 'string',
              description: '按分类筛选：word/excel/ppt/common',
              enum: ['word', 'excel', 'ppt', 'common'],
            },
            limit: {
              type: 'number',
              description: '返回结果数量限制，默认10',
              default: 10,
            },
          },
          required: ['query'],
        },
        category: ToolCategory.COMMON,
      },
      async args => {
        const query = args.query as string;
        const category = args.category as string | undefined;
        const limit = (args.limit as number) || 10;

        const result = searchTools({ query, category, limit });

        return {
          id: '',
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
    );

    // wps_office_execute - 执行工具
    this.registry.register(
      {
        name: 'wps_office_execute',
        description: `执行通过 wps_office_search 找到的工具。

**使用前必读**：
1. 必须先调用 wps_office_search 找到正确的工具名称
2. 参数必须符合 search 返回的 schema 定义
3. 示例：
   - wps_office_execute("wps_word_set_font", {fontName: "微软雅黑", fontSize: 14})
   - wps_office_execute("wps_word_insert_text", {text: "内容", position: "cursor"})`,
        inputSchema: {
          type: 'object',
          properties: {
            tool_name: {
              type: 'string',
              description: '从 wps_office_search 获取的工具名称',
            },
            arguments: {
              type: 'object',
              description: '工具参数对象',
            },
          },
          required: ['tool_name', 'arguments'],
        },
        category: ToolCategory.COMMON,
      },
      async args => {
        const tool_name = args.tool_name as string;
        const arguments_ = args.arguments as Record<string, unknown>;

        if (!tool_name || typeof tool_name !== 'string') {
          return {
            id: '',
            success: false,
            content: [{ type: 'text', text: 'Error: tool_name must be a non-empty string' }],
          };
        }
        if (!arguments_ || typeof arguments_ !== 'object' || Array.isArray(arguments_)) {
          return {
            id: '',
            success: false,
            content: [{ type: 'text', text: 'Error: arguments must be a non-null object' }],
          };
        }

        const result = await executeTool({ tool_name, arguments: arguments_ });

        return result;
      }
    );

    logger.info('Registered gateway tools: wps_office_search, wps_office_execute');
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Server is already running');
      return;
    }

    logger.info('Starting MCP Server...');

    // 注册内置Tools
    this.registerBuiltinTools();

    // ⚠️ Issue #382：**实测基线此处的注释是「aspirational」** —— 注释宣称「所有功能经网关」，
    //   而 `allTools`（238 个注册工具）**从未被 registerAll** ⇒ 它们既不在 `tools/list`，
    //   也不在网关（网关只索引 COM_ACTIONS，其中 253 条覆盖了一部分但不含纯 TS 的 4 个校对工具）。
    //   这解释了「AI 只看到 15 个内置工具 + search/execute」这一 #382 观察，也是本 PR 要修的结构性缺口。
    //   现按 DECISION-1 真实注册：**注册层 = allTools（直连可见面）**，网关 = COM Actions 的渐进式入口。
    //   （注册层不再有黑名单；「纯 TS 工具必须直连」由 `validate-gateway-membership.js` 判据 A 双向断言。）
    //   registerAll(allTools) 已随 registerBuiltinTools() 执行（见该方法末），此处不再重复。

    // 创建stdio传输层
    const transport = new StdioServerTransport();

    // 连接传输层
    await this.server.connect(transport);

    this.isRunning = true;
    logger.info('MCP Server started successfully');
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Server is not running');
      return;
    }

    logger.info('Stopping MCP Server...');

    await this.server.close();

    this.isRunning = false;
    logger.info('MCP Server stopped');
  }

  /**
   * 获取服务器状态
   */
  getStatus(): { running: boolean; toolCount: number } {
    return {
      running: this.isRunning,
      toolCount: this.registry.size,
    };
  }
}

// 导出单例创建函数
export const createMcpServer = (config?: Partial<McpServerConfig>): WpsMcpServer => {
  return new WpsMcpServer(config);
};

export default WpsMcpServer;
