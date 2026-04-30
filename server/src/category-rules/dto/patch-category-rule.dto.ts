import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { CATEGORY_RULE_COMPOSITE } from "../../constants/category-rule-composite.constants";

/** Optional nested payload when updating a composite rule's match criteria. */
export class PatchCompositeSpecDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_SENDERS)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_SENDER_LENGTH, { each: true })
  senderMatchesAny!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_CONTAINS_LENGTH, {
    each: true,
  })
  subjectContainsAny!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASE_LENGTH, { each: true })
  bodyContainsAny!: string[];

  /** Issue #1789: optional subject exclusion phrases. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_CONTAINS_LENGTH, {
    each: true,
  })
  subjectNotContainsAny?: string[];

  /** Issue #1789: optional body exclusion phrases. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASE_LENGTH, { each: true })
  bodyNotContainsAny?: string[];
}

export class PatchCategoryRuleDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_CATEGORY_NAME_LENGTH)
  categoryName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchCompositeSpecDto)
  compositeSpec?: PatchCompositeSpecDto;
}
