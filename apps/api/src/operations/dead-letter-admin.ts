#!/usr/bin/env node
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";

import { type DeadLetterCliUtility, runDeadLetterCli } from "./dead-letter-cli";
import {
  DeadLetterUtility,
  type DeadLetterListOptions,
  type DeadLetterTarget,
} from "./dead-letter";

const SCENARIO_TENANT_ID = "fixture-tenant";
const SCENARIO_WORKSPACE_ID = "fixture-workspace";
const SCENARIO_JOB_ID = "fixture-dead-letter";
const SCENARIO_TIME = "2026-07-19T12:00:00.000Z";

async function main(): Promise<void> {
  const suppliedArgs = process.argv.slice(2);
  const scenario = suppliedArgs.includes("--scenario");
  const args = suppliedArgs.filter((value) => value !== "--scenario");
  if (!args.includes("--operator")) {
    args.push(
      "--operator",
      process.env["DEAD_LETTER_OPERATOR"] ?? process.env["USERNAME"] ?? "local-operator",
    );
  }

  const utility: DeadLetterCliUtility = scenario
    ? new ScenarioDeadLetterUtility()
    : new DeadLetterUtility(getPrismaClient());

  try {
    process.exitCode = await runDeadLetterCli(args, { utility });
  } finally {
    if (!scenario) await disconnectPrismaClient();
  }
}

class ScenarioDeadLetterUtility implements DeadLetterCliUtility {
  async list(target: DeadLetterTarget, options: DeadLetterListOptions) {
    assertScenarioTarget(target);
    if (options.workspaceId && options.workspaceId !== SCENARIO_WORKSPACE_ID) {
      throw new Error(`Scenario workspace must be ${SCENARIO_WORKSPACE_ID}`);
    }
    const inspected = scenarioInspection();
    return {
      count: 1,
      generatedAt: SCENARIO_TIME,
      items: [
        {
          attempts: inspected.attempts,
          createdAt: inspected.createdAt,
          failureReason: inspected.failureReason,
          id: inspected.id,
          jobName: inspected.jobName,
          maxAttempts: inspected.maxAttempts,
          queueName: inspected.queueName,
          replayable: true,
          replayBlockedReason: null,
          updatedAt: inspected.updatedAt,
          workspaceId: inspected.workspaceId,
        },
      ],
      limit: options.limit ?? 50,
      scenario: true,
      scope: {
        tenantId: SCENARIO_TENANT_ID,
        workspaceId: options.workspaceId ?? null,
      },
    };
  }

  async inspect(target: DeadLetterTarget, jobId: string) {
    assertScenarioTarget(target);
    assertScenarioJob(jobId);
    return scenarioInspection();
  }

  async executeReplay(target: DeadLetterTarget, jobId: string, confirmation: string) {
    assertScenarioTarget(target);
    assertScenarioJob(jobId);
    const expected = `REPLAY DEAD LETTER ${SCENARIO_JOB_ID}`;
    if (confirmation !== expected) {
      throw new Error(`Confirmation must exactly match "${expected}"`);
    }
    return {
      auditEventId: "scenario-replay-audit",
      job: {
        attempts: 0,
        id: SCENARIO_JOB_ID,
        progress: { percent: 0, stage: "queued" },
        status: "queued",
      },
      replayedAt: SCENARIO_TIME,
      scenario: true,
    };
  }
}

function scenarioInspection() {
  return {
    attempts: 3,
    availableAt: "2026-07-19T09:00:00.000Z",
    completedAt: null,
    confirmation: `REPLAY DEAD LETTER ${SCENARIO_JOB_ID}`,
    createdAt: "2026-07-18T10:00:00.000Z",
    failureReason: "Scenario connector timeout",
    generatedAt: SCENARIO_TIME,
    id: SCENARIO_JOB_ID,
    idempotencyKey: "fixture-evidence-job",
    jobName: "evidence.ingest",
    lockedAt: null,
    lockedBy: null,
    maxAttempts: 3,
    payload: {
      sourceIdentifier: "https://example.com/scenario-profile",
      sourceType: "user_url",
      tenantId: SCENARIO_TENANT_ID,
      workspaceId: SCENARIO_WORKSPACE_ID,
    },
    progress: { percent: 100, stage: "dead_lettered" },
    queueName: "evidence-ingestion",
    replayable: true,
    replayBlockedReason: null,
    scenario: true,
    status: "dead_lettered",
    updatedAt: "2026-07-19T10:00:00.000Z",
    workspaceId: SCENARIO_WORKSPACE_ID,
  };
}

function assertScenarioTarget(target: DeadLetterTarget): void {
  if (target.tenantId !== SCENARIO_TENANT_ID) {
    throw new Error(`Scenario mode requires --tenant ${SCENARIO_TENANT_ID}`);
  }
}

function assertScenarioJob(jobId: string): void {
  if (jobId !== SCENARIO_JOB_ID) {
    throw new Error(`Scenario mode requires --job ${SCENARIO_JOB_ID}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
