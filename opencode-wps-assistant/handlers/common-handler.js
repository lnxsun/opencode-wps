/**
 * 通用操作处理器
 * 跨应用操作、连接检测、文档信息等
 */

registerHandler('ping', function(params) {
    return ok({ message: 'pong', timestamp: new Date().getTime(), platform: 'mac' });
});

registerHandler('wireCheck', function(params) {
    return ok({ message: 'WPS Bridge 已连接', appType: getAppType() });
});

registerHandler('getAppInfo', function(params) {
    return getAppInfoImpl();
});

registerHandler('getSelectedText', function(params) {
    try {
        var sel = Application.Selection;
        if (!sel) return fail('没有选中内容');
        return ok({ text: sel.Text || '', length: (sel.Text || '').length });
    } catch (e) {
        return fail('获取选中文本失败: ' + e.message);
    }
});

registerHandler('setSelectedText', function(params) {
    try {
        var sel = Application.Selection;
        if (!sel) return fail('没有选中的文本范围');
        sel.Text = params.text || '';
        return ok({});
    } catch (e) {
        return fail('设置选中文本失败: ' + e.message);
    }
});

registerHandler('save', function(params) {
    try {
        var doc = getActiveDoc();
        if (!doc) return fail('没有打开的文档');
        doc.Save();
        return ok({});
    } catch (e) {
        return fail('保存失败: ' + e.message);
    }
});

registerHandler('saveAs', function(params) {
    try {
        var doc = getActiveDoc();
        if (!doc) return fail('没有打开的文档');
        var filePath = params.path || params.filePath;
        if (!filePath) return invalidParam('缺少 path');
        doc.SaveAs(filePath);
        return ok({ path: filePath });
    } catch (e) {
        return fail('另存为失败: ' + e.message);
    }
});

registerHandler('openFile', function(params) {
    try {
        var filePath = params.path || params.filePath;
        if (!filePath) return invalidParam('缺少 path');

        var appType = null;
        var lower = filePath.toLowerCase();
        if (lower.indexOf('.xls') !== -1) appType = 'et';
        else if (lower.indexOf('.doc') !== -1) appType = 'wps';
        else if (lower.indexOf('.ppt') !== -1) appType = 'wpp';
        else appType = getAppType();

        var app = getWpsApp(appType);
        if (!app) return fail('无法获取 WPS 应用实例');

        var docs = app.Workbooks || (appType === 'wps' ? app.Documents : app.Presentations);
        if (docs) {
            docs.Open(filePath);
        } else {
            return fail('当前应用不支持打开文件: ' + appType);
        }
        return ok({ path: filePath });
    } catch (e) {
        return fail('打开文件失败: ' + e.message);
    }
});

registerHandler('convertToPDF', function(params) {
    try {
        var doc = getActiveDoc();
        if (!doc) return fail('没有打开的文档');
        var outputPath = params.outputPath || params.path;
        if (!outputPath) return invalidParam('缺少 outputPath');
        doc.ExportAsFixedFormat(outputPath, 17);
        return ok({ outputPath: outputPath });
    } catch (e) {
        return fail('导出 PDF 失败: ' + e.message);
    }
});

registerHandler('getDocumentStats', function(params) {
    try {
        var doc = getActiveDoc();
        if (!doc) return fail('没有打开的文档');
        return ok({
            name: doc.Name,
            path: doc.FullName,
            paragraphCount: doc.Paragraphs ? doc.Paragraphs.Count : 0,
            wordCount: doc.Words ? doc.Words.Count : 0,
            characterCount: doc.Characters ? doc.Characters.Count : 0
        });
    } catch (e) {
        return fail('获取文档统计失败: ' + e.message);
    }
});

function getAppType() {
    try {
        if (typeof Application === 'undefined') return 'unknown';
        var name = '';
        try { name = Application.Name || ''; } catch (e) {}

        if (name.indexOf('表格') !== -1 || name.indexOf('Excel') !== -1 || name.indexOf('ET') !== -1 || name.indexOf('Spreadsheet') !== -1) return 'et';
        if (name.indexOf('演示') !== -1 || name.indexOf('Presentation') !== -1 || name.indexOf('WPP') !== -1 || name.indexOf('Slide') !== -1) return 'wpp';
        if (name.indexOf('文字') !== -1 || name.indexOf('Writer') !== -1 || name.indexOf('Word') !== -1 || name.indexOf('WPS') !== -1) return 'wps';

        try { if (Application.ActiveDocument) return 'wps'; } catch (e) {}
        try { if (Application.ActiveWorkbook) return 'et'; } catch (e) {}
        try { if (Application.ActivePresentation) return 'wpp'; } catch (e) {}
    } catch (e) {}
    return 'unknown';
}

function getAppInfoImpl() {
    try {
        var appType = getAppType();
        var appName = '';
        try { appName = Application.Name || ''; } catch (e) {}
        return ok({
            appType: appType,
            appName: appName,
            platform: 'mac',
            version: 1
        });
    } catch (e) {
        return ok({ appType: 'unknown', appName: '', platform: 'mac' });
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

function getWpsApp(appType) {
    try {
        if (typeof Application === 'undefined') return null;
        return Application;
    } catch (e) {
        return null;
    }
}
