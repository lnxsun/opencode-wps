' stop-opencode.vbs - 停止 opencode serve 进程
On Error Resume Next
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "taskkill /IM opencode.exe /F", 0, True
