# Milestone 4: Connector and Evidence Pipeline

## Delivered

- Source connector framework in `packages/connectors`.
- Connector policy result, fetch result, normalized document, and evidence extraction contracts.
- Structured connector errors.
- Safe URL fetching with DNS resolution and SSRF protections.
- GitHub public API connector.
- ORCID public API connector.
- Semantic Scholar public API connector.
- Crossref public API connector.
- Generic public URL/company website connector.
- CSV import connector.
- Manual LinkedIn URL context connector that does not scrape LinkedIn.
- API endpoints for URL analysis, evidence ingestion, entity evidence, and relationship timeline.
- Evidence persistence into `source_snapshots`, `evidence_items`, `background_jobs`, and `audit_events`.
- Worker-side evidence ingestion handler boundary using the shared queue payload contract.
- Connector development harness with sanitized recorded fixtures, explicit scope validation, fixed-clock deterministic replay, and fail-closed HTTP/DNS adapters.

## Security Notes

Safe URL fetching blocks unsupported protocols, URL credentials, unsafe DNS resolutions, localhost, private IPv4 ranges, link-local addresses, carrier-grade NAT ranges, IPv6 loopback/link-local/unique-local addresses, metadata-service IPs, and redirects.

LinkedIn support is intentionally limited to user-provided manual context. No LinkedIn page fetch or scraping path exists.

## Verification

Completed package-level checks for:

- Connector typecheck, lint, and tests.
- API typecheck, lint, and tests.
- Worker typecheck, lint, build, and tests.
- Harness fixture validation and three-pass deterministic replay for GitHub and CSV connectors.

Harness usage and fixture authoring rules are documented in `docs/connector-development-harness.md`.

The DB-backed API smoke test for evidence ingestion was not run in this turn because the environment rejected the required localhost server approval after the usage limit was reached.
