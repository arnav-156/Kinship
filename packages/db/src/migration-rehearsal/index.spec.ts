import { describe, expect, it, vi } from "vitest";

import {
  analyzeMigrationCompatibility,
  type CommandRequest,
  MigrationRehearsalRunner,
  parseLoopbackDockerPort,
} from "./index";

const CONFIRMATION = "REHEARSE MIGRATIONS IN A DISPOSABLE DATABASE";

function safeMigrations() {
  return [
    {
      name: "20260703195000_initial",
      sql: 'CREATE TABLE "tenants" ("id" TEXT PRIMARY KEY);',
    },
    {
      name: "20260725111000_demo_marker",
      sql: 'ALTER TABLE "tenants" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;',
    },
  ];
}

describe("migration compatibility analysis", () => {
  it("flags destructive statements unless the migration explicitly documents approval", () => {
    const risks = analyzeMigrationCompatibility([
      {
        name: "20260726090000_remove_legacy",
        sql: 'ALTER TABLE "tenants" DROP COLUMN "legacy_name";',
      },
      {
        name: "20260726100000_approved_cleanup",
        sql: ["-- rehearsal: allow-destructive", 'DROP TABLE "expired_demo_rows";'].join("\n"),
      },
    ]);

    expect(risks).toEqual([
      expect.objectContaining({
        approved: false,
        migration: "20260726090000_remove_legacy",
        rule: "drop-column",
      }),
      expect.objectContaining({
        approved: true,
        migration: "20260726100000_approved_cleanup",
        rule: "drop-table",
      }),
    ]);
  });
});

describe("disposable Docker port parsing", () => {
  it("accepts only a loopback IPv4 host binding", () => {
    expect(parseLoopbackDockerPort("127.0.0.1:49155\n")).toBe(49155);
    expect(() => parseLoopbackDockerPort("0.0.0.0:49155\n")).toThrow("loopback-bound");
  });
});

describe("migration rehearsal runner", () => {
  it("requires exact confirmation before starting Docker", async () => {
    const command = vi.fn();
    const runner = new MigrationRehearsalRunner({
      command,
      migrations: safeMigrations(),
      password: "disposable-secret",
      projectRoot: "C:\\repo",
      runId: "fixture",
      sleep: vi.fn(),
    });

    await expect(runner.execute("WRONG")).rejects.toThrow(CONFIRMATION);
    expect(command).not.toHaveBeenCalled();
  });

  it("rehearses a clean deploy and ordered upgrade, then removes its container", async () => {
    const requests: CommandRequest[] = [];
    let createDatabaseAttempts = 0;
    const command = vi.fn(async (request: CommandRequest) => {
      requests.push(request);
      if (request.command === "docker" && request.args[0] === "port") {
        return { stderr: "", stdout: "127.0.0.1:49155\n" };
      }
      if (
        request.command === "docker" &&
        request.args[0] === "exec" &&
        request.args.includes("createdb")
      ) {
        createDatabaseAttempts += 1;
        if (createDatabaseAttempts === 1) {
          return {
            exitCode: 1,
            stderr: "the database system is shutting down",
            stdout: "",
          };
        }
      }
      return { stderr: "", stdout: "ok" };
    });
    const runner = new MigrationRehearsalRunner({
      command,
      migrations: safeMigrations(),
      password: "disposable-secret",
      projectRoot: "C:\\repo",
      runId: "fixture",
      sleep: vi.fn(),
    });

    const result = await runner.execute(CONFIRMATION);

    expect(result).toEqual({
      compatibilityRisks: [],
      containerName: "relationship-migration-rehearsal-fixture",
      databases: {
        cleanDeploy: "compatible",
        orderedUpgrade: "compatible",
      },
      latestMigration: "20260725111000_demo_marker",
      migrationCount: 2,
      status: "passed",
    });
    expect(
      requests.some(({ args, command }) => command === process.execPath && args.includes("deploy")),
    ).toBe(true);
    expect(
      requests.filter(
        ({ args, command }) =>
          command === "docker" && args[0] === "exec" && args.includes("createdb"),
      ),
    ).toHaveLength(2);
    expect(
      requests.filter(
        ({ args, command }) =>
          command === "docker" &&
          args[0] === "exec" &&
          args.includes("relationship_upgrade") &&
          args.includes("psql"),
      ),
    ).toHaveLength(2);
    expect(
      requests.filter(({ args, command }) => command === process.execPath && args.includes("diff")),
    ).toHaveLength(2);
    expect(requests.at(-1)).toMatchObject({
      args: ["rm", "--force", "relationship-migration-rehearsal-fixture"],
      command: "docker",
    });
    expect(
      JSON.stringify(
        requests.map(({ args, command, input }) => ({
          args,
          command,
          input,
        })),
      ),
    ).not.toContain("disposable-secret");
    expect(JSON.stringify(result)).not.toContain("disposable-secret");
  });

  it("removes the disposable container after a rehearsal failure", async () => {
    const requests: CommandRequest[] = [];
    const command = vi.fn(async (request: CommandRequest) => {
      requests.push(request);
      if (request.command === "docker" && request.args[0] === "port") {
        return { stderr: "", stdout: "127.0.0.1:49155\n" };
      }
      if (request.command === process.execPath && request.args.includes("deploy")) {
        throw new Error("migration failed");
      }
      return { stderr: "", stdout: "ok" };
    });
    const runner = new MigrationRehearsalRunner({
      command,
      migrations: safeMigrations(),
      password: "disposable-secret",
      projectRoot: "C:\\repo",
      runId: "fixture",
      sleep: vi.fn(),
    });

    await expect(runner.execute(CONFIRMATION)).rejects.toThrow("migration failed");
    expect(requests.at(-1)).toMatchObject({
      args: ["rm", "--force", "relationship-migration-rehearsal-fixture"],
      command: "docker",
    });
  });
});
