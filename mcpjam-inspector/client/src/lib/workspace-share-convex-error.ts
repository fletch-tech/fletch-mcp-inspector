import { ConvexError } from "convex/values";

/**
 * Reads the user-facing `message` from workspace share-related Convex errors
 * (`workspaces:createWorkspace`, `addMember`, `removeMember`). Technical
 * context lives in `error.data.details` on the server; the UI should only
 * toast `message`.
 */
export function getWorkspaceShareConvexErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof ConvexError) {
    const d = error.data;
    if (d !== null && typeof d === "object" && "message" in d) {
      const m = (d as { message: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
    if (typeof d === "string" && d.trim()) return d.trim();
  }
  return fallback;
}
