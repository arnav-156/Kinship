import { EntityRepository } from "./entity.repository";
import type { TenantWorkspaceScope } from "./scope";

import { describe, expect, it, vi } from "vitest";

const scope: TenantWorkspaceScope = {
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};

describe("EntityRepository", () => {
  it("always scopes findById by tenant and workspace", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new EntityRepository({
      entity: {
        findFirst,
      },
    } as never);

    await repository.findById(scope, "entity_1");

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        id: "entity_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
  });
});
