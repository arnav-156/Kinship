import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { ComplianceService, hashContactValue } from "./compliance.service";

const member: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [
    {
      role: "member",
      workspaceId: "workspace_1",
    },
  ],
};

describe("ComplianceService", () => {
  it("hashes contact values consistently without preserving raw values", () => {
    expect(hashContactValue("email", "Ada@Example.com")).toBe(
      hashContactValue("email", " ada@example.com "),
    );
    expect(hashContactValue("email", "ada@example.com")).not.toContain("ada@example.com");
  });

  it("lets workspace members capture the policy context required for drafting", async () => {
    const upsert = vi.fn().mockResolvedValue({
      consentStatus: "confirmed",
      id: "channel_1",
      purpose: "outreach_review",
      recipientRegion: "india",
      recipientType: "professional",
    });
    const service = new ComplianceService(
      {
        contactChannel: { upsert },
        entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
      } as never,
      { record: vi.fn() } as never,
    );

    await service.upsertContactChannel(member, {
      channelType: "email",
      consentStatus: "confirmed",
      entityId: "entity_1",
      purpose: "outreach_review",
      recipientRegion: "india",
      recipientType: "professional",
      value: "ada@example.com",
      workspaceId: "workspace_1",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          purpose: "outreach_review",
          recipientRegion: "india",
          recipientType: "professional",
        }),
      }),
    );
  });

  it("requires owner/admin access to create workspace suppressions", async () => {
    const service = new ComplianceService({} as never, {} as never);

    await expect(
      service.createSuppression(member, {
        channelType: "email",
        reason: "opt out",
        value: "ada@example.com",
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks draft channels when a suppression matches the hashed contact value", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        consentStatus: "confirmed",
        purpose: "outreach_review",
        recipientRegion: "india",
        recipientType: "professional",
        valueHash: hashContactValue("email", "ada@example.com"),
      })
      .mockResolvedValueOnce({
        id: "suppression_1",
      });
    const service = new ComplianceService(
      {
        contactChannel: {
          findFirst,
        },
        suppressionEntry: {
          findFirst,
        },
      } as never,
      {} as never,
    );

    const result = await service.evaluateDraftChannel({
      channelType: "email",
      entityId: "entity_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(result.decision).toBe("blocked");
  });

  it("uses the durable recipient context when evaluating draft channels", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        consentStatus: "confirmed",
        purpose: "outreach_review",
        recipientRegion: "india",
        recipientType: "professional",
        valueHash: hashContactValue("email", "ada@example.com"),
      })
      .mockResolvedValueOnce(null);
    const service = new ComplianceService(
      {
        contactChannel: { findFirst },
        suppressionEntry: { findFirst },
      } as never,
      {} as never,
    );

    const result = await service.evaluateDraftChannel({
      channelType: "email",
      entityId: "entity_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(result.decision).toBe("allowed");
    expect(result.policyContext).toEqual(
      expect.objectContaining({
        consentStatus: "confirmed",
        purpose: "outreach_review",
        recipientRegion: "india",
        recipientType: "professional",
      }),
    );
  });
});
