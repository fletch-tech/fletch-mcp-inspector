/**
 * Shared utilities for running MCP servers with Streamable HTTP transport.
 * Auth: external JWT (URL token → cookie, or Bearer). Invalid token → redirect to MAIN_URL or 401.
 */

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import { validateJwt } from "./auth/jwt.js";

export interface ServerOptions {
  port: number;
  name?: string;
}

const AUTH_COOKIE_NAME = "auth_token";
const TOKEN_QUERY_PARAM = "token";

/**
 * Starts an MCP server with Streamable HTTP transport in stateless mode.
 *
 * @param createServer - Factory function that creates a new McpServer instance per request.
 * @param options - Server configuration options.
 */
type ServerFactoryOptions = {
  authToken?: string;
};

export async function startServer(
  createServer: (options?: ServerFactoryOptions) => McpServer,
  options: ServerOptions,
): Promise<void> {
  const { port, name = "MCP Server" } = options;
  const baseUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
  const mainUrl = process.env.MAIN_URL;
  if (!mainUrl) {
    throw new Error("Missing MAIN_URL.");
  }

  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors());

  // Landing: ?token=<base64(jwt)> → validate, set cookie, redirect without token; else redirect to MAIN_URL
  app.get("/auth/landing", async (req: Request, res: Response) => {
    const tokenParam = req.query[TOKEN_QUERY_PARAM];
    if (typeof tokenParam !== "string" || !tokenParam) {
      res.redirect(302, mainUrl);
      return;
    }

    let rawJwt: string;
    try {
      rawJwt = Buffer.from(tokenParam, "base64url").toString("utf8");
    } catch {
      rawJwt = tokenParam;
    }

    const result = await validateJwt(rawJwt);
    if (!result.valid) {
      res.redirect(302, mainUrl);
      return;
    }

    const maxAge = result.claims.exp
      ? Math.max(0, result.claims.exp - Math.floor(Date.now() / 1000))
      : 3600;
    res
      .cookie(AUTH_COOKIE_NAME, rawJwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: maxAge * 1000,
        path: "/",
      })
      .redirect(302, baseUrl.replace(/\/+$/, "") + "/mcp");
  });

  app.all(
    "/mcp",
    jwtAuthMiddleware({ mainUrl, allowAnonymous: true }),
    async (req: Request, res: Response) => {
      const authToken = getAuthToken(req);
      const server = createServer({ authToken });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });

      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("MCP error:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    },
  );

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`${name} listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function getAuthToken(req: Request): string | undefined {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice(7).trim() || undefined;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME];
}

function jwtAuthMiddleware({
  mainUrl,
  allowAnonymous,
}: {
  mainUrl: string;
  allowAnonymous?: boolean;
}) {
  return async (req: Request, res: Response, next: () => void) => {
    const token = getAuthToken(req);
    if (!token) {
      if (allowAnonymous) {
        next();
        return;
      }
      if (acceptsJson(req)) {
        res.status(401).json({ error: "No token provided." });
        return;
      }
      res.redirect(302, mainUrl);
      return;
    }

    const result = await validateJwt(token);
    if (result.valid) {
      next();
      return;
    }

    if (acceptsJson(req)) {
      res.status(401).json({ error: "Invalid token.", detail: result.error });
      return;
    }
    res.redirect(302, mainUrl);
  };
}

function acceptsJson(req: Request): boolean {
  const accept = req.headers.accept ?? "";
  return accept.includes("application/json") || req.headers.authorization !== undefined;
}
