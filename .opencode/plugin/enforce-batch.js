/**
 * enforce-batch.js — 强制分批校对插件
 *
 * 拦截 wps_office_execute 调用，在 MCP 层之前执行校验：
 *
 * 规则 1：getDocumentParagraphs 单次请求不得超过 200 段
 * 规则 2：getDocumentParagraphs 必须从第 1 段开始，逐批推进（禁止跳跃；
 *         允许调回第 1 段重新开始——会重置所有状态）
 * 规则 3：proofreadBasic 必须传入正确的 startOffset
 * 规则 4：replaceRange / findReplace 必须在 proofreadBasic 之后调用
 * 规则 5：必须先获取文档信息并开始分批，才允许校对
 * 规则 6：修改前必须开启修订模式（enableTrackChanges(true)）
 *
 * 注意：findReplace 不支持修订模式跟踪。即使通过了修订模式检查，
 *      实际替换也不会产生修订标记。SKILL.md 已禁用 findReplace 用于校对修复。
 */

let prevEnd = 0;
let docInfoFetched = false;    // getActiveDocument 已调
let batchStarted = false;      // getDocumentParagraphs 至少调过一次
let batchCount = 0;            // 已处理的批次数（区分首批/后续）
let proofreadDone = false;     // 当前批是否已调过 proofreadBasic
let trackChangesOn = false;    // enableTrackChanges(true) 已调

export default async () => {
  return {
    "tool.execute.before": async (input, output) => {
      // 内置 MCP 工具：wps_get_active_document() → wps-office_wps_get_active_document
      if (input.name === "wps-office_wps_get_active_document") {
        docInfoFetched = true;
        return;
      }

      // 仅拦截走 wps_office_execute 网关的调用
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
        const start = toolArgs.start_paragraph ?? 1;
        const end = toolArgs.end_paragraph ?? (start + 49);
        const count = end - start + 1;

        if (start < 1) {
          throw new Error(`【分批插件】start_paragraph 必须 ≥ 1（当前值: ${start}）。`);
        }
        if (end < start) {
          throw new Error(`【分批插件】end_paragraph（${end}）必须 ≥ start_paragraph（${start}）。`);
        }

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
          // 允许调回第 1 段重新开始（重置所有校对状态）
          if (start === 1) {
            proofreadDone = false;
            batchCount = 0;
          } else {
            throw new Error(
              `【分批插件】批次不连续：上一批结束于段落 ${prevEnd}，` +
              `当前批从段落 ${start} 开始。批次必须从 ${prevEnd + 1} 开始逐批推进，` +
              `或从第 1 段重新开始。`
            );
          }
        }

        prevEnd = end;
        batchStarted = true;
        batchCount++;
        proofreadDone = false;
        return;
      }

      // ── 规则 5：必须先获取文档信息 + 启动分批 ──
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
        // 第二批及以后时，startOffset=0 一定是错的
        if (batchCount > 1 && so === 0) {
          throw new Error(
            `【分批插件】proofreadBasic startOffset=0 但不在文档开头（第 ${batchCount} 批）。` +
            `startOffset 应该从 getDocumentParagraphs 返回的本批第一段 [start] 值中取得。`
          );
        }
        proofreadDone = true;
        return;
      }

      // ── 规则 6 + 4：replaceRange / findReplace ──
      if (toolName === "replaceRange" || toolName === "findReplace") {
        if (!trackChangesOn) {
          throw new Error(
            `【分批插件】请先调用 enableTrackChanges(true) 开启修订模式，` +
            `再执行替换操作。所有修改必须在修订模式下进行。`
          );
        }
        // findReplace 不支持修订标记，在批处理流程中禁用
        if (toolName === "findReplace" && batchStarted) {
          throw new Error(
            `【分批插件】分批校对流程中禁止使用 findReplace（不支持修订标记）。` +
            `请改用 replaceRange 进行替换。`
          );
        }
        if (toolName === "replaceRange" && !proofreadDone) {
          throw new Error(
            `【分批插件】replaceRange 必须在同一批的 proofreadBasic 之后调用。` +
            `请先对当前批次执行 proofreadBasic 完成校对，再修复问题。`
          );
        }
      }
    }
  };
};
