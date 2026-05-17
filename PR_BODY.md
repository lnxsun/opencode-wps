## Summary

本次 PR 修复了 Skills/Agents 与 MCP Gateway 架构不一致的问题：

- **Skills/Agents 迁移到 gateway 模式**：3 个子 skills（wps-excel/word/ppt）和 4 个 agents 全部重写，改为 `wps_office_search` → `wps_office_execute` 两阶段调用流程，移除了所有引用不存在工具的错误写法
- **COM Actions 索引更新至 237 个**：补充了 `generateFormula`、`diagnoseFormula` 等工具，移除了重复项
- **新增 3 套测试（共 56 个测试用例）**：gateway 完整性测试、内置工具注册测试、Skills/Agents 工具名称一致性测试
- **修复旧测试**：修正了 `tool-registry.ts` 改为 skip 策略后的重复注册测试用例

## Changes

| 文件 | 改动 |
|------|------|
| `skills/wps-excel/word/ppt/SKILL.md` | 重写为 gateway 模式 |
| `agents/wps-expert/excel/word/ppt.md` | 移除不存在工具引用，重写为 gateway 模式 |
| `wps-office-mcp/src/tools/gateway/index.ts` | 索引更新至 237 个 COM Actions |
| `wps-office-mcp/src/tests/unit/gateway.test.ts` | 新增：索引完整性 + search + execute 测试 |
| `wps-office-mcp/src/tests/integration/mcp-builtin.test.ts` | 新增：14 个内置工具注册测试 |
| `wps-office-mcp/src/tests/integration/skills-consistency.test.ts` | 新增：Skills/Agents 工具名称一致性测试 |
| `wps-office-mcp/src/tests/unit/tools.test.ts` | 修复：重复注册测试（skip 而非 throw） |

## Test Results

```
Test Suites: 6 passed, 6 total
Tests:       118 passed, 118 total
```

### 测试覆盖

| 测试文件 | 验证内容 |
|---------|---------|
| `gateway.test.ts` | TOOLS_INDEX 237 个工具完整性、search、execute |
| `mcp-builtin.test.ts` | 14 个内置工具注册、调用、缓存 |
| `skills-consistency.test.ts` | Skills/Agents 工具名称一致性 |
| `tools.test.ts` | ToolRegistry 生命周期 |
| `mcp-server.test.ts` | MCP 服务端集成、端到端场景 |
| `wps-client.test.ts` | WPS 客户端各种操作 |
