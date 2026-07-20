@echo off
title Allahu Jallah Spiritual Clinic
cd /d "%~dp0"
echo Starting Allahu Jallah Spiritual Clinic...
echo.
start "" http://localhost:3000
node server.js
pause
