/**
 * Eval / test-suite persistence for the Fletch self-hosted fork.
 * Enough for the Excalidraw quickstart + empty overview; not a full
 * mcpjam-backend evals engine.
 */

import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

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

async function resolveServerNames(
  ctx: { db: any },
  projectId: string,
  serverIds: string[],
) {
  const names: string[] = [];
  for (const id of serverIds) {
    try {
      const server = await ctx.db.get(id as Id<"servers">);
      if (server && String(server.workspaceId) === projectId) {
        names.push(server.name);
      }
    } catch {
      // skip invalid ids
    }
  }
  return names;
}

/**
 * Hydrate the standalone server group pointer. Generate / Run gate on
 * `suite.serverAttachment.resolvedServerNames` via getEffectiveSuiteServers —
 * returning only `serverAttachmentId` made the header picker show the group
 * while Generate still thought the suite had zero servers.
 */
async function hydrateServerAttachment(
  ctx: { db: any },
  projectId: string,
  serverAttachmentId: string | undefined,
) {
  if (!serverAttachmentId) return undefined;
  try {
    const row = await ctx.db.get(
      serverAttachmentId as Id<"serverAttachments">,
    );
    if (!row || String(row.projectId) !== projectId) return undefined;
    const serverIds = Array.isArray(row.serverIds) ? row.serverIds : [];
    return {
      _id: String(row._id),
      name: row.name,
      serverIds,
      resolvedServerNames: await resolveServerNames(ctx, projectId, serverIds),
    };
  } catch {
    return undefined;
  }
}

async function suiteDto(ctx: { db: any }, row: any, createdBy: string) {
  const rawHostAttachments = Array.isArray(row.hostAttachments)
    ? row.hostAttachments
    : [];

  const hostAttachments = await Promise.all(
    rawHostAttachments.map(async (attachment: any) => {
      const namedHostId = String(attachment?.namedHostId ?? "");
      let hostName =
        typeof attachment?.hostName === "string" ? attachment.hostName : null;
      if (!hostName && namedHostId) {
        try {
          const host = await ctx.db.get(namedHostId as Id<"hosts">);
          if (host && String(host.projectId) === row.projectId) {
            hostName = host.name;
          }
        } catch {
          // leave null
        }
      }
      return {
        namedHostId,
        enabledOptionalServerIds: Array.isArray(
          attachment?.enabledOptionalServerIds,
        )
          ? attachment.enabledOptionalServerIds
          : [],
        hostName,
        resolvedServerNames: Array.isArray(attachment?.resolvedServerNames)
          ? attachment.resolvedServerNames
          : [],
      };
    }),
  );

  const serverAttachment = await hydrateServerAttachment(
    ctx,
    row.projectId,
    row.serverAttachmentId,
  );

  // When hosts were attached without a per-host server snapshot, inherit
  // the suite server group's resolved names so host-axis helpers still work.
  if (serverAttachment && serverAttachment.resolvedServerNames.length > 0) {
    for (const attachment of hostAttachments) {
      if (attachment.resolvedServerNames.length === 0) {
        attachment.resolvedServerNames = [
          ...serverAttachment.resolvedServerNames,
        ];
      }
    }
  }

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
    ...(serverAttachment ? { serverAttachment } : {}),
    hostAttachments,
    source: "ui" as const,
  };
}

async function overviewEntry(ctx: { db: any }, row: any, createdBy: string) {
  const runs = await ctx.db
    .query("evalSuiteRuns")
    .withIndex("by_suite", (q: any) => q.eq("suiteId", String(row._id)))
    .collect();
  runs.sort((a: any, b: any) => b.createdAt - a.createdAt);
  const latest = runs[0];
  return {
    suite: await suiteDto(ctx, row, createdBy),
    latestRun: latest ? runDto(latest, createdBy) : null,
    recentRuns: runs.slice(0, 5).map((r: any) => runDto(r, createdBy)),
    passRateTrend: [],
    totals: {
      passed: runs.filter((r: any) => r.result === "passed").length,
      failed: runs.filter((r: any) => r.result === "failed").length,
      runs: runs.length,
    },
  };
}

function runDto(row: any, createdBy: string) {
  return {
    _id: String(row._id),
    suiteId: row.suiteId,
    createdBy: String(row.createdBy ?? createdBy),
    projectId: row.projectId,
    runNumber: row.runNumber ?? 1,
    configRevision: "1",
    configSnapshot: row.configSnapshot ?? { tests: [], environment: { servers: [] } },
    status: row.status ?? "pending",
    summary: row.summary,
    passCriteria: row.passCriteria,
    matchOptionsOverride: row.matchOptionsOverride,
    result: row.result ?? "pending",
    stopReason: row.stopReason,
    source: row.source ?? "ui",
    notes: row.notes,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    expectedIterations: row.expectedIterations,
    namedHostId: row.namedHostId,
    runGroupId: row.runGroupId,
    runInsightsStatus: row.runInsightsStatus,
    runInsights: row.runInsights,
    serverQualityStatus: row.serverQualityStatus,
    serverQuality: row.serverQuality,
    _creationTime: row.createdAt,
  };
}

function iterationDto(row: any) {
  return {
    _id: String(row._id),
    // Client matrix / pass-rate helpers key off suiteRunId, not runId.
    suiteRunId: row.runId,
    runId: row.runId,
    suiteId: row.suiteId,
    testCaseId: row.testCaseId,
    iterationNumber: row.iterationNumber,
    status: row.status,
    result: row.result ?? "pending",
    testCaseSnapshot: row.testCaseSnapshot,
    actualToolCalls: row.actualToolCalls ?? [],
    tokensUsed: row.tokensUsed ?? 0,
    error: row.error,
    errorDetails: row.errorDetails,
    metadata: row.metadata,
    messages: row.messages,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: String(row.createdBy ?? ""),
    trigger: "suite" as const,
    _creationTime: row.createdAt,
  };
}

function caseDto(c: any) {
  return {
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
  };
}

const DEFAULT_RUN_MODEL = {
  model: "openai/gpt-4o-mini",
  provider: "openai",
};

function modelsForCase(c: any): Array<{ model: string; provider: string }> {
  if (Array.isArray(c.models) && c.models.length > 0) {
    return c.models
      .filter(
        (m: any) =>
          m && typeof m.model === "string" && typeof m.provider === "string",
      )
      .map((m: any) => ({ model: m.model, provider: m.provider }));
  }
  if (c.model && c.provider) {
    return [{ model: c.model, provider: c.provider }];
  }
  return [DEFAULT_RUN_MODEL];
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

    const entries = await Promise.all(
      rows.map((row) =>
        overviewEntry(ctx, row, String(row.createdBy ?? user._id)),
      ),
    );
    return entries.sort((a, b) => b.suite.updatedAt - a.suite.updatedAt);
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
    return suiteDto(ctx, row, String(row.createdBy ?? user._id));
  },
});

export const getAllTestCasesAndIterationsBySuite = query({
  args: { suiteId: v.string() },
  handler: async (ctx, args) => {
    const cases = await ctx.db
      .query("evalTestCases")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    const runs = await ctx.db
      .query("evalSuiteRuns")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    const runIds = new Set(runs.map((r) => String(r._id)));
    const allIters = [];
    for (const runId of runIds) {
      const iters = await ctx.db
        .query("evalTestIterations")
        .withIndex("by_run", (q: any) => q.eq("runId", runId))
        .collect();
      allIters.push(...iters.map(iterationDto));
    }
    return {
      testCases: cases.map(caseDto),
      iterations: allIters,
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
    return cases.map(caseDto);
  },
});

export const listTestIterations = query({
  args: {
    suiteId: v.optional(v.string()),
    testCaseId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.suiteId && !args.testCaseId) return [];
    let runs: any[] = [];
    if (args.suiteId) {
      runs = await ctx.db
        .query("evalSuiteRuns")
        .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
        .collect();
    }
    const out: any[] = [];
    for (const run of runs) {
      const iters = await ctx.db
        .query("evalTestIterations")
        .withIndex("by_run", (q: any) => q.eq("runId", String(run._id)))
        .collect();
      for (const iter of iters) {
        if (args.testCaseId && iter.testCaseId !== args.testCaseId) continue;
        out.push(iterationDto(iter));
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return args.limit ? out.slice(0, args.limit) : out;
  },
});

export const getTestIteration = query({
  args: {
    iterationId: v.string(),
    suiteId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const row = await ctx.db.get(args.iterationId as Id<"evalTestIterations">);
      if (!row) return null;
      return iterationDto(row);
    } catch {
      return null;
    }
  },
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
  handler: async (ctx, args) => {
    const user = await currentUser(ctx);
    const runs = await ctx.db
      .query("evalSuiteRuns")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    runs.sort((a, b) => b.createdAt - a.createdAt);
    const limited = args.limit ? runs.slice(0, args.limit) : runs;
    return limited.map((r) =>
      runDto(r, String(r.createdBy ?? user?._id ?? "")),
    );
  },
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

    let hostAttachments = args.hostAttachments;
    if (hostAttachments !== undefined) {
      const nextServerAttachmentId =
        args.serverAttachmentId !== undefined
          ? args.serverAttachmentId
          : row.serverAttachmentId;
      const serverAttachment = await hydrateServerAttachment(
        ctx,
        row.projectId,
        nextServerAttachmentId,
      );
      const inheritedNames = serverAttachment?.resolvedServerNames ?? [];
      const list = Array.isArray(hostAttachments) ? hostAttachments : [];
      hostAttachments = await Promise.all(
        list.map(async (attachment: any) => {
          const namedHostId = String(attachment?.namedHostId ?? "");
          let hostName =
            typeof attachment?.hostName === "string"
              ? attachment.hostName
              : null;
          if (!hostName && namedHostId) {
            try {
              const host = await ctx.db.get(namedHostId as Id<"hosts">);
              if (host && String(host.projectId) === row.projectId) {
                hostName = host.name;
              }
            } catch {
              // leave null
            }
          }
          const resolvedServerNames = Array.isArray(
            attachment?.resolvedServerNames,
          )
            ? attachment.resolvedServerNames
            : [];
          return {
            namedHostId,
            enabledOptionalServerIds: Array.isArray(
              attachment?.enabledOptionalServerIds,
            )
              ? attachment.enabledOptionalServerIds
              : [],
            hostName,
            resolvedServerNames:
              resolvedServerNames.length > 0
                ? resolvedServerNames
                : [...inheritedNames],
          };
        }),
      );
    }

    await ctx.db.patch(row._id, {
      ...(args.name !== undefined ? { name: args.name.trim() || row.name } : {}),
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.tags !== undefined ? { tags: args.tags } : {}),
      ...(args.serverAttachmentId !== undefined
        ? { serverAttachmentId: args.serverAttachmentId }
        : {}),
      ...(hostAttachments !== undefined ? { hostAttachments } : {}),
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
  handler: async (ctx, args) => {
    try {
      const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
      if (!run) return { deleted: false };
      await requireProjectMembership(ctx, run.projectId);
      const iters = await ctx.db
        .query("evalTestIterations")
        .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
        .collect();
      for (const iter of iters) {
        await ctx.db.delete(iter._id);
      }
      await ctx.db.delete(run._id);
      return { deleted: true };
    } catch {
      return { deleted: false };
    }
  },
});

export const cancelTestSuiteRun = mutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    try {
      const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
      if (!run) return { cancelled: false };
      await requireProjectMembership(ctx, run.projectId);
      const now = Date.now();
      await ctx.db.patch(run._id, {
        status: "cancelled",
        result: "cancelled",
        stopReason: "user_cancelled",
        completedAt: now,
        updatedAt: now,
      });
      const iters = await ctx.db
        .query("evalTestIterations")
        .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
        .collect();
      for (const iter of iters) {
        if (iter.status === "pending" || iter.status === "running") {
          await ctx.db.patch(iter._id, {
            status: "cancelled",
            result: "cancelled",
            updatedAt: now,
            completedAt: now,
          });
        }
      }
      return { cancelled: true };
    } catch {
      return { cancelled: false };
    }
  },
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

// ── Suite run lifecycle (Inspector evals runner) ────────────────────────────

export const startTestSuiteRun = mutation({
  args: {
    suiteId: v.string(),
    notes: v.optional(v.string()),
    passCriteria: v.optional(v.any()),
    replayedFromRunId: v.optional(v.string()),
    useCurrentSuiteConfig: v.optional(v.boolean()),
    environmentOverride: v.optional(v.any()),
    toolSnapshot: v.optional(v.any()),
    toolSnapshotDebug: v.optional(v.any()),
    iterationOverride: v.optional(v.number()),
    caseIds: v.optional(v.array(v.string())),
    matchOptionsOverride: v.optional(v.any()),
    namedHostId: v.optional(v.string()),
    runGroupId: v.optional(v.string()),
    environmentId: v.optional(v.string()),
    expectedEnvironmentRevision: v.optional(v.number()),
    expectedEnvironmentHostConfigId: v.optional(v.string()),
    expectedEnvironmentServerIds: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    skillsOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const suite = await ctx.db.get(args.suiteId as Id<"evalSuites">);
    if (!suite) throw new Error("Suite not found");
    const { user } = await requireProjectMembership(ctx, suite.projectId);

    let cases = await ctx.db
      .query("evalTestCases")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    if (args.caseIds && args.caseIds.length > 0) {
      const allow = new Set(args.caseIds);
      cases = cases.filter((c) => allow.has(String(c._id)));
    }
    if (cases.length === 0) {
      throw new Error("Suite has no test cases to run");
    }

    const suiteDtoValue = await suiteDto(ctx, suite, String(user._id));
    // Prefer stable server IDs — never display names. Names break
    // resolveConfiguredServerIds / getToolsForAiSdk and leave runs PENDING
    // with iterations stuck at "Running 0/1".
    const serversFromAttachmentIds = Array.isArray(
      suiteDtoValue.serverAttachment?.serverIds,
    )
      ? suiteDtoValue.serverAttachment.serverIds.filter(
          (id: unknown): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    const serversFromOverride = Array.isArray(args.environmentOverride?.servers)
      ? args.environmentOverride.servers.filter(
          (id: unknown): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    const serversFromSnapshot = Array.isArray(args.toolSnapshot?.servers)
      ? args.toolSnapshot.servers
          .map((s: any) =>
            typeof s?.serverId === "string" ? s.serverId : null,
          )
          .filter((id: string | null): id is string => Boolean(id))
      : [];
    const environmentServers =
      serversFromOverride.length > 0
        ? serversFromOverride
        : serversFromAttachmentIds.length > 0
          ? serversFromAttachmentIds
          : serversFromSnapshot;

    const attachmentNames = Array.isArray(
      suiteDtoValue.serverAttachment?.resolvedServerNames,
    )
      ? suiteDtoValue.serverAttachment.resolvedServerNames
      : [];
    const serverBindings =
      Array.isArray(args.environmentOverride?.serverBindings) &&
      args.environmentOverride.serverBindings.length > 0
        ? args.environmentOverride.serverBindings
        : serversFromAttachmentIds.length > 0 &&
            attachmentNames.length === serversFromAttachmentIds.length
          ? serversFromAttachmentIds.map((projectServerId: string, i: number) => ({
              serverName: attachmentNames[i],
              projectServerId,
            }))
          : undefined;

    const testCases = cases.map((c) => {
      const runs =
        typeof args.iterationOverride === "number" &&
        args.iterationOverride > 0
          ? Math.floor(args.iterationOverride)
          : (c.runs ?? 1);
      return {
        ...caseDto(c),
        models: modelsForCase(c),
        runs,
      };
    });

    const existingRuns = await ctx.db
      .query("evalSuiteRuns")
      .withIndex("by_suite", (q: any) => q.eq("suiteId", args.suiteId))
      .collect();
    const runNumber = existingRuns.length + 1;
    const now = Date.now();
    const expectedIterations = testCases.reduce((sum, tc) => {
      const modelCount = Math.max(1, modelsForCase(tc).length);
      return sum + modelCount * (tc.runs || 1);
    }, 0);

    const configSnapshot = {
      tests: testCases.map((tc) => ({
        title: tc.title,
        query: tc.query,
        models: tc.models,
        runs: tc.runs,
        expectedToolCalls: tc.expectedToolCalls,
        isNegativeTest: tc.isNegativeTest,
        expectedOutput: tc.expectedOutput,
        steps: tc.steps,
        testCaseId: tc._id,
      })),
      environment: {
        servers: environmentServers,
        ...(serverBindings ? { serverBindings } : {}),
      },
      defaultPredicates: [],
      skillsExcluded: args.skillsOverride === "exclude",
    };

    const runId = await ctx.db.insert("evalSuiteRuns", {
      suiteId: args.suiteId,
      projectId: suite.projectId,
      runNumber,
      // Mark running immediately so the UI doesn't stick on "pending" if the
      // Node worker is slow to call precreateIterationsForRun.
      status: "running",
      result: "pending",
      notes: args.notes,
      passCriteria: args.passCriteria,
      configSnapshot,
      toolSnapshot: args.toolSnapshot,
      toolSnapshotDebug: args.toolSnapshotDebug,
      namedHostId: args.namedHostId,
      runGroupId: args.runGroupId,
      source: args.source ?? "ui",
      expectedIterations,
      matchOptionsOverride: args.matchOptionsOverride,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(suite._id, { updatedAt: now });

    // Pre-create iterations in the same mutation so a worker crash between
    // startTestSuiteRun and precreateIterationsForRun cannot leave an empty
    // pending run with nothing for the cross-client matrix to show.
    let createdIterations = 0;
    for (const tc of testCases) {
      const models = modelsForCase(tc);
      const runsCount = Math.max(1, Number(tc.runs) || 1);
      for (const model of models) {
        for (let i = 1; i <= runsCount; i++) {
          await ctx.db.insert("evalTestIterations", {
            runId: String(runId),
            suiteId: args.suiteId,
            testCaseId: tc._id,
            iterationNumber: i,
            status: "pending",
            result: "pending",
            testCaseSnapshot: {
              title: tc.title,
              query: tc.query ?? "",
              model: model.model,
              provider: model.provider,
              expectedToolCalls: tc.expectedToolCalls ?? [],
              isNegativeTest: tc.isNegativeTest === true,
              expectedOutput: tc.expectedOutput,
              steps: tc.steps,
              runs: runsCount,
              testCaseId: tc._id,
            },
            createdBy: user._id,
            createdAt: now,
            updatedAt: now,
          });
          createdIterations += 1;
        }
      }
    }

    await ctx.db.patch(runId, {
      expectedIterations: createdIterations,
      updatedAt: Date.now(),
    });

    let hostConfig: Record<string, unknown> | undefined;
    if (args.namedHostId) {
      try {
        const host = await ctx.db.get(args.namedHostId as Id<"hosts">);
        if (host && String(host.projectId) === suite.projectId) {
          const raw =
            host.config && typeof host.config === "object" ? host.config : {};
          hostConfig = {
            id: String(host._id),
            schemaVersion:
              typeof (raw as any).schemaVersion === "number"
                ? (raw as any).schemaVersion
                : 2,
            hostStyle: (raw as any).hostStyle ?? "mcpjam",
            modelId:
              typeof (raw as any).modelId === "string"
                ? (raw as any).modelId
                : "",
            systemPrompt:
              typeof (raw as any).systemPrompt === "string"
                ? (raw as any).systemPrompt
                : "",
            temperature:
              typeof (raw as any).temperature === "number"
                ? (raw as any).temperature
                : 0.7,
            serverIds: Array.isArray((raw as any).serverIds)
              ? (raw as any).serverIds
              : [],
            optionalServerIds: Array.isArray((raw as any).optionalServerIds)
              ? (raw as any).optionalServerIds
              : [],
            connectionDefaults: (raw as any).connectionDefaults ?? {
              headers: {},
              requestTimeout: 10000,
            },
            clientCapabilities: (raw as any).clientCapabilities ?? {},
            hostContext: (raw as any).hostContext ?? {},
          };
        }
      } catch {
        // leave undefined — prepareEvalRun will load via hosts:getHost
      }
    }

    return {
      runId: String(runId),
      testCases,
      configSnapshot,
      ...(hostConfig ? { hostConfig } : {}),
    };
  },
});

export const precreateIterationsForRun = mutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
    if (!run) throw new Error("Run not found");
    await requireProjectMembership(ctx, run.projectId);

    const existing = await ctx.db
      .query("evalTestIterations")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    // startTestSuiteRun now precreates iterations; this remains idempotent for
    // older clients / retries.
    if (existing.length > 0) {
      const now = Date.now();
      if (run.status === "pending") {
        await ctx.db.patch(run._id, { status: "running", updatedAt: now });
      }
      return { created: 0, alreadyExists: true };
    }

    const tests = Array.isArray(run.configSnapshot?.tests)
      ? run.configSnapshot.tests
      : [];
    const now = Date.now();
    let created = 0;

    for (const tc of tests) {
      const testCaseId = String(tc.testCaseId ?? tc._id ?? "");
      const models = modelsForCase(tc);
      const runs = Math.max(1, Number(tc.runs) || 1);
      for (const model of models) {
        for (let i = 1; i <= runs; i++) {
          await ctx.db.insert("evalTestIterations", {
            runId: args.runId,
            suiteId: run.suiteId,
            testCaseId,
            iterationNumber: i,
            status: "pending",
            result: "pending",
            testCaseSnapshot: {
              title: tc.title,
              query: tc.query ?? "",
              model: model.model,
              provider: model.provider,
              expectedToolCalls: tc.expectedToolCalls ?? [],
              isNegativeTest: tc.isNegativeTest === true,
              expectedOutput: tc.expectedOutput,
              steps: tc.steps,
              runs,
              testCaseId,
            },
            createdBy: run.createdBy,
            createdAt: now,
            updatedAt: now,
          });
          created += 1;
        }
      }
    }

    await ctx.db.patch(run._id, {
      status: "running",
      updatedAt: now,
      expectedIterations: created,
    });

    return { created };
  },
});

export const markSetupPendingIterationsFailed = mutation({
  args: {
    runId: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
    if (!run) return { updated: 0 };
    await requireProjectMembership(ctx, run.projectId);
    const now = Date.now();
    const iters = await ctx.db
      .query("evalTestIterations")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    let updated = 0;
    for (const iter of iters) {
      if (iter.status === "pending") {
        await ctx.db.patch(iter._id, {
          status: "failed",
          result: "failed",
          error: args.error ?? "Failed to prepare eval test attempts.",
          updatedAt: now,
          completedAt: now,
        });
        updated += 1;
      }
    }
    return { updated };
  },
});

export const getTestSuiteRun = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    try {
      const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
      if (!run) return null;
      return runDto(run, String(run.createdBy ?? ""));
    } catch {
      return null;
    }
  },
});

export const getTestSuiteRunDetails = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    try {
      const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
      if (!run) return null;
      const iterations = await ctx.db
        .query("evalTestIterations")
        .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
        .collect();
      return {
        run: runDto(run, String(run.createdBy ?? "")),
        iterations: iterations.map(iterationDto),
      };
    } catch {
      return null;
    }
  },
});

export const startTestIteration = mutation({
  args: { iterationId: v.string() },
  handler: async (ctx, args) => {
    const iter = await ctx.db.get(args.iterationId as Id<"evalTestIterations">);
    if (!iter) throw new Error("Iteration not found");
    const run = await ctx.db.get(iter.runId as Id<"evalSuiteRuns">);
    if (!run) throw new Error("Run not found");
    await requireProjectMembership(ctx, run.projectId);
    const now = Date.now();
    await ctx.db.patch(iter._id, {
      status: "running",
      startedAt: now,
      updatedAt: now,
    });
    if (run.status === "pending") {
      await ctx.db.patch(run._id, { status: "running", updatedAt: now });
    }
    return { _id: String(iter._id) };
  },
});

export const updateTestSuiteRun = mutation({
  args: {
    runId: v.string(),
    status: v.optional(v.string()),
    summary: v.optional(v.any()),
    notes: v.optional(v.string()),
    stopReason: v.optional(v.string()),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
    if (!run) throw new Error("Run not found");
    await requireProjectMembership(ctx, run.projectId);
    const now = Date.now();
    const status = args.status ?? run.status;
    const terminal =
      status === "completed" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "timed_out";
    let result = args.result ?? run.result;
    if (!args.result && terminal && args.summary) {
      const passed = Number(args.summary?.passed ?? 0);
      const failed = Number(args.summary?.failed ?? 0);
      result =
        status === "cancelled"
          ? "cancelled"
          : failed > 0 && passed === 0
            ? "failed"
            : failed > 0
              ? "failed"
              : "passed";
    }
    await ctx.db.patch(run._id, {
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.summary !== undefined ? { summary: args.summary } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.stopReason !== undefined ? { stopReason: args.stopReason } : {}),
      ...(result !== undefined ? { result } : {}),
      ...(terminal ? { completedAt: now } : {}),
      updatedAt: now,
    });
    return { _id: String(run._id) };
  },
});

export const heartbeatTestSuiteRun = mutation({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    try {
      const run = await ctx.db.get(args.runId as Id<"evalSuiteRuns">);
      if (!run) return { ok: false };
      await ctx.db.patch(run._id, { updatedAt: Date.now() });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  },
});

export const _patchTestIteration = internalMutation({
  args: {
    iterationId: v.string(),
    status: v.optional(v.string()),
    result: v.optional(v.string()),
    actualToolCalls: v.optional(v.any()),
    tokensUsed: v.optional(v.number()),
    messages: v.optional(v.any()),
    systemPrompt: v.optional(v.string()),
    spans: v.optional(v.any()),
    prompts: v.optional(v.any()),
    widgetSnapshots: v.optional(v.any()),
    widgetRenderObservations: v.optional(v.any()),
    browserInteractionSteps: v.optional(v.any()),
    videoBlobId: v.optional(v.string()),
    error: v.optional(v.string()),
    errorDetails: v.optional(v.any()),
    resultSource: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const iter = await ctx.db.get(args.iterationId as Id<"evalTestIterations">);
    if (!iter) throw new Error("Iteration not found");
    const now = Date.now();
    const status = args.status ?? iter.status;
    const terminal =
      status === "completed" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "timed_out";
    await ctx.db.patch(iter._id, {
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.result !== undefined ? { result: args.result } : {}),
      ...(args.actualToolCalls !== undefined
        ? { actualToolCalls: args.actualToolCalls }
        : {}),
      ...(args.tokensUsed !== undefined ? { tokensUsed: args.tokensUsed } : {}),
      ...(args.messages !== undefined ? { messages: args.messages } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.errorDetails !== undefined
        ? { errorDetails: args.errorDetails }
        : {}),
      ...(args.metadata !== undefined ||
      args.systemPrompt !== undefined ||
      args.spans !== undefined ||
      args.prompts !== undefined ||
      args.widgetSnapshots !== undefined ||
      args.videoBlobId !== undefined ||
      args.resultSource !== undefined
        ? {
            metadata: {
              ...(iter.metadata && typeof iter.metadata === "object"
                ? iter.metadata
                : {}),
              ...(args.metadata && typeof args.metadata === "object"
                ? args.metadata
                : {}),
              ...(args.systemPrompt !== undefined
                ? { systemPrompt: args.systemPrompt }
                : {}),
              ...(args.spans !== undefined ? { spans: args.spans } : {}),
              ...(args.prompts !== undefined ? { prompts: args.prompts } : {}),
              ...(args.widgetSnapshots !== undefined
                ? { widgetSnapshots: args.widgetSnapshots }
                : {}),
              ...(args.videoBlobId !== undefined
                ? { videoBlobId: args.videoBlobId }
                : {}),
              ...(args.resultSource !== undefined
                ? { resultSource: args.resultSource }
                : {}),
            },
          }
        : {}),
      ...(terminal ? { completedAt: now } : {}),
      updatedAt: now,
    });
    return { _id: String(iter._id) };
  },
});

export const updateTestIteration = action({
  args: {
    iterationId: v.string(),
    status: v.optional(v.string()),
    result: v.optional(v.string()),
    actualToolCalls: v.optional(v.any()),
    tokensUsed: v.optional(v.number()),
    messages: v.optional(v.any()),
    systemPrompt: v.optional(v.string()),
    spans: v.optional(v.any()),
    prompts: v.optional(v.any()),
    widgetSnapshots: v.optional(v.any()),
    widgetRenderObservations: v.optional(v.any()),
    browserInteractionSteps: v.optional(v.any()),
    videoBlobId: v.optional(v.string()),
    error: v.optional(v.string()),
    errorDetails: v.optional(v.any()),
    resultSource: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<{ _id: string }> => {
    // Cast avoids a circular inference with `_generated/api` before deploy codegen.
    return await ctx.runMutation(
      (internal as any).testSuites._patchTestIteration,
      args,
    );
  },
});

export const appendEvalTurnTrace = action({
  args: {
    iterationId: v.string(),
    modelId: v.optional(v.string()),
    modelSource: v.optional(v.any()),
    displayLabel: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    systemPrompt: v.optional(v.string()),
    videoBlobId: v.optional(v.string()),
    turn: v.optional(v.any()),
  },
  handler: async () => ({ ok: true, persisted: false }),
});

export const lockEvalSession = action({
  args: {
    iterationId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async () => ({ ok: true }),
});

export const getRunReplayMetadata = query({
  args: { runId: v.string() },
  handler: async () => null,
});

export const getRunPinnedSkills = query({
  args: { runId: v.optional(v.string()) },
  handler: async () => ({ pinnedSkills: [] }),
});

/** Suite plugin pin re-gate. Legacy/host runs pin nothing — empty all-clear. */
export const resolveRunPluginServersForExecution = query({
  args: { runId: v.string() },
  handler: async () => ({
    servers: [],
    unavailable: [],
    droppedSnapshotServerIds: [],
  }),
});
