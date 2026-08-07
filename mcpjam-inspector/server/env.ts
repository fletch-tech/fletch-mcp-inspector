import dotenv from "dotenv";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { logger as appLogger } from "./utils/logger.js";

export type InspectorEnvMode = "development" | "production";

export interface LoadedInspectorEnv {
  cwd: string;
  envDir: string;
  loadedFiles: string[];
  mode: InspectorEnvMode;
}

export interface InspectorClientRuntimeConfig {
  convexUrl?: string;
  convexSiteUrl?: string;
}

function getInspectorEnvMode(): InspectorEnvMode {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function getInspectorEnvFileNames(
  mode: InspectorEnvMode = getInspectorEnvMode(),
): string[] {
  return [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"];
}

export function resolveInspectorEnvDir(serverDir: string): string {
  if (
    process.env.IS_PACKAGED === "true" &&
    typeof (process as any).resourcesPath === "string"
  ) {
    return (process as any).resourcesPath;
  }

  if (process.env.ELECTRON_APP === "true") {
    return process.env.ELECTRON_RESOURCES_PATH || ".";
  }

  const envFileNames = getInspectorEnvFileNames();
  const candidateDirs = [
    process.cwd(),
    resolve(serverDir, ".."),
    resolve(serverDir, "..", ".."),
  ];

  for (const candidateDir of candidateDirs) {
    if (
      !existsSync(candidateDir) ||
      !envFileNames.some((fileName) => existsSync(join(candidateDir, fileName)))
    ) {
      continue;
    }

    return candidateDir;
  }

  return process.cwd();
}

/**
 * Self-hosted / Fletch: derive CONVEX_HTTP_URL when only site or self-hosted
 * backend URLs are configured.
 *
 * Local docker-compose exposes:
 *   - 3210 backend (client WebSocket / CONVEX_SELF_HOSTED_URL / VITE_CONVEX_URL)
 *   - 3211 site proxy (HTTP actions → CONVEX_HTTP_URL)
 */
function applySelfHostedConvexHttpUrlFallback(): void {
  if (process.env.CONVEX_HTTP_URL?.trim()) return;

  const siteOrigin = process.env.CONVEX_SITE_ORIGIN?.trim();
  if (siteOrigin) {
    process.env.CONVEX_HTTP_URL = siteOrigin;
    return;
  }

  const selfHosted =
    process.env.CONVEX_SELF_HOSTED_URL?.trim() ||
    process.env.CONVEX_URL?.trim() ||
    process.env.VITE_CONVEX_URL?.trim();
  if (!selfHosted) return;

  try {
    const url = new URL(selfHosted);
    // Local self-hosted: map backend :3210 → site :3211
    if (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.port === "3210"
    ) {
      url.port = "3211";
      process.env.CONVEX_HTTP_URL = url.origin;
      return;
    }
    // Public self-hosted often serves HTTP actions under /http on the same host
    if (!url.pathname || url.pathname === "/") {
      process.env.CONVEX_HTTP_URL = `${url.origin}/http`;
      return;
    }
    process.env.CONVEX_HTTP_URL = selfHosted.replace(/\/+$/, "");
  } catch {
    process.env.CONVEX_HTTP_URL = selfHosted.replace(/\/+$/, "");
  }
}

export function loadInspectorEnv(serverDir: string): LoadedInspectorEnv {
  const mode = getInspectorEnvMode();
  const envDir = resolveInspectorEnvDir(serverDir);
  const loadedFiles: string[] = [];

  for (const fileName of getInspectorEnvFileNames(mode)) {
    const envPath = join(envDir, fileName);
    if (!existsSync(envPath)) continue;

    dotenv.config({ path: envPath });
    loadedFiles.push(envPath);
  }

  applySelfHostedConvexHttpUrlFallback();

  if (!process.env.CONVEX_HTTP_URL) {
    throw new Error(
      `CONVEX_HTTP_URL is required but not set. For self-hosted Convex set CONVEX_HTTP_URL (site/HTTP actions, often :3211 or …/http) or CONVEX_SITE_ORIGIN. Loaded from: ${loadedFiles.join(", ") || "(none)"}`,
    );
  }

  return {
    cwd: process.cwd(),
    envDir,
    loadedFiles,
    mode,
  };
}

function normalizeUrlOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function replaceConvexHostnameSuffix(
  url: string | undefined,
  fromSuffix: string,
  toSuffix: string,
): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(fromSuffix)) {
      return undefined;
    }
    parsed.hostname = parsed.hostname.replace(fromSuffix, toSuffix);
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function getInspectorClientRuntimeConfig(): InspectorClientRuntimeConfig {
  const convexSiteUrl =
    normalizeUrlOrigin(process.env.CONVEX_HTTP_URL) ??
    replaceConvexHostnameSuffix(
      process.env.VITE_CONVEX_URL,
      ".convex.cloud",
      ".convex.site",
    );

  const convexUrl =
    replaceConvexHostnameSuffix(
      process.env.CONVEX_HTTP_URL,
      ".convex.site",
      ".convex.cloud",
    ) ?? normalizeUrlOrigin(process.env.VITE_CONVEX_URL);

  return {
    convexUrl,
    convexSiteUrl,
  };
}

export function getInspectorClientRuntimeConfigScript(): string | null {
  const runtimeConfig = getInspectorClientRuntimeConfig();
  if (!runtimeConfig.convexUrl && !runtimeConfig.convexSiteUrl) {
    return null;
  }

  const serializedConfig = JSON.stringify(runtimeConfig).replace(
    /</g,
    "\\u003c",
  );
  return `<script>window.__MCP_RUNTIME_CONFIG__=${serializedConfig};</script>`;
}

function getConvexDeploymentSlug(url: string | undefined): string | null {
  if (!url) return null;

  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

async function checkBootstrapRoute(convexHttpUrl: string): Promise<void> {
  const response = await fetch(`${convexHttpUrl}/chatbox/bootstrap`, {
    method: "OPTIONS",
    signal: AbortSignal.timeout(2_000),
  });

  if (response.status === 404) {
    appLogger.warn(
      `[boot] CONVEX_HTTP_URL does not expose /chatbox/bootstrap. cwd=${process.cwd()} CONVEX_HTTP_URL=${convexHttpUrl}`,
    );
  }
}

export function warnOnConvexDevMisconfiguration(env: LoadedInspectorEnv): void {
  if (
    env.mode === "production" ||
    process.env.NODE_ENV === "test" ||
    (
      globalThis as typeof globalThis & {
        __MCPJAM_CONVEX_DIAGNOSTICS_STARTED__?: boolean;
      }
    ).__MCPJAM_CONVEX_DIAGNOSTICS_STARTED__
  ) {
    return;
  }

  (
    globalThis as typeof globalThis & {
      __MCPJAM_CONVEX_DIAGNOSTICS_STARTED__?: boolean;
    }
  ).__MCPJAM_CONVEX_DIAGNOSTICS_STARTED__ = true;

  const convexHttpUrl = process.env.CONVEX_HTTP_URL;
  const viteConvexUrl = process.env.VITE_CONVEX_URL;

  const httpSlug = getConvexDeploymentSlug(convexHttpUrl);
  const viteSlug = getConvexDeploymentSlug(viteConvexUrl);

  if (httpSlug && viteSlug && httpSlug !== viteSlug) {
    appLogger.warn(
      `[boot] Client/server Convex deployment mismatch detected. cwd=${env.cwd} VITE_CONVEX_URL=${viteConvexUrl} CONVEX_HTTP_URL=${convexHttpUrl}`,
    );
  }

  if (!convexHttpUrl) return;

  void checkBootstrapRoute(convexHttpUrl).catch((error) => {
    appLogger.warn(
      `[boot] Failed to verify /chatbox/bootstrap on CONVEX_HTTP_URL. cwd=${env.cwd} CONVEX_HTTP_URL=${convexHttpUrl} error=${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
