# Search Relevance Evaluation

The search relevance utility runs the production `@relationship/search` lexical scoring, semantic-score ordering, reciprocal-rank fusion, and evidence-quality ranking functions against an offline, fully labeled query set. It does not connect to a database or use tenant data, so a run is deterministic and safe for local development and CI.

## Run the committed baseline

Validate the dataset schema and labels:

```bash
corepack pnpm search:relevance validate packages/search/fixtures/search-relevance-labeled-queries.json
```

Evaluate it and enforce its committed minimum metrics:

```bash
corepack pnpm search:relevance evaluate packages/search/fixtures/search-relevance-labeled-queries.json
```

The evaluator reports per-query top results, relevance grades, ranking reasons, missed relevant evidence, aggregate metrics, threshold checks, and a stable SHA-256 dataset digest. A threshold failure returns exit code `2`; malformed input or command usage returns exit code `1`.

To write a new report without overwriting an existing artifact:

```bash
corepack pnpm search:relevance evaluate labeled-queries.json --output artifacts/search-relevance.json
```

## Metrics and overrides

The report includes:

- `precisionAtK`: relevant results divided by the cutoff.
- `recallAtK`: relevant results found in the top K divided by all relevant judgments.
- `hitRateAtK`: whether each query returned any relevant result in the top K, macro-averaged.
- `meanReciprocalRank`: reciprocal rank of the first relevant result, macro-averaged.
- `ndcgAtK`: graded normalized discounted cumulative gain using grades 0–3.

Dataset minimums can be overridden for an explicit experiment or CI gate:

```bash
corepack pnpm search:relevance evaluate labeled-queries.json --k 5 --min-hit-rate 1 --min-mrr 0.9 --min-ndcg 0.85 --min-precision 0.4 --min-recall 0.8
```

The requested cutoff must not exceed any query's candidate-pool size.

## Labeled query-set contract

A schema-version `1` dataset contains:

- A stable `datasetId`, positive `cutoff`, optional metric `minimums`, and one or more queries.
- A unique `queryId`, query text, candidate pool, and judgments for every query.
- Candidate inputs used by production ranking: summary/search text, confidence, freshness, and optional metadata/semantic scores. The evaluator derives lexical and semantic ranks exactly once before applying production reciprocal-rank fusion.
- Exactly one explicit judgment for every candidate. Grade `0` is non-relevant, `1` is marginal, `2` is relevant, and `3` is highly relevant.
- At least one relevant judgment per query and at least K candidates.

Labels never enter the ranking calculation; they are consulted only after ranking to calculate metrics. This prevents evaluation leakage. Keep real customer or workspace data out of committed fixtures. New labeled sets should use synthetic or explicitly approved de-identified evidence, receive human label review, and increment `datasetId` when judgments materially change.

## Determinism boundary

The fixture supplies fixed freshness scores and does not use retrieval timestamps, wall-clock time, network services, model calls, or a database. Given the same code and dataset digest, the evaluator returns byte-equivalent JSON. This makes ranking changes visible as metric or result-order changes in review.
