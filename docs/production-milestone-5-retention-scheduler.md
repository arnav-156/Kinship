# Production Milestone 5: Durable Retention Scheduler

## Status

Scheduled evidence-retention enforcement is complete. A dedicated scheduler now creates durable cleanup work, and the API no longer runs destructive timers inside request-serving replicas.

## Delivered

- `apps/scheduler` scans enabled workspace evidence-retention policies immediately at startup and every `SCHEDULER_INTERVAL_MS`.
- Missing workspace policies are created with the existing 365-day default and existing evidence expiration timestamps are backfilled transactionally; new secondary workspaces create their policy in the workspace transaction.
- A workspace is queued only when expired evidence or an expired unreferenced source snapshot exists and no cleanup is already queued or active.
- The earliest deletable expiration produces a deterministic tenant/queue idempotency key. Concurrent scheduler replicas treat the database uniqueness conflict as already queued.
- Overlapping in-process sweep requests coalesce into one database scan.
- Job creation and `retention.cleanup.queued` audit evidence commit transactionally.
- The `retention-cleanup` worker validates tenant/workspace scope and a fixed enqueue-time cutoff, deletes expired evidence before unreferenced snapshots, and commits deletion counts, completion state, and audit evidence transactionally.
- Bounded retry, lease recovery, dead-lettering, administrative replay, and graceful scheduler shutdown use the shared durable-job contracts.
- Docker Compose includes a separate scheduler service. `SCHEDULER_INTERVAL_MS` defaults to five minutes.

## Safety Contract

The scheduler does not delete data. It only enqueues validated work. The worker never deletes records expiring after the job's stored `cutoffAt`, even if processing is delayed. Disabled policies are excluded, active work suppresses duplicate enqueueing, and failed final attempts require the existing explicit replay workflow.

Manual retention preview and confirmed administrative execution remain available and unchanged.

## Validation

Behavior specifications cover due-only enqueueing, deterministic duplicate handling, overlap coalescing, cutoff-scoped transactional deletion, atomic worker claims, payload validation, and dead-letter eligibility. Static validation covers the queue, config, API, scheduler, and worker projects; deterministic compiled-runtime smoke checks exercise the critical scheduler-to-worker path without a live database.

A live integration run still requires a migrated PostgreSQL database and running scheduler/worker services. Recurring connector refresh is delivered separately in Production Milestone 6.
