# Model Context Protocol (MCP)

MCP（Model Context Protocol）是一个开放协议，用于连接 AI 应用与外部数据源和工具。

> 本项目使用 MCP 协议让 OpenCode 能够调用 WPS COM 接口操作文档。

---

## 什么是 MCP

MCP（Model Context Protocol）是 AI 应用的"USB-C 接口"——就像 USB-C 提供设备连接的标准化方式，MCP 提供 AI 应用连接外部系统的标准化方式。

### MCP 能做什么

- AI 助手访问 Google Calendar、Notion 等数据源
- Claude Code 根据 Figma 设计生成整个 Web 应用
- 企业聊天机器人连接多个数据库进行数据分析
- AI 模型在 Blender 中创建 3D 设计并打印

---

## MCP 架构

```
┌─────────────────────────────────────────────────┐
│                  AI 应用 (Host)                  │
│                   (OpenCode)                    │
└────────────────────┬────────────────────────────┘
                     │ JSON-RPC
                     │ (MCP 协议)
┌────────────────────▼────────────────────────────┐
│               MCP Server                        │
│             (wps-office-mcp)                    │
│  ┌─────────────┐  ┌─────────────┐              │
│  │   Tools     │  │ Resources   │              │
│  │ (WPS 操作)   │  │ (文档数据)   │              │
│  └─────────────┘  └─────────────┘              │
└────────────────────┬────────────────────────────┘
                     │ COM
                     │ (PowerShell)
┌────────────────────▼────────────────────────────┐
│            WPS Office Application              │
│      (Word / Excel / PowerPoint)               │
└─────────────────────────────────────────────────┘
```

---

## MCP 核心概念

### 1. Tools（工具）

MCP 服务器提供可执行的工具，AI 可以调用这些工具完成任务。

**工具定义示例：**
```json
{
  "name": "wps_excel_get_cell_value",
  "description": "读取 Excel 指定单元格的值",
  "inputSchema": {
    "type": "object",
    "properties": {
      "sheet": { "type": "string", "description": "工作表名称" },
      "row": { "type": "number", "description": "行号（从1开始）" },
      "col": { "type": "number", "description": "列号（从1开始）" }
    },
    "required": ["sheet", "row", "col"]
  }
}
```

### 2. Resources（资源）

MCP 服务器可以提供资源供 AI 使用，如数据库表、文件内容等。

### 3. Prompts（提示）

MCP 服务器可以提供预定义的提示模板。

---

## MCP 消息格式

MCP 使用 JSON-RPC 2.0 消息格式：

### 请求示例
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "wps_excel_get_cell_value",
    "arguments": {
      "sheet": "Sheet1",
      "row": 1,
      "col": 1
    }
  }
}
```

### 响应示例
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Hello World"
      }
    ]
  }
}
```

---

## OpenCode 中的 MCP

### 配置 MCP 服务器

在 `~/.config/opencode/opencode.json` 中配置：

```json
{
  "mcp": {
    "wps-office": {
      "type": "local",
      "command": ["node", "D:/code/opencode-wps/wps-office-mcp/dist/index.js"]
    }
  }
}
```

### 本项目的 MCP 工具

本项目的 MCP 服务器提供约 200 个工具：

| 类别 | 数量 | 例子 |
|------|------|------|
| Excel 工具 | ~90 | 读取单元格、写入公式、创建图表 |
| Word 工具 | ~29 | 插入文本、应用样式、生成目录 |
| PPT 工具 | ~85 | 添加幻灯片、设置动画、美化 |

---

## MCP SDK

官方提供多种语言的 SDK：

- **TypeScript/JavaScript**: `@modelcontextprotocol/sdk`
- **Python**: `mcp` (PyPI)
- **Go**: `github.com/mark3labs/mcp-go`

### TypeScript 客户端示例

```typescript
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['./wps-mcp-server.js']
});

const client = new Client({
  name: 'wps-mcp-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);

// 列出可用工具
const tools = await client.listTools();
console.log(tools);

// 调用工具
const result = await client.callTool({
  name: 'wps_excel_get_cell_value',
  arguments: { sheet: 'Sheet1', row: 1, col: 1 }
});
```

---

## 官方资源

- MCP 官方文档：https://modelcontextprotocol.io/
- MCP 规范：https://modelcontextprotocol.io/specification/latest
- OpenCode MCP 集成：https://opencode.ai/docs/mcp-servers/

---

## 本项目实现

详见 `wps-office-mcp/` 目录：
- MCP 服务器入口：`src/index.ts`
- WPS 工具定义：`src/tools/`
- PowerShell COM 桥接：`scripts/wps-com.ps1`