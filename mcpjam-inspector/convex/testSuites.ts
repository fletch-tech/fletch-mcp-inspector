import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getTestSuitesOverview = query({
  args: {},
  handler: async () => {
    return [];
  },
});

export const getAllTestCasesAndIterationsBySuite = query({
  args: { suiteId: v.string() },
  handler: async () => {
    return { testCases: [], iterations: [] };
  },
});

export const listTestCases = query({
  args: { suiteId: v.string() },
  handler: async () => {
    return [];
  },
});

export const getTestIteration = query({
  args: { iterationId: v.string() },
  handler: async () => {
    return null;
  },
});

export const getTestIterationBlob = query({
  args: { iterationId: v.string() },
  handler: async () => {
    return null;
  },
});

export const listTestSuiteRuns = query({
  args: { suiteId: v.string() },
  handler: async () => {
    return [];
  },
});

export const createTestSuite = mutation({
  args: { name: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const updateTestSuite = mutation({
  args: { suiteId: v.string(), name: v.optional(v.string()) },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const updateSuiteModels = mutation({
  args: { suiteId: v.string(), models: v.any() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const deleteTestSuite = mutation({
  args: { suiteId: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const duplicateTestSuite = mutation({
  args: { suiteId: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const createTestCase = mutation({
  args: { suiteId: v.string(), name: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const updateTestCase = mutation({
  args: { testCaseId: v.string(), name: v.optional(v.string()) },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const deleteTestCase = mutation({
  args: { testCaseId: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const duplicateTestCase = mutation({
  args: { testCaseId: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const deleteTestSuiteRun = mutation({
  args: { runId: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});

export const cancelTestSuiteRun = mutation({
  args: { runId: v.string() },
  handler: async () => {
    throw new Error("Test suites not yet implemented");
  },
});
