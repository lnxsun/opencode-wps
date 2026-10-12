# OpenCode Skills 文档

OpenCode Skills 定义 AI 在特定领域的操作能力和工作流程。

> ⚠️ **本文档只覆盖随 WPS 插件安装的 5 个 WPS 专用 Skills**（`skills/` 目录，随 `install-addons*.js` 同步到 `~/.opencode/skills/`）。仓库内另有的 `.codebuddy/skills/npc-team/`（NPC_TEAM Skill）属于 **cnb.cool 平台开发辅助工具**，不随插件安装、与 WPS 插件无关，见 [NPC_TEAM.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/NPC_TEAM.md)。

> 本项目为 WPS Office 定义了 5 个 Skills：wps-excel、wps-word、wps-ppt、wps-office、wps-proofread

---

## 什么是 Skills

Skills 是 AI 的"技能包"，告诉 AI：

1. **能做什么** - 可用的工具列表
2. **怎么做** - 操作流程和最佳实践
3. **什么场景** - 何时使用这些技能

---

## 本项目的 Skills

| Skill             | 目录                    | 说明              |
| ----------------- | ----------------------- | ----------------- |
| **wps-excel**     | `skills/wps-excel/`     | Excel 操作技能    |
| **wps-word**      | `skills/wps-word/`      | Word 操作技能     |
| **wps-ppt**       | `skills/wps-ppt/`       | PPT 操作技能      |
| **wps-proofread** | `skills/wps-proofread/` | 文档校对技能      |
| **wps-office**    | `skills/wps-office/`    | 通用 WPS 操作技能 |

---

## Skill 结构

每个 Skill 目录包含：

```
wps-excel/
├── SKILL.md          # Skill 定义（必需）
├── README.md         # 使用说明（大多数 Skill 有）
```

> 注：目前 Skill 目录结构为 `SKILL.md` + `README.md`（部分仅有 `SKILL.md`）。`prompts/` 和 `resources/` 子目录为未来规划，尚未实现。

---

## SKILL.md 结构

```markdown
# WPS Excel Skill

## 概述

WPS 表格智能助手，通过自然语言操控 Excel。

## 能力

- 公式编写
- 数据清洗
- 图表创建
- 数据分析

## 工具

- wps_excel_get_cell_value
- wps_excel_set_cell_value
- wps_excel_set_formula
- ...

## 工作流程

1. 获取当前工作簿信息
2. 确定操作目标（单元格/区域/图表）
3. 执行操作
4. 返回结果

## 限制

- 不支持宏
- 不支持 VBA
```

---

## Skill 安装

Skills 安装到 `~/.opencode/skills/`：

```bash
node install-addons.js
# 第 4 步：安装 Skills
```

安装后，AI 可以通过自然语言调用这些技能。

---

## 使用示例

### Excel 场景

用户输入："帮我算一下 A 列的总和"

AI 识别：使用 wps-excel skill

1. 调用 `wps_excel_read_range` 获取 A 列数据
2. 调用 `wps_excel_set_formula` 设置 =SUM(A:A) 公式
3. 返回结果

### Word 场景

用户输入："把这段文字设为标题1"

AI 识别：使用 wps-word skill

1. 获取当前选区
2. 调用 `wps_word_apply_style` 应用"标题 1"样式
3. 返回成功

### 校对场景（Word）

用户输入："帮我校对这篇文档"

AI 识别：使用 `wps-proofread` skill（独立校对技能）

1. 输出分批校对计划表（总段数 / 每批 200 段 / 总批次数）
2. 调用 `enableTrackChanges` 开启修订模式（**回读校验**：handler 会另起一次 `getTrackChangesStatus` 独立往返取真值，回读≠设置即报失败，不再回显入参——Issue #395 RC-3）
3. 分批读取段落（每批固定 200 段），调用 `proofreadBasic` 检测问题
4. 按段落索引+文本匹配调用 `replaceInParagraph` 精确修复（`replaceRange` 已彻底移除：偏移在含不可见字符文档中不可靠）
5. 所有批次完成后生成 `.校对报告.md` 保存到文档目录

> ⚠️ **工具名与门禁名实一致（Issue #395 RC-0）**：治理层归一已认**内置名**（`wps_get_active_document` 等
> `get_active_document`/`get_active_workbook`/`get_active_presentation`）与**注册名**两种调法，并把成功体的
> **JSON**（内置工具）与**文本**（注册工具）两种形态统一解析出文档路径与总段数——此前只认注册名+文本，
> 而 SKILL 教的恰是内置名 ⇒ 门禁 `docInfoFetched` 永不置位。现在**两种调法均放行**。

### PPT 场景

用户输入："美化这页PPT"

AI 识别：使用 wps-ppt skill

1. 获取当前幻灯片内容
2. 调用 `wps_ppt_beautify` 执行美化
3. 返回结果

---

## Skill 优先级

当用户使用 Agent 时（如 @wps-expert），AI 优先使用对应的 Skill：

| Agent      | 优先 Skill      |
| ---------- | --------------- |
| wps-expert | 所有 WPS Skills |
| wps-word   | wps-word        |
| wps-excel  | wps-excel       |
| wps-ppt    | wps-ppt         |

---

## 内置工具（所有 Skill 共用）

所有 WPS Skill 遵循相同的**两级网关调用规范**，内置工具**启动即注册、可直接调用**。
**数量不在此处手写**（手写即漂移源，Issue #373），以 `mcp-server.ts` 为准，运行 `npm run validate:toolcounts` 可复算（Issue #373 实测 `内置工具` 一行即真值）：

| #   | 工具名称                      | 功能描述                                         |
| --- | ----------------------------- | ------------------------------------------------ |
| 1   | `wps_check_connection`        | 检查 WPS Office 连接状态                         |
| 2   | `wps_get_active_workbook`     | 获取当前工作簿信息（名称、路径、工作表列表）     |
| 3   | `wps_get_cell_value`          | 读取指定单元格的值                               |
| 4   | `wps_set_cell_value`          | 写入值到指定单元格                               |
| 5   | `wps_insert_text`             | 在当前文档插入文本（兜底用）                     |
| 6   | `wps_get_active_document`     | 获取当前活动文档信息（名称、路径、段落数、字数） |
| 7   | `wps_get_active_presentation` | 获取当前演示文稿信息                             |
| 8   | `wps_execute_method`          | 执行 WPS API 方法（网关兜底）                    |
| 9   | `wps_cache_data`              | 缓存数据到 MCP Server                            |
| 10  | `wps_get_cached_data`         | 从 MCP Server 获取缓存数据                       |
| 11  | `wps_office_search`           | 搜索 COM Actions 索引（**必须先搜索**）          |
| 12  | `wps_office_execute`          | 执行搜索到的工具（**搜索后用此执行**）           |
| 13  | `wps_whoami`                  | 通道自检（平台/连接/活动文档/下一步建议）         |
| 14  | `wps_list_cache`              | 列出 MCP Server 缓存中的键值                      |
| 15  | `wps_clear_cache`             | 清空 MCP Server 缓存                              |

> 上表即**完整的启动即注册内置清单**（数量以 `mcp-server.ts` 为准，不手写；
> 由 `npm run validate:toolcounts` 的「清单完整性」判据守护 —— 漏一项即报红）。
>
> ⚠️ **直连面（Issue #382 DECISION-1）**：**「网关强制」规则已整体删除** —— 注册层不再有「网关专属」黑名单，
> 治理层也不再拦「直连」。可直接调用的面 = **上列内置工具 + `allTools` 注册工具（数量以代码为准）**；
> 其中「PS1 无同名分支的纯 TS 逻辑工具」（4 个校对工具）按 DECISION-1 **直连注册**，schema 原样给 AI。
> 走网关的只有**其余 COM Actions**（先 `wps_office_search` 再 `wps_office_execute`）。

### 两级网关调用规范（所有 Skill 必须遵循）

```text
1. 先用 wps_office_search 搜索可用工具（COM Actions 索引）
2. 再用 wps_office_execute 执行找到的工具
3. 内置工具可直接调用（无需搜索；数量见 `npm run validate:toolcounts`）
```

> ⚠️ **第 3 步（已注册工具）优先于第 1/2 步**（Issue #373 第 6 轮 CR6-1 / Issue #382）：**内置工具**与
> **`allTools` 注册工具**（含校对 4 个纯 TS 工具）都已启动即注册，**直接调用即可** ——
> **不要**为了「确认存在」而把它们拿去 `wps_office_search`（`search` 是关键词匹配、无语义，猜错词会得空结果）。
> 实测内置清单与 COM_ACTIONS 索引**只有部分重合**（部分内置工具同时是索引条目、部分不是），
> 因此「凡是工具都必须先 search 再 execute」的说法**不成立**。
>
> ⚠️ **禁止编造工具名称**——若某工具**既不在内置清单、也未经 `wps_office_search` 确认存在**，**不得调用**。
> （本条防的是「凭空编造工具名」，**不是**「所有工具都必须走网关」；后一说法与第 3 步矛盾，已被本 Issue 修正。）

> 📚 **交叉参考**：三层工具体系（内置/注册/COM Actions）的完整说明与新增工具流程详见 [DEVELOPMENT_GUIDE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/DEVELOPMENT_GUIDE.md#三层工具体系)。

---

## 各 Skill 详细能力

### wps-excel（表格智能助手）

**能力**：公式编写、数据清洗、图表创建、透视表、条件格式、数据分析。

**典型场景**：

- 「帮我算一下 A 列的总和」（`wps_excel_read_range` + `wps_excel_set_formula` =SUM(A:A)）
- 「删掉 A 列的空行」（数据清洗）
- 「根据 1-6 月销量生成柱状图」（图表创建）

**调用流程**：获取当前工作簿 → 确定目标单元格/区域/图表 → 执行操作 → 返回结果。

### wps-word（文字智能助手）

**能力**：文档排版、格式设置、目录生成、表格插入、样式管理、模板填写、修订校对。

**典型场景**：

- 「把这段文字设为标题1」（`wps_word_apply_style`）
- 「按模板批量填值」（`smartFillField` 五模式 + 修订追踪）
- 「帮我校对文档」（`proofreadBasic` + `replaceInParagraph`，严格逐批；P 规则清单以 `governance.js` 源码为准）

**调用流程**：获取当前文档 → 确定操作目标 → 执行 → 返回。

### wps-ppt（演示智能助手）

**能力**：幻灯片美化、内容生成、动画设置、母版编辑、批量处理。

**典型场景**：

- 「新增一页标题为『季度汇报』的幻灯片」（`wps_ppt_add_slide`）
- 「美化这页PPT」（`wps_ppt_beautify`）
- 「把第三页文本框对齐居中」（排版）

**调用流程**：获取当前演示文稿 → 确定幻灯片 → 执行 → 返回。

### wps-office（跨应用智能助手）

**能力**：跨应用操作（Excel↔Word↔PPT）、格式转换、批量处理、文档管理。

**典型场景**：

- 「把 Excel 数据做成 PPT 图表」
- 「统一多个文档格式风格」
- 「Excel 数据导入 Word 表格」

**调用流程**：检测各应用状态 → 协调专项助手 → 跨应用数据迁移 → 返回。

### wps-proofread（文档校对专家）

**能力**：错别字检测、语病检查、格式一致性校对（独立校对技能，严格逐批；治理层 P 规则清单以 `governance.js` 源码为准）。

**典型流程**（严格逐批闭环）：

```text
1. 输出分批校对计划表（总段数 / 每批 200 段 / 总批次数）
2. 调用 enableTrackChanges 开启修订模式（handler 独立回读真实状态，不一致即失败——Issue #395 RC-3）
3. 分批读取段落（每批固定 200 段），调用 proofreadBasic 检测问题
4. 按段落索引 + 文本匹配调用 replaceInParagraph 精确修复
5. 所有批次完成后生成 .校对报告.md 保存到文档目录
```

> ⚠️ 校对**必须**按 铁律 3.0 严格执行（proofread → confirm → fix），禁止跳批/编造。详见 [FEATURES.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/FEATURES.md)。

> 📌 **skill ≠ 校验器（Issue #309 / #325）**：SKILL.md 的「执行守卫」节只是**治理插件**（`.opencode/plugins/governance.js`，随 OpenCode 运行、经 `tool.execute.before` 钩子生效）拦截行为的**下游说明**，SKILL.md 自身不做任何校验，也不构成用户可配置项。语义说明见 `docs/FEATURES.md`，实现事实源为 governance.js 源码（校对规则 P1～P4）。

> ⚠️ ~~🧩 大文档 Subagent 组协同（Issue #151 重构，**已弃用**）~~：~~4 个校对 subagent（planner/manager/executor/reporter）协同~~ 经 Issue #179 真实会话实证在 opencode 上**触发不可靠**，已改为**单 agent 顺序执行 + 服务端强制**（进度/门禁全部下沉 MCP 服务端，见 `skills/wps-proofread/SKILL.md`）。subagent 定义文件已删除（历史存档见 git 历史，Issue #189 清理）。

---

## 自定义 Skill

### 创建新 Skill

1. 在 `skills/` 目录创建新文件夹
2. 添加 `SKILL.md` 文件
3. 运行 `node install-addons.js` 安装

### Skill 定义示例

```markdown
# My Custom Skill

## 概述

自定义技能描述

## 能力

- 能力1
- 能力2

## 工具

- tool_name_1
- tool_name_2
```

---

## Skill 开发规范

### 修改现有 Skill

1. **只修改源目录** `skills/<name>/`（git 跟踪）
2. 修改 `SKILL.md` 或 `README.md`
3. 运行 `node install-addons.js` 同步到 `~/.opencode/skills/`
4. 重启 OpenCode 生效

> ⚠️ **绝不直接修改** `~/.opencode/skills/`（这是安装产物，非 git 跟踪）。

### 创建新 Skill

```bash
# 1. 创建目录
mkdir skills/my-skill

# 2. 编写 SKILL.md（frontmatter 必含 name + description）
cat > skills/my-skill/SKILL.md <<'EOF'
---
name: my-skill
description: "技能描述，用于触发识别。包含关键词时会被自动匹配。"
---

# 技能标题

## 概述
...

## 能力
- ...

## 工具
- ...

## 工作流程
1. ...

## 限制
- ...
EOF

# 3. 同步安装
node install-addons.js
```

**SKILL.md frontmatter 要求**：

- `name`：技能名（唯一）
- `description`：描述技能能力 + 触发关键词（AI 据此识别何时使用此技能）

### 验证同步状态

> ⚠️ wps-proofread 的 SKILL.md 引用 `docs/xxx.md` 设计文档，采用**单一来源（方案 C）**：
> 唯一事实源是根目录 `docs/`，安装期由 `install-addons*.js` 经
> `scripts/lib/derive-skill-docs.js` 派生进 `~/.opencode/skills/wps-proofread/docs/`。
> 因此安装目录会比 git 源 `skills/wps-proofread/` 多出派生 docs/ 子目录——属**预期**，非漂移。

```bash
# 对比源文件和安装后的文件（排除安装期派生的 docs/ 子目录）
diff -r --exclude=docs skills/ ~/.opencode/skills/
# 校验派生 docs 引用是否全部命中根 docs/ 单一来源
node scripts/validate-skill-docs.js
```

---

## 官方资源

- OpenCode Skills 文档：https://opencode.ai/docs/skills/
- 本项目 Skills：`skills/` 目录
- Skills 维护说明：`skills/README.md`（修改 Skills 前必读）

---

## 相关文件

| 文件                            | 说明                |
| ------------------------------- | ------------------- |
| `skills/wps-excel/SKILL.md`     | Excel Skill 定义    |
| `skills/wps-word/SKILL.md`      | Word Skill 定义     |
| `skills/wps-ppt/SKILL.md`       | PPT Skill 定义      |
| `skills/wps-office/SKILL.md`    | 通用 WPS Skill 定义 |
| `skills/wps-proofread/SKILL.md` | 文档校对 Skill 定义 |
| `AGENTS.md`                     | Agent 与 Skill 关系 |
