import { describe, it, expect } from "vitest";
import { validateUrl, OAuthProxyError } from "../oauth-proxy.js";

describe("validateUrl", () => {
  describe("basic validation", () => {
    it("accepts valid HTTPS URL", () => {
      const url = validateUrl("https://auth.example.com/token");
      expect(url.hostname).toBe("auth.example.com");
    });

    it("accepts valid HTTP URL", () => {
      const url = validateUrl("http://auth.example.com/token");
      expect(url.hostname).toBe("auth.example.com");
    });

    it("rejects empty URL", () => {
      expect(() => validateUrl("")).toThrow(OAuthProxyError);
      expect(() => validateUrl("")).toThrow("Missing url parameter");
    });

    it("rejects invalid URL format", () => {
      expect(() => validateUrl("not-a-url")).toThrow("Invalid URL format");
    });

    it("rejects non-HTTP protocols", () => {
      expect(() => validateUrl("ftp://example.com")).toThrow("Invalid protocol");
      expect(() => validateUrl("file:///etc/passwd")).toThrow(
        "Invalid protocol",
      );
    });
  });

  describe("httpsOnly mode", () => {
    it("accepts HTTPS when httpsOnly is true", () => {
      const url = validateUrl("https://auth.example.com/token", true);
      expect(url.protocol).toBe("https:");
    });

    it("rejects HTTP when httpsOnly is true", () => {
      expect(() =>
        validateUrl("http://auth.example.com/token", true),
      ).toThrow("Only HTTPS targets are allowed");
    });
  });

  describe("private IP blocking (SSRF prevention)", () => {
    it("blocks localhost", () => {
      expect(() => validateUrl("http://localhost/api")).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("http://localhost:8080/api")).toThrow(
        "private/internal",
      );
    });

    it("blocks 127.0.0.1", () => {
      expect(() => validateUrl("http://127.0.0.1/")).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("http://127.0.0.1:3000/")).toThrow(
        "private/internal",
      );
    });

    it("blocks 127.x.x.x range", () => {
      expect(() => validateUrl("http://127.0.0.2/")).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("http://127.255.255.255/")).toThrow(
        "private/internal",
      );
    });

    it("blocks 10.x.x.x (private class A)", () => {
      expect(() => validateUrl("http://10.0.0.1/")).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("http://10.255.255.255/")).toThrow(
        "private/internal",
      );
    });

    it("blocks 172.16-31.x.x (private class B)", () => {
      expect(() => validateUrl("http://172.16.0.1/")).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("http://172.31.255.255/")).toThrow(
        "private/internal",
      );
    });

    it("allows 172.15.x.x and 172.32.x.x (not private)", () => {
      expect(() => validateUrl("http://172.15.0.1/")).not.toThrow();
      expect(() => validateUrl("http://172.32.0.1/")).not.toThrow();
    });

    it("blocks 192.168.x.x (private class C)", () => {
      expect(() => validateUrl("http://192.168.0.1/")).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("http://192.168.1.1/")).toThrow(
        "private/internal",
      );
    });

    it("blocks 169.254.x.x (link-local / cloud metadata)", () => {
      expect(() => validateUrl("http://169.254.169.254/")).toThrow(
        "private/internal",
      );
      expect(() =>
        validateUrl(
          "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        ),
      ).toThrow("private/internal");
    });

    it("blocks metadata.google.internal", () => {
      expect(() =>
        validateUrl("http://metadata.google.internal/computeMetadata/v1/"),
      ).toThrow("private/internal");
    });

    it("blocks 0.0.0.0", () => {
      expect(() => validateUrl("http://0.0.0.0/")).toThrow("private/internal");
    });

    it("blocks IPv6 loopback", () => {
      expect(() => validateUrl("http://[::1]/")).toThrow("private/internal");
    });

    it("allows public IPs", () => {
      expect(() => validateUrl("https://8.8.8.8/")).not.toThrow();
      expect(() => validateUrl("https://1.1.1.1/")).not.toThrow();
      expect(() => validateUrl("https://203.0.113.1/")).not.toThrow();
    });

    it("allows public domains", () => {
      expect(() =>
        validateUrl("https://accounts.google.com/o/oauth2/token"),
      ).not.toThrow();
      expect(() =>
        validateUrl("https://login.microsoftonline.com/token"),
      ).not.toThrow();
    });

    it("blocks private IPs even with HTTPS", () => {
      expect(() => validateUrl("https://10.0.0.1/", true)).toThrow(
        "private/internal",
      );
      expect(() => validateUrl("https://192.168.1.1/", true)).toThrow(
        "private/internal",
      );
    });
  });
});
