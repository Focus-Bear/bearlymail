import { IsBoolean, IsOptional } from "class-validator";

export class ConsentDecisionDto {
  @IsBoolean()
  approve: boolean;

  /** Grant mail:draft as well as mail:read (only if the client asked to draft or send). */
  @IsOptional()
  @IsBoolean()
  allowDrafts?: boolean;

  /** Grant mail:send (and mail:draft) as well as mail:read (only if the client asked for it). */
  @IsBoolean()
  allowSend: boolean;
}
