import { IsNotEmpty, IsString, MaxLength } from "class-validator";

import { CATEGORY_RULE_COMPOSITE } from "../../constants/category-rule-composite.constants";

export class DraftRuleFromEmailDto {
  /** The email to draft a rule from (must belong to the authenticated user). */
  @IsString()
  @IsNotEmpty()
  emailId!: string;

  /** The category the user believes this thread should have been assigned to. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_CATEGORY_NAME_LENGTH)
  categoryName!: string;
}
