import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";
import { contentHash, snapshotObjectKey } from "@relationship/storage";

import { RetentionService } from "./retention.service";

const owner: AuthenticatedPrincipal = {
  email: "owner@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [{ role: "owner", workspaceId: "workspace_1" }],
};
const member: AuthenticatedPrincipal = {
  ...owner,
  workspaceRoles: [{ role: "member", workspaceId: "workspace_1" }],
};
const policy = {
  createdAt: new Date(),
  dataClass: "evidence",
  enabled: true,
  id: "policy_1",
  retentionDays: 90,
  tenantId: "tenant_1",
  updatedAt: new Date(),
  workspaceId: "workspace_1",
};

function previewMocks() {
  return {
    evidenceItem: {
      count: vi.fn().mockResolvedValue(2),
      findFirst: vi.fn().mockResolvedValue({
        retentionExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    },
    sourceSnapshot: {
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue({
        retentionExpiresAt: new Date("2026-08-02T00:00:00.000Z"),
      }),
    },
  };
}

describe("RetentionService", () => {
  it("restricts retention settings to owners and administrators", async () => {
    const service = new RetentionService({} as never, {} as never);

    await expect(service.summary(member, "workspace_1")).rejects.toThrow(ForbiddenException);
  });

  it("updates policy, backfills expiration, and records the change", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new RetentionService(
      {
        $executeRaw: executeRaw,
        backgroundJob: { findFirst: vi.fn().mockResolvedValue(null) },
        retentionPolicy: {
          findUnique: vi.fn().mockResolvedValue(policy),
          upsert: vi.fn().mockResolvedValue(policy),
        },
        ...previewMocks(),
      } as never,
      { record } as never,
    );

    const result = await service.updatePolicy(owner, "workspace_1", "evidence", {
      enabled: true,
      retentionDays: 90,
    });

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "retention.policy.updated" }),
    );
    expect(result.preview).toMatchObject({ totalDue: 3 });
  });

  it("deletes expired evidence before unreferenced snapshots and records a job", async () => {
    const rawContentHash = contentHash(new TextEncoder().encode("expired snapshot"));
    const storageKey = snapshotObjectKey({
      contentHash: rawContentHash,
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const evidenceDelete = vi.fn().mockResolvedValue({ count: 2 });
    const snapshotDelete = vi.fn().mockResolvedValue({ count: 1 });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        attempts: 1,
        createdAt: new Date(),
        failureReason: data.failureReason,
        id: "job_1",
        jobName: "retention.cleanup",
        maxAttempts: 3,
        progress: data.progress,
        queueName: "retention-cleanup",
        status: data.status,
        updatedAt: new Date(),
      }),
    );
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new RetentionService(
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
        backgroundJob: {
          create: vi.fn().mockResolvedValue({ id: "job_1" }),
          update,
        },
        retentionPolicy: { findUnique: vi.fn().mockResolvedValue(policy) },
      } as never,
      { record } as never,
      { deleteObject } as never,
    );

    const result = await service.execute(owner, "workspace_1");

    expect(evidenceDelete).toHaveBeenCalledOnce();
    expect(snapshotDelete).toHaveBeenCalledOnce();
    expect(deleteObject).toHaveBeenCalledWith(storageKey);
    expect(result).toMatchObject({
      progress: {
        deleted: { evidenceItems: 2, sourceSnapshots: 1, total: 3 },
        stage: "completed",
      },
      status: "completed",
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "retention.cleanup.completed" }),
    );
  });
});
