# Relationship Intelligence Copilot

A trust-first Relationship Intelligence Copilot that turns user-provided people, companies, papers, repositories, CRM records, contacts, prospects, or URLs into evidence-backed relationship briefs and compliant outreach drafts.

This repository is a TypeScript pnpm monorepo using a modular monolith architecture:

- `apps/api`: NestJS REST API
- `apps/scheduler`: recurring durable-job scheduler
- `apps/worker`: NestJS background worker
- `apps/web`: Next.js App Router frontend
- `packages/*`: shared architecture packages

## Current Status

Milestones 0 through 9 are complete: planning, repository foundation, database/core domain, auth/tenant/authorization/audit foundations, connector/evidence ingestion foundations, search/entity-resolution/RAG foundations, the AI brief/draft generation pipeline, compliance/suppression enforcement, the frontend MVP dashboard, and production-hardening foundations.

## Local Development

```bash
corepack enable
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

Copy `.env.example` to `.env` for local development values.

## Database

```bash
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
```

If another project is already using PostgreSQL on `5432`, start this project on another host port:

```powershell
$env:POSTGRES_PORT='55432'
docker compose -f infrastructure/docker-compose.yml up -d postgres
$env:DATABASE_URL='postgresql://relationship:relationship@localhost:55432/relationship'
corepack pnpm --filter @relationship/db exec prisma migrate deploy --config prisma.config.ts
corepack pnpm db:seed
```

## Docker

```bash
corepack pnpm docker:up
```

The local stack includes PostgreSQL with pgvector, Redis, SeaweedFS S3-compatible object storage, API, scheduler, worker, and web services.
