import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import {
  webAuthorize,
  webAuthorizeBatch,
  webAuthorizeBatchLocal,
} from "./webAuthorize";
import { webHostRuntimeConfig } from "./hostRuntimeConfig";
import { streamHttp } from "./stream";
import { publicHostCatalog } from "./hostCatalogHttp";
import { evalGenerationGenerate } from "./evalGeneration";
import { v1Models } from "./v1Models";

const http = httpRouter();

/** GET / — confirms the HTTP router bundle is deployed (plain text 200). */
http.route({
  path: "/",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      "Convex HTTP actions OK. GET /v1/models, GET /public/host-catalog, POST /web/authorize, POST /web/authorize-batch, POST /web/authorize-batch-local, POST /web/host/runtime-config, POST /stream, POST /eval-generation/generate.",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }),
});

/** GET /v1/models — public hosted-model catalog for Inspector picker + billing. */
http.route({
  path: "/v1/models",
  method: "GET",
  handler: v1Models,
});

http.route({
  path: "/public/host-catalog",
  method: "GET",
  handler: publicHostCatalog,
});

http.route({
  path: "/web/authorize",
  method: "POST",
  handler: webAuthorize,
});

http.route({
  path: "/web/authorize-batch",
  method: "POST",
  handler: webAuthorizeBatch,
});

http.route({
  path: "/web/authorize-batch-local",
  method: "POST",
  handler: webAuthorizeBatchLocal,
});

http.route({
  path: "/web/host/runtime-config",
  method: "POST",
  handler: webHostRuntimeConfig,
});

/** POST /stream — LLM proxy for hosted chat (see convex/stream.ts). */
http.route({
  path: "/stream",
  method: "POST",
  handler: streamHttp,
});

/** POST /eval-generation/generate — eval case authoring for Inspector Generate. */
http.route({
  path: "/eval-generation/generate",
  method: "POST",
  handler: evalGenerationGenerate,
});

export default http;
