/**
 * WPS 桥接通用操作处理器（共享核心）
 *
 * 单一来源（single source of truth）：由 `scripts/sync-wps-bridge.js` 同步到
 * `opencode-wps-assistant/` 与 `opencode-wps-linux/` 两个平台目录，避免同一逻辑改三遍。
 *
 * 平台差异通过全局 `BRIDGE_PLATFORM`（'mac' | 'linux'）隔离：
 *  - `platform` 标记（ping/getAppInfo）
 *  - 是否启用 `ensureOutputDir`（仅 macOS 前置校验输出目录）
 * 该全局由同步脚本在生成平台化 common-handler.js 时注入，本文件不自行声明。
 */

/**
 * 前置校验输出目录是否存在（仅 macOS 使用）。
 * 返回 null 表示通过，否则返回错误信息。
 * Linux 平台不启用（WPS 会自动创建目录或行为不同）。
 */
function ensureOutputDir(filePath) {
  var _pathMod = typeof require === 'function' ? require('path') : null;
  var _fsMod = typeof require === 'function' ? require('fs') : null;
  if (!filePath) return null;
  var dir = _pathMod ? _pathMod.dirname(filePath) : '';
  if (dir && _fsMod && !_fsMod.existsSync(dir)) {
    return '输出目录不存在: ' + dir + '（请先创建目录）';
  }
  return null;
}

registerHandler('ping', function (params) {
  return ok({
    message: 'pong',
    timestamp: new Date().getTime(),
    platform: (typeof BRIDGE_PLATFORM !== 'undefined' && BRIDGE_PLATFORM) || 'unknown',
  });
});

registerHandler('wireCheck', function (params) {
  return ok({ message: 'WPS Bridge 已连接', appType: getAppType() });
});

registerHandler('getAppInfo', function (params) {
  return getAppInfoImpl();
});

registerHandler('getSelectedText', function (params) {
  params = params || {};
  try {
    // 适用场景：文字（Writer）选中文本；表格/演示下 Application.Selection 语义不同，
    // 非 Writer 应用可能返回空或无选中，此时返回失败由上层提示。
    // Selection 包 try/catch：无选中/无活动窗口时部分 WPS 抛错而非返回 null
    var sel = null;
    try {
      sel = Application.Selection;
    } catch (e) {}
    if (!sel) return fail('没有选中内容');
    return ok({ text: sel.Text || '', length: (sel.Text || '').length });
  } catch (e) {
    return fail('获取选中文本失败: ' + e.message);
  }
});

registerHandler('setSelectedText', function (params) {
  params = params || {};
  try {
    // text 前置校验：缺省时静默清空选中文本是危险操作（与 addComment 修复语义对齐）
    if (params.text === undefined || params.text === null) return invalidParam('缺少 text');
    var sel = null;
    try {
      sel = Application.Selection;
    } catch (e) {}
    if (!sel) return fail('没有选中的文本范围');
    sel.Text = params.text;
    return ok({});
  } catch (e) {
    return fail('设置选中文本失败: ' + e.message);
  }
});

registerHandler('save', function (params) {
  params = params || {};
  try {
    var doc = getActiveDoc();
    if (!doc) return fail('没有打开的文档');
    doc.Save();
    return ok({});
  } catch (e) {
    return fail('保存失败: ' + e.message);
  }
});

registerHandler('saveAs', function (params) {
  params = params || {};
  try {
    var doc = getActiveDoc();
    if (!doc) return fail('没有打开的文档');
    var filePath = params.path || params.filePath;
    if (!filePath) return invalidParam('缺少 path');
    if (typeof BRIDGE_PLATFORM !== 'undefined' && BRIDGE_PLATFORM === 'mac') {
      var dirErr = ensureOutputDir(filePath);
      if (dirErr) return fail(dirErr);
    }
    doc.SaveAs(filePath);
    return ok({ path: filePath });
  } catch (e) {
    return fail('另存为失败: ' + e.message);
  }
});

registerHandler('openFile', function (params) {
  params = params || {};
  try {
    var filePath = params.path || params.filePath;
    if (!filePath) return invalidParam('缺少 path');

    var appType = null;
    var lower = filePath.toLowerCase();
    // 正则边界匹配（\.xlsx?$ 等），避免 indexOf('.xls') 误匹配 .xlss/.document 等非标准后缀
    if (/\.xlsx?$/.test(lower)) appType = 'et';
    else if (/\.docx?$/.test(lower)) appType = 'wps';
    else if (/\.pptx?$/.test(lower)) appType = 'wpp';
    else appType = getAppType();

    var app = getWpsApp();
    if (!app) return fail('无法获取 WPS 应用实例');

    // 按 appType 明确选择集合，避免跨应用打开时取错（如文字模式下取 Presentations 打开 xlsx）
    var docs = null;
    if (appType === 'et') docs = app.Workbooks;
    else if (appType === 'wps') docs = app.Documents;
    else if (appType === 'wpp') docs = app.Presentations;
    if (!docs) return fail('当前应用不支持打开文件: ' + appType);
    docs.Open(filePath);
    return ok({ path: filePath });
  } catch (e) {
    return fail('打开文件失败: ' + e.message);
  }
});

registerHandler('convertToPDF', function (params) {
  params = params || {};
  try {
    var doc = getActiveDoc();
    if (!doc) return fail('没有打开的文档');
    var outputPath = params.outputPath || params.path;
    if (!outputPath) return invalidParam('缺少 outputPath');
    if (typeof BRIDGE_PLATFORM !== 'undefined' && BRIDGE_PLATFORM === 'mac') {
      var dirErr = ensureOutputDir(outputPath);
      if (dirErr) return fail(dirErr);
    }
    // 17 = WPS 导出为 PDF 格式的固定枚举值（ExportAsFixedFormat 的 FormatType 参数）
    doc.ExportAsFixedFormat(outputPath, 17);
    return ok({ outputPath: outputPath });
  } catch (e) {
    return fail('导出 PDF 失败: ' + e.message);
  }
});

registerHandler('getDocumentStats', function (params) {
  params = params || {};
  try {
    var doc = getActiveDoc();
    if (!doc) return fail('没有打开的文档');
    return ok({
      name: doc.Name,
      path: doc.FullName,
      paragraphCount: doc.Paragraphs ? doc.Paragraphs.Count : 0,
      wordCount: doc.Words ? doc.Words.Count : 0,
      characterCount: doc.Characters ? doc.Characters.Count : 0,
    });
  } catch (e) {
    return fail('获取文档统计失败: ' + e.message);
  }
});

function getAppType() {
  try {
    if (typeof Application === 'undefined') return 'unknown';
    var name = '';
    try {
      name = Application.Name || '';
    } catch (e) {}

    // 大小写不敏感匹配：WPS 的 Application.Name 可能返回小写命令名（wps/et/wpp）
    // 匹配顺序说明：先尝试中文/英文全名（表格/excel/spreadsheet），再回退到命令名缩写
    // （et/wpp/wps）。子串匹配较宽泛，但平台实际返回名受限于已知集合，误匹配概率极低；
    // 若将来扩展新应用名，应优先在前置全名分支补充，而非依赖缩写。
    var lowerName = String(name).toLowerCase();

    if (
      lowerName.indexOf('表格') !== -1 ||
      lowerName.indexOf('excel') !== -1 ||
      lowerName.indexOf('et') !== -1 ||
      lowerName.indexOf('spreadsheet') !== -1
    )
      return 'et';
    if (
      lowerName.indexOf('演示') !== -1 ||
      lowerName.indexOf('presentation') !== -1 ||
      lowerName.indexOf('wpp') !== -1 ||
      lowerName.indexOf('slide') !== -1
    )
      return 'wpp';
    if (
      lowerName.indexOf('文字') !== -1 ||
      lowerName.indexOf('writer') !== -1 ||
      lowerName.indexOf('word') !== -1 ||
      lowerName.indexOf('wps') !== -1
    )
      return 'wps';

    try {
      if (Application.ActiveDocument) return 'wps';
    } catch (e) {}
    try {
      if (Application.ActiveWorkbook) return 'et';
    } catch (e) {}
    try {
      if (Application.ActivePresentation) return 'wpp';
    } catch (e) {}
  } catch (e) {}
  return 'unknown';
}

function getAppInfoImpl() {
  try {
    var appType = getAppType();
    var appName = '';
    try {
      appName = Application.Name || '';
    } catch (e) {}
    return ok({
      appType: appType,
      appName: appName,
      platform: (typeof BRIDGE_PLATFORM !== 'undefined' && BRIDGE_PLATFORM) || 'unknown',
      version: 1,
    });
  } catch (e) {
    return ok({
      appType: 'unknown',
      appName: '',
      platform: (typeof BRIDGE_PLATFORM !== 'undefined' && BRIDGE_PLATFORM) || 'unknown',
    });
  }
}

function getActiveDoc() {
  try {
    var appType = getAppType();
    if (appType === 'et') return Application.ActiveWorkbook;
    if (appType === 'wps') return Application.ActiveDocument;
    if (appType === 'wpp') return Application.ActivePresentation;
  } catch (e) {}
  return null;
}

// 获取 WPS 应用实例。反向轮询桥在同一进程内运行，Application 即当前活跃应用。
// 跨应用打开（如文字模式打开 xlsx）通过下方按 appType 选择对应文档集合实现。
function getWpsApp() {
  try {
    if (typeof Application === 'undefined') return null;
    return Application;
  } catch (e) {
    return null;
  }
}
