content.ts, document.ts, format.ts, index.ts, proofread.ts, proofread-report.ts, proofread-types.ts, proofread-normalize.ts, proofread-session.ts
Word 工具定义与处理器目录，含内容操作/文档管理/格式化/校对模块。
- proofread.ts：基础校对 + 修订模式 + 替换（#55 T1 结构化输出）
- proofread-report.ts：六维评分报告累加/生成（#55 T2 type 兜底、T3 修订数口径；
  #70 验收遗留：TC-13 source 兜底、F14 修饰不当误判修正、奇数修订口径、落盘失败语义）
- proofread-types.ts：校对报告共享类型 + 跨运行时常量（`PROOFREAD_BATCH_MAX` 批次上限单一来源；原 proofread-store.ts 已并入，Issue #352）
- proofread-normalize.ts：类型/来源/位置归一化 + 修复动作裁决（`resolveFixAction` 单点）+ 评分权重公式（Issue #270 单文件拆分）
- proofread-session.ts：进程内会话 Map（无容量上限、无淘汰、不落盘，Issue #270 单文件拆分）
一旦这里的结构发生变化，请务必更新我。

## 校对模块（proofread.ts / proofread-report.ts）

- `proofread.ts`：基础校对规则引擎 + `proofreadBasic`（结构化输出 issues JSON，供治理插件 P2 报告校验 / P3 替换内容校验消费）
- `proofread-report.ts`：六维校对报告（accumulate 累加 + generate 报告；**纯 TS 逻辑 ⇒ 直连注册**，Issue #382 取消网关专属）

> 📦 **结构（Issue #270 单文件拆分）**：`proofread-report.ts` 现仅保留两个工具 handler 与报告生成逻辑；
> 类型定义抽到 `proofread-types.ts`、纯归一化/类型推断逻辑抽到 `proofread-normalize.ts`、
> 会话状态管理抽到 `proofread-session.ts`。
> ⚠️ `proofread-report.ts` 的 `export *` 再导出**已移除**（Issue #314）：符号一律从定义模块导入，
> 避免「同一符号多个可导入位置」使定义点不可辨。回归网见 `src/tests/unit/proofread-normalize-contract.test.ts`
> 与 `proofread-fixaction-gate-e2e.test.ts`（Issue #341）。

### proofread-report.ts 功能清单（#55/#70 演进）

- **T2 type 兜底**：accumulate 入口对缺 type / type='ai'（SKILL 合并 bug 产物）的 issue 调用
  `normalizeIssueType`（trim 归一化 + `inferTypeFromContent` 文本推断），避免报告六维全 10 分失真
- **TC-13 source 兜底**（#70）：accumulate 入口对缺 source 的 issue 调用 `normalizeIssueSource`——
  大小写归一（MCP/AI→小写）、F11–F15 AI 专属模式（`AI_ONLY_PATTERN`，F14 需数量词+丰富/充分
  同时出现，避免"丰富的经验"误判）→ ai、Layer 1 规则命中 → mcp、无法判断 → 保守 mcp；
  报告"未标注来源"统计不再失真
- **T3/TC-12 修订数口径**：报告明确"问题数 = 修订记录数 ÷ 2"；奇数修订（删除类修复只产生 1 条）
  显示 `≈N.N` 并提示"换算不整除、请人工核对"，不再误导性硬算
- **报告写盘失败语义**（#70）：generate 指定 `output_file` 时，报告文件写盘失败返回 `success=false` + 失败原因
  （含目标路径），会话保留供修正路径后重试；成功（或未指定）才回收会话。空报告/主报告两分支
  均自动创建父目录，行为一致
- **报告生成后会话释放**（评审第 3 轮 I3）：报告生成成功即 `releaseSession`（仅清内存 Map），
  「报告是流程终点」。如需二次生成（换路径/格式），需重新 `proofreadAccumulate` 累加后再生成
- **报告生成**：六维评分（fluency/conciseness/accuracy/consistency/completeness/format）原始分 [1,5]
  → 归一化 [0,2] → X.X/10 展示，含雷达图 JSON、按维度问题详情、统计摘要（MCP/AI 来源计数）

### proofread-report.ts 功能清单（Issue #116 新增）

- **必填字段校验**：accumulate 入口对缺 `original`/`suggestion`（或空串）的 issue 明确报错，
  而非静默通过——早期暴露错误（而非报告阶段因 `.replace()` 读 undefined 而崩溃）
- **报告生成器兜底**：`.replace()` 处统一改为 `(issue.original || '')`，即使历史坏数据漏过校验也不崩溃
- **会话仅在进程内**（Issue #325）：accumulate 只累加到进程内 Map，报告生成成功即回收。
  会话不落盘、无 LRU 淘汰——报告是流程终点的一次性产物，重跑校对重读文档即可（见 `proofread-session.ts` 头注释）
- **疑似问题机制**：accumulate 支持 `suspected_issues` 参数（AI 识别但未确认的问题），
  报告单独列出「待确认问题」节并标注「未修改，请人工核对」，不纳入六维评分
