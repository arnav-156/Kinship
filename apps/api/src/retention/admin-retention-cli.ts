import type { RetentionAdminTarget } from "./admin-retention";

export interface RetentionAdminUtilityClient {
  execute(target: RetentionAdminTarget, confirmation: string): Promise<unknown>;
  preview(target: RetentionAdminTarget): Promise<unknown>;
}

export interface RetentionAdminCliDependencies {
  stdout?: (value: string) => void;
  utility: RetentionAdminUtilityClient;
}

export async function runRetentionAdminCli(
  args: string[],
  dependencies: RetentionAdminCliDependencies,
): Promise<number> {
  const command = args[0];
  if (command !== "cleanup") {
    throw new Error("Unknown command. Use cleanup.");
  }

  const dryRun = args.includes("--dry-run");
  const execute = args.includes("--execute");
  if (dryRun === execute) {
    throw new Error("Cleanup requires exactly one of --dry-run or --execute");
  }

  const target: RetentionAdminTarget = {
    operator: requiredOption(args, "--operator"),
    tenantId: requiredOption(args, "--tenant"),
    workspaceId: requiredOption(args, "--workspace"),
  };
  const stdout = dependencies.stdout ?? console.log;

  if (dryRun) {
    const plan = await dependencies.utility.preview(target);
    stdout(JSON.stringify(plan, null, 2));
    return 0;
  }

  const confirmation = requiredOption(args, "--confirm");
  const result = await dependencies.utility.execute(target, confirmation);
  stdout(JSON.stringify(result, null, 2));
  return 0;
}

function requiredOption(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
