import { IsIn, IsISO8601, IsOptional, IsString, Length } from "class-validator";

export class UpdateDraftMessageDto {
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  body?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  tone?: string;

  @IsOptional()
  @IsIn(["archived"])
  status?: "archived";

  @IsOptional()
  @IsIn(["autosave", "manual_save"])
  reason?: "autosave" | "manual_save";

  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class RewriteDraftMessageDto {
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  instruction?: string;

  @IsOptional()
  @IsIn(["concise", "warm_professional", "evidence_heavy"])
  variant?: "concise" | "warm_professional" | "evidence_heavy";
}

export class ValidateDraftMessageDto {
  @IsISO8601()
  expectedUpdatedAt!: string;
}

export class RestoreDraftVersionDto {
  @IsISO8601()
  expectedUpdatedAt!: string;
}
