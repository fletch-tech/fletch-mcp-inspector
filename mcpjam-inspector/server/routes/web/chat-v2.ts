import { Hono } from "hono";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type ToolSet,
} from "ai";
import type { ModelMessage } from "@ai-sdk/provider-utils";
import type { ChatV2Request } from "@/shared/chat-v2";
import type { ModelDefinition } from "@/shared/types";
import { isMCPAuthError } from "@mcpjam/sdk";
import { createLlmModel } from "../../utils/chat-helpers.js";
import { handleMCPJamFreeChatModel } from "../../utils/mcpjam-stream-handler.js";
import { isMCPJamProvidedModel } from "@/shared/types";
import {
  WEB_STREAM_TIMEOUT_MS,
  getConvexHttpUrl,
} from "../../config.js";
import { logger } from "../../utils/logger.js";
import { prepareChatV2 } from "../../utils/chat-v2-orchestration.js";
import { formatChatV2StreamError } from "../../utils/format-stream-error.js";
import {
  hostedChatSchema,
  createAuthorizedManager,
  assertBearerToken,
  readJsonBody,
  parseWithSchema,
  ErrorCode,
  WebRouteError,
  webError,
  mapRuntimeError,
} from "./auth.js";

function assertHostedUserModelCredentials(
  modelDefinition: ModelDefinition,
  body: ChatV2Request,
) {
  if (modelDefinition.provider === "ollama") {
    return;
  }
  if (modelDefinition.provider === "custom") {
    const name = modelDefinition.customProviderName;
    if (!name) {
      throw new WebRouteError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "Custom model is missing customProviderName",
      );
    }
    const cp = body.customProviders?.find((p) => p.name === name);
    const resolved = cp?.apiKey?.trim() || body.apiKey?.trim();
    if (!resolved) {
      throw new WebRouteError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "apiKey is required for this model — add it under LLM Providers or Custom Providers in Settings",
      );
    }
    return;
  }
  if (!body.apiKey?.trim()) {
    throw new WebRouteError(
      400,
      ErrorCode.VALIDATION_ERROR,
      "apiKey is required for this model — add it under LLM Providers in Settings",
    );
  }
}

const chatV2 = new Hono();

chatV2.post("/", async (c) => {
  // NOTE: This route does NOT use handleRoute() because handleMCPJamFreeChatModel
  // returns a streaming Response. Wrapping it in handleRoute → c.json() would
  // serialize the Response object as '{}' instead of forwarding the stream.
  // Track OAuth server URLs so we can enrich auth errors with redirect info
  let oauthServerUrls: Record<string, string> = {};
  try {
    const bearerToken = assertBearerToken(c);
    const rawBody = await readJsonBody<Record<string, unknown>>(c);
    const hostedBody = parseWithSchema(hostedChatSchema, rawBody);
    const body = rawBody as unknown as ChatV2Request & {
      workspaceId: string;
      selectedServerIds: string[];
      shareToken?: string;
      accessScope?: "workspace_member" | "chat_v2";
    };

    const {
      messages,
      model,
      systemPrompt,
      temperature,
      requireToolApproval,
      selectedServerIds,
      shareToken,
    } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new WebRouteError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "messages are required",
      );
    }

    const modelDefinition = model;
    if (!modelDefinition) {
      throw new WebRouteError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "model is not supported",
      );
    }

    const { manager, oauthServerUrls: urls } = await createAuthorizedManager(
      bearerToken,
      hostedBody.workspaceId,
      selectedServerIds,
      WEB_STREAM_TIMEOUT_MS,
      hostedBody.oauthTokens,
      {
        accessScope: "chat_v2",
        shareToken,
      },
    );
    oauthServerUrls = urls;

    try {
      let prepared;
      try {
        prepared = await prepareChatV2({
          mcpClientManager: manager,
          selectedServers: selectedServerIds,
          modelDefinition,
          systemPrompt,
          temperature,
          requireToolApproval,
          customProviders: body.customProviders,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("Invalid tool name(s) for Anthropic")) {
          throw new WebRouteError(400, ErrorCode.VALIDATION_ERROR, msg);
        }
        throw error;
      }

      const {
        allTools,
        enhancedSystemPrompt,
        resolvedTemperature,
        scrubMessages,
      } = prepared;

      const modelMessages = await convertToModelMessages(messages);
      const scrubbed = scrubMessages(modelMessages as ModelMessage[]);

      if (modelDefinition.id && isMCPJamProvidedModel(modelDefinition.id)) {
        if (!getConvexHttpUrl()) {
          throw new WebRouteError(
            500,
            ErrorCode.INTERNAL_ERROR,
            "Server missing Convex configuration (CONVEX_SELF_HOSTED_URL or CONVEX_HTTP_URL)",
          );
        }
        return handleMCPJamFreeChatModel({
          messages: scrubbed,
          modelId: String(modelDefinition.id),
          systemPrompt: enhancedSystemPrompt,
          temperature: resolvedTemperature,
          tools: allTools as ToolSet,
          authHeader: c.req.header("authorization"),
          mcpClientManager: manager,
          selectedServers: selectedServerIds,
          requireToolApproval,
          onStreamComplete: () => manager.disconnectAllServers(),
        });
      }

      assertHostedUserModelCredentials(modelDefinition, body);

      const llmModel = createLlmModel(
        modelDefinition,
        body.apiKey ?? "",
        {
          ollama: body.ollamaBaseUrl,
          azure: body.azureBaseUrl,
        },
        body.customProviders,
      );

      const result = streamText({
        model: llmModel,
        messages: scrubbed,
        ...(resolvedTemperature !== undefined
          ? { temperature: resolvedTemperature }
          : {}),
        system: enhancedSystemPrompt,
        tools: allTools as ToolSet,
        stopWhen: stepCountIs(20),
      });

      return result.toUIMessageStreamResponse({
        messageMetadata: ({ part }) => {
          if (part.type === "finish-step") {
            return {
              inputTokens: part.usage.inputTokens,
              outputTokens: part.usage.outputTokens,
              totalTokens: part.usage.totalTokens,
            };
          }
        },
        onError: (error) => {
          logger.error("[web/chat-v2] stream error", error);
          return formatChatV2StreamError(error, modelDefinition.provider);
        },
      });
    } catch (error) {
      await manager.disconnectAllServers();
      throw error;
    }
  } catch (error) {
    // Enrich MCPAuthError with OAuth server URL so the client can initiate OAuth
    if (isMCPAuthError(error) && Object.keys(oauthServerUrls).length > 0) {
      const firstUrl = Object.values(oauthServerUrls)[0];
      const msg = error instanceof Error ? error.message : String(error);
      return webError(c, 401, ErrorCode.UNAUTHORIZED, msg, {
        oauthRequired: true,
        serverUrl: firstUrl,
      });
    }
    const routeError = mapRuntimeError(error);
    if (routeError.status === 400) {
      logger.warn(
        `[web/chat-v2] 400 Bad Request: ${routeError.message} (${routeError.code})`,
        { code: routeError.code },
      );
    }
    return webError(
      c,
      routeError.status,
      routeError.code,
      routeError.message,
      routeError.details,
    );
  }
});

export default chatV2;
