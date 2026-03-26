# Convex servers API reference (for MCP Inspector hosted mode)

The MCP Inspector in **hosted mode** expects your Convex app to expose these server-related functions. If your app currently throws "Servers not yet implemented", add the schema and implementation below to your Convex app and redeploy.

---

## 1. Schema

In your Convex app’s `convex/schema.ts`, add a `servers` table and ensure `workspaces` exists if you use it. Example addition:

```ts
// In convex/schema.ts - add to your defineSchema({ ... })

servers: defineTable({
  workspaceId: v.string(),
  name: v.string(),
  enabled: v.boolean(),
  transportType: v.union(v.literal("stdio"), v.literal("http")),
  command: v.optional(v.string()),
  args: v.optional(v.array(v.string())),
  url: v.optional(v.string()),
  headers: v.optional(v.record(v.string(), v.string())),
  timeout: v.optional(v.number()),
  useOAuth: v.optional(v.boolean()),
  oauthScopes: v.optional(v.array(v.string())),
  clientId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_workspace", ["workspaceId"])
  .index("by_workspace_name", ["workspaceId", "name"]),
```

---

## 2. Mutations and query

Create or replace `convex/servers.ts` with the following. The Inspector calls these with the argument shapes shown.

```ts
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
```

---

## 3. Auth (recommended)

In production you should restrict these so only authenticated users can create/update/delete servers in workspaces they belong to. For example:

- In each mutation/query, get the identity with `const identity = await ctx.auth.getUserIdentity();` and reject if missing.
- Use a `workspaces` table and a `workspace_members` (or similar) table to ensure the user is allowed to modify the given `workspaceId` before inserting or patching `servers`.

The snippet above omits auth for brevity; add it in your app.

---

## 4. useSaveView shape

The Inspector’s “save view” flow sometimes calls `createServer` with only `{ workspaceId, name, enabled, transportType }` (no `config`). The reference uses `v.optional(serverConfigValidator)` so that call remains valid; the implementation defaults `transportType` to `"http"` and `enabled` to `true` when `config` is omitted.

---

After adding the table and `servers.ts`, run `npx convex dev` or `npx convex deploy` from your Convex app so the Inspector’s “Add MCP server” flow can use these APIs.
