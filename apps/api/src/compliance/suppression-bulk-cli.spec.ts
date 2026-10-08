import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runSuppressionBulkCli } from "./suppression-bulk-cli";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("suppression bulk CLI", () => {
  it("writes a new hash-only CSV export", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suppression-bulk-cli-"));
    temporaryDirectories.push(directory);
    const outputPath = path.join(directory, "suppressions.csv");
    const csv = `workspace_id,channel_type,value,value_hash,reason,source\n,email,,${"a".repeat(64)},Opted out,manual\n`;
    const exportCsv = vi.fn().mockResolvedValue({
      count: 1,
      csv,
      generatedAt: "2026-07-19T12:00:00.000Z",
    });
    const stdout = vi.fn();

    const exitCode = await runSuppressionBulkCli(
      ["export", "--tenant", "tenant_1", "--operator", "fixture-operator", "--output", outputPath],
      { stdout, utility: { exportCsv } as never },
    );

    expect(exitCode).toBe(0);
    expect(fs.readFileSync(outputPath, "utf8")).toBe(csv);
    expect(exportCsv).toHaveBeenCalledWith({
      operator: "fixture-operator",
      tenantId: "tenant_1",
    });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"count": 1'));
  });

  it("prints an import dry-run without invoking execution", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suppression-bulk-cli-"));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "suppressions.csv");
    const csv = `workspace_id,channel_type,value,value_hash,reason,source\n,email,ada@example.com,,Opted out,manual\n`;
    fs.writeFileSync(inputPath, csv, "utf8");
    const plan = {
      confirmation: "IMPORT 1 SUPPRESSIONS tenant_1",
      count: 1,
      created: 1,
      entries: [
        {
          action: "create",
          channelType: "email",
          row: 2,
          valueHash: "a".repeat(64),
          workspaceId: null,
        },
      ],
      generatedAt: "2026-07-19T12:00:00.000Z",
      reactivated: 0,
      updated: 0,
    };
    const previewImport = vi.fn().mockResolvedValue(plan);
    const executeImport = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runSuppressionBulkCli(
      [
        "import",
        "--tenant",
        "tenant_1",
        "--operator",
        "fixture-operator",
        "--input",
        inputPath,
        "--dry-run",
      ],
      {
        stdout,
        utility: { executeImport, previewImport } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(previewImport).toHaveBeenCalledWith(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      csv,
    );
    expect(executeImport).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(plan, null, 2));
  });

  it("dispatches an explicitly confirmed import", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suppression-bulk-cli-"));
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "suppressions.csv");
    const csv = `workspace_id,channel_type,value,value_hash,reason,source\n,email,ada@example.com,,Opted out,manual\n`;
    fs.writeFileSync(inputPath, csv, "utf8");
    const result = {
      auditEventId: "audit_1",
      count: 1,
      created: 1,
      importedAt: "2026-07-19T12:00:00.000Z",
      reactivated: 0,
      updated: 0,
    };
    const executeImport = vi.fn().mockResolvedValue(result);
    const previewImport = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runSuppressionBulkCli(
      [
        "import",
        "--tenant",
        "tenant_1",
        "--operator",
        "fixture-operator",
        "--input",
        inputPath,
        "--execute",
        "--confirm",
        "IMPORT 1 SUPPRESSIONS tenant_1",
      ],
      {
        stdout,
        utility: { executeImport, previewImport } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(previewImport).not.toHaveBeenCalled();
    expect(executeImport).toHaveBeenCalledWith(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      csv,
      "IMPORT 1 SUPPRESSIONS tenant_1",
    );
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });
});
