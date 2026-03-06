import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

type Identity = {
  tokenIdentifier: string;
  subject?: string | null;
  name?: string;
  email?: string;
  picture?: string;
};

type UserProfile = {
  tokenIdentifier: string;
  name: string;
  email?: string;
  picture?: string;
};

function buildProfile(identity: Identity): UserProfile {
  return {
    tokenIdentifier: identity.tokenIdentifier,
    name: identity.name ?? "Anonymous",
    email: identity.email ?? undefined,
    picture: identity.picture ?? undefined,
  };
}

/**
 * Returns the current authenticated user document, or null if not authenticated.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

export const upsert = mutation({
  args: {
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();

    if (existing) {
      const needsUpdate =
        existing.name !== args.name ||
        existing.email !== args.email ||
        existing.picture !== args.picture;
      if (needsUpdate) {
        await ctx.db.patch(existing._id, {
          name: args.name,
          email: args.email,
          picture: args.picture,
        });
      }
      return {
        ...existing,
        name: args.name,
        email: args.email,
        picture: args.picture,
      };
    }

    const id = await ctx.db.insert("users", {
      name: args.name,
      tokenIdentifier: args.tokenIdentifier,
      email: args.email,
      picture: args.picture,
    });
    return await ctx.db.get(id);
  },
});

export const syncCurrent = action({
  args: {},
  handler: async (ctx): Promise<Doc<"users"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const profile = buildProfile(identity);
    return ctx.runMutation(api.users.upsert, profile);
  },
});
