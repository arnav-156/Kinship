import { describe, expect, it } from "vitest";

import { WorkerService } from "./worker.service";

const validEnv = {
  DATABASE_URL: "postgresql://relationship:relationship@localhost:5432/relationship",
  JWT_ACCESS_SECRET: "a-development-secret-at-least-24-chars",
  REDIS_URL: "redis://localhost:6379",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_BUCKET: "relationship-local",
  S3_ENDPOINT: "http://localhost:9000",
  S3_SECRET_ACCESS_KEY: "minioadmin",
};

describe("WorkerService", () => {
  it("can be constructed with valid environment", () => {
    Object.assign(process.env, validEnv);

    const service = new WorkerService(
      {
        queueName: "evidence-ingestion",
      } as never,
      {
        queueName: "brief-generation",
      } as never,
      {
        queueName: "draft-generation",
      } as never,
      {
        queueName: "connector-sync",
      } as never,
      {
        queueName: "retention-cleanup",
      } as never,
    );

    expect(service).toBeInstanceOf(WorkerService);
  });
});
