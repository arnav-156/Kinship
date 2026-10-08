import type { PolicyStatus, Prisma, PrismaClient, SourceType } from "@prisma/client";

import type { TenantWorkspaceScope } from "./scope";
import { tenantWorkspaceWhere } from "./scope";

type Db = PrismaClient | Prisma.TransactionClient;

export interface CreateEvidenceInput {
  confidenceScore: number;
  entityId: string;
  evidenceSummary: string;
  freshnessScore: number;
  metadata?: Prisma.InputJsonValue;
  policyStatus: PolicyStatus;
  rawContentHash: string;
  retentionExpiresAt?: Date;
  retrievalTimestamp: Date;
  sourceIdentifier?: string;
  sourceSnapshotId: string;
  sourceType: SourceType;
  sourceUrl?: string;
}

export class EvidenceRepository {
  constructor(private readonly db: Db) {}

  create(scope: TenantWorkspaceScope, input: CreateEvidenceInput) {
    return this.db.evidenceItem.create({
      data: {
        ...tenantWorkspaceWhere(scope),
        confidenceScore: input.confidenceScore,
        entityId: input.entityId,
        evidenceSummary: input.evidenceSummary,
        freshnessScore: input.freshnessScore,
        metadata: input.metadata ?? {},
        policyStatus: input.policyStatus,
        rawContentHash: input.rawContentHash,
        retentionExpiresAt: input.retentionExpiresAt,
        retrievalTimestamp: input.retrievalTimestamp,
        sourceIdentifier: input.sourceIdentifier,
        sourceSnapshotId: input.sourceSnapshotId,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
      },
    });
  }

  listForEntity(scope: TenantWorkspaceScope, entityId: string, take = 50) {
    return this.db.evidenceItem.findMany({
      orderBy: {
        retrievalTimestamp: "desc",
      },
      take,
      where: {
        ...tenantWorkspaceWhere(scope),
        entityId,
      },
    });
  }
}
