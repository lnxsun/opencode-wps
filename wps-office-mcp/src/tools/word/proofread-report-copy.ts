/**
 * 校对报告**文案与口径声明**的唯一定义者。
 *
 * 为什么单列一文件：报告文案（含「口径说明 / 证据告警 / 门禁提示」）是报告**唯一面向用户**的输出，
 * 必须能被单独审阅与约束；把它与报告逻辑混在一处会让两者互相抬高体量、且文案改动淹没在逻辑 diff 里。
 * ⚠️ 本文件**计入**校对线体量闸门（scripts/validate-proofread-report-size.js 的 REPORT_SOURCES）——
 * 单列不等于免约束：把它当「不计行的文案抽屉」正是本闸门要防的形态。
 * 文案即契约：任何一条被改/被删，都会改变用户读到的结论，须同步 docs 与测试。
 */
export const GATE_TAIL = `覆盖全文后再重新调用 generateProofreadReport。`;
export const GATE_PARTIAL = (done: number, total: number) => `【完整性门禁】本次校对尚未完成，**禁止生成报告**：\n已校对到第 ${done} 段，文档共 ${total} 段，尚有 ${total - done} 段未校对。\n请继续完成剩余段落（每段走完整步骤链并 proofreadAccumulate 上报 _processed_to_paragraph），${GATE_TAIL}`;
export const GATE_NO_TRACE = (total: number) => `【完整性门禁】本次校对无任何进度依据（_processed_to_paragraph 从未上报）且无校对痕迹，**禁止生成报告**：\n文档共 ${total} 段，但服务端未追踪到任何已校对进度，无法证明覆盖全文。\n请从第 1 段起逐批走完整步骤链（每批 proofreadAccumulate 携带 _processed_to_paragraph），${GATE_TAIL}`;
export const CROSS_MISSING = (issueCount: number, revisions: number, diff: number) => `⚠️ **疑似统计缺失**：累计 issue ${issueCount} 处，但修订记录仅 ${revisions} 条。即使按最紧口径（每条 issue 至少消耗 1 条修订，删除类修复）也无法解释 ${diff} 处，存在批次未正确累加/丢失的可能，请人工核对修订记录与问题清单，必要时重跑缺失批次。`;
export const CROSS_EXTRA = (revisions: number, claimed: number, reportOnly: number) => `⚠️ **疑似未记录修复**：修订记录 ${revisions} 条，但仅累计 ${claimed} 处**声称已修**问题（全替换修复下修订约 2×问题数=${claimed * 2}；另 ${reportOnly} 处标记为「仅报告未修」，不产生修订，不计入本校验）。修订数明显多于问题数，可能存在未累加的修复或非校对产生的修订，请人工核对修订记录与问题清单。`;
export const SKIP_TITLE = `## 🔍 跳过范围披露（表格密集非正文区）`;
export const SKIP_NOTE = (total: number) => `> ⚠️ **口径说明**：以下 ${total} 段被判定为「表格密集非正文段」（整批为表格单元格且无正文叙述句），按 Issue #294 策略**整块跳过逐段校对**——它们**已计入覆盖进度**（不影响完整性门禁），但**未逐段走 proofreadBasic 校对链**。请知悉：「覆盖 ✅」≠「逐段校对 ✅」。`;
export const SKIP_TAIL = `> ℹ️ 若对跳过区间是否确为「非正文表格段」存疑，请人工抽查上述区间；如需逐段校对，可对该区间单独发起一次校对（不携带 skipped_segments）。`;
export const EMPTY_SUSPECTED = `正式问题 0 处；另有待确认疑似问题，见下方「待确认问题」节，请人工核对。`;
export const EMPTY_WITH_REVS = (n: number) => `✓ 本轮校对未检测到问题（规则 + AI 检测覆盖有限，低于满分不代表绝对无错）。注意：文档当前有 ${n} 条修订记录——请核对其中几项为本轮实际修复，而非文档既有修订。`;
export const EMPTY_CLEAN = `✓ 本轮校对未检测到问题（规则 + AI 检测覆盖有限，不代表文档绝对无错）。`;
export const EMPTY_BASELINE_ZERO = `- **修订总数**: 0（WPS 修订模式未记录任何修订——已拿到修订基线，非未提供数据）\n`;
export const SUSPECT_NOTE = `> **说明**：以下问题由 AI 在校对过程中识别为疑似问题，但尚未确认是否为真实错误，未进行修改。请人工核对后决定是否处理。`;
export const UNKNOWN_NOTE = `> **提示**：以下问题未携带有效的 type 字段（或 type 不在 TYPE_METRIC_MAP 映射表中），无法归入六维评分。请检查 AI 层（Layer 2）输出是否携带正确的 type 字段，或补充 TYPE_METRIC_MAP 映射。`;
export const ALL_FIXED = `| 全部已修复 | ✅ |\n`;
/** RC-7（Issue #395）：revs>0 时的头部口径——与 EMPTY_WITH_REVS 同源，禁用「未发现待修复问题」。 */
export const ALL_FIXED_REVS = (n: number) => `— 待核对（文档有 ${n} 条修订，见下方说明）`;
export const INFERRED = (total: number, count: number, reasons: string) => `> ℹ️ **口径说明**：本次 ${total} 处问题中有 ${count} 处修复归因来自服务端推断（${reasons}），已按「已修」计入——「全部已修复 ✅」的修复归因来自 **AI 自述 + 缺省推断**，非客观核实。如需严格核对，请以「修正清单」与 WPS 修订记录为准。\n`;
export const NO_EVIDENCE = (total: number, claimed: number) => `| 覆盖状态 | ✅ 已覆盖全文 |\n| 全部已修复 | ❌ 未确认（修订记录为 0，无法证明已修） |\n> ⚠️ **修复证据缺失**：本次累计 ${total} 处问题中有 ${claimed} 处标记为「已修」（fix_action≠report_only），但**修订总数为 0**——WPS 修订模式未记录任何修订，说明这部分「已修」未真正落盘。\n> 「全部已修复」不可信，请核对 replaceInParagraph 是否真正执行成功。\n`;
export const NOT_ALL_FIXED = (total: number, reportOnly: number, inferred: string) => `| 覆盖状态 | ✅ 已覆盖全文 |\n| 全部已修复 | ❌ 未达成（${reportOnly} 处仅报告未修） |\n> ⚠️ **覆盖完整但并未全部修复**：本次共 ${total} 处问题中有 ${reportOnly} 处标记为「仅报告未修」（fix_action=report_only，如误报回避或替换失败），**按 fix_action 归类已修** ${total - reportOnly} 处${inferred}\n> 「全部已修复」不可信，请以「修正清单」逐条核对未修项。\n`;
export const COVERAGE_UNKNOWN = (processed: string, total: string) => `| ⚠️ 覆盖状态 | 未确认完整（已上报 ${processed}/${total} 段） |\n> ⚠️ **本次校对未确认覆盖全文**，「全部已修复」状态不可信。请核对是否遗漏段落或进度上报缺失。\n`;
export const DATA_MISSING = (claimed: number) => `> ⚠️ **修复归因未经客观校验**：共 ${claimed} 处标记为「已修」，但本次未提供修订总数（totalRevisions），无法用 WPS 修订记录交叉验证其真实性。\n`;
export const TC12_HEAD = (issueCount: number, reportOnly: number, claimed: number) => `\n> **TC-12 口径说明**：本报告「发现问题」按 AI 累计的 issue 条数计（共 ${issueCount} 处）` + (reportOnly > 0 ? `，其中 ${reportOnly} 处标记为「仅报告未修」（不产生修订，**不参与本校验**），本校验基准为「声称已修」${claimed} 处` : '');
export const TC12_REVS = (revisions: number, expected: string) => `；「修订总数」${revisions} 条为 WPS 修订模式实际记录数（每次替换 = 删除 + 插入各 1 条修订，故 修订数 ÷ 2 ≈ 替换类问题数 = ${expected}）`;
export const TC12_ODD = `。⚠️ 当前修订数为奇数（删除类修复只产生 1 条修订，如“存在着→空”），修订数 ÷ 2 不整除，请人工核对修订记录与问题清单。\n`;
export const TC12_MATCH = `，与「声称已修」问题数一致。请以「发现问题」清单为准。\n`;
export const TC12_NONE = (revisions: number) => `。ℹ️ 本次**无任何「声称已修」条目**（全部为「仅报告未修」），故上述 ${revisions} 条修订不来自本次校对的修复动作，应视为**校对开始前的既有修订基线或非校对编辑**——如与预期不符，请人工核对修订记录。\n`;
export const TC12_MISMATCH = (expected: number, claimed: number) => `。⚠️ **修订记录与声称已修问题数对不上**：按修订数推算的替换类问题数（${expected}）与「声称已修」问题数（${claimed}）不一致——通常由删除类修复（1 条修订）或批次漏报名导致，请人工核对。\n`;
export const suspectedHeading = (n: number, heading: string) => `${heading} ⚠️ 待确认问题（未修改，请人工核对） — ${n} 处\n\n`;
export const unknownHeading = (n: number) => `### ⚠️ 未分类问题（未计入六维评分） — ${n} 处\n\n`;
