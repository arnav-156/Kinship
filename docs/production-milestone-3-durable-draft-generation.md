# Production Milestone 3: Durable Draft Generation

## Status

The draft-generation vertical is complete. Evidence ingestion, relationship-brief generation, and explicitly requested connector synchronization use the same PostgreSQL lease contract.

## Delivered

- `POST /v1/relationship-briefs/:id/drafts` validates the tenant/workspace-scoped brief and persists work instead of calling the model provider in the API process.
- An optional `Idempotency-Key` header deduplicates repeated requests within the tenant and `draft-generation` queue.
- The dedicated worker atomically leases queued jobs, validates the stored scope and variant, generates the grounded draft, and reports progress.
- The worker evaluates the latest scoped channel context and both workspace and tenant suppression entries before persistence.
- Draft, initial immutable version, successful AI-run evidence, job completion, and audit evidence commit in one database transaction.
- Provider or processing failures persist failed AI-run evidence before bounded retry or final dead-lettering.
- Expired leases are recoverable after worker interruption.
- The Trust workspace polls the shared job-status API and hydrates the generated draft from `progress.draftId`.
- The dead-letter operator utility validates and replays evidence-ingestion, relationship-brief-generation, and draft-generation payloads.

## Request and Result Contract

The enqueue response is a background job, not a draft. Clients should poll `GET /v1/evidence/jobs/:jobId`. When the job completes, `progress.draftId` identifies the stored result, which is available from `GET /v1/drafts/:id`.

The queue uses the existing `background_jobs` table and shared PostgreSQL lease runner. `available_at`, `locked_at`, `locked_by`, and `completed_at` provide backoff, leasing, recovery, and completion evidence.

## Validation

Focused tests cover payload and variant validation, API idempotency, atomic worker claims, bounded retry, final-attempt dead-lettering, expired-lease recovery, transactional persistence, provider-failure evidence, suppression blocking, dead-letter replay eligibility, and UI result classification.

Live provider validation still requires configured provider credentials and a migrated PostgreSQL database. Connector synchronization is documented as a separate completed slice.
