import type { ChannelType, PrismaClient } from "@relationship/db";

import { parseCsvRecords } from "../common/csv";
import { hashContactValue } from "./contact-value";

export interface SuppressionBulkTarget {
  operator: string;
  tenantId: string;
}

export class SuppressionBulkUtility {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exportCsv(target: SuppressionBulkTarget) {
    const entries = await this.prisma.suppressionEntry.findMany({
      orderBy: [{ workspaceId: "asc" }, { channelType: "asc" }, { valueHash: "asc" }],
      select: {
        channelType: true,
        reason: true,
        source: true,
        valueHash: true,
        workspaceId: true,
      },
      where: { deletedAt: null, tenantId: target.tenantId },
    });
    const rows = entries.map((entry) =>
      [entry.workspaceId ?? "", entry.channelType, "", entry.valueHash, entry.reason, entry.source]
        .map(encodeCsvCell)
        .join(","),
    );

    return {
      count: entries.length,
      csv: ["workspace_id,channel_type,value,value_hash,reason,source", ...rows, ""].join("\n"),
      generatedAt: this.now().toISOString(),
    };
  }

  async previewImport(target: SuppressionBulkTarget, csv: string) {
    const entries = parseSuppressionCsv(csv);
    const workspaceIds = [...new Set(entries.flatMap((entry) => entry.workspaceId ?? []))];
    if (workspaceIds.length > 0) {
      const workspaces = await this.prisma.workspace.findMany({
        select: { id: true },
        where: {
          deletedAt: null,
          id: { in: workspaceIds },
          tenantId: target.tenantId,
        },
      });
      const found = new Set(workspaces.map((workspace) => workspace.id));
      const missing = workspaceIds.filter((workspaceId) => !found.has(workspaceId));
      if (missing.length > 0) {
        throw new Error(`Workspaces were not found in tenant: ${missing.join(", ")}`);
      }
    }

    const existing = await this.prisma.suppressionEntry.findMany({
      select: {
        channelType: true,
        deletedAt: true,
        valueHash: true,
        workspaceId: true,
      },
      where: {
        OR: entries.map((entry) => ({
          channelType: entry.channelType,
          valueHash: entry.valueHash,
          workspaceId: entry.workspaceId,
        })),
        tenantId: target.tenantId,
      },
    });
    const planned = entries.map((entry) => {
      const match = existing.find(
        (candidate) =>
          candidate.channelType === entry.channelType &&
          candidate.valueHash === entry.valueHash &&
          candidate.workspaceId === entry.workspaceId,
      );
      const action = !match ? "create" : match.deletedAt ? "reactivate" : "update";
      return {
        action,
        channelType: entry.channelType,
        row: entry.row,
        valueHash: entry.valueHash,
        workspaceId: entry.workspaceId,
      };
    });

    return {
      confirmation: `IMPORT ${entries.length} SUPPRESSIONS ${target.tenantId}`,
      count: entries.length,
      created: planned.filter((entry) => entry.action === "create").length,
      entries: planned,
      generatedAt: this.now().toISOString(),
      reactivated: planned.filter((entry) => entry.action === "reactivate").length,
      updated: planned.filter((entry) => entry.action === "update").length,
    };
  }

  async executeImport(target: SuppressionBulkTarget, csv: string, confirmation: string) {
    const plan = await this.previewImport(target, csv);
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }

    const entries = parseSuppressionCsv(csv);
    const importedAt = this.now();
    return this.prisma.$transaction(async (tx) => {
      const counts = { created: 0, reactivated: 0, updated: 0 };
      for (const entry of entries) {
        const existing = await tx.suppressionEntry.findFirst({
          select: { deletedAt: true, id: true },
          where: {
            channelType: entry.channelType,
            tenantId: target.tenantId,
            valueHash: entry.valueHash,
            workspaceId: entry.workspaceId,
          },
        });
        if (existing) {
          await tx.suppressionEntry.update({
            data: {
              deletedAt: null,
              reason: entry.reason,
              source: entry.source,
            },
            where: { id: existing.id },
          });
          if (existing.deletedAt) counts.reactivated += 1;
          else counts.updated += 1;
        } else {
          await tx.suppressionEntry.create({
            data: {
              channelType: entry.channelType,
              reason: entry.reason,
              source: entry.source,
              tenantId: target.tenantId,
              valueHash: entry.valueHash,
              workspaceId: entry.workspaceId,
            },
          });
          counts.created += 1;
        }
      }

      const auditEvent = await tx.auditEvent.create({
        data: {
          eventType: "suppression.bulk_import.completed",
          metadata: {
            count: entries.length,
            ...counts,
            operator: target.operator,
          },
          subjectId: target.tenantId,
          subjectType: "tenant",
          tenantId: target.tenantId,
        },
        select: { id: true },
      });
      return {
        auditEventId: auditEvent.id,
        count: entries.length,
        ...counts,
        importedAt: importedAt.toISOString(),
      };
    });
  }
}

interface SuppressionImportEntry {
  channelType: ChannelType;
  reason: string;
  row: number;
  source: string;
  valueHash: string;
  workspaceId: string | null;
}

const channelTypes = new Set<ChannelType>([
  "email",
  "linkedin_context",
  "phone",
  "meeting",
  "unknown",
]);

function parseSuppressionCsv(csv: string): SuppressionImportEntry[] {
  const records = parseCsvRecords(csv.replace(/^\uFEFF/, ""));
  const expectedHeaders = [
    "workspace_id",
    "channel_type",
    "value",
    "value_hash",
    "reason",
    "source",
  ];
  const headers = records[0]?.map((value) => value.trim().toLowerCase()) ?? [];
  if (headers.join(",") !== expectedHeaders.join(",")) {
    throw new Error(`CSV headers must be ${expectedHeaders.join(",")}`);
  }

  const entries = records.slice(1).flatMap((record, index) => {
    if (record.every((value) => !value.trim())) return [];
    const [
      workspaceIdValue,
      channelTypeValue,
      valueValue,
      valueHashValue,
      reasonValue,
      sourceValue,
    ] = record;
    const row = index + 2;
    const workspaceId = workspaceIdValue?.trim() || null;
    const channelType = channelTypeValue?.trim() as ChannelType;
    const value = valueValue?.trim() ?? "";
    const suppliedHash = valueHashValue?.trim().toLowerCase() ?? "";
    const reason = reasonValue?.trim() ?? "";
    const source = sourceValue?.trim() ?? "";
    if (!channelTypes.has(channelType)) throw new Error(`Row ${row}: invalid channel_type`);
    if ((!value && !suppliedHash) || (value && suppliedHash)) {
      throw new Error(`Row ${row}: provide exactly one of value or value_hash`);
    }
    if (suppliedHash && !/^[a-f0-9]{64}$/.test(suppliedHash)) {
      throw new Error(`Row ${row}: value_hash must be 64 lowercase hexadecimal characters`);
    }
    if (!reason) throw new Error(`Row ${row}: reason is required`);
    if (!source) throw new Error(`Row ${row}: source is required`);
    return [
      {
        channelType,
        reason,
        row,
        source,
        valueHash: suppliedHash || hashContactValue(channelType, value),
        workspaceId,
      },
    ];
  });
  if (entries.length === 0) throw new Error("CSV has no suppression rows");

  const keys = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.workspaceId ?? ""}:${entry.channelType}:${entry.valueHash}`;
    if (keys.has(key)) throw new Error(`Row ${entry.row}: duplicate suppression entry`);
    keys.add(key);
  }
  return entries;
}

function encodeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
