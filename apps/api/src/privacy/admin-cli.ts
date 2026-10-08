import fs from "node:fs";
import path from "node:path";

import type { AdminDataTarget } from "./admin-data-lifecycle";

export interface PrivacyAdminUtility {
  executeDeletion(target: AdminDataTarget, confirmation: string): Promise<unknown>;
  exportData(target: AdminDataTarget): Promise<{
    expiresAt: string | null;
    requestId: string;
    snapshot: unknown;
  }>;
  previewDeletion(target: AdminDataTarget): Promise<{
    blocked: boolean;
    [key: string]: unknown;
  }>;
}

export interface PrivacyAdminCliDependencies {
  stdout?: (value: string) => void;
  utility: PrivacyAdminUtility;
}

export async function runPrivacyAdminCli(
  args: string[],
  dependencies: PrivacyAdminCliDependencies,
): Promise<number> {
  const command = args[0];
  const target: AdminDataTarget = {
    operator: requiredOption(args, "--operator"),
    tenantId: requiredOption(args, "--tenant"),
    userId: requiredOption(args, "--user"),
  };
  const stdout = dependencies.stdout ?? console.log;

  if (command === "export") {
    const outputPath = path.resolve(requiredOption(args, "--output"));
    if (fs.existsSync(outputPath)) {
      throw new Error(`Refusing to overwrite existing output: ${outputPath}`);
    }
    const result = await dependencies.utility.exportData(target);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result.snapshot, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    stdout(
      JSON.stringify(
        {
          command,
          expiresAt: result.expiresAt,
          output: outputPath,
          requestId: result.requestId,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (command === "delete") {
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Delete requires exactly one of --dry-run or --execute");
    }
    if (dryRun) {
      const plan = await dependencies.utility.previewDeletion(target);
      stdout(JSON.stringify(plan, null, 2));
      return plan.blocked ? 2 : 0;
    }
    const confirmation = requiredOption(args, "--confirm");
    const result = await dependencies.utility.executeDeletion(target, confirmation);
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  throw new Error("Unknown command. Use export or delete.");
}

function requiredOption(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
