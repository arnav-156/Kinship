export const QueueName = {
  AiEvaluation: "ai-evaluation",
  BriefGeneration: "brief-generation",
  ConnectorSync: "connector-sync",
  DraftGeneration: "draft-generation",
  DraftValidation: "draft-validation",
  EmbeddingGeneration: "embedding-generation",
  EvidenceIngestion: "evidence-ingestion",
  RetentionCleanup: "retention-cleanup",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export interface BackgroundJob<TPayload> {
  idempotencyKey: string;
  name: QueueName;
  payload: TPayload;
  tenantId: string;
  workspaceId: string;
}

export interface BriefGenerationJobPayload {
  goal: string;
  requestedByUserId: string;
  subjectEntityId: string;
  tenantId: string;
  workspaceId: string;
}

export interface ConnectorSyncJobPayload {
  connectorAccountId: string;
  connectorRunId: string;
  entityId?: string;
  provider: EvidenceIngestionJobPayload["sourceType"];
  requestedByUserId?: string;
  sourceIdentifier: string;
  subjectName?: string;
  tenantId: string;
  trigger?: "scheduled";
  workspaceId: string;
}

export type DraftVariant = "concise" | "evidence_heavy" | "warm_professional";

export interface DraftGenerationJobPayload {
  briefId: string;
  requestedByUserId: string;
  tenantId: string;
  variant: DraftVariant;
  workspaceId: string;
}

export interface EvidenceIngestionJobPayload {
  context?: Record<string, string | undefined>;
  entityId?: string;
  goal?: string;
  requestedByUserId?: string;
  sourceIdentifier: string;
  sourceType:
    | "company_website"
    | "crossref"
    | "csv_import"
    | "github"
    | "manual_linkedin_context"
    | "orcid"
    | "semantic_scholar"
    | "user_url";
  subjectName?: string;
  tenantId: string;
  workspaceId: string;
}

export interface RetentionCleanupJobPayload {
  cutoffAt: string;
  dataClass: "evidence";
  tenantId: string;
  trigger: "scheduled";
  workspaceId: string;
}

const evidenceSourceTypes = new Set<EvidenceIngestionJobPayload["sourceType"]>([
  "company_website",
  "crossref",
  "csv_import",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
]);

const draftVariants = new Set<DraftVariant>(["concise", "evidence_heavy", "warm_professional"]);

export function parseBriefGenerationJobPayload(value: unknown): BriefGenerationJobPayload {
  if (!isRecord(value)) throw new Error("Stored brief generation payload is invalid");

  const goal = readRequiredString(value.goal);
  const requestedByUserId = readRequiredString(value.requestedByUserId);
  const subjectEntityId = readRequiredString(value.subjectEntityId);
  const tenantId = readRequiredString(value.tenantId);
  const workspaceId = readRequiredString(value.workspaceId);
  if (!goal || !requestedByUserId || !subjectEntityId || !tenantId || !workspaceId) {
    throw new Error("Stored brief generation payload is invalid");
  }

  return {
    goal,
    requestedByUserId,
    subjectEntityId,
    tenantId,
    workspaceId,
  };
}

export function parseDraftGenerationJobPayload(value: unknown): DraftGenerationJobPayload {
  if (!isRecord(value)) throw new Error("Stored draft generation payload is invalid");

  const briefId = readRequiredString(value.briefId);
  const requestedByUserId = readRequiredString(value.requestedByUserId);
  const tenantId = readRequiredString(value.tenantId);
  const variant = readRequiredString(value.variant);
  const workspaceId = readRequiredString(value.workspaceId);
  if (
    !briefId ||
    !requestedByUserId ||
    !tenantId ||
    !variant ||
    !draftVariants.has(variant as DraftVariant) ||
    !workspaceId
  ) {
    throw new Error("Stored draft generation payload is invalid");
  }

  return {
    briefId,
    requestedByUserId,
    tenantId,
    variant: variant as DraftVariant,
    workspaceId,
  };
}

export function parseConnectorSyncJobPayload(value: unknown): ConnectorSyncJobPayload {
  if (!isRecord(value)) throw new Error("Stored connector sync payload is invalid");

  const connectorAccountId = readRequiredString(value.connectorAccountId);
  const connectorRunId = readRequiredString(value.connectorRunId);
  const provider = readRequiredString(value.provider);
  const requestedByUserId = readOptionalString(value.requestedByUserId);
  const sourceIdentifier = readRequiredString(value.sourceIdentifier);
  const tenantId = readRequiredString(value.tenantId);
  const workspaceId = readRequiredString(value.workspaceId);
  const scheduled = value.trigger === "scheduled";
  if (
    !connectorAccountId ||
    !connectorRunId ||
    !provider ||
    !evidenceSourceTypes.has(provider as EvidenceIngestionJobPayload["sourceType"]) ||
    (!scheduled && !requestedByUserId) ||
    (value.trigger !== undefined && !scheduled) ||
    !sourceIdentifier ||
    !tenantId ||
    !workspaceId
  ) {
    throw new Error("Stored connector sync payload is invalid");
  }

  return {
    connectorAccountId,
    connectorRunId,
    entityId: readOptionalString(value.entityId),
    provider: provider as EvidenceIngestionJobPayload["sourceType"],
    requestedByUserId,
    sourceIdentifier,
    subjectName: readOptionalString(value.subjectName),
    tenantId,
    trigger: scheduled ? "scheduled" : undefined,
    workspaceId,
  };
}

export function parseEvidenceIngestionJobPayload(value: unknown): EvidenceIngestionJobPayload {
  if (!isRecord(value)) throw new Error("Stored evidence ingestion payload is invalid");

  const sourceType = value.sourceType;
  if (
    typeof value.sourceIdentifier !== "string" ||
    typeof sourceType !== "string" ||
    !evidenceSourceTypes.has(sourceType as EvidenceIngestionJobPayload["sourceType"]) ||
    typeof value.tenantId !== "string" ||
    typeof value.workspaceId !== "string"
  ) {
    throw new Error("Stored evidence ingestion payload is invalid");
  }

  return {
    context: isRecord(value.context)
      ? (value.context as Record<string, string | undefined>)
      : undefined,
    entityId: readOptionalString(value.entityId),
    goal: readOptionalString(value.goal),
    requestedByUserId: readOptionalString(value.requestedByUserId),
    sourceIdentifier: value.sourceIdentifier,
    sourceType: sourceType as EvidenceIngestionJobPayload["sourceType"],
    subjectName: readOptionalString(value.subjectName),
    tenantId: value.tenantId,
    workspaceId: value.workspaceId,
  };
}

export function parseRetentionCleanupJobPayload(value: unknown): RetentionCleanupJobPayload {
  if (!isRecord(value)) throw new Error("Stored retention cleanup payload is invalid");

  const cutoffAt = readRequiredString(value.cutoffAt);
  const tenantId = readRequiredString(value.tenantId);
  const workspaceId = readRequiredString(value.workspaceId);
  const cutoffTimestamp = cutoffAt ? Date.parse(cutoffAt) : Number.NaN;
  if (
    !cutoffAt ||
    Number.isNaN(cutoffTimestamp) ||
    new Date(cutoffTimestamp).toISOString() !== cutoffAt ||
    value.dataClass !== "evidence" ||
    !tenantId ||
    value.trigger !== "scheduled" ||
    !workspaceId
  ) {
    throw new Error("Stored retention cleanup payload is invalid");
  }

  return {
    cutoffAt,
    dataClass: "evidence",
    tenantId,
    trigger: "scheduled",
    workspaceId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readRequiredString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
