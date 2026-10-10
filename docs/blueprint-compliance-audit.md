# Blueprint Compliance Audit

**Product:** AI-Native Relationship Intelligence Platform  
**Audit basis:** Original `blueprint.txt`, current repository implementation, project documentation, automated test results, build results, and local API smoke evidence  
**Audit date:** 2026-07-10  
**Review mode:** Independent compliance audit; no redesign and no speculative feature invention

## Status Legend

| Status   | Meaning                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| FULL     | Implemented and operational at the level described for the relevant blueprint stage.                                      |
| PARTIAL  | A meaningful implementation exists, but a required path, surface, integration, or production control is incomplete.       |
| MISSING  | Planned by the blueprint and not materially implemented.                                                                  |
| DEFERRED | Explicitly assigned by the blueprint to a later stage, or intentionally deferred without contradicting the current stage. |

Deviation labels used in this audit are `Improvement`, `Equivalent`, `Compromise`, and `Regression`. An absent future-stage capability is not automatically a regression.

## 1. Executive Summary

The current product is a credible Beta/V1 foundation for Product B: a user can establish a workspace, ingest or analyze approved public evidence, search people and evidence, generate a cited relationship brief, create a grounded outreach draft, and pass it through deterministic compliance and suppression checks. The repository also contains a notably mature relational schema, careful SSRF and prompt-injection defenses, tenant-aware API authorization, structured AI outputs, provenance, audit records, and a polished responsive web workspace.

It does not yet satisfy the complete original blueprint. The largest gaps are not visual. They are operational product depth: durable prospect and note workflows, draft lifecycle and autosave, live first-party connectors, true asynchronous processing, hybrid/vector retrieval, production identity review, privacy lifecycle automation, production authentication, AI evaluation and provider resilience, observability, deployment automation, and integration surfaces beyond the web app.

**Compliance scores**

| Scope                                                            |   Score | Interpretation                                                                                                                                          |
| ---------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current Product B / Beta foundation                              | **72%** | Core trust-first workflow is recognizable and usable, but persistence, connectors, production operations, and several quality loops remain incomplete.  |
| Full original blueprint across MVP, Production, and Scale stages | **57%** | Architecture and schema anticipate much of the vision, but many planned capabilities are schema-only, adapter-only, local-only, or explicitly deferred. |

**Release judgment:** Suitable for controlled design-partner testing after the P0 gaps in Section 18 are closed. Not yet ready for unrestricted public production use or for a claim of full blueprint compliance.

**Most important conclusions**

1. The product remains aligned with the blueprint's trust-first philosophy. It has not drifted into a bulk outreach tool, unauthorized scraper, or general-purpose CRM.
2. The strongest areas are relational data modeling, evidence provenance, safe URL ingestion, deterministic compliance boundaries, core API structure, and current frontend polish.
3. The weakest areas are external integrations, production identity/session controls, asynchronous execution, privacy automation, AI evaluation/feedback, observability, and deployment maturity.
4. Several capabilities look complete at the schema or interface level but are not operational. These are explicitly marked `PARTIAL`, not `FULL`.
5. The complete staged blueprint still makes sense. No ground-up redesign is justified.

## 2. Blueprint Understanding

The intended product is a trust-first relationship intelligence platform. It helps a user answer four questions:

1. Who is this person or organization?
2. Why is the relationship relevant now?
3. What evidence supports that conclusion?
4. What is a respectful, accurate, and compliant next action?

The blueprint deliberately rejects a cold-email database model. It prioritizes evidence, provenance, freshness, confidence, recipient context, suppression, policy checks, and human approval. The primary initial product, Product B, starts with a prospect, URL, imported record, or approved source and produces an evidence brief, fit assessment, relationship angle, recommended channel, grounded drafts, and follow-up guidance.

The staged product vision then expands in two directions:

- **Product A:** discovery across approved data, vertical search, entity resolution, ranking, and relationship paths.
- **Product C:** relationship memory, notes, timeline, collaboration, policies, administration, analytics, meeting preparation, and durable organizational knowledge.

The architectural intent is a modular monolith first, supported by workers and a scheduler, with strong tenant boundaries and the ability to extract services only when scale or ownership requires it. The target platform combines PostgreSQL, object storage, a queue, Redis, hybrid search/vector retrieval, an AI gateway, policy enforcement, audit/provenance, and production observability.

The intended interaction surfaces are the web application, browser extension, Gmail and Outlook add-ins, CRM/ATS panels, and an administrative console. The AI is an orchestrated, grounded assistant. It may classify intent, plan retrieval, summarize evidence, generate relationship angles and drafts, and prepare meetings. It must not make compliance decisions, merge identities by itself, autonomously send outreach, or bypass human review.

## 3. Current Product Understanding

The current repository is a pnpm monorepo containing a Next.js web application, a NestJS API, a worker package/application, shared packages for AI, connectors, database, policy, search, storage, queue contracts, logging, auth, configuration, testing, and UI.

The implemented end-to-end path is:

1. A user registers or signs in with local credentials.
2. The user creates or enters a tenant-scoped workspace.
3. The user analyzes a safe public URL or ingests supported evidence.
4. The API normalizes evidence, records provenance and confidence, and performs deterministic/probabilistic entity resolution.
5. The user searches evidence and prospects.
6. The AI package generates a structured, cited relationship brief using mock or OpenAI-compatible providers.
7. The user generates a grounded draft.
8. Policy and suppression logic determines whether the channel is allowed, warned, or blocked.
9. Audit events and AI-run metadata are persisted where the active workflow invokes them.

The web interface presents a polished relationship workspace, discovery, trust/compliance, and settings experience. Its principal limitation is that several interactions are demo or browser-local state rather than durable server-backed workflows. The API is broader than the visible UI but narrower than the original API specification. The database is broader than both: it contains planned tables for prospect lists, notes, connector runs, AI evaluations, background jobs, and retention policies that do not yet have complete operational paths.

## 4. Overall Compliance Score

### Weighted full-blueprint score

| Domain                            |   Weight | Score |      Weighted contribution |
| --------------------------------- | -------: | ----: | -------------------------: |
| Product features and workflows    |      20% |   65% |                       13.0 |
| Backend, API, and data            |      15% |   72% |                       10.8 |
| AI and retrieval                  |      15% |   52% |                        7.8 |
| Security, privacy, and compliance |      15% |   54% |                        8.1 |
| Frontend and UX                   |      10% |   74% |                        7.4 |
| Integrations and product surfaces |      10% |   24% |                        2.4 |
| Infrastructure and operations     |      10% |   43% |                        4.3 |
| Quality and developer experience  |       5% |   62% |                        3.1 |
| **Overall**                       | **100%** |       | **56.9% (rounded to 57%)** |

### Confidence and caveats

- Confidence in the code and document comparison is high.
- Automated package tests, linting, type checks, formatting, production web build, dependency audit, and non-strict API smoke checks have passed.
- The strict readiness smoke currently reports degraded database readiness in the local environment, so DB-backed live behavior was not counted as fully production verified.
- A passing unit suite does not establish connector, deployment, concurrency, security, recovery, or production AI behavior.
- Items assigned to the blueprint's Production or Scale phases are scored as incomplete for full-blueprint compliance but are not described as current-stage regressions.

## 5. Feature Comparison Matrix

| Blueprint capability               | Current implementation                                                                          | Status   | Deviation                               | User impact                                                                  | Recommended disposition                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | -------- | --------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Workspace and tenant management    | Create, list, read, and update workspaces with memberships and role checks                      | FULL     | Equivalent                              | Core workspace isolation and navigation work                                 | Retain; broaden tests as auth evolves                                   |
| Prospect URL analysis              | Safe URL analysis with source policy, redirect and private-network protection                   | FULL     | Improvement                             | Users can analyze approved public sources with lower SSRF risk               | Retain and add async execution                                          |
| Evidence ingestion and provenance  | Normalized evidence, immutable raw snapshots, source identifiers, confidence, freshness, hashes | FULL     | Equivalent                              | Core trust signal and recoverable source provenance are present              | Add connector coverage and operator-facing evidence inspection          |
| Relationship brief                 | Structured AI brief with citations and persisted brief records                                  | FULL     | Equivalent                              | Delivers the core Product B artifact                                         | Add feedback, revision history, and production eval gates               |
| Fit and relationship angle         | Generated inside structured brief                                                               | FULL     | Equivalent                              | Gives actionable context                                                     | Expose reasoning/evidence coverage more clearly                         |
| Recommended channel                | Brief/draft flow and policy evaluation include channel context                                  | PARTIAL  | Compromise                              | Recommendation exists, but connector/channel execution is limited            | Connect policy output to real Gmail/Outlook draft workflows             |
| Two to three grounded drafts       | Draft generation exists and enforces citations/unsupported-claim checks                         | PARTIAL  | Compromise                              | User receives a draft, but lifecycle and variants are incomplete             | Add variants, save/update/rewrite/validate/version APIs                 |
| Follow-up guidance                 | Some workflow language and UI affordances exist                                                 | PARTIAL  | Compromise                              | No durable follow-up plan or reminders                                       | Add explicit plan and notification workflow after core persistence      |
| Human approval before send         | No autonomous sending; human remains in control                                                 | FULL     | Equivalent                              | Preserves product philosophy and reduces harm                                | Keep as a hard invariant                                                |
| Prospect lists                     | Schema and repository exist                                                                     | PARTIAL  | Compromise                              | Users cannot complete list CRUD/import/member management through the product | Add list/import/member APIs and UI                                      |
| CSV import                         | Connector contract and parsing logic exist                                                      | PARTIAL  | Compromise                              | Import cannot be completed through a normal user flow                        | Wire to prospect lists with validation and job progress                 |
| CRM/ATS import and export          | Planned only                                                                                    | MISSING  | Compromise                              | Teams cannot bring existing records into the workflow                        | Implement after generic import and connector account framework          |
| Relationship notes                 | Database table exists; UI state is local                                                        | PARTIAL  | Compromise                              | Relationship memory is lost across devices/sessions                          | Add note CRUD, authorship, timeline, and durable UI                     |
| Relationship timeline              | Evidence timeline endpoint and UI concepts exist                                                | PARTIAL  | Compromise                              | Evidence history exists, but notes, drafts, and interactions are incomplete  | Build a unified paginated activity timeline                             |
| Draft autosave and history         | Browser-local behavior only; no full draft update/version API                                   | PARTIAL  | Compromise                              | Work can be lost and cannot be audited/recovered                             | Add autosave, optimistic concurrency, and versions                      |
| Search                             | PostgreSQL full-text and pgvector candidates use reciprocal-rank fusion plus quality signals    | PARTIAL  | Equivalent                              | Hybrid recall is operational; collection navigation remains basic            | Add cursor pagination and facets when result volume requires them       |
| Similar people                     | Endpoint exists                                                                                 | PARTIAL  | Compromise                              | Similarity is not backed by production vector retrieval                      | Implement vector-backed similarity with explainable factors             |
| Entity resolution                  | Deterministic identifiers plus probabilistic name/location logic                                | PARTIAL  | Equivalent                              | Better than LLM-only merge; lacks review operations                          | Add candidate review, merge/split, and audit UI                         |
| Compliance evaluation              | Deterministic policy uses durable purpose, consent, recipient type, and region context          | FULL     | Equivalent                              | Core trust and safety boundary works with auditable workflow context         | Expand policy packs only when new jurisdictions require them            |
| Suppression management             | Tenant and global concepts, hashed channels, create/list/delete                                 | FULL     | Improvement                             | Minimizes retained contact data and prevents prohibited outreach             | Add import/export and stronger admin controls                           |
| Contact-channel management         | Hashed channel APIs persist consent and policy context without raw addresses                    | FULL     | Improvement                             | Reduces direct PII storage while retaining review inputs                     | Add encrypted connector references where needed                         |
| Retention controls                 | Owner/admin settings, expiration backfill, preview, manual cleanup, and scheduled sweeps        | FULL     | Equivalent                              | Evidence and source snapshots now have an enforced, auditable lifecycle      | Add legal holds and additional data classes only with demonstrated need |
| Audit log                          | Audit records and read endpoint exist                                                           | PARTIAL  | Compromise                              | Useful traceability; immutability and full event coverage are not proven     | Make append-only, expand events, add filters/export                     |
| Team collaboration                 | Memberships and six roles exist                                                                 | PARTIAL  | Compromise                              | Team access works at a base level; collaboration surfaces are thin           | Add member/admin UI, assignment, comments, and activity                 |
| Admin console                      | Settings UI exists, but organization/policy/eval administration is incomplete                   | PARTIAL  | Compromise                              | Operational policy management requires engineering access                    | Add dedicated admin routes and protected APIs                           |
| Analytics and reporting            | AI-run/eval schema exists; no product analytics dashboard                                       | MISSING  | Compromise                              | Teams cannot measure adoption, quality, or outcomes                          | Add core product/AI/compliance dashboards after event coverage          |
| Notification center                | Not operational                                                                                 | MISSING  | Compromise                              | Users cannot track completed jobs, warnings, or follow-ups                   | Implement after background processing is durable                        |
| Browser extension                  | Not implemented                                                                                 | DEFERRED | Compromise versus original MVP timing   | Users must switch context into the web app                                   | Reintroduce after web workflow and auth contracts stabilize             |
| Gmail/Outlook add-ins              | Not implemented                                                                                 | DEFERRED | Equivalent to staged Production roadmap | No in-context drafting or approved handoff                                   | Implement using shared brief/draft APIs and OAuth accounts              |
| Product A discovery                | Basic discover/search experience only                                                           | DEFERRED | Equivalent to roadmap stage             | No broad vertical relationship discovery yet                                 | Build after hybrid retrieval and connector coverage                     |
| Product C relationship graph       | Relational entity/affiliation foundation only                                                   | DEFERRED | Equivalent to roadmap stage             | No rich path scoring or graph exploration                                    | Defer until real usage demonstrates graph need                          |
| Meeting preparation                | Not implemented                                                                                 | DEFERRED | Equivalent to roadmap stage             | No pre-meeting synthesis                                                     | Add after calendar/email connectors and durable memory                  |
| Autonomous sending/bulk sequencing | Intentionally absent                                                                            | FULL     | Improvement                             | Prevents drift into unsafe outreach automation                               | Keep excluded                                                           |

## 6. System Comparison Matrix

| Blueprint system          | Current state                                                                                            | Status   | Key gap                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Web application           | Responsive Next.js application with workspace, discovery, trust, settings, command palette, dark mode    | FULL     | Break the oversized page component into domain modules; replace local demo state |
| Browser extension         | No extension package                                                                                     | DEFERRED | Shared auth, URL capture, and analyze flow                                       |
| Gmail add-in              | No add-in                                                                                                | DEFERRED | OAuth, draft handoff, source/context permissions                                 |
| Outlook add-in            | No add-in                                                                                                | DEFERRED | Microsoft Graph auth and draft workflow                                          |
| CRM/ATS panel             | No embedded panel                                                                                        | DEFERRED | Connector account framework and record mapping                                   |
| API/BFF                   | NestJS modular API with stable error shape and request IDs                                               | FULL     | Complete planned resource APIs and versioning discipline                         |
| Auth/tenant module        | Local JWT, passwords, memberships, tenant/workspace guards                                               | PARTIAL  | OIDC, refresh/session lifecycle, MFA/SSO, ABAC, RLS                              |
| Workspace/prospect module | Workspace APIs; prospect/list schema and repository                                                      | PARTIAL  | User-facing list/import/member workflows                                         |
| Brief module              | Generate and retrieve brief                                                                              | FULL     | Revisions, feedback, explainability, status transitions                          |
| Draft module              | Generate and persist draft                                                                               | PARTIAL  | CRUD, rewrite, validate, autosave, versions, export/handoff                      |
| Compliance module         | Policy and suppressions operational                                                                      | FULL     | Regional policy depth, retention execution, admin configuration                  |
| Workflow module           | Durable consumers, retry, idempotency, progress, cancellation, and DLQ replay for five core job families | PARTIAL  | Remaining export/deletion and notification schedules                             |
| Notification module       | No operational service                                                                                   | MISSING  | Job, warning, assignment, and follow-up notifications                            |
| Connector framework       | Public URL and research-source connectors plus CSV logic                                                 | PARTIAL  | OAuth account lifecycle and first-party productivity/CRM connectors              |
| Ingestion pipeline        | Fetch, normalize, snapshot, extract, resolve, embed, and persist evidence                                | PARTIAL  | Policy depth per connector                                                       |
| Entity resolution         | Deterministic and probabilistic resolver                                                                 | PARTIAL  | Human review queue, merge/split controls, quality metrics                        |
| Hybrid search             | Indexed PostgreSQL full-text and pgvector retrieval with reciprocal-rank fusion                          | FULL     | Add a separate search service only if measured scale requires it                 |
| Vector store              | pgvector schema/index, online generation, checkpointed backfill, and runtime query path                  | FULL     | Monitor recall and index tuning as corpus size grows                             |
| Graph store               | Relational affiliations only                                                                             | DEFERRED | Dedicated graph/path scoring only when justified                                 |
| Object storage            | S3-compatible create-only snapshot writes, lifecycle metadata, reads, and retention deletion             | PARTIAL  | Signed reads, bucket hardening, and recovery/integration drills                  |
| Redis/cache               | Compose/config presence                                                                                  | PARTIAL  | Client usage, cache strategy, distributed rate limit, queue backing              |
| AI orchestration          | Provider interface, structured prompts, validation, run records                                          | PARTIAL  | Routing, fallback, streaming, caching, tools, eval and cost control              |
| Evaluation system         | Eval tables only                                                                                         | PARTIAL  | Runner, golden sets, CI gates, dashboards, human feedback loop                   |
| Audit/provenance          | Evidence provenance and audit records                                                                    | PARTIAL  | Immutable storage guarantees, comprehensive coverage, export                     |
| Admin console             | Settings surface only                                                                                    | PARTIAL  | User, role, policy, connector, retention, eval, and system health views          |
| Worker                    | Persistent evidence, brief, draft, connector-sync, and retention processors                              | PARTIAL  | Embedding and notification processors                                            |
| Scheduler                 | Dedicated overlap-safe evidence-retention and connector-refresh scheduler                                | PARTIAL  | Notification, export, and deletion schedules                                     |
| Analytics warehouse       | Not implemented                                                                                          | DEFERRED | Event model and usage threshold before introducing warehouse complexity          |

## 7. Workflow Comparison

### Prospect-to-draft workflow

| Step | Blueprint                                                        | Current product                                                                            | Status  |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| 1    | Start from prospect, URL, CRM, Gmail/Outlook, or approved source | URL/manual evidence is operational; other sources are absent                               | PARTIAL |
| 2    | Apply source and purpose policy                                  | Source safety and some policy checks exist; purpose/region context is incomplete           | PARTIAL |
| 3    | Snapshot, parse, normalize, detect PII, extract claims           | Parse/normalize/hash/extract exists; object snapshot and full PII lifecycle are incomplete | PARTIAL |
| 4    | Resolve person/organization with deterministic-first logic       | Implemented without LLM-only merge                                                         | FULL    |
| 5    | Generate embeddings and hybrid index                             | Online ingestion plus checkpointed backfill populate the indexed vector column             | FULL    |
| 6    | Retrieve and rank evidence                                       | Full-text and vector candidates use reciprocal-rank fusion plus quality signals            | FULL    |
| 7    | Produce cited brief and fit/angle                                | Implemented                                                                                | FULL    |
| 8    | Produce grounded draft variants                                  | A grounded draft is implemented; variants/lifecycle are incomplete                         | PARTIAL |
| 9    | Validate claims and policy                                       | Structured validation, unsupported-claim and deterministic policy checks exist             | FULL    |
| 10   | Human review and approved handoff                                | Human review exists; Gmail/Outlook/CRM handoff does not                                    | PARTIAL |
| 11   | Persist notes, outcome, follow-up, and timeline                  | Evidence persists; note/draft/outcome/follow-up memory is incomplete                       | PARTIAL |

### Team and administration workflow

| Workflow                            | Status  | Finding                                                                                             |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Invite and manage members           | PARTIAL | Membership model and roles exist; complete administrative UI/API flow is absent.                    |
| Assign and collaborate on prospects | MISSING | No durable assignment/comment/mention workflow.                                                     |
| Configure retention and policy      | FULL    | Admin configuration, preview/manual execution, and durable scheduled evidence enforcement are live. |
| Review suppressions                 | FULL    | Core suppression management works; bulk/admin reporting is limited.                                 |
| Review identity candidates          | MISSING | Resolver can signal ambiguity but no reviewer queue or merge/split workflow exists.                 |
| Review AI quality                   | MISSING | Eval schema is present without runnable evaluation or feedback workflow.                            |
| Review audit activity               | PARTIAL | Read endpoint exists without complete filtering, coverage, or immutable assurance.                  |
| Monitor system health               | PARTIAL | Health, readiness, and process metrics exist; no operator dashboard or alerting.                    |

### Recovery workflow

The blueprint expects idempotent jobs, retries, dead-letter handling, resumability, and clear user progress. Evidence ingestion (including online embedding), relationship-brief generation, draft generation, manual and recurring connector synchronization, and scheduled evidence retention now use crash-recoverable PostgreSQL leases, bounded retries, dead-letter handling, and replay. Remaining export/deletion and notification schedules keep the workflow implementation `PARTIAL`.

## 8. AI Comparison

| AI capability                 | Current implementation                                                               | Status  | Assessment                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------- |
| Provider abstraction          | Mock and OpenAI-compatible provider interface                                        | FULL    | Good foundation and testability                                                    |
| Real model operation          | Configurable adapter; default/local verification may use mock                        | PARTIAL | A production provider path needs environment validation and operational monitoring |
| Structured outputs            | Zod schemas and persisted structured results                                         | FULL    | Strong blueprint alignment                                                         |
| Prompt versioning             | Named prompt version/constants                                                       | PARTIAL | No registry, staged rollout, ownership, or migration policy                        |
| Grounded brief generation     | Evidence context, citations, coverage validation                                     | FULL    | Core AI value is implemented                                                       |
| Grounded draft generation     | Citation/unsupported-claim safeguards                                                | FULL    | Good trust boundary; needs lifecycle and evaluations                               |
| Prompt-injection defense      | Untrusted evidence delimiters, sanitization, suspicious-pattern checks               | FULL    | Strong current-stage control; adversarial regression corpus is missing             |
| Intent classification         | Not operational as a distinct stage                                                  | MISSING | Search/brief requests do not use the planned intent router                         |
| Query planning/tool use       | No production planner or tool orchestration                                          | MISSING | Limits multi-source retrieval and explainable execution                            |
| Hybrid retrieval              | Lexical only in runtime path                                                         | PARTIAL | The main RAG quality gap                                                           |
| Model routing                 | Static/provider config                                                               | MISSING | No task/latency/cost/risk-based selection                                          |
| Provider/model fallback       | No failover chain or circuit breaker                                                 | MISSING | Provider failure can block AI workflows                                            |
| Streaming                     | Not implemented end to end                                                           | MISSING | Higher perceived latency and limited progress feedback                             |
| Caching                       | No semantic/output cache                                                             | MISSING | Repeated work increases cost and latency                                           |
| Retry/repair                  | Validation-oriented repair/retry behavior exists in parts                            | PARTIAL | Needs bounded provider retry policy, jitter, and classified failures               |
| Confidence and explainability | Evidence confidence and citations are visible                                        | PARTIAL | No calibrated answer-level confidence or claim-by-claim inspection UI              |
| Long-term memory              | Relational evidence base exists; notes/interactions are incomplete                   | PARTIAL | Product C memory is not durable end to end                                         |
| Evaluation                    | Tables and test fixtures only                                                        | PARTIAL | No golden-set runner, quality gates, drift/cost tracking, or dashboard             |
| User feedback loop            | Not implemented                                                                      | MISSING | No explicit helpfulness/accuracy/edit-distance learning signal                     |
| Token and cost controls       | AI-run fields exist but are not fully populated/enforced                             | PARTIAL | No budgets, quotas, alerts, or task-level cost policy                              |
| Safety boundary               | AI does not decide compliance, permissions, suppression, sending, or identity merges | FULL    | Correct and essential architectural choice                                         |

**AI deviation judgment:** The implementation preserves the correct boundary between probabilistic generation and deterministic policy. The principal issue is incompleteness, not an unsafe redesign. Operational retrieval quality, provider resilience, evaluation, feedback, and cost controls are the priority.

## 9. Architecture Comparison

### Alignment

- The modular monolith is appropriate for the current stage and matches the blueprint.
- Package boundaries reflect the intended domains: AI, connectors, database, policy, search, storage, queue, logging, auth, configuration, and UI.
- PostgreSQL is correctly used as the primary system of record.
- The schema anticipates provenance, aliases, affiliations, snapshots, evidence, lists, briefs, drafts, suppressions, audit, connector runs, AI runs/evals, jobs, and retention.
- Deterministic policy and identity controls remain outside the LLM.
- The implementation avoids premature microservices and a premature graph database.

### Deviations

| Deviation                                                   | Classification                                        | Consequence                                               | Recommendation                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Synchronous ingestion despite worker/queue contracts        | Compromise                                            | API latency, restart fragility, and poor burst handling   | Move external fetch, extraction, embedding, and AI work into durable jobs |
| Queue and worker are mostly structural                      | Compromise                                            | Architecture appears more complete than runtime behavior  | Implement one real end-to-end queue before adding more abstractions       |
| Redis is configured but not used in core runtime            | Compromise                                            | No shared cache or distributed limit enforcement          | Wire only the blueprint-required paths and test recovery                  |
| Search abstraction lacks runtime vector retrieval           | Compromise                                            | Lower recall and weaker similar-person results            | Add pgvector first; introduce OpenSearch only when scale justifies it     |
| Schema leads product/API substantially                      | Equivalent foundation                                 | Good forward compatibility, but can hide missing behavior | Track schema-only capabilities explicitly and finish vertical slices      |
| Frontend is concentrated in a very large client page        | Compromise                                            | Higher regression risk and harder feature ownership       | Extract domain hooks/components without changing visual language          |
| Browser-local state substitutes for server-backed workflows | Regression against durable relationship-memory intent | Work is lost and collaboration cannot be trusted          | Move prospects, notes, drafts, preferences, and activity to APIs          |
| Scheduler covers retention and connector refresh            | Compromise                                            | Export/deletion and notifications are not yet recurring   | Extend the existing scheduler with measured, idempotent job families      |
| No dedicated graph database                                 | Equivalent                                            | Avoids unnecessary current-stage complexity               | Continue relational path modeling until measured need emerges             |
| No analytics warehouse                                      | Equivalent                                            | Avoids premature infrastructure                           | Define events now; add warehouse at volume threshold                      |

### Coupling and maintainability

The backend package boundaries are reasonable. The greater maintainability risk is vertical incompleteness: contracts, tables, and packages exist without operational consumers. This increases cognitive load and creates false confidence. Each planned subsystem should be completed as a tracer-bullet workflow or clearly labeled dormant.

The frontend should be decomposed along product domains, but a framework or state-management rewrite is not warranted. Existing Next.js, React, CSS tokens, and API client patterns should remain.

## 10. Quality Comparison

| Quality dimension   | Blueprint expectation                                         | Current evidence                                                      | Status                             |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| Unit tests          | Domain and utility coverage                                   | 77 package tests pass across 28 spec files                            | FULL for current implemented scope |
| Integration tests   | Real DB, storage, queue, connector boundaries                 | Mostly absent; strict DB readiness not currently verified             | MISSING                            |
| End-to-end tests    | Critical browser-to-API journeys                              | Manual visual verification only; no durable E2E suite                 | MISSING                            |
| AI evaluation tests | Golden sets, groundedness, drift, cost, human review          | AI unit tests and schemas only                                        | PARTIAL                            |
| Security tests      | SSRF, authz, injection, dependency, container/SAST            | Targeted unit controls and clean prod dependency audit                | PARTIAL                            |
| Performance tests   | API/search/AI SLO and load behavior                           | No load suite or SLO evidence                                         | MISSING                            |
| Accessibility       | Keyboard, labels, focus, reduced motion, responsive layout    | Current UI implements these patterns; no automated accessibility gate | PARTIAL                            |
| Build quality       | Lint, typecheck, format, production build                     | Passing; Next ESLint plugin warning remains                           | FULL with minor warning            |
| Dependency health   | Known production vulnerability scan                           | `pnpm audit --prod` reports no known vulnerabilities                  | FULL at audit time                 |
| Smoke tests         | Health/readiness/auth/API path                                | Non-strict smoke passes; readiness reports degraded DB locally        | PARTIAL                            |
| Migration safety    | Validation, generate, dry-run, rollback                       | CI checks exist; real migration dry-run/restore drills are limited    | PARTIAL                            |
| Documentation       | Architecture, API, security, testing, deployment, limitations | Broad documentation exists; some limitations text is stale            | PARTIAL                            |
| Observability       | Logs, traces, metrics, alerts, product/AI measures            | Structured logs and basic health/process metrics only                 | PARTIAL                            |
| Recovery testing    | Backup restore, queue retry, restart, DLQ                     | Runbook concepts without automated evidence                           | MISSING                            |

## 11. Missing Features Checklist

### Required to complete Product B / Beta

- [x] Durable prospect-list CRUD, member management, and import flow.
- [x] Durable relationship notes with authorship and timeline integration.
- [x] Draft read/update/rewrite/validate/autosave/version history.
- [x] Unified activity timeline for evidence, notes, briefs, drafts, policy decisions, and outcomes.
- [x] User-visible background-job progress, retry, cancellation where safe, and failure recovery.
- [x] Purpose, consent, recipient type, and region captured in the workflow where policy requires them.
- [x] Retention settings and automated expiration/deletion.
- [x] User data export and deletion workflows.
- [x] AI quality feedback on briefs and drafts.
- [x] Admin management of members, roles, policies, suppressions, connectors, and retention.

### Planned Production capabilities

- [ ] Gmail connector and approved draft handoff.
- [ ] Outlook/Microsoft Graph connector and approved draft handoff.
- [ ] Google People connector.
- [ ] CRM/ATS import/export connectors.
- [ ] Browser extension for approved URL capture and analysis.
- [ ] Identity candidate review and merge/split workflow.
- [ ] Notification center and follow-up reminders.
- [ ] Product, AI-quality, and compliance analytics.
- [ ] SSO, MFA for administrators, and enterprise lifecycle integration.

### Correctly deferred Scale capabilities

- [ ] Product A vertical discovery at broad source coverage.
- [ ] Dedicated graph storage and graph-path ranking.
- [ ] Meeting preparation from calendar/email memory.
- [ ] Customer-managed keys, private networking, and advanced regional deployment.
- [ ] Marketplace integrations and custom enterprise policy packs.

The following are intentionally excluded and must not be treated as missing: autonomous sending, bulk sequences, unauthorized scraping, a proprietary contact database, LLM-only compliance, LLM-only identity merging, and a full CRM replacement.

## 12. Missing Tools and Utilities Checklist

- [x] Connector development harness with recorded fixtures, scope validation, and deterministic replay.
- [x] Identity-resolution review utility with candidate explanations and merge/split audit.
- [x] Embedding backfill and reindex command with checkpointing.
- [x] Search relevance evaluation CLI and labeled query set.
- [x] AI golden-set runner with groundedness, unsupported-claim, citation, latency, and cost metrics.
- [x] Prompt registry/version comparison utility.
- [x] Data export/delete administrative utility.
- [x] Retention preview and execution utility with dry-run mode.
- [x] Suppression bulk import/export utility.
- [x] Dead-letter inspection and replay utility.
- [x] Connector token rotation/revocation utility.
- [x] Seed/demo workspace generator that does not mix demo state with real user data.
- [x] Migration rehearsal and compatibility checker against a disposable database.
- [x] Backup restoration verification script.
- [x] SLO/load-test harness for workspace, search, URL analysis, brief, and draft targets.
- [x] Automated accessibility and visual-regression runner.
- [x] API contract/OpenAPI compatibility check.
- [x] Security regression corpus for SSRF, prompt injection, XSS, authz, and tenant isolation.

## 13. Missing Services and Infrastructure Checklist

| Service/control                | Current state                                                                                       | Need                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Durable queue                  | PostgreSQL leasing is live for evidence, relationship-brief, draft, and connector-sync jobs         | Extend the same contract only as remaining scheduled job families are implemented      |
| Worker runtime                 | Evidence ingestion with embeddings, brief, draft, connector-sync, and retention processors are live | Add notification task processors                                                       |
| Scheduler                      | Evidence-retention and opt-in connector-refresh scans enqueue durable work                          | Add export/deletion and notification schedules                                         |
| Redis runtime                  | Configured only                                                                                     | Queue backing, cache, distributed locks, and distributed rate limiting where justified |
| Object storage runtime         | Immutable S3-compatible snapshots, reads, health, and retention deletion are live                   | Add deployment hardening and recovery drills                                           |
| Search/vector runtime          | Online embeddings, checkpointed backfill, indexed retrieval, and rank fusion are live               | Tune index/query parameters from production recall and latency measurements            |
| Secret manager                 | Environment variables                                                                               | Managed secret storage, scoped access, rotation, and audit                             |
| Distributed rate limiting      | Process-local limiter                                                                               | Consistent tenant/user/IP limits across replicas                                       |
| OpenTelemetry                  | Absent                                                                                              | Traces across web/API/worker/connectors/AI provider                                    |
| Metrics backend and alerts     | Basic endpoint only                                                                                 | Product, system, connector, policy, AI, queue, and SLO alerts                          |
| Automated backups              | Runbook-oriented                                                                                    | Scheduled encrypted backups, retention, restore drills, RPO/RTO evidence               |
| Managed deployment definitions | Docker Compose only                                                                                 | Repeatable staging/production infrastructure and environment promotion                 |
| WAF/edge controls              | Absent in repository                                                                                | DDoS, bot, abusive URL, and common exploit controls                                    |
| Feature flags                  | Absent                                                                                              | Controlled connector/model/prompt rollouts and emergency disable switches              |
| Preview/staging environments   | Not automated                                                                                       | Isolated migration and connector validation before production                          |
| Artifact security              | No SBOM/signing path                                                                                | Image scanning, SBOM, provenance, and deployable artifact controls                     |

## 14. Missing APIs and Integrations Checklist

### Missing or incomplete APIs

- [ ] Prospect list create/read/update/archive and pagination.
- [ ] Prospect import validation, asynchronous execution, row-level errors, and status.
- [ ] Prospect-list member add/update/remove and bulk operations.
- [ ] Relationship note create/read/update/delete and timeline pagination.
- [ ] Draft get/update/archive/rewrite/validate/version and autosave concurrency token.
- [ ] Brief feedback, revision, and regeneration metadata.
- [ ] Connector account OAuth start/callback/status/revoke.
- [ ] Connector runs list/status/retry and sync cursors.
- [x] Retention policy read/update/preview/execute.
- [x] User data export and deletion request/status.
- [ ] AI run details, user feedback, eval execution, and eval results.
- [ ] Identity candidates, review, merge, split, and resolution history.
- [x] Member invitation, role update, and removal.
- [ ] Notification list/read/preferences.
- [ ] Product/AI/compliance analytics queries.
- [ ] Session list/revoke/refresh.
- [ ] Audit filtering, pagination, and export.
- [ ] Stable API pagination/filter/sort conventions across collections.

### Missing integrations

- [ ] Google OAuth/OIDC and Gmail.
- [ ] Microsoft OAuth/OIDC, Outlook, and Graph.
- [ ] Google People.
- [ ] At least one CRM connector and one ATS connector.
- [ ] Browser extension capture/auth bridge.
- [ ] Email add-in draft handoff.
- [ ] Production AI gateway/provider monitoring and failover.
- [ ] Managed object storage, queue, cache, telemetry, and secrets services.

Existing GitHub, ORCID, Semantic Scholar, Crossref, company/public URL, CSV, and manual LinkedIn-context connectors are useful foundations, but they do not substitute for the first-party relationship systems named in the blueprint.

## 15. Missing UX/UI Components

The frontend redesign materially improves polish and communicates the relationship-intelligence concept well. The following gaps remain against the blueprint:

- [ ] Persistent prospect list management with import progress and row errors.
- [ ] Dedicated prospect detail route with reload-safe state and shareable URL.
- [ ] Durable note editor with authorship, edit state, and timeline placement.
- [ ] Draft editor with autosave indicator, version history, variants, rewrite controls, and validation detail.
- [ ] Evidence inspector showing source snapshot, claim linkage, freshness, confidence, and provenance together.
- [ ] Identity-review queue and comparison screen.
- [ ] Connector management screen with scopes, sync status, failures, last run, and revoke.
- [x] Team member and role administration.
- [x] Policy/retention administration with preview and impact counts.
- [ ] Notification center for jobs, reviews, warnings, and follow-ups.
- [ ] AI feedback controls and explanation of what evidence supported each claim.
- [ ] Analytics views for adoption, brief quality, policy outcomes, connector health, and AI cost.
- [ ] Session/device management and account recovery flows.
- [x] Data export/delete self-service flows.
- [ ] Global empty/loading/error/offline/retry patterns backed by real request state.
- [ ] Pagination, advanced filters, facets, sorting, and saved views for growing datasets.
- [ ] Browser extension and add-in interfaces.
- [ ] Automated accessibility verification for keyboard order, screen-reader names, contrast, dialogs, and live regions.

The current large `app/page.tsx` should be decomposed into domain components and hooks as these workflows are made durable. This is a maintainability improvement, not a visual redesign.

## 16. Missing Security Components

### Present strengths

- Password hashing and short-lived JWT access tokens.
- Tenant/workspace membership checks and role-aware authorization.
- Helmet, configured CORS allowlist, request IDs, and stable error handling.
- SSRF protection including private-network and redirect checks.
- Hashed contact channels and suppression support.
- Prompt-injection sanitization and untrusted-evidence boundaries.
- Deterministic compliance outside the LLM.
- Production dependency audit currently reports no known vulnerabilities.

### Required gaps

- [ ] OAuth 2.1/OIDC for Google and Microsoft identities.
- [ ] Refresh-token rotation, session inventory, revocation, and device/session controls.
- [ ] MFA for privileged roles and recovery protections.
- [ ] SAML/SCIM at the blueprint's Production stage.
- [ ] Full ABAC for region, source, sensitivity, purpose, channel, consent, and recipient type.
- [ ] PostgreSQL row-level security or an equivalently verified defense-in-depth tenant boundary.
- [ ] Distributed rate limiting by tenant, user, IP, endpoint, connector, and AI cost class.
- [ ] Managed secrets and connector-token encryption/rotation.
- [ ] Immutable or tamper-evident audit storage and privileged separation.
- [ ] Automated retention, deletion, export, and legal-hold-aware lifecycle controls.
- [ ] Regional data policy and residency enforcement where sold.
- [ ] CSP tuned for the deployed frontend and explicit CSRF analysis for future cookie/OAuth flows.
- [ ] Security headers and CORS tests in deployed environments.
- [ ] WAF/DDoS/bot controls and abusive URL-analysis protections.
- [ ] SAST, secret scanning, container scanning, SBOM, artifact signing, and dependency policy in CI.
- [ ] Tenant-isolation integration tests and authorization matrix tests.
- [ ] Adversarial prompt/RAG poisoning corpus and source trust weighting.
- [ ] Incident response, breach workflow, access review, and key-rotation drills.

No critical exploitable vulnerability was proven by this audit. The finding is that production controls and verification are incomplete, not that the existing protections are absent.

## 17. Missing Testing and Documentation

### Testing gaps

- [ ] Real PostgreSQL integration suite covering migrations, transactions, constraints, tenant isolation, and concurrent updates.
- [ ] Redis/queue integration tests for retry, idempotency, duplicate delivery, crash recovery, and dead letters.
- [x] Object-storage verification covering live S3-compatible immutability/read/delete plus lifecycle and failure-path tests; see `docs/production-milestone-7-object-storage-snapshots.md`.
- [ ] Connector contract tests using recorded fixtures and OAuth token failure states.
- [ ] End-to-end browser tests for register/login, workspace, URL analysis, evidence review, brief, draft, suppression, and reload persistence.
- [ ] Cross-browser and mobile journey tests.
- [ ] Accessibility tests using automated tooling plus manual screen-reader checks.
- [ ] Load and soak tests against the blueprint latency targets.
- [ ] AI golden sets for groundedness, citation accuracy, unsupported claims, injection resistance, latency, and cost.
- [ ] Model/provider failure, timeout, malformed output, quota, and fallback tests.
- [ ] Security tests for XSS, CSRF assumptions, SSRF variants, authz, rate limits, secret leakage, and dependency/container posture.
- [ ] Recovery tests for DB restart, worker restart, connector outage, AI outage, duplicate request, and partial shutdown.
- [ ] Migration dry-run and rollback/forward-fix rehearsal in CI or staging.
- [ ] API compatibility and contract tests.
- [ ] Visual regression tests for the current frontend quality bar.

### Documentation gaps or drift

- [ ] Update `docs/limitations.md`; it still describes an older single-screen frontend and outdated smoke-test caveats.
- [ ] Publish an authoritative current-versus-planned capability ledger so schema-only features are not mistaken for working features.
- [ ] Document every connector's allowed sources, OAuth scopes, retention, sync behavior, and revocation.
- [ ] Document the production auth/session model and authorization matrix.
- [ ] Define data classification, PII fields, encryption, residency, export, deletion, and retention behavior.
- [ ] Define SLOs, alert thresholds, incident ownership, escalation, RPO, and RTO.
- [ ] Document prompt ownership, model routing, evaluation thresholds, fallback policy, and cost budgets.
- [ ] Add operations runbooks for queue backlog, dead letters, connector failure, provider outage, DB saturation, and object-store outage.
- [ ] Add a production deployment guide tied to actual infrastructure definitions rather than Docker Compose alone.
- [ ] Record ADRs for pgvector-first search, session architecture, queue technology, object snapshot retention, and extension/add-in boundaries.

## 18. Prioritized Gap List

Effort assumes a small senior cross-functional team. `S` is 1-3 engineering days, `M` is 1-2 weeks, `L` is 3-6 weeks, and `XL` is 2-4 months. Estimates include implementation and focused tests, not procurement or external security certification.

### P0 - Required before controlled production release

| Gap                                               | Why P0                                                                              | Effort | Dependencies                                 | Completion evidence                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | -----: | -------------------------------------------- | --------------------------------------------------------------------- |
| Durable core relationship workflow                | Local-only prospects, notes, and draft state undermine the product's memory promise |      L | Existing schema/API auth                     | Reload-safe prospect/list/note/draft/timeline E2E tests               |
| Real queue, worker, retry, idempotency, and DLQ   | External fetch and AI work are not crash-safe or burst-safe                         |      L | Redis or managed queue, job schema           | Restart/duplicate/failure integration tests and operator replay       |
| Privacy lifecycle enforcement                     | Retention/export/delete/purpose controls are required by the trust-first blueprint  |      L | Scheduler, policy attributes, admin API      | Dry-run reports, deletion evidence, export E2E, audit coverage        |
| Production AI provider and evaluation gate        | Mock-capable code is not proof of reliable production intelligence                  |      M | Provider credentials/secrets, golden dataset | Live provider smoke, malformed/timeout tests, quality/cost thresholds |
| Production data and recovery baseline             | Local degraded readiness and unverified restore block reliable release              |      M | Managed DB/storage, migrations, backups      | Strict readiness pass, migration rehearsal, successful restore drill  |
| Production session and privileged-access baseline | Access JWT alone lacks refresh/revocation/MFA safeguards                            |      L | OIDC choice, secret manager                  | Session rotation/revocation tests and MFA for privileged users        |
| Deployment observability baseline                 | Basic health metrics cannot support incidents                                       |      M | Telemetry backend                            | Traces, domain metrics, queue/AI alerts, SLO dashboard, runbook       |

### P1 - Required for strong V1 blueprint representation

| Gap                                                  | Value                                                                        | Effort | Dependencies                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | -----: | ------------------------------------------------- |
| Hybrid pgvector search and embeddings                | Improves evidence recall, similar people, and Product A foundation           |      L | Async ingestion, embedding provider               |
| Gmail and Outlook connector accounts/draft handoff   | Moves intelligence into users' real relationship workflow                    |     XL | OIDC/OAuth, token encryption, connector framework |
| Identity review and merge/split                      | Makes probabilistic resolution trustworthy at scale                          |      M | Durable admin/reviewer workflow                   |
| Admin console                                        | Operationalizes users, roles, policy, suppression, connectors, and retention |      L | Corresponding APIs and RBAC/ABAC                  |
| Team collaboration                                   | Improves shared memory and retention                                         |      L | Durable prospects/notes/timeline                  |
| AI routing, fallback, streaming, and cost controls   | Improves latency, reliability, and economics                                 |      L | Provider abstraction, telemetry, eval gates       |
| Distributed rate limits and defense-in-depth tenancy | Enables safe horizontal scaling                                              |      M | Redis/edge layer, tenant isolation suite          |
| Full integration/E2E/security/load CI gates          | Converts claims into release evidence                                        |      L | Stable staging/test services                      |
| Browser extension                                    | Restores original MVP surface and reduces context switching                  |      L | Stable auth and analyze APIs                      |
| Product/AI/compliance analytics                      | Enables operating and improving the product                                  |      M | Event model, audit coverage, telemetry            |

### P2 - Valuable after V1 stability

| Gap                                             | Value                                     | Effort | Dependencies                                 |
| ----------------------------------------------- | ----------------------------------------- | -----: | -------------------------------------------- |
| CRM/ATS connectors                              | Expands team adoption and data continuity |     XL | Connector framework, mapping, admin controls |
| Google People connector                         | Enriches relationship context             |      M | Google OAuth and consent policy              |
| Notification center and reminders               | Improves follow-through                   |      M | Durable jobs, user preferences, timeline     |
| Saved views, facets, bulk actions, reporting    | Improves repeated operational use         |      L | Search pagination and durable lists          |
| Meeting preparation                             | Extends Product C value                   |      L | Calendar/email connectors and durable memory |
| SAML/SCIM                                       | Supports larger customers                 |      L | Enterprise demand and production auth model  |
| Advanced source trust and RAG poisoning defense | Improves safety with broader connectors   |      M | Connector/source quality metrics             |

### P3 - Future scale roadmap

| Gap                                      | Trigger                                                                  | Effort |
| ---------------------------------------- | ------------------------------------------------------------------------ | -----: |
| Dedicated graph database/path service    | Relational queries demonstrably fail latency/complexity targets          |     XL |
| Broad Product A vertical discovery       | Source rights, retrieval quality, and a validated vertical are ready     |     XL |
| Analytics warehouse                      | Operational volume or retention makes transactional analytics unsuitable |      L |
| Multi-region/residency architecture      | Contractual demand and measurable latency/residency need                 |     XL |
| Customer-managed keys/private networking | Enterprise procurement requires it                                       |     XL |
| Marketplace and custom policy ecosystem  | Stable extension contracts and partner demand exist                      |     XL |

## 19. Roadmap to Full Blueprint Compliance

### Milestone 1 - Durable Product B core (3-5 weeks)

- Complete prospect-list, import, note, draft lifecycle, autosave, and unified timeline APIs/UI.
- Replace browser-local domain data with server-backed state and stable URLs.
- Add DB integration and critical browser E2E tests.
- Update capability and limitation documentation.

**Exit:** A user can leave, return, collaborate, and recover all core work without data loss.

### Milestone 2 - Resilient execution and privacy (3-5 weeks)

- Implement one durable queue and production worker path for ingestion and AI jobs.
  - Evidence ingestion is complete with PostgreSQL leases, bounded retry, dead-lettering, and replay.
  - Relationship-brief generation is complete with the same durable contract.
  - Draft generation is complete with the same durable contract and deterministic compliance enforcement.
  - Explicitly requested connector synchronization is complete with the same durable contract.
- Add idempotency keys, bounded retries, progress, dead-letter inspection, and replay.
- Evidence-retention and connector-refresh scheduling are complete; add scheduler-backed export, deletion, and policy-purpose capture.
- Immutable source snapshots and lifecycle metadata are wired to S3-compatible storage; add bucket hardening, recovery drills, and signed inspection reads.

**Exit:** Jobs survive restarts and the stated data lifecycle is demonstrably enforced.

### Milestone 3 - Production AI and retrieval quality (3-5 weeks)

- Completed: operationalize embeddings and pgvector hybrid retrieval with rank fusion.
- Add golden-set evaluations, feedback capture, model/provider failure tests, and release thresholds.
- Add task-based routing, bounded fallback, streaming, token/cost accounting, and budgets.
- Add claim-level evidence inspection and calibrated confidence where measurable.

**Exit:** Brief and draft quality, grounding, latency, and cost are measured rather than assumed.

### Milestone 4 - Identity, access, and operations (3-5 weeks)

- Add OIDC, refresh/session rotation, revocation, privileged MFA, and an authorization matrix.
- Add distributed rate limits, managed secrets, encrypted connector tokens, and tenant-isolation tests.
- Add OpenTelemetry, product/system/AI metrics, alerts, SLOs, and incident runbooks.
- Automate backups, restore verification, migration rehearsal, and staging promotion.

**Exit:** The platform has a defensible production security and operations baseline.

### Milestone 5 - First-party workflow integrations (6-10 weeks)

- Implement connector account lifecycle and administration.
- Deliver Gmail and Outlook approved-source ingestion and draft handoff.
- Add browser extension URL capture using the same APIs and policy boundary.
- Add connector contract tests, scope/consent visibility, failure recovery, and revocation.

**Exit:** The product works in users' existing relationship workflow without autonomous sending.

### Milestone 6 - Team and admin V1 (4-6 weeks)

- Deliver identity review and audit export.
- Add assignments, comments/mentions where validated, notification center, and follow-up reminders.
- Add product, AI quality/cost, connector, and compliance analytics.
- Enforce release gates for E2E, accessibility, security, and performance.

**Exit:** A small organization can adopt, govern, observe, and improve the product without engineering intervention.

### Milestone 7 - Ecosystem and Product C expansion (6-12 weeks)

- Add Google People and selected CRM/ATS integrations.
- Add meeting preparation and richer relationship-memory workflows.
- Add saved views, reporting, advanced filters, and bulk operations.
- Add SAML/SCIM when customer demand validates the cost.

**Exit:** The Production-stage blueprint is substantially complete.

### Milestone 8 - Scale capabilities (trigger-based)

- Validate one Product A vertical before broadening discovery.
- Add graph storage only after relational performance evidence justifies it.
- Add warehouse, multi-region, CMK, VPC, marketplace, and custom policy infrastructure only at explicit business or scale triggers.

**Exit:** Scale-stage investments are tied to demonstrated constraints, preserving the blueprint without unnecessary enterprise complexity.

## 20. Final Assessment

### Does the product represent the intended vision?

**Partially, and convincingly at the core.** A reviewer can see the intended product in the evidence-first workspace, cited briefs, grounded drafts, suppression checks, provenance model, and human-control boundary. It is more than a generic AI composer and materially stronger than a typical visual MVP.

### Would early customers pay for it today?

Design partners may pay for a controlled pilot if they accept manual onboarding and limited integrations. Broader customers are likely to pause at missing durable relationship workflows, Gmail/Outlook integration, production identity/session controls, privacy lifecycle automation, and limited operational evidence.

### Would investors understand the vision?

Yes. The differentiated trust-first thesis is visible. Demonstrating persistent memory, a live first-party connector, hybrid retrieval quality, and measurable AI evaluation would make the defensibility materially clearer.

### Would technical reviewers be impressed?

They are likely to value the data model, deterministic policy boundary, SSRF protections, provenance, structured AI contracts, monorepo organization, and current UI quality. They will also notice that several packages and tables are preparatory rather than operational, and that production infrastructure, integration tests, recovery, telemetry, and AI evaluation remain incomplete.

### Production readiness verdict

| Question                                                  | Verdict                                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No critical known code-level vulnerability?               | No critical vulnerability was proven; full production security verification remains incomplete. |
| Core web workflow functional?                             | Yes, with local-state and persistence limitations.                                              |
| Core workflow durable and recoverable?                    | Not yet.                                                                                        |
| Privacy lifecycle enforceable?                            | Yes for self-service retention, export, and deletion; admin lifecycle tooling remains planned.  |
| AI quality and provider failure controlled?               | Partially.                                                                                      |
| Safe for unrestricted public production?                  | No.                                                                                             |
| Safe for controlled design-partner Beta after P0 closure? | Yes.                                                                                            |
| Full blueprint compliant?                                 | No, currently 57% across all stages.                                                            |

### Final recommendation

Do not redesign the product or add broad new feature categories. Finish the blueprint's existing vertical slices. The next investment should make the current Product B experience durable, asynchronous, privacy-enforcing, measurable, and production-operable. Then add Gmail/Outlook and the browser extension using the same policy and evidence contracts. Product A discovery, dedicated graph infrastructure, and enterprise-scale controls should remain trigger-based.

The product has crossed the line from an MVP presentation to a credible Beta foundation. It has not yet crossed the line from a credible Beta foundation to a production-complete implementation of the original blueprint.
