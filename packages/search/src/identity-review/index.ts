import crypto from "node:crypto";

import {
  resolveEntityCandidates,
  type EntityResolutionCandidate,
  type EntityResolutionInput,
  type EntityResolutionResult,
  type EntityResolutionSignal,
  type EntityResolutionSignalType,
} from "../index";

export interface IdentityReviewCase {
  candidates: EntityResolutionCandidate[];
  caseId: string;
  input: EntityResolutionInput;
  schemaVersion: 1;
  subjectEntityId: string;
  tenantId: string;
  workspaceId: string;
}

export interface CandidateExplanation {
  candidate: EntityResolutionCandidate;
  cautions: string[];
  decision: EntityResolutionResult["decision"];
  evidence: Array<
    EntityResolutionSignal & {
      category: "advisory" | "corroborating" | "deterministic";
    }
  >;
  requiresHumanDecision: true;
  score: number;
  summary: string;
}

export interface IdentityReviewReport {
  candidates: CandidateExplanation[];
  caseId: string;
  schemaVersion: 1;
  subjectEntityId: string;
  tenantId: string;
  workspaceId: string;
}

export interface IdentityAuditEvent {
  actorId: string;
  affectedEntityIds: string[];
  afterAssignments: Record<string, string>;
  beforeAssignments: Record<string, string>;
  eventHash: string;
  operation: "merge" | "split";
  performedAt: string;
  previousEventHash?: string;
  reason: string;
  review?: {
    caseId: string;
    candidate: CandidateExplanation;
  };
  sequence: number;
  sourceEntityId: string;
  targetEntityId?: string;
}

export interface IdentityReviewLedger {
  assignments: Record<string, string>;
  audit: IdentityAuditEvent[];
  entityIds: string[];
  schemaVersion: 1;
  tenantId: string;
  workspaceId: string;
}

export interface IdentityAuditVerification {
  auditDigest: string;
  eventCount: number;
  valid: true;
}

const deterministicSignalTypes = new Set<EntityResolutionSignalType>([
  "exact_domain",
  "exact_email_hash",
  "exact_github",
  "exact_orcid",
  "exact_profile_url",
]);

export function createIdentityReviewReport(value: IdentityReviewCase): IdentityReviewReport {
  const reviewCase = parseIdentityReviewCase(value);
  return {
    candidates: resolveEntityCandidates(reviewCase.input, reviewCase.candidates).map(
      explainCandidate,
    ),
    caseId: reviewCase.caseId,
    schemaVersion: 1,
    subjectEntityId: reviewCase.subjectEntityId,
    tenantId: reviewCase.tenantId,
    workspaceId: reviewCase.workspaceId,
  };
}

export function createIdentityReviewLedger(
  scope: { tenantId: string; workspaceId: string },
  entityIds: string[],
): IdentityReviewLedger {
  requireText(scope.tenantId, "tenantId");
  requireText(scope.workspaceId, "workspaceId");
  const uniqueIds = [...new Set(entityIds.map((entityId) => requireText(entityId, "entityId")))];
  if (uniqueIds.length !== entityIds.length || uniqueIds.length < 2) {
    throw new IdentityReviewError("Ledger requires at least two unique entity IDs");
  }
  return {
    assignments: Object.fromEntries(uniqueIds.map((entityId) => [entityId, entityId])),
    audit: [],
    entityIds: uniqueIds,
    schemaVersion: 1,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  };
}

export function mergeReviewedIdentity(
  ledgerValue: IdentityReviewLedger,
  report: IdentityReviewReport,
  candidateEntityId: string,
  decision: { actorId: string; performedAt: string; reason: string },
): IdentityReviewLedger {
  const ledger = cloneAndVerify(ledgerValue);
  assertSameScope(ledger, report);
  const candidate = report.candidates.find((item) => item.candidate.entityId === candidateEntityId);
  if (!candidate) {
    throw new IdentityReviewError(
      `Candidate ${candidateEntityId} is not in review ${report.caseId}`,
    );
  }
  if (candidate.decision === "new_entity") {
    throw new IdentityReviewError(
      "A new-entity recommendation cannot be merged without a new review",
    );
  }
  assertDecision(decision);
  requireKnownEntity(ledger, report.subjectEntityId);
  requireKnownEntity(ledger, candidateEntityId);

  const sourceCanonicalId = ledger.assignments[report.subjectEntityId];
  const targetCanonicalId = ledger.assignments[candidateEntityId];
  if (!sourceCanonicalId || !targetCanonicalId || sourceCanonicalId === targetCanonicalId) {
    throw new IdentityReviewError("Source and candidate are already in the same identity group");
  }
  const affectedEntityIds = ledger.entityIds.filter(
    (entityId) => ledger.assignments[entityId] === sourceCanonicalId,
  );
  const beforeAssignments = pickAssignments(ledger.assignments, affectedEntityIds);
  for (const entityId of affectedEntityIds) {
    ledger.assignments[entityId] = targetCanonicalId;
  }
  const afterAssignments = pickAssignments(ledger.assignments, affectedEntityIds);
  return appendEvent(ledger, {
    actorId: decision.actorId,
    affectedEntityIds,
    afterAssignments,
    beforeAssignments,
    operation: "merge",
    performedAt: decision.performedAt,
    reason: decision.reason,
    review: {
      candidate,
      caseId: report.caseId,
    },
    sourceEntityId: report.subjectEntityId,
    targetEntityId: candidateEntityId,
  });
}

export function splitReviewedIdentity(
  ledgerValue: IdentityReviewLedger,
  entityId: string,
  decision: { actorId: string; performedAt: string; reason: string },
): IdentityReviewLedger {
  const ledger = cloneAndVerify(ledgerValue);
  requireKnownEntity(ledger, entityId);
  assertDecision(decision);
  const currentCanonicalId = ledger.assignments[entityId];
  if (!currentCanonicalId || currentCanonicalId === entityId) {
    throw new IdentityReviewError(`Entity ${entityId} is not currently merged`);
  }
  const beforeAssignments = { [entityId]: currentCanonicalId };
  ledger.assignments[entityId] = entityId;
  return appendEvent(ledger, {
    actorId: decision.actorId,
    affectedEntityIds: [entityId],
    afterAssignments: { [entityId]: entityId },
    beforeAssignments,
    operation: "split",
    performedAt: decision.performedAt,
    reason: decision.reason,
    sourceEntityId: entityId,
    targetEntityId: currentCanonicalId,
  });
}

export function verifyIdentityReviewLedger(value: IdentityReviewLedger): IdentityAuditVerification {
  validateLedgerShape(value);
  const assignments = Object.fromEntries(value.entityIds.map((entityId) => [entityId, entityId]));
  let previousEventHash: string | undefined;
  value.audit.forEach((event, index) => {
    if (event.sequence !== index + 1) {
      throw new IdentityReviewError(`Audit sequence ${event.sequence} is out of order`);
    }
    if (event.previousEventHash !== previousEventHash) {
      throw new IdentityReviewError(`Audit event ${event.sequence} breaks the hash chain`);
    }
    if (hashAuditEvent(event) !== event.eventHash) {
      throw new IdentityReviewError(
        `Audit event ${event.sequence} hash does not match its content`,
      );
    }
    for (const entityId of event.affectedEntityIds) {
      if (assignments[entityId] !== event.beforeAssignments[entityId]) {
        throw new IdentityReviewError(
          `Audit event ${event.sequence} cannot replay its before state`,
        );
      }
      const after = event.afterAssignments[entityId];
      if (!after || !value.entityIds.includes(after)) {
        throw new IdentityReviewError(`Audit event ${event.sequence} has an invalid after state`);
      }
      assignments[entityId] = after;
    }
    previousEventHash = event.eventHash;
  });
  if (stableStringify(assignments) !== stableStringify(value.assignments)) {
    throw new IdentityReviewError("Ledger assignments do not match replayed audit state");
  }
  return {
    auditDigest: hashValue(stableStringify(value)),
    eventCount: value.audit.length,
    valid: true,
  };
}

export function parseIdentityReviewCase(value: unknown): IdentityReviewCase {
  const reviewCase = requireRecord(value, "Identity review case") as unknown as IdentityReviewCase;
  if (reviewCase.schemaVersion !== 1) {
    throw new IdentityReviewError("Identity review case schemaVersion must be 1");
  }
  requireText(reviewCase.caseId, "caseId");
  requireText(reviewCase.subjectEntityId, "subjectEntityId");
  requireText(reviewCase.tenantId, "tenantId");
  requireText(reviewCase.workspaceId, "workspaceId");
  requireRecord(reviewCase.input, "input");
  if (!Array.isArray(reviewCase.candidates) || reviewCase.candidates.length === 0) {
    throw new IdentityReviewError("Identity review case requires at least one candidate");
  }
  for (const candidate of reviewCase.candidates) {
    requireText(candidate.entityId, "candidate.entityId");
    requireText(candidate.canonicalName, "candidate.canonicalName");
    if (!["person", "organization", "other"].includes(candidate.type)) {
      throw new IdentityReviewError(`Candidate ${candidate.entityId} has an invalid type`);
    }
  }
  if (
    reviewCase.candidates.some((candidate) => candidate.entityId === reviewCase.subjectEntityId)
  ) {
    throw new IdentityReviewError("Subject entity cannot also be a candidate");
  }
  return reviewCase;
}

export function parseIdentityReviewLedger(value: unknown): IdentityReviewLedger {
  const ledger = requireRecord(value, "Identity review ledger") as unknown as IdentityReviewLedger;
  verifyIdentityReviewLedger(ledger);
  return ledger;
}

export class IdentityReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityReviewError";
  }
}

function explainCandidate(result: EntityResolutionResult): CandidateExplanation {
  const evidence = result.signals.map((signal) => ({
    ...signal,
    category:
      signal.type === "llm_suggestion"
        ? ("advisory" as const)
        : deterministicSignalTypes.has(signal.type)
          ? ("deterministic" as const)
          : ("corroborating" as const),
  }));
  const cautions: string[] = [];
  if (evidence.length === 0) {
    cautions.push("No identity signals aligned");
  }
  if (!evidence.some((signal) => signal.category === "deterministic")) {
    cautions.push("No strong deterministic identifier matched");
  }
  if (evidence.some((signal) => signal.category === "advisory")) {
    cautions.push("LLM suggestions are advisory and cannot authorize a merge");
  }
  const action =
    result.decision === "match"
      ? "Strong match"
      : result.decision === "review"
        ? "Human review"
        : "Keep separate";
  return {
    candidate: result.candidate,
    cautions,
    decision: result.decision,
    evidence,
    requiresHumanDecision: true,
    score: result.score,
    summary: `${action}: ${(result.score * 100).toFixed(1)}% combined signal score from ${evidence.length} explainable signal${evidence.length === 1 ? "" : "s"}.`,
  };
}

function appendEvent(
  ledger: IdentityReviewLedger,
  input: Omit<IdentityAuditEvent, "eventHash" | "previousEventHash" | "sequence">,
): IdentityReviewLedger {
  const eventWithoutHash = {
    ...input,
    previousEventHash: ledger.audit.at(-1)?.eventHash,
    sequence: ledger.audit.length + 1,
  };
  const event: IdentityAuditEvent = {
    ...eventWithoutHash,
    eventHash: hashValue(stableStringify(eventWithoutHash)),
  };
  ledger.audit.push(event);
  verifyIdentityReviewLedger(ledger);
  return ledger;
}

function hashAuditEvent(event: IdentityAuditEvent): string {
  const { eventHash: _eventHash, ...content } = event;
  return hashValue(stableStringify(content));
}

function cloneAndVerify(value: IdentityReviewLedger): IdentityReviewLedger {
  verifyIdentityReviewLedger(value);
  return structuredClone(value);
}

function validateLedgerShape(ledger: IdentityReviewLedger): void {
  if (ledger.schemaVersion !== 1) {
    throw new IdentityReviewError("Identity review ledger schemaVersion must be 1");
  }
  requireText(ledger.tenantId, "tenantId");
  requireText(ledger.workspaceId, "workspaceId");
  if (
    !Array.isArray(ledger.entityIds) ||
    new Set(ledger.entityIds).size !== ledger.entityIds.length ||
    ledger.entityIds.length < 2
  ) {
    throw new IdentityReviewError("Ledger entity IDs must contain at least two unique values");
  }
  requireRecord(ledger.assignments, "assignments");
  if (!Array.isArray(ledger.audit)) {
    throw new IdentityReviewError("Ledger audit must be an array");
  }
  for (const entityId of ledger.entityIds) {
    if (!ledger.entityIds.includes(ledger.assignments[entityId] ?? "")) {
      throw new IdentityReviewError(`Ledger assignment for ${entityId} is invalid`);
    }
  }
}

function assertSameScope(ledger: IdentityReviewLedger, report: IdentityReviewReport): void {
  if (ledger.tenantId !== report.tenantId || ledger.workspaceId !== report.workspaceId) {
    throw new IdentityReviewError("Review and ledger tenant/workspace scopes do not match");
  }
}

function assertDecision(decision: { actorId: string; performedAt: string; reason: string }): void {
  requireText(decision.actorId, "actorId");
  requireText(decision.reason, "reason");
  if (
    Number.isNaN(Date.parse(decision.performedAt)) ||
    new Date(decision.performedAt).toISOString() !== decision.performedAt
  ) {
    throw new IdentityReviewError("performedAt must be an ISO-8601 UTC timestamp");
  }
}

function requireKnownEntity(ledger: IdentityReviewLedger, entityId: string): void {
  if (!ledger.entityIds.includes(entityId)) {
    throw new IdentityReviewError(`Entity ${entityId} is outside the ledger`);
  }
}

function pickAssignments(
  assignments: Record<string, string>,
  entityIds: string[],
): Record<string, string> {
  return Object.fromEntries(entityIds.map((entityId) => [entityId, assignments[entityId] ?? ""]));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new IdentityReviewError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new IdentityReviewError(`${label} must be a non-empty string`);
  }
  return value;
}

function hashValue(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}
