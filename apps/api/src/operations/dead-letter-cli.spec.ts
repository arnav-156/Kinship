import { describe, expect, it, vi } from "vitest";

import { runDeadLetterCli } from "./dead-letter-cli";

describe("dead-letter CLI", () => {
  it("lists dead letters with optional workspace and limit scope", async () => {
    const result = {
      count: 0,
      generatedAt: "2026-07-19T12:00:00.000Z",
      items: [],
      limit: 25,
      scope: { tenantId: "tenant_1", workspaceId: "workspace_1" },
    };
    const list = vi.fn().mockResolvedValue(result);
    const stdout = vi.fn();

    const exitCode = await runDeadLetterCli(
      [
        "list",
        "--tenant",
        "tenant_1",
        "--operator",
        "fixture-operator",
        "--workspace",
        "workspace_1",
        "--limit",
        "25",
      ],
      { stdout, utility: { list } as never },
    );

    expect(exitCode).toBe(0);
    expect(list).toHaveBeenCalledWith(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      { limit: 25, workspaceId: "workspace_1" },
    );
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("prints one scoped dead-letter inspection", async () => {
    const result = {
      confirmation: "REPLAY DEAD LETTER job_1",
      id: "job_1",
      replayable: true,
      replayBlockedReason: null,
      status: "dead_lettered",
    };
    const inspect = vi.fn().mockResolvedValue(result);
    const stdout = vi.fn();

    const exitCode = await runDeadLetterCli(
      ["inspect", "--tenant", "tenant_1", "--operator", "fixture-operator", "--job", "job_1"],
      { stdout, utility: { inspect } as never },
    );

    expect(exitCode).toBe(0);
    expect(inspect).toHaveBeenCalledWith(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      "job_1",
    );
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it("uses inspection as replay dry-run without invoking execution", async () => {
    const plan = {
      confirmation: "REPLAY DEAD LETTER job_1",
      id: "job_1",
      replayable: true,
      replayBlockedReason: null,
      status: "dead_lettered",
    };
    const inspect = vi.fn().mockResolvedValue(plan);
    const executeReplay = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runDeadLetterCli(
      [
        "replay",
        "--tenant",
        "tenant_1",
        "--operator",
        "fixture-operator",
        "--job",
        "job_1",
        "--dry-run",
      ],
      {
        stdout,
        utility: { executeReplay, inspect } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(inspect).toHaveBeenCalledWith(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      "job_1",
    );
    expect(executeReplay).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(plan, null, 2));
  });

  it("dispatches an explicitly confirmed replay", async () => {
    const result = {
      auditEventId: "audit_1",
      job: { id: "job_1", status: "queued" },
      replayedAt: "2026-07-19T12:00:00.000Z",
    };
    const executeReplay = vi.fn().mockResolvedValue(result);
    const inspect = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runDeadLetterCli(
      [
        "replay",
        "--tenant",
        "tenant_1",
        "--operator",
        "fixture-operator",
        "--job",
        "job_1",
        "--execute",
        "--confirm",
        "REPLAY DEAD LETTER job_1",
      ],
      {
        stdout,
        utility: { executeReplay, inspect } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(inspect).not.toHaveBeenCalled();
    expect(executeReplay).toHaveBeenCalledWith(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      "job_1",
      "REPLAY DEAD LETTER job_1",
    );
    expect(stdout).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });
});
