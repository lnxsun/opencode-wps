# 技术债登记（Tech Debt）

> 每 **双周 Tech Debt Day** 处理本表（见 `docs/CODE_REVIEW.md` 第 6.7 节）。
> 新增技术债请在此登记，并 `@` 负责人 + 预估迭代。PR 中引入的新债务须同步登记。
> 状态：`⬜ 待处理` / `🟡 处理中` / `✅ 已清理`。

---

## 1. 复杂度热点（ESLint `complexity` 警告，需拆分）

| 文件 | 函数 | 圈复杂度 | 目标 | 状态 | 负责人 |
|------|------|---------|------|------|--------|
| `wps-office-mcp/src/tools/word/proofread-report.ts` | 匿名异步函数 (≈L664) | 96 | ≤ 20 | ⬜ | |
| `wps-office-mcp/src/tools/word/proofread-report.ts` | 匿名异步函数 (≈L1176) | 88 | ≤ 20 | ⬜ | |
| `wps-office-mcp/src/tools/word/proofread-report.ts` | 匿名异步函数 (≈L1318) | — | ≤ 20 | ⬜ | |
| `wps-office-mcp/src/tools/excel/pivot.ts` | 匿名异步函数 (≈L395) | 41 | ≤ 20 | ⬜ | |
| `wps-office-mcp/src/tools/excel/pivot.ts` | 匿名异步函数 (≈L152) | 23 | ≤ 20 | ⬜ | |
| `wps-office-mcp/src/tools/word/proofread-report.ts` | 匿名异步函数 (≈L965) | — | ≤ 20 | ⬜ | |
| `wps-office-mcp/src/tools/excel/chart.ts` | 匿名异步函数 (≈L358) | 21 | ≤ 20 | ⬜ | |

> 这些是 NPC 生成的「巨无霸」函数（见 Issue #151 背景）。短期保持为 warning 不阻断合并，
> 长期按 Tech Debt Day 拆分；拆分时优先抽公共 helper，禁止新增跨平台复制。

---

## 2. 非空断言（`@typescript-eslint/no-non-null-assertion` 警告）

| 文件 | 行 | 状态 | 负责人 |
|------|----|------|--------|
| `wps-office-mcp/src/tools/word/proofread-report.ts` | ≈965, ≈1318 | ⬜ | |

> 改为显式空值校验或可选链；避免运行时因 `!` 触发崩溃。

---

## 3. 历史 `any` 残留

- **生产代码（`src/**/*.ts` 排除 `src/tests`）**：已通过 ESLint `no-explicit-any: error` 清零（2026-08-18 引入门禁时修复 `mac-poll-server.ts` 2 处）。
- **测试代码（`src/tests/**`）**：仍存在显式 `any`（`grep` 历史约 70 处，多在测试桩）。不阻断合并，但新增测试禁止 `any`；后续随测试重构清理。

---

## 4. 覆盖率目标

`wps-office-mcp/jest.config.js` 设 `coverageThreshold`（CI 强制，未达标则失败）。
当前阈值见该文件；目标逐步提升到全局 ≥ 60%、关键模块（`utils/path-safety`、`tools/common`、`tools/gateway`）≥ 80%。
未覆盖模块（如 `client/*` 平台相关、部分 `tools` 分支）优先补单测。

---

## 5. 跨平台重复 / 安装产物

- 三平台 handler 已抽到 `shared/wps-bridge`（Issue #151 重构），新增能力须复用，禁止另起炉灶。
- 安装产物（`~/.opencode/`、`%APPDATA%\kingsoft\wps\jsaddons\`）由 `install-addons.js` 同步，**禁止直接改源码外的运行目录**。

---

## 登记模板

```
| 模块 | 问题 | 影响 | 目标/方案 | 状态 | 负责人 | 计划迭代 |
|------|------|------|-----------|------|--------|----------|
```
