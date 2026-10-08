import { describe, expect, it, vi } from "vitest";

import { hashContactValue } from "./compliance.service";
import { SuppressionBulkUtility } from "./suppression-bulk";

describe("suppression bulk utility", () => {
  it("exports active tenant suppressions as deterministic hash-only CSV", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        channelType: "email",
        reason: "Global opt out",
        source: "manual",
        valueHash: "a".repeat(64),
        workspaceId: null,
      },
      {
        channelType: "phone",
        reason: "Customer, requested",
        source: "crm",
        valueHash: "b".repeat(64),
        workspaceId: "workspace_1",
      },
    ]);
    const utility = new SuppressionBulkUtility(
      { suppressionEntry: { findMany } } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );

    const result = await utility.exportCsv({
      operator: "fixture-operator",
      tenantId: "tenant_1",
    });

    expect(result).toEqual({
      count: 2,
      csv: [
        "workspace_id,channel_type,value,value_hash,reason,source",
        `,email,,${"a".repeat(64)},Global opt out,manual`,
        `workspace_1,phone,,${"b".repeat(64)},\"Customer, requested\",crm`,
        "",
      ].join("\n"),
      generatedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ workspaceId: "asc" }, { channelType: "asc" }, { valueHash: "asc" }],
      select: {
        channelType: true,
        reason: true,
        source: true,
        valueHash: true,
        workspaceId: true,
      },
      where: { deletedAt: null, tenantId: "tenant_1" },
    });
    expect(result.csv).not.toContain("@example.com");
  });

  it("previews raw and hashed imports without exposing raw contact values", async () => {
    const rawValue = "Ada@Example.com";
    const hashedValue = "b".repeat(64);
    const findMany = vi.fn().mockResolvedValue([]);
    const utility = new SuppressionBulkUtility(
      {
        suppressionEntry: { findMany },
        workspace: { findMany: vi.fn().mockResolvedValue([{ id: "workspace_1" }]) },
      } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );
    const csv = [
      "workspace_id,channel_type,value,value_hash,reason,source",
      `,email,${rawValue},,Opted out,legacy`,
      `workspace_1,phone,,${hashedValue},Requested,crm`,
      "",
    ].join("\n");

    const result = await utility.previewImport(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      csv,
    );

    expect(result).toEqual({
      confirmation: "IMPORT 2 SUPPRESSIONS tenant_1",
      count: 2,
      created: 2,
      entries: [
        {
          action: "create",
          channelType: "email",
          row: 2,
          valueHash: hashContactValue("email", rawValue),
          workspaceId: null,
        },
        {
          action: "create",
          channelType: "phone",
          row: 3,
          valueHash: hashedValue,
          workspaceId: "workspace_1",
        },
      ],
      generatedAt: "2026-07-19T12:00:00.000Z",
      reactivated: 0,
      updated: 0,
    });
    expect(JSON.stringify(result)).not.toContain(rawValue);
  });

  it("atomically creates, updates, and reactivates a confirmed import with audit evidence", async () => {
    const emailHash = hashContactValue("email", "ada@example.com");
    const phoneHash = "b".repeat(64);
    const linkedinHash = "c".repeat(64);
    const active = {
      channelType: "phone",
      deletedAt: null,
      valueHash: phoneHash,
      workspaceId: "workspace_1",
    };
    const deleted = {
      channelType: "linkedin_context",
      deletedAt: new Date("2026-07-18T12:00:00.000Z"),
      valueHash: linkedinHash,
      workspaceId: "workspace_1",
    };
    const create = vi.fn().mockResolvedValue({ id: "suppression_new" });
    const update = vi.fn().mockResolvedValue({ id: "suppression_existing" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const transactionFindFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "suppression_active", deletedAt: null })
      .mockResolvedValueOnce({ id: "suppression_deleted", deletedAt: deleted.deletedAt });
    const transaction = vi.fn(async (callback) =>
      callback({
        auditEvent: { create: auditCreate },
        suppressionEntry: { create, findFirst: transactionFindFirst, update },
      }),
    );
    const utility = new SuppressionBulkUtility(
      {
        $transaction: transaction,
        suppressionEntry: { findMany: vi.fn().mockResolvedValue([active, deleted]) },
        workspace: { findMany: vi.fn().mockResolvedValue([{ id: "workspace_1" }]) },
      } as never,
      () => new Date("2026-07-19T12:00:00.000Z"),
    );
    const csv = [
      "workspace_id,channel_type,value,value_hash,reason,source",
      ",email,ada@example.com,,Global opt out,manual",
      `workspace_1,phone,,${phoneHash},Updated request,crm`,
      `workspace_1,linkedin_context,,${linkedinHash},Renewed request,legacy`,
      "",
    ].join("\n");

    const result = await utility.executeImport(
      { operator: "fixture-operator", tenantId: "tenant_1" },
      csv,
      "IMPORT 3 SUPPRESSIONS tenant_1",
    );

    expect(result).toEqual({
      auditEventId: "audit_1",
      count: 3,
      created: 1,
      importedAt: "2026-07-19T12:00:00.000Z",
      reactivated: 1,
      updated: 1,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        channelType: "email",
        reason: "Global opt out",
        source: "manual",
        tenantId: "tenant_1",
        valueHash: emailHash,
        workspaceId: null,
      },
    });
    expect(update).toHaveBeenNthCalledWith(1, {
      data: { deletedAt: null, reason: "Updated request", source: "crm" },
      where: { id: "suppression_active" },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      data: { deletedAt: null, reason: "Renewed request", source: "legacy" },
      where: { id: "suppression_deleted" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        eventType: "suppression.bulk_import.completed",
        metadata: {
          count: 3,
          created: 1,
          operator: "fixture-operator",
          reactivated: 1,
          updated: 1,
        },
        subjectId: "tenant_1",
        subjectType: "tenant",
        tenantId: "tenant_1",
      },
      select: { id: true },
    });
  });
});
