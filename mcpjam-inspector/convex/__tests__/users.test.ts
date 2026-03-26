import { describe, it, expect, beforeEach } from "vitest";
import { createMockCtx } from "./mocks/mock_ctx";
import { ensureUser, getCurrentUser, updateName, updateInfo } from "../users";

const ISSUER = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test";

function makeIdentity(overrides: Record<string, any> = {}) {
  return {
    tokenIdentifier: `${ISSUER}|user-sub-123`,
    subject: "user-sub-123",
    issuer: ISSUER,
    ...overrides,
  };
}

describe("convex/users", () => {
  let ctx: ReturnType<typeof createMockCtx>;

  describe("ensureUser", () => {
    beforeEach(() => {
      ctx = createMockCtx(makeIdentity());
    });

    it("returns null when not authenticated", async () => {
      const unauthCtx = createMockCtx(null);
      const result = await (ensureUser as any).handler(unauthCtx, {});
      expect(result).toBeNull();
    });

    it("returns null when no valid email is available", async () => {
      const result = await (ensureUser as any).handler(ctx, {});
      expect(result).toBeNull();
    });

    it("creates user when email comes from identity", async () => {
      ctx = createMockCtx(makeIdentity({ email: "alice@example.com" }));
      const id = await (ensureUser as any).handler(ctx, {});
      expect(id).toBeTruthy();

      const user = await ctx.db.get(id);
      expect(user?.email).toBe("alice@example.com");
      expect(user?.tokenIdentifier).toBe(`${ISSUER}|user-sub-123`);
    });

    it("creates user when email comes from client args fallback", async () => {
      const id = await (ensureUser as any).handler(ctx, {
        email: "bob@example.com",
      });
      expect(id).toBeTruthy();

      const user = await ctx.db.get(id);
      expect(user?.email).toBe("bob@example.com");
    });

    it("derives name from email prefix when no name claims exist", async () => {
      const id = await (ensureUser as any).handler(ctx, {
        email: "charlie.brown@example.com",
      });
      const user = await ctx.db.get(id);
      expect(user?.name).toBe("charlie.brown");
    });

    it("uses identity name when available", async () => {
      ctx = createMockCtx(
        makeIdentity({ email: "dan@example.com", name: "Dan Smith" }),
      );
      const id = await (ensureUser as any).handler(ctx, {});
      const user = await ctx.db.get(id);
      expect(user?.name).toBe("Dan Smith");
    });

    it("uses nickname as fallback for name", async () => {
      ctx = createMockCtx(
        makeIdentity({ email: "eve@example.com", nickname: "Evie" }),
      );
      const id = await (ensureUser as any).handler(ctx, {});
      const user = await ctx.db.get(id);
      expect(user?.name).toBe("Evie");
    });

    it("uses client-supplied name as fallback", async () => {
      const id = await (ensureUser as any).handler(ctx, {
        email: "frank@example.com",
        name: "Frank J",
      });
      const user = await ctx.db.get(id);
      expect(user?.name).toBe("Frank J");
    });

    it("is idempotent — does not duplicate users", async () => {
      ctx = createMockCtx(makeIdentity({ email: "grace@example.com" }));
      const id1 = await (ensureUser as any).handler(ctx, {});
      const id2 = await (ensureUser as any).handler(ctx, {});
      expect(id1).toBe(id2);

      const users = await ctx.db.query("users").collect();
      expect(users).toHaveLength(1);
    });

    it("syncs name and email when they change", async () => {
      ctx = createMockCtx(
        makeIdentity({ email: "heidi@example.com", name: "Heidi" }),
      );
      await (ensureUser as any).handler(ctx, {});

      ctx.auth.getUserIdentity = async () =>
        makeIdentity({ email: "heidi@newdomain.com", name: "Heidi Updated" });

      await (ensureUser as any).handler(ctx, {});

      const users = await ctx.db.query("users").collect();
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe("Heidi Updated");
      expect(users[0].email).toBe("heidi@newdomain.com");
    });

    it("auto-creates Fletch organization and membership", async () => {
      ctx = createMockCtx(makeIdentity({ email: "ivan@example.com" }));
      await (ensureUser as any).handler(ctx, {});

      const orgs = await ctx.db.query("organizations").collect();
      expect(orgs).toHaveLength(1);
      expect(orgs[0].name).toBe("Fletch");

      const members = await ctx.db.query("organizationMembers").collect();
      expect(members).toHaveLength(1);
      expect(members[0].email).toBe("ivan@example.com");
      expect(members[0].role).toBe("member");
    });

    it("reuses existing Fletch org for second user", async () => {
      ctx = createMockCtx(makeIdentity({ email: "user1@example.com" }));
      await (ensureUser as any).handler(ctx, {});

      ctx.auth.getUserIdentity = async () => ({
        ...makeIdentity({ email: "user2@example.com" }),
        tokenIdentifier: `${ISSUER}|user-sub-456`,
      });
      await (ensureUser as any).handler(ctx, { email: "user2@example.com" });

      const orgs = await ctx.db.query("organizations").collect();
      expect(orgs).toHaveLength(1);

      const members = await ctx.db.query("organizationMembers").collect();
      expect(members).toHaveLength(2);
    });

    it("rejects UUID-like strings as email", async () => {
      ctx = createMockCtx(
        makeIdentity({ email: "917ba5a0-2021-70c6-c13b-adab8b4234b7" }),
      );
      const result = await (ensureUser as any).handler(ctx, {});
      expect(result).toBeNull();
    });

    it("validates email from preferred_username", async () => {
      ctx = createMockCtx(
        makeIdentity({ preferred_username: "valid@email.com" }),
      );
      const id = await (ensureUser as any).handler(ctx, {});
      expect(id).toBeTruthy();
      const user = await ctx.db.get(id);
      expect(user?.email).toBe("valid@email.com");
    });
  });

  describe("getCurrentUser", () => {
    it("returns null when not authenticated", async () => {
      ctx = createMockCtx(null);
      const result = await (getCurrentUser as any).handler(ctx);
      expect(result).toBeNull();
    });

    it("returns null when user doesn't exist yet", async () => {
      ctx = createMockCtx(makeIdentity());
      const result = await (getCurrentUser as any).handler(ctx);
      expect(result).toBeNull();
    });

    it("returns user after ensureUser", async () => {
      ctx = createMockCtx(makeIdentity({ email: "judy@example.com" }));
      await (ensureUser as any).handler(ctx, {});
      const result = await (getCurrentUser as any).handler(ctx);
      expect(result).not.toBeNull();
      expect(result.email).toBe("judy@example.com");
    });
  });

  describe("updateName", () => {
    it("throws when not authenticated", async () => {
      ctx = createMockCtx(null);
      await expect(
        (updateName as any).handler(ctx, { name: "New" }),
      ).rejects.toThrow("Not authenticated");
    });

    it("updates the user's name", async () => {
      ctx = createMockCtx(makeIdentity({ email: "kate@example.com" }));
      await (ensureUser as any).handler(ctx, {});
      await (updateName as any).handler(ctx, { name: "Kate Updated" });

      const user = await (getCurrentUser as any).handler(ctx);
      expect(user.name).toBe("Kate Updated");
    });
  });

  describe("updateInfo", () => {
    it("throws when not authenticated", async () => {
      ctx = createMockCtx(null);
      await expect(
        (updateInfo as any).handler(ctx, { info: "Bio" }),
      ).rejects.toThrow("Not authenticated");
    });

    it("updates the user's info", async () => {
      ctx = createMockCtx(makeIdentity({ email: "leo@example.com" }));
      await (ensureUser as any).handler(ctx, {});
      await (updateInfo as any).handler(ctx, { info: "Developer" });

      const user = await (getCurrentUser as any).handler(ctx);
      expect(user.info).toBe("Developer");
    });
  });
});
