import fs from "node:fs";
import path from "node:path";

import type { SuppressionBulkTarget } from "./suppression-bulk";

export interface SuppressionBulkCliUtility {
  exportCsv(target: SuppressionBulkTarget): Promise<{
    count: number;
    csv: string;
    generatedAt: string;
  }>;
  executeImport(target: SuppressionBulkTarget, csv: string, confirmation: string): Promise<unknown>;
  previewImport(target: SuppressionBulkTarget, csv: string): Promise<unknown>;
}

export interface SuppressionBulkCliDependencies {
  stdout?: (value: string) => void;
  utility: SuppressionBulkCliUtility;
}

export async function runSuppressionBulkCli(
  args: string[],
  dependencies: SuppressionBulkCliDependencies,
): Promise<number> {
  const command = args[0];
  const target: SuppressionBulkTarget = {
    operator: requiredOption(args, "--operator"),
    tenantId: requiredOption(args, "--tenant"),
  };
  const stdout = dependencies.stdout ?? console.log;

  if (command === "export") {
    const outputPath = path.resolve(requiredOption(args, "--output"));
    if (fs.existsSync(outputPath)) {
      throw new Error(`Refusing to overwrite existing output: ${outputPath}`);
    }
    const result = await dependencies.utility.exportCsv(target);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.csv, { encoding: "utf8", flag: "wx" });
    stdout(
      JSON.stringify(
        {
          command,
          count: result.count,
          generatedAt: result.generatedAt,
          output: outputPath,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (command === "import") {
    const dryRun = args.includes("--dry-run");
    const execute = args.includes("--execute");
    if (dryRun === execute) {
      throw new Error("Import requires exactly one of --dry-run or --execute");
    }
    const inputPath = path.resolve(requiredOption(args, "--input"));
    const csv = fs.readFileSync(inputPath, "utf8");
    if (dryRun) {
      const plan = await dependencies.utility.previewImport(target, csv);
      stdout(JSON.stringify(plan, null, 2));
      return 0;
    }

    const confirmation = requiredOption(args, "--confirm");
    const result = await dependencies.utility.executeImport(target, csv, confirmation);
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  throw new Error("Unknown command. Use export or import.");
}

function requiredOption(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}
