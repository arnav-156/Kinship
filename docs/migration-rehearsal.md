# Disposable Migration Rehearsal

`db:migration:rehearse` verifies the complete PostgreSQL migration chain without touching the configured application database. It creates a uniquely named, automatically removed `pgvector/pgvector:pg16` container with a random password and a host port bound only to `127.0.0.1`.

The utility exercises two independent database paths:

- **Clean deploy:** Prisma applies every migration to an empty database, then confirms that the resulting database matches `schema.prisma`.
- **Ordered upgrade:** each committed `migration.sql` is applied in timestamp order with `ON_ERROR_STOP`, then the resulting database is independently compared with `schema.prisma`.

The container is removed after success or failure. No volume is mounted, no existing Docker container is reused, and `DATABASE_URL` from `.env` is not read or modified.

## Compatibility review

Before Docker starts, the utility scans migration SQL for data deletion, table/column drops, truncation, `SET NOT NULL`, and rename operations. An unapproved finding blocks execution. A deliberately reviewed destructive migration must include:

```sql
-- rehearsal: allow-destructive
```

The annotation documents operator intent; it does not suppress SQL execution failures or schema-drift checks.

## Commands

Inspect the ordered migration set and compatibility findings without starting Docker:

```powershell
corepack pnpm db:migration:rehearse plan
corepack pnpm db:migration:rehearse run --dry-run
```

Run the disposable rehearsal:

```powershell
corepack pnpm db:migration:rehearse run `
  --execute `
  --confirm "REHEARSE MIGRATIONS IN A DISPOSABLE DATABASE"
```

Requirements are Docker Engine and the local project dependencies. The default image is `pgvector/pgvector:pg16`; an operator may pin an approved compatible image through `MIGRATION_REHEARSAL_IMAGE`.

Success reports the migration count, latest migration, compatibility findings, both database results, and the disposable container name. It never reports the generated password or database URLs.
