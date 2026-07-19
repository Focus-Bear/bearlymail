import { IsOptional, IsString, MaxLength } from "class-validator";

import { CATEGORY_RULE_COMPOSITE } from "../../constants/category-rule-composite.constants";

export class SuggestCategoryRulesDto {
  /**
   * Optional category name filter. When provided, only senders whose recent
   * emails were categorised under this name are considered.
   */
  @IsOptional()
  @IsString()
  @MaxLength(CATEGORY_RULE_COMPOSITE.MAX_CATEGORY_NAME_LENGTH)
  categoryName?: string;
}
