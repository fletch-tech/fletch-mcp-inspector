import { describe, it, expect, beforeEach } from "vitest";
import { createMockCtx } from "./mocks/mock_ctx";
import {
  getOrCreateDefaultOrg,
  ensureOrgMembership,
  getMyOrganizations,
  getOrganizationMembers,
  addMember,
  changeMemberRole,
  removeMember,
  updateOrganization,
  deleteOrganization,
  transferOrganizationOwnership,
} from "../organizations";

const ISSUER = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test";

function makeIdentity(sub: string, overrides: Record<string, any> = {}) {
  return {
    tokenIdentifier: `${ISSUER}|${sub}`,
    subject: sub,
    issuer: ISSUER,
    ...overrides,
  };
}

async function seedUser(
  ctx: ReturnType<typeof createMockCtx>,
  opts: { sub: string; name: string; email: string },
) {
  return ctx.db.insert("users", {
    tokenIdentifier: `${ISSUER}|${opts.sub}`,
    name: opts.name,
    email: opts.email,
  });
}

describe("convex/organizations", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  describe("getOrCreateDefaultOrg", () => {
    beforeEach(() => {
      ctx = createMockCtx(null);
    });

    it("creates the Fletch org on first call", async () => {
      const org = await getOrCreateDefaultOrg(ctx, "creator-id");
      expect(org).not.toBeNull();
      expect(org.name).toBe("Fletch");
      expect(org.createdBy).toBe("creator-id");
    });

    it("returns existing Fletch org on subsequent calls", async () => {
      const org1 = await getOrCreateDefaultOrg(ctx, "creator-1");
      const org2 = await getOrCreateDefaultOrg(ctx, "creator-2");
      expect(org1._id).toBe(org2._id);

      const allOrgs = await ctx.db.query("organizations").collect();
      expect(allOrgs).toHaveLength(1);
    });

    it("sets createdAt and updatedAt timestamps", async () => {
      const before = Date.now();
      const org = await getOrCreateDefaultOrg(ctx, "creator-id");
      const after = Date.now();
      expect(org.createdAt).toBeGreaterThanOrEqual(before);
      expect(org.createdAt).toBeLessThanOrEqual(after);
      expect(org.updatedAt).toBe(org.createdAt);
    });
  });

  describe("ensureOrgMembership", () => {
    beforeEach(() => {
      ctx = createMockCtx(null);
    });

    it("creates a new membership", async () => {
      const memberId = await ensureOrgMembership(ctx, {
        organizationId: "org-1",
        userId: "user-1",
        email: "alice@example.com",
        role: "member",
        isOwner: false,
        addedBy: "user-1",
      });
      expect(memberId).toBeTruthy();

      const members = await ctx.db.query("organizationMembers").collect();
      expect(members).toHaveLength(1);
      expect(members[0].email).toBe("alice@example.com");
    });

    it("is idempotent — returns existing membership id", async () => {
      const id1 = await ensureOrgMembership(ctx, {
        organizationId: "org-1",
        userId: "user-1",
        email: "alice@example.com",
        role: "member",
        isOwner: false,
        addedBy: "user-1",
      });
      const id2 = await ensureOrgMembership(ctx, {
        organizationId: "org-1",
        userId: "user-1",
        email: "alice@example.com",
        role: "member",
        isOwner: false,
        addedBy: "user-1",
      });
      expect(id1).toBe(id2);

      const members = await ctx.db.query("organizationMembers").collect();
      expect(members).toHaveLength(1);
    });

    it("creates separate memberships for different users", async () => {
      await ensureOrgMembership(ctx, {
        organizationId: "org-1",
        userId: "user-1",
        email: "alice@example.com",
        role: "member",
        isOwner: false,
        addedBy: "user-1",
      });
      await ensureOrgMembership(ctx, {
        organizationId: "org-1",
        userId: "user-2",
        email: "bob@example.com",
        role: "member",
        isOwner: false,
        addedBy: "user-2",
      });

      const members = await ctx.db.query("organizationMembers").collect();
      expect(members).toHaveLength(2);
    });
  });

  describe("getMyOrganizations", () => {
    it("returns empty array when not authenticated", async () => {
      ctx = createMockCtx(null);
      const result = await (getMyOrganizations as any).handler(ctx);
      expect(result).toEqual([]);
    });

    it("returns empty when user has no memberships", async () => {
      ctx = createMockCtx(makeIdentity("user-1"));
      await seedUser(ctx, {
        sub: "user-1",
        name: "Alice",
        email: "alice@example.com",
      });
      const result = await (getMyOrganizations as any).handler(ctx);
      expect(result).toEqual([]);
    });

    it("returns organizations the user belongs to", async () => {
      ctx = createMockCtx(makeIdentity("user-1"));
      const userId = await seedUser(ctx, {
        sub: "user-1",
        name: "Alice",
        email: "alice@example.com",
      });
      const org = await getOrCreateDefaultOrg(ctx, userId);
      await ensureOrgMembership(ctx, {
        organizationId: org._id,
        userId,
        email: "alice@example.com",
        role: "member",
        isOwner: false,
        addedBy: userId,
      });

      const result = await (getMyOrganizations as any).handler(ctx);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Fletch");
      expect(result[0]._id).toBe(org._id);
    });
  });

  describe("getOrganizationMembers (user isolation)", () => {
    it("returns empty when not authenticated", async () => {
      ctx = createMockCtx(null);
      const result = await (getOrganizationMembers as any).handler(ctx, {
        organizationId: "org-1",
      });
      expect(result).toEqual([]);
    });

    it("returns only the current user's membership, not others", async () => {
      ctx = createMockCtx(makeIdentity("user-1"));
      const user1Id = await seedUser(ctx, {
        sub: "user-1",
        name: "Alice",
        email: "alice@example.com",
      });
      const user2Id = await seedUser(ctx, {
        sub: "user-2",
        name: "Bob",
        email: "bob@example.com",
      });
      const org = await getOrCreateDefaultOrg(ctx, user1Id);

      await ensureOrgMembership(ctx, {
        organizationId: org._id,
        userId: user1Id,
        email: "alice@example.com",
        role: "member",
        isOwner: false,
        addedBy: user1Id,
      });
      await ensureOrgMembership(ctx, {
        organizationId: org._id,
        userId: user2Id,
        email: "bob@example.com",
        role: "member",
        isOwner: false,
        addedBy: user2Id,
      });

      const result = await (getOrganizationMembers as any).handler(ctx, {
        organizationId: org._id,
      });
      expect(result).toHaveLength(1);
      expect(result[0].email).toBe("alice@example.com");
      expect(result[0].user.name).toBe("Alice");
    });

    it("returns empty when user is not a member of the org", async () => {
      ctx = createMockCtx(makeIdentity("user-1"));
      await seedUser(ctx, {
        sub: "user-1",
        name: "Alice",
        email: "alice@example.com",
      });

      const result = await (getOrganizationMembers as any).handler(ctx, {
        organizationId: "nonexistent-org",
      });
      expect(result).toEqual([]);
    });
  });

  describe("blocked mutations (user isolation)", () => {
    it("addMember throws not supported", async () => {
      await expect(
        (addMember as any).handler({}, { organizationId: "org-1", email: "x@y.com" }),
      ).rejects.toThrow("Adding members is not supported yet");
    });

    it("changeMemberRole throws not supported", async () => {
      await expect(
        (changeMemberRole as any).handler(
          {},
          { organizationId: "org-1", memberId: "m-1", role: "admin" },
        ),
      ).rejects.toThrow("Changing member roles is not supported yet");
    });

    it("transferOrganizationOwnership throws not supported", async () => {
      await expect(
        (transferOrganizationOwnership as any).handler(
          {},
          { organizationId: "org-1", newOwnerId: "m-1" },
        ),
      ).rejects.toThrow("Transferring ownership is not supported yet");
    });

    it("removeMember throws not supported", async () => {
      await expect(
        (removeMember as any).handler(
          {},
          { organizationId: "org-1", memberId: "m-1" },
        ),
      ).rejects.toThrow("Removing members is not supported yet");
    });

    it("updateOrganization throws not supported", async () => {
      await expect(
        (updateOrganization as any).handler(
          {},
          { organizationId: "org-1", name: "New" },
        ),
      ).rejects.toThrow("Updating organizations is not supported yet");
    });

    it("deleteOrganization throws not supported", async () => {
      await expect(
        (deleteOrganization as any).handler({}, { organizationId: "org-1" }),
      ).rejects.toThrow("Deleting organizations is not supported yet");
    });
  });
});
