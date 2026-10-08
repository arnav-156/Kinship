import { IsBoolean, IsInt, Max, Min } from "class-validator";

export class UpdateRetentionPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(3650)
  retentionDays!: number;
}
