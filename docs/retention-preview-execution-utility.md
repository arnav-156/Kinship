# Retention Preview and Execution Utility

## Purpose

The operator CLI previews and executes workspace-scoped evidence retention cleanup. It uses the existing evidence retention policy and does not create or change policies. Normal mode requires the correct `DATABASE_URL` and writes durable background-job and audit evidence.

## Dry-run Preview

```powershell
corepack pnpm retention:admin cleanup `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --operator <operator-identity> `
  --dry-run
```

Dry-run is read-only. It verifies that the workspace belongs to the tenant, requires an existing evidence policy, and reports the policy, expired evidence and snapshot counts, next expiration, and exact confirmation phrase. It creates no job or audit records.

## Confirmed Execution

Run dry-run first, inspect its scope and counts, then copy the exact confirmation phrase:

```powershell
corepack pnpm retention:admin cleanup `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --operator <operator-identity> `
  --execute `
  --confirm "DELETE EXPIRED EVIDENCE <workspace-id>"
```

Execution refuses missing or mismatched confirmation and refuses when no records are due. It creates a retention-cleanup job, transactionally removes expired evidence before expired unreferenced source snapshots, marks the job complete, and records an operator-attributed audit event. A transaction failure marks the job failed and writes a failure audit event.

If `--operator` is omitted, the executable uses `RETENTION_ADMIN_OPERATOR`, then the local Windows username. Production runbooks should pass a stable operator identity explicitly.

## Safe Deterministic Verification

Scenario mode never opens a database connection and only accepts `fixture-tenant` / `fixture-workspace`:

```powershell
corepack pnpm retention:admin cleanup --tenant fixture-tenant --workspace fixture-workspace --dry-run --scenario
corepack pnpm retention:admin cleanup --tenant fixture-tenant --workspace fixture-workspace --execute --confirm "DELETE EXPIRED EVIDENCE fixture-workspace" --scenario
```

Scenario mode verifies argument parsing, dry-run output, and guarded execution dispatch. It is not database-integration evidence. Normal mode requires a migrated PostgreSQL database and the correct `DATABASE_URL`.
