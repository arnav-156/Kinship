# AI Golden-Set Runner

The AI golden-set runner measures the existing relationship-brief and draft-message pipelines against synthetic, independently labeled evidence. It supports the deterministic mock gateway for repeatable CI and the configured OpenAI-compatible gateway for explicitly approved live checks.

The runner never reads production workspaces or stores provider credentials in fixtures or reports.

## Validate and run the baseline

Validate schema, case IDs, evidence IDs, required citations, and complete supported-fact labels:

```bash
corepack pnpm ai:golden validate packages/ai/fixtures/ai-golden-set.json
```

Run the deterministic CI baseline:

```bash
corepack pnpm ai:golden run packages/ai/fixtures/ai-golden-set.json --provider mock
```

Write a report without overwriting an existing artifact:

```bash
corepack pnpm ai:golden run packages/ai/fixtures/ai-golden-set.json --provider mock --output artifacts/ai-golden-report.json
```

A quality or operational threshold failure returns exit code `2`. Invalid input, missing credentials, provider setup errors, or command errors return exit code `1`. Individual provider failures are recorded as failed cases and penalize the aggregate metrics instead of aborting the remaining suite.

## Metrics

Every generated evidence claim is checked against the case's independently labeled supported facts.

- `groundedness`: generated claims with valid citations, no forbidden phrases, no pipeline unsupported-claim finding, and sufficient labeled keyword coverage, divided by all claims.
- `unsupportedClaimRate`: claims that fail any grounding check, divided by all claims.
- `citationPrecision`: valid evidence-ID references divided by all cited evidence-ID references.
- `citationRecall`: required evidence IDs cited by the output divided by required evidence IDs in the labels.
- `averageLatencyMs`, `p50LatencyMs`, and `p95LatencyMs`: wall-clock generation latency over cases.
- `totalInputTokens` and `totalOutputTokens`: deterministic estimates based on serialized prompt and schema-validated output length.
- `totalEstimatedCostUsd` and `averageEstimatedCostUsd`: token estimates multiplied by the suite's explicit pricing assumption.

Cost values are evaluation estimates, not provider invoices. Pricing is versioned inside the golden set through `assumptionId` and per-million-token input/output rates. Review and update the assumption before using cost thresholds for a live model or procurement decision.

## Label contract

A schema-version `1` suite contains:

- A stable suite ID, description, claim-keyword threshold, pricing assumption, quality thresholds, and one or more cases.
- Brief or draft inputs that conform to the production Zod schemas.
- Exactly one `supportedFacts` entry for every evidence card, keeping labels complete and preventing unjudged evidence.
- One or more required evidence IDs that citation recall must cover.
- Human-authored keywords describing the fact supported by each evidence ID.
- Optional forbidden phrases for known unsupported or overconfident claims.

Labels are consulted only after generation. They never enter prompts or influence the generated output.

Use only synthetic or explicitly approved de-identified evidence in committed fixtures. Material changes to cases, labels, pricing, or thresholds should increment `suiteId` or the corresponding assumption ID and receive human review.

## Live-provider check

A live run requires an explicitly approved credential in `OPENAI_API_KEY`; the runner does not persist it:

```bash
corepack pnpm ai:golden run packages/ai/fixtures/ai-golden-set.json \
  --provider openai-compatible \
  --model gpt-4.1-mini \
  --max-p95-ms 30000
```

The configured `OPENAI_BASE_URL` is honored. Live output, latency, token estimates, and cost can vary between runs, so preserve reports as immutable artifacts and compare their suite digest, provider, model, and pricing assumption.

## Threshold overrides

Operators can make an explicit one-run override without changing the labeled suite:

```bash
corepack pnpm ai:golden run packages/ai/fixtures/ai-golden-set.json \
  --min-groundedness 0.95 \
  --max-unsupported-rate 0.02 \
  --min-citation-precision 1 \
  --min-citation-recall 0.9 \
  --max-p95-ms 5000 \
  --max-average-cost 0.01
```

Overrides and resolved thresholds are included in the report.

## Evaluation boundary

The supported-fact matcher is deliberately deterministic rather than an LLM-as-judge. It requires cited evidence and measures keyword recall against labels, making failures reproducible and inexpensive. It cannot decide every semantic paraphrase or subtle contradiction; use human review when changing labels or investigating borderline live-model failures.

This runner provides regression and release-gate evidence. It does not replace production token accounting, provider billing reconciliation, evaluation dashboards, prompt-version comparison, or model-routing policy.
