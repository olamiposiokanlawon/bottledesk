@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing what the app needs - first run only, needs internet...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
if not exist dist (
  echo Preparing the app - first run only...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
echo.
echo BottleDesk is starting. Keep this window open while you use the app. Close it to stop.
echo.
node server\index.js
pause
