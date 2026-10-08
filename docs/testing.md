# Testing

Milestone 1 adds Vitest and package-level test scripts.

Current coverage includes foundation schema/config/logger/controller tests, auth/authorization tests, repository scoping tests, connector tests, safe URL policy tests, evidence service tests, search/entity-resolution tests, AI guardrail tests, compliance tests, frontend package checks, and API hardening tests.

Milestone 4 adds tests for:

- Safe public URL validation.
- SSRF/private-address blocking.
- Generic public URL fetch/normalize/evidence extraction.
- GitHub public API URL conversion with mocked HTTP.
- Manual LinkedIn context without scraping.
- Evidence tenant/workspace access checks.
- Recorded GitHub and CSV connector fixture validation.
- Fail-closed connector replay for undeclared context, tenant/workspace drift, out-of-scope hosts, private DNS addresses, and credential fields.
- Fixed-clock replay digest stability across repeated runs.

The connector development harness can be run independently with:

```bash
corepack pnpm connectors:harness validate
corepack pnpm connectors:harness replay --repeat 3
```

Milestone 5 adds tests for:

- Evidence ranking and retrieval-context filtering in `packages/search`.
- Deterministic entity-resolution signals and match/review thresholds.
- API search workspace authorization and tenant/workspace query scoping.

Identity-resolution utility coverage verifies candidate explanations, mandatory human decisions, tenant/workspace scope matching, rejected weak-candidate merges, merge/split audit replay, and hash-chain tamper detection.

Embedding maintenance coverage verifies missing-only backfill, full reindex selection, completion-only index rebuild, per-row checkpointing, failure/resume without duplicate work, dry-run isolation, dimension rejection, checkpoint compatibility, and atomic checkpoint replacement.

Milestone 6 adds tests for:

- Mock AI provider structured brief and draft generation.
- Prompt-injection detection in retrieved evidence.
- Unsupported evidence-claim detection.
- Relationship brief API workspace authorization and evidence-required guardrails.

Milestone 7 adds tests for:

- Compliance policy blocks for suppressions and withdrawn consent.
- Compliance warnings for unknown email consent.
- Contact-value hashing behavior.
- API compliance authorization and draft-channel suppression evaluation.

Milestone 8 adds frontend verification:

- Web typecheck and lint for the dashboard code.
- Production Next.js build from the stable `C:\Projects\AI-Relationship` location.
- In-app browser visual inspection of the dashboard at local dev-server size targets.

Milestone 9 adds API hardening tests for:

- Request ID generation and trusted incoming request ID propagation.
- Rate-limit allow/block behavior and structured 429 responses.
- Stable API error-envelope normalization.
- Production-safe internal error messages.
- DB readiness degradation.
- Uptime and memory metrics.
- Config defaults and comma-separated CORS origin parsing.

Known local caveat: in the managed sandbox, Vitest can fail during startup with `spawn EPERM` when Vite/esbuild attempts to launch its helper process. TypeScript, ESLint, Prettier, and package builds should be run from the stable `C:\Projects\AI-Relationship` location; run Vitest outside that sandbox or with process-spawn approval.

## Release Smoke Testing

Milestone 5 adds a scriptable API smoke check:

```bash
corepack pnpm smoke:api
```

By default the smoke check targets `http://localhost:7000` and verifies:

- `/health` returns API liveness.
- `/ready` returns API readiness. Degraded readiness is allowed for local non-DB smoke.
- `/metrics` exposes `relationship_api_up 1`.
- `/v1/auth/me` rejects anonymous access with HTTP 401.

For a DB-backed pilot environment, require strict readiness:

```bash
API_SMOKE_BASE_URL=https://api.example.com corepack pnpm smoke:api:strict
```

Strict mode fails unless `/ready` reports `status=ok` and `checks.database=ok`.

Production dependency advisories are checked with:

```bash
corepack pnpm audit --prod
```

## Beta Policy Context

Regression coverage verifies that:

- Outreach review warns when recipient type or region is unknown.
- Relationship-intelligence processing does not inherit outreach-only warnings or footer requirements.
- Draft compliance reads persisted purpose, consent, recipient type, and region from the selected contact channel.
- API and web type checks cover the Trust center request and response contracts.

## Beta Retention Lifecycle

Regression and live verification cover:

- Owner/admin authorization and member denial.
- Retrieval-time expiration calculation and disabled-policy behavior.
- Retroactive expiration backfill for evidence and source snapshots.
- Preview counts and next-expiration reporting.
- Evidence-first and unreferenced-snapshot cleanup ordering.
- Manual cleanup jobs plus scheduler-enqueued, worker-executed automatic cleanup.
- Physical deletion of isolated expired PostgreSQL fixtures.

## Recurring Connector Refresh

Regression and deterministic runtime verification cover:

- Explicit owner/admin opt-in and incomplete-schedule rejection.
- Due-only enqueueing from the latest connector run or configuration timestamp.
- System attribution and a stored `scheduled` trigger.
- Atomic connector-run, background-job, and audit creation.
- Deterministic multi-replica idempotency and overlap coalescing.
- Disabled, malformed, unsupported, future, queued, and running schedule exclusion.

## Beta User Data Lifecycle

Regression and live verification cover:

- Tenant/user export isolation and exclusion of password material.
- Durable request status and 24-hour download availability.
- Attachment and cache-control response headers.
- Wrong-password deletion rejection.
- Shared-workspace sole-owner protection.
- Transactional profile anonymization, note removal, attribution scrubbing, and solo-workspace deactivation.
- Immediate rejection of a pre-deletion access token.
- Cleanup of all isolated privacy-smoke accounts after the live PostgreSQL test.
