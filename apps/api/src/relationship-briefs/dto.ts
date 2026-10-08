import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class CreateRelationshipBriefDto {
  @IsString()
  @Length(1, 200)
  workspaceId!: string;

  @IsString()
  @Length(1, 200)
  subjectEntityId!: string;

  @IsString()
  @Length(1, 500)
  goal!: string;
}

export class CreateDraftMessageDto {
  @IsOptional()
  @IsIn(["concise", "warm_professional", "evidence_heavy"])
  variant?: "concise" | "warm_professional" | "evidence_heavy";
}
