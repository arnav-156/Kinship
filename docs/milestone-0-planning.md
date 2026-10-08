# Milestone 0: Planning

## Architecture Understanding Summary

The MVP is a trust-first Relationship Intelligence Copilot focused on Product B: Relationship Intelligence and Personalized Outreach. It turns a user-provided person, company, paper, GitHub repository, CRM record, contact, prospect URL, or imported context into an evidence-backed relationship brief and two to three compliant outreach draft variants.

The product must not become a cold email sender, bulk sequencer, CRM replacement, lead database, unauthorized scraper, autonomous prospecting agent, or generic AI email writer. The core experience is human-review-first: gather approved evidence, explain fit, recommend a channel, identify warnings, and generate short, respectful, evidence-grounded copy that can be copied or prepared for a Gmail/Outlook-ready draft workflow. No autonomous sending is in scope.

The system will be a TypeScript pnpm monorepo using a modular monolith architecture. Domain logic will remain independent from HTTP, database, queues, AI vendors, storage, and connector implementations. Application services orchestrate use cases, controllers stay thin, infrastructure depends on ports/interfaces, and modules remain separable for future extraction into services.

Every evidence item must be first-class, tenant-scoped, provenance-rich, policy-aware, freshness-scored, confidence-scored, and retention-aware. Every personalization claim in an outreach draft must map back to evidence. Deterministic policy engines, not LLMs, make compliance, permission, suppression, source access, and identity merge decisions.

## Tech Stack Confirmation

- Monorepo: pnpm workspace
- Language: TypeScript
- Frontend: Next.js App Router, React, Tailwind CSS
- Backend API: NestJS modular monolith
- Worker: NestJS worker app with BullMQ
- Database: PostgreSQL with pgvector
- ORM and migrations: Prisma
- Keyword search: PostgreSQL full-text search
- Queue/cache/rate limit store: Redis
- Object storage: S3-compatible interface with MinIO for local development
- AI: provider-agnostic model gateway with OpenAI-compatible adapter first
- Runtime validation: Zod
- Auth: JWT-based local MVP auth, extension-ready for OAuth/OIDC/SAML/SCIM
- Authorization: RBAC plus ABAC-style policy checks
- Tests: Vitest/Jest, Supertest, Playwright
- Infrastructure: Docker, Docker Compose, GitHub Actions CI
- Observability: structured logging, OpenTelemetry-ready hooks, health/readiness/metrics endpoints

## Implementation Roadmap

1. Repository foundation: pnpm workspace, app/package layout, shared configs, env validation, logger, Docker Compose, basic health endpoints, CI skeleton.
2. Database and core domain: Prisma schema, migrations, seed data, repository layer, transaction helpers, tenant-scoped tables, indexes, pgvector/full-text foundations.
3. Auth, tenant, authorization, audit: registration/login, JWT guards, workspace membership, RBAC/ABAC checks, tenant-aware request context, immutable audit events.
4. Connector and evidence pipeline: connector framework, allowed MVP connectors, safe URL fetching, CSV import, source snapshots, evidence extraction, provenance logging, queue jobs.
5. Search, entity resolution, and RAG foundation: deterministic/probabilistic identity signals, hybrid retrieval, ranking, freshness/confidence scoring, search APIs.
6. AI pipeline: model/embedding gateway, prompt templates, structured outputs, relationship brief generation, outreach drafts, rewrite/validation, guardrails, eval fixtures.
7. Compliance and suppression: deterministic compliance engine, channel recommendation, suppression ledger, retention policies, audit logging.
8. Frontend MVP: auth, workspace, prospect list, analyze flow, evidence brief, draft composer, compliance review, admin, audit viewer, responsive accessible UI.
9. Production hardening: rate limits, caching, observability hooks, metrics, CI depth, deployment docs, backup/rollback docs, final security and failure scenario coverage.

## Milestones and Phases

### Milestone 1: Repository Foundation

Deliver a runnable monorepo with API, web, worker, shared packages, configuration, Docker Compose services, logging, health endpoints, and CI. Acceptance requires install, build, API start, web start, worker start, and local services starting through Docker Compose.

### Milestone 2: Database and Core Domain

Deliver the Prisma schema, migrations, seed scripts, database package, tenant-scoped models, constraints, indexes, repository layer, and transaction helpers. Acceptance requires migrations, seed, repository tests, and schema validation.

### Milestone 3: Auth, Tenant, Authorization, Audit

Deliver local auth, secure password hashing, JWT access tokens, current user endpoint, tenant context, workspace roles, RBAC/ABAC policy checks, and audit logging. Acceptance requires auth tests, tenant isolation tests, and unauthorized access blocking.

### Milestone 4: Connector and Evidence Pipeline

Deliver connector interfaces, GitHub, ORCID, Semantic Scholar, Crossref, generic safe URL, CSV import, manual LinkedIn URL context handler, evidence extraction, source snapshots, provenance logs, and ingestion jobs. Acceptance requires mocked connector tests, metadata preservation, evidence storage, and unsafe URL blocking.

### Milestone 5: Search, Entity Resolution, and RAG Foundation

Deliver entity resolution service, keyword search, vector search, hybrid retrieval, ranking, scoring, source filtering, tenant/workspace filtering, and search APIs. Acceptance requires retrieval, entity resolution, and endpoint tests.

### Milestone 6: AI Pipeline

Deliver model gateway, embedding gateway, prompt templates, structured output schemas, retries, fallbacks, relationship brief generation, outreach angles, draft generation, rewrite, unsupported-claim detector, guardrails, and AI evals. Acceptance requires schema-valid AI outputs, prompt injection tests, unsupported-claim handling, mock provider tests, and real provider support when configured.

### Milestone 7: Compliance and Suppression

Deliver deterministic compliance policy engine, channel recommendation, suppression ledger, retention policies, compliance APIs, and audit coverage. Acceptance requires blocked suppressed recipients, allowed/warn/blocked states, and policy tests.

### Milestone 8: Frontend MVP

Deliver accessible responsive screens for auth, workspace, prospects, URL/context intake, evidence briefs, drafts, compliance, suppression/admin, connectors, and audit. Acceptance requires the main flow to work end-to-end with E2E coverage.

### Milestone 9: Production Hardening

Deliver rate limiting, caching, observability hooks, readiness/metrics, CI improvements, docs, security hardening, failure scenario tests, and final verification. Acceptance requires CI passing, Docker Compose working, complete docs, security tests, and documented limitations.

## Directory and Folder Structure

```text
apps/
  api/
  web/
  worker/
packages/
  ai/
  auth/
  config/
  connectors/
  db/
  logger/
  policy/
  queue/
  search/
  shared/
  storage/
  testing/
  ui/
infrastructure/
  docker/
  docker-compose.yml
docs/
  architecture.md
  api.md
  database.md
  ai-pipeline.md
  security.md
  deployment.md
  local-development.md
  testing.md
  limitations.md
  roadmap.md
  milestone-0-planning.md
.github/
  workflows/
```

## Database Schema Plan

Core Prisma models will include tenants, users, workspaces, workspace memberships, entities, people, organizations, entity aliases, entity source identifiers, evidence items, source snapshots, prospect lists, prospect list members, relationship briefs, draft messages, contact channels, suppression entries, audit events, connector accounts, connector runs, AI runs, AI eval runs, AI eval results, background jobs, and retention policies.

All tenant-owned tables will include tenant isolation fields, appropriate workspace fields, foreign keys, created/updated timestamps, soft deletion where useful, retention expiration fields where applicable, and composite indexes for tenant/workspace access. Evidence storage will use content hashes to deduplicate raw snapshots and minimize personal data. Embeddings will use pgvector indexes, and searchable evidence summaries/content will use PostgreSQL full-text indexes.

Multi-write flows such as user registration plus tenant/workspace creation, evidence ingestion, brief generation, draft creation, and suppression updates will run in transactions.

## API Contract Plan

The API will be REST-first under `/v1` with typed DTOs, Zod or class-validator validation, typed responses, structured errors, request-scoped tenant/workspace context, auth guards for protected routes, rate limiting where relevant, and audit events for sensitive actions.

Endpoint groups:

- Auth: register, login, logout, current user.
- Workspaces: create, list, read, update.
- Prospect lists: create, list, read, import, members add/list/delete.
- Analysis and evidence: analyze URL/context, ingest evidence, entity evidence, relationship timeline.
- Relationship briefs: create, list, read, regenerate.
- Search: prospects, similar people, evidence.
- Drafts: create, read, update, rewrite, validate.
- Compliance: check, suppression create/list/delete.
- Connectors: list, OAuth-ready start/callback, run, connector run status.
- Admin and audit: audit events, retention policies.
- Health: health, readiness, metrics.

## AI Pipeline Plan

The AI pipeline will follow:

```text
User Goal
  -> Intent Classifier
  -> Query Planner
  -> Source Policy Filter
  -> Hybrid Retrieval
  -> Evidence Ranking
  -> Context Brief Builder
  -> Grounded Draft Generator
  -> Guardrail Validator
  -> Human Review UI
```

The model gateway will expose `generateText`, `generateStructured`, `embedText`, `rerank` or ranking-ready behavior, and `countTokens` or cost-estimation-ready behavior. It will include an OpenAI-compatible provider and an explicit dev/test deterministic mock provider.

Prompt templates will be versioned and cover intent classification, query planning, evidence summarization, relationship brief generation, outreach angle generation, draft generation, draft rewriting, unsupported-claim detection, and compliance explanation. Prompts will treat retrieved evidence as untrusted, preserve evidence IDs, require grounded citations, and avoid manipulative or unsupported outreach.

Structured AI outputs will be runtime-validated. Invalid outputs will trigger retry/repair and then a structured failure if still invalid. Guardrails will include unsupported-claim detection, evidence coverage checks, prompt injection defenses, PII minimization, deterministic compliance pre/post checks, tone safety checks, and output sanitization.

## Testing Strategy

- Unit tests: domain services, policy engine, entity resolution, evidence extraction, AI validation, prompt rendering, unsupported-claim detection, connector parsing, rate-limit utilities.
- Integration tests: API endpoints, auth flows, workspace authorization, evidence ingestion, relationship brief creation, draft generation, compliance checks, queue jobs, transactions.
- E2E tests: register/login, create workspace, analyze prospect URL/context, view brief, generate draft, validate draft, add suppression entry, view audit events.
- Failure tests: connector timeout, AI invalid JSON, AI provider unavailable, vector search unavailable, suppressed recipient, blocked channel, unauthorized workspace access, prompt injection, SSRF attempt, queue retry/failure.
- AI evals: retrieval precision, citation coverage, unsupported claim blocking, prompt injection resistance, draft relevance, tone safety, compliance warning behavior, structured output validity, fallback behavior.

## Deployment and Local Development Plan

Local development will run through pnpm scripts and Docker Compose. Docker Compose will include PostgreSQL with pgvector, Redis, MinIO, API, worker, web, and health checks. An `.env.example` file will document local defaults and required secrets. Environment validation will fail fast on missing or invalid configuration.

Deployment documentation will include required services, environment variables, migration command, seed command, build command, start command, worker command, backup strategy, rollback notes, and secrets management notes.

CI will run install, lint, typecheck, unit tests, API/integration tests, build, Prisma validation, migration check, AI eval smoke tests, and practical security/dependency scanning.

## Assumptions and Ambiguity Resolutions

- No finalized architecture documents were present in the workspace at planning time. The attached request is treated as the available source of truth until additional architecture documents are provided.
- The MVP will be implemented as local-first development infrastructure with production-ready boundaries, not as a hosted deployment in this milestone sequence.
- OAuth connector endpoints will be architecture-ready in the MVP, but external OAuth app setup is environment-specific and will be documented rather than hard-coded.
- Gmail/Outlook behavior in MVP means copy/draft workflow interfaces and provider-ready abstractions, not autonomous sending.
- Manual LinkedIn URLs will be accepted only as user-supplied context metadata. The system will not scrape LinkedIn or bypass access controls.
- Real AI provider behavior will require configured credentials. Tests and local flows will use an explicit deterministic dev/test provider unless a real provider is configured.
- Heavy analytics, marketplace, mobile apps, autonomous prospecting, and bulk sending remain out of scope.

## Risk List

- Scope size is large for an MVP; risk is controlled by milestone sequencing and keeping each milestone runnable.
- AI outputs can drift or hallucinate; risk is controlled with structured outputs, evidence ID preservation, claim validation, and eval fixtures.
- Compliance requirements vary by region; risk is controlled with deterministic policy abstractions, warnings, audit logs, and documented limitations.
- Identity resolution can be error-prone; risk is controlled by deterministic/probabilistic signals and never allowing LLM guesses as sufficient.
- URL ingestion can introduce SSRF and policy risk; risk is controlled with safe fetching, protocol restrictions, redirect checks, and source policy metadata.
- Tenant isolation is security-critical; risk is controlled with repository-level filters, authorization tests, and scoped request context.
- Connector reliability varies; risk is controlled with rate limits, timeouts, retries, structured errors, and mocked integration tests.
- Local Docker compatibility can be fragile; risk is controlled with health checks, documented commands, and CI validation.

## Acceptance Criteria

Milestone 0 is complete when:

- The architecture understanding is summarized.
- The implementation roadmap and milestones are documented.
- The tech stack is confirmed.
- The folder structure is defined.
- The database schema plan is defined.
- The API contract plan is defined.
- The AI pipeline plan is defined.
- The testing strategy is defined.
- The local development and deployment plan is defined.
- Assumptions and ambiguity resolutions are documented.
- Risks and acceptance criteria are listed.
- No production code has been written before this planning checkpoint.
