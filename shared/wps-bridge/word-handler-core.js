/**
 * WPS 文字（Word）操作处理器
 * 文档内容读写、格式设置、表格、书签等
 */

// 获取选中区域 Range；无选中时返回 null（供依赖 Selection 的 handler 做明确错误提示）

registerHandler('getActiveDocument', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');

    var paraCount = 0,
      wordCount = 0,
      charCount = 0;
    try {
      paraCount = doc.Paragraphs.Count;
    } catch (e) {}
    try {
      wordCount = doc.Words.Count;
    } catch (e) {}
    try {
      charCount = doc.Characters.Count;
    } catch (e) {}

    return ok({
      name: doc.Name,
      path: doc.FullName,
      paragraphCount: paraCount,
      wordCount: wordCount,
      characterCount: charCount,
    });
  } catch (e) {
    return fail('获取文档信息失败: ' + e.message);
  }
});

registerHandler('getOpenDocuments', function (params) {
  try {
    // Documents 集合保护：无文档/无活动窗口时部分 WPS 访问抛错而非返回空集合
    if (!Application.Documents) return ok({ documents: [] });
    var docs = Application.Documents;
    var list = [];
    for (var i = 1; i <= docs.Count; i++) {
      var d = docs.Item(i);
      list.push({ name: d.Name, path: d.FullName, index: i });
    }
    return ok({ documents: list });
  } catch (e) {
    return ok({ documents: [], error: e.message });
  }
});

registerHandler('switchDocument', function (params) {
  try {
    var docs = Application.Documents;
    var target = params.name !== undefined ? params.name : params.index;
    if (target === undefined || target === null || target === '')
      return invalidParam('缺少 name 或 index');
    var doc = null;

    if (typeof target === 'number') {
      doc = docs.Item(target);
    } else {
      for (var i = 1; i <= docs.Count; i++) {
        if (docs.Item(i).Name === target) {
          doc = docs.Item(i);
          break;
        }
      }
    }
    if (!doc) return fail('未找到文档: ' + target);
    doc.Activate();
    return ok({ name: doc.Name });
  } catch (e) {
    return fail('切换文档失败: ' + e.message);
  }
});

registerHandler('openDocument', function (params) {
  try {
    var filePath = params.path || params.filePath;
    if (!filePath) return invalidParam('缺少 path');
    var doc = Application.Documents.Open(filePath);
    return ok({ name: doc.Name, path: doc.FullName });
  } catch (e) {
    return fail('打开文档失败: ' + e.message);
  }
});

registerHandler('createDocument', function (params) {
  try {
    var doc = Application.Documents.Add();
    return ok({ name: doc.Name });
  } catch (e) {
    return fail('创建文档失败: ' + e.message);
  }
});

registerHandler('getDocumentText', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    // Content.Text 包 try/catch：空文档（无段落）时部分 WPS 访问抛错（与 getActiveDocument 的 Count 保护一致）
    var text = '';
    try {
      text = doc.Content.Text;
    } catch (e) {}
    var length = text.length;
    // maxLength 显式校验：非法字符串/负数显式 fail（NaN > 0 为 false 会静默不截断，NaN 传入 substring 产生乱码）
    var maxLength = params.maxLength !== undefined ? parseInt(params.maxLength, 10) : 10000;
    if (isNaN(maxLength) || maxLength < 0)
      return fail('无效的 maxLength: ' + params.maxLength + '（必须为非负整数）');
    var truncated = false;
    // maxLength=0 视为不截断（返回全部）
    if (maxLength > 0 && length > maxLength) {
      text = text.substring(0, maxLength) + '\n...(截断, 共 ' + length + ' 字符)';
      truncated = true;
    }
    // truncated 标记让 AI 知道内容不完整，可请求分段读取或传更大 maxLength
    return ok({ text: text, length: length, truncated: truncated, maxLength: maxLength });
  } catch (e) {
    return fail('获取文档文本失败: ' + e.message);
  }
});

registerHandler('insertText', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    // 缺 text 显式 fail（与 saveAs 缺 path 语义一致），避免 AI 漏传参数静默成功
    if (params.text === undefined || params.text === null) return invalidParam('缺少 text');
    var text = params.text;
    var pos = params.position || 'cursor';

    switch (pos) {
      case 'start':
        doc.Range(0, 0).InsertBefore(text);
        break;
      case 'end':
        var end = doc.Content.End - 1;
        doc.Range(end, end).InsertAfter(text);
        break;
      default:
        // 无选中/无活动窗口时 Selection 抛错——前置保护给明确提示（与 insertHyperlink/insertTable 修复模式一致）
        var range = getSelectionRange();
        if (!range) return fail('请先在文档中选中文本或设置光标');
        range.InsertAfter(text);
    }
    return ok({});
  } catch (e) {
    return fail('插入文本失败: ' + e.message);
  }
});

registerHandler('findReplace', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    // findText 前置校验：避免 undefined 传给 Execute 抛费解错误（与 replaceInSheet 修复对齐，word 侧漏网）
    if (!params.findText) return fail('缺少 findText');
    var find = doc.Content.Find;
    find.ClearFormatting();
    find.Replacement.ClearFormatting();
    // 统一通过 Execute 位置参数传查找/替换文本，避免前置赋值 + 位置参数双写（WPS 对 Execute 位置参数敏感，双写行为未定义）
    // replaceAll 严格布尔判断（0/字符串等不再被当 true）
    var replaceType = params.replaceAll === true ? 2 : 1;
    var result = find.Execute(
      params.findText,
      false,
      false,
      false,
      false,
      false,
      true,
      1,
      false,
      params.replaceText || '',
      replaceType
    );
    // 部分 WPS 版本返回 Find 对象而非 boolean，统一转布尔
    return ok({ replaced: !!result });
  } catch (e) {
    return fail('查找替换失败: ' + e.message);
  }
});

registerHandler('setFont', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var range = params.range === 'all' ? doc.Content : getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    if (params.fontName) range.Font.Name = params.fontName;
    // fontSize 显式数值校验：字符串/'16pt' 直赋 COM 抛类型错误，0/负数无意义（与 insertTable rows/cols 校验语义对齐）
    if (params.fontSize !== undefined) {
      var fs = parseInt(params.fontSize, 10);
      if (isNaN(fs) || fs < 1)
        return fail('无效的字体大小: ' + params.fontSize + '（必须为正整数）');
      range.Font.Size = fs;
    }
    if (params.bold !== undefined) range.Font.Bold = params.bold;
    if (params.italic !== undefined) range.Font.Italic = params.italic;
    if (params.color !== undefined) {
      var fc = parseColor(params.color);
      if (fc === null)
        return fail(
          '无效的颜色值: ' + params.color + '，支持的格式: #FF0000, FF0000, red, blue 等'
        );
      range.Font.Color = fc;
    }
    if (params.underline !== undefined) range.Font.Underline = params.underline;
    return ok({});
  } catch (e) {
    return fail('设置字体失败: ' + e.message);
  }
});

registerHandler('applyStyle', function (params) {
  try {
    if (!params.styleName) return invalidParam('缺少 styleName');
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本');
    range.Style = params.styleName;
    return ok({});
  } catch (e) {
    return fail('应用样式失败: ' + e.message);
  }
});

registerHandler('insertTable', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    // 显式整数校验：rows/cols 必须为正整数（与 excel/ppt 侧语义对齐），避免 rows:0/"0" 静默兜底为 3
    var rows = parseInt(params.rows, 10);
    if (isNaN(rows) || rows < 1) return fail('无效的行数: ' + params.rows + '（必须为正整数）');
    var cols = parseInt(params.cols, 10);
    if (isNaN(cols) || cols < 1) return fail('无效的列数: ' + params.cols + '（必须为正整数）');
    // 无选中/无活动窗口时 Selection.Range 抛错——前置保护给明确提示（与第 1 轮 insertHyperlink 修复模式一致）
    var selRange = getSelectionRange();
    if (!selRange) return fail('请先在文档中选中文本或设置光标');
    var table = doc.Tables.Add(selRange, rows, cols);

    if (params.data && Array.isArray(params.data)) {
      for (var r = 0; r < Math.min(params.data.length, rows); r++) {
        var rowData = params.data[r];
        if (Array.isArray(rowData)) {
          for (var c = 0; c < Math.min(rowData.length, cols); c++) {
            table.Cell(r + 1, c + 1).Range.Text = String(rowData[c]);
          }
        }
      }
    }
    table.Borders.Enable = true;
    return ok({ rows: rows, cols: cols });
  } catch (e) {
    return fail('插入表格失败: ' + e.message);
  }
});

registerHandler('generateTOC', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var range = doc.Range(0, 0);
    doc.TablesOfContents.Add(range);
    return ok({});
  } catch (e) {
    return fail('生成目录失败: ' + e.message);
  }
});

registerHandler('insertPageBreak', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    // 基于光标/选中插入（与 insertSectionBreak 修复模式一致），避免无选中时在文档末尾插入或空文档 Content 异常
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    range.InsertBreak(7);
    return ok({});
  } catch (e) {
    return fail('插入分页符失败: ' + e.message);
  }
});

registerHandler('insertImage', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var filePath = params.path || params.imagePath;
    if (!filePath) return invalidParam('缺少 path');
    var inlineShape = doc.InlineShapes.AddPicture(filePath);
    // 尺寸显式数值化：0 是合法值不能被真值判断吞掉，字符串直赋抛类型错误
    if (params.width !== undefined) {
      var wv = parseFloat(params.width);
      if (isNaN(wv) || wv <= 0) return fail('无效的图片宽度: ' + params.width + '（必须为正数）');
      inlineShape.Width = wv;
    }
    if (params.height !== undefined) {
      var hv = parseFloat(params.height);
      if (isNaN(hv) || hv <= 0) return fail('无效的图片高度: ' + params.height + '（必须为正数）');
      inlineShape.Height = hv;
    }
    return ok({});
  } catch (e) {
    return fail('插入图片失败: ' + e.message);
  }
});

registerHandler('insertHyperlink', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    if (!params.url) return invalidParam('缺少 url');
    // 无选中/无活动窗口时 Selection.Range 抛错——前置保护给明确提示（与 setTextColor 语义一致）
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    doc.Hyperlinks.Add(range, params.url, '', '', params.text || params.url);
    return ok({});
  } catch (e) {
    return fail('插入超链接失败: ' + e.message);
  }
});

registerHandler('insertBookmark', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    if (!params.name) return invalidParam('缺少 name');
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    doc.Bookmarks.Add(params.name, range);
    return ok({});
  } catch (e) {
    return fail('插入书签失败: ' + e.message);
  }
});

registerHandler('getBookmarks', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var list = [];
    for (var i = 1; i <= doc.Bookmarks.Count; i++) {
      list.push(doc.Bookmarks.Item(i).Name);
    }
    return ok({ bookmarks: list });
  } catch (e) {
    return fail('获取书签失败: ' + e.message);
  }
});

registerHandler('addComment', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    if (params.text === undefined || params.text === null) return invalidParam('缺少 text');
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    doc.Comments.Add(range, params.text);
    return ok({});
  } catch (e) {
    return fail('添加批注失败: ' + e.message);
  }
});

registerHandler('getComments', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var list = [];
    for (var i = 1; i <= doc.Comments.Count; i++) {
      var c = doc.Comments.Item(i);
      list.push({ author: c.Author || '', text: c.Text, date: c.Date });
    }
    return ok({ comments: list });
  } catch (e) {
    return fail('获取批注失败: ' + e.message);
  }
});

registerHandler('insertHeader', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    if (!doc.Sections || doc.Sections.Count < 1) return fail('文档没有节，无法插入页眉');
    doc.Sections.Item(1).Headers.Item(1).Range.Text = params.text || '';
    return ok({});
  } catch (e) {
    return fail('插入页眉失败: ' + e.message);
  }
});

registerHandler('insertFooter', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    if (!doc.Sections || doc.Sections.Count < 1) return fail('文档没有节，无法插入页脚');
    doc.Sections.Item(1).Footers.Item(1).Range.Text = params.text || '';
    return ok({});
  } catch (e) {
    return fail('插入页脚失败: ' + e.message);
  }
});

registerHandler('setPageSetup', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var ps = doc.PageSetup;
    // wdOrientation: wdOrientPortrait=0, wdOrientLandscape=1（0 是合法 portrait 值，不能用真值判断）
    if (params.orientation !== undefined) {
      ps.Orientation = params.orientation === 'landscape' ? 1 : 0;
    }
    // 边距/页面尺寸显式数值化：字符串（'2.5'）直赋 COM 抛类型错误（与 setLineSpacing 语义对齐）
    var marginKeys = [
      'topMargin',
      'bottomMargin',
      'leftMargin',
      'rightMargin',
      'pageWidth',
      'pageHeight',
    ];
    for (var mi = 0; mi < marginKeys.length; mi++) {
      var mk = marginKeys[mi];
      if (params[mk] !== undefined) {
        var mv = parseFloat(params[mk]);
        if (isNaN(mv) || mv < 0)
          return fail('无效的 ' + mk + ': ' + params[mk] + '（必须为非负数）');
        ps[
          mk === 'topMargin'
            ? 'TopMargin'
            : mk === 'bottomMargin'
              ? 'BottomMargin'
              : mk === 'leftMargin'
                ? 'LeftMargin'
                : mk === 'rightMargin'
                  ? 'RightMargin'
                  : mk === 'pageWidth'
                    ? 'PageWidth'
                    : 'PageHeight'
        ] = mv;
      }
    }
    return ok({});
  } catch (e) {
    return fail('设置页面失败: ' + e.message);
  }
});

registerHandler('setParagraph', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var range = params.range === 'all' ? doc.Content : getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    var para = range.ParagraphFormat;
    // 对齐值统一走映射：支持 'left'/'center'/'right'/'justify' 字符串（AI 常见传参），
    // 避免字符串直接赋给 COM 对齐属性抛类型错误（与 excel 侧 resolveAlignment 语义一致）
    var alignMap = { left: 0, center: 1, right: 2, justify: 3, distribute: 4 };
    if (params.alignment !== undefined) {
      var align =
        typeof params.alignment === 'string'
          ? alignMap[params.alignment.toLowerCase()]
          : params.alignment;
      // 数字也做范围校验（Word 对齐常量合法范围 0~4），越界显式 fail 而非抛泛化 COM 错误
      if (typeof align !== 'number' || align < 0 || align > 4 || isNaN(align))
        return fail(
          '无效的对齐值: ' +
            params.alignment +
            '（支持 left/center/right/justify/distribute 或 0~4）'
        );
      para.Alignment = align;
    }
    // 显式数值校验（与 setLineSpacing 第 4 轮修复语义对齐）：字符串/'12pt' 直赋 COM 抛类型错误
    if (params.lineSpacing !== undefined) {
      var ls = parseFloat(params.lineSpacing);
      if (isNaN(ls) || ls <= 0) return fail('无效的行距: ' + params.lineSpacing + '（必须为正数）');
      para.LineSpacing = ls;
    }
    if (params.spaceBefore !== undefined) {
      var sb = parseFloat(params.spaceBefore);
      if (isNaN(sb) || sb < 0)
        return fail('无效的段前距: ' + params.spaceBefore + '（必须为非负数）');
      para.SpaceBefore = sb;
    }
    if (params.spaceAfter !== undefined) {
      var sa = parseFloat(params.spaceAfter);
      if (isNaN(sa) || sa < 0)
        return fail('无效的段后距: ' + params.spaceAfter + '（必须为非负数）');
      para.SpaceAfter = sa;
    }
    if (params.firstLineIndent !== undefined) {
      var fli = parseFloat(params.firstLineIndent);
      if (isNaN(fli) || fli < 0)
        return fail('无效的首行缩进: ' + params.firstLineIndent + '（必须为非负数）');
      para.FirstLineIndent = fli;
    }
    return ok({});
  } catch (e) {
    return fail('设置段落格式失败: ' + e.message);
  }
});

// 将颜色参数统一解析为 BGR 整型：支持颜色名/#RRGGBB/RRGGBB；数字直接返回；非法返回 null
// （setFont 与 setTextColor 共用，避免两处实现漂移）
function parseColor(color) {
  if (typeof color === 'number') return color;
  if (typeof color !== 'string' || !color) return null;
  var lower = color.toLowerCase();
  if (COLOR_NAMES[lower] !== undefined) return COLOR_NAMES[lower];
  var hexStr = color.indexOf('#') === 0 ? color.substring(1) : color;
  if (!/^[0-9a-fA-F]{6}$/.test(hexStr)) return null;
  return toBgr(parseInt(hexStr, 16));
}

var COLOR_NAMES = {
  red: toBgr(0xff0000),
  green: toBgr(0x00ff00),
  blue: toBgr(0x0000ff),
  yellow: toBgr(0xffff00),
  cyan: toBgr(0x00ffff),
  magenta: toBgr(0xff00ff),
  white: toBgr(0xffffff),
  black: toBgr(0x000000),
  gray: toBgr(0x808080),
  grey: toBgr(0x808080),
  orange: toBgr(0xffa500),
  purple: toBgr(0x800080),
  pink: toBgr(0xffc0cb),
  brown: toBgr(0xa52a2a),
  navy: toBgr(0x000080),
  teal: toBgr(0x008080),
  maroon: toBgr(0x800000),
  lime: toBgr(0x00ff00),
  silver: toBgr(0xc0c0c0),
  gold: toBgr(0xffd700),
};

registerHandler('setTextColor', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    var color = parseColor(params.color);
    if (color === null)
      return fail('无效的颜色值: ' + params.color + '，支持的格式: #FF0000, FF0000, red, blue 等');
    range.Font.Color = color;
    return ok({});
  } catch (e) {
    return fail('设置文字颜色失败: ' + e.message);
  }
});

registerHandler('insertSectionBreak', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var breakType = params.breakType || 'nextPage';
    var typeMap = { nextPage: 2, continuous: 3, evenPage: 4, oddPage: 5 };
    var type = typeMap[breakType] || 2;
    // 无选中/无活动窗口时 Selection 抛错——前置保护给明确提示（与 insertHyperlink/insertTable 修复模式一致）
    var range = getSelectionRange();
    if (!range) return fail('请先在文档中选中文本或设置光标');
    range.InsertBreak(type);
    return ok({});
  } catch (e) {
    return fail('插入分节符失败: ' + e.message);
  }
});

registerHandler('setLineSpacing', function (params) {
  try {
    var doc = Application.ActiveDocument;
    if (!doc) return fail('没有打开的文档');
    var lineSpacing = params.lineSpacing;
    // 显式数值校验：字符串行距（'1.5'）直赋 COM 抛类型错误；0/负数/字符串显式 fail（原实现 '1.5' <= 0 为 false 被放行）
    if (lineSpacing === undefined || lineSpacing === null) return fail('行距值必须为正数');
    var ls = parseFloat(lineSpacing);
    if (isNaN(ls) || ls <= 0) return fail('行距值必须为正数，当前值: ' + lineSpacing);
    var range;
    if (params.paragraphIndex !== undefined) {
      var paraIdx = parseInt(params.paragraphIndex);
      if (isNaN(paraIdx) || paraIdx < 0 || paraIdx >= doc.Paragraphs.Count)
        return fail('段落索引超出范围');
      range = doc.Paragraphs.Item(paraIdx + 1).Range;
    } else {
      range = getSelectionRange();
      if (!range) return fail('请先在文档中选中文本或设置光标');
    }
    range.ParagraphFormat.LineSpacingRule = 5;
    range.ParagraphFormat.LineSpacing = ls;
    return ok({});
  } catch (e) {
    return fail('设置行距失败: ' + e.message);
  }
});
