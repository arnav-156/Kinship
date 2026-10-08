# Dead-letter Inspection and Replay Utility

## Purpose

The operator CLI lists and inspects tenant-scoped dead-lettered background jobs and safely replays supported evidence-ingestion, relationship-brief-generation, draft-generation, connector-sync, and scheduled retention-cleanup work. Normal mode requires the correct `DATABASE_URL`. Inspection is read-only; replay requires explicit confirmation and writes durable audit evidence.

## List Dead Letters

```powershell
corepack pnpm jobs:dead-letter list `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  [--workspace <workspace-id>] `
  [--limit <1-200>]
```

The command returns newest dead letters first with sanitized failure information, attempt counts, queue/job names, workspace scope, and replay eligibility. Unsupported job families and invalid stored payloads remain inspectable but are marked non-replayable.

## Inspect One Job

```powershell
corepack pnpm jobs:dead-letter inspect `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  --job <job-id>
```

Inspection requires the job to be dead-lettered in the requested tenant. It includes stored payload, progress, lease state, timestamps, failure reason, replay eligibility, and the exact confirmation phrase. Treat its output as operational data because supported job payloads can contain user-supplied context.

## Replay Preview

```powershell
corepack pnpm jobs:dead-letter replay `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  --job <job-id> `
  --dry-run
```

Replay dry-run is the same read-only inspection and performs no writes.

## Confirmed Replay

Run dry-run first, verify the tenant/workspace, queue, payload, and failure, then copy its exact phrase:

```powershell
corepack pnpm jobs:dead-letter replay `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  --job <job-id> `
  --execute `
  --confirm "REPLAY DEAD LETTER <job-id>"
```

Jobs with valid stored payloads can be replayed for these queue/name pairs:

- `evidence-ingestion` / `evidence.ingest`
- `brief-generation` / `relationship_brief.generate`
- `draft-generation` / `draft_message.generate`
- `connector-sync` / `connector.sync`
- `retention-cleanup` / `retention.cleanup` for validated scheduled payloads

Execution atomically verifies the dead-letter status, resets attempts to zero, clears the failure/completion/lease state, makes the job immediately available, records queued progress, and creates an operator-attributed `background_job.replay_requested` audit event. The matching worker claims the queued job through the existing durable PostgreSQL lease contract.

If `--operator` is omitted, the executable uses `DEAD_LETTER_OPERATOR`, then the local Windows username. Production runbooks should pass a stable operator identity explicitly.

## Safe Deterministic Verification

Scenario mode never opens a database connection and accepts only tenant `fixture-tenant`, workspace `fixture-workspace`, and job `fixture-dead-letter`:

```powershell
corepack pnpm jobs:dead-letter list --tenant fixture-tenant --workspace fixture-workspace --limit 25 --scenario
corepack pnpm jobs:dead-letter inspect --tenant fixture-tenant --job fixture-dead-letter --scenario
corepack pnpm jobs:dead-letter replay --tenant fixture-tenant --job fixture-dead-letter --dry-run --scenario
corepack pnpm jobs:dead-letter replay --tenant fixture-tenant --job fixture-dead-letter --execute --confirm "REPLAY DEAD LETTER fixture-dead-letter" --scenario
```

Scenario mode verifies parsing, inspection, dry-run, and guarded execution dispatch. It is not database-integration evidence. Normal mode requires a migrated PostgreSQL database and the correct `DATABASE_URL`.
