# WPS Office MCP Server 渐进式加载重构设计

## 背景与目标

### 现状问题

当前 wps-office-mcp 直接暴露 250+ 个工具，导致 OpenCode 启动时加载缓慢（2-5 秒）。

### 目标

1. **启动加载时间**：从 2-5 秒降低到 500ms 以内
2. **工具暴露**：list 只返回 2 个网关工具
3. **功能完整**：通过 search → execute 模式调用任意功能
4. **向后兼容**：保留 wps_execute_method 兜底

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    OpenCode                        │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              wps-office MCP Server                 │
│  ┌─────────────────────────────────────────┐    │
│  │           Tool Registry                   │    │
│  │  - wps_office_search (新)              │    │
│  │  - wps_office_execute (新)             │    │
│  │  - wps_execute_method (保留，兜底)      │    │
│  └─────────────────────────────────────────┘    │
│                       │                          │
│                       ▼                          │
│  ┌─────────────────────────────────────────┐    │
│  │        Tools Index (新)                  │    │
│  │  250+ 工具的索引信息                  │    │
│  │  - name: 工具名                       │    │
│  │  - description: 描述                  │    │
│  │  - keywords: 关键词                   │    │
│  │  - category: 分类                    │    │
│  │  - params_schema: 参数                │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 工具索引结构

```typescript
interface ToolIndexItem {
  name: string;                    // 工具名，如 "wps_word_set_font"
  description: string;             // 功能描述
  keywords: string[];              // 中英文关键词
  category: string;               // 分类：word/excel/ppt/common
  appType: string;                // 应用类型：wps/et/wpp
  method: string;                  // 对应的 WPS API 方法名
  paramsSchema: Record<string, ToolParamSchema>;
}

interface ToolParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}
```

## 网关工具设计

### 1. wps_office_search

#### 输入参数

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| query | string | 是 | 搜索关键词，如"设置字体"、"插入表格" |
| category | string | 否 | 按分类筛选：word/excel/ppt/common |
| limit | number | 否 | 默认 10，返回结果数量限制 |

#### 返回格式

```json
{
  "total": 15,
  "results": [
    {
      "name": "wps_word_set_font",
      "description": "设置字体格式",
      "category": "word",
      "appType": "wps",
      "params": {
        "fontName": {"type": "string", "description": "字体名称", "required": false},
        "fontSize": {"type": "number", "description": "字号", "required": false},
        "bold": {"type": "boolean", "description": "加粗", "required": false}
      },
      "example": "wps_office_execute('wps_word_set_font', {fontName: '微软雅黑', fontSize: 14})"
    }
  ],
  "next_steps": "使用 wps_office_execute 执行，或使用 wps_execute_method 兜底"
}
```

#### 搜索逻辑

- **关键词匹配**：query 与 name、description、keywords 字段模糊匹配
- **分类过滤**：可选，精确匹配 category 字段
- **排序**：按相关度排序（完全匹配 > 开头匹配 > 包含匹配）
- **中文支持**：自动处理简繁体、拼音首字母

### 2. wps_office_execute

#### 输入参数

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| tool_name | string | 是 | 从 search 获取的工具名称 |
| arguments | object | 是 | 工具参数对象 |

#### 返回格式

```json
{
  "success": true,
  "result": {
    "message": "字体已设置为微软雅黑 14pt"
  }
}
```

#### 错误处理

| 错误类型 | 返回 | 说明 |
|---------|------|------|
| 工具不存在 | {error: "工具不存在，可用列表：..."} | 返回可用工具列表 |
| 参数缺失 | {error: "缺少必需参数：xxx"} | 返回参数 schema |
| 执行失败 | {error: "执行失败：xxx"} | 返回 WPS 错误信息 |

### 3. wps_execute_method（保留）

这是原有的兜底网关，保留用于特殊场景：

- 调用不在索引中的 WPS API
- 需要直接控制 WPS API 参数的场景
- 兼容现有 Skills

#### 输入参数

| 参数 | 类型 | 必填 | 说明 |
|-----|------|------|------|
| method | string | 是 | WPS API 方法名 |
| params | object | 否 | 方法参数 |
| appType | string | 否 | 应用类型：wps/et/wpp |

## 上层组件改造

### MCP Server

#### 文件改动

| 文件 | 改动 | 说明 |
|-----|------|------|
| `src/tools/index.ts` | 新增 | 构建工具索引（从现有工具自动提取） |
| `src/tools/gateway/index.ts` | 新建 | search + execute 实现 |
| `src/server/tool-registry.ts` | 修改 | 注册 2 个新工具 |
| `src/server/mcp-server.ts` | 修改 | 确保 wps_execute_method 保留 |

#### 索引构建策略

从现有 ToolDefinition 自动提取索引信息：

```typescript
// 从工具定义提取索引
function buildToolsIndex(tools: RegisteredTool[]): ToolIndexItem[] {
  return tools.map(tool => ({
    name: tool.definition.name,
    description: tool.definition.description,
    keywords: extractKeywords(tool.definition),  // 自动提取关键词
    category: mapCategory(tool.definition.category),
    appType: mapAppType(tool.definition.name),
    method: mapMethod(tool.definition.name),
    paramsSchema: tool.definition.inputSchema.properties,
  }));
}
```

### Agents

#### wps-expert.md

**改动**：更新工具列表和使用指南

```markdown
## 可用 MCP 工具

### 网关工具（推荐）

| 工具 | 功能 |
|------|------|
| `wps_office_search` | 搜索可用的 WPS Office 操作 |
| `wps_office_execute` | 执行搜索到的工具 |

### 使用流程

1. 用户描述需求（如"在文档中插入3行4列的表格"）
2. 调用 `wps_office_search(query="插入表格", category="word")`
3. 根据返回结果，调用 `wps_office_execute(tool_name, arguments)`

### 兜底工具

当 search 无法满足需求时，可使用 `wps_execute_method` 直接调用 WPS API：

| 工具 | 功能 |
|------|------|
| `wps_execute_method` | 执行自定义 WPS API 方法 |
```

#### wps-word.md / wps-excel.md / wps-ppt.md

**改动**：删除 `tools:` 字段

```yaml
---
# 删除 tools: 字段
# tools:  # ← 删除
#   wps_execute_method: true
#   wps_word_set_font: true
#   ...
---
```

**理由**：
- MCP 只暴露 2 个工具，tools 字段授权无意义
- agent 可以自由调用所有网关工具
- wps_execute_method 提供兜底能力

## 性能优化

### 目标

| 指标 | 当前 | 目标 |
|------|------|------|
| 启动加载时间 | 2-5 秒 | < 500ms |
| search 响应 | - | < 50ms |
| execute 响应 | - | < 200ms |

### 优化策略

1. **零启动开销**：list 只返回 2 个工具定义
2. **索引预加载**：工具索引在 MCP Server 启动时加载到内存
3. **热点缓存**：记录高频工具，优化搜索排序
4. **懒加载**：execute 时才加载对应工具的 handler

## 验收标准

1. ✅ OpenCode 启动时，`tools/list` 只返回 2-3 个工具
2. ✅ 启动加载时间 < 500ms
3. ✅ 能够通过 search 找到所有原有的 250+ 个工具
4. ✅ 能够通过 execute 执行找到的工具
5. ✅ wps_execute_method 可作为兜底
6. ✅ 3 个 subagent 删除 tools 字段后仍可正常工作

## 实施计划

### Phase 1: MCP Server 核心

1. [ ] 构建工具索引结构
2. [ ] 实现 wps_office_search
3. [ ] 实现 wps_office_execute
4. [ ] 注册新工具到 ToolRegistry

### Phase 2: Agents 改造

1. [ ] 更新 wps-expert.md
2. [ ] 修改 wps-word.md（删除 tools 字段）
3. [ ] 修改 wps-excel.md（删除 tools 字段）
4. [ ] 修改 wps-ppt.md（删除 tools 字段）

### Phase 3: 测试验证

1. [ ] 测试工具搜索
2. [ ] 测试工具执行
3. [ ] 测试兜底网关
4. [ ] 测量启动加载时间

## 附录

### 工具分类映射

| 原有分类 | 新分类 |
|---------|--------|
| DOCUMENT | word |
| SPREADSHEET | excel |
| PRESENTATION | ppt |
| COMMON | common |

### 方法名映射

| 工具名 | appType | WPS 方法 |
|--------|--------|----------|
| wps_word_* | wps | 对应 WPS API |
| wps_excel_* | et | 对应 WPS API |
| wps_ppt_* | wpp | 对应 WPS API |

---

*文档版本：1.0*
*创建日期：2026-05-08*