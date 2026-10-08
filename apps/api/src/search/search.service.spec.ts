import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { SearchService } from "./search.service";

const principal: AuthenticatedPrincipal = {
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

describe("SearchService", () => {
  it("blocks evidence search outside the authenticated workspace memberships", async () => {
    const service = new SearchService({} as never);

    await expect(
      service.searchEvidence(principal, {
        query: "founder",
        workspaceId: "workspace_2",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("scopes evidence search by tenant and workspace", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new SearchService({
      evidenceItem: {
        findMany,
      },
    } as never);

    await service.searchEvidence(principal, {
      query: "founder",
      sourceTypes: ["github"],
      workspaceId: "workspace_1",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceType: {
            in: ["github"],
          },
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
  });

  it("returns explainable deterministic signals for similar people", async () => {
    const service = new SearchService({
      entity: {
        findMany: vi.fn().mockResolvedValue([
          {
            aliases: [],
            canonicalName: "Ada Lovelace",
            id: "entity_2",
            person: {
              fullName: "Ada Lovelace",
              githubLogin: "ada-l",
              linkedinUrl: null,
              location: "London",
              orcidId: "0000-0001-2345-6789",
              primaryEmailHash: null,
            },
            type: "person",
          },
        ]),
      },
    } as never);

    const results = await service.searchSimilarPeople(principal, {
      fullName: "Ada Lovelace",
      githubLogin: "ada-l",
      orcidId: "0000-0001-2345-6789",
      workspaceId: "workspace_1",
    });

    expect(results[0]?.decision).toBe("match");
    expect(results[0]?.signals.map((signal) => signal.type)).toContain("exact_orcid");
  });
});
