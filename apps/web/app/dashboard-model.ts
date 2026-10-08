export type BusyAction =
  | "analyze"
  | "audit"
  | "brief"
  | "contact"
  | "draft"
  | "evaluate"
  | "jobs"
  | "login"
  | "logout"
  | "notes"
  | "prospects"
  | "privacy"
  | "register"
  | "retention"
  | "search"
  | "suppression";

export type ToastTone = "danger" | "info" | "success" | "warning";

export type OnboardingState = {
  hasBrief: boolean;
  hasComplianceReview: boolean;
  hasDraft: boolean;
  hasEvidence: boolean;
  isAuthenticated: boolean;
};

export type OnboardingStep = {
  complete: boolean;
  current: boolean;
  description: string;
  id: "brief" | "connect" | "draft" | "intake" | "review";
  label: string;
};

export function buildOnboardingSteps(state: OnboardingState): OnboardingStep[] {
  const steps = [
    {
      complete: state.isAuthenticated,
      description: "Sign in to Kinship or continue with the guided demo workspace.",
      id: "connect" as const,
      label: "Sign in",
    },
    {
      complete: state.hasEvidence,
      description: "Add approved public or user-provided context for one prospect.",
      id: "intake" as const,
      label: "Add evidence",
    },
    {
      complete: state.hasBrief,
      description: "Generate an evidence-backed relationship brief with confidence signals.",
      id: "brief" as const,
      label: "Generate brief",
    },
    {
      complete: state.hasDraft,
      description: "Create a human-review draft that cites stored evidence.",
      id: "draft" as const,
      label: "Review draft",
    },
    {
      complete: state.hasComplianceReview,
      description: "Check consent, suppression, and channel risk before outreach.",
      id: "review" as const,
      label: "Check compliance",
    },
  ];
  const currentStepId = steps.find((step) => !step.complete)?.id;

  return steps.map((step) => ({
    ...step,
    current: step.id === currentStepId,
  }));
}

export function getBusyActionLabel(action: BusyAction | null): string {
  switch (action) {
    case "analyze":
      return "Analyzing approved context";
    case "audit":
      return "Refreshing activity";
    case "brief":
      return "Generating relationship brief";
    case "contact":
      return "Saving contact channel";
    case "draft":
      return "Drafting outreach";
    case "evaluate":
      return "Checking compliance";
    case "jobs":
      return "Refreshing trust status";
    case "login":
      return "Signing in";
    case "logout":
      return "Signing out";
    case "notes":
      return "Saving relationship note";
    case "prospects":
      return "Finding prospects";
    case "privacy":
      return "Preparing privacy request";
    case "register":
      return "Creating workspace";
    case "retention":
      return "Applying retention policy";
    case "search":
      return "Searching evidence";
    case "suppression":
      return "Creating suppression";
    default:
      return "Ready";
  }
}

export function getToastTone(message: string): ToastTone {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("api 4") ||
    normalized.includes("api 5")
  ) {
    return "danger";
  }

  if (
    normalized.includes("warn") ||
    normalized.includes("unknown") ||
    normalized.includes("review") ||
    normalized.includes("suppression")
  ) {
    return "warning";
  }

  if (
    normalized.includes("complete") ||
    normalized.includes("connected") ||
    normalized.includes("generated") ||
    normalized.includes("saved") ||
    normalized.includes("created")
  ) {
    return "success";
  }

  return "info";
}

export type WorkspaceHealthInput = {
  auditEventCount: number;
  evidenceCount: number;
  prospectCount: number;
  risk?: "allowed" | "blocked" | "warn" | string;
};

export function summarizeWorkspaceHealth(input: WorkspaceHealthInput) {
  return {
    activityLabel: `${input.auditEventCount} ${input.auditEventCount === 1 ? "event" : "events"}`,
    evidenceLabel: `${input.evidenceCount} ${input.evidenceCount === 1 ? "item" : "items"}`,
    prospectLabel: `${input.prospectCount} ${input.prospectCount === 1 ? "prospect" : "prospects"}`,
    riskLabel: formatRisk(input.risk),
  };
}

function formatRisk(risk?: string): string {
  if (risk === "allowed") {
    return "Low risk";
  }

  if (risk === "blocked") {
    return "Blocked";
  }

  if (risk === "warn") {
    return "Review needed";
  }

  return "Not checked";
}

export type WorkflowProgressInput = {
  hasBrief: boolean;
  hasComplianceReview: boolean;
  hasDraft: boolean;
  hasEvidence: boolean;
};

export type WorkflowProgressSummary = {
  completed: number;
  label: string;
  percent: number;
  total: number;
};

export function buildWorkflowProgress(input: WorkflowProgressInput): WorkflowProgressSummary {
  const completeStates = [
    input.hasEvidence,
    input.hasBrief,
    input.hasDraft,
    input.hasComplianceReview,
  ];
  const completed = completeStates.filter(Boolean).length;
  const total = completeStates.length;

  return {
    completed,
    label: `${completed} of ${total} workflow steps complete`,
    percent: Math.round((completed / total) * 100),
    total,
  };
}

export type ProspectLike = {
  entity: {
    canonicalName: string;
    id: string;
  };
  evidence: Array<{
    sourceType?: string;
    summary: string;
  }>;
  fitScore: number;
};

export type ProspectSort = "fit" | "name" | "saved";

export type ProspectFilterOptions = {
  query: string;
  savedIds: ReadonlySet<string>;
  sort: ProspectSort;
  sourceType: "all" | string;
};

export function filterAndSortProspects<T extends ProspectLike>(
  items: readonly T[],
  options: ProspectFilterOptions,
): T[] {
  const normalizedQuery = options.query.trim().toLowerCase();

  return [...items]
    .filter((item) => {
      const searchableText = [
        item.entity.canonicalName,
        ...item.evidence.flatMap((evidence) => [evidence.sourceType ?? "", evidence.summary]),
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = normalizedQuery.length === 0 || searchableText.includes(normalizedQuery);
      const matchesSource =
        options.sourceType === "all" ||
        item.evidence.some((evidence) => evidence.sourceType === options.sourceType);

      return matchesQuery && matchesSource;
    })
    .sort((left, right) => {
      if (options.sort === "saved") {
        const savedDelta =
          Number(options.savedIds.has(right.entity.id)) -
          Number(options.savedIds.has(left.entity.id));
        if (savedDelta !== 0) {
          return savedDelta;
        }
      }

      if (options.sort === "name") {
        return left.entity.canonicalName.localeCompare(right.entity.canonicalName);
      }

      return right.fitScore - left.fitScore;
    });
}

export type DraftSaveStateInput = {
  dirty: boolean;
  error?: boolean;
  savedAt: null | string;
  saving?: boolean;
};

export type DraftSaveStateSummary = {
  label: string;
  tone: "info" | "success" | "warning";
};

export function summarizeDraftSaveState(input: DraftSaveStateInput): DraftSaveStateSummary {
  if (input.error) {
    return {
      label: "Save failed",
      tone: "warning",
    };
  }

  if (input.saving) {
    return {
      label: "Saving...",
      tone: "info",
    };
  }

  if (input.dirty) {
    return {
      label: "Unsaved changes",
      tone: "warning",
    };
  }

  if (input.savedAt) {
    return {
      label: `Saved ${formatTime(input.savedAt)}`,
      tone: "success",
    };
  }

  return {
    label: "Not saved this session",
    tone: "info",
  };
}

export type NoteTimelineItem = {
  authorId?: string;
  authorName?: string;
  body: string;
  createdAt: string;
  eventType: string;
  id: string;
  subjectType: "note";
  updatedAt?: string;
};

export function createNoteTimelineItem(
  body: string,
  subjectName: string,
  nowIso = new Date().toISOString(),
): NoteTimelineItem {
  return {
    body: body.trim(),
    createdAt: nowIso,
    eventType: `note.added: ${subjectName}`,
    id: `note_${nowIso.replace(/[:.]/g, "-")}`,
    subjectType: "note",
  };
}

export type ComplianceDecisionSummaryInput = {
  decision: string;
  reason?: string;
  warnings?: string[];
};

export type ComplianceDecisionSummary = {
  label: string;
  reason: string;
  tone: ToastTone;
  warnings: string[];
};

export function summarizeComplianceDecision(
  input: ComplianceDecisionSummaryInput,
): ComplianceDecisionSummary {
  const decision = input.decision.toLowerCase();
  const warnings = input.warnings ?? [];

  if (decision === "blocked") {
    return {
      label: "Blocked",
      reason: input.reason ?? "A deterministic compliance rule blocked this channel.",
      tone: "danger",
      warnings,
    };
  }

  if (decision === "allowed") {
    return {
      label: "Allowed",
      reason: input.reason ?? "No deterministic compliance block was found.",
      tone: "success",
      warnings,
    };
  }

  return {
    label: "Review needed",
    reason: input.reason ?? "Human review is required before outreach.",
    tone: "warning",
    warnings,
  };
}

export type JobStatusLike = {
  attempts?: number;
  failureReason?: null | string;
  jobName: string;
  progress?: {
    briefId?: string;
    draftId?: string;
    entityId?: string;
    percent?: number;
    stage?: string;
  };
  status: string;
};

export type CompletedJobResult = {
  artifactId: string;
  kind: "brief" | "draft" | "evidence";
};

export function classifyCompletedJob(input: JobStatusLike): CompletedJobResult | null {
  if (input.status !== "completed") return null;
  if (input.jobName === "relationship_brief.generate" && input.progress?.briefId) {
    return { artifactId: input.progress.briefId, kind: "brief" };
  }
  if (input.jobName === "draft_message.generate" && input.progress?.draftId) {
    return { artifactId: input.progress.draftId, kind: "draft" };
  }
  if (
    (input.jobName === "evidence.ingest" || input.jobName === "connector.sync") &&
    input.progress?.entityId
  ) {
    return { artifactId: input.progress.entityId, kind: "evidence" };
  }
  return null;
}

export type JobStatusSummary = {
  detail: string;
  label: string;
  tone: ToastTone;
};

export function summarizeJobStatus(input: JobStatusLike): JobStatusSummary {
  const status = input.status.toLowerCase();
  const attempts = input.attempts ?? 0;
  const attemptDetail = attempts + " " + (attempts === 1 ? "attempt" : "attempts");
  const percent = Math.max(0, Math.min(100, input.progress?.percent ?? 0));
  const stage = formatToken(input.progress?.stage ?? status);
  const detail =
    (status === "failed" || status === "dead_lettered") && input.failureReason
      ? input.failureReason
      : status === "active" || status === "queued"
        ? stage + " | " + percent + "% | " + attemptDetail
        : status === "canceled"
          ? "Canceled before processing"
          : attemptDetail;
  return {
    detail,
    label: `${formatAuditEventLabel(input.jobName)} ${formatStatusWord(status)}`,
    tone: getJobTone(status),
  };
}

export type SuppressionEntryLike = {
  channelType: string;
  source?: null | string;
  workspaceId?: null | string;
};

export type SuppressionEntrySummary = {
  detail: string;
  label: string;
};

export function summarizeSuppressionEntry(input: SuppressionEntryLike): SuppressionEntrySummary {
  const scope = input.workspaceId ? "Workspace" : "Tenant";
  return {
    detail: `Source: ${input.source ?? "manual"}`,
    label: `${scope} ${formatToken(input.channelType)} suppression`,
  };
}

export function formatAuditEventLabel(eventType: string): string {
  const known: Record<string, string> = {
    "auth.login": "Login",
    "auth.logout": "Logout",
    "auth.registered": "Registered",
    "compliance.allowed": "Compliance allowed",
    "compliance.blocked": "Compliance blocked",
    "compliance.warned": "Compliance warned",
    "contact_channel.upserted": "Contact channel saved",
    "demo.loaded": "Demo loaded",
    "draft.created": "Draft created",
    "evidence.ingest": "Evidence ingest",
    "evidence.ingested": "Evidence ingested",
    "relationship_brief.created": "Relationship brief created",
    "suppression.created": "Suppression created",
    "suppression.deleted": "Suppression deleted",
    "workspace.created": "Workspace created",
  };

  if (known[eventType]) {
    return known[eventType];
  }

  const words = eventType
    .split(/[._-]+/)
    .filter(Boolean)
    .map(formatToken);
  if (words.length === 0) {
    return "Activity event";
  }

  return [words[0]?.replace(/^./, (char) => char.toUpperCase()), ...words.slice(1)].join(" ");
}

function formatStatusWord(status: string): string {
  if (status === "active") {
    return "active";
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "queued") {
    return "queued";
  }

  return formatToken(status);
}

function getJobTone(status: string): ToastTone {
  if (status === "completed") {
    return "success";
  }

  if (status === "failed" || status === "dead_lettered") {
    return "danger";
  }

  if (status === "active" || status === "queued") {
    return "info";
  }

  return "warning";
}

function formatToken(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}
function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}
