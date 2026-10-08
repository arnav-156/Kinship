# Milestone 2: Database and Core Domain

## Delivered

- Prisma 7 configured for PostgreSQL.
- Initial schema and migration for required core tables.
- pgvector extension and `vector(1536)` evidence embeddings.
- PostgreSQL full-text search vector on evidence summaries.
- Composite tenant/workspace indexes, foreign keys, and unique constraints.
- Idempotent local seed data.
- Prisma client factory, transaction runner, and initial tenant-scoped repositories.
- Unit tests for repository scoping helpers.

## Verification

Verified locally against this project PostgreSQL container on host port `55432`:

- Migration applied successfully with `prisma migrate deploy`.
- Seed ran successfully and was rerun to confirm idempotency.
- Seeded counts: 1 tenant, 1 workspace, 1 user, 2 entities, 1 evidence item.
- `vector` extension exists.
- Evidence GIN full-text and IVFFlat vector indexes exist.

## Notes

Another running project was already using host port `5432`, so this milestone was verified with `POSTGRES_PORT=55432`. The Compose file now supports configurable host ports for PostgreSQL, Redis, MinIO, API, and web.
