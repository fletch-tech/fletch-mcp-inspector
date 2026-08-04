/**
 * WorkOS client stub for Fletch.
 * WorkOS AuthKit / API keys are not used; Cognito JWT handoff is the auth path.
 * Callers that still reference getWorkOSClient will get a clear error.
 */

export function getWorkOSClient(): never {
  throw new Error(
    "WorkOS is disabled in Fletch MCP Studio. Use Cognito/JWT auth via /auth/landing.",
  );
}

/** Test-only: reset the memoized client (no-op stub). */
export function resetWorkOSClientForTests(): void {
  // no-op
}
