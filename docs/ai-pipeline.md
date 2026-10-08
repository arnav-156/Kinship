# AI Pipeline

Milestone 1 defines the model gateway contract in `packages/ai`.

Milestone 5 adds the first RAG foundation without introducing model calls:

- Retrieval starts with tenant/workspace-scoped evidence from `/v1/search/evidence`.
- `packages/search` ranks evidence with explainable lexical, metadata, freshness, confidence, and future semantic/vector slots.
- Retrieval-context cards include evidence IDs, summaries, source type, confidence, and rank score so later generation can cite stored evidence.
- Entity resolution is deterministic/probabilistic. Strong identifiers such as email hash, ORCID, GitHub login, profile URL, and domain can produce matches; name-only similarity remains review/new-entity territory.
- LLM output may summarize, draft, or explain evidence in future milestones, but it must not be the sole basis for identity resolution or relationship claims.

Milestone 6 adds the first generation pipeline:

- `packages/ai` exposes a provider-agnostic model gateway with deterministic mock and OpenAI-compatible adapters.
- Prompt rendering is versioned with `relationship-brief-v1`.
- Structured outputs are runtime-validated with Zod schemas for relationship briefs, outreach angles, evidence claims, and draft messages.
- Relationship briefs are generated only from stored evidence cards and persisted with cited evidence, warnings, fit/confidence scores, and freshness metadata.
- Draft messages are generated from persisted briefs, cite evidence IDs, and are blocked when validation finds unsupported claims.
- Prompt-injection detection scans retrieved evidence and records warnings instead of following instructions embedded in evidence.
- API generation writes `ai_runs` and audit events for observability.
- The offline/live golden-set runner measures groundedness, unsupported claims, citation precision/recall, latency, token estimates, and cost assumptions across synthetic brief and draft cases.
- The prompt registry owns task-specific active/candidate versions and provides deterministic structural comparison, content digests, and risk gates.

The runner is documented in `docs/ai-golden-set-runner.md`; prompt governance is documented in `docs/prompt-registry-version-comparison.md`. Future milestones will add richer provider retries/fallbacks, deterministic compliance pre/post checks, eval dashboards, and production cost controls.
