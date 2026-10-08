#!/usr/bin/env node
import { randomBytes } from "node:crypto";

import { executeCommand } from "../migration-rehearsal/cli";
import {
  BACKUP_VERIFICATION_CONFIRMATION,
  type BackupVerificationReport,
  BackupRestorationVerifier,
} from "./index";

export interface BackupVerificationCliDependencies {
  execute(confirmation: string): Promise<BackupVerificationReport>;
  stdout?: (value: string) => void;
}

export async function runBackupVerificationCli(
  args: string[],
  dependencies: BackupVerificationCliDependencies,
): Promise<number> {
  const command = args[0];
  if (command !== "plan" && command !== "run") {
    throw new Error("Unknown command. Use plan or run.");
  }
  const stdout = dependencies.stdout ?? console.log;
  if (command === "run") {
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Run requires exactly one of --dry-run or --execute");
    }
    if (execute) {
      const report = await dependencies.execute(requiredOption(args, "--confirm"));
      stdout(JSON.stringify(report, null, 2));
      return 0;
    }
  }
  stdout(JSON.stringify(buildPlan(), null, 2));
  return 0;
}

function buildPlan() {
  return {
    archiveFormat: "custom",
    confirmation: BACKUP_VERIFICATION_CONFIRMATION,
    disposable: true,
    image: process.env["BACKUP_VERIFICATION_IMAGE"] ?? "pgvector/pgvector:pg16",
    loopbackOnly: true,
    sourceData: "synthetic-canary-only",
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

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const execute = async (confirmation: string) => {
    const verifier = new BackupRestorationVerifier({
      command: executeCommand,
      image: process.env["BACKUP_VERIFICATION_IMAGE"],
      password: randomBytes(32).toString("base64url"),
      projectRoot,
      runId: `${Date.now()}-${process.pid}`,
      sleep: (milliseconds) =>
        new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
    });
    return verifier.execute(confirmation);
  };
  process.exitCode = await runBackupVerificationCli(process.argv.slice(2), { execute });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
