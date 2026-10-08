# Identity-Resolution Review Utility

The identity-resolution review utility turns the existing deterministic/probabilistic resolver into an operator-facing, offline review workflow. It explains every candidate and records human merge/split decisions in a tenant/workspace-scoped, hash-chained audit ledger. It never merges identities automatically.

## Review a Candidate Set

A review case contains a synthetic or exported subject input, candidate entities, and explicit tenant/workspace scope. Inspect the committed example:

```bash
corepack pnpm identity:review review packages/search/fixtures/identity-review-case.json
corepack pnpm identity:review scenario packages/search/fixtures/identity-review-case.json
```

Each candidate includes its decision (`match`, `review`, or `new_entity`), combined score, categorized signals, cautions, and `requiresHumanDecision: true`. Deterministic identifiers, corroborating name/location/employer signals, and advisory LLM suggestions are distinguished. LLM suggestions cannot authorize a merge.

## Create and Operate a Ledger

Commands refuse to overwrite an existing output file. This preserves prior ledgers and makes each operation an explicit new artifact.

```bash
corepack pnpm identity:review init case.json --output ledger-0.json
corepack pnpm identity:review merge case.json ledger-0.json --candidate entity_123 --actor user_456 --reason "Reviewed identifiers" --at 2026-07-17T10:00:00.000Z --output ledger-1.json
corepack pnpm identity:review split ledger-1.json --entity imported_entity --actor user_789 --reason "Conflicting evidence" --at 2026-07-17T10:15:00.000Z --output ledger-2.json
corepack pnpm identity:review verify ledger-2.json
```

A merge is allowed only for a candidate scored as `match` or `review`; `new_entity` recommendations are rejected. Both entities must be present in the ledger, and the review and ledger scopes must match exactly.

## Audit Guarantees

Every merge/split event records the actor, UTC timestamp, reason, affected entities, before/after canonical assignments, and the reviewed candidate explanation where applicable. Events are sequence-numbered and chained with SHA-256 hashes. `verify` replays the ledger from its initial one-entity-per-identity state and rejects modified event content, broken hash links, invalid assignments, or final state drift.

This utility does not mutate production database rows or replace the future durable identity-review API/UI. It provides a safe review/export/rehearsal boundary for operators and test fixtures.
