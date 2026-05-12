import { mutation } from "./_generated/server";

/**
 * One-time migration: delete all existing workspaces, servers, and workspace members.
 * Run this from the Convex dashboard after deploying the workspaceMembers schema.
 *
 * Existing workspaces have no createdBy or membership data, so they cannot be
 * scoped to any user. New "Default" workspaces will be auto-created for each
 * user on their next sign-in via ensureUser.
 */
export const deleteOrphanedWorkspacesAndServers = mutation({
  args: {},
  handler: async (ctx) => {
    let deletedWorkspaces = 0;
    let deletedServers = 0;
    let deletedMembers = 0;

    // Delete all servers
    const servers = await ctx.db.query("servers").collect();
    for (const server of servers) {
      await ctx.db.delete(server._id);
      deletedServers++;
    }

    // Delete all workspace members (if any exist from partial migration)
    const members = await ctx.db.query("workspaceMembers").collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
      deletedMembers++;
    }

    // Delete all workspaces
    const workspaces = await ctx.db.query("workspaces").collect();
    for (const workspace of workspaces) {
      await ctx.db.delete(workspace._id);
      deletedWorkspaces++;
    }

    return {
      deletedWorkspaces,
      deletedServers,
      deletedMembers,
    };
  },
});
