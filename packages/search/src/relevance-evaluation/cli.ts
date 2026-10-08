#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  digestRelevanceDataset,
  evaluateRelevanceDataset,
  parseRelevanceDataset,
  type RelevanceEvaluationOptions,
  type RelevanceMetrics,
} from "./index";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift() ?? "evaluate";
  const datasetPath = requiredPositional(args, "labeled query set JSON path");
  const dataset = loadJson(datasetPath);

  switch (command) {
    case "validate": {
      const parsed = parseRelevanceDataset(dataset);
      print({
        cutoff: parsed.cutoff,
        datasetDigest: digestRelevanceDataset(parsed),
        datasetId: parsed.datasetId,
        queryCount: parsed.queries.length,
        valid: true,
      });
      return;
    }
    case "evaluate": {
      const report = evaluateRelevanceDataset(dataset, readOptions(args));
      const output = optionalOption(args, "--output");
      if (output) {
        writeNewJson(output, report);
      }
      print(report);
      if (!report.passed) {
        process.exitCode = 2;
      }
      return;
    }
    default:
      throw new Error("Unknown command. Use validate or evaluate.");
  }
}

function readOptions(args: string[]): RelevanceEvaluationOptions {
  const minimums: Partial<RelevanceMetrics> = {};
  assignNumberOption(args, "--min-hit-rate", minimums, "hitRateAtK");
  assignNumberOption(args, "--min-mrr", minimums, "meanReciprocalRank");
  assignNumberOption(args, "--min-ndcg", minimums, "ndcgAtK");
  assignNumberOption(args, "--min-precision", minimums, "precisionAtK");
  assignNumberOption(args, "--min-recall", minimums, "recallAtK");
  const cutoff = optionalNumberOption(args, "--k");
  return {
    cutoff,
    minimums,
  };
}

function assignNumberOption(
  args: string[],
  option: string,
  target: Partial<RelevanceMetrics>,
  metric: keyof RelevanceMetrics,
): void {
  const value = optionalNumberOption(args, option);
  if (value !== undefined) {
    target[metric] = value;
  }
}

function loadJson(file: string): unknown {
  const resolved = path.resolve(file);
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read JSON ${resolved}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeNewJson(file: string, value: unknown): void {
  const resolved = path.resolve(file);
  if (fs.existsSync(resolved)) {
    throw new Error(`Refusing to overwrite existing output: ${resolved}`);
  }
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.error(`wrote ${resolved}`);
}

function requiredPositional(args: string[], label: string): string {
  const value = args[0];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function optionalOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function optionalNumberOption(args: string[], name: string): number | undefined {
  const raw = optionalOption(args, name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
