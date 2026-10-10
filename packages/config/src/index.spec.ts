import { describe, expect, test } from "vitest";

import { loadConfig } from "./index";

const validEnv = {
  DATABASE_URL: "postgresql://relationship:relationship@localhost:5432/relationship",
  JWT_ACCESS_SECRET: "a-local-secret-with-enough-length",
  REDIS_URL: "redis://localhost:6379",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_BUCKET: "relationship-local",
  S3_ENDPOINT: "http://localhost:9000",
  S3_SECRET_ACCESS_KEY: "minioadmin",
};

describe("loadConfig", () => {
  test("loads production hardening defaults", () => {
    expect(loadConfig(validEnv)).toMatchObject({
      API_CORS_ORIGIN: [],
      RATE_LIMIT_MAX: 120,
      RATE_LIMIT_WINDOW_MS: 60_000,
      S3_REGION: "us-east-1",
      SCHEDULER_INTERVAL_MS: 300_000,
      WORKER_LEASE_MS: 30_000,
      WORKER_POLL_INTERVAL_MS: 1_000,
    });
  });

  test("parses comma separated CORS origins", () => {
    expect(
      loadConfig({
        ...validEnv,
        API_CORS_ORIGIN: "https://app.example.com, https://admin.example.com",
      }).API_CORS_ORIGIN,
    ).toEqual(["https://app.example.com", "https://admin.example.com"]);
  });

  test("requires fallback credentials when a fallback provider is enabled", () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        AI_FALLBACK_PROVIDER: "openai-compatible",
      }),
    ).toThrow(/AI_FALLBACK_API_KEY is required/);

    expect(
      loadConfig({
        ...validEnv,
        AI_FALLBACK_API_KEY: "secondary-key",
        AI_FALLBACK_PROVIDER: "openai-compatible",
      }),
    ).toMatchObject({
      AI_FALLBACK_API_KEY: "secondary-key",
      AI_FALLBACK_PROVIDER: "openai-compatible",
    });
  });
});
