# Milestone 5: Search, Entity Resolution, RAG Foundation

Milestone 5 adds the first retrieval layer for relationship intelligence. It is intentionally explainable and database-backed before introducing model calls.

## Implemented

- `@relationship/search` ranking utilities for evidence candidates.
- Freshness, confidence, lexical, metadata, and future semantic/vector score slots.
- Retrieval-context card construction for later RAG prompts.
- Deterministic/probabilistic entity-resolution scoring.
- Offline identity-resolution review utility with candidate explanations, human-only merge/split operations, and replay-verifiable audit ledgers.
- Worker-owned embedding backfill/reindex command with dry-run, scoped batches, per-row atomic checkpoints, resume validation, dimension checks, and completion-only IVFFlat rebuild.
- Offline search-relevance evaluation CLI with fully labeled candidate pools, graded ranking metrics, deterministic dataset digests, and CI thresholds.
- API `SearchModule` with authenticated endpoints:
  - `POST /v1/search/evidence`
  - `POST /v1/search/prospects`
  - `POST /v1/search/similar-people`
- Tenant/workspace authorization before every search.
- Tenant/workspace filters in all Prisma search queries.

## Entity Resolution Rules

Strong deterministic identifiers can produce matches:

- Primary email hash.
- ORCID.
- GitHub login.
- Exact profile URL.
- Organization domain.

Weaker signals can trigger review but not automatic identity merging:

- Name or alias similarity.
- Name plus location.
- Name plus employer evidence.

LLM suggestions are reserved for explanation or triage in later milestones. They are not sufficient for identity resolution.

The identity operator utility is documented in `docs/identity-resolution-review-utility.md`. Embedding maintenance is documented in `docs/embedding-maintenance.md`. Search relevance evaluation is documented in `docs/search-relevance-evaluation.md`. The runtime vector query and rank-fusion path was subsequently delivered in `docs/production-milestone-8-hybrid-retrieval.md`; the durable database/API/UI identity review workflow remains out of scope.

## RAG Boundary

The current retrieval output produces compact evidence cards with evidence IDs, summaries, source type, confidence, and rank score. Future generation services must cite these cards rather than inventing relationship claims.

## Verification

Static verification completed:

- `corepack pnpm --filter @relationship/search typecheck`
- `corepack pnpm --filter @relationship/search build`
- `corepack pnpm --filter @relationship/search lint`
- `corepack pnpm --filter @relationship/api typecheck`
- `corepack pnpm --filter @relationship/api lint`
- `corepack pnpm --filter @relationship/api build`
- `corepack pnpm format`

Vitest was not runnable in the managed sandbox because Vite/esbuild startup failed with `spawn EPERM`. The focused tests are present and should be run when process-spawn approval or a normal local shell is available.
