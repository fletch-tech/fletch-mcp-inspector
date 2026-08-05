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

  // Local/Fletch "projects" are stored as workspaces; the 2.33 client talks to
  // projects:* which maps onto these rows (see convex/projects.ts).
  workspaces: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    clientConfig: v.optional(v.any()),
    // Project-scoped auto-connect membership + per-server overrides
    // (projectServerConfig:* adapter).
    serverIds: v.optional(v.array(v.string())),
    serverConfigOverrides: v.optional(v.any()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_organization", ["organizationId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    email: v.string(),
    role: v.string(),
    isOwner: v.boolean(),
    addedBy: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

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

  // Connect "Client" tab — project-scoped host configs (Fletch adapter for
  // upstream hosts:* API; full chatbox minting is out of scope).
  hosts: defineTable({
    projectId: v.string(),
    name: v.string(),
    config: v.any(),
    ownerScope: v.optional(v.any()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Named server groups for eval suites / swarms (serverAttachments:*).
  serverAttachments: defineTable({
    projectId: v.string(),
    name: v.string(),
    serverIds: v.array(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_name", ["projectId", "name"]),

  // Synthetic XAA debugger identities ("People" strip).
  testIdentities: defineTable({
    projectId: v.string(),
    name: v.string(),
    subject: v.string(),
    email: v.string(),
    color: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  // Minimal eval suite / case persistence for the Excalidraw quickstart.
  evalSuites: defineTable({
    projectId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    environment: v.any(),
    tags: v.optional(v.array(v.string())),
    serverAttachmentId: v.optional(v.string()),
    hostAttachments: v.optional(v.any()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  evalTestCases: defineTable({
    suiteId: v.string(),
    title: v.string(),
    query: v.optional(v.string()),
    models: v.optional(v.any()),
    expectedToolCalls: v.optional(v.any()),
    runs: v.optional(v.number()),
    isNegativeTest: v.optional(v.boolean()),
    scenario: v.optional(v.string()),
    expectedOutput: v.optional(v.string()),
    steps: v.optional(v.any()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_suite", ["suiteId"]),

  productUpdateDismissals: defineTable({
    userId: v.id("users"),
    slug: v.string(),
    dismissedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_slug", ["userId", "slug"]),
});
