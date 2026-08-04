/**
 * Server configuration constants
 */

// Server port - can be overridden via environment variable
export const SERVER_PORT = process.env.SERVER_PORT
  ? parseInt(process.env.SERVER_PORT, 10)
  : 6274;

// Server hostname
export const SERVER_HOSTNAME =
  process.env.ENVIRONMENT === "dev" ? "localhost" : "127.0.0.1";

// Local server address for tunneling
export const LOCAL_SERVER_ADDR = `http://localhost:${SERVER_PORT}`;

// Hosted mode for cloud deployments (Railway, etc.)
// Uses VITE_ prefix so the same variable works for both server and client build
export const HOSTED_MODE = process.env.VITE_MCPJAM_HOSTED_MODE === "true";

// External auth mode for deployments that rely on JWT handoff via /auth/landing
// (token provided by another application / Cognito partner portal).
export const EXTERNAL_AUTH_MODE =
  process.env.MCPJAM_EXTERNAL_AUTH_MODE === "true" ||
  (process.env.MAIN_URL?.trim().length ?? 0) > 0;

export const NON_PROD_LOCKDOWN = process.env.MCPJAM_NONPROD_LOCKDOWN === "true";

/**
 * Feed model-visible widget→host tool calls (recorded by Interact steps) to the
 * eval model as a per-turn system-prompt addendum, so the model reasons over a
 * widget interaction on its next turn (the headless analogue of Playground's
 * browser-side addToolOutput + auto-continue). Reuses the same server-side
 * mechanism Playground uses for `ui/update-model-context`. OFF by default: it
 * changes what the model sees, so existing eval verdicts shouldn't shift until a
 * suite opts in. App-only (`visibility:["app"]`) calls are never included.
 */
export const EVAL_WIDGET_MODEL_CONTEXT =
  process.env.MCPJAM_EVAL_WIDGET_MODEL_CONTEXT === "true";


export const EMPLOYEE_EMAIL_DOMAINS = (
  process.env.MCPJAM_EMPLOYEE_EMAIL_DOMAINS ?? ""
)
  .split(",")
  .map((domain) => domain.trim().toLowerCase())
  .filter((domain) => domain.length > 0);

export function isAllowedEmployeeEmail(
  email: string | null | undefined
): boolean {
  if (!email || EMPLOYEE_EMAIL_DOMAINS.length === 0) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");
  if (atIndex === -1) {
    return false;
  }

  const emailDomain = normalizedEmail.slice(atIndex + 1);
  return EMPLOYEE_EMAIL_DOMAINS.includes(emailDomain);
}

// Exact origins allowed for hosted web routes and CORS
export const WEB_ALLOWED_ORIGINS = (process.env.WEB_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const CLIENT_PORT = process.env.CLIENT_PORT || "5173";

const DEV_PORTS = [SERVER_PORT, Number(CLIENT_PORT) || 5173, 8080];

const DEFAULT_CORS_ORIGINS: string[] = [];
for (const port of DEV_PORTS) {
  DEFAULT_CORS_ORIGINS.push(`http://localhost:${port}`);
  DEFAULT_CORS_ORIGINS.push(`http://127.0.0.1:${port}`);
  DEFAULT_CORS_ORIGINS.push(`http://local.fletch.co:${port}`);
}
DEFAULT_CORS_ORIGINS.push("http://local.fletch.co");
DEFAULT_CORS_ORIGINS.push("https://staging.mcpjam.com");
DEFAULT_CORS_ORIGINS.push("https://staging.app.mcpjam.com");

/**
 * Parse wildcard domain patterns from env (e.g. "*.fletch.co").
 * Read dynamically so tests can modify the env var.
 */
function getWildcardDomains(): string[] {
  return (process.env.CORS_WILDCARD_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
}

/**
 * Build the exact-match origin allowlist.
 * Supports ALLOWED_ORIGINS env var for full override (legacy),
 * otherwise uses defaults + WEB_ALLOWED_ORIGINS.
 */
function getExactOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  }
  if (HOSTED_MODE && WEB_ALLOWED_ORIGINS.length > 0) {
    return WEB_ALLOWED_ORIGINS;
  }
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...WEB_ALLOWED_ORIGINS]));
}

function matchesWildcardDomain(origin: string): boolean {
  const patterns = getWildcardDomains();
  if (patterns.length === 0) return false;
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return patterns.some((pattern) => {
      if (pattern.startsWith("*.")) {
        const domain = pattern.slice(2);
        return hostname === domain || hostname.endsWith(`.${domain}`);
      }
      return hostname === pattern;
    });
  } catch {
    return false;
  }
}

/**
 * Dynamic CORS origin checker.
 * Returns the origin if allowed, or empty string to deny.
 */
export function corsOriginCheck(origin: string | undefined): string {
  if (!origin) return "";
  if (getExactOrigins().includes(origin)) return origin;
  if (matchesWildcardDomain(origin)) return origin;
  return "";
}

/** Static list for CSP frame-ancestors and other static consumers. */
export const CORS_ORIGINS = Array.from(
  new Set([...DEFAULT_CORS_ORIGINS, ...WEB_ALLOWED_ORIGINS]),
);

// Hosted web route timeouts (ms)
export const WEB_CONNECT_TIMEOUT_MS = 10_000;
export const WEB_CALL_TIMEOUT_MS = 30_000;
export const WEB_STREAM_TIMEOUT_MS = 120_000;

// ── Hosted elicitation (MCP 2025-11-25) ─────────────────────────────────────
// An elicitation blocks a `tools/call` on a HUMAN, so these are human-scale.
// They do not extend how long a *server* may take to respond: the SDK's
// elicitation-aware timeout only stops the clock while an elicitation is
// pending (see `elicitationTimeoutExtensionMs`), so a hung server still dies
// at WEB_STREAM_TIMEOUT_MS of its own activity.

/** How long the user has to answer a form before we resolve `{action:"cancel"}`. */
export const ELICITATION_FORM_TTL_MS = 5 * 60_000;
/** How long the user has to consent to (or decline) opening a URL. */
export const ELICITATION_URL_CONSENT_TTL_MS = 2 * 60_000;
/** Convex rendezvous poll cadence while a tool call is blocked. */
export const ELICITATION_POLL_INTERVAL_MS = 1_000;
/** Jitter added per poll so replicas don't synchronize (scheduled-evals idiom). */
export const ELICITATION_POLL_JITTER_MS = 250;
/** Consecutive poll transport failures tolerated before resolving `cancel`. */
export const ELICITATION_POLL_MAX_FAILURES = 5;
/**
 * Deadline for a single Convex service-route call (poll/ack/cancel). These are
 * tiny reads/writes; anything slower is a stall. Unbounded, a hung Convex would
 * park the poll loop forever — the tool call would outlive its TTL and
 * end-of-stream cleanup would block behind it.
 */
export const ELICITATION_SERVICE_ROUTE_TIMEOUT_MS = 10_000;
/**
 * Total suspended-time budget granted to ONE tool call across all of its
 * sequential elicitations. Slack over the longest single TTL so a form answered
 * at the last second still lands.
 */
export const ELICITATION_TIMEOUT_EXTENSION_MS = ELICITATION_FORM_TTL_MS + 30_000;

// ── Hosted MRTR continuation transport (MCP 2026-07-28 §12.5) ────────────────
//
// A suspended `input_required` operation is durably parked in Convex (PR3a) and
// resumed on a fresh request. Unlike legacy elicitation the worker does NOT
// block, so the TTL can be generous — it bounds how long a human has to answer
// across a whole round before the continuation is expired and scrubbed.
/** How long a suspended MRTR continuation survives awaiting a human answer. */
export const MRTR_CONTINUATION_TTL_MS = 10 * 60_000;
/** Deadline for a single Convex continuation-store call. */
export const MRTR_CONTINUATION_ROUTE_TIMEOUT_MS = 10_000;
/**
 * Lease TTL for a single resume claim; a resume that stalls past this is swept.
 *
 * DERIVED, not a round number: one resume leg can legally spend
 * `claim + submit + mark-wire-started + (finalize | resuspend)` store calls at
 * the full route deadline each, plus one MCP leg at the full call timeout. A
 * flat 60s lease is exactly that worst case, so a slow-but-legal side-effecting
 * resume could lose its lease *after* the wire left and before it could
 * finalize — the store would 409 an operation that actually executed. Keep the
 * headroom term below any time this budget or `WEB_CALL_TIMEOUT_MS` grows.
 *
 * (`heartbeatContinuation` in `utils/mrtr-continuation-state.ts` is the other
 * half of the frozen PR3a contract and stays unused by design: PR3b's leg is
 * bounded by the budget above. A PR5 leg that can outrun this — a long-running
 * task-backed operation — must heartbeat rather than widen this constant.)
 */
export const MRTR_CONTINUATION_LEASE_TTL_MS =
  4 * MRTR_CONTINUATION_ROUTE_TIMEOUT_MS + WEB_CALL_TIMEOUT_MS + 60_000;
/**
 * Hard byte cap on the serialized opaque `resumeState` blob (the encoded
 * `MrtrOperationState`). Oversized state is rejected at the codec, never
 * silently truncated — a truncated blob would deserialize to a corrupt
 * operation and re-drive the wrong request.
 */
export const MRTR_RESUME_STATE_MAX_BYTES = 128 * 1024;
/** Per-field cap for the safe display carried to the browser (message, schema). */
export const MRTR_DISPLAY_FIELD_MAX_BYTES = 16 * 1024;
/** Cap on a single browser-submitted response's serialized content. */
export const MRTR_RESPONSE_CONTENT_MAX_BYTES = 64 * 1024;
/**
 * How long an MRTR route waits for connection teardown before answering the
 * browser anyway. Teardown is cleanup, never the outcome: once a round has been
 * persisted (suspend) or a leg has already gone out (resume), the response must
 * not be held hostage by a transport that is slow to close. Comfortably above
 * the upstream stdio transport's own ~4s close budget, which is the slowest
 * close path any connection here can take.
 */
export const MRTR_TEARDOWN_TIMEOUT_MS = 5_000;

// Hosted app origin the LOCAL inspector server forwards XAA hosted-issuer
// mint requests to (server-to-server; hosted CORS blocks the browser from
// calling it directly). Override for staging. Never derived from a request.
export const MCPJAM_HOSTED_ORIGIN =
  process.env.MCPJAM_HOSTED_ORIGIN?.replace(/\/+$/, "") ||
  "https://app.mcpjam.com";

// Allowed hosts for token delivery in hosted mode (comma-separated)
// These hosts will be allowed to receive session tokens in addition to localhost
export const ALLOWED_HOSTS = process.env.MCPJAM_ALLOWED_HOSTS
  ? process.env.MCPJAM_ALLOWED_HOSTS.split(",").map((h) =>
      h.trim().toLowerCase()
    )
  : [];

// Vanity domains whose root path ("/") should land on the host-compare
// showcase ("Can I use" for MCP hosts). Override via env if more are added.
export const CANIUSE_LANDING_HOSTS = new Set(
  (process.env.CANIUSE_LANDING_HOSTS ?? "caniuse.dev,www.caniuse.dev")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0),
);

// ── Convex (self-hosted or cloud) ────────────────────────────────────────

/** Read Convex HTTP base from env (call when the value may change after startup). */
export function getConvexHttpUrl(): string {
  return (
    process.env.CONVEX_HTTP_URL?.trim() ||
    process.env.CONVEX_SITE_ORIGIN?.trim() ||
    process.env.CONVEX_SELF_HOSTED_URL?.trim() ||
    ""
  );
}

/** Effective Convex HTTP URL for server-side fetches to Convex HTTP actions. */
export const CONVEX_HTTP_URL = getConvexHttpUrl();

/** When using self-hosted Convex, optional admin key for server-to-server auth. */
export const CONVEX_SELF_HOSTED_ADMIN_KEY =
  process.env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim() || "";

/**
 * Headers to send for server-to-server Convex requests when using self-hosted
 * with an admin key.
 */
export function getConvexServerAuthHeaders(): Record<string, string> {
  if (!CONVEX_SELF_HOSTED_ADMIN_KEY) return {};
  return { Authorization: `Bearer ${CONVEX_SELF_HOSTED_ADMIN_KEY}` };
}

/** True when Convex is configured. */
export const HAS_CONVEX = CONVEX_HTTP_URL.length > 0;

/** Same as CONVEX_HTTP_URL; used when CONVEX_URL is not set. */
export const CONVEX_URL = process.env.CONVEX_URL?.trim() || CONVEX_HTTP_URL;
