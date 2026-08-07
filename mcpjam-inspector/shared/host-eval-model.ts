/**
 * Map a host's `modelId` (as stored on the host config / host list) onto the
 * `{ provider, model }` pair eval runs send to the worker.
 *
 * Host UI often stores OpenRouter-style ids with a colon (`openai:gpt-4o-mini`);
 * eval wire format expects a slash (`openai/gpt-4o-mini`) in `model` with a
 * separate `provider` field — matching generated case defaults.
 */

export type HostEvalModel = {
  provider: string;
  /** Prefer the canonical `provider/model` form for hosted catalog lookups. */
  model: string;
};

const PROVIDER_ALIASES: Record<string, string> = {
  "x-ai": "xai",
  "meta-llama": "meta",
  mistralai: "mistral",
};

function normalizeProvider(prefix: string): string {
  const lower = prefix.trim().toLowerCase();
  return PROVIDER_ALIASES[lower] ?? lower;
}

/**
 * Parse a host `modelId` into eval provider/model. Returns null when empty or
 * unparseable (caller keeps the case / request model).
 */
export function resolveEvalModelFromHostModelId(
  modelId: unknown,
): HostEvalModel | null {
  if (typeof modelId !== "string") return null;
  const trimmed = modelId.trim();
  if (!trimmed) return null;

  // Canonical / OpenRouter: openai/gpt-4o-mini
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    const provider = normalizeProvider(trimmed.slice(0, slash));
    const rest = trimmed.slice(slash + 1).trim();
    if (!provider || !rest) return null;
    return { provider, model: `${provider}/${rest}` };
  }

  // Host picker display form: openai:gpt-4o-mini
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const provider = normalizeProvider(trimmed.slice(0, colon));
    const rest = trimmed.slice(colon + 1).trim();
    if (!provider || !rest) return null;
    return { provider, model: `${provider}/${rest}` };
  }

  return null;
}

/** Read `modelId` off a hostConfig record (v2 DTO / snapshot). */
export function resolveEvalModelFromHostConfig(
  hostConfig: Record<string, unknown> | null | undefined,
): HostEvalModel | null {
  if (!hostConfig) return null;
  return resolveEvalModelFromHostModelId(hostConfig.modelId);
}

/** True for model-free render checks that must not pick up a host LLM. */
export function isModelFreeEvalTest(test: {
  provider?: string;
  model?: string;
}): boolean {
  const provider = (test.provider ?? "").toLowerCase();
  const model = (test.model ?? "").toLowerCase();
  return provider === "none" || model === "widget-probe";
}

/**
 * When a named host is attached, its modelId is the LLM for the run (product
 * invariant: host axis replaced the suite model picker). Model-free probes
 * are left unchanged.
 */
export function applyHostModelToEvalTests<
  T extends { provider: string; model: string },
>(
  tests: T[],
  hostModel: HostEvalModel | null | undefined,
): T[] {
  if (!hostModel) return tests;
  return tests.map((test) =>
    isModelFreeEvalTest(test)
      ? test
      : { ...test, provider: hostModel.provider, model: hostModel.model },
  );
}
