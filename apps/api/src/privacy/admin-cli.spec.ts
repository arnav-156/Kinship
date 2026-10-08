import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runPrivacyAdminCli } from "./admin-cli";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("privacy administrator CLI", () => {
  it("writes a newly generated scoped export artifact", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-admin-cli-"));
    temporaryDirectories.push(directory);
    const outputPath = path.join(directory, "export.json");
    const exportData = vi.fn().mockResolvedValue({
      expiresAt: "2026-07-19T12:00:00.000Z",
      requestId: "request_1",
      snapshot: {
        account: { email: "fixture@example.local", id: "user_1" },
        scope: { tenantId: "tenant_1", userId: "user_1" },
        version: "1.0",
      },
    });
    const stdout = vi.fn();

    const exitCode = await runPrivacyAdminCli(
      [
        "export",
        "--tenant",
        "tenant_1",
        "--user",
        "user_1",
        "--operator",
        "operator@example.local",
        "--output",
        outputPath,
      ],
      {
        stdout,
        utility: { exportData } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(exportData).toHaveBeenCalledWith({
      operator: "operator@example.local",
      tenantId: "tenant_1",
      userId: "user_1",
    });
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toMatchObject({
      account: { id: "user_1" },
      scope: { tenantId: "tenant_1", userId: "user_1" },
    });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"requestId": "request_1"'));
  });

  it("refuses to overwrite an existing export before generating data", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "privacy-admin-cli-"));
    temporaryDirectories.push(directory);
    const outputPath = path.join(directory, "existing.json");
    fs.writeFileSync(outputPath, "keep-me", "utf8");
    const exportData = vi.fn();

    await expect(
      runPrivacyAdminCli(
        [
          "export",
          "--tenant",
          "tenant_1",
          "--user",
          "user_1",
          "--operator",
          "operator@example.local",
          "--output",
          outputPath,
        ],
        {
          utility: { exportData } as never,
        },
      ),
    ).rejects.toThrow("Refusing to overwrite existing output");

    expect(exportData).not.toHaveBeenCalled();
    expect(fs.readFileSync(outputPath, "utf8")).toBe("keep-me");
  });

  it("prints a deletion dry-run without invoking execution", async () => {
    const plan = {
      blocked: false,
      blockedWorkspaces: [],
      confirmation: "DELETE user_1",
      generatedAt: "2026-07-19T12:00:00.000Z",
      impact: {
        deactivatesTenant: false,
        deactivatesWorkspaces: 0,
        removes: { memberships: 1, relationshipNotes: 2 },
        scrubs: {
          aiFeedback: 0,
          auditEvents: 3,
          backgroundJobs: 0,
          draftVersions: 1,
          prospectLists: 0,
          suppressions: 0,
        },
      },
      target: {
        displayName: "Fixture User",
        email: "fixture@example.local",
        tenantId: "tenant_1",
        userId: "user_1",
      },
    };
    const previewDeletion = vi.fn().mockResolvedValue(plan);
    const executeDeletion = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runPrivacyAdminCli(
      [
        "delete",
        "--tenant",
        "tenant_1",
        "--user",
        "user_1",
        "--operator",
        "operator@example.local",
        "--dry-run",
      ],
      {
        stdout,
        utility: { executeDeletion, previewDeletion } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(previewDeletion).toHaveBeenCalledWith({
      operator: "operator@example.local",
      tenantId: "tenant_1",
      userId: "user_1",
    });
    expect(executeDeletion).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(plan, null, 2));
  });

  it("executes deletion only with the forwarded confirmation phrase", async () => {
    const result = {
      deletedAt: "2026-07-19T12:00:00.000Z",
      requestId: "request_delete_1",
      summary: {
        deactivatedTenant: false,
        deactivatedWorkspaces: 0,
        removed: { memberships: 1, relationshipNotes: 0 },
        scrubbed: {
          aiFeedback: 0,
          auditEvents: 1,
          backgroundJobs: 0,
          draftVersions: 0,
          prospectLists: 0,
          suppressions: 0,
        },
      },
    };
    const executeDeletion = vi.fn().mockResolvedValue(result);
    const stdout = vi.fn();

    const exitCode = await runPrivacyAdminCli(
      [
        "delete",
        "--tenant",
        "tenant_1",
        "--user",
        "user_1",
        "--operator",
        "operator@example.local",
        "--execute",
        "--confirm",
        "DELETE user_1",
      ],
      {
        stdout,
        utility: { executeDeletion } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(executeDeletion).toHaveBeenCalledWith(
      {
        operator: "operator@example.local",
        tenantId: "tenant_1",
        userId: "user_1",
      },
      "DELETE user_1",
    );
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });
});
