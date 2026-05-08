#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "gov-support-multi-agent DB 재시드"
pnpm --filter @gov/orchestrator run seed
