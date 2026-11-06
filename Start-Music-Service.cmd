@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0music-service"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新版本。
  pause
  exit /b 1
)
if not exist "node_modules\@neteasecloudmusicapienhanced\api\package.json" (
  if not exist "..\work\netease-api-source\package.json" (
    call npm.cmd ci --ignore-scripts --no-audit --no-fund
    if errorlevel 1 (
      echo 依赖安装失败，请检查网络后重新运行。
      pause
      exit /b 1
    )
  )
)
start "" "http://127.0.0.1:17864"
node start.cjs
pause
