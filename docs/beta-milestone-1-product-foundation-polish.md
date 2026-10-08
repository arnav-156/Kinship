# Beta Milestone 1: Product Foundation Polish

Milestone 1 begins the Beta transition by making the existing MVP dashboard easier to understand, more guided, and more trustworthy without changing backend contracts.

## Implemented

- Added a tested dashboard model helper for onboarding progress, busy action labels, toast tone selection, and workspace health summaries.
- Added a first-run checklist that guides users through connection, intake, brief generation, draft review, and compliance review.
- Added a next-best-action hero band with product-language guidance and workspace health metrics.
- Added recent update/toast cards so async results are visible beyond a single status line.
- Improved the status block with product-language busy labels such as "Generating relationship brief".
- Improved evidence cards with confidence, freshness, rank, source, and ranking-reason chips.
- Made the draft composer editable locally and added a copy action for manual sending workflows.
- Added clearer deterministic compliance copy.
- Added a lightweight settings card for API base configuration and trust-first boundaries.
- Added responsive CSS for the hero band, checklist, toasts, evidence metrics, empty states, and settings card.

## Why It Matters

A Beta user should understand what to do quickly and why the output can be trusted. This milestone keeps the MVP workflow intact while adding guidance, state clarity, and richer evidence presentation around it.

## Files Changed

- `apps/web/app/dashboard-model.ts`
- `apps/web/app/dashboard-model.spec.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/globals.css`
- `docs/superpowers/plans/2026-07-05-beta-milestone-1-product-foundation-polish.md`

## Verification

Commands run:

- `corepack pnpm --filter @relationship/web exec vitest run app/dashboard-model.spec.ts`
- `corepack pnpm --filter @relationship/web test`
- `corepack pnpm --filter @relationship/web typecheck`
- `corepack pnpm --filter @relationship/web lint`

## Remaining Risks

- The draft edit is local-only in Milestone 1; durable autosave/update belongs in Milestone 2.
- The progress UI is guidance-level only; a backend job progress endpoint belongs in Milestone 2.
- A visual browser pass should be run after restarting the web dev server, especially because previous Next dev cache issues were caused by running builds while the dev server was active.
