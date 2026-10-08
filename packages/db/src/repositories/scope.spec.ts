import { describe, expect, it } from "vitest";

import { tenantWhere, tenantWorkspaceWhere } from "./scope";

describe("tenant scope helpers", () => {
  it("builds tenant-only filters", () => {
    expect(tenantWhere({ tenantId: "tenant_1" })).toEqual({
      tenantId: "tenant_1",
    });
  });

  it("builds tenant and workspace filters", () => {
    expect(
      tenantWorkspaceWhere({
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
  });
});
