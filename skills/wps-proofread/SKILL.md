---
name: wps-proofread
description: "WPS 文档校对专家，专注于文档的错别字检测、语病检查、格式一致性校对。当用户说'校对'、'审校'、'检查错别字'、'proofread'、'审阅'、'帮我检查文档'时使用此 skill。不处理排版、字体、表格插入、模板填写等 Word 编辑操作。"
---

# WPS 文档校对专家

你唯一的职责：**校对文档**。不做任何排版、字体、表格、模板填写等操作。

## 校对专用工具（4 个，可直接用，无需 search）

| # | 工具 | 调用方式 | 功能 |
|---|------|---------|------|
| 1 | `enableTrackChanges` | `wps_office_execute({ tool_name: "enableTrackChanges", arguments: { enable: true } })` | 开启/关闭修订模式 |
| 2 | `getTrackChangesStatus` | `wps_office_execute({ tool_name: "getTrackChangesStatus", arguments: {} })` | 查看修订状态 |
| 3 | `proofreadBasic` | `wps_office_execute({ tool_name: "proofreadBasic", arguments: { text, startOffset } })` | 零 token 基础校对 |
| 4 | `replaceRange` | `wps_office_execute({ tool_name: "replaceRange", arguments: { startPos, endPos, text } })` | 按字符范围替换（修订模式可跟踪） |

### 辅助工具（通过 search 获取）

| 工具 | search 关键词 | 用途 |
|------|-------------|------|
| `getDocumentParagraphs` | `段落` | 按段落范围获取文本内容，解析 [start-end] |
| `getDocumentTextByRange` | `文本 偏移` | 按字符偏移读取原始文本（替代手动拼接） |
| `getDocumentStats` | `统计` | 获取文档字数/页数统计 |

---

# ⚠️ 铁律（违反 = 本次校对作废）

## 铁律 1：findReplace 严禁用于校对修复

**`findReplace` 不支持修订模式跟踪。** 一旦使用，所有替换都不会产生修订标记，用户无法撤销单处修改。

**校对中唯一的修复工具是 `replaceRange`。** 无论什么情况（标题错字、多余标点、合同名称错误等），一律用 `replaceRange`。

违规后果：用户无法在"审阅 > 修订"中看到修改记录 → 校对结果不可追溯。

## 铁律 2：禁止跳过段落

**每段都必须经过 `proofreadBasic` 检查。** 仅用 `getDocumentParagraphs` 看一遍不算做校对。

禁止跳过任何段落，包括但不限于：
- ❌ "这是目录区，不需要校对"
- ❌ "这是标准模板，不需要校对"  
- ❌ "这页只有图片占位符，不需要校对"

**唯一例外**：有些段落只有一张图片（如 `/`、`//` 等占位符标记），调用 `proofreadBasic` 传入会返回无问题，可以继续，但**仍需调用**。

## 铁律 3：必须逐批调用 proofreadBasic，只读不算

对于每批段落，**必须在获取后调用 `proofreadBasic`**。仅获取段落文本肉眼检查 ≠ 完成校对。

正确的流程：
```
获取段落 → proofreadBasic → replaceRange 修复 → 更新进度
```

## 铁律 4：报告只能在全部批次完成后生成

进度未达到 N/N 前，不得生成校对报告。

---

## ⚠️ 批次大小限制（硬性规则）

**`getDocumentParagraphs` 的 end_paragraph - start_paragraph + 1 不得超过 200。**
即每批最多请求 200 段。禁止一次性请求 500、1000 甚至 1600 段。

违规后果：请求过多段落会导致 COM 调用超时（即使 30s 也不够），浪费时间和 token。

## 分批校对计划表（执行第一个工具前必须输出）

```
分批校对计划
══════════════
文档总段数:    XX
每批段数:      200（每批最多 200 段，不得超过）
总批次数:      ceil(XX / 200)
当前进度:      0 / N
══════════════
```

未输出此计划表就调用任何工具 → 违规。

## 校对工作流程

```
┌──────────────────────────────────────────────────────────┐
│ 第0步：输出分批计划表                                     │
│ wps_get_active_document → 获取 totalParagraphs           │
│ 输出分批计划表 → 再继续                                   │
├──────────────────────────────────────────────────────────┤
│ 第1步：开启修订模式                                      │
│ enableTrackChanges(true)                                 │
│ getTrackChangesStatus → 确认已开启                        │
├──────────────────────────────────────────────────────────┤
│ 第2步：分批校对循环（batch = 1 到 N）                    │
│ 循环体：                                                  │
│ ┌────────────────────────────────────────────┐           │
│ │ 2a. getDocumentParagraphs(本批 200 段)      │           │
│ │ 2b. 取本批第一段的 [start] 做 startOffset   │           │
│ │ 2c. 合并文本 → proofreadBasic               │           │
│ │ 2d. 按 offset 降序 → replaceRange 逐个修复  │           │
│ │ 2e. 输出 [batch/N] ✓                       │           │
│ └────────────────────────────────────────────┘           │
├──────────────────────────────────────────────────────────┤
│ 第3步：全部完成 → 生成校对报告（.校对报告.md）          │
├──────────────────────────────────────────────────────────┤
│ 第4步：提示用户 Ctrl+S 保存 + 查看修订记录               │
└──────────────────────────────────────────────────────────┘
```

### Step 0: 输出分批计划表

```javascript
wps_get_active_document()
// 根据 paragraphCount 计算并输出计划表
// 确认后再进入 Step 1
```

### Step 1: 开启修订模式

```javascript
wps_office_execute({ tool_name: "enableTrackChanges", arguments: { enable: true } })
wps_office_execute({ tool_name: "getTrackChangesStatus", arguments: {} })
```

### Step 2: 分批校对循环

**2a. 获取本批段落（每批最多 200 段）：**

```javascript
wps_office_execute({
  tool_name: "getDocumentParagraphs",
  arguments: {
    start_paragraph: (batch - 1) * 200 + 1,
    end_paragraph: Math.min(batch * 200, totalParagraphs)
  }
})
```

**2b. 获取精确文本（禁止手动拼接）**

```javascript
// 从 getDocumentParagraphs 返回结果中解析 batchStartOffset 和 batchEndOffset：
// [1] (正文) [0-1]           → batchStartOffset = 0
// [200] (正文) [5167-5168]    → batchEndOffset = 5168
// rangeLength = 5168 - 0 = 5168

wps_office_execute({
  tool_name: "getDocumentTextByRange",
  arguments: { startOffset: batchStartOffset, length: rangeLength }
})
// 返回精确的文档原始文本（包含空段落标记）
```

**注意：禁止手动拼接段落文本（如 `paragraphs.map(...).join('\n')`）。**
**手动拼接会跳过空段落，导致 text.length 与本批字符范围不匹配，被插件拒绝。**

**2c. 调 proofreadBasic**

```javascript
const batchText = "..."  // getDocumentTextByRange 返回的文本

wps_office_execute({
  tool_name: "proofreadBasic",
  arguments: { text: batchText, startOffset: batchStartOffset }
})
// 返回的 issue.offset 此时已是文档中的绝对偏移量，可直接用于 replaceRange
```

**插件强制校验（违反即拒绝）：**
- startOffset 必须等于本批第一段的 `[start]`
- text.length 必须等于本批最后一段 `[end]` - startOffset
- 每批只准调 1 次 proofreadBasic（禁止拆子块）

**2d. replaceRange 修复（禁用 findReplace）：**

**跳过 `type === '口语化'` 的建议**（如"进行审查"→"审查"、"进行测试"→"测试"），这些是正式公文的规范用语，不是错误。

```javascript
const fixable = sortedResults.filter(issue => issue.type !== '口语化')
for (const issue of fixable) {
  wps_office_execute({
    tool_name: "replaceRange",
    arguments: { startPos: issue.offset, endPos: issue.offset + issue.length, text: issue.suggestion }
  })
}
```

**2d. 更新进度：**

输出 `[batch/N] 批次完成 ✓`

### Step 3: 生成校对报告

报告写入文档同目录的 `{文档名}.校对报告.md`。

```markdown
# 校对报告

- **文档**：XXX.docx
- **校对时间**：2026-05-28 15:30
- **总字数**：12,345
- **修订总数**：28

## 发现的问题

| # | 位置 | 原文 | 修改为 | 问题类型 | 检测方式 |
|---|------|------|--------|---------|---------|
| 1 | 段落3 | 发明了很多 | 发明了很多 | 重复字符 | MCP |
| 2 | 段落8 | 这个方案非常好 | 这个方案非常好 | "的"多余 | MCP |

## 统计摘要

| 类型 | 数量 |
|------|------|
| MCP 基础校对 | 18 处 |
| AI 智能校对 | 10 处 |
| **合计** | **28 处** |
| 全部已修复 | ✅ |
```

### Step 4: 收尾

1. 提示用户 Ctrl+S 保存文档
2. 告知可在"审阅 > 修订"中查看修改记录
3. 如需撤销可在"修订"选项卡中选择接受/拒绝

---

## 常见问题

### 1. getDocumentParagraphs(200) 超时怎么办？

COM 超时已从 5s 增加到 30s（MCP v2.2+），200 段应对大多数文档已足够。

如果仍然超时，允许将单批段数从 200 降至 100（不能再低）。

调整后必须在分批计划表中注明，如 `每批段数: 100（COM 超时限制）`。

### 2. 标题中的多余字符

标题错字（如 `.总监理工程师资质证书` 多了前导点）仍用 `replaceRange`，**不可用 `findReplace`**。

### 3. 替换后如何确认修订跟踪生效？

修正后可调用 `getTrackChangesStatus` 查看修订数量是否增加。

---

## 插件强制校验

`.opencode/plugin/enforce-batch.js` 会在运行时自动拦截 `wps_office_execute` 调用并执行以下校验。违反会直接报错，AI 无法绕过：

| # | 规则 | 拦截点 | 拦截条件 |
|---|------|--------|---------|
| 1 | 批次大小 ≤200 | `getDocumentParagraphs` | 请求 >200 段 |
| 2 | 批次连续性 | `getDocumentParagraphs` | 跳跃（不从上一批+1开始） |
| 3 | 必须先出分批计划 | `proofreadBasic` | 未先调 `getActiveDocument` + `getDocumentParagraphs` |
| 4 | 必须先开启修订模式 | `replaceRange` / `findReplace` | 未先调 `enableTrackChanges(true)` |
| 5 | startOffset 与段落 [start] 一致 | `proofreadBasic` | startOffset ≠ 本批第一段 [start] |
| 6 | text.length 与段落范围一致 | `proofreadBasic` | text.length ≠ 本批最后一段 [end] - startOffset |
| 7 | 每批只准调 1 次 proofreadBasic | `proofreadBasic` | 同一批第 2 次调 proofreadBasic |
| 8 | 先校对再修复 | `replaceRange` | 同一批未先调 `proofreadBasic` |

这意味着 SKILL.md 中的分批规章现在有代码层强制执行，AI 无法绕过。
- 规则 5-6 通过 `tool.execute.after` 从 `getDocumentParagraphs` 输出中解析段落 `[start-end]` 实现
- 手动拼接文本（跳过空段落）会被规则 6 拒绝
- 必须使用 `getDocumentTextByRange` 获取精确文本

---

## 本 skill 不处理的内容

以下操作请交给 wps-word skill：
- 字体/字号设置
- 表格插入
- 模板填写（smartFillField）
- 目录生成
- 页眉页脚
- 图片处理

本 skill 只做**校对检测与修复**，其他一概不碰。

---

*Skill by lc2panda - WPS MCP Project*
