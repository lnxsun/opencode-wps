<!--
OpenCode WPS 代码审查标准见 docs/CODE_REVIEW.md。
PR 合并前必须通过 CI 门禁（Prettier + ESLint + tsc --noEmit + 单测 + 覆盖率 + validate:* + 三平台语法）。
-->

## 关联 Issue
Closes #<编号>

## 改动摘要
（一句话说清做了什么，**不要贴 NPC 长文**）

## 提交类型
- [ ] feat / fix / refactor / docs / style / test / chore
- [ ] 是否 NPC 生成代码（是 → 必须通过 docs/CODE_REVIEW.md 第 5 节「NPC 专项审查」）

## 自查证据（合并前必须全绿，附命令输出）
- [ ] `npm run format:check`：✅ / ❌
- [ ] `npm run lint`（wps-office-mcp）：✅ / ❌
- [ ] `cd wps-office-mcp && npm run typecheck`（tsc --noEmit）：✅ / ❌
- [ ] `validate:settings` / `validate:versions` / `validate:toolcounts` / `validate:npc-team`：✅ / ❌
- [ ] 单测通过（`npm run test:unit` 或根 `tests/*`）：✅ / ❌（附关键用例）
- [ ] 覆盖率未下降：✅ / ❌
- [ ] 是否绕过 governance 红线（路径安全 / 破坏性确认 / 安装产物不入库 / 跨平台复用）：否 / 是（说明）

## 评审关注点
（请 reviewer / NPC 代码评审员重点看哪里）

## NPC 专项（如本 PR 由 NPC 生成，逐项确认）
- [ ] 无巨无霸（单文件 > 400 行 / 单函数 > 80 行 / 圈复杂度 > 15）
- [ ] 无三平台复制（复用 `shared/wps-bridge`）
- [ ] 无 `any` 逃逸（tsc + ESLint 已自动拦截）
- [ ] 无伪造完成（附真实测试输出，非 `expect(true).toBe(true)`）
- [ ] 改动有界（未顺手改无关模块）
- [ ] 已留痕（commit 含 `re: 评审第N轮 (Issue #xxx)`）
