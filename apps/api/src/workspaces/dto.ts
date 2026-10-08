import { IsOptional, IsString, Length } from "class-validator";

export class CreateWorkspaceDto {
  @IsString()
  @Length(2, 120)
  name!: string;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;
}
