import { describe, expect, it, vi } from "vitest";

import type { CommandRequest } from "../migration-rehearsal";
import { BackupRestorationVerifier } from "./index";

const CONFIRMATION = "VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE";

describe("backup restoration verifier", () => {
  it("requires exact confirmation before starting a disposable database", async () => {
    const command = vi.fn();
    const verifier = new BackupRestorationVerifier({
      command,
      password: "disposable-secret",
      projectRoot: "C:\\repo",
      runId: "fixture",
      sleep: vi.fn(),
    });

    await expect(verifier.execute("WRONG")).rejects.toThrow(
      'Confirmation must exactly match "VERIFY BACKUP RESTORE IN A DISPOSABLE DATABASE"',
    );
    expect(command).not.toHaveBeenCalled();
  });

  it("proves a custom-format archive restores compatible schema and canary data", async () => {
    const requests: CommandRequest[] = [];
    const archiveHash = "a".repeat(64);
    const canaryFingerprint = "b".repeat(32);
    const command = vi.fn(async (request: CommandRequest) => {
      requests.push(request);
      if (request.command === "docker" && request.args[0] === "port") {
        return { stderr: "", stdout: "127.0.0.1:49155\n" };
      }
      if (request.args.includes("stat")) {
        return { stderr: "", stdout: "4096\n" };
      }
      if (request.args.includes("sha256sum")) {
        return {
          stderr: "",
          stdout: `${archiveHash}  /tmp/relationship-backup.dump\n`,
        };
      }
      if (request.args.includes("psql") && request.args.includes("--tuples-only")) {
        return { stderr: "", stdout: `${canaryFingerprint}\n` };
      }
      return { stderr: "", stdout: "ok" };
    });
    const verifier = new BackupRestorationVerifier({
      command,
      password: "disposable-secret",
      projectRoot: "C:\\repo",
      runId: "fixture",
      sleep: vi.fn(),
    });

    const report = await verifier.execute(CONFIRMATION);

    expect(report).toEqual({
      archive: {
        bytes: 4096,
        format: "custom",
        sha256: archiveHash,
      },
      canary: {
        matches: true,
        restoredFingerprint: canaryFingerprint,
        sourceFingerprint: canaryFingerprint,
      },
      containerName: "relationship-backup-verification-fixture",
      databases: {
        restored: "schema-and-data-compatible",
        source: "migrated-and-backed-up",
      },
      status: "passed",
    });
    expect(requests.at(-1)).toMatchObject({
      args: ["rm", "--force", "relationship-backup-verification-fixture"],
      command: "docker",
    });
    expect(
      JSON.stringify(requests.map(({ args, command, input }) => ({ args, command, input }))),
    ).not.toContain("disposable-secret");
    expect(JSON.stringify(report)).not.toContain("disposable-secret");
  });

  it("fails closed and cleans up when restored data differs from the source", async () => {
    const requests: CommandRequest[] = [];
    let fingerprintReads = 0;
    const command = vi.fn(async (request: CommandRequest) => {
      requests.push(request);
      if (request.command === "docker" && request.args[0] === "port") {
        return { stderr: "", stdout: "127.0.0.1:49155\n" };
      }
      if (request.args.includes("stat")) {
        return { stderr: "", stdout: "4096\n" };
      }
      if (request.args.includes("sha256sum")) {
        return {
          stderr: "",
          stdout: `${"a".repeat(64)}  /tmp/relationship-backup.dump\n`,
        };
      }
      if (request.args.includes("psql") && request.args.includes("--tuples-only")) {
        fingerprintReads += 1;
        return {
          stderr: "",
          stdout: fingerprintReads === 1 ? `${"b".repeat(32)}\n` : `${"c".repeat(32)}\n`,
        };
      }
      return { stderr: "", stdout: "ok" };
    });
    const verifier = new BackupRestorationVerifier({
      command,
      password: "disposable-secret",
      projectRoot: "C:\\repo",
      runId: "fixture",
      sleep: vi.fn(),
    });

    await expect(verifier.execute(CONFIRMATION)).rejects.toThrow(
      "Restored canary fingerprint mismatch",
    );
    expect(requests.at(-1)).toMatchObject({
      args: ["rm", "--force", "relationship-backup-verification-fixture"],
      command: "docker",
    });
  });
});
