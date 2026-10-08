# Milestone 6: AI Pipeline

Milestone 6 adds evidence-grounded generation without making real provider credentials mandatory.

## Implemented

- Provider-agnostic `@relationship/ai` model gateway.
- Deterministic mock provider for local development and tests.
- OpenAI-compatible provider for configured deployments.
- Structured Zod schemas for relationship briefs, outreach angles, evidence claims, and draft messages.
- Versioned prompt rendering with `relationship-brief-v1`.
- Prompt-injection detection over retrieved evidence summaries.
- Unsupported-claim validation based on cited evidence IDs.
- AI golden-set CLI with independently labeled facts, deterministic mock/live provider modes, quality gates, latency percentiles, and versioned cost assumptions.
- Source-controlled prompt registry with distinct brief/draft versions, active/candidate lifecycle, stable content digests, and structural risk comparison.
- API `RelationshipBriefsModule` with:
  - `POST /v1/relationship-briefs`
  - `GET /v1/relationship-briefs/:id`
  - `POST /v1/relationship-briefs/:id/drafts`
- Persistence to `relationship_briefs`, `draft_messages`, `ai_runs`, and `audit_events`.

## Guardrails

- Brief generation requires a tenant/workspace-scoped entity and at least one stored evidence item.
- Generated briefs and drafts must preserve evidence IDs.
- Drafts are marked `blocked` when validation finds claims citing evidence outside the retrieved set.
- Evidence is treated as untrusted content; prompt-like instructions inside evidence become warnings, not instructions.
- Identity resolution remains outside the LLM pipeline.

## Configuration

Default local behavior uses the deterministic mock provider:

```env
AI_PROVIDER=mock
```

OpenAI-compatible deployments can configure:

```env
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Golden-set usage, label rules, metrics, thresholds, and live-provider safety are documented in `docs/ai-golden-set-runner.md`.
Prompt registry ownership, comparison commands, risk gates, and promotion workflow are documented in `docs/prompt-registry-version-comparison.md`.

## Verification

Static verification completed:

- `corepack pnpm --filter @relationship/ai typecheck`
- `corepack pnpm --filter @relationship/ai build`
- `corepack pnpm --filter @relationship/ai lint`
- `corepack pnpm --filter @relationship/api typecheck`
- `corepack pnpm --filter @relationship/api build`
- `corepack pnpm --filter @relationship/api lint`

Vitest tests are present for the AI package and API relationship-brief service, but the managed sandbox blocked Vitest startup with `spawn EPERM` when Vite/esbuild attempted to start a helper process. Run those tests from a normal local shell or with process-spawn approval.
