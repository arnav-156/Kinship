import { describe, expect, it } from "vitest";

import { calculateRetentionExpiration } from "./retention.utils";

describe("calculateRetentionExpiration", () => {
  it("derives expiration from retrieval time rather than update time", () => {
    expect(
      calculateRetentionExpiration(new Date("2026-01-01T00:00:00.000Z"), {
        enabled: true,
        retentionDays: 30,
      })?.toISOString(),
    ).toBe("2026-01-31T00:00:00.000Z");
  });

  it("returns no expiration when retention is disabled", () => {
    expect(
      calculateRetentionExpiration(new Date("2026-01-01T00:00:00.000Z"), {
        enabled: false,
        retentionDays: 30,
      }),
    ).toBeNull();
  });
});
