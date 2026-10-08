#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { createModelGateway } from "../index";
import {
  digestAiGoldenSet,
  parseAiGoldenSet,
  runAiGoldenSet,
  type AiGoldenRunOptions,
  type AiGoldenThresholds,
} from "./index";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift() ?? "run";
  const suitePath = requiredPositional(args, "golden-set JSON path");
  const suiteValue = loadJson(suitePath);

  switch (command) {
    case "validate": {
      const suite = parseAiGoldenSet(suiteValue);
      print({
        caseCount: suite.cases.length,
        suiteDigest: digestAiGoldenSet(suite),
        suiteId: suite.suiteId,
        valid: true,
      });
      return;
    }
    case "run": {
      const provider = optionalOption(args, "--provider") ?? "mock";
      if (provider !== "mock" && provider !== "openai-compatible") {
        throw new Error("--provider must be mock or openai-compatible");
      }
      if (provider === "openai-compatible" && !process.env["OPENAI_API_KEY"]?.trim()) {
        throw new Error("OPENAI_API_KEY is required for the openai-compatible provider");
      }
      const model =
        optionalOption(args, "--model") ??
        (provider === "mock"
          ? "mock-relationship-model"
          : (process.env["OPENAI_CHAT_MODEL"] ?? "gpt-4.1-mini"));
      const gateway = createModelGateway({
        apiKey: process.env["OPENAI_API_KEY"],
        baseUrl: process.env["OPENAI_BASE_URL"],
        chatModel: model,
        provider,
      });
      const report = await runAiGoldenSet(suiteValue, gateway, {
        ...readOptions(args),
        model,
        provider,
      });
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
      throw new Error("Unknown command. Use validate or run.");
  }
}

function readOptions(args: string[]): AiGoldenRunOptions {
  const thresholds: Partial<AiGoldenThresholds> = {};
  assignNumberOption(args, "--min-groundedness", thresholds, "minimumGroundedness");
  assignNumberOption(args, "--max-unsupported-rate", thresholds, "maximumUnsupportedClaimRate");
  assignNumberOption(args, "--min-citation-precision", thresholds, "minimumCitationPrecision");
  assignNumberOption(args, "--min-citation-recall", thresholds, "minimumCitationRecall");
  assignNumberOption(args, "--max-p95-ms", thresholds, "maximumP95LatencyMs");
  assignNumberOption(args, "--max-average-cost", thresholds, "maximumAverageCostUsd");
  return { thresholds };
}

function assignNumberOption(
  args: string[],
  option: string,
  target: Partial<AiGoldenThresholds>,
  metric: keyof AiGoldenThresholds,
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
