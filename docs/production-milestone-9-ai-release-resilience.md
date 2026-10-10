# Production Milestone 9: AI Release Gate and Provider Resilience

This milestone turns the existing AI golden set into a required release check and adds a bounded production-provider fallback path.

## Release gate

Every pull request and push to `main` runs:

```bash
corepack pnpm ai:golden run packages/ai/fixtures/ai-golden-set.json --provider mock
```

The source-controlled suite enforces groundedness, unsupported-claim rate, citation precision and recall, p95 latency, and estimated average cost. The command exits with status `2` when any threshold fails, so CI blocks the change. The deterministic mock gate protects prompt, schema, label, metric, and threshold behavior without exposing credentials.

A production promotion must additionally run the documented live-provider command with an explicitly approved `OPENAI_API_KEY`. Live output is intentionally not part of untrusted pull-request execution.

## Failure contract

OpenAI-compatible requests have a 30-second default timeout, honor a lower per-request `timeoutMs`, and classify failures as:

| Kind               | Examples                                                                                    | Fallback eligible |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------- |
| `authentication`   | Missing key, HTTP 401/403                                                                   | No                |
| `invalid-request`  | Invalid timeout, other HTTP 4xx                                                             | No                |
| `malformed-output` | Non-JSON payload, invalid response schema, structured output still invalid after one repair | Yes               |
| `quota`            | HTTP 402/429                                                                                | Yes               |
| `timeout`          | Local abort or HTTP 408                                                                     | Yes               |
| `unavailable`      | Transport error or HTTP 5xx                                                                 | Yes               |

Authentication and invalid-request failures remain fail-closed. This prevents a secondary provider from hiding broken credentials or invalid application requests.

## Bounded fallback

The API and worker support one optional OpenAI-compatible fallback. For an eligible primary failure, the original request is attempted once against the fallback. There is no recursive chain or unbounded retry. Structured generation may first use its existing single repair attempt on a provider; if both primary outputs are malformed, the fallback gets one normal structured-generation attempt with its own single repair bound.

Configure a separate provider credential and, when needed, endpoint/model overrides:

```env
AI_FALLBACK_PROVIDER=openai-compatible
AI_FALLBACK_API_KEY=...
AI_FALLBACK_BASE_URL=https://secondary-provider.example.com/v1
AI_FALLBACK_CHAT_MODEL=secondary-chat-model
AI_FALLBACK_EMBEDDING_MODEL=secondary-embedding-model
```

`AI_FALLBACK_PROVIDER` requires `AI_FALLBACK_API_KEY` during configuration validation. If the endpoint or model overrides are omitted, the OpenAI-compatible defaults apply. Do not configure the same provider endpoint and failure domain as both primary and fallback.

## Verification

Regression coverage exercises quota classification, actual abort-driven timeout handling, transport failure, malformed payloads, structured-output repair exhaustion followed by fallback, successful quota fallback, and fail-closed authentication. CI runs the full unit suite and the golden-set release gate.

This milestone does not add task-based model routing, streaming, circuit breaking, or enforceable production token/cost budgets.
