# Self-hosted Convex (fletch-convex)

This directory runs the [Convex backend](https://github.com/get-convex/convex-backend) via Docker for use with the MCP Inspector (and other apps that point `VITE_CONVEX_URL` / `CONVEX_HTTP_URL` at this deployment).

## How does the stock Convex backend use these variables?

The backend image (`ghcr.io/get-convex/convex-backend`) is the **unmodified** upstream image. It does not contain your app’s code. Your app’s Convex code (including `convex/auth.config.ts`) is **deployed** to this backend when you run `npx convex deploy` from the app repo (with `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` set). The backend then runs that deployed code (queries, mutations, and **auth config**) in an embedded JS runtime.

Your `convex/auth.config.ts` uses `process.env.JWT_ISSUER`, `process.env.JWT_JWKS_URL`, etc. When the backend evaluates that config (and when it validates JWTs), it needs those variables to exist in the environment of that runtime. For **self-hosted** Convex, the documented approach is to provide environment variables via the **backend container’s environment** (e.g. docker-compose `environment:` or your orchestrator). The stock backend passes the process environment (or a safe subset) into the runtime that runs your deployed code, so variables you set on the container are available as `process.env` there. There is no separate “deployment env” store for self-hosted unless you use the Convex dashboard and it syncs env to the backend; in the typical Docker setup, **container env is the source**.

So: setting `JWT_ISSUER`, `JWT_JWKS_URL`, etc. in the backend container (as in this repo’s `docker-compose.yml`) is how the stock image gets the values into your deployed auth config. No changes to the Convex backend image are required.

**If you want to confirm before restarting:** Ensure the same values are in the environment where the backend container runs (e.g. `fletch-convex/.env` or your deployment secrets). After restart, if 1011 still occurs, run the backend with `RUST_LOG=debug` and check logs when the client connects; that will show whether auth/env is the cause. If your setup uses the self-hosted Convex dashboard, you can also set these under Deployment Settings there—some self-hosted setups sync deployment env from the dashboard to the backend.

## "Src Pkg storage key not found" (WebSocket 1011)

If backend logs show:

```text
ERROR common::errors: Caught error ... Orig Error: Src Pkg storage key not found?? ObjectKey("...")
```

the backend cannot find the **deployed app package** (your Convex functions/auth) in its storage. The client then gets WebSocket 1011. You don’t need to change RUST_LOG for this; the message is already at ERROR.

**What to do:**

1. **Redeploy the app to this backend**  
   From the **app repo** (e.g. `mcpjam-inspector`), with the same backend URL and admin key this instance uses:
   - Set `CONVEX_SELF_HOSTED_URL` to this backend’s URL (e.g. `https://sb-convex-cloud.fletch.co` or `http://<backend-host>:3210`).
   - Set `CONVEX_SELF_HOSTED_ADMIN_KEY` to the admin key for **this** backend (from `docker compose exec backend ./generate_admin_key.sh` on this instance, or your deployment secrets).
   - Run: `npx convex deploy --yes` (or `npx convex deploy` and confirm).  
   That uploads the current Convex code (and auth config) into this backend’s storage.

2. **Use one backend instance per deployment**  
   If you have multiple backend instances (e.g. old and new ECS tasks), ensure the app’s `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` point at the **same** instance. Deploying with one admin key and then opening the app against another instance will cause “storage key not found” because the new instance has no deployed code.

3. **If you use S3 for storage**  
   Ensure the backend has correct `S3_STORAGE_MODULES_BUCKET` (and `AWS_*` credentials / `S3_ENDPOINT_URL` if needed). The backend writes modules there when you deploy. If the bucket was changed or emptied, redeploy (step 1). If the backend can’t read the bucket (permissions or wrong bucket), fix that and redeploy.

4. **Restart the backend after deploy (if needed)**  
   Usually not required; the backend loads the new package. If you still see the same key error, restart the backend and try again.

After a successful deploy, reload the app; the 1011 from “Src Pkg storage key not found” should stop.

## WebSocket 1011 InternalServerError (other causes)

If the browser shows **WebSocket closed with code 1011: InternalServerError** and backend logs do **not** show "Src Pkg storage key not found" (and then reconnects after a few seconds), the Convex **backend** is closing the connection due to an internal error. Common causes:

1. **Missing or wrong JWT auth config** – The backend must validate the same JWTs as your app (Cognito or custom). If the backend can’t validate the token, it may close the connection with 1011.
2. **Transient backend error** – Less common; check backend logs.

### Fix: Pass JWT env vars to the backend

The backend container must receive the same JWT configuration as your app. Set these in the host environment (e.g. `.env` next to `docker-compose.yml`) or in your deployment config, so they are passed into the `backend` service:

| Variable        | Example / notes |
|----------------|-----------------|
| `JWT_ISSUER`   | `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_xxxxx` |
| `JWT_JWKS_URL` | Full JWKS URL, or omit and set `AWS_REGION` + `USER_POOL_ID` |
| `JWT_AUDIENCE` | Optional; app client ID if you validate `aud` |
| `USER_POOL_ID` | Cognito user pool ID (if not using `JWT_JWKS_URL`) |
| `AWS_REGION`   | e.g. `us-east-2` (if using `USER_POOL_ID`) |

Values must match the app that connects to this Convex deployment (e.g. `mcpjam-inspector/.env.production` or `.env.local`).

### Still getting 1011 after setting JWT env?

**1. Set `CONVEX_CLOUD_ORIGIN` (and `CONVEX_SITE_ORIGIN`) to the public URL**

If your app is served at `https://sandbox-mcp-inspector.fletch.co` and the client uses `VITE_CONVEX_URL=https://sb-convex-cloud.fletch.co`, the **backend** must see the same public URL. In the backend’s environment set:

- `CONVEX_CLOUD_ORIGIN=https://sb-convex-cloud.fletch.co`
- `CONVEX_SITE_ORIGIN=https://sb-convex-cloud.fletch.co/http` (site/proxy URL if you use HTTP actions)

If these are unset or left as `http://127.0.0.1:3210` / `http://127.0.0.1:3211`, the backend can close WebSocket connections with 1011. Add them to your `.env` (or deployment secrets) and restart the backend. See `fletch-convex/.env.example`.

**2. Confirm env inside the backend container**

From the host (or wherever you run Docker):

```bash
cd fletch-convex
docker compose exec backend env | grep -E 'CONVEX_CLOUD_ORIGIN|CONVEX_SITE_ORIGIN|JWT_|USER_POOL|AWS_REGION'
```

You should see `CONVEX_CLOUD_ORIGIN` and the JWT vars with the expected values. If any are missing, fix the env source (e.g. `.env` or ECS task definition) and restart. You can also run `./scripts/verify-backend-env.sh` from the `fletch-convex` directory.

**3. Capture the real error from the backend**

Until you see the backend’s own error, 1011 is a guess. With Docker Compose:

```bash
# In fletch-convex, set RUST_LOG=debug and restart
export RUST_LOG=debug
docker compose up -d backend

# Stream logs and reproduce the 1011 in the browser
docker compose logs -f backend
```

Reproduce the disconnect, then stop the log stream. Search the output for the timestamp of the disconnect and any panic, auth, or WebSocket error line. That message is what you need to fix (e.g. wrong origin, missing JWKS, invalid token).

**Quick run:** From `fletch-convex`, run `./scripts/debug-1011-capture.sh`. It restarts the backend with `RUST_LOG=debug` and streams logs; reproduce the 1011 in the browser and read the backend error in the terminal.

**What to look for in backend logs:**

| Backend message (or similar) | Fix |
|------------------------------|-----|
| No auth provider found / no providers configured | `JWT_ISSUER` or auth.config not loaded; ensure JWT_ISSUER, JWT_JWKS_URL (or USER_POOL_ID + AWS_REGION) are set in backend env and restart. |
| Could not decode token / invalid token | JWKS URL wrong or unreachable from backend; issuer mismatch; or token not from same Cognito pool. Check JWT_JWKS_URL / USER_POOL_ID and that the app’s token issuer matches. |
| Origin / CORS / forbidden origin | Set `CONVEX_CLOUD_ORIGIN` to the public URL clients use (e.g. `https://sb-convex-cloud.fletch.co`). |
| Connection reset / timeout | ALB idle timeout closing WebSocket; increase to 3600. Or security group not allowing ALB → backend on port 3210. |

### Infrastructure: security groups and ALB (for `wss://sb-convex-cloud.fletch.co`)

If the Convex backend runs behind an **ALB** (e.g. on ECS), the following must be correct or the WebSocket can fail or be closed:

**1. ALB listener**

- **Listener**: HTTPS:443 (certificate for `sb-convex-cloud.fletch.co`).
- **Target group**: backend container port **3210** (Convex “cloud” / WebSocket). The path `wss://sb-convex-cloud.fletch.co/api/1.31.4/sync` is handled by the backend on 3210; the ALB just forwards HTTPS to that port.
- **Idle timeout**: Set to **3600** (or at least 300) seconds. Default 60s can cause the ALB to close long-lived WebSockets; the client may see 1011 or reconnect loops.

**2. Security group on the ALB**

- **Inbound**: Allow **443** from `0.0.0.0/0` (or your client CIDRs). So browsers can reach `https://sb-convex-cloud.fletch.co`.

**3. Security group on the Convex backend (e.g. ECS tasks)**

- **Inbound**: Allow **3210** (and **3211** if the Inspector server calls `CONVEX_HTTP_URL` to this host) from the **ALB’s security group**. So the ALB can forward traffic to the backend. If 3210 is not allowed from the ALB, the connection can fail or be reset.
- **Outbound**: Allow whatever the backend needs (e.g. HTTPS for JWKS, database, etc.).

**Quick check:** From a machine that can reach the backend (e.g. in the same VPC), run:

`curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" "https://sb-convex-cloud.fletch.co/api/1.31.4/sync"`

You should get `101 Switching Protocols` if the path from client → ALB → backend is correct. If you get timeout or connection refused, fix security groups or target group port (3210).

### Debugging backend logs

To see why the backend closed the connection:

1. Increase log level: set `RUST_LOG=debug` (or `trace`) in the backend service environment.
2. Restart: `docker compose up -d backend` (or your orchestration).
3. Reproduce the 1011, then inspect backend logs: `docker compose logs backend` (or equivalent).
4. Look for auth/validation errors or panics around the time of the disconnect.

## ECS: Keeping the admin key consistent

The admin key is derived from **INSTANCE_SECRET** (and instance name). If each ECS task gets a different or empty `INSTANCE_SECRET`, each task would accept a different admin key and your app’s `CONVEX_SELF_HOSTED_ADMIN_KEY` would only work for one task. To keep the admin key consistent across task replacements and scaling:

1. **Use a fixed INSTANCE_SECRET for all tasks**
   - Generate a secret once (e.g. `openssl rand -hex 32` or run the Convex keybroker if you use the binary).
   - Store it in **AWS Secrets Manager** (or SSM Parameter Store) as a single secret value (e.g. `convex/backend/instance-secret`).
   - In your **ECS task definition**, inject that secret into the backend container as `INSTANCE_SECRET` (e.g. via `secrets` with `valueFrom` pointing at the Secrets Manager ARN). Do **not** leave `INSTANCE_SECRET` unset or let each task generate its own.

2. **Generate the admin key once (locally or in CI, not on ECS)**
   - From `fletch-convex`, with `INSTANCE_SECRET` set to the same value you use in ECS:
     ```bash
     export INSTANCE_SECRET="<your-secret>"   # or from Secrets Manager for local run
     ./scripts/generate-admin-key.sh
     ```
     That runs the Convex backend image with `INSTANCE_SECRET`, executes `generate_admin_key.sh`, and prints the admin key. Copy it.
   - Alternatively, start the backend with docker compose (with `INSTANCE_SECRET` in `.env`), then run `docker compose exec backend ./generate_admin_key.sh`.
   - Do **not** run `generate_admin_key` on ECS; generate once, store the key, reuse it.

3. **Store and use the admin key**
   - Put the admin key in **Secrets Manager** (or Parameter Store) as a separate secret (e.g. `convex/backend/admin-key`).
   - Use it in:
     - **App / CI**: `CONVEX_SELF_HOSTED_ADMIN_KEY` (mcpjam-inspector server, deploy scripts, CI that runs `npx convex deploy`).
   - Do **not** run `generate_admin_key.sh` per task; use this single stored key everywhere.

4. **Task definition summary**
   - Backend container env: `INSTANCE_SECRET` from Secrets Manager (same value for all tasks). Plus your existing vars (`JWT_ISSUER`, `CONVEX_CLOUD_ORIGIN`, etc.).
   - App / deploy pipeline: `CONVEX_SELF_HOSTED_ADMIN_KEY` from Secrets Manager (the key you generated in step 2).

Then every new or replaced ECS task uses the same `INSTANCE_SECRET` → same backend identity → the same admin key works for deploy and for the app. If you ever rotate `INSTANCE_SECRET`, you must generate a new admin key and update the app and deploy config.

## Quick start

1. Copy or create a `.env` with at least:
   - `JWT_ISSUER`, `JWT_JWKS_URL` (or `AWS_REGION` + `USER_POOL_ID`), and optionally `JWT_AUDIENCE`
   - Any other vars your deployment needs (e.g. `DATABASE_URL`, `POSTGRES_URL`, `INSTANCE_SECRET`, etc.)
2. Run: `docker compose up -d`
3. Point the app at this backend (e.g. `VITE_CONVEX_URL=http://127.0.0.1:3210`, `CONVEX_HTTP_URL=http://127.0.0.1:3211` for local).
