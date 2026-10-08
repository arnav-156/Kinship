import { Controller, Get, Header, Inject, Optional } from "@nestjs/common";
import type { HealthStatus } from "@relationship/shared";

import { PRISMA_CLIENT } from "./database/prisma.token";

const version = "0.1.0";
export const METRICS_SNAPSHOT = Symbol("METRICS_SNAPSHOT");

type ReadinessStatus = HealthStatus & {
  checks: {
    database: "degraded" | "ok";
  };
};

type ServiceIndex = {
  endpoints: {
    aiConfiguration: string;
    health: string;
    metrics: string;
    readiness: string;
    versionedApi: string;
  };
  service: string;
  status: "ok";
  version: string;
};

type AiConfiguration = {
  configured: boolean;
  model: string;
  provider: "mock" | "openai-compatible";
};

type MetricsSnapshot = {
  memoryRssBytes: number;
  uptimeSeconds: number;
};

type ReadinessDatabaseClient = {
  $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
};

@Controller()
export class HealthController {
  constructor(
    @Optional() @Inject(PRISMA_CLIENT) private readonly prisma?: ReadinessDatabaseClient,
    @Optional() @Inject(METRICS_SNAPSHOT) private readonly metricsSnapshot?: () => MetricsSnapshot,
  ) {}

  @Get()
  index(): ServiceIndex {
    return {
      endpoints: {
        aiConfiguration: "/v1/ai/configuration",
        health: "/health",
        metrics: "/metrics",
        readiness: "/ready",
        versionedApi: "/v1",
      },
      service: "relationship-intelligence-api",
      status: "ok",
      version,
    };
  }

  @Get("ai/configuration")
  aiConfiguration(): AiConfiguration {
    const provider =
      process.env["AI_PROVIDER"] === "openai-compatible" ? "openai-compatible" : "mock";

    return {
      configured: provider === "mock" || Boolean(process.env["OPENAI_API_KEY"]?.trim()),
      model: process.env["OPENAI_CHAT_MODEL"] ?? "gpt-4.1-mini",
      provider,
    };
  }

  @Get("health")
  health(): HealthStatus {
    return {
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version,
    };
  }

  @Get("ready")
  async ready(): Promise<ReadinessStatus> {
    const database = await this.checkDatabase();

    return {
      checks: {
        database,
      },
      service: "api",
      status: database === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version,
    };
  }

  @Get("metrics")
  @Header("Content-Type", "text/plain; version=0.0.4")
  metrics(): string {
    const snapshot = (this.metricsSnapshot ?? defaultMetricsSnapshot)();

    return [
      "# HELP relationship_api_up API process health.",
      "# TYPE relationship_api_up gauge",
      "relationship_api_up 1",
      "# HELP relationship_api_uptime_seconds API process uptime in seconds.",
      "# TYPE relationship_api_uptime_seconds gauge",
      `relationship_api_uptime_seconds ${snapshot.uptimeSeconds}`,
      "# HELP relationship_api_memory_rss_bytes API resident memory size in bytes.",
      "# TYPE relationship_api_memory_rss_bytes gauge",
      `relationship_api_memory_rss_bytes ${snapshot.memoryRssBytes}`,
    ].join("\n");
  }

  private async checkDatabase(): Promise<"degraded" | "ok"> {
    if (!this.prisma) {
      return "degraded";
    }

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "degraded";
    }
  }
}

function defaultMetricsSnapshot(): MetricsSnapshot {
  return {
    memoryRssBytes: process.memoryUsage().rss,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
