import type { Context, Next } from "hono";
import { ErrorCode } from "../routes/web/errors.js";
import { validateGuestTokenDetailedAsync } from "../services/guest-token.js";
import {
  handleSlackServiceAuth,
  isSlackServiceToken,
} from "./slack-service-auth.js";

/**
 * Reusable Hono middleware that:
 * 1. Requires a Bearer token in the Authorization header (401 if missing).
 * 2. If the token starts with `slk_`, handles it as the Slack bot's service
 *    credential (see slack-service-auth.ts) — allowlisted paths only.
 * 3. If the token starts with `sk_`, rejects (WorkOS API keys disabled in Fletch).
 * 4. Otherwise attempts to validate it as a guest JWT.
 * 5. If valid guest token, sets `c.set("guestId", guestId)`.
 * 6. If not a guest token, assumes Cognito/JWT and passes through.
 */

/** Test-only: retained for test imports that cleared WorkOS rate buckets. */
export function resetWorkOSRateLimitForTests(): void {
  // no-op — WorkOS API key path is disabled in Fletch
}

export async function bearerAuthMiddleware(
  c: Context,
  next: Next,
): Promise<Response | void> {
  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { code: ErrorCode.UNAUTHORIZED, message: "Bearer token required" },
      401,
    );
  }

  const token = authHeader.slice("Bearer ".length);

  // Slack bot service credential. Terminal either way: it authorizes the
  // request (returns null) or answers it (401/429/503). It must never fall
  // through to the WorkOS-key or JWT branches.
  if (isSlackServiceToken(token)) {
    const denied = await handleSlackServiceAuth(c, token);
    if (denied) return denied;
    return next();
  }

  // WorkOS API keys are not supported in Fletch (Cognito/JWT auth only).
  if (token.startsWith("sk_")) {
    return c.json(
      {
        code: ErrorCode.UNAUTHORIZED,
        message:
          "WorkOS API keys are not supported. Use a Cognito/JWT bearer token.",
      },
      401,
    );
  }

  // Try validating as a guest token
  try {
    const result = await validateGuestTokenDetailedAsync(token);
    if (result.valid && result.guestId) {
      if (process.env.MCPJAM_NONPROD_LOCKDOWN === "true") {
        return c.json(
          {
            code: ErrorCode.FORBIDDEN,
            message: "Guest access is disabled in this environment.",
          },
          403,
        );
      }
      c.set("guestId", result.guestId);
      return next();
    }
  } catch {
    // Guest token service not initialized — treat as non-guest token
  }

  // Not a guest token — assume Cognito/JWT, allow through
  return next();
}
