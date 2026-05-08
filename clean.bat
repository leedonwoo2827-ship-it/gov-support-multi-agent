@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo gov-support-multi-agent 클린 (주의)
echo ========================================
echo.
echo 다음 항목이 삭제됩니다:
echo   - data\gov.db (게시판 데이터 전부)
echo   - 모든 node_modules
echo   - .next 빌드 캐시
echo.
set /p CONFIRM=계속하시겠습니까? (y/N):

if /i not "%CONFIRM%"=="y" (
  echo 취소되었습니다.
  pause
  exit /b 0
)

echo [1/3] DB 삭제
if exist "packages\orchestrator\data\gov.db" del /q "packages\orchestrator\data\gov.db"
if exist "packages\orchestrator\data\gov.db-shm" del /q "packages\orchestrator\data\gov.db-shm"
if exist "packages\orchestrator\data\gov.db-wal" del /q "packages\orchestrator\data\gov.db-wal"

echo [2/3] node_modules 삭제 (시간 소요)
for /d /r %%d in (node_modules) do @if exist "%%d" rd /s /q "%%d"

echo [3/3] Next.js 캐시 삭제
if exist "apps\web\.next" rd /s /q "apps\web\.next"

echo.
echo ✅ 클린 완료. install.bat 으로 재설치하세요.
pause
endlocal
