@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo One-Click AI Video Studio requires Node.js 22 or newer.
  echo Install the local companion package, then run this launcher again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Preparing the local studio for first use...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Opening One-Click AI Video Studio...
node studio\launcher.mjs
endlocal
