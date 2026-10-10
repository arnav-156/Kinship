import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns a browser-friendly service index", () => {
    const controller = new HealthController();

    expect(controller.index()).toEqual({
      endpoints: {
        aiConfiguration: "/v1/ai/configuration",
        health: "/health",
        metrics: "/metrics",
        readiness: "/ready",
        versionedApi: "/v1",
      },
      service: "relationship-intelligence-api",
      status: "ok",
      version: "0.1.0",
    });
  });

  it("reports AI configuration without exposing credentials", () => {
    const controller = new HealthController();
    const configuration = controller.aiConfiguration();

    expect(["mock", "openai-compatible"]).toContain(configuration.provider);
    expect(typeof configuration.configured).toBe("boolean");
    expect(configuration.model.length).toBeGreaterThan(0);
    expect(configuration).not.toHaveProperty("apiKey");
  });

  it("returns API health", () => {
    const controller = new HealthController();

    expect(controller.health()).toMatchObject({
      service: "api",
      status: "ok",
      version: "0.1.0",
    });
  });

  it("reports degraded readiness when the database check fails", async () => {
    const controller = new HealthController({
      $queryRaw: () => Promise.reject(new Error("database unavailable")),
    } as never);

    await expect(controller.ready()).resolves.toMatchObject({
      checks: { database: "degraded", objectStorage: "degraded" },
      service: "api",
      status: "degraded",
    });
  });

  it("requires both database and object storage for readiness", async () => {
    const controller = new HealthController(
      { $queryRaw: () => Promise.resolve([{ ok: 1 }]) } as never,
      undefined,
      { checkHealth: () => Promise.resolve() } as never,
    );

    await expect(controller.ready()).resolves.toMatchObject({
      checks: { database: "ok", objectStorage: "ok" },
      status: "ok",
    });
  });

  it("includes uptime and memory gauges in metrics", () => {
    const controller = new HealthController(undefined, () => ({
      memoryRssBytes: 4096,
      uptimeSeconds: 12,
    }));

    expect(controller.metrics()).toContain("relationship_api_uptime_seconds 12");
    expect(controller.metrics()).toContain("relationship_api_memory_rss_bytes 4096");
  });
});
