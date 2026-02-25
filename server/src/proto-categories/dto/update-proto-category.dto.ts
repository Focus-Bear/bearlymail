import { IsNotEmpty, IsString, MaxLength } from "class-validator";

const PROTO_CATEGORY_NAME_MAX_LENGTH = 120;

export class UpdateProtoCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROTO_CATEGORY_NAME_MAX_LENGTH)
  name: string;
}
