import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

const MAX_HOSTNAME_LENGTH = 253;
const MAX_CREDENTIAL_LENGTH = 512;
const MAX_DISPLAY_NAME_LENGTH = 200;
const MIN_PORT = 1;
const MAX_PORT = 65535;

/** Server fields are entered by hand only when automatic discovery can't help. */
const hasManualServers = (dto: ImapAccountSettingsDto) =>
  dto.imapHost !== undefined || dto.smtpHost !== undefined;

/**
 * Logging in to a mailbox. Most users send only email + password and the
 * servers are discovered; the server fields come as a complete set or not at all.
 */
export class ImapAccountSettingsDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_DISPLAY_NAME_LENGTH)
  name?: string;

  /** Defaults to the email address, which almost every host expects. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CREDENTIAL_LENGTH)
  username?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_CREDENTIAL_LENGTH)
  password: string;

  @ValidateIf(hasManualServers)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HOSTNAME_LENGTH)
  imapHost?: string;

  @ValidateIf(hasManualServers)
  /** Range only: which ports are allowed depends on the deployment. */
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  imapPort?: number;

  @ValidateIf(hasManualServers)
  @IsBoolean()
  imapSecure?: boolean;

  @ValidateIf(hasManualServers)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HOSTNAME_LENGTH)
  smtpHost?: string;

  @ValidateIf(hasManualServers)
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  smtpPort?: number;

  @ValidateIf(hasManualServers)
  @IsBoolean()
  smtpSecure?: boolean;
}
