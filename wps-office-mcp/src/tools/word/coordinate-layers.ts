/**
 * Input: 无（纯类型/纯函数模块）
 * Output: L1 字符偏移 / L2 段落索引 的**坐标层契约**（类型 + 收窄入口）
 * Pos: Issue #325「坐标系归一」**段 3（L1 + L2）** 的唯一契约来源。一旦被修改，请更新头部注释。
 *
 * 为什么单列一个模块：`proofread-*.ts` 受防腐预算轴 A 的**行数棘轮**约束（只降不升），
 * 而本契约是**纯新增的坐标系分层**，与校对业务逻辑无关 —— 把它塞进 `proofread-types.ts`
 * 会为「新增不变量」逼出「删别处代码凑数」的动机（#314 已记录的病根：名实不符）。
 * 故按职责落位：本模块 = 坐标层，`proofread-types.ts` 只 `export *`（保持类型可从原处导入）。
 *
 * 与 `DocumentTextSlice`（L1 切片契约，仍在 `proofread-types.ts`）的关系：
 *   · 本模块管「**位置字段本身属于哪一层**」（`DocumentAbsoluteOffset` / `ParagraphIndex`）；
 *   · `DocumentTextSlice` 是**某层的切片载体**（`baseOffset` 为 `DocumentAbsoluteOffset`）。
 *
 * 内容：L1/L2 两层定义 + 品牌载体 + 收窄入口，**不含**任何业务逻辑。
 */

/*
 * ── 两层坐标系（互不相通，严禁互算）──────────────────────────────────────────
 * 同一文档里有两个坐标层，历史上都由裸 `number` 承载，故可互相赋值（`resolveBatchRange`
 * 的 `[number, number]` 与字符区间**结构相同**）。本模块在**类型层**分开它们，
 * 使混用成为编译错误而非静默错位（编译期断言见
 * `src/tests/support/coordinate-layer-typecheck.ts`）。
 *
 * - **L1 字符偏移** `DocumentAbsoluteOffset`：文档原文绝对位置（UTF-16 code unit，
 *   段落标记 `¶` 计 1 字符）。生产方 `doc.Range.Start` / `getDocumentTextByRange.startOffset`。
 * - **L2 段落索引** `ParagraphIndex`：段落 **1 起序数**，与字符数无关。
 *   生产方 `getDocumentParagraphs.index`。
 *
 * **铁律：L1 与 L2 严禁互算**。段数 ↔ 字符数**没有**固定换算系数（一段可 1 字、可 10 万字），
 * 任何 `(endIndex - startIndex) * k` 的「段数换算字符数」都是**假上限**；需互证时必须
 * **显式取回文本**后按 L1 判定（如批次覆盖判定取「实际取回末段」）。命名约定：`...Offset/Length/Bytes`
 * 属 L1，`...ParaIndex/Paragraph/Range`（段落语义）属 L2；两者都不裸用 `number` 表达区间。
 */

/** 坐标层的**类型级出口**（品牌载体，勿直接使用）。`declare` 使品牌值不可在运行期取得。 */
declare const coordinateLayerBrand: unique symbol;

/**
 * 坐标层的品牌载体 —— L1 与 L2 之间**唯一机器可判**的分界。
 * 裸 `type A = number` 与 `type B = number` 是**透明别名**（可互相赋值），
 * 只写注释的「类型分离」在编译器眼里并不存在；品牌不同才能让误用报 TS2322。
 */
export type CoordinateBrand<T extends string> = number & {
  readonly [coordinateLayerBrand]: T;
};

/** **L1 字符偏移**（文档原文绝对偏移）：与 `ParagraphIndex` 品牌不同 ⇒ 不可互相赋值。 */
export type DocumentAbsoluteOffset = CoordinateBrand<'L1:document-absolute-offset'>;

/** **L2 段落索引**（1 起序数）：与 `DocumentAbsoluteOffset` 品牌不同 ⇒ 不可互相赋值。 */
export type ParagraphIndex = CoordinateBrand<'L2:paragraph-index'>;

/**
 * **L2 段落闭区间**（`start`/`end` 为 1 起段落序数，含端点）。
 * 用**具名对象**而非 `[number, number]`：后者与「L1 字符区间」结构相同、可互相赋值。
 */
export interface ParagraphRange {
  /** 起始段落索引（1 起，含） */
  start: ParagraphIndex;
  /** 结束段落索引（1 起，含） */
  end: ParagraphIndex;
}

/** 把裸 `number` **显式声明**为 L1 字符偏移（边界处唯一允许越过品牌的通道）。 */
export function asDocumentAbsoluteOffset(n: number): DocumentAbsoluteOffset {
  return n as DocumentAbsoluteOffset;
}

/** 把裸 `number` 显式声明为 L2 段落索引。语义同 `asDocumentAbsoluteOffset`。 */
export function asParagraphIndex(n: number): ParagraphIndex {
  return n as ParagraphIndex;
}
