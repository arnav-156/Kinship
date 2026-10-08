# Local Development

## Prerequisites

- Node.js 22 or newer
- Corepack
- Docker Desktop or a Docker-compatible runtime

## Setup

```bash
corepack enable
corepack pnpm install
```

Copy `.env.example` to `.env` and replace local secrets before running anything beyond local development.

## Run Locally

```bash
corepack pnpm dev
```

API health is available at `http://localhost:7000/health`.

Web is available at `http://localhost:3000`.

## Docker Compose

```bash
corepack pnpm docker:up
```

The Compose stack starts PostgreSQL with pgvector, Redis, MinIO, API, scheduler, worker, and web. Every `SCHEDULER_INTERVAL_MS`, the scheduler enqueues due evidence-retention cleanup and explicitly enabled connector refreshes for the worker.

If a port is already in use, override host ports before starting Compose:

```powershell
$env:POSTGRES_PORT='55432'
$env:REDIS_PORT='56379'
$env:MINIO_API_PORT='59000'
$env:MINIO_CONSOLE_PORT='59001'
corepack pnpm docker:up
```

## Database

```bash
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
```
