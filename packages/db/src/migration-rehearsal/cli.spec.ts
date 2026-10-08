import { describe, expect, it, vi } from "vitest";

import { platformExecutable, runMigrationRehearsalCli } from "./cli";

const migrations = [
  {
    name: "20260703195000_initial",
    sql: 'CREATE TABLE "tenants" ("id" TEXT PRIMARY KEY);',
  },
];

describe("migration rehearsal CLI", () => {
  it("plans without starting a disposable database", async () => {
    const execute = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runMigrationRehearsalCli(["plan"], {
      execute,
      migrations,
      stdout,
    });

    expect(exitCode).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      blockingRiskCount: 0,
      disposable: true,
      loopbackOnly: true,
      migrationCount: 1,
    });
  });

  it("uses the same read-only compatibility plan for dry-run", async () => {
    const execute = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runMigrationRehearsalCli(["run", "--dry-run"], {
      execute,
      migrations,
      stdout,
    });

    expect(exitCode).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes exact confirmation to the disposable rehearsal", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: "passed",
    });
    const stdout = vi.fn();

    const exitCode = await runMigrationRehearsalCli(
      ["run", "--execute", "--confirm", "REHEARSE MIGRATIONS IN A DISPOSABLE DATABASE"],
      { execute, migrations, stdout },
    );

    expect(exitCode).toBe(0);
    expect(execute).toHaveBeenCalledWith("REHEARSE MIGRATIONS IN A DISPOSABLE DATABASE");
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      status: "passed",
    });
  });
});

describe("migration rehearsal process launcher", () => {
  it("uses the command shim required by Windows without enabling a shell", () => {
    expect(platformExecutable("corepack", "win32")).toBe("corepack.cmd");
    expect(platformExecutable("corepack", "linux")).toBe("corepack");
    expect(platformExecutable("docker", "win32")).toBe("docker");
  });
});
