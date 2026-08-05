import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { webAuthorize, webAuthorizeBatchLocal } from "./webAuthorize";
import { webHostRuntimeConfig } from "./hostRuntimeConfig";
import { streamHttp } from "./stream";

const http = httpRouter();

/** GET / — confirms the HTTP router bundle is deployed (plain text 200). */
http.route({
  path: "/",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      "Convex HTTP actions OK. POST /web/authorize, POST /web/authorize-batch-local, POST /web/host/runtime-config, POST /stream.",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }),
});

http.route({
  path: "/web/authorize",
  method: "POST",
  handler: webAuthorize,
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

export default http;
