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

// Exact origins allowed for hosted web routes and CORS
export const WEB_ALLOWED_ORIGINS = (process.env.WEB_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const DEV_PORTS = [SERVER_PORT, 5173, 8080];

const DEFAULT_CORS_ORIGINS: string[] = [];
for (const port of DEV_PORTS) {
  DEFAULT_CORS_ORIGINS.push(`http://localhost:${port}`);
  DEFAULT_CORS_ORIGINS.push(`http://127.0.0.1:${port}`);
  DEFAULT_CORS_ORIGINS.push(`http://local.fletch.co:${port}`);
}
DEFAULT_CORS_ORIGINS.push("http://local.fletch.co");
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
 * Read dynamically so tests can modify env vars.
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

/**
 * Check whether an origin matches one of the wildcard domain patterns.
 * Pattern "*.fletch.co" matches "https://app.fletch.co", "http://local.fletch.co:3000", etc.
 */
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

// Allowed hosts for token delivery in hosted mode (comma-separated)
// These hosts will be allowed to receive session tokens in addition to localhost
export const ALLOWED_HOSTS = process.env.MCPJAM_ALLOWED_HOSTS
  ? process.env.MCPJAM_ALLOWED_HOSTS.split(",").map((h) =>
      h.trim().toLowerCase(),
    )
  : [];

// ── Convex (self-hosted or cloud) ────────────────────────────────────────

/** Effective Convex HTTP URL used for server-side fetches to Convex HTTP actions (e.g. /web/authorize). */
export const CONVEX_HTTP_URL =
  process.env.CONVEX_HTTP_URL?.trim() ||
  process.env.CONVEX_SITE_ORIGIN?.trim() ||
  process.env.CONVEX_SELF_HOSTED_URL?.trim() ||
  "";

/** When using self-hosted Convex, optional admin key for server-to-server auth (Bearer). */
export const CONVEX_SELF_HOSTED_ADMIN_KEY =
  process.env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim() || "";

/**
 * Headers to send for server-to-server Convex requests when using self-hosted with an admin key.
 * Merge with request headers; omit when not self-hosted or no admin key.
 */
export function getConvexServerAuthHeaders(): Record<string, string> {
  if (!CONVEX_SELF_HOSTED_ADMIN_KEY) return {};
  return { Authorization: `Bearer ${CONVEX_SELF_HOSTED_ADMIN_KEY}` };
}

/** True when Convex is configured (either CONVEX_HTTP_URL or CONVEX_SELF_HOSTED_URL). */
export const HAS_CONVEX = CONVEX_HTTP_URL.length > 0;

/** Same as CONVEX_HTTP_URL; used by ConvexHttpClient (evals) when CONVEX_URL is not set. */
export const CONVEX_URL = process.env.CONVEX_URL?.trim() || CONVEX_HTTP_URL;
