import type { DemoWorkspaceInput, DemoWorkspaceTarget } from "./demo-workspace";

export interface DemoWorkspaceCliUtility {
  execute(
    target: DemoWorkspaceTarget,
    input: DemoWorkspaceInput,
    confirmation: string,
  ): Promise<unknown>;
  preview(target: DemoWorkspaceTarget): Promise<unknown>;
}

export interface DemoWorkspaceCliDependencies {
  env?: NodeJS.ProcessEnv;
  hashPassword(password: string): Promise<string>;
  stdout?: (value: string) => void;
  utility: DemoWorkspaceCliUtility;
}

export async function runDemoWorkspaceCli(
  args: string[],
  dependencies: DemoWorkspaceCliDependencies,
): Promise<number> {
  const command = args[0];
  const target = {
    operator: requiredOption(args, "--operator"),
  };
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? console.log;

  if (command === "preview") {
    const result = await dependencies.utility.preview(target);
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  if (command === "generate") {
    if (args.includes("--password")) {
      throw new Error(
        "Plaintext demo passwords are not accepted; use --password-env with a protected environment variable",
      );
    }
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Generation requires exactly one of --dry-run or --execute");
    }
    if (dryRun) {
      const result = await dependencies.utility.preview(target);
      stdout(JSON.stringify(result, null, 2));
      return 0;
    }
    const passwordEnvironmentName = requiredOption(args, "--password-env");
    const password = requiredEnvironment(env, passwordEnvironmentName);
    const passwordHash = await dependencies.hashPassword(password);
    const result = await dependencies.utility.execute(
      target,
      { passwordHash },
      requiredOption(args, "--confirm"),
    );
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  throw new Error("Unknown command. Use preview or generate.");
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

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}
