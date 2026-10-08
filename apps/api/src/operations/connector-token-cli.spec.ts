import { describe, expect, it, vi } from "vitest";

import { runConnectorTokenCli } from "./connector-token-cli";

describe("connector token CLI", () => {
  it("inspects an explicitly scoped connector", async () => {
    const inspect = vi.fn().mockResolvedValue({
      connector: { id: "connector_1", provider: "gmail", status: "active" },
      credential: { configured: false },
    });
    const stdout = vi.fn();

    const exitCode = await runConnectorTokenCli(
      [
        "inspect",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--connector",
        "connector_1",
        "--operator",
        "fixture-operator",
      ],
      { stdout, utility: { inspect } as never },
    );

    expect(exitCode).toBe(0);
    expect(inspect).toHaveBeenCalledWith({
      connectorId: "connector_1",
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      connector: { id: "connector_1", provider: "gmail", status: "active" },
      credential: { configured: false },
    });
  });

  it("loads rotation secrets only from named environment variables for dry-run", async () => {
    const token = "fixture-oauth-token-with-sufficient-entropy";
    const encryptionKey = Buffer.alloc(32, 7);
    const previewRotation = vi.fn().mockResolvedValue({
      change: { nextTokenFingerprint: "sha256:a46f334099616429" },
      confirmation: "ROTATE CONNECTOR TOKEN connector_1",
      dryRun: true,
    });
    const stdout = vi.fn();

    const exitCode = await runConnectorTokenCli(
      [
        "rotate",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--connector",
        "connector_1",
        "--operator",
        "fixture-operator",
        "--token-env",
        "FIXTURE_CONNECTOR_TOKEN",
        "--key-version",
        "local-v2",
        "--dry-run",
      ],
      {
        env: {
          CONNECTOR_TOKEN_ENCRYPTION_KEY: encryptionKey.toString("base64"),
          FIXTURE_CONNECTOR_TOKEN: token,
        },
        stdout,
        utility: { previewRotation } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(previewRotation).toHaveBeenCalledWith(
      {
        connectorId: "connector_1",
        operator: "fixture-operator",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      {
        encryptionKey,
        keyVersion: "local-v2",
        token,
      },
    );
    expect(stdout.mock.calls[0]?.[0]).not.toContain(token);
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      change: { nextTokenFingerprint: "sha256:a46f334099616429" },
      confirmation: "ROTATE CONNECTOR TOKEN connector_1",
      dryRun: true,
    });
  });

  it("executes rotation only with the exact confirmation", async () => {
    const token = "fixture-oauth-token-with-sufficient-entropy";
    const encryptionKey = Buffer.alloc(32, 7);
    const executeRotation = vi.fn().mockResolvedValue({
      connectorId: "connector_1",
      tokenFingerprint: "sha256:a46f334099616429",
    });
    const stdout = vi.fn();

    const exitCode = await runConnectorTokenCli(
      [
        "rotate",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--connector",
        "connector_1",
        "--operator",
        "fixture-operator",
        "--token-env",
        "FIXTURE_CONNECTOR_TOKEN",
        "--key-version",
        "local-v2",
        "--execute",
        "--confirm",
        "ROTATE CONNECTOR TOKEN connector_1",
      ],
      {
        env: {
          CONNECTOR_TOKEN_ENCRYPTION_KEY: encryptionKey.toString("base64"),
          FIXTURE_CONNECTOR_TOKEN: token,
        },
        stdout,
        utility: { executeRotation } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(executeRotation).toHaveBeenCalledWith(
      {
        connectorId: "connector_1",
        operator: "fixture-operator",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      { encryptionKey, keyVersion: "local-v2", token },
      "ROTATE CONNECTOR TOKEN connector_1",
    );
    expect(stdout.mock.calls[0]?.[0]).not.toContain(token);
  });

  it("previews connector token revocation in dry-run mode", async () => {
    const previewRevocation = vi.fn().mockResolvedValue({
      confirmation: "REVOKE CONNECTOR TOKEN connector_1",
      credential: { configured: true },
      dryRun: true,
    });
    const stdout = vi.fn();

    const exitCode = await runConnectorTokenCli(
      [
        "revoke",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--connector",
        "connector_1",
        "--operator",
        "fixture-operator",
        "--dry-run",
      ],
      { stdout, utility: { previewRevocation } as never },
    );

    expect(exitCode).toBe(0);
    expect(previewRevocation).toHaveBeenCalledWith({
      connectorId: "connector_1",
      operator: "fixture-operator",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      confirmation: "REVOKE CONNECTOR TOKEN connector_1",
      credential: { configured: true },
      dryRun: true,
    });
  });

  it("executes revocation only with the exact confirmation", async () => {
    const executeRevocation = vi.fn().mockResolvedValue({
      connectorId: "connector_1",
      credentialDeleted: true,
    });
    const stdout = vi.fn();

    const exitCode = await runConnectorTokenCli(
      [
        "revoke",
        "--tenant",
        "tenant_1",
        "--workspace",
        "workspace_1",
        "--connector",
        "connector_1",
        "--operator",
        "fixture-operator",
        "--execute",
        "--confirm",
        "REVOKE CONNECTOR TOKEN connector_1",
      ],
      { stdout, utility: { executeRevocation } as never },
    );

    expect(exitCode).toBe(0);
    expect(executeRevocation).toHaveBeenCalledWith(
      {
        connectorId: "connector_1",
        operator: "fixture-operator",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      "REVOKE CONNECTOR TOKEN connector_1",
    );
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      connectorId: "connector_1",
      credentialDeleted: true,
    });
  });

  it("rejects plaintext tokens passed on the command line", async () => {
    const previewRotation = vi.fn();

    await expect(
      runConnectorTokenCli(
        [
          "rotate",
          "--tenant",
          "tenant_1",
          "--workspace",
          "workspace_1",
          "--connector",
          "connector_1",
          "--operator",
          "fixture-operator",
          "--token",
          "must-not-enter-process-arguments",
          "--key-version",
          "local-v2",
          "--dry-run",
        ],
        {
          env: {
            CONNECTOR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
          },
          utility: { previewRotation } as never,
        },
      ),
    ).rejects.toThrow(
      "Plaintext connector tokens are not accepted; use --token-env with a protected environment variable",
    );
    expect(previewRotation).not.toHaveBeenCalled();
  });
});
