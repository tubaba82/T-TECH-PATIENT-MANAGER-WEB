; Inno Setup Script — Allahu Jallah Spiritual Clinic
; Compile this with Inno Setup 6.x to produce the installer .exe

[Setup]
AppName=Allahu Jallah Spiritual Clinic
AppVersion=1.2.0
AppPublisher=T-Tech Solutions
AppPublisherURL=https://t-tech-patient-manager-web.onrender.com
DefaultDirName={autopf}\Allahu Jallah Clinic
DefaultGroupName=Allahu Jallah Clinic
OutputDir=..\dist
OutputBaseFilename=Allahu-Jallah-Clinic-Setup-v1.2.0
SetupIconFile=..\public\logo.ico
UninstallDisplayIcon={app}\logo.ico
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; App files
Source: "..\server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\sync.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\launcher.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs
; Node.js portable (bundled)
Source: "node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs
; Launcher VBS
Source: "run-clinic.vbs"; DestDir: "{app}"; Flags: ignoreversion
; Icon
Source: "..\public\logo.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Allahu Jallah Clinic"; Filename: "wscript.exe"; Parameters: """{app}\run-clinic.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\logo.ico"
Name: "{autodesktop}\Allahu Jallah Clinic"; Filename: "wscript.exe"; Parameters: """{app}\run-clinic.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\logo.ico"

[Run]
Filename: "wscript.exe"; Parameters: """{app}\run-clinic.vbs"""; Description: "Launch Allahu Jallah Clinic"; Flags: nowait postinstall skipifsilent
