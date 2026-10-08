import type { ConnectorTokenRotationInput, ConnectorTokenTarget } from "./connector-token";

export interface ConnectorTokenCliUtility {
  executeRotation(
    target: ConnectorTokenTarget,
    input: ConnectorTokenRotationInput,
    confirmation: string,
  ): Promise<unknown>;
  executeRevocation(target: ConnectorTokenTarget, confirmation: string): Promise<unknown>;
  inspect(target: ConnectorTokenTarget): Promise<unknown>;
  previewRevocation(target: ConnectorTokenTarget): Promise<unknown>;
  previewRotation(
    target: ConnectorTokenTarget,
    input: ConnectorTokenRotationInput,
  ): Promise<unknown>;
}

export interface ConnectorTokenCliDependencies {
  env?: NodeJS.ProcessEnv;
  stdout?: (value: string) => void;
  utility: ConnectorTokenCliUtility;
}

export async function runConnectorTokenCli(
  args: string[],
  dependencies: ConnectorTokenCliDependencies,
): Promise<number> {
  const command = args[0];
  const target: ConnectorTokenTarget = {
    connectorId: requiredOption(args, "--connector"),
    operator: requiredOption(args, "--operator"),
    tenantId: requiredOption(args, "--tenant"),
    workspaceId: requiredOption(args, "--workspace"),
  };
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? console.log;

  if (command === "inspect") {
    const result = await dependencies.utility.inspect(target);
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  if (command === "rotate") {
    if (args.includes("--token")) {
      throw new Error(
        "Plaintext connector tokens are not accepted; use --token-env with a protected environment variable",
      );
    }
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Rotation requires exactly one of --dry-run or --execute");
    }
    const tokenEnvironmentName = requiredOption(args, "--token-env");
    const keyEnvironmentName =
      optionalOption(args, "--key-env") ?? "CONNECTOR_TOKEN_ENCRYPTION_KEY";
    const input: ConnectorTokenRotationInput = {
      encryptionKey: Buffer.from(requiredEnvironment(env, keyEnvironmentName), "base64"),
      keyVersion: requiredOption(args, "--key-version"),
      token: requiredEnvironment(env, tokenEnvironmentName),
    };
    if (dryRun) {
      const result = await dependencies.utility.previewRotation(target, input);
      stdout(JSON.stringify(result, null, 2));
      return 0;
    }
    const result = await dependencies.utility.executeRotation(
      target,
      input,
      requiredOption(args, "--confirm"),
    );
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  if (command === "revoke") {
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Revocation requires exactly one of --dry-run or --execute");
    }
    if (dryRun) {
      const result = await dependencies.utility.previewRevocation(target);
      stdout(JSON.stringify(result, null, 2));
      return 0;
    }
    const result = await dependencies.utility.executeRevocation(
      target,
      requiredOption(args, "--confirm"),
    );
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  throw new Error("Unknown command. Use inspect, rotate, or revoke.");
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
