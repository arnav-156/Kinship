import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { PrivacyService } from "./privacy.service";

const principal: AuthenticatedPrincipal = {
  email: "owner@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [{ role: "owner", workspaceId: "workspace_1" }],
};
const now = new Date("2026-07-14T12:00:00.000Z");

function request(overrides: Record<string, unknown> = {}) {
  return {
    completedAt: null,
    createdAt: now,
    expiresAt: null,
    failureReason: null,
    id: "request_1",
    requestType: "export",
    result: null,
    status: "processing",
    tenantId: "tenant_1",
    updatedAt: now,
    userId: "user_1",
    ...overrides,
  };
}

function userWithWorkspace(options: { otherMember?: boolean; otherOwner?: boolean } = {}) {
  const memberships = [
    {
      role: "owner",
      user: { deletedAt: null, status: "active" },
      userId: "user_1",
    },
  ];
  if (options.otherMember) {
    memberships.push({
      role: options.otherOwner ? "owner" : "member",
      user: { deletedAt: null, status: "active" },
      userId: "user_2",
    });
  }
  return {
    deletedAt: null,
    id: "user_1",
    memberships: [
      {
        role: "owner",
        workspace: { memberships, name: "Relationship Lab" },
        workspaceId: "workspace_1",
      },
    ],
    passwordHash: "hash",
    status: "active",
  };
}

describe("PrivacyService", () => {
  it("creates a tenant-scoped export snapshot without credential material", async () => {
    const completed = request({
      completedAt: now,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      result: { version: "1.0" },
      status: "completed",
    });
    const update = vi.fn().mockResolvedValue(completed);
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new PrivacyService(
      {
        aiQualityFeedback: { findMany: vi.fn().mockResolvedValue([]) },
        auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
        draftMessageVersion: { findMany: vi.fn().mockResolvedValue([]) },
        prospectList: { findMany: vi.fn().mockResolvedValue([]) },
        relationshipNote: { findMany: vi.fn().mockResolvedValue([]) },
        suppressionEntry: { findMany: vi.fn().mockResolvedValue([]) },
        user: {
          findFirstOrThrow: vi.fn().mockResolvedValue({
            createdAt: now,
            displayName: "Owner",
            email: "owner@example.local",
            id: "user_1",
            lastLoginAt: now,
            region: null,
            status: "active",
            updatedAt: now,
          }),
        },
        userDataRequest: {
          create: vi.fn().mockResolvedValue(request()),
          update,
        },
        workspaceMembership: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      { record } as never,
      {} as never,
    );

    const result = await service.requestExport(principal);

    const persistedSnapshot = update.mock.calls[0]?.[0].data.result as Record<string, unknown>;
    expect(persistedSnapshot).not.toHaveProperty("passwordHash");
    expect(persistedSnapshot).toMatchObject({
      account: { email: "owner@example.local", id: "user_1" },
      totals: { aiFeedback: 0, auditEvents: 0, memberships: 0, notes: 0 },
      version: "1.0",
    });
    expect(result).toMatchObject({ downloadAvailable: true, status: "completed" });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "privacy.export.completed", tenantId: "tenant_1" }),
    );
  });

  it("does not reveal another user or tenant export", async () => {
    const service = new PrivacyService(
      {
        $executeRaw: vi.fn().mockResolvedValue(0),
        userDataRequest: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(service.exportStatus(principal, "request_other")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("requires the current password before account deletion", async () => {
    const service = new PrivacyService(
      { user: { findFirst: vi.fn().mockResolvedValue(userWithWorkspace()) } } as never,
      {} as never,
      { verifyPassword: vi.fn().mockResolvedValue(false) } as never,
    );

    await expect(
      service.requestDeletion(principal, {
        confirmation: "DELETE MY ACCOUNT",
        currentPassword: "wrong",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("blocks deletion when a shared workspace would lose its only owner", async () => {
    const service = new PrivacyService(
      {
        user: {
          findFirst: vi.fn().mockResolvedValue(userWithWorkspace({ otherMember: true })),
        },
      } as never,
      {} as never,
      { verifyPassword: vi.fn().mockResolvedValue(true) } as never,
    );

    await expect(
      service.requestDeletion(principal, {
        confirmation: "DELETE MY ACCOUNT",
        currentPassword: "correct",
      }),
    ).rejects.toThrow(ConflictException);
  });

  it("anonymizes the user, removes direct authorship, and deactivates a solo workspace", async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(2),
      aiQualityFeedback: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditEvent: {
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      draftMessageVersion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      prospectList: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      relationshipNote: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      suppressionEntry: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      tenant: { update: vi.fn().mockResolvedValue({}) },
      user: {
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({}),
      },
      userDataRequest: {
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            request({
              completedAt: now,
              requestType: "deletion",
              result: data.result,
              status: "completed",
            }),
          ),
        ),
      },
      workspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      workspaceMembership: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new PrivacyService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        user: { findFirst: vi.fn().mockResolvedValue(userWithWorkspace()) },
        userDataRequest: {
          create: vi.fn().mockResolvedValue(request({ requestType: "deletion" })),
        },
      } as never,
      {} as never,
      {
        hashPassword: vi.fn().mockResolvedValue("unusable-hash"),
        verifyPassword: vi.fn().mockResolvedValue(true),
      } as never,
    );

    const result = await service.requestDeletion(principal, {
      confirmation: "DELETE MY ACCOUNT",
      currentPassword: "correct",
    });

    expect(tx.relationshipNote.deleteMany).toHaveBeenCalledWith({
      where: { authorId: "user_1", tenantId: "tenant_1" },
    });
    expect(tx.aiQualityFeedback.updateMany).toHaveBeenCalledWith({
      data: { submittedById: null },
      where: { submittedById: "user_1", tenantId: "tenant_1" },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "disabled", displayName: null, region: null }),
      }),
    );
    expect(tx.workspace.updateMany).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      signedOut: true,
      summary: { deactivatedWorkspaces: 1, removed: { relationshipNotes: 2 } },
    });
  });
});
