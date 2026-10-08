import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";

describe("AuthService", () => {
  it("returns the created workspace in the registration response", async () => {
    const transaction = vi.fn(async (callback) =>
      callback({
        tenant: {
          create: vi.fn().mockResolvedValue({ id: "tenant_1", name: "Team", slug: "team" }),
        },
        user: {
          create: vi.fn().mockResolvedValue({ email: "owner@example.local", id: "user_1" }),
        },
        workspace: {
          create: vi.fn().mockResolvedValue({
            id: "workspace_1",
            name: "Relationships",
            slug: "relationships",
          }),
        },
        retentionPolicy: { create: vi.fn() },
        workspaceMembership: { create: vi.fn() },
      }),
    );
    const service = new AuthService(
      {
        $transaction: transaction,
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
      { record: vi.fn() } as never,
      { hashPassword: vi.fn().mockResolvedValue("hash") } as never,
      {
        issueAccessToken: vi.fn().mockReturnValue({
          accessToken: "token",
          expiresAt: "2026-07-11T00:00:00.000Z",
        }),
      } as never,
    );

    const response = await service.register({
      displayName: "Owner",
      email: "owner@example.local",
      password: "relationship-password",
      tenantName: "Team",
      workspaceName: "Relationships",
    });

    expect(response.workspace).toEqual({
      id: "workspace_1",
      name: "Relationships",
      role: "owner",
      slug: "relationships",
    });
    expect(response.workspaces).toEqual([response.workspace]);
  });

  it("does not select password hashes from the current-user endpoint", async () => {
    const findFirstOrThrow = vi.fn().mockResolvedValue({
      email: "owner@example.local",
      id: "user_1",
      tenantId: "tenant_1",
    });
    const service = new AuthService(
      {
        user: {
          findFirstOrThrow,
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.me("user_1", "tenant_1");

    expect(findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          passwordHash: expect.anything(),
        }),
        where: {
          deletedAt: null,
          id: "user_1",
          tenantId: "tenant_1",
        },
      }),
    );
  });
});
