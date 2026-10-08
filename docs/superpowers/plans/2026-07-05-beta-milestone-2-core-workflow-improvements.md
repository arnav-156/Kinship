# Beta Milestone 2 Core Workflow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Beta dashboard support a more complete day-to-day workflow: filtered prospect review, saved prospects, notes/timeline, clearer progress, and draft save state.

**Architecture:** Keep durable backend contracts unchanged for this milestone. Add pure dashboard-model helpers for workflow state and keep the React page as the local orchestration layer for demo/Beta UX. Persist nothing beyond the current session; durable saves/autosave can bind to APIs in a later milestone.

**Tech Stack:** Next.js App Router, React state, TypeScript, Vitest, existing CSS.

---

## File Structure

- `apps/web/app/dashboard-model.ts`: add pure helpers for workflow progress, prospect filtering/sorting, notes, saved state, and draft save summaries.
- `apps/web/app/dashboard-model.spec.ts`: add failing tests before implementation for the new helpers.
- `apps/web/app/page.tsx`: add local UI state for saved prospects, source filters, sort order, notes/timeline, and draft save state; wire controls to existing workflow.
- `apps/web/app/globals.css`: add compact styles for filter chips, saved/list states, notes, timeline, and draft save indicators.
- `docs/beta-milestone-2-core-workflow-improvements.md`: record delivered scope and verification commands.
- `docs/beta-discovery-prioritization.md`: mark Milestone 2 status once verified.

## Task 1: Workflow Model Tests

**Files:**

- Modify: `apps/web/app/dashboard-model.spec.ts`
- Modify: `apps/web/app/dashboard-model.ts`

- [ ] **Step 1: Write failing tests**

Add tests that call `buildWorkflowProgress`, `filterAndSortProspects`, `summarizeDraftSaveState`, and `createNoteTimelineItem` from `dashboard-model.ts`. Tests must assert:

```ts
expect(
  buildWorkflowProgress({
    hasEvidence: true,
    hasBrief: true,
    hasDraft: false,
    hasComplianceReview: false,
  }).percent,
).toBe(50);
expect(
  filterAndSortProspects(prospects, {
    query: "ada",
    savedIds: new Set(["entity_ada"]),
    sourceType: "github",
    sort: "saved",
  })[0]?.entity.id,
).toBe("entity_ada");
expect(summarizeDraftSaveState({ dirty: true, savedAt: null })).toEqual({
  label: "Unsaved changes",
  tone: "warning",
});
expect(
  createNoteTimelineItem("Call after paper deadline", "Ada Lovelace", "2026-07-05T10:00:00.000Z")
    .eventType,
).toBe("note.added: Ada Lovelace");
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `corepack pnpm --filter @relationship/web exec vitest run app/dashboard-model.spec.ts`
Expected: FAIL because new exports do not exist.

- [ ] **Step 3: Implement minimal helpers**

Add typed helpers in `dashboard-model.ts`:

```ts
export function buildWorkflowProgress(input: WorkflowProgressInput): WorkflowProgressSummary;
export function filterAndSortProspects<T extends ProspectLike>(
  items: T[],
  options: ProspectFilterOptions,
): T[];
export function summarizeDraftSaveState(input: DraftSaveStateInput): DraftSaveStateSummary;
export function createNoteTimelineItem(
  body: string,
  subjectName: string,
  nowIso?: string,
): NoteTimelineItem;
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `corepack pnpm --filter @relationship/web exec vitest run app/dashboard-model.spec.ts`
Expected: PASS.

## Task 2: Wire Core Workflow UI

**Files:**

- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add local workflow state**

Add state for `savedProspectIds`, `sourceFilter`, `prospectSort`, `noteBody`, `draftSavedAt`, and `isDraftDirty`. Use `filterAndSortProspects`, `buildWorkflowProgress`, and `summarizeDraftSaveState` as derived state.

- [ ] **Step 2: Add controls and views**

Update the dashboard to include source filter chips, sort control, saved prospect toggle, notes input, note timeline insertion, progress rail, and draft save status/action. Copy action remains unchanged.

- [ ] **Step 3: Keep API calls compatible**

Search requests continue to send `limit`, `query`, and `workspaceId`. Draft save is local-only and reports status through the toast system.

## Task 3: Documentation and Verification

**Files:**

- Create: `docs/beta-milestone-2-core-workflow-improvements.md`
- Modify: `docs/beta-discovery-prioritization.md`

- [ ] **Step 1: Document delivered scope**

Write the implemented features, changed files, verification commands, and remaining durable-backend caveat.

- [ ] **Step 2: Run final verification**

Run:

```powershell
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
corepack pnpm format
```

Expected: all exit 0.

- [ ] **Step 3: Browser smoke**

Load `http://127.0.0.1:3001/` and verify the page includes the Milestone 2 workflow content with no runtime error.

## Self-Review

- Spec coverage: covers Milestone 2 acceptance criteria for lower-friction analysis, inspectable evidence, save/revisit/edit/copy workflow, and modest dataset organization.
- Placeholder scan: no TODO/TBD placeholders are present.
- Type consistency: helper names used in tests match helper names in the implementation task.
