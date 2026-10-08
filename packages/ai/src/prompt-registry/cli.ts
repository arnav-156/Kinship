#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_PROMPT_REGISTRY,
  comparePromptVersions,
  digestPromptContent,
  digestPromptRegistry,
  getPromptDefinition,
  parsePromptRegistry,
} from "./index";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift() ?? "list";
  const registry = loadRegistry(args);

  switch (command) {
    case "verify": {
      const parsed = parsePromptRegistry(registry);
      emit(
        {
          activeVersions: parsed.prompts
            .filter((prompt) => prompt.status === "active")
            .map((prompt) => prompt.versionId),
          promptCount: parsed.prompts.length,
          registryDigest: digestPromptRegistry(parsed),
          registryId: parsed.registryId,
          valid: true,
        },
        args,
      );
      return;
    }
    case "list": {
      const parsed = parsePromptRegistry(registry);
      emit(
        {
          prompts: parsed.prompts.map((prompt) => ({
            contentDigest: digestPromptContent(prompt),
            promptId: prompt.promptId,
            status: prompt.status,
            task: prompt.task,
            version: prompt.version,
            versionId: prompt.versionId,
          })),
          registryDigest: digestPromptRegistry(parsed),
          registryId: parsed.registryId,
        },
        args,
      );
      return;
    }
    case "show": {
      const promptId = requiredPositional(args, "prompt ID");
      const version = requiredIntegerOption(args, "--version");
      const prompt = getPromptDefinition(promptId, version, registry);
      emit({ contentDigest: digestPromptContent(prompt), prompt }, args);
      return;
    }
    case "compare": {
      const promptId = requiredPositional(args, "prompt ID");
      const comparison = comparePromptVersions(
        registry,
        promptId,
        requiredIntegerOption(args, "--from"),
        requiredIntegerOption(args, "--to"),
      );
      emit(comparison, args);
      if (args.includes("--fail-on-risk") && comparison.riskFlags.length > 0) {
        process.exitCode = 2;
      }
      return;
    }
    default:
      throw new Error("Unknown command. Use verify, list, show, or compare.");
  }
}

function loadRegistry(args: string[]): unknown {
  const file = optionalOption(args, "--registry");
  return file ? loadJson(file) : DEFAULT_PROMPT_REGISTRY;
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

function emit(value: unknown, args: string[]): void {
  const output = optionalOption(args, "--output");
  if (output) {
    writeNewJson(output, value);
  }
  console.log(JSON.stringify(value, null, 2));
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

function requiredIntegerOption(args: string[], name: string): number {
  const raw = optionalOption(args, name);
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
