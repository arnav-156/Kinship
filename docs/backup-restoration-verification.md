# Backup Restoration Verification

`db:backup:verify` proves that the project's PostgreSQL backup and restore path works without reading or modifying the configured application database.

The command creates a uniquely named `pgvector/pgvector:pg16` container with a random password and a dynamic host port bound only to `127.0.0.1`. It then:

1. applies every Prisma migration to a synthetic source database;
2. inserts one clearly labeled synthetic tenant canary;
3. creates and validates a custom-format `pg_dump` archive;
4. records the archive byte size and SHA-256;
5. restores the archive into a new empty database with `pg_restore --exit-on-error`;
6. compares the restored schema with `schema.prisma`;
7. compares deterministic source and restored canary fingerprints; and
8. removes the container and in-container archive after success or failure.

No host volume is mounted. The utility does not read `.env`'s `DATABASE_URL`, connect to an existing PostgreSQL service, or retain the synthetic archive. This is a repeatable restoration drill, not a production backup scheduler.

## Commands

Inspect the drill without starting Docker:

```powershell
corepack pnpm db:backup:verify plan
corepack pnpm db:backup:verify run --dry-run
```

Run the live disposable verification:

```powershell
corepack pnpm db:backup:verify run `
  --execute `
  --confirm "VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE"
```

Docker Engine and installed project dependencies are required. The default image is `pgvector/pgvector:pg16`; an operator can pin an approved compatible image with `BACKUP_VERIFICATION_IMAGE`.

A passing report includes the archive format, positive byte size, SHA-256, matching source/restored fingerprints, schema compatibility, and the disposable container name. After the command finishes, confirm no container remains if investigating a host-level Docker failure:

```powershell
docker ps -a --filter "name=relationship-backup-verification-"
```

## Production use

Continue taking encrypted PostgreSQL backups before migrations, storing them outside application container filesystems, and recording backup identifiers in the release log. Production backup artifacts should be restored into an isolated staging environment and validated with application readiness and smoke checks before any recovery cutover.
