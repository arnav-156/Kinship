# Production Milestone 8: Embeddings and Hybrid Retrieval

## Status

Evidence ingestion, PostgreSQL retrieval, and ranking now form a complete embedding-backed search path. Newly ingested evidence receives a validated 1536-dimension embedding when a production provider is configured; existing evidence remains covered by the resumable maintenance command.

## Delivered

- Synchronous API ingestion and durable worker/connector ingestion generate embeddings before committing evidence.
- Mock-provider vectors are deliberately omitted because they are not compatible with production embeddings. A malformed production vector fails ingestion before its database transaction commits.
- Embedding writes are parameterized and require matching evidence, tenant, and workspace identifiers.
- Evidence search generates a query embedding through the configured model gateway and retrieves bounded candidate sets from PostgreSQL full-text search and pgvector cosine distance.
- Both retrieval branches enforce tenant, workspace, source-type, policy, and active-entity constraints.
- Reciprocal rank fusion combines lexical and semantic ranks before confidence, freshness, and metadata quality signals are applied.
- Search falls back to indexed lexical retrieval if query embedding generation is unavailable, malformed, or using the local mock provider. The API reports `retrievalMode` as `hybrid` or `lexical`.
- The existing backfill/reindex command remains the recovery path for evidence created before online embedding generation or during an approved provider outage.

## Database Query Shape

The lexical branch uses the stored `tsvector` and GIN index with `websearch_to_tsquery`. The semantic branch orders a bounded subquery by pgvector cosine distance so the IVFFlat index remains eligible before ranks are assigned. Only the union of those candidate IDs is joined to evidence and entity records.

The database adapter accepts vector values only after dimension and finite-number validation. All query text, scopes, filters, IDs, limits, and vector literals are passed through Prisma parameterization rather than SQL string interpolation.

## Verification

- Unit coverage validates embedding dimensions, scoped writes, parameterized hybrid SQL, query-provider fallback, online API/worker embedding writes, and reciprocal-rank fusion behavior.
- The labeled search-relevance set derives lexical and semantic ranks and enforces the existing metric thresholds against the production fusion function.
- CI applies the complete migration chain to disposable PostgreSQL with pgvector, inserts lexical, semantic, and overlapping candidates, writes real `vector(1536)` values, and verifies both rank branches through the production query adapter.
- CI continues to run lint, full typecheck, API compatibility, the security corpus, the complete unit suite, object-storage integration, and the monorepo build.

## Operational Boundary

Production hybrid retrieval requires `AI_PROVIDER=openai-compatible`, a valid provider key, and an embedding model that returns exactly 1536 dimensions. Provider failures degrade query-time search to lexical retrieval but fail new evidence ingestion so silently unembedded records are not introduced. Operators can use the documented checkpointed backfill after restoring provider service.
