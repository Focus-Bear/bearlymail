import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

const TOKEN_MAX_LENGTH = 256;
const EMAIL_MAX_LENGTH = 320;

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(TOKEN_MAX_LENGTH)
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email: string;
}
