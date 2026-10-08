# Security

Milestone 1 includes:

- Typed environment validation.
- Helmet security headers on the API.
- CORS configured for local development.
- No committed secrets.
- Structured logging utilities that avoid special handling for secrets.

Milestone 3 adds:

- JWT access-token auth for local MVP.
- Password hashing with bcryptjs.
- Registration/login/logout/current-user endpoints.
- Tenant-aware request context in `JwtAuthGuard`.
- Workspace membership roles.
- RBAC workspace checks for read/manage/audit actions.
- Audit events for registration, login, logout, and workspace changes.

`GET /v1/auth/me` intentionally selects safe user fields and does not return password hashes.

Milestone 4 adds:

- Safe URL fetching with SSRF protections.
- Blocking for localhost, private IP ranges, link-local IPs, metadata-service IPs, unsupported protocols, credentials in URLs, and redirects.
- Registered allowed connectors only.
- Manual LinkedIn URL handling as user-provided context only; the system does not fetch or scrape LinkedIn.
- Evidence ingestion audit events and failed background job records.

Milestone 7 adds:

- Deterministic compliance decisions in `packages/policy`.
- Contact values stored as channel-scoped SHA-256 hashes rather than raw addresses/handles.
- Workspace and tenant-wide suppression entries.
- Withdrawn consent and suppression entries block generated drafts.
- Unknown email consent and phone outreach require review warnings.
- Audit events for contact-channel changes, suppression changes, and compliance evaluations.

The Beta policy-context milestone adds:

- Durable processing purpose, recipient type, and recipient region on hashed contact channels.
- Deterministic outreach warnings when recipient type or region is unknown.
- Outreach-only policy rules separated from relationship-intelligence processing rules.
- Policy input snapshots embedded in compliance audit metadata and draft validation results.

Milestone 9 adds:

- Request correlation through `x-request-id`.
- Stable JSON error responses with production-safe internal error messages.
- Configurable CORS allow-listing.
- Configurable in-memory request rate limiting.
- DB-backed readiness reporting for orchestration health checks.

## Beta Retention Lifecycle

- Retention policy management is restricted to workspace owners and administrators.
- Evidence and source-snapshot expiration is derived from retrieval time and recalculated when policy changes.
- Disabling the policy clears scheduled expiration rather than deleting data.
- Cleanup deletes tenant/workspace-scoped expired evidence before unreferenced source snapshots.
- Manual and scheduled executions record background-job results and audit events without preserving deleted content.
- The UI requires a second confirmation before manual destructive cleanup.

## Beta User Data Lifecycle

- Export and deletion routes require an active JWT and are scoped to the authenticated tenant and user.
- Export snapshots omit password hashes, tokens, credentials, and provider secrets, expire after 24 hours, and are served with attachment and `private, no-store` headers.
- Account deletion requires current-password verification and the exact `DELETE MY ACCOUNT` phrase.
- Deletion is blocked if a shared workspace would lose its only owner.
- Profile PII is anonymized, authored notes are removed, and direct user attribution is scrubbed transactionally while de-identified audit evidence is retained.
- Disabling and soft-deleting the user causes the authentication guard to revoke every outstanding access token immediately.
