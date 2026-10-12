/**
 * Input: opencode-wps/taskpane.html 的 extractCtxUsage 函数（session_ffa9 假修复）
 * Output: 验证多路径上下文用量数据提取逻辑
 * Pos: taskpane ctx-meter 数据源修复的单元测试
 *
 * session_ffa9 问题：上下文用量条依赖不存在的 usage.percent 字段，导致永远不显示。
 * 修复：新增 extractCtxUsage 多路径防御性探测（usage/tokens/context/info/status 各路径），
 * 任一命中即返回 { percent, used, total }。
 */

import * as fs from 'fs';
import * as path from 'path';
import vm from 'vm';

const repoRoot = findRepoRoot(__dirname);
const taskpanePath = path.join(repoRoot, 'opencode-wps', 'taskpane.html');
const html = fs.readFileSync(taskpanePath, 'utf-8');

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'opencode-wps', 'taskpane.html'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('未找到仓库根目录（taskpane.html）');
}

// 提取 extractCtxUsage 函数定义。
// 用「大括号配对」做健壮提取（Prettier 格式化后函数内部含嵌套函数 readTokens 与空行，
// 简单 /function extractCtxUsage\\([\s\S]*?\n}/ 正则会在第一个嵌套函数结束的 \n} 处截断，
// 导致函数体不完整）。这里从 `function extractCtxUsage(` 起点起按大括号深度配对，
// 完整提取到函数结束的 `}`，对格式变化免疫。
function extractFunctionSource(htmlSource: string, funcName: string): string {
  const startMarker = 'function ' + funcName + '(';
  const startIdx = htmlSource.indexOf(startMarker);
  if (startIdx < 0) throw new Error('taskpane.html 中未找到 ' + funcName + ' 函数');
  // 定位函数体第一个 `{`
  let braceStart = htmlSource.indexOf('{', startIdx);
  if (braceStart < 0) throw new Error('taskpane.html 中 ' + funcName + ' 函数缺少 {');
  let depth = 0;
  let i = braceStart;
  const len = htmlSource.length;
  for (; i < len; i++) {
    const ch = htmlSource[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('taskpane.html 中 ' + funcName + ' 函数大括号不配对');
  return htmlSource.slice(startIdx, i + 1);
}
const fnSource = extractFunctionSource(html, 'extractCtxUsage');

function runExtractCtxUsage(obj: unknown): any {
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  // 在沙箱中定义函数后调用
  vm.runInContext(fnSource, sandbox);
  const extract = (sandbox as any).extractCtxUsage as (o: unknown) => any;
  return extract(obj);
}

describe('taskpane extractCtxUsage — 上下文用量多路径探测（session_ffa9 假修复）', () => {
  it('直接命中 usage.percent（原实现依赖的路径）', () => {
    const r = runExtractCtxUsage({ usage: { percent: 58, used: 42000, total: 72000 } });
    expect(r).not.toBeNull();
    expect(r.percent).toBe(58);
    expect(r.used).toBe(42000);
    expect(r.total).toBe(72000);
  });

  it('命中 usage.used + total（无 percent，自动换算百分比）', () => {
    const r = runExtractCtxUsage({ usage: { used: 30000, total: 60000 } });
    expect(r).not.toBeNull();
    expect(r.percent).toBe(50);
  });

  it('命中 tokens 节点', () => {
    const r = runExtractCtxUsage({ tokens: { used: 1000, total: 4000 } });
    expect(r).not.toBeNull();
    expect(r.percent).toBe(25);
  });

  it('命中 context.tokens 嵌套节点', () => {
    const r = runExtractCtxUsage({ context: { tokens: { used: 2000, total: 8000 } } });
    expect(r).not.toBeNull();
    expect(r.percent).toBe(25);
  });

  it('命中 info.usage 嵌套（消息事件属性）', () => {
    const r = runExtractCtxUsage({ info: { usage: { percent: 72, used: 36000, total: 50000 } } });
    expect(r).not.toBeNull();
    expect(r.percent).toBe(72);
  });

  it('命中 status.usage 嵌套（会话状态）', () => {
    const r = runExtractCtxUsage({ status: { usage: { percent: 90, used: 45000, total: 50000 } } });
    expect(r).not.toBeNull();
    expect(r.percent).toBe(90);
  });

  it('无任何用量数据时返回 null（诚实降级，不显示假百分比）', () => {
    expect(runExtractCtxUsage({ info: { role: 'assistant' }, parts: [] })).toBeNull();
    expect(runExtractCtxUsage({})).toBeNull();
    expect(runExtractCtxUsage(null)).toBeNull();
    expect(runExtractCtxUsage(undefined)).toBeNull();
  });
});
