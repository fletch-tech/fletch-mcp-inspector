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

  const isAuthSettling =
    isAuthProviderLoading ||
    isConvexAuthLoading ||
    (hasAuthUser && !isConvexAuthenticated);
  if (isAuthSettling) {
    return "auth-loading";
  }

  if (!hasAuthUser && !isConvexAuthenticated) {
    return "logged-out";
  }

  if (isLoadingRemoteWorkspaces) {
    return "workspace-loading";
  }

  return "ready";
}
