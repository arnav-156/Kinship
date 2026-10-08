import { describe, expect, it } from "vitest";

import { DEFAULT_SLO_TARGETS, runSloLoad, type SloTargetName } from "./index";

describe("SLO load harness", () => {
  it("evaluates all five product targets against latency and error budgets", async () => {
    const durations: Record<SloTargetName, number> = {
      brief: 800,
      draft: 900,
      search: 80,
      urlAnalysis: 300,
      workspace: 40,
    };

    const report = await runSloLoad({
      concurrency: 2,
      execute: async (target) => ({
        durationMs: durations[target.name],
        status: 200,
      }),
      iterations: 3,
      targets: DEFAULT_SLO_TARGETS,
    });

    expect(report.passed).toBe(true);
    expect(report.totalRequests).toBe(15);
    expect(report.targets.map((target) => target.name)).toEqual([
      "workspace",
      "search",
      "urlAnalysis",
      "brief",
      "draft",
    ]);
    expect(report.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          errorRate: 0,
          name: "workspace",
          p95Ms: 40,
          passed: true,
          requests: 3,
        }),
        expect.objectContaining({
          errorRate: 0,
          name: "draft",
          p95Ms: 900,
          passed: true,
          requests: 3,
        }),
      ]),
    );
  });

  it("honors the configured concurrency bound", async () => {
    let active = 0;
    let maximumActive = 0;

    const report = await runSloLoad({
      concurrency: 2,
      execute: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { durationMs: 5, status: 200 };
      },
      iterations: 4,
      targets: [
        {
          maxErrorRate: 0,
          name: "workspace",
          p95LimitMs: 100,
        },
      ],
    });

    expect(maximumActive).toBe(2);
    expect(report).toMatchObject({
      concurrency: 2,
      passed: true,
      totalRequests: 4,
    });
  });

  it("continues after request failures and fails the affected SLO budget", async () => {
    let invocation = 0;
    const report = await runSloLoad({
      concurrency: 1,
      execute: async () => {
        invocation += 1;
        if (invocation === 2) {
          throw new Error("connection reset");
        }
        return {
          durationMs: invocation === 3 ? 2_000 : 20,
          status: 200,
        };
      },
      iterations: 3,
      targets: [
        {
          maxErrorRate: 0,
          name: "search",
          p95LimitMs: 1_000,
        },
      ],
    });

    expect(report.passed).toBe(false);
    expect(report.targets[0]).toMatchObject({
      errorRate: 1 / 3,
      failedRequests: 1,
      p95Ms: 2_000,
      passed: false,
      requests: 3,
      successfulRequests: 2,
    });
  });
});
