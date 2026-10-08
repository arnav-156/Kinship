#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runSecurityRegressionCorpus } from "./index";

export interface SecurityRegressionCliDependencies {
  load(path: string): Promise<unknown>;
  stdout?: (value: string) => void;
}

export async function runSecurityRegressionCli(
  args: string[],
  dependencies: SecurityRegressionCliDependencies,
): Promise<number> {
  const corpusPath = parseCorpusPath(args);

  const report = await runSecurityRegressionCorpus(await dependencies.load(corpusPath));
  (dependencies.stdout ?? console.log)(
    JSON.stringify(
      {
        categoryCounts: report.categoryCounts,
        corpus: corpusPath,
        failed: report.failed,
        failures: report.results.filter((result) => !result.passed),
        passed: report.passed,
        total: report.total,
      },
      null,
      2,
    ),
  );
  return report.failed === 0 ? 0 : 1;
}

function parseCorpusPath(args: string[]): string {
  if (args.length === 0) {
    return "packages/testing/src/security-regression/corpus.json";
  }
  if (args.length !== 2 || args[0] !== "--corpus") {
    throw new Error(`Unknown argument: ${args[0] ?? ""}. Use --corpus <path>.`);
  }
  const path = args[1];
  if (!path || path.startsWith("--")) {
    throw new Error("--corpus requires a value");
  }
  return path;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  process.exitCode = await runSecurityRegressionCli(process.argv.slice(2), {
    load: async (path) => JSON.parse(await readFile(resolve(projectRoot, path), "utf8")) as unknown,
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
