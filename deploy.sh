#!/usr/bin/env bash
set -e

REPO_DIR="/opt/tugrul-game"

echo "[deploy] Going to repo dir..."
cd "$REPO_DIR"

echo "[deploy] Fetching latest code..."
git fetch origin

echo "[deploy] Resetting to origin/main..."
git reset --hard origin/main

echo "[deploy] Installing backend dependencies..."
cd backend
npm install --production

echo "[deploy] Restarting backend..."
pkill -f server.js || true
NODE_ENV=production node server.js &

echo "[deploy] Reloading nginx..."
nginx -t && systemctl reload nginx

echo "[deploy] Done."

