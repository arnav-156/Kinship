import { IsIn, IsObject, IsOptional, IsString, IsUrl, Length } from "class-validator";

const sourceTypes = [
  "company_website",
  "crossref",
  "csv_import",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
] as const;

export type EvidenceSourceType = (typeof sourceTypes)[number];

const relationshipOutcomeKinds = [
  "follow_up_scheduled",
  "introduction_made",
  "meeting_held",
  "not_interested",
  "opportunity_created",
  "other",
  "reply_received",
] as const;

export class RecordRelationshipOutcomeDto {
  @IsIn(relationshipOutcomeKinds)
  kind!: (typeof relationshipOutcomeKinds)[number];

  @IsString()
  @Length(1, 500)
  summary!: string;
}

export class AnalyzeUrlDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsUrl({
    require_protocol: true,
  })
  url!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  subjectName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  goal?: string;

  @IsOptional()
  @IsIn(sourceTypes)
  sourceType?: EvidenceSourceType;
}

export class IngestEvidenceDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsIn(sourceTypes)
  sourceType!: EvidenceSourceType;

  @IsString()
  @Length(1, 2000)
  sourceIdentifier!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  entityId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  subjectName?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, string | undefined>;
}
