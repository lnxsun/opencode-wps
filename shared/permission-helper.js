/**
 * 服务端权限放行辅助（Issue #179 方案A）
 *
 * 背景：长任务（如 97 批文档校对）在读取/写入工作目录外的外部文件（如 F 盘工程目录）时，
 * 会触发 opencode 的 external_directory 权限请求；若前端通道不稳，权限请求静默等待导致
 * 任务卡住（曾出现 7.86 小时中断）。方案A 改为在 opencode.json 显式配置服务端 permission，
 * 让服务端直接放行，不再下发权限请求。
 *
 * 本模块提供纯函数 applyServicePermission，供 install-addons.js 调用，也被
 * tests/install-permission.test.js 测试。
 */
'use strict';

// 默认全放行配置（与 .opencode/opencode.jsonc 模板中的 permission 保持一致）
var DEFAULT_PERMISSION = {
  '*': 'allow',
  external_directory: { '**': 'allow' },
};

/**
 * 依据 config.js 的 permission.mode 对目标配置对象应用/移除服务端 permission。
 *
 * @param {object} config  待写入 opencode.json 的配置对象（会被原地修改）
 * @param {string} mode    config.js permission.mode：'auto' | 'manual'
 * @returns {{applied: boolean, mode: string, invalid?: boolean, removedDefault?: boolean}}
 *   返回是否应用了服务端 permission 及实际 mode；mode 非 auto/manual 时 applied=false、
 *   mode='manual'、invalid=true（保守回退，不注入，避免静默全放行扩大权限面）。
 *   manual 且实际移除了默认全放行时 removedDefault=true（供日志区分）。
 */
function applyServicePermission(config, mode) {
  // 显式识别 auto/manual；其余（含拼写错误/含空白）一律按更保守的 manual 处理并标记 invalid，
  // 避免未知值被静默当成 auto 全放行（安全反向默认，Issue #179 评审修复 #1）。
  var resolvedMode = mode === 'auto' ? 'auto' : mode === 'manual' ? 'manual' : 'manual';
  var invalid = mode !== 'auto' && mode !== 'manual';

  if (resolvedMode === 'manual') {
    // 只移除“由模板注入的服务端全放行 permission”，保留用户自定义的精细 permission。
    // 判定依据：与 DEFAULT_PERMISSION 完全一致（即 install 注入的全放行配置）。
    // 这样 manual 语义（移除服务端全放行、走前端人工确认）成立，又不破坏用户在
    // opencode.json 中手动配置的精细权限（Issue #179 评审修复 #2）。
    var removedDefault = false;
    if (
      config.permission !== undefined &&
      isSamePermission(config.permission, DEFAULT_PERMISSION)
    ) {
      delete config.permission;
      removedDefault = true;
    }
    return { applied: false, mode: resolvedMode, invalid: invalid, removedDefault: removedDefault };
  }
  // auto：保留已有 permission（来自模板），若模板未定义则用默认全放行
  if (config.permission === undefined) {
    config.permission = JSON.parse(JSON.stringify(DEFAULT_PERMISSION));
  }
  return { applied: true, mode: resolvedMode, invalid: invalid };
}

/**
 * 深比较两个 permission 对象是否等价（用于区分模板注入的全放行配置与用户自定义精细配置）。
 * 采用基于键的递归比较，对属性顺序不敏感（避免 JSON.stringify 顺序敏感误判）。
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
function isSamePermission(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  var keysA = Object.keys(a);
  var keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (var i = 0; i < keysA.length; i++) {
    var key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (
      typeof a[key] === 'object' &&
      a[key] !== null &&
      typeof b[key] === 'object' &&
      b[key] !== null
    ) {
      if (!isSamePermission(a[key], b[key])) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

/**
 * 依据 config.js 的 allowedWriteRoots 对 MCP server 配置注入/移除写盘白名单环境变量。
 *
 * 背景（Issue #179 路径白名单暴露）：MCP 服务端 write 类操作（含 generateProofreadReport
 * 报告落盘）默认只允许写用户主目录 + 系统临时目录；若用户文档在其他盘符/目录（如 F 盘），
 * 写盘会报「Path not allowed」。通过把根目录写入 opencode.json 中 MCP server 的
 * env.OPCODE_ALLOWED_ROOTS，让 MCP 服务端放行这些写盘根目录。
 *
 * @param {object} mcpServerCfg  opencode.json 中目标 MCP server 的配置对象（会被原地修改）
 * @param {string} allowedRoots  config.js allowedWriteRoots 值（trim 后）。
 *   非空 → 注入 env.OPCODE_ALLOWED_ROOTS；空/undefined → 不注入（沿用 MCP 默认 home+tmp）。
 * @returns {{applied: boolean, roots: string}}
 *   applied=true 表示已注入白名单；applied=false 表示未注入（留默认）。
 */
function applyWriteRoots(mcpServerCfg, allowedRoots) {
  var roots = typeof allowedRoots === 'string' ? allowedRoots.trim() : '';
  if (roots) {
    if (!mcpServerCfg.env) mcpServerCfg.env = {};
    // R4-2 修复（PR #181 评审）：按**当前平台**的 path.delimiter 规范化分隔符——
    // Windows 用 `;`（盘符含 `:`，不能用冒号分隔），macOS/Linux 用 `:`。
    // 兼容用户混用（如 Windows 用户误用冒号、mac 用户误用分号），统一转成平台分隔符，
    // 保证 path-safety.ts 的 path.delimiter 分割正确。
    var delim = process.platform === 'win32' ? ';' : ':';
    var altDelim = delim === ';' ? ':' : ';';
    // R9-2 评审：返回规范化后的实际写入值（而非原始用户输入），保证日志/调用方
    // 看到的 roots 与 env 实际值一致（R4-2 规范化后二者可能不同）。
    const normalizedRoots = roots.replace(new RegExp('\\' + altDelim, 'g'), delim);
    mcpServerCfg.env.OPCODE_ALLOWED_ROOTS = normalizedRoots;
    return { applied: true, roots: normalizedRoots };
  }
  // 未配置：不注入（MCP 服务端用默认白名单 home+tmp）。
  // 若之前注入过，清理掉，避免残留过期配置扩大写盘范围。
  if (mcpServerCfg.env && mcpServerCfg.env.OPCODE_ALLOWED_ROOTS !== undefined) {
    delete mcpServerCfg.env.OPCODE_ALLOWED_ROOTS;
  }
  return { applied: false, roots: '' };
}

module.exports = {
  DEFAULT_PERMISSION: DEFAULT_PERMISSION,
  applyServicePermission: applyServicePermission,
  applyWriteRoots: applyWriteRoots,
};
