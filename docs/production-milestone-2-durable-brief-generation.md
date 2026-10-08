# Production Milestone 2: Durable Relationship-Brief Generation

## Status

The relationship-brief-generation vertical is complete. Draft generation and explicitly requested connector synchronization are documented separately as completed durable verticals.

## Delivered

- `POST /v1/relationship-briefs` validates workspace scope, subject entity, and evidence availability, then persists work instead of calling the model provider in the API process.
- An optional `Idempotency-Key` header deduplicates repeated requests within the tenant and `brief-generation` queue.
- The dedicated worker atomically leases queued PostgreSQL jobs, validates the stored tenant/workspace scope, generates the grounded brief, and reports progress.
- Relationship brief, successful AI-run evidence, job completion, and audit evidence commit in one database transaction.
- Provider failures persist failed AI-run evidence before the durable worker schedules bounded retry or dead-letters the final attempt.
- Expired leases are recoverable after worker interruption.
- The Trust workspace polls the existing job-status API and hydrates the generated brief from the completed job's `progress.briefId`.
- The dead-letter operator utility validates and replays both evidence-ingestion and relationship-brief-generation payloads.

## Request and Result Contract

The enqueue response is a background job, not a relationship brief. Clients should poll `GET /v1/evidence/jobs/:jobId`. When the job completes, `progress.briefId` identifies the stored result, which is available from `GET /v1/relationship-briefs/:id`.

The queue uses the existing `background_jobs` table and the shared PostgreSQL lease runner. `available_at`, `locked_at`, `locked_by`, and `completed_at` provide backoff, leasing, recovery, and completion evidence.

## Validation

Focused tests cover payload validation, API idempotency, absence of API-process model calls, atomic worker claims, bounded retry, final-attempt dead-lettering, expired-lease recovery, successful transactional completion, failure evidence, replay eligibility, and UI result classification.

The broader resilient-execution milestone remains open for immutable object snapshots and remaining job families; scheduled evidence retention and recurring connector refresh are now complete. Live provider validation also requires configured provider credentials and a migrated PostgreSQL database.
