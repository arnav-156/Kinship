import { describe, expect, it, vi } from "vitest";

import { runSloLoadCli, SLO_LIVE_CONFIRMATION } from "./cli";
import type { runSloLoad } from "./index";

type Report = Awaited<ReturnType<typeof runSloLoad>>;

const report = (passed = true): Report => ({
  concurrency: 1,
  iterations: 1,
  passed,
  targets: [],
  totalRequests: 5,
});

describe("SLO load CLI", () => {
  it("prints a non-executing plan with the five targets and write warning", async () => {
    const run = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runSloLoadCli(["plan"], { run, stdout });

    expect(exitCode).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      confirmation: SLO_LIVE_CONFIRMATION,
      liveWrites: ["urlAnalysis", "brief", "draft"],
      targets: [
        { name: "workspace" },
        { name: "search" },
        { name: "urlAnalysis" },
        { name: "brief" },
        { name: "draft" },
      ],
    });
  });

  it("runs the deterministic scenario with bounded options", async () => {
    const run = vi.fn().mockResolvedValue(report());
    const stdout = vi.fn();

    const exitCode = await runSloLoadCli(
      ["run", "--scenario", "--iterations", "5", "--concurrency", "2"],
      { run, stdout },
    );

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith({
      concurrency: 2,
      iterations: 5,
      mode: "scenario",
    });
  });

  it("loads live credentials and fixture IDs only from environment variables", async () => {
    const run = vi.fn().mockResolvedValue(report());
    const stdout = vi.fn();
    const env = {
      SLO_API_BASE_URL: "http://localhost:7000",
      SLO_API_TOKEN: "environment-secret",
      SLO_BRIEF_ID: "brief-1",
      SLO_ENTITY_ID: "entity-1",
      SLO_URL: "https://example.com/profile",
      SLO_WORKSPACE_ID: "workspace-1",
    };

    const exitCode = await runSloLoadCli(
      [
        "run",
        "--execute",
        "--confirm",
        SLO_LIVE_CONFIRMATION,
        "--token-env",
        "SLO_API_TOKEN",
        "--iterations",
        "2",
        "--concurrency",
        "1",
      ],
      { env, run, stdout },
    );

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith({
      concurrency: 1,
      context: {
        apiBaseUrl: "http://localhost:7000",
        briefId: "brief-1",
        entityId: "entity-1",
        token: "environment-secret",
        url: "https://example.com/profile",
        workspaceId: "workspace-1",
      },
      iterations: 2,
      mode: "live",
    });
    expect(stdout.mock.calls[0]?.[0]).not.toContain("environment-secret");
  });

  it("rejects command-line tokens, missing confirmation, and excessive load", async () => {
    const run = vi.fn();

    await expect(runSloLoadCli(["run", "--execute", "--token", "secret"], { run })).rejects.toThrow(
      "Tokens must be supplied through --token-env",
    );
    await expect(
      runSloLoadCli(["run", "--execute", "--token-env", "TOKEN"], {
        env: { TOKEN: "secret" },
        run,
      }),
    ).rejects.toThrow(`--confirm must equal "${SLO_LIVE_CONFIRMATION}"`);
    await expect(
      runSloLoadCli(["run", "--scenario", "--iterations", "1", "--concurrency", "11"], { run }),
    ).rejects.toThrow("concurrency must be between 1 and 10");
    expect(run).not.toHaveBeenCalled();
  });

  it("returns a failing exit code when any target misses its budget", async () => {
    const run = vi.fn().mockResolvedValue(report(false));

    await expect(runSloLoadCli(["run", "--scenario"], { run })).resolves.toBe(1);
  });
});
