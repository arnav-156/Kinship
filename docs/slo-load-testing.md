# SLO load testing

The SLO load harness measures the authenticated API surfaces for workspace reads,
evidence search, URL analysis, relationship brief creation, and draft creation. It
reports request count, successful and failed requests, error rate, estimated
throughput, and p50/p95/p99 latency for each target. The command exits nonzero when
any p95 or error-rate budget is missed.

## Safe deterministic scenario

Inspect the plan and run the no-network scenario before attempting a live test:

```powershell
corepack pnpm slo:load plan
corepack pnpm slo:load run --scenario --iterations 20 --concurrency 4
```

Scenario mode is deterministic and performs no HTTP requests. It verifies the
harness, aggregation, thresholds, report format, and exit behavior; it does not
prove that a deployed environment meets its SLOs.

The harness caps a run at 100 iterations per target and concurrency 10. The
scenario defaults are 20 iterations and concurrency 4.

## Live controlled run

Live mode sends authenticated requests to a running API. Use an isolated staging
or demo workspace. URL analysis, brief creation, and draft creation write data and
may invoke configured AI providers, incur cost, or enqueue follow-on work. Prefer
`AI_PROVIDER=mock` for routine harness validation.

Set all inputs in the environment. The bearer token must never be placed on the
command line:

```powershell
$env:SLO_API_BASE_URL = "http://localhost:7000"
$env:SLO_API_TOKEN = "<bearer-token>"
$env:SLO_WORKSPACE_ID = "<isolated-workspace-id>"
$env:SLO_ENTITY_ID = "<fixture-entity-id>"
$env:SLO_BRIEF_ID = "<fixture-brief-id>"
$env:SLO_URL = "https://example.com/controlled-fixture"

corepack pnpm slo:load run --execute `
  --confirm "RUN CONTROLLED SLO LOAD TEST WITH WRITES" `
  --token-env SLO_API_TOKEN `
  --iterations 3 `
  --concurrency 1
```

Confirm the API readiness endpoint is healthy before the live run. Live defaults
are deliberately limited to 3 iterations and concurrency 1. `SLO_BRIEF_ID` is the
existing brief used by the draft target; briefs created by the brief target are
separate test artifacts.

The token is read from the named environment variable, used only in the
`Authorization` header, and excluded from reports. Literal `--token` arguments are
rejected.

## Targets and default budgets

| Target       | Request                                        | p95 limit | Maximum error rate |
| ------------ | ---------------------------------------------- | --------: | -----------------: |
| Workspace    | `GET /v1/workspaces/:workspaceId`              |    500 ms |                 1% |
| Search       | `POST /v1/search/evidence`                     |  1,000 ms |                 1% |
| URL analysis | `POST /v1/analyze-url`                         |  5,000 ms |                 1% |
| Brief        | `POST /v1/relationship-briefs`                 | 15,000 ms |                 1% |
| Draft        | `POST /v1/relationship-briefs/:briefId/drafts` | 15,000 ms |                 1% |

Latency includes receiving the complete response body. A response outside the
2xx range or a request exception counts as an error. Each target passes only when
both its p95 latency and error rate stay within budget.
