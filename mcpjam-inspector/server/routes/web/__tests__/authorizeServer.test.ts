import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../../config.js", () => ({
  CONVEX_HTTP_URL: "https://convex.example/http",
  WEB_CALL_TIMEOUT_MS: 60_000,
}));

import { authorizeServer } from "../auth.js";
import { ErrorCode } from "../errors.js";

describe("authorizeServer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps Convex 503 without JSON body to SERVER_UNREACHABLE and a diagnostic message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    const err = await authorizeServer("test-jwt", "ws-1", "srv-1").catch(
      (e) => e,
    );
    expect(err).toMatchObject({
      status: 503,
      code: ErrorCode.SERVER_UNREACHABLE,
    });
    expect(String((err as Error).message)).toContain("503");
    expect(String((err as Error).message)).toContain("CONVEX_HTTP_URL");
  });

  it("prefers Convex JSON message when present for 503", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "upstream overloaded" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      authorizeServer("test-jwt", "ws-1", "srv-1"),
    ).rejects.toMatchObject({
      status: 503,
      message: "upstream overloaded",
    });
  });
});
