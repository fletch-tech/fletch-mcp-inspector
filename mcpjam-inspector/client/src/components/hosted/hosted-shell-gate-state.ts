import type { HostedShellGateState } from "./HostedShellGate";

interface ResolveHostedShellGateStateOptions {
  hostedMode: boolean;
  isConvexAuthLoading: boolean;
  isConvexAuthenticated: boolean;
  isAuthProviderLoading: boolean;
  hasAuthUser: boolean;
  isLoadingRemoteWorkspaces: boolean;
}

export function resolveHostedShellGateState({
  hostedMode,
  isConvexAuthLoading,
  isConvexAuthenticated,
  isAuthProviderLoading,
  hasAuthUser,
  isLoadingRemoteWorkspaces,
}: ResolveHostedShellGateStateOptions): HostedShellGateState {
  if (!hostedMode) {
    return "ready";
  }

  // Only treat as loading while a provider is still resolving. Do not keep
  // spinning when Convex has settled on "not authenticated" while the JWT
  // layer still shows a user — that is a terminal mismatch (e.g. token churn
  // or re-login with a new token), not "still checking".
  if (isAuthProviderLoading || isConvexAuthLoading) {
    return "auth-loading";
  }

  if (!hasAuthUser || !isConvexAuthenticated) {
    return "logged-out";
  }

  if (isLoadingRemoteWorkspaces) {
    return "workspace-loading";
  }

  return "ready";
}
