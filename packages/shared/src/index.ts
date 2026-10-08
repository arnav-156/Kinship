import { z } from "zod";

export const HealthStatusSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime(),
  version: z.string(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const WorkspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
  "compliance_reviewer",
]);

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

export const ComplianceDecisionSchema = z.enum(["allowed", "warn", "blocked"]);

export type ComplianceDecision = z.infer<typeof ComplianceDecisionSchema>;

export const SourceTypeSchema = z.enum([
  "user_url",
  "company_website",
  "github",
  "orcid",
  "semantic_scholar",
  "crossref",
  "csv_import",
  "crm_import",
  "manual_linkedin_context",
]);

export type SourceType = z.infer<typeof SourceTypeSchema>;

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
