import { useEffect, useRef } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { useAuth } from "@/lib/auth/jwt-auth-context";
import * as Sentry from "@sentry/react";

/**
 * Ensure the authenticated user has a row in Convex `users`.
 * - Runs only after Convex auth is established
 * - Idempotent and re-runs when the authenticated user changes
 */
export function useEnsureDbUser() {
  const { user } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation("users:ensureUser" as any);
  const lastEnsuredUserIdRef = useRef<string | null>(null);

  // Reset cache on logout so we re-run for the next login in the same session
  useEffect(() => {
    if (!isAuthenticated) {
      lastEnsuredUserIdRef.current = null;
      Sentry.setUser(null); // Clear Sentry user on logout
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isLoading) return;
    // Auth provider hydration can briefly lead Convex auth. Wait for
    // isAuthenticated before proceeding.
    if (!isAuthenticated) return;
    if (!user) return;

    // Only (re)ensure when the authenticated user changes.
    if (lastEnsuredUserIdRef.current === user.id) return;

    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ");
    ensureUser({
      email: user.email || undefined,
      name: fullName || undefined,
    })
      .then((id: string | null) => {
        lastEnsuredUserIdRef.current = user.id;
        Sentry.setUser({ id: user.id });
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[auth] ensureUser failed", err);
        // allow retry next effect pass
        lastEnsuredUserIdRef.current = null;
      });
  }, [isAuthenticated, isLoading, user, ensureUser]);
}
