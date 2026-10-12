---
name: wps-proofread
description: "WPS 文档校对专家，专注于文档的错别字检测、语病检查、格式一致性校对。当用户说'校对'、'审校'、'检查错别字'、'proofread'、'审阅'、'帮我检查文档'时使用此 skill。不处理排版、字体、表格插入、模板填写等 Word 编辑操作。"
---

# WPS 文档校对专家

唯一职责：**校对文档**（检测 + 修复）。不做排版/字体/表格/模板填写。

## 本流程工具清单一览（Issue #382：一次说清「直连 / 走网关 / 不存在」）

**调用方式由工具**本身**决定，不由「批次开始前后」决定**（旧版「`batchStarted` 后必须走网关」是历史双路径残留，已删除）：

| 类别 | 工具 | 怎么调 |
|---|---|---|
| **直接调用** | `wps_get_active_document` | 内置工具，直接调（取 `name`/`path`/`wordCount`） |
| **直接调用** | `wps_word_proofread_basic` / `wps_word_confirm_batch_ai_proofread` / `wps_word_proofread_accumulate` / `wps_word_generate_proofread_report` | 注册工具（**PS1 无同名分支 ⇒ 直连注册**，schema 原样可见），直接调 |
| **直接调用** | `wps_word_enable_track_changes` / `wps_word_get_track_changes_status` / `wps_word_replace_in_paragraph` / `wps_word_get_paragraphs` / `wps_word_get_document_text_by_range` | 注册工具（有 PS1 实现），直接调 |
| **走网关** | 其余 COM Actions（数量以 `wps_office_search({query:''})` 为准） | 先 `wps_office_search` 找，再 `wps_office_execute({ tool_name, arguments })` |
| **不存在** | 任何未在上表、也未经 `wps_office_search` 确认的名称 | **禁止调用**（禁编造） |

> ⚠️ 上表即**本流程的完整工具面**（与 `docs/SKILLS.md` 的「两级网关规范」同口径，不各写一套）。
> `arguments` **必须是对象**（禁 JSON 字符串）。`wps_office_search` 是**关键词匹配（无语义）**——
> 猜错词会得空结果；空结果会给出「换同义词 / 传空 query 列全量」的自纠提示，照做即可。

## 铁律

1. **只用 `wps_word_replace_in_paragraph` 修复**。`findReplace` 不支持修订跟踪，`replaceRange` 已移除，均禁用。
2. **禁止跳过段落**：每段都必须经 `wps_word_proofread_basic`，肉眼扫不算校对。
   - **例外（整块跳过）**：仅当本批**每一段**同时满足 ①属表格对象单元格 ②无正文叙述句（不以 `。！？` 收尾且非长成句陈述）时，可整块跳过（**全批覆盖**，无「半跳」）。任一存疑 → 一律不跳。
   - 跳过仍须：`wps_word_get_paragraphs` 取本批段落、上报进度、并在 `wps_word_proofread_accumulate` 携带 `skipped_segments: { count, ranges, reason }`（区间须**完整覆盖本批**且 `count` = 本批段数）。
3. **逐批 `wps_word_proofread_basic`**，禁止视觉判断跳过；不调即被插件拦截。
4. **报告只能在覆盖全文后生成**（`_processed_to_paragraph` ≥ totalParagraphs）。
5. **严禁 write 伪造报告**，必须由 `generateProofreadReport` 基于真实数据生成。
6. **从头至尾逐批完整校对**，禁止跳批 / 一次性拉多批。

## 批次大小限制

批次大小单源为 B，**`B = 200`**（服务端 `PROOFREAD_BATCH_MAX` 与治理 `MAX_PARAGRAPHS_PER_BATCH` 同值）：

```javascript
var B = 200;
start = (batch - 1) * B + 1; end = Math.min(batch * B, totalParagraphs);
```

每批固定 B 段，**禁止跳步加速**（一次拉 300+ 段）或合并批次。**单批即 200 段**，文本随批走；超长（或含 `\f` 等控制字符）时先 `writeFile` 落盘再传 `file_path`。**严禁用 shell 写中文临时文件**。

## 执行流程

**Step 0** 输出分批计划表（纯文本）：总段数 / 每批 B / 总批次数 / 进度。未输出即调工具 = 违规。
**Step 1** `enableTrackChanges(true)` + `getTrackChangesStatus` 确认。
**Step 2** 分批循环 batch = 1..N，每批走 2a→2h。
**Step 3** 全部完成 → `wps_word_generate_proofread_report`（直连）。
**Step 4** 提示用户 Ctrl+S 保存 + 在「审阅 > 修订」查记录。

## 每批子步骤（2a→2h，按序完整走完）

- **2a** `wps_word_get_paragraphs`：取本批 B 段，解析 `[start-end]` 与 `totalCount`（**首次 start=1**；批次以 `totalCount` 为准）。
- **2b** `wps_word_get_document_text_by_range` 取本批精确文本（禁手动拼接），取其 `start_offset` **作为本批 `baseOffset`**。
  ⚠️ **坐标一律以「实际取回的文本」为准，不以「请求长度」为准**（Issue #382）：返回体含 `requestedLength` / `returnedLength` / `truncated` / `docEndReached`。
  **`returnedLength ≠ requestedLength` 时，必须以实际取回的文本重新界定本批坐标**（`start_offset` 只作 `baseOffset`），
  禁止用「请求长度」当本批文本长度 —— 服务端按 `start_offset` 算 issue 绝对偏移，超返会让该批**尾部坐标整体漂移**（静默错误）。
  **`wps_word_proofread_basic` 必须传 `start_offset`（= 2b 的 `start_offset`，**仅作 `baseOffset`**，不是「本批长度」；两层硬门禁必填）**；缺省被当「本段相对偏移」⇒ issues 坐标静默错位不报错。
  ⚠️ 键名一律用 **`start_offset`（下划线）** —— 与 MCP schema（`proofread.ts`）/ 服务端 handler 同源；写驼峰 `startOffset` 服务端会以「缺少 start_offset」拒绝（Issue #395 CR1-1）。
- **2c** 两层并行：`wps_word_proofread_basic` + AI 语义分析（检测要点见下）；完成后 `wps_word_confirm_batch_ai_proofread({ ai_issue_count })`。
  ⚠️ `ai_issue_count` = **本批 AI 语义分析（Layer 2）产出的 issue 数**（**必传**；逐句已核但未命中传 `0`）。
  Issue #382：旧版该确认是**空签到**（恒返回「已确认完成」，无人验收 Layer2）⇒ 报告「AI 智能校对 0 处」与「AI 其实看出了病句」并存。
  现服务端**捕获本批 Layer 1 实测条数**并随 `ai_issue_count` 记入报告：报告新增「Layer 2 产出」节，逐批列出
  「Layer 1 实测 / Layer 2 申报」，**申报 0 但 Layer 1 命中 >0 的批次会被显式标出**（AI 看出的病句未变成 issue 的人工复核入口）。
  故 `ai_issue_count` 必须如实，不能整批恒填 0 —— 否则该节会如实记下漂移批次。
- **2d** 按 `offset + original` 去重，按 `fix_action` 分流：`fix` 进修复循环，`report_only` 只入报告。
- **2e** 对每条 `fix` 调 `wps_word_replace_in_paragraph`（必须遍历全部）：`{ paragraphIndex, findText, replaceText }`。`findText` 逐字取自本批原文；报「未找到」则回原文核对，宁标未修复不编造。
  ⚠️ **长段的 `findText` 必须用 `getDocumentTextByRange` 按段落偏移取全量原文**（Issue #382）——**禁止**用 `getDocumentParagraphs` 的段落文本：
  长段在那里被 200 字截断（会标「⚠️文本被截断…不可作为替换原文」），照抄必然「未找到」。**Layer 2 语义修复**（`original` 与 Layer 1 原文不匹配）被治理层 P3 替换内容校验拦时传 `_force_ai_fix: true` + `_ai_evidence` 走合法强制通道，勿静默降级 `report_only`。
  ⚠️ **走网关补传强制参数时，`arguments` 必须是**对象**（不是 JSON 字符串）**（Issue #420 会话实证：传字符串时 `_force_ai_fix` 被丢弃 →
  P3 反复拦同一处、AI 空转十数次仍无进展）。直连 `wps_word_replace_in_paragraph` 的 schema 不收该参数 ⇒ 强制通道**只能**走
  `wps_office_execute({ tool_name: 'replaceInParagraph', arguments: { …必须含 findText/paragraphIndex/replaceText + _force_ai_fix: true } })`。**同参重试无效即换通道，不得原地重试**。
- **2f** 输出 `[batch/N] ✓`。
- **2g** `wps_word_get_track_changes_status` 确认修订数增加（每次替换 = 2 条修订；问题数 = 修订数 ÷ 2）。
- **2h** `wps_word_proofread_accumulate`（**直连调用**，Issue #382）+ `issues` + `_processed_to_paragraph`（本批末段，严格递增、单批 ≤ B）+ `total_revisions`。
  - **无需 `session_id`**（Issue #382 已彻底删除）：会话身份由 `doc_info.filePath` **派生**。
  - `doc_info` **每批都必带**（它同时是会话身份）：`fileName` / `filePath` / `totalParagraphs` 取自 `wps_get_active_document`（或 `wps_office_execute('getActiveDocument')`）；
    `totalWords` = 其返回的 `wordCount`（**缺它报告会写「总字数: 未提供」**）。
  - `total_revisions` 传**本次新增的差值**（Issue #382）：`enableTrackChanges` 后立刻读一次基线，本批上报 = 当前值 − 基线值（文档可能自带历史修订，报总值会让「修订数 ÷ 2 ≈ 问题数」核对不可比）。

## AI 校对（Layer 2）

`wps_word_proofread_basic`（Layer 1）是客观基准线；LLM 同时做语义/逻辑/语病分析。检测：通顺度（成分/搭配/语序/句式/衔接）、简洁度（同义反复/填充词/可压缩从句）、编号连续性（跨段重复/跳号/倒序）。**不合理搭配须逐句给出命中/未命中结论**（禁笼统「已检查」）。**通顺 > 简洁**：简洁修复须过「删除后语义不变」自检，最多 1 轮，不通过则降级为「优化建议」。

**AI 输出字段（必填）**：`paragraphIndex` + 文档绝对 `offset` + `original` + `suggestion` + `type`（**必填合法类型**，禁写 `ai`；合法值 = `TYPE_METRIC_MAP` 的 key —— 六维分组：fluency(23) / conciseness(8) / accuracy(2) / consistency(2) / format(9) / completeness(1)，共 45 个中文类型词，如 `句式杂糅`/`冗余词`/`中英混排`/`占位文本`/`网络用语`/`编号不连续`；**写英文/未在表中的词会被判为「未分类」并在报告单列告警（不计六维）**——绝不静默改判到某个合法却错误的维度；若条目的 `original`/`suggestion` 命中兜底规则则先按内容推断，推断不出才落「未分类」）+ `metric` + `fix_action`（`fix`/`report_only`，须与实际是否修复一致）+ **`source`**（**必传**：Layer 2 自产条目传 `'ai'`，仅 Layer 1 正则命中传 `'mcp'`。缺省兜底为 `'mcp'` ⇒ 你找出的病句会被统计成「正则检出」，报告「AI 智能校对 0 处」与事实不符，Issue #420 会话实证）。**offset/length/original 自洽**：同一坐标系（原文 UTF-16 code unit），满足 `original === text.slice(offset, offset+length)`；定位改写只认 `offset` + `length`。`docOffset = 段落[start] + 段内偏移`。

**修复触发**：fluency 单维 0 分或总分 <6 → `fix`；6≤总分<8 → `report_only`。conciseness 冗余 ≥25% → `fix`；10%~25% → `report_only`。

## 报告生成（Step 3）

`wps_word_generate_proofread_report({ output_file })`（**直连调用**，Issue #382：**无需 `session_id`**，会话身份由文档路径派生）。
**首选方案 A：直接传 `output_file`**（= 文档同目录 `{文档名}.校对报告.md`）——服务端落盘并回收会话，返回体含 `success`。
方案 B（不传 `output_file`，取返回 `content` 再 `writeFile`）仅在方案 A 不可用时用；两种方案**报告均须落盘**，未落盘 = 本次校对未完成（Issue #420：会话**只在真正落盘后**回收，方案 B 后可改传 `output_file` 重试）。

## 常见问题

- **单批超时**：先同批重试（相同 start/end，最多 3 次）；仍超时可说明后临时缩批（B/2、B/4），严禁跳过或伪造进度。
- **重新校对**：`wps_get_active_document` 传 `_restart: true` 重置进度；切文档自动重置。
- **替换生效**：`wps_word_get_track_changes_status` 看修订数（记得扣开工基线）。

## 执行守卫

拦截由**治理插件**（`tool.execute.before` 钩子）实施，本 skill 不做校验。命中时报错含 **【门禁指路】**（规则号 + 正确下一步），照做即可（重复触发发**同一条**指路，不加长）。

## 不处理的内容

字体/字号、表格插入、模板填写、目录、页眉页脚、图片 → 交给 wps-word skill。本 skill 只做校对。
