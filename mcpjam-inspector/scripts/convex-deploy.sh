#!/usr/bin/env bash
# Deploy Convex backend (schema + functions + HTTP actions) to self-hosted.
#
# The Convex CLI only accepts deploy at the **cloud** URL (sync/API), not the site URL.
# Use the cloud URL here; the same deployment then serves HTTP actions at the site URL.
#
# Usage:
#   CONVEX_SELF_HOSTED_ADMIN_KEY='<key>' ./scripts/convex-deploy.sh
#   CONVEX_SELF_HOSTED_URL='https://sb-convex-cloud.fletch.co' CONVEX_SELF_HOSTED_ADMIN_KEY='<key>' ./scripts/convex-deploy.sh
#
# Optional: CONVEX_SELF_HOSTED_URL (default: https://sb-convex-cloud.fletch.co)
# Required: CONVEX_SELF_HOSTED_ADMIN_KEY

set -e
cd "$(dirname "$0")/.."

CLOUD_URL="${CONVEX_SELF_HOSTED_URL:-https://sb-convex-cloud.fletch.co}"
if [ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]; then
  echo "Error: CONVEX_SELF_HOSTED_ADMIN_KEY is required." >&2
  echo "  export CONVEX_SELF_HOSTED_ADMIN_KEY='<your-admin-key>' then run again." >&2
  exit 1
fi

export CONVEX_SELF_HOSTED_URL="$CLOUD_URL"
echo "Deploying to Convex cloud URL: $CLOUD_URL"
echo "After deploy, HTTP actions (e.g. /web/authorize) are served at your site URL (e.g. https://sb-convex-site.fletch.co)."
npx convex deploy
