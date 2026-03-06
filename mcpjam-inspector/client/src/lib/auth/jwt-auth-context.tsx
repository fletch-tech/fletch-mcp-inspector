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

export interface JwtUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** Alias for compatibility with components that typed against the WorkOS User shape */
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
 * Read `?token=<base64(jwt)>` from the URL, decode, validate, store,
 * then strip the param from the URL to avoid leaking it in history/logs.
 */
function consumeTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const tokenParam = params.get(TOKEN_QUERY_PARAM);
  if (!tokenParam) return null;

  let rawJwt: string;
  try {
    rawJwt = atob(tokenParam.replace(/-/g, "+").replace(/_/g, "/"));
    if (!rawJwt.includes(".")) rawJwt = tokenParam;
  } catch {
    rawJwt = tokenParam;
  }

  const claims = decodeJwtPayload(rawJwt);
  if (!claims || isTokenExpired(claims)) return null;

  // Reject tokens that don't contain a valid email address
  if (!claimsToUser(claims)) return null;

  storeToken(rawJwt);

  params.delete(TOKEN_QUERY_PARAM);
  const remaining = params.toString();
  const newUrl =
    window.location.pathname +
    (remaining ? `?${remaining}` : "") +
    window.location.hash;
  window.history.replaceState({}, "", newUrl);

  return rawJwt;
}

interface JwtAuthProviderProps {
  mainUrl: string;
  children: ReactNode;
}

export function JwtAuthProvider({ mainUrl, children }: JwtAuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => {
    return consumeTokenFromUrl() ?? readStoredToken();
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
  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: !!user,
      fetchAccessToken: async ({
        forceRefreshToken: _,
      }: {
        forceRefreshToken: boolean;
      }) => {
        const token = await getAccessToken();
        return token ?? null;
      },
    }),
    [isLoading, user, getAccessToken],
  );
}
