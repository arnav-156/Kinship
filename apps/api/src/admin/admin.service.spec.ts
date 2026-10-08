import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { AdminService } from "./admin.service";

const owner: AuthenticatedPrincipal = {
  email: "owner@example.local",
  tenantId: "tenant_1",
  userId: "user_owner",
  workspaceRoles: [{ role: "owner", workspaceId: "workspace_1" }],
};
const admin: AuthenticatedPrincipal = {
  email: "admin@example.local",
  tenantId: "tenant_1",
  userId: "user_admin",
  workspaceRoles: [{ role: "admin", workspaceId: "workspace_1" }],
};
const workspace = { id: "workspace_1", name: "Relationship Lab", slug: "relationship-lab" };

function service(prisma: Record<string, unknown>, audit: Record<string, unknown> = {}) {
  return new AdminService(
    prisma as never,
    audit as never,
    { hashPassword: vi.fn().mockResolvedValue("password-hash") } as never,
    {
      issueAccessToken: vi.fn().mockReturnValue({
        accessToken: "access-token",
        expiresAt: "2026-07-15T00:00:00.000Z",
      }),
    } as never,
  );
}

describe("AdminService", () => {
  it("lists only members and pending invitations in the managed workspace", async () => {
    const members = vi.fn().mockResolvedValue([]);
    const invitations = vi.fn().mockResolvedValue([]);
    const adminService = service({
      workspace: { findFirstOrThrow: vi.fn().mockResolvedValue(workspace) },
      workspaceInvitation: { findMany: invitations },
      workspaceMembership: { findMany: members },
    });

    await adminService.listMembers(owner, "workspace_1");

    expect(members).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant_1", workspaceId: "workspace_1" } }),
    );
    expect(invitations).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          acceptedAt: null,
          revokedAt: null,
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
  });

  it("adds an existing active tenant user directly and records the role", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "membership_1",
      role: "member",
      user: { email: "member@example.local", id: "user_member" },
    });
    const record = vi.fn().mockResolvedValue({});
    const tx = { workspaceMembership: { create } };
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        user: {
          findUnique: vi.fn().mockResolvedValue({
            deletedAt: null,
            email: "member@example.local",
            id: "user_member",
            status: "active",
          }),
        },
        workspace: { findFirstOrThrow: vi.fn().mockResolvedValue(workspace) },
        workspaceMembership: { findUnique: vi.fn().mockResolvedValue(null) },
      },
      { record },
    );

    const result = await adminService.inviteMember(owner, "workspace_1", {
      email: "MEMBER@example.local",
      role: "member",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "member",
          tenantId: "tenant_1",
          userId: "user_member",
          workspaceId: "workspace_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "workspace_member.added" }),
      tx,
    );
    expect(result.kind).toBe("member");
  });

  it("creates an expiring invitation with only a token hash persisted", async () => {
    const create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        createdAt: new Date(),
        email: data.email,
        expiresAt: data.expiresAt,
        id: "invite_1",
        role: data.role,
      }),
    );
    const tx = { workspaceInvitation: { create } };
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        workspace: { findFirstOrThrow: vi.fn().mockResolvedValue(workspace) },
        workspaceInvitation: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      { record: vi.fn().mockResolvedValue({}) },
    );

    const result = await adminService.inviteMember(owner, "workspace_1", {
      email: "new@example.local",
      role: "viewer",
    });

    if (result.kind !== "invitation") {
      throw new Error("Expected a workspace invitation");
    }

    const data = create.mock.calls[0]?.[0].data;
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(data.tokenHash).not.toBe(result.inviteToken);
    expect(result).toMatchObject({
      invitation: { email: "new@example.local", role: "viewer" },
      kind: "invitation",
    });
  });

  it("prevents administrators from assigning owner access", async () => {
    const adminService = service({});

    await expect(
      adminService.inviteMember(admin, "workspace_1", {
        email: "owner2@example.local",
        role: "owner",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("protects the final owner from demotion", async () => {
    const adminService = service({
      workspaceMembership: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue({
          id: "membership_owner",
          role: "owner",
          user: { id: "user_owner" },
          userId: "user_owner",
        }),
      },
    });

    await expect(
      adminService.updateMember(owner, "workspace_1", "membership_owner", { role: "admin" }),
    ).rejects.toThrow(ConflictException);
  });

  it("accepts a valid invitation, creates membership, and returns a session", async () => {
    const token = "valid-invitation-token-with-enough-entropy";
    const invitation = {
      acceptedAt: null,
      email: "new@example.local",
      expiresAt: new Date(Date.now() + 60_000),
      id: "invite_1",
      revokedAt: null,
      role: "member",
      tenantId: "tenant_1",
      workspace,
      workspaceId: "workspace_1",
    };
    const createdUser = {
      email: invitation.email,
      id: "user_new",
      status: "active",
      tenantId: "tenant_1",
    };
    const tx = {
      user: {
        create: vi.fn().mockResolvedValue(createdUser),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      workspaceInvitation: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      workspaceMembership: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const record = vi.fn().mockResolvedValue({});
    const findInvitation = vi.fn().mockResolvedValue(invitation);
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        workspaceInvitation: { findUnique: findInvitation },
        workspaceMembership: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ role: "member", workspace, workspaceId: "workspace_1" }]),
        },
      },
      { record },
    );

    const result = await adminService.acceptInvitation(token, {
      displayName: "New Member",
      password: "a-secure-password",
    });

    expect(findInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        },
      }),
    );
    expect(tx.workspaceMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          role: "member",
          userId: "user_new",
          workspaceId: "workspace_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "workspace_invitation.accepted" }),
      tx,
    );
    expect(result).toMatchObject({ accessToken: "access-token", user: { id: "user_new" } });
  });

  it("persists workflow policy defaults and audits the change", async () => {
    const policy = { id: "policy_1", workspaceId: "workspace_1" };
    const upsert = vi.fn().mockResolvedValue(policy);
    const record = vi.fn().mockResolvedValue({});
    const tx = { workspacePolicySettings: { upsert } };
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        workspace: { findFirstOrThrow: vi.fn().mockResolvedValue(workspace) },
      },
      { record },
    );

    await adminService.updatePolicy(owner, "workspace_1", {
      defaultConsentStatus: "unknown",
      defaultPurpose: "outreach_review",
      defaultRecipientRegion: "EU",
      defaultRecipientType: "professional",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          defaultRecipientRegion: "EU",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "workspace_policy.updated" }),
      tx,
    );
  });

  it("scopes connector administration to the managed workspace", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const adminService = service({
      connectorAccount: { findMany },
      workspace: { findFirstOrThrow: vi.fn().mockResolvedValue(workspace) },
    });

    await adminService.listConnectors(owner, "workspace_1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { not: "revoked" },
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
      }),
    );
  });

  it("stores an explicit recurring refresh schedule on a connector account", async () => {
    const connector = {
      id: "connector_1",
      metadata: { configuredBy: "workspace_admin", secretsStored: false },
      provider: "github",
      status: "active",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const update = vi.fn().mockImplementation(async ({ data }) => ({ ...connector, ...data }));
    const record = vi.fn().mockResolvedValue({});
    const tx = { connectorAccount: { update } };
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        connectorAccount: { findFirst: vi.fn().mockResolvedValue(connector) },
        entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
      },
      { record },
    );

    await adminService.updateConnector(owner, "workspace_1", "connector_1", {
      refreshEnabled: true,
      refreshEntityId: "entity_1",
      refreshIntervalMinutes: 60,
      refreshSourceIdentifier: "https://github.com/example/project",
      refreshSubjectName: "Example project",
    });

    expect(update).toHaveBeenCalledWith({
      data: {
        metadata: {
          configuredBy: "workspace_admin",
          refresh: expect.objectContaining({
            configuredAt: expect.any(String),
            enabled: true,
            entityId: "entity_1",
            intervalMinutes: 60,
            sourceIdentifier: "https://github.com/example/project",
            subjectName: "Example project",
          }),
          secretsStored: false,
        },
      },
      where: { id: "connector_1" },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "connector_account.updated",
        metadata: expect.objectContaining({ refreshEnabled: true }),
      }),
      tx,
    );
  });

  it("queues an idempotent connector sync and records its run", async () => {
    const connector = {
      id: "connector_1",
      provider: "github",
      status: "active",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const queued = {
      attempts: 0,
      id: "job_sync_1",
      jobName: "connector.sync",
      progress: { percent: 0, stage: "queued" },
      queueName: "connector-sync",
      status: "queued",
    };
    const runCreate = vi.fn().mockResolvedValue({ id: "run_1" });
    const jobCreate = vi.fn().mockResolvedValue(queued);
    const record = vi.fn().mockResolvedValue({});
    const tx = {
      backgroundJob: {
        create: jobCreate,
        findUnique: vi.fn().mockResolvedValue(null),
      },
      connectorRun: { create: runCreate },
    };
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        connectorAccount: { findFirst: vi.fn().mockResolvedValue(connector) },
        entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
      },
      { record },
    );

    await expect(
      adminService.syncConnector(
        owner,
        "workspace_1",
        "connector_1",
        {
          entityId: "entity_1",
          sourceIdentifier: "https://github.com/example/project",
          subjectName: "Example project",
        },
        "connector-sync-request-123",
      ),
    ).resolves.toEqual(queued);

    expect(runCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        connectorAccountId: "connector_1",
        provider: "github",
        status: "queued",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
    expect(jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: "connector-sync-request-123",
          jobName: "connector.sync",
          queueName: "connector-sync",
          status: "queued",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "connector_sync.queued" }),
      tx,
    );
  });

  it("returns the existing connector sync without creating a second run", async () => {
    const connector = {
      id: "connector_1",
      provider: "github",
      status: "active",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const existing = {
      attempts: 1,
      createdAt: new Date("2026-07-15T00:00:00.000Z"),
      failureReason: null,
      id: "job_sync_1",
      jobName: "connector.sync",
      maxAttempts: 3,
      payload: {
        connectorAccountId: "connector_1",
        connectorRunId: "run_1",
        provider: "github",
        requestedByUserId: "user_owner",
        sourceIdentifier: "https://github.com/example/project",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      progress: { connectorRunId: "run_1", percent: 20, stage: "fetching" },
      queueName: "connector-sync",
      status: "running",
      updatedAt: new Date("2026-07-15T00:01:00.000Z"),
      workspaceId: "workspace_1",
    };
    const runCreate = vi.fn();
    const jobCreate = vi.fn();
    const tx = {
      backgroundJob: {
        create: jobCreate,
        findUnique: vi.fn().mockResolvedValue(existing),
      },
      connectorRun: { create: runCreate },
    };
    const adminService = service({
      $transaction: vi.fn(async (callback) => callback(tx)),
      connectorAccount: { findFirst: vi.fn().mockResolvedValue(connector) },
    });

    await expect(
      adminService.syncConnector(
        owner,
        "workspace_1",
        "connector_1",
        { sourceIdentifier: "https://github.com/example/project" },
        "connector-sync-request-123",
      ),
    ).resolves.toEqual({
      attempts: 1,
      createdAt: existing.createdAt,
      failureReason: null,
      id: "job_sync_1",
      jobName: "connector.sync",
      maxAttempts: 3,
      progress: existing.progress,
      queueName: "connector-sync",
      status: "running",
      updatedAt: existing.updatedAt,
    });
    expect(runCreate).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it("deletes connector credential material when an admin revokes the account", async () => {
    const connector = {
      id: "connector_1",
      provider: "gmail",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({ ...connector, status: "revoked" });
    const record = vi.fn().mockResolvedValue({});
    const tx = {
      connectorAccount: { update },
      connectorCredential: { deleteMany },
    };
    const adminService = service(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        connectorAccount: { findFirst: vi.fn().mockResolvedValue(connector) },
      },
      { record },
    );

    await adminService.revokeConnector(owner, "workspace_1", "connector_1");

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        connectorAccountId: "connector_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(record).toHaveBeenCalledWith(
      {
        actorUserId: "user_owner",
        eventType: "connector_account.revoked",
        metadata: { credentialDeleted: true, provider: "gmail" },
        subjectId: "connector_1",
        subjectType: "connector_account",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      tx,
    );
  });
});
