import type { Context } from "hono";
import { Hono } from "hono";
import { WEB_CONNECT_TIMEOUT_MS } from "../../config.js";
import {
  workspaceServerSchema,
  withEphemeralConnection,
  handleRoute,
  authorizeServer,
  assertBearerToken,
  readJsonBody,
  parseWithSchema,
} from "./auth.js";

const servers = new Hono();

const validateCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

/** Exported so the main app can register it explicitly (avoids 404 when sub-app mounting is wrong). */
export async function handleValidate(c: Context) {
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204, validateCorsHeaders);
  }
  if (c.req.method !== "POST") {
    return c.json(
      { code: "METHOD_NOT_ALLOWED", message: "Use POST to validate a server" },
      405,
      { Allow: "POST" },
    );
  }
  return withEphemeralConnection(
    c,
    workspaceServerSchema,
    async (manager, body) => {
      await manager.getToolsForAiSdk([body.serverId]);
      return { success: true, status: "connected" };
    },
    { timeoutMs: WEB_CONNECT_TIMEOUT_MS },
  );
}

// Validate: POST only; OPTIONS/GET return 204/405 so the path is reachable (helps debug 404)
servers.all("/validate", handleValidate);
servers.all("/validate/", handleValidate);

servers.post("/check-oauth", async (c) =>
  handleRoute(c, async () => {
    const bearerToken = assertBearerToken(c);
    const body = parseWithSchema(
      workspaceServerSchema,
      await readJsonBody<unknown>(c),
    );
    const auth = await authorizeServer(
      bearerToken,
      body.workspaceId,
      body.serverId,
      {
        accessScope: body.accessScope,
        shareToken: body.shareToken,
      },
    );
    return {
      useOAuth: auth.serverConfig.useOAuth ?? false,
      serverUrl: auth.serverConfig.url ?? null,
    };
  }),
);

export default servers;
