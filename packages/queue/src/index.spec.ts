import { describe, expect, it } from "vitest";

import {
  parseBriefGenerationJobPayload,
  parseConnectorSyncJobPayload,
  parseDraftGenerationJobPayload,
  parseEvidenceIngestionJobPayload,
  parseRetentionCleanupJobPayload,
} from "./index";

describe("parseBriefGenerationJobPayload", () => {
  it("accepts a scoped brief-generation payload and rejects incomplete work", () => {
    expect(
      parseBriefGenerationJobPayload({
        goal: "research collaboration",
        requestedByUserId: "user_1",
        subjectEntityId: "entity_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      goal: "research collaboration",
      requestedByUserId: "user_1",
      subjectEntityId: "entity_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(() =>
      parseBriefGenerationJobPayload({
        subjectEntityId: "entity_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toThrow("Stored brief generation payload is invalid");
  });
});

describe("parseDraftGenerationJobPayload", () => {
  it("accepts a scoped draft-generation payload and rejects unsupported variants", () => {
    expect(
      parseDraftGenerationJobPayload({
        briefId: "brief_1",
        requestedByUserId: "user_1",
        tenantId: "tenant_1",
        variant: "warm_professional",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      briefId: "brief_1",
      requestedByUserId: "user_1",
      tenantId: "tenant_1",
      variant: "warm_professional",
      workspaceId: "workspace_1",
    });

    expect(() =>
      parseDraftGenerationJobPayload({
        briefId: "brief_1",
        requestedByUserId: "user_1",
        tenantId: "tenant_1",
        variant: "salesy",
        workspaceId: "workspace_1",
      }),
    ).toThrow("Stored draft generation payload is invalid");
  });
});

describe("parseConnectorSyncJobPayload", () => {
  it("accepts a scoped connector sync payload and rejects unsupported providers", () => {
    expect(
      parseConnectorSyncJobPayload({
        connectorAccountId: "connector_1",
        connectorRunId: "run_1",
        entityId: "entity_1",
        provider: "github",
        requestedByUserId: "user_1",
        sourceIdentifier: "https://github.com/example/project",
        subjectName: "Example project",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toMatchObject({
      connectorAccountId: "connector_1",
      connectorRunId: "run_1",
      provider: "github",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    expect(() =>
      parseConnectorSyncJobPayload({
        connectorAccountId: "connector_1",
        connectorRunId: "run_1",
        provider: "gmail",
        requestedByUserId: "user_1",
        sourceIdentifier: "mailbox",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toThrow("Stored connector sync payload is invalid");
  });

  it("accepts a system-attributed scheduled connector refresh", () => {
    expect(
      parseConnectorSyncJobPayload({
        connectorAccountId: "connector_1",
        connectorRunId: "run_1",
        provider: "github",
        sourceIdentifier: "https://github.com/example/project",
        tenantId: "tenant_1",
        trigger: "scheduled",
        workspaceId: "workspace_1",
      }),
    ).toMatchObject({
      connectorAccountId: "connector_1",
      connectorRunId: "run_1",
      trigger: "scheduled",
    });

    expect(() =>
      parseConnectorSyncJobPayload({
        connectorAccountId: "connector_1",
        connectorRunId: "run_1",
        provider: "github",
        sourceIdentifier: "https://github.com/example/project",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toThrow("Stored connector sync payload is invalid");
  });
});

describe("parseEvidenceIngestionJobPayload", () => {
  it("accepts a scoped evidence-ingestion payload", () => {
    expect(
      parseEvidenceIngestionJobPayload({
        sourceIdentifier: "https://example.com",
        sourceType: "user_url",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toMatchObject({
      sourceType: "user_url",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
  });

  it("rejects malformed or unsupported queued payloads", () => {
    expect(() =>
      parseEvidenceIngestionJobPayload({
        sourceIdentifier: "https://example.com",
        sourceType: "gmail",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).toThrow("Stored evidence ingestion payload is invalid");
  });
});

describe("parseRetentionCleanupJobPayload", () => {
  it("accepts a scheduled evidence cutoff and rejects invalid dates", () => {
    expect(
      parseRetentionCleanupJobPayload({
        cutoffAt: "2026-10-08T12:00:00.000Z",
        dataClass: "evidence",
        tenantId: "tenant_1",
        trigger: "scheduled",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      cutoffAt: "2026-10-08T12:00:00.000Z",
      dataClass: "evidence",
      tenantId: "tenant_1",
      trigger: "scheduled",
      workspaceId: "workspace_1",
    });

    expect(() =>
      parseRetentionCleanupJobPayload({
        cutoffAt: "not-a-date",
        dataClass: "evidence",
        tenantId: "tenant_1",
        trigger: "scheduled",
        workspaceId: "workspace_1",
      }),
    ).toThrow("Stored retention cleanup payload is invalid");
  });
});
