import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_ORG_NAME = "Fletch";

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

/**
 * Get or create the default "Fletch" organization.
 * Used internally by ensureUser and by queries.
 */
export async function getOrCreateDefaultOrg(
  ctx: { db: any },
  createdByUserId: any,
) {
  const existing = await ctx.db
    .query("organizations")
    .withIndex("by_name", (q: any) => q.eq("name", DEFAULT_ORG_NAME))
    .unique();

  if (existing) return existing;

  const now = Date.now();
  const orgId = await ctx.db.insert("organizations", {
    name: DEFAULT_ORG_NAME,
    createdBy: createdByUserId,
    createdAt: now,
    updatedAt: now,
  });
  return ctx.db.get(orgId);
}

/**
 * Ensure a user is a member of the given organization.
 */
export async function ensureOrgMembership(
  ctx: { db: any },
  {
    organizationId,
    userId,
    email,
    role,
    isOwner,
    addedBy,
  }: {
    organizationId: any;
    userId: any;
    email: string;
    role: string;
    isOwner: boolean;
    addedBy: any;
  },
) {
  const existing = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_user", (q: any) =>
      q.eq("organizationId", organizationId).eq("userId", userId),
    )
    .unique();

  if (existing) return existing._id;

  return ctx.db.insert("organizationMembers", {
    organizationId,
    userId,
    email,
    role,
    isOwner,
    addedBy,
    addedAt: Date.now(),
  });
}

// ── Queries ──────────────────────────────────────────────────────────

export const getMyOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    const orgs = await Promise.all(
      memberships.map((m: any) => ctx.db.get(m.organizationId)),
    );

    return orgs
      .filter(Boolean)
      .map((org: any) => ({
        _id: org._id,
        name: org.name,
        description: org.description,
        logoUrl: org.logoUrl,
        imageUrl: org.logoUrl,
        createdBy: org.createdBy,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      }));
  },
});

/**
 * Returns only the current user's own membership in the organization.
 * Users are isolated — they cannot see other members.
 */
export const getOrganizationMembers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    const user = await currentUser(ctx);
    if (!user) return [];

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_user", (q: any) =>
        q.eq("organizationId", organizationId).eq("userId", user._id),
      )
      .unique();

    if (!membership) return [];

    return [
      {
        _id: membership._id,
        organizationId: membership.organizationId,
        userId: membership.userId,
        email: membership.email,
        role: membership.role,
        isOwner: membership.isOwner,
        addedBy: membership.addedBy,
        addedAt: membership.addedAt,
        user: {
          name: user.name,
          email: user.email ?? membership.email,
          imageUrl: user.profilePictureUrl ?? "",
        },
      },
    ];
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const createOrganization = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      name,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationMembers", {
      organizationId: orgId,
      userId: user._id,
      email: user.email ?? "",
      role: "owner",
      isOwner: true,
      addedBy: user._id,
      addedAt: now,
    });

    return orgId;
  },
});

export const updateOrganization = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Updating organizations is not supported yet");
  },
});

export const deleteOrganization = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async () => {
    throw new Error("Deleting organizations is not supported yet");
  },
});

// Users are isolated — these mutations are no-ops for now.
// The schema supports multi-user orgs for the future but currently
// no user can add, remove, or modify another user's membership.

export const addMember = mutation({
  args: { organizationId: v.id("organizations"), email: v.string() },
  handler: async () => {
    throw new Error("Adding members is not supported yet");
  },
});

export const changeMemberRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberId: v.id("organizationMembers"),
    role: v.string(),
  },
  handler: async () => {
    throw new Error("Changing member roles is not supported yet");
  },
});

export const transferOrganizationOwnership = mutation({
  args: {
    organizationId: v.id("organizations"),
    newOwnerId: v.id("organizationMembers"),
  },
  handler: async () => {
    throw new Error("Transferring ownership is not supported yet");
  },
});

export const removeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    memberId: v.id("organizationMembers"),
  },
  handler: async () => {
    throw new Error("Removing members is not supported yet");
  },
});

export const generateOrganizationLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return ctx.storage.generateUploadUrl();
  },
});

export const updateOrganizationLogo = mutation({
  args: {
    organizationId: v.id("organizations"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { organizationId, storageId }) => {
    const org = await ctx.db.get(organizationId);
    if (!org) throw new Error("Organization not found");

    if (org.logoStorageId) {
      await ctx.storage.delete(org.logoStorageId);
    }

    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(organizationId, {
      logoStorageId: storageId,
      logoUrl: url ?? undefined,
      updatedAt: Date.now(),
    });
  },
});
