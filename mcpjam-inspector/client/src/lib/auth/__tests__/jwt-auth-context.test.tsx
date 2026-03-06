import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import {
  JwtAuthProvider,
  useAuth,
  useConvexJwtAuth,
} from "../jwt-auth-context";

// ── Helpers ──────────────────────────────────────────────────────────

function encodePayload(claims: Record<string, unknown>): string {
  const json = JSON.stringify(claims);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeJwt(claims: Record<string, unknown>): string {
  const header = encodePayload({ alg: "RS256", typ: "JWT" });
  const payload = encodePayload(claims);
  return `${header}.${payload}.fake-signature`;
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    sub: "user-123",
    email: "alice@example.com",
    name: "Alice Smith",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function expiredClaims(overrides: Record<string, unknown> = {}) {
  return validClaims({ exp: Math.floor(Date.now() / 1000) - 3600, ...overrides });
}

const MAIN_URL = "http://localhost:3001";

function wrapper({ children }: { children: React.ReactNode }) {
  return <JwtAuthProvider mainUrl={MAIN_URL}>{children}</JwtAuthProvider>;
}

// ── Pure function tests (via observable behavior) ────────────────────

describe("jwt-auth-context", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset URL
    window.history.replaceState({}, "", "/");
  });

  describe("email validation and extraction", () => {
    it("extracts email from 'email' claim", () => {
      const token = fakeJwt(validClaims({ email: "bob@test.com" }));
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("bob@test.com");
    });

    it("extracts email from 'preferred_username' when 'email' is absent", () => {
      const token = fakeJwt(
        validClaims({ email: undefined, preferred_username: "carol@test.com" }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("carol@test.com");
    });

    it("extracts email from 'cognito:username' claim", () => {
      const token = fakeJwt(
        validClaims({
          email: undefined,
          preferred_username: undefined,
          "cognito:username": "dan@test.com",
        }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("dan@test.com");
    });

    it("extracts email from 'username' claim as last resort", () => {
      const token = fakeJwt(
        validClaims({
          email: undefined,
          preferred_username: undefined,
          "cognito:username": undefined,
          username: "eve@test.com",
        }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("eve@test.com");
    });

    it("rejects tokens without any valid email (user is null)", () => {
      const token = fakeJwt(
        validClaims({
          email: undefined,
          preferred_username: undefined,
          "cognito:username": undefined,
          username: "not-an-email",
        }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
    });

    it("skips non-email strings (e.g. UUIDs) in candidate fields", () => {
      const token = fakeJwt(
        validClaims({
          email: "917ba5a0-2021-70c6-c13b-adab8b4234b7",
          username: "valid@fallback.com",
        }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("valid@fallback.com");
    });
  });

  describe("name derivation from email", () => {
    it("uses explicit 'name' claim when present", () => {
      const token = fakeJwt(validClaims({ name: "Alice Smith", email: "alice@example.com" }));
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.firstName).toBe("Alice");
      expect(result.current.user?.lastName).toBe("Smith");
    });

    it("derives name from email prefix when no name claim exists", () => {
      const token = fakeJwt(
        validClaims({ name: undefined, nickname: undefined, email: "john.doe@example.com" }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.firstName).toBe("john.doe");
      expect(result.current.user?.lastName).toBeNull();
    });

    it("uses 'nickname' claim as fallback before email prefix", () => {
      const token = fakeJwt(
        validClaims({ name: undefined, nickname: "Johnny", email: "john@example.com" }),
      );
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.firstName).toBe("Johnny");
    });
  });

  describe("token expiry", () => {
    it("returns user for a non-expired token", () => {
      const token = fakeJwt(validClaims());
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).not.toBeNull();
    });

    it("returns null user for an expired token", () => {
      const token = fakeJwt(expiredClaims());
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
    });

    it("treats tokens without exp as non-expired", () => {
      const claims = validClaims();
      delete (claims as any).exp;
      const token = fakeJwt(claims);
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).not.toBeNull();
    });
  });

  describe("consumeTokenFromUrl", () => {
    it("reads token from URL query param and stores it", () => {
      const token = fakeJwt(validClaims());
      window.history.replaceState({}, "", `/?token=${token}`);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("alice@example.com");
      expect(localStorage.getItem("jwt_auth_token")).toBe(token);
      // Token should be stripped from URL
      expect(window.location.search).toBe("");
    });

    it("handles base64-encoded token param", () => {
      const token = fakeJwt(validClaims());
      const encoded = btoa(token);
      window.history.replaceState({}, "", `/?token=${encoded}`);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.email).toBe("alice@example.com");
    });

    it("rejects expired token from URL and does not store", () => {
      const token = fakeJwt(expiredClaims());
      window.history.replaceState({}, "", `/?token=${token}`);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
      expect(localStorage.getItem("jwt_auth_token")).toBeNull();
    });

    it("rejects token without valid email from URL", () => {
      const token = fakeJwt(
        validClaims({ email: undefined, username: "no-email-uuid" }),
      );
      window.history.replaceState({}, "", `/?token=${token}`);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
      expect(localStorage.getItem("jwt_auth_token")).toBeNull();
    });

    it("preserves other query params after consuming token", () => {
      const token = fakeJwt(validClaims());
      window.history.replaceState({}, "", `/?foo=bar&token=${token}&baz=qux`);
      renderHook(() => useAuth(), { wrapper });
      expect(window.location.search).toContain("foo=bar");
      expect(window.location.search).toContain("baz=qux");
      expect(window.location.search).not.toContain("token=");
    });
  });

  describe("JwtAuthProvider", () => {
    it("starts with isLoading true and resolves to false", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("redirects to MAIN_URL on invalid-email token in localStorage", async () => {
      const token = fakeJwt(validClaims({ email: undefined, username: "uuid-no-email" }));
      localStorage.setItem("jwt_auth_token", token);

      const hrefSetter = vi.fn();
      const originalHref = window.location.href;
      Object.defineProperty(window, "location", {
        writable: true,
        value: { ...window.location, href: originalHref },
      });
      Object.defineProperty(window.location, "href", {
        set: hrefSetter,
        get: () => originalHref,
      });

      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith(MAIN_URL);
      });
    });

    it("clears expired token from localStorage on mount", async () => {
      const token = fakeJwt(expiredClaims());
      localStorage.setItem("jwt_auth_token", token);
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.user).toBeNull();
    });
  });

  describe("signIn", () => {
    it("redirects to mainUrl with return param", () => {
      const hrefSetter = vi.fn();
      Object.defineProperty(window.location, "href", {
        set: hrefSetter,
        get: () => "http://localhost:6274/some-page",
        configurable: true,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      act(() => {
        result.current.signIn();
      });

      expect(hrefSetter).toHaveBeenCalledWith(
        expect.stringContaining(MAIN_URL + "?return="),
      );
    });
  });

  describe("signOut", () => {
    it("clears token from localStorage and redirects to mainUrl", () => {
      const token = fakeJwt(validClaims());
      localStorage.setItem("jwt_auth_token", token);

      const hrefSetter = vi.fn();
      Object.defineProperty(window.location, "href", {
        set: hrefSetter,
        get: () => "http://localhost:6274/",
        configurable: true,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      act(() => {
        result.current.signOut();
      });

      expect(localStorage.getItem("jwt_auth_token")).toBeNull();
      expect(hrefSetter).toHaveBeenCalledWith(MAIN_URL);
    });

    it("redirects to custom returnTo when provided", () => {
      const token = fakeJwt(validClaims());
      localStorage.setItem("jwt_auth_token", token);

      const hrefSetter = vi.fn();
      Object.defineProperty(window.location, "href", {
        set: hrefSetter,
        get: () => "http://localhost:6274/",
        configurable: true,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      act(() => {
        result.current.signOut({ returnTo: "http://custom.com" });
      });

      expect(hrefSetter).toHaveBeenCalledWith("http://custom.com");
    });
  });

  describe("getAccessToken", () => {
    it("returns the stored token when valid", async () => {
      const token = fakeJwt(validClaims());
      localStorage.setItem("jwt_auth_token", token);

      const { result } = renderHook(() => useAuth(), { wrapper });
      const accessToken = await result.current.getAccessToken();
      expect(accessToken).toBe(token);
    });

    it("returns undefined and clears state when token is expired", async () => {
      const token = fakeJwt(expiredClaims());
      localStorage.setItem("jwt_auth_token", token);

      const { result } = renderHook(() => useAuth(), { wrapper });
      const accessToken = await result.current.getAccessToken();
      expect(accessToken).toBeUndefined();
    });

    it("returns undefined when no token is stored", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      const accessToken = await result.current.getAccessToken();
      expect(accessToken).toBeUndefined();
    });
  });

  describe("useConvexJwtAuth", () => {
    it("returns isAuthenticated true when user exists", () => {
      const token = fakeJwt(validClaims());
      localStorage.setItem("jwt_auth_token", token);

      const { result } = renderHook(() => useConvexJwtAuth(), { wrapper });
      expect(result.current.isAuthenticated).toBe(true);
    });

    it("returns isAuthenticated false when no user", () => {
      const { result } = renderHook(() => useConvexJwtAuth(), { wrapper });
      expect(result.current.isAuthenticated).toBe(false);
    });

    it("fetchAccessToken returns the token", async () => {
      const token = fakeJwt(validClaims());
      localStorage.setItem("jwt_auth_token", token);

      const { result } = renderHook(() => useConvexJwtAuth(), { wrapper });
      const fetched = await result.current.fetchAccessToken({
        forceRefreshToken: false,
      });
      expect(fetched).toBe(token);
    });

    it("fetchAccessToken returns null when no token", async () => {
      const { result } = renderHook(() => useConvexJwtAuth(), { wrapper });
      const fetched = await result.current.fetchAccessToken({
        forceRefreshToken: false,
      });
      expect(fetched).toBeNull();
    });
  });

  describe("useAuth throws outside provider", () => {
    it("throws when used without JwtAuthProvider", () => {
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow("useAuth must be used within a JwtAuthProvider");
    });
  });

  describe("malformed tokens", () => {
    it("returns null user for non-JWT string", () => {
      localStorage.setItem("jwt_auth_token", "not-a-jwt");
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
    });

    it("returns null user for JWT with invalid base64 payload", () => {
      localStorage.setItem("jwt_auth_token", "header.!!!invalid!!!.sig");
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
    });

    it("returns null user for JWT with non-JSON payload", () => {
      const payload = btoa("this is not json");
      localStorage.setItem("jwt_auth_token", `header.${payload}.sig`);
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(result.current.user).toBeNull();
    });
  });
});
