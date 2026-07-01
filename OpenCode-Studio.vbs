'==========================================================================
' OpenCode Studio - Silent Launcher
'==========================================================================
' Double-click to start with NO visible terminals.
' The server starts hidden, spawns the Next.js client, and opens the
' browser automatically when the frontend is ready.
'
' Close the browser tab to stop everything (heartbeat auto-shutdown).
'==========================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' --- Helper: check if a URL responds with 200 ---
Function IsUrlReady(url)
    On Error Resume Next
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", url, False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then
        IsUrlReady = True
    Else
        IsUrlReady = False
    End If
    On Error GoTo 0
End Function

' --- Helper: find node.exe path ---
Function FindNode()
    On Error Resume Next
    ' Try common locations
    candidates = Array( _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\nvm4w\nodejs\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%APPDATA%\nvm\current\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%USERPROFILE%\scoop\apps\nodejs\current\node.exe") _
    )
    For Each candidate In candidates
        If fso.FileExists(candidate) Then
            FindNode = candidate
            Exit Function
        End If
    Next
    ' Fallback: try PATH (this uses cmd but only briefly)
    WshShell.Run "cmd /c where node > ""%TEMP%\ocs_nodepath.txt"" 2>&1", 0, True
    tempFile = WshShell.ExpandEnvironmentStrings("%TEMP%\ocs_nodepath.txt")
    If fso.FileExists(tempFile) Then
        Set f = fso.OpenTextFile(tempFile, 1)
        nodePath = Trim(f.ReadAll)
        f.Close
        fso.DeleteFile tempFile, True
        If nodePath <> "" And fso.FileExists(nodePath) Then
            FindNode = nodePath
            Exit Function
        End If
    End If
    FindNode = ""
End Function

' --- Check if already running ---
frontendUrl = "http://localhost:1080"
If IsUrlReady(frontendUrl) Then
    WshShell.Run frontendUrl
    WScript.Quit(0)
End If

' --- Find node.exe ---
nodeExe = FindNode()
If nodeExe = "" Then
    MsgBox "Node.js is not installed." & vbCrLf & vbCrLf & _
           "Please run Install-OpenCode-Studio.vbs first," & vbCrLf & _
           "or install Node.js manually from https://nodejs.org/", _
           16, "OpenCode Studio"
    WScript.Quit(1)
End If

' --- Install dependencies if needed ---
needsInstall = False
If Not fso.FolderExists(scriptDir & "\node_modules") Then needsInstall = True
If Not fso.FolderExists(scriptDir & "\server\node_modules") Then needsInstall = True
If Not fso.FolderExists(scriptDir & "\client-next\node_modules") Then needsInstall = True

If needsInstall Then
    ' npm needs cmd, but this is a one-time install
    WshShell.Run "cmd /c cd /d """ & scriptDir & """ && npm install", 0, True
End If

' --- Clean up stale server lock ---
lockPath = WshShell.ExpandEnvironmentStrings("%USERPROFILE%\.config\opencode-studio\server.lock.json")
If fso.FileExists(lockPath) Then
    On Error Resume Next
    fso.DeleteFile lockPath, True
    On Error GoTo 0
End If

' --- Start server (hidden, no cmd.exe wrapper) ---
' Launch node.exe directly to avoid any cmd.exe console window flash.
' The server spawns the Next.js client and opens the browser automatically.
serverScript = scriptDir & "\server\index.js"
WshShell.Run """" & nodeExe & """ """ & serverScript & """", 0, False

' Exit cleanly - the server handles everything from here.
' Closing the browser tab triggers auto-shutdown via heartbeat.