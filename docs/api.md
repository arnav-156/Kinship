# API

## Foundation

Milestone 1 exposes foundation health endpoints:

- `GET /health`
- `GET /ready`
- `GET /metrics`

## Auth

- `POST /v1/auth/register`: creates a tenant, first workspace, owner membership, and JWT access token.
- `POST /v1/auth/login`: verifies password and returns a JWT access token. `tenantSlug` may be supplied when an email exists in multiple tenants.
- `POST /v1/auth/logout`: records a logout audit event. Requires auth.
- `GET /v1/auth/me`: returns the current user and workspace memberships without password hashes. Requires auth.

## Workspaces

- `POST /v1/workspaces`: creates a workspace in the current tenant and grants the caller owner membership.
- `GET /v1/workspaces`: lists only workspaces where the caller has membership.
- `GET /v1/workspaces/:id`: requires workspace read permission.
- `PATCH /v1/workspaces/:id`: requires owner or admin role.

## Workspace Administration

- `POST /v1/workspaces/:workspaceId/admin/connectors/:connectorId/sync`: queues a durable synchronization for an active, supported connector account and immediately returns a background job. The body requires `sourceIdentifier`; optional `subjectName` and tenant/workspace-scoped `entityId` provide context. An optional `Idempotency-Key` header (8-200 characters) deduplicates repeated requests within the tenant and connector-sync queue. Poll `GET /v1/evidence/jobs/:jobId`; completed progress exposes the persisted `connectorRunId`, `entityId`, `evidenceItemIds`, and `sourceSnapshotId`.
- `PATCH /v1/workspaces/:workspaceId/admin/connectors/:connectorId`: can opt a supported connector into recurring refresh with `refreshEnabled`, `refreshIntervalMinutes` (5-43,200), `refreshSourceIdentifier`, and optional `refreshEntityId`/`refreshSubjectName`. Enabling requires a source identifier and interval; setting `refreshEnabled` to `false` disables future scheduled runs without deleting prior run history.

Connector synchronization and schedule changes require owner/admin workspace access. Scheduled refresh is opt-in, uses the same registered public-research and user-URL providers as manual sync, and stores no provider token in schedule metadata. First-party OAuth providers remain outside this endpoint until their live connector implementations and scopes exist.

## Prospect Lists

- `POST /v1/workspaces/:workspaceId/prospect-lists`: creates a durable prospect list.
- `GET /v1/workspaces/:workspaceId/prospect-lists`: lists active lists with member counts.
- `GET /v1/workspaces/:workspaceId/prospect-lists/:listId`: returns a list and its scoped entity members.
- `PATCH /v1/workspaces/:workspaceId/prospect-lists/:listId`: updates list name or description.
- `DELETE /v1/workspaces/:workspaceId/prospect-lists/:listId`: archives a list.
- `POST /v1/workspaces/:workspaceId/prospect-lists/:listId/members`: adds or updates an entity member.
- `PATCH /v1/workspaces/:workspaceId/prospect-lists/:listId/members/:memberId`: updates stage, scores, or notes.
- `DELETE /v1/workspaces/:workspaceId/prospect-lists/:listId/members/:memberId`: removes a member.
- `POST /v1/workspaces/:workspaceId/prospect-lists/:listId/import`: validates and atomically imports up to 5,000 CSV rows.

Owners, admins, managers, and members can curate lists. Viewers and compliance reviewers have read-only access. CSV imports reuse entities only through deterministic identifiers such as scoped entity ID, email hash, ORCID, GitHub login, LinkedIn URL, or organization domain.

## Relationship Notes

- `GET /v1/workspaces/:workspaceId/entities/:entityId/notes`: lists authored notes newest first.
- `POST /v1/workspaces/:workspaceId/entities/:entityId/notes`: creates a note attributed to the authenticated user.
- `PATCH /v1/workspaces/:workspaceId/entities/:entityId/notes/:noteId`: updates a note. Authors and workspace managers may edit.
- `DELETE /v1/workspaces/:workspaceId/entities/:entityId/notes/:noteId`: deletes a note. Authors and workspace managers may delete.
- `GET /v1/entities/:id/relationship-timeline`: returns a cursor-paginated, newest-first activity feed across evidence, notes, briefs, draft revisions, policy decisions, and outcomes. Supports `limit`, `cursor`, and comma-separated `types` filters.
- `POST /v1/entities/:id/relationship-outcomes`: records an immutable, authored relationship outcome such as a reply, meeting, introduction, follow-up, or opportunity.

Members, managers, admins, and owners may create notes. Viewers and compliance reviewers have read-only access. Every mutation records a workspace audit event.

## Audit

- `GET /v1/audit-events`: requires an audit-capable workspace role.
- `GET /v1/audit-events?workspaceId=...`: requires audit permission for that workspace.

## Analysis and Evidence

- `POST /v1/analyze-url`: runs an allowed URL connector and stores evidence for the current tenant/workspace.
- `POST /v1/evidence/ingest`: ingests evidence through a registered source connector.
- `GET /v1/entities/:id/evidence`: returns tenant/workspace-scoped evidence for an entity.
- `GET /v1/entities/:id/relationship-timeline`: returns the unified relationship activity feed. General audit-log permission is not required; only curated entity-linked policy and outcome events are exposed.
- `POST /v1/evidence/jobs`: queues evidence ingestion and immediately returns a persisted job with stage and percent progress.
- `GET /v1/evidence/jobs?workspaceId=...`: returns recent tenant/workspace-scoped jobs across supported job families and recovers stale queued/active work as retryable interrupted failures.
- `GET /v1/evidence/jobs/:jobId`: returns one tenant-scoped job without exposing its stored payload.
- `POST /v1/evidence/jobs/:jobId/retry`: replays failed or dead-lettered work with bounded attempts and audit history.
- `POST /v1/evidence/jobs/:jobId/cancel`: cancels only work that is still queued; active work returns a conflict.

## Search

- `POST /v1/search/evidence`: searches evidence summaries, source metadata, and entity names inside the caller's tenant/workspace. Returns ranked evidence plus compact retrieval-context cards for later generation.
- `POST /v1/search/prospects`: groups ranked evidence by entity and returns prospect candidates with fit scores and supporting evidence.
- `POST /v1/search/similar-people`: resolves likely person matches using deterministic identity signals such as email hash, ORCID, GitHub login, profile URL, name, and location. LLM suggestions are not accepted as identity matches.

## Relationship Briefs and Drafts

- `POST /v1/relationship-briefs`: queues evidence-backed relationship-brief generation for an existing subject entity and immediately returns a durable background job. Requires workspace access and at least one stored evidence item. An optional `Idempotency-Key` header (8-200 characters) deduplicates repeated requests within the tenant and brief-generation queue. Poll the returned job through `GET /v1/evidence/jobs/:jobId`; a completed job exposes the created `briefId` in its progress object.
- `GET /v1/relationship-briefs/:id`: returns a tenant-scoped brief with its subject entity and draft messages.
- `POST /v1/relationship-briefs/:id/drafts`: queues human-review outreach-draft generation and immediately returns a durable background job. Supported variants are `concise`, `warm_professional`, and `evidence_heavy`. An optional `Idempotency-Key` header (8-200 characters) deduplicates repeated requests within the tenant and draft-generation queue. Poll the job through `GET /v1/evidence/jobs/:jobId`; a completed job exposes the created `draftId` in its progress object.
- `GET /v1/drafts/:id`: returns a tenant-scoped draft and its relationship context.
- `PATCH /v1/drafts/:id`: autosaves or explicitly updates a draft using `expectedUpdatedAt` for optimistic concurrency; every successful update creates an immutable version.
- `POST /v1/drafts/:id/rewrite`: rewrites a draft from its grounded brief and optional user direction, then reruns compliance checks.
- `POST /v1/drafts/:id/validate`: deterministically revalidates evidence references and compliance while preserving human review.
- `GET /v1/drafts/:id/versions`: lists immutable draft snapshots newest-first with reason and author.
- `POST /v1/drafts/:id/versions/:versionId/restore`: restores a prior snapshot as a new version using optimistic concurrency.

## Compliance and Suppression

- `POST /v1/compliance/contact-channels`: creates or updates a hashed contact channel and consent status. Requires owner/admin workspace access.
- `GET /v1/compliance/contact-channels?workspaceId=...&entityId=...`: lists hashed contact channels for an entity.
- `POST /v1/compliance/suppressions`: creates a workspace or tenant-wide suppression entry from a hashed contact value. Requires owner/admin access.
- `GET /v1/compliance/suppressions?workspaceId=...`: lists active suppression entries.
- `DELETE /v1/compliance/suppressions/:id`: soft-deletes a suppression entry.
- `POST /v1/compliance/evaluate`: returns deterministic compliance status for an entity/channel pair.

Future REST APIs continue under `/v1` and use typed DTOs, request validation, tenant/workspace access checks, structured errors, and audit logging.

## User Data And Privacy

- `GET /v1/users/me/data-requests`: lists the caller's recent export and deletion request status without payload contents.
- `POST /v1/users/me/data-exports`: prepares a tenant-scoped JSON export that is downloadable for 24 hours.
- `GET /v1/users/me/data-exports/:requestId`: returns one caller-owned export status.
- `GET /v1/users/me/data-exports/:requestId/download`: downloads the completed export with attachment and no-store headers.
- `POST /v1/users/me/deletion`: verifies the current password and confirmation phrase, protects shared-workspace ownership, anonymizes the account, and revokes existing tokens.
