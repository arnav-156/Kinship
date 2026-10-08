import { describe, expect, it, vi } from "vitest";

import { AdminDataLifecycleUtility } from "./admin-data-lifecycle";

const now = new Date("2026-07-18T12:00:00.000Z");

describe("AdminDataLifecycleUtility", () => {
  it("exports only the requested tenant user without credential material", async () => {
    const create = vi.fn().mockResolvedValue({ id: "request_1" });
    const update = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        completedAt: now,
        createdAt: now,
        expiresAt: data.expiresAt,
        failureReason: null,
        id: "request_1",
        requestType: "export",
        result: data.result,
        status: "completed",
        updatedAt: now,
      }),
    );
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const userFindFirstOrThrow = vi.fn().mockResolvedValue({
      createdAt: now,
      displayName: "Fixture User",
      email: "fixture@example.local",
      id: "user_1",
      lastLoginAt: now,
      region: null,
      status: "active",
      updatedAt: now,
    });
    const emptyFindMany = vi.fn().mockResolvedValue([]);
    const utility = new AdminDataLifecycleUtility(
      {
        aiQualityFeedback: { findMany: emptyFindMany },
        auditEvent: { create: auditCreate, findMany: emptyFindMany },
        draftMessageVersion: { findMany: emptyFindMany },
        prospectList: { findMany: emptyFindMany },
        relationshipNote: { findMany: emptyFindMany },
        suppressionEntry: { findMany: emptyFindMany },
        user: { findFirstOrThrow: userFindFirstOrThrow },
        userDataRequest: { create, update },
        workspaceMembership: { findMany: emptyFindMany },
      } as never,
      () => now,
    );

    const result = await utility.exportData({
      operator: "fixture-operator",
      tenantId: "tenant_1",
      userId: "user_1",
    });

    expect(userFindFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ passwordHash: expect.anything() }),
        where: {
          deletedAt: null,
          id: "user_1",
          tenantId: "tenant_1",
        },
      }),
    );
    expect(result.snapshot).not.toHaveProperty("passwordHash");
    expect(result.snapshot).toMatchObject({
      account: { email: "fixture@example.local", id: "user_1" },
      scope: { tenantId: "tenant_1", userId: "user_1" },
      totals: {
        aiFeedback: 0,
        auditEvents: 0,
        draftVersions: 0,
        memberships: 0,
        notes: 0,
        prospectLists: 0,
        suppressions: 0,
      },
      version: "1.0",
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        requestType: "export",
        status: "processing",
        tenantId: "tenant_1",
        userId: "user_1",
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "privacy.admin_export.completed",
        metadata: expect.objectContaining({ operator: "fixture-operator" }),
        tenantId: "tenant_1",
      }),
    });
  });

  it("does not create an export request for a user outside the supplied tenant", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cross_tenant_request" });
    const update = vi.fn().mockResolvedValue({});
    const auditCreate = vi.fn().mockResolvedValue({});
    const utility = new AdminDataLifecycleUtility(
      {
        auditEvent: { create: auditCreate },
        user: {
          findFirstOrThrow: vi.fn().mockRejectedValue(new Error("Target user was not found")),
        },
        userDataRequest: { create, update },
      } as never,
      () => now,
    );

    await expect(
      utility.exportData({
        operator: "fixture-operator",
        tenantId: "tenant_1",
        userId: "user_from_another_tenant",
      }),
    ).rejects.toThrow("Target user was not found");

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("previews tenant-scoped deletion impact without writing", async () => {
    const userDataRequestCreate = vi.fn();
    const auditCreate = vi.fn();
    const utility = new AdminDataLifecycleUtility(
      {
        $queryRaw: vi.fn().mockResolvedValue([{ count: 2 }]),
        aiQualityFeedback: { count: vi.fn().mockResolvedValue(2) },
        auditEvent: { count: vi.fn().mockResolvedValue(3), create: auditCreate },
        draftMessageVersion: { count: vi.fn().mockResolvedValue(4) },
        prospectList: { count: vi.fn().mockResolvedValue(5) },
        relationshipNote: { count: vi.fn().mockResolvedValue(6) },
        suppressionEntry: { count: vi.fn().mockResolvedValue(7) },
        user: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue({
            displayName: "Fixture User",
            email: "fixture@example.local",
            id: "user_1",
            memberships: [
              {
                role: "owner",
                workspace: {
                  memberships: [
                    {
                      role: "owner",
                      user: { deletedAt: null, status: "active" },
                      userId: "user_1",
                    },
                  ],
                  name: "Solo Workspace",
                },
                workspaceId: "workspace_1",
              },
            ],
          }),
        },
        userDataRequest: { create: userDataRequestCreate },
        workspaceMembership: { count: vi.fn().mockResolvedValue(1) },
      } as never,
      () => now,
    );

    const plan = await utility.previewDeletion({
      operator: "fixture-operator",
      tenantId: "tenant_1",
      userId: "user_1",
    });

    expect(plan).toEqual({
      blocked: false,
      blockedWorkspaces: [],
      confirmation: "DELETE user_1",
      generatedAt: now.toISOString(),
      impact: {
        deactivatesTenant: true,
        deactivatesWorkspaces: 1,
        removes: { memberships: 1, relationshipNotes: 6 },
        scrubs: {
          aiFeedback: 2,
          auditEvents: 3,
          backgroundJobs: 2,
          draftVersions: 4,
          prospectLists: 5,
          suppressions: 7,
        },
      },
      target: {
        displayName: "Fixture User",
        email: "fixture@example.local",
        tenantId: "tenant_1",
        userId: "user_1",
      },
    });
    expect(userDataRequestCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("refuses deletion before any write when confirmation is not exact", async () => {
    const create = vi.fn();
    const transaction = vi.fn();
    const zero = vi.fn().mockResolvedValue(0);
    const utility = new AdminDataLifecycleUtility(
      {
        $queryRaw: vi.fn().mockResolvedValue([{ count: 0 }]),
        $transaction: transaction,
        aiQualityFeedback: { count: zero },
        auditEvent: { count: zero },
        draftMessageVersion: { count: zero },
        prospectList: { count: zero },
        relationshipNote: { count: zero },
        suppressionEntry: { count: zero },
        user: {
          count: vi.fn().mockResolvedValue(2),
          findFirst: vi.fn().mockResolvedValue({
            displayName: "Fixture User",
            email: "fixture@example.local",
            id: "user_1",
            memberships: [],
          }),
        },
        userDataRequest: { create },
        workspaceMembership: { count: zero },
      } as never,
      () => now,
    );

    await expect(
      utility.executeDeletion(
        {
          operator: "fixture-operator",
          tenantId: "tenant_1",
          userId: "user_1",
        },
        "DELETE someone-else",
      ),
    ).rejects.toThrow('Confirmation must exactly match "DELETE user_1"');
    expect(create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("blocks confirmed deletion when a shared workspace would lose its only owner", async () => {
    const create = vi.fn();
    const transaction = vi.fn();
    const zero = vi.fn().mockResolvedValue(0);
    const utility = new AdminDataLifecycleUtility(
      {
        $queryRaw: vi.fn().mockResolvedValue([{ count: 0 }]),
        $transaction: transaction,
        aiQualityFeedback: { count: zero },
        auditEvent: { count: zero },
        draftMessageVersion: { count: zero },
        prospectList: { count: zero },
        relationshipNote: { count: zero },
        suppressionEntry: { count: zero },
        user: {
          count: vi.fn().mockResolvedValue(2),
          findFirst: vi.fn().mockResolvedValue({
            displayName: "Fixture Owner",
            email: "owner@example.local",
            id: "user_1",
            memberships: [
              {
                role: "owner",
                workspace: {
                  memberships: [
                    {
                      role: "owner",
                      user: { deletedAt: null, status: "active" },
                      userId: "user_1",
                    },
                    {
                      role: "member",
                      user: { deletedAt: null, status: "active" },
                      userId: "user_2",
                    },
                  ],
                  name: "Shared Workspace",
                },
                workspaceId: "workspace_1",
              },
            ],
          }),
        },
        userDataRequest: { create },
        workspaceMembership: { count: vi.fn().mockResolvedValue(1) },
      } as never,
      () => now,
    );

    await expect(
      utility.executeDeletion(
        {
          operator: "fixture-operator",
          tenantId: "tenant_1",
          userId: "user_1",
        },
        "DELETE user_1",
      ),
    ).rejects.toThrow("Transfer ownership before deletion: Shared Workspace");
    expect(create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("executes confirmed deletion transactionally and records completion evidence", async () => {
    const zero = vi.fn().mockResolvedValue(0);
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(2),
      aiQualityFeedback: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditEvent: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" }),
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      draftMessageVersion: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
      prospectList: { updateMany: vi.fn().mockResolvedValue({ count: 5 }) },
      relationshipNote: { deleteMany: vi.fn().mockResolvedValue({ count: 6 }) },
      suppressionEntry: { updateMany: vi.fn().mockResolvedValue({ count: 7 }) },
      tenant: { update: vi.fn().mockResolvedValue({}) },
      user: {
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({}),
      },
      userDataRequest: {
        update: vi.fn().mockResolvedValue({ id: "request_delete_1" }),
      },
      workspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      workspaceMembership: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const utility = new AdminDataLifecycleUtility(
      {
        $queryRaw: vi.fn().mockResolvedValue([{ count: 2 }]),
        $transaction: vi.fn(async (callback) => callback(tx)),
        aiQualityFeedback: { count: vi.fn().mockResolvedValue(2) },
        auditEvent: {
          count: vi.fn().mockResolvedValue(3),
          create: vi.fn(),
        },
        draftMessageVersion: { count: vi.fn().mockResolvedValue(4) },
        prospectList: { count: vi.fn().mockResolvedValue(5) },
        relationshipNote: { count: vi.fn().mockResolvedValue(6) },
        suppressionEntry: { count: vi.fn().mockResolvedValue(7) },
        tenant: { update: vi.fn() },
        user: {
          count: vi.fn().mockResolvedValue(1),
          findFirst: vi.fn().mockResolvedValue({
            displayName: "Fixture User",
            email: "fixture@example.local",
            id: "user_1",
            memberships: [
              {
                role: "owner",
                workspace: {
                  memberships: [
                    {
                      role: "owner",
                      user: { deletedAt: null, status: "active" },
                      userId: "user_1",
                    },
                  ],
                  name: "Solo Workspace",
                },
                workspaceId: "workspace_1",
              },
            ],
          }),
        },
        userDataRequest: {
          create: vi.fn().mockResolvedValue({ id: "request_delete_1" }),
          update: vi.fn(),
        },
        workspaceMembership: { count: vi.fn().mockResolvedValue(1) },
      } as never,
      () => now,
    );

    const result = await utility.executeDeletion(
      {
        operator: "fixture-operator",
        tenantId: "tenant_1",
        userId: "user_1",
      },
      "DELETE user_1",
    );

    expect(tx.relationshipNote.deleteMany).toHaveBeenCalledWith({
      where: { authorId: "user_1", tenantId: "tenant_1" },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deletedAt: now,
        displayName: null,
        email: expect.stringMatching(/^deleted\+[a-f0-9]{24}@privacy\.invalid$/),
        status: "disabled",
      }),
      where: { id: "user_1" },
    });
    expect(tx.workspace.updateMany).toHaveBeenCalledWith({
      data: { deletedAt: now },
      where: {
        deletedAt: null,
        id: { in: ["workspace_1"] },
        tenantId: "tenant_1",
      },
    });
    expect(tx.tenant.update).toHaveBeenCalledWith({
      data: { deletedAt: now },
      where: { id: "tenant_1" },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "privacy.admin_deletion.completed",
        metadata: expect.objectContaining({ operator: "fixture-operator" }),
        tenantId: "tenant_1",
      }),
    });
    expect(result).toEqual({
      deletedAt: now.toISOString(),
      requestId: "request_delete_1",
      summary: {
        deactivatedTenant: true,
        deactivatedWorkspaces: 1,
        removed: { memberships: 1, relationshipNotes: 6 },
        scrubbed: {
          aiFeedback: 2,
          auditEvents: 3,
          backgroundJobs: 2,
          draftVersions: 4,
          prospectLists: 5,
          suppressions: 7,
        },
      },
    });
    expect(zero).not.toHaveBeenCalled();
  });
});
