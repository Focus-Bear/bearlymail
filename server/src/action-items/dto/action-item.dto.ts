import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ID_LENGTH = 255;
const ACTION_ITEM_SOURCES = ["user", "llm"] as const;

/**
 * What a client may set when adding an action item. A class rather than
 * `Partial<ActionItem>` so the validation pipe rejects `id` and `userId`:
 * with those, `save()` would re-own another user's item.
 */
export class CreateActionItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsIn(ACTION_ITEM_SOURCES)
  source?: (typeof ACTION_ITEM_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  emailId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID_LENGTH)
  emailThreadId?: string;
}

/** Only the description and completion state change after creation. */
export class UpdateActionItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DESCRIPTION_LENGTH)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
