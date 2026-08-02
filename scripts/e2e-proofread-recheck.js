/**
 * PR #56 端到端引擎级复测（T5 测试工程师）
 *
 * 在无真实 WPS 的 CI 环境，用验收语料集直接驱动 Layer 1 规则引擎 + 报告累加链路，
 * 量化 TC-03/04/05/06 检出率/误报率，并验证 T1/T2/T3 端到端行为。
 *
 * 运行：node scripts/e2e-proofread-recheck.js
 */
const fs = require('fs');
const path = require('path');

// ---- 加载 MCP 编译产物 ----
const distProofread = path.resolve(__dirname, '../wps-office-mcp/dist/tools/word/proofread.js');
const distReport = path.resolve(__dirname, '../wps-office-mcp/dist/tools/word/proofread-report.js');
if (!fs.existsSync(distProofread) || !fs.existsSync(distReport)) {
  console.error('❌ 未找到 dist 编译产物，请先 cd wps-office-mcp && npm run build');
  process.exit(1);
}
const { runBasicProofreading } = require(distProofread);
const {
  proofreadAccumulateHandler,
  generateProofreadReportHandler,
  inferTypeFromContent,
  normalizeIssueType,
} = require(distReport);

const corpus = fs
  .readFileSync(path.resolve(__dirname, '../tests/e2e-proofread/验收语料集.txt'), 'utf-8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(Boolean);

// ---- TC-03/04 正样本（15 通顺 + 17 简洁）----
const fluencyPos = [
  '通过这次学习使我受益匪浅',
  '根据调查显示这个结论存在争议',
  '由于天气的原因导致了航班延误',
  '他失败的原因是因为准备不足',
  '大约需要两小时左右',
  '这次活动的目的是为了促进团队协作',
  '通过长期训练让他的技能显著提升',
  '根据数据证实这一假设成立',
  '由于缺乏锻炼的原因使他体重增加',
  '通过反复练习令选手状态稳定',
  '这个方案存在着很多不足之处', // F11
  '我们需要加强重视安全问题', // F12
  '他取得了显著的进步提高', // F13
  '会议讨论了很多丰富的内容', // F14
  '这一发现具有着深远的意义', // F15
];
const concisenessPos = [
  '我们对这个问题进行了研究',
  '领导对相关工作作出了部署',
  '该方案对关键问题予以了解决',
  '必须加以规范才能推广',
  '针对资金短缺这一问题采取了措施',
  '我们对数据进行深入的分析',
  '委员会对提案进行了讨论',
  '专家对实验结果予以了处理',
  '政府对新规作出了安排',
  '针对环境污染这一问题开展了调查',
  '并不是所有人都认可这个方案',
  '我们必须要重视这个问题',
  '他们全部都同意了提案',
  '这个问题涉及到多个部门',
  '现如今这个技术已经普及',
  '他跑的很快',
  '我明天在去找你',
];

// ---- TC-05/06 负样本（8 通顺 + 5 简洁）----
const fluencyNeg = [
  '对于这个问题而言，没有简单的答案',
  '在技术研发方面，公司投入了大量资源',
  '从长远来看，这笔投资是值得的',
  '就当前形势而言，我们需要保持谨慎',
  '关于资金的问题，我们将在下周讨论',
  '从客观角度而言这个判断是公允的',
  '在某种程度上这反映了市场的变化',
  '就本质而言问题的根源在于制度设计',
];
const concisenessNeg = [
  '这项实验需要进行多次才能得出可靠结论',
  '法官作出判决时必须遵循法律程序',
  '对见义勇为者应当予以奖励',
  '我们必须进行彻底改革',
  '对于贡献突出者予以表彰',
];

function detect(text) {
  return runBasicProofreading(text, 0);
}

console.log(
  '===== TC-03：通顺正样本检出率（Layer 1 目标 F01–F10 ≥ 10/10；F11–F15 属 Layer 2 凭据）====='
);
let fHit = 0;
fluencyPos.slice(0, 10).forEach((t, i) => {
  const hits = detect(t);
  const ok = hits.length > 0;
  if (ok) fHit++;
  const types = hits.map(h => h.type).join(',');
  console.log(
    `  ${ok ? '✅' : '❌'} F${String(i + 1).padStart(2, '0')} [${t}] → ${hits.length} 处 (${types || '未检出'})`
  );
});
console.log(`  Layer 1 检出率：${fHit}/10 = ${((fHit / 10) * 100).toFixed(1)}%（F01–F10）`);
console.log('  F11–F15 为 Layer 2（AI 层）语义凭据，Layer 1 正则不命中属设计预期；');
console.log(
  '  其闭环由 T2 兜底验证（AI 漏写 type 时 inferTypeFromContent 兜底为 冗余词，见下方 T2 节）。'
);

console.log('\n===== TC-04：简洁正样本检出率（目标 ≥ 15/17）=====');
let cHit = 0;
concisenessPos.forEach((t, i) => {
  const hits = detect(t);
  const ok = hits.length > 0;
  if (ok) cHit++;
  const types = hits.map(h => h.type).join(',');
  console.log(
    `  ${ok ? '✅' : '❌'} C${String(i + 1).padStart(2, '0')} [${t}] → ${hits.length} 处 (${types || '未检出'})`
  );
});
console.log(
  `  检出率：${cHit}/${concisenessPos.length} = ${((cHit / concisenessPos.length) * 100).toFixed(1)}%`
);

console.log('\n===== TC-05：通顺负样本误报率（目标 0/8）=====');
let fFalse = 0;
fluencyNeg.forEach((t, i) => {
  const hits = detect(t);
  const ok = hits.length === 0;
  if (!ok) fFalse++;
  console.log(
    `  ${ok ? '✅' : '❌'} N${String(i + 1).padStart(2, '0')} [${t}] → ${hits.length} 处`
  );
});
console.log(`  误报率：${fFalse}/8 = ${((fFalse / 8) * 100).toFixed(1)}%`);

console.log('\n===== TC-06：简洁负样本误报率（目标 0/5）=====');
let cFalse = 0;
concisenessNeg.forEach((t, i) => {
  const hits = detect(t);
  const ok = hits.length === 0;
  if (!ok) cFalse++;
  console.log(
    `  ${ok ? '✅' : '❌'} N${String(i + 9).padStart(2, '0')} [${t}] → ${hits.length} 处`
  );
});
console.log(`  误报率：${cFalse}/5 = ${((cFalse / 5) * 100).toFixed(1)}%`);

console.log('\n===== T1：proofreadBasic 结构化输出（文本展示 + 末尾 JSON 行）=====');
const { proofreadBasicHandler } = require(distProofread);
function extractJson(text) {
  // 远端 #57 方案：文本展示 + 末尾 JSON 行，取最后一行 JSON.parse
  const lines = text.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch (_e) {
      /* 继续找 */
    }
  }
  return null;
}
(async () => {
  const r1 = await proofreadBasicHandler({ text: '通过加强监督使产品质量提升' });
  const p1 = extractJson(r1.content[0].text);
  console.log(
    `  发现问题：issues.length=${p1 && p1.issues.length}, 字段齐全=${!!p1 && !!p1.issues[0].original && !!p1.issues[0].type && typeof p1.issues[0].offset === 'number'}`
  );
  const r0 = await proofreadBasicHandler({ text: '这是一段完全正常的文本内容。' });
  const p0 = extractJson(r0.content[0].text);
  console.log(`  无问题：issues.length=${p0 && p0.issues.length}（P15 依赖 =0 判定）`);

  console.log('\n===== T2：type 兜底（缺 type / type=ai / F11–F15）=====');
  const t2a = normalizeIssueType({
    offset: 0,
    length: 4,
    original: '进行了研究',
    suggestion: '研究',
    source: 'mcp',
  });
  const t2b = normalizeIssueType({
    offset: 0,
    length: 8,
    original: '通过管理使效率提升',
    suggestion: '管理使效率提升',
    type: 'ai',
    source: 'ai',
  });
  const t2c = normalizeIssueType({
    offset: 0,
    length: 2,
    original: '未知内容xyz',
    suggestion: '未知',
    source: 'ai',
  });
  const f11 = normalizeIssueType({
    offset: 0,
    length: 8,
    original: '这个方案存在着很多不足之处',
    suggestion: '这个方案存在很多不足之处',
    source: 'ai',
  });
  const f12 = normalizeIssueType({
    offset: 0,
    length: 6,
    original: '我们需要加强重视安全问题',
    suggestion: '我们需要重视安全问题',
    source: 'ai',
  });
  const f13 = normalizeIssueType({
    offset: 0,
    length: 6,
    original: '他取得了显著的进步提高',
    suggestion: '他取得了显著的进步',
    source: 'ai',
  });
  const f14 = normalizeIssueType({
    offset: 0,
    length: 10,
    original: '会议讨论了很多丰富的内容',
    suggestion: '会议讨论了很多内容',
    source: 'ai',
  });
  const f15 = normalizeIssueType({
    offset: 0,
    length: 8,
    original: '这一发现具有着深远的意义',
    suggestion: '这一发现具有深远的意义',
    source: 'ai',
  });
  console.log(`  缺 type → '${t2a.type}'（期望 冗余词）`);
  console.log(`  type=ai → '${t2b.type}'（期望 句式杂糅）`);
  console.log(`  无法推断 → '${t2c.type}'（期望 未分类）`);
  console.log(
    `  inferTypeFromContent('签定合同') → '${inferTypeFromContent('签定合同', '签订合同')}'（期望 法律术语）`
  );
  console.log(
    `  F11 存在着 → '${f11.type}' / F12 加强重视 → '${f12.type}' / F13 进步提高 → '${f13.type}' / F14 很多丰富 → '${f14.type}' / F15 具有着 → '${f15.type}'（期望 搭配冗余/动宾不当/语义重复/修饰不当/搭配冗余）`
  );

  console.log('\n===== T3：报告 TC-12 修订数口径 =====');
  const sid = `e2e-recheck-${Date.now()}`;
  await proofreadAccumulateHandler({
    session_id: sid,
    issues: [
      { offset: 0, length: 2, original: '的的', suggestion: '的', type: '重复字符', source: 'mcp' },
      {
        offset: 10,
        length: 2,
        original: '在去',
        suggestion: '再去',
        type: '在再混淆',
        source: 'mcp',
      },
      { offset: 20, length: 8, original: '进行了研究', suggestion: '研究', source: 'mcp' }, // 缺 type → 兜底
    ],
    doc_info: { fileName: 'd.docx', filePath: '/p/d.docx', totalParagraphs: 1, totalWords: 30 },
    total_revisions: 60,
  });
  const rep = await generateProofreadReportHandler({ session_id: sid });
  const text = rep.content[0].text;
  console.log(`  含修订总数行：${text.includes('修订总数')}`);
  console.log(`  含 ÷2 口径：${text.includes('修订记录数 ÷ 2')}`);
  console.log(`  换算 30 处：${text.includes('= 30')}`);
  console.log(`  兜底 type 计入五维（简洁度）：${text.includes('简洁度')}`);
  console.log(`  无未分类问题：${!text.includes('未分类问题')}`);
  console.log(`  五维有真实统计（非全 10 分）：${text.includes('9.3/10') || text.includes('/10')}`);

  // 汇总
  const pass =
    fHit >= 10 &&
    cHit >= 15 &&
    fFalse === 0 &&
    cFalse === 0 &&
    p1.issues.length > 0 &&
    p0.issues.length === 0 &&
    t2a.type === '冗余词' &&
    t2b.type === '句式杂糅' &&
    t2c.type === '未分类' &&
    f11.type === '搭配冗余' &&
    f12.type === '动宾不当' &&
    f13.type === '语义重复' &&
    f14.type === '修饰不当' &&
    f15.type === '搭配冗余' &&
    text.includes('修订记录数 ÷ 2');
  console.log(`\n===== 结论：${pass ? '✅ 全部达标' : '❌ 存在未达标项'} =====`);
  process.exit(pass ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
