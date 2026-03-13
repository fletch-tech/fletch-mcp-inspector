#!/usr/bin/env bash
# Generate the Convex backend admin key locally using INSTANCE_SECRET from the environment.
# Run this once (or when you rotate INSTANCE_SECRET); store the printed key in Secrets Manager
# and use it as CONVEX_SELF_HOSTED_ADMIN_KEY. Do not run generate_admin_key on ECS.
#
# Usage:
#   export INSTANCE_SECRET="$(openssl rand -hex 32)"   # or use your stored secret
#   ./scripts/generate-admin-key.sh
#   # Copy the printed line (convex-self-hosted|...) to Secrets Manager / app env.
#
# Requires: Docker, and INSTANCE_SECRET set in the environment.

set -e
cd "$(dirname "$0")/.."

if [ -z "${INSTANCE_SECRET}" ]; then
  echo "Error: INSTANCE_SECRET is not set. Export it first, e.g.:" >&2
  echo "  export INSTANCE_SECRET=\"\$(openssl rand -hex 32)\"" >&2
  exit 1
fi

IMAGE="${CONVEX_BACKEND_IMAGE:-ghcr.io/get-convex/convex-backend:latest}"
echo "Using image: $IMAGE" >&2
echo "Admin key (store in Secrets Manager as CONVEX_SELF_HOSTED_ADMIN_KEY):" >&2

# Run the backend image with the script as command (no server started).
# If this fails, start the backend with docker compose (INSTANCE_SECRET in .env) and run:
#   docker compose exec backend ./generate_admin_key.sh
docker run --rm -e INSTANCE_SECRET="$INSTANCE_SECRET" "$IMAGE" ./generate_admin_key.sh
