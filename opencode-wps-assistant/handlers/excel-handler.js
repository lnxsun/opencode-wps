/**
 * WPS 表格（Excel）操作处理器
 * 工作簿、单元格、范围、图表、数据操作等
 */

function getExcelSheet(wb, sheet) {
    if (!sheet) return wb.ActiveSheet;
    return wb.Sheets.Item(sheet);
}

registerHandler('getActiveWorkbook', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheets = [];
        for (var i = 1; i <= wb.Sheets.Count; i++) {
            sheets.push({ name: wb.Sheets.Item(i).Name, index: i });
        }
        return ok({
            name: wb.Name,
            path: wb.FullName,
            sheetCount: wb.Sheets.Count,
            sheets: sheets
        });
    } catch (e) {
        return fail('获取工作簿信息失败: ' + e.message);
    }
});

registerHandler('getOpenWorkbooks', function(params) {
    try {
        var wbs = Application.Workbooks;
        var list = [];
        for (var i = 1; i <= wbs.Count; i++) {
            var w = wbs.Item(i);
            list.push({ name: w.Name, path: w.FullName, index: i });
        }
        return ok({ workbooks: list });
    } catch (e) {
        return fail('获取工作簿列表失败: ' + e.message);
    }
});

registerHandler('switchWorkbook', function(params) {
    try {
        var wbs = Application.Workbooks;
        var target = params.name || params.index;
        var found = null;
        if (typeof target === 'number') {
            found = wbs.Item(target);
        } else {
            for (var i = 1; i <= wbs.Count; i++) {
                if (wbs.Item(i).Name === target) { found = wbs.Item(i); break; }
            }
        }
        if (!found) return fail('未找到工作簿: ' + target);
        found.Activate();
        return ok({ name: found.Name });
    } catch (e) {
        return fail('切换工作簿失败: ' + e.message);
    }
});

registerHandler('openWorkbook', function(params) {
    try {
        var filePath = params.path || params.filePath;
        if (!filePath) return invalidParam('缺少 path');
        var wb = Application.Workbooks.Open(filePath);
        return ok({ name: wb.Name, path: wb.FullName });
    } catch (e) {
        return fail('打开工作簿失败: ' + e.message);
    }
});

registerHandler('createWorkbook', function(params) {
    try {
        var wb = Application.Workbooks.Add();
        return ok({ name: wb.Name });
    } catch (e) {
        return fail('创建工作簿失败: ' + e.message);
    }
});

registerHandler('closeWorkbook', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var save = params.save !== undefined ? params.save : true;
        wb.Close(save);
        return ok({});
    } catch (e) {
        return fail('关闭工作簿失败: ' + e.message);
    }
});

registerHandler('getSheetList', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheets = [];
        for (var i = 1; i <= wb.Sheets.Count; i++) {
            sheets.push({ name: wb.Sheets.Item(i).Name, index: i });
        }
        return ok({ sheets: sheets, activeSheet: Application.ActiveSheet.Name });
    } catch (e) {
        return fail('获取工作表列表失败: ' + e.message);
    }
});

registerHandler('switchSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Activate();
        return ok({ name: sheet.Name });
    } catch (e) {
        return fail('切换工作表失败: ' + e.message);
    }
});

registerHandler('renameSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Name = params.name;
        return ok({});
    } catch (e) {
        return fail('重命名工作表失败: ' + e.message);
    }
});

registerHandler('createSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var after = wb.Sheets.Item(wb.Sheets.Count);
        var sheet = wb.Sheets.Add(null, after);
        if (params.name) sheet.Name = params.name;
        return ok({ name: sheet.Name });
    } catch (e) {
        return fail('创建工作表失败: ' + e.message);
    }
});

registerHandler('deleteSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Delete();
        return ok({});
    } catch (e) {
        return fail('删除工作表失败: ' + e.message);
    }
});

registerHandler('copySheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var after = wb.Sheets.Item(wb.Sheets.Count);
        sheet.Copy(null, after);
        return ok({});
    } catch (e) {
        return fail('复制工作表失败: ' + e.message);
    }
});

registerHandler('moveSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var pos = params.position || wb.Sheets.Count;
        sheet.Move(null, wb.Sheets.Item(pos));
        return ok({});
    } catch (e) {
        return fail('移动工作表失败: ' + e.message);
    }
});

registerHandler('getCellValue', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var cell = sheet.Cells.Item(params.row, params.col);
        return ok({ value: cell.Value2, text: cell.Text, formula: cell.Formula });
    } catch (e) {
        return fail('读取单元格失败: ' + e.message);
    }
});

registerHandler('setCellValue', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Cells.Item(params.row, params.col).Value2 = params.value;
        return ok({});
    } catch (e) {
        return fail('设置单元格失败: ' + e.message);
    }
});

registerHandler('getRangeData', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        var data = [];
        for (var r = 1; r <= range.Rows.Count; r++) {
            var row = [];
            for (var c = 1; c <= range.Columns.Count; c++) {
                row.push(range.Cells.Item(r, c).Value2);
            }
            data.push(row);
        }
        return ok({ data: data, rows: range.Rows.Count, columns: range.Columns.Count });
    } catch (e) {
        return fail('读取范围数据失败: ' + e.message);
    }
});

registerHandler('setRangeData', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        var input = params.data || [];
        for (var r = 0; r < input.length && r < range.Rows.Count; r++) {
            for (var c = 0; c < input[r].length && c < range.Columns.Count; c++) {
                range.Cells.Item(r + 1, c + 1).Value2 = input[r][c];
            }
        }
        return ok({});
    } catch (e) {
        return fail('写入范围数据失败: ' + e.message);
    }
});

registerHandler('setFormula', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Cells.Item(params.row, params.col).Formula = params.formula;
        return ok({});
    } catch (e) {
        return fail('设置公式失败: ' + e.message);
    }
});

registerHandler('getFormula', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var formula = sheet.Cells.Item(params.row, params.col).Formula;
        return ok({ formula: formula });
    } catch (e) {
        return fail('获取公式失败: ' + e.message);
    }
});

registerHandler('getContext', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = Application.ActiveSheet;
        var headers = [];
        try {
            var used = sheet.UsedRange;
            if (used.Rows.Count > 0) {
                for (var i = 1; i <= Math.min(used.Columns.Count, 26); i++) {
                    headers.push(String.fromCharCode(64 + i));
                }
            }
        } catch (e) {}

        var sheets = [];
        for (var i = 1; i <= wb.Sheets.Count; i++) {
            sheets.push(wb.Sheets.Item(i).Name);
        }

        return ok({
            workbookName: wb.Name,
            currentSheet: sheet.Name,
            allSheets: sheets,
            selectedCell: Application.Selection ? Application.Selection.Address() : '',
            headers: headers
        });
    } catch (e) {
        return fail('获取上下文失败: ' + e.message);
    }
});

registerHandler('getSelection', function(params) {
    try {
        var sel = Application.Selection;
        if (!sel) return fail('没有选中的区域');
        return ok({ address: sel.Address(), count: sel.Count, row: sel.Row, column: sel.Column });
    } catch (e) {
        return fail('获取选中区域失败: ' + e.message);
    }
});

registerHandler('sortRange', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        var key = params.keyColumn ? sheet.Range(params.keyColumn) : range.Columns.Item(1);
        var order = params.order === 'desc' ? 2 : 1;
        range.Sort(key, order);
        return ok({});
    } catch (e) {
        return fail('排序失败: ' + e.message);
    }
});

registerHandler('autoFilter', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        if (params.criteria) {
            range.AutoFilter(params.field, params.criteria);
        } else {
            range.AutoFilter();
        }
        return ok({});
    } catch (e) {
        return fail('筛选失败: ' + e.message);
    }
});

registerHandler('createChart', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.dataRange);
        var chartTypes = { column: 51, bar: 57, line: 4, pie: 5, area: 1, scatter: -4169 };
        var chartType = chartTypes[params.chartType] || 51;
        var chartObj = sheet.ChartObjects().Add(params.left || 100, params.top || 100, 400, 300);
        chartObj.Chart.SetSourceData(range);
        chartObj.Chart.ChartType = chartType;
        if (params.title) {
            chartObj.Chart.HasTitle = true;
            chartObj.Chart.ChartTitle.Text = params.title;
        }
        return ok({ chartName: chartObj.Name });
    } catch (e) {
        return fail('创建图表失败: ' + e.message);
    }
});

registerHandler('updateChart', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var chartObj = sheet.ChartObjects(params.chartName);
        if (params.dataRange) chartObj.Chart.SetSourceData(sheet.Range(params.dataRange));
        if (params.title) {
            chartObj.Chart.HasTitle = true;
            chartObj.Chart.ChartTitle.Text = params.title;
        }
        return ok({});
    } catch (e) {
        return fail('更新图表失败: ' + e.message);
    }
});

registerHandler('removeDuplicates', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        range.RemoveDuplicates(params.columns || [1], 1);
        return ok({});
    } catch (e) {
        return fail('去重失败: ' + e.message);
    }
});

registerHandler('setBorder', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range || params.rangeAddress);
        var borders = range.Borders;
        if (params.weight !== undefined) {
            for (var i = 1; i <= 6; i++) { borders.Item(i).Weight = params.weight; }
        }
        if (params.styleIndex !== undefined) {
            for (var i = 1; i <= 6; i++) { borders.Item(i).LineStyle = params.styleIndex; }
        }
        if (params.color !== undefined) {
            for (var i = 1; i <= 6; i++) { borders.Item(i).Color = params.color; }
        }
        return ok({});
    } catch (e) {
        return fail('设置边框失败: ' + e.message);
    }
});

registerHandler('setCellFormat', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        if (params.horizontalAlignment !== undefined) range.HorizontalAlignment = params.horizontalAlignment;
        if (params.verticalAlignment !== undefined) range.VerticalAlignment = params.verticalAlignment;
        if (params.wrapText !== undefined) range.WrapText = params.wrapText;
        if (params.mergeCells !== undefined) {
            if (params.mergeCells) range.Merge(); else range.UnMerge();
        }
        return ok({});
    } catch (e) {
        return fail('设置单元格格式失败: ' + e.message);
    }
});

registerHandler('setNumberFormat', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        range.NumberFormat = params.format || params.numberFormat;
        return ok({});
    } catch (e) {
        return fail('设置数字格式失败: ' + e.message);
    }
});

registerHandler('setColumnWidth', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Columns(params.column).ColumnWidth = params.width;
        return ok({});
    } catch (e) {
        return fail('设置列宽失败: ' + e.message);
    }
});

registerHandler('setRowHeight', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Rows(params.row).RowHeight = params.height;
        return ok({});
    } catch (e) {
        return fail('设置行高失败: ' + e.message);
    }
});

registerHandler('autoFitColumn', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Columns(params.column).AutoFit();
        return ok({});
    } catch (e) {
        return fail('自动调整列宽失败: ' + e.message);
    }
});

registerHandler('autoFitRow', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Rows(params.row).AutoFit();
        return ok({});
    } catch (e) {
        return fail('自动调整行高失败: ' + e.message);
    }
});

registerHandler('autoFitAll', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Cells.EntireColumn.AutoFit();
        sheet.Cells.EntireRow.AutoFit();
        return ok({});
    } catch (e) {
        return fail('自动调整失败: ' + e.message);
    }
});

registerHandler('insertRows', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var row = params.row || 1;
        var count = params.count || 1;
        sheet.Rows(row + ':' + (row + count - 1)).Insert();
        return ok({});
    } catch (e) {
        return fail('插入行失败: ' + e.message);
    }
});

registerHandler('deleteRows', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var row = params.row || 1;
        var count = params.count || 1;
        sheet.Rows(row + ':' + (row + count - 1)).Delete();
        return ok({});
    } catch (e) {
        return fail('删除行失败: ' + e.message);
    }
});

registerHandler('insertColumns', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var col = params.column || 1;
        var count = params.count || 1;
        var colNum = typeof col === 'number' ? col : col.toUpperCase().charCodeAt(0) - 64;
        var colLetter = typeof col === 'number' ? String.fromCharCode(64 + col) : col.toUpperCase();
        var endLetter = String.fromCharCode(64 + colNum + count - 1);
        sheet.Columns(colLetter + ':' + endLetter).Insert();
        return ok({});
    } catch (e) {
        return fail('插入列失败: ' + e.message);
    }
});

registerHandler('deleteColumns', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var col = params.column || 1;
        var count = params.count || 1;
        var colNum = typeof col === 'number' ? col : col.toUpperCase().charCodeAt(0) - 64;
        var colLetter = typeof col === 'number' ? String.fromCharCode(64 + col) : col.toUpperCase();
        var endLetter = String.fromCharCode(64 + colNum + count - 1);
        sheet.Columns(colLetter + ':' + endLetter).Delete();
        return ok({});
    } catch (e) {
        return fail('删除列失败: ' + e.message);
    }
});

registerHandler('hideRows', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Rows(params.row + ':' + (params.row + (params.count || 1) - 1)).Hidden = true;
        return ok({});
    } catch (e) {
        return fail('隐藏行失败: ' + e.message);
    }
});

registerHandler('hideColumns', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var col = typeof params.column === 'number' ? String.fromCharCode(64 + params.column) : params.column;
        sheet.Columns(col).Hidden = true;
        return ok({});
    } catch (e) {
        return fail('隐藏列失败: ' + e.message);
    }
});

registerHandler('showRows', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Rows(params.row + ':' + (params.row + (params.count || 1) - 1)).Hidden = false;
        return ok({});
    } catch (e) {
        return fail('显示行失败: ' + e.message);
    }
});

registerHandler('showColumns', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var col = typeof params.column === 'number' ? String.fromCharCode(64 + params.column) : params.column;
        sheet.Columns(col).Hidden = false;
        return ok({});
    } catch (e) {
        return fail('显示列失败: ' + e.message);
    }
});

registerHandler('mergeCells', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).Merge();
        return ok({});
    } catch (e) {
        return fail('合并单元格失败: ' + e.message);
    }
});

registerHandler('unmergeCells', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).UnMerge();
        return ok({});
    } catch (e) {
        return fail('取消合并失败: ' + e.message);
    }
});

registerHandler('freezePanes', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var cell = sheet.Cells.Item(params.row || 2, params.col || 2);
        sheet.Activate();
        cell.Activate();
        Application.ActiveWindow.FreezePanes = true;
        return ok({});
    } catch (e) {
        return fail('冻结窗格失败: ' + e.message);
    }
});

registerHandler('unfreezePanes', function(params) {
    try {
        Application.ActiveWindow.FreezePanes = false;
        return ok({});
    } catch (e) {
        return fail('取消冻结失败: ' + e.message);
    }
});

registerHandler('protectSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Protect(params.password || '');
        return ok({});
    } catch (e) {
        return fail('保护工作表失败: ' + e.message);
    }
});

registerHandler('unprotectSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Unprotect(params.password || '');
        return ok({});
    } catch (e) {
        return fail('取消保护失败: ' + e.message);
    }
});

registerHandler('protectWorkbook', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        wb.Protect(params.password || '');
        return ok({});
    } catch (e) {
        return fail('保护工作簿失败: ' + e.message);
    }
});

registerHandler('addCellComment', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var cell = sheet.Cells.Item(params.row, params.col);
        cell.AddComment(params.text || '');
        return ok({});
    } catch (e) {
        return fail('添加批注失败: ' + e.message);
    }
});

registerHandler('getCellComments', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var comments = [];
        for (var i = 1; i <= sheet.Comments.Count; i++) {
            var c = sheet.Comments.Item(i);
            comments.push({ cell: c.Parent.Address(), text: c.Text, author: c.Author || '' });
        }
        return ok({ comments: comments });
    } catch (e) {
        return fail('获取批注失败: ' + e.message);
    }
});

registerHandler('deleteCellComment', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Cells.Item(params.row, params.col).ClearComments();
        return ok({});
    } catch (e) {
        return fail('删除批注失败: ' + e.message);
    }
});

registerHandler('addConditionalFormat', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        var fc = range.FormatConditions.Add(1, 2, 1, params.formula);
        fc.Interior.Color = params.color || 0xFF0000;
        return ok({});
    } catch (e) {
        return fail('添加条件格式失败: ' + e.message);
    }
});

registerHandler('clearRange', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).Clear();
        return ok({});
    } catch (e) {
        return fail('清除区域失败: ' + e.message);
    }
});

registerHandler('clearFormats', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).ClearFormats();
        return ok({});
    } catch (e) {
        return fail('清除格式失败: ' + e.message);
    }
});

registerHandler('findInSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var found = sheet.Cells.Find(params.query || params.text);
        if (found) {
            return ok({ found: true, cell: found.Address(), value: found.Value2 });
        }
        return ok({ found: false });
    } catch (e) {
        return fail('查找失败: ' + e.message);
    }
});

registerHandler('replaceInSheet', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Cells.Replace(params.findText, params.replaceText);
        return ok({});
    } catch (e) {
        return fail('替换失败: ' + e.message);
    }
});

registerHandler('setHyperlink', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var cell = sheet.Cells.Item(params.row, params.col);
        sheet.Hyperlinks.Add(cell, params.url);
        if (params.text) cell.Value2 = params.text;
        return ok({});
    } catch (e) {
        return fail('设置超链接失败: ' + e.message);
    }
});

registerHandler('setCellStyle', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        if (params.fontName) range.Font.Name = params.fontName;
        if (params.fontSize) range.Font.Size = params.fontSize;
        if (params.bold !== undefined) range.Font.Bold = params.bold;
        if (params.fontColor) range.Font.Color = params.fontColor;
        if (params.backgroundColor) range.Interior.Color = params.backgroundColor;
        if (params.horizontalAlignment) range.HorizontalAlignment = params.horizontalAlignment;
        return ok({});
    } catch (e) {
        return fail('设置单元格样式失败: ' + e.message);
    }
});

registerHandler('calculateSheet', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Calculate();
        return ok({});
    } catch (e) {
        return fail('计算失败: ' + e.message);
    }
});

registerHandler('wrapText', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).WrapText = true;
        return ok({});
    } catch (e) {
        return fail('自动换行失败: ' + e.message);
    }
});

registerHandler('lockCells', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).Locked = true;
        return ok({});
    } catch (e) {
        return fail('锁定单元格失败: ' + e.message);
    }
});

registerHandler('fillSeries', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        range.AutoFill(range.Resize(params.rowCount || range.Rows.Count, params.colCount || range.Columns.Count));
        return ok({});
    } catch (e) {
        return fail('填充序列失败: ' + e.message);
    }
});

registerHandler('copyRange', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var srcSheet = getExcelSheet(wb, params.sourceSheet || params.sheet);
        var dstSheet = getExcelSheet(wb, params.targetSheet || params.sheet);
        srcSheet.Range(params.sourceRange || params.range).Copy(dstSheet.Range(params.targetRange));
        return ok({});
    } catch (e) {
        return fail('复制区域失败: ' + e.message);
    }
});

registerHandler('pasteRange', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        sheet.Paste(sheet.Range(params.targetRange));
        return ok({});
    } catch (e) {
        return fail('粘贴失败: ' + e.message);
    }
});

registerHandler('transpose', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var src = sheet.Range(params.range);
        src.Copy();
        var dst = sheet.Range(params.targetRange);
        dst.PasteSpecial(-4104);
        Application.CutCopyMode = false;
        return ok({});
    } catch (e) {
        return fail('转置失败: ' + e.message);
    }
});

registerHandler('textToColumns', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        range.TextToColumns(range, 1, 1, true);
        return ok({});
    } catch (e) {
        return fail('分列失败: ' + e.message);
    }
});

registerHandler('subtotal', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        range.Subtotal(1, -4157, range.Columns.Count, false, true, false);
        return ok({});
    } catch (e) {
        return fail('分类汇总失败: ' + e.message);
    }
});

registerHandler('consolidate', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.range);
        range.Consolidate(params.sources || [], params.function || 4);
        return ok({});
    } catch (e) {
        return fail('合并计算失败: ' + e.message);
    }
});

registerHandler('createPivotTable', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var pc = wb.PivotCaches().Create(1, sheet.Range(params.sourceRange));
        var ptSheet = wb.Sheets.Add();
        var pt = pc.CreatePivotTable(ptSheet.Range('A1'), params.name || 'PivotTable1');
        if (params.rowField) pt.AddFields(params.rowField);
        if (params.dataField) {
            var df = pt.AddDataField(pt.PivotFields(params.dataField));
            if (params.summarizeFunction !== undefined) df.Function = params.summarizeFunction;
        }
        return ok({});
    } catch (e) {
        return fail('创建数据透视表失败: ' + e.message);
    }
});

registerHandler('updatePivotTable', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var pt = sheet.PivotTables(params.name || sheet.PivotTables(1).Name);
        pt.RefreshTable();
        return ok({});
    } catch (e) {
        return fail('更新透视表失败: ' + e.message);
    }
});

registerHandler('createNamedRange', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        wb.Names.Add(params.name, wb.ActiveSheet.Range(params.range));
        return ok({});
    } catch (e) {
        return fail('创建命名区域失败: ' + e.message);
    }
});

registerHandler('getNamedRanges', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var list = [];
        for (var i = 1; i <= wb.Names.Count; i++) {
            list.push({ name: wb.Names.Item(i).Name, range: wb.Names.Item(i).Value });
        }
        return ok({ namedRanges: list });
    } catch (e) {
        return fail('获取命名区域失败: ' + e.message);
    }
});

registerHandler('deleteNamedRange', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        wb.Names.Item(params.name).Delete();
        return ok({});
    } catch (e) {
        return fail('删除命名区域失败: ' + e.message);
    }
});

registerHandler('groupRows', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var range = sheet.Range(params.row + ':' + (params.row + (params.count || 1) - 1));
        range.Group();
        return ok({});
    } catch (e) {
        return fail('组合行失败: ' + e.message);
    }
});

registerHandler('groupColumns', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var col = typeof params.column === 'number' ? String.fromCharCode(64 + params.column) : params.column;
        var range = sheet.Range(col + ':' + String.fromCharCode(64 + params.column + (params.count || 1) - 1));
        range.Group();
        return ok({});
    } catch (e) {
        return fail('组合列失败: ' + e.message);
    }
});

registerHandler('addDataValidation', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        var dv = range.Validation;
        dv.Delete();
        dv.Add(3, 1, 1, params.formula1 || '', params.formula2 || '');
        return ok({});
    } catch (e) {
        return fail('添加数据验证失败: ' + e.message);
    }
});

registerHandler('setArrayFormula', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.range).FormulaArray = params.formula;
        return ok({});
    } catch (e) {
        return fail('设置数组公式失败: ' + e.message);
    }
});

registerHandler('setPrintArea', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.PageSetup.PrintArea = params.range;
        return ok({});
    } catch (e) {
        return fail('设置打印区域失败: ' + e.message);
    }
});

registerHandler('insertExcelImage', function(params) {
    try {
        var sheet = Application.ActiveSheet;
        var filePath = params.path || params.imagePath;
        if (!filePath) return invalidParam('缺少 path');
        var pic = sheet.Shapes.AddPicture(filePath, false, true, params.left || 0, params.top || 0, params.width || -1, params.height || -1);
        return ok({ name: pic.Name });
    } catch (e) {
        return fail('插入图片失败: ' + e.message);
    }
});

registerHandler('exportChartAsImage', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var outputPath = params.outputPath || params.path;
        if (!outputPath) return invalidParam('缺少 outputPath');
        var chartName = params.chartName;
        if (!chartName) return invalidParam('缺少 chartName');
        var format = (params.format || 'PNG').toUpperCase();
        var filterName = format === 'JPEG' ? 'JPG' : format;
        var chartObj = sheet.ChartObjects(chartName);
        chartObj.Chart.Export(outputPath, filterName);
        return ok({ chartName: chartName, outputPath: outputPath, format: filterName });
    } catch (e) {
        return fail('导出图表为图片失败: ' + e.message);
    }
});

registerHandler('exportRangeAsImage', function(params) {
    var tempChart = null;
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var outputPath = params.outputPath || params.path;
        if (!outputPath) return invalidParam('缺少 outputPath');
        if (!params.range) return invalidParam('缺少 range');
        var format = (params.format || 'PNG').toUpperCase();
        var filterName = format === 'JPEG' ? 'JPG' : format;
        var range = sheet.Range(params.range);
        range.CopyPicture(1, 2);
        tempChart = sheet.ChartObjects().Add(0, 0, range.Width, range.Height);
        tempChart.Activate();
        tempChart.Chart.Paste();
        tempChart.Chart.Export(outputPath, filterName);
        tempChart.Delete();
        tempChart = null;
        return ok({ range: params.range, outputPath: outputPath, format: filterName });
    } catch (e) {
        if (tempChart) { try { tempChart.Delete(); } catch (ce) {} }
        return fail('导出区域为图片失败: ' + e.message);
    }
});

registerHandler('cleanData', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        range.Replace(' ', '', 2);
        range.Replace('\t', '', 2);
        return ok({});
    } catch (e) {
        return fail('清洗数据失败: ' + e.message);
    }
});

registerHandler('copyFormat', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        sheet.Range(params.sourceRange).Copy();
        sheet.Range(params.targetRange).PasteSpecial(-4122);
        Application.CutCopyMode = false;
        return ok({});
    } catch (e) {
        return fail('复制格式失败: ' + e.message);
    }
});

registerHandler('autoSum', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = getExcelSheet(wb, params.sheet);
        var range = sheet.Range(params.range);
        range.Select();
        var result;
        if (typeof Application.WorksheetFunction !== 'undefined' && Application.WorksheetFunction.Sum) {
            result = Application.WorksheetFunction.Sum(range);
        } else {
            var cells = range.Cells;
            var sum = 0;
            for (var i = 1; i <= cells.Count; i++) {
                var v = cells.Item(i).Value;
                if (typeof v === 'number') sum += v;
            }
            result = sum;
        }
        return ok({ result: result });
    } catch (e) {
        return fail('自动求和失败: ' + e.message);
    }
});

registerHandler('evaluateFormula', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var formula = params.formula;
        var cell = params.cell || 'A1';
        var sheet = wb.ActiveSheet;
        if (typeof Application.Evaluate === 'function') {
            var result = Application.Evaluate(formula);
            return ok({ result: result });
        }
        var target = sheet.Range(cell);
        var origFormula = target.Formula;
        target.Formula = formula;
        var value = target.Value;
        target.Formula = origFormula;
        return ok({ result: value });
    } catch (e) {
        return fail('公式计算失败: ' + e.message);
    }
});

registerHandler('setZoom', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var percent = params.percent;
        if (percent < 10 || percent > 400) return fail('缩放比例必须在10-400之间');
        Application.ActiveWindow.Zoom = percent;
        return ok({});
    } catch (e) {
        return fail('设置缩放失败: ' + e.message);
    }
});

registerHandler('diagnoseFormula', function(params) {
    try {
        var wb = Application.ActiveWorkbook;
        if (!wb) return fail('没有打开的工作簿');
        var sheet = Application.ActiveSheet;
        var cell = sheet.Range(params.cell);
        var value = cell.Value;
        var formula = cell.Formula;
        var errorType = null, diagnosis = '', suggestion = '';
        var precedents = [];
        if (typeof value === 'string' && value.charAt(0) === '#') {
            errorType = value;
            if (value === '#REF!') { diagnosis = '引用了不存在的单元格或区域'; suggestion = '检查引用区域是否被删除或移动'; }
            else if (value === '#N/A') { diagnosis = '查找函数未找到匹配值'; suggestion = '确认查找值存在，或检查匹配条件'; }
            else if (value === '#VALUE!') { diagnosis = '参数类型不正确或运算类型不匹配'; suggestion = '检查函数参数类型和引用单元格'; }
            else if (value === '#NAME?') { diagnosis = '函数名或名称拼写错误'; suggestion = '检查函数名是否正确'; }
            else if (value === '#DIV/0!') { diagnosis = '除数为零'; suggestion = '检查除数单元格，避免除以零'; }
            else if (value === '#NUM!') { diagnosis = '数值无效或超出范围'; suggestion = '检查函数参数范围'; }
            else if (value === '#NULL!') { diagnosis = '交集为空'; suggestion = '检查引用区域的交集是否存在'; }
            else { diagnosis = '未知错误'; suggestion = '检查公式与引用'; }
        }
        try {
            var refs = cell.DirectPrecedents;
            if (refs) {
                for (var i = 1; i <= refs.Areas.Count; i++) {
                    precedents.push(refs.Areas.Item(i).Address());
                }
            }
        } catch (e) {}
        return ok({ cell: params.cell, formula: formula, currentValue: value, errorType: errorType, diagnosis: diagnosis, suggestion: suggestion, precedents: precedents });
    } catch (e) {
        return fail('诊断公式失败: ' + e.message);
    }
});
