@echo off
set SYNC_ROLE=local
set SYNC_REMOTE_URL=https://t-tech-patient-manager-web.onrender.com
set SYNC_KEY=ajsc-sync-2026-ttech
set PORT=3000
cd /d "%~dp0"
npm start
pause
