import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** Speech transcripts are short; cap length to bound the LLM prompt size. */
const TRANSCRIPT_MAX_LENGTH = 1000;

export class VerifyDistractionPhraseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TRANSCRIPT_MAX_LENGTH)
  transcript: string;
}
