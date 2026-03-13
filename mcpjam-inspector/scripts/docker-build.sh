#!/usr/bin/env bash
# Docker build for mcp-inspector. Resolves build args with defaults and prints
# the actual values so the terminal shows real URLs, not ${VITE_CONVEX_URL}.
# Run from mcpjam-inspector: npm run docker:build

set -e
CONVEX_URL="${VITE_CONVEX_URL:-https://sb-convex-cloud.fletch.co}"
HOSTED_MODE="${VITE_MCPJAM_HOSTED_MODE:-true}"

echo ">>> Building with VITE_CONVEX_URL=$CONVEX_URL VITE_MCPJAM_HOSTED_MODE=$HOSTED_MODE"
docker build -t mcpjam/mcp-inspector:local -f Dockerfile \
  --build-arg VITE_CONVEX_URL="$CONVEX_URL" \
  --build-arg VITE_MCPJAM_HOSTED_MODE="$HOSTED_MODE" \
  ..
