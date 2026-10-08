import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export const workspaceRoles = [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
  "compliance_reviewer",
] as const;
export const connectorProviders = [
  "company_website",
  "crossref",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
] as const;
export const connectorStatuses = ["active", "paused"] as const;
export const policyPurposes = ["relationship_intelligence", "outreach_review"] as const;
export const consentStatuses = ["confirmed", "unknown", "withdrawn"] as const;
export const recipientTypes = ["professional", "personal", "unknown"] as const;

export type WorkspaceRoleInput = (typeof workspaceRoles)[number];

export class InviteWorkspaceMemberDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(workspaceRoles)
  role!: WorkspaceRoleInput;
}

export class UpdateWorkspaceMemberDto {
  @IsIn(workspaceRoles)
  role!: WorkspaceRoleInput;
}

export class AcceptWorkspaceInvitationDto {
  @IsString()
  @Length(2, 120)
  displayName!: string;

  @IsString()
  @Length(12, 128)
  password!: string;
}

export class UpdateWorkspacePolicyDto {
  @IsIn(policyPurposes)
  defaultPurpose!: (typeof policyPurposes)[number];

  @IsIn(consentStatuses)
  defaultConsentStatus!: (typeof consentStatuses)[number];

  @IsIn(recipientTypes)
  defaultRecipientType!: (typeof recipientTypes)[number];

  @IsString()
  @Length(2, 80)
  defaultRecipientRegion!: string;
}

export class CreateConnectorAccountDto {
  @IsIn(connectorProviders)
  provider!: (typeof connectorProviders)[number];

  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string;
}

export class UpdateConnectorAccountDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  displayName?: string;

  @IsOptional()
  @IsIn(connectorStatuses)
  status?: (typeof connectorStatuses)[number];

  @IsOptional()
  @IsBoolean()
  refreshEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(43_200)
  refreshIntervalMinutes?: number;

  @IsOptional()
  @IsString()
  @Length(1, 2048)
  refreshSourceIdentifier?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  refreshEntityId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  refreshSubjectName?: string;
}

export class SyncConnectorDto {
  @IsString()
  @Length(1, 2048)
  sourceIdentifier!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  entityId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  subjectName?: string;
}
