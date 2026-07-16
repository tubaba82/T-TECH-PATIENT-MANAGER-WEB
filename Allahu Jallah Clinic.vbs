Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\t4k4l\OneDrive\Attachments\Desktop\NEW PROJECS\T-TECH-PATIENT-MANAGER-WEB"
WshShell.Run "node """ & WshShell.CurrentDirectory & "\launcher.js""", 0, False
WScript.Sleep 3000
WshShell.Run "http://localhost:3000", 1, False
