import { describe, expect, it, vi } from "vitest";

import { embedTexts } from "./index";

describe("embedTexts", () => {
  it("validates and preserves one embedding per input", async () => {
    const embedText = vi
      .fn()
      .mockResolvedValueOnce({ dimensions: 3, embedding: [1, 0, 0], provider: "fixture" })
      .mockResolvedValueOnce({ dimensions: 3, embedding: [0, 1, 0], provider: "fixture" });

    await expect(
      embedTexts({ embedText }, ["first", "second"], {
        expectedDimensions: 3,
        timeoutMs: 5_000,
      }),
    ).resolves.toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(embedText).toHaveBeenNthCalledWith(1, { input: "first", timeoutMs: 5_000 });
  });

  it("can deliberately omit non-production provider vectors", async () => {
    const embedText = vi.fn().mockResolvedValue({
      dimensions: 16,
      embedding: Array.from({ length: 16 }, () => 0),
      provider: "mock",
    });

    await expect(
      embedTexts({ embedText }, ["input"], {
        expectedDimensions: 1536,
        ignoredProviders: ["mock"],
      }),
    ).resolves.toEqual([undefined]);
  });

  it("rejects malformed production vectors", async () => {
    const embedText = vi.fn().mockResolvedValue({
      dimensions: 2,
      embedding: [0.1, 0.2],
      provider: "openai-compatible",
    });

    await expect(embedTexts({ embedText }, ["input"], { expectedDimensions: 3 })).rejects.toThrow(
      "expected 3 finite values",
    );
  });
});
