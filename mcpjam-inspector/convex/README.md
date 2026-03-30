# Convex backend (mcpjam-inspector)

This folder is the Convex backend for the inspector app. It defines the schema and functions (users, organizations, workspaces stubs, etc.), and **HTTP actions** used by the Inspector server in hosted mode.

## HTTP actions (`convex/http.ts`)

- **POST /web/authorize** – Authorizes a user (via Bearer JWT) to access a workspace server. Used by the Inspector at `CONVEX_HTTP_URL + "/web/authorize"` for validate, tools, chat-v2, etc. Requires the Convex deployment to have **HTTP actions enabled** and to be deployed from this folder so this route exists. If you see "Authorization endpoint not found (404)", deploy this backend so that the HTTP-actions endpoint (e.g. `https://sb-convex-site.fletch.co`) serves `convex/http.ts`.

- **POST /stream** – Proxies one LLM step for hosted MCPJam chat (`handleMCPJamFreeChatModel` → `CONVEX_HTTP_URL/stream`) and eval agents (`mode: "stream"` vs `mode: "step"`). Register the route in `http.ts` with `http.route({ path: "/stream", method: "POST", handler: streamHttp })` (see `convex/stream.ts`). Set **`OPENAI_API_KEY`** on the Convex backend for `openai/*` models; **`ANTHROPIC_API_KEY`** for `anthropic/*`; **`GOOGLE_GENERATIVE_AI_API_KEY`** for `google/*` (e.g. Gemini free tier in hosted chat). The caller must send **`Authorization: Bearer <same Convex JWT as the browser>`** so `getUserIdentity()` succeeds.

## Schema (`schema.ts`)

- **users** – tokenIdentifier, name, email, profile, etc. (index: `by_token`)
- **organizations** – name, description, logo, createdBy, timestamps (index: `by_name`)
- **organizationMembers** – org/user/role (indexes: `by_org`, `by_user`, `by_org_user`)
- **workspaces** – name, optional description, timestamps (index: `by_created`)

The **workspaces** API has a minimal implementation (`createWorkspace`, `getMyWorkspaces`); other mutations (update, delete, members) are still stubbed.

## Deploy to self-hosted Convex (cloud URL only)

The Convex CLI **only accepts deploy at the cloud URL** (sync/API), not the site URL. Use the cloud URL below; the **same deployment** then serves HTTP actions (e.g. `/web/authorize`) at your **site** URL.

1. **Set env** (in `.env.local` or export before running):

   ```bash
   # Use the cloud URL (deploy works only here)
   CONVEX_SELF_HOSTED_URL='https://sb-convex-cloud.fletch.co'
   CONVEX_SELF_HOSTED_ADMIN_KEY='<your-admin-key>'
   ```

   Use the same admin key you use for the dashboard and for `CONVEX_SELF_HOSTED_ADMIN_KEY` in the ECS task.

2. **Deploy** from the `mcpjam-inspector` directory:

   ```bash
   cd mcpjam-inspector
   npx convex deploy
   ```

   Or use the script (defaults cloud URL to `https://sb-convex-cloud.fletch.co`):

   ```bash
   CONVEX_SELF_HOSTED_ADMIN_KEY='<key>' npm run deploy:convex
   ```

   This pushes the schema and all functions (including HTTP actions from `convex/http.ts`) to the self-hosted backend. After it succeeds, the **site** URL (e.g. `https://sb-convex-site.fletch.co`) will serve POST `/web/authorize` and other HTTP routes. Open the dashboard at your cloud URL to see tables and functions.

### Separate site and cloud servers (same DB, same INSTANCE_SECRET)

**Yes, it will work** if both servers use the **same database**, the **same INSTANCE_SECRET**, and **shared modules storage**.

- **Deploy only to the cloud URL** — The CLI talks to the cloud server; there is no separate deploy step for the site.
- **Same DB + same INSTANCE_SECRET** — Both backends are the same logical deployment (same identity, same data).
- **Shared modules storage** — Deployed code (including HTTP actions) must be stored somewhere both servers read from. Use **S3** (or your backend’s shared storage) for modules:
  - Set `S3_STORAGE_MODULES_BUCKET` (and AWS credentials / endpoint) to the **same** bucket on **both** cloud and site backends.
  - When you run `npx convex deploy` against the cloud URL, the cloud server writes the new package to that bucket. The site server loads modules from the same bucket, so it will serve the new routes (on next request or after it reloads).
- If you use **local-only** storage for modules (no S3), then deploy only updates the cloud server’s disk; the site server would never see the new code. For separate cloud and site processes, shared modules storage (e.g. S3) is required.

See `fletch-convex/README.md` for backend env (e.g. `S3_STORAGE_MODULES_BUCKET`, `DATABASE_URL`, `INSTANCE_SECRET`).

3. **Development** (optional):

   ```bash
   npx convex dev
   ```

   With `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` set, this runs against your self-hosted instance instead of Convex cloud.

See [Self-Hosting with Convex](https://stack.convex.dev/self-hosted-develop-and-deploy) for more detail.

## Users not syncing after login (self-hosted)

If users land with a valid JWT but the **users** table stays empty, Convex is not getting an identity from the JWT. That means the **self-hosted Convex backend** (the process serving e.g. sb-convex.fletch.co) must validate the same JWT using `convex/auth.config.ts`.

Set these **environment variables on the Convex backend process** (the server that runs your self-hosted Convex, not the inspector app):

| Variable        | Purpose |
|----------------|---------|
| `JWT_ISSUER`   | Must match the JWT `iss` claim (e.g. `https://cognito-idp.us-east-2.amazonaws.com/us-east-2_xxxxx`) |
| `JWT_JWKS_URL` | URL to the JWKS that signs the JWT (e.g. Cognito’s `/.well-known/jwks.json`) |
| or `USER_POOL_ID` + `AWS_REGION` | Alternative: Convex will build the Cognito JWKS URL from these |

Use the same values as your inspector app (e.g. ECS task or `.env`): same Cognito user pool, issuer, and JWKS URL. After the backend has these and is restarted, the client’s JWT will be validated, `getUserIdentity()` will return an identity, and `users:ensureUser` will create/update the **users** row.
