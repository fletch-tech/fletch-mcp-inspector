import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";

async function currentUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q: any) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

async function requireProjectMembership(
  ctx: { auth: any; db: any },
  projectId: string,
) {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  const wsId = projectId as Id<"workspaces">;
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", wsId).eq("userId", user._id),
    )
    .unique();
  if (!membership) throw new Error("Not a project member");
  return { user, membership };
}

function mapServerRow(server: any) {
  return {
    ...server,
    projectId: server.workspaceId,
  };
}

const serverFieldsValidator = {
  name: v.string(),
  enabled: v.optional(v.boolean()),
  transportType: v.optional(v.union(v.literal("stdio"), v.literal("http"))),
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  env: v.optional(v.any()),
  url: v.optional(v.string()),
  headers: v.optional(v.any()),
  timeout: v.optional(v.number()),
  clientCapabilities: v.optional(v.any()),
  useOAuth: v.optional(v.boolean()),
  oauthScopes: v.optional(v.array(v.string())),
  clientId: v.optional(v.string()),
  oauthProtocolMode: v.optional(v.string()),
  oauthProtocolVersion: v.optional(v.string()),
  oauthRegistrationStrategy: v.optional(v.string()),
  oauthResourceUrl: v.optional(v.string()),
  hasClientSecret: v.optional(v.boolean()),
  hasEnv: v.optional(v.boolean()),
  hasHeaders: v.optional(v.boolean()),
  hasBearerToken: v.optional(v.boolean()),
  clientSecret: v.optional(v.string()),
  clearClientSecret: v.optional(v.boolean()),
  clearXaaConfig: v.optional(v.boolean()),
  xaaAuthzIssuer: v.optional(v.string()),
  xaaAllowPathScopedIssuer: v.optional(v.boolean()),
  oauthAllowPathScopedIssuer: v.optional(v.boolean()),
  useXaa: v.optional(v.boolean()),
  authServerMode: v.optional(v.string()),
  xaaSubject: v.optional(v.string()),
  xaaEmail: v.optional(v.string()),
  xaaIdentityAssertionFormat: v.optional(v.string()),
  xaaClientAuth: v.optional(v.string()),
  registrationMode: v.optional(v.string()),
  authMethod: v.optional(v.string()),
};

function pickPersistedServerFields(args: Record<string, any>) {
  return {
    name: args.name,
    enabled: args.enabled ?? true,
    transportType: args.transportType ?? (args.command ? "stdio" : "http"),
    command: args.command,
    args: args.args,
    url: args.url,
    headers:
      args.headers && typeof args.headers === "object"
        ? Object.fromEntries(
            Object.entries(args.headers).map(([k, val]) => [k, String(val)]),
          )
        : undefined,
    timeout: args.timeout,
    useOAuth: args.useOAuth,
    oauthScopes: args.oauthScopes,
    clientId: args.clientId,
  };
}

const serverConfigValidator = v.object({
  enabled: v.optional(v.boolean()),
  transportType: v.optional(v.union(v.literal("stdio"), v.literal("http"))),
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  url: v.optional(v.string()),
  headers: v.optional(v.record(v.string(), v.string())),
  timeout: v.optional(v.number()),
  useOAuth: v.optional(v.boolean()),
  oauthScopes: v.optional(v.array(v.string())),
  clientId: v.optional(v.string()),
});

/** Legacy workspace-shaped create (kept for older callers). */
export const createServer = mutation({
  args: {
    workspaceId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    name: v.string(),
    config: v.optional(serverConfigValidator),
    enabled: v.optional(v.boolean()),
    transportType: v.optional(v.union(v.literal("stdio"), v.literal("http"))),
  },
  handler: async (ctx, args) => {
    const projectId = args.projectId ?? args.workspaceId;
    if (!projectId) throw new Error("projectId is required");
    await requireProjectMembership(ctx, projectId);

    const now = Date.now();
    const config = args.config ?? {};
    const serverId = await ctx.db.insert("servers", {
      workspaceId: projectId,
      name: args.name,
      enabled: args.enabled ?? config.enabled ?? true,
      transportType: args.transportType ?? config.transportType ?? "http",
      command: config.command,
      args: config.args,
      url: config.url,
      headers: config.headers,
      timeout: config.timeout,
      useOAuth: config.useOAuth,
      oauthScopes: config.oauthScopes,
      clientId: config.clientId,
      createdAt: now,
      updatedAt: now,
    });
    return serverId;
  },
});

export const createServerIfMissing = mutation({
  args: {
    projectId: v.string(),
    ...serverFieldsValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectMembership(ctx, args.projectId);

    const existing = await ctx.db
      .query("servers")
      .withIndex("by_workspace_name", (q: any) =>
        q.eq("workspaceId", args.projectId).eq("name", args.name),
      )
      .unique();
    if (existing) return existing._id;

    const now = Date.now();
    const fields = pickPersistedServerFields(args);
    return await ctx.db.insert("servers", {
      workspaceId: args.projectId,
      ...fields,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateServer = mutation({
  args: {
    serverId: v.string(),
    ...serverFieldsValidator,
  },
  handler: async (ctx, args) => {
    const serverId = args.serverId as Id<"servers">;
    const existing = await ctx.db.get(serverId);
    if (!existing) throw new Error("Server not found");
    await requireProjectMembership(ctx, existing.workspaceId);

    const fields = pickPersistedServerFields(args);
    await ctx.db.patch(serverId, {
      ...fields,
      updatedAt: Date.now(),
    });
  },
});

export const deleteServer = mutation({
  args: { serverId: v.string() },
  handler: async (ctx, args) => {
    const serverId = args.serverId as Id<"servers">;
    const existing = await ctx.db.get(serverId);
    if (!existing) return;
    await requireProjectMembership(ctx, existing.workspaceId);
    await ctx.db.delete(serverId);
  },
});

export const getWorkspaceServers = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return [];

    const wsId = args.workspaceId as Id<"workspaces">;
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q.eq("workspaceId", wsId).eq("userId", user._id),
      )
      .unique();
    if (!membership) return [];

    const rows = await ctx.db
      .query("servers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return rows.map(mapServerRow);
  },
});

export const getProjectServers = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return [];

    const wsId = args.projectId as Id<"workspaces">;
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q.eq("workspaceId", wsId).eq("userId", user._id),
      )
      .unique();
    if (!membership) return [];

    const rows = await ctx.db
      .query("servers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.projectId))
      .collect();
    return rows.map(mapServerRow);
  },
});

export const listForProjects = query({
  args: { projectIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return {};

    const result: Record<string, any[]> = {};
    for (const projectId of args.projectIds.slice(0, 500)) {
      const wsId = projectId as Id<"workspaces">;
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q: any) =>
          q.eq("workspaceId", wsId).eq("userId", user._id),
        )
        .unique();
      if (!membership) {
        result[projectId] = [];
        continue;
      }
      const rows = await ctx.db
        .query("servers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", projectId))
        .collect();
      result[projectId] = rows.map(mapServerRow);
    }
    return result;
  },
});

/**
 * Secret-bearing creates go through an action in upstream. Locally we persist
 * non-secret fields only; client secrets are not stored in this fork's schema.
 */
export const createServerWithClientSecret = action({
  args: {
    projectId: v.string(),
    ...serverFieldsValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const { clientSecret: _secret, clearClientSecret: _clear, ...rest } = args;
    const id = await ctx.runMutation(api.servers.createServerIfMissing, rest);
    return id as string;
  },
});

export const updateServerWithClientSecret = action({
  args: {
    serverId: v.string(),
    ...serverFieldsValidator,
  },
  handler: async (ctx, args): Promise<void> => {
    const { clientSecret: _secret, clearClientSecret: _clear, ...rest } = args;
    await ctx.runMutation(api.servers.updateServer, rest);
  },
});

export const moveServerToProject = action({
  args: {
    serverId: v.string(),
    projectId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runMutation(api.servers.moveServerToProjectMutation, args);
  },
});

export const moveServerToProjectMutation = mutation({
  args: {
    serverId: v.string(),
    projectId: v.string(),
  },
  handler: async (ctx, args) => {
    const serverId = args.serverId as Id<"servers">;
    const existing = await ctx.db.get(serverId);
    if (!existing) throw new Error("Server not found");
    await requireProjectMembership(ctx, existing.workspaceId);
    await requireProjectMembership(ctx, args.projectId);
    await ctx.db.patch(serverId, {
      workspaceId: args.projectId,
      updatedAt: Date.now(),
    });
  },
});
