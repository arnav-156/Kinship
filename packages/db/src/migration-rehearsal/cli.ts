#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  analyzeMigrationCompatibility,
  type CommandRequest,
  type CommandResult,
  MIGRATION_REHEARSAL_CONFIRMATION,
  type MigrationRehearsalReport,
  MigrationRehearsalRunner,
  type MigrationSource,
} from "./index";

export interface MigrationRehearsalCliDependencies {
  execute(confirmation: string): Promise<MigrationRehearsalReport>;
  migrations: MigrationSource[];
  stdout?: (value: string) => void;
}

export async function runMigrationRehearsalCli(
  args: string[],
  dependencies: MigrationRehearsalCliDependencies,
): Promise<number> {
  const command = args[0];
  const stdout = dependencies.stdout ?? console.log;
  const plan = buildPlan(dependencies.migrations);

  if (command === "plan") {
    stdout(JSON.stringify(plan, null, 2));
    return plan.blockingRiskCount === 0 ? 0 : 1;
  }

  if (command !== "run") {
    throw new Error("Unknown command. Use plan or run.");
  }
  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");
  if (dryRun === execute) {
    throw new Error("Run requires exactly one of --dry-run or --execute");
  }
  if (dryRun) {
    stdout(JSON.stringify(plan, null, 2));
    return plan.blockingRiskCount === 0 ? 0 : 1;
  }

  const result = await dependencies.execute(requiredOption(args, "--confirm"));
  stdout(JSON.stringify(result, null, 2));
  return 0;
}

function buildPlan(migrations: MigrationSource[]) {
  const sorted = [...migrations].sort((left, right) => left.name.localeCompare(right.name));
  const compatibilityRisks = analyzeMigrationCompatibility(sorted);
  return {
    blockingRiskCount: compatibilityRisks.filter((risk) => !risk.approved).length,
    compatibilityRisks,
    confirmation: MIGRATION_REHEARSAL_CONFIRMATION,
    disposable: true,
    image: process.env["MIGRATION_REHEARSAL_IMAGE"] ?? "pgvector/pgvector:pg16",
    latestMigration: sorted.at(-1)?.name ?? null,
    loopbackOnly: true,
    migrationCount: sorted.length,
  };
}

function requiredOption(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function loadMigrations(projectRoot: string): MigrationSource[] {
  const migrationsDirectory = join(projectRoot, "packages", "db", "prisma", "migrations");
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      sql: readFileSync(join(migrationsDirectory, entry.name, "migration.sql"), "utf8"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function executeCommand(request: CommandRequest): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(platformExecutable(request.command), request.args, {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", rejectCommand);
    child.on("close", (exitCode) => {
      const result = { exitCode: exitCode ?? 1, stderr, stdout };
      if (result.exitCode === 0 || request.allowFailure) {
        resolveCommand(result);
        return;
      }
      rejectCommand(
        new Error(
          `${request.command} ${request.args.join(" ")} failed with exit code ${
            result.exitCode
          }${safeDiagnostic(stderr, request.env)}`,
        ),
      );
    });
    child.stdin.end(request.input);
  });
}

function safeDiagnostic(stderr: string, secretEnvironment: NodeJS.ProcessEnv | undefined): string {
  let diagnostic = stderr.trim();
  for (const secret of Object.values(secretEnvironment ?? {})) {
    if (secret) diagnostic = diagnostic.replaceAll(secret, "[redacted]");
  }
  return diagnostic ? `: ${diagnostic}` : "";
}

export function platformExecutable(
  command: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" && command === "corepack" ? "corepack.cmd" : command;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const migrations = loadMigrations(projectRoot);
  const execute = async (confirmation: string) => {
    const runner = new MigrationRehearsalRunner({
      command: executeCommand,
      image: process.env["MIGRATION_REHEARSAL_IMAGE"],
      migrations,
      password: randomBytes(32).toString("base64url"),
      projectRoot,
      runId: `${Date.now()}-${process.pid}`,
      sleep: (milliseconds) =>
        new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
    });
    return runner.execute(confirmation);
  };
  process.exitCode = await runMigrationRehearsalCli(process.argv.slice(2), {
    execute,
    migrations,
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
