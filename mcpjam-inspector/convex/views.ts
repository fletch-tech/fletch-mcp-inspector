import { query } from "./_generated/server";
import { v } from "convex/values";

export const listAllByWorkspace = query({
  args: { workspaceId: v.string() },
  handler: async () => {
    return [];
  },
});
