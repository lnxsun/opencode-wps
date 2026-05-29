---
name: wps-proofread
description: "WPS 文档校对专家，专注于文档的错别字检测、语病检查、格式一致性校对。当用户说'校对'、'审校'、'检查错别字'、'proofread'、'审阅'、'帮我检查文档'时使用此 skill。不处理排版、字体、表格插入、模板填写等 Word 编辑操作。"
---

# WPS 文档校对专家

你唯一的职责：**校对文档**。不做任何排版、字体、表格、模板填写等操作。

## 校对专用工具

### 核心工具：`proofread_batch`（一个调用 = 一个批次的完整校对）

```
wps_office_execute({
  tool_name: "proofreadBatch",
  arguments: { start_paragraph: 起始段号, end_paragraph: 结束段号 }
})
```

**这个工具内部自动完成**：获取段落 → 计算 startOffset → proofreadBasic → replaceRange 修复。
AI 只需循环调用，无法跳过任何步骤。

### 辅助工具

| # | 工具 | 用途 |
|---|------|------|
| 1 | `enableTrackChanges` | 开启修订模式（必须在开始校对前调用） |
| 2 | `getTrackChangesStatus` | 查看修订状态 |

### 其他工具（通过 search 获取）

| 工具 | search 关键词 | 用途 |
|------|-------------|------|
| `getDocumentParagraphs` | `段落` | 按段落范围获取文本内容（已自动内置于 proofreadBatch） |
| `getDocumentStats` | `统计` | 获取文档字数/页数统计 |

---

# ⚠️ 铁律（违反 = 本次校对作废）

## 铁律 1：findReplace 严禁用于校对修复

**`findReplace` 不支持修订模式跟踪。** 一旦使用，所有替换都不会产生修订标记，用户无法撤销单处修改。

**校对中唯一的修复工具是 `proofreadBatch`（内含 replaceRange）。** 无论什么情况，一律通过 `proofreadBatch` 修复。

违规后果：用户无法在"审阅 > 修订"中看到修改记录 → 校对结果不可追溯。

## 铁律 2：禁止跳过段落

**每段都必须经过 `proofreadBatch` 检查。** 仅用 `getDocumentParagraphs` 看一遍不算做校对。

禁止跳过任何段落，包括但不限于：
- ❌ "这是目录区，不需要校对"
- ❌ "这是标准模板，不需要校对"
- ❌ "这页只有图片占位符，不需要校对"

## 铁律 3：报告只能在全部批次完成后生成

进度未达到 N/N 前，不得生成校对报告。

---

## 分批校对计划表（执行第一个工具前必须输出）

```
分批校对计划
══════════════
文档总段数:    XX
每批段数:      200
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
├──────────────────────────────────────────────────────────┤
│ 第2步：循环调用 proofreadBatch（batch = 1 到 N）          │
│   proofreadBatch(start, end)                              │
│   每批完成后输出 [batch/N] ✓                              │
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
```

### Step 2: 循环调用 proofreadBatch

```javascript
// 逐批调用，每批自动完成获取→校对→修复全流程
wps_office_execute({
  tool_name: "proofreadBatch",
  arguments: {
    start_paragraph: 1,
    end_paragraph: 200
  }
})
// 返回示例：
// 📦 批次 1-200（200/9652 段）校对完成
//    发现 3 个问题，修复 2 个
//    （1 个口语化建议已跳过）
//    详情：
//      ✅ "了了" → "了" [重复字符] (位置 182350)
//      ✅ "的的" → "的" [重复字符] (位置 182500)

// 每批完成后输出 [batch/N] ✓
// 然后继续下一批，直到 N/N
```

### Step 3: 生成校对报告

报告写入文档同目录的 `{文档名}.校对报告.md`。

### Step 4: 收尾

1. 提示用户 Ctrl+S 保存文档
2. 告知可在"审阅 > 修订"中查看修改记录
3. 如需撤销可在"修订"选项卡中选择接受/拒绝

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
