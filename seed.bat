@echo off
chcp 65001 > nul
setlocal

echo gov-support-multi-agent DB 재시드
call pnpm --filter @gov/orchestrator run seed

echo.
pause
endlocal
