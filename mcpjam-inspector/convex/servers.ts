import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

export const createServer = mutation({
  args: {
    workspaceId: v.string(),
    name: v.string(),
    config: v.optional(serverConfigValidator),
    enabled: v.optional(v.boolean()),
    transportType: v.optional(v.union(v.literal("stdio"), v.literal("http"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const config = args.config ?? {};
    const serverId = await ctx.db.insert("servers", {
      workspaceId: args.workspaceId,
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

const updateArgsValidator = v.object({
  serverId: v.id("servers"),
  name: v.string(),
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

export const updateServer = mutation({
  args: updateArgsValidator,
  handler: async (ctx, args) => {
    const { serverId, name, ...rest } = args;
    const existing = await ctx.db.get(serverId);
    if (!existing) throw new Error("Server not found");
    const now = Date.now();
    await ctx.db.patch(serverId, {
      name,
      ...rest,
      updatedAt: now,
    });
  },
});

export const deleteServer = mutation({
  args: { serverId: v.id("servers") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.serverId);
  },
});

export const getWorkspaceServers = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("servers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});
