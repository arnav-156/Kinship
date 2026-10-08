#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  createIdentityReviewLedger,
  createIdentityReviewReport,
  mergeReviewedIdentity,
  parseIdentityReviewCase,
  parseIdentityReviewLedger,
  splitReviewedIdentity,
  verifyIdentityReviewLedger,
} from "./index";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift() ?? "review";
  switch (command) {
    case "review": {
      const reviewCase = loadCase(requiredPositional(args, 0, "case JSON path"));
      print(createIdentityReviewReport(reviewCase));
      return;
    }
    case "init": {
      const reviewCase = loadCase(requiredPositional(args, 0, "case JSON path"));
      const ledger = createIdentityReviewLedger(
        { tenantId: reviewCase.tenantId, workspaceId: reviewCase.workspaceId },
        [
          reviewCase.subjectEntityId,
          ...reviewCase.candidates.map((candidate) => candidate.entityId),
        ],
      );
      writeNewJson(requiredOption(args, "--output"), ledger);
      print(verifyIdentityReviewLedger(ledger));
      return;
    }
    case "merge": {
      const reviewCase = loadCase(requiredPositional(args, 0, "case JSON path"));
      const ledger = loadLedger(requiredPositional(args, 1, "ledger JSON path"));
      const updated = mergeReviewedIdentity(
        ledger,
        createIdentityReviewReport(reviewCase),
        requiredOption(args, "--candidate"),
        readDecision(args),
      );
      writeNewJson(requiredOption(args, "--output"), updated);
      print(verifyIdentityReviewLedger(updated));
      return;
    }
    case "split": {
      const ledger = loadLedger(requiredPositional(args, 0, "ledger JSON path"));
      const updated = splitReviewedIdentity(
        ledger,
        requiredOption(args, "--entity"),
        readDecision(args),
      );
      writeNewJson(requiredOption(args, "--output"), updated);
      print(verifyIdentityReviewLedger(updated));
      return;
    }
    case "verify": {
      print(
        verifyIdentityReviewLedger(loadLedger(requiredPositional(args, 0, "ledger JSON path"))),
      );
      return;
    }
    case "scenario": {
      const reviewCase = loadCase(requiredPositional(args, 0, "case JSON path"));
      const report = createIdentityReviewReport(reviewCase);
      const candidate = report.candidates.find((item) => item.decision !== "new_entity");
      if (!candidate) {
        throw new Error("Scenario requires at least one match or review candidate");
      }
      const initial = createIdentityReviewLedger(
        { tenantId: reviewCase.tenantId, workspaceId: reviewCase.workspaceId },
        [reviewCase.subjectEntityId, ...reviewCase.candidates.map((item) => item.entityId)],
      );
      const merged = mergeReviewedIdentity(initial, report, candidate.candidate.entityId, {
        actorId: "fixture-reviewer",
        performedAt: "2026-07-01T12:00:00.000Z",
        reason: "Fixture merge review",
      });
      const split = splitReviewedIdentity(merged, reviewCase.subjectEntityId, {
        actorId: "fixture-reviewer",
        performedAt: "2026-07-01T12:01:00.000Z",
        reason: "Fixture split review",
      });
      print({
        candidateCount: report.candidates.length,
        caseId: report.caseId,
        decisions: report.candidates.map((item) => ({
          candidateEntityId: item.candidate.entityId,
          decision: item.decision,
          score: item.score,
        })),
        verification: verifyIdentityReviewLedger(split),
      });
      return;
    }
    default:
      throw new Error("Unknown command. Use review, init, merge, split, verify, or scenario.");
  }
}

function readDecision(args: string[]): { actorId: string; performedAt: string; reason: string } {
  return {
    actorId: requiredOption(args, "--actor"),
    performedAt: requiredOption(args, "--at"),
    reason: requiredOption(args, "--reason"),
  };
}

function loadCase(file: string) {
  return parseIdentityReviewCase(loadJson(file));
}

function loadLedger(file: string) {
  return parseIdentityReviewLedger(loadJson(file));
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
  console.log(`wrote ${resolved}`);
}

function requiredPositional(args: string[], index: number, label: string): string {
  const positionals = args
    .filter((arg, itemIndex) => itemIndex === 0 || !args[itemIndex - 1]?.startsWith("--"))
    .filter((arg) => !arg.startsWith("--"));
  const value = positionals[index];
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function requiredOption(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing required option ${name}`);
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
