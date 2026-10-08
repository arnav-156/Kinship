# Milestone 3: Auth, Tenant, Authorization, Audit

## Delivered

- Local MVP registration and login.
- Password hashing.
- JWT access tokens.
- Protected current-user and logout endpoints.
- Tenant-aware request principal in `JwtAuthGuard`.
- Workspace creation, listing, detail, and update endpoints.
- Workspace roles and RBAC helpers in `packages/policy`.
- Audit service and audit-event listing endpoint.
- Audit events for registration, login, logout, workspace creation, and workspace updates.

## Security Notes

- `GET /v1/auth/me` does not select or return password hashes.
- Login supports optional `tenantSlug` to avoid ambiguous email-only login across tenants.
- Workspace listing is constrained to the caller's tenant and memberships.
- Workspace updates require owner/admin.
- Audit reading requires owner/admin/compliance reviewer.

## Verification

Tests cover:

- JWT issue/verify and invalid token rejection.
- Current-user query does not select password hashes.
- Guard rejects missing bearer tokens.
- Workspace list tenant/member scoping.
- Viewer update denial.
- Policy RBAC helper behavior.
