# Production Milestone 7: Immutable Source Snapshot Storage

## Status

S3-compatible object storage is now part of the evidence-ingestion and retention runtime. Both synchronous API ingestion and durable worker ingestion persist the connector's raw response before committing a database pointer to it.

## Delivered

- `packages/storage` provides an S3-compatible adapter for create-only writes, reads, and idempotent deletes.
- Snapshot keys are deterministic and content-addressed under `source-snapshots/v1`, scoped by encoded tenant and workspace identifiers and a SHA-256 digest.
- The adapter recalculates the supplied content hash before any network write. A mismatch fails ingestion.
- `If-None-Match: *` prevents overwriting an existing key. A retry succeeds only when the existing object's length, content type, and hash metadata match.
- Object metadata records the content hash, source type, policy state, retrieval timestamp, optional retention expiry, tenant/workspace scope, and lifecycle schema version. Source URLs and source identifiers are intentionally excluded.
- `source_snapshots.content_type` and `source_snapshots.storage_key` are written in the same database transaction as evidence, completion state, and audit evidence.
- Scheduled, API-triggered, and administrative retention cleanup delete an expired snapshot's object before deleting its database row. Storage failure aborts and rolls back database cleanup so the durable job can retry.
- Docker Compose runs a pinned SeaweedFS single-node S3 service and provisions the configured bucket before API and worker startup. `S3_REGION` defaults to `us-east-1`.
- API readiness now checks both PostgreSQL and the configured object-storage bucket.

## Consistency Contract

The object write happens before the database transaction. A failed object write therefore cannot create a database pointer to missing content. If a later database transaction fails, a content-addressed unreferenced object may remain; replay reuses the identical object safely. Retention deletes objects before their database rows while the cleanup transaction is open, and deletion is idempotent. If a multi-object cleanup fails after an earlier delete, expired database rows can temporarily point to already-deleted objects until the durable job retries and completes the database cleanup.

The database remains authoritative for mutable lifecycle state. Object metadata records the lifecycle decision at first capture; later retention-policy changes backfill the database expiration timestamp without rewriting immutable source content.

## Verification

Unit coverage verifies content-hash enforcement, deterministic scoped keys, create-only writes, idempotent replay, collision rejection, reads, deletes, API and worker persistence ordering, database metadata, and rollback behavior when object deletion fails. The local Compose path uses the same S3 adapter against SeaweedFS.

The opt-in S3 integration specification is `packages/storage/src/s3.integration.spec.ts`. It exercises create, replay, read, delete, and health checks against the real S3-compatible service. CI starts SeaweedFS and runs this specification on every change. For local use, start the Compose object-storage service, set `RUN_STORAGE_INTEGRATION=true`, and run the storage package test directly.

The retired `minio-data` development volume is intentionally not mounted into SeaweedFS because the two products use incompatible on-disk formats. Docker leaves that old named volume untouched; it can be removed manually only after confirming it contains no data that must be preserved.

Production deployment must provision the bucket and grant only `GetObject`, `PutObject`, `HeadObject`, and `DeleteObject` for the `source-snapshots/v1/` prefix. Bucket versioning, encryption, access logging, recovery drills, and any signed-read endpoint remain deployment/security work rather than part of this ingestion slice.
