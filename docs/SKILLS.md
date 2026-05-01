# OpenCode Skills 文档

OpenCode Skills 定义 AI 在特定领域的操作能力和工作流程。

> 本项目为 WPS Office 定义了 4 个 Skills：wps-excel、wps-word、wps-ppt、wps-office

---

## 什么是 Skills

Skills 是 AI 的"技能包"，告诉 AI：
1. **能做什么** - 可用的工具列表
2. **怎么做** - 操作流程和最佳实践
3. **什么场景** - 何时使用这些技能

---

## 本项目的 Skills

| Skill | 目录 | 说明 |
|-------|------|------|
| **wps-excel** | `skills/wps-excel/` | Excel 操作技能 |
| **wps-word** | `skills/wps-word/` | Word 操作技能 |
| **wps-ppt** | `skills/wps-ppt/` | PPT 操作技能 |
| **wps-office** | `skills/wps-office/` | 通用 WPS 操作技能 |

---

## Skill 结构

每个 Skill 目录包含：

```
wps-excel/
├── SKILL.md          # Skill 定义（必需）
├── prompts/          # 预定义提示
│   └── analyze.md
├── resources/        # 资源模板
│   └── template.xlsx
└── README.md         # 使用说明
```

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
1. 调用 `wps_excel_get_range` 获取 A 列数据
2. 调用 `wps_excel_set_formula` 设置 =SUM(A:A) 公式
3. 返回结果

### Word 场景

用户输入："把这段文字设为标题1"

AI 识别：使用 wps-word skill
1. 获取当前选区
2. 调用 `wps_word_apply_style` 应用"标题 1"样式
3. 返回成功

### PPT 场景

用户输入："美化这页PPT"

AI 识别：使用 wps-ppt skill
1. 获取当前幻灯片内容
2. 调用 `wps_ppt_beautify` 执行美化
3. 返回结果

---

## Skill 优先级

当用户使用 Agent 时（如 @wps-expert），AI 优先使用对应的 Skill：

| Agent | 优先 Skill |
|-------|-----------|
| wps-expert | 所有 WPS Skills |
| wps-word | wps-word |
| wps-excel | wps-excel |
| wps-ppt | wps-ppt |

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

## 官方资源

- OpenCode Skills 文档：https://opencode.ai/docs/skills/
- 本项目 Skills：`skills/` 目录

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `skills/wps-excel/SKILL.md` | Excel Skill 定义 |
| `skills/wps-word/SKILL.md` | Word Skill 定义 |
| `skills/wps-ppt/SKILL.md` | PPT Skill 定义 |
| `skills/wps-office/SKILL.md` | 通用 WPS Skill 定义 |
| `AGENTS.md` | Agent 与 Skill 关系 |