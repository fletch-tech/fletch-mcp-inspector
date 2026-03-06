import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as jose from "jose";

// We need to dynamically import validateJwt after setting env vars,
// so we use vi.resetModules() between tests.
let validateJwt: typeof import("../jwt.js").validateJwt;

async function loadModule() {
  const mod = await import("../jwt.js");
  validateJwt = mod.validateJwt;
}

// Helper: create an HS256-signed JWT for testing
async function createHS256Token(
  claims: Record<string, unknown>,
  secret: string,
) {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT(claims as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}

describe("server/auth/jwt - validateJwt", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clear all JWT-related env vars
    delete process.env.JWT_JWKS_URL;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.AWS_REGION;
    delete process.env.USER_POOL_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("input validation", () => {
    it("rejects empty string", async () => {
      process.env.JWT_SECRET = "test-secret";
      await loadModule();
      const result = await validateJwt("");
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("no token provided");
    });

    it("rejects whitespace-only string", async () => {
      process.env.JWT_SECRET = "test-secret";
      await loadModule();
      const result = await validateJwt("   ");
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain("no token provided");
    });

    it("strips Bearer prefix", async () => {
      const secret = "my-test-secret-key-at-least-32-chars!!";
      process.env.JWT_SECRET = secret;
      await loadModule();

      const token = await createHS256Token(
        { sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 },
        secret,
      );
      const result = await validateJwt(`Bearer ${token}`);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.claims.sub).toBe("user-1");
    });
  });

  describe("HS256 (JWT_SECRET)", () => {
    const SECRET = "my-test-secret-key-at-least-32-chars!!";

    it("validates a valid HS256 token", async () => {
      process.env.JWT_SECRET = SECRET;
      await loadModule();

      const token = await createHS256Token(
        { sub: "user-abc", exp: Math.floor(Date.now() / 1000) + 3600 },
        SECRET,
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.claims.sub).toBe("user-abc");
    });

    it("rejects token signed with wrong secret", async () => {
      process.env.JWT_SECRET = SECRET;
      await loadModule();

      const token = await createHS256Token(
        { sub: "user-abc", exp: Math.floor(Date.now() / 1000) + 3600 },
        "wrong-secret-key-at-least-32-characters!!",
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(false);
    });

    it("rejects expired token", async () => {
      process.env.JWT_SECRET = SECRET;
      await loadModule();

      const token = await createHS256Token(
        { sub: "user-abc", exp: Math.floor(Date.now() / 1000) - 3600 },
        SECRET,
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(false);
    });

    it("validates issuer when JWT_ISSUER is set", async () => {
      process.env.JWT_SECRET = SECRET;
      process.env.JWT_ISSUER = "https://auth.example.com";
      await loadModule();

      const token = await createHS256Token(
        {
          sub: "user-1",
          iss: "https://auth.example.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(true);
    });

    it("rejects token with wrong issuer", async () => {
      process.env.JWT_SECRET = SECRET;
      process.env.JWT_ISSUER = "https://auth.example.com";
      await loadModule();

      const token = await createHS256Token(
        {
          sub: "user-1",
          iss: "https://evil.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(false);
    });

    it("validates audience when JWT_AUDIENCE is set", async () => {
      process.env.JWT_SECRET = SECRET;
      process.env.JWT_AUDIENCE = "my-app";
      await loadModule();

      const token = await createHS256Token(
        {
          sub: "user-1",
          aud: "my-app",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(true);
    });

    it("rejects token with wrong audience", async () => {
      process.env.JWT_SECRET = SECRET;
      process.env.JWT_AUDIENCE = "my-app";
      await loadModule();

      const token = await createHS256Token(
        {
          sub: "user-1",
          aud: "other-app",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        SECRET,
      );
      const result = await validateJwt(token);
      expect(result.valid).toBe(false);
    });
  });

  describe("no verification key available", () => {
    it("returns error when neither JWKS nor SECRET is set", async () => {
      await loadModule();
      const result = await validateJwt("some.fake.token");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("no verification key available");
      }
    });
  });

  describe("JWKS URL construction from AWS env vars", () => {
    it("constructs JWKS URL from AWS_REGION and USER_POOL_ID", async () => {
      process.env.AWS_REGION = "us-east-1";
      process.env.USER_POOL_ID = "us-east-1_TestPool";
      // Still need a fallback since we can't actually hit the JWKS endpoint
      process.env.JWT_SECRET = "fallback-secret-at-least-32-characters!!";
      await loadModule();

      const token = await createHS256Token(
        { sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 },
        "fallback-secret-at-least-32-characters!!",
      );
      // The JWKS fetch will fail (no real endpoint), but HS256 fallback works
      const result = await validateJwt(token);
      expect(result.valid).toBe(true);
    });
  });
});
