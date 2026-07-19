import { IsString, MinLength } from "class-validator";

import { AUTH_CONSTANTS } from "../../constants/auth-constants";

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH)
  password: string;
}
