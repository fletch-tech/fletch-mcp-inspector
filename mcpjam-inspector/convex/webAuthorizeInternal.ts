import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * DB lookup for POST /web/authorize. HTTP actions cannot use ctx.db; they call this via runQuery.
 */
export const lookupAuthorizeContext = internalQuery({
  args: {
    serverId: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
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
    let workspace = null as any;
    try {
      workspace = await ctx.db.get(args.workspaceId as Id<"workspaces">);
    } catch {
      return { ok: false as const, reason: "WORKSPACE_NOT_FOUND" as const };
    }
    if (!workspace) {
      return { ok: false as const, reason: "WORKSPACE_NOT_FOUND" as const };
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
