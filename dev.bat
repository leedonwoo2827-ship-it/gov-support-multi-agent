@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo gov-support-multi-agent 개발 서버 실행
echo ========================================
echo.
echo orchestrator → http://localhost:8787 (별도 창)
echo web          → http://localhost:3000 (별도 창)
echo.
echo 종료: 각 창에서 Ctrl+C 또는 stop.bat
echo.

REM orchestrator (백엔드) 실행 — 별도 창
start "gov-orchestrator :8787" cmd /k "cd /d %~dp0 && pnpm --filter @gov/orchestrator dev"

REM 백엔드 부팅 대기
timeout /t 3 /nobreak > nul

REM web (프론트) 실행 — 별도 창
start "gov-web :3000" cmd /k "cd /d %~dp0 && pnpm --filter @gov/web dev"

REM 웹 부팅 대기 후 자동으로 브라우저 열기
timeout /t 8 /nobreak > nul
start "" http://localhost:3000

echo.
echo ✅ 두 서버가 별도 창에서 실행 중입니다.
echo    http://localhost:3000 이 자동으로 열렸습니다.
echo.
endlocal
