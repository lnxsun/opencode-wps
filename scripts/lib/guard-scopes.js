'use strict';

/**
 * 守卫**覆盖范围**的唯一事实源（Issue #335 R10「范围无主」）。
 *
 * ⚠️ Issue #325 更新（第二刀）：
 *   - 原先这里保存的是 `validate-proofread-budget.js`（轴 A）与
 *     `validate-proofread-convergence.js`（轴 F）的**行数/收敛范围**的副本 —— 那两个脚本
 *     已随「校对线周边冗余清理」删除。保留它们的范围数据是**假覆盖**：轴 I 的
 *     「覆盖侧 / 方向 2 / AC4 豁免过期」当时是拿清单与**一份没有执行者的范围**对账，
 *     实测「改真脚本的范围，轴 I 不感知」即由此而生（PR #336 评审 F2）。
 *   - 第二刀把「无执行者的范围数据」整体删除。范围表现在**只登记真实存在的守卫**
 *     （`guard` 指向一个会被 CI 执行的脚本），并由判据断言「每个 guard 的脚本必须真实存在、
 *     且必须真的 require 本模块」—— 消除「覆盖声明无执行者」这一同型假绿。
 *
 * 为什么需要本模块（保留的核心理由）：轴 I 的判据之一是「每条落点**被哪条守卫**覆盖」。
 * 范围必须**单一来源**，否则轴 I 会退化成「跟自己的副本对账」（F2 原样复发）。
 * 因此范围定义放这里，由**真实守卫与轴 I 共同 import**，改范围必然有 diff 留痕。
 *
 * ⚠️ 本模块只承载**范围数据 + 匹配实现**，不承载任何判据。
 */

/**
 * 覆盖源：一条守卫声明 = 一个**真实存在且会被 CI 执行**的脚本 + 它覆盖的文件判据。
 *
 * 字段：
 *   - `guard`  覆盖源的名字，直接用于报错定位；
 *   - `script` 该守卫的**脚本路径**（必须真实存在，且必须 require 本模块 —— 两者均由判据断言）；
 *   - `title`  该守卫在防什么（人类可读）；
 *   - `matchers` 该守卫覆盖哪些落点（谓词，唯一实现）。
 */
const GATEWAY_MEMBERSHIP_SCRIPT = 'scripts/validate-gateway-membership.js';
/** 语义连通性守卫本体：它**扫描并断言**的落点集合就是它自己声明覆盖的范围。 */
const SEMANTIC_ANCHOR_SCRIPT = 'scripts/validate-semantic-anchor-scope.js';
/** 文档形态漂移守卫本体（Issue #359 / #352 第十二刀）：扫描并断言的落点 = 文档树里的
 * 已删机制描述 + 断档编号（两条同族判据，同一份文档树）。 */
const REMOVED_MECHANISMS_SCRIPT = 'scripts/validate-removed-mechanisms.js';
/** P2 不变量行为守卫（Issue #400）：在 scripts/ 层加载 prod 插件、跑真实链路断言 P2 不变量。 */
const P2_INVARIANT_SCRIPT = 'scripts/validate-proofread-p2-invariant.js';

/** 工具成员守卫覆盖的落点（Issue #382 DECISION-1 重写：判据 = 「PS1 是否有同名 switch 分支」，
 *  断言「纯 TS 工具必直连注册 / 同名不得双通道 / 索引条目必有执行者 / 注册与治理层不得再有网关专属黑名单」）。 */
const GATEWAY_MEMBERSHIP_PATHS = [
  '.opencode/plugins/governance.js',
  'wps-office-mcp/src/server/tool-registry.ts',
  // allTools 的机械枚举根与装配点（判据 A：纯 TS 工具必须出现在 tools/list 可见面）
  'wps-office-mcp/src/server/mcp-server.ts',
  'wps-office-mcp/src/tools/index.ts',
  'wps-office-mcp/src/tools/gateway/com-actions.ts',
  // 执行者判据（判据 C）须读 PS1 桥接的 switch 分支；判据 E 须读网关 schema 转换
  'wps-office-mcp/scripts/wps-com.ps1',
  'wps-office-mcp/src/tools/gateway/index.ts',
];

/** K7 指路完整性守卫覆盖的落点（Issue #354）：规则标签与 GUIDE_MAP 都在治理插件本体里。 */
const GOVERNANCE_GUIDE_MAP_PATHS = ['.opencode/plugins/governance.js'];

/** P2 不变量守卫（Issue #400）覆盖的落点：门禁定义者（治理插件）+ 守卫本体 + 判据纯函数。
 *  该不变量「唯一定义者 = 治理插件的 P2 判据」，守卫只**消费行为**（before 抛/不抛）不复述实现。 */
const P2_INVARIANT_PATHS = [
  '.opencode/plugins/governance.js',
  'scripts/validate-proofread-p2-invariant.js',
  'scripts/lib/proofread-p2-invariant.js',
];

/** 文档漂移守卫（Issue #359）覆盖的落点 —— 两个文档守卫同扫同一份文档树（单一来源）。 */
/** ⚠️ 单一来源：文档漂移守卫的扫描面 = `doc-drift-manifest.js` 的 `DOC_SCAN_FILES`
 * （Issue #382：原在此**手抄第二份**同名单 —— 正是本仓反复在治的「同一语义两处写」；
 *  且两份分叉后扩大了扫描面也不会传导到轴 I 的覆盖侧）。此处改为**派生引用**，不得再手写。 */
const { DOC_SCAN_FILES } = require('./doc-drift-manifest');
const DOC_DRIFT_PATHS = DOC_SCAN_FILES;

/** 轴 I（语义连通性）自身扫描的源码根 —— 它是「落点归属」的覆盖范围。 */
const ANCHOR_SCAN_ROOTS = [
  'wps-office-mcp/src',
  'wps-office-mcp/scripts',
  '.opencode/plugins',
  'scripts',
  'tests',
  'skills',
];

/** 覆盖源的**枚举根**（供守卫按目录增量枚举，避免全仓扫描）。 */
const GUARD_SCOPE_ROOTS = [
  ...new Set([
    ...GATEWAY_MEMBERSHIP_PATHS,
    ...GOVERNANCE_GUIDE_MAP_PATHS,
    ...P2_INVARIANT_PATHS,
    ...DOC_DRIFT_PATHS,
    ...ANCHOR_SCAN_ROOTS,
  ]),
];

/**
 * 全部守卫覆盖范围（**唯一声明处**）。
 *
 * ⚠️ 每条 `guard` 都必须对应一个真实脚本（`script` 字段），否则判据报「覆盖声明无执行者」。
 * 历史守卫的行数范围**不再登记** —— 没有执行者的覆盖声明就是假绿。
 */
const GUARD_SCOPES = [
  {
    guard: 'gateway-membership（校对工具网关专属成员一致性）',
    script: GATEWAY_MEMBERSHIP_SCRIPT,
    title: '校对工具的门槛名单三处同源（GATEWAY_ONLY_TOOLS / DIRECT_TO_GATEWAY / com-actions）',
    matchers: [p => GATEWAY_MEMBERSHIP_PATHS.includes(p)],
  },
  {
    // ⚠️ Issue #352 第十刀：原独立 K7 CLI（validate-governance-guide-map.js）已删除，
    // 其两条判据并入轴 I。故本覆盖源的 script = 轴 I 本体（覆盖声明必须有真实执行者）。
    guard: 'governance-guide-map（规则标签 ↔ GUIDE_MAP 指路双向完整性 + 文案预算，Issue #354/#352 第十刀并入轴 I）',
    script: SEMANTIC_ANCHOR_SCRIPT,
    title: '凡在 enhanceBlock 打标签的拦截点必须有指路；GUIDE_MAP 不得有死条目、文案在预算内',
    matchers: [p => GOVERNANCE_GUIDE_MAP_PATHS.includes(p)],
  },
  {
    guard: 'proofread-p2-invariant（P2 覆盖全文后禁止推进 · 「本批已上报」前置不变量，Issue #400）',
    script: P2_INVARIANT_SCRIPT,
    title: '单批（≤200 段）文档首批取段即达文末时 ③取文本 + ④校对 不被 P2 拦（不死锁）；多批末批上报后继续推进 仍被 P2 拦（对偶面）',
    matchers: [p => P2_INVARIANT_PATHS.includes(p)],
  },
  {
    guard: 'doc-drift（文档形态漂移：已删机制的非历史区现在时陈述 + 断档编号）',
    script: REMOVED_MECHANISMS_SCRIPT,
    title: '① 机制已删除，文档描述必须同步删除或移入历史存档区并显式标注（#357）；② 文档不得引用源码中不存在的治理规则编号（#353，第十二刀）',
    matchers: [p => DOC_DRIFT_PATHS.includes(p)],
  },
  {
    guard: 'semantic-anchor（语义键 × 落点双向连通性）',
    script: SEMANTIC_ANCHOR_SCRIPT,
    title: '语义落点归属扫描根（本守卫的归属侧候选池即其覆盖范围）',
    matchers: [p => isUnderAnyRoot(p, ANCHOR_SCAN_ROOTS)],
  },
];

/** 通配匹配（仅支持 `*` 单段与 `**` 跨段；轴 I 与真实守卫共用同一实现 —— 同源） */
function matchesGlob(glob, relPath) {
  if (glob === relPath) return true;
  const re = new RegExp(
    '^' +
      glob
        .split('**')
        .map(part =>
          part
            .split('*')
            .map(seg => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^/]*')
        )
        .join('.*') +
      '$'
  );
  return re.test(relPath);
}

/** 某路径是否位于给定根之下（根本身或根的子路径） */
function isUnderAnyRoot(relPath, roots) {
  const norm = String(relPath).split('\\').join('/');
  return roots.some(r => norm === r || norm.startsWith(r + '/'));
}

/** 某落点是否被任一守卫覆盖（返回覆盖它的守卫名清单） */
function coveringGuards(relPath, scopes) {
  const list = Array.isArray(scopes) ? scopes : GUARD_SCOPES;
  return list.filter(s => (s.matchers || []).some(m => m(relPath))).map(s => s.guard);
}

module.exports = {
  GATEWAY_MEMBERSHIP_SCRIPT,
  REMOVED_MECHANISMS_SCRIPT,
  P2_INVARIANT_SCRIPT,
  P2_INVARIANT_PATHS,
  DOC_DRIFT_PATHS,
  GATEWAY_MEMBERSHIP_PATHS,
  GOVERNANCE_GUIDE_MAP_PATHS,
  SEMANTIC_ANCHOR_SCRIPT,
  ANCHOR_SCAN_ROOTS,
  GUARD_SCOPE_ROOTS,
  GUARD_SCOPES,
  matchesGlob,
  isUnderAnyRoot,
  coveringGuards,
};
