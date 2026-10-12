/** 校对会话状态（单一来源）：单文档短生命周期，报告后回收。⚠️ Issue #382：`session_id` 已彻底删除，会话身份由 `deriveSessionKey` 派生，AI 不传 key。 */

import { SessionData, DocInfo } from './proofread-types';

/** 会话问题存储（与 governance.js 的 sessions Map 解耦：两个进程两个内存空间）。Key = 文档派生 key；**不设容量上限与淘汰策略**（Map 只活到进程退出）。 */
export const sessionIssues = new Map<string, SessionData>();

/** 会话身份**唯一定义者**：由文档身份派生 key。契约：`filePath` 缺失（未保存文档）⇒ **返回 null，调用方必须拒绝**，不回落 `fileName`（未保存文档无落盘报告路径；回落会让两个未保存文档撞同一 key）。 */
export function deriveSessionKey(docInfo?: Partial<DocInfo> | null): string | null {
  const filePath = docInfo && typeof docInfo.filePath === 'string' ? docInfo.filePath.trim() : '';
  if (!filePath) return null;
  // 统一分隔符与大小写（Windows 路径不区分大小写）——同一文档不同写法不得产生两个会话
  return filePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** 报告生成后回收会话（报告是流程终点，数据已固化到报告文本）。命中删除返回 true。 */
export function releaseSession(sessionKey: string): boolean {
  return sessionIssues.delete(sessionKey);
}
