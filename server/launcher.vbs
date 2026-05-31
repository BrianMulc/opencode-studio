Set WshShell = CreateObject("WScript.Shell")
args = ""
If WScript.Arguments.Count > 0 Then
    args = " """ & WScript.Arguments(0) & """"
End If
WshShell.Run """C:\nvm4w\nodejs\node.exe""" & " ""C:\Users\brian\Desktop\OpenCode Studio\server\cli.js"" " & args, 0, False
