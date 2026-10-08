# Data Export/Delete Administrative Utility

## Purpose

The operator CLI handles supervised privacy requests when the self-service `/v1/users/me` flow is unavailable. It is intentionally a local operational tool rather than a tenant-wide HTTP admin endpoint: the current product authorization model has workspace roles, not a privileged platform-operator identity.

The utility always requires an explicit tenant and user ID. Normal mode uses `DATABASE_URL`, writes durable `user_data_requests` state and audit evidence, and never includes password hashes, tokens, credentials, or provider secrets in exports.

## Export

```powershell
corepack pnpm privacy:admin export `
  --tenant <tenant-id> `
  --user <user-id> `
  --operator <operator-identity> `
  --output <new-json-file>
```

The output path must not already exist. The export is scoped to the specified tenant/user pair and contains the account profile, memberships, directly authored content, and actor-scoped audit activity. A completed administrative export request expires after 24 hours.

## Deletion Preview

```powershell
corepack pnpm privacy:admin delete `
  --tenant <tenant-id> `
  --user <user-id> `
  --operator <operator-identity> `
  --dry-run
```

Dry-run is read-only. It reports removal/scrubbing counts, solo workspaces that would be deactivated, whether the tenant would be deactivated, ownership blockers, and the exact required confirmation phrase. A blocked plan exits with status `2`.

## Confirmed Deletion

Run preview first. Then copy the exact confirmation phrase:

```powershell
corepack pnpm privacy:admin delete `
  --tenant <tenant-id> `
  --user <user-id> `
  --operator <operator-identity> `
  --execute `
  --confirm "DELETE <user-id>"
```

Execution refuses missing or mismatched confirmation and shared workspaces that would lose their only owner. It removes memberships and authored relationship notes, scrubs direct attribution from retained records, deactivates solo workspaces, anonymizes and disables the user, deactivates an empty tenant, and records completion in one database transaction. Transaction failures leave a durable failed request and failure audit event.

If `--operator` is omitted, the executable uses `PRIVACY_ADMIN_OPERATOR`, then the local Windows username. Production runbooks should always pass a stable operator identity explicitly.

## Safe Deterministic Verification

Scenario mode never opens a database connection and only accepts `fixture-tenant` / `fixture-user`:

```powershell
corepack pnpm privacy:admin export --tenant fixture-tenant --user fixture-user --output scenario-export.json --scenario
corepack pnpm privacy:admin delete --tenant fixture-tenant --user fixture-user --dry-run --scenario
corepack pnpm privacy:admin delete --tenant fixture-tenant --user fixture-user --execute --confirm "DELETE fixture-user" --scenario
```

Scenario mode verifies command parsing, immutable export creation, dry-run output, and destructive confirmation dispatch. It is not database integration evidence. Normal mode requires a migrated PostgreSQL database and the correct `DATABASE_URL`.
