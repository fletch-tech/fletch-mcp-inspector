import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import webSkills from "../skills.js";

/**
 * Production mounts skills at /api/web/skills (see server/index.ts), not only
 * under the aggregated web app. That mount must still map WebRouteError → JSON.
 */
describe("web skills sub-app (standalone mount)", () => {
  it("returns structured 401 for Bearer null, not root generic 500", async () => {
    const app = new Hono();
    app.route("/api/web/skills", webSkills);

    const res = await app.request("/api/web/skills/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer null",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as { code: string; message: string };
    expect(data.code).toBe("UNAUTHORIZED");
    expect(data.message).toContain("bearer");
  });
});
