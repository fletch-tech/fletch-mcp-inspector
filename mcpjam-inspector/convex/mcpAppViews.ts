import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: { name: v.string(), config: v.any() },
  handler: async () => {
    throw new Error("MCP app views not yet implemented");
  },
});

export const update = mutation({
  args: { viewId: v.string(), name: v.optional(v.string()), config: v.optional(v.any()) },
  handler: async () => {
    throw new Error("MCP app views not yet implemented");
  },
});

export const remove = mutation({
  args: { viewId: v.string() },
  handler: async () => {
    throw new Error("MCP app views not yet implemented");
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async () => {
    throw new Error("MCP app views not yet implemented");
  },
});
