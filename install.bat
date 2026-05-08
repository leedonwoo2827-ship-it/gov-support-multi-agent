@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo gov-support-multi-agent 설치
echo ========================================
echo.

REM Node 24+ 확인
node --version > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js가 설치되지 않았습니다. https://nodejs.org/ 에서 Node 24 이상 설치 필요.
  pause
  exit /b 1
)

REM pnpm 확인
pnpm --version > nul 2>&1
if errorlevel 1 (
  echo [INFO] pnpm 설치 중...
  npm install -g pnpm
  if errorlevel 1 (
    echo [ERROR] pnpm 설치 실패. 관리자 권한으로 실행해주세요.
    pause
    exit /b 1
  )
)

echo [1/3] 의존성 설치 (pnpm install)
call pnpm install
if errorlevel 1 (
  echo [ERROR] pnpm install 실패
  pause
  exit /b 1
)

echo.
echo [2/3] .env 파일 확인
if not exist ".env" (
  copy .env.example .env > nul
  echo [INFO] .env 파일을 .env.example 에서 복사했습니다. 필요 시 ANTHROPIC_API_KEY 입력하세요.
) else (
  echo [INFO] .env 파일 이미 존재
)

echo.
echo [3/3] DB 시드 (공고 20건 + 데모 회사 프로파일)
call pnpm --filter @gov/orchestrator run seed
if errorlevel 1 (
  echo [ERROR] 시드 실패
  pause
  exit /b 1
)

echo.
echo ========================================
echo ✅ 설치 완료!
echo ========================================
echo.
echo 다음 단계:
echo   1. dev.bat 실행 (orchestrator + web 동시 실행)
echo   2. 브라우저에서 http://localhost:3000 열기
echo.
echo (선택) ANTHROPIC_API_KEY 설정:
echo   notepad .env
echo.
pause
endlocal
