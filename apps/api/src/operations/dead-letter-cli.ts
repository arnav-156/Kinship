import type { DeadLetterListOptions, DeadLetterTarget } from "./dead-letter";

export interface DeadLetterCliUtility {
  executeReplay(target: DeadLetterTarget, jobId: string, confirmation: string): Promise<unknown>;
  inspect(target: DeadLetterTarget, jobId: string): Promise<unknown>;
  list(target: DeadLetterTarget, options: DeadLetterListOptions): Promise<unknown>;
}

export interface DeadLetterCliDependencies {
  stdout?: (value: string) => void;
  utility: DeadLetterCliUtility;
}

export async function runDeadLetterCli(
  args: string[],
  dependencies: DeadLetterCliDependencies,
): Promise<number> {
  const command = args[0];
  const target: DeadLetterTarget = {
    operator: requiredOption(args, "--operator"),
    tenantId: requiredOption(args, "--tenant"),
  };
  const stdout = dependencies.stdout ?? console.log;

  if (command === "list") {
    const workspaceId = optionalOption(args, "--workspace");
    const limitValue = optionalOption(args, "--limit");
    const result = await dependencies.utility.list(target, {
      ...(limitValue ? { limit: Number(limitValue) } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    });
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  if (command === "inspect") {
    const result = await dependencies.utility.inspect(target, requiredOption(args, "--job"));
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  if (command === "replay") {
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Replay requires exactly one of --dry-run or --execute");
    }
    const jobId = requiredOption(args, "--job");
    if (dryRun) {
      const result = await dependencies.utility.inspect(target, jobId);
      stdout(JSON.stringify(result, null, 2));
      return 0;
    }

    const confirmation = requiredOption(args, "--confirm");
    const result = await dependencies.utility.executeReplay(target, jobId, confirmation);
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  throw new Error("Unknown command. Use list, inspect, or replay.");
}

function optionalOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function requiredOption(args: string[], name: string): string {
  const value = optionalOption(args, name);
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}
