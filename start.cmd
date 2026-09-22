@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Please install Node.js and try again.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:3210"
node server.cjs
pause
