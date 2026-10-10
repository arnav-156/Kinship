import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "./client";
import {
  EVIDENCE_EMBEDDING_DIMENSIONS,
  searchHybridEvidence,
  writeEvidenceEmbedding,
} from "./vector-search";

const enabled = process.env["RUN_VECTOR_INTEGRATION"] === "true";
const prisma = createPrismaClient();
const suffix = randomUUID();
const ids = {
  entity: `vector-entity-${suffix}`,
  evidenceHybrid: `vector-hybrid-${suffix}`,
  evidenceLexical: `vector-lexical-${suffix}`,
  evidenceSemantic: `vector-semantic-${suffix}`,
  snapshot: `vector-snapshot-${suffix}`,
  tenant: `vector-tenant-${suffix}`,
  workspace: `vector-workspace-${suffix}`,
};

const queryEmbedding = unitVector(0);
const orthogonalEmbedding = unitVector(1);

describe.runIf(enabled)("pgvector hybrid evidence search", () => {
  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: ids.tenant, name: "Vector integration", slug: `vector-${suffix}` },
    });
    await prisma.workspace.create({
      data: {
        id: ids.workspace,
        name: "Vector integration",
        slug: "vector-integration",
        tenantId: ids.tenant,
      },
    });
    await prisma.entity.create({
      data: {
        canonicalName: "Ada Database",
        id: ids.entity,
        tenantId: ids.tenant,
        type: "person",
        workspaceId: ids.workspace,
      },
    });
    await prisma.sourceSnapshot.create({
      data: {
        id: ids.snapshot,
        policyStatus: "allowed",
        rawContentHash: `sha256:${suffix}`,
        retrievalTimestamp: new Date("2026-10-10T00:00:00.000Z"),
        sourceType: "github",
        tenantId: ids.tenant,
        workspaceId: ids.workspace,
      },
    });

    const base = {
      confidenceScore: 0.9,
      entityId: ids.entity,
      freshnessScore: 0.9,
      policyStatus: "allowed" as const,
      rawContentHash: `sha256:${suffix}`,
      retrievalTimestamp: new Date("2026-10-10T00:00:00.000Z"),
      sourceSnapshotId: ids.snapshot,
      sourceType: "github" as const,
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
    };
    await prisma.evidenceItem.createMany({
      data: [
        {
          ...base,
          evidenceSummary: "Distributed database maintainer and release owner",
          id: ids.evidenceHybrid,
        },
        {
          ...base,
          evidenceSummary: "Database maintainer focused on operational tooling",
          id: ids.evidenceLexical,
        },
        {
          ...base,
          evidenceSummary: "Leads an open source infrastructure community",
          id: ids.evidenceSemantic,
        },
      ],
    });
    await Promise.all([
      writeEvidenceEmbedding(prisma, {
        embedding: queryEmbedding,
        evidenceId: ids.evidenceHybrid,
        tenantId: ids.tenant,
        workspaceId: ids.workspace,
      }),
      writeEvidenceEmbedding(prisma, {
        embedding: orthogonalEmbedding,
        evidenceId: ids.evidenceLexical,
        tenantId: ids.tenant,
        workspaceId: ids.workspace,
      }),
      writeEvidenceEmbedding(prisma, {
        embedding: queryEmbedding,
        evidenceId: ids.evidenceSemantic,
        tenantId: ids.tenant,
        workspaceId: ids.workspace,
      }),
    ]);
  });

  afterAll(async () => {
    if (enabled) {
      await prisma.evidenceItem.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.sourceSnapshot.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.entity.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.workspace.deleteMany({ where: { tenantId: ids.tenant } });
      await prisma.tenant.deleteMany({ where: { id: ids.tenant } });
    }
    await prisma.$disconnect();
  });

  it("returns lexical and semantic ranks from tenant-scoped indexed retrieval", async () => {
    const rows = await searchHybridEvidence(prisma, {
      candidateLimit: 10,
      query: "database maintainer",
      queryEmbedding,
      sourceTypes: ["github"],
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
    });
    const byId = new Map(rows.map((row) => [row.evidenceId, row]));

    expect(byId.get(ids.evidenceHybrid)).toMatchObject({
      lexicalRank: expect.any(Number),
      semanticRank: expect.any(Number),
    });
    expect(byId.get(ids.evidenceLexical)?.lexicalRank).toEqual(expect.any(Number));
    expect(byId.get(ids.evidenceSemantic)?.semanticRank).toEqual(expect.any(Number));
  });
});

function unitVector(index: number): number[] {
  return Array.from({ length: EVIDENCE_EMBEDDING_DIMENSIONS }, (_, current) =>
    current === index ? 1 : 0,
  );
}
