import crypto from "node:crypto";
import type { PrismaClient } from "@relationship/db";

export interface ConnectorTokenTarget {
  connectorId: string;
  operator: string;
  tenantId: string;
  workspaceId: string;
}

export interface ConnectorTokenRotationInput {
  encryptionKey: Buffer;
  keyVersion: string;
  token: string;
}

interface InspectedConnector {
  credential: null | {
    keyVersion: string;
    rotatedAt: Date;
    tokenFingerprint: string;
  };
  displayName: string | null;
  id: string;
  provider: string;
  status: string;
}

export class ConnectorTokenUtility {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
    private readonly randomIv: () => Buffer = () => crypto.randomBytes(12),
  ) {}

  async inspect(target: ConnectorTokenTarget) {
    const connector = (await this.prisma.connectorAccount.findFirst({
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
        id: target.connectorId,
        status: { not: "revoked" },
        tenantId: target.tenantId,
        workspaceId: target.workspaceId,
      },
    } as never)) as InspectedConnector | null;
    if (!connector) {
      throw new Error("Active connector account was not found in the requested scope");
    }

    return {
      connector: {
        displayName: connector.displayName,
        id: connector.id,
        provider: connector.provider,
        status: connector.status,
      },
      credential: connector.credential
        ? {
            configured: true,
            keyVersion: connector.credential.keyVersion,
            rotatedAt: connector.credential.rotatedAt.toISOString(),
            tokenFingerprint: connector.credential.tokenFingerprint,
          }
        : {
            configured: false,
            keyVersion: null,
            rotatedAt: null,
            tokenFingerprint: null,
          },
      generatedAt: this.now().toISOString(),
      guidance: {
        revokeConfirmation: `REVOKE CONNECTOR TOKEN ${connector.id}`,
        rotateConfirmation: `ROTATE CONNECTOR TOKEN ${connector.id}`,
      },
      scope: {
        tenantId: target.tenantId,
        workspaceId: target.workspaceId,
      },
    };
  }

  async previewRotation(target: ConnectorTokenTarget, input: ConnectorTokenRotationInput) {
    validateRotationInput(input);
    const inspected = await this.inspect(target);
    const nextTokenFingerprint = fingerprintToken(input.token);

    return {
      ...inspected,
      change: {
        currentTokenFingerprint: inspected.credential.tokenFingerprint,
        keyVersion: input.keyVersion.trim(),
        nextTokenFingerprint,
      },
      confirmation: inspected.guidance.rotateConfirmation,
      dryRun: true,
    };
  }
  async executeRotation(
    target: ConnectorTokenTarget,
    input: ConnectorTokenRotationInput,
    confirmation: string,
  ) {
    const plan = await this.previewRotation(target, input);
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }

    const rotatedAt = this.now();
    const iv = this.randomIv();
    if (iv.length !== 12) throw new Error("Connector token IV must contain exactly 12 bytes");
    const cipher = crypto.createCipheriv("aes-256-gcm", input.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(input.token, "utf8"), cipher.final()]).toString(
      "base64",
    );
    const encryptedCredential = {
      algorithm: "aes-256-gcm",
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext,
      iv: iv.toString("base64"),
      keyVersion: input.keyVersion.trim(),
      rotatedAt,
      tokenFingerprint: plan.change.nextTokenFingerprint,
    };

    return this.prisma.$transaction(async (tx) => {
      const scoped = await tx.connectorAccount.updateMany({
        data: { status: "active" },
        where: {
          id: target.connectorId,
          status: { not: "revoked" },
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      });
      if (scoped.count !== 1) {
        throw new Error("Connector account changed before token rotation could be applied");
      }

      await tx.connectorCredential.upsert({
        create: {
          ...encryptedCredential,
          connectorAccountId: target.connectorId,
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
        update: encryptedCredential,
        where: { connectorAccountId: target.connectorId },
      });
      const auditEvent = await tx.auditEvent.create({
        data: {
          eventType: "connector_token.rotated",
          metadata: {
            keyVersion: encryptedCredential.keyVersion,
            operator: target.operator,
            provider: plan.connector.provider,
            tokenFingerprint: encryptedCredential.tokenFingerprint,
          },
          subjectId: target.connectorId,
          subjectType: "connector_account",
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
        select: { id: true },
      });

      return {
        auditEventId: auditEvent.id,
        connectorId: target.connectorId,
        keyVersion: encryptedCredential.keyVersion,
        rotatedAt: rotatedAt.toISOString(),
        tokenFingerprint: encryptedCredential.tokenFingerprint,
      };
    });
  }

  async previewRevocation(target: ConnectorTokenTarget) {
    const inspected = await this.inspect(target);
    return {
      ...inspected,
      confirmation: inspected.guidance.revokeConfirmation,
      dryRun: true,
    };
  }

  async executeRevocation(target: ConnectorTokenTarget, confirmation: string) {
    const plan = await this.previewRevocation(target);
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }
    const revokedAt = this.now();

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.connectorCredential.deleteMany({
        where: {
          connectorAccountId: target.connectorId,
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      });
      const revoked = await tx.connectorAccount.updateMany({
        data: { status: "revoked" },
        where: {
          id: target.connectorId,
          status: { not: "revoked" },
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      });
      if (revoked.count !== 1) {
        throw new Error("Connector account changed before token revocation could be applied");
      }

      const credentialDeleted = deleted.count === 1;
      const auditEvent = await tx.auditEvent.create({
        data: {
          eventType: "connector_token.revoked",
          metadata: {
            credentialDeleted,
            keyVersion: plan.credential.keyVersion,
            operator: target.operator,
            provider: plan.connector.provider,
            tokenFingerprint: plan.credential.tokenFingerprint,
          },
          subjectId: target.connectorId,
          subjectType: "connector_account",
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
        select: { id: true },
      });

      return {
        auditEventId: auditEvent.id,
        connectorId: target.connectorId,
        credentialDeleted,
        revokedAt: revokedAt.toISOString(),
      };
    });
  }
}

function fingerprintToken(token: string): string {
  const digest = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `sha256:${digest}`;
}

function validateRotationInput(input: ConnectorTokenRotationInput): void {
  if (input.encryptionKey.length !== 32) {
    throw new Error("Connector token encryption key must contain exactly 32 bytes");
  }
  if (input.keyVersion.trim().length === 0) {
    throw new Error("Connector token key version is required");
  }
  if (input.token.trim().length < 16) {
    throw new Error("Connector token must contain at least 16 non-whitespace characters");
  }
}
