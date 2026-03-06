import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { corsOriginCheck } from "../config.js";

describe("corsOriginCheck", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
    savedEnv.CORS_WILDCARD_DOMAINS = process.env.CORS_WILDCARD_DOMAINS;
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CORS_WILDCARD_DOMAINS;
  });

  afterEach(() => {
    if (savedEnv.ALLOWED_ORIGINS !== undefined) {
      process.env.ALLOWED_ORIGINS = savedEnv.ALLOWED_ORIGINS;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
    if (savedEnv.CORS_WILDCARD_DOMAINS !== undefined) {
      process.env.CORS_WILDCARD_DOMAINS = savedEnv.CORS_WILDCARD_DOMAINS;
    } else {
      delete process.env.CORS_WILDCARD_DOMAINS;
    }
  });

  describe("default exact origins", () => {
    it("allows localhost on server port", () => {
      expect(corsOriginCheck("http://localhost:6274")).toBe(
        "http://localhost:6274",
      );
    });

    it("allows 127.0.0.1 on server port", () => {
      expect(corsOriginCheck("http://127.0.0.1:6274")).toBe(
        "http://127.0.0.1:6274",
      );
    });

    it("allows local.fletch.co on server port", () => {
      expect(corsOriginCheck("http://local.fletch.co:6274")).toBe(
        "http://local.fletch.co:6274",
      );
    });

    it("allows local.fletch.co without port", () => {
      expect(corsOriginCheck("http://local.fletch.co")).toBe(
        "http://local.fletch.co",
      );
    });

    it("allows localhost on Vite dev port", () => {
      expect(corsOriginCheck("http://localhost:5173")).toBe(
        "http://localhost:5173",
      );
    });

    it("allows 127.0.0.1 on Vite dev port", () => {
      expect(corsOriginCheck("http://127.0.0.1:5173")).toBe(
        "http://127.0.0.1:5173",
      );
    });

    it("allows localhost on Electron port", () => {
      expect(corsOriginCheck("http://localhost:8080")).toBe(
        "http://localhost:8080",
      );
    });

    it("allows staging deployment", () => {
      expect(corsOriginCheck("https://staging.app.mcpjam.com")).toBe(
        "https://staging.app.mcpjam.com",
      );
    });

    it("rejects unknown origins", () => {
      expect(corsOriginCheck("http://evil.com")).toBe("");
    });

    it("rejects localhost on non-standard port", () => {
      expect(corsOriginCheck("http://localhost:9999")).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(corsOriginCheck(undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(corsOriginCheck("")).toBe("");
    });
  });

  describe("CORS_WILDCARD_DOMAINS", () => {
    it("allows subdomains matching *.fletch.co", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";

      expect(corsOriginCheck("https://app.fletch.co")).toBe(
        "https://app.fletch.co",
      );
      expect(corsOriginCheck("https://inspector.fletch.co")).toBe(
        "https://inspector.fletch.co",
      );
      expect(corsOriginCheck("http://local.fletch.co:3000")).toBe(
        "http://local.fletch.co:3000",
      );
    });

    it("allows the bare domain (fletch.co) for *.fletch.co pattern", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("https://fletch.co")).toBe("https://fletch.co");
    });

    it("allows deeply nested subdomains", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("https://a.b.c.fletch.co")).toBe(
        "https://a.b.c.fletch.co",
      );
    });

    it("does not match similar but different domains", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("https://notfletch.co")).toBe("");
      expect(corsOriginCheck("https://fletch.co.evil.com")).toBe("");
      expect(corsOriginCheck("https://evil-fletch.co")).toBe("");
    });

    it("supports multiple wildcard patterns", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co, *.example.com";

      expect(corsOriginCheck("https://app.fletch.co")).toBe(
        "https://app.fletch.co",
      );
      expect(corsOriginCheck("https://app.example.com")).toBe(
        "https://app.example.com",
      );
      expect(corsOriginCheck("https://other.org")).toBe("");
    });

    it("handles exact domain pattern (without wildcard)", () => {
      process.env.CORS_WILDCARD_DOMAINS = "exact.fletch.co";
      expect(corsOriginCheck("https://exact.fletch.co")).toBe(
        "https://exact.fletch.co",
      );
      expect(corsOriginCheck("https://other.fletch.co")).toBe("");
    });

    it("is case insensitive for domain matching", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("https://APP.FLETCH.CO")).toBe(
        "https://APP.FLETCH.CO",
      );
    });

    it("handles HTTP and HTTPS origins", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("http://app.fletch.co")).toBe(
        "http://app.fletch.co",
      );
      expect(corsOriginCheck("https://app.fletch.co")).toBe(
        "https://app.fletch.co",
      );
    });

    it("handles origins with ports", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("https://app.fletch.co:8443")).toBe(
        "https://app.fletch.co:8443",
      );
    });

    it("rejects malformed origins gracefully", () => {
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";
      expect(corsOriginCheck("not-a-url")).toBe("");
      expect(corsOriginCheck("://missing-scheme")).toBe("");
    });

    it("does nothing when env var is empty", () => {
      process.env.CORS_WILDCARD_DOMAINS = "";
      expect(corsOriginCheck("https://app.fletch.co")).toBe("");
    });
  });

  describe("ALLOWED_ORIGINS override", () => {
    it("uses only ALLOWED_ORIGINS when set", () => {
      process.env.ALLOWED_ORIGINS = "https://custom.example.com";

      expect(corsOriginCheck("https://custom.example.com")).toBe(
        "https://custom.example.com",
      );
      // Default origins are replaced
      expect(corsOriginCheck("http://localhost:6274")).toBe("");
    });

    it("supports multiple origins in ALLOWED_ORIGINS", () => {
      process.env.ALLOWED_ORIGINS =
        "https://a.com, https://b.com, https://c.com";

      expect(corsOriginCheck("https://a.com")).toBe("https://a.com");
      expect(corsOriginCheck("https://b.com")).toBe("https://b.com");
      expect(corsOriginCheck("https://c.com")).toBe("https://c.com");
      expect(corsOriginCheck("https://d.com")).toBe("");
    });

    it("wildcard domains still apply alongside ALLOWED_ORIGINS", () => {
      process.env.ALLOWED_ORIGINS = "https://exact.com";
      process.env.CORS_WILDCARD_DOMAINS = "*.fletch.co";

      expect(corsOriginCheck("https://exact.com")).toBe("https://exact.com");
      expect(corsOriginCheck("https://app.fletch.co")).toBe(
        "https://app.fletch.co",
      );
      expect(corsOriginCheck("https://other.com")).toBe("");
    });
  });
});
