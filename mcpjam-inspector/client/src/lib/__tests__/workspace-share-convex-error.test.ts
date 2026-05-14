import { ConvexError } from "convex/values";
import { getWorkspaceShareConvexErrorMessage } from "../workspace-share-convex-error";

describe("getWorkspaceShareConvexErrorMessage", () => {
  it("returns message from structured workspace share error", () => {
    const err = new ConvexError({
      message: "That email already has access to this workspace.",
      details: {
        code: "already_member",
        workspaceId: "k57abc",
      },
    });
    expect(getWorkspaceShareConvexErrorMessage(err)).toBe(
      "That email already has access to this workspace.",
    );
  });

  it("returns string ConvexError data", () => {
    expect(getWorkspaceShareConvexErrorMessage(new ConvexError("Plain"))).toBe(
      "Plain",
    );
  });

  it("returns fallback when not a ConvexError", () => {
    expect(getWorkspaceShareConvexErrorMessage(new Error("x"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("respects custom fallback", () => {
    expect(
      getWorkspaceShareConvexErrorMessage(new Error("x"), "Custom"),
    ).toBe("Custom");
  });
});
