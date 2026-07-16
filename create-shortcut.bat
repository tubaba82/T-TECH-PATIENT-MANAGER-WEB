@echo off
echo Creating desktop shortcut...
set SCRIPT="%TEMP%\create_shortcut.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\Allahu Jallah Clinic.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "wscript.exe" >> %SCRIPT%
echo oLink.Arguments = """C:\Users\t4k4l\OneDrive\Attachments\Desktop\NEW PROJECS\T-TECH-PATIENT-MANAGER-WEB\Allahu Jallah Clinic.vbs""" >> %SCRIPT%
echo oLink.WorkingDirectory = "C:\Users\t4k4l\OneDrive\Attachments\Desktop\NEW PROJECS\T-TECH-PATIENT-MANAGER-WEB" >> %SCRIPT%
echo oLink.IconLocation = "C:\Users\t4k4l\OneDrive\Attachments\Desktop\NEW PROJECS\T-TECH-PATIENT-MANAGER\src\renderer\assets\icon.ico" >> %SCRIPT%
echo oLink.Description = "Allahu Jallah Spiritual Clinic" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%
cscript //nologo %SCRIPT%
del %SCRIPT%
echo.
echo   Done! Check your desktop for "Allahu Jallah Clinic" shortcut.
echo.
pause
