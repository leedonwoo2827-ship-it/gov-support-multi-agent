@echo off
setlocal

echo Stopping gov-support-multi-agent servers...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do (
  echo   killing orchestrator PID %%a
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  echo   killing web PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo Done.
endlocal
