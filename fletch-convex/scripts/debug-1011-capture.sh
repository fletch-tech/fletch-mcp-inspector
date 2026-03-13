#!/usr/bin/env bash
# Capture the real cause of WebSocket 1011 by running the backend with debug logs
# and streaming logs while you reproduce the disconnect in the browser.
#
# Usage (from fletch-convex): ./scripts/debug-1011-capture.sh
# Or from repo root: ./fletch-convex/scripts/debug-1011-capture.sh
#
# 1. This script restarts the backend with RUST_LOG=debug.
# 2. It streams backend logs to the terminal.
# 3. You reproduce the 1011 in the browser (load app, sign in if needed, wait for disconnect).
# 4. Look at the log lines that appear at the same time as the disconnect (auth errors, JWKS, origin, etc.).
# 5. Ctrl+C when done, then fix the backend env/config per the error you see.

set -e
cd "$(dirname "$0")/.."

echo "=== WebSocket 1011 debug capture ==="
echo "Restarting backend with RUST_LOG=debug..."
export RUST_LOG=debug
docker compose up -d backend

echo ""
echo "Streaming backend logs. Reproduce the 1011 in the browser now (open the app, sign in, wait for disconnect)."
echo "Look for lines around the disconnect time: auth, JWKS, token, origin, or panic."
echo "Common backend messages:"
echo "  - 'No auth provider found' / 'no providers configured' → JWT_ISSUER / auth.config not loaded"
echo "  - 'Could not decode token' → JWKS URL wrong or unreachable, or token format/issuer mismatch"
echo "  - Origin / CORS errors → set CONVEX_CLOUD_ORIGIN to the public URL (e.g. https://sb-convex-cloud.fletch.co)"
echo "  - ALB/timeout → increase ALB idle timeout to 3600"
echo ""
echo "Press Ctrl+C when done."
echo ""

docker compose logs -f backend
