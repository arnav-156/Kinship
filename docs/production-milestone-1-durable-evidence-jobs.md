# Production Milestone 1: Durable Evidence Jobs

## Status

The evidence-ingestion vertical is complete. AI generation jobs, object-storage persistence, and a broader operator dashboard remain within the larger resilient-execution milestone.

## Delivered

- POST /v1/evidence/jobs now persists work only; the API no longer schedules connector execution with an in-process timer.
- The dedicated worker leases queued PostgreSQL jobs with an atomic status transition.
- Leases are heartbeated at each connector stage and recovered after worker interruption.
- Failed attempts use bounded exponential backoff and become dead-lettered after the configured retry ceiling.
- Dead-lettered work remains visible through the existing Trust workspace and can be replayed through the existing retry endpoint.
- An optional Idempotency-Key header deduplicates repeated queue requests within a tenant and queue.
- Evidence, source snapshots, job completion, and ingestion audit evidence commit in one database transaction.
- Worker shutdown drains the active poll and disconnects Prisma cleanly.

## Configuration

- WORKER_CONCURRENCY
- WORKER_POLL_INTERVAL_MS
- WORKER_LEASE_MS

The queue uses the existing background_jobs table as a durable PostgreSQL work queue. available_at, locked_at, locked_by, and completed_at provide backoff, leasing, recovery, and completion evidence.

## Validation

Focused validation covers atomic claim behavior, retry scheduling, dead-letter transitions, retry-delay caps, payload validation, API idempotency, schema validation, worker/API type checking, and production builds.

Live validation must run API and worker as separate processes, queue an isolated public-URL fixture, and prove completion. Restart recovery is verified by leasing an isolated queued job to a terminated worker identity and confirming a replacement worker recovers it.
