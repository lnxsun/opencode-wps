# PowerShell COM 桥接技术

本项目通过 PowerShell 调用 WPS COM 接口，实现 AI 对 WPS 文档的操作。

---

## 为什么用 PowerShell

1. **Windows 原生支持**：PowerShell 原生支持 COM 对象调用
2. **无需额外依赖**：Windows 系统自带，无需安装额外运行时
3. **进程隔离**：每次调用独立进程，避免 WPS COM 会话冲突

---

## COM 对象创建

```powershell
# WPS 文字
$word = New-Object -ComObject "WPS.Application"

# WPS 表格
$excel = New-Object -ComObject "ET.Application"

# WPS 演示
$ppt = New-Object -ComObject "WPP.Application"
```

---

## 核心脚本结构

`scripts/wps-com.ps1` 是核心桥接脚本：

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$AppType,        # wps/et/wpp
    
    [Parameter(Mandatory=$true)]
    [string]$Method,         # 方法名
    
    [Parameter(Mandatory=$false)]
    [hashtable]$Params = @{} # 参数
)

# 1. 创建 COM 对象
$app = Get-ComObject -AppType $AppType

# 2. 调用对应方法
$result = Invoke-WpsMethod -App $app -Method $Method -Params $Params

# 3. 返回结果
return $result
```

---

## 调用示例

### 读取 Excel 单元格

```powershell
# 命令行调用
powershell -ExecutionPolicy Bypass -File wps-com.ps1 -AppType et -Method getCellValue -Params @{sheet="Sheet1";row=1;col=1}
```

### 写入 Word 文本

```powershell
powershell -ExecutionPolicy Bypass -File wps-com.ps1 -AppType wps -Method insertText -Params @{text="Hello World"}
```

---

## 错误处理

### 超时处理

```powershell
$timeout = 30  # 秒
$job = Start-Job -ScriptBlock {
    param($appType, $method, $params)
    # COM 调用逻辑
} -ArgumentList $appType, $method, $params

$completed = Wait-Job $job -Timeout $timeout
if (-not $completed) {
    Stop-Job $job
    throw "Operation timed out"
}
$result = Receive-Job $job
Remove-Job $job
```

### 重试机制

```powershell
function Invoke-WpsComWithRetry {
    param(
        [scriptblock]$Script,
        [int]$MaxRetries = 3,
        [int]$DelayMs = 500
    )
    
    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        try {
            return & $Script
        } catch {
            $attempt++
            if ($attempt -ge $MaxRetries) { throw }
            Start-Sleep -Milliseconds $DelayMs
        }
    }
}
```

---

## 进程管理

### 独立进程模式

每次 COM 调用使用独立 PowerShell 进程，避免会话状态污染：

```powershell
$script = @"
`$app = New-Object -ComObject 'ET.Application'
`$sheet = `$app.Workbooks.Open('$file').Sheets.Item(1)
`$value = `$sheet.Range('$cell').Text
`$app.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject(`$app) | Out-Null
Write-Output `$value
"@

$result = powershell -ExecutionPolicy Bypass -Command $script
```

### 进程清理

```powershell
# 确保 COM 对象被释放
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()
```

---

## 性能优化

### 批量操作

```powershell
# 避免频繁创建/销毁 COM 对象
$app = New-Object -ComObject "ET.Application"
$workbook = $app.Workbooks.Open($file)
$sheet = $workbook.Sheets.Item(1)

# 批量读取
1..10 | ForEach-Object {
    $sheet.Range("A$_").Text
}

# 批量写入
$sheet.Range("B1:B10").Value = @(1,2,3,4,5,6,7,8,9,10)

$workbook.Close($true)
$app.Quit()
```

---

## 安全考虑

### 执行策略

```powershell
# 使用 -ExecutionPolicy Bypass 绕过本地策略
powershell -ExecutionPolicy Bypass -File script.ps1
```

### 路径安全

```powershell
# 防止路径遍历攻击
$resolvedPath = [System.IO.Path]::GetFullPath($userInput)
if (-not $resolvedPath.StartsWith($allowedDir)) {
    throw "Invalid path"
}
```

---

## 调试技巧

### 查看 COM 对象

```powershell
$app = New-Object -ComObject "ET.Application"
$app | Get-Member
```

### 捕获详细错误

```powershell
$ErrorActionPreference = "Stop"
try {
    # COM 操作
} catch {
    Write-Host $_.Exception.Message
    Write-Host $_.ScriptStackTrace
}
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `wps-office-mcp/scripts/wps-com.ps1` | 核心 COM 桥接脚本 |
| `wps-office-mcp/src/client/wps-client.ts` | MCP 客户端调用 |
| `wps-office-mcp/src/tools/*.ts` | 工具定义和实现 |