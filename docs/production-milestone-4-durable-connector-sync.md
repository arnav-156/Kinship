# Production Milestone 4: Durable Connector Synchronization

## Status

The explicitly requested connector-synchronization vertical is complete. Active supported connector accounts can enqueue durable work; recurring scheduling is delivered in Production Milestone 6, while first-party OAuth connector implementations remain separate requirements.

## Delivered

- `POST /v1/workspaces/:workspaceId/admin/connectors/:connectorId/sync` validates owner/admin access, connector state/provider, optional entity scope, source identifier, and idempotency key before persisting work.
- A repeated tenant/queue `Idempotency-Key` returns the original job and does not create another connector run. Reuse for another connector or workspace is rejected.
- The API creates a scoped `ConnectorRun` and `connector-sync` background job in one transaction and records `connector_sync.queued` audit evidence.
- The dedicated worker atomically leases connector-sync jobs through the shared PostgreSQL runner, validates the account and payload scope, and uses the registered connector ingestion pipeline.
- Evidence, source snapshot, entity resolution, job completion, connector-run completion, and `connector_sync.completed` audit evidence commit transactionally.
- Failed attempts and recovered non-final leases return the connector run to `queued`; final failures or final-attempt lease expiry mark it `failed` and finalized. The durable runner applies bounded backoff and dead-lettering.
- Dead-letter inspection and confirmed replay accept validated `connector-sync` / `connector.sync` payloads.
- The Trust workspace can enqueue a sync from the current source context, poll shared job status, hydrate completed evidence, and refresh connector state.

## Request and Result Contract

The request body requires `sourceIdentifier` and accepts optional `subjectName` and `entityId`. The response is a background job, not evidence. Clients should poll `GET /v1/evidence/jobs/:jobId`.

Completed progress includes `connectorRunId`, `entityId`, `evidenceItemIds`, and `sourceSnapshotId`. The queue uses the existing `background_jobs` lease fields and the shared recovery, retry, cancellation, and replay contracts.

## Validation

Focused tests cover queue-payload validation, API enqueue/idempotency, successful transactional processing, final failure handling, atomic worker claims, dead-letter replay eligibility, and UI result classification. Static validation covers the queue, API, worker, and web TypeScript projects plus changed-source linting and OpenAPI compatibility.

Live provider and database integration validation requires a migrated PostgreSQL database, configured provider credentials where applicable, and running API/worker services. The separate recurring scheduler reuses this durable worker contract.
