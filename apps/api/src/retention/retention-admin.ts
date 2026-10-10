#!/usr/bin/env node
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";

import { type RetentionAdminCliDependencies, runRetentionAdminCli } from "./admin-retention-cli";
import { RetentionAdminUtility, type RetentionAdminTarget } from "./admin-retention";
import { createConfiguredObjectStorage } from "../storage/storage.module";

const SCENARIO_TENANT_ID = "fixture-tenant";
const SCENARIO_WORKSPACE_ID = "fixture-workspace";
const SCENARIO_TIME = "2026-07-19T12:00:00.000Z";

async function main(): Promise<void> {
  const suppliedArgs = process.argv.slice(2);
  const scenario = suppliedArgs.includes("--scenario");
  const args = suppliedArgs.filter((value) => value !== "--scenario");
  if (!args.includes("--operator")) {
    args.push(
      "--operator",
      process.env["RETENTION_ADMIN_OPERATOR"] ?? process.env["USERNAME"] ?? "local-operator",
    );
  }

  const utility: RetentionAdminCliDependencies["utility"] = scenario
    ? new ScenarioRetentionAdminUtility()
    : new RetentionAdminUtility(
        getPrismaClient(),
        () => new Date(),
        createConfiguredObjectStorage(),
      );

  try {
    process.exitCode = await runRetentionAdminCli(args, { utility });
  } finally {
    if (!scenario) {
      await disconnectPrismaClient();
    }
  }
}

class ScenarioRetentionAdminUtility {
  async preview(target: RetentionAdminTarget) {
    assertScenarioTarget(target);
    return scenarioPlan();
  }

  async execute(target: RetentionAdminTarget, confirmation: string) {
    assertScenarioTarget(target);
    const plan = scenarioPlan();
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }
    return {
      deleted: {
        evidenceItems: plan.dueEvidenceItems,
        sourceSnapshots: plan.dueSourceSnapshots,
        total: plan.totalDue,
      },
      executedAt: SCENARIO_TIME,
      job: { id: "scenario-retention-job", status: "completed" },
      scenario: true,
    };
  }
}

function scenarioPlan() {
  return {
    confirmation: `DELETE EXPIRED EVIDENCE ${SCENARIO_WORKSPACE_ID}`,
    dataClass: "evidence",
    dueEvidenceItems: 2,
    dueSourceSnapshots: 1,
    generatedAt: SCENARIO_TIME,
    nextExpirationAt: "2026-07-20T12:00:00.000Z",
    policy: { enabled: true, retentionDays: 90 },
    scenario: true,
    scope: {
      tenantId: SCENARIO_TENANT_ID,
      workspaceId: SCENARIO_WORKSPACE_ID,
      workspaceName: "Scenario Workspace",
    },
    totalDue: 3,
  };
}

function assertScenarioTarget(target: RetentionAdminTarget): void {
  if (target.tenantId !== SCENARIO_TENANT_ID || target.workspaceId !== SCENARIO_WORKSPACE_ID) {
    throw new Error(
      `Scenario mode requires --tenant ${SCENARIO_TENANT_ID} --workspace ${SCENARIO_WORKSPACE_ID}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
