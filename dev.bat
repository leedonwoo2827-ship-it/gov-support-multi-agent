@echo off
setlocal

echo ========================================
echo   gov-support-multi-agent : dev
echo ========================================
echo.
echo Starting orchestrator on :8787 ...
echo Starting web on :3000 ...
echo.
echo Two new CMD windows will open. Close them or press Ctrl+C in each to stop.
echo.

start "gov-orchestrator :8787" cmd /k "cd /d %~dp0 && pnpm --filter @gov/orchestrator dev"

timeout /t 3 /nobreak >nul

start "gov-web :3000" cmd /k "cd /d %~dp0 && pnpm --filter @gov/web dev"

timeout /t 8 /nobreak >nul

start "" http://localhost:3000

echo Browser should open automatically.
echo If not, open http://localhost:3000 manually.
echo.
endlocal
