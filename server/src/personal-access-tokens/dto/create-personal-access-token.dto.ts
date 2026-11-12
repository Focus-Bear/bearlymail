import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

import {
  ALL_PAT_SCOPES,
  PatScope,
  PERSONAL_ACCESS_TOKENS,
} from "../../constants/personal-access-tokens.constants";

export class CreatePersonalAccessTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PERSONAL_ACCESS_TOKENS.MAX_NAME_LENGTH)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(ALL_PAT_SCOPES, { each: true })
  scopes: PatScope[];

  /** Omitted or null means the token never expires. */
  @IsOptional()
  @IsIn(PERSONAL_ACCESS_TOKENS.ALLOWED_EXPIRY_DAYS)
  expiresInDays?: number | null;
}
