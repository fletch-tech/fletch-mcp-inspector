import type { EvalCase } from "@/components/evals/types";
import { FLETCH_DEFAULT_EVAL_MODELS } from "@/shared/fletch-eval-defaults";

const DEFAULT_MODELS: Array<{ model: string; provider: string }> = [
  ...FLETCH_DEFAULT_EVAL_MODELS,
];

/**
 * Unique provider:model rows from existing suite test cases (order preserved).
 * Falls back to the Fletch sandbox default when the suite has no model config.
 */
export function collectUniqueModelsFromTestCases(
  testCases: EvalCase[] | null | undefined,
): Array<{ model: string; provider: string }> {
  if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
    return [...DEFAULT_MODELS];
  }

  const uniqueModels = new Map<string, { model: string; provider: string }>();

  for (const testCase of testCases) {
    if (testCase.models && Array.isArray(testCase.models)) {
      for (const modelConfig of testCase.models) {
        if (modelConfig.model && modelConfig.provider) {
          const key = `${modelConfig.provider}:${modelConfig.model}`;
          if (!uniqueModels.has(key)) {
            uniqueModels.set(key, {
              model: modelConfig.model,
              provider: modelConfig.provider,
            });
          }
        }
      }
    }
  }

  const list = Array.from(uniqueModels.values());
  return list.length > 0 ? list : [...DEFAULT_MODELS];
}
