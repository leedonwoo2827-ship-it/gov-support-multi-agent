#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "실데이터 시드 (K-Startup data.go.kr)"
echo "========================================"
echo

if [ ! -f ".env" ]; then
  echo "[ERROR] .env 파일이 없습니다."
  echo ".env.example 을 .env 로 복사하고 PUBLIC_DATA_SERVICE_KEY 를 입력하세요."
  exit 1
fi

pnpm --filter @gov/orchestrator run seed:real
