#!/usr/bin/env node
import { createHttpExecutor, type LiveSloContext } from "./http";
import { DEFAULT_SLO_TARGETS, runSloLoad, type SloTargetName } from "./index";

export const SLO_LIVE_CONFIRMATION = "RUN CONTROLLED SLO LOAD TEST WITH WRITES";

type SloLoadReport = Awaited<ReturnType<typeof runSloLoad>>;

export interface SloCliRunOptions {
  concurrency: number;
  context?: LiveSloContext;
  iterations: number;
  mode: "live" | "scenario";
}

export interface SloLoadCliDependencies {
  env?: NodeJS.ProcessEnv;
  run(options: SloCliRunOptions): Promise<SloLoadReport>;
  stdout?: (value: string) => void;
}

export async function runSloLoadCli(
  args: string[],
  dependencies: SloLoadCliDependencies,
): Promise<number> {
  const command = args[0];
  const stdout = dependencies.stdout ?? console.log;

  if (command === "plan") {
    stdout(JSON.stringify(buildPlan(), null, 2));
    return 0;
  }
  if (command !== "run") {
    throw new Error("Unknown command. Use plan or run.");
  }

  const scenario = args.includes("--scenario");
  const execute = args.includes("--execute");
  if (scenario === execute) {
    throw new Error("Run requires exactly one of --scenario or --execute");
  }
  if (args.includes("--token")) {
    throw new Error("Tokens must be supplied through --token-env");
  }

  const iterations = boundedIntegerOption(args, "--iterations", scenario ? 20 : 3, 100);
  const concurrency = boundedIntegerOption(args, "--concurrency", scenario ? 4 : 1, 10);

  const options: SloCliRunOptions = {
    concurrency,
    iterations,
    mode: scenario ? "scenario" : "live",
  };

  if (execute) {
    const confirmation = optionalOption(args, "--confirm");
    if (confirmation !== SLO_LIVE_CONFIRMATION) {
      throw new Error(`--confirm must equal "${SLO_LIVE_CONFIRMATION}"`);
    }
    const env = dependencies.env ?? process.env;
    const tokenEnvironment = requiredOption(args, "--token-env");
    options.context = {
      apiBaseUrl: requiredEnvironment(env, "SLO_API_BASE_URL"),
      briefId: requiredEnvironment(env, "SLO_BRIEF_ID"),
      entityId: requiredEnvironment(env, "SLO_ENTITY_ID"),
      token: requiredEnvironment(env, tokenEnvironment),
      url: requiredEnvironment(env, "SLO_URL"),
      workspaceId: requiredEnvironment(env, "SLO_WORKSPACE_ID"),
    };
  }

  const report = await dependencies.run(options);
  stdout(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

function buildPlan() {
  return {
    confirmation: SLO_LIVE_CONFIRMATION,
    limits: { concurrency: 10, iterations: 100 },
    liveWrites: ["urlAnalysis", "brief", "draft"] satisfies SloTargetName[],
    scenario: "deterministic-no-network",
    targets: DEFAULT_SLO_TARGETS,
  };
}

function boundedIntegerOption(
  args: string[],
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const rawValue = optionalOption(args, name);
  const value = rawValue === undefined ? defaultValue : Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name.slice(2)} must be between 1 and ${maximum}`);
  }
  return value;
}

function optionalOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function requiredOption(args: string[], name: string): string {
  const value = optionalOption(args, name);
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const scenarioDurations: Record<SloTargetName, number> = {
  brief: 600,
  draft: 700,
  search: 80,
  urlAnalysis: 250,
  workspace: 25,
};

async function execute(options: SloCliRunOptions): Promise<SloLoadReport> {
  const executeTarget =
    options.mode === "live"
      ? createHttpExecutor(options.context!)
      : async (target: (typeof DEFAULT_SLO_TARGETS)[number]) => ({
          durationMs: scenarioDurations[target.name],
          status: 200,
        });
  return runSloLoad({
    concurrency: options.concurrency,
    execute: executeTarget,
    iterations: options.iterations,
    targets: DEFAULT_SLO_TARGETS,
  });
}

async function main(): Promise<void> {
  process.exitCode = await runSloLoadCli(process.argv.slice(2), { run: execute });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
