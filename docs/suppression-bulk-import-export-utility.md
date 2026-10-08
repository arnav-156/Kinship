# Suppression Bulk Import/Export Utility

## Purpose

The operator CLI moves active suppression ledger entries in a stable CSV format and imports them safely in bulk. Normal mode requires the correct `DATABASE_URL`. Every operation is tenant-scoped, and exported files contain only SHA-256 contact hashes—never raw email addresses, phone numbers, or other contact values.

## CSV Format

The required header is:

```text
workspace_id,channel_type,value,value_hash,reason,source
```

Each import row must provide exactly one of `value` or `value_hash`. Raw `value` fields are normalized and hashed with the existing compliance algorithm before persistence. A `value_hash` must be 64 lowercase hexadecimal characters, which makes an export directly re-importable. `workspace_id` may be empty for a tenant-wide suppression; otherwise it must identify an active workspace in the requested tenant. Supported channel types are `email`, `linkedin_context`, `phone`, `meeting`, and `unknown`.

## Export

```powershell
corepack pnpm suppression:admin export `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  --output <new-csv-file>
```

Export includes active entries only and sorts them by workspace, channel type, and value hash. The output path must not already exist.

## Import Preview

```powershell
corepack pnpm suppression:admin import `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  --input <csv-file> `
  --dry-run
```

Dry-run parses and validates the complete file, rejects duplicate rows, confirms that every workspace belongs to the tenant, and reports create/update/reactivate counts plus the exact confirmation phrase. Its output contains hashes, not raw imported values, and it performs no writes.

## Confirmed Import

Run dry-run first, then copy its exact confirmation phrase:

```powershell
corepack pnpm suppression:admin import `
  --tenant <tenant-id> `
  --operator <operator-identity> `
  --input <csv-file> `
  --execute `
  --confirm "IMPORT <count> SUPPRESSIONS <tenant-id>"
```

Execution revalidates the file, refuses a mismatched confirmation, and performs the entire create/update/reactivate operation plus its operator-attributed audit event in one database transaction. Existing active entries receive the imported reason/source; soft-deleted matches are reactivated.

If `--operator` is omitted, the executable uses `SUPPRESSION_ADMIN_OPERATOR`, then the local Windows username. Production runbooks should pass a stable operator identity explicitly.

## Safe Deterministic Verification

Scenario mode never opens a database connection. It only accepts tenant `fixture-tenant` and the committed fixture:

```powershell
corepack pnpm suppression:admin export --tenant fixture-tenant --output <new-csv-file> --scenario
corepack pnpm suppression:admin import --tenant fixture-tenant --input apps/api/fixtures/suppression-import.csv --dry-run --scenario
corepack pnpm suppression:admin import --tenant fixture-tenant --input apps/api/fixtures/suppression-import.csv --execute --confirm "IMPORT 2 SUPPRESSIONS fixture-tenant" --scenario
```

Scenario mode verifies command parsing, exclusive export creation, dry-run output, and guarded execution dispatch. It is not database-integration evidence. Normal mode requires a migrated PostgreSQL database and the correct `DATABASE_URL`.
