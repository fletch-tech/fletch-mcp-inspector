import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

type AuthorizeBody = {
  workspaceId?: string;
  serverId?: string;
  accessScope?: string;
  shareToken?: string;
};

function parseJsonBody(raw: unknown): AuthorizeBody | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  return {
    workspaceId: typeof o.workspaceId === "string" ? o.workspaceId : undefined,
    serverId: typeof o.serverId === "string" ? o.serverId : undefined,
    accessScope: typeof o.accessScope === "string" ? o.accessScope : undefined,
    shareToken: typeof o.shareToken === "string" ? o.shareToken : undefined,
  };
}

/**
 * POST /web/authorize
 * Called by the Inspector server (hosted mode) to authorize access to a workspace server.
 * Expects: Authorization: Bearer <Convex JWT>, body: { workspaceId, serverId, accessScope?, shareToken? }
 * Returns: { authorized, role, accessLevel, permissions, serverConfig } or 401/403 JSON.
 */
export const webAuthorize = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ code: "METHOD_NOT_ALLOWED", message: "Use POST" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  let identity = null as Awaited<ReturnType<typeof ctx.auth.getUserIdentity>> | null;
  try {
    identity = await ctx.auth.getUserIdentity();
  } catch {
    return new Response(
      JSON.stringify({
        code: "UNAUTHORIZED",
        message: "Valid JWT required (Authorization: Bearer <token>)",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!identity) {
    return new Response(
      JSON.stringify({
        code: "UNAUTHORIZED",
        message: "Valid JWT required (Authorization: Bearer <token>)",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ code: "VALIDATION_ERROR", message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = parseJsonBody(raw);
  if (!body) {
    return new Response(
      JSON.stringify({
        code: "VALIDATION_ERROR",
        message: "Request body must be a JSON object",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { workspaceId, serverId } = body;
  if (!workspaceId || !serverId) {
    return new Response(
      JSON.stringify({
        code: "VALIDATION_ERROR",
        message: "workspaceId and serverId are required",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (body.shareToken) {
    return new Response(
      JSON.stringify({
        code: "FEATURE_NOT_SUPPORTED",
        message: "Server shares not yet implemented",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  let lookup: any;
  try {
    lookup = await ctx.runQuery(internal.webAuthorizeInternal.lookupAuthorizeContext, {
      serverId,
      workspaceId,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        code: "INTERNAL_ERROR",
        message:
          error instanceof Error
            ? `Authorization lookup failed: ${error.message}`
            : "Authorization lookup failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!lookup.ok) {
    const isWorkspace = lookup.reason === "WORKSPACE_NOT_FOUND";
    return new Response(
      JSON.stringify({
        code: "NOT_FOUND",
        message: isWorkspace
          ? "Workspace not found"
          : "Server not found or does not belong to this workspace",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const accessLevel =
    body.accessScope === "chat_v2" ? "shared_chat" : "workspace_member";

  return new Response(
    JSON.stringify({
      authorized: true,
      role: "member" as const,
      accessLevel,
      permissions: { chatOnly: accessLevel === "shared_chat" },
      serverConfig: lookup.serverConfig,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
