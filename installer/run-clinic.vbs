Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Get install directory (where this script lives)
strDir = FSO.GetParentFolderName(WScript.ScriptFullName)
strNode = strDir & "\node\node.exe"
strLauncher = strDir & "\launcher.js"

' Set environment
WshShell.Environment("Process")("SYNC_ROLE") = "local"
WshShell.Environment("Process")("SYNC_REMOTE_URL") = "https://t-tech-patient-manager-web.onrender.com"
WshShell.Environment("Process")("SYNC_KEY") = "ajsc-sync-2026-ttech"
WshShell.Environment("Process")("PORT") = "3000"
WshShell.Environment("Process")("DATA_DIR") = strDir & "\data"

' Run node with launcher.js (hidden window)
WshShell.CurrentDirectory = strDir
WshShell.Run """" & strNode & """ """ & strLauncher & """", 0, False

' Wait 3 seconds then open browser
WScript.Sleep 3000
WshShell.Run "http://localhost:3000", 1, False
