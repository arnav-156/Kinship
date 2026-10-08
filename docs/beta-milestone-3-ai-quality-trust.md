# Beta Milestone 3: AI Quality and Trust Improvements

## Status

Complete as of 2026-07-06.

Milestone 3 focused on hardening the AI trust layer without adding database schema changes, live provider calls, or new product surfaces. The work stays in `packages/ai` so API consumers keep the same contracts while receiving stronger deterministic validation and better failure handling.

## Delivered Scope

### Trust Summary Helper

Added `summarizeAiTrust` with a small explicit trust model:

- `safe`: no warnings, no unsupported claims, no blocked reasons, and sufficient confidence.
- `review`: prompt-injection warnings, low confidence, or non-blocking warnings require human review.
- `blocked`: unsupported claims or blocked reasons prevent safe use.

The helper deduplicates warnings, unsupported claims, blocked reasons, and prompt-injection evidence IDs so downstream UI/API surfaces can show concise trust state.

### Prompt-Injection Coverage

Expanded deterministic prompt-injection detection for broader phrasing including disregard/override instructions, hidden developer instruction requests, ignore-safety language, jailbreak language, and requests to print hidden instructions. Detected evidence still creates warnings instead of letting untrusted evidence alter system behavior.

### Structured Output Repair and Retry

Hardened `OpenAiCompatibleGateway.generateStructured` so provider responses are parsed in this order:

1. Direct JSON parsing.
2. Extracted JSON parsing, including fenced JSON blocks.
3. One repair retry with a JSON-only repair instruction and `temperature: 0`.
4. A clear structured-output error if both attempts fail validation.

This improves graceful degradation for malformed provider output while preserving Zod schema validation as the source of truth.

### Unsupported-Claim Deduplication

Draft validation now deduplicates unsupported claims that appear both in model output and deterministic citation coverage checks. Blocked output remains blocked, but the explanation is cleaner for users and future eval tooling.

## Changed Files

- `packages/ai/src/index.ts`
- `packages/ai/src/index.spec.ts`
- `docs/superpowers/plans/2026-07-06-beta-milestone-3-ai-quality-trust.md`
- `docs/beta-discovery-prioritization.md`

## Verification

Planned verification commands:

```powershell
corepack pnpm --filter @relationship/ai test
corepack pnpm --filter @relationship/api test
corepack pnpm --filter @relationship/web test
corepack pnpm --filter @relationship/web typecheck
corepack pnpm --filter @relationship/web lint
corepack pnpm format
```

Focused AI package verification includes tests for:

- broader prompt-injection detection,
- safe/review/blocked trust summaries,
- fenced JSON structured-output repair,
- invalid JSON retry behavior,
- duplicate unsupported-claim cleanup.

## Remaining Limitations

- Unsupported-claim validation is still citation and heuristic based; it does not yet perform semantic entailment between claims and evidence.
- Prompt-injection detection is deterministic pattern matching; future eval fixtures should measure recall against a wider attack set.
- AI run cost/token visibility remains a future product/admin surface.
- No live provider calls are required for this milestone; provider behavior is covered with mocked gateway tests.
- The developer-facing AI eval report remains future Milestone 4/5 scope unless pulled forward.
