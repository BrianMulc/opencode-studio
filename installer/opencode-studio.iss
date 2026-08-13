; ==========================================================================
; OpenCode Studio - Windows Installer (Inno Setup)
; ==========================================================================
; Produces a single OpenCodeStudio-Setup.exe: a real wizard installer.
;   - Per-user install (no admin rights required)
;   - Bundles the pre-built app AND a portable Node.js runtime
;     (install = pure file copy, ~30s, no internet or prerequisites needed)
;   - Desktop + Start Menu shortcuts, Add/Remove Programs entry, uninstaller
;   - Registers the opencodestudio:// protocol
;
; Build expects a staged layout (see .github/workflows/build-installer.yml):
;   repo root        = app source with node_modules + client-next/.next built
;   installer\runtime\nodejs = portable Node.js (node.exe, npm.cmd, ...)
;   installer\runtime\mingit = portable MinGit (cmd\git.exe, ...)
;
; Compile:  iscc /DAppVersion=2.9.1 installer\opencode-studio.iss
; ==========================================================================

#define AppName "OpenCode Studio"
#define AppPublisher "OpenCode Studio"
#define AppURL "https://github.com/BrianMulc/opencode-studio"
#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif
; Fixed AppId = upgrades install over the existing copy (never side-by-side)
#define AppId "{{8F3A2C1D-9E4B-4A6F-B2C7-5D8E1F3A9B04}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases
DefaultDirName={localappdata}\Programs\OpenCode Studio
DefaultGroupName=OpenCode Studio
; Per-user install: no admin prompt, ever
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=OpenCodeStudio-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\logo-dark.ico
UninstallDisplayIcon={app}\logo-dark.ico
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppName} Setup
; Windows x64 only (matches the bundled Node runtime and Next.js swc binaries)
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Ask to close running instances (Restart Manager detects node.exe file locks)
CloseApplications=yes
CloseApplicationsFilter=node.exe,wscript.exe
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; --- App: source + pre-built dependencies (node_modules, .next) ---
; Excludes protect against junk when building from a dirty local checkout;
; CI checkouts are clean anyway.
Source: "..\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: "\.git,\.github,.changeset,installer,installer\*,*.err,*.log,\.sisyphus,\.omo,vendor,server\launcher.vbs,client-next\.next\cache,client-next\.next\cache\*,node_modules\.cache,client-next\node_modules\.cache,client-next\node_modules\.cache\*"
; --- Portable Node.js runtime ---
Source: "runtime\nodejs\*"; DestDir: "{app}\runtime\nodejs"; Flags: recursesubdirs createallsubdirs ignoreversion
; --- Portable MinGit runtime (makes in-app self-updates work without system Git) ---
Source: "runtime\mingit\*"; DestDir: "{app}\runtime\mingit"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autodesktop}\OpenCode Studio"; Filename: "wscript.exe"; Parameters: """{app}\OpenCode-Studio.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\logo-dark.ico"; Comment: "Launch OpenCode Studio"
Name: "{group}\OpenCode Studio"; Filename: "wscript.exe"; Parameters: """{app}\OpenCode-Studio.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\logo-dark.ico"; Comment: "Launch OpenCode Studio"
Name: "{group}\Uninstall OpenCode Studio"; Filename: "{uninstallexe}"; IconFilename: "{app}\logo-dark.ico"

[Registry]
; opencodestudio:// protocol (mirrors server/register-protocol.js)
Root: HKCU; Subkey: "Software\Classes\opencodestudio"; ValueType: string; ValueData: "URL:OpenCode Studio Protocol"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\opencodestudio"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\opencodestudio\shell\open\command"; ValueType: string; ValueData: "wscript.exe ""{app}\server\launcher.vbs"" ""%1"""

[Run]
; "Launch now" checkbox on the finish page (checked by default)
Filename: "wscript.exe"; Parameters: """{app}\OpenCode-Studio.vbs"""; Description: "Launch OpenCode Studio now"; Flags: postinstall skipifsilent nowait; WorkingDir: "{app}"

[UninstallDelete]
; launcher.vbs is generated per-machine at install time (see [Code]), so Inno
; doesn't track it — delete it explicitly on uninstall.
Type: files; Name: "{app}\server\launcher.vbs"

[Code]
{ The protocol handler needs a launcher.vbs containing THIS machine's paths
  (server/register-protocol.js normally generates it at npm postinstall time,
  which doesn't happen for a pre-built bundle). Write it post-install. }
procedure WriteProtocolLauncher();
var
  LauncherPath, NodePath, CliPath, Content: String;
begin
  LauncherPath := ExpandConstant('{app}\server\launcher.vbs');
  NodePath := ExpandConstant('{app}\runtime\nodejs\node.exe');
  CliPath := ExpandConstant('{app}\server\cli.js');
  Content :=
    'Set WshShell = CreateObject("WScript.Shell")' + #13#10 +
    'args = ""' + #13#10 +
    'If WScript.Arguments.Count > 0 Then' + #13#10 +
    '    args = " """ & WScript.Arguments(0) & """"' + #13#10 +
    'End If' + #13#10 +
    'WshShell.Run """' + NodePath + '""" & " ""' + CliPath + '"" " & args, 0, False' + #13#10;
  SaveStringToFile(LauncherPath, Content, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    WriteProtocolLauncher();
end;
