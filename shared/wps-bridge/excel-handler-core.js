/**
 * WPS 表格（Excel）操作处理器
 * 工作簿、单元格、范围、图表、数据操作等
 */

// 将列号（1-based）转换为 Excel 列字母：1->A, 26->Z, 27->AA, 52->AZ, 703->AAA ...

// 将列参数（数字列号或字母串）统一解析为列字母：1->A, 27->AA, 'AB'->AB；非法返回 null

// 将列字母转回列号：A->1, Z->26, AA->27, AB->28；数字列号原样返回；非法返回 null
// （与 colToLetter 对称，供 insertColumns/deleteColumns/groupColumns 计算结束列用）

// 单元格行/列参数校验：必须为正整数（1-based），非法返回 null
// 供 getCellValue/setCellValue/setFormula/getFormula/addCellComment/deleteCellComment/setHyperlink 等
// 单元格级 handler 统一使用（与 insertRows/insertColumns 的行列校验语义对齐）

// 对齐常量（与 Windows wps-com.ps1 的 H_ALIGN_MAP / V_ALIGN_MAP 保持一致）
var H_ALIGN_MAP = { left: -4131, center: -4108, right: -4152 };
var V_ALIGN_MAP = { top: -4160, center: -4108, bottom: -4107 };

// 将对齐参数解析为 Excel 常量：数字直接使用，字符串走映射，非法值返回 null

// 将颜色参数解析为 Excel BGR 整数值：支持 #RRGGBB、RRGGBB、RGB 简写；数字直接返回

registerHandler('getActiveWorkbook', function (params) {
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
      sheets: sheets,
    });
  } catch (e) {
    return fail('获取工作簿信息失败: ' + e.message);
  }
});

registerHandler('getOpenWorkbooks', function (params) {
  try {
    // Workbooks 集合保护：无活动窗口时访问抛错（与 getOpenDocuments 第 7 轮修复对齐）
    if (!Application.Workbooks) return ok({ workbooks: [] });
    var wbs = Application.Workbooks;
    var list = [];
    for (var i = 1; i <= wbs.Count; i++) {
      var w = wbs.Item(i);
      list.push({ name: w.Name, path: w.FullName, index: i });
    }
    return ok({ workbooks: list });
  } catch (e) {
    return ok({ workbooks: [], error: e.message });
  }
});

registerHandler('switchWorkbook', function (params) {
  try {
    var wbs = Application.Workbooks;
    var target = params.name !== undefined ? params.name : params.index;
    if (target === undefined || target === null || target === '')
      return invalidParam('缺少 name 或 index');
    var found = null;
    if (typeof target === 'number') {
      found = wbs.Item(target);
    } else {
      for (var i = 1; i <= wbs.Count; i++) {
        if (wbs.Item(i).Name === target) {
          found = wbs.Item(i);
          break;
        }
      }
    }
    if (!found) return fail('未找到工作簿: ' + target);
    found.Activate();
    return ok({ name: found.Name });
  } catch (e) {
    return fail('切换工作簿失败: ' + e.message);
  }
});

registerHandler('openWorkbook', function (params) {
  try {
    var filePath = params.path || params.filePath;
    if (!filePath) return invalidParam('缺少 path');
    var wb = Application.Workbooks.Open(filePath);
    return ok({ name: wb.Name, path: wb.FullName });
  } catch (e) {
    return fail('打开工作簿失败: ' + e.message);
  }
});

registerHandler('createWorkbook', function (params) {
  try {
    var wb = Application.Workbooks.Add();
    return ok({ name: wb.Name });
  } catch (e) {
    return fail('创建工作簿失败: ' + e.message);
  }
});

registerHandler('closeWorkbook', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    // save 显式布尔化：'false' 字符串不能被真值判断放行（布尔参数语义）
    var save = params.save === undefined ? true : !!params.save;
    wb.Close(save);
    return ok({});
  } catch (e) {
    return fail('关闭工作簿失败: ' + e.message);
  }
});

registerHandler('getSheetList', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheets = [];
    for (var i = 1; i <= wb.Sheets.Count; i++) {
      sheets.push({ name: wb.Sheets.Item(i).Name, index: i });
    }
    // ActiveSheet 包 try/catch：无活动工作表时抛错导致整个列表获取失败（与 getContext selectedCell 保护模式一致）
    var activeName = '';
    try {
      activeName = Application.ActiveSheet.Name;
    } catch (e) {}
    return ok({ sheets: sheets, activeSheet: activeName });
  } catch (e) {
    return fail('获取工作表列表失败: ' + e.message);
  }
});

registerHandler('switchSheet', function (params) {
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

registerHandler('renameSheet', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // name 前置校验：空名直赋抛费解错误
    if (!params.name) return invalidParam('缺少 name');
    sheet.Name = params.name;
    return ok({});
  } catch (e) {
    return fail('重命名工作表失败: ' + e.message);
  }
});

registerHandler('createSheet', function (params) {
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

registerHandler('deleteSheet', function (params) {
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

registerHandler('copySheet', function (params) {
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

registerHandler('moveSheet', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var pos = params.position !== undefined ? parseInt(params.position, 10) : wb.Sheets.Count;
    // position 显式校验：0/负数/字符串静默兜底 + 越界抛费解错误
    if (isNaN(pos) || pos < 1 || pos > wb.Sheets.Count)
      return fail('无效的目标位置: ' + params.position + '（合法范围 1~' + wb.Sheets.Count + '）');
    sheet.Move(null, wb.Sheets.Item(pos));
    return ok({});
  } catch (e) {
    return fail('移动工作表失败: ' + e.message);
  }
});

registerHandler('getCellValue', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    var cell = sheet.Cells.Item(rc.row, rc.col);
    // cell.Text 包 try/catch：部分 WPS 对日期/公式单元格访问 .Text 抛错，Value2/Formula 已拿到不应丢弃
    var textVal = '';
    try {
      textVal = cell.Text;
    } catch (e) {}
    return ok({ value: cell.Value2, text: textVal, formula: cell.Formula });
  } catch (e) {
    return fail('读取单元格失败: ' + e.message);
  }
});

registerHandler('setCellValue', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    sheet.Cells.Item(rc.row, rc.col).Value2 = params.value;
    return ok({});
  } catch (e) {
    return fail('设置单元格失败: ' + e.message);
  }
});

registerHandler('getRangeData', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // range 前置校验 + 边界上限：Range(undefined) 抛费解错误；超大范围（如 A1:XFD1048576）批量读取 OOM
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    var cellCount = range.Rows.Count * range.Columns.Count;
    var MAX_CELLS = 1000000;
    if (cellCount > MAX_CELLS)
      return fail('范围过大（' + cellCount + ' 单元格，上限 ' + MAX_CELLS + '），请缩小 range');
    var data = [];
    // 优先批量读取（range.Value2 返回二维数组，一次 COM 往返）；失败时降级逐格（兼容旧 WPS JSAPI）
    try {
      var matrix = range.Value2;
      if (matrix && typeof matrix === 'object' && matrix.length !== undefined) {
        for (var r = 0; r < matrix.length; r++) {
          var row = [];
          var srcRow = matrix[r];
          if (srcRow && typeof srcRow === 'object' && srcRow.length !== undefined) {
            for (var c = 0; c < srcRow.length; c++) row.push(srcRow[c]);
          } else if (srcRow === null || srcRow === undefined) {
            // 空行（Value2 中为 null/undefined）：展开为与列数一致的 null 数组，避免列结构错位
            for (var c = 0; c < range.Columns.Count; c++) row.push(null);
          } else {
            // 单行返回一维数组的情况
            row.push(srcRow);
          }
          data.push(row);
        }
        return ok({ data: data, rows: range.Rows.Count, columns: range.Columns.Count });
      }
    } catch (e) {
      console.error('批量读取失败，降级逐格:', e);
    }
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

registerHandler('setRangeData', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // range 前置校验：Range(undefined) 抛费解错误
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    // OOM 边界（与 getRangeData 第 5 轮修复对称）：超大范围写入 OOM/长时间阻塞
    var cellCount = range.Rows.Count * range.Columns.Count;
    var MAX_CELLS = 1000000;
    if (cellCount > MAX_CELLS)
      return fail('范围过大（' + cellCount + ' 单元格，上限 ' + MAX_CELLS + '），请缩小 range');
    var input = params.data || [];
    // 将一行输入归一化为数组（兼容标量/null 行），供批量与逐格路径共用，避免降级时 input[r].length 抛 TypeError
    function toRowArray(src, maxCols) {
      var row = [];
      if (src && typeof src === 'object' && src.length !== undefined) {
        for (var c = 0; c < src.length && c < maxCols; c++) row.push(src[c]);
      } else {
        row.push(src);
      }
      return row;
    }
    // 优先批量写入（range.Value2 = 二维数组，一次 COM 往返）；失败时降级逐格
    try {
      var matrix = [];
      for (var r = 0; r < input.length && r < range.Rows.Count; r++) {
        matrix.push(toRowArray(input[r], range.Columns.Count));
      }
      range.Value2 = matrix;
      return ok({});
    } catch (e) {
      console.error('批量写入失败，降级逐格:', e);
    }
    for (var r = 0; r < input.length && r < range.Rows.Count; r++) {
      var srcRow = toRowArray(input[r], range.Columns.Count);
      for (var c = 0; c < srcRow.length; c++) {
        range.Cells.Item(r + 1, c + 1).Value2 = srcRow[c];
      }
    }
    return ok({});
  } catch (e) {
    return fail('写入范围数据失败: ' + e.message);
  }
});

registerHandler('setFormula', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    // formula 前置校验：Formula = undefined 直赋 COM 抛费解错误（与 evaluateFormula 语义对齐）
    if (typeof params.formula !== 'string' || !params.formula) return invalidParam('缺少 formula');
    sheet.Cells.Item(rc.row, rc.col).Formula = params.formula;
    return ok({});
  } catch (e) {
    return fail('设置公式失败: ' + e.message);
  }
});

registerHandler('getFormula', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    var formula = sheet.Cells.Item(rc.row, rc.col).Formula;
    return ok({ formula: formula });
  } catch (e) {
    return fail('获取公式失败: ' + e.message);
  }
});

registerHandler('getContext', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = Application.ActiveSheet;
    var headers = [];
    var headerRow = 0;
    try {
      var used = sheet.UsedRange;
      if (used.Rows.Count > 0) {
        // 读取首行真实值作为表头候选（若首行是数据而非表头，则 headerRow 标记为 0）
        var colCount = Math.min(used.Columns.Count, 26);
        var firstRowValues = [];
        var textCount = 0;
        for (var i = 1; i <= colCount; i++) {
          var hv = used.Cells.Item(1, i).Value2;
          var s = hv !== null && hv !== undefined ? String(hv) : '';
          firstRowValues.push(s);
          // 表头通常是文本：非空且非纯数字才算文本候选（过滤纯数字数据行误判）
          if (s !== '' && isNaN(Number(s))) textCount++;
        }
        // 首行大部分单元格为文本时视为表头
        if (textCount >= Math.ceil(colCount / 2)) {
          headers = firstRowValues;
          headerRow = 1;
        }
      }
    } catch (e) {}

    var sheets = [];
    for (var i = 1; i <= wb.Sheets.Count; i++) {
      sheets.push(wb.Sheets.Item(i).Name);
    }

    // selectedCell 包 try/catch：部分 WPS 版本在无选中/无活动窗口时访问 Application.Selection 抛错（而非返回 null），
    // 三元判断捕获不了异常会导致 getContext 整体 fail
    var selectedCell = '';
    try {
      if (Application.Selection) selectedCell = Application.Selection.Address();
    } catch (e) {}

    return ok({
      workbookName: wb.Name,
      currentSheet: sheet.Name,
      allSheets: sheets,
      selectedCell: selectedCell,
      headers: headers,
      headerRow: headerRow,
    });
  } catch (e) {
    return fail('获取上下文失败: ' + e.message);
  }
});

registerHandler('getSelection', function (params) {
  try {
    // Selection 包 try/catch：无选中/无活动窗口时部分 WPS 抛错而非返回 null（与 getContext 修复模式一致）
    var sel = null;
    try {
      sel = Application.Selection;
    } catch (e) {}
    if (!sel) return fail('没有选中的区域');
    return ok({ address: sel.Address(), count: sel.Count, row: sel.Row, column: sel.Column });
  } catch (e) {
    return fail('获取选中区域失败: ' + e.message);
  }
});

registerHandler('sortRange', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    // keyColumn 支持列字母（'A'）或完整地址（'A1'/'$A$1'）：纯字母补行号，避免 Range('A') 抛费解错误
    var key = null;
    if (params.keyColumn) {
      var kc = String(params.keyColumn).trim();
      if (/^[A-Za-z]+$/.test(kc)) kc = kc.toUpperCase() + '1';
      key = sheet.Range(kc);
    } else {
      key = range.Columns.Item(1);
    }
    // order 大小写不敏感：'DESC'/'Desc' 都识别为降序，避免 AI 传大写静默变升序
    var orderStr = String(params.order || '').toLowerCase();
    var order = orderStr === 'desc' ? 2 : 1;
    range.Sort(key, order);
    return ok({});
  } catch (e) {
    return fail('排序失败: ' + e.message);
  }
});

registerHandler('autoFilter', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    if (params.criteria) {
      // field 前置校验：criteria 存在但 field 缺失时 AutoFilter(undefined, ...) 抛费解错误
      if (params.field === undefined || params.field === null)
        return fail('缺少 field（筛选条件列）');
      range.AutoFilter(params.field, params.criteria);
    } else {
      range.AutoFilter();
    }
    return ok({});
  } catch (e) {
    return fail('筛选失败: ' + e.message);
  }
});

registerHandler('createChart', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    // dataRange 前置校验：Range(undefined) 抛费解错误（与 updateChart 语义对齐）
    if (!params.dataRange) return invalidParam('缺少 dataRange');
    var range = sheet.Range(params.dataRange);
    var chartTypes = { column: 51, bar: 57, line: 4, pie: 5, area: 1, scatter: -4169 };
    var chartType = chartTypes[params.chartType] || 51;
    // left/top 显式数值化：0 是合法值，不能 || 兜底成 100
    var left = params.left !== undefined ? parseFloat(params.left) : 100;
    if (isNaN(left)) return fail('无效的 left: ' + params.left);
    var top = params.top !== undefined ? parseFloat(params.top) : 100;
    if (isNaN(top)) return fail('无效的 top: ' + params.top);
    var chartObj = sheet.ChartObjects().Add(left, top, 400, 300);
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

registerHandler('updateChart', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    // chartName 前置校验：ChartObjects(undefined) 抛费解错误（与 createChart 语义对齐）
    if (!params.chartName) return invalidParam('缺少 chartName');
    var sheet = getExcelSheet(wb, params.sheet);
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

registerHandler('removeDuplicates', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    range.RemoveDuplicates(params.columns || [1], 1);
    return ok({});
  } catch (e) {
    return fail('去重失败: ' + e.message);
  }
});

registerHandler('setBorder', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // range 参数（rangeAddress 旧兼容参数已清理，无上游调用方）
    var rangeParam = params.range;
    if (!rangeParam) return invalidParam('缺少 range');
    var range = sheet.Range(rangeParam);
    var borders = range.Borders;
    if (params.weight !== undefined) {
      for (var i = 1; i <= 6; i++) {
        borders.Item(i).Weight = params.weight;
      }
    }
    if (params.styleIndex !== undefined) {
      for (var i = 1; i <= 6; i++) {
        borders.Item(i).LineStyle = params.styleIndex;
      }
    }
    if (params.color !== undefined) {
      // 颜色统一走 toExcelColor 转换（支持 #RRGGBB/RRGGBB/数字），避免字符串色值抛类型错误
      var bc = toExcelColor(params.color);
      if (bc === null)
        return fail('无效的边框颜色: ' + params.color + '，支持 #RRGGBB/RRGGBB/数字');
      for (var i = 1; i <= 6; i++) {
        borders.Item(i).Color = bc;
      }
    }
    return ok({});
  } catch (e) {
    return fail('设置边框失败: ' + e.message);
  }
});

registerHandler('setCellFormat', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    var fmt = params.format || {};
    // 数字格式（format 对象内的优先，顶层兼容旧调用）
    if (fmt.numberFormat) range.NumberFormat = fmt.numberFormat;
    else if (params.numberFormat) range.NumberFormat = params.numberFormat;
    // 视觉格式（从 format 对象读取，与 Windows wps-com.ps1 参数对齐）
    if (typeof fmt.fontSize === 'number' && fmt.fontSize > 0) range.Font.Size = fmt.fontSize;
    if (fmt.bold !== undefined) range.Font.Bold = !!fmt.bold;
    if (fmt.italic !== undefined) range.Font.Italic = !!fmt.italic;
    if (fmt.fontName) range.Font.Name = fmt.fontName;
    // 颜色：format 对象内优先，顶层参数兼容旧调用
    if (fmt.fontColor !== undefined || params.fontColor !== undefined) {
      var fc = toExcelColor(fmt.fontColor !== undefined ? fmt.fontColor : params.fontColor);
      if (fc !== null) range.Font.Color = fc;
    }
    if (fmt.bgColor !== undefined || params.bgColor !== undefined) {
      var bg = toExcelColor(fmt.bgColor !== undefined ? fmt.bgColor : params.bgColor);
      if (bg !== null) range.Interior.Color = bg;
    }
    if (fmt.underline !== undefined) range.Font.Underline = !!fmt.underline;
    if (fmt.strikethrough !== undefined) range.Font.Strikethrough = !!fmt.strikethrough;
    // 水平/垂直对齐：format 对象内优先，顶层参数兼容旧调用
    var hAlign =
      fmt.horizontalAlignment !== undefined ? fmt.horizontalAlignment : params.horizontalAlignment;
    if (hAlign !== undefined) {
      var hv = resolveAlignment(hAlign, H_ALIGN_MAP);
      if (hv !== null) range.HorizontalAlignment = hv;
    }
    var vAlign =
      fmt.verticalAlignment !== undefined ? fmt.verticalAlignment : params.verticalAlignment;
    if (vAlign !== undefined) {
      var vv = resolveAlignment(vAlign, V_ALIGN_MAP);
      if (vv !== null) range.VerticalAlignment = vv;
    }
    var wrap = fmt.wrapText !== undefined ? fmt.wrapText : params.wrapText;
    if (wrap !== undefined) range.WrapText = !!wrap;
    if (params.mergeCells !== undefined) {
      if (params.mergeCells) range.Merge();
      else range.UnMerge();
    }
    return ok({});
  } catch (e) {
    return fail('设置单元格格式失败: ' + e.message);
  }
});

registerHandler('setNumberFormat', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // range/format 前置校验：Range(undefined)/NumberFormat=undefined 抛费解错误
    if (!params.range) return invalidParam('缺少 range');
    var format = params.format || params.numberFormat;
    if (format === undefined || format === null) return invalidParam('缺少 format');
    var range = sheet.Range(params.range);
    range.NumberFormat = format;
    return ok({});
  } catch (e) {
    return fail('设置数字格式失败: ' + e.message);
  }
});

registerHandler('setColumnWidth', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // column/width 显式校验：Columns(undefined) 抛费解错误、字符串宽直赋 COM 抛类型错误
    var colLetter = resolveColumnLetter(params.column);
    if (!colLetter) return fail('无效的列参数: ' + params.column);
    var width = parseFloat(params.width);
    if (isNaN(width) || width <= 0) return fail('无效的列宽: ' + params.width + '（必须为正数）');
    sheet.Columns(colLetter).ColumnWidth = width;
    return ok({});
  } catch (e) {
    return fail('设置列宽失败: ' + e.message);
  }
});

registerHandler('setRowHeight', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // row/height 显式校验（与 setColumnWidth 语义对齐）
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var height = parseFloat(params.height);
    if (isNaN(height) || height <= 0)
      return fail('无效的行高: ' + params.height + '（必须为正数）');
    sheet.Rows(row).RowHeight = height;
    return ok({});
  } catch (e) {
    return fail('设置行高失败: ' + e.message);
  }
});

registerHandler('autoFitColumn', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    // column 显式校验：Columns(undefined) 抛费解错误（与 setColumnWidth 第 3 轮修复对齐）
    var colLetter = resolveColumnLetter(params.column);
    if (!colLetter) return fail('无效的列参数: ' + params.column);
    sheet.Columns(colLetter).AutoFit();
    return ok({});
  } catch (e) {
    return fail('自动调整列宽失败: ' + e.message);
  }
});

registerHandler('autoFitRow', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    // row 显式校验：Rows(undefined) 抛费解错误（与 setRowHeight 第 3 轮修复对齐）
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    sheet.Rows(row).AutoFit();
    return ok({});
  } catch (e) {
    return fail('自动调整行高失败: ' + e.message);
  }
});

registerHandler('autoFitAll', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    sheet.Cells.EntireColumn.AutoFit();
    sheet.Cells.EntireRow.AutoFit();
    return ok({});
  } catch (e) {
    return fail('自动调整失败: ' + e.message);
  }
});

registerHandler('insertRows', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    // 行参数校验：row 必须为正整数，count 默认 1 且非负（与列侧 resolveColumnLetter 校验语义对齐）
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的插入行数: ' + params.count);
    sheet.Rows(row + ':' + (row + count - 1)).Insert();
    return ok({});
  } catch (e) {
    return fail('插入行失败: ' + e.message);
  }
});

registerHandler('deleteRows', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的删除行数: ' + params.count);
    sheet.Rows(row + ':' + (row + count - 1)).Delete();
    return ok({});
  } catch (e) {
    return fail('删除行失败: ' + e.message);
  }
});

registerHandler('insertColumns', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var col = params.column || 1;
    // count 校验：必须为正整数（与行侧 insertRows 语义对齐），避免 count=0/负数产生错误列范围（如 C:A）
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的插入列数: ' + params.count);
    var colLetter = resolveColumnLetter(col);
    var colNum = colToNumber(col);
    var endLetter = colToLetter(colNum + count - 1);
    if (!colLetter || !colNum || !endLetter) return fail('无效的列参数: ' + col);
    sheet.Columns(colLetter + ':' + endLetter).Insert();
    return ok({});
  } catch (e) {
    return fail('插入列失败: ' + e.message);
  }
});

registerHandler('deleteColumns', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var col = params.column || 1;
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的删除列数: ' + params.count);
    var colLetter = resolveColumnLetter(col);
    var colNum = colToNumber(col);
    var endLetter = colToLetter(colNum + count - 1);
    if (!colLetter || !colNum || !endLetter) return fail('无效的列参数: ' + col);
    sheet.Columns(colLetter + ':' + endLetter).Delete();
    return ok({});
  } catch (e) {
    return fail('删除列失败: ' + e.message);
  }
});

registerHandler('hideRows', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的行数: ' + params.count);
    sheet.Rows(row + ':' + (row + count - 1)).Hidden = true;
    return ok({});
  } catch (e) {
    return fail('隐藏行失败: ' + e.message);
  }
});

registerHandler('hideColumns', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var col = resolveColumnLetter(params.column);
    if (!col) return fail('无效的列参数: ' + params.column);
    sheet.Columns(col).Hidden = true;
    return ok({});
  } catch (e) {
    return fail('隐藏列失败: ' + e.message);
  }
});

registerHandler('showRows', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的行数: ' + params.count);
    sheet.Rows(row + ':' + (row + count - 1)).Hidden = false;
    return ok({});
  } catch (e) {
    return fail('显示行失败: ' + e.message);
  }
});

registerHandler('showColumns', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var col = resolveColumnLetter(params.column);
    if (!col) return fail('无效的列参数: ' + params.column);
    sheet.Columns(col).Hidden = false;
    return ok({});
  } catch (e) {
    return fail('显示列失败: ' + e.message);
  }
});

registerHandler('mergeCells', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).Merge();
    return ok({});
  } catch (e) {
    return fail('合并单元格失败: ' + e.message);
  }
});

registerHandler('unmergeCells', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).UnMerge();
    return ok({});
  } catch (e) {
    return fail('取消合并失败: ' + e.message);
  }
});

registerHandler('freezePanes', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // row/col 显式校验：0/'0'/字符串被 || 兜底为 2 是静默错误（与 resolveRowCol 语义对齐）
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var col = parseInt(params.col, 10);
    if (isNaN(col) || col < 1) return fail('无效的列参数: ' + params.col + '（必须为正整数）');
    var cell = sheet.Cells.Item(row, col);
    sheet.Activate();
    cell.Activate();
    Application.ActiveWindow.FreezePanes = true;
    return ok({});
  } catch (e) {
    return fail('冻结窗格失败: ' + e.message);
  }
});

registerHandler('unfreezePanes', function (params) {
  try {
    Application.ActiveWindow.FreezePanes = false;
    return ok({});
  } catch (e) {
    return fail('取消冻结失败: ' + e.message);
  }
});

registerHandler('protectSheet', function (params) {
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

registerHandler('unprotectSheet', function (params) {
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

registerHandler('protectWorkbook', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    wb.Protect(params.password || '');
    return ok({});
  } catch (e) {
    return fail('保护工作簿失败: ' + e.message);
  }
});

registerHandler('addCellComment', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    var cell = sheet.Cells.Item(rc.row, rc.col);
    cell.AddComment(params.text || '');
    return ok({});
  } catch (e) {
    return fail('添加批注失败: ' + e.message);
  }
});

registerHandler('getCellComments', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var comments = [];
    // 无批注保护：部分 WPS 版本 Comments 为 null 或访问 .Count 抛错，显式返回空列表
    if (!sheet.Comments || !sheet.Comments.Count) return ok({ comments: [] });
    for (var i = 1; i <= sheet.Comments.Count; i++) {
      var c = sheet.Comments.Item(i);
      comments.push({ cell: c.Parent.Address(), text: c.Text, author: c.Author || '' });
    }
    return ok({ comments: comments });
  } catch (e) {
    return fail('获取批注失败: ' + e.message);
  }
});

registerHandler('deleteCellComment', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    sheet.Cells.Item(rc.row, rc.col).ClearComments();
    return ok({});
  } catch (e) {
    return fail('删除批注失败: ' + e.message);
  }
});

registerHandler('addConditionalFormat', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    // 前置校验：条件格式公式必填，避免 undefined 传参抛费解错误
    if (!params.formula) return fail('缺少 formula（条件格式判断公式）');
    // FormatConditions.Add(Type=1 xlExpression, Operator=2 xlBetween, Formula1=1?, Formula2=formula)
    var fc = range.FormatConditions.Add(1, 2, 1, params.formula);
    // 颜色统一走 toExcelColor 转换（支持 #RRGGBB/RRGGBB/数字）
    if (params.color !== undefined) {
      var cc = toExcelColor(params.color);
      if (cc === null)
        return fail('无效的条件格式颜色: ' + params.color + '，支持 #RRGGBB/RRGGBB/数字');
      fc.Interior.Color = cc;
    }
    return ok({});
  } catch (e) {
    return fail('添加条件格式失败: ' + e.message);
  }
});

registerHandler('clearRange', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).Clear();
    return ok({});
  } catch (e) {
    return fail('清除区域失败: ' + e.message);
  }
});

registerHandler('clearFormats', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).ClearFormats();
    return ok({});
  } catch (e) {
    return fail('清除格式失败: ' + e.message);
  }
});

registerHandler('findInSheet', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.query && !params.text) return invalidParam('缺少 query');
    var found = sheet.Cells.Find(params.query || params.text);
    if (found) {
      return ok({ found: true, cell: found.Address(), value: found.Value2 });
    }
    return ok({ found: false });
  } catch (e) {
    return fail('查找失败: ' + e.message);
  }
});

registerHandler('replaceInSheet', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // findText 前置校验：避免 undefined 传给 Cells.Replace 抛费解错误
    if (!params.findText) return fail('缺少 findText');
    sheet.Cells.Replace(params.findText, params.replaceText);
    return ok({});
  } catch (e) {
    return fail('替换失败: ' + e.message);
  }
});

registerHandler('setHyperlink', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    var rc = resolveRowCol(params.row, params.col);
    if (!rc)
      return fail('无效的行/列参数: row=' + params.row + ' col=' + params.col + '（必须为正整数）');
    var cell = sheet.Cells.Item(rc.row, rc.col);
    // url 前置校验：Hyperlinks.Add(cell, undefined) 抛费解错误
    if (!params.url) return invalidParam('缺少 url');
    sheet.Hyperlinks.Add(cell, params.url);
    if (params.text) cell.Value2 = params.text;
    return ok({});
  } catch (e) {
    return fail('设置超链接失败: ' + e.message);
  }
});

registerHandler('setCellStyle', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    if (params.fontName) range.Font.Name = params.fontName;
    if (params.fontSize) range.Font.Size = params.fontSize;
    if (params.bold !== undefined) range.Font.Bold = params.bold;
    // 颜色统一走 toExcelColor 转换（支持 #RRGGBB/RRGGBB/数字），避免字符串色值抛类型错误
    if (params.fontColor !== undefined) {
      var fc = toExcelColor(params.fontColor);
      if (fc !== null) range.Font.Color = fc;
    }
    if (params.backgroundColor !== undefined) {
      var bg = toExcelColor(params.backgroundColor);
      if (bg !== null) range.Interior.Color = bg;
    }
    // 对齐值统一走 resolveAlignment 转换（支持 "left"/"center"/"right" 字符串与数字常量）
    if (params.horizontalAlignment !== undefined) {
      var hv = resolveAlignment(params.horizontalAlignment, H_ALIGN_MAP);
      if (hv !== null) range.HorizontalAlignment = hv;
    }
    return ok({});
  } catch (e) {
    return fail('设置单元格样式失败: ' + e.message);
  }
});

registerHandler('calculateSheet', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    sheet.Calculate();
    return ok({});
  } catch (e) {
    return fail('计算失败: ' + e.message);
  }
});

registerHandler('wrapText', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).WrapText = true;
    return ok({});
  } catch (e) {
    return fail('自动换行失败: ' + e.message);
  }
});

registerHandler('lockCells', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).Locked = true;
    return ok({});
  } catch (e) {
    return fail('锁定单元格失败: ' + e.message);
  }
});

registerHandler('fillSeries', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    // 行/列数显式校验：0/负数/字符串静默兜底问题（与 insertRows 语义对齐），
    // 避免 rowCount:'-1' 产生 Resize 负数尺寸抛费解错误
    var rowCount = params.rowCount !== undefined ? parseInt(params.rowCount, 10) : range.Rows.Count;
    if (isNaN(rowCount) || rowCount < 1)
      return fail('无效的填充行数: ' + params.rowCount + '（必须为正整数）');
    var colCount =
      params.colCount !== undefined ? parseInt(params.colCount, 10) : range.Columns.Count;
    if (isNaN(colCount) || colCount < 1)
      return fail('无效的填充列数: ' + params.colCount + '（必须为正整数）');
    range.AutoFill(range.Resize(rowCount, colCount));
    return ok({});
  } catch (e) {
    return fail('填充序列失败: ' + e.message);
  }
});

registerHandler('copyRange', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    // 前置校验：Range(undefined) 抛费解错误；sourceRange/targetRange 两参数语义一致化
    var srcRange = params.sourceRange || params.range;
    var dstRange = params.targetRange;
    if (!srcRange) return invalidParam('缺少 sourceRange');
    if (!dstRange) return invalidParam('缺少 targetRange');
    var srcSheet = getExcelSheet(wb, params.sourceSheet || params.sheet);
    var dstSheet = getExcelSheet(wb, params.targetSheet || params.sheet);
    srcSheet.Range(srcRange).Copy(dstSheet.Range(dstRange));
    return ok({});
  } catch (e) {
    return fail('复制区域失败: ' + e.message);
  }
});

registerHandler('pasteRange', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.targetRange) return invalidParam('缺少 targetRange');
    sheet.Paste(sheet.Range(params.targetRange));
    return ok({});
  } catch (e) {
    return fail('粘贴失败: ' + e.message);
  }
});

registerHandler('transpose', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    if (!params.targetRange) return invalidParam('缺少 targetRange');
    var src = sheet.Range(params.range);
    src.Copy();
    var dst = sheet.Range(params.targetRange);
    // xlPasteAll=-4104 是「粘贴全部」不是转置；转置需 PasteSpecial 第 4 参 Transpose=true（xlTranspose），
    // 否则输出的是普通复制并覆盖目标区域，转置功能语义错误
    dst.PasteSpecial(-4104, false, false, true);
    Application.CutCopyMode = false;
    return ok({});
  } catch (e) {
    return fail('转置失败: ' + e.message);
  }
});

registerHandler('textToColumns', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    // TextToColumns(Destination, DataType, TextQualifier, ConsecutiveDelimiter, Tab, Semicolon, Comma, Space, Other, OtherChar)
    // DataType=xlDelimited=1，TextQualifier=xlTextQualifierDoubleQuote=1，ConsecutiveDelimiter=false，Tab=true
    range.TextToColumns(range, 1, 1, false, true);
    return ok({});
  } catch (e) {
    return fail('分列失败: ' + e.message);
  }
});

registerHandler('subtotal', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    range.Subtotal(1, -4157, range.Columns.Count, false, true, false);
    return ok({});
  } catch (e) {
    return fail('分类汇总失败: ' + e.message);
  }
});

registerHandler('consolidate', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    var sources = params.sources || [];
    if (!Array.isArray(sources) || sources.length === 0)
      return fail('缺少 sources（待合并的区域列表）');
    // function 显式校验（xlSum=4 默认），0/字符串非法显式 fail（避免 || 4 真值判断静默兜底）
    var func = params.function !== undefined ? parseInt(params.function, 10) : 4;
    if (isNaN(func) || func < 0) return fail('无效的合并函数: ' + params.function);
    range.Consolidate(sources, func);
    return ok({});
  } catch (e) {
    return fail('合并计算失败: ' + e.message);
  }
});

registerHandler('createPivotTable', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // sourceRange 前置校验：Range(undefined) 抛费解错误（与 copyRange 语义对齐）
    if (!params.sourceRange) return invalidParam('缺少 sourceRange');
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

registerHandler('updatePivotTable', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // name 显式校验：PivotTables(undefined) 抛费解错误（与周边 handler 校验语义对齐）
    if (!params.name) return invalidParam('缺少 name');
    var pt = sheet.PivotTables(params.name);
    pt.RefreshTable();
    return ok({});
  } catch (e) {
    return fail('更新透视表失败: ' + e.message);
  }
});

registerHandler('createNamedRange', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    // 前置校验：name/range 必填（原实现 undefined 传给 Names.Add 抛费解错误）
    if (!params.name) return invalidParam('缺少 name');
    if (!params.range) return invalidParam('缺少 range');
    wb.Names.Add(params.name, wb.ActiveSheet.Range(params.range));
    return ok({});
  } catch (e) {
    return fail('创建命名区域失败: ' + e.message);
  }
});

registerHandler('getNamedRanges', function (params) {
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

registerHandler('deleteNamedRange', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    // 前置校验：缺 name 时 Names.Item(undefined) 抛费解错误
    if (!params.name) return invalidParam('缺少 name');
    wb.Names.Item(params.name).Delete();
    return ok({});
  } catch (e) {
    return fail('删除命名区域失败: ' + e.message);
  }
});

registerHandler('groupRows', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var row = parseInt(params.row, 10);
    if (isNaN(row) || row < 1) return fail('无效的行参数: ' + params.row + '（必须为正整数）');
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的行数: ' + params.count);
    var range = sheet.Range(row + ':' + (row + count - 1));
    range.Group();
    return ok({});
  } catch (e) {
    return fail('组合行失败: ' + e.message);
  }
});

registerHandler('groupColumns', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var col = resolveColumnLetter(params.column);
    // count 校验：必须为正整数（与行侧 groupRows 语义对齐）
    var count = parseInt(params.count, 10) || 1;
    if (count < 1) return fail('无效的列数: ' + params.count);
    var colNum = colToNumber(params.column);
    var endLetter = colToLetter(colNum + count - 1);
    if (!col || !colNum || !endLetter) return fail('无效的列参数: ' + params.column);
    var range = sheet.Range(col + ':' + endLetter);
    range.Group();
    return ok({});
  } catch (e) {
    return fail('组合列失败: ' + e.message);
  }
});

registerHandler('addDataValidation', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    var dv = range.Validation;
    // formula1 前置校验：空串传给 Validation.Add 抛费解错误（数据验证必须指定列表/公式）
    if (!params.formula1) return invalidParam('缺少 formula1');
    dv.Delete();
    dv.Add(3, 1, 1, params.formula1, params.formula2 || '');
    return ok({});
  } catch (e) {
    return fail('添加数据验证失败: ' + e.message);
  }
});

registerHandler('setArrayFormula', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    sheet.Range(params.range).FormulaArray = params.formula;
    return ok({});
  } catch (e) {
    return fail('设置数组公式失败: ' + e.message);
  }
});

registerHandler('setPrintArea', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // range 前置校验：PrintArea = undefined 直赋抛类型错误（与 setNumberFormat 语义对齐）
    if (!params.range) return invalidParam('缺少 range');
    sheet.PageSetup.PrintArea = params.range;
    return ok({});
  } catch (e) {
    return fail('设置打印区域失败: ' + e.message);
  }
});

registerHandler('insertExcelImage', function (params) {
  try {
    var sheet = Application.ActiveSheet;
    var filePath = params.path || params.imagePath;
    if (!filePath) return invalidParam('缺少 path');
    // 尺寸显式数值化：undefined/null 才取 -1（原始尺寸），0 是合法值不能被 || 吞掉，字符串直赋抛类型错误
    function imgSize(v) {
      if (v === undefined || v === null) return -1;
      var n = parseFloat(v);
      return isNaN(n) ? null : n;
    }
    var w = imgSize(params.width);
    var h = imgSize(params.height);
    if (w === null || h === null) return fail('无效的图片尺寸（width/height 必须为数值）');
    var left = params.left !== undefined ? parseFloat(params.left) : 0;
    if (isNaN(left)) return fail('无效的 left: ' + params.left);
    var top = params.top !== undefined ? parseFloat(params.top) : 0;
    if (isNaN(top)) return fail('无效的 top: ' + params.top);
    var pic = sheet.Shapes.AddPicture(filePath, false, true, left, top, w, h);
    return ok({ name: pic.Name });
  } catch (e) {
    return fail('插入图片失败: ' + e.message);
  }
});

registerHandler('exportChartAsImage', function (params) {
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
    // format 白名单校验（与 exportSlideAsImage 第 7 轮修复对齐）：任意字符串传 Export 抛类型错误
    var allowed = { PNG: 'PNG', JPG: 'JPG', JPEG: 'JPG', GIF: 'GIF', BMP: 'BMP' };
    filterName = allowed[filterName] || null;
    if (!filterName)
      return fail('无效的导出格式: ' + params.format + '（支持 PNG/JPG/JPEG/GIF/BMP）');
    var chartObj = sheet.ChartObjects(chartName);
    chartObj.Chart.Export(outputPath, filterName);
    return ok({ chartName: chartName, outputPath: outputPath, format: filterName });
  } catch (e) {
    return fail('导出图表为图片失败: ' + e.message);
  }
});

registerHandler('exportRangeAsImage', function (params) {
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
    if (tempChart) {
      try {
        tempChart.Delete();
      } catch (ce) {}
    }
    return fail('导出区域为图片失败: ' + e.message);
  }
});

registerHandler('cleanData', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
    var range = sheet.Range(params.range);
    // 清洗模式：trim=去首尾空白（默认，安全）；collapse=连续多空格折叠为单个；all=删除所有空白（激进，谨慎）
    var mode = params.mode || 'trim';
    var replaced = 0;
    // 三模式统一用单元格级正则处理，不依赖 Range.Replace 的平台差异行为
    // 注意两点：
    // 1. 判断用**非全局正则**（.test 无 lastIndex）——带 g 的全局正则 .test() 会因 lastIndex 状态
    //    导致相邻单元格交替漏判（经典 bug）
    // 2. 替换用**每次新建的全局正则**——非全局正则 .replace 只替换第一处匹配，会漏掉同一单元格的后续匹配
    var pattern = null;
    var replacePattern = null;
    if (mode === 'all') {
      pattern = /[\s\u00a0]+/;
      replacePattern = /[\s\u00a0]+/g;
    } else if (mode === 'collapse') {
      pattern = /[\t\n ]{2,}/;
      replacePattern = /[\t\n ]{2,}/g;
    } else {
      // trim：仅去首尾空白
      for (var i = 1; i <= range.Rows.Count; i++) {
        for (var j = 1; j <= range.Columns.Count; j++) {
          var cell = range.Cells.Item(i, j);
          var v = cell.Value2;
          if (typeof v === 'string') {
            var trimmed = v.replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, '');
            if (trimmed !== v) {
              cell.Value2 = trimmed;
              replaced++;
            }
          }
        }
      }
      return ok({ mode: mode, replaced: replaced });
    }
    for (var i = 1; i <= range.Rows.Count; i++) {
      for (var j = 1; j <= range.Columns.Count; j++) {
        var cell = range.Cells.Item(i, j);
        var v = cell.Value2;
        if (typeof v === 'string' && pattern.test(v)) {
          cell.Value2 = v.replace(replacePattern, mode === 'all' ? '' : ' ');
          replaced++;
        }
      }
    }
    return ok({ mode: mode, replaced: replaced });
  } catch (e) {
    return fail('清洗数据失败: ' + e.message);
  }
});

registerHandler('copyFormat', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    // 前置校验：与 copyRange 第 5 轮修复语义对齐
    if (!params.sourceRange) return invalidParam('缺少 sourceRange');
    if (!params.targetRange) return invalidParam('缺少 targetRange');
    sheet.Range(params.sourceRange).Copy();
    sheet.Range(params.targetRange).PasteSpecial(-4122);
    Application.CutCopyMode = false;
    return ok({});
  } catch (e) {
    return fail('复制格式失败: ' + e.message);
  }
});

registerHandler('autoSum', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = getExcelSheet(wb, params.sheet);
    if (!params.range) return invalidParam('缺少 range');
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

registerHandler('evaluateFormula', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    // formula 前置校验：空/非字符串时显式 fail（原实现会把 undefined 直接赋给 target.Formula 抛费解错误）
    if (typeof params.formula !== 'string' || !params.formula) return invalidParam('缺少 formula');
    var formula = params.formula;
    var cell = params.cell || 'A1';
    var sheet = wb.ActiveSheet;
    if (typeof Application.Evaluate === 'function') {
      var result = Application.Evaluate(formula);
      return ok({ result: result });
    }
    var target = sheet.Range(cell);
    // origFormula 读取也包 try：读取失败（如目标单元格异常）时以 null 标记，避免把 undefined 写回覆盖原公式
    var origFormula = null;
    try {
      origFormula = target.Formula;
    } catch (e) {}
    target.Formula = formula;
    var value;
    try {
      value = target.Value;
    } finally {
      // 恢复原公式：Evaluate 不可用时的降级路径若赋值/取值抛错，原公式必须恢复（此前异常会跳过恢复，用户表格公式被永久替换）
      if (origFormula !== null) {
        try {
          target.Formula = origFormula;
        } catch (re) {
          console.error('恢复原公式失败: ' + re.message);
        }
      }
    }
    return ok({ result: value });
  } catch (e) {
    return fail('公式计算失败: ' + e.message);
  }
});

registerHandler('setZoom', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var percent = parseInt(params.percent, 10);
    if (isNaN(percent) || percent < 10 || percent > 400)
      return fail('缩放比例必须在10-400之间，当前值: ' + params.percent);
    Application.ActiveWindow.Zoom = percent;
    return ok({});
  } catch (e) {
    return fail('设置缩放失败: ' + e.message);
  }
});

registerHandler('diagnoseFormula', function (params) {
  try {
    var wb = Application.ActiveWorkbook;
    if (!wb) return fail('没有打开的工作簿');
    var sheet = Application.ActiveSheet;
    // cell 前置校验：Range(undefined) 抛费解错误
    if (!params.cell) return invalidParam('缺少 cell');
    var cell = sheet.Range(params.cell);
    var value = cell.Value;
    var formula = cell.Formula;
    var errorType = null,
      diagnosis = '',
      suggestion = '';
    var precedents = [];
    if (typeof value === 'string' && value.charAt(0) === '#') {
      errorType = value;
      if (value === '#REF!') {
        diagnosis = '引用了不存在的单元格或区域';
        suggestion = '检查引用区域是否被删除或移动';
      } else if (value === '#N/A') {
        diagnosis = '查找函数未找到匹配值';
        suggestion = '确认查找值存在，或检查匹配条件';
      } else if (value === '#VALUE!') {
        diagnosis = '参数类型不正确或运算类型不匹配';
        suggestion = '检查函数参数类型和引用单元格';
      } else if (value === '#NAME?') {
        diagnosis = '函数名或名称拼写错误';
        suggestion = '检查函数名是否正确';
      } else if (value === '#DIV/0!') {
        diagnosis = '除数为零';
        suggestion = '检查除数单元格，避免除以零';
      } else if (value === '#NUM!') {
        diagnosis = '数值无效或超出范围';
        suggestion = '检查函数参数范围';
      } else if (value === '#NULL!') {
        diagnosis = '交集为空';
        suggestion = '检查引用区域的交集是否存在';
      } else {
        diagnosis = '未知错误';
        suggestion = '检查公式与引用';
      }
    }
    try {
      var refs = cell.DirectPrecedents;
      if (refs) {
        for (var i = 1; i <= refs.Areas.Count; i++) {
          precedents.push(refs.Areas.Item(i).Address());
        }
      }
    } catch (e) {}
    return ok({
      cell: params.cell,
      formula: formula,
      currentValue: value,
      errorType: errorType,
      diagnosis: diagnosis,
      suggestion: suggestion,
      precedents: precedents,
    });
  } catch (e) {
    return fail('诊断公式失败: ' + e.message);
  }
});
