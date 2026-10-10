import { Prisma, type PrismaClient, type SourceType } from "@prisma/client";

export const EVIDENCE_EMBEDDING_DIMENSIONS = 1536;

type VectorDatabase = Pick<PrismaClient, "$executeRaw" | "$queryRaw"> | Prisma.TransactionClient;

export interface HybridEvidenceSearchInput {
  candidateLimit: number;
  query: string;
  queryEmbedding?: number[];
  sourceTypes?: SourceType[];
  tenantId: string;
  workspaceId: string;
}

export interface HybridEvidenceSearchRow {
  confidenceScore: number;
  entityId: string;
  entityName: string;
  evidenceId: string;
  evidenceSummary: string;
  freshnessScore: number;
  lexicalRank: number | null;
  lexicalScore: number | null;
  retrievalTimestamp: Date;
  semanticRank: number | null;
  semanticScore: number | null;
  sourceIdentifier: string | null;
  sourceType: SourceType;
  sourceUrl: string | null;
}

export function validateEvidenceEmbedding(embedding: number[]): number[] {
  if (
    embedding.length !== EVIDENCE_EMBEDDING_DIMENSIONS ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Evidence embeddings must contain ${EVIDENCE_EMBEDDING_DIMENSIONS} finite values`,
    );
  }
  return embedding;
}

export async function writeEvidenceEmbedding(
  database: VectorDatabase,
  input: { embedding: number[]; evidenceId: string; tenantId: string; workspaceId: string },
): Promise<void> {
  const vector = vectorLiteral(validateEvidenceEmbedding(input.embedding));
  const updated = await database.$executeRaw(Prisma.sql`
    UPDATE "evidence_items"
    SET "embedding" = ${vector}::vector
    WHERE "id" = ${input.evidenceId}
      AND "tenant_id" = ${input.tenantId}
      AND "workspace_id" = ${input.workspaceId}
  `);
  if (updated !== 1) {
    throw new Error("Evidence embedding target was not found in its tenant/workspace scope");
  }
}

export async function searchHybridEvidence(
  database: VectorDatabase,
  input: HybridEvidenceSearchInput,
): Promise<HybridEvidenceSearchRow[]> {
  if (
    !Number.isInteger(input.candidateLimit) ||
    input.candidateLimit < 1 ||
    input.candidateLimit > 200
  ) {
    throw new Error("Hybrid search candidateLimit must be an integer from 1 to 200");
  }
  const query = input.query.trim();
  if (!query) throw new Error("Hybrid search query must not be empty");

  const sourceFilter = input.sourceTypes?.length
    ? Prisma.sql`AND e."source_type" IN (${Prisma.join(input.sourceTypes)})`
    : Prisma.empty;
  const semanticCandidates = input.queryEmbedding
    ? semanticCandidateQuery(
        vectorLiteral(validateEvidenceEmbedding(input.queryEmbedding)),
        input,
        sourceFilter,
      )
    : Prisma.sql`
        SELECT NULL::text AS "id",
               NULL::integer AS "semantic_rank",
               NULL::double precision AS "semantic_score"
        WHERE false
      `;

  return database.$queryRaw<HybridEvidenceSearchRow[]>(Prisma.sql`
    WITH query_input AS (
      SELECT websearch_to_tsquery('english', ${query}) AS "text_query"
    ),
    lexical_candidates AS (
      SELECT e."id",
             (row_number() OVER (
               ORDER BY ts_rank_cd(e."search_vector", q."text_query") DESC, e."id"
             ))::integer AS "lexical_rank",
             ts_rank_cd(e."search_vector", q."text_query")::double precision AS "lexical_score"
      FROM "evidence_items" e
      CROSS JOIN query_input q
      WHERE e."tenant_id" = ${input.tenantId}
        AND e."workspace_id" = ${input.workspaceId}
        AND e."policy_status" <> 'blocked'
        AND e."search_vector" @@ q."text_query"
        ${sourceFilter}
      ORDER BY "lexical_score" DESC, e."id"
      LIMIT ${input.candidateLimit}
    ),
    semantic_candidates AS (
      ${semanticCandidates}
    ),
    candidates AS (
      SELECT "id" FROM lexical_candidates
      UNION
      SELECT "id" FROM semantic_candidates
    )
    SELECT e."id" AS "evidenceId",
           e."entity_id" AS "entityId",
           entity."canonical_name" AS "entityName",
           e."evidence_summary" AS "evidenceSummary",
           e."confidence_score" AS "confidenceScore",
           e."freshness_score" AS "freshnessScore",
           e."retrieval_timestamp" AS "retrievalTimestamp",
           e."source_identifier" AS "sourceIdentifier",
           e."source_type" AS "sourceType",
           e."source_url" AS "sourceUrl",
           lexical."lexical_rank" AS "lexicalRank",
           lexical."lexical_score" AS "lexicalScore",
           semantic."semantic_rank" AS "semanticRank",
           semantic."semantic_score" AS "semanticScore"
    FROM candidates candidate
    JOIN "evidence_items" e ON e."id" = candidate."id"
    JOIN "entities" entity ON entity."id" = e."entity_id"
      AND entity."tenant_id" = e."tenant_id"
      AND entity."workspace_id" = e."workspace_id"
      AND entity."deleted_at" IS NULL
    LEFT JOIN lexical_candidates lexical ON lexical."id" = e."id"
    LEFT JOIN semantic_candidates semantic ON semantic."id" = e."id"
    ORDER BY LEAST(
      COALESCE(lexical."lexical_rank", 2147483647),
      COALESCE(semantic."semantic_rank", 2147483647)
    ), e."id"
    LIMIT ${input.candidateLimit * 2}
  `);
}

function semanticCandidateQuery(
  vector: string,
  input: HybridEvidenceSearchInput,
  sourceFilter: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`
    SELECT ranked."id",
           (row_number() OVER (
             ORDER BY ranked."semantic_distance", ranked."id"
           ))::integer AS "semantic_rank",
           GREATEST(
             0,
             LEAST(1, 1 - ranked."semantic_distance")
           )::double precision AS "semantic_score"
    FROM (
      SELECT e."id",
             (e."embedding" <=> ${vector}::vector)::double precision AS "semantic_distance"
      FROM "evidence_items" e
      WHERE e."tenant_id" = ${input.tenantId}
        AND e."workspace_id" = ${input.workspaceId}
        AND e."policy_status" <> 'blocked'
        AND e."embedding" IS NOT NULL
        ${sourceFilter}
      ORDER BY "semantic_distance", e."id"
      LIMIT ${input.candidateLimit}
    ) ranked
  `;
}

function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
