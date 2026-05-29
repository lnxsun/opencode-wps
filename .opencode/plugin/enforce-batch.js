/**
 * enforce-batch.js — 强制分批校对插件
 *
 * 拦截 wps_office_execute 调用，在 MCP 层之前执行校验：
 *
 * 规则 1：getDocumentParagraphs 单次请求不得超过 200 段
 * 规则 2：getDocumentParagraphs 必须从第 1 段开始，逐批推进（禁止跳跃）
 * 规则 3：proofreadBasic 必须传入正确的 startOffset（从段落 [start-end] 提取）
 * 规则 4：replaceRange 必须在 proofreadBasic 之后调用（禁止无校对直接修复）
 */

let prevEnd = 0;        // 上一批的结束段落号
let proofreadDone = false;  // 当前批是否已调过 proofreadBasic

export default async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.name !== "wps-office_wps_office_execute") return;

      const toolName = input.args?.tool_name;
      const toolArgs = input.args?.arguments || {};

      // ── 规则 1 + 2：getDocumentParagraphs ──
      if (toolName === "getDocumentParagraphs") {
        const start = toolArgs.start_paragraph || 1;
        const end = toolArgs.end_paragraph || (start + 49);
        const count = end - start + 1;

        // 规则 1：单次最多 200 段
        if (count > 200) {
          throw new Error(
            `【分批插件】getDocumentParagraphs 单次请求 ${count} 段，` +
            `超过上限 200 段。请按每批 200 段分批获取：` +
            `start_paragraph=${start}, end_paragraph=${Math.min(start + 199, end)}。`
          );
        }

        // 规则 2：批次必须连续（从第 1 段开始，逐批推进）
        if (prevEnd > 0 && start !== prevEnd + 1) {
          // 允许重新从头开始（回到第 1 段）
          if (start !== 1) {
            throw new Error(
              `【分批插件】批次不连续：上一批结束于段落 ${prevEnd}，` +
              `当前批从段落 ${start} 开始。批次必须从 ${prevEnd + 1} 开始逐批推进。`
            );
          }
        }

        prevEnd = end;
        proofreadDone = false;  // 新批次，重置校对状态
      }

      // ── 规则 3：proofreadBasic ──
      if (toolName === "proofreadBasic") {
        const so = toolArgs.startOffset;
        if (so === undefined || so === null) {
          throw new Error(
            `【分批插件】proofreadBasic 缺少 startOffset 参数。` +
            `必须传入本批第一段的字符起始位置（从 getDocumentParagraphs 返回的 [start-end] 中提取）。`
          );
        }
        // 非首批时，startOffset 不应该为 0（文档开头才是 0）
        if (prevEnd > 200 && so === 0) {
          throw new Error(
            `【分批插件】proofreadBasic startOffset=0 但当前不在文档开头。` +
            `startOffset 应该从 getDocumentParagraphs 返回的本批第一段 [start] 值中取得。`
          );
        }
        proofreadDone = true;
      }

      // ── 规则 4：replaceRange ──
      if (toolName === "replaceRange") {
        if (!proofreadDone) {
          throw new Error(
            `【分批插件】replaceRange 必须在同一批的 proofreadBasic 之后调用。` +
            `请先对当前批次执行 proofreadBasic 完成校对，再修复问题。`
          );
        }
      }
    }
  };
};
