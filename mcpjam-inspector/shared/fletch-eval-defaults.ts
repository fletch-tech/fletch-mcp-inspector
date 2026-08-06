/**
 * Default LLM for Fletch eval authoring when no host / suite model applies.
 *
 * Upstream MCPJam defaults to Anthropic Haiku (their hosted credits). This
 * fork's sandbox typically has OpenAI only, so authoring defaults must not
 * bake Anthropic into generated cases / draft cases / quickstarts.
 */

export const FLETCH_DEFAULT_EVAL_MODEL = "openai/gpt-4o-mini";
export const FLETCH_DEFAULT_EVAL_PROVIDER = "openai";

export const FLETCH_DEFAULT_EVAL_MODELS: ReadonlyArray<{
  model: string;
  provider: string;
}> = [
  {
    model: FLETCH_DEFAULT_EVAL_MODEL,
    provider: FLETCH_DEFAULT_EVAL_PROVIDER,
  },
];
