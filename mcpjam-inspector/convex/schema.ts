import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    info: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    profilePictureStorageId: v.optional(v.id("_storage")),
  }).index("by_token", ["tokenIdentifier"]),

  organizations: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  organizationMembers: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    email: v.string(),
    role: v.string(),
    isOwner: v.boolean(),
    addedBy: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["organizationId", "userId"]),

  workspaces: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created", ["createdAt"]),

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
});
