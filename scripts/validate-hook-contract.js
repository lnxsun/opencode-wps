#!/usr/bin/env node
/**
 * 钩子调用契约守卫（Issue #395 RC-6 防腐，铁律 24 第 7 维「不变量必须归属门禁」）。
 *
 * 背景（为什么需要一条守卫而非只靠测试）：RC-6 的根因是「**测试面复刻了缺陷面**」——
 * 官方 `@opencode-ai/plugin` 契约里 `tool.execute.before(input{无args}, output{args})` 的参数在
 * **第二参**，而仓库治理层曾读 `input.args`；测试也把 args 塞进第一参 ⇒ 双方同错，全绿掩盖线上死锁
 * （假红）与 P2 防伪门禁静默失守（假绿）。若无独立守卫，「测试用旧契约」这一形态可再次复发。
 *
 * 判据：扫描 `tests/**` 中**直接调用** `tool.execute.before` 的位置，断言其调用形态 =
 * 官方契约（args 在第二参 `output`）。检测对象为**结构形态**（禁止 `before(X, {})` 这种
 * 把有内容的 args 塞第一参、第二参传空的写法）。
 *
 * 自限（显式披露）：
 *   ① 只拦「第二参为空对象/缺省 + 第一参含 `args` 键（`: 值` 或属性简写）」这一**可确定性形态**；
 *      经辅助函数（如 `evb(t,a) => [{...}, {args:a}]`）间接调用者不声称拦住（辅助函数本体另行登记）。
 *   ② 不做语义判断（无法证明「参数确实需要」）。
 *   ③ 锚点覆盖**单/双引号方括号**（`plugin['...']` / `plugin["..."]`）与裸别名 `before(`；
 *      其它动态取值形态（如 `plugin[NAME](...)`、模板串）不声称拦住（CR1-3 已闭合双引号逃逸面）。
 * 用法：node scripts/validate-hook-contract.js [--root <dir>]
 * 退出码：0 = 通过；1 = 存在违规。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const argIdx = process.argv.indexOf('--root');
const ROOT = argIdx !== -1 ? path.resolve(process.argv[argIdx + 1]) : path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');

/** 递归收集 tests/ 下的 .js 测试文件（唯一枚举点）。 */
function collectTestFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...collectTestFiles(abs));
    else if (name.endsWith('.js')) out.push(abs);
  }
  return out;
}

/**
 * 判据（纯函数，无 IO）：给定源码，返回违规点 `{ line, snippet }[]`。
 * 形态 = `...execute.before'](` 后**跨若干空白**出现 `{ ... args: ... }`，随后 `,` 再接 `{}` 收尾。
 */
function findLegacyBeforeCalls(src) {
  const violations = [];
  const lines = src.split('\n');
  // 判据：以 before 调用点为锚，做**括号配平**扫描，取「第一参」与「第二参」两段文本。
  // （不能用 `[^{}]*?` —— 参数字面量本身含嵌套 `{}`，非贪婪会截断。）
  // 锚点覆盖两种写法：显式 `plugin['tool.execute.before'](` 与局部别名 `before(`（测试里解构出的）。
  // ⚠️ `\bbefore` 会命中 `tool.execute.before']` 里的 before —— 该形态第二参非 args，天然不命中判据。
  // 锚点覆盖：显式 `plugin['tool.execute.before'](` / `plugin["tool.execute.before"](`（单/双引号）
  // 与局部别名 `before(`。⚠️ CR1-3：双引号方括号形态此前漏报（`\bbefore\s*\(` 不匹配 `before"](`）。
  const anchor = /(?:\[\s*['"]tool\.execute\.before['"]\s*\]|\bbefore)\s*\(/g;
  /** 从 `(` 之后读取**一个顶层实参**：括号配平，遇顶层逗号 / 闭括号终止。 */
  const readArg = start => {
    let depth = 0,
      i = start;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') {
        if (depth === 0) break;
        depth--;
      } else if (ch === ',' && depth === 0) break;
    }
    return { text: src.slice(start, i), end: i };
  };
  let m;
  while ((m = anchor.exec(src)) !== null) {
    const p = m.index + m[0].length;
    const a1 = readArg(p);
    if (src[a1.end] !== ',') continue; // 单参调用 ⇒ 非本判据形态
    const a2 = readArg(a1.end + 1);
    // 第一参须携带 args 键：兼容 `args: <v>`（冒号）与 `args` 简写（对象属性简写，如 `{ tool, args }`）。
    // ⚠️ 仅当作为**属性键**出现（前导 `{`/`,`/空白 且后继 `:`/`,`/`}`/空白）才算，防误命中 `myArgs`/`argsList`。
    if (!/(^|[{,\s])args\s*([:,}]|\s*$)/.test(a1.text)) continue;
    // 第二参须为「空对象」（容忍一层包裹括号，如 `({})`）⇒ 否则视为官方形态（第二参有内容）。
    const second = a2.text.trim().replace(/^\(([\s\S]*)\)$/, '$1').trim();
    if (second !== '{}') continue;
    // 行号以**调用名**所在行为准（`before` 换行后参数另起行，勿把参数行当调用行）
    const line = src.slice(0, m.index + m[0].length).split('\n').length;
    violations.push({ line, snippet: a1.text.replace(/\s+/g, ' ').trim().slice(0, 90) });
  }
  return violations;
}

function main() {
  const files = collectTestFiles(TESTS_DIR);
  const all = [];
  for (const f of files) {
    // 排除本守卫的专测自身：其中含旧契约的**字符串字面量**（变异自证样例），非真实调用。
    if (path.basename(f) === 'validate-hook-contract.test.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const v of findLegacyBeforeCalls(src)) {
      all.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), ...v });
    }
  }
  console.log('【钩子契约】tool.execute.before 调用形态 = 官方契约（args 在第二参 output）');
  console.log(`  扫描 ${files.length} 个测试文件`);
  if (all.length === 0) {
    console.log('  ✅ 未发现旧契约调用形态（before(X含args), {})');
    process.exit(0);
  }
  console.error(`  ❌ 发现 ${all.length} 处旧契约调用：`);
  for (const v of all) console.error(`     ${v.file}:${v.line}  ${v.snippet}`);
  console.error('  ⇒ 参数须放第二参：before({tool,sessionID,callID}, { args })');
  process.exit(1);
}

if (require.main === module) main();
module.exports = { findLegacyBeforeCalls, collectTestFiles };
