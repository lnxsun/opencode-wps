# 使用指南（Wiki 级）

本文档是 OpenCode WPS 的**完整使用手册**，覆盖从快速上手到深度使用的全部内容：打开 AI 对话面板、完整对话操作、WPS 专用 Agents 调用、常用文档操作场景、OpenCode 服务管理与配置。

> 若你刚接触本项目，建议先通读 [INSTALLATION.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/INSTALLATION.md) 完成安装，再回到本文档。三平台完整说明见 [WINDOWS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md) / [MAC.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md) / [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)；问题排查见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)。

---

## 目录

- [一、快速上手](#一快速上手)
- [二、打开 AI 对话面板](#二打开-ai-对话面板)
- [三、完整对话操作](#三完整对话操作)
- [四、WPS 专用 Agents](#四wps-专用-agents)
- [五、常用文档操作场景](#五常用文档操作场景)
- [六、OpenCode 服务管理](#六opencode-服务管理)
- [七、配置参考](#七配置参考)
- [八、最佳实践](#八最佳实践)
- [九、已知限制](#九已知限制)

---

## 一、快速上手

安装完成并重启 WPS 后，功能区出现 **OpenCode AI** 标签页。按平台差异进入对话：

| 平台        | 操作                                       | 对话界面                                               |
| ----------- | ------------------------------------------ | ------------------------------------------------------ |
| **Windows** | 功能区 **OpenCode AI** → 点击 **打开面板** | WPS 内嵌侧边栏 Chat UI                                 |
| **macOS**   | 功能区 **OpenCode AI** → 点击 **打开Web**  | 系统浏览器（优先 Chrome，回退默认浏览器）              |
| **Linux**   | 功能区 **OpenCode AI** → 点击 **打开Web**  | 系统默认浏览器（xdg-open，回退 google-chrome/firefox） |

**第一条消息**：在输入框输入自然语言指令（如「把标题设为黑体三号」），按 Enter 或点击发送，AI 即开始处理。若涉及文档操作，AI 会自动调用 MCP 工具读写 WPS 当前活动文档。

> ⚠️ **使用前提**：MCP 操作（读写文档）要求 **WPS 处于运行状态**，且当前有打开的文档。若连接不上，先按 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md) 排查，或在**仓库根目录**运行 `cd wps-office-mcp && npm install && npm run build && cd ..` 后重启 OpenCode。

---

## 二、打开 AI 对话面板

### Windows（侧边栏 Chat UI）

功能区 **OpenCode AI** 标签页提供 **打开面板 / 打开Web / 连接状态** 三个按钮：

| 按钮         | 功能                                           |
| ------------ | ---------------------------------------------- |
| **打开面板** | 在 WPS 右侧弹出 Chat 侧边栏（最常用）          |
| **打开Web**  | 在系统浏览器打开 AI 对话界面（备用）           |
| **连接状态** | 查看 OpenCode 服务状态（是否在线、端口连通性） |

操作步骤：

1. 在 WPS 功能区点击 **OpenCode AI** 标签页
2. 点击 **打开面板**，右侧弹出 Chat 侧边栏
3. 点击 **连接状态** 确认 OpenCode 服务已就绪
4. （可选）点击 **打开Web** 在浏览器中打开同一对话界面

侧边栏顶部可 **新建会话**，底部工具栏可 **切换 Agent**、**查看连接状态**。

### macOS / Linux（浏览器对话 + 轮询桥）

Mac/Linux 版为命令轮询桥架构（无内嵌侧边栏），对话在浏览器中进行。功能区提供 **服务状态 / 暂停恢复 / 打开Web** 三个按钮：

| 按钮          | 功能                                     |
| ------------- | ---------------------------------------- |
| **服务状态**  | 查看轮询状态与已注册动作数               |
| **暂停/恢复** | 暂停或恢复轮询桥（临时关闭文档操作通道） |
| **打开Web**   | 在浏览器打开 AI 对话界面                 |

操作步骤：

1. 在 WPS 功能区点击 **OpenCode AI** 标签页
2. 点击 **打开Web**，自动在浏览器打开 `http://127.0.0.1:14096`
3. 在浏览器与 AI 对话，文档操作经 WPS 插件轮询桥（`:58891`）自动执行
4. 点击 **服务状态** 查看轮询状态与已注册动作数

> 💡 若「打开Web」无响应，多为 launcher 未启动。请先运行 `node launcher-mac.js`（macOS）或 `node launcher-linux.js`（Linux），或重启系统让自启机制拉起。

---

## 三、完整对话操作

### 3.1 发送消息

- **输入**：在输入框输入问题或指令，支持自然语言
- **发送**：按 `Enter` 或点击发送按钮
- **换行**：输入框内需换行时使用 `Shift + Enter`

### 3.2 SSE 流式输出

AI 回复**实时流式显示**（SSE，Server-Sent Events），边生成边展示，体验流畅。流式输出支持：

- **Markdown 渲染**：代码块、表格、列表、标题、链接、图片等自动渲染为富文本
- **流式光标**：生成中显示闪烁光标，完成后消失
- **取消生成**：可中断当前正在生成的回复

### 3.3 会话管理

侧边栏支持完整的会话管理：

| 操作           | 方式                  | 说明                               |
| -------------- | --------------------- | ---------------------------------- |
| **新建会话**   | 顶栏「+」按钮         | 创建全新对话，独立上下文           |
| **切换会话**   | 点击会话列表条目      | 在不同对话间切换，历史消息即时加载 |
| **重命名会话** | 会话条目下拉 → 重命名 | 为会话设置有意义的标题             |
| **删除会话**   | 会话条目下拉 → 删除   | 删除会话及其全部历史（需确认）     |

会话切换后，AI 会加载该会话的历史消息作为上下文继续对话，实现多任务并行、互不干扰。

### 3.4 Agent 选择

点击底部工具栏的 Agent 按钮，切换不同的 AI 助手（见 [第四节](#四wps-专用-agents)）。当前选中的 Agent 显示在输入框上方，切换后新消息按新 Agent 能力处理。

### 3.5 对话状态

- **连接状态**：输入框/顶栏显示与 OpenCode 服务的连接状态
- **生成状态**：回复生成中显示流式光标与「正在生成」提示
- **等待审批状态**：当 AI 需要调用需要权限确认的工具时，状态点变为橙色闪烁，底栏高亮提示「⏳ 等待你确认工具调用」，**区别于正常 busy 状态**（正常忙碌为蓝色，等待审批为橙色）——避免用户误以为死循环
- **错误提示**：连接断开、工具调用失败等会以 Markdown 错误信息展示

#### 工具调用权限确认（Issue #116）

当 AI 需要调用需要审批的工具时，侧边栏会弹出**权限确认模态框**：

- 展示待调用的**工具名**、**参数**、**说明**
- 三个操作：**允许**（本次放行）、**拒绝**（阻止本次调用）、**记住选择**（勾选后下次不再询问该类工具）
- 点击后通过 `POST /session/:id/permissions/:permissionID` 响应 OpenCode 服务，任务继续

> 💡 **背景**：此功能解决此前「生成报告卡住」问题——权限请求在侧边栏静默、进程一直等待，只能切到 web 会话确认。现在侧边栏直接弹出确认框并高亮提示等待状态。

##### 权限自动确认模式（Issue #116 补充 + Issue #179 方案A 服务端放行）

默认开启**自动确认**（`config.js` 的 `permission.mode: 'auto'`），长任务（如 97 批校对）不再因权限确认卡住。方案A 在服务端直接放行，双保险：

- **服务端放行（方案A，根治）**：`install-addons.js` 在生成 `opencode.json` 时读取 `config.js` 的 `permission.mode`；为 `'auto'` 时写入服务端 `permission`（`"*": "allow"` + `external_directory: { "**": "allow" }`），使**服务端直接放行所有工具及工作目录外的文件读写**，权限请求根本不下发——彻底根治长任务（如 F 盘文档校对）因外部目录授权卡住的问题。
- **前端自动响应（兜底）**：权限请求若仍到来，`taskpane.html` 的 `handlePermissionRequest` 在 `mode==='auto'` 时自动 `allow`，不再弹窗等待人工确认
- **兜底通道**：`/tui/control/next` 长轮询（serve web 走此通道），SSE 收不到权限请求时也能自动响应
- **可配置**：
  - 如需人工审批：将 `config.js` 的 `permission.mode` 改为 `'manual'`，重跑 `node install-addons.js`——此时服务端 `permission` 被移除，走前端弹窗人工确认
  - 如需收紧放行范围：修改 `.opencode/opencode.jsonc` 的 `permission.external_directory` 值（如改为 `{ "F:\\**": "allow" }` 仅放开 F 盘），`install-addons.js` 会原样透传。
    > ⚠️ **收紧注意**：若此前已 install 过（已有 `opencode.json` 含旧的 `**` 全放行），修改模板收紧时需**同时清理已有 `opencode.json` 中的旧 `external_directory` 规则**（或删除 `~/.config/opencode/opencode.json` 后重跑 `node install-addons.js`），否则旧的 `**` 会与新的收紧规则**共存**，收紧不彻底。

> ℹ️ 早期版本曾尝试在 launcher 启动 `opencode serve` 时追加 `--permission allow` 从服务端源头放行，但老版本 opencode 的 `serve` 子命令**不识别该旗标**，追加后打印 usage 并以 code=1 退出导致「启动失败」（Issue #161 根因）。已移除该旗标及 `autoAllowOnLaunch` 配置，权限放行改由 opencode.json 服务端 `permission` 配置（方案A）+ 前端通道兜底实现。

> ⚠️ 自动确认只放行工具权限请求，**governance.js 的 G2-G7 安全规则（路径安全/破坏性确认/密码保护等）仍生效**，不会被绕过。方案A 的 `external_directory` 放行范围可按需收紧到特定盘符。

##### 文件路径写盘白名单（Issue #179 路径白名单暴露）

MCP 服务端 **write 类操作**（含校对报告 `generateProofreadReport` 落盘与通用 `write_file`）默认只允许写入**用户主目录 + 系统临时目录 + 当前活动文档所在目录**（方案 B 已把文档目录并入）。若目标在**文档目录之外**（如统一存到 `D:\reports`），写盘会报 `Path not allowed`——这是与方案A 的**权限授权（external_directory）不同的一层限制**，需单独放开：

> ✅ **大多数情况下无需配置**：PR #181 已实现「方案 B」——报告与**当前活动文档同目录**即可写（Issue #420 起由单源 `buildWriteRootsWithDocDir` 承担，`write_file` 与报告落盘共用；旧名 `buildReportAllowedRoots` 为兼容别名）。因此 F 盘文档的校对报告写到文档同目录**默认成功**，不需要配置 `allowedWriteRoots`。

以下配置（方案 A）**仅在报告要写到文档所在目录之外**（如统一存到 `D:\reports`）时才需要：

1. 打开 `opencode-wps/config.js`，在 `allowedWriteRoots` 填入报告目标根目录（多路径分隔符：Windows 用分号 `;`，macOS/Linux 用冒号 `:`；混用会自动按平台规范化）：
   ```js
   allowedWriteRoots: 'F:\\2025年度;D:\\docs',
   ```
2. 重跑 `node install-addons.js` 重新生成 `opencode.json`（会把该项写入 MCP server 的 `env.OPCODE_ALLOWED_ROOTS`）；
3. 重启 launcher/serve，再实际跑一次写盘/校对报告确认不再报 `Path not allowed`。

> ⚠️ 留空字符串 `''` 表示不注入白名单，沿用 MCP 默认（仅限用户主目录 + 系统临时目录 + 方案 B 的文档同目录）。配置项说明见 `opencode-wps/config.js` 注释。

#### 上下文用量条（Issue #116）

侧边栏底部新增**上下文用量进度条**（3px），随 SSE 事件实时更新，hover 显示详细 token 数：

- **绿色**：用量正常（<70%）
- **橙色**：接近上限（≥70%），提示即将触发会话压缩
- **红色**：即将打满（≥90%），建议手动开新会话或提前压缩

> 💡 **背景**：此功能解决长任务（如 35 批校对）被上下文窗口打断却无感知的问题——用户可据此预判何时让 AI 开新会话或手动压缩，避免长任务中途中断。

### 3.6 底部工具栏控制项

侧边栏底部工具栏提供 **5 个控制项**，用于调节 AI 对话行为：

| 按钮         | 功能       | 说明                                                       |
| ------------ | ---------- | ---------------------------------------------------------- |
| **Agent**    | Agent 选择 | 切换 wps-expert/word/excel/ppt（见 [3.4](#34-agent-选择)） |
| **模式**     | 构建/规划  | 构建（build）模式侧重执行，规划（plan）模式侧重方案        |
| **提供方**   | 供应商切换 | 切换模型供应商（OpenCode / Ollama 等）                     |
| **AI 模型**  | 模型选择   | 在选定供应商下选择具体模型                                 |
| **推理级别** | 低/中/高   | 调节响应速度与推理深度（低更快、高更深入）                 |

#### 模型选择

点击底部工具栏的 **AI 模型** 按钮（显示当前模型名），弹出可用模型下拉列表：

| 操作             | 方式                 | 说明                                           |
| ---------------- | -------------------- | ---------------------------------------------- |
| **打开模型列表** | 点击「AI 模型」按钮  | 弹出可用模型下拉列表（从 OpenCode 服务获取）   |
| **切换模型**     | 点击列表中的某个模型 | 当前模型立即切换，后续消息按新模型处理         |
| **记忆模型**     | 自动持久化           | 选择的模型会记住，重新打开面板后仍保持上次选择 |

- 可用模型由 OpenCode 服务动态返回（支持本地 Ollama、OpenCode 内置模型等）。
- 切换 Agent 与切换模型互不冲突：Agent 决定技能倾向，模型决定底层推理引擎，二者可独立设置。

#### 提供方选择

点击底部工具栏的 **提供方** 按钮，选择模型供应商。切换提供方后，模型列表自动更新为该提供方下的可用模型。

#### 推理级别选择

点击底部工具栏的 **推理级别** 按钮，在「低 / 中 / 高」三档间切换：

| 级别           | 行为               | 适用场景             |
| -------------- | ------------------ | -------------------- |
| **低**         | 响应更快、推理较少 | 简单问答、快速操作   |
| **中**（默认） | 良好的推理和速度   | 常规文档操作         |
| **高**         | 最佳推理、可能较慢 | 复杂分析、长文档处理 |

---

## 四、WPS 专用 Agents

项目内置 4 个 WPS Office 智能助手（定义见 `agents/`，安装到 `~/.config/opencode/agents/` + `~/.opencode/agents/`）：

| Agent          | 类型     | 说明                                          | 调用方式      |
| -------------- | -------- | --------------------------------------------- | ------------- |
| **wps-expert** | 子 agent | WPS Office 智能助手，综合处理 Word/Excel/PPT  | `@wps-expert` |
| **wps-word**   | 子 agent | Word 文档处理专家（排版/格式/模板填写）       | `@wps-word`   |
| **wps-excel**  | 子 agent | Excel 数据处理专家（公式/函数/数据分析/图表） | `@wps-excel`  |
| **wps-ppt**    | 子 agent | PPT 演示文稿专家（制作/内容编辑/美化排版）    | `@wps-ppt`    |

### 4.1 调用方式

```text
# 方式一：消息中直接 @ 调用
@wps-word 把这篇文档的标题统一设为「标题 1」样式

# 方式二：切换 Agent 后直接对话
（先在底部工具栏切换到 wps-excel）帮我统计 A 列的总和
```

#### 4.1.1 Agent 工具可见性说明

4 个 WPS agent **均不设 `tools:` 白名单**（front-matter 里没有 `tools` 字段），即 agent 对全部工具可见（含 MCP 注册的 `wps-office_*` 工具，运行时以带 `wps-office_` 前缀的真实名暴露）。这是有意的设计——agent 调用的收敛靠 MCP 网关（`wps_office_search` / `wps_office_execute`），而非 agent 白名单。

> ⚠️ **不要给 agent front-matter 添加裸名 `tools:` 白名单**（如 `wps_office_execute: true`）。opencode 按 `wps-office_wps_office_execute` 这种带 server 前缀的真名注册工具，裸名白名单会匹配 0 个工具，导致该 agent 调不到任何 WPS-MCP 工具（曾致校对 agent「调不到 wps_office_execute」故障，见 Issue #247）。如需收敛某 agent 的工具，应依赖 MCP 网关层而非 front-matter 白名单。

### 4.2 各 Agent 能力一览

**wps-word（Word）**：

- 文档排版、样式设置、字体格式
- 模板自动填值、修订模式校对
- 批量文档生成（合同/报告/公文）

**wps-excel（Excel）**：

- 公式与函数编写
- 数据清洗、数据分析
- 图表创建、单元格格式设置

**wps-ppt（PPT）**：

- 幻灯片制作、内容编辑
- 排版美化、动画设置
- 母版编辑、批量处理

**wps-expert（综合）**：

- 跨应用操作（Word/Excel/PPT）
- 自动路由到对应 Skills 处理
- 适合不明确属于哪个应用的混合任务

### 4.3 校对 Subagent 组（文档校对，内部编排）

> **⚠️ 已弃用（Issue #179 阶段4）**：4-subagent 编排（规划→管理→执行→报告）经真实会话实证
> **在 opencode 上触发不可靠**（subagent 触发依赖 LLM 自觉，真实会话中从未被触发，批次表从未登记、
> 防幻觉门禁全部失效）。**已确认放弃 4-subagent 设想**，改为：
>
> - **单 agent 顺序执行**：主 agent 直接按 `skills/wps-proofread/SKILL.md` 的标准步骤链逐批校对，不调用任何 subagent；
> - **服务端强制分批/进度/门禁**：串行进度严格递增校验（单批 ≤200 段、不得回卷）、
>   报告完整性硬门禁——AI 无论怎么跑都逃不出服务端把关；会话只在进程内、不落盘，重启后重跑即可。
>
> 原 4 个 subagent 定义文件（`agents/wps-proofread-planner/manager/executor/reporter.md`）已删除（历史存档见 git 历史，Issue #189 清理）。

| ~~subagent~~               | ~~职责~~（已删除，历史存档）                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ~~wps-proofread-planner~~  | ~~规划：一次性分批计划 + 唯一 session_id + 登记批次分配表 + 编排调度~~                                                        |
| ~~wps-proofread-manager~~  | ~~管理：调度执行 subagent（≤3 并行）+ 监督逐步凭证落盘防幻觉 + 断点续跑~~（机制已删除）                                      |
| ~~wps-proofread-executor~~ | ~~执行：专职逐批校对独立段落区间，走完整步骤链并落盘凭证（可并行）~~（机制已删除）                                       |
| ~~wps-proofread-reporter~~ | ~~报告：从磁盘 session 归并真实数据，六维报告 + 交叉校验 + 缺失告警~~（已由服务端 `generateProofreadReport` 硬门禁取代） |

### 4.4 Agent 与 Skill 的对应关系

| Agent      | 优先 Skill                                   |
| ---------- | -------------------------------------------- |
| wps-expert | 全部 WPS Skills（wps-office/word/excel/ppt） |
| wps-word   | wps-word                                     |
| wps-excel  | wps-excel                                    |
| wps-ppt    | wps-ppt                                      |

### 4.5 自定义 Agents

- **定义位置**：`~/.config/opencode/agents/` + `~/.opencode/agents/`（两处均由 `install-addons*.js` 从源目录 `agents/` 同步）
- **修改方式**：编辑源目录 `agents/*.md`，运行 `node install-addons.js` 同步，重启 OpenCode 生效
- **自定义新 Agent**：在 `agents/` 新建 `*.md`（含 frontmatter），同步后即可在 Agent 列表中选择

> 📖 Agents 与 Skills 的关系、Skills 详细说明见 [SKILLS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md)。

---

## 五、常用文档操作场景

以下是通过 AI 对话即可完成的典型场景（AI 会自动调用 MCP 工具操作 WPS）。

### 5.1 Word 文档

| 场景       | 示例指令                                   |
| ---------- | ------------------------------------------ |
| 排版       | 「把全文标题设为标题1，正文设为宋体小四」  |
| 模板填值   | 「按这张表的数据把合同模板填好，开启修订」 |
| 大文档校对 | 「帮我校对这篇文档，每批200段严格逐批」    |
| 格式调整   | 「把第三段加粗、居中」                     |

### 5.2 Excel 表格

| 场景     | 示例指令                      |
| -------- | ----------------------------- |
| 公式     | 「在 B 列用 SUM 求 A 列总和」 |
| 数据清洗 | 「删掉 A 列的空行」           |
| 图表     | 「根据 1-6 月销量生成柱状图」 |
| 格式     | 「把表头设为黄色底、加粗」    |

### 5.3 PPT 演示

| 场景 | 示例指令                               |
| ---- | -------------------------------------- |
| 制作 | 「新增一页标题为『季度汇报』的幻灯片」 |
| 美化 | 「把这页的美化一下，统一配色」         |
| 排版 | 「把第三页的文本框对齐居中」           |

### 5.4 跨应用（wps-expert）

| 场景     | 示例指令                           |
| -------- | ---------------------------------- |
| 混合任务 | 「把 Excel 里的数据做成 PPT 图表」 |
| 通用     | 「帮我整理一下当前打开的文档」     |

> 📖 特色功能（模板填值 + 校对铁律 3.0）的完整工作流与治理规则见 [FEATURES.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/FEATURES.md)。

---

## 六、OpenCode 服务管理

OpenCode 服务由 **Launcher 进程**管理（监听 `127.0.0.1:14097`），通常无需手动干预，开机自动启动。服务本身监听 `127.0.0.1:14096`。

### 6.1 Launcher API

可通过 Launcher 的 HTTP API 管理服务（curl / 浏览器访问）：

| 方法 | 端点       | 功能                                                                |
| ---- | ---------- | ------------------------------------------------------------------- |
| GET  | `/status`  | 查看服务状态                                                        |
| GET  | `/health`  | 健康检查                                                            |
| POST | `/start`   | 启动服务（body: `{"cwd": "目录"}`）                                 |
| POST | `/stop`    | 停止服务（按端口 14096 精确停止）                                   |
| POST | `/dock`    | 打开浏览器（「打开Web」按钮经此端点实现）                           |
| POST | `/docinfo` | 写入当前文档信息缓存（body: 文档对象；`closed:true` 时清除缓存）    |
| GET  | `/docinfo` | 读取当前文档信息缓存（无缓存返回 404 `No document info available`） |

```bash
# 查看状态
curl http://127.0.0.1:14097/status

# 健康检查
curl http://127.0.0.1:14097/health

# 启动服务
curl -X POST http://127.0.0.1:14097/start -H 'Content-Type: application/json' -d '{"cwd":"/path/to/project"}'

# 停止服务
curl -X POST http://127.0.0.1:14097/stop

# 打开浏览器
curl -X POST http://127.0.0.1:14097/dock

# 写入文档信息缓存（对象 body；closed:true 清除）
curl -X POST http://127.0.0.1:14097/docinfo -H 'Content-Type: application/json' -d '{"name":"demo.docx","path":"C:\\demo\\demo.docx"}'

# 读取文档信息缓存
curl http://127.0.0.1:14097/docinfo
```

### 6.1b 服务状态自动探测与自愈

侧边栏顶部状态栏会**自动探测** OpenCode 服务状态并**自愈恢复**（无需手动干预）：

- **多信号源交叉验证**：状态判定不单一依赖某一路信号，而是综合**多个可靠信号源**——`/global/health` 健康检查（14096 直连）+ Launcher `/status`（14097）+ **SSE 连接**（EventSource，`/event` 流）。任一可靠信号源确认服务在跑即恢复「运行中」。
- **SSE 第三信号源兜底**：`/global/health` 在 WPS Chromium 下可能因 CORS/环境差异持续失败，且 Launcher（14097）未运行时 `/status` 交叉验证也失效。此时前端自动改用 **SSE 探测**（EventSource 不受 XHR CORS 差异影响）——SSE 连接成功即证明服务在跑，自动恢复「运行中」并切回对话视图。
- **自动恢复**：服务恢复后状态栏在 ≤1 个检测周期（约 10s）内自动切回「运行中」，无需重启插件。
- **防误报/防振荡**：服务真实停止时不会误报「运行中」；SSE 已连接时信任该最强信号，避免每 10s 的 chat↔setup 状态闪烁。
- **探测冷却**：服务真停 + Launcher 不可达时，探测性 SSE 连接最多每 30s 创建一次（冷却守卫），避免周期性失败连接风暴。

> 📖 若状态栏长期显示「已停止」而服务实际在跑，见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)「服务运行中但状态栏显示已停止」。

### 6.2 各平台 Launcher 与自启

| 平台        | Launcher 文件              | 自启机制                                                             |
| ----------- | -------------------------- | -------------------------------------------------------------------- |
| **Windows** | `opencode-wps/launcher.js` | 计划任务（`schtasks /Create`）                                       |
| **macOS**   | `launcher-mac.js`          | LaunchAgent（`~/Library/LaunchAgents/com.opencode.launcher.plist`）  |
| **Linux**   | `launcher-linux.js`        | XDG autostart（`~/.config/autostart/opencode-wps-launcher.desktop`） |

### 6.3 端口速查

| 端口    | 服务             | 说明                                                                             |
| ------- | ---------------- | -------------------------------------------------------------------------------- |
| `14096` | OpenCode 服务    | AI 对话核心服务                                                                  |
| `14097` | Launcher         | 服务生命周期管理                                                                 |
| `14098` | CORS 代理        | `opencode-proxy.js` 剥离 CSP 头，供 WPS Chromium 使用                            |
| `58891` | Mac/Linux 轮询桥 | 插件与 MCP 之间的反向轮询通道                                                    |
| `58890` | WPS 服务保活     | Win/Mac 内置 RelayHttpServer 探测口（`wps-keepalive.ts` 定期探测，断开自动重启） |
| `3444`  | 开发服务器       | `opencode-wps/serve.js` 静态开发服务器（仅开发用）                               |

> 📚 **交叉参考**：端口对应的 MCP Server 三层工具体系与开发映射详见 [DEVELOPMENT_GUIDE.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/DEVELOPMENT_GUIDE.md#三层工具体系)；内置工具完整清单与两级网关调用规范详见 [SKILLS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/SKILLS.md#内置工具所有-skill-共用)。

### 6.4 手动管理

```bash
# 查看 OpenCode 是否在运行（Win）
schtasks /Query /TN "OpenCodeLauncher"

# 手动启动计划任务（Win）
schtasks /Run /TN "OpenCodeLauncher"

# 手动启动 Launcher（Mac/Linux）
node launcher-mac.js
node launcher-linux.js
```

> 📖 更详细的平台特定服务管理见 [WINDOWS.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/WINDOWS.md) / [MAC.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/MAC.md) / [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)。

### 6.5 黑窗闪现说明（Windows）

点击侧边栏右上角「**关闭服务**」（黑色方块）或「**启动服务**」时，若命令行已隐藏则**不会**闪现黑色命令行窗口（Windows）。

- **关闭服务**：Launcher 通过多个 `execSync` 子进程（`netstat` 查端口 → `powershell`/`wmic` 验证进程名 → `taskkill` 结束进程）停止服务，端口 14096 上可能同时存在主进程与多个 SSE 连接，逐 PID 验证+kill 曾累积闪现最多 13 个黑窗。所有 `execSync` 现统一经 `hiddenExecSync()` 强制 `windowsHide:true`（`CREATE_NO_WINDOW`）彻底隐藏。
- **启动服务**：`spawn` 启动 OpenCode 时，`.cmd` shim（npm 全局 `opencode.cmd` / 无扩展名 PATH shim）依赖 `shell:true` 曾导致嵌套控制台进程闪现 1 个黑窗。现 `.cmd` 分支改**显式 `cmd.exe /d /s /c` 包装**（`shell:false` + `windowsHide:true` + `windowsVerbatimArguments:true`），`.exe`/`.ps1` 直启分支统一走 `hiddenSpawn()`，所有 `spawn` 强制 `windowsHide:true`。

若仍观察到黑窗闪现，请反馈复现步骤与 `opencode-serve.log`（见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)）。

---

## 七、配置参考

全局配置集中在 `opencode-wps/config.js` 的 `CONFIG` 对象（前端经 `<script src="config.js">` 注入，后端由 `launcher.js` require 引入）。关键配置项：

| 配置项                        | 用途                     | 默认值                   |
| ----------------------------- | ------------------------ | ------------------------ |
| `CONFIG.opencode.apiBase`     | OpenCode 服务地址        | `http://127.0.0.1:14096` |
| `CONFIG.launcher.apiBase`     | Launcher 管理地址        | `http://127.0.0.1:14097` |
| `CONFIG.plugin.userHome`      | 用户主目录（安装时注入） | 安装时注入值             |
| `CONFIG.network.timeout`      | HTTP 请求超时            | `30000ms`                |
| `CONFIG.session.defaultAgent` | 默认 Agent               | `wps-expert`             |

> ⚠️ **修改配置注意**：`config.js` 是源文件，修改后需运行 `node install-addons.js` 同步到插件目录；不要直接改 `%APPDATA%`/`~/Library` 等安装产物目录。

---

## 八、最佳实践

1. **明确指令**：给出具体、可执行的操作指令，AI 能更准确调用工具
2. **活用 Agent**：按任务类型选择 wps-word/excel/ppt，避免混合任务走错 Skill
3. **会话隔离**：不同任务用不同会话，避免上下文污染
4. **特色功能优先**：模板填值、校对用专门的 FEATURES 流程，确保可追溯、不编造
5. **及时保存**：AI 操作的是 WPS 活动文档，重要操作建议先另存副本
6. **连接排查**：操作失败先查连接状态（Win「连接状态」/ Mac·Linux「服务状态」）

---

## 九、已知限制

- **MCP 操作依赖 WPS 运行**：无打开文档时文档类工具不可用
- **Windows 为侧边栏 UI，Mac/Linux 为浏览器对话**：三者交互入口不同，能力一致
- **WPS Chromium 内核限制**（Windows 侧边栏）：不支持 `fetch` Promise、`ReadableStream` 等现代 Web 特性，本项目已用 `XMLHttpRequest` + SSE 规避
- **Linux 版为开发完成待实机验证**：见 [LINUX.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/LINUX.md)

> 📖 完整问题排查与避坑指南见 [TROUBLESHOOTING.md](https://cnb.cool/lnxsun/opencode-wps/-/blob/main/docs/TROUBLESHOOTING.md)。
