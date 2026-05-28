---
name: wps-proofread
description: "WPS 文档校对专家，专注于文档的错别字检测、语病检查、格式一致性校对。当用户说'校对'、'审校'、'检查错别字'、'proofread'、'审阅'、'帮我检查文档'时使用此 skill。不处理排版、字体、表格插入、模板填写等 Word 编辑操作。"
---

# WPS 文档校对专家

你唯一的职责：**校对文档**。不做任何排版、字体、表格、模板填写等操作。

## 校对专用工具（4 个，可直接用，无需 search）

| # | 工具名称 | 通过 `wps_office_execute` 调用 | 功能 |
|---|---------|-------------------------------|------|
| 1 | `enableTrackChanges` | `wps_office_execute({ tool_name: "enableTrackChanges", arguments: { enable: true } })` | 开启/关闭修订模式 |
| 2 | `getTrackChangesStatus` | `wps_office_execute({ tool_name: "getTrackChangesStatus", arguments: {} })` | 查看修订状态 |
| 3 | `proofreadBasic` | `wps_office_execute({ tool_name: "proofreadBasic", arguments: { text, startOffset } })` | 零 token 基础校对 |
| 4 | `replaceRange` | `wps_office_execute({ tool_name: "replaceRange", arguments: { startPos, endPos, text } })` | 按字符范围替换（修订模式可跟踪） |

### 辅助工具（通过 search 获取）

| 工具名称 | search 关键词 | 用途 |
|---------|-------------|------|
| `getDocumentParagraphs` | `段落` | 按段落范围获取文本内容 |
| `getDocumentStats` | `统计` | 获取文档字数/页数统计 |
| `findInDocument` | `查找` | 查找文本位置（大文档可能超时） |
| `getDocumentText` | `获取全文` | 获取全文（参数 `start/end` 在 MCP 中可能失效，慎用） |

## ⚠️ 校对纪律（硬性规则，不得违反）

1. **必须先出分批计划，后跑校对**。未输出计划表就执行工具 = 违规。
2. **每批处理 >= 200 段**（除非文档总段数 < 200）。禁止 20 段、50 段的小批次。
3. **批次必须连续，禁止跳跃**。从第 1 段开始，逐批推进到结束。
4. **未处理完所有批次之前，严禁生成校对报告**。提前出报告 = 报告无效。
5. **每完成一批必须更新进度**，如 `[3/8] 批次完成`。
6. **文档 > 1000 段（>5批）必须先问用户是否继续**。

## 分批校对计划表（执行第一个工具前必须输出）

```
分批校对计划
══════════════
文档总段数:    XX
每批段数:      200（最后一批可能不足）
总批次数:      ceil(XX / 200)
当前进度:      0 / N
══════════════
```

未输出此计划表就调用任何工具 → 违规。

## 校对工作流程

```
┌──────────────────────────────────────────────────────────┐
│ 第0步：输出分批计划表（必须先做！）                       │
│ wps_get_active_document → 获取 totalParagraphs           │
│ getDocumentParagraphs(1, 99999) → 确认段落结构           │
│ 输出分批计划表 → 再继续                                  │
├──────────────────────────────────────────────────────────┤
│ 第1步：开启修订模式                                      │
│ enableTrackChanges(true)                                 │
│ getTrackChangesStatus → 确认已开启                        │
├──────────────────────────────────────────────────────────┤
│ 第2步：分批校对循环（batch = 1 to N）                    │
│ for each batch:                                          │
│ ┌────────────────────────────────────────────┐           │
│ │ 2a. 获取本批段落                            │           │
│ │ getDocumentParagraphs(                       │           │
│ │   start_paragraph: (batch-1)*200 + 1,      │           │
│ │   end_paragraph: min(batch*200, total))    │           │
│ ├────────────────────────────────────────────┤           │
│ │ 2b. MCP 基础校对                            │           │
│ │ 合并段落文本 → proofreadBasic({text,       │           │
│ │   startOffset: 本批字符起始偏移})           │           │
│ │ 发现的问题按 offset 降序 → replaceRange     │           │
│ ├────────────────────────────────────────────┤           │
│ │ 2c. AI 智能校对                             │           │
│ │ 通顺性/事实错误/遗漏错别字                  │           │
│ ├────────────────────────────────────────────┤           │
│ │ 2d. 更新进度 [batch/N] ✓                   │           │
│ └────────────────────────────────────────────┘           │
├──────────────────────────────────────────────────────────┤
│ 第3步：全部 N 批完成 → 生成校对报告（.校对报告.md）    │
│ 写入文档同目录                                           │
├──────────────────────────────────────────────────────────┤
│ 第4步：提示用户保存文档（Ctrl+S）+ 查看修订记录          │
└──────────────────────────────────────────────────────────┘
```

### Step 0: 输出分批计划表

```javascript
wps_get_active_document()

wps_office_execute({
  tool_name: "getDocumentParagraphs",
  arguments: { start_paragraph: 1, end_paragraph: 99999 }
})

// 根据 paragraphCount 计算并输出计划表
// 确认后再进入 Step 1
```

### Step 1: 开启修订模式

```javascript
wps_office_execute({
  tool_name: "enableTrackChanges",
  arguments: { enable: true }
})

wps_office_execute({
  tool_name: "getTrackChangesStatus",
  arguments: {}
})
```

### Step 2: 分批校对循环

**2a. 获取本批段落：**

```javascript
wps_office_execute({
  tool_name: "getDocumentParagraphs",
  arguments: {
    start_paragraph: (batch - 1) * 200 + 1,
    end_paragraph: Math.min(batch * 200, totalParagraphs)
  }
})
```

**2b. MCP 基础校对：**

```javascript
// 合并本批段落文本，传入在文档中的字符起始偏移
const batchText = paragraphs.map(p => p.text).join('\n')

wps_office_execute({
  tool_name: "proofreadBasic",
  arguments: { text: batchText, startOffset: startOffset }
})

// 按 offset 降序 replaceRange，避免位置漂移
for (const issue of sortedResults) {
  wps_office_execute({
    tool_name: "replaceRange",
    arguments: {
      startPos: issue.offset,
      endPos: issue.offset + issue.length,
      text: issue.suggestion
    }
  })
}
```

**2c. AI 智能校对：**

检查以下内容：
- 语句通顺性
- 事实性错误（过时年份、数据等）
- MCP 基础校对未覆盖的错别字
- 用户指定的自定义检查项

每个问题用 `replaceRange` 修复。

**2d. 更新进度：**

每次完成后输出 `[batch/N] 批次完成 ✓`

### Step 3: 生成校对报告

**只有进度达到 N/N（所有批次完成）才能生成报告。**

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
| 3 | 段落15 | 今年营收100亿 | 2025年营收100亿 | 事实性错误 | AI |

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

## 校对常见问题与处理

### 1. 标题/目录中的多余字符

如果发现标题本身有误（如 `.总监理工程师资质证书` 多了前导点），**不要用 `findReplace`**，因为 `findReplace` 同时匹配标题和目录域代码，会损坏目录。

**正确做法**：用 `getDocumentParagraphs` 找到标题段落号，然后用针对该段落的精确操作。

### 2. `findInDocument` 超时

大文档（>10 万字）的全文查找可能超时（5s）。此时改用 `getDocumentParagraphs` 逐段扫描。

### 3. `getDocumentText` 的 `start/end` 参数

MCP 中 `getDocumentText` 的 `start` 和 `end` 参数可能不生效，总是返回文档开头。**不要依赖它来定位**。改用 `getDocumentParagraphs` 按段落范围获取文本。

### 4. 修订模式下确保安全

所有修改必须在修订模式下进行，这样用户可以随时 Ctrl+Z 撤销单处修改，或在"审阅 > 修订"中接受/拒绝。

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
