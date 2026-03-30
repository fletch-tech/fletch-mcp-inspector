import type { ModelProvider } from "@/shared/types";

/**
 * Format LLM stream errors for UI message streams (mcp + web chat-v2).
 */
export function formatChatV2StreamError(
  error: unknown,
  provider?: ModelProvider,
): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const statusCode = (error as { statusCode?: number }).statusCode;
  const responseBody = (error as { responseBody?: string }).responseBody;

  const isAuthStatus = statusCode === 401;

  const lowerBody = responseBody?.toLowerCase() ?? "";
  const isAuthBody =
    lowerBody.includes("incorrect api key") ||
    lowerBody.includes("invalid api key") ||
    lowerBody.includes("api key not valid") ||
    lowerBody.includes("api_key_invalid") ||
    lowerBody.includes("authentication_error") ||
    lowerBody.includes("authentication fails") ||
    lowerBody.includes("invalid x-api-key");

  if (isAuthStatus || isAuthBody) {
    const providerName = provider || "your AI provider";

    return JSON.stringify({
      code: "auth_error",
      message: `Invalid API key for ${providerName}. Please check your key under LLM Providers in Settings.`,
      statusCode,
    });
  }

  if (responseBody && typeof responseBody === "string") {
    return JSON.stringify({
      message: error.message,
      details: responseBody,
    });
  }

  return error.message;
}
