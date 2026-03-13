#!/usr/bin/env bash
# Verify Convex backend container has env needed to avoid WebSocket 1011.
# Run from repo root: ./fletch-convex/scripts/verify-backend-env.sh
# Optional: VERIFY_LOGS=1 to stream backend logs after printing env (reproduce 1011 in browser, then Ctrl+C).

set -e
cd "$(dirname "$0")/.."
SERVICE="${VERIFY_SERVICE:-backend}"

echo "=== Checking env inside Convex backend container (service: $SERVICE) ==="
docker compose exec "$SERVICE" env | grep -E 'CONVEX_CLOUD_ORIGIN|CONVEX_SITE_ORIGIN|JWT_|USER_POOL_ID|AWS_REGION' || true

echo ""
echo "If CONVEX_CLOUD_ORIGIN is empty or http://127.0.0.1:..., set it in .env to your public URL (e.g. https://sb-convex-cloud.fletch.co) and restart."
echo "If JWT_* / USER_POOL_ID are missing, add them to .env (match mcpjam-inspector .env) and restart."
echo ""

if [ "${VERIFY_LOGS}" = "1" ]; then
  echo "Streaming backend logs (RUST_LOG=debug recommended). Reproduce 1011 in browser, then Ctrl+C."
  docker compose logs -f "$SERVICE"
fi
