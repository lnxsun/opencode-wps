/**
 * WPS 文字（Word）操作处理器
 * 文档内容读写、格式设置、表格、书签等
 */

registerHandler('getActiveDocument', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');

        var paraCount = 0, wordCount = 0, charCount = 0;
        try { paraCount = doc.Paragraphs.Count; } catch (e) {}
        try { wordCount = doc.Words.Count; } catch (e) {}
        try { charCount = doc.Characters.Count; } catch (e) {}

        return ok({
            name: doc.Name,
            path: doc.FullName,
            paragraphCount: paraCount,
            wordCount: wordCount,
            characterCount: charCount
        });
    } catch (e) {
        return fail('获取文档信息失败: ' + e.message);
    }
});

registerHandler('getOpenDocuments', function(params) {
    try {
        var docs = Application.Documents;
        var list = [];
        for (var i = 1; i <= docs.Count; i++) {
            var d = docs.Item(i);
            list.push({ name: d.Name, path: d.FullName, index: i });
        }
        return ok({ documents: list });
    } catch (e) {
        return fail('获取文档列表失败: ' + e.message);
    }
});

registerHandler('switchDocument', function(params) {
    try {
        var docs = Application.Documents;
        var target = params.name || params.index;
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

registerHandler('openDocument', function(params) {
    try {
        var filePath = params.path || params.filePath;
        if (!filePath) return invalidParam('缺少 path');
        var doc = Application.Documents.Open(filePath);
        return ok({ name: doc.Name, path: doc.FullName });
    } catch (e) {
        return fail('打开文档失败: ' + e.message);
    }
});

registerHandler('createDocument', function(params) {
    try {
        var doc = Application.Documents.Add();
        return ok({ name: doc.Name });
    } catch (e) {
        return fail('创建文档失败: ' + e.message);
    }
});

registerHandler('getDocumentText', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var text = doc.Content.Text;
        var length = text.length;
        if (length > 10000) {
            text = text.substring(0, 10000) + '\n...(截断, 共 ' + length + ' 字符)';
        }
        return ok({ text: text, length: length });
    } catch (e) {
        return fail('获取文档文本失败: ' + e.message);
    }
});

registerHandler('insertText', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var text = params.text || '';
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
                Application.Selection.TypeText(text);
        }
        return ok({});
    } catch (e) {
        return fail('插入文本失败: ' + e.message);
    }
});

registerHandler('findReplace', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var find = doc.Content.Find;
        find.ClearFormatting();
        find.Replacement.ClearFormatting();
        find.Text = params.findText;
        find.Replacement.Text = params.replaceText || '';
        var replaceType = params.replaceAll ? 2 : 1;
        var result = find.Execute(
            params.findText, false, false, false, false, false,
            true, 1, false, params.replaceText || '', replaceType
        );
        return ok({ replaced: result });
    } catch (e) {
        return fail('查找替换失败: ' + e.message);
    }
});

registerHandler('setFont', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var range = (params.range === 'all') ? doc.Content : Application.Selection.Range;
        if (params.fontName) range.Font.Name = params.fontName;
        if (params.fontSize) range.Font.Size = params.fontSize;
        if (params.bold !== undefined) range.Font.Bold = params.bold;
        if (params.italic !== undefined) range.Font.Italic = params.italic;
        if (params.color) range.Font.Color = params.color;
        if (params.underline !== undefined) range.Font.Underline = params.underline;
        return ok({});
    } catch (e) {
        return fail('设置字体失败: ' + e.message);
    }
});

registerHandler('applyStyle', function(params) {
    try {
        var range = Application.Selection.Range;
        range.Style = params.styleName;
        return ok({});
    } catch (e) {
        return fail('应用样式失败: ' + e.message);
    }
});

registerHandler('insertTable', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var rows = params.rows || 3;
        var cols = params.cols || 3;
        var table = doc.Tables.Add(Application.Selection.Range, rows, cols);

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

registerHandler('generateTOC', function(params) {
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

registerHandler('insertPageBreak', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        doc.Content.InsertBreak(7);
        return ok({});
    } catch (e) {
        return fail('插入分页符失败: ' + e.message);
    }
});

registerHandler('insertImage', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var filePath = params.path || params.imagePath;
        if (!filePath) return invalidParam('缺少 path');
        var inlineShape = doc.InlineShapes.AddPicture(filePath);
        if (params.width) inlineShape.Width = params.width;
        if (params.height) inlineShape.Height = params.height;
        return ok({});
    } catch (e) {
        return fail('插入图片失败: ' + e.message);
    }
});

registerHandler('insertHyperlink', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        doc.Hyperlinks.Add(Application.Selection.Range, params.url, '', '', params.text || params.url);
        return ok({});
    } catch (e) {
        return fail('插入超链接失败: ' + e.message);
    }
});

registerHandler('insertBookmark', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        doc.Bookmarks.Add(params.name, Application.Selection.Range);
        return ok({});
    } catch (e) {
        return fail('插入书签失败: ' + e.message);
    }
});

registerHandler('getBookmarks', function(params) {
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

registerHandler('addComment', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var comment = doc.Comments.Add(Application.Selection.Range, params.text || '');
        return ok({});
    } catch (e) {
        return fail('添加批注失败: ' + e.message);
    }
});

registerHandler('getComments', function(params) {
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

registerHandler('insertHeader', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        doc.Sections.Item(1).Headers.Item(1).Range.Text = params.text || '';
        return ok({});
    } catch (e) {
        return fail('插入页眉失败: ' + e.message);
    }
});

registerHandler('insertFooter', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        doc.Sections.Item(1).Footers.Item(1).Range.Text = params.text || '';
        return ok({});
    } catch (e) {
        return fail('插入页脚失败: ' + e.message);
    }
});

registerHandler('setPageSetup', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var ps = doc.PageSetup;
        if (params.topMargin) ps.TopMargin = params.topMargin;
        if (params.bottomMargin) ps.BottomMargin = params.bottomMargin;
        if (params.leftMargin) ps.LeftMargin = params.leftMargin;
        if (params.rightMargin) ps.RightMargin = params.rightMargin;
        if (params.orientation) ps.Orientation = params.orientation === 'landscape' ? 1 : 2;
        if (params.pageWidth) ps.PageWidth = params.pageWidth;
        if (params.pageHeight) ps.PageHeight = params.pageHeight;
        return ok({});
    } catch (e) {
        return fail('设置页面失败: ' + e.message);
    }
});

registerHandler('setParagraph', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var range = (params.range === 'all') ? doc.Content : Application.Selection.Range;
        var para = range.ParagraphFormat;
        if (params.alignment !== undefined) para.Alignment = params.alignment;
        if (params.lineSpacing) para.LineSpacing = params.lineSpacing;
        if (params.spaceBefore !== undefined) para.SpaceBefore = params.spaceBefore;
        if (params.spaceAfter !== undefined) para.SpaceAfter = params.spaceAfter;
        if (params.firstLineIndent !== undefined) para.FirstLineIndent = params.firstLineIndent;
        return ok({});
    } catch (e) {
        return fail('设置段落格式失败: ' + e.message);
    }
});

function toBgr(rgb) {
    return ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF);
}

var COLOR_NAMES = {
    red: toBgr(0xFF0000), green: toBgr(0x00FF00), blue: toBgr(0x0000FF), yellow: toBgr(0xFFFF00),
    cyan: toBgr(0x00FFFF), magenta: toBgr(0xFF00FF), white: toBgr(0xFFFFFF), black: toBgr(0x000000),
    gray: toBgr(0x808080), grey: toBgr(0x808080), orange: toBgr(0xFFA500), purple: toBgr(0x800080),
    pink: toBgr(0xFFC0CB), brown: toBgr(0xA52A2A), navy: toBgr(0x000080), teal: toBgr(0x008080),
    maroon: toBgr(0x800000), lime: toBgr(0x00FF00), silver: toBgr(0xC0C0C0), gold: toBgr(0xFFD700)
};

registerHandler('setTextColor', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var range = Application.Selection.Range;
        var color;
        if (typeof params.color === 'string') {
            var lower = params.color.toLowerCase();
            if (COLOR_NAMES[lower] !== undefined) {
                color = COLOR_NAMES[lower];
            } else if (params.color.indexOf('#') === 0) {
                var hex = parseInt(params.color.substring(1), 16);
                if (isNaN(hex)) return fail('无效的颜色值: ' + params.color);
                color = toBgr(hex);
            } else {
                var hex = parseInt(params.color, 16);
                if (isNaN(hex)) return fail('无效的颜色值: ' + params.color + '，支持的格式: #FF0000, FF0000, red, blue 等');
                color = toBgr(hex);
            }
        } else {
            color = params.color;
        }
        range.Font.Color = color;
        return ok({});
    } catch (e) {
        return fail('设置文字颜色失败: ' + e.message);
    }
});

registerHandler('insertSectionBreak', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var breakType = params.breakType || 'nextPage';
        var typeMap = { nextPage: 2, continuous: 3, evenPage: 4, oddPage: 5 };
        var type = typeMap[breakType] || 2;
        Application.Selection.InsertBreak(type);
        return ok({});
    } catch (e) {
        return fail('插入分节符失败: ' + e.message);
    }
});

registerHandler('setLineSpacing', function(params) {
    try {
        var doc = Application.ActiveDocument;
        if (!doc) return fail('没有打开的文档');
        var lineSpacing = params.lineSpacing;
        if (lineSpacing === undefined || lineSpacing <= 0) return fail('行距值必须为正数');
        var range;
        if (params.paragraphIndex !== undefined) {
            var paraIdx = parseInt(params.paragraphIndex);
            if (isNaN(paraIdx) || paraIdx < 0 || paraIdx >= doc.Paragraphs.Count) return fail('段落索引超出范围');
            range = doc.Paragraphs.Item(paraIdx + 1).Range;
        } else {
            range = Application.Selection.Range;
        }
        range.ParagraphFormat.LineSpacingRule = 5;
        range.ParagraphFormat.LineSpacing = lineSpacing;
        return ok({});
    } catch (e) {
        return fail('设置行距失败: ' + e.message);
    }
});
