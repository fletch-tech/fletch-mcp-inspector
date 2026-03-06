# Plan: External JWT Auth (URL token + redirect)

This plan replaces AuthKit with **validation of JWTs issued by another server**. Users have **no password** in this app. The main application passes a **base64-encoded JWT in the URL**; we validate it, authorize the user if valid, and **redirect to the main app (MAIN_URL)** if invalid.

Validation behavior matches the style of `/Users/fletch/Projects/fletch-report-builder/revenue-report/auth.py`: support for JWKS (RS256) or shared secret (HS256), optional audience and expiry checks.

---

## Current state

- **server-utils.ts**: Validates Bearer token with AuthKit JWKS; passes token to `createServer({ authToken })`; anonymous allowed.
- **server.ts**: Uses `authToken` with `ConvexHttpClient.setAuth(authToken)`.
- **convex/auth.config.ts**: Custom JWT provider for AuthKit (issuer + JWKS).
- **Convex**: Identity from JWT; `users` / liked cocktails by `tokenIdentifier`. No passwords.

---

## Goal

- JWT is **issued by another server** (main application), not by sip-cocktails.
- **No passwords** in this app; no credentials table.
- Token is passed as a **base64-encoded JWT in the URL** (e.g. `?token=<base64(jwt)>`) when the user lands from the main app.
- **On landing**: validate token → if valid, treat user as authorized; if invalid, **redirect to main app** (`MAIN_URL`).
- Validation logic similar to the Python auth: JWKS (RS256) or `JWT_SECRET` (HS256), optional `aud`, `exp`.

---

## Flow (high level)

1. User is sent from the main app to sip-cocktails with a URL that includes the token, e.g.  
   `https://sip-cocktails.../entry?token=<base64(jwt)>`  
   or similar (exact path and query param name are configurable).

2. **Landing handler** (new route, e.g. `GET /auth/landing` or `GET /` when no session):
   - Read `token` from query (or configurable param).
   - Decode base64 → raw JWT string.
   - Validate JWT (see “Validation” below).
   - **If valid**: establish auth (e.g. set HTTP-only cookie with the raw JWT, or set session that stores the JWT). Redirect to the app root (or MCP client URL) **without** the token in the URL (to avoid leaking it in history/logs).
   - **If invalid**: redirect to `MAIN_URL` (main application). Optionally append return path, e.g. `MAIN_URL?return=<current-url>`.

3. **MCP and Convex**: Subsequent requests send the JWT (e.g. via cookie or `Authorization: Bearer`). server-utils validates the same JWT; server passes it to Convex via `setAuth`. Convex auth.config trusts the **same issuer** as the main app (see “Convex” below).

---

## Validation (auth.py-style)

Implement a single validation path that supports:

1. **JWKS (RS256 / RS384 / RS512)**  
   - Env: `JWT_JWKS_URL` (e.g. main app’s `https://main-app.com/.well-known/jwks.json` or a Cognito-style URL).  
   - Read token header for `kid`; fetch JWKS; find key by `kid`; verify signature and then claims.  
   - Same idea as Python `verify_access_token` (Cognito) or DB-backed `public_key` in `validate_jwt`.

2. **Shared secret (HS256)**  
   - Env: `JWT_SECRET`.  
   - If no JWKS or no matching key, use `JWT_SECRET` and algorithms `['HS256']`.  
   - Same as Python fallback in `validate_jwt`.

3. **Claims**  
   - `exp`: required (reject if expired).  
   - `aud`: optional; if `JWT_AUDIENCE` (or similar) is set, verify `aud` matches.  
   - `iss`: optional to verify; if `JWT_ISSUER` is set, verify `iss` matches (needed for Convex anyway).

4. **Input**  
   - Accept raw JWT string.  
   - If the value from the URL is base64-encoded (decode once to get the raw JWT), decode before validation.

No DB-backed key table is required unless you want to mirror the Python DB option later; for this plan, env-based JWKS URL and/or JWT_SECRET are enough.

---

## Convex: accept the main app’s JWT

Convex must accept the **same** JWT the main app issues so that `ctx.auth.getUserIdentity()` works and `tokenIdentifier` is stable.

- **If the main app uses RS256 and exposes JWKS**  
  - In `convex/auth.config.ts`, configure a **Custom JWT** provider with:
    - `issuer`: main app’s issuer (e.g. `JWT_ISSUER` or derived from main app URL).
    - `jwks`: main app’s JWKS URL (e.g. `JWT_JWKS_URL`) or the same base as the validation server.
    - `algorithm`: `"RS256"` (or match main app).
  - Convex will validate the token and derive `tokenIdentifier` from `iss` + `sub`. No change to `users` / `getCurrentUser` / `syncCurrent` logic.

- **If the main app uses HS256 (JWT_SECRET)**  
  - Convex Custom JWT currently supports only **RS256 and ES256**. So you have two options:
    1. **Token exchange**: In sip-cocktails, after validating the main app’s HS256 JWT, **issue a new RS256 JWT** with the same claims (`sub`, `iss`, `exp`, and any custom claims like name/email). Convex then trusts **sip-cocktails** as the issuer (sip-cocktails’ own JWKS or key). Cookie/session holds either the original token (and you re-issue for Convex on each request) or the derived RS256 token.
    2. **Main app uses RS256**: Prefer having the main app issue RS256 and expose JWKS so both validation and Convex use the same token with no exchange.

---

## Environment variables

| Variable       | Where used           | Purpose |
|----------------|----------------------|--------|
| MAIN_URL       | server (landing)      | Redirect when token is missing or invalid. |
| JWT_JWKS_URL   | server, Convex*      | JWKS URL for RS256 validation (and Convex if same issuer). |
| JWT_ISSUER     | server, Convex       | Expected `iss` claim; Convex provider issuer. |
| JWT_SECRET     | server (optional)    | Fallback for HS256 if no JWKS / no kid match. |
| JWT_AUDIENCE   | server (optional)    | If set, verify JWT `aud` claim. |

\* Convex may use the same JWKS URL or a data URI built from the same keys, depending on how the main app is set up.

---

## Implementation pieces

### 1. Shared JWT validation (Node/TypeScript)

- **File**: e.g. `server-utils.ts` or `auth/jwt.ts`.
- **Function**: `validateJwt(rawToken: string): { valid: boolean; claims?: object; error?: string }`.
  - Decode header; get `kid` and `alg`.
  - If `JWT_JWKS_URL` is set: fetch JWKS (with simple in-memory cache if desired), find key by `kid`, verify with RS256/RS384/RS512.
  - Else if `JWT_SECRET` is set: verify with HS256.
  - Check `exp`, optionally `iss` and `aud`.
  - Return claims (e.g. `sub`, `email`, `name`) for use when setting Convex auth and building profile.

Use the same function for: (a) landing route (token from URL), (b) MCP middleware (token from cookie or Bearer).

### 2. Landing route (token in URL → cookie/session, or redirect)

- **Route**: e.g. `GET /auth/landing` or `GET /` (when no auth cookie).
- **Query param**: e.g. `token` (configurable).
- **Behavior**:
  1. Read `token` from query.
  2. If missing: redirect to `MAIN_URL` (optional: add `?return=<current-path>`).
  3. Decode base64 → `rawJwt` (if the param is base64-encoded; if it’s already the raw JWT, skip decode).
  4. Call `validateJwt(rawJwt)`.
  5. If invalid: redirect to `MAIN_URL`.
  6. If valid: set HTTP-only cookie (e.g. `auth_token=<rawJwt>`, secure, sameSite, maxAge from `exp - now`) and redirect to app root **without** the token in the URL (e.g. redirect to `/` or `/app`).
- **MAIN_URL**: must be set in env; no default so misconfiguration is obvious.

### 3. Reading token on MCP requests

- **Sources**: (1) Cookie (e.g. `auth_token`), (2) `Authorization: Bearer <token>`.
- **Middleware** (replace current AuthKit middleware):
  - If cookie present, use it as the JWT; else use Bearer.
  - Run the same `validateJwt`; if valid, pass token to `createServer({ authToken })`; if invalid and not allowAnonymous, 401 or redirect to MAIN_URL (for browser requests, redirect is better; for programmatic MCP, 401 + WWW-Authenticate).
- Keep **allowAnonymous** if you want unauthenticated access for some paths; for landing, unauthenticated users are redirected to MAIN_URL.

### 4. Convex auth.config.ts

- Remove AuthKit provider.
- Add Custom JWT provider for the **main app’s** issuer and JWKS (or, if using token exchange, for sip-cocktails’ own issuer and sip-cocktails’ JWKS).
- Set issuer (and optional applicationID) from env so the same JWT that passed validation is accepted by Convex.

### 5. server-utils.ts

- Remove AuthKit: no `AUTHKIT_DOMAIN`, no AuthKit JWKS or discovery.
- Require `MAIN_URL` for the landing route.
- Use the new JWT validation and landing route as above.
- Optional: keep `/.well-known/oauth-protected-resource` pointing at MAIN_URL or a generic description so clients know where to obtain a token (main app).

---

## Base64 handling

- The main app will send the JWT in the URL as **base64-encoded** to avoid issues with special characters.
- In the landing handler: `tokenParam = req.query.token` → decode with `Buffer.from(tokenParam, 'base64').toString('utf8')` (or equivalent) → validate the resulting string as the raw JWT.
- If the main app sends the **raw** JWT in the query (three base64url segments), then no decode step; only validate. The plan assumes one layer of base64 encoding of the whole JWT.

---

## Implementation order (suggested)

1. **JWT validation module**  
   Implement `validateJwt` with JWKS and JWT_SECRET, exp/iss/aud checks, and unit tests (e.g. with a test JWT from the main app or a test key).

2. **Landing route**  
   Add `GET /auth/landing?token=<base64(jwt)>` (or chosen path/param). Decode base64 → validate → set cookie and redirect to app root, or redirect to MAIN_URL on failure. Set MAIN_URL in env.

3. **server-utils**  
   Replace AuthKit middleware with one that: reads token from cookie or Bearer, calls `validateJwt`, passes token to `createServer` on success; on failure, redirect to MAIN_URL (browser) or 401 (programmatic). Remove AUTHKIT_DOMAIN.

4. **Convex auth.config**  
   Switch to Custom JWT for main app issuer + JWKS (or sip-cocktails issuer if using token exchange). Deploy and verify `getUserIdentity()` and `syncCurrent` still work with a token from the main app.

5. **Client / main app**  
   Main app redirects users to sip-cocktails with `?token=<base64(jwt)>`. MCP client (e.g. inspector) either uses the same cookie after landing or sends the token as Bearer if it gets the token from the main app via another channel.

6. **Cleanup**  
   Remove AuthKit references and document MAIN_URL, JWT_JWKS_URL, JWT_ISSUER, JWT_SECRET, JWT_AUDIENCE in a README or .env.example.

---

## Summary

| Item              | Detail |
|-------------------|--------|
| Who issues JWT    | Another server (main application). |
| Passwords         | None in this app. |
| Token delivery    | Base64-encoded JWT in URL query (e.g. `?token=...`) when user lands from main app. |
| Validation        | JWKS (RS256) and/or JWT_SECRET (HS256); exp (and optional aud/iss); same style as auth.py. |
| If valid          | Set cookie (or session), redirect to app without token in URL; use token for MCP and Convex. |
| If invalid        | Redirect to MAIN_URL. |
| Convex            | Custom JWT provider for main app’s issuer + JWKS (or token exchange if main app uses HS256). |
| Env               | MAIN_URL (required), JWT_JWKS_URL, JWT_ISSUER, JWT_SECRET (optional), JWT_AUDIENCE (optional). |

This keeps validation semantics aligned with the Python auth (JWKS + secret fallback, aud/exp) and satisfies “validate token from URL → authorize or redirect to main app.”
