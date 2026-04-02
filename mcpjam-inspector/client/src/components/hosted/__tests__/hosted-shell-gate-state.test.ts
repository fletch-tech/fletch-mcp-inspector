import { describe, expect, it } from "vitest";
import { resolveHostedShellGateState } from "../hosted-shell-gate-state";

describe("resolveHostedShellGateState", () => {
  it("returns ready in local mode", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: false,
        isConvexAuthLoading: false,
        isConvexAuthenticated: false,
        isAuthProviderLoading: false,
        hasAuthUser: false,
        isLoadingRemoteWorkspaces: false,
      }),
    ).toBe("ready");
  });

  it("returns auth-loading while auth provider is still loading", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: true,
        isConvexAuthLoading: false,
        isConvexAuthenticated: false,
        isAuthProviderLoading: true,
        hasAuthUser: false,
        isLoadingRemoteWorkspaces: false,
      }),
    ).toBe("auth-loading");
  });

  it("returns auth-loading when JWT user exists but Convex auth is still loading", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: true,
        isConvexAuthLoading: true,
        isConvexAuthenticated: false,
        isAuthProviderLoading: false,
        hasAuthUser: true,
        isLoadingRemoteWorkspaces: false,
      }),
    ).toBe("auth-loading");
  });

  it("returns logged-out when JWT user exists but Convex has finished without auth", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: true,
        isConvexAuthLoading: false,
        isConvexAuthenticated: false,
        isAuthProviderLoading: false,
        hasAuthUser: true,
        isLoadingRemoteWorkspaces: false,
      }),
    ).toBe("logged-out");
  });

  it("returns logged-out only when neither auth source is authenticated", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: true,
        isConvexAuthLoading: false,
        isConvexAuthenticated: false,
        isAuthProviderLoading: false,
        hasAuthUser: false,
        isLoadingRemoteWorkspaces: false,
      }),
    ).toBe("logged-out");
  });

  it("returns workspace-loading when auth is ready but workspace data is pending", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: true,
        isConvexAuthLoading: false,
        isConvexAuthenticated: true,
        isAuthProviderLoading: false,
        hasAuthUser: true,
        isLoadingRemoteWorkspaces: true,
      }),
    ).toBe("workspace-loading");
  });

  it("returns ready when hosted auth and workspace are fully ready", () => {
    expect(
      resolveHostedShellGateState({
        hostedMode: true,
        isConvexAuthLoading: false,
        isConvexAuthenticated: true,
        isAuthProviderLoading: false,
        hasAuthUser: true,
        isLoadingRemoteWorkspaces: false,
      }),
    ).toBe("ready");
  });
});
