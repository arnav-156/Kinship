# Beta Discovery and Prioritization

## Purpose

This document is Milestone 0 for evolving the current working MVP into a polished Beta. It compares the implemented product against the original blueprint, identifies gaps, prioritizes Beta work, and defines a milestone roadmap. It intentionally does not implement product code.

## 1. Re-Understanding Analysis

### Long-Term Product Vision Recap

The product is a trust-first Relationship Intelligence Copilot. It helps a professional decide who to contact, why that person or organization matters, what evidence supports the recommendation, and how to write a respectful, compliant, human-reviewed outreach draft. The long-term company can become Product C: a relationship workflow platform with relationship memory, vertical discovery, collaboration, governance, and integrations. The correct Beta direction remains Product B-first: deepen the relationship intelligence and outreach review loop before adding broad discovery, autonomous workflows, or enterprise-heavy infrastructure.

The product must not become a cold email sender, lead database, CRM replacement, scraper, or autonomous outbound agent. The moat is evidence, provenance, fit explanation, freshness, confidence, compliance, and human trust.

### Current MVP Capabilities

The current MVP includes a Next.js dashboard and a NestJS API. Users can register or log in, select a workspace, ingest approved URL/context evidence, search evidence and prospects, generate relationship briefs, generate draft variants, evaluate compliance, save hashed contact channels, create suppressions, and inspect recent audit events. The UI has a demo fallback path when the API is unavailable.

Backend foundations include tenant/workspace auth, RBAC, audit events, source connectors, safe URL fetching, evidence persistence, search ranking, deterministic entity resolution, AI provider abstraction, prompt rendering, structured output validation, AI run persistence, deterministic compliance and suppression checks, request IDs, stable error envelopes, rate limiting, health/readiness, and metrics.

### Current Architecture Summary

The architecture is a TypeScript pnpm modular monolith:

- `apps/api`: NestJS REST API and application services.
- `apps/web`: Next.js App Router frontend.
- `apps/worker`: worker application boundary.
- `packages/db`: Prisma schema, migrations, repositories, transactions.
- `packages/ai`: model gateway, prompts, schemas, guardrails.
- `packages/search`: ranking, retrieval context, entity resolution.
- `packages/connectors`: allowed source connector framework.
- `packages/policy`: authorization and compliance policy rules.
- `packages/config`, `logger`, `shared`, `queue`, `testing`, `ui`: platform support.

The architecture is appropriately modular for Beta. It should stay a modular monolith. Extraction into services, graph databases, marketplaces, mobile apps, and heavy enterprise controls are future concerns.

### Existing Implemented Modules

Implemented modules include auth, workspaces, audit, evidence ingestion, connectors, search, relationship briefs, draft generation, compliance, database repositories, AI gateway, queue type definitions, API hardening middleware, health endpoints, and a single-screen frontend dashboard.

The database already contains Beta-relevant foundations that are not fully surfaced: relationship notes, prospect lists, prospect list members, connector accounts, connector runs, background jobs, AI eval runs/results, AI run metadata, draft messages, retention policies, contact channels, and suppressions.

### Existing Missing/Postponed Features

Major gaps are not in the raw domain model but in product surface area and workflow continuity:

- Onboarding and first-run guidance are minimal.
- The frontend is a single operational dashboard rather than a polished navigable product.
- Saved work exists in the database but is not easy to revisit in the UI.
- Notes and relationship timeline are schema-backed but not productized.
- Drafts are generated but not editable, autosaved, versioned, copied, or exported well.
- Prospect lists exist in repositories/schema but are not API/UI-complete.
- Background job progress is persisted but not exposed as a first-class status view.
- AI eval records exist in schema but no eval runner/dashboard exists.
- Connector status records exist but no connector status/admin screen exists.
- Retention policy records exist but no admin retention UX exists.
- Search lacks strong filtering/sorting UX and likely lacks pagination across all relevant views.
- Deployment docs exist but backup/restore, CI completeness, and smoke tests need hardening.

### Current UX Friction

A new user currently lands in a dense single-page tool with API session controls, workspace controls, intake, search, brief, draft, compliance, and audit all visible at once. That is useful for internal demos but not Beta-ready. It creates cognitive load, exposes implementation details such as API base URL too prominently, and does not guide a first-time user toward the aha moment.

The UI does not clearly separate core workflow from admin/compliance/debug panels. Loading and error handling exist mostly as a status string. The draft composer is read-only after generation. Evidence cards are useful but not inspectable enough: freshness, confidence, source provenance, and why-it-matters explanations need richer presentation. The dashboard has limited empty states, no toast system, no durable saved-work navigation, and no proper brief detail page.

### Current AI Limitations

The AI layer is structurally sound but Beta-light. Prompt versioning exists only as `relationship-brief-v1`. The prompts are concise and grounded but not rich enough for high-quality Beta output. RAG context is built from ranked evidence, but semantic/vector retrieval is a placeholder in ranking rather than a full persisted retrieval path. Unsupported-claim detection only validates cited evidence IDs, not claim semantics. Prompt-injection detection uses a small regex set. Structured output validation exists, but provider JSON parse repair/retry is absent. AI run metadata exists but token/cost fields are not consistently populated and no eval reporting loop is surfaced. User feedback on generated briefs/drafts is missing.

### Current Backend/Platform Limitations

The API is coherent but still Beta-incomplete. Several schema primitives lack API exposure. Background jobs are recorded but there is no active queue consumer loop or progress endpoint. Rate limiting is in-memory and suitable for a single-process Beta, not distributed production. Readiness checks DB only. Metrics are process-level only. There is no tracing hook. Pagination/filtering/sorting is uneven. API smoke testing still depends on a running local stack and approvals. Docker/CI/deployment docs are present but not yet enough for a pilot operator to recover, restore, or debug incidents confidently.

### Current Testing/Documentation Gaps

Unit coverage exists across important packages and API services. Gaps remain in frontend user journey tests, e2e tests, API contract tests, DB-backed smoke tests, AI eval fixtures, migration tests, accessibility checks, and production deployment runbooks. Documentation is current through Milestone 9 but still oriented toward implementation status rather than Beta operator workflows.

### Current Deployment/Production-Readiness Gaps

The product is locally runnable and has Docker Compose foundations. It still needs a reliable pilot deployment checklist, backup/restore docs, smoke test scripts, seeded demo data instructions, environment validation docs, CI stability, and a documented approach to provider credentials and AI cost limits. Distributed infrastructure is not required for Beta, but basic runbooks are.

### Beta Opportunity Areas

The strongest Beta opportunities are:

1. Make the first-run and core workflow obvious.
2. Make briefs and evidence more trustworthy and inspectable.
3. Make drafts editable, savable, copyable, and reviewable.
4. Surface saved prospects, briefs, drafts, notes, and timeline so work persists.
5. Add feedback/eval loops for AI quality without overbuilding.
6. Surface job progress, connector status, and compliance state in plain language.
7. Harden local/demo/pilot operations with smoke tests, seed data, and runbooks.

### Risks of Overbuilding

The largest risks are adding broad discovery, enterprise admin depth, graph databases, autonomous outreach, bulk sequencing, complex analytics, or heavy integrations before the relationship-intelligence loop is delightful. The Beta should deepen the Product B loop, not expand the product category.

## 2. MVP vs Blueprint Analysis

| Blueprint capability                         | MVP status              | Current implementation notes                                       | User impact if missing                      | Beta relevance | Complexity | Dependencies                                     | Recommendation                                     |
| -------------------------------------------- | ----------------------- | ------------------------------------------------------------------ | ------------------------------------------- | -------------- | ---------- | ------------------------------------------------ | -------------------------------------------------- |
| User-provided prospect URL/context intake    | Implemented             | `/v1/analyze-url`, connector framework, dashboard intake           | Core loop works but UX is form-like         | High           | Medium     | Existing connectors                              | Tier 1: polish guided intake and progress          |
| Manual LinkedIn context without scraping     | Implemented             | `manual_linkedin_context` connector policy, no scraping            | Good trust posture                          | High           | Low        | Existing connector rules                         | Keep; improve UX copy                              |
| GitHub/company/public URL evidence ingestion | Implemented             | Generic URL and GitHub connectors                                  | Useful demo value                           | High           | Medium     | Safe fetch                                       | Tier 1: better evidence cards and progress         |
| ORCID/Semantic Scholar/Crossref APIs         | Partially implemented   | Source types and public connector files exist; depth unclear in UI | Weak academic/deep-tech demo if shallow     | Medium         | Medium     | Connector implementation depth                   | Tier 2 after workflow polish                       |
| Gmail/Outlook/CRM imports                    | Intentionally postponed | Schema/source types mention CRM; no OAuth integration              | Limits real workflow integration            | Medium         | High       | OAuth, security, scopes                          | Tier 3 for Beta unless CSV/import-lite chosen      |
| Auth and workspace tenancy                   | Implemented             | Register/login/JWT/workspace memberships                           | Works for MVP; onboarding rough             | High           | Medium     | Existing auth                                    | Tier 1: onboarding and workspace UX                |
| RBAC/audit logging                           | Implemented             | Policy and audit modules                                           | Trust foundation present                    | High           | Low        | Existing services                                | Tier 1: better audit viewer                        |
| Prospect lists                               | Partially implemented   | Schema/repository seed; no API/UI productization                   | Users cannot organize saved candidates well | High           | Medium     | DB model exists                                  | Tier 1: saved prospects/list UX                    |
| Evidence-backed relationship brief           | Implemented             | Brief service, AI schemas, persistence                             | Core value exists                           | Critical       | Medium     | Existing AI/evidence                             | Tier 1: richer brief detail page                   |
| Evidence provenance/confidence/freshness     | Partially implemented   | Stored and returned but UI is thin                                 | Trust signal underused                      | Critical       | Low/Medium | Existing fields                                  | Tier 1                                             |
| Relationship timeline                        | Partially implemented   | Evidence timeline endpoint; notes schema exists                    | Work does not feel persistent               | High           | Medium     | Notes API needed                                 | Tier 1: notes + timeline                           |
| Relationship notes                           | Missing in API/UI       | Schema exists                                                      | Users cannot record context                 | High           | Medium     | DB model exists                                  | Tier 1                                             |
| Draft generation variants                    | Implemented             | Three variants, compliance merge                                   | Useful but not editable                     | Critical       | Low        | Existing drafts                                  | Tier 1: editable composer                          |
| Draft autosave/versioning                    | Missing                 | Draft table stores generated messages but no edit/version model    | Users cannot safely iterate                 | High           | Medium     | Draft update endpoint, maybe version table later | Tier 1 autosave/update; Tier 2 full versioning     |
| Copy/export actions                          | Missing/weak            | No copy/export affordance                                          | Demo and real usage friction                | High           | Low        | Frontend only for copy; export later             | Tier 1 copy; Tier 2 export                         |
| Unsupported-claim detection                  | Partially implemented   | Evidence ID coverage only                                          | Semantic hallucinations can slip through    | High           | Medium     | AI package                                       | Tier 1 strengthen modestly                         |
| Prompt injection defense                     | Partially implemented   | Regex detection and untrusted prompt text                          | Good start, shallow coverage                | High           | Medium     | AI tests                                         | Tier 1 expand tests and prompt framing             |
| Structured output validation                 | Implemented             | Zod schemas                                                        | Good safety                                 | High           | Low        | AI provider                                      | Tier 1 add repair/retry if small                   |
| AI run metadata/cost/latency                 | Partially implemented   | AiRun persisted; token/cost mostly empty                           | Hard to debug/cost-track                    | Medium         | Medium     | Provider usage data                              | Tier 1 metadata visibility; Tier 2 cost depth      |
| User feedback on AI output                   | Missing                 | No thumbs/reason storage                                           | No quality loop                             | High           | Medium     | New API/schema or reuse eval tables              | Tier 1 lightweight feedback                        |
| AI eval dashboard/report                     | Missing                 | AI eval tables exist only                                          | No regression confidence                    | Medium         | Medium     | Fixtures                                         | Tier 2 developer eval report after feedback        |
| Compliance/suppression engine                | Implemented             | Deterministic policy, hashed channels                              | Strong trust feature                        | Critical       | Low        | Existing services                                | Tier 1 UX polish                                   |
| Suppression ledger UX                        | Partially implemented   | API exists; UI can create but not inspect/manage well              | Admin confidence gap                        | High           | Medium     | Existing endpoints                               | Tier 1                                             |
| Retention settings                           | Partially implemented   | Schema/policy role only                                            | Pilot governance gap                        | Medium         | Medium     | API/UI missing                                   | Tier 2 unless compliance pilot requires it         |
| Connector status                             | Partially implemented   | Connector account/run schema; no UX                                | Users cannot tell what happened             | Medium         | Medium     | Runs API                                         | Tier 1 job/progress basics; connector admin Tier 2 |
| Background job progress                      | Partially implemented   | BackgroundJob persisted in evidence ingest                         | No visible progress/retry/dead-letter UX    | High           | Medium     | API endpoint                                     | Tier 1                                             |
| Search/filter/sort                           | Partially implemented   | Query search exists; filters limited                               | Hard to organize evidence/prospects         | High           | Medium     | Existing search                                  | Tier 1 basic filters/sorts                         |
| Pagination                                   | Partially implemented   | Limits exist; no consistent cursor/page UX                         | Scaling issue in Beta datasets              | Medium         | Medium     | API contracts                                    | Tier 2 unless needed by saved lists                |
| Toasts/loading/error states                  | Partially implemented   | Single status string and busy action                               | Product feels prototype-like                | High           | Low/Medium | Frontend state                                   | Tier 1                                             |
| Responsive/accessibility baseline            | Partially implemented   | Responsive CSS exists; deeper a11y not verified                    | Beta polish risk                            | High           | Medium     | Frontend QA                                      | Tier 1                                             |
| Admin settings                               | Missing                 | Role/policy foundations only                                       | Pilot admin controls limited                | Medium         | Medium     | Settings UI/API                                  | Tier 2 focused settings only                       |
| Observability                                | Partially implemented   | Logs, request IDs, process metrics                                 | Debuggable but shallow                      | Medium         | Medium     | Logger/metrics                                   | Tier 2 tracing/log docs; Tier 1 smoke/runbook      |
| Backup/restore docs                          | Missing                 | Deployment doc says required                                       | Pilot readiness gap                         | High           | Low        | Docs/scripts                                     | Tier 1 docs                                        |
| CI/CD                                        | Partially implemented   | Workflow exists; not reviewed here deeply                          | Confidence gap                              | Medium         | Medium     | Existing scripts                                 | Tier 1 stabilize checks if failing                 |
| Browser extension/email add-ins              | Missing/postponed       | Blueprint future surfaces                                          | Useful later, not needed for Beta core      | Low/Medium     | High       | New apps/OAuth                                   | Tier 3 for this Beta                               |
| Autonomous sending/bulk sequencing           | Intentionally excluded  | Not present                                                        | Protects trust positioning                  | N/A            | High risk  | N/A                                              | Keep excluded                                      |

## 3. Missing Feature Report

### Product and Workflow

High-impact gaps: onboarding, first-run checklist, guided intake, saved prospect lists, saved brief/draft navigation, notes/timeline, draft editing/autosave, copy actions, better empty/loading/error states, and compliance ledger clarity.

Quality-of-life gaps: toast notifications, clearer workspace switcher, better demo data, keyboard shortcuts for generate/copy/search, and saved recent work.

Safe bulk actions: CSV import into a review-only prospect list may be Beta-appropriate later, but bulk sending/sequencing must remain out of scope.

### AI

Gaps: prompts are serviceable but not polished; RAG is lexical/metadata-heavy with future semantic slots; unsupported-claim detection is citation-ID based rather than semantic; no repair/retry for invalid provider JSON; no user feedback loop; no AI eval runner/report; cost/latency/token metadata is not surfaced; no caching or streaming.

### Frontend and UX

Gaps: no durable navigation, no dedicated brief page, limited visual hierarchy between workflow and admin panels, limited error state specificity, no toast system, no editable draft body, limited evidence card explanation, no accessible progress indicators, limited empty states, no settings/admin routes.

### Backend and Platform

Gaps: missing APIs for notes, saved prospect list management, draft updates, job progress, connector status, feedback, and retention settings. Search lacks richer filtering/sorting/pagination. Queue is represented in DB but not an active worker loop. Observability lacks tracing and domain-level metrics.

### Security and Reliability

Gaps: live DB smoke test not yet run; in-memory rate limits are single-process; no retention cleanup job; no backup/restore runbook; no secret rotation guidance; raw draft/evidence data minimization should be reviewed as usage expands; output sanitization and frontend rendering should stay conservative.

### Developer Experience

Gaps: no committed baseline yet after repo reinitialization; setup docs are adequate but not pilot-grade; e2e tests are absent; seed data could better support demo flows; package checks require Prisma generation; no one-command smoke script; no PR-quality status documentation.

## 4. Beta Feature Prioritization

| Feature                                     | Tier                 | Why                                        | User value                    | Effort      | Dependencies                    | Trade-offs                            | Risk       | Acceptance criteria                                           |
| ------------------------------------------- | -------------------- | ------------------------------------------ | ----------------------------- | ----------- | ------------------------------- | ------------------------------------- | ---------- | ------------------------------------------------------------- |
| Guided onboarding and first-run checklist   | Tier 1               | Removes first-use confusion                | Faster aha moment             | Medium      | Web auth/workspace              | Adds UI state                         | Low        | New user knows next step within 60s                           |
| Product navigation and workflow shell       | Tier 1               | Current one-page layout is dense           | Product feels real            | Medium      | Existing pages/components       | Requires frontend split               | Low        | Core, saved work, compliance/admin areas are clear            |
| Toast/loading/error system                  | Tier 1               | Status string feels prototype-like         | Trust and clarity             | Low/Medium  | Frontend state                  | Small UI infra                        | Low        | Async actions show actionable feedback                        |
| Guided prospect intake with progress        | Tier 1               | Intake is core loop                        | Less friction, more trust     | Medium      | Evidence ingest response/job id | Needs job endpoint for full progress  | Medium     | Analyze flow shows source policy, job/progress, result        |
| Rich evidence cards                         | Tier 1               | Evidence is product moat                   | Trust, explainability         | Low/Medium  | Existing evidence fields        | More UI complexity                    | Low        | Cards show source, freshness, confidence, why matched         |
| Brief detail view                           | Tier 1               | Brief is core artifact                     | Saved, inspectable value      | Medium      | Existing brief API              | Requires navigation                   | Low        | User can open/revisit a brief and inspect evidence            |
| Editable draft composer with copy action    | Tier 1               | Drafts must be usable                      | Real workflow usefulness      | Medium      | Draft API update may be needed  | Autosave scope control                | Medium     | User can edit, save, copy, and see compliance state           |
| Draft autosave/update                       | Tier 1               | Prevents lost work                         | Retention and trust           | Medium      | Draft update endpoint           | Versioning deferred                   | Medium     | Draft changes persist after reload                            |
| Saved prospects/list UX                     | Tier 1               | Users need to organize work                | Makes product sticky          | Medium      | Prospect list repository/schema | API gap                               | Medium     | User can save/remove/list prospects                           |
| Notes and relationship timeline             | Tier 1               | Relationship memory is core Product C seed | Persistence and collaboration | Medium      | Notes schema                    | API/UI needed                         | Low/Medium | User can add notes and view timeline events                   |
| Search filter/sort basics                   | Tier 1               | Search is hard to use at scale             | Faster workflow               | Medium      | Existing search DTOs            | Pagination may be deferred            | Medium     | Filter by source/status and sort by fit/freshness             |
| Compliance UX polish and suppression ledger | Tier 1               | Trust-first differentiator                 | Safer pilot usage             | Medium      | Existing endpoints              | Admin surface grows                   | Low        | User can inspect channel/suppression state clearly            |
| Background job progress endpoint/view       | Tier 1               | Makes ingestion reliable-feeling           | Reduces uncertainty           | Medium      | BackgroundJob table             | Worker still sync-ish                 | Medium     | User sees queued/active/completed/failed state                |
| AI prompt and guardrail hardening           | Tier 1               | Improves output quality/trust              | Better briefs/drafts          | Medium      | AI package tests                | Avoid overprompting                   | Medium     | Prompts mark evidence untrusted and enforce cited claims      |
| Lightweight AI feedback                     | Tier 1               | Starts quality loop                        | Continuous improvement        | Medium      | New API/schema or eval tables   | Needs privacy copy                    | Low/Medium | User can rate brief/draft with reason; stored for evals       |
| AI run metadata visibility                  | Tier 1               | Debugs quality/latency                     | Trust and operator insight    | Low/Medium  | AiRun table                     | Avoid exposing internals to all users | Low        | Admin/dev view shows provider/model/status/latency            |
| Demo seed data upgrade                      | Tier 1               | Demo quality matters                       | Stronger investor/pilot story | Low         | Seed script                     | Must avoid fake PII confusion         | Low        | Seed supports complete guided workflow                        |
| Backup/restore and pilot runbook            | Tier 1               | Pilot readiness                            | Operational confidence        | Low         | Docs                            | No infra overbuild                    | Low        | Docs include backup, restore, smoke, rollback basics          |
| CI/check stability and smoke script         | Tier 1               | Avoids regression                          | Developer confidence          | Medium      | Existing scripts                | Could expose local env assumptions    | Medium     | One command validates DB/API happy path                       |
| Dedicated connector status page             | Tier 2               | Useful but secondary                       | Debug source health           | Medium      | ConnectorRun APIs               | Needs connector accounts              | Medium     | Show provider status/runs after progress basics               |
| Retention settings UI                       | Tier 2               | Governance value                           | Pilot admin trust             | Medium      | RetentionPolicy API             | Admin scope grows                     | Medium     | Owner/admin can view/edit retention days                      |
| Draft version history                       | Tier 2               | Valuable but can follow autosave           | Better review workflow        | Medium      | Version model or audit events   | More schema work                      | Medium     | User can restore previous draft version                       |
| Export to Markdown/PDF/CSV                  | Tier 2               | Useful for sharing                         | Demo/reporting                | Medium      | Brief/draft models              | PDF polish cost                       | Medium     | Export brief/draft manually, no sending                       |
| AI eval developer report                    | Tier 2               | Quality control                            | Engineering confidence        | Medium      | Fixtures/AI eval tables         | Internal only                         | Low        | Eval command reports grounding/tone/prompt-injection fixtures |
| Advanced admin controls                     | Tier 2               | Useful for teams                           | Governance                    | Medium/High | Settings modules                | Enterprise drift                      | Medium     | Only after core UX works                                      |
| Gmail/Outlook add-ins                       | Tier 3               | Valuable but integration-heavy             | Workflow embedding            | High        | OAuth/security/review           | Delays Beta                           | High       | Defer                                                         |
| Browser extension                           | Tier 3 for this Beta | Useful but new surface                     | Faster URL capture            | High        | Extension app/policies          | Adds complexity                       | Medium     | Defer until web loop is polished                              |
| CRM/ATS integrations                        | Tier 3               | Valuable later                             | Real workflow integration     | High        | OAuth/API mapping               | Integration burden                    | High       | Defer                                                         |
| Graph database/path scoring                 | Tier 3               | Long-term defensibility                    | Relationship graph            | High        | Data volume                     | Premature complexity                  | Medium     | Defer                                                         |
| Autonomous sending/bulk sequencing          | Tier 3/excluded      | Violates trust-first direction             | None for this product         | High        | Sending infra                   | Critical abuse risk                   | Critical   | Do not build                                                  |
| Proprietary contact database                | Tier 3/excluded      | Legal/category risk                        | Misaligned                    | High        | Data sourcing                   | Critical privacy risk                 | Critical   | Do not build                                                  |

## 5. Beta Implementation Roadmap

### Milestone 1: Product Foundation Polish

Status: complete in `docs/beta-milestone-1-product-foundation-polish.md`.

Implemented navigation, onboarding, first-run checklist, toast/loading/error states, responsive/accessibility pass, and improved demo storytelling. This milestone makes the app understandable and demo-ready before deeper workflow changes.

Acceptance criteria:

- A new user understands the product and next action within 60 seconds.
- The dashboard distinguishes core workflow from admin/debug areas.
- Empty, loading, and error states are useful and visually polished.
- Demo data supports the complete story without requiring a live API.

### Milestone 2: Core Workflow Improvements

Status: complete in `docs/beta-milestone-2-core-workflow-improvements.md`.

Implemented guided progress, richer prospect organization, saved prospects, notes/timeline, search filters/sorts, editable draft composer, draft save state, and copy actions. Durable persistence remains intentionally deferred.

Acceptance criteria:

- Users can analyze a prospect with less friction.
- Evidence is easy to inspect and trust.
- Users can save, revisit, edit, and copy useful work.
- Search and organization work for a modest Beta dataset.

### Milestone 3: AI Quality and Trust Improvements

Status: complete in `docs/beta-milestone-3-ai-quality-trust.md`.

Implemented trust summaries, broader prompt-injection detection, structured output repair/retry, and duplicate unsupported-claim cleanup inside `packages/ai`. This milestone hardens briefs and drafts without schema changes, live provider calls, or new autonomous behavior.

Acceptance criteria:

- Briefs and drafts are more grounded and concise.
- Unsupported claims are blocked or clearly flagged.
- AI failures degrade gracefully.
- Feedback and AI run metadata support future eval loops.

### Milestone 4: Collaboration, Admin, and Compliance Polish

Status: complete in `docs/beta-milestone-4-collaboration-admin-compliance-polish.md`.

Implemented a focused trust-operations pass: workspace ingestion job status, clearer compliance summaries, suppression ledger refresh/remove actions, and readable audit labels. Retention settings, connector account administration, and active queue controls remain future scope.

Acceptance criteria:

- Teams can inspect important activity and compliance state.
- Suppression and consent status are understandable.
- Admins can see source/job health without digging into logs.

### Milestone 5: Platform Hardening

Status: complete in `docs/beta-milestone-5-platform-hardening.md`.

Implemented repeatable API smoke testing, production dependency audit cleanup, deployment preflight guidance, backup/restore notes, rollback guidance, and incident triage documentation. Distributed rate limiting, tracing, alerting, and automated backup infrastructure remain future production-scaling work.

Acceptance criteria:

- Product is deployable for Beta pilots.
- Operators can debug common failures.
- CI/check commands are documented and reproducible.

### Milestone 6: Beta Readiness Pass

Run regression, e2e user journey, AI eval, security, performance, accessibility, and documentation checks. Produce the final Beta readiness report.

Acceptance criteria:

- No critical user journey is broken.
- Known limitations are documented.
- Future roadmap is clear.
- The product is ready for early adopters, pilots, demos, and initial production deployments.

## 6. Updated Acceptance Criteria

### Product

- First-time user reaches a generated brief or demo equivalent within 3 minutes.
- User can understand evidence, confidence, freshness, and compliance state without reading docs.
- User can save and revisit prospects, briefs, drafts, and notes.
- User remains in control of outreach; no autonomous sending exists.

### AI

- Every generated claim references stored evidence IDs.
- Prompt injection in evidence creates warnings and cannot alter system behavior.
- Invalid model output is rejected or repaired safely.
- Feedback and AI run metadata are captured for quality review.

### Backend

- New APIs preserve tenant/workspace isolation and RBAC.
- Mutations write audit events where relevant.
- Expensive or long-running actions expose progress or clear status.
- Tests cover new business behavior.

### Frontend

- Main flows have loading, error, empty, and success states.
- Core UI is responsive and keyboard-accessible.
- Copy/edit/save actions are explicit and safe.
- Admin/compliance surfaces do not overwhelm the core workflow.

### Platform

- Local checks, DB generation, and smoke testing are documented.
- Backup/restore basics are documented for pilot deployments.
- No known critical security or tenant isolation gaps remain.

## 7. Risk List

| Risk                                             | Severity | Mitigation                                                                |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------- |
| Product drifts into outbound automation          | Critical | Keep human review, no bulk sending/sequencing, trust-first copy           |
| UI overexposes internal implementation           | High     | Move API/session/debug into settings/dev affordances                      |
| AI generates unsupported personalization         | High     | Strengthen claim validation, prompts, eval fixtures, visible warnings     |
| Saved-work scope balloons                        | Medium   | Implement minimal notes/prospect/draft persistence first                  |
| Admin/compliance work delays core UX             | Medium   | Keep admin polish focused on suppression/audit/compliance clarity         |
| Queue/progress work reveals worker is not active | Medium   | Be transparent: expose DB job status first, active worker later if needed |
| Rate limit/metrics are single-process only       | Medium   | Document as Beta limitation; defer distributed infra                      |
| Repo was reinitialized with no commit history    | Medium   | Create a clean baseline commit before major Beta implementation           |
| Live DB/API smoke remains environment-sensitive  | Medium   | Add scripted smoke and clear prerequisites                                |
| Overbuilding integrations                        | High     | Defer Gmail/Outlook/CRM/browser extension until web loop is polished      |

## 8. Assumptions

- The active workspace is `C:\Projects\AI-Relationship`.
- The current codebase after Milestones 0-9 is the working MVP baseline.
- The product remains Product B-first.
- Beta work should prioritize a polished web product over new surfaces.
- A clean initial Git baseline should be created before implementation begins.
- Live provider/API smoke tests may require approvals and local service setup.

## 9. Non-Goals

- No autonomous outreach sending.
- No bulk outbound sequencing.
- No LinkedIn scraping or restricted-platform scraping.
- No proprietary contact database.
- No full CRM replacement.
- No marketplace, mobile app, graph DB migration, or multi-region enterprise platform.
- No broad OAuth integrations until the core web workflow is polished.
- No AI-only compliance, permission, suppression, or identity-merge decisions.

## 10. Recommended Starting Point

Start Beta implementation with Milestone 1: Product Foundation Polish.

Recommended scope for Milestone 1:

1. Introduce a navigable product shell with clear areas: Home, Intake, Saved Work, Compliance, Activity, Settings.
2. Add first-run checklist and demo-mode guidance.
3. Add a small toast/notification system and clearer async state patterns.
4. Improve empty/error/loading states around existing dashboard operations.
5. Improve responsive/accessibility basics without changing the backend contract.
6. Upgrade seed/demo content so the first story feels coherent and trustworthy.
7. Update docs and run web/API checks.

Milestone 1 should avoid database schema changes unless seed data improvements require them. The goal is to make the existing product feel understandable and credible before adding new durable workflow features.
