import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMyWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").order("desc").collect();
  },
});

export const getWorkspaceMembers = query({
  args: { workspaceId: v.string() },
  handler: async () => {
    return [];
  },
});

export const createWorkspace = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("workspaces", {
      name: args.name,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateWorkspace = mutation({
  args: { workspaceId: v.string(), name: v.optional(v.string()) },
  handler: async () => {
    throw new Error("Workspaces not yet implemented");
  },
});

export const deleteWorkspace = mutation({
  args: { workspaceId: v.string() },
  handler: async () => {
    throw new Error("Workspaces not yet implemented");
  },
});

export const addMember = mutation({
  args: { workspaceId: v.string(), email: v.string() },
  handler: async () => {
    throw new Error("Workspaces not yet implemented");
  },
});

export const changeMemberRole = mutation({
  args: { workspaceId: v.string(), memberId: v.string(), role: v.string() },
  handler: async () => {
    throw new Error("Workspaces not yet implemented");
  },
});

export const transferWorkspaceOwnership = mutation({
  args: { workspaceId: v.string(), newOwnerId: v.string() },
  handler: async () => {
    throw new Error("Workspaces not yet implemented");
  },
});

export const removeMember = mutation({
  args: { workspaceId: v.string(), memberId: v.string() },
  handler: async () => {
    throw new Error("Workspaces not yet implemented");
  },
});
