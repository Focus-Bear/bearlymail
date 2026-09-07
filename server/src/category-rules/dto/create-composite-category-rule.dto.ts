import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

import { CATEGORY_RULE_COMPOSITE } from "../../constants/category-rule-composite.constants";
import {
  GITHUB_ACTOR_KINDS,
  GITHUB_ITEM_STATES,
  GithubActorKind,
  GithubItemState,
} from "../../constants/github-notification.constants";

/** One pinned GitHub Projects board status, optionally scoped to a project. */
export class GithubProjectStatusConditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_GITHUB_CONDITION_VALUE_LENGTH)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_GITHUB_CONDITION_VALUE_LENGTH)
  project?: string;
}

export class CreateCompositeCategoryRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_CATEGORY_NAME_LENGTH)
  categoryName!: string;

  /**
   * Authoritative FK to the EMAIL_CATEGORY context. When the editor sends it,
   * the server validates it and derives the canonical name from it, so the
   * stored category link can never be "broken". Optional for backwards
   * compatibility and the LLM-suggested path, which only knows names.
   */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

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

  /**
   * Structural notification sub-stream condition (e.g. `github:pr`). Auto-set
   * for uniform-notification senders; accepted here so edited rules round-trip
   * it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_NOTIFICATION_SUBTYPE_LENGTH)
  notificationSubtype?: string;

  /**
   * SET form of the structural condition: the email's resolved sub-stream must
   * equal or refine any listed member (OR within). Round-trips with
   * `notificationSubtype`; the normaliser canonicalises the two.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_NOTIFICATION_SUBTYPES)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_NOTIFICATION_SUBTYPE_LENGTH, {
    each: true,
  })
  notificationSubtypeAny?: string[];

  /**
   * GitHub-metadata structural conditions (see `CompositeCategoryRuleSpecV3`):
   * the PR/issue lifecycle state(s) the email's thread must be in.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_GITHUB_STATES)
  @IsIn(Object.values(GITHUB_ITEM_STATES), { each: true })
  githubStateAny?: GithubItemState[];

  /** GitHub Projects board status(es) the thread's item must carry (case-insensitive). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_GITHUB_PROJECT_STATUSES)
  @ValidateNested({ each: true })
  @Type(() => GithubProjectStatusConditionDto)
  githubProjectStatusAny?: GithubProjectStatusConditionDto[];

  /** Whether the PR/issue must have been AUTHORED by a bot or a human. */
  @IsOptional()
  @IsIn(Object.values(GITHUB_ACTOR_KINDS))
  githubAuthorKind?: GithubActorKind;

  /** Label(s) the thread's item must carry (any match, case-insensitive). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CATEGORY_RULE_COMPOSITE.MAX_GITHUB_LABELS)
  @IsString({ each: true })
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_GITHUB_CONDITION_VALUE_LENGTH, {
    each: true,
  })
  githubLabelsAny?: string[];
}
