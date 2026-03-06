import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockEnsureUser = vi.fn();
const mockSetUser = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => mockEnsureUser,
  useConvexAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@sentry/react", () => ({
  setUser: (...args: unknown[]) => mockSetUser(...args),
}));

let mockUser: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
} | null = null;

vi.mock("@/lib/auth/jwt-auth-context", () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { useEnsureDbUser } from "../useEnsureDbUser";

describe("useEnsureDbUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: "user-123",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Smith",
    };
    mockEnsureUser.mockResolvedValue("convex-id-abc");
  });

  it("calls ensureUser with email and full name", async () => {
    renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockEnsureUser).toHaveBeenCalledWith({
        email: "alice@example.com",
        name: "Alice Smith",
      });
    });
  });

  it("sets Sentry user after successful ensure", async () => {
    renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({ id: "user-123" });
    });
  });

  it("does not call ensureUser when user is null", async () => {
    mockUser = null;
    renderHook(() => useEnsureDbUser());

    // Give it time to potentially fire
    await new Promise((r) => setTimeout(r, 50));
    expect(mockEnsureUser).not.toHaveBeenCalled();
  });

  it("passes undefined email when email is empty", async () => {
    mockUser = {
      id: "user-456",
      email: "",
      firstName: "Bob",
      lastName: null,
    };
    renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockEnsureUser).toHaveBeenCalledWith({
        email: undefined,
        name: "Bob",
      });
    });
  });

  it("passes undefined name when firstName and lastName are null", async () => {
    mockUser = {
      id: "user-789",
      email: "noname@example.com",
      firstName: null,
      lastName: null,
    };
    renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockEnsureUser).toHaveBeenCalledWith({
        email: "noname@example.com",
        name: undefined,
      });
    });
  });

  it("does not re-call ensureUser for the same user id", async () => {
    const { rerender } = renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockEnsureUser).toHaveBeenCalledTimes(1);
    });

    rerender();

    // Should still be 1 — deduplication by user.id
    await new Promise((r) => setTimeout(r, 50));
    expect(mockEnsureUser).toHaveBeenCalledTimes(1);
  });

  it("retries after failure when user reference changes", async () => {
    mockEnsureUser.mockRejectedValueOnce(new Error("network error"));

    renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockEnsureUser).toHaveBeenCalledTimes(1);
    });

    // After failure, lastEnsuredUserIdRef is reset to null.
    // Changing the user object reference triggers the effect again.
    mockUser = { ...mockUser! };
    mockEnsureUser.mockResolvedValueOnce("convex-id-retry");

    // Re-mount to trigger the effect with the reset ref
    const { unmount } = renderHook(() => useEnsureDbUser());

    await waitFor(() => {
      expect(mockEnsureUser).toHaveBeenCalledTimes(2);
    });

    unmount();
  });
});
