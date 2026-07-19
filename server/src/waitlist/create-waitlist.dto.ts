import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateWaitlistDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  emailSystem?: string;

  @IsString()
  @IsOptional()
  emailSystemOther?: string;
}
