# Beta Milestone 9: User Data Lifecycle

## Outcome

Authenticated users can prepare a portable JSON snapshot of their account data and permanently delete their account from Settings. Export and deletion are durable, tenant-scoped requests with explicit status, audit evidence, and recovery-safe failure states.

## Export Behavior

- Exports contain the account profile, workspace memberships, directly authored relationship notes and draft versions, user-created prospect lists and suppressions, and actor-scoped audit activity.
- Password hashes, credentials, access tokens, and provider secrets are never included.
- Completed snapshots are available for 24 hours, use attachment and no-store response headers, and are removed automatically after expiry.
- Request history exposes processing, completed, failed, expired, and download-available states without returning the export payload.

## Deletion Behavior

- Deletion requires the current password and the exact `DELETE MY ACCOUNT` confirmation phrase.
- The request is rejected when a shared workspace would lose its only owner; ownership must be transferred first.
- Solo workspaces are deactivated, memberships and authored relationship notes are removed, and direct attribution on draft versions, prospect lists, suppressions, jobs, and audit events is scrubbed.
- The user profile is anonymized and disabled in one transaction. The existing authentication guard immediately rejects all previously issued tokens.
- Compliance audit evidence is retained without the deleted user's profile or event metadata.

## API

- `GET /v1/users/me/data-requests`
- `POST /v1/users/me/data-exports`
- `GET /v1/users/me/data-exports/:requestId`
- `GET /v1/users/me/data-exports/:requestId/download`
- `POST /v1/users/me/deletion`

## Validation

- API unit coverage verifies export scoping, credential exclusion, wrong-password rejection, owner continuity, attribution scrubbing, and solo-workspace deactivation.
- An isolated PostgreSQL account completed export, status, and attachment download with no password material present.
- Wrong-password deletion returned HTTP 401; confirmed deletion completed, deactivated the solo workspace, and caused the old token to return HTTP 401.
- All temporary privacy-smoke accounts were deleted, leaving zero active fixtures.
