import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { RelationshipNotesService } from "./relationship-notes.service";

const member: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [{ role: "member", workspaceId: "workspace_1" }],
};

describe("RelationshipNotesService", () => {
  it("scopes note reads to the principal tenant, workspace, and entity", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new RelationshipNotesService(
      {
        entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
        relationshipNote: { findMany },
      } as never,
      {} as never,
    );

    await service.list(member, "workspace_1", "entity_1");

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

  it("persists authorship and records note creation in the audit log", async () => {
    const create = vi.fn().mockResolvedValue({ id: "note_1" });
    const record = vi.fn().mockResolvedValue({ id: "audit_1" });
    const tx = { relationshipNote: { create } };
    const service = new RelationshipNotesService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
      } as never,
      { record } as never,
    );

    await service.create(member, "workspace_1", "entity_1", { body: "  Follow up  " });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: "user_1",
          body: "Follow up",
          entityId: "entity_1",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "relationship_note.created" }),
      tx,
    );
  });

  it("rejects empty notes and entities outside the workspace", async () => {
    const missingEntityService = new RelationshipNotesService(
      { entity: { findFirst: vi.fn().mockResolvedValue(null) } } as never,
      {} as never,
    );
    await expect(
      missingEntityService.create(member, "workspace_1", "entity_1", { body: "Note" }),
    ).rejects.toThrow(NotFoundException);

    const emptyService = new RelationshipNotesService(
      { entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) } } as never,
      {} as never,
    );
    await expect(
      emptyService.create(member, "workspace_1", "entity_1", { body: "   " }),
    ).rejects.toThrow(BadRequestException);
  });

  it("prevents members from editing another author's note", async () => {
    const service = new RelationshipNotesService(
      {
        relationshipNote: {
          findFirst: vi.fn().mockResolvedValue({ authorId: "user_2", id: "note_1" }),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.update(member, "workspace_1", "entity_1", "note_1", { body: "Changed" }),
    ).rejects.toThrow(ForbiddenException);
  });
});
