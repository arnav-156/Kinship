# Isolated Seed/Demo Workspace Generator

## Purpose

`demo:workspace` creates a coherent guided relationship-intelligence story in a dedicated tenant. The tenant is durably marked `isDemo: true`; all generated users, workspaces, entities, evidence, lists, notes, policy, membership, and audit data carry that tenant/workspace scope.

The existing `db:seed` command remains the general local-development seed and explicitly keeps its `local-dev` tenant as `isDemo: false`. The two commands never share tenant or workspace slugs.

## Isolation Guarantees

- The reserved demo tenant is `kinship-guided-demo`.
- The reserved workspace is `guided-relationship-demo`.
- Generation fails before starting a transaction if the reserved tenant slug belongs to a non-demo tenant.
- The owner uses `demo.owner@kinship-demo.invalid`.
- People and organizations include `(Synthetic)` in their names.
- Source and organization URLs use the reserved `.invalid` top-level domain.
- Evidence metadata is marked `{ "demo": true, "synthetic": true }`.
- The entire generation occurs in one transaction and uses upserts or scoped existence checks, so reruns do not create duplicate story records.
- Passwords are accepted only through a named environment variable, hashed with the existing bcrypt service, and never returned or written to audit metadata.

This utility never copies, reads, or transforms records from another tenant. It does not reset or delete existing workspaces.

## Preview

Preview validates the reserved namespace and performs no writes:

```powershell
corepack pnpm demo:workspace preview `
  --operator <operator-identity>
```

## Generation Dry Run

```powershell
corepack pnpm demo:workspace generate `
  --operator <operator-identity> `
  --dry-run
```

Dry-run uses the same collision checks as preview and reports the exact required confirmation.

## Confirmed Generation

Set a local demo login password in the current process, then execute:

```powershell
$env:KINSHIP_DEMO_PASSWORD = "<strong-local-demo-password>"

corepack pnpm demo:workspace generate `
  --operator <operator-identity> `
  --password-env KINSHIP_DEMO_PASSWORD `
  --execute `
  --confirm "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo"

Remove-Item Env:KINSHIP_DEMO_PASSWORD
```

Passing `--password <value>` is rejected because process arguments can be retained in shell history and process listings.

Generation returns the dedicated tenant/workspace IDs, the synthetic owner email, content totals, and audit-event ID. It never returns the plaintext password or password hash.

## Generated Story

The isolated workspace contains:

- `Northstar Robotics (Synthetic)`;
- `Maya Chen (Synthetic)`, a fictional research-partnership lead;
- a synthetic affiliation and an allowed `.invalid` company-site snapshot;
- one clearly labeled synthetic evidence item;
- `Guided Demo Prospects (Synthetic)` with Maya as a warm prospect;
- one synthetic relationship note;
- workspace policy defaults suitable for relationship-intelligence review.

No connector credentials, provider tokens, real contact values, or live URLs are generated.

## Safe Deterministic Verification

Scenario mode never opens a database connection and never reads a real password:

```powershell
corepack pnpm demo:workspace preview --operator scenario-operator --scenario
corepack pnpm demo:workspace generate --operator scenario-operator --dry-run --scenario
corepack pnpm demo:workspace generate --operator scenario-operator --execute --confirm "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo" --scenario
```

Scenario mode verifies parsing, dry-run, hashing dispatch, confirmation, and secret-safe output. It is not database-integration evidence. Normal mode requires a migrated database containing the `is_demo` tenant column.
