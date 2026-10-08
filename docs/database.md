# Database

Milestone 2 implements the PostgreSQL database foundation with Prisma, migrations, seed data, tenant-scoped repository helpers, and transaction helpers.

## Prisma

Database files live in `packages/db`:

- `prisma/schema.prisma`: domain schema.
- `prisma/migrations/20260703195000_initial_core_domain/migration.sql`: initial SQL migration.
- `prisma/seed.ts`: idempotent local development seed.
- `src/client.ts`: Prisma client factory.
- `src/transaction.ts`: transaction runner.
- `src/repositories/*`: tenant/workspace-scoped repository helpers.

## Core Tables

The schema includes tenants, users, workspaces, workspace memberships, entities, people, organizations, affiliations, aliases, source identifiers, source snapshots, evidence items, prospect lists, prospect list members, relationship briefs, draft messages, contact channels, suppression entries, relationship notes, audit events, connector accounts, connector runs, AI runs, AI evals, background jobs, and retention policies.

## Isolation and Indexing

Tenant-owned tables include `tenant_id`; workspace-owned tables include `workspace_id`. Repository helpers require tenant/workspace scope for common reads and writes.

The initial migration enables `pgvector`, creates `evidence_items.embedding vector(1536)`, maintains `evidence_items.search_vector` with a trigger, and adds GIN full-text and IVFFlat vector indexes.

The operational backfill/reindex command and checkpoint recovery procedure are documented in `docs/embedding-maintenance.md`.

## Commands

```bash
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
```

For CI or already-created databases:

```bash
corepack pnpm --filter @relationship/db exec prisma migrate deploy --config prisma.config.ts
```

## User Data Requests

`user_data_requests` stores tenant/user-scoped export and deletion lifecycle records. It records request type, processing status, failure reason, completion time, and export expiry. Export snapshots are stored as JSON for the Beta foundation and cleared after 24 hours; production-scale object storage can replace the JSON field without changing the API contract.
