/**
 * 报告「纯格式问题」类型集的**单源派生锁**（Issue #352 压缩方案 A/B 的第 1 轮评审 F1-1 落地）。
 *
 * 背景：`proofread-report.ts` 的 `FORMAT_TYPES` 原为**静态字面量**（第二份定义），
 * 与 `TYPE_METRIC_MAP` 的 `format` 维度属同一概念的两处写，任一处漂移都会让「纯格式问题」
 * 统计与维度映射分叉。本 PR 已改为从 `TYPE_METRIC_MAP` 派生；本文件锁该契约。
 *
 * ⚠️ 诚实披露（第 6 轮评审实测）：**行为断言无法区分「派生」与「等值字面量」**——
 * 实测把实现改回原字面量，本文件的行为用例仍全绿（两集合恰好相等）。
 * 故「单源」这一**形态**不变量另由源码级断言(③)承担，行为断言(①②)只锁**语义**（维度归属正确）。
 * 二者**分工并存、互不可推**：行为锁语义、源码锁形态。
 */
// uuid v14 是 ESM-only，Jest CJS 无法解析 → 按既有惯例手动 mock
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

import * as fs from 'fs';
import * as path from 'path';
import { computeSourceSummary } from '../../tools/word/proofread-report';
import { TYPE_METRIC_MAP } from '../../tools/word/proofread-normalize';
import { ProofreadIssueEntry } from '../../tools/word/proofread-types';

/** 构造最小 issue */
function issue(over: Partial<ProofreadIssueEntry> = {}): ProofreadIssueEntry {
  return {
    offset: 0,
    length: 1,
    original: 'x',
    suggestion: 'y',
    type: '重复字符',
    context: '...',
    source: 'ai',
    ...over,
  } as ProofreadIssueEntry;
}

const formatTypes = () => Object.keys(TYPE_METRIC_MAP).filter(t => TYPE_METRIC_MAP[t] === 'format');

describe('①② 行为：formatCount 语义 = 映射的 format 维度', () => {
  it('每个 format 维度 type 均计入 formatCount（全集，防漏）', () => {
    const fts = formatTypes();
    expect(fts.length).toBeGreaterThan(0);
    expect(computeSourceSummary(fts.map(t => issue({ type: t }))).formatCount).toBe(fts.length);
  });

  it('非 format 维度 type 一律不计入（防「把非格式算成格式」）', () => {
    const nonFormat = Object.keys(TYPE_METRIC_MAP).filter(t => TYPE_METRIC_MAP[t] !== 'format');
    expect(computeSourceSummary(nonFormat.map(t => issue({ type: t }))).formatCount).toBe(0);
  });
});

describe('③ 形态：FORMAT_TYPES 必须派生自 TYPE_METRIC_MAP（不得内联第二份字面量）', () => {
  it('源码级断言：FORMAT_TYPES 由 TYPE_METRIC_MAP 过滤得到（变异自证：改回字面量即转红）', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'tools', 'word', 'proofread-report.ts'),
      'utf8'
    );
    // 必须存在「从 TYPE_METRIC_MAP 派生」的表达式；内联数组字面量（含多个 type 中文字面量）即失败
    expect(/FORMAT_TYPES\s*=\s*Object\.keys\(TYPE_METRIC_MAP\)/.test(src)).toBe(true);
    expect(/FORMAT_TYPES\s*=\s*\[\s*'/.test(src)).toBe(false);
  });
});
