import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ensureDefaultWorkspaceForUser } from "./workspaceHelpers";

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
 * Verify the caller is a member of the given workspace.
 * Returns the membership row or throws.
 */
async function requireMembership(
  ctx: { auth: any; db: any },
  workspaceId: Id<"workspaces">,
) {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", workspaceId).eq("userId", user._id),
    )
    .unique();

  if (!membership) throw new Error("Not a member of this workspace");

  return { user, membership };
}

// ── Queries ──────────────────────────────────────────────────────────

export const getMyWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    const workspaces = await Promise.all(
      memberships.map((m: any) => ctx.db.get(m.workspaceId)),
    );

    return workspaces.filter(Boolean);
  },
});

export const getWorkspaceMembers = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return [];

    const wsId = args.workspaceId as Id<"workspaces">;

    // Verify caller is a member
    const callerMembership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q.eq("workspaceId", wsId).eq("userId", user._id),
      )
      .unique();

    if (!callerMembership) return [];

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q: any) => q.eq("workspaceId", wsId))
      .collect();

    return Promise.all(
      memberships.map(async (m: any) => {
        const memberUser = await ctx.db.get(m.userId) as {
          _id: any;
          name: string;
          email?: string;
          profilePictureUrl?: string;
        } | null;
        return {
          _id: m._id,
          workspaceId: m.workspaceId,
          userId: m.userId,
          email: m.email,
          role: m.role,
          isOwner: m.isOwner,
          addedBy: m.addedBy,
          addedAt: m.addedAt,
          user: memberUser
            ? {
                name: memberUser.name,
                email: memberUser.email ?? m.email,
                imageUrl: memberUser.profilePictureUrl ?? "",
              }
            : null,
        };
      }),
    );
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const createWorkspace = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: user._id,
      email: user.email ?? "",
      role: "owner",
      isOwner: true,
      addedBy: user._id,
      addedAt: now,
    });

    return workspaceId;
  },
});

export const updateWorkspace = mutation({
  args: { workspaceId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const wsId = args.workspaceId as Id<"workspaces">;
    const { membership } = await requireMembership(ctx, wsId);

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Only owners and admins can update a workspace");
    }

    const workspace = await ctx.db.get(wsId);
    if (!workspace) throw new Error("Workspace not found");

    await ctx.db.patch(wsId, {
      ...(args.name ? { name: args.name } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const deleteWorkspace = mutation({
  args: { workspaceId: v.string() },
  handler: async (ctx, args) => {
    const wsId = args.workspaceId as Id<"workspaces">;
    const { membership } = await requireMembership(ctx, wsId);

    if (!membership.isOwner) {
      throw new Error("Only the workspace owner can delete a workspace");
    }

    // Delete all servers in this workspace
    const servers = await ctx.db
      .query("servers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const server of servers) {
      await ctx.db.delete(server._id);
    }

    // Delete all membership rows
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q: any) => q.eq("workspaceId", wsId))
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    await ctx.db.delete(wsId);
  },
});

export const addMember = mutation({
  args: { workspaceId: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const wsId = args.workspaceId as Id<"workspaces">;
    const { user: caller, membership } = await requireMembership(ctx, wsId);

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Only owners and admins can add members");
    }

    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required");

    // Find the user by email
    const users = await ctx.db.query("users").collect();
    const targetUser = users.find(
      (u: any) => u.email?.toLowerCase() === email,
    );

    if (!targetUser) {
      throw new Error(
        "No user found with that email. They need to sign in first.",
      );
    }

    // Check if already a member
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q.eq("workspaceId", wsId).eq("userId", targetUser._id),
      )
      .unique();

    if (existing) {
      throw new Error("User is already a member of this workspace");
    }

    await ctx.db.insert("workspaceMembers", {
      workspaceId: wsId,
      userId: targetUser._id,
      email,
      role: "member",
      isOwner: false,
      addedBy: caller._id,
      addedAt: Date.now(),
    });
  },
});

export const changeMemberRole = mutation({
  args: { workspaceId: v.string(), memberId: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    const wsId = args.workspaceId as Id<"workspaces">;
    const { membership: callerMembership } = await requireMembership(ctx, wsId);

    if (!callerMembership.isOwner) {
      throw new Error("Only the workspace owner can change member roles");
    }

    const memberId = args.memberId as Id<"workspaceMembers">;
    const targetMembership = await ctx.db.get(memberId);
    if (!targetMembership || targetMembership.workspaceId !== wsId) {
      throw new Error("Member not found in this workspace");
    }

    if (targetMembership.isOwner) {
      throw new Error(
        "Cannot change the owner's role. Transfer ownership first.",
      );
    }

    const validRoles = ["admin", "member"];
    if (!validRoles.includes(args.role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
    }

    await ctx.db.patch(memberId, { role: args.role });
  },
});

export const transferWorkspaceOwnership = mutation({
  args: { workspaceId: v.string(), newOwnerId: v.string() },
  handler: async (ctx, args) => {
    const wsId = args.workspaceId as Id<"workspaces">;
    const { membership: callerMembership } = await requireMembership(ctx, wsId);

    if (!callerMembership.isOwner) {
      throw new Error("Only the current owner can transfer ownership");
    }

    const newOwnerId = args.newOwnerId as Id<"workspaceMembers">;
    const newOwnerMembership = await ctx.db.get(newOwnerId);
    if (!newOwnerMembership || newOwnerMembership.workspaceId !== wsId) {
      throw new Error("Target member not found in this workspace");
    }

    // Demote current owner to admin
    await ctx.db.patch(callerMembership._id, {
      role: "admin",
      isOwner: false,
    });

    // Promote new owner
    await ctx.db.patch(newOwnerId, {
      role: "owner",
      isOwner: true,
    });

    // Update workspace.createdBy to reflect new owner
    await ctx.db.patch(wsId, {
      createdBy: newOwnerMembership.userId,
      updatedAt: Date.now(),
    });
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.string(),
    memberId: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const wsId = args.workspaceId as Id<"workspaces">;
    const { user: caller, membership: callerMembership } =
      await requireMembership(ctx, wsId);

    let targetMembership: any = null;

    if (args.memberId) {
      const memberId = args.memberId as Id<"workspaceMembers">;
      targetMembership = await ctx.db.get(memberId);
    } else if (args.email) {
      // Look up by email within this workspace
      const members = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", wsId))
        .collect();
      targetMembership = members.find(
        (m: any) => m.email.toLowerCase() === args.email!.toLowerCase(),
      );
    }

    if (!targetMembership || targetMembership.workspaceId !== wsId) {
      throw new Error("Member not found in this workspace");
    }

    const isSelf = targetMembership.userId === caller._id;

    if (targetMembership.isOwner) {
      throw new Error(
        "Cannot remove the workspace owner. Transfer ownership first.",
      );
    }

    if (!isSelf) {
      if (
        callerMembership.role !== "owner" &&
        callerMembership.role !== "admin"
      ) {
        throw new Error("Only owners and admins can remove other members");
      }
    }

    await ctx.db.delete(targetMembership._id);
  },
});

// ── Default workspace helper ─────────────────────────────────────────

/**
 * Ensure the authenticated user has at least one workspace.
 * Called by the client on auth; creates a "Default" workspace if needed.
 */
export const ensureDefaultWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    return ensureDefaultWorkspaceForUser(ctx, user._id, user.email ?? "");
  },
});
