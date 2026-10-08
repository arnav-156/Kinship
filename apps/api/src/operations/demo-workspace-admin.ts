#!/usr/bin/env node
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";

import { PasswordService } from "../auth/password.service";
import { type DemoWorkspaceCliUtility, runDemoWorkspaceCli } from "./demo-workspace-cli";
import {
  DEMO_TENANT_SLUG,
  DEMO_WORKSPACE_SLUG,
  type DemoWorkspaceInput,
  DemoWorkspaceGenerator,
  type DemoWorkspaceTarget,
} from "./demo-workspace";

const SCENARIO_PASSWORD_ENV = "SCENARIO_DEMO_PASSWORD";

async function main(): Promise<void> {
  const suppliedArgs = process.argv.slice(2);
  const scenario = suppliedArgs.includes("--scenario");
  const args = suppliedArgs.filter((value) => value !== "--scenario");
  if (!args.includes("--operator")) {
    args.push(
      "--operator",
      process.env["DEMO_WORKSPACE_OPERATOR"] ?? process.env["USERNAME"] ?? "local-operator",
    );
  }

  const env = { ...process.env };
  if (scenario && args[0] === "generate" && args.includes("--execute")) {
    if (!args.includes("--password-env")) args.push("--password-env", SCENARIO_PASSWORD_ENV);
    env[SCENARIO_PASSWORD_ENV] = "scenario-password-never-persisted";
  }

  const utility: DemoWorkspaceCliUtility = scenario
    ? new ScenarioDemoWorkspaceGenerator()
    : new DemoWorkspaceGenerator(getPrismaClient());
  const passwordService = new PasswordService();
  const hashPassword = scenario
    ? async () => "scenario-password-hash"
    : (password: string) => passwordService.hashPassword(password);

  try {
    process.exitCode = await runDemoWorkspaceCli(args, { env, hashPassword, utility });
  } finally {
    if (!scenario) await disconnectPrismaClient();
  }
}

class ScenarioDemoWorkspaceGenerator implements DemoWorkspaceCliUtility {
  async preview(target: DemoWorkspaceTarget) {
    return {
      confirmation: scenarioConfirmation(),
      existingDemoTenantId: null,
      operator: target.operator,
      reservedScope: {
        tenantSlug: DEMO_TENANT_SLUG,
        workspaceSlug: DEMO_WORKSPACE_SLUG,
      },
      scenario: true,
      syntheticIdentityDomain: "kinship-demo.invalid",
    };
  }

  async execute(target: DemoWorkspaceTarget, input: DemoWorkspaceInput, confirmation: string) {
    if (confirmation !== scenarioConfirmation()) {
      throw new Error(`Confirmation must exactly match "${scenarioConfirmation()}"`);
    }
    if (input.passwordHash !== "scenario-password-hash") {
      throw new Error("Scenario password was not hashed through the expected boundary");
    }
    return {
      auditEventId: "scenario-demo-audit",
      content: {
        evidenceItems: 1,
        organizations: 1,
        people: 1,
        prospectLists: 1,
        relationshipNotes: 1,
      },
      ensured: { membership: true, owner: true, tenant: true, workspace: true },
      operator: target.operator,
      owner: {
        email: "demo.owner@kinship-demo.invalid",
        userId: "scenario-demo-owner",
      },
      scenario: true,
      scope: {
        tenantId: "scenario-demo-tenant",
        tenantSlug: DEMO_TENANT_SLUG,
        workspaceId: "scenario-demo-workspace",
        workspaceSlug: DEMO_WORKSPACE_SLUG,
      },
    };
  }
}

function scenarioConfirmation(): string {
  return `GENERATE ISOLATED DEMO WORKSPACE ${DEMO_TENANT_SLUG}/${DEMO_WORKSPACE_SLUG}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
