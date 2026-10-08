# Connector Development Harness

The connector harness validates sanitized recorded fixtures and replays connector policy, fetch, normalization, and evidence extraction without live network access.

## Commands

Run all committed fixtures from the repository root:

```bash
corepack pnpm connectors:harness validate
corepack pnpm connectors:harness replay --repeat 3
```

Calculate a digest while authoring or deliberately updating a fixture:

```bash
corepack pnpm connectors:harness digest packages/connectors/fixtures/github-repository.json
```

Copy that digest into `expected.replayDigest`, inspect the snapshot-changing code or fixture change, and then run `replay`. A digest change is a review boundary; it must never be updated only to silence a failure.

## Fixture Contract

Each JSON fixture declares:

- `sourceType` and the connector request.
- Exact tenant and workspace scope.
- The only allowed request context keys and network hosts.
- A fixed UTC `recordedAt` clock.
- Recorded public DNS addresses and, for network connectors, one exact HTTP request/response.
- Expected policy status, evidence count, and stable replay digest.

The loader rejects tenant/workspace drift, undeclared context, out-of-scope hosts, missing DNS recordings, private or invalid recorded addresses, URL credentials, sensitive credential fields, unsupported connectors, and malformed expectations. Replay fails on any unrecorded DNS lookup or HTTP request, so it cannot silently fall through to the live network.

## Recording Rules

Fixtures are source-controlled test data, not traffic dumps. Record the smallest response needed to exercise the connector and remove personal data, authentication headers, cookies, tokens, API keys, passwords, and secrets before saving it. Use synthetic tenant/workspace identifiers. Keep recorded response bodies stable and small.

When adding a connector, add at least one allowed fixture and focused rejected-scope tests. OAuth failure-state recordings belong in this harness only after token values and identifying account data have been removed.
