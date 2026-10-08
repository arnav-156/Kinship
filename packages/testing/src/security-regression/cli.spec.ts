import { describe, expect, it, vi } from "vitest";

import corpus from "./corpus.json";
import { runSecurityRegressionCli } from "./cli";

describe("security regression CLI", () => {
  it("prints a passing summary for the default corpus", async () => {
    const stdout = vi.fn();
    const load = vi.fn().mockResolvedValue(corpus);

    const exitCode = await runSecurityRegressionCli([], {
      load,
      stdout,
    });

    expect(exitCode).toBe(0);
    expect(load).toHaveBeenCalledWith("packages/testing/src/security-regression/corpus.json");
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      failed: 0,
      failures: [],
      passed: 29,
      total: 29,
    });
  });

  it("returns nonzero and identifies a regressed case", async () => {
    const changed = structuredClone(corpus);
    const authz = changed.find((testCase) => testCase.id === "authz-viewer-draft-write");
    if (!authz || authz.category !== "authz") {
      throw new Error("Fixture not found");
    }
    authz.expectedAllowed = true;
    const stdout = vi.fn();

    const exitCode = await runSecurityRegressionCli(["--corpus", "custom.json"], {
      load: vi.fn().mockResolvedValue(changed),
      stdout,
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      corpus: "custom.json",
      failed: 1,
      failures: [
        {
          category: "authz",
          id: "authz-viewer-draft-write",
          passed: false,
        },
      ],
    });
  });
});
