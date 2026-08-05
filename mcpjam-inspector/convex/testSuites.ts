/**
 * Eval / test-suite persistence for the Fletch self-hosted fork.
 * Enough for the Excalidraw quickstart + empty overview; not a full
 * mcpjam-backend evals engine.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

async function currentUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_token", (q: any) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

async function requireProjectMembership(
  ctx: { auth: any; db: any },
  projectId: string,
) {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q: any) =>
      q.eq("workspaceId", projectId as Id<"workspaces">).eq("userId", user._id),
    )
    .unique();
  if (!membership) throw new Error("Not a project member");
  return { user, membership };
}

function suiteDto(row: any, createdBy: string) {
  const hostAttachments = Array.isArray(row.hostAttachments)
    ? row.hostAttachments.map((attachment: any) => ({
        namedHostId: String(attachment?.namedHostId ?? ""),
        enabledOptionalServerIds: Array.isArray(
          attachment?.enabledOptionalServerIds,
        )
          ? attachment.enabledOptionalServerIds
          : [],
        hostName:
          typeof attachment?.hostName === "string"
            ? attachment.hostName
            : null,
        resolvedServerNames: Array.isArray(attachment?.resolvedServerNames)
          ? attachment.resolvedServerNames
          : [],
      }))
    : [];

  return {
    _id: String(row._id),
    createdBy,
    projectId: row.projectId,
    name: row.name,
    description: row.description ?? "",
    configRevision: "1",
    environment: row.environment ?? { servers: [] },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    _creationTime: row.createdAt,
    tags: row.tags ?? [],
    serverAttachmentId: row.serverAttachmentId,
    hostAttachments,
    source: "ui" as const,
  };
}

function overviewEntry(row: any, createdBy: string) {
  return {
    suite: suiteDto(row, createdBy),
    latestRun: null,
    recentRuns: [],
    passRateTrend: [],
    totals: { passed: 0, failed: 0, runs: 0 },
  };
}

export const getTestSuitesOverview = query({
  args: {
    projectId: v.optional(v.string()),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user || !args.projectId) return [];

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q
          .eq("workspaceId", args.projectId as Id<"workspaces">)
          .eq("userId", user._id),
      )
      .unique();
    if (!membership) return [];

    const rows = await ctx.db
      .query("evalSuites")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();

    return rows
      .map((row) => overviewEntry(row, String(row.createdBy ?? user._id)))
      .sort((a, b) => b.suite.updatedAt - a.suite.updatedAt);
  },
});

export const getTestSuite = query({
  args: { suiteId: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    let row = null as any;
    try {
      row = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    } catch {
      return null;
    }
    if (!row) return null;
    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q: any) =>
        q
          .eq("workspaceId", row.projectId as Id<"workspaces">)
          .eq("userId", user._id),
      )
      .unique();
    if (!membership) return null;
    return suiteDto(row, String(row.createdBy ?? user._id));
  },
});

export const getAllTestCasesAndIterationsBySuite = query({
  args: { suiteId: v.string() },
  handler: async (ctx, args) => {
    const cases = await ctx.db
      .query("evalTestCases")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    return {
      testCases: cases.map((c) => ({
        _id: String(c._id),
        suiteId: c.suiteId,
        title: c.title,
        query: c.query ?? "",
        models: c.models ?? [],
        expectedToolCalls: c.expectedToolCalls ?? [],
        runs: c.runs ?? 1,
        isNegativeTest: c.isNegativeTest === true,
        scenario: c.scenario,
        expectedOutput: c.expectedOutput,
        steps: c.steps,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      iterations: [],
    };
  },
});

export const listTestCases = query({
  args: { suiteId: v.string() },
  handler: async (ctx, args) => {
    const cases = await ctx.db
      .query("evalTestCases")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    return cases.map((c) => ({
      _id: String(c._id),
      suiteId: c.suiteId,
      title: c.title,
      query: c.query ?? "",
      models: c.models ?? [],
      expectedToolCalls: c.expectedToolCalls ?? [],
      runs: c.runs ?? 1,
      isNegativeTest: c.isNegativeTest === true,
      scenario: c.scenario,
      expectedOutput: c.expectedOutput,
      steps: c.steps,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  },
});

export const listTestIterations = query({
  args: {
    suiteId: v.optional(v.string()),
    testCaseId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async () => [],
});

export const getTestIteration = query({
  args: {
    iterationId: v.string(),
    suiteId: v.optional(v.string()),
  },
  handler: async () => null,
});

export const getTestIterationBlob = query({
  args: { iterationId: v.string() },
  handler: async () => null,
});

export const listTestSuiteRuns = query({
  args: {
    suiteId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async () => [],
});

export const getTestSuiteRunDiff = query({
  args: {
    runId: v.optional(v.string()),
    leftRunId: v.optional(v.string()),
    rightRunId: v.optional(v.string()),
  },
  handler: async () => null,
});

export const listScheduledRunStats = query({
  args: {
    projectId: v.optional(v.string()),
    organizationId: v.optional(v.string()),
  },
  handler: async () => [],
});

export const estimateSuiteRunCredits = query({
  args: {
    suiteId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    models: v.optional(v.any()),
    hostIds: v.optional(v.array(v.string())),
  },
  handler: async () => ({
    estimatedCredits: 0,
    currency: "credits",
    breakdown: [],
  }),
});

export const estimateQuickCaseRunCredits = query({
  args: {
    suiteId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    models: v.optional(v.any()),
  },
  handler: async () => ({
    estimatedCredits: 0,
    currency: "credits",
    breakdown: [],
  }),
});

export const createTestSuite = mutation({
  args: {
    name: v.optional(v.string()),
    projectId: v.optional(v.string()),
    organizationId: v.optional(v.string()),
    description: v.optional(v.string()),
    environment: v.optional(v.any()),
    tags: v.optional(v.array(v.string())),
    serverAttachmentId: v.optional(v.string()),
    hostAttachments: v.optional(v.any()),
    config: v.optional(v.any()),
    serverIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) throw new Error("projectId is required");
    const { user } = await requireProjectMembership(ctx, args.projectId);
    const now = Date.now();
    const id = await ctx.db.insert("evalSuites", {
      projectId: args.projectId,
      name: (args.name ?? "Untitled suite").trim() || "Untitled suite",
      description: args.description ?? "",
      environment: args.environment ?? { servers: [] },
      tags: args.tags ?? [],
      serverAttachmentId: args.serverAttachmentId,
      hostAttachments: args.hostAttachments ?? [],
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    return { _id: String(id) };
  },
});

export const updateTestSuite = mutation({
  args: {
    suiteId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    config: v.optional(v.any()),
    models: v.optional(v.any()),
    tags: v.optional(v.array(v.string())),
    serverAttachmentId: v.optional(v.string()),
    hostAttachments: v.optional(v.any()),
    environment: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    if (!row) throw new Error("Suite not found");
    await requireProjectMembership(ctx, row.projectId);
    await ctx.db.patch(row._id, {
      ...(args.name !== undefined ? { name: args.name.trim() || row.name } : {}),
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.serverAttachmentId !== undefined
        ? { serverAttachmentId: args.serverAttachmentId }
        : {}),
      ...(args.hostAttachments !== undefined
        ? { hostAttachments: args.hostAttachments }
        : {}),
      ...(args.environment !== undefined
        ? { environment: args.environment }
        : {}),
      updatedAt: Date.now(),
    });
    return { _id: String(row._id) };
  },
});

export const updateSuiteModels = mutation({
  args: { suiteId: v.string(), models: v.any() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    if (!row) throw new Error("Suite not found");
    await requireProjectMembership(ctx, row.projectId);
    await ctx.db.patch(row._id, { updatedAt: Date.now() });
    return { _id: String(row._id) };
  },
});

export const setSuiteSchedule = mutation({
  args: {
    suiteId: v.string(),
    schedule: v.optional(v.any()),
  },
  handler: async () => {
    throw new Error("Suite schedules are not configured in this deployment.");
  },
});

export const setSuiteEnvironments = mutation({
  args: {
    suiteId: v.string(),
    environmentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    if (!row) throw new Error("Suite not found");
    await requireProjectMembership(ctx, row.projectId);
    await ctx.db.patch(row._id, { updatedAt: Date.now() });
    return { _id: String(row._id) };
  },
});

export const deleteTestSuite = mutation({
  args: { suiteId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    if (!row) return { deleted: false };
    await requireProjectMembership(ctx, row.projectId);
    const cases = await ctx.db
      .query("evalTestCases")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    for (const c of cases) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(row._id);
    return { deleted: true };
  },
});

export const duplicateTestSuite = mutation({
  args: { suiteId: v.string() },
  handler: async () => {
    throw new Error("Duplicate suite is not configured in this deployment.");
  },
});

export const createTestCase = mutation({
  args: {
    suiteId: v.string(),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    query: v.optional(v.string()),
    models: v.optional(v.any()),
    expectedToolCalls: v.optional(v.any()),
    runs: v.optional(v.number()),
    isNegativeTest: v.optional(v.boolean()),
    scenario: v.optional(v.string()),
    expectedOutput: v.optional(v.string()),
    steps: v.optional(v.any()),
    config: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const suite = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    if (!suite) throw new Error("Suite not found");
    const { user } = await requireProjectMembership(ctx, suite.projectId);
    const now = Date.now();
    const title =
      (args.title ?? args.name ?? "Untitled case").trim() || "Untitled case";
    const id = await ctx.db.insert("evalTestCases", {
      suiteId: args.suiteId,
      title,
      query: args.query,
      models: args.models,
      expectedToolCalls: args.expectedToolCalls,
      runs: args.runs ?? 1,
      isNegativeTest: args.isNegativeTest === true,
      scenario: args.scenario,
      expectedOutput: args.expectedOutput,
      steps: args.steps,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(suite._id, { updatedAt: now });
    return { _id: String(id) };
  },
});

export const updateTestCase = mutation({
  args: {
    testCaseId: v.string(),
    name: v.optional(v.string()),
    title: v.optional(v.string()),
    config: v.optional(v.any()),
    steps: v.optional(v.any()),
    query: v.optional(v.string()),
    expectedToolCalls: v.optional(v.any()),
    expectedOutput: v.optional(v.string()),
    models: v.optional(v.any()),
    runs: v.optional(v.number()),
    isNegativeTest: v.optional(v.boolean()),
    scenario: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.testCaseId as Id<"evalTestCases">);
    if (!row) throw new Error("Test case not found");
    const suite = await ctx.db.get(row.suiteId as Id<"evalSuites">);
    if (!suite) throw new Error("Suite not found");
    await requireProjectMembership(ctx, suite.projectId);
    const now = Date.now();
    await ctx.db.patch(row._id, {
      ...(args.title !== undefined || args.name !== undefined
        ? {
            title:
              (args.title ?? args.name ?? row.title).trim() || row.title,
          }
        : {}),
      ...(args.query !== undefined ? { query: args.query } : {}),
      ...(args.steps !== undefined ? { steps: args.steps } : {}),
      ...(args.expectedToolCalls !== undefined
        ? { expectedToolCalls: args.expectedToolCalls }
        : {}),
      ...(args.expectedOutput !== undefined
        ? { expectedOutput: args.expectedOutput }
        : {}),
      ...(args.models !== undefined ? { models: args.models } : {}),
      ...(args.runs !== undefined ? { runs: args.runs } : {}),
      ...(args.isNegativeTest !== undefined
        ? { isNegativeTest: args.isNegativeTest }
        : {}),
      ...(args.scenario !== undefined ? { scenario: args.scenario } : {}),
      updatedAt: now,
    });
    await ctx.db.patch(suite._id, { updatedAt: now });
    return { _id: String(row._id) };
  },
});

export const deleteTestCase = mutation({
  args: { testCaseId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.testCaseId as Id<"evalTestCases">);
    if (!row) return { deleted: false };
    const suite = await ctx.db.get(row.suiteId as Id<"evalSuites">);
    if (suite) {
      await requireProjectMembership(ctx, suite.projectId);
      await ctx.db.patch(suite._id, { updatedAt: Date.now() });
    }
    await ctx.db.delete(row._id);
    return { deleted: true };
  },
});

export const duplicateTestCase = mutation({
  args: { testCaseId: v.string() },
  handler: async () => {
    throw new Error("Duplicate case is not configured in this deployment.");
  },
});

export const deleteTestSuiteRun = mutation({
  args: { runId: v.string() },
  handler: async () => ({ deleted: false }),
});

export const cancelTestSuiteRun = mutation({
  args: { runId: v.string() },
  handler: async () => ({ cancelled: false }),
});

export const saveAsTestCaseFromChatMessage = mutation({
  args: {
    suiteId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    message: v.optional(v.any()),
    title: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Save as test case is not configured in this deployment.");
  },
});

export const importChatSessionToTestCase = mutation({
  args: {
    suiteId: v.optional(v.string()),
    projectId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Import chat session is not configured in this deployment.");
  },
});

export const generateEvalAttachmentUploadUrl = mutation({
  args: {
    suiteId: v.optional(v.string()),
    testCaseId: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Eval attachments are not configured in this deployment.");
  },
});

export const setTestCaseAttachments = mutation({
  args: {
    testCaseId: v.string(),
    attachments: v.optional(v.any()),
  },
  handler: async () => {
    throw new Error("Eval attachments are not configured in this deployment.");
  },
});
