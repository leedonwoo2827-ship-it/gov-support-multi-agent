@echo off
chcp 65001 > nul
setlocal

echo gov-support-multi-agent 서버 종료 중...

REM 8787, 3000 포트를 사용하는 프로세스 종료
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8787 ^| findstr LISTENING') do (
  echo orchestrator (PID %%a) 종료
  taskkill /F /PID %%a > nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  echo web (PID %%a) 종료
  taskkill /F /PID %%a > nul 2>&1
)

echo ✅ 종료 완료
endlocal
