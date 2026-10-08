import { describe, expect, it, vi } from "vitest";

import { runRetentionAdminCli } from "./admin-retention-cli";

describe("retention administrator CLI", () => {
  it("prints a cleanup dry-run without invoking execution", async () => {
    const plan = {
      confirmation: "DELETE EXPIRED EVIDENCE workspace_1",
      dataClass: "evidence",
      dueEvidenceItems: 2,
      dueSourceSnapshots: 1,
      generatedAt: "2026-07-19T12:00:00.000Z",
      nextExpirationAt: null,
      policy: { enabled: true, retentionDays: 90 },
      scope: {
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
        workspaceName: "Relationship Lab",
      },
      totalDue: 3,
    };
    const preview = vi.fn().mockResolvedValue(plan);
    const execute = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runRetentionAdminCli(
      [
        "cleanup",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--operator",
        "fixture-operator",
        "--dry-run",
      ],
      {
        stdout,
        utility: { execute, preview },
      },
    );

    expect(exitCode).toBe(0);
    expect(preview).toHaveBeenCalledWith({
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(plan, null, 2));
  });

  it("executes cleanup only with an explicit confirmation", async () => {
    const result = {
      deleted: { evidenceItems: 2, sourceSnapshots: 1, total: 3 },
      executedAt: "2026-07-19T12:00:00.000Z",
      job: { id: "job_1", status: "completed" },
    };
    const execute = vi.fn().mockResolvedValue(result);
    const preview = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runRetentionAdminCli(
      [
        "cleanup",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--operator",
        "fixture-operator",
        "--execute",
        "--confirm",
        "DELETE EXPIRED EVIDENCE workspace_1",
      ],
      {
        stdout,
        utility: { execute, preview },
      },
    );

    expect(exitCode).toBe(0);
    expect(preview).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(
      {
        operator: "fixture-operator",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      "DELETE EXPIRED EVIDENCE workspace_1",
    );
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });
});
