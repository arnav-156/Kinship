# Embedding Backfill and Reindex Command

The embedding maintenance command populates the existing PostgreSQL `evidence_items.embedding vector(1536)` column in bounded batches. It supports resumable backfills, deliberate full reindexing, tenant/workspace scope, dimension validation, and side-effect-free dry runs.

## Safety First

Start with a dry run. It counts selected rows but does not call the embedding provider, update PostgreSQL, create a checkpoint, or rebuild an index.

```bash
corepack pnpm embedding:maintain backfill --tenant tenant_id --workspace workspace_id --dry-run
```

A workspace scope requires a tenant scope. Write mode refuses the mock provider because its test vectors do not match the production `vector(1536)` schema.

## Backfill Missing Embeddings

`backfill` selects only rows whose embedding is null. Checkpoint files are operator-owned artifacts; use a path outside source control.

```bash
AI_PROVIDER=openai-compatible OPENAI_API_KEY=... corepack pnpm embedding:maintain backfill \
  --tenant tenant_id \
  --workspace workspace_id \
  --batch-size 25 \
  --checkpoint C:/operations/embedding-backfill.json
```

The checkpoint is atomically rewritten after every successful database update. It records mode, scope, model, expected dimensions, cursor, cumulative count, status, timestamps, and the last error without storing evidence text, vectors, or provider credentials.

Resume with the identical mode, model, scope, batch size, and dimensions:

```bash
AI_PROVIDER=openai-compatible OPENAI_API_KEY=... corepack pnpm embedding:maintain backfill \
  --tenant tenant_id \
  --workspace workspace_id \
  --batch-size 25 \
  --checkpoint C:/operations/embedding-backfill.json \
  --resume
```

Use `--max-items N` to pause intentionally after a bounded number of successful rows. Resume the resulting `paused` checkpoint normally.

## Full Reindex

`reindex` regenerates every selected embedding, including existing vectors. The IVFFlat index is rebuilt only after every selected row has completed and the cursor reaches the end.

```bash
AI_PROVIDER=openai-compatible OPENAI_API_KEY=... corepack pnpm embedding:maintain reindex \
  --checkpoint C:/operations/embedding-reindex.json
```

PostgreSQL `REINDEX` can contend with production traffic. Schedule full reindexing during an approved maintenance window and monitor database locks and query latency.

## Options and Verification

Defaults are `--batch-size 25`, `--expected-dimensions 1536`, `--timeout-ms 30000`, and `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`. Provider vectors are rejected before database writes unless their reported length, actual length, and every numeric value are valid.

Run the database-free checkpoint/resume demonstration with:

```bash
corepack pnpm embedding:maintain scenario
```

The scenario pauses after two rows, resumes at the saved cursor, processes the final row without duplication, and rebuilds the index exactly once.
