# Beta Milestone 2: Core Workflow Improvements

Milestone 2 deepens the existing Beta dashboard workflow without changing backend contracts. The goal is to make a modest prospect dataset easier to inspect, organize, annotate, and turn into reviewed outreach.

## Implemented

- Added a core workflow progress rail derived from evidence, brief, draft, and compliance state.
- Added source filters, prospect sort order, and empty state handling for the prospect list.
- Added saved prospect state with saved-first sorting and visible saved labels.
- Added local relationship notes with timeline entries and audit stream insertion.
- Added local draft save state, dirty tracking, and a manual Save action alongside Copy and Draft.
- Added tested dashboard-model helpers for workflow progress, prospect filtering/sorting, draft save summaries, and note timeline creation.
- Kept search API payloads compatible with existing backend DTOs.

## Changed Files

- `apps/web/app/dashboard-model.ts`
- `apps/web/app/dashboard-model.spec.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/globals.css`
- `docs/superpowers/plans/2026-07-05-beta-milestone-2-core-workflow-improvements.md`

## Verification

Run from `C:\Projects\AI-Relationship`:

```powershell
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
corepack pnpm format
```

Expected result: all commands exit 0.

## Remaining Risks

- Saved prospects, notes, and draft save state are local to the current browser session in this milestone.
- Durable prospect lists, note persistence, and draft autosave APIs should be handled in a later backend-backed workflow milestone.
- The DB-backed API smoke from prior milestones still depends on a running database and approval availability.
