/**
 * COM Action 的 app 归属（`word` / `excel` / `ppt`）**唯一派生点**（Issue #399 评审 R1-🔴A）。
 *
 * 为什么需要它：G3「读前必写」的判据要先答「本次工具属于哪个 app」，才能查对应 app 的「已读」标记。
 *   历史上该判定在治理层用**关键词/前缀猜**（先是一串 `startsWith`，后改成一串正则），
 *   两次都是**黑名单** ⇒ 漏一个形态就复发一次（实测 `addTextBox`/`setFormula`/`setBorder` 等
 *   9 个 Excel/PPT 写工具仍被误判为 word ⇒ G3 恒拦）。
 *   权威来源本来就在注册表里：`gateway/com-actions.ts` 的 `COM_ACTIONS[].appType`
 *   （`WRITER`→word / `SPREADSHEET`→excel / `PRESENTATION`→ppt）。
 *
 * 本模块只做**机械派生**，不持有业务判断；消费方：
 *   · `scripts/validate-com-action-app.js`（守卫：派生表 ↔ 注册表 双向闭合 + 变异自证）
 *   · `scripts/gen-com-action-app.js`（生成器：把派生表写入 governance.js 的登记区块）
 *
 * 用法：
 *   const { deriveComActionApp } = require('./lib/com-action-app.js');
 *   deriveComActionApp(rootDir) → { byName: { <name>: 'word'|'excel'|'ppt' }, count: N }
 */
'use strict';

const fs = require('fs');
const path = require('path');

const COM_ACTIONS_REL = 'wps-office-mcp/src/tools/gateway/com-actions.ts';

// `WpsAppType` 枚举值 → 治理层的 app 槽位名（**唯一映射**；枚举值唯一来源 = `src/types/wps.ts`）
const ENUM_TO_APP = { WRITER: 'word', SPREADSHEET: 'excel', PRESENTATION: 'ppt' };

/** 从 COM_ACTIONS 常量块派生「短名 → app」。结构与 `scripts/validate-tool-counts.js` 同口径。 */
function deriveComActionApp(rootDir) {
  const file = path.join(rootDir || path.join(__dirname, '..', '..'), COM_ACTIONS_REL);
  const src = fs.readFileSync(file, 'utf8');
  const block = src.match(/(?:const|export const)\s+COM_ACTIONS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) return { byName: null, count: 0, error: 'COM_ACTIONS 常量块未定位' };

  // 逐条 entry 按**字段出现顺序**配对（COM_ACTIONS 每条必含 `name:` 与 `appType:`，
  // 顺序即数组顺序）—— 比「按 `},` 切分」稳健（entry 内含多行 schema 对象时切分易漏条）。
  const nameIt = block[1].matchAll(/name:\s*'([^']+)'/g);
  const appIt = block[1].matchAll(/appType:\s*WpsAppType\.(\w+)/g);
  const names = [...nameIt].map(m => m[1]);
  const apps = [...appIt].map(m => ENUM_TO_APP[m[1]]);
  const byName = {};
  let malformed = 0;
  if (names.length !== apps.length) {
    return {
      byName: null,
      count: 0,
      error: `name 数 ${names.length} != appType 数 ${apps.length} —— COM_ACTIONS 结构已变`,
    };
  }
  for (let i = 0; i < names.length; i++) {
    if (!apps[i]) {
      malformed++;
      continue;
    }
    if (byName[names[i]] && byName[names[i]] !== apps[i]) {
      return { byName: null, count: 0, error: `同名 COM Action ${names[i]} 声明了两个 app` };
    }
    byName[names[i]] = apps[i];
  }
  return { byName, count: Object.keys(byName).length, malformed };
}

/** 生成写进 governance.js 登记区块的源码文本（**唯一构造点**，生成器与守卫共用）。 */
function renderBlock(byName) {
  const names = Object.keys(byName).sort();
  const lines = names.map(n => `  ${n}: '${byName[n]}',`);
  return lines.join('\n');
}

module.exports = { deriveComActionApp, renderBlock, ENUM_TO_APP, COM_ACTIONS_REL };
