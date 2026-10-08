import type { ComplianceDecision, SourceType } from "@relationship/shared";
import type { WorkspaceRole } from "@relationship/shared";

export type PolicyPurpose = "relationship_intelligence" | "outreach_review";
export type RecipientType = "personal" | "professional" | "unknown";

export interface CompliancePolicyInput {
  channelType: "email" | "linkedin_context" | "meeting" | "phone" | "unknown";
  consentStatus: "confirmed" | "unknown" | "withdrawn";
  purpose: PolicyPurpose;
  recipientRegion: string;
  recipientType: RecipientType;
  sourceType: SourceType;
  suppressionStatus: "clear" | "suppressed";
  tenantId: string;
  userRegion?: string;
  workspaceId: string;
}

export interface CompliancePolicyResult {
  allowed: boolean;
  auditEventType: string;
  decision: ComplianceDecision;
  reason: string;
  reviewRequired: boolean;
  requiredFooter?: string;
  warnings: string[];
}

export interface CompliancePolicyEngine {
  evaluate(input: CompliancePolicyInput): CompliancePolicyResult;
}

export type WorkspaceAction =
  | "ai-feedback:write"
  | "audit:read"
  | "draft:read"
  | "draft:write"
  | "prospect-list:read"
  | "prospect-list:write"
  | "relationship-note:read"
  | "relationship-note:write"
  | "retention:manage"
  | "workspace:manage"
  | "workspace:read";

const roleRank: Record<WorkspaceRole, number> = {
  owner: 60,
  admin: 50,
  manager: 40,
  compliance_reviewer: 35,
  member: 30,
  viewer: 10,
};

const actionMinimumRole: Record<WorkspaceAction, WorkspaceRole[]> = {
  "ai-feedback:write": ["owner", "admin", "manager", "member", "viewer", "compliance_reviewer"],
  "audit:read": ["owner", "admin", "compliance_reviewer"],
  "draft:read": ["owner", "admin", "manager", "member", "viewer", "compliance_reviewer"],
  "draft:write": ["owner", "admin", "manager", "member"],
  "prospect-list:read": ["owner", "admin", "manager", "member", "viewer", "compliance_reviewer"],
  "prospect-list:write": ["owner", "admin", "manager", "member"],
  "relationship-note:read": [
    "owner",
    "admin",
    "manager",
    "member",
    "viewer",
    "compliance_reviewer",
  ],
  "relationship-note:write": ["owner", "admin", "manager", "member"],
  "retention:manage": ["owner", "admin"],
  "workspace:manage": ["owner", "admin"],
  "workspace:read": ["owner", "admin", "manager", "member", "viewer", "compliance_reviewer"],
};

export function evaluateCompliancePolicy(input: CompliancePolicyInput): CompliancePolicyResult {
  if (input.suppressionStatus === "suppressed") {
    return {
      allowed: false,
      auditEventType: "compliance.blocked",
      decision: "blocked",
      reason: "Recipient or channel is suppressed",
      reviewRequired: true,
      warnings: ["Suppression entry matched this channel"],
    };
  }

  if (input.consentStatus === "withdrawn") {
    return {
      allowed: false,
      auditEventType: "compliance.blocked",
      decision: "blocked",
      reason: "Recipient consent is withdrawn",
      reviewRequired: true,
      warnings: ["Consent status is withdrawn"],
    };
  }

  const warnings: string[] = [];
  if (
    input.purpose === "outreach_review" &&
    input.consentStatus === "unknown" &&
    input.channelType === "email"
  ) {
    warnings.push("Email consent is unknown; human review is required before outreach");
  }

  if (input.purpose === "outreach_review" && input.recipientType === "unknown") {
    warnings.push("Recipient type is unknown; classify the relationship before outreach");
  }

  if (
    input.purpose === "outreach_review" &&
    input.recipientRegion.trim().toLowerCase() === "unknown"
  ) {
    warnings.push("Recipient region is unknown; regional review is required before outreach");
  }

  if (input.purpose === "outreach_review" && input.recipientType === "personal") {
    warnings.push("Personal recipients require a purpose and consent review before outreach");
  }

  if (input.channelType === "phone") {
    warnings.push("Phone outreach requires manual consent and regional review");
  }

  if (input.sourceType === "manual_linkedin_context" && input.channelType !== "linkedin_context") {
    warnings.push("LinkedIn context should not be repurposed as another outreach channel");
  }

  const reviewRequired = warnings.length > 0;
  return {
    allowed: true,
    auditEventType: reviewRequired ? "compliance.warned" : "compliance.allowed",
    decision: reviewRequired ? "warn" : "allowed",
    reason: reviewRequired ? "Compliance review is required" : "No deterministic block found",
    requiredFooter:
      input.purpose === "outreach_review" && input.channelType === "email"
        ? "You can opt out of future outreach."
        : undefined,
    reviewRequired,
    warnings,
  };
}

export function hasMinimumWorkspaceRole(role: WorkspaceRole, minimumRole: WorkspaceRole): boolean {
  return roleRank[role] >= roleRank[minimumRole];
}

export function canPerformWorkspaceAction(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return actionMinimumRole[action].includes(role);
}
