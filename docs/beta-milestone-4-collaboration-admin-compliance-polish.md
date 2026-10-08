# Beta Milestone 4: Collaboration, Admin, and Compliance Polish

## Status

Complete as of 2026-07-07.

Milestone 4 adds a focused trust-operations pass over existing compliance, suppression, audit, and ingestion-job foundations. It does not change the database schema, add autonomous outreach, or introduce new connector account administration.

## Delivered Scope

### Workspace Ingestion Job Status

Added a read-only API path for recent workspace evidence-ingestion jobs:

- `GET /v1/evidence/jobs?workspaceId=...`

The endpoint is backed by existing `background_jobs` rows created during evidence ingestion. Results are scoped by tenant and workspace membership, ordered by `updatedAt desc`, limited to 20 rows, and return job name, queue name, status, attempts, progress, failure reason, and timestamps.

### Trust Review Dashboard Panel

Updated the existing compliance panel into a trust review panel that keeps the same core actions while making state easier to inspect:

- save contact channel,
- create suppression,
- evaluate deterministic compliance,
- refresh suppression ledger,
- remove suppression entries,
- refresh latest ingestion job status.

Compliance state is now summarized as `Allowed`, `Review needed`, or `Blocked`, with reason and warnings shown in plain language.

### Suppression Ledger UX

The dashboard can now list active workspace suppressions through the existing compliance API and remove entries with the existing soft-delete endpoint. Entries are summarized by scope, channel, source, and reason.

### Audit Label Polish

Audit event names are rendered as readable labels such as `Evidence ingested`, `Suppression created`, and `Compliance warned` instead of raw event identifiers.

### Tested Summary Helpers

Added pure dashboard model helpers for:

- compliance decision summaries,
- job status summaries,
- suppression entry summaries,
- audit event labels,
- trust-status busy action copy.

## Changed Files

- `apps/api/src/evidence/evidence.controller.ts`
- `apps/api/src/evidence/evidence.service.ts`
- `apps/api/src/evidence/evidence.service.spec.ts`
- `apps/web/app/dashboard-model.ts`
- `apps/web/app/dashboard-model.spec.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/globals.css`
- `docs/superpowers/specs/2026-07-07-beta-milestone-4-trust-operations-design.md`
- `docs/superpowers/plans/2026-07-07-beta-milestone-4-trust-operations.md`
- `docs/beta-discovery-prioritization.md`

## Verification

Planned verification commands:

```powershell
corepack pnpm --filter @relationship/ai test
corepack pnpm --filter @relationship/api test
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
corepack pnpm format
```

## Remaining Limitations

- The job status endpoint reports existing `background_jobs`; it does not add queue retries, dead-letter management, or an active worker dashboard.
- Connector account status remains future scope.
- Retention policy editing remains future scope.
- Suppression ledger visibility is workspace-focused in the dashboard; tenant-wide administration remains backend-capable but not productized here.
- The dashboard still uses demo fallback state when the API is unavailable.
