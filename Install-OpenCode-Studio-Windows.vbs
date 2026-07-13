'==========================================================================
' OpenCode Studio - Installer (Windows)
'==========================================================================
' Double-click this file to install OpenCode Studio on any computer.
'
' This installer will:
'   1. Check if Node.js is installed (install it automatically if not)
'   2. Install all npm dependencies
'   3. Create Desktop and Start Menu shortcuts
'
' After installation, double-click the "OpenCode Studio" desktop shortcut
' to launch the app (no terminals, browser opens automatically).
'==========================================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
tempDir = WshShell.ExpandEnvironmentStrings("%TEMP%")

' --- Helper: check if Node.js is available AND version 20+ ---
Function HasNode()
    On Error Resume Next
    WshShell.Run "cmd /c node -v > """ & tempDir & "\ocs_nodecheck.txt"" 2>&1", 0, True
    If fso.FileExists(tempDir & "\ocs_nodecheck.txt") Then
        Set f = fso.OpenTextFile(tempDir & "\ocs_nodecheck.txt", 1)
        nodeCheck = Trim(f.ReadAll)
        f.Close
        fso.DeleteFile tempDir & "\ocs_nodecheck.txt", True
        ' Check it starts with 'v' and extract major version
        If InStr(nodeCheck, "v") = 1 Then
            versionPart = Mid(nodeCheck, 2)
            majorVer = CInt(Split(versionPart, ".")(0))
            If majorVer >= 20 Then
                HasNode = True
                Exit Function
            End If
        End If
    End If
    HasNode = False
End Function

' --- Helper: find node.exe path by checking common locations ---
Function FindNodePath()
    On Error Resume Next
    ' Check common Node.js install locations (in order of likelihood)
    candidates = Array( _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\nvm4w\nodejs\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%APPDATA%\nvm\current\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%USERPROFILE%\.nvm\current\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%USERPROFILE%\scoop\apps\nodejs\current\node.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\fnm_multishells\current\node.exe") _
    )
    For Each candidate In candidates
        If fso.FileExists(candidate) Then
            FindNodePath = candidate
            Exit Function
        End If
    Next
    ' Fallback: try PATH via where command
    WshShell.Run "cmd /c where node > """ & tempDir & "\ocs_nodepath.txt"" 2>&1", 0, True
    If fso.FileExists(tempDir & "\ocs_nodepath.txt") Then
        Set f = fso.OpenTextFile(tempDir & "\ocs_nodepath.txt", 1)
        nodePath = Trim(f.ReadAll)
        f.Close
        fso.DeleteFile tempDir & "\ocs_nodepath.txt", True
        ' where may return multiple lines; take the first
        If InStr(nodePath, vbCrLf) > 0 Then
            nodePath = Left(nodePath, InStr(nodePath, vbCrLf) - 1)
        End If
        If nodePath <> "" And fso.FileExists(nodePath) Then
            FindNodePath = nodePath
            Exit Function
        End If
    End If
    FindNodePath = ""
End Function

' --- Helper: refresh PATH from registry (after Node.js install) ---
Sub RefreshPath()
    On Error Resume Next
    Set shellEnv = WshShell.Environment("System")
    sysPath = shellEnv.Item("PATH")
    Set userEnv = WshShell.Environment("User")
    userPath = userEnv.Item("PATH")
    WshShell.Environment("Process").Item("PATH") = sysPath & ";" & userPath
    On Error GoTo 0
End Sub

'==========================================================================
' STEP 1: Node.js
'==========================================================================
If Not HasNode() Then
    ' Check if node exists but is too old
    existingNode = FindNodePath()
    if existingNode <> "" Then
        answer = MsgBox("Node.js was found but is version 20+ is required." & vbCrLf & vbCrLf & _
                        "Would you like to install the latest Node.js LTS version?" & vbCrLf & _
                        "(This will download ~30 MB from nodejs.org)" & vbCrLf & vbCrLf & _
                        "Click Yes to install automatically" & vbCrLf & _
                        "Click No to install manually from https://nodejs.org/", _
                        36, "OpenCode Studio - Setup")
    Else
        answer = MsgBox("Node.js is required but not installed." & vbCrLf & vbCrLf & _
                        "Would you like to install it automatically?" & vbCrLf & _
                        "(This will download ~30 MB from nodejs.org)" & vbCrLf & vbCrLf & _
                        "Click Yes to install automatically" & vbCrLf & _
                        "Click No to install manually from https://nodejs.org/", _
                        36, "OpenCode Studio - Setup")
    End If

    If answer = 6 Then
        ' --- Detect architecture for correct installer ---
        arch = "x64"
        procArch = WshShell.ExpandEnvironmentStrings("%PROCESSOR_ARCHITECTURE%")
        If InStr(procArch, "ARM64") > 0 Then
            arch = "arm64"
        End If

        ' --- Install Node.js via PowerShell (visible window so user sees progress) ---
        psScript = "$ProgressPreference='SilentlyContinue';" & _
                    "Write-Host '=== OpenCode Studio Setup ===' -ForegroundColor Cyan;" & _
                    "Write-Host '';" & _
                    "Write-Host 'Fetching latest Node.js LTS version...' -ForegroundColor Yellow;" & _
                    "try {" & _
                    "  $ltsInfo = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -ErrorAction Stop;" & _
                    "  $ltsVersion = ($ltsInfo | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version;" & _
                    "  if (-not $ltsVersion) { $ltsVersion = 'v22.16.0' };" & _
                    "  Write-Host ""Downloading Node.js $ltsVersion (" & arch & ")..."" -ForegroundColor Yellow;" & _
                    "  $nodeUrl = ""https://nodejs.org/dist/$ltsVersion/node-$ltsVersion-" & arch & ".msi"";" & _
                    "  Invoke-WebRequest -Uri $nodeUrl -OutFile $env:TEMP\node-install.msi -ErrorAction Stop;" & _
                    "  Write-Host 'Installing Node.js (this may take a minute)...' -ForegroundColor Yellow;" & _
                    "  Start-Process msiexec.exe -ArgumentList '/i',""$env:TEMP\node-install.msi"",'/quiet','/norestart' -Wait;" & _
                    "  Remove-Item $env:TEMP\node-install.msi -Force -ErrorAction SilentlyContinue;" & _
                    "  Write-Host '';" & _
                    "  Write-Host 'Node.js installed successfully!' -ForegroundColor Green;" & _
                    "} catch {" & _
                    "  Write-Host ""Error: $_"" -ForegroundColor Red;" & _
                    "  Write-Host 'Please install Node.js manually from https://nodejs.org/' -ForegroundColor Red;" & _
                    "  Read-Host 'Press Enter to exit';" & _
                    "  exit 1;" & _
                    "}"

        ' Run PowerShell visible so user sees download/install progress
        WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -Command """ & psScript & """", 1, True

        ' Refresh PATH so we can find node now
        RefreshPath

        ' Verify installation — try multiple times with delays (MSI may still be finishing)
        nodeInstalled = False
        For attempt = 1 To 3
            If HasNode() Then
                nodeInstalled = True
                Exit For
            End If
            ' Try refreshing PATH again
            RefreshPath
            ' Also try finding node directly by path
            nodePath = FindNodePath()
            If nodePath <> "" Then
                ' Add node's directory to PATH for this process
                nodeDir = fso.GetParentFolderName(nodePath)
                currentPath = WshShell.Environment("Process").Item("PATH")
                WshShell.Environment("Process").Item("PATH") = nodeDir & ";" & currentPath
                If HasNode() Then
                    nodeInstalled = True
                    Exit For
                End If
            End If
            WScript.Sleep 2000
        Next

        If Not nodeInstalled Then
            MsgBox "Node.js installation may have failed." & vbCrLf & vbCrLf & _
                   "Please install Node.js 20+ manually from https://nodejs.org/" & vbCrLf & _
                   "then run this installer again.", _
                   16, "OpenCode Studio - Setup"
            WScript.Quit(1)
        End If
    Else
        MsgBox "Please install Node.js 20+ from https://nodejs.org/" & vbCrLf & _
               "then run this installer again.", _
               48, "OpenCode Studio - Setup"
        WScript.Quit(1)
    End If
End If

'==========================================================================
' STEP 2: Install npm dependencies
'==========================================================================
' Use a visible cmd window so the user sees progress (not a "terminal" - it's an install window)
installCmd = "cmd /c cd /d """ & scriptDir & """ && " & _
             "echo ============================================ && " & _
             "echo    Installing OpenCode Studio dependencies    && " & _
             "echo ============================================ && " & _
             "echo. && " & _
             "npm install && " & _
             "echo. && " & _
             "echo ============================================ && " & _
             "echo    Installation complete!                    && " & _
             "echo ============================================"

WshShell.Run installCmd, 1, True

' Verify deps installed
If Not fso.FolderExists(scriptDir & "\node_modules") Or _
   Not fso.FolderExists(scriptDir & "\server\node_modules") Or _
   Not fso.FolderExists(scriptDir & "\client-next\node_modules") Then
    MsgBox "Dependency installation may have failed." & vbCrLf & _
           "Please check the output above and try again." & vbCrLf & vbCrLf & _
           "If the problem persists, try running:" & vbCrLf & _
           "  cd """ & scriptDir & """" & vbCrLf & _
           "  npm install", _
           16, "OpenCode Studio - Setup"
    WScript.Quit(1)
End If

'==========================================================================
' STEP 3: Create shortcuts
'==========================================================================
desktopPath = WshShell.SpecialFolders("Desktop")
startMenuPath = WshShell.SpecialFolders("StartMenu")
iconPath = scriptDir & "\logo-dark.ico"

' --- Desktop: Launch shortcut ---
Set lnk = WshShell.CreateShortcut(desktopPath & "\OpenCode Studio.lnk")
lnk.TargetPath = scriptDir & "\OpenCode-Studio.vbs"
lnk.WorkingDirectory = scriptDir
lnk.IconLocation = iconPath
lnk.Description = "Launch OpenCode Studio"
lnk.Save

' --- Start Menu: Launch shortcut ---
' Create a folder in Start Menu for cleanliness
startMenuFolder = startMenuPath & "\OpenCode Studio"
If Not fso.FolderExists(startMenuFolder) Then
    fso.CreateFolder(startMenuFolder)
End If

Set lnk2 = WshShell.CreateShortcut(startMenuFolder & "\OpenCode Studio.lnk")
lnk2.TargetPath = scriptDir & "\OpenCode-Studio.vbs"
lnk2.WorkingDirectory = scriptDir
lnk2.IconLocation = iconPath
lnk2.Description = "Launch OpenCode Studio"
lnk2.Save

'==========================================================================
' Done!
'==========================================================================
MsgBox "OpenCode Studio has been installed successfully!" & vbCrLf & vbCrLf & _
       "Shortcuts created:" & vbCrLf & _
       "  - Desktop: OpenCode Studio (double-click to launch)" & vbCrLf & _
       "  - Start Menu: OpenCode Studio" & vbCrLf & vbCrLf & _
       "To start: double-click 'OpenCode Studio' on your Desktop." & vbCrLf & _
       "The app opens in your browser automatically - no terminals needed." & vbCrLf & vbCrLf & _
       "To stop: just close the browser tab - everything shuts down automatically.", _
       64, "OpenCode Studio - Setup Complete"