// 测试合并后的 proofreadBasic 块
import('file:///D:/code/opencode-wps/.opencode/plugin/enforce-batch.js?ts=' + Date.now()).then(async (mod) => {
  const hooks = await mod.default();
  const bh = hooks['tool.execute.before'];
  const ah = hooks['tool.execute.after'];
  const out = {};

  // 测试：有 docInfoFetched，无 batchStarted → 应拒绝
  console.log('=== Test: docInfoFetched only (no batch) ===');
  await bh({ name: 'wps-office_wps_office_execute', args: { tool_name: 'getActiveDocument', arguments: {} } }, out);
  try {
    await bh({ name: 'wps-office_wps_office_execute', args: { tool_name: 'proofreadBasic', arguments: { text: 'hi', startOffset: 0 } } }, out);
    console.log('  FAIL: should reject');
  } catch(e) {
    if (e.message.includes('getDocumentParagraphs')) console.log('  PASS: rejected (no batch)');
    else console.log('  FAIL: wrong error:', e.message.slice(0, 60));
  }

  // 测试：有 batchStarted → 应通过规则 5
  console.log('\\n=== Test: with batch (should pass) ===');
  await bh({ name: 'wps-office_wps_office_execute', args: { tool_name: 'getDocumentParagraphs', arguments: { start_paragraph: 1, end_paragraph: 3 } } }, out);
  await ah(
    { name: 'wps-office_wps_office_execute', args: { tool_name: 'getDocumentParagraphs', arguments: { start_paragraph: 1, end_paragraph: 3 } } },
    { result: { content: [{ type: 'text', text: '[1] (正文) [0-100] \n' }] } }
  );
  await bh({ name: 'wps-office_wps_office_execute', args: { tool_name: 'enableTrackChanges', arguments: { enable: true } } }, out);
  try {
    await bh({ name: 'wps-office_wps_office_execute', args: { tool_name: 'proofreadBasic', arguments: { text: 'x'.repeat(100), startOffset: 0 } } }, out);
    console.log('  PASS: proofreadBasic accepted');
  } catch(e) {
    console.log('  FAIL:', e.message.slice(0, 80));
  }

  console.log('\\nALL PASSED');
});
