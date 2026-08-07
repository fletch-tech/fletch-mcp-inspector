/**
 * Shim for `@workos-inc/authkit-react`.
 * Fletch uses Cognito/JWT handoff via JwtAuthProvider instead of WorkOS AuthKit.
 * Vite/tsconfig alias `@workos-inc/authkit-react` → this module.
 */
import type { ReactNode } from "react";

export {
  useAuth,
  JwtAuthProvider,
  type JwtUser as User,
} from "./jwt-auth-context";

/**
 * No-op stand-in for WorkOS AuthKitProvider.
 * Real auth is provided by JwtAuthProvider in main.tsx.
 */
export function AuthKitProvider({
  children,
}: {
  children: ReactNode;
  [key: string]: unknown;
}) {
  return <>{children}</>;
}
