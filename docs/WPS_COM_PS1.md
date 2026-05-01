# wps-com.ps1 实现原理解析

`wps-com.ps1` 是本项目的核心 COM 桥接脚本，通过 PowerShell 调用 WPS COM 接口，实现 AI 对 WPS 文档的操作。

---

## 整体架构

```
MCP Server (TypeScript)
        ↓ JSON-RPC (Action + Params)
PowerShell (wps-com.ps1)
        ↓ COM
WPS Application (Word/ET/WPP)
        ↓
返回 JSON 结果
```

---

## 调用方式

```powershell
powershell -ExecutionPolicy Bypass -File wps-com.ps1 -Action <action> -Params <json>
```

**参数说明：**
- `-Action`: 操作名称（如 `getCellValue`、`setCellValue`）
- `-Params`: JSON 格式参数（如 `'{"sheet":"Sheet1","row":1,"col":1}'`）

---

## 核心代码结构

### 1. 参数解析

```powershell
param(
    [string]$Action,
    [string]$Params = "{}"
)

try { $p = $Params | ConvertFrom-Json } catch { $p = @{} }
```

将 JSON 参数转换为 PowerShell 对象。

### 2. COM 对象获取

```powershell
function Get-WpsExcel {
    try { return [System.Runtime.InteropServices.Marshal]::GetActiveObject('Ket.Application') }
    catch { return $null }
}

function Get-WpsWord {
    try { return [System.Runtime.InteropServices.Marshal]::GetActiveObject('Kwps.Application') }
    catch { return $null }
}

function Get-WpsPpt {
    try { return [System.Runtime.InteropServices.Marshal]::GetActiveObject('Kwpp.Application') }
    catch { return $null }
}
```

**COM 对象 ProgID：**
| 应用 | ProgID | 说明 |
|------|--------|------|
| WPS 文字 | `Kwps.Application` | 对应 WPS.exe |
| WPS 表格 | `Ket.Application` | 对应 ET.exe |
| WPS 演示 | `Kwpp.Application` | 对应 WPP.exe |

> 使用 `GetActiveObject` 获取已运行的 WPS 实例，而非创建新实例。

### 3. Action 分发

```powershell
switch ($Action) {
    "ping" { ... }
    "getCellValue" { ... }
    "setCellValue" { ... }
    # ... 200+ 个操作
}
```

每个 Action 对应一个操作，通过 switch 分发。

### 4. JSON 输出

```powershell
function Output-Json($obj) {
    $obj | ConvertTo-Json -Depth 10 -Compress
}
```

返回统一格式的 JSON 结果：
```json
{ "success": true, "data": {...} }
{ "success": false, "error": "错误信息" }
```

---

## 辅助函数

### 列号转换

```powershell
# A-Z → 1-26
Convert-ColumnLetterToNumber("A")  # → 1

# 1-26 → A-Z
Convert-ColumnNumberToLetter(1)   # → A
```

### 颜色转换

```powershell
# #FF0000 → 255 (RGB 整数)
Convert-HexColorToRgbInt("#FF0000")
```

WPS COM 使用 RGB 整数颜色（0xFF0000 = 红色）。

### 文件类型检测

```powershell
Get-AppTypeByExtension "test.xlsx"  # → "excel"
Get-AppTypeByExtension "test.docx"  # → "word"
Get-AppTypeByExtension "test.pptx"   # → "ppt"
```

### 格式映射

```powershell
# Excel 格式码
Get-ExcelFileFormat "xlsx"  # → 51

# Word 格式码
Get-WordSaveFormat "pdf"    # → 17

# PPT 格式码
Get-PptSaveFormat "png"    # → 18
```

---

## 主要操作分类

### Common（通用操作）

| Action | 说明 |
|--------|------|
| `ping` | 连接测试 |
| `wireCheck` | 桥接检查 |
| `getAppInfo` | 获取当前应用信息 |
| `getSelectedText` | 获取选中文本 |
| `setSelectedText` | 设置选中文本 |
| `save` | 保存当前文档 |
| `saveAs` | 另存为 |
| `openFile` | 打开文件 |
| `convertToPDF` | 转换为 PDF |
| `convertFormat` | 转换为其他格式 |

### Excel 操作

| 分类 | 操作数 | 示例 |
|------|--------|------|
| 单元格操作 | ~15 | getCellValue, setCellValue, setFormula |
| 区域操作 | ~10 | getRangeData, setRangeData, sortRange |
| 数据清洗 | ~5 | cleanData, removeDuplicates |
| 图表操作 | ~5 | createChart, updateChart |
| 透视表 | ~5 | createPivotTable, updatePivotTable |
| 条件格式 | ~5 | addConditionalFormat |
| 数据验证 | ~5 | addDataValidation |
| 工作表 | ~10 | createSheet, deleteSheet, renameSheet |

### Word 操作

- getActiveDocument, insertText, applyStyle, generateToc, findReplace, insertTable 等

### PPT 操作

- addSlide, beautify, unifyFont, setAnimation 等

---

## 实现示例

### 读取单元格

```powershell
# Action: getCellValue
# Params: { "sheet": "Sheet1", "row": 1, "col": 1 }

$excel = Get-WpsExcel
$sheet = $excel.ActiveWorkbook.Sheets.Item("Sheet1")
$cell = $sheet.Cells.Item(1, 1)

Output-Json @{
    success = $true
    data = @{
        value = $cell.Value2
        text = $cell.Text
        formula = $cell.Formula
    }
}
```

### 写入单元格

```powershell
# Action: setCellValue
# Params: { "sheet": "Sheet1", "row": 1, "col": 1, "value": "Hello" }

$excel = Get-WpsExcel
$sheet = $excel.ActiveWorkbook.Sheets.Item("Sheet1")
$sheet.Cells.Item(1, 1).Value2 = "Hello"

Output-Json @{ success = $true }
```

### 创建图表

```powershell
# Action: createChart
# Params: { "dataRange": "A1:B10", "chartTypeName": "column_clustered", "title": "销售图表" }

$sheet = $excel.ActiveSheet
$range = $sheet.Range("A1:B10")
$chartObj = $sheet.ChartObjects().Add($left, $top, $width, $height)
$chartObj.Chart.ChartType = 51  # column_clustered
$chartObj.Chart.SetSourceData($range)
```

---

## 错误处理模式

```powershell
$excel = Get-WpsExcel
if ($null -eq $excel) { 
    Output-Json @{ success = $false; error = "WPS Excel not running" }
    exit
}
```

1. 获取 COM 对象
2. 检查对象是否为 null
3. 检查活动文档/工作簿是否存在
4. 执行操作并捕获异常

---

## 性能优化

### 批量操作

```powershell
# 避免频繁调用 COM
$range = $sheet.Range("A1:A100")
for ($r = 1; $r -le 100; $r++) {
    $range.Cells.Item($r, 1).Value2 = $r  # 比单个设置快
}
```

### 禁用警告弹窗

```powershell
$excel.DisplayAlerts = $false
# 执行操作
$excel.DisplayAlerts = $true
```

---

## 安全考虑

### 路径验证

```powershell
if ($path -match '\.\.') {
    Output-Json @{ success = $false; error = "路径遍历不被允许" }
    exit
}
```

### 执行策略

```powershell
powershell -ExecutionPolicy Bypass -File wps-com.ps1
```

使用 Bypass 绕过本地脚本策略限制。

---

## MCP 集成

MCP Server 通过以下方式调用此脚本：

```typescript
// wps-client.ts
async function callWpsMethod(action: string, params: object): Promise<any> {
    const result = await new Promise((resolve, reject) => {
        const ps = spawn('powershell.exe', [
            '-ExecutionPolicy', 'Bypass',
            '-File', 'scripts/wps-com.ps1',
            '-Action', action,
            '-Params', JSON.stringify(params)
        ]);
        
        let output = '';
        ps.stdout.on('data', (data) => { output += data; });
        ps.on('close', () => { resolve(JSON.parse(output)); });
        ps.on('error', reject);
    });
    return result;
}
```

---

## 代码统计

- **总行数**: ~4600 行
- **操作数**: 200+ 个
- **Excel 操作**: ~90 个
- **Word 操作**: ~29 个
- **PPT 操作**: ~85 个

---

## 相关文件

| 文件 | 作用 |
|------|------|
| `scripts/wps-com.ps1` | COM 桥接脚本（本文件） |
| `src/client/wps-client.ts` | MCP 客户端调用 |
| `src/tools/*.ts` | MCP 工具定义 |
| `docs/WPS_COM_API.md` | WPS COM API 参考 |
| `docs/POWERSHELL_COM.md` | PowerShell COM 技术 |