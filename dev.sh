#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "gov-support-multi-agent 개발 서버 실행"
echo "========================================"
echo "  orchestrator → http://localhost:8787"
echo "  web          → http://localhost:3000"
echo
echo "종료: Ctrl+C"
echo

# orchestrator 백그라운드 실행
pnpm --filter @gov/orchestrator dev &
ORCH_PID=$!

# 백엔드 부팅 대기
sleep 3

# web 백그라운드 실행
pnpm --filter @gov/web dev &
WEB_PID=$!

# 종료 시 자식 프로세스 정리
trap "echo '종료 중...'; kill $ORCH_PID $WEB_PID 2>/dev/null; wait 2>/dev/null; exit 0" INT TERM

# 웹 부팅 대기 후 브라우저 자동 오픈 (백그라운드)
(
  sleep 8
  if command -v open >/dev/null 2>&1; then
    open http://localhost:3000           # macOS
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:3000       # Linux
  else
    echo "ℹ️  http://localhost:3000 을 브라우저에서 열어주세요."
  fi
) &

# 자식 프로세스가 끝날 때까지 대기
wait $ORCH_PID $WEB_PID
