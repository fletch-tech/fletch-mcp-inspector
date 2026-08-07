import { describe, expect, it } from "vitest";
import {
  humanizeCaseTitle,
  softNormalizeExpectedArgs,
  smokeExpectedArgs,
  sampleArgsFromSchema,
} from "../../convex/lib/evalGenerationNormalize";

describe("softNormalizeExpectedArgs", () => {
  it("collapses all-placeholder bags to empty (smoke)", () => {
    expect(
      softNormalizeExpectedArgs({
        req: "object",
        n: "number",
      }),
    ).toEqual({});
  });

  it("rewrites *_example fixtures to any then collapses", () => {
    expect(softNormalizeExpectedArgs({ req: "req_example" })).toEqual({});
  });

  it("keeps intentional non-fixture literals", () => {
    expect(
      softNormalizeExpectedArgs({ coverage_type: "dental" }),
    ).toEqual({ coverage_type: "dental" });
  });
});

describe("humanizeCaseTitle", () => {
  it("rewrites Call <tool> titles", () => {
    expect(humanizeCaseTitle("Call explain_coverage_details [group 1]")).toBe(
      "Explain Coverage Details",
    );
  });

  it("keeps intent titles", () => {
    expect(
      humanizeCaseTitle("Get coverage recommendations for a deductible change"),
    ).toBe("Get coverage recommendations for a deductible change");
  });
});

describe("sampleArgsFromSchema / smokeExpectedArgs", () => {
  it("smoke args are empty", () => {
    expect(smokeExpectedArgs()).toEqual({});
  });

  it("samples type placeholders from required fields", () => {
    expect(
      sampleArgsFromSchema({
        name: "t",
        inputSchema: {
          type: "object",
          required: ["req"],
          properties: { req: { type: "object" } },
        },
      }),
    ).toEqual({ req: "object" });
  });
});
