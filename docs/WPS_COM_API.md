# WPS Office COM API 文档

WPS Office 提供 COM 接口，允许外部程序通过自动化（Automation）操作文档。API 风格与 VBA 一致，兼容 VBA 的接口和参数。

> 本项目通过 PowerShell 调用 WPS COM 接口，实现 AI 对 WPS 文档的操作。

---

## 文档类型

WPS COM API 按文档类型分为：

| 类型 | 后缀 | 说明 |
|------|------|------|
| **文字 (Word)** | `.doc`, `.docx`, `.wps` | WPS 文字文档 |
| **表格 (Excel)** | `.xls`, `.xlsx` | WPS 表格文档 |
| **演示 (PPT)** | `.ppt`, `.pptx` | WPS 演示文档 |
| **PDF** | `.pdf` | PDF 文档 |
| **智能文档** | `.otl` | 智能文档 |

---

## 获取 Application 对象

### 通过 COM 自动化

```powershell
# 创建 WPS 文字 Application 对象
$word = New-Object -ComObject "WPS.Application"
$doc = $word.Documents.Open("C:\test.docx")

# 操作完成后关闭
$doc.Close($false)
$word.Quit()
```

```powershell
# 创建 WPS 表格 Application 对象
$excel = New-Object -ComObject "ET.Application"
$workbook = $excel.Workbooks.Open("C:\test.xlsx")

# 操作完成后关闭
$workbook.Close($false)
$excel.Quit()
```

```powershell
# 创建 WPS 演示 Application 对象
$ppt = New-Object -ComObject "WPP.Application"
$presentation = $ppt.Presentations.Open("C:\test.pptx")

# 操作完成后关闭
$presentation.Close()
$ppt.Quit()
```

---

## 常用 Application 对象

### WPS 文字 (Word)

| 对象 | 说明 |
|------|------|
| `Application.ActiveDocument` | 当前活动文档 |
| `Application.ActiveWindow` | 当前活动窗口 |
| `Application.Selection` | 当前选区 |
| `Document.Content` | 文档主体内容 |
| `Document.Tables` | 文档中的表格集合 |
| `Document.Paragraphs` | 文档中的段落集合 |
| `Window.Zoom` | 窗口缩放比例 |

### WPS 表格 (Excel)

| 对象 | 说明 |
|------|------|
| `Application.ActiveWorkbook` | 当前活动工作簿 |
| `Application.ActiveSheet` | 当前活动工作表 |
| `Application.ActiveCell` | 当前活动单元格 |
| `Workbook.Sheets` | 工作簿中的工作表集合 |
| `Sheet.Range("A1")` | 指定单元格区域 |
| `Sheet.Cells` | 所有单元格 |

### WPS 演示 (PPT)

| 对象 | 说明 |
|------|------|
| `Application.ActivePresentation` | 当前演示文稿 |
| `Application.ActiveWindow` | 当前活动窗口 |
| `Presentation.Slides` | 幻灯片集合 |
| `Slide.Shapes` | 幻灯片中的形状集合 |
| `Slide.Background` | 幻灯片背景 |

---

## 常用操作示例

### 文字 - 读取文档内容

```powershell
$word = New-Object -ComObject "WPS.Application"
$doc = $word.Documents.Open("C:\test.docx")
$content = $doc.Content.Text
$doc.Close()
$word.Quit()
Write-Host $content
```

### 文字 - 插入文本

```powershell
$word = New-Object -ComObject "WPS.Application"
$doc = $word.Documents.Open("C:\test.docx")
$doc.Content.Text += "这是新插入的内容"
$doc.Save()
$doc.Close()
$word.Quit()
```

### 表格 - 读取单元格

```powershell
$excel = New-Object -ComObject "ET.Application"
$workbook = $excel.Workbooks.Open("C:\test.xlsx")
$sheet = $workbook.Sheets.Item(1)
$value = $sheet.Range("A1").Text
$workbook.Close($false)
$excel.Quit()
Write-Host $value
```

### 表格 - 写入单元格

```powershell
$excel = New-Object -ComObject "ET.Application"
$workbook = $excel.Workbooks.Open("C:\test.xlsx")
$sheet = $workbook.Sheets.Item(1)
$sheet.Range("A1").Value = "Hello World"
$workbook.Save()
$workbook.Close($false)
$excel.Quit()
```

### 演示 - 添加幻灯片

```powershell
$ppt = New-Object -ComObject "WPP.Application"
$presentation = $ppt.Presentations.Open("C:\test.pptx")
$slide = $presentation.Slides.Add(1, 1)  # 1=ppLayoutTitle
$slide.Shapes.Title.TextFrame.TextRange.Text = "新标题"
$presentation.Save()
$presentation.Close()
$ppt.Quit()
```

---

## 枚举值

### WPS 文字

| 枚举 | 值 | 说明 |
|------|-----|------|
| `wdAlignParagraphLeft` | 0 | 左对齐 |
| `wdAlignParagraphCenter` | 1 | 居中对齐 |
| `wdAlignParagraphRight` | 2 | 右对齐 |
| `wdLineSingle` | 1 | 单行间距 |

### WPS 表格

| 枚举 | 值 | 说明 |
|------|-----|------|
| `xlBottom` | -4107 | 底部对齐 |
| `xlCenter` | -4108 | 居中对齐 |
| `xlTop` | -4160 | 顶部对齐 |

---

## 事件监听

WPS COM 支持事件监听：

```powershell
# 注册文档关闭事件
$word = New-Object -ComObject "WPS.Application"
Register-ObjectEvent -InputObject $word -EventName "DocumentBeforeClose" -Action {
    Write-Host "文档即将关闭"
}
```

---

## 官方文档

- WPS WebOffice 开放平台：https://solution.wps.cn/docs/
- JSAPI 文档：https://solution.wps.cn/docs/client/api/overview.html

---

## 本项目实现

本项目的 WPS COM 调用通过 PowerShell 实现：

```
MCP Server (TypeScript)
    ↓ JSON-RPC
PowerShell Script (wps-com.ps1)
    ↓ COM
WPS Application (Word/ET/WPP)
```

详见 `wps-office-mcp/scripts/wps-com.ps1`