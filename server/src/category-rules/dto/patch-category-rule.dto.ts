import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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

  /** v3: renamed alias for senderMatchesAny (issue #1975). If provided, takes precedence. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_SENDERS)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_SENDER_LENGTH, { each: true })
  fromMatchesAny?: string[];

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

  /** Issue #1975: optional read-status condition. */
  @IsOptional()
  @IsBoolean()
  emailIsRead?: boolean;

  /** Issue #1975: optional attachment condition (filename → mime-type or extension map). */
  @IsOptional()
  @IsObject()
  emailAttachment?: Record<string, string>;

  /** Issue #1975: optional received-time condition string. */
  @IsOptional()
  @IsString()
  emailReceived?: string;

  /** Issue #1975: optional read-time condition string. */
  @IsOptional()
  @IsString()
  emailRead?: string;
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

  /**
   * Authoritative FK to the EMAIL_CATEGORY context. Validated and used to
   * derive the canonical name when present, so re-saving a rule can never
   * leave it with a broken (null) category link.
   */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchCompositeSpecDto)
  compositeSpec?: PatchCompositeSpecDto;
}
