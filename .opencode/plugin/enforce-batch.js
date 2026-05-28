/**
 * enforce-batch — WPS Office 分段强制执行插件
 *
 * Hook: tool.execute.before
 * 自动将 getDocumentParagraphs 的请求范围限制在 ≤200 段，
 * 防止 AI 一次请求 1600 段导致 COM 超时。
 */
export default (async () => {
  const MAX_BATCH = 200;

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "wps_office_execute") return;
      if (!output.args || output.args.tool_name !== "getDocumentParagraphs") return;

      const inner = output.args.arguments || {};
      const start = inner.start_paragraph ?? 1;
      const end = inner.end_paragraph ?? (start + 49);
      const requested = end - start + 1;

      if (requested <= MAX_BATCH) return;

      const clampedEnd = start + MAX_BATCH - 1;
      output.args = {
        ...output.args,
        arguments: {
          ...inner,
          start_paragraph: start,
          end_paragraph: clampedEnd,
        },
      };
    },
  };
});
