import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async () => {
    return null;
  },
});

export const regenerateAndGet = mutation({
  args: {},
  handler: async () => {
    throw new Error("API keys not yet implemented");
  },
});
