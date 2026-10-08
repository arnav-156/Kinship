# Production Milestone 6: Recurring Connector Refresh Scheduler

## Status

Opt-in recurring refresh for supported connector accounts is complete. The dedicated scheduler enqueues durable connector-sync work; existing workers perform the fetch, evidence persistence, retry, dead-letter, and replay lifecycle.

## Delivered

- Owners and administrators configure refresh through the connector `PATCH` endpoint with an explicit enabled flag, interval, source identifier, and optional entity/subject context.
- Refresh configuration is stored in the connector account's existing metadata. Provider credentials are not copied into schedule metadata or queue payloads.
- The scheduler scans only active accounts and accepts only enabled, structurally valid schedules for providers already supported by the connector-sync worker.
- The latest connector run, including a manual run, establishes freshness. Queued or running connector work suppresses another scheduled enqueue.
- A due scan creates the `ConnectorRun`, `connector-sync` background job, and `connector_sync.queued` audit event in one transaction.
- The idempotency key combines connector ID and deterministic due timestamp. A uniqueness conflict from another scheduler replica is treated as already queued, so its transaction leaves no orphan run.
- Scheduled payloads carry `trigger: scheduled`, omit a user actor, and retain schedule attribution through worker progress, connector-run results, and completion audit metadata.
- Disabling a schedule prevents future enqueueing without deleting prior connector runs, evidence, or job history.

## Timing Contract

`SCHEDULER_INTERVAL_MS` controls how often the process checks for due work; it does not define a connector's refresh cadence. Each enabled connector stores `refreshIntervalMinutes` from 5 minutes through 30 days. The first due time is the configuration timestamp plus that interval. Later due times use the latest connector run's creation time plus the interval.

## Validation

Behavior specifications cover due enqueueing, excluded schedules, replica-race handling, overlap coalescing, scheduled payload validation, explicit configuration, and incomplete configuration. Static validation covers queue, API, scheduler, and worker projects. A deterministic compiled-runtime smoke exercises the configuration-to-enqueue path without a live database.

A live provider/database run still requires a migrated PostgreSQL database, configured credentials where applicable, and running scheduler/worker services. First-party OAuth provider implementations remain outside this slice.
