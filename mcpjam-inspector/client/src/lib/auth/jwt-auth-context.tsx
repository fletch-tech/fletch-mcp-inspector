import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const AUTH_TOKEN_KEY = "jwt_auth_token";
const TOKEN_QUERY_PARAM = "token";

declare global {
  interface Window {
    __JWT_FROM_COOKIE__?: string;
  }
}

export interface JwtUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** Alias for compatibility with components that expect an auth user shape */
export type User = JwtUser;

interface JwtAuthContextValue {
  user: JwtUser | null;
  isLoading: boolean;
  signIn: () => void;
  /** @deprecated No separate sign-up — users are auto-created on first valid token. Alias for signIn. */
  signUp: () => void;
  signOut: (opts?: { returnTo?: string }) => void;
  getAccessToken: () => Promise<string | undefined>;
}

const JwtAuthContext = createContext<JwtAuthContextValue | null>(null);

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isTokenExpired(claims: Record<string, unknown>): boolean {
  const exp = claims.exp;
  if (typeof exp !== "number") return false;
  return Date.now() / 1000 > exp + 10;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

function extractEmail(claims: Record<string, unknown>): string {
  for (const key of [
    "email",
    "preferred_username",
    "cognito:username",
    "username",
  ]) {
    const v = claims[key];
    if (typeof v === "string" && isValidEmail(v)) return v;
  }
  return "";
}

function claimsToUser(claims: Record<string, unknown>): JwtUser | null {
  const sub = (claims.sub as string) ?? (claims.username as string) ?? "";
  const email = extractEmail(claims);
  if (!email) return null;

  const explicitName =
    (claims.name as string) ?? (claims.nickname as string) ?? "";
  const name = explicitName || email.split("@")[0];

  const nameParts = name.split(" ");
  return {
    id: sub,
    email,
    firstName: nameParts[0] || null,
    lastName: nameParts.slice(1).join(" ") || null,
  };
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Read JWT from server-injected window.__JWT_FROM_COOKIE__ (set when user landed via /auth/landing?token=...).
 * Server sets HttpOnly cookie and redirects to /; we inject the token so the client can store it in localStorage.
 */
function consumeTokenFromCookie(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.__JWT_FROM_COOKIE__;
  if (!raw || typeof raw !== "string") return null;
  delete window.__JWT_FROM_COOKIE__;
  const claims = decodeJwtPayload(raw);
  if (!claims || isTokenExpired(claims)) return null;
  if (!claimsToUser(claims)) return null;
  storeToken(raw);
  return raw;
}

/**
 * Get token query param from both location.search and location.hash (some redirects put it in hash).
 */
function getTokenParamFromLocation(): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get(
    TOKEN_QUERY_PARAM,
  );
  if (fromSearch) return fromSearch;
  const hash = window.location.hash;
  if (hash) {
    const hashQuery = hash.indexOf("?");
    if (hashQuery !== -1) {
      return new URLSearchParams(hash.slice(hashQuery)).get(TOKEN_QUERY_PARAM);
    }
  }
  return null;
}

/**
 * Decode base64 or base64url string to raw JWT. atob needs padding for base64url.
 */
function decodeTokenParam(tokenParam: string): string {
  const normalized = tokenParam.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const padded =
      normalized.length % 4 === 0
        ? normalized
        : normalized + "=".repeat(4 - (normalized.length % 4));
    const decoded = atob(padded);
    return decoded.includes(".") ? decoded : tokenParam;
  } catch {
    return tokenParam;
  }
}

/**
 * Read `?token=<base64(jwt)>` from the URL, decode, validate, store,
 * then strip the param from the URL to avoid leaking it in history/logs.
 */
function consumeTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const tokenParam = getTokenParamFromLocation();
  if (!tokenParam) return null;

  const rawJwt = decodeTokenParam(tokenParam);
  const claims = decodeJwtPayload(rawJwt);

  if (!claims) {
    console.warn(
      "[Auth] Token in URL was ignored: invalid or malformed JWT (check encoding).",
    );
    return null;
  }
  if (isTokenExpired(claims)) {
    console.warn("[Auth] Token in URL was ignored: expired.");
    return null;
  }
  if (!claimsToUser(claims)) {
    console.warn(
      "[Auth] Token in URL was ignored: no valid email in claims (expected email, preferred_username, or cognito:username).",
    );
    return null;
  }

  storeToken(rawJwt);

  const params = new URLSearchParams(window.location.search);
  params.delete(TOKEN_QUERY_PARAM);
  const searchPart = params.toString();
  let hashPart = window.location.hash;
  if (hashPart && hashPart.includes("token=")) {
    const hashIdx = hashPart.indexOf("?");
    if (hashIdx !== -1) {
      const hashParams = new URLSearchParams(hashPart.slice(hashIdx));
      hashParams.delete(TOKEN_QUERY_PARAM);
      const hashRest = hashParams.toString();
      hashPart =
        hashPart.slice(0, hashIdx) + (hashRest ? `?${hashRest}` : "");
    }
  }
  const newUrl =
    window.location.pathname +
    (searchPart ? `?${searchPart}` : "") +
    hashPart;
  window.history.replaceState({}, "", newUrl);

  return rawJwt;
}

interface JwtAuthProviderProps {
  mainUrl: string;
  children: ReactNode;
}

export function JwtAuthProvider({ mainUrl, children }: JwtAuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => {
    return (
      consumeTokenFromUrl() ??
      consumeTokenFromCookie() ??
      readStoredToken()
    );
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const claims = decodeJwtPayload(token);
      if (claims && isTokenExpired(claims)) {
        clearStoredToken();
        setToken(null);
        setIsLoading(false);
        return;
      }
      // Token present but no valid email → reject and redirect to MAIN_URL
      if (claims && !claimsToUser(claims)) {
        clearStoredToken();
        setToken(null);
        window.location.href = mainUrl;
        return;
      }
    }
    setIsLoading(false);
  }, []);

  const user = useMemo(() => {
    if (!token) return null;
    const claims = decodeJwtPayload(token);
    if (!claims || isTokenExpired(claims)) return null;
    return claimsToUser(claims);
  }, [token]);

  const signIn = useCallback(() => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `${mainUrl}?return=${returnUrl}`;
  }, [mainUrl]);

  // No separate sign-up: users are auto-created via ensureUser on first valid token.
  const signUp = signIn;

  const signOut = useCallback(
    (opts?: { returnTo?: string }) => {
      clearStoredToken();
      setToken(null);
      window.location.href = opts?.returnTo ?? mainUrl;
    },
    [mainUrl],
  );

  const getAccessToken = useCallback(async () => {
    const current = readStoredToken();
    if (!current) return undefined;
    const claims = decodeJwtPayload(current);
    if (claims && isTokenExpired(claims)) {
      clearStoredToken();
      setToken(null);
      return undefined;
    }
    return current;
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, signIn, signUp, signOut, getAccessToken }),
    [user, isLoading, signIn, signUp, signOut, getAccessToken],
  );

  return (
    <JwtAuthContext.Provider value={value}>{children}</JwtAuthContext.Provider>
  );
}

export function useAuth(): JwtAuthContextValue {
  const ctx = useContext(JwtAuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within a JwtAuthProvider");
  }
  return ctx;
}

/**
 * Hook for Convex's ConvexProviderWithAuth.
 * Returns the shape Convex expects: { isLoading, isAuthenticated, fetchAccessToken }.
 */
export function useConvexJwtAuth() {
  const { isLoading, user, getAccessToken } = useAuth();
  const fetchAccessToken = useCallback(
    async ({
      forceRefreshToken: _,
    }: {
      forceRefreshToken: boolean;
    }) => {
      const token = await getAccessToken();
      return token ?? null;
    },
    [getAccessToken],
  );
  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: !!user,
      fetchAccessToken,
    }),
    [isLoading, user, fetchAccessToken],
  );
}
