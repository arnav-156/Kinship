# Beta Milestone 5: Platform Hardening

## Status

Complete as of 2026-07-07 for the release-hardening slice.

Milestone 5 focused on repeatable release checks, production dependency posture, and pilot operations documentation. It does not add distributed infrastructure, tracing vendors, alerting systems, or a real queue worker.

## Delivered Scope

### API Smoke Utility

Added `scripts/api-smoke.ts` with test coverage in `scripts/api-smoke.spec.ts`.

Package scripts:

```bash
corepack pnpm smoke:api
corepack pnpm smoke:api:strict
```

The smoke utility checks:

- API liveness through `/health`.
- Readiness through `/ready`.
- Metrics through `/metrics`.
- Anonymous access rejection through `/v1/auth/me`.

Strict mode requires database readiness to be `ok`; non-strict mode allows degraded readiness for local API checks where the database is intentionally unavailable.

### Dependency Hardening

Upgraded Nest framework packages to patched `11.1.18` releases and added narrow `pnpm.overrides` for vulnerable transitive packages:

- `multer`
- `postcss`
- `@hono/node-server`

`corepack pnpm audit --prod` now reports no known vulnerabilities.

### Pilot Runbook

Expanded deployment documentation with:

- preflight checks,
- strict smoke command,
- backup and restore guidance,
- rollback guidance,
- incident triage checklist.

## Changed Files

- `package.json`
- `pnpm-lock.yaml`
- `apps/api/package.json`
- `apps/worker/package.json`
- `apps/web/package.json`
- `scripts/api-smoke.ts`
- `scripts/api-smoke.spec.ts`
- `docs/api.md`
- `docs/testing.md`
- `docs/deployment.md`
- `docs/beta-discovery-prioritization.md`

## Verification

Release checks include:

```powershell
corepack pnpm exec vitest run scripts/api-smoke.spec.ts
corepack pnpm audit --prod
corepack pnpm --filter @relationship/ai test
corepack pnpm --filter @relationship/api test
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
corepack pnpm --filter @relationship/web build
corepack pnpm format
```

## Remaining Limitations

- Live strict smoke still requires a running DB-backed API environment.
- The rate limiter remains in-memory and suitable for a single-process Beta only.
- Tracing, alerting, log drains, distributed queues, and backup automation remain future production-scaling work.
