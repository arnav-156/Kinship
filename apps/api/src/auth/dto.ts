import { IsEmail, IsOptional, IsString, Length, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsString()
  @Length(2, 120)
  tenantName!: string;

  @IsString()
  @Length(2, 120)
  workspaceName!: string;

  @IsOptional()
  @IsString()
  @Length(2, 20)
  region?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  tenantSlug?: string;
}

export interface AuthWorkspaceDto {
  id: string;
  name: string;
  role: string;
  slug: string;
}

export interface AuthResponseDto {
  accessToken: string;
  expiresAt: string;
  user: {
    email: string;
    id: string;
    tenantId: string;
  };
  workspace: AuthWorkspaceDto;
  workspaces: AuthWorkspaceDto[];
}
