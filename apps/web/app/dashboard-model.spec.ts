import { describe, expect, it } from "vitest";

import {
  buildOnboardingSteps,
  buildWorkflowProgress,
  classifyCompletedJob,
  createNoteTimelineItem,
  filterAndSortProspects,
  formatAuditEventLabel,
  getBusyActionLabel,
  getToastTone,
  summarizeComplianceDecision,
  summarizeDraftSaveState,
  summarizeJobStatus,
  summarizeSuppressionEntry,
  summarizeWorkspaceHealth,
} from "./dashboard-model.js";

describe("dashboard model", () => {
  it("classifies completed durable AI and evidence job artifacts", () => {
    expect(
      classifyCompletedJob({
        jobName: "relationship_brief.generate",
        progress: { briefId: "brief_1" },
        status: "completed",
      }),
    ).toEqual({ artifactId: "brief_1", kind: "brief" });
    expect(
      classifyCompletedJob({
        jobName: "draft_message.generate",
        progress: { draftId: "draft_1" },
        status: "completed",
      }),
    ).toEqual({ artifactId: "draft_1", kind: "draft" });
    expect(
      classifyCompletedJob({
        jobName: "connector.sync",
        progress: { entityId: "entity_sync" },
        status: "completed",
      }),
    ).toEqual({ artifactId: "entity_sync", kind: "evidence" });
    expect(
      classifyCompletedJob({
        jobName: "evidence.ingest",
        progress: { entityId: "entity_1" },
        status: "completed",
      }),
    ).toEqual({ artifactId: "entity_1", kind: "evidence" });
    expect(
      classifyCompletedJob({
        jobName: "relationship_brief.generate",
        progress: {},
        status: "active",
      }),
    ).toBeNull();
  });

  it("builds ordered onboarding steps from workspace state", () => {
    const steps = buildOnboardingSteps({
      hasBrief: true,
      hasDraft: false,
      hasEvidence: true,
      isAuthenticated: false,
      hasComplianceReview: false,
    });

    expect(steps.map((step) => [step.id, step.complete])).toEqual([
      ["connect", false],
      ["intake", true],
      ["brief", true],
      ["draft", false],
      ["review", false],
    ]);
    expect(steps.find((step) => step.current)?.id).toBe("connect");
  });

  it("marks the next incomplete onboarding step as current", () => {
    const steps = buildOnboardingSteps({
      hasBrief: false,
      hasDraft: false,
      hasEvidence: true,
      isAuthenticated: true,
      hasComplianceReview: false,
    });

    expect(steps.find((step) => step.current)?.id).toBe("brief");
  });

  it("labels active async actions in product language", () => {
    expect(getBusyActionLabel("analyze")).toBe("Analyzing approved context");
    expect(getBusyActionLabel("jobs")).toBe("Refreshing trust status");
    expect(getBusyActionLabel("notes")).toBe("Saving relationship note");
    expect(getBusyActionLabel("privacy")).toBe("Preparing privacy request");
    expect(getBusyActionLabel("retention")).toBe("Applying retention policy");
    expect(getBusyActionLabel(null)).toBe("Ready");
  });

  it("chooses toast tone from status content", () => {
    expect(getToastTone("Registered and connected to the API.")).toBe("success");
    expect(getToastTone("API 500 for /relationship-briefs. Using demo state.")).toBe("danger");
    expect(getToastTone("Email consent is unknown; review before outreach.")).toBe("warning");
  });

  it("summarizes workspace health for the hero metrics", () => {
    expect(
      summarizeWorkspaceHealth({
        auditEventCount: 2,
        evidenceCount: 4,
        prospectCount: 1,
        risk: "warn",
      }),
    ).toEqual({
      activityLabel: "2 events",
      evidenceLabel: "4 items",
      prospectLabel: "1 prospect",
      riskLabel: "Review needed",
    });
  });

  it("summarizes workflow progress from completed outputs", () => {
    expect(
      buildWorkflowProgress({
        hasBrief: true,
        hasComplianceReview: false,
        hasDraft: false,
        hasEvidence: true,
      }),
    ).toEqual({
      completed: 2,
      label: "2 of 4 workflow steps complete",
      percent: 50,
      total: 4,
    });
  });

  it("filters prospects by query/source and prioritizes saved prospects", () => {
    const prospects = [
      {
        entity: { canonicalName: "Grace Hopper", id: "entity_grace" },
        evidence: [{ sourceType: "semantic_scholar", summary: "compiler paper" }],
        fitScore: 0.91,
      },
      {
        entity: { canonicalName: "Ada Lovelace", id: "entity_ada" },
        evidence: [{ sourceType: "github", summary: "analytical engine repo" }],
        fitScore: 0.82,
      },
      {
        entity: { canonicalName: "Alan Turing", id: "entity_alan" },
        evidence: [{ sourceType: "github", summary: "cryptography notes" }],
        fitScore: 0.96,
      },
    ];

    const filtered = filterAndSortProspects(prospects, {
      query: "a",
      savedIds: new Set(["entity_ada"]),
      sort: "saved",
      sourceType: "github",
    });

    expect(filtered.map((prospect) => prospect.entity.id)).toEqual(["entity_ada", "entity_alan"]);
  });

  it("summarizes compliance decisions in plain language", () => {
    expect(
      summarizeComplianceDecision({
        decision: "warn",
        reason: "Compliance review is required",
        warnings: ["Email consent is unknown"],
      }),
    ).toEqual({
      label: "Review needed",
      reason: "Compliance review is required",
      tone: "warning",
      warnings: ["Email consent is unknown"],
    });
  });

  it("summarizes ingestion job status for the trust panel", () => {
    expect(
      summarizeJobStatus({
        attempts: 2,
        jobName: "evidence.ingest",
        status: "completed",
      }),
    ).toEqual({
      detail: "2 attempts",
      label: "Evidence ingest completed",
      tone: "success",
    });
    expect(
      summarizeJobStatus({
        attempts: 1,
        jobName: "evidence.ingest",
        progress: { percent: 30, stage: "fetching_source" },
        status: "active",
      }),
    ).toEqual({
      detail: "fetching source | 30% | 1 attempt",
      label: "Evidence ingest active",
      tone: "info",
    });
    expect(
      summarizeJobStatus({
        attempts: 3,
        failureReason: "Source timed out",
        jobName: "evidence.ingest",
        status: "dead_lettered",
      }),
    ).toEqual({
      detail: "Source timed out",
      label: "Evidence ingest dead lettered",
      tone: "danger",
    });
  });

  it("summarizes suppression entries by scope and channel", () => {
    expect(
      summarizeSuppressionEntry({
        channelType: "email",
        source: "manual",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      detail: "Source: manual",
      label: "Workspace email suppression",
    });
  });

  it("formats audit event labels for human scanning", () => {
    expect(formatAuditEventLabel("suppression.created")).toBe("Suppression created");
    expect(formatAuditEventLabel("evidence.ingested")).toBe("Evidence ingested");
  });

  it("summarizes durable draft save state", () => {
    expect(summarizeDraftSaveState({ dirty: true, savedAt: null, saving: true })).toEqual({
      label: "Saving...",
      tone: "info",
    });
    expect(summarizeDraftSaveState({ dirty: true, error: true, savedAt: null })).toEqual({
      label: "Save failed",
      tone: "warning",
    });
    expect(summarizeDraftSaveState({ dirty: true, savedAt: null })).toEqual({
      label: "Unsaved changes",
      tone: "warning",
    });
    expect(summarizeDraftSaveState({ dirty: false, savedAt: "2026-07-05T10:00:00.000Z" })).toEqual({
      label: "Saved 10:00",
      tone: "success",
    });
  });

  it("creates note timeline items with stable labels", () => {
    expect(
      createNoteTimelineItem(
        "Call after paper deadline",
        "Ada Lovelace",
        "2026-07-05T10:00:00.000Z",
      ),
    ).toEqual({
      body: "Call after paper deadline",
      createdAt: "2026-07-05T10:00:00.000Z",
      eventType: "note.added: Ada Lovelace",
      id: "note_2026-07-05T10-00-00-000Z",
      subjectType: "note",
    });
  });
});
