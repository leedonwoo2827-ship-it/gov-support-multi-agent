@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo 실데이터 시드 (K-Startup data.go.kr)
echo ========================================
echo.

if not exist ".env" (
  echo [ERROR] .env 파일이 없습니다.
  echo .env.example 을 .env 로 복사하고 PUBLIC_DATA_SERVICE_KEY 를 입력하세요.
  echo.
  pause
  exit /b 1
)

call pnpm --filter @gov/orchestrator run seed:real
echo.
pause
endlocal
