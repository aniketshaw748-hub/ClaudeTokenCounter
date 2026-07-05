@echo off
REM One-click installer for Windows — double-click this file.
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on your PATH.
  echo Install it from https://nodejs.org/ then run this again.
  echo.
  pause
  exit /b 1
)
node "%~dp0install.mjs" %*
echo.
pause
