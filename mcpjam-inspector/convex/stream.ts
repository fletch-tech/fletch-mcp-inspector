/**
 * POST /stream — LLM proxy for hosted MCPJam chat (and eval agents).
 *
 * The Inspector Node server calls CONVEX_HTTP_URL/stream with the user's JWT.
 * Set OPENAI_API_KEY, optional ANTHROPIC_API_KEY, and optional GOOGLE_GENERATIVE_AI_API_KEY
 * on the Convex backend environment for hosted MCPJam models (openai/*, anthropic/*, google/*).
 *
 * Modes:
 * - "stream" — UI message stream (NDJSON) for handleMCPJamFreeChatModel / processStream
 * - "step" — single JSON { ok, messages } for eval/negative-test agents
 */

import { httpAction } from "./_generated/server";
import {
  generateText,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { wrapUiMessageSseBody } from "./lib/safeUiMessageSseStream";

type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

function parseToolDefinitions(raw: unknown): ToolDefinition[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolDefinition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name) continue;
    const inputSchema =
      o.inputSchema && typeof o.inputSchema === "object" && !Array.isArray(o.inputSchema)
        ? (o.inputSchema as Record<string, unknown>)
        : { type: "object", properties: {}, additionalProperties: false };
    out.push({
      name: o.name,
      description: typeof o.description === "string" ? o.description : undefined,
      inputSchema,
    });
  }
  return out;
}

function toolsFromDefinitions(defs: ToolDefinition[]): ToolSet {
  const entries: [string, ReturnType<typeof tool>][] = [];
  for (const def of defs) {
    entries.push([
      def.name,
      tool({
        description: def.description,
        inputSchema: jsonSchema(def.inputSchema),
        // No execute — MCPJam runs tools on the Inspector server; Convex only streams tool calls.
      }),
    ]);
  }
  return Object.fromEntries(entries);
}

function resolveModel(modelId: string) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

  if (modelId.startsWith("openai/") || modelId.startsWith("gpt-")) {
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not set on the Convex backend");
    }
    const openai = createOpenAI({ apiKey: openaiKey });
    const id = modelId.startsWith("openai/")
      ? modelId.slice("openai/".length)
      : modelId;
    return openai.chat(id);
  }

  if (modelId.startsWith("anthropic/")) {
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY is not set on the Convex backend");
    }
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    const id = modelId.slice("anthropic/".length);
    return anthropic(id);
  }

  if (modelId.startsWith("google/")) {
    if (!googleKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY is not set on the Convex backend",
      );
    }
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    return google(modelId);
  }

  throw new Error(`Unsupported model for Convex /stream: ${modelId}`);
}

function omitTemperatureForGpt5(modelId: string, temperature: number | undefined) {
  const m = modelId.toLowerCase();
  if (m.includes("gpt-5") && temperature !== undefined) {
    return {};
  }
  return temperature !== undefined ? { temperature } : {};
}

export const streamHttp = httpAction(async (ctx, request) => {
  try {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    let identity: Awaited<ReturnType<typeof ctx.auth.getUserIdentity>> | null =
      null;
    try {
      identity = await ctx.auth.getUserIdentity();
    } catch {
      identity = null;
    }
    if (!identity) {
      return new Response(
        JSON.stringify({
          code: "UNAUTHORIZED",
          message: "Valid JWT required (Authorization: Bearer <token>)",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    let raw: Record<string, unknown>;
    try {
      raw = (await request.json()) as Record<string, unknown>;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mode = typeof raw.mode === "string" ? raw.mode : "stream";
    const modelId = typeof raw.model === "string" ? raw.model : "";
    if (!modelId) {
      return new Response(JSON.stringify({ error: "model is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let messages: ModelMessage[];
    try {
      const encoded = raw.messages;
      if (typeof encoded !== "string") {
        throw new Error("messages must be a JSON string");
      }
      messages = JSON.parse(encoded) as ModelMessage[];
      if (!Array.isArray(messages)) {
        throw new Error("messages must decode to an array");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid messages";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      typeof raw.systemPrompt === "string" ? raw.systemPrompt : undefined;
    const temperature =
      typeof raw.temperature === "number" && !Number.isNaN(raw.temperature)
        ? raw.temperature
        : undefined;
    const toolDefs = parseToolDefinitions(raw.tools);
    const tools = toolsFromDefinitions(toolDefs);
    const hasTools = Object.keys(tools).length > 0;

    let model;
    try {
      model = resolveModel(modelId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tempOpts = omitTemperatureForGpt5(modelId, temperature);

    if (mode === "step") {
      const result = await generateText({
        model,
        messages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        ...tempOpts,
        ...(hasTools ? { tools } : {}),
        stopWhen: stepCountIs(20),
      });

      return new Response(
        JSON.stringify({
          ok: true,
          messages: result.response.messages,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (mode !== "stream") {
      return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = streamText({
      model,
      messages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...tempOpts,
      ...(hasTools ? { tools } : {}),
      stopWhen: stepCountIs(1),
    });

    const inner = result.toUIMessageStreamResponse({
      onError: (error) =>
        error instanceof Error ? error.message : "Stream error",
    });
    const body = inner.body;
    if (!body) {
      return inner;
    }
    // Avoid surfacing provider stream failures as a broken body stream, which
    // can wedge self-hosted Convex workers until restart.
    return new Response(wrapUiMessageSseBody(body), {
      status: inner.status,
      statusText: inner.statusText,
      headers: inner.headers,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
