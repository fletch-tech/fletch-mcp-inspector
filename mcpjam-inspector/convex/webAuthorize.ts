import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

type AuthorizeBody = {
  workspaceId?: string;
  projectId?: string;
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
    // Hosted inspector sends projectId (workspaces document id).
    projectId: typeof o.projectId === "string" ? o.projectId : undefined,
    serverId: typeof o.serverId === "string" ? o.serverId : undefined,
    accessScope: typeof o.accessScope === "string" ? o.accessScope : undefined,
    shareToken: typeof o.shareToken === "string" ? o.shareToken : undefined,
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireIdentity(ctx: {
  auth: { getUserIdentity: () => Promise<any> };
}) {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        error: jsonResponse(
          {
            code: "UNAUTHORIZED",
            message: "Valid JWT required (Authorization: Bearer <token>)",
          },
          401,
        ),
      };
    }
    return { identity };
  } catch {
    return {
      error: jsonResponse(
        {
          code: "UNAUTHORIZED",
          message: "Valid JWT required (Authorization: Bearer <token>)",
        },
        401,
      ),
    };
  }
}

/**
 * POST /web/authorize
 * Called by the Inspector server (hosted mode) to authorize access to a workspace server.
 */
export const webAuthorize = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Use POST" },
      405,
    );
  }

  const auth = await requireIdentity(ctx);
  if ("error" in auth) return auth.error;
  const { identity } = auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse(
      { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
      400,
    );
  }

  const body = parseJsonBody(raw);
  if (!body) {
    return jsonResponse(
      {
        code: "VALIDATION_ERROR",
        message: "Request body must be a JSON object",
      },
      400,
    );
  }

  const workspaceId = (body.workspaceId || body.projectId || "").trim();
  const serverId = (body.serverId || "").trim();
  if (!workspaceId || !serverId) {
    return jsonResponse(
      {
        code: "VALIDATION_ERROR",
        message: "projectId (or workspaceId) and serverId are required",
      },
      400,
    );
  }

  if (body.shareToken) {
    return jsonResponse(
      {
        code: "FEATURE_NOT_SUPPORTED",
        message: "Server shares not yet implemented",
      },
      403,
    );
  }

  let lookup: any;
  try {
    lookup = await ctx.runQuery(
      internal.webAuthorizeInternal.lookupAuthorizeContext,
      {
        serverId,
        workspaceId,
        tokenIdentifier: identity.tokenIdentifier,
      },
    );
  } catch (error) {
    return jsonResponse(
      {
        code: "INTERNAL_ERROR",
        message:
          error instanceof Error
            ? `Authorization lookup failed: ${error.message}`
            : "Authorization lookup failed",
      },
      500,
    );
  }

  if (!lookup.ok) {
    const reasonMap: Record<
      string,
      { code: string; message: string; status: number }
    > = {
      USER_NOT_FOUND: {
        code: "UNAUTHORIZED",
        message: "User not found",
        status: 401,
      },
      WORKSPACE_NOT_FOUND: {
        code: "NOT_FOUND",
        message: "Project not found",
        status: 404,
      },
      NOT_A_MEMBER: {
        code: "FORBIDDEN",
        message: "You are not a member of this project",
        status: 403,
      },
      SERVER_NOT_FOUND_OR_MISMATCH: {
        code: "NOT_FOUND",
        message: "Server not found or does not belong to this project",
        status: 404,
      },
    };
    const info = reasonMap[lookup.reason] ?? {
      code: "FORBIDDEN",
      message: "Authorization failed",
      status: 403,
    };
    return jsonResponse(
      { code: info.code, message: info.message },
      info.status,
    );
  }

  const accessLevel =
    body.accessScope === "chat_v2" ? "shared_chat" : "workspace_member";

  return jsonResponse(
    {
      authorized: true,
      role: lookup.role ?? ("member" as const),
      accessLevel,
      permissions: { chatOnly: accessLevel === "shared_chat" },
      organizationId: lookup.organizationId ?? null,
      serverConfig: lookup.serverConfig,
    },
    200,
  );
});

/**
 * Shared batch authorize body parsing for /web/authorize-batch and
 * /web/authorize-batch-local.
 */
async function runAuthorizeBatch(
  ctx: {
    auth: { getUserIdentity: () => Promise<any> };
    runQuery: (...args: any[]) => Promise<any>;
  },
  request: Request,
  options?: { accessScope?: string },
) {
  if (request.method !== "POST") {
    return jsonResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Use POST" },
      405,
    );
  }

  const auth = await requireIdentity(ctx);
  if ("error" in auth) return auth.error;
  const { identity } = auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse(
      { code: "VALIDATION_ERROR", message: "Invalid JSON body" },
      400,
    );
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonResponse(
      {
        code: "VALIDATION_ERROR",
        message: "Request body must be a JSON object",
      },
      400,
    );
  }

  const o = raw as Record<string, unknown>;
  const projectId = typeof o.projectId === "string" ? o.projectId.trim() : "";
  const serverIds = Array.isArray(o.serverIds)
    ? o.serverIds.filter((id): id is string => typeof id === "string")
    : [];
  const accessScope =
    options?.accessScope ??
    (typeof o.accessScope === "string" ? o.accessScope : undefined);

  if (!projectId) {
    return jsonResponse(
      { code: "VALIDATION_ERROR", message: "projectId is required" },
      400,
    );
  }
  if (serverIds.length === 0) {
    return jsonResponse(
      { code: "VALIDATION_ERROR", message: "serverIds is required" },
      400,
    );
  }

  let lookup: any;
  try {
    lookup = await ctx.runQuery(
      internal.webAuthorizeInternal.lookupAuthorizeBatchLocal,
      {
        projectId,
        serverIds,
        tokenIdentifier: identity.tokenIdentifier,
      },
    );
  } catch (error) {
    return jsonResponse(
      {
        code: "INTERNAL_ERROR",
        message:
          error instanceof Error
            ? `Authorization lookup failed: ${error.message}`
            : "Authorization lookup failed",
      },
      500,
    );
  }

  if (!lookup.ok) {
    const reasonMap: Record<
      string,
      { code: string; message: string; status: number }
    > = {
      USER_NOT_FOUND: {
        code: "UNAUTHORIZED",
        message: "User not found",
        status: 401,
      },
      WORKSPACE_NOT_FOUND: {
        code: "NOT_FOUND",
        message: "Project not found",
        status: 404,
      },
      NOT_A_MEMBER: {
        code: "FORBIDDEN",
        message: "You are not a member of this project",
        status: 403,
      },
    };
    const info = reasonMap[lookup.reason] ?? {
      code: "FORBIDDEN",
      message: "Authorization failed",
      status: 403,
    };
    return jsonResponse(
      { code: info.code, message: info.message },
      info.status,
    );
  }

  const accessLevel =
    accessScope === "chat_v2" ? "shared_chat" : "project_member";
  const chatOnly = accessLevel === "shared_chat";
  const results: Record<string, any> = {};
  for (const [serverId, result] of Object.entries(
    lookup.results as Record<string, any>,
  )) {
    if (result?.ok) {
      results[serverId] = {
        ...result,
        accessLevel,
        permissions: { chatOnly },
      };
    } else {
      results[serverId] = result;
    }
  }

  return jsonResponse(
    {
      organizationId: lookup.organizationId ?? null,
      isAnonymous: false,
      results,
    },
    200,
  );
}

/**
 * POST /web/authorize-batch
 * Called by the Inspector Node server for hosted-mode MCP connect/reconnect.
 * Body: { projectId, serverIds: string[], accessScope? }
 * Returns: { organizationId, results: Record<serverId, result> }
 */
export const webAuthorizeBatch = httpAction(async (ctx, request) => {
  return runAuthorizeBatch(ctx, request);
});

/**
 * POST /web/authorize-batch-local
 * Called by the Inspector Node server for local-mode MCP connect/reconnect.
 * Body: { projectId, serverIds: string[] }
 * Returns: { organizationId, results: Record<serverId, result> }
 */
export const webAuthorizeBatchLocal = httpAction(async (ctx, request) => {
  return runAuthorizeBatch(ctx, request);
});
