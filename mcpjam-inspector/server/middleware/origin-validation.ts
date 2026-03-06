/**
 * Origin Validation Middleware
 *
 * Blocks requests from non-localhost origins to prevent:
 * - DNS rebinding attacks
 * - CSRF attacks from malicious websites
 *
 * This is defense-in-depth alongside session token auth.
 */

import type { Context, Next } from "hono";
import { corsOriginCheck } from "../config.js";
import { logger as appLogger } from "../utils/logger.js";

/**
 * Origin validation middleware.
 * Blocks requests from origins not in the CORS allowlist.
 * Supports exact matches and wildcard domain patterns (e.g. *.fletch.co).
 */
export async function originValidationMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  if (c.req.method === "OPTIONS") {
    return next();
  }

  const origin = c.req.header("Origin");

  // No origin header = same-origin request or non-browser client (curl, etc.)
  if (!origin) {
    return next();
  }

  if (!corsOriginCheck(origin)) {
    appLogger.warn(`[Security] Blocked request from origin: ${origin}`);
    return c.json(
      {
        error: "Forbidden",
        message: "Request origin not allowed.",
      },
      403,
    );
  }

  return next();
}
