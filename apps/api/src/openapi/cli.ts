#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { findOpenApiBreakingChanges, type OpenApiDocument } from "./compatibility";

export const OPENAPI_SNAPSHOT_CONFIRMATION = "UPDATE OPENAPI CONTRACT";

export interface OpenApiCliDependencies {
  generate(): Promise<OpenApiDocument>;
  read(path: string): Promise<OpenApiDocument>;
  stdout?: (value: string) => void;
  write(path: string, content: string): Promise<void>;
}

export async function runOpenApiCli(
  args: string[],
  dependencies: OpenApiCliDependencies,
): Promise<number> {
  const command = args[0];
  if (command !== "check" && command !== "snapshot") {
    throw new Error("Unknown command. Use check or snapshot.");
  }

  const baselinePath = optionalOption(args, "--baseline") ?? "docs/openapi.json";
  const stdout = dependencies.stdout ?? console.log;
  const candidate = await dependencies.generate();

  if (command === "snapshot") {
    const confirmation = optionalOption(args, "--confirm");
    if (confirmation !== OPENAPI_SNAPSHOT_CONFIRMATION) {
      throw new Error(`--confirm must equal "${OPENAPI_SNAPSHOT_CONFIRMATION}"`);
    }
    await dependencies.write(baselinePath, `${JSON.stringify(sortJson(candidate), null, 2)}\n`);
    stdout(
      JSON.stringify(
        {
          baseline: baselinePath,
          operationCount: countOperations(candidate),
          status: "updated",
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const baseline = await dependencies.read(baselinePath);
  const breakingChanges = findOpenApiBreakingChanges(baseline, candidate);
  const report = {
    baseline: baselinePath,
    breakingChanges,
    operationCount: countOperations(candidate),
    passed: breakingChanges.length === 0,
  };
  stdout(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
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

function countOperations(document: OpenApiDocument): number {
  const methods = new Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"]);
  return Object.values(document.paths).reduce(
    (total, path) => total + Object.keys(path).filter((key) => methods.has(key)).length,
    0,
  );
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

async function main(): Promise<void> {
  const { generateOpenApiDocument } = await import("./document.js");
  const projectRoot = process.cwd();
  process.exitCode = await runOpenApiCli(process.argv.slice(2), {
    generate: async () => (await generateOpenApiDocument()) as unknown as OpenApiDocument,
    read: async (path) =>
      JSON.parse(await readFile(resolve(projectRoot, path), "utf8")) as OpenApiDocument,
    write: async (path, content) => {
      const absolutePath = resolve(projectRoot, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf8");
    },
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
