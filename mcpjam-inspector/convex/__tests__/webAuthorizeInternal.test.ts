import { describe, expect, it } from "vitest";
import { createMockCtx } from "./mocks/mock_ctx";
import { lookupAuthorizeContext } from "../webAuthorizeInternal";

describe("convex/webAuthorizeInternal.lookupAuthorizeContext", () => {
  it("returns mismatch when server id lookup throws", async () => {
    const ctx = createMockCtx(null);
    const originalGet = ctx.db.get;
    ctx.db.get = async (id: string) => {
      if (id === "bad-server-id") {
        throw new Error("invalid id");
      }
      return originalGet(id);
    };

    const result = await (lookupAuthorizeContext as any).handler(ctx, {
      serverId: "bad-server-id",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({
      ok: false,
      reason: "SERVER_NOT_FOUND_OR_MISMATCH",
    });
  });

  it("returns workspace not found when workspace id lookup throws", async () => {
    const ctx = createMockCtx(null);
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "W1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const serverId = await ctx.db.insert("servers", {
      workspaceId,
      name: "S1",
      enabled: true,
      transportType: "http",
      url: "https://example.com/mcp",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const originalGet = ctx.db.get;
    ctx.db.get = async (id: string) => {
      if (id === workspaceId) {
        throw new Error("invalid id");
      }
      return originalGet(id);
    };

    const result = await (lookupAuthorizeContext as any).handler(ctx, {
      serverId,
      workspaceId,
    });

    expect(result).toEqual({
      ok: false,
      reason: "WORKSPACE_NOT_FOUND",
    });
  });
});
