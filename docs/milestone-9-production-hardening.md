# Milestone 9: Production Hardening

Milestone 9 adds the first production-operability layer around the MVP API without introducing new infrastructure dependencies.

## Implemented

- Request correlation middleware that accepts a trusted `x-request-id` or generates one and returns it on every response.
- In-memory API rate limiting with configurable window and max request count.
- Global HTTP exception filter with stable error bodies, request IDs, paths, timestamps, status codes, and production-safe 500 messages.
- Configurable API CORS origins via `API_CORS_ORIGIN` while preserving permissive local-development behavior.
- DB-backed readiness checks through `/ready`, returning `degraded` if the database check fails.
- Expanded Prometheus-style `/metrics` with API uptime and RSS memory gauges.
- Shutdown hooks enabled for the Nest API process.
- Prisma injection token split away from the database module so unit tests can import services without loading the generated Prisma client.

## Configuration

New environment variables:

- `API_CORS_ORIGIN`: comma-separated allowed origins. Empty means local development allows all origins and production denies browser origins.
- `RATE_LIMIT_WINDOW_MS`: rate-limit bucket window in milliseconds. Default: `60000`.
- `RATE_LIMIT_MAX`: maximum requests per client/method/path/window. Default: `120`; set `0` to disable.

## Verification

Focused red-green coverage was added for request IDs, rate limiting, API error normalization, readiness, metrics, and config parsing.

Commands used during implementation:

- `corepack pnpm --filter @relationship/api exec vitest run src/common/middleware.spec.ts src/common/http-exception.filter.spec.ts src/health.controller.spec.ts`
- `corepack pnpm --filter @relationship/config exec vitest run src/index.spec.ts`
- `corepack pnpm --filter @relationship/db prisma:generate`
- `corepack pnpm --filter @relationship/config build`
- `corepack pnpm --filter @relationship/api typecheck`
- `corepack pnpm --filter @relationship/config typecheck`

Full package verification should be run after Prisma generation whenever DB-backed specs are collected in a fresh checkout.
