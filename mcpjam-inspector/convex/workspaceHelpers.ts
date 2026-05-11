import type { Id } from "./_generated/dataModel";

/**
 * Ensure a user has at least one workspace. Creates a "Default" workspace if none exist.
 * Shared helper used by both ensureUser (users.ts) and ensureDefaultWorkspace (workspaces.ts).
 */
export async function ensureDefaultWorkspaceForUser(
  ctx: { db: any },
  userId: Id<"users">,
  email: string,
): Promise<Id<"workspaces">> {
  const memberships = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();

  if (memberships.length > 0) return memberships[0].workspaceId;

  const now = Date.now();
  const workspaceId = await ctx.db.insert("workspaces", {
    name: "Default",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("workspaceMembers", {
    workspaceId,
    userId,
    email,
    role: "owner",
    isOwner: true,
    addedBy: userId,
    addedAt: now,
  });

  return workspaceId;
}
