# Milestone 7: Compliance and Suppression

Milestone 7 adds deterministic compliance controls for human-review outreach.

## Implemented

- Compliance policy engine in `@relationship/policy`.
- Workspace and tenant-wide suppression entries.
- Contact-channel records with channel-scoped SHA-256 value hashes.
- Consent status tracking for contact channels.
- API `ComplianceModule` with:
  - `POST /v1/compliance/contact-channels`
  - `GET /v1/compliance/contact-channels`
  - `POST /v1/compliance/suppressions`
  - `GET /v1/compliance/suppressions`
  - `DELETE /v1/compliance/suppressions/:id`
  - `POST /v1/compliance/evaluate`
- Audit events for contact-channel updates, suppression changes, and compliance evaluations.
- Draft-generation enforcement: suppressed or withdrawn-consent channels are persisted as blocked drafts.

## Policy Behavior

- Suppression match: `blocked`.
- Withdrawn consent: `blocked`.
- Unknown email consent: `warn`, review required.
- Phone outreach: `warn`, review required.
- Confirmed email with no suppression: `allowed`, with opt-out footer guidance.
- LinkedIn context reused for another channel: `warn`.

The policy engine is deterministic. LLMs do not make suppression, consent, or compliance decisions.

## Data Handling

Raw contact values are accepted only at API boundaries and immediately converted to hashes before persistence. The database stores `value_hash`, channel type, consent status, label, and audit metadata, not raw email addresses or handles.

## Verification

Static verification completed:

- `corepack pnpm --filter @relationship/policy typecheck`
- `corepack pnpm --filter @relationship/policy build`
- `corepack pnpm --filter @relationship/policy lint`
- `corepack pnpm --filter @relationship/api typecheck`
- `corepack pnpm --filter @relationship/api build`
- `corepack pnpm --filter @relationship/api lint`
- `corepack pnpm format`

Vitest tests are present for the policy engine and API compliance service, but the managed sandbox blocks Vitest startup with `spawn EPERM` when Vite/esbuild starts its helper process. Run them from a normal local shell or with process-spawn approval.
