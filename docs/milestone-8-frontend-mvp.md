# Milestone 8: Frontend MVP

Milestone 8 replaces the static foundation shell with an operational Relationship Intelligence dashboard.

## Implemented

- Single-screen product workflow in `apps/web/app/page.tsx`.
- Responsive dashboard layout in `apps/web/app/globals.css`.
- API session controls for register/login and API base URL.
- Workspace context selector.
- Approved-context intake for URL/source analysis.
- Evidence and prospect search controls.
- Relationship brief panel with evidence cards and scores.
- Draft composer with variant segmented control.
- Compliance controls for contact channel, consent, suppression, and evaluation.
- Audit event refresh panel.
- Demo fallback state so the UI remains usable when the API is not running.

## Integration Boundary

The frontend calls the existing `/v1` API endpoints when an API base URL and access token are available. If a request fails, the dashboard keeps the operator in a demo state and surfaces the failure in the status area.

## Verification

Verification completed from `C:\Projects\AI-Relationship` after moving the project outside OneDrive:

- `corepack pnpm --filter @relationship/web typecheck`
- `corepack pnpm --filter @relationship/web lint`
- `corepack pnpm --filter @relationship/web build` was run successfully by the user from the new project location.

A browser visual pass should be run against the local dev server whenever the in-app browser/dev-server approval path is available.
