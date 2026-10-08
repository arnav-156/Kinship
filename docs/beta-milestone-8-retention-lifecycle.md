# Beta Milestone 8: Retention Lifecycle

## Outcome

Workspace owners and administrators can now configure and enforce evidence retention from the product. The policy covers evidence items and their source snapshots, uses each record's retrieval timestamp, and supports preview, manual cleanup, and automatic scheduled cleanup.

## Product Behavior

- New workspaces receive a 365-day evidence retention policy.
- New evidence and snapshots receive an expiration timestamp during ingestion.
- Policy updates retroactively recalculate expiration for existing records.
- Disabling automatic expiration clears scheduled expiration timestamps.
- Settings show due-record counts, the next expiration, and the last cleanup result.
- Manual cleanup requires explicit confirmation and is disabled when no records are due.

## Automation And Safety

The dedicated scheduler scans enabled policies at startup and then at the configured interval. It creates an idempotent queued job only when deletable records are due. The retention worker performs tenant/workspace-scoped cleanup, deletes expired evidence first, and then removes only expired snapshots with no remaining evidence. Concurrent sweeps are coalesced within a process, while the database idempotency constraint coordinates multiple scheduler replicas.

Each scheduled execution is stored as a `retention.cleanup` background job and uses the shared bounded retry, lease recovery, dead-letter, and replay contract. Queued and completed executions emit audit events containing counts and trigger type, without copying deleted evidence into logs.

## API

- `GET /v1/workspaces/:workspaceId/retention`
- `PUT /v1/workspaces/:workspaceId/retention/policies/evidence`
- `POST /v1/workspaces/:workspaceId/retention/preview`
- `POST /v1/workspaces/:workspaceId/retention/execute`

## Validation

- API tests: authorization, policy backfill, expiration calculation, cleanup ordering, jobs, and audit events.
- Web tests, typecheck, lint, and production build pass.
- Live PostgreSQL manual cleanup deleted an isolated evidence/snapshot pair.
- A separate 400-day-old fixture was deleted by the former in-API automatic startup sweep. The current dedicated scheduler/worker path requires a fresh live database integration run in the target environment.
