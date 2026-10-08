import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from "class-validator";

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

export type SearchSourceType = (typeof sourceTypes)[number];

export class SearchEvidenceDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsString()
  @Length(1, 500)
  query!: string;

  @IsOptional()
  @IsArray()
  @IsIn(sourceTypes, { each: true })
  sourceTypes?: SearchSourceType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SearchProspectsDto extends SearchEvidenceDto {}

export class SearchSimilarPeopleDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  entityId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  primaryEmailHash?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  orcidId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  githubLogin?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  linkedinUrl?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  employerName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
