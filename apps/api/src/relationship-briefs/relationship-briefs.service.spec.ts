import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { RelationshipBriefsService } from "./relationship-briefs.service";

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

describe("RelationshipBriefsService", () => {
  it("queues brief generation idempotently without calling the model provider", async () => {
    const queued = {
      attempts: 0,
      id: "job_brief_1",
      jobName: "relationship_brief.generate",
      progress: { percent: 0, stage: "queued" },
      queueName: "brief-generation",
      status: "queued",
    };
    const upsert = vi.fn().mockResolvedValue(queued);
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const service = new RelationshipBriefsService(
      {
        backgroundJob: { upsert },
        entity: {
          findFirst: vi.fn().mockResolvedValue({
            canonicalName: "Ada Lovelace",
            id: "entity_1",
          }),
        },
        evidenceItem: {
          findMany: vi.fn().mockResolvedValue([{ id: "evidence_1" }]),
        },
      } as never,
      { record: auditRecord } as never,
    );

    await expect(
      service.create(
        principal,
        {
          goal: "partnership",
          subjectEntityId: "entity_1",
          workspaceId: "workspace_1",
        },
        "brief-request-123",
      ),
    ).resolves.toEqual(queued);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          idempotencyKey: "brief-request-123",
          jobName: "relationship_brief.generate",
          queueName: "brief-generation",
          status: "queued",
        }),
        where: {
          tenantId_queueName_idempotencyKey: {
            idempotencyKey: "brief-request-123",
            queueName: "brief-generation",
            tenantId: "tenant_1",
          },
        },
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "background_job.queued" }),
    );
  });

  it("blocks brief generation outside the authenticated workspace memberships", async () => {
    const service = new RelationshipBriefsService({} as never, {} as never);

    await expect(
      service.create(principal, {
        goal: "partnership",
        subjectEntityId: "entity_1",
        workspaceId: "workspace_2",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("requires stored evidence before generating a relationship brief", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      canonicalName: "Ada Lovelace",
      id: "entity_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RelationshipBriefsService(
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

    await expect(
      service.create(principal, {
        goal: "partnership",
        subjectEntityId: "entity_1",
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow(BadRequestException);

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        id: "entity_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
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

  it("queues draft generation idempotently without calling the model or compliance services", async () => {
    const queued = {
      attempts: 0,
      id: "job_draft_1",
      jobName: "draft_message.generate",
      progress: { percent: 0, stage: "queued" },
      queueName: "draft-generation",
      status: "queued",
    };
    const upsert = vi.fn().mockResolvedValue(queued);
    const auditRecord = vi.fn().mockResolvedValue(undefined);
    const service = new RelationshipBriefsService(
      {
        backgroundJob: { upsert },
        relationshipBrief: {
          findFirst: vi.fn().mockResolvedValue({
            id: "brief_1",
            subjectEntity: { canonicalName: "Ada Lovelace" },
            subjectEntityId: "entity_1",
            tenantId: "tenant_1",
            workspaceId: "workspace_1",
          }),
        },
      } as never,
      { record: auditRecord } as never,
    );

    await expect(
      service.createDraft(principal, "brief_1", { variant: "concise" }, "draft-request-123"),
    ).resolves.toEqual(queued);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          idempotencyKey: "draft-request-123",
          jobName: "draft_message.generate",
          payload: {
            briefId: "brief_1",
            requestedByUserId: "user_1",
            tenantId: "tenant_1",
            variant: "concise",
            workspaceId: "workspace_1",
          },
          queueName: "draft-generation",
          status: "queued",
        }),
        where: {
          tenantId_queueName_idempotencyKey: {
            idempotencyKey: "draft-request-123",
            queueName: "draft-generation",
            tenantId: "tenant_1",
          },
        },
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "background_job.queued" }),
    );
  });
});
