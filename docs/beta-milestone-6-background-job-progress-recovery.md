# Beta Milestone 6: Background Job Progress and Recovery

## Status

Complete for the Product B/Beta user-facing requirement.

## Delivered

- Evidence ingestion can be queued through a durable database-backed job record.
- Jobs expose queued, active, completed, failed, dead-lettered, and canceled states.
- Progress records the current stage, percent complete, attempt count, retry ceiling, and successful evidence result identifiers.
- The Trust workspace polls only while jobs are queued or active and shows progress, sanitized failure reasons, Retry, and queued-only Cancel controls.
- Completed jobs rehydrate entity evidence into the active workspace without duplicating signals.
- Failed and dead-lettered jobs can be replayed. Dead-letter replay starts a fresh bounded attempt cycle.
- Cancellation is intentionally restricted to queued work. Active work returns HTTP 409.
- Queued or active jobs left stale by an interrupted API process become retryable failed jobs during workspace job refresh.
- Queue, retry, cancellation, failure, dead-letter, and interrupted-recovery actions are tenant/workspace scoped and audited.

## Architecture Boundary

This document records the original Beta boundary. The later production durable-execution vertical replaces the API-local timer for evidence ingestion with a dedicated PostgreSQL-leasing worker, startup lease recovery, automatic bounded retry, and dead-letter replay. AI generation jobs remain production platform work.

## Validation

- corepack pnpm --filter @relationship/api test
- corepack pnpm --filter @relationship/api typecheck
- corepack pnpm --filter @relationship/web test
- corepack pnpm --filter @relationship/web typecheck
- corepack pnpm --filter @relationship/web lint
- corepack pnpm --filter @relationship/web build
- DB-backed live checks for completion, failure, retry, and safe cancellation conflict
