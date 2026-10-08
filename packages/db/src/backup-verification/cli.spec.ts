import { describe, expect, it, vi } from "vitest";

import { runBackupVerificationCli } from "./cli";

describe("backup restoration verification CLI", () => {
  it("plans the isolated drill without starting Docker", async () => {
    const execute = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runBackupVerificationCli(["plan"], {
      execute,
      stdout,
    });

    expect(exitCode).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      archiveFormat: "custom",
      confirmation: "VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE",
      disposable: true,
      loopbackOnly: true,
      sourceData: "synthetic-canary-only",
    });
  });

  it("uses the same read-only plan for run dry-run", async () => {
    const execute = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runBackupVerificationCli(["run", "--dry-run"], {
      execute,
      stdout,
    });

    expect(exitCode).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      disposable: true,
    });
  });

  it("passes exact confirmation to the live disposable restore drill", async () => {
    const execute = vi.fn().mockResolvedValue({
      archive: { bytes: 4096, format: "custom", sha256: "a".repeat(64) },
      status: "passed",
    });
    const stdout = vi.fn();

    const exitCode = await runBackupVerificationCli(
      ["run", "--execute", "--confirm", "VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE"],
      {
        execute,
        stdout,
      },
    );

    expect(exitCode).toBe(0);
    expect(execute).toHaveBeenCalledWith("VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE");
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      archive: {
        bytes: 4096,
        format: "custom",
      },
      status: "passed",
    });
  });
});
