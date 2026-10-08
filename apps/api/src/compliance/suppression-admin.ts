#!/usr/bin/env node
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";

import { type SuppressionBulkCliUtility, runSuppressionBulkCli } from "./suppression-bulk-cli";
import { hashContactValue } from "./contact-value";
import { SuppressionBulkUtility, type SuppressionBulkTarget } from "./suppression-bulk";

const SCENARIO_TENANT_ID = "fixture-tenant";
const SCENARIO_TIME = "2026-07-19T12:00:00.000Z";
const SCENARIO_EMAIL_HASH = hashContactValue("email", "scenario@example.local");
const SCENARIO_PHONE_HASH = "d".repeat(64);

async function main(): Promise<void> {
  const suppliedArgs = process.argv.slice(2);
  const scenario = suppliedArgs.includes("--scenario");
  const args = suppliedArgs.filter((value) => value !== "--scenario");
  if (!args.includes("--operator")) {
    args.push(
      "--operator",
      process.env["SUPPRESSION_ADMIN_OPERATOR"] ?? process.env["USERNAME"] ?? "local-operator",
    );
  }

  const utility: SuppressionBulkCliUtility = scenario
    ? new ScenarioSuppressionBulkUtility()
    : new SuppressionBulkUtility(getPrismaClient());

  try {
    process.exitCode = await runSuppressionBulkCli(args, { utility });
  } finally {
    if (!scenario) {
      await disconnectPrismaClient();
    }
  }
}

class ScenarioSuppressionBulkUtility implements SuppressionBulkCliUtility {
  async exportCsv(target: SuppressionBulkTarget) {
    assertScenarioTarget(target);
    return {
      count: 2,
      csv: [
        "workspace_id,channel_type,value,value_hash,reason,source",
        `,email,,${SCENARIO_EMAIL_HASH},Scenario opt out,scenario`,
        `fixture-workspace,phone,,${SCENARIO_PHONE_HASH},Scenario request,scenario`,
        "",
      ].join("\n"),
      generatedAt: SCENARIO_TIME,
    };
  }

  async previewImport(target: SuppressionBulkTarget, csv: string) {
    assertScenarioTarget(target);
    assertScenarioCsv(csv);
    return scenarioPlan();
  }

  async executeImport(target: SuppressionBulkTarget, csv: string, confirmation: string) {
    assertScenarioTarget(target);
    assertScenarioCsv(csv);
    const plan = scenarioPlan();
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }
    return {
      auditEventId: "scenario-suppression-audit",
      count: plan.count,
      created: plan.created,
      importedAt: SCENARIO_TIME,
      reactivated: plan.reactivated,
      scenario: true,
      updated: plan.updated,
    };
  }
}

function scenarioPlan() {
  return {
    confirmation: `IMPORT 2 SUPPRESSIONS ${SCENARIO_TENANT_ID}`,
    count: 2,
    created: 2,
    entries: [
      {
        action: "create",
        channelType: "email",
        row: 2,
        valueHash: SCENARIO_EMAIL_HASH,
        workspaceId: null,
      },
      {
        action: "create",
        channelType: "phone",
        row: 3,
        valueHash: SCENARIO_PHONE_HASH,
        workspaceId: "fixture-workspace",
      },
    ],
    generatedAt: SCENARIO_TIME,
    reactivated: 0,
    scenario: true,
    updated: 0,
  };
}

function assertScenarioTarget(target: SuppressionBulkTarget): void {
  if (target.tenantId !== SCENARIO_TENANT_ID) {
    throw new Error(`Scenario mode requires --tenant ${SCENARIO_TENANT_ID}`);
  }
}

function assertScenarioCsv(csv: string): void {
  if (!csv.includes("scenario@example.local") || !csv.includes(SCENARIO_PHONE_HASH)) {
    throw new Error("Scenario mode requires the documented suppression import fixture");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
