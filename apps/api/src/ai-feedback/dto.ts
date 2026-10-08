import { IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";

export const aiFeedbackTargetTypes = ["brief", "draft"] as const;
export const aiFeedbackRatings = ["helpful", "not_helpful"] as const;

export type AiFeedbackTargetTypeInput = (typeof aiFeedbackTargetTypes)[number];
export type AiFeedbackRatingInput = (typeof aiFeedbackRatings)[number];

export class GetAiFeedbackDto {
  @IsIn(aiFeedbackTargetTypes)
  targetType!: AiFeedbackTargetTypeInput;

  @IsString()
  @Length(1, 128)
  targetId!: string;
}

export class SubmitAiFeedbackDto extends GetAiFeedbackDto {
  @IsIn(aiFeedbackRatings)
  rating!: AiFeedbackRatingInput;

  @IsString()
  @Length(1, 64)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
