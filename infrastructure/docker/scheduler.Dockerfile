FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/scheduler/package.json apps/scheduler/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @relationship/scheduler... build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/scheduler/node_modules ./apps/scheduler/node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/scheduler/dist ./apps/scheduler/dist
COPY package.json pnpm-workspace.yaml ./
COPY apps/scheduler/package.json apps/scheduler/package.json
CMD ["corepack", "pnpm", "--filter", "@relationship/scheduler", "start:prod"]
