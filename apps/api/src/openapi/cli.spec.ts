import { describe, expect, it, vi } from "vitest";

import { OPENAPI_SNAPSHOT_CONFIRMATION, runOpenApiCli } from "./cli";
import type { OpenApiDocument } from "./compatibility";

const baseline: OpenApiDocument = {
  openapi: "3.0.3",
  paths: {
    "/v1/workspaces": {
      get: {
        operationId: "listWorkspaces",
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

describe("OpenAPI compatibility CLI", () => {
  it("checks the generated document against the default baseline", async () => {
    const generate = vi.fn().mockResolvedValue(structuredClone(baseline));
    const read = vi.fn().mockResolvedValue(structuredClone(baseline));
    const write = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runOpenApiCli(["check"], {
      generate,
      read,
      stdout,
      write,
    });

    expect(exitCode).toBe(0);
    expect(read).toHaveBeenCalledWith("docs/openapi.json");
    expect(write).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      baseline: "docs/openapi.json",
      breakingChanges: [],
      operationCount: 1,
      passed: true,
    });
  });

  it("returns nonzero and reports breaking changes", async () => {
    const candidate: OpenApiDocument = structuredClone(baseline);
    delete candidate.paths["/v1/workspaces"]!.get;
    const stdout = vi.fn();

    const exitCode = await runOpenApiCli(["check", "--baseline", "contracts/api.json"], {
      generate: vi.fn().mockResolvedValue(candidate),
      read: vi.fn().mockResolvedValue(baseline),
      stdout,
      write: vi.fn(),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      baseline: "contracts/api.json",
      breakingChanges: [
        {
          code: "operation_removed",
          location: "GET /v1/workspaces",
        },
      ],
      passed: false,
    });
  });

  it("requires exact confirmation before replacing the baseline", async () => {
    const write = vi.fn();
    const dependencies = {
      generate: vi.fn().mockResolvedValue(baseline),
      read: vi.fn(),
      write,
    };

    await expect(runOpenApiCli(["snapshot", "--confirm", "yes"], dependencies)).rejects.toThrow(
      `--confirm must equal "${OPENAPI_SNAPSHOT_CONFIRMATION}"`,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("writes a canonical snapshot after exact confirmation", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const stdout = vi.fn();

    const exitCode = await runOpenApiCli(
      ["snapshot", "--confirm", OPENAPI_SNAPSHOT_CONFIRMATION, "--baseline", "contracts/api.json"],
      {
        generate: vi.fn().mockResolvedValue(baseline),
        read: vi.fn(),
        stdout,
        write,
      },
    );

    expect(exitCode).toBe(0);
    expect(write).toHaveBeenCalledWith(
      "contracts/api.json",
      expect.stringMatching(/"openapi": "3\.0\.3"/),
    );
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      baseline: "contracts/api.json",
      operationCount: 1,
      status: "updated",
    });
  });
});
