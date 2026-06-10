---
name: wps-proofread
description: "WPS 文档校对专家，专注于文档的错别字检测、语病检查、格式一致性校对。当用户说'校对'、'审校'、'检查错别字'、'proofread'、'审阅'、'帮我检查文档'时使用此 skill。不处理排版、字体、表格插入、模板填写等 Word 编辑操作。"
---

# WPS 文档校对专家

你唯一的职责：**校对文档**。不做任何排版、字体、表格、模板填写等操作。

## 校对专用工具（6 个，可直接用，无需 search）

| # | 工具 | 调用方式 | 功能 |
|---|------|---------|------|
| 1 | `enableTrackChanges` | `wps_office_execute({ tool_name: "enableTrackChanges", arguments: { enable: true } })` | 开启/关闭修订模式 |
| 2 | `getTrackChangesStatus` | `wps_office_execute({ tool_name: "getTrackChangesStatus", arguments: {} })` | 查看修订状态 |
| 3 | `proofreadBasic` | `wps_office_execute({ tool_name: "proofreadBasic", arguments: { text, startOffset } })` | 零 token 基础校对。text 过长或含 `\f` 时可用 `file_path` 代替 |
| 4 | `confirmBatchAiProofread` | `wps_office_execute({ tool_name: "confirmBatchAiProofread", arguments: {} })` | **强制调用**：确认本批 AI 智能校对已完成 |
| 5 | `replaceInParagraph` | `wps_office_execute({ tool_name: "replaceInParagraph", arguments: { paragraphIndex, findText, replaceText, replaceAll? } })` | **唯一允许的修复工具**，按段落+文本匹配替换 |
| 6 | ~~`replaceRange`~~ | **禁止使用** | ~~按字符范围替换（偏移量在含不可见字符的文档中不可靠，已禁用）~~ |

> **⚠️ 校对流程中强制走网关**：以下 6 个工具在 `batchStarted=true` 后**禁止直接调用 MCP 原接口**，必须通过 `wps_office_execute({ tool_name: "...", ... })` 调用：
> - `getActiveDocument` / `insertText` / `getActiveWorkbook` / `getCellValue` / `setCellValue` / `getActivePresentation`
>
> 直接调用原接口会被插件拦截并报错。

### 辅助工具（通过 search 获取）

| 工具 | search 关键词 | 用途 |
|------|-------------|------|
| `getDocumentParagraphs` | `段落` | 按段落范围获取文本内容，解析 [start-end] |
| `getDocumentTextByRange` | `文本 偏移` | 按字符偏移读取原始文本（替代手动拼接） |
| `getDocumentStats` | `统计` | 获取文档字数/页数统计 |
| `getParagraphPageInfo` | `段落 页码 行号 位置` | 将段落索引转为页码+行号（用户对话/报告中使用 `第x页第x行` 格式） |

---

## 两层并行校对架构

每批段落同时运行两层检测（基础校对 + AI 智能校对），结果合并去重后统一修复：

```
               ┌──────────────────────┐
               │  getDocumentTextByRange │
               │  (本批精确文本)       │
               └──────┬───────────────┘
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
    ┌────────────┐       ┌──────────────┐
    │ Layer 1    │       │ Layer 2      │
    │ 基础校对    │       │ AI 智能校对   │
    │ proofread  │       │ LLM 语义分析  │
    │ Basic      │       │ 逻辑/语病     │
    │ 零 token   │       │ 按需 token    │
    └─────┬──────┘       └──────┬────────┘
          │                     │
          └────────┬────────────┘
                   ▼
          ┌────────────────────────┐
          │ Layer 2 确认（强制）    │
          │ confirmBatchAiProofread │
          │ 插件规则 10 强制拦截    │
          └───────────┬────────────┘
                      ▼
          ┌────────────────┐
          │ 结果合并去重     │
          │ 按 offset+原文  │
          └───────┬────────┘
                  ▼
          ┌────────────────────────┐
          │ 统一修复（仅允许）      │
          │ replaceInParagraph      │
          │ (修订模式跟踪)          │
          └────────────────────────┘
```

### Layer 1：基础校对（`proofreadBasic`）

- **方式**：正则规则匹配（错别字、重复字、冗余、格式一致性）
- **范围**：中英文文本
- **特点**：零 token，纯正则，极快
- **输出**：`{ issues: [{ type, offset, length, original, suggestion, reason }] }`

### Layer 2：AI 智能校对（Agent LLM）

- **方式**：你（作为 AI agent）直接分析本批文本
- **范围**：语义、逻辑、语病、上下文一致性、专业术语拼写
- **特点**：消耗 token，但能发现规则无法覆盖的问题
- **输出**：结构化的 issue 列表（必须包含 offset、original、suggestion）
- **方法**：
  1. 将本批文本逐段传递给 LLM（你是 AI，可以直接在你的上下文中分析）
  2. 要求输出严格格式：`[{ "paragraph_index": 1, "offset_in_paragraph": 23, "original": "...", "suggestion": "...", "reason": "..." }]`
  3. 将段落内偏移转换为文档绝对偏移（根据 getDocumentParagraphs 返回的段落 [start] 计算）
  4. 与 Layer 1 的结果合并去重

**注意**：两层**并行运行**——先获取本批文本，然后调用 `proofreadBasic` 的同时你分析文本做 AI 校对，最后合并结果。

### 结果合并去重逻辑

```javascript
// 合并各层结果
const allIssues = [
  ...proofreadBasicResult.issues,
  ...aiProofreadIssues
]
// 按 offset + original 去重（同一位置同一原文只修一次）
const seen = new Set()
const deduped = allIssues.filter(issue => {
  const key = `${issue.offset}|${issue.original}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
// 按 offset 排序
deduped.sort((a, b) => a.offset - b.offset)
```

---

# ⚠️ 铁律（违反 = 本次校对作废）

### ⚠️ 铁律 0：位置描述永远用「第x页第x行」，禁止用「第x段」

**触发治理规则 P17 强制拦截**：`confirmBatchAiProofread` 前必须已调用 `getParagraphPageInfo`。

```javascript
// ✅ 正确：收集本批有问题的段落 → 调 getParagraphPageInfo → 用 page/line 汇报
const affectedParas = [...new Set(issues.map(i => paraOf(i.offset)).filter(Boolean))]
wps_office_execute({
  tool_name: "getParagraphPageInfo",
  arguments: { paragraphIndices: affectedParas }
})
// → 返回 locations: [{ paragraphIndex, pageNumber, lineNumber }]
// → 输出："第3页第12行：'发明了很多' → '发明了很多'（重复字符）"

// ❌ 错误：直接输出 "第3段：..." → P17 拦截，无法继续

// ⚠️ 若 getParagraphPageInfo 返回 pageNumber=null（WPS COM 不支持该 API）：
// 可在说明中注明"WPS 不支持页码查询"，然后使用段落索引作为后备
```

**治理插件强制执行**：没调 `getParagraphPageInfo` 就调 `confirmBatchAiProofread` → P17 直接报错拦截。

---

## 铁律 1：findReplace 和 replaceRange 严禁用于校对修复

**`findReplace` 不支持修订模式跟踪。** 一旦使用，所有替换都不会产生修订标记，用户无法撤销单处修改。

**`replaceRange` 完全禁用。** 偏移量在含不可见字符（`\f` 分页符、`\a` 制表符、`\u0007` BEL 等）的文档中不可靠。测试表明偏移量偏差可达 20+ 字符，导致替换到错误位置、段落复制、文档段数膨胀等严重损坏。

**唯一允许的修复工具：✅ `replaceInParagraph`** — 通过段落索引 + 文本匹配替换，不受域代码/分页符等偏移量干扰。

违规后果：使用 `replaceRange` → 文档损坏 → 段数膨胀 → 校对结果不可追溯。

## 铁律 2：禁止跳过段落

**每段都必须经过 `proofreadBasic` 检查。** 仅用 `getDocumentParagraphs` 看一遍不算做校对。

禁止跳过任何段落，包括但不限于：
- ❌ "这是目录区，不需要校对"
- ❌ "这是标准模板，不需要校对"  
- ❌ "这页只有图片占位符，不需要校对"

**唯一例外**：有些段落只有一张图片（如 `/`、`//` 等占位符标记），调用 `proofreadBasic` 传入会返回无问题，可以继续，但**仍需调用**。

## 铁律 3：必须逐批调用 proofreadBasic（插件强制），禁止视觉判断跳过

对于每批段落，**必须在获取后调用 `proofreadBasic`**。仅获取段落文本肉眼检查 ≠ 完成校对。

**⚠️ P12/P14 插件强制拦截：**
- 若 AI 不调 `proofreadBasic` 就直接调 `confirmBatchAiProofread` → P14 拦截
- 若 AI 不调 `proofreadBasic` 就获取下一批 → P12 拦截
- 两种情况下插件都会直接报错，AI 无法绕过

**🚫 禁止行为（来自真实用户反馈）：**
- ❌ "This batch looks fine. Let me continue with the next batch." — 视觉判断不算校对！
- ❌ `getDocumentParagraphs` → 看几眼 → `confirmBatchAiProofread` → 跳过 — proofreadBasic 从未被调用
- ❌ 认为"这是模板段落，不需要校对"

**✅ 正确流程：**
```
获取段落 → proofreadBasic → confirmBatchAiProofread → replaceInParagraph 修复 → 更新进度
```

**对 AI 的强制要求**：每批**必须完整走完** `proofreadBasic` → `confirmBatchAiProofread` → `replaceInParagraph`（如有问题）→ `getDocumentParagraphs`（下一批）的完整链条。任何跳过 proofreadBasic 的行为都会触发治理插件拦截。

### 为什么不能跳过 proofreadBasic？—— 模型能力边界

你不是校对专家，你是一个通用 LLM。你有两个根本短板：

1. **幻觉倾向** — 你"觉得"某个字错了就改了，但可能原文是对的。`proofreadBasic` 用纯正则规则匹配，零幻觉，是客观基准线。
2. **成本不敏感** — 你为了省几秒调用时间跳过 proofreadBasic，结果把正确内容改错。用户花几小时返工检查。
3. **自我确认陷阱** — 你既是"发现问题的 AI"又是"确认完成的 AI"（`confirmBatchAiProofread`），这个单点必须由 `proofreadBasic` 的外部工具结果来制衡。

**P15/P16 插件强制隔离：**
- P15：`proofreadBasic` 说本批没问题 → 你最多只能修 1 处，再修就要 `_force_ai_fix`
- P16：`proofreadBasic` 说有问题 → 你的修复必须与它找到的问题匹配，新编的问题会被拦截

**本质上，治理插件强制你做"校对"而不是"创作"。**

## 铁律 4：目录段落禁止校对、禁止修改

**目录是自动生成的，修改正文后目录会自动更新。** 目录的作用只是作为发现正文问题的线索。

### 4a. 目录列出的编号异常 → 去正文查找并修改，不要动目录

例如目录显示：
```
3.1 信息安全标准          11
3.2 本项目专用标准        12
```
而前面章节为 `3.1 网络质量控制`、`3.2`... `3.6`，说明正文中 `3.1/3.2` 编号重复：
- ✅ 去正文找到 `3.1 信息安全标准` 改为 `3.7 信息安全标准`，目录会自动更新
- ❌ 直接在目录中把 `3.1` 改为 `3.7`（目录同步后会被覆盖）

### 4b. 目录段落不进入校对流程

`getDocumentParagraphs` 返回中 style 含 "目录" 的段落，**跳过 `proofreadBasic`**：
- 不检查目录段落的错别字（自动生成，即使有文字问题也是从正文来的）
- 不修复目录段落的任何内容
- 目录段落的编号异常 → 去正文对应章节修复

### 4c. P18 强制执行

治理插件 P18 规则：`replaceInParagraph` 目标段落 style 含 "目录" → 拒绝。

---

## 铁律 5：报告只能在全部批次完成后生成

进度未达到 N/N 前，不得生成校对报告。

---

## ⚠️ 批次大小限制（硬性规则）

**`getDocumentParagraphs` 的 end_paragraph - start_paragraph + 1 不得超过 200。**
即每批最多请求 200 段。禁止一次性请求 500、1000 甚至 1600 段。

违规后果：请求过多段落会导致 COM 调用超时（即使 30s 也不够），浪费时间和 token。

## 分批校对计划表（执行第一个工具前必须输出）

```
分批校对计划
文档总段数:    XX
每批段数:      200（每批最多 200 段，不得超过）
总批次数:      ceil(XX / 200)
当前进度:      0 / N
```

**注意：计划表必须用纯文本，不要用 ═══ 等装饰字符画框。** 模型在生成装饰字符时可能输出无限长的线条，导致侧边栏卡死。

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
│ │     ⚠️ 首次调用 start_paragraph=1           │           │
│ │ 2b. 取本批第一段的 [start] 做 startOffset   │           │
│ │    getDocumentTextByRange 取精确文本         │           │
│ │ 2c. ⚡ 两层并行校对 ⚡                      │           │
│ │    ├─ proofreadBasic (正则基础校对)          │           │
│ │    └─ AI 智能校对 (LLM 语义分析)            │           │
│ │ 2c-2. 🔒 confirmBatchAiProofread（强制）    │           │
│ │ 2d. 结果合并去重                             │           │
│ │ 2e. 按段落逐条 → replaceInParagraph 修复     │           │
│ │ 2f. getTrackChangesStatus 确认修订数增加     │           │
│ │ 2g. 输出 [batch/N] ✓                       │           │
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

**⚠️ 首次调用必须从第 1 段开始。** 插件强制校验：若 `lastBatchParaIndex === 0` 时 `start_paragraph !== 1` 则直接拒绝。

```javascript
wps_office_execute({
  tool_name: "getDocumentParagraphs",
  arguments: {
    start_paragraph: (batch - 1) * 200 + 1,  // 第1批: start=1
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

> **🚨 硬性规则：必须用 `file_path` 传文本给 proofreadBasic，禁止用 `text` 参数！**
>
> **为什么？** Word 文档中的分页符（`\f`, 0x0C）、表格分隔符（`\a`, 0x07）、智能引号（`\u201c`/`\u201d`）在 JSON-RPC 传输时会导致"JSON Parse error: Unterminated string"——这是一个**已知的、无法在代码层面彻底解决**的 MCP 协议层问题（控制字符通过 JSON 传输时会被损坏或导致解析失败）。
>
> 唯一可靠的解决方案：**永远不走 JSON，通过文件传递**。
>
> **正确做法（每批必须执行）：**
> ```javascript
> // 1. 用 bash 将文本写入临时文件
> wps_office_execute({
>   tool_name: "getDocumentTextByRange",
>   arguments: { startOffset: batchStartOffset, length: rangeLength }
> })
> // → 返回 text, 不要直接用这个 text 调 proofreadBasic！
>
> // 2. 用 bash 写入临时文件
> bash: Set-Content -Path $env:TEMP\batch.txt -Value (要用到的文本) -Encoding utf8
>
> // 3. 传 file_path
> wps_office_execute({
>   tool_name: "proofreadBasic",
>   arguments: { file_path: "$env:TEMP\\batch.txt", startOffset: batchStartOffset }
> })
> ```
>
> **⚠️ 注意**：`Out-File -Encoding utf8` 会写入 BOM (UTF8-BOM)，MCP 的 proofread 处理器会自动跳过 BOM 前 3 字节，所以用 `Out-File` 或 `Set-Content` 均可。

**注意：禁止手动拼接段落文本（如 `paragraphs.map(...).join('\n')`）。**
**手动拼接会跳过空段落，导致 text.length 与本批字符范围不匹配，被插件拒绝。**

**2c. ⚡ 两层并行校对**（同时调用，无需先后等待）

```javascript
const batchText = "..."  // getDocumentTextByRange 返回的文本
const batchStartOffset = ...  // 本批第一段 [start]

// 调用 proofreadBasic 的同时，你分析文本做 AI 校对（并行执行）：
```

**2c-2. 🔒 确认 AI 校对完成（强制插件规则 10）**

```javascript
// 两层校对都完成后，必须调用 confirmBatchAiProofread 确认
// 插件规则 10 强制拦截：未确认前禁止任何 replaceInParagraph 调用
wps_office_execute({
  tool_name: "confirmBatchAiProofread",
  arguments: {}
})
// 返回：AI 智能校对已确认完成。
```

**违反后果：插件直接拒绝 replaceInParagraph，报错提示必须先完成 AI 校对。**

**Layer 1 — 基础校对（正则）：**
```javascript
wps_office_execute({
  tool_name: "proofreadBasic",
  arguments: { text: batchText, startOffset: batchStartOffset }
})
// 返回 issues: [{ type, offset, length, original, suggestion, reason }]
```

**Layer 2 — AI 智能校对（你作为 LLM 直接分析）：**
```markdown
用你的 LLM 能力分析以下文本的语义/逻辑/语病问题。
特别注意检查：
- 占位/测试文本（如 "check test sample placeholder xxx" 等）
- 明显口语化表达（正式文档中不应出现的随意用语）
- 语病/逻辑矛盾
- **编号连续性**：跨段落检查编号是否重复（如两个段落同为 "2.2.3"）、是否跳号、是否倒序
输出严格 JSON 数组（如无问题则输出空数组 []）：
[
  {
    "paragraph_index": 1,
    "offset_in_paragraph": 0,
    "original": "有问题文本",
    "suggestion": "修正文本",
    "reason": "语病说明"
  }
]

文本内容：
```
（将 batchText 逐段传入）
```
```

将 AI 校对输出的段落内偏移换算为文档绝对偏移：
```
documentOffset = paragraphStartOffset + offsetInParagraph
// paragraphStartOffset 从 getDocumentParagraphs 输出中获取
```

**插件强制校验（违反即拒绝）：**
- startOffset 必须等于本批第一段的 `[start]`
- 文本不能为空且不能明显过短（≥20 字符）
- 每批只准调 1 次 proofreadBasic（禁止拆子块）

**注意**：插件不再要求 `text.length` 精确等于 `[end]-[start]`。因为 WPS COM 的 `Range.Text` 在含 `\f`(分页符)、`\a`(表格分隔符)等控制字符的文档中，返回长度可能与段落偏移计算值不一致。proofreadBasic 内部会自动剥离控制字符并校正偏移量。

**如果文本含控制字符导致 JSON 序列化失败**（错误：`JSON Parse error: Unterminated string`），请先用 `bash` 写入临时文件再传 `file_path`：
```javascript
// 写法 1：直接传 text（文本不含 \f 等控制字符时）
wps_office_execute({
  tool_name: "proofreadBasic",
  arguments: { text: batchText, startOffset: batchStartOffset }
})

// 写法 2：通过文件传 text（文本含 \f 等控制字符时）
// 先用 bash 写入文件，再传 file_path
wps_office_execute({
  tool_name: "proofreadBasic",
  arguments: { file_path: "C:\\Users\\...\\batch.txt", startOffset: batchStartOffset }
})
```

**2d. 结果合并去重**

```javascript
// 合并两层结果
const layer1 = responseProofreadBasic.issues || []      // { original, offset, length, suggestion, type }
const layer2 = aiProofreadIssues || []                  // { original, offset, suggestion, reason }

const allIssues = [
  // Layer 1: 基础校对
  ...layer1.map(i => ({ ...i, source: 'mcp' })),
  // Layer 2: AI 校对
  ...layer2.map(i => ({ ...i, type: 'ai', source: 'ai' })),
]

// 按 offset + original 去重
const seen = new Set()
const deduped = allIssues.filter(i => {
  const key = `${i.offset}|${i.original}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
}).sort((a, b) => a.offset - b.offset)
```

**注意**：如果 AI 校对输出的 `original` 与正则发现同一问题，`key` 相同会被去重，不会重复修复。

**2e. 修复（禁用 findReplace 和 replaceRange，仅用 replaceInParagraph）：**

**⚠️ 两层返回的都是 offset 偏移量，而 replaceInParagraph 需要段落索引 + 文本匹配。**
需要将 issue.offset 映射为段落索引 + 查找文本。

**映射方法 1：从 getDocumentParagraphs 返回的 [start-end] 中查找 offset 所在的段落。**
```javascript
// 从 getDocumentParagraphs 输出中解析段落范围
// [1] (正文) [0-43]     → 第1段：0-43
// [2] (正文) [44-89]    → 第2段：44-89
// ...

// 对每个 issue，找到 offset 落在哪个段落的 [start-end] 范围内
function findParagraph(ranges, offset) {
  return ranges.find(r => offset >= r.start && offset < r.end)
}

for (const issue of sortedResults) {
  const para = findParagraph(ranges, issue.offset)
  if (para) {
    wps_office_execute({
      tool_name: "replaceInParagraph",
      arguments: {
        paragraphIndex: para.index,
        findText: issue.original,
        replaceText: issue.suggestion
      }
    })
    // 每修一条建议调用 getTrackChangesStatus 确认修订数增加
    wps_office_execute({
      tool_name: "getTrackChangesStatus",
      arguments: {}
    })
    // 确认修订数相比之前增加了
  }
}
```

**映射方法 2：用 findInDocument 查找偏移量对应的段落索引。**
```javascript
// 用 findInDocument 确定 offset 对应的段落索引
wps_office_execute({
  tool_name: "findInDocument",
  arguments: { text: issue.original }
})
// 从返回结果的 paragraphIndex 确定段落号
```

**2e-2. ⚡ 段落索引 → 页码/行号转换（用户友好位置报告）**

**AI 描述问题位置时，永远用 `第x页第x行` 格式，禁止用 `第x段`。** 用户在 WPS 文档中无法通过段落编号定位。

```javascript
// 收集本批所有有问题的段落索引
const affectedParagraphs = [...new Set(deduped.map(i => {
  const para = findParagraph(ranges, i.offset)
  return para ? para.index : null
}).filter(Boolean))]

// 调用 getParagraphPageInfo 批量转换为页码/行号
const pageInfo = wps_office_execute({
  tool_name: "getParagraphPageInfo",
  arguments: { paragraphIndices: affectedParagraphs }
})
// 返回: { data: { locations: [{ paragraphIndex, pageNumber, lineNumber }] } }

// 构建 lookup 表 paraIndex → { page, line }
const locMap = {}
for (const loc of pageInfo.result.data.data.locations) {
  locMap[loc.paragraphIndex] = `第${loc.pageNumber}页第${loc.lineNumber}行`
}

// 汇报问题时使用 page/line 格式：
// "第3页第12行：'发明了很多' → '发明了很多'（重复字符）"
```

**2f. 更新进度：**

输出 `[batch/N] 批次完成 ✓`

**2g. 修订数验证（批次间强制检查）：**

每批修复完成后调用 getTrackChangesStatus 确认修订总数：
```javascript
wps_office_execute({
  tool_name: "getTrackChangesStatus",
  arguments: {}
})
// 输出应显示：修订模式: 已开启\n当前修订数量: XX
// 确认 XX 相比本批开始时增加，且与本批修复条数一致
```

### Step 3: 生成校对报告

**🚨 关键警告：禁止在生成报告时花费大量 Token 思考格式！**
- 你已完成所有校对工作，**报告格式本身不是校对的一部分**
- 最多用 1 次思考列出问题清单，然后立刻用 `write` 工具写入文件
- 如果花了 >30 秒思考报告格式，说明你在浪费时间，请立即停止并写入

报告写入文档同目录的 `{文档名}.校对报告.md`。

**推荐做法：用 `write` 工具直接写入，禁止在自己的输出内容中先生成报告再复制。**

格式可以是简单列表（不必做表格），关键是把所有问题列全：

```
# 校对报告

文档：{文档名}
校对时间：{时间}
总字数：{字数}
修订总数：{修订数}

## 发现的问题

1. 第{页}页第{行}行：「{原文}」→「{修改为}」（{问题类型}）
2. ...
```

**统计摘要也简化：**

```
- 基础校对：N 处
- AI 校对：N 处
- 合计：N 处
- 全部已修复
```

**严禁行为：**
- ❌ 先在自己的思考中反复排版报告再复制（→ 导致模型死循环，卡 84 分钟）
- ❌ 在用户对话中输出报告完整内容后再写文件（→ 浪费上下文）
- ✅ 直接调用 `write` 将报告写入文件，只在对话中提示"报告已生成"

> **如果发现自己卡在报告生成的思考中 → 立即终止思考，以最简格式写入文件。**

### Step 4: 收尾

1. 提示用户 Ctrl+S 保存文档
2. 告知可在"审阅 > 修订"中查看修改记录
3. 如需撤销可在"修订"选项卡中选择接受/拒绝

---

## 常见问题

### 0. 生成报告时卡死（模型思考超长）怎么办？

**症状**：所有批次校对完成，但在生成校对报告时模型思考了数分钟甚至数十分钟。

**原因**：你的上下文已非常大（3 批校对的所有工具调用 + 思考），模型在"构思报告格式"时发生死循环。

**立刻解决**：
1. **终止当前思考**
2. 不要排版，直接用最简格式写文件：
   ```
   # 校对报告\n\n1. 第X页第X行：修正内容\n...
   ```
3. 调用 `write` 工具写入，不要在对话中输出完整报告

### 1. getDocumentParagraphs(200) 超时怎么办？

COM 超时已从 5s 增加到 30s（MCP v2.2+），200 段应对大多数文档已足够。

如果仍然超时，允许将单批段数从 200 降至 100（不能再低）。

调整后必须在分批计划表中注明，如 `每批段数: 100（COM 超时限制）`。

### 2. 标题中的多余字符

标题错字（如 `.总监理工程师资质证书` 多了前导点）优先用 `replaceInParagraph`（根据段落索引+文本匹配），**不可用 `findReplace`**。

### 3. 替换后如何确认修订跟踪生效？

修正后可调用 `getTrackChangesStatus` 查看修订数量是否增加。

### 4. 子 agent 代理处理剩余批次时如何避免状态丢失？

**不要直接用 task agent 代理后续批次**，除非你显式传递当前修订计数：

```javascript
// ❌ 错误：子 agent 不知道已有修订数，getTrackChangesStatus 从 0 开始
// ✅ 正确：在 task prompt 中写明 "当前修订数: XX，请在此基础上继续"
```

插件状态（`lastBatchParaIndex`、`batchStarted` 等）在子 agent 的新会话中**不会继承**。子 agent 必须：
1. 从当前已完成的 `lastBatchParaIndex + 1` 继续
2. 在 prompt 中写明当前 `getTrackChangesStatus` 修订数
3. 每次 `getDocumentParagraphs` 后的修订数增量验证仍须做

---

## 插件强制校验

`.opencode/plugin/governance.js` 会在运行时自动拦截所有 `wps_office_execute` 调用并执行以下校验。违反会直接报错，AI 无法绕过：

### 校对专用规则（P1-P18）

| # | 规则 | 拦截点 | 拦截条件 |
|---|------|--------|---------|
| P1 | 批次大小 ≤200 | `getDocumentParagraphs` | 请求 >200 段 |
| P2 | 批次连续性 + 首次从第1段开始 | `getDocumentParagraphs` | 首次调用 start≠1，或跳跃（不从上一批+1开始） |
| P3 | 必须先出分批计划 | `proofreadBasic` | 未先调 `getActiveDocument` + `getDocumentParagraphs` |
| P4a | **replaceRange 完全禁用** | `replaceRange` | **任何分批校对流程中调用 replaceRange** |
| P4b | findReplace 禁用 | `findReplace` | 分批校对流程中调 findReplace |
| P5 | startOffset 与段落 [start] 一致 | `proofreadBasic` | startOffset ≠ 本批第一段 [start] |
| P6 | 文本不能为空或过短 | `proofreadBasic` | text.length < 20 字符 |
| P6b | 文本不能过大（防批量校对） | `proofreadBasic` | text.length > 本批预期范围 × 2 |
| P7 | 每批只准调 1 次 proofreadBasic | `proofreadBasic` | 同一批第 2 次调 proofreadBasic |
| P8 | 先校对再修复 | `replaceInParagraph` | 同一批未先调 `proofreadBasic` |
| P9 | replaceInParagraph 须在校对批次内 | `replaceInParagraph` | paragraphIndex 超出本批段落范围 |
| **P10** | **必须先确认 AI 校对** | `replaceInParagraph` | **未先调 `confirmBatchAiProofread`** |
| **P11** | **必须先开修订模式** | `replaceRange` / `replaceInParagraph` / `findReplace` | 未先调 `enableTrackChanges(true)` |
| **P12** | **当前批校对周期完成后才能获取下一批** | `getDocumentParagraphs` | (1) 本批未调 `proofreadBasic`; (2) 已调但未调 `confirmBatchAiProofread`; (3) 有校对问题但未调 `replaceInParagraph` |
| **P13** | **getDocumentTextByRange 限本批范围** | `getDocumentTextByRange` | `length` > 本批预期范围 × 2 |
| **P14** | **confirmBatchAiProofread 前必须 proofreadBasic** | `confirmBatchAiProofread` | 本批未先调 `proofreadBasic` |
| **P15** | **基础校对无问题禁止 AI 自行大量修复** | `replaceInParagraph` | `proofreadHadIssues=false` 且 AI 修复次数超限（≤1 次） |
| **P16** | **替换内容与已知 issue 交叉校验** | `replaceInParagraph` | `findText` 不匹配任何 issue 的 `original` 原文 |
| **P17** | **描述位置必须用「第x页第x行」** | `confirmBatchAiProofread` | 本批未先调 `getParagraphPageInfo` |
| **P18** | **目录段落禁止修改** | `replaceInParagraph` | 目标段落样式含"目录" |

### 通用执行规则（G1-G7，始终生效）

| # | 规则 | 拦截点 | 拦截条件 |
|---|------|--------|---------|
| **G1** | **所有双路径工具强制走网关** | `wps_get_active_document` 等 6 个 | 直接调 MCP 原接口 |
| **G2** | **wps_execute_method 白名单** | `wps_execute_method` | method 不在白名单中 |
| **G3** | **写操作前必须先读** | `setCellValue` / `setFormula` / `insertText` 等 | 未先调对应读工具 |
| **G4** | **破坏性操作需确认** | `deleteSheet` / `deleteSlide` / `clearRange` 等 | 未传 `confirm: true` |
| **G5** | **文件路径安全** | 含 `filePath` 参数的工具 | 路径含 `..` 穿越符号 |
| **G6** | **密码参数保护** | `protectSheet` / `unprotectSheet` / `protectWorkbook` | 密码已脱敏记录 |
| **G7** | **参数范围校验** | 行号/列号/索引从 1 开始 | 传入 `≤0` 的值 |

**规则 10 说明**：proofreadBasic（基础校对）和 AI 智能校对（LLM 语义分析）两层都完成后，必须调用 `confirmBatchAiProofread` 确认，插件才会放行 `replaceInParagraph`。这确保不会出现"只做了基础校对就修"的漏检情况。

**P14 说明**：`confirmBatchAiProofread` 前必须已调 `proofreadBasic`，防止 AI 跳过基础校对直接确认。如本批 `proofreadBasic` 未调用就调 `confirmBatchAiProofread`，P14 会拦截报错。

**P15 说明**：当 `proofreadBasic` 返回 0 个问题（`proofreadHadIssues=false`），AI 最多允许自行修复 1 处（用于 AI Layer 2 确实发现的问题）。超过后必须传 `_force_ai_fix: true` 强制放行。这防止 AI 在基础校对无问题的情况下大量"编造"不存在的校对问题。

**P16 说明**：当 `proofreadBasic` 返回了问题列表，`replaceInParagraph` 的 `findText` 必须与至少一条 issue 的 `original` 原文匹配（子串匹配即可）。如 `findText` 与任何已知 issue 都不匹配，说明 AI 在修复基础校对未发现的问题，P16 拦截。如需强制修复需传 `_force_ai_fix: true`。

**规则 2a 说明**：首次 `getDocumentParagraphs` 必须从第 1 段开始。若 `lastBatchParaIndex === 0` 时 `start_paragraph !== 1`，插件直接拒绝。这是为了防止从文档中间开始校对导致遗漏。

这意味着 SKILL.md 中的分批规章现在有代码层强制执行，AI 无法绕过。
- 规则 P2a 通过 `tool.execute.before` 校验 `lastBatchParaIndex` 实现
- 规则 P5 通过 `tool.execute.after` 从 `getDocumentParagraphs` 输出中解析段落 `[start-end]` 实现
- 规则 P6 为宽松阈值（≥20 字符），不要求精确匹配长度
  - 因为 WPS COM `Range.Text` 在含 `\f` `\a` 等控制字符时返回长度可能短于预期
  - proofreadBasic 内部会自动剥离控制字符、校正偏移量
- 必须使用 `getDocumentTextByRange` 获取精确文本（或用 `file_path` 备选方案）
- **`replaceRange` 彻底禁用**（偏移量在含不可见字符文档中不可靠，见测试日志）

### 通用执行规则说明

- **G1（网关强制）**：`wps_get_active_document`、`wps_insert_text`、`wps_get_active_workbook`、`wps_get_cell_value`、`wps_set_cell_value`、`wps_get_active_presentation` 这 6 个工具**全程禁止直接调用 MCP 原接口**，永远必须走 `wps_office_execute` 网关。
- **G3（读前必写）**：任何写操作（`setCellValue`、`setFormula`、`insertText`、`deleteSlide` 等）前，必须先调用对应的读工具获取文档状态（`getActiveDocument` / `getActiveWorkbook` / `getActivePresentation`）。这防止 AI 在不了解文档结构的情况下盲目修改。
- **G4（破坏性操作确认）**：`deleteSheet`、`deleteSlide`、`deleteRows`、`clearRange` 等会永久删除内容的操作，必须显式传 `confirm: true`。这确保 AI 不会悄无声息地删东西。
- **G7（参数范围）**：所有行号/列号/幻灯片索引/段落索引自动校验 ≥ 1，防止 off-by-one 错误损坏文档。

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
