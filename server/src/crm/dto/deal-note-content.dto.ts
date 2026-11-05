import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

import { DEAL_NOTE_CONTENT_MAX_LENGTH } from "../deal-notes.constants";

/** Body for creating or editing a deal note. Whitespace-only notes are rejected. */
export class DealNoteContentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(DEAL_NOTE_CONTENT_MAX_LENGTH)
  content: string;
}
