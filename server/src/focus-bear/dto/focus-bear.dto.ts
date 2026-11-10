import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { FOCUS_BEAR_LIMITS } from "../../constants/focus-bear.constants";

export class ConnectFocusBearDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(FOCUS_BEAR_LIMITS.MAX_TOKEN_LENGTH)
  token: string;
}

export class FocusBearTaskSuggestionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(FOCUS_BEAR_LIMITS.MAX_TITLE_LENGTH)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(FOCUS_BEAR_LIMITS.MAX_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FOCUS_BEAR_LIMITS.MAX_EMAIL_SUBJECT_LENGTH)
  emailSubject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(FOCUS_BEAR_LIMITS.MAX_SENDER_LENGTH)
  sender?: string;
}
