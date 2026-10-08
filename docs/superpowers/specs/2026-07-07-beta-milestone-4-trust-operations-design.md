# Beta Milestone 4 Trust Operations Design

## Status

Approved for implementation on 2026-07-07.

## Goal

Make compliance, suppression, audit, and ingestion status easier to inspect from the existing Beta dashboard without adding schema changes or autonomous workflow behavior.

## Scope

Milestone 4 adds a focused trust-operations slice:

- A read-only workspace ingestion job status endpoint backed by existing `background_jobs` rows.
- Plain-language dashboard summaries for compliance decisions, suppression entries, job status, and audit events.
- A more useful compliance/admin panel with suppression ledger refresh/remove actions and latest ingestion status.
- Documentation that marks the milestone complete and records limitations.

Out of scope:

- No retention policy editor.
- No connector account OAuth/admin page.
- No active queue worker or retry/dead-letter controls.
- No database schema changes.
- No autonomous outreach sending.

## Architecture

The backend change stays inside `apps/api/src/evidence`, because evidence ingestion already owns `backgroundJob` creation. `EvidenceService.listWorkspaceJobs` will reuse the existing workspace membership check and return recent jobs scoped by tenant and workspace.

The frontend change stays in the current Next.js dashboard. Pure formatting and summary logic lives in `apps/web/app/dashboard-model.ts` so tests can cover the human-readable trust labels without rendering the full page. `apps/web/app/page.tsx` will call existing suppression endpoints and the new job endpoint.

## Data Flow

1. Evidence ingestion continues to create or update `background_jobs` during `/v1/analyze-url` and `/v1/evidence/ingest`.
2. The dashboard calls `GET /v1/evidence/jobs?workspaceId=...` to read recent workspace job rows.
3. The dashboard calls `GET /v1/compliance/suppressions?workspaceId=...` to populate the suppression ledger.
4. Delete actions call `DELETE /v1/compliance/suppressions/:id` and remove the entry from local state.
5. Audit events continue to come from `GET /v1/audit-events?workspaceId=...` and are rendered with readable labels.

## UX

The existing compliance panel becomes a trust review panel. It keeps the channel value, consent, save, suppress, and check actions. Below those controls it shows:

- a deterministic compliance callout with decision label, reason, and warnings,
- active suppression entries with scope, source, channel, and remove action,
- latest ingestion jobs with status, attempts, and failure reason when present.

The audit panel remains separate but event names become readable, such as `Evidence ingested` instead of `evidence.ingested`.

## Error Handling

API access remains tenant/workspace scoped. If the API is unavailable, the dashboard keeps demo/local state and emits an existing toast/status message. Failed job reads or suppression refreshes should not break the core workflow; they only update the status toast.

## Testing

- Add API service tests for tenant/workspace-scoped job listing and forbidden workspace access.
- Add dashboard model tests for compliance, suppression, job, and audit summaries.
- Run AI/API/web tests, web typecheck, web lint, and repository formatting.
