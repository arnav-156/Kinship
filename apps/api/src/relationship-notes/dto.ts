import { IsString, Length } from "class-validator";

export class CreateRelationshipNoteDto {
  @IsString()
  @Length(1, 5000)
  body!: string;
}

export class UpdateRelationshipNoteDto {
  @IsString()
  @Length(1, 5000)
  body!: string;
}
