# Security regression corpus

The security regression runner executes a labeled, deterministic corpus against
the same enforcement functions used by the application. It performs no network
requests, starts no services, and does not require a database.

## Run the gate

```powershell
corepack pnpm security:regression
```

The command prints a JSON summary with category counts and failing case details.
It exits nonzero if any expectation regresses. CI runs the same command.

Use a reviewed alternate corpus when validating a proposed fixture change:

```powershell
corepack pnpm security:regression --corpus path/to/corpus.json
```

## Covered boundaries

The default corpus contains 29 cases:

| Category         | Cases | Production boundary                                                       |
| ---------------- | ----: | ------------------------------------------------------------------------- |
| SSRF             |     8 | Connector URL parsing, credential checks, and deterministic DNS/IP policy |
| Prompt injection |     6 | AI evidence prompt-injection detector                                     |
| XSS              |     3 | React text rendering and HTML escaping                                    |
| Authorization    |     8 | Workspace role/action authorization matrix                                |
| Tenant isolation |     4 | Connector request tenant/workspace scope equality validation              |

SSRF cases include public HTTPS, IPv4 and IPv6 loopback, RFC 1918, link-local
metadata, mixed public/private DNS answers, and URL credentials. The resolver is
recorded in each fixture, so results never depend on live DNS.

Prompt-injection cases include instruction override, hidden prompt extraction,
secret exfiltration, jailbreak language, and a benign control. XSS payloads are
passed as untrusted React text and must appear encoded without creating raw
script, image, or SVG elements.

Authorization cases pin both allowed and denied role/action decisions. Tenant
isolation cases require the request tenant and workspace to match the declared
fixture scope exactly.

## Add or change a case

Edit `packages/testing/src/security-regression/corpus.json`. Every entry needs a
unique `id`, and the corpus must retain at least one case in all five categories.
Run:

```powershell
corepack pnpm exec vitest run `
  packages/testing/src/security-regression/index.spec.ts `
  packages/testing/src/security-regression/cli.spec.ts
corepack pnpm security:regression
```

Review expectation changes as security-policy changes. Do not flip an expected
result merely to make a failure pass; confirm the relevant application boundary
and add a benign control when expanding a detector.

## Scope limits

This deterministic gate is designed for fast pull-request regression coverage.
It does not replace:

- deployed-environment penetration testing;
- browser Content Security Policy validation;
- dependency or container vulnerability scanning;
- database-backed tenant-isolation integration tests;
- manual review of newly introduced HTML sinks or authorization boundaries.

Those activities remain release and operational security checks.
