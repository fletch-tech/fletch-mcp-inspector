import { describe, expect, it } from "vitest";
import {
  applyHostModelToEvalTests,
  resolveEvalModelFromHostConfig,
  resolveEvalModelFromHostModelId,
} from "../host-eval-model";

describe("resolveEvalModelFromHostModelId", () => {
  it("parses slash-form hosted ids", () => {
    expect(resolveEvalModelFromHostModelId("openai/gpt-4o-mini")).toEqual({
      provider: "openai",
      model: "openai/gpt-4o-mini",
    });
  });

  it("parses colon-form host picker ids", () => {
    expect(resolveEvalModelFromHostModelId("openai:gpt-4o-mini")).toEqual({
      provider: "openai",
      model: "openai/gpt-4o-mini",
    });
  });

  it("returns null for empty or bare ids", () => {
    expect(resolveEvalModelFromHostModelId("")).toBeNull();
    expect(resolveEvalModelFromHostModelId("gpt-4o-mini")).toBeNull();
    expect(resolveEvalModelFromHostModelId(null)).toBeNull();
  });
});

describe("resolveEvalModelFromHostConfig", () => {
  it("reads modelId from host config", () => {
    expect(
      resolveEvalModelFromHostConfig({ modelId: "openai:gpt-4o-mini" }),
    ).toEqual({
      provider: "openai",
      model: "openai/gpt-4o-mini",
    });
  });
});

describe("applyHostModelToEvalTests", () => {
  it("rewrites LLM cases but leaves model-free probes alone", () => {
    const tests = [
      {
        title: "a",
        provider: "anthropic",
        model: "anthropic/claude-haiku-4.5",
      },
      { title: "b", provider: "none", model: "widget-probe" },
    ];
    expect(
      applyHostModelToEvalTests(tests, {
        provider: "openai",
        model: "openai/gpt-4o-mini",
      }),
    ).toEqual([
      {
        title: "a",
        provider: "openai",
        model: "openai/gpt-4o-mini",
      },
      { title: "b", provider: "none", model: "widget-probe" },
    ]);
  });

  it("is a no-op without a host model", () => {
    const tests = [
      { title: "a", provider: "anthropic", model: "anthropic/claude-haiku-4.5" },
    ];
    expect(applyHostModelToEvalTests(tests, null)).toEqual(tests);
  });
});
