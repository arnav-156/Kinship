import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { ProspectListsService } from "./prospect-lists.service";

const member: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [{ role: "member", workspaceId: "workspace_1" }],
};

const viewer: AuthenticatedPrincipal = {
  ...member,
  workspaceRoles: [{ role: "viewer", workspaceId: "workspace_1" }],
};

describe("ProspectListsService", () => {
  it("lists only active prospect lists in the authenticated tenant and workspace", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ProspectListsService({ prospectList: { findMany } } as never, {} as never);

    await service.list(viewer, "workspace_1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
      }),
    );
  });

  it("blocks read-only roles from changing prospect lists", async () => {
    const service = new ProspectListsService({} as never, {} as never);

    await expect(
      service.create(viewer, "workspace_1", { name: "Priority relationships" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects entities outside the scoped workspace before adding a member", async () => {
    const service = new ProspectListsService(
      {
        entity: { findFirst: vi.fn().mockResolvedValue(null) },
        prospectList: { findFirst: vi.fn().mockResolvedValue({ id: "list_1" }) },
      } as never,
      {} as never,
    );

    await expect(
      service.addMember(member, "workspace_1", "list_1", { entityId: "entity_other" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("upserts a scoped list member and records an audit event", async () => {
    const upsert = vi.fn().mockResolvedValue({
      entityId: "entity_1",
      id: "member_1",
      prospectListId: "list_1",
    });
    const record = vi.fn().mockResolvedValue({ id: "audit_1" });
    const tx = { prospectListMember: { upsert } };
    const service = new ProspectListsService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
        prospectList: { findFirst: vi.fn().mockResolvedValue({ id: "list_1" }) },
      } as never,
      { record } as never,
    );

    await service.addMember(member, "workspace_1", "list_1", {
      entityId: "entity_1",
      fitScore: 0.82,
      relationshipStage: "warm",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: "entity_1",
          fitScore: 0.82,
          prospectListId: "list_1",
          relationshipStage: "warm",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "prospect_list.member_upserted",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
      tx,
    );
  });

  it("validates every CSV row before starting a transaction", async () => {
    const transaction = vi.fn();
    const service = new ProspectListsService(
      {
        $transaction: transaction,
        prospectList: { findFirst: vi.fn().mockResolvedValue({ id: "list_1" }) },
      } as never,
      {} as never,
    );

    await expect(
      service.importCsv(member, "workspace_1", "list_1", {
        csvText: "name,type\nAda,unknown",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
