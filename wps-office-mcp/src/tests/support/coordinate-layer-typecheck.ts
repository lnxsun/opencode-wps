/**
 * Input: 生产 `proofread-types.ts` 的 L1/L2 坐标契约类型（**re-export**，不二次声明）
 * Output: **编译期**（`tsc`）断言：L1 字符偏移与 L2 段落索引**不可互相赋值**
 * Pos: Issue #325「坐标系归一」**段 3（L1 + L2）** 的类型级交付物。
 *
 * 为什么必须是**非 `.test.ts`** 文件：
 *   `wps-office-mcp/tsconfig.json` 的 `exclude` 含「星星 / 星 .test.ts」通配 —— 于是 `npm run` 里的
 *   `tsc --noEmit` **不会**检查测试文件的类型。若把 `@ts-expect-error` 写进 `.test.ts`，
 *   「品牌被换回透明别名」这一变异**不会**让 tsc 转红（假绿）。本文件位于 `src/tests/support/`
 *   （`.ts`，非 `.test.ts`），落在 `include: ["src/"+双星+"/"+星]` 内，故**真的参与编译**：
 *   品牌一旦退化为 `number`，文件内每条 `@ts-expect-error` 都会变成
 *   「Unused '@ts-expect-error' directive」而让 `tsc` 报错。
 *
 * 与 `document-text-coordinate-contract.ts` 的分工：
 *   · 该文件 = **运行期判据**（正判据 `isDocumentAbsoluteSlice` + 真实链路探测）；
 *   · 本文件 = **编译期判据**（品牌分离是否真的成立）。
 *   两者都从生产 `proofread-types.ts` 取类型，**均不二次声明**契约。
 *
 * 自证（变异必须转红）：把 `proofread-types.ts` 的
 *   `export type ParagraphIndex = CoordinateBrand<'L2:paragraph-index'>;`
 * 改回 `export type ParagraphIndex = number;` ⇒ `tsc` 报
 *   `error TS2578: Unused '@ts-expect-error' directive`（本仓库实测）。
 */

import {
  asDocumentAbsoluteOffset,
  asParagraphIndex,
  type DocumentAbsoluteOffset,
  type ParagraphIndex,
  type ParagraphRange,
} from '../../tools/word/coordinate-layers';

// ── 断言 ①：L1 与 L2 不可互相赋值（品牌不同 ⇒ TS2322）──────────────────────────
const offset: DocumentAbsoluteOffset = asDocumentAbsoluteOffset(0);
const para: ParagraphIndex = asParagraphIndex(1);

// @ts-expect-error L2 段落索引不得赋给 L1 字符偏移
export const asL1: DocumentAbsoluteOffset = para;
// @ts-expect-error L1 字符偏移不得赋给 L2 段落索引
export const asL2: ParagraphIndex = offset;
// @ts-expect-error 裸 number 不是任一品牌层（必须显式过收窄入口）
export const bare: ParagraphIndex = 3;

// ── 断言 ②：L2 区间是**具名对象**，与 L1 的 `[number, number]` 不再结构等价 ──────
export const range: ParagraphRange = { start: asParagraphIndex(1), end: asParagraphIndex(200) };
// @ts-expect-error 段落区间不是元组 —— L1 字符区间 `[number, number]` 不得冒充 L2
export const asTuple: [number, number] = range;
// @ts-expect-error 裸 number 元组不得赋给具名 L2 区间
export const fromTuple: ParagraphRange = [1, 200];

/** 供运行期用例取用的数值（证明上面的类型断言引用的是真实值，不是悬空符号） */
export const typecheckSamples = { asL1, asL2, bare, range, asTuple, fromTuple } as const;
