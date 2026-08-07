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
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q: any) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();

    if (!user) {
      return { ok: false as const, reason: "USER_NOT_FOUND" as const };
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
      role: membership.isOwner
        ? ("owner" as const)
        : membership.role === "admin"
          ? ("admin" as const)
          : ("member" as const),
      organizationId: workspace.organizationId
        ? String(workspace.organizationId)
        : null,
      serverConfig: toLocalServerConfig(server),
    };
  },
});

function toLocalServerConfig(server: any) {
  if (server.transportType === "stdio") {
    return {
      transportType: "stdio" as const,
      command: server.command ?? "",
      args: Array.isArray(server.args) ? server.args : [],
      env: {},
      timeout: server.timeout,
    };
  }
  return {
    transportType: "http" as const,
    url: server.url ?? "",
    headers: (server.headers ?? {}) as Record<string, string>,
    timeout: server.timeout,
    useOAuth: server.useOAuth ?? undefined,
    oauthScopes: server.oauthScopes ?? undefined,
    clientId: server.clientId ?? undefined,
  };
}

/**
 * Batch lookup for POST /web/authorize-batch-local (inspector local connect).
 * Body: { projectId, serverIds[] } — projectId is the workspaces document id.
 */
export const lookupAuthorizeBatchLocal = internalQuery({
  args: {
    projectId: v.string(),
    serverIds: v.array(v.string()),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q: any) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();

    if (!user) {
      return { ok: false as const, reason: "USER_NOT_FOUND" as const };
    }

    let workspace = null as any;
    try {
      workspace = await ctx.db.get(args.projectId as Id<"workspaces">);
    } catch {
      return { ok: false as const, reason: "WORKSPACE_NOT_FOUND" as const };
    }
    if (!workspace) {
      return { ok: false as const, reason: "WORKSPACE_NOT_FOUND" as const };
    }

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q
          .eq("workspaceId", args.projectId as Id<"workspaces">)
          .eq("userId", user._id),
      )
      .unique();

    if (!membership) {
      return { ok: false as const, reason: "NOT_A_MEMBER" as const };
    }

    const results: Record<string, any> = {};
    for (const serverId of args.serverIds) {
      let server = null as any;
      try {
        server = await ctx.db.get(serverId as Id<"servers">);
      } catch {
        results[serverId] = {
          ok: false,
          status: 404,
          code: "NOT_FOUND",
          message: "Server not found",
        };
        continue;
      }
      if (!server || server.workspaceId !== args.projectId) {
        results[serverId] = {
          ok: false,
          status: 404,
          code: "NOT_FOUND",
          message: "Server not found or does not belong to this project",
        };
        continue;
      }

      results[serverId] = {
        ok: true,
        role: membership.isOwner
          ? "owner"
          : membership.role === "admin"
            ? "admin"
            : "member",
        accessLevel: "project_member",
        permissions: { chatOnly: false },
        serverConfig: toLocalServerConfig(server),
        oauthAccessToken: null,
      };
    }

    return {
      ok: true as const,
      organizationId: workspace.organizationId
        ? String(workspace.organizationId)
        : null,
      results,
    };
  },
});
