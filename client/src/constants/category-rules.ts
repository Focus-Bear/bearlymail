/** API / DTO discriminator for deterministic category rules (matches server `CategoryRuleKind`). */
export const CATEGORY_RULE_KIND_COMPOSITE = 'composite' as const;
export const CATEGORY_RULE_KIND_LEGACY = 'legacy' as const;

export const COMPOSITE_RULE_FORM_MODE_ADD = 'add' as const;
export const COMPOSITE_RULE_FORM_MODE_EDIT = 'edit' as const;

/**
 * Deep-link query param that opens one deterministic rule in Settings (read by
 * `useDeterministicCategoryRulesSectionState`). Links identify the rule by ID
 * only: several rules can share a category name, and names change.
 */
export const EDIT_RULE_ID_PARAM = 'openEditRuleId' as const;
/**
 * Older links named the rule's category instead. Settings no longer opens a
 * rule from it (it could be the wrong one); it only strips it and asks the user
 * to pick the rule from the list.
 */
export const LEGACY_EDIT_RULE_CATEGORY_PARAM = 'openEditRule' as const;
