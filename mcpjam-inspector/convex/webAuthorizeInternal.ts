import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * DB lookup for POST /web/authorize. HTTP actions cannot use ctx.db; they call this via runQuery.
 * Verifies: user exists, workspace exists, user is a member, server belongs to workspace.
 */
export const lookupAuthorizeContext = internalQuery({
  args: {
    serverId: v.string(),
    workspaceId: v.string(),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    // Resolve the authenticated user
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q: any) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();

    if (!user) {
      return { ok: false as const, reason: "USER_NOT_FOUND" as const };
    }

    // Verify workspace exists
    let workspace = null as any;
    try {
      workspace = await ctx.db.get(args.workspaceId as Id<"workspaces">);
    } catch {
      return { ok: false as const, reason: "WORKSPACE_NOT_FOUND" as const };
    }
    if (!workspace) {
      return { ok: false as const, reason: "WORKSPACE_NOT_FOUND" as const };
    }

    // Verify user is a member of this workspace
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q
          .eq("workspaceId", args.workspaceId as Id<"workspaces">)
          .eq("userId", user._id),
      )
      .unique();

    if (!membership) {
      return {
        ok: false as const,
        reason: "NOT_A_MEMBER" as const,
      };
    }

    // Verify server exists and belongs to this workspace
    let server = null as any;
    try {
      server = await ctx.db.get(args.serverId as Id<"servers">);
    } catch {
      return {
        ok: false as const,
        reason: "SERVER_NOT_FOUND_OR_MISMATCH" as const,
      };
    }
    if (!server || server.workspaceId !== args.workspaceId) {
      return {
        ok: false as const,
        reason: "SERVER_NOT_FOUND_OR_MISMATCH" as const,
      };
    }

    return {
      ok: true as const,
      serverConfig: {
        transportType: server.transportType,
        url: server.url,
        headers: server.headers ?? undefined,
        useOAuth: server.useOAuth ?? undefined,
      },
    };
  },
});
