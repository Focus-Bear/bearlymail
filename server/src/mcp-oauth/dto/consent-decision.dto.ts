import { IsBoolean, IsOptional } from "class-validator";

export class ConsentDecisionDto {
  @IsBoolean()
  approve: boolean;

  /** Grant mail:send as well as mail:read (only if the client asked for it). */
  @IsBoolean()
  allowSend: boolean;

  /**
   * Grant settings:write (editing categories and rules), only if the client
   * asked for it. Optional so a consent page loaded before this existed still
   * submits.
   */
  @IsOptional()
  @IsBoolean()
  allowSettingsWrite?: boolean;
}
