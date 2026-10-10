import { describe, expect, it, vi } from "vitest";
import { contentHash, snapshotObjectKey } from "@relationship/storage";

import { RetentionAdminUtility } from "./admin-retention";

const now = new Date("2026-07-19T12:00:00.000Z");

describe("RetentionAdminUtility", () => {
  it("previews scoped expired evidence without creating jobs or audit events", async () => {
    const backgroundJobCreate = vi.fn();
    const auditCreate = vi.fn();
    const utility = new RetentionAdminUtility(
      {
        auditEvent: { create: auditCreate },
        backgroundJob: { create: backgroundJobCreate },
        evidenceItem: {
          count: vi.fn().mockResolvedValue(2),
          findFirst: vi.fn().mockResolvedValue({
            retentionExpiresAt: new Date("2026-07-21T00:00:00.000Z"),
          }),
        },
        retentionPolicy: {
          findUnique: vi.fn().mockResolvedValue({
            dataClass: "evidence",
            enabled: true,
            id: "policy_1",
            retentionDays: 90,
            tenantId: "tenant_1",
            workspaceId: "workspace_1",
          }),
        },
        sourceSnapshot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue({
            retentionExpiresAt: new Date("2026-07-22T00:00:00.000Z"),
          }),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({
            id: "workspace_1",
            name: "Relationship Lab",
          }),
        },
      } as never,
      () => now,
    );

    const result = await utility.preview({
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(result).toEqual({
      confirmation: "DELETE EXPIRED EVIDENCE workspace_1",
      dataClass: "evidence",
      dueEvidenceItems: 2,
      dueSourceSnapshots: 1,
      generatedAt: now.toISOString(),
      nextExpirationAt: "2026-07-21T00:00:00.000Z",
      policy: { enabled: true, retentionDays: 90 },
      scope: {
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
        workspaceName: "Relationship Lab",
      },
      totalDue: 3,
    });
    expect(backgroundJobCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("refuses execution before writes when confirmation is not exact", async () => {
    const backgroundJobCreate = vi.fn();
    const transaction = vi.fn();
    const auditCreate = vi.fn();
    const utility = new RetentionAdminUtility(
      {
        $transaction: transaction,
        auditEvent: { create: auditCreate },
        backgroundJob: { create: backgroundJobCreate },
        evidenceItem: {
          count: vi.fn().mockResolvedValue(2),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        retentionPolicy: {
          findUnique: vi.fn().mockResolvedValue({
            dataClass: "evidence",
            enabled: true,
            retentionDays: 90,
          }),
        },
        sourceSnapshot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({
            id: "workspace_1",
            name: "Relationship Lab",
          }),
        },
      } as never,
      () => now,
    );

    await expect(
      utility.execute(
        {
          operator: "fixture-operator",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
        "DELETE SOMETHING ELSE",
      ),
    ).rejects.toThrow('Confirmation must exactly match "DELETE EXPIRED EVIDENCE workspace_1"');
    expect(backgroundJobCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("executes scoped cleanup transactionally and records job and audit evidence", async () => {
    const rawContentHash = contentHash(new TextEncoder().encode("expired snapshot"));
    const storageKey = snapshotObjectKey({
      contentHash: rawContentHash,
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const evidenceDelete = vi.fn().mockResolvedValue({ count: 2 });
    const snapshotDelete = vi.fn().mockResolvedValue({ count: 1 });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const completedJob = {
      id: "job_1",
      jobName: "retention.cleanup",
      progress: {
        deleted: { evidenceItems: 2, sourceSnapshots: 1, total: 3 },
        percent: 100,
        stage: "completed",
        trigger: "administrative",
      },
      status: "completed",
    };
    const backgroundJobCreate = vi.fn().mockResolvedValue({ id: "job_1" });
    const backgroundJobUpdate = vi.fn().mockResolvedValue(completedJob);
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const utility = new RetentionAdminUtility(
      {
        $transaction: vi.fn(async (callback) =>
          callback({
            evidenceItem: { deleteMany: evidenceDelete },
            sourceSnapshot: {
              deleteMany: snapshotDelete,
              findMany: vi.fn().mockResolvedValue([{ rawContentHash, storageKey }]),
            },
          }),
        ),
        auditEvent: { create: auditCreate },
        backgroundJob: {
          create: backgroundJobCreate,
          update: backgroundJobUpdate,
        },
        evidenceItem: {
          count: vi.fn().mockResolvedValue(2),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        retentionPolicy: {
          findUnique: vi.fn().mockResolvedValue({
            dataClass: "evidence",
            enabled: true,
            retentionDays: 90,
          }),
        },
        sourceSnapshot: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({
            id: "workspace_1",
            name: "Relationship Lab",
          }),
        },
      } as never,
      () => now,
      { deleteObject } as never,
    );

    const result = await utility.execute(
      {
        operator: "fixture-operator",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      "DELETE EXPIRED EVIDENCE workspace_1",
    );

    expect(evidenceDelete).toHaveBeenCalledWith({
      where: {
        retentionExpiresAt: { lte: now },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(snapshotDelete).toHaveBeenCalledWith({
      where: {
        evidenceItems: { none: {} },
        retentionExpiresAt: { lte: now },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(deleteObject).toHaveBeenCalledWith(storageKey);
    expect(backgroundJobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobName: "retention.cleanup",
        payload: {
          dataClass: "evidence",
          operator: "fixture-operator",
          trigger: "administrative",
        },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "retention.cleanup.completed",
        metadata: expect.objectContaining({
          operator: "fixture-operator",
          trigger: "administrative",
        }),
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
    expect(result).toEqual({
      deleted: { evidenceItems: 2, sourceSnapshots: 1, total: 3 },
      executedAt: now.toISOString(),
      job: completedJob,
    });
  });

  it("refuses execution without creating a job when no records are due", async () => {
    const backgroundJobCreate = vi.fn();
    const transaction = vi.fn();
    const utility = new RetentionAdminUtility(
      {
        $transaction: transaction,
        auditEvent: { create: vi.fn() },
        backgroundJob: { create: backgroundJobCreate },
        evidenceItem: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        retentionPolicy: {
          findUnique: vi.fn().mockResolvedValue({
            dataClass: "evidence",
            enabled: true,
            retentionDays: 90,
          }),
        },
        sourceSnapshot: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({
            id: "workspace_1",
            name: "Relationship Lab",
          }),
        },
      } as never,
      () => now,
    );

    await expect(
      utility.execute(
        {
          operator: "fixture-operator",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
        "DELETE EXPIRED EVIDENCE workspace_1",
      ),
    ).rejects.toThrow("No expired evidence or source snapshots are due");
    expect(backgroundJobCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("records a failed job and audit event when cleanup aborts", async () => {
    const backgroundJobUpdate = vi.fn().mockResolvedValue({ id: "job_1", status: "failed" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const utility = new RetentionAdminUtility(
      {
        $transaction: vi.fn().mockRejectedValue(new Error("database unavailable")),
        auditEvent: { create: auditCreate },
        backgroundJob: {
          create: vi.fn().mockResolvedValue({ id: "job_1" }),
          update: backgroundJobUpdate,
        },
        evidenceItem: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        retentionPolicy: {
          findUnique: vi.fn().mockResolvedValue({
            dataClass: "evidence",
            enabled: true,
            retentionDays: 90,
          }),
        },
        sourceSnapshot: {
          count: vi.fn().mockResolvedValue(0),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        workspace: {
          findFirst: vi.fn().mockResolvedValue({
            id: "workspace_1",
            name: "Relationship Lab",
          }),
        },
      } as never,
      () => now,
    );

    await expect(
      utility.execute(
        {
          operator: "fixture-operator",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
        "DELETE EXPIRED EVIDENCE workspace_1",
      ),
    ).rejects.toThrow("database unavailable");
    expect(backgroundJobUpdate).toHaveBeenCalledWith({
      data: {
        failureReason: "database unavailable",
        progress: {
          percent: 100,
          stage: "failed",
          trigger: "administrative",
        },
        status: "failed",
      },
      where: { id: "job_1" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        eventType: "retention.cleanup.failed",
        metadata: {
          failureReason: "database unavailable",
          operator: "fixture-operator",
          trigger: "administrative",
        },
        subjectId: "job_1",
        subjectType: "background_job",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
  });
});
