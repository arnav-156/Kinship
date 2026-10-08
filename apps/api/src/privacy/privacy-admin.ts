#!/usr/bin/env node
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";

import { type PrivacyAdminUtility, runPrivacyAdminCli } from "./admin-cli";
import { AdminDataLifecycleUtility, type AdminDataTarget } from "./admin-data-lifecycle";

const SCENARIO_TENANT_ID = "fixture-tenant";
const SCENARIO_USER_ID = "fixture-user";
const SCENARIO_TIME = "2026-07-19T12:00:00.000Z";

async function main(): Promise<void> {
  const suppliedArgs = process.argv.slice(2);
  const scenario = suppliedArgs.includes("--scenario");
  const args = suppliedArgs.filter((value) => value !== "--scenario");
  if (!args.includes("--operator")) {
    args.push(
      "--operator",
      process.env["PRIVACY_ADMIN_OPERATOR"] ?? process.env["USERNAME"] ?? "local-operator",
    );
  }

  const utility: PrivacyAdminUtility = scenario
    ? new ScenarioPrivacyAdminUtility()
    : new AdminDataLifecycleUtility(getPrismaClient());

  try {
    process.exitCode = await runPrivacyAdminCli(args, { utility });
  } finally {
    if (!scenario) {
      await disconnectPrismaClient();
    }
  }
}

class ScenarioPrivacyAdminUtility implements PrivacyAdminUtility {
  async exportData(target: AdminDataTarget) {
    assertScenarioTarget(target);
    return {
      expiresAt: "2026-07-20T12:00:00.000Z",
      requestId: "scenario-export-request",
      snapshot: {
        account: {
          displayName: "Scenario User",
          email: "scenario@example.local",
          id: SCENARIO_USER_ID,
          status: "active",
        },
        activity: { auditEvents: [] },
        authoredContent: {
          aiFeedback: [],
          draftVersions: [],
          notes: [],
          prospectLists: [],
          suppressions: [],
        },
        generatedAt: SCENARIO_TIME,
        memberships: [],
        scope: {
          tenantId: SCENARIO_TENANT_ID,
          userId: SCENARIO_USER_ID,
        },
        totals: {
          aiFeedback: 0,
          auditEvents: 0,
          draftVersions: 0,
          memberships: 0,
          notes: 0,
          prospectLists: 0,
          suppressions: 0,
        },
        version: "1.0",
      },
    };
  }

  async previewDeletion(target: AdminDataTarget) {
    assertScenarioTarget(target);
    return {
      blocked: false,
      blockedWorkspaces: [],
      confirmation: `DELETE ${SCENARIO_USER_ID}`,
      generatedAt: SCENARIO_TIME,
      impact: {
        deactivatesTenant: true,
        deactivatesWorkspaces: 1,
        removes: { memberships: 1, relationshipNotes: 2 },
        scrubs: {
          aiFeedback: 1,
          auditEvents: 3,
          backgroundJobs: 1,
          draftVersions: 2,
          prospectLists: 1,
          suppressions: 1,
        },
      },
      scenario: true,
      target: {
        displayName: "Scenario User",
        email: "scenario@example.local",
        tenantId: SCENARIO_TENANT_ID,
        userId: SCENARIO_USER_ID,
      },
    };
  }

  async executeDeletion(target: AdminDataTarget, confirmation: string) {
    assertScenarioTarget(target);
    const expected = `DELETE ${SCENARIO_USER_ID}`;
    if (confirmation !== expected) {
      throw new Error(`Confirmation must exactly match "${expected}"`);
    }
    return {
      deletedAt: SCENARIO_TIME,
      requestId: "scenario-deletion-request",
      scenario: true,
      summary: {
        deactivatedTenant: true,
        deactivatedWorkspaces: 1,
        removed: { memberships: 1, relationshipNotes: 2 },
        scrubbed: {
          aiFeedback: 1,
          auditEvents: 3,
          backgroundJobs: 1,
          draftVersions: 2,
          prospectLists: 1,
          suppressions: 1,
        },
      },
    };
  }
}

function assertScenarioTarget(target: AdminDataTarget): void {
  if (target.tenantId !== SCENARIO_TENANT_ID || target.userId !== SCENARIO_USER_ID) {
    throw new Error(
      `Scenario mode requires --tenant ${SCENARIO_TENANT_ID} --user ${SCENARIO_USER_ID}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
