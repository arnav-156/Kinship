# Limitations

- The database schema exists, and core auth/workspace/evidence/search/brief/compliance use cases are exposed through API services.
- Auth, workspace RBAC, and audit foundations exist, but OAuth/OIDC/SAML/SCIM are still extension points only.
- Evidence ingestion, relationship-brief generation, draft generation, manual and explicitly configured recurring connector synchronization, and scheduled evidence retention now run through dedicated PostgreSQL-leasing workers with retry, dead-letter, idempotency, replay, and restart recovery.
- Search, RAG foundations, mock/default AI generation, and compliance/suppression enforcement exist, but real-provider use still requires configured credentials and live smoke testing.
- The frontend MVP dashboard exists and can call the API, but it is still a single-screen operator workflow rather than a full multi-user product shell.
- API hardening now includes request IDs, stable error envelopes, CORS configuration, in-memory rate limiting, readiness, metrics, and shutdown hooks. It does not yet include distributed rate limiting, tracing, central log drains, alerting, or production backup/restore automation.
- The DB-backed localhost API smoke test still depends on approvals and a running local service stack.
