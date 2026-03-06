import { useAuth } from "@/lib/auth/jwt-auth-context";
import { useQuery } from "convex/react";

/**
 * Centralized hook for getting the current user's profile picture URL.
 * Uses custom uploaded picture from Convex if available.
 */
export function useProfilePicture() {
  const { user } = useAuth();
  const convexUser = useQuery("users:getCurrentUser" as any);

  const profilePictureUrl = convexUser?.profilePictureUrl || undefined;

  return {
    profilePictureUrl,
    isLoading: convexUser === undefined,
  };
}
