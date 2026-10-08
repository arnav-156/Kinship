# Beta Milestone 4 Trust Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make compliance, suppression, audit, and ingestion status inspectable from the existing Beta dashboard.

**Architecture:** Add a read-only job status method to the existing evidence API because evidence ingestion already creates background job rows. Keep UI interpretation in tested dashboard model helpers, then wire the current dashboard panel to suppression and job endpoints without adding new routes or schema.

**Tech Stack:** TypeScript, NestJS, Prisma, Next.js App Router, Vitest, existing pnpm workspace.

---

## File Structure

- `apps/api/src/evidence/evidence.service.spec.ts`: add RED tests for workspace-scoped job listing.
- `apps/api/src/evidence/evidence.service.ts`: add `listWorkspaceJobs` using existing workspace authorization.
- `apps/api/src/evidence/evidence.controller.ts`: add `GET /evidence/jobs?workspaceId=...`.
- `apps/web/app/dashboard-model.spec.ts`: add RED tests for trust-operation display summaries.
- `apps/web/app/dashboard-model.ts`: add summary helpers for compliance, suppression, job status, and audit events.
- `apps/web/app/page.tsx`: wire suppression ledger, job status refresh, readable audit labels, and compliance summaries.
- `apps/web/app/globals.css`: style trust-operation ledger/status rows.
- `docs/beta-milestone-4-collaboration-admin-compliance-polish.md`: document delivered scope and verification.
- `docs/beta-discovery-prioritization.md`: mark Milestone 4 complete after verification.

## Task 1: API Job Status Listing

**Files:**

- Modify: `apps/api/src/evidence/evidence.service.spec.ts`
- Modify: `apps/api/src/evidence/evidence.service.ts`
- Modify: `apps/api/src/evidence/evidence.controller.ts`

- [ ] **Step 1: Write failing service tests**

Add tests that call `listWorkspaceJobs(principal, "workspace_1")` and assert `backgroundJob.findMany` receives tenant/workspace scoping, `updatedAt desc`, and `take: 20`. Add a forbidden workspace test for `workspace_2`.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm --filter @relationship/api test`
Expected: FAIL because `listWorkspaceJobs` does not exist.

- [ ] **Step 3: Implement service and controller**

Implement `listWorkspaceJobs` with existing `assertCanUseWorkspace`, and add `@Get("evidence/jobs")` with `@Query("workspaceId")`.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm --filter @relationship/api test`
Expected: PASS.

## Task 2: Dashboard Trust Summary Helpers

**Files:**

- Modify: `apps/web/app/dashboard-model.spec.ts`
- Modify: `apps/web/app/dashboard-model.ts`

- [ ] **Step 1: Write failing dashboard model tests**

Add tests for:

- `summarizeComplianceDecision({ decision: "warn", reason: "Compliance review is required", warnings: ["Email consent is unknown"] })` returns a warning tone and `Review needed` label.
- `summarizeJobStatus({ jobName: "evidence.ingest", status: "completed", attempts: 2 })` returns `Evidence ingest completed` and success tone.
- `summarizeSuppressionEntry({ workspaceId: "workspace_1", channelType: "email", source: "manual" })` returns `Workspace email suppression`.
- `formatAuditEventLabel("suppression.created")` returns `Suppression created`.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm --filter @relationship/web test`
Expected: FAIL because helper exports do not exist.

- [ ] **Step 3: Implement helpers**

Add exported helper types and functions in `dashboard-model.ts`. Keep functions pure and formatting deterministic.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm --filter @relationship/web test`
Expected: PASS.

## Task 3: Dashboard Wiring and Styling

**Files:**

- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add state and API calls**

Add `suppressionEntries` and `jobStatuses` state. Add `refreshSuppressions`, `deleteSuppression`, and `refreshJobStatuses` functions using existing `apiRequest`.

- [ ] **Step 2: Render trust operations**

Render compliance summary, suppression ledger, and ingestion job rows in the compliance panel. Render readable audit event labels in the audit panel.

- [ ] **Step 3: Style compact rows**

Add stable row styles for trust summaries, ledgers, and job rows without nested cards.

- [ ] **Step 4: Run web checks**

Run:

```powershell
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
```

Expected: PASS.

## Task 4: Documentation and Final Verification

**Files:**

- Create: `docs/beta-milestone-4-collaboration-admin-compliance-polish.md`
- Modify: `docs/beta-discovery-prioritization.md`

- [ ] **Step 1: Document Milestone 4**

Document backend endpoint, frontend trust panel, tests, and limitations.

- [ ] **Step 2: Run final verification**

Run:

```powershell
corepack pnpm --filter @relationship/ai test
corepack pnpm --filter @relationship/api test
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
corepack pnpm format
```

Expected: all commands exit 0.

## Self-Review

- Spec coverage: endpoint, suppression ledger, job status, audit labels, docs, and checks are covered.
- Placeholder scan: no TODO/TBD placeholders are present.
- Type consistency: job, suppression, compliance, and audit helper names match the planned imports in `page.tsx`.
