# Connector Token Rotation and Revocation Utility

## Purpose

The operator CLI inspects, rotates, and revokes connector credentials within an explicit tenant, workspace, and connector-account scope. Tokens are stored in a separate `connector_credentials` table using AES-256-GCM authenticated encryption. Connector account API responses do not include that relation, ciphertext, IVs, or authentication tags.

Normal mode requires the correct `DATABASE_URL`, an applied `20260724110500_connector_credentials` migration, and a base64-encoded 32-byte encryption key. Run the migration through the normal deployment process before the first live rotation.

## Encryption Key Setup

Generate a new 32-byte key and place the base64 value in the protected runtime environment as `CONNECTOR_TOKEN_ENCRYPTION_KEY`. For a local PowerShell session:

```powershell
$env:CONNECTOR_TOKEN_ENCRYPTION_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Do not commit this value to `.env`, logs, tickets, or shell scripts. Production deployments should inject it through the platform secret manager. The utility records a non-secret key-version label supplied with `--key-version`; use a stable identifier such as `local-v1` or a managed-key version ID.

## Inspect

```powershell
corepack pnpm connectors:tokens inspect `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --connector <connector-account-id> `
  --operator <operator-identity>
```

Inspection is read-only and returns provider/status, whether a credential exists, its truncated SHA-256 fingerprint, key-version label, rotation time, scope, and exact confirmation phrases. It never returns encrypted or plaintext credential material.

## Rotate: Dry Run

Put the new provider token in a protected environment variable. The variable name is supplied to the CLI; the token itself is never accepted as a command-line argument:

```powershell
$env:NEW_CONNECTOR_TOKEN = "<new-provider-token>"

corepack pnpm connectors:tokens rotate `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --connector <connector-account-id> `
  --operator <operator-identity> `
  --token-env NEW_CONNECTOR_TOKEN `
  --key-version <key-version> `
  --dry-run
```

Dry-run validates the encryption key, token, scope, and key-version label, then reports only current/next fingerprints and the required confirmation. It performs no database writes.

Use `--key-env <environment-variable-name>` to read the encryption key from a variable other than `CONNECTOR_TOKEN_ENCRYPTION_KEY`. Passing `--token <value>` is rejected because process arguments can be retained in shell history and process listings.

## Rotate: Execute

After checking dry-run output, copy the exact phrase:

```powershell
corepack pnpm connectors:tokens rotate `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --connector <connector-account-id> `
  --operator <operator-identity> `
  --token-env NEW_CONNECTOR_TOKEN `
  --key-version <key-version> `
  --execute `
  --confirm "ROTATE CONNECTOR TOKEN <connector-account-id>"
```

Execution generates a fresh 96-bit IV, encrypts with AES-256-GCM, atomically upserts the scoped credential, verifies the connector remains active, and records `connector_token.rotated` with only operator, provider, fingerprint, and key-version metadata.

Clear the token environment variable after the operation:

```powershell
Remove-Item Env:NEW_CONNECTOR_TOKEN
```

## Revoke

Preview first:

```powershell
corepack pnpm connectors:tokens revoke `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --connector <connector-account-id> `
  --operator <operator-identity> `
  --dry-run
```

Then execute with the exact phrase:

```powershell
corepack pnpm connectors:tokens revoke `
  --tenant <tenant-id> `
  --workspace <workspace-id> `
  --connector <connector-account-id> `
  --operator <operator-identity> `
  --execute `
  --confirm "REVOKE CONNECTOR TOKEN <connector-account-id>"
```

Execution deletes the encrypted credential row, marks the connector account revoked, and records `connector_token.revoked` in one transaction. The existing workspace-admin connector revoke endpoint uses the same deletion rule, so it cannot leave credential material behind.

This local utility removes the application's stored token. If the provider exposes a remote OAuth revocation endpoint, revoke the grant with the provider as a separate runbook step until provider-specific revocation clients are implemented.

## Safe Deterministic Verification

Scenario mode never opens a database connection or reads real credentials. It accepts only tenant `fixture-tenant`, workspace `fixture-workspace`, and connector `fixture-connector`:

```powershell
corepack pnpm connectors:tokens inspect --tenant fixture-tenant --workspace fixture-workspace --connector fixture-connector --scenario
corepack pnpm connectors:tokens rotate --tenant fixture-tenant --workspace fixture-workspace --connector fixture-connector --dry-run --scenario
corepack pnpm connectors:tokens rotate --tenant fixture-tenant --workspace fixture-workspace --connector fixture-connector --execute --confirm "ROTATE CONNECTOR TOKEN fixture-connector" --scenario
corepack pnpm connectors:tokens revoke --tenant fixture-tenant --workspace fixture-workspace --connector fixture-connector --dry-run --scenario
corepack pnpm connectors:tokens revoke --tenant fixture-tenant --workspace fixture-workspace --connector fixture-connector --execute --confirm "REVOKE CONNECTOR TOKEN fixture-connector" --scenario
```

Scenario mode verifies parsing, secret-safe output, confirmation gates, and dispatch. It is not database-integration evidence. Live provider connector consumption and managed KMS/HSM key custody remain separate production-integration work.
