# Deployment

The repository provides Dockerfiles for API, scheduler, worker, and web plus a local Docker Compose stack.

The current stack expects managed PostgreSQL with pgvector, Redis, S3-compatible object storage, secrets management, migrations, health checks, rollback procedures, and backups for production deployment.

Milestone 9 adds the first production-hardening controls:

- `/health` for process liveness.
- `/ready` for database-backed readiness.
- `/metrics` for Prometheus-style process gauges.
- `x-request-id` propagation for request correlation.
- Stable JSON error envelopes with request IDs.
- Configurable CORS origins through `API_CORS_ORIGIN`.
- Configurable in-memory request rate limiting through `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.
- Nest shutdown hooks for cleaner process termination.
- A dedicated scheduler process for idempotent evidence-retention and opt-in connector-refresh enqueueing; set `SCHEDULER_INTERVAL_MS` to a positive scan interval and run one or more replicas against the shared database.

Before deploying a new environment, run:

```bash
corepack pnpm db:generate
corepack pnpm db:validate
corepack pnpm build
corepack pnpm test
corepack pnpm audit --prod
```

After the API is reachable, run a smoke check:

```bash
API_SMOKE_BASE_URL=https://api.example.com corepack pnpm smoke:api:strict
```

## Pilot Runbook

### Preflight

- Confirm `NODE_ENV=production`.
- Set a non-default `JWT_ACCESS_SECRET` through the target secret manager.
- Set `API_CORS_ORIGIN` to the deployed web origin, not `*`.
- Run database migrations before routing traffic.
- Verify object storage, Redis, and PostgreSQL connectivity from the target network.
- Keep `AI_PROVIDER=mock` unless a real provider key and budget limit are explicitly approved.

### Backup and Restore

- Take a PostgreSQL backup before each migration.
- Store backups outside the application container filesystem.
- Record the migration version, image tag, and backup identifier in the release log.
- Restore into a staging database first and run `corepack pnpm smoke:api:strict` against that environment before using a restore in production.

### Rollback

- Prefer rolling back application images before rolling back schema.
- If a migration is not backward compatible, restore the pre-migration backup to a fresh database and repoint the deployment.
- Keep the previous API and web image tags available until smoke checks pass after release.

### Incident Triage

- Check `/health` for process liveness.
- Check `/ready` for database readiness.
- Check `/metrics` for process uptime and memory.
- Use `x-request-id` from client errors to correlate API logs.
- If AI provider calls fail, switch to `AI_PROVIDER=mock` to preserve deterministic demo behavior while investigating.
