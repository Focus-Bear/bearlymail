import { IsNotEmpty, IsString, MaxLength } from "class-validator";

const MAX_ORG_NAME_LENGTH = 200;

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ORG_NAME_LENGTH)
  name: string;
}
