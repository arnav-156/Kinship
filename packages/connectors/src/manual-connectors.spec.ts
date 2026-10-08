import { describe, expect, it } from "vitest";

import { ManualLinkedInContextConnector } from "./manual-connectors";

describe("ManualLinkedInContextConnector", () => {
  it("stores user-provided context without fetching LinkedIn", async () => {
    const connector = new ManualLinkedInContextConnector();
    const result = await connector.fetch({
      context: {
        manualText: "User said this person spoke at a public conference.",
      },
      sourceIdentifier: "https://www.linkedin.com/in/example",
      tenantId: "tenant_1",
      timeoutMs: 1000,
      workspaceId: "workspace_1",
    });

    expect(result.rawText).toContain("User said this person");
    expect(result.sourceType).toBe("manual_linkedin_context");
  });
});
