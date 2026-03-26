import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getOrCreateDefaultOrg,
  ensureOrgMembership,
} from "./organizations";

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Queries ──────────────────────────────────────────────────────────

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return currentUser(ctx);
  },
});

// ── Mutations ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

function extractEmail(identity: any, fallback?: string): string | undefined {
  for (const v of [
    identity.email,
    identity.preferred_username,
    identity.emailAddress,
    fallback,
  ]) {
    if (typeof v === "string" && isValidEmail(v)) return v;
  }
  return undefined;
}

/**
 * Ensure a `users` row exists for the authenticated identity.
 * Called by the client immediately after Convex auth is established.
 * If the user does not exist yet, one is auto-created from JWT claims
 * (no separate sign-up step).
 */
export const ensureUser = mutation({
  args: {
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const email = extractEmail(identity, args.email);
    if (!email) return null;

    const name =
      identity.name ?? identity.nickname ?? args.name ?? email.split("@")[0];

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q: any) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    let userId;

    if (existing) {
      userId = existing._id;
      const needsSync =
        (name && existing.name !== name) ||
        (email && existing.email !== email);

      if (needsSync) {
        await ctx.db.patch(existing._id, {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        });
      }
    } else {
      userId = await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        name,
        email,
      });
    }

    // Auto-add user to the default "Fletch" organization
    const org = await getOrCreateDefaultOrg(ctx, userId);
    await ensureOrgMembership(ctx, {
      organizationId: org._id,
      userId,
      email,
      role: "member",
      isOwner: false,
      addedBy: userId,
    });

    return userId;
  },
});

export const updateName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.patch(user._id, { name });
  },
});

export const updateInfo = mutation({
  args: { info: v.string() },
  handler: async (ctx, { info }) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.patch(user._id, { info });
  },
});

export const generateProfilePictureUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return ctx.storage.generateUploadUrl();
  },
});

export const updateProfilePicture = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await currentUser(ctx);
    if (!user) throw new Error("Not authenticated");

    if (user.profilePictureStorageId) {
      await ctx.storage.delete(user.profilePictureStorageId);
    }

    const url = await ctx.storage.getUrl(storageId);
    await ctx.db.patch(user._id, {
      profilePictureStorageId: storageId,
      profilePictureUrl: url ?? undefined,
    });
  },
});
