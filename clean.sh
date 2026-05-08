#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "gov-support-multi-agent 클린 (주의)"
echo "========================================"
echo
echo "다음 항목이 삭제됩니다:"
echo "  - packages/orchestrator/data/gov.db (게시판 데이터 전부)"
echo "  - 모든 node_modules"
echo "  - .next 빌드 캐시"
echo

read -p "계속하시겠습니까? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "취소되었습니다."
  exit 0
fi

echo "[1/3] DB 삭제"
rm -f packages/orchestrator/data/gov.db packages/orchestrator/data/gov.db-shm packages/orchestrator/data/gov.db-wal

echo "[2/3] node_modules 삭제 (시간 소요)"
find . -name 'node_modules' -type d -prune -exec rm -rf {} +

echo "[3/3] Next.js 캐시 삭제"
rm -rf apps/web/.next

echo
echo "✅ 클린 완료. ./install.sh 으로 재설치하세요."
