import { IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from "class-validator";

export const relationshipStages = [
  "unknown",
  "prospect",
  "warm",
  "active",
  "dormant",
  "customer",
  "partner",
] as const;

export type RelationshipStageDto = (typeof relationshipStages)[number];

export class CreateProspectListDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateProspectListDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateProspectListMemberDto {
  @IsString()
  @Length(1, 200)
  entityId!: string;

  @IsOptional()
  @IsIn(relationshipStages)
  relationshipStage?: RelationshipStageDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fitScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateProspectListMemberDto {
  @IsOptional()
  @IsIn(relationshipStages)
  relationshipStage?: RelationshipStageDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fitScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ImportProspectListDto {
  @IsString()
  @Length(1, 1_000_000)
  csvText!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  sourceName?: string;
}
