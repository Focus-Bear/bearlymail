import { IsBoolean } from "class-validator";

export class ConsentDecisionDto {
  @IsBoolean()
  approve: boolean;

  /** Grant mail:send as well as mail:read (only if the client asked for it). */
  @IsBoolean()
  allowSend: boolean;
}
