import { describe, expect, it } from "vitest";

import { evaluateCompliancePolicy } from "./index";

const baseInput = {
  channelType: "email" as const,
  consentStatus: "confirmed" as const,
  purpose: "outreach_review" as const,
  recipientRegion: "india",
  recipientType: "professional" as const,
  sourceType: "user_url" as const,
  suppressionStatus: "clear" as const,
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};

describe("evaluateCompliancePolicy", () => {
  it("blocks suppressed recipients", () => {
    expect(
      evaluateCompliancePolicy({
        ...baseInput,
        suppressionStatus: "suppressed",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        decision: "blocked",
        reviewRequired: true,
      }),
    );
  });

  it("blocks withdrawn consent", () => {
    expect(
      evaluateCompliancePolicy({
        ...baseInput,
        consentStatus: "withdrawn",
      }),
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        decision: "blocked",
      }),
    );
  });

  it("warns when email consent is unknown", () => {
    const result = evaluateCompliancePolicy({
      ...baseInput,
      consentStatus: "unknown",
    });

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe("warn");
    expect(result.reviewRequired).toBe(true);
  });

  it("requires review when outreach recipient context is incomplete", () => {
    const result = evaluateCompliancePolicy({
      ...baseInput,
      recipientRegion: "unknown",
      recipientType: "unknown",
    });

    expect(result.decision).toBe("warn");
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Recipient type is unknown"),
        expect.stringContaining("Recipient region is unknown"),
      ]),
    );
  });

  it("does not apply outreach-only warnings to relationship intelligence", () => {
    const result = evaluateCompliancePolicy({
      ...baseInput,
      consentStatus: "unknown",
      purpose: "relationship_intelligence",
      recipientRegion: "unknown",
      recipientType: "unknown",
    });

    expect(result.decision).toBe("allowed");
    expect(result.requiredFooter).toBeUndefined();
  });

  it("allows confirmed email outreach with opt-out footer guidance", () => {
    const result = evaluateCompliancePolicy(baseInput);

    expect(result.decision).toBe("allowed");
    expect(result.requiredFooter).toContain("opt out");
  });
});
