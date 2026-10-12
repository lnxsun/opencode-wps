'use strict';

/**
 * 「语义键 × 落点集合」**单一来源清单**（Issue #335 / R10 第六类「范围无主」）。
 *
 * 背景（本族复发机制）：校对线的复发形态是「同一语义有多处真值 ⇒ 换位置就复发」。
 * 前五类（多源字面量 / 叙事文档 / 作用域 / 纳入范围 / 治理层重复不变量）都在治「语义两处写」；
 * R10 抓到第六类：**「一个概念被哪几条守卫覆盖」这件事实身也没有唯一归属** ——
 * 某语义的实现/消费落点分散在多个通道（TS / PS1 / 治理 JS / 守卫脚本），
 * 而守卫的**计行范围**只覆盖其中一部分，两侧之间**没有任何连通性断言**。
 *
 * 实测（Issue #335 第一节，命令可复算）：同一改动只换落点 ——
 *   · 轴外（`wps-com.ps1` / `range-signal.ts`）追加同义实现 → 守卫**全绿**；
 *   · 轴内（`proofread-types.ts`）追加同量 → **exit 1**。
 * ⇒ 缺口不是「数错」，是「同一概念的两侧之间无连通性断言」。
 *
 * 本清单把「语义键 ↔ 全部落点 { channel, path, role }」做成机器可读的唯一来源，
 * 由 `scripts/lib/semantic-anchor-scope.js` 的纯函数做**双向集合相等**判据，
 * `scripts/validate-semantic-anchor-scope.js`（守卫 CLI）消费并纳入 `npm run preflight`。
 *
 * ⚠️ 本文件**只**承载数据（清单 + 计行范围），判据逻辑一律在 lib 判据模块内 ——
 * 这样判据模块内不出现任何仓库路径字面量（沿用 #321 R9-A 单源口径）。
 *
 * 字段口径：
 *   - `key`     语义键（如 `truncation-signal`），全仓唯一；
 *   - `path`    落点仓库相对路径；
 *   - `channel` 通道（ts / ps1 / governance / docs / skill …，用于报错定位与分组）；
 *   - `role`    `decl`（声明源）/ `impl`（实现源）/ `consume`（消费源）；
 *   - `anchor`  **归属锚点**：该落点内必须出现的**导出符号 / 具名常量 / 具名函数**，
 *               即「这份落点确实承载该语义」的判据（防「把文件登记进来却与语义无关」）。
 *   - ⚠️ 原 entry 级 `anchorNames`（第二份归属锚点列表）已随 Issue #352 第十刀删除：
 *               归属锚点**唯一来源 = 落点级 `site.anchor` 派生**（`keyAnchors`）。
 *   - ⚠️ 原 `covered` / `waiver` 两字段已随 Issue #352 第九刀删除：
 *               `covered` 全仓恒为 `true`（零信息）、`waiver` 全仓恒为 `null`（零对象）
 *               ⇒ 死元数据；覆盖判定改由 `checkCoverageSide` 用**单一范围表现场计算**。
 */

/**
 * 语义键 → 落点集合（唯一来源）。
 *
 * ⚠️ 新增落点必须在此登记（未登记 → 判据「归属侧」报红）；新增语义键同理。
 */
const SEMANTIC_ANCHORS = [
  {
    key: 'truncation-signal',
    title: '文本真值 / 截断信号（requestedLength · returnedLength · truncated · docEndReached）',
    sites: [
      {
        path: 'wps-office-mcp/src/tools/word/proofread-types.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'PROOFREAD_BATCH_MAX',
      },
      {
        path: 'wps-office-mcp/src/tools/word/document.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'requestedLength',
      },
      {
        path: 'wps-office-mcp/src/tools/word/range-signal.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'renderTruncationNotice',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-report.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'truncated',
      },
      // ⚠️ Issue #352 第十刀：补登一个真实归属空洞 —— `content.ts` 真的消费
      // `renderTruncationNotice`（第 26 行 import、843 行调用），此前从未登记进本键。
      // 归属锚点单源化（删 entry `anchorNames`）后按落点真实锚点取特征，当场暴露此空洞。
      {
        path: 'wps-office-mcp/src/tools/word/content.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'renderTruncationNotice',
      },
      {
        path: 'wps-office-mcp/scripts/wps-com.ps1',
        channel: 'ps1',
        role: 'impl',
        anchor: '$requestedLength',
      },
      // ⚠️ Issue #325：治理侧对截断信号的消费随「校对线周边冗余清理」删除
      // （governance.js 的 P 规则压到 4 条，不再解析 truncated 信号），故该落点已移出本清单。
    ],
  },
  {
    key: 'batch-max',
    title: '批次大小「200 段」（跨运行时单源）',
    sites: [
      {
        path: 'wps-office-mcp/src/tools/word/proofread-types.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'PROOFREAD_BATCH_MAX',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-report.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'PROOFREAD_BATCH_MAX',
      },
      {
        path: '.opencode/plugins/governance.js',
        channel: 'governance',
        role: 'decl',
        anchor: 'MAX_PARAGRAPHS_PER_BATCH',
      },
      {
        path: 'skills/wps-proofread/SKILL.md',
        channel: 'skill',
        role: 'consume',
        anchor: 'B',
      },
    ],
  },
  {
    key: 'fix-action-verdict',
    title: '修复动作裁决（fix / report_only + 服务端推断留痕）——「仅报告未修」门禁的唯一真值',
    sites: [
      {
        path: 'wps-office-mcp/src/tools/word/proofread-normalize.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'resolveFixAction',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-accumulate-helpers.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'normalizeIssueFixAction',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-report.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'computeFixStatus',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-types.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'fix_action_inferred',
      },
      {
        path: 'wps-office-mcp/src/tests/unit/proofread-fixaction-gate-e2e.test.ts',
        channel: 'test',
        role: 'consume',
        anchor: 'generateProofreadReportHandler',
      },
    ],
  },
  {
    key: 'skipped-segment-ownership',
    title: '跳过声明归属归一化（区间须落在本批内 + 并集无缺口覆盖本批）',
    sites: [
      {
        path: 'wps-office-mcp/src/tools/word/proofread-normalize.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'normalizeSkippedSegmentsDetailed',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-accumulate-helpers.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'evaluateSkipDeclaration',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-report.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'unionCoversRange',
      },
    ],
  },
  {
    key: 'ratchet-verdict',
    title: '守卫上限「棘轮」判据（不许上调 / 值与留痕对账 / 留痕必填）——「达标即收紧」已于 Issue #352 第五刀删除',
    sites: [
      {
        path: 'scripts/lib/ratchet.js',
        channel: 'js',
        role: 'decl',
        anchor: 'checkRatchet',
      },
      {
        path: 'scripts/validate-proofread-report-size.js',
        channel: 'js',
        role: 'consume',
        anchor: 'checkRatchet',
      },
      {
        path: 'scripts/validate-semantic-anchor-scope.js',
        channel: 'js',
        role: 'consume',
        anchor: 'checkRatchet',
      },
    ],
  },
  {
    key: 'artifact-floor-integrity',
    title:
      '历史产物的**处置完整性**（判据⑨：下限 + 决策登记单源 + 曾入库断言，Issue #419 = #417 AC-6 拆分）',
    sites: [
      {
        path: 'scripts/lib/release-connectivity-manifest.js',
        channel: 'js',
        role: 'decl',
        anchor: 'ARTIFACT_FLOOR_DECISION_REFS',
      },
      {
        path: 'scripts/lib/release-connectivity-scope.js',
        channel: 'js',
        role: 'impl',
        anchor: 'checkFloorHistoryIntegrity',
      },
      {
        path: 'scripts/validate-release-connectivity.js',
        channel: 'js',
        role: 'consume',
        anchor: 'checkFloorHistoryIntegrity',
      },
    ],
  },
  {
    key: 'guard-source-budget',
    title: '守卫/元数据源码体量预算（机械枚举 + **并入轴 I 的 E1 维度 guardSourceLines**，Issue #352 第五刀）',
    sites: [
      { path: 'scripts/lib/guard-sources.js', channel: 'js', role: 'decl', anchor: 'discoverGuardSources' },
      { path: 'scripts/validate-semantic-anchor-scope.js', channel: 'js', role: 'consume', anchor: 'totalGuardSourceLines' },
      // Issue #408：重链 CLI 也消费该计量（把实测值写回基线）⇒ 消费端落点同步登记（不留孤儿）。
      { path: 'scripts/ratchet-rechain.js', channel: 'js', role: 'consume', anchor: 'totalGuardSourceLines' },
    ],
  },
  {
    key: 'governance-guide-map',
    title: '治理层「规则标签 ↔ 门禁指路」映射（GUIDE_MAP 的键集合 = enhanceBlock 标签集合）',
    sites: [
      {
        path: '.opencode/plugins/governance.js',
        channel: 'governance',
        role: 'decl',
        anchor: 'GUIDE_MAP',
      },
      // ⚠️ Issue #352 第十刀：原 K7 判据模块（`lib/governance-guide-map.js`）与独立 CLI 已整体删除，
      // 两条判据（标签↔键闭合 + 文案预算）**并入轴 I**。故**消费端落点随实现迁移同步登记**
      // （不留「消费端未登记」的孤儿 —— 与 F6「删执行者留孤儿」同构的形态）。
      {
        path: 'scripts/lib/semantic-anchor-scope.js',
        channel: 'js',
        role: 'decl',
        anchor: 'checkGuideMapCoverage',
      },
      {
        path: 'scripts/validate-semantic-anchor-scope.js',
        channel: 'js',
        role: 'consume',
        anchor: 'checkGuideMapCoverage',
      },
    ],
  },
  {
    key: 'tool-count-source',
    title: '工具数量真值源（内置 / 注册 / COM Actions 三数派生自代码，禁止手写常量）',
    sites: [
      {
        // 唯一定义者：启动即注册的内置工具清单（`registry.register({ name: 'wps_xxx' })`）。
        // 同文件 `whoami` 的失败收尾亦在此（Issue #373：失败恒 success:false，不得据缓存报成功）。
        path: 'wps-office-mcp/src/server/mcp-server.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'registerBuiltinTools',
      },
      {
        // 数值消费端：`validate:toolcounts` 的三个数字（原为手写 `内置工具: 12` + 读已迁走的数组）。
        path: 'scripts/validate-tool-counts.js',
        channel: 'js',
        role: 'consume',
        anchor: 'builtinCount',
      },
      {
        // 注册层/网关层成员一致性的消费端（Issue #382 DECISION-1 重写后）：
        // 「纯 TS 工具必直连注册 / 同名不得双通道 / 索引条目必有执行者 / 无网关专属黑名单」四条双向断言。
        path: 'scripts/validate-gateway-membership.js',
        channel: 'js',
        role: 'consume',
        anchor: 'MUST_DIRECT',
      },
      {
        // 文档层消费端：语义键清单区块（`<!-- SEMANTIC-ANCHORS-LIST -->`）自带本键条目 ⇒ 自带归属判据。
        path: 'docs/DEVELOPMENT_GUIDE.md',
        channel: 'docs',
        role: 'consume',
        anchor: 'TOOL_COUNT_SOURCE_KEY',
      },
    ],
  },
  {
    key: 'theme-metric-map',
    title: '问题类型 → 六维评分维度映射 + 权重公式（报告数字的唯一来源）',
    sites: [
      {
        path: 'wps-office-mcp/src/tools/word/proofread-normalize.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'TYPE_METRIC_MAP',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-report.ts',
        channel: 'ts',
        role: 'consume',
        anchor: 'TYPE_METRIC_MAP',
      },
      {
        path: 'wps-office-mcp/src/tools/word/proofread-types.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'PROOFREAD_METRICS',
      },
    ],
  },
  {
    key: 'tool-result-payload',
    title: '工具调用结果信封（success ↔ isError 投影 + 治理层可读文本面）',
    sites: [
      {
        path: 'wps-office-mcp/src/types/tools.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'ToolCallResult',
      },
      {
        path: 'wps-office-mcp/src/server/mcp-server.ts',
        channel: 'ts',
        role: 'impl',
        anchor: 'isError',
      },
      {
        path: 'wps-office-mcp/src/types/tools.ts',
        channel: 'ts',
        role: 'decl',
        anchor: 'CallToolResponse',
      },
      {
        path: '.opencode/plugins/governance.js',
        channel: 'governance',
        role: 'consume',
        anchor: 'getOutputText',
      },
      {
        path: 'docs/DEVELOPMENT_GUIDE.md',
        channel: 'docs',
        role: 'docs',
        anchor: 'isError',
      },
      // ⚠️ 以下 33 个落点由轴 I 归属侧**机械枚举**报出（impl 角色：它们**构造/透传** ToolCallResult，
      //    并非该契约的定义者）—— 契约的定义者仍在 `types/tools.ts`。全部登记以免「同一语义的落点集」不闭合。
      { path: 'wps-office-mcp/src/server/tool-registry.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/common/convert.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/common/general.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/chart.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/comment-protect.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/data-advanced.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/data.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/format.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/formula.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/pivot.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/row-column.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/sheet.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/excel/workbook.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/gateway/index.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/animation.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/background.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/beautify-advanced.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/chart-flow.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/data-viz.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/image.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/misc.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/presentation.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/shape-basic.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/slide-ops.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/slide.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/table.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/ppt/textbox.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/word/content.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/word/document.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/word/format.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/word/proofread-report.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
      { path: 'wps-office-mcp/src/tools/word/proofread.ts', channel: 'ts', role: 'impl', anchor: 'ToolCallResult' },
    ],
  },
    {
      key: 'proofread-p2-invariant',
      title: '「覆盖全文后禁止推进」门禁的「本批已上报」前置不变量（Issue #400：单批不死锁 / 多批仍拦）',
    sites: [
      {
        // 唯一定义者：P2「覆盖全文后禁止推进」判据本体（含前置 `st.batchAccumulatedThisBatch`）。
        path: '.opencode/plugins/governance.js',
        channel: 'governance',
        role: 'decl',
        anchor: 'PROOFREAD_ADVANCE_TOOLS',
      },
      {
        // 行为断言守卫（Issue #400）：在 scripts/ 层加载 prod 插件、跑链断言行为（可独立执行的门禁）。
        path: 'scripts/validate-proofread-p2-invariant.js',
        channel: 'js',
        role: 'consume',
        anchor: 'checkP2Invariant',
      },
      {
        // 判据纯函数（模块内无仓库路径字面量）。
        path: 'scripts/lib/proofread-p2-invariant.js',
        channel: 'js',
        role: 'impl',
        anchor: 'checkP2Invariant',
      },
    ],
  },
];

// ==================== 覆盖范围（**单一来源 = scripts/lib/guard-scopes.js**）====================
// ⚠️ 本模块**不自持**范围表（PR #336 评审 F2）：改范围必然同改 `guard-scopes.js`（有 diff 留痕）。
//
// ⚠️ Issue #325 第二刀：原范围表里登记的是 `validate-proofread-budget.js`（轴 A）与
//    `validate-proofread-convergence.js`（轴 F）—— 两脚本**已随校对线冗余清理删除**。
//    保留「已删脚本的范围」= 覆盖声明**没有执行者** = 假绿（F2 同型）。现已整体删除，
//    范围表只登记**真实存在且会被 CI 执行**的守卫脚本（由轴 I 判据断言脚本存在 + 真的 import 本单源）。
const { GUARD_SCOPES, matchesGlob, coveringGuards } = require('./guard-scopes.js');

module.exports = {
  SEMANTIC_ANCHORS,
  GUARD_SCOPES,
  matchesGlob,
  coveringGuards,
};
