#!/usr/bin/env node
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";
import crypto from "node:crypto";

import { type ConnectorTokenCliUtility, runConnectorTokenCli } from "./connector-token-cli";
import {
  type ConnectorTokenRotationInput,
  type ConnectorTokenTarget,
  ConnectorTokenUtility,
} from "./connector-token";

const SCENARIO_TENANT_ID = "fixture-tenant";
const SCENARIO_WORKSPACE_ID = "fixture-workspace";
const SCENARIO_CONNECTOR_ID = "fixture-connector";
const SCENARIO_TIME = "2026-07-24T12:00:00.000Z";
const SCENARIO_TOKEN_ENV = "SCENARIO_CONNECTOR_TOKEN";

async function main(): Promise<void> {
  const suppliedArgs = process.argv.slice(2);
  const scenario = suppliedArgs.includes("--scenario");
  const args = suppliedArgs.filter((value) => value !== "--scenario");
  if (!args.includes("--operator")) {
    args.push(
      "--operator",
      process.env["CONNECTOR_TOKEN_OPERATOR"] ?? process.env["USERNAME"] ?? "local-operator",
    );
  }
  const env = { ...process.env };
  if (scenario && args[0] === "rotate") {
    if (!args.includes("--token-env")) args.push("--token-env", SCENARIO_TOKEN_ENV);
    if (!args.includes("--key-version")) args.push("--key-version", "scenario-v1");
    env[SCENARIO_TOKEN_ENV] = "scenario-oauth-token-with-sufficient-entropy";
    env["CONNECTOR_TOKEN_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
  }

  const utility: ConnectorTokenCliUtility = scenario
    ? new ScenarioConnectorTokenUtility()
    : new ConnectorTokenUtility(getPrismaClient());

  try {
    process.exitCode = await runConnectorTokenCli(args, { env, utility });
  } finally {
    if (!scenario) await disconnectPrismaClient();
  }
}

class ScenarioConnectorTokenUtility implements ConnectorTokenCliUtility {
  async inspect(target: ConnectorTokenTarget) {
    assertScenarioTarget(target);
    return scenarioInspection();
  }

  async previewRotation(target: ConnectorTokenTarget, input: ConnectorTokenRotationInput) {
    assertScenarioTarget(target);
    return {
      ...scenarioInspection(),
      change: {
        currentTokenFingerprint: "sha256:existing00000000",
        keyVersion: input.keyVersion,
        nextTokenFingerprint: fingerprint(input.token),
      },
      confirmation: `ROTATE CONNECTOR TOKEN ${SCENARIO_CONNECTOR_ID}`,
      dryRun: true,
    };
  }

  async executeRotation(
    target: ConnectorTokenTarget,
    input: ConnectorTokenRotationInput,
    confirmation: string,
  ) {
    assertScenarioTarget(target);
    const expected = `ROTATE CONNECTOR TOKEN ${SCENARIO_CONNECTOR_ID}`;
    if (confirmation !== expected) {
      throw new Error(`Confirmation must exactly match "${expected}"`);
    }
    return {
      auditEventId: "scenario-rotation-audit",
      connectorId: SCENARIO_CONNECTOR_ID,
      keyVersion: input.keyVersion,
      rotatedAt: SCENARIO_TIME,
      scenario: true,
      tokenFingerprint: fingerprint(input.token),
    };
  }

  async previewRevocation(target: ConnectorTokenTarget) {
    assertScenarioTarget(target);
    return {
      ...scenarioInspection(),
      confirmation: `REVOKE CONNECTOR TOKEN ${SCENARIO_CONNECTOR_ID}`,
      dryRun: true,
    };
  }

  async executeRevocation(target: ConnectorTokenTarget, confirmation: string) {
    assertScenarioTarget(target);
    const expected = `REVOKE CONNECTOR TOKEN ${SCENARIO_CONNECTOR_ID}`;
    if (confirmation !== expected) {
      throw new Error(`Confirmation must exactly match "${expected}"`);
    }
    return {
      auditEventId: "scenario-revocation-audit",
      connectorId: SCENARIO_CONNECTOR_ID,
      credentialDeleted: true,
      revokedAt: SCENARIO_TIME,
      scenario: true,
    };
  }
}

function scenarioInspection() {
  return {
    connector: {
      displayName: "Scenario Gmail",
      id: SCENARIO_CONNECTOR_ID,
      provider: "gmail",
      status: "active",
    },
    credential: {
      configured: true,
      keyVersion: "scenario-v0",
      rotatedAt: "2026-07-23T12:00:00.000Z",
      tokenFingerprint: "sha256:existing00000000",
    },
    generatedAt: SCENARIO_TIME,
    guidance: {
      revokeConfirmation: `REVOKE CONNECTOR TOKEN ${SCENARIO_CONNECTOR_ID}`,
      rotateConfirmation: `ROTATE CONNECTOR TOKEN ${SCENARIO_CONNECTOR_ID}`,
    },
    scenario: true,
    scope: {
      tenantId: SCENARIO_TENANT_ID,
      workspaceId: SCENARIO_WORKSPACE_ID,
    },
  };
}

function assertScenarioTarget(target: ConnectorTokenTarget): void {
  if (
    target.tenantId !== SCENARIO_TENANT_ID ||
    target.workspaceId !== SCENARIO_WORKSPACE_ID ||
    target.connectorId !== SCENARIO_CONNECTOR_ID
  ) {
    throw new Error(
      `Scenario mode requires --tenant ${SCENARIO_TENANT_ID} --workspace ${SCENARIO_WORKSPACE_ID} --connector ${SCENARIO_CONNECTOR_ID}`,
    );
  }
}

function fingerprint(token: string): string {
  return `sha256:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
