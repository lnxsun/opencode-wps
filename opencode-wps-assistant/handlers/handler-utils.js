/**
 * WPS 桥接共享工具函数（单一来源）
 *
 * 由 `scripts/sync-wps-bridge.js` 同步到各平台目录的 `handlers/handler-utils.js`，
 * 供 excel/ppt/word 等 handler 使用，避免同一纯工具函数在 mac/linux 各维护一份。
 *
 * ⚠️ 本文件是单一来源，请勿手工修改平台目录下的 handler-utils.js（生成产物）——
 * 改动请修改本文件后重新运行：node scripts/sync-wps-bridge.js
 *
 * 平台差异说明：本文件仅收录两平台**逐字节相同**的纯函数（无平台差异、无行为耦合），
 * 确保抽取后 mac/linux 行为完全等价。
 */

// 按名称或默认取工作簿下的工作表：缺省用 ActiveSheet
function getExcelSheet(wb, sheet) {
  if (!sheet) return wb.ActiveSheet;
  return wb.Sheets.Item(sheet);
}

// 将列号（1-based）转换为 Excel 列字母：1->A, 26->Z, 27->AA, 52->AZ, 703->AAA ...
function colToLetter(n) {
  n = parseInt(n, 10);
  if (isNaN(n) || n < 1) return null;
  var letters = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// 将列参数（数字列号或字母串）统一解析为列字母：1->A, 27->AA, 'AB'->AB；非法返回 null
function resolveColumnLetter(col) {
  if (typeof col === 'number') return colToLetter(col);
  if (typeof col === 'string') {
    var t = col.trim().toUpperCase();
    if (/^[A-Z]{1,3}$/.test(t)) return t;
  }
  return null;
}

// 将列字母转回列号：A->1, Z->26, AA->27, AB->28；数字列号原样返回；非法返回 null
// （与 colToLetter 对称，供 insertColumns/deleteColumns/groupColumns 计算结束列用）
function colToNumber(col) {
  if (typeof col === 'number') return col >= 1 ? col : null;
  if (typeof col === 'string') {
    var t = col.trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(t)) return null;
    var n = 0;
    for (var i = 0; i < t.length; i++) {
      n = n * 26 + (t.charCodeAt(i) - 64);
    }
    return n;
  }
  return null;
}

// 单元格行/列参数校验：必须为正整数（1-based），非法返回 null
// 供 getCellValue/setCellValue/setFormula/getFormula/addCellComment/deleteCellComment/setHyperlink 等
// 单元格级 handler 统一使用（与 insertRows/insertColumns 的行列校验语义对齐）
function resolveRowCol(row, col) {
  var r = parseInt(row, 10);
  if (isNaN(r) || r < 1) return null;
  var c = parseInt(col, 10);
  if (isNaN(c) || c < 1) return null;
  return { row: r, col: c };
}

// 将对齐参数解析为 Excel 常量：数字直接使用，字符串走映射，非法值返回 null
function resolveAlignment(value, map) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && map[value.toLowerCase()] !== undefined) {
    return map[value.toLowerCase()];
  }
  return null;
}

// 将颜色参数解析为 Excel BGR 整数值：支持 #RRGGBB、RRGGBB、RGB 简写；数字直接返回
function toExcelColor(color) {
  if (typeof color === 'number') return color;
  if (typeof color !== 'string') return null;
  var hex = color.trim();
  if (hex.charAt(0) === '#') hex = hex.substring(1);
  if (hex.length === 3) {
    hex =
      hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  var rgb = parseInt(hex, 16);
  return ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
}

// 在备注页中定位备注占位符形状：优先 ppPlaceholderBody(2)/ppPlaceholderObject(7)，其次找第一个有文本的文本框
function findNotesShape(notesPage) {
  try {
    for (var j = 1; j <= notesPage.Shapes.Count; j++) {
      var s = notesPage.Shapes.Item(j);
      try {
        var pf = s.PlaceholderFormat;
        if (pf && (pf.Type === 2 || pf.Type === 7)) return s;
      } catch (e) {}
    }
    // 兜底：第一个 HasTextFrame 且 HasText 的形状
    for (var j = 1; j <= notesPage.Shapes.Count; j++) {
      var s = notesPage.Shapes.Item(j);
      try {
        if (s.HasTextFrame && s.TextFrame.HasText) return s;
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

// 按名称或索引定位形状：数字用 Item(index)，缺省取第一个，字符串按 Name 匹配；找不到返回 null
function findShape(slide, nameOrIndex) {
  if (typeof nameOrIndex === 'number') {
    try {
      return slide.Shapes.Item(nameOrIndex);
    } catch (e) {
      return null;
    }
  }
  if (nameOrIndex == null) return slide.Shapes.Count > 0 ? slide.Shapes.Item(1) : null;
  for (var j = 1; j <= slide.Shapes.Count; j++) {
    if (slide.Shapes.Item(j).Name === nameOrIndex) return slide.Shapes.Item(j);
  }
  return null;
}

function getPPT() {
  return Application.ActivePresentation;
}

// 校验并归一化 slideIndex（必须为正整数且不越界）；非法返回 null
// 大量 handler 直接 pres.Slides.Item(idx) 对越界抛错返回泛化 fail，统一前置校验给出明确错误
function resolveSlideIndex(pres, idx) {
  var n = parseInt(idx, 10);
  if (isNaN(n) || n < 1) return null;
  if (n > pres.Slides.Count) return null;
  return n;
}

// 将颜色参数解析为整型 RGB：支持 #RRGGBB、RRGGBB、RGB 简写；数字直接返回；非法返回 null
// （与 excel-handler 的 toExcelColor 语义对称，供 PPT COM 的 ForeColor.RGB 赋值使用）
function toRgb(color) {
  if (typeof color === 'number') return color;
  if (typeof color !== 'string') return null;
  var hex = color.trim();
  if (hex.charAt(0) === '#') hex = hex.substring(1);
  if (hex.length === 3) {
    hex =
      hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

// 获取选中区域 Range；无选中时返回 null（供依赖 Selection 的 handler 做明确错误提示）
function getSelectionRange() {
  try {
    if (!Application.Selection) return null;
    return Application.Selection.Range;
  } catch (e) {
    return null;
  }
}

// 将 RGB 整数值转为 BGR（COM 颜色字节序），供 Word 颜色赋值使用
function toBgr(rgb) {
  return ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
}
