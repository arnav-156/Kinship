import { IsIn, IsOptional, IsString, Length } from "class-validator";

export const channelTypes = ["email", "linkedin_context", "phone", "meeting", "unknown"] as const;
export const consentStatuses = ["confirmed", "unknown", "withdrawn"] as const;
export const policyPurposes = ["relationship_intelligence", "outreach_review"] as const;
export const recipientTypes = ["professional", "personal", "unknown"] as const;
export const sourceTypes = [
  "company_website",
  "crossref",
  "csv_import",
  "crm_import",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
] as const;

export type ChannelTypeDto = (typeof channelTypes)[number];
export type ConsentStatusDto = (typeof consentStatuses)[number];
export type PolicyPurposeDto = (typeof policyPurposes)[number];
export type RecipientTypeDto = (typeof recipientTypes)[number];
export type SourceTypeDto = (typeof sourceTypes)[number];

export class UpsertContactChannelDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsString()
  @Length(1, 200)
  entityId!: string;

  @IsIn(channelTypes)
  channelType!: ChannelTypeDto;

  @IsString()
  @Length(1, 500)
  value!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @IsIn(consentStatuses)
  consentStatus!: ConsentStatusDto;

  @IsIn(policyPurposes)
  purpose!: PolicyPurposeDto;

  @IsIn(recipientTypes)
  recipientType!: RecipientTypeDto;

  @IsString()
  @Length(2, 80)
  recipientRegion!: string;
}

export class CreateSuppressionEntryDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  workspaceId?: string;

  @IsIn(channelTypes)
  channelType!: ChannelTypeDto;

  @IsString()
  @Length(1, 500)
  value!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  source?: string;
}

export class EvaluateComplianceDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsString()
  @Length(1, 200)
  entityId!: string;

  @IsIn(channelTypes)
  channelType!: ChannelTypeDto;

  @IsOptional()
  @IsIn(sourceTypes)
  sourceType?: SourceTypeDto;
}
