#!/usr/bin/env bash
# Pull the latest code, build, and reload with zero downtime.
# Run on the server from anywhere:  bash deploy/scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "▶ Pulling latest code"
git pull --ff-only

echo "▶ Backend: install, test types, build"
cd "$ROOT/backend"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build

echo "▶ Frontend: install, build"
cd "$ROOT/frontend"
pnpm install --frozen-lockfile
pnpm build

echo "▶ Seeding plans / super admin (idempotent)"
cd "$ROOT/backend"
node dist/scripts/seed.js
# indexes are not built on boot in production (autoIndex off), sync them here
node dist/scripts/syncIndexes.js

echo "▶ Reloading processes"
cd "$ROOT"
if pm2 describe isp-api >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js --update-env
else
  pm2 start deploy/ecosystem.config.js
  pm2 save
fi

echo "▶ Health check"
sleep 3
curl -fsS http://127.0.0.1:5000/api/v1/health && echo && echo "✅ Deployed"
