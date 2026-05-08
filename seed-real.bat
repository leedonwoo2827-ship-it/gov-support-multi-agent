@echo off
setlocal

echo ========================================
echo   Real data seed (K-Startup data.go.kr)
echo ========================================
echo.

if not exist ".env" (
  echo [ERROR] .env not found. Copy .env.example to .env and set PUBLIC_DATA_SERVICE_KEY.
  pause
  exit /b 1
)

call pnpm --filter @gov/orchestrator run seed:real
echo.
pause
endlocal
