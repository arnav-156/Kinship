# Beta Milestone 1 Product Foundation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing MVP dashboard feel understandable, guided, and Beta-ready without changing backend contracts.

**Architecture:** Keep Milestone 1 frontend-first. Extract pure dashboard model helpers into `apps/web/app/dashboard-model.ts` so onboarding progress, action states, and demo metrics are testable without a DOM test harness. Rebuild `apps/web/app/page.tsx` around the existing API calls and data, with a clearer shell, first-run checklist, richer evidence/brief panels, and toast-style feedback. Update CSS and docs after verification.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, existing CSS.

---

### Task 1: Dashboard Model Tests

**Files:**

- Create: `apps/web/app/dashboard-model.ts`
- Create: `apps/web/app/dashboard-model.spec.ts`

- [ ] Write tests for checklist progress, action labels, and toast severity selection.
- [ ] Run `corepack pnpm --filter @relationship/web exec vitest run app/dashboard-model.spec.ts` and confirm failures because the module does not exist.
- [ ] Implement the pure helpers.
- [ ] Rerun the focused spec and confirm it passes.

### Task 2: Product Shell and Onboarding

**Files:**

- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] Replace the dense MVP shell with a Beta workspace shell using sections for Home, Intake, Evidence, Brief, Draft, Compliance, Activity, and Settings.
- [ ] Add a first-run checklist driven by `buildOnboardingSteps`.
- [ ] Add metric/next-action panels that explain what to do next.
- [ ] Keep existing API actions and demo fallback behavior.

### Task 3: Polished States and Evidence Trust UI

**Files:**

- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] Add toast/status cards for success, warning, and error outcomes.
- [ ] Add busy state labels using `getBusyActionLabel`.
- [ ] Improve evidence rows with confidence, freshness, source, and ranking reasons.
- [ ] Improve brief/draft/compliance empty states.

### Task 4: Documentation

**Files:**

- Create: `docs/beta-milestone-1-product-foundation-polish.md`
- Modify: `docs/beta-discovery-prioritization.md`

- [ ] Document what Milestone 1 implemented, why it matters, and the verification commands.
- [ ] Mark Milestone 1 as in-progress or complete once checks pass.

### Task 5: Verification

**Commands:**

- `corepack pnpm --filter @relationship/web exec vitest run app/dashboard-model.spec.ts`
- `corepack pnpm --filter @relationship/web test`
- `corepack pnpm --filter @relationship/web typecheck`
- `corepack pnpm --filter @relationship/web lint`
- `corepack pnpm format`

**Notes:** Avoid `next build` while a live Next dev server is using the same `.next` directory unless the dev server is stopped and restarted afterward.
