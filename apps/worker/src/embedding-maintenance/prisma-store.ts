import { Prisma, type PrismaClient } from "@relationship/db";

import type {
  EmbeddingMaintenanceConfig,
  EvidenceEmbeddingRecord,
  EvidenceEmbeddingStore,
} from "./index";

interface EvidenceRow {
  evidenceId: string;
  evidenceSummary: string;
  tenantId: string;
  workspaceId: string;
}

export class PrismaEvidenceEmbeddingStore implements EvidenceEmbeddingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async countCandidates(config: EmbeddingMaintenanceConfig): Promise<number> {
    const where = buildWhere(config);
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count"
      FROM "evidence_items"
      WHERE ${Prisma.join(where, " AND ")}
    `);
    return rows[0]?.count ?? 0;
  }

  async fetchBatch(
    config: EmbeddingMaintenanceConfig,
    afterEvidenceId: string | undefined,
    limit: number,
  ): Promise<EvidenceEmbeddingRecord[]> {
    const where = buildWhere(config);
    if (afterEvidenceId) {
      where.push(Prisma.sql`"id" > ${afterEvidenceId}`);
    }
    return this.prisma.$queryRaw<EvidenceRow[]>(Prisma.sql`
      SELECT
        "id" AS "evidenceId",
        "evidence_summary" AS "evidenceSummary",
        "tenant_id" AS "tenantId",
        "workspace_id" AS "workspaceId"
      FROM "evidence_items"
      WHERE ${Prisma.join(where, " AND ")}
      ORDER BY "id" ASC
      LIMIT ${limit}
    `);
  }

  async writeEmbedding(record: EvidenceEmbeddingRecord, embedding: number[]): Promise<void> {
    const vector = `[${embedding.join(",")}]`;
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "evidence_items"
      SET "embedding" = ${vector}::vector
      WHERE "id" = ${record.evidenceId}
        AND "tenant_id" = ${record.tenantId}
        AND "workspace_id" = ${record.workspaceId}
    `);
    if (updated !== 1) {
      throw new Error(`Evidence ${record.evidenceId} was not updated in its original scope`);
    }
  }

  async rebuildVectorIndex(): Promise<void> {
    await this.prisma.$executeRawUnsafe('REINDEX INDEX "evidence_items_embedding_ivfflat_idx"');
  }
}

function buildWhere(config: EmbeddingMaintenanceConfig): Prisma.Sql[] {
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (config.mode === "backfill") {
    where.push(Prisma.sql`"embedding" IS NULL`);
  }
  if (config.tenantId) {
    where.push(Prisma.sql`"tenant_id" = ${config.tenantId}`);
  }
  if (config.workspaceId) {
    where.push(Prisma.sql`"workspace_id" = ${config.workspaceId}`);
  }
  return where;
}
