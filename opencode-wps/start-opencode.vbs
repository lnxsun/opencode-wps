' start-opencode.vbs - 静默启动 opencode serve
' 参数1: 工作目录 (必填)
If WScript.Arguments.Count < 1 Then
    WScript.Quit 1
End If
Dim cwd, batPath, shell
cwd = WScript.Arguments(0)
batPath = Replace(WScript.ScriptFullName, "start-opencode.vbs", "start-opencode.bat")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = cwd
shell.Run """" & batPath & """ """ & cwd & """", 0, False
