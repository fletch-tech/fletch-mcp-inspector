import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getServerShareSettings = query({
  args: { serverId: v.string() },
  handler: async () => {
    return null;
  },
});

export const resolveShareForViewer = query({
  args: { shareId: v.string() },
  handler: async () => {
    return null;
  },
});

export const ensureServerShare = mutation({
  args: { serverId: v.string() },
  handler: async () => {
    throw new Error("Server shares not yet implemented");
  },
});

export const setServerShareMode = mutation({
  args: { serverId: v.string(), mode: v.string() },
  handler: async () => {
    throw new Error("Server shares not yet implemented");
  },
});

export const rotateServerShareLink = mutation({
  args: { serverId: v.string() },
  handler: async () => {
    throw new Error("Server shares not yet implemented");
  },
});

export const upsertServerShareMember = mutation({
  args: { serverId: v.string(), email: v.string(), role: v.string() },
  handler: async () => {
    throw new Error("Server shares not yet implemented");
  },
});

export const removeServerShareMember = mutation({
  args: { serverId: v.string(), memberId: v.string() },
  handler: async () => {
    throw new Error("Server shares not yet implemented");
  },
});
