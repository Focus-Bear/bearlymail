import { IsBoolean, IsOptional } from "class-validator";

export class ArchiveSenderDto {
  /**
   * Also archive the thread of the email named in the URL. Off for the inbox
   * card (the client archives that card itself); on for Settings → Subscriptions.
   */
  @IsOptional()
  @IsBoolean()
  includeThisThread?: boolean;
}
