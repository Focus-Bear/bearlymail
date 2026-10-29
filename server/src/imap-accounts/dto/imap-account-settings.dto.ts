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
} from "class-validator";

const MAX_HOSTNAME_LENGTH = 253;
const MAX_CREDENTIAL_LENGTH = 512;
const MAX_DISPLAY_NAME_LENGTH = 200;
const MIN_PORT = 1;
const MAX_PORT = 65535;

/** Everything needed to log in to a mailbox over IMAP and SMTP. */
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

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HOSTNAME_LENGTH)
  imapHost: string;

  /** Range only: which ports are allowed depends on the deployment. */
  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  imapPort: number;

  @IsBoolean()
  imapSecure: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HOSTNAME_LENGTH)
  smtpHost: string;

  @IsInt()
  @Min(MIN_PORT)
  @Max(MAX_PORT)
  smtpPort: number;

  @IsBoolean()
  smtpSecure: boolean;
}
