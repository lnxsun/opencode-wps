/**
 * Input: .opencode/plugins/governance.js 的 extractJsonFromOutput 辅助函数
 * Output: T1 验证 — P15/P16 能从 proofreadBasic 新返回格式中解析出 issues
 * Pos: unit test for governance P15/P16 JSON 解析（T1, #55）
 *
 * #55 P0-1 修复验证：
 * - governance.js P15/P16 依赖 JSON.parse(outText).issues 判定 proofreadHadIssues
 * - 修复前 proofreadBasic 返回纯文本 → parse 失败 → P15/P16 从未生效
 * - 修复后返回"文本展示 + 末尾 JSON 行"，governance 用 extractJsonFromOutput 提取解析
 * - 本测试直接从根目录 governance.js 提取函数定义，保证单一事实来源
 */

import * as fs from 'fs';
import * as path from 'path';
import vm from 'vm';

// 读取根目录 governance.js 源码
// 定位仓库根：从 __dirname（wps-office-mcp/src/tests/unit）向上找包含 .opencode 的目录
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.opencode', 'plugins', 'governance.js'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('未找到仓库根目录（governance.js）');
}
const repoRoot = findRepoRoot(__dirname);
const governancePath = path.join(repoRoot, '.opencode', 'plugins', 'governance.js');
const governanceSrc = fs.readFileSync(governancePath, 'utf-8');

// 提取 extractJsonFromOutput 函数定义（单一事实来源，避免拷贝漂移）
const fnMatch = governanceSrc.match(/function extractJsonFromOutput[\s\S]*?\n}/);
if (!fnMatch) {
  throw new Error('governance.js 中未找到 extractJsonFromOutput 函数');
}
const sandbox: Record<string, unknown> = {};
vm.createContext(sandbox);
vm.runInContext(fnMatch[0], sandbox);
const extractJsonFromOutput = (sandbox as any).extractJsonFromOutput as (
  text: string
) => { issues?: Array<{ original?: string }> } | null;

describe('governance P15/P16 — extractJsonFromOutput（T1，#55）', () => {
  it('从"文本展示 + 末尾 JSON 行"中提取 issues（有问题场景）', () => {
    const outText = `基础校对完成，发现 1 个问题：

1. [句式杂糅] 位置 0
   原文: "通过加强监督使"
   建议: "加强监督使"
   上下文: ...[通过加强监督使]产品质量提升...

{"issues":[{"offset":0,"length":7,"original":"通过加强监督使","suggestion":"加强监督使","type":"句式杂糅","context":"...[通过加强监督使]产品质量提升...","metric":"fluency"}]}`;
    const parsed = extractJsonFromOutput(outText);
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed!.issues)).toBe(true);
    expect(parsed!.issues!.length).toBe(1);
    expect(parsed!.issues![0].original).toBe('通过加强监督使');
  });

  it('无问题场景返回 issues: []（proofreadHadIssues=false）', () => {
    const outText = `基础校对完成，未发现明显问题。

{"issues":[]}`;
    const parsed = extractJsonFromOutput(outText);
    expect(parsed).not.toBeNull();
    expect(parsed!.issues!.length).toBe(0);
  });

  it('兼容旧格式：整段文本即 JSON 时直接解析', () => {
    const outText = `{"issues":[{"offset":0,"length":2,"original":"的的","suggestion":"的","type":"重复字符"}]}`;
    const parsed = extractJsonFromOutput(outText);
    expect(parsed).not.toBeNull();
    expect(parsed!.issues!.length).toBe(1);
  });

  it('无 JSON 时返回 null（不抛错）', () => {
    expect(extractJsonFromOutput('纯文本，无 JSON')).toBeNull();
    expect(extractJsonFromOutput('')).toBeNull();
    expect(extractJsonFromOutput(null as unknown as string)).toBeNull();
  });

  it('验收遗留：AI 走网关时可能传 snake_case find_text，P16 参数名需兼容（findText/find/find_text）', () => {
    // 验证 governance.js 源码中 P16 的 findText 读取已兼容三种参数名
    expect(governanceSrc).toContain("innerArgs.find_text");
    expect(governanceSrc).toContain("innerArgs.findText || innerArgs.find || innerArgs.find_text");
    // 模板字段标签检测（findReplace / replaceInParagraph 的 T10 检查）同样兼容
    expect(governanceSrc).toContain("findTextFR = innerArgs.findText || innerArgs.find || innerArgs.find_text");
  });
});
