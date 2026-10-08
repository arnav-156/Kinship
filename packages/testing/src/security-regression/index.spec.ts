import { describe, expect, it } from "vitest";

import corpus from "./corpus.json";
import { runSecurityRegressionCorpus } from "./index";

describe("security regression corpus", () => {
  it("passes the labeled SSRF, prompt injection, XSS, authz, and tenant cases", async () => {
    const report = await runSecurityRegressionCorpus(corpus);

    expect(report).toMatchObject({
      categoryCounts: {
        authz: 8,
        prompt_injection: 6,
        ssrf: 8,
        tenant_isolation: 4,
        xss: 3,
      },
      failed: 0,
      passed: 29,
      total: 29,
    });
    expect(report.results.every((result) => result.passed)).toBe(true);
  });

  it("reports an expectation regression without hiding the failing case", async () => {
    const changed = structuredClone(corpus);
    const publicUrl = changed.find((testCase) => testCase.id === "ssrf-public-https");
    if (!publicUrl || publicUrl.category !== "ssrf") throw new Error("Fixture not found");
    publicUrl.expected = "reject";

    const report = await runSecurityRegressionCorpus(changed);

    expect(report.failed).toBe(1);
    expect(report.results).toContainEqual(
      expect.objectContaining({
        category: "ssrf",
        id: "ssrf-public-https",
        passed: false,
      }),
    );
  });

  it("requires unique IDs and coverage for every security category", async () => {
    const incomplete = corpus.filter((testCase) => testCase.category !== "xss");
    incomplete.push(structuredClone(incomplete[0]!));

    await expect(runSecurityRegressionCorpus(incomplete)).rejects.toThrow(
      /duplicate case ID|missing category/,
    );
  });
});
