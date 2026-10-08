import { Equals, IsString, MinLength } from "class-validator";

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE MY ACCOUNT";

export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @Equals(DELETE_ACCOUNT_CONFIRMATION)
  confirmation!: string;
}
