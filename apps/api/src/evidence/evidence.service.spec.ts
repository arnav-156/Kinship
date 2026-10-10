import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { EvidenceService } from "./evidence.service";

const principal: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [
    {
      role: "member",
      workspaceId: "workspace_1",
    },
  ],
};

describe("EvidenceService", () => {
  it("blocks ingestion for workspaces outside the principal memberships", async () => {
    const service = new EvidenceService({} as never, {} as never);

    await expect(
      service.ingest(principal, {
        sourceIdentifier: "https://example.com",
        sourceType: "user_url",
        workspaceId: "workspace_2",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("stores an immutable raw snapshot before committing its database pointer", async () => {
    const sourceSnapshotUpsert = vi.fn().mockResolvedValue({ id: "snapshot_1" });
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma),
    );
    const prisma = {
      $transaction: transaction,
      backgroundJob: {
        update: vi.fn().mockResolvedValue({ id: "job_1" }),
        upsert: vi.fn().mockResolvedValue({ id: "job_1" }),
      },
      entity: {
        create: vi.fn().mockResolvedValue({ id: "entity_1" }),
        findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }),
      },
      evidenceItem: { create: vi.fn().mockResolvedValue({ id: "evidence_1" }) },
      retentionPolicy: {
        findUnique: vi.fn().mockResolvedValue({ enabled: true, retentionDays: 30 }),
      },
      sourceSnapshot: { upsert: sourceSnapshotUpsert },
    };
    const putSnapshot = vi.fn().mockResolvedValue({ key: "source-snapshots/v1/snapshot_1" });
    const service = new EvidenceService(
      prisma as never,
      { record: vi.fn().mockResolvedValue(undefined) } as never,
      { putSnapshot } as never,
    );

    await service.ingest(principal, {
      context: { manualText: "User-provided relationship context" },
      sourceIdentifier: "https://www.linkedin.com/in/example",
      sourceType: "manual_linkedin_context",
      workspaceId: "workspace_1",
    });

    expect(putSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        body: new TextEncoder().encode("User-provided relationship context"),
        contentType: "text/plain",
        policyStatus: "warn",
        retentionExpiresAt: expect.any(Date),
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    );
    expect(putSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.mock.invocationCallOrder[0]!,
    );
    expect(sourceSnapshotUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          contentType: "text/plain",
          storageKey: "source-snapshots/v1/snapshot_1",
        }),
      }),
    );
  });

  it("lists recent workspace ingestion jobs scoped by tenant and workspace", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new EvidenceService(
      {
        backgroundJob: {
          findMany,
        },
      } as never,
      {} as never,
    );

    await service.listWorkspaceJobs(principal, "workspace_1");

    expect(findMany).toHaveBeenCalledWith({
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        attempts: true,
        createdAt: true,
        failureReason: true,
        id: true,
        jobName: true,
        maxAttempts: true,
        progress: true,
        queueName: true,
        status: true,
        updatedAt: true,
      },
      take: 20,
      where: {
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
  });

  it("deduplicates queued ingestion by Idempotency-Key", async () => {
    const queued = {
      attempts: 0,
      createdAt: new Date(),
      failureReason: null,
      id: "job_1",
      jobName: "evidence.ingest",
      maxAttempts: 3,
      progress: { percent: 0, stage: "queued" },
      queueName: "evidence-ingestion",
      status: "queued",
      updatedAt: new Date(),
    };
    const upsert = vi.fn().mockResolvedValue(queued);
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new EvidenceService(
      { backgroundJob: { upsert } } as never,
      { record } as never,
    );

    await expect(
      service.queueIngestion(
        principal,
        {
          sourceIdentifier: "https://example.com",
          sourceType: "user_url",
          workspaceId: "workspace_1",
        },
        "request-key-123",
      ),
    ).resolves.toEqual(queued);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          idempotencyKey: "request-key-123",
          status: "queued",
        }),
        update: {},
        where: {
          tenantId_queueName_idempotencyKey: {
            idempotencyKey: "request-key-123",
            queueName: "evidence-ingestion",
            tenantId: "tenant_1",
          },
        },
      }),
    );
  });
  it("cancels only queued jobs and records the operator action", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "job_1",
        status: "queued",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      })
      .mockResolvedValueOnce({
        attempts: 0,
        createdAt: new Date(),
        failureReason: null,
        id: "job_1",
        jobName: "evidence.ingest",
        maxAttempts: 3,
        progress: { percent: 0, stage: "canceled" },
        queueName: "evidence-ingestion",
        status: "canceled",
        updatedAt: new Date(),
        workspaceId: "workspace_1",
      });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new EvidenceService(
      {
        backgroundJob: {
          findFirst,
          updateMany,
        },
      } as never,
      { record } as never,
    );

    await expect(service.cancelWorkspaceJob(principal, "job_1")).resolves.toMatchObject({
      id: "job_1",
      status: "canceled",
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "job_1",
          status: "queued",
          tenantId: "tenant_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "background_job.canceled",
        subjectId: "job_1",
      }),
    );
  });

  it("blocks job status reads for workspaces outside the principal memberships", async () => {
    const service = new EvidenceService({} as never, {} as never);

    await expect(service.listWorkspaceJobs(principal, "workspace_2")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("scopes entity evidence reads by tenant before returning evidence", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "entity_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new EvidenceService(
      {
        entity: {
          findFirst,
        },
        evidenceItem: {
          findMany,
        },
      } as never,
      {} as never,
    );

    await service.listEntityEvidence(principal, "entity_1");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        id: "entity_1",
        tenantId: "tenant_1",
      },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityId: "entity_1",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
      }),
    );
  });
  it("returns every relationship activity category in newest-first order", async () => {
    const relationshipNoteFindMany = vi.fn().mockResolvedValue([
      {
        author: { displayName: "Owner", email: "owner@example.local", id: "user_1" },
        body: "Follow up after the conference",
        createdAt: new Date("2026-07-12T10:00:00.000Z"),
        id: "note_1",
        updatedAt: new Date("2026-07-12T10:00:00.000Z"),
      },
    ]);
    const service = new EvidenceService(
      {
        auditEvent: {
          findMany: vi.fn().mockResolvedValue([
            {
              createdAt: new Date("2026-07-17T10:00:00.000Z"),
              eventType: "relationship_outcome.recorded",
              id: "outcome_1",
              metadata: { kind: "reply_received", summary: "Ada replied with interest." },
              user: { displayName: "Owner", email: "owner@example.local", id: "user_1" },
            },
            {
              createdAt: new Date("2026-07-16T10:00:00.000Z"),
              eventType: "compliance.warned",
              id: "policy_1",
              metadata: { decision: "warn", reason: "Consent needs review." },
              user: { displayName: "Owner", email: "owner@example.local", id: "user_1" },
            },
          ]),
        },
        draftMessage: {
          findMany: vi.fn().mockResolvedValue([
            {
              body: "Original draft",
              channelType: "email",
              createdAt: new Date("2026-07-14T10:00:00.000Z"),
              id: "draft_1",
              status: "needs_review",
              tone: "warm professional",
              variant: "warm_professional",
            },
          ]),
        },
        draftMessageVersion: {
          findMany: vi.fn().mockResolvedValue([
            {
              body: "Rewritten draft",
              createdAt: new Date("2026-07-15T10:00:00.000Z"),
              createdBy: {
                displayName: "Owner",
                email: "owner@example.local",
                id: "user_1",
              },
              draft: { id: "draft_1" },
              id: "version_2",
              reason: "rewritten",
              status: "needs_review",
              version: 2,
            },
          ]),
        },
        entity: {
          findFirst: vi.fn().mockResolvedValue({
            id: "entity_1",
            tenantId: "tenant_1",
            workspaceId: "workspace_1",
          }),
        },
        evidenceItem: {
          findMany: vi.fn().mockResolvedValue([
            {
              confidenceScore: 0.8,
              evidenceSummary: "Older evidence",
              freshnessScore: 0.7,
              id: "evidence_1",
              policyStatus: "allowed",
              retrievalTimestamp: new Date("2026-07-11T10:00:00.000Z"),
              sourceType: "user_url",
            },
          ]),
        },
        relationshipBrief: {
          findMany: vi.fn().mockResolvedValue([
            {
              channelRisk: "warn",
              confidenceScore: 0.82,
              createdAt: new Date("2026-07-13T10:00:00.000Z"),
              fitScore: 0.76,
              goal: "Explore collaboration",
              id: "brief_1",
              recommendedChannel: "email",
              summary: "A grounded relationship brief.",
            },
          ]),
        },
        relationshipNote: { findMany: relationshipNoteFindMany },
      } as never,
      {} as never,
    );

    const timeline = await service.relationshipTimeline(principal, "entity_1");

    expect(timeline.items.map((event) => event.type)).toEqual([
      "outcome",
      "policy",
      "draft",
      "draft",
      "brief",
      "note",
      "evidence",
    ]);
    expect(timeline.items[0]).toMatchObject({
      status: "reply_received",
      summary: "Ada replied with interest.",
      title: "Reply received",
    });
    expect(timeline.nextCursor).toBeNull();
    expect(relationshipNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: "entity_1",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
  });

  it("paginates the unified relationship timeline with an opaque cursor", async () => {
    const items = [
      ["evidence_3", "2026-07-13T10:00:00.000Z"],
      ["evidence_2", "2026-07-12T10:00:00.000Z"],
      ["evidence_1", "2026-07-11T10:00:00.000Z"],
    ].map(([id, at]) => ({
      confidenceScore: 0.8,
      evidenceSummary: id,
      freshnessScore: 0.8,
      id,
      policyStatus: "allowed",
      retrievalTimestamp: new Date(at!),
      sourceType: "user_url",
    }));
    const service = new EvidenceService(
      {
        auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
        draftMessage: { findMany: vi.fn().mockResolvedValue([]) },
        draftMessageVersion: { findMany: vi.fn().mockResolvedValue([]) },
        entity: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity_1", workspaceId: "workspace_1" }),
        },
        evidenceItem: { findMany: vi.fn().mockResolvedValue(items) },
        relationshipBrief: { findMany: vi.fn().mockResolvedValue([]) },
        relationshipNote: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
    );

    const firstPage = await service.relationshipTimeline(principal, "entity_1", {
      limit: "2",
      types: "evidence",
    });
    const secondPage = await service.relationshipTimeline(principal, "entity_1", {
      cursor: firstPage.nextCursor!,
      limit: "2",
      types: "evidence",
    });

    expect(firstPage.items.map((item) => item.sourceId)).toEqual(["evidence_3", "evidence_2"]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(secondPage.items.map((item) => item.sourceId)).toEqual(["evidence_1"]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects malformed relationship timeline cursors", async () => {
    const service = new EvidenceService(
      {
        entity: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity_1", workspaceId: "workspace_1" }),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.relationshipTimeline(principal, "entity_1", { cursor: "not-a-cursor" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("records a durable, entity-linked relationship outcome", async () => {
    const record = vi.fn().mockResolvedValue({
      createdAt: new Date("2026-07-17T10:00:00.000Z"),
      id: "audit_1",
    });
    const service = new EvidenceService(
      {
        entity: {
          findFirst: vi.fn().mockResolvedValue({ id: "entity_1", workspaceId: "workspace_1" }),
        },
      } as never,
      { record } as never,
    );

    const outcome = await service.recordRelationshipOutcome(principal, "entity_1", {
      kind: "meeting_held",
      summary: "  Discussed the collaboration window.  ",
    });

    expect(outcome).toMatchObject({
      status: "meeting_held",
      summary: "Discussed the collaboration window.",
      title: "Meeting held",
      type: "outcome",
    });
    expect(record).toHaveBeenCalledWith({
      actorUserId: "user_1",
      eventType: "relationship_outcome.recorded",
      metadata: {
        kind: "meeting_held",
        summary: "Discussed the collaboration window.",
      },
      subjectId: "entity_1",
      subjectType: "entity",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
  });
});
