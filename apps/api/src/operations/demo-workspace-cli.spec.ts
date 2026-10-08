import { describe, expect, it, vi } from "vitest";

import { runDemoWorkspaceCli } from "./demo-workspace-cli";

describe("demo workspace CLI", () => {
  it("previews the isolated demo namespace without requiring a password", async () => {
    const preview = vi.fn().mockResolvedValue({
      confirmation: "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
      reservedScope: {
        tenantSlug: "kinship-guided-demo",
        workspaceSlug: "guided-relationship-demo",
      },
    });
    const hashPassword = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runDemoWorkspaceCli(["preview", "--operator", "fixture-operator"], {
      hashPassword,
      stdout,
      utility: { preview } as never,
    });

    expect(exitCode).toBe(0);
    expect(preview).toHaveBeenCalledWith({ operator: "fixture-operator" });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toMatchObject({
      reservedScope: {
        tenantSlug: "kinship-guided-demo",
        workspaceSlug: "guided-relationship-demo",
      },
    });
  });

  it("uses the same read-only preview for generate dry-run", async () => {
    const preview = vi.fn().mockResolvedValue({
      confirmation: "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
      dryRun: true,
    });
    const hashPassword = vi.fn();
    const stdout = vi.fn();

    const exitCode = await runDemoWorkspaceCli(
      ["generate", "--operator", "fixture-operator", "--dry-run"],
      {
        hashPassword,
        stdout,
        utility: { preview } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(preview).toHaveBeenCalledWith({ operator: "fixture-operator" });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(JSON.parse(stdout.mock.calls[0]?.[0])).toEqual({
      confirmation: "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
      dryRun: true,
    });
  });

  it("hashes a password from a named environment variable before confirmed generation", async () => {
    const password = "correct horse battery staple";
    const execute = vi.fn().mockResolvedValue({
      owner: { email: "demo.owner@kinship-demo.invalid" },
      scope: { tenantSlug: "kinship-guided-demo" },
    });
    const hashPassword = vi.fn().mockResolvedValue("bcrypt-password-hash");
    const stdout = vi.fn();

    const exitCode = await runDemoWorkspaceCli(
      [
        "generate",
        "--operator",
        "fixture-operator",
        "--password-env",
        "KINSHIP_DEMO_PASSWORD",
        "--execute",
        "--confirm",
        "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
      ],
      {
        env: { KINSHIP_DEMO_PASSWORD: password },
        hashPassword,
        stdout,
        utility: { execute } as never,
      },
    );

    expect(exitCode).toBe(0);
    expect(hashPassword).toHaveBeenCalledWith(password);
    expect(execute).toHaveBeenCalledWith(
      { operator: "fixture-operator" },
      { passwordHash: "bcrypt-password-hash" },
      "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
    );
    expect(stdout.mock.calls[0]?.[0]).not.toContain(password);
    expect(stdout.mock.calls[0]?.[0]).not.toContain("bcrypt-password-hash");
  });

  it("rejects plaintext passwords passed on the command line", async () => {
    const execute = vi.fn();
    const hashPassword = vi.fn();

    await expect(
      runDemoWorkspaceCli(
        [
          "generate",
          "--operator",
          "fixture-operator",
          "--password",
          "must-not-enter-process-arguments",
          "--execute",
          "--confirm",
          "GENERATE ISOLATED DEMO WORKSPACE kinship-guided-demo/guided-relationship-demo",
        ],
        {
          hashPassword,
          utility: { execute } as never,
        },
      ),
    ).rejects.toThrow(
      "Plaintext demo passwords are not accepted; use --password-env with a protected environment variable",
    );
    expect(hashPassword).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
