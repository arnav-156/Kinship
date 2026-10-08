import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { WorkspacesService } from "./workspaces.service";

const viewer: AuthenticatedPrincipal = {
  email: "viewer@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [
    {
      role: "viewer",
      workspaceId: "workspace_1",
    },
  ],
};
const owner: AuthenticatedPrincipal = {
  ...viewer,
  workspaceRoles: [{ role: "owner", workspaceId: "workspace_1" }],
};

describe("WorkspacesService", () => {
  it("creates the default evidence retention policy with a new workspace", async () => {
    const retentionCreate = vi.fn().mockResolvedValue({ id: "policy_1" });
    const tx = {
      retentionPolicy: { create: retentionCreate },
      workspace: {
        create: vi.fn().mockResolvedValue({
          id: "workspace_2",
          name: "Second Workspace",
          slug: "second-workspace",
          tenantId: "tenant_1",
        }),
      },
      workspaceMembership: { create: vi.fn().mockResolvedValue({ id: "membership_2" }) },
    };
    const service = new WorkspacesService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        workspace: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
      { record: vi.fn().mockResolvedValue({ id: "audit_1" }) } as never,
    );

    await service.create(owner, { name: "Second Workspace" });

    expect(retentionCreate).toHaveBeenCalledWith({
      data: {
        dataClass: "evidence",
        retentionDays: 365,
        tenantId: "tenant_1",
        workspaceId: "workspace_2",
      },
    });
  });

  it("lists only workspaces from the principal tenant and memberships", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new WorkspacesService(
      {
        workspace: {
          findMany,
        },
      } as never,
      {} as never,
    );

    await service.list(viewer);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: {
            in: ["workspace_1"],
          },
          tenantId: "tenant_1",
        },
      }),
    );
  });

  it("blocks viewers from updating workspaces", async () => {
    const service = new WorkspacesService({} as never, {} as never);

    await expect(service.update(viewer, "workspace_1", { name: "Nope" })).rejects.toThrow(
      ForbiddenException,
    );
  });
});
