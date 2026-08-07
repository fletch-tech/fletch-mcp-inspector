import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterProvider } from "./router";
import "./index.css";
import { getPostHogKey, getPostHogOptions } from "./lib/PosthogUtils.js";
import { PostHogProvider } from "posthog-js/react";
import { ConvexReactClient, ConvexProviderWithAuth } from "convex/react";
import { initSentry } from "./lib/sentry.js";
import { IframeRouterError } from "./components/IframeRouterError.jsx";
import { initializeSessionToken } from "./lib/session-token.js";
import OAuthDesktopReturnNotice from "./components/oauth/OAuthDesktopReturnNotice";
import { HOSTED_MODE } from "./lib/config";
import { buildElectronHostedAuthCallbackUrl } from "./lib/electron-hosted-auth";
import { getRuntimeConvexUrl } from "./lib/runtime-config";
import {
  isDebugOAuthCallbackPath,
  normalizeInitialLegacyHashBookmark,
} from "./lib/app-navigation";
import OAuthDebugCallback from "./components/oauth/OAuthDebugCallback";
import {
  getInitialThemeMode,
  getInitialThemePreset,
  updateThemeMode,
  updateThemePreset,
} from "./lib/theme-utils";
import { useEnsureDbUser } from "./hooks/useEnsureDbUser";
import { DbUserReadyProvider } from "./contexts/db-user-ready-context";
import {
  JwtAuthProvider,
  useConvexJwtAuth,
} from "./lib/auth/jwt-auth-context.js";

// Initialize Sentry before React mounts
initSentry();

function AuthBootstrap({ children }: { children: ReactNode }) {
  const { isEnsuringUser, isUserReady } = useEnsureDbUser();

  return (
    <DbUserReadyProvider
      isEnsuringUser={isEnsuringUser}
      isUserReady={isUserReady}
    >
      {children}
    </DbUserReadyProvider>
  );
}

// Detect if we're inside an iframe - this happens when a user's app uses BrowserRouter
// and does history.pushState, then the iframe is refreshed. The server doesn't recognize
// the new path and serves the Inspector's index.html inside the iframe.
//
// Exception: same-origin self-embed of the public chatbox runtime
// (`/chatbox/<slug>/<token>`). The Chatboxes tab's Preview pane iframes the
// publish link to show a live preview inside the app — that's intentional,
// not a misrouted-pushState misconfiguration, so we let the normal tree
// mount. Restricted to the chatbox route + same-origin parent so the
// "user app accidentally serving inspector index.html" guard still fires
// for every other shape.
const isInIframe = (() => {
  try {
    if (window.self === window.top) return false;
    try {
      const sameOrigin =
        window.top!.location.origin === window.location.origin;
      // Match the documented `/chatbox/<slug>/<token>` shape only; a generic
      // `startsWith("/chatbox/")` would let any unrelated future subpath
      // slip past the misrouted-pushState guard.
      const isPublicChatboxRuntimePath =
        /^\/chatbox\/[^/]+\/[^/]+\/?$/.test(window.location.pathname);
      if (sameOrigin && isPublicChatboxRuntimePath) {
        return false;
      }
    } catch {
      // window.top.location throws under cross-origin — definitely an
      // unrelated embed, keep the guard.
    }
    return true;
  } catch {
    // If we can't access window.top due to cross-origin restrictions, we're in an iframe
    return true;
  }
})();

// If we're in an iframe, render a helpful error message instead of the full Inspector
if (isInIframe) {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <IframeRouterError />
    </StrictMode>
  );
} else if (isDebugOAuthCallbackPath(window.location.pathname)) {
  // Throwaway popup: render without auth providers so MCP OAuth debug
  // callbacks cannot disturb the opener session.
  updateThemeMode(getInitialThemeMode());
  updateThemePreset(getInitialThemePreset());
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <OAuthDebugCallback />
    </StrictMode>
  );
} else {
  const buildConvexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  const runtimeConvexUrl = getRuntimeConvexUrl();
  const convexUrl = runtimeConvexUrl || buildConvexUrl || "";
  const mainUrl =
    (import.meta.env.VITE_MAIN_URL as string) || "http://localhost:3001";

  // Compute Electron hosted-auth return notice (partner-portal flow uses JWT
  // landing; this only covers desktop OAuth return deep-links if present).
  const electronHostedAuthCallbackUrl =
    typeof window === "undefined" || window.isElectron
      ? null
      : buildElectronHostedAuthCallbackUrl(window.location);

  // Warn if critical env vars are missing
  if (!convexUrl) {
    console.warn(
      "[main] VITE_CONVEX_URL is not set; Convex features may not work."
    );
  }
  if (import.meta.env.DEV) {
    console.info("[main] Convex client config", {
      convexUrl: convexUrl || "(empty)",
      source: runtimeConvexUrl
        ? "runtime"
        : buildConvexUrl
          ? "build (VITE_CONVEX_URL)"
          : "none",
      HOSTED_MODE,
    });
  }
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __mcpjamConvex?: unknown }).__mcpjamConvex = {
      convexUrl,
      buildConvexUrl,
      runtimeConvexUrl,
    };
  }
  if (
    HOSTED_MODE &&
    runtimeConvexUrl &&
    buildConvexUrl &&
    runtimeConvexUrl !== buildConvexUrl
  ) {
    console.warn(
      "[main] Hosted runtime Convex URL overrides build-time VITE_CONVEX_URL.",
      {
        buildConvexUrl,
        runtimeConvexUrl,
      }
    );
  }

  // Debug: log which Convex backend the client uses (add ?convex_debug=1 to URL)
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("convex_debug") === "1"
  ) {
    console.log(
      "[Convex] Client is using this backend URL:",
      convexUrl || "(not set)"
    );
  }

  const convex = new ConvexReactClient(convexUrl, {
    onServerDisconnectError(message) {
      console.warn(
        "[Convex] Connection closed by server:",
        message,
        HOSTED_MODE
          ? "— If you're not signed in, sign in and refresh. Otherwise this may be a temporary backend issue."
          : ""
      );
      if (typeof message === "string" && message.includes("1011")) {
        console.warn(
          "[Convex] To find the root cause: on the Convex backend host run with RUST_LOG=debug, restart, then reproduce this disconnect and check backend logs for auth/JWKS/origin errors. See fletch-convex/scripts/debug-1011-capture.sh"
        );
      }
    },
    ...(HOSTED_MODE ? { expectAuth: true } : {}),
  });
  normalizeInitialLegacyHashBookmark();

  const Providers = (
    <JwtAuthProvider mainUrl={mainUrl}>
      <ConvexProviderWithAuth client={convex} useAuth={useConvexJwtAuth}>
        <AuthBootstrap>
          <AppRouterProvider />
        </AuthBootstrap>
      </ConvexProviderWithAuth>
    </JwtAuthProvider>
  );

  // Async bootstrap to initialize session token before rendering
  async function bootstrap() {
    const root = createRoot(document.getElementById("root")!);
    const skipLocalSessionBootstrap =
      import.meta.env.DEV && window.location.pathname.startsWith("/__e2e/");

    if (electronHostedAuthCallbackUrl) {
      root.render(
        <StrictMode>
          <OAuthDesktopReturnNotice
            returnToElectronUrl={electronHostedAuthCallbackUrl}
          />
        </StrictMode>
      );
      return;
    }

    try {
      if (!HOSTED_MODE && !skipLocalSessionBootstrap) {
        // Initialize session token BEFORE rendering in local mode.
        await initializeSessionToken();
        console.log("[Auth] Session token initialized");
      } else {
        console.log(
          "[Auth] Hosted mode active, skipping session token bootstrap"
        );
      }
    } catch (error) {
      console.error("[Auth] Failed to initialize session token:", error);
      // Show error UI instead of crashing
      root.render(
        <StrictMode>
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              fontFamily: "system-ui",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
            }}
          >
            <img
              src="/fletch_dark.svg"
              alt="Fletch MCP Studio"
              style={{ width: "120px", height: "auto", marginBottom: "1.5rem" }}
            />
            <h1 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>
              Authentication Error
            </h1>
            <p style={{ marginBottom: "0.25rem" }}>
              Failed to establish secure session.
            </p>
            <p style={{ color: "#666", fontSize: "0.875rem" }}>
              If accessing via network, use localhost instead.
            </p>
            <button
              onClick={() => location.reload()}
              style={{
                marginTop: "1.5rem",
                padding: "0.75rem 1.5rem",
                cursor: "pointer",
                backgroundColor: "#18181b",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                fontSize: "1rem",
                fontWeight: 500,
              }}
            >
              Restart App
            </button>
          </div>
        </StrictMode>
      );
      return;
    }

    root.render(
      <StrictMode>
        <PostHogProvider apiKey={getPostHogKey()} options={getPostHogOptions()}>
          {Providers}
        </PostHogProvider>
      </StrictMode>
    );
  }

  bootstrap();
}
