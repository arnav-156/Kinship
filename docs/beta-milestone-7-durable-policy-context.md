# Beta Milestone 7: Durable Policy Context

## Outcome

The Trust center now captures the policy inputs required before relationship outreach: processing purpose, consent, recipient type, recipient region, and channel. These values persist with the hashed contact channel and are reused by compliance checks, draft generation, draft rewrites, and draft validation.

## Product Behavior

- Saving a contact channel requires purpose, consent, recipient type, and recipient region.
- Raw email addresses and handles remain API-boundary values; only the channel-scoped hash is persisted.
- Selecting a relationship or channel reloads its saved policy context in the Trust center.
- Saving policy context immediately runs the deterministic policy evaluation.
- Outreach review warns when recipient type or region is unknown and when a personal recipient needs review.
- Relationship-intelligence processing does not receive outreach-only warnings or opt-out footer guidance.
- Suppression and withdrawn consent remain deterministic blocks.

## Data And Audit

Migration `20260714113000_contact_channel_policy_context` adds `purpose`, `recipient_type`, and `recipient_region` to `contact_channels`, with conservative defaults for existing rows. Contact-channel audit events record these fields, and each compliance decision records the full policy input snapshot used for the result.

## Validation

- Policy tests cover complete, incomplete, and non-outreach context.
- API tests prove draft checks consume persisted context.
- Prisma schema validation and client generation pass.
- API and web tests and type checks pass.
