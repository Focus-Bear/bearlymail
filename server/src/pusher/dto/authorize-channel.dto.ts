import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * Pusher's client libraries POST these two fields with snake_case names, so the
 * DTO has to match the wire format rather than the repo's camelCase convention.
 */
const MAX_FIELD_LENGTH = 255;

export class AuthorizeChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  socket_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIELD_LENGTH)
  channel_name: string;
}
