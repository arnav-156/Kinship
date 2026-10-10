# Architecture

The application is a TypeScript modular monolith in a pnpm workspace. Domain and policy concerns are isolated into packages so infrastructure choices can change without rewriting business behavior.

Milestone 1 establishes the app boundaries:

- `apps/api`: NestJS REST API, global `/v1` prefix, unprefixed health/readiness/metrics endpoints.
- `apps/scheduler`: dedicated recurring-job process with deterministic, overlap-safe retention and connector-refresh scans.
- `apps/worker`: NestJS application context prepared for BullMQ-backed background jobs.
- `apps/web`: Next.js App Router frontend.
- `packages/config`: typed environment validation.
- `packages/logger`: structured JSON logging utility.
- `packages/shared`: shared schemas and contract types.
- Domain boundary packages for AI, auth, connectors, database, policy, queue, search, storage, testing, and UI.

Production business behavior begins in later milestones. Milestone 1 contains only architecture contracts and foundation services.

Milestone 2 adds the first durable domain layer: a Prisma/PostgreSQL schema, migrations, seed data, tenant/workspace-scoped repository helpers, and transaction boundaries. Business orchestration still belongs in future application services rather than repositories or controllers.

Milestone 3 adds API application services for auth, workspace access, and audit. Controllers remain thin; auth and workspace services own use-case orchestration. RBAC rules live in `packages/policy` and are consumed by the API.

Milestone 4 adds the connector and evidence ingestion boundary. Source connectors live in `packages/connectors`; API and worker ingestion services orchestrate connector policy checks, fetch, immutable S3-compatible raw snapshot storage, normalization, evidence extraction, source snapshot metadata, evidence items, background job rows, and audit events.

Milestone 5 adds the search and entity-resolution boundary. `packages/search` owns reusable ranking, freshness, retrieval-context, and identity-resolution scoring. `apps/api/src/search` owns authenticated use cases for evidence search, prospect search, and similar-person search, with every query constrained by tenant and workspace before ranking.

Milestone 6 adds the AI generation boundary. `packages/ai` owns provider abstraction, prompt rendering, structured output schemas, mock/openai-compatible providers, and evidence-claim guardrails. `apps/api/src/relationship-briefs` orchestrates tenant/workspace authorization, evidence collection, brief generation, draft generation, AI run persistence, and audit events.

Milestone 7 adds deterministic compliance and suppression enforcement. `packages/policy` owns the compliance decision engine; `apps/api/src/compliance` owns contact-channel hashing, consent status, suppression entries, compliance evaluation, and audit events. Draft generation calls the compliance service before persistence so suppressed or withdrawn-consent channels are stored as blocked drafts.

Milestone 8 replaces the frontend shell with an operational MVP dashboard in `apps/web`. The first screen is the product workflow: API session setup, workspace context, approved-context intake, evidence/prospect search, relationship brief generation, draft composition, compliance controls, and audit review. The UI keeps a demo state path while calling the real API endpoints when a token and API base URL are available.

Milestone 9 adds production hardening around the API boundary: request IDs, stable error envelopes, config-driven CORS, in-memory rate limiting, graceful shutdown hooks, DB-backed readiness, and expanded process metrics. These concerns stay in `apps/api/src/common`, `apps/api/src/health.controller.ts`, and `packages/config` so domain services remain focused on business behavior.

## Production durable execution vertical

Evidence ingestion, relationship-brief generation, draft generation, explicitly requested and recurring connector-account synchronization, and scheduled evidence-retention cleanup now cross a real process boundary. The API or scheduler stores a durable job and returns or records status; `apps/worker` atomically leases eligible PostgreSQL rows, heartbeats progress, performs connector, AI, or retention work, and commits domain results plus completion state transactionally. `apps/scheduler` owns recurring policy and connector scans so request-serving API replicas do not own timers. Lease expiry, bounded exponential retry, dead-lettering, cancellation races, idempotent enqueue, and operator replay are explicit contracts.
