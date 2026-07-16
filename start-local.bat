@echo off
set SYNC_ROLE=local
set SYNC_REMOTE_URL=https://t-tech-patient-manager-web.onrender.com
set SYNC_KEY=ajsc-sync-2026-ttech
set PORT=3000
set DATA_DIR=%~dp0data
cd /d "%~dp0"
echo Starting Allahu Jallah Clinic (Local Mode with Cloud Sync)...
echo Data directory: %DATA_DIR%
npm start
pause
