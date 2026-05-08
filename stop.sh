#!/usr/bin/env bash
set -e

echo "gov-support-multi-agent 서버 종료 중..."

# 8787, 3000 포트 점유 프로세스 종료
for PORT in 8787 3000; do
  PID=$(lsof -ti :$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "포트 $PORT (PID $PID) 종료"
    kill -9 $PID 2>/dev/null || true
  fi
done

echo "✅ 종료 완료"
