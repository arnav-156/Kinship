import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ConnectorTokenUtility } from "./connector-token";

describe("connector token utility", () => {
  it("inspects one scoped connector without exposing credential material", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      credential: {
        authTag: "must-not-be-returned",
        ciphertext: "must-not-be-returned",
        iv: "must-not-be-returned",
        keyVersion: "local-v2",
        rotatedAt: new Date("2026-07-24T10:00:00.000Z"),
        tokenFingerprint: "sha256:0123456789abcdef",
      },
      displayName: "Primary Gmail",
      id: "connector_1",
      provider: "gmail",
      status: "active",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const utility = new ConnectorTokenUtility(
      { connectorAccount: { findFirst } } as never,
      () => new Date("2026-07-24T12:00:00.000Z"),
    );

    const result = await utility.inspect({
      connectorId: "connector_1",
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(result).toEqual({
      connector: {
        displayName: "Primary Gmail",
        id: "connector_1",
        provider: "gmail",
        status: "active",
      },
      credential: {
        configured: true,
        keyVersion: "local-v2",
        rotatedAt: "2026-07-24T10:00:00.000Z",
        tokenFingerprint: "sha256:0123456789abcdef",
      },
      generatedAt: "2026-07-24T12:00:00.000Z",
      guidance: {
        revokeConfirmation: "REVOKE CONNECTOR TOKEN connector_1",
        rotateConfirmation: "ROTATE CONNECTOR TOKEN connector_1",
      },
      scope: {
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-be-returned");
    expect(findFirst).toHaveBeenCalledWith({
      select: {
        credential: {
          select: {
            keyVersion: true,
            rotatedAt: true,
            tokenFingerprint: true,
          },
        },
        displayName: true,
        id: true,
        provider: true,
        status: true,
      },
      where: {
        id: "connector_1",
        status: { not: "revoked" },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
  });
  it("previews a token rotation without exposing or persisting the token", async () => {
    const token = "fixture-oauth-token-with-sufficient-entropy";
    const findFirst = vi.fn().mockResolvedValue({
      credential: null,
      displayName: "Primary Gmail",
      id: "connector_1",
      provider: "gmail",
      status: "active",
    });
    const prisma = {
      $transaction: vi.fn(),
      connectorAccount: { findFirst },
      connectorCredential: { upsert: vi.fn() },
    };
    const utility = new ConnectorTokenUtility(
      prisma as never,
      () => new Date("2026-07-24T12:00:00.000Z"),
    );

    const result = await utility.previewRotation(
      {
        connectorId: "connector_1",
        operator: "fixture-operator",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      {
        encryptionKey: Buffer.alloc(32, 7),
        keyVersion: "local-v2",
        token,
      },
    );

    expect(result).toMatchObject({
      change: {
        currentTokenFingerprint: null,
        keyVersion: "local-v2",
        nextTokenFingerprint: "sha256:a46f334099616429",
      },
      confirmation: "ROTATE CONNECTOR TOKEN connector_1",
      dryRun: true,
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.connectorCredential.upsert).not.toHaveBeenCalled();
  });

  it("encrypts and atomically rotates a scoped connector token with an audit record", async () => {
    const token = "fixture-oauth-token-with-sufficient-entropy";
    const encryptionKey = Buffer.alloc(32, 7);
    const connector = {
      credential: null,
      displayName: "Primary Gmail",
      id: "connector_1",
      provider: "gmail",
      status: "active",
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsert = vi.fn().mockResolvedValue({ id: "credential_1" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const transaction = vi.fn(async (callback) =>
      callback({
        auditEvent: { create: auditCreate },
        connectorAccount: { updateMany },
        connectorCredential: { upsert },
      }),
    );
    const utility = new ConnectorTokenUtility(
      {
        $transaction: transaction,
        connectorAccount: { findFirst: vi.fn().mockResolvedValue(connector) },
      } as never,
      () => new Date("2026-07-24T12:00:00.000Z"),
      () => Buffer.alloc(12, 9),
    );
    const target = {
      connectorId: "connector_1",
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };

    const result = await utility.executeRotation(
      target,
      { encryptionKey, keyVersion: "local-v2", token },
      "ROTATE CONNECTOR TOKEN connector_1",
    );

    expect(result).toEqual({
      auditEventId: "audit_1",
      connectorId: "connector_1",
      keyVersion: "local-v2",
      rotatedAt: "2026-07-24T12:00:00.000Z",
      tokenFingerprint: "sha256:a46f334099616429",
    });
    expect(updateMany).toHaveBeenCalledWith({
      data: { status: "active" },
      where: {
        id: "connector_1",
        status: { not: "revoked" },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    const stored = upsert.mock.calls[0]?.[0].create;
    expect(stored).toMatchObject({
      algorithm: "aes-256-gcm",
      connectorAccountId: "connector_1",
      keyVersion: "local-v2",
      rotatedAt: new Date("2026-07-24T12:00:00.000Z"),
      tenantId: "tenant_1",
      tokenFingerprint: "sha256:a46f334099616429",
      workspaceId: "workspace_1",
    });
    expect(stored.ciphertext).not.toContain(token);
    const decipher = crypto.createDecipheriv(
      stored.algorithm,
      encryptionKey,
      Buffer.from(stored.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(stored.authTag, "base64"));
    expect(
      Buffer.concat([
        decipher.update(Buffer.from(stored.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    ).toBe(token);
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        eventType: "connector_token.rotated",
        metadata: {
          keyVersion: "local-v2",
          operator: "fixture-operator",
          provider: "gmail",
          tokenFingerprint: "sha256:a46f334099616429",
        },
        subjectId: "connector_1",
        subjectType: "connector_account",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      select: { id: true },
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain(token);
  });

  it("previews revocation without deleting credential material", async () => {
    const deleteMany = vi.fn();
    const transaction = vi.fn();
    const utility = new ConnectorTokenUtility(
      {
        $transaction: transaction,
        connectorAccount: {
          findFirst: vi.fn().mockResolvedValue({
            credential: {
              keyVersion: "local-v2",
              rotatedAt: new Date("2026-07-24T10:00:00.000Z"),
              tokenFingerprint: "sha256:0123456789abcdef",
            },
            displayName: "Primary Gmail",
            id: "connector_1",
            provider: "gmail",
            status: "active",
          }),
        },
        connectorCredential: { deleteMany },
      } as never,
      () => new Date("2026-07-24T12:00:00.000Z"),
    );

    const result = await utility.previewRevocation({
      connectorId: "connector_1",
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(result).toMatchObject({
      confirmation: "REVOKE CONNECTOR TOKEN connector_1",
      credential: {
        configured: true,
        tokenFingerprint: "sha256:0123456789abcdef",
      },
      dryRun: true,
    });
    expect(transaction).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("atomically deletes credential material and revokes the scoped connector", async () => {
    const connector = {
      credential: {
        keyVersion: "local-v2",
        rotatedAt: new Date("2026-07-24T10:00:00.000Z"),
        tokenFingerprint: "sha256:0123456789abcdef",
      },
      displayName: "Primary Gmail",
      id: "connector_1",
      provider: "gmail",
      status: "active",
    };
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const transaction = vi.fn(async (callback) =>
      callback({
        auditEvent: { create: auditCreate },
        connectorAccount: { updateMany },
        connectorCredential: { deleteMany },
      }),
    );
    const utility = new ConnectorTokenUtility(
      {
        $transaction: transaction,
        connectorAccount: { findFirst: vi.fn().mockResolvedValue(connector) },
      } as never,
      () => new Date("2026-07-24T12:00:00.000Z"),
    );
    const target = {
      connectorId: "connector_1",
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };

    const result = await utility.executeRevocation(target, "REVOKE CONNECTOR TOKEN connector_1");

    expect(result).toEqual({
      auditEventId: "audit_1",
      connectorId: "connector_1",
      credentialDeleted: true,
      revokedAt: "2026-07-24T12:00:00.000Z",
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        connectorAccountId: "connector_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      data: { status: "revoked" },
      where: {
        id: "connector_1",
        status: { not: "revoked" },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        eventType: "connector_token.revoked",
        metadata: {
          credentialDeleted: true,
          keyVersion: "local-v2",
          operator: "fixture-operator",
          provider: "gmail",
          tokenFingerprint: "sha256:0123456789abcdef",
        },
        subjectId: "connector_1",
        subjectType: "connector_account",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      select: { id: true },
    });
  });
});
