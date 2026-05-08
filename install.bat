@echo off
setlocal

echo ========================================
echo   gov-support-multi-agent : install
echo ========================================
echo.

REM ----- check Node -----
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 24+ from https://nodejs.org/
  pause
  exit /b 1
)

REM ----- check pnpm -----
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [INFO] pnpm not found. Installing globally...
  call npm install -g pnpm
  if errorlevel 1 (
    echo [ERROR] pnpm install failed. Run as admin or install manually.
    pause
    exit /b 1
  )
)

echo [1/3] pnpm install
call pnpm install
if errorlevel 1 (
  echo [ERROR] pnpm install failed.
  pause
  exit /b 1
)

echo.
echo [2/3] .env check
if not exist ".env" (
  copy /Y .env.example .env >nul
  echo   .env created from .env.example
) else (
  echo   .env already exists
)

echo.
echo [3/3] DB seed (20 sample programs + demo profile)
call pnpm --filter @gov/orchestrator run seed
if errorlevel 1 (
  echo [ERROR] seed failed.
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Install OK!
echo ========================================
echo.
echo Next: run dev.bat
echo Then open http://localhost:3000
echo.
pause
endlocal
