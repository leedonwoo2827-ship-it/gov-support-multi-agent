@echo off
setlocal

echo ========================================
echo   gov-support-multi-agent : clean
echo ========================================
echo.
echo This will DELETE:
echo   - data/gov.db (all board data)
echo   - all node_modules
echo   - .next build cache
echo.

set /p CONFIRM=Continue? (y/N):
if /i not "%CONFIRM%"=="y" (
  echo cancelled.
  pause
  exit /b 0
)

echo [1/3] removing DB
if exist "packages\orchestrator\data\gov.db" del /q "packages\orchestrator\data\gov.db"
if exist "packages\orchestrator\data\gov.db-shm" del /q "packages\orchestrator\data\gov.db-shm"
if exist "packages\orchestrator\data\gov.db-wal" del /q "packages\orchestrator\data\gov.db-wal"

echo [2/3] removing node_modules (takes a moment)
for /d /r %%d in (node_modules) do @if exist "%%d" rd /s /q "%%d"

echo [3/3] removing .next cache
if exist "apps\web\.next" rd /s /q "apps\web\.next"

echo.
echo Clean done. Run install.bat to re-setup.
pause
endlocal
