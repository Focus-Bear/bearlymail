import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";

const MAX_NAME_LENGTH = 200;
const MAX_URL_LENGTH = 2048;
const MAX_SIGNATURE_LENGTH = 10_000;
const MAX_TONE_RULES = 50;
const MAX_TONE_RULE_LENGTH = 500;

export class ToneSettingsDto {
  @IsArray()
  @ArrayMaxSize(MAX_TONE_RULES)
  @IsString({ each: true })
  @MaxLength(MAX_TONE_RULE_LENGTH, { each: true })
  rules: string[];
}

/**
 * The only fields `PUT /users/me` may change. Being a class (not
 * `Partial<User>`), the global ValidationPipe whitelists it and rejects any
 * other property, so privilege, identity and credential columns (`isAdmin`,
 * `id`, `email`, `password`, `subscriptionStatus`, `totp*`, ...) can't be set.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NAME_LENGTH)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_URL_LENGTH)
  calendarBookingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SIGNATURE_LENGTH)
  emailSignature?: string;

  @IsOptional()
  @IsBoolean()
  trackEmailOpens?: boolean;

  @IsOptional()
  @IsBoolean()
  hasScannedHistory?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ToneSettingsDto)
  toneSettings?: ToneSettingsDto;

  /** Disconnect only: the token itself is set through the GitHub endpoints. */
  @ValidateIf((_, value) => value !== undefined)
  @Equals(null)
  githubToken?: null;
}

export const UPDATABLE_PROFILE_FIELDS: readonly (keyof UpdateProfileDto)[] = [
  "displayName",
  "jobTitle",
  "calendarBookingUrl",
  "emailSignature",
  "trackEmailOpens",
  "hasScannedHistory",
  "toneSettings",
  "githubToken",
];
