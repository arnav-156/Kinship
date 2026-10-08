import { describe, expect, it, vi } from "vitest";

import { DeadLetterUtility } from "./dead-letter";

describe("dead-letter utility", () => {
  it("recognizes a scoped scheduled retention cleanup as replayable", async () => {
    const utility = new DeadLetterUtility(
      {
        backgroundJob: {
          findFirst: vi.fn().mockResolvedValue({
            attempts: 3,
            availableAt: new Date("2026-10-08T09:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-10-08T08:00:00.000Z"),
            failureReason: "database unavailable",
            id: "job_retention",
            idempotencyKey: "fixture-retention-job",
            jobName: "retention.cleanup",
            lockedAt: null,
            lockedBy: null,
            maxAttempts: 3,
            payload: {
              cutoffAt: "2026-10-08T08:00:00.000Z",
              dataClass: "evidence",
              tenantId: "tenant_1",
              trigger: "scheduled",
              workspaceId: "workspace_1",
            },
            progress: { percent: 100, stage: "dead_lettered" },
            queueName: "retention-cleanup",
            status: "dead_lettered",
            tenantId: "tenant_1",
            updatedAt: new Date("2026-10-08T10:00:00.000Z"),
            workspaceId: "workspace_1",
          }),
        },
      } as never,
      () => new Date("2026-10-08T12:00:00.000Z"),
    );

    await expect(
      utility.inspect({ operator: "fixture-operator", tenantId: "tenant_1" }, "job_retention"),
    ).resolves.toMatchObject({
      jobName: "retention.cleanup",
      queueName: "retention-cleanup",
      replayable: true,
      replayBlockedReason: null,
    });
  });

  it("recognizes a scoped connector-sync dead letter as replayable", async () => {
    const utility = new DeadLetterUtility(
      {
        backgroundJob: {
          findFirst: vi.fn().mockResolvedValue({
            attempts: 3,
            availableAt: new Date("2026-10-08T09:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-10-08T08:00:00.000Z"),
            failureReason: "provider unavailable",
            id: "job_sync",
            idempotencyKey: "fixture-sync-job",
            jobName: "connector.sync",
            lockedAt: null,
            lockedBy: null,
            maxAttempts: 3,
            payload: {
              connectorAccountId: "connector_1",
              connectorRunId: "run_1",
              provider: "github",
              requestedByUserId: "user_1",
              sourceIdentifier: "https://github.com/example/project",
              tenantId: "tenant_1",
              workspaceId: "workspace_1",
            },
            progress: { percent: 100, stage: "dead_lettered" },
            queueName: "connector-sync",
            status: "dead_lettered",
            tenantId: "tenant_1",
            updatedAt: new Date("2026-10-08T10:00:00.000Z"),
            workspaceId: "workspace_1",
          }),
        },
      } as never,
      () => new Date("2026-10-08T12:00:00.000Z"),
    );

    await expect(
      utility.inspect({ operator: "fixture-operator", tenantId: "tenant_1" }, "job_sync"),
    ).resolves.toMatchObject({
      jobName: "connector.sync",
      queueName: "connector-sync",
      replayable: true,
      replayBlockedReason: null,
    });
  });

  it("recognizes a scoped draft-generation dead letter as replayable", async () => {
    const utility = new DeadLetterUtility(
      {
        backgroundJob: {
          findFirst: vi.fn().mockResolvedValue({
            attempts: 3,
            availableAt: new Date("2026-10-07T09:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-10-06T10:00:00.000Z"),
            failureReason: "provider unavailable",
            id: "job_draft",
            idempotencyKey: "fixture-draft-job",
            jobName: "draft_message.generate",
            lockedAt: null,
            lockedBy: null,
            maxAttempts: 3,
            payload: {
              briefId: "brief_1",
              requestedByUserId: "user_1",
              tenantId: "tenant_1",
              variant: "concise",
              workspaceId: "workspace_1",
            },
            progress: { percent: 100, stage: "dead_lettered" },
            queueName: "draft-generation",
            status: "dead_lettered",
            tenantId: "tenant_1",
            updatedAt: new Date("2026-10-07T10:00:00.000Z"),
            workspaceId: "workspace_1",
          }),
        },
      } as never,
      () => new Date("2026-10-07T12:00:00.000Z"),
    );

    await expect(
      utility.inspect({ operator: "fixture-operator", tenantId: "tenant_1" }, "job_draft"),
    ).resolves.toMatchObject({
      jobName: "draft_message.generate",
      queueName: "draft-generation",
      replayable: true,
      replayBlockedReason: null,
    });
  });

  it("recognizes a scoped brief-generation dead letter as replayable", async () => {
    const utility = new DeadLetterUtility(
      {
        backgroundJob: {
          findFirst: vi.fn().mockResolvedValue({
            attempts: 3,
            availableAt: new Date("2026-07-19T09:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-07-18T10:00:00.000Z"),
            failureReason: "provider unavailable",
            id: "job_brief",
            idempotencyKey: "fixture-brief-job",
            jobName: "relationship_brief.generate",
            lockedAt: null,
            lockedBy: null,
            maxAttempts: 3,
            payload: {
              goal: "research collaboration",
              requestedByUserId: "user_1",
              subjectEntityId: "entity_1",
              tenantId: "tenant_1",
              workspaceId: "workspace_1",
            },
            progress: { percent: 100, stage: "dead_lettered" },
            queueName: "brief-generation",
            status: "dead_lettered",
            tenantId: "tenant_1",
            updatedAt: new Date("2026-07-19T10:00:00.000Z"),
            workspaceId: "workspace_1",
          }),
        },
      } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    await expect(
      utility.inspect({ operator: "fixture-operator", tenantId: "tenant_1" }, "job_brief"),
    ).resolves.toMatchObject({
      jobName: "relationship_brief.generate",
      queueName: "brief-generation",
      replayable: true,
      replayBlockedReason: null,
    });
  });

  it("lists tenant-scoped dead letters and explains replay eligibility", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        attempts: 3,
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
        failureReason: "connector timeout",
        id: "job_evidence",
        jobName: "evidence.ingest",
        maxAttempts: 3,
        payload: {
          sourceIdentifier: "https://example.com/profile",
          sourceType: "user_url",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
        queueName: "evidence-ingestion",
        updatedAt: new Date("2026-07-19T10:00:00.000Z"),
        workspaceId: "workspace_1",
      },
      {
        attempts: 1,
        createdAt: new Date("2026-07-17T10:00:00.000Z"),
        failureReason: "legacy worker stopped",
        id: "job_legacy",
        jobName: "legacy.sync",
        maxAttempts: 3,
        payload: {},
        queueName: "legacy-queue",
        updatedAt: new Date("2026-07-18T10:00:00.000Z"),
        workspaceId: null,
      },
    ]);
    const utility = new DeadLetterUtility(
      { backgroundJob: { findMany } } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    const result = await utility.list(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      { limit: 25, workspaceId: "workspace_1" },
    );

    expect(result).toEqual({
      count: 2,
      generatedAt: "2026-07-19T12:00:00.000Z",
      items: [
        {
          attempts: 3,
          createdAt: "2026-07-18T10:00:00.000Z",
          failureReason: "connector timeout",
          id: "job_evidence",
          jobName: "evidence.ingest",
          maxAttempts: 3,
          queueName: "evidence-ingestion",
          replayable: true,
          replayBlockedReason: null,
          updatedAt: "2026-07-19T10:00:00.000Z",
          workspaceId: "workspace_1",
        },
        {
          attempts: 1,
          createdAt: "2026-07-17T10:00:00.000Z",
          failureReason: "legacy worker stopped",
          id: "job_legacy",
          jobName: "legacy.sync",
          maxAttempts: 3,
          queueName: "legacy-queue",
          replayable: false,
          replayBlockedReason:
            "Only evidence ingestion, brief generation, draft generation, connector sync, or scheduled retention cleanup jobs can be replayed",
          updatedAt: "2026-07-18T10:00:00.000Z",
          workspaceId: null,
        },
      ],
      limit: 25,
      scope: { tenantId: "tenant_1", workspaceId: "workspace_1" },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 25,
        where: {
          status: "dead_lettered",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
      }),
    );
  });

  it("inspects one tenant-scoped dead letter with replay guidance", async () => {
    const payload = {
      sourceIdentifier: "https://example.com/profile",
      sourceType: "user_url",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const findFirst = vi.fn().mockResolvedValue({
      attempts: 3,
      availableAt: new Date("2026-07-19T09:00:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-07-18T10:00:00.000Z"),
      failureReason: "connector timeout",
      id: "job_evidence",
      idempotencyKey: "fixture-evidence-job",
      jobName: "evidence.ingest",
      lockedAt: null,
      lockedBy: null,
      maxAttempts: 3,
      payload,
      progress: { percent: 100, stage: "dead_lettered" },
      queueName: "evidence-ingestion",
      status: "dead_lettered",
      updatedAt: new Date("2026-07-19T10:00:00.000Z"),
      workspaceId: "workspace_1",
    });
    const utility = new DeadLetterUtility(
      { backgroundJob: { findFirst } } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    const result = await utility.inspect(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      "job_evidence",
    );

    expect(result).toEqual({
      attempts: 3,
      availableAt: "2026-07-19T09:00:00.000Z",
      completedAt: null,
      confirmation: "REPLAY DEAD LETTER job_evidence",
      createdAt: "2026-07-18T10:00:00.000Z",
      failureReason: "connector timeout",
      generatedAt: "2026-07-19T12:00:00.000Z",
      id: "job_evidence",
      idempotencyKey: "fixture-evidence-job",
      jobName: "evidence.ingest",
      lockedAt: null,
      lockedBy: null,
      maxAttempts: 3,
      payload,
      progress: { percent: 100, stage: "dead_lettered" },
      queueName: "evidence-ingestion",
      replayable: true,
      replayBlockedReason: null,
      status: "dead_lettered",
      updatedAt: "2026-07-19T10:00:00.000Z",
      workspaceId: "workspace_1",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "job_evidence",
        status: "dead_lettered",
        tenantId: "tenant_1",
      },
    });
  });

  it("atomically requeues an eligible dead letter with a fresh bounded attempt cycle", async () => {
    const job = {
      attempts: 3,
      availableAt: new Date("2026-07-19T09:00:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-07-18T10:00:00.000Z"),
      failureReason: "connector timeout",
      id: "job_evidence",
      idempotencyKey: "fixture-evidence-job",
      jobName: "evidence.ingest",
      lockedAt: null,
      lockedBy: null,
      maxAttempts: 3,
      payload: {
        sourceIdentifier: "https://example.com/profile",
        sourceType: "user_url",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      progress: { percent: 100, stage: "dead_lettered" },
      queueName: "evidence-ingestion",
      status: "dead_lettered",
      tenantId: "tenant_1",
      updatedAt: new Date("2026-07-19T10:00:00.000Z"),
      workspaceId: "workspace_1",
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const replayed = {
      attempts: 0,
      failureReason: null,
      id: "job_evidence",
      jobName: "evidence.ingest",
      maxAttempts: 3,
      progress: { percent: 0, stage: "queued" },
      queueName: "evidence-ingestion",
      status: "queued",
      updatedAt: new Date("2026-07-19T12:00:00.000Z"),
    };
    const findUnique = vi.fn().mockResolvedValue(replayed);
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const transaction = vi.fn(async (callback) =>
      callback({
        auditEvent: { create: auditCreate },
        backgroundJob: { findUnique, updateMany },
      }),
    );
    const utility = new DeadLetterUtility(
      {
        $transaction: transaction,
        backgroundJob: { findFirst: vi.fn().mockResolvedValue(job) },
      } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    const result = await utility.executeReplay(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      "job_evidence",
      "REPLAY DEAD LETTER job_evidence",
    );

    expect(result).toEqual({
      auditEventId: "audit_1",
      job: replayed,
      replayedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        attempts: 0,
        availableAt: new Date("2026-07-19T12:00:00.000Z"),
        completedAt: null,
        failureReason: null,
        lockedAt: null,
        lockedBy: null,
        progress: { percent: 0, stage: "queued" },
        status: "queued",
      },
      where: {
        id: "job_evidence",
        queueName: "evidence-ingestion",
        status: "dead_lettered",
        tenantId: "tenant_1",
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        eventType: "background_job.replay_requested",
        metadata: {
          operator: "fixture-operator",
          previousAttempts: 3,
          previousFailureReason: "connector timeout",
          previousMaxAttempts: 3,
          previousStatus: "dead_lettered",
          trigger: "administrative",
        },
        subjectId: "job_evidence",
        subjectType: "background_job",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      select: { id: true },
    });
  });

  it("blocks replay when the stored payload scope does not match the job row", async () => {
    const utility = new DeadLetterUtility(
      {
        backgroundJob: {
          findFirst: vi.fn().mockResolvedValue({
            attempts: 3,
            availableAt: new Date("2026-07-19T09:00:00.000Z"),
            completedAt: null,
            createdAt: new Date("2026-07-18T10:00:00.000Z"),
            failureReason: "connector timeout",
            id: "job_evidence",
            idempotencyKey: "fixture-evidence-job",
            jobName: "evidence.ingest",
            lockedAt: null,
            lockedBy: null,
            maxAttempts: 3,
            payload: {
              sourceIdentifier: "https://example.com/profile",
              sourceType: "user_url",
              tenantId: "other_tenant",
              workspaceId: "workspace_1",
            },
            progress: { percent: 100, stage: "dead_lettered" },
            queueName: "evidence-ingestion",
            status: "dead_lettered",
            tenantId: "tenant_1",
            updatedAt: new Date("2026-07-19T10:00:00.000Z"),
            workspaceId: "workspace_1",
          }),
        },
      } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    const result = await utility.inspect(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      "job_evidence",
    );

    expect(result).toMatchObject({
      replayable: false,
      replayBlockedReason: "Stored job payload scope does not match its background job",
    });
  });
});
