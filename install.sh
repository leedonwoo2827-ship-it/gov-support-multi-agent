#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "========================================"
echo "gov-support-multi-agent 설치"
echo "========================================"
echo

# Node 24+ 확인
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js가 설치되지 않았습니다. https://nodejs.org/ 에서 Node 24 이상 설치 필요." >&2
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "[WARN] Node $NODE_MAJOR 감지 — node:sqlite 는 Node 24 이상 필요. 업그레이드 권장." >&2
fi

# pnpm 확인
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[INFO] pnpm 설치 중 (npm install -g pnpm)..."
  npm install -g pnpm
fi

echo "[1/3] 의존성 설치 (pnpm install)"
pnpm install

echo
echo "[2/3] .env 파일 확인"
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[INFO] .env 파일을 .env.example 에서 복사했습니다. 필요 시 ANTHROPIC_API_KEY 입력하세요."
else
  echo "[INFO] .env 파일 이미 존재"
fi

echo
echo "[3/3] DB 시드 (공고 20건 + 데모 회사 프로파일)"
pnpm --filter @gov/orchestrator run seed

echo
echo "========================================"
echo "✅ 설치 완료!"
echo "========================================"
echo
echo "다음 단계:"
echo "  1. ./dev.sh 실행"
echo "  2. 브라우저에서 http://localhost:3000 열기"
echo
echo "(선택) ANTHROPIC_API_KEY 설정:"
echo "  $EDITOR .env  # 또는 nano/vim/code"
echo
