import { describe, expect, it } from "vitest";

import { HealthStatusSchema, WorkspaceRoleSchema } from "./index.js";

describe("shared schemas", () => {
  it("validates health status payloads", () => {
    const parsed = HealthStatusSchema.parse({
      service: "api",
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
    });

    expect(parsed.service).toBe("api");
  });

  it("rejects unknown workspace roles", () => {
    expect(() => WorkspaceRoleSchema.parse("superadmin")).toThrow();
  });
});
