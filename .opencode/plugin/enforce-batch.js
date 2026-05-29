/**
 * enforce-batch.js — 强制分批校对插件
 *
 * 拦截 wps_office_execute 调用，在 MCP 层之前执行校验：
 *
 * 规则 1：getDocumentParagraphs 单次请求不得超过 200 段
 * 规则 2：getDocumentParagraphs 必须从第 1 段开始，逐批推进（禁止跳跃）
 * 规则 3：proofreadBasic 必须传入正确的 startOffset（从段落 [start-end] 提取）
 * 规则 4：replaceRange 必须在 proofreadBasic 之后调用（禁止无校对直接修复）
 * 规则 5：文档 >200 段落时，必须先获取文档信息并开始分批，才允许校对
 * 规则 6：修改前必须开启修订模式（enableTrackChanges(true)）
 */

let prevEnd = 0;
let proofreadDone = false;
let docInfoFetched = false;   // getActiveDocument 已调
let batchStarted = false;     // getDocumentParagraphs 至少调过一次
let trackChangesOn = false;   // enableTrackChanges(true) 已调

export default async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.name !== "wps-office_wps_office_execute") return;

      const toolName = input.args?.tool_name;
      const toolArgs = input.args?.arguments || {};

      // ── 跟踪 getActiveDocument ──
      if (toolName === "getActiveDocument") {
        docInfoFetched = true;
        return;
      }

      // ── 跟踪 enableTrackChanges ──
      if (toolName === "enableTrackChanges") {
        trackChangesOn = toolArgs.enable === true;
        return;
      }

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
          if (start !== 1) {
            throw new Error(
              `【分批插件】批次不连续：上一批结束于段落 ${prevEnd}，` +
              `当前批从段落 ${start} 开始。批次必须从 ${prevEnd + 1} 开始逐批推进。`
            );
          }
        }

        prevEnd = end;
        batchStarted = true;
        proofreadDone = false;
        return;
      }

      // ── 规则 5：必须先获取文档信息 + 启动分批（仅文档 >200 段时）──
      if (toolName === "proofreadBasic") {
        if (!docInfoFetched) {
          throw new Error(
            `【分批插件】请先调用 getActiveDocument 了解文档总段落数，` +
            `输出分批校对计划后，再开始校对。`
          );
        }
        if (!batchStarted) {
          throw new Error(
            `【分批插件】请先调用 getDocumentParagraphs 获取第一批段落，` +
            `确认分批计划后，再调 proofreadBasic。未输出分批计划前不得开始校对。`
          );
        }
      }

      // ── 规则 3：proofreadBasic startOffset 校验 ──
      if (toolName === "proofreadBasic") {
        const so = toolArgs.startOffset;
        if (so === undefined || so === null) {
          throw new Error(
            `【分批插件】proofreadBasic 缺少 startOffset 参数。` +
            `必须传入本批第一段的字符起始位置（从 getDocumentParagraphs 返回的 [start-end] 中提取）。`
          );
        }
        if (prevEnd > 200 && so === 0) {
          throw new Error(
            `【分批插件】proofreadBasic startOffset=0 但当前不在文档开头。` +
            `startOffset 应该从 getDocumentParagraphs 返回的本批第一段 [start] 值中取得。`
          );
        }
        proofreadDone = true;
        return;
      }

      // ── 规则 6 + 4：replaceRange ──
      if (toolName === "replaceRange") {
        if (!trackChangesOn) {
          throw new Error(
            `【分批插件】请先调用 enableTrackChanges(true) 开启修订模式，` +
            `再执行替换操作。所有修改必须在修订模式下进行。`
          );
        }
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
