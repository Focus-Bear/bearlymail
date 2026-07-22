/** API / DTO discriminator for deterministic category rules (matches server `CategoryRuleKind`). */
export const CATEGORY_RULE_KIND_COMPOSITE = 'composite' as const;
export const CATEGORY_RULE_KIND_LEGACY = 'legacy' as const;

export const COMPOSITE_RULE_FORM_MODE_ADD = 'add' as const;
export const COMPOSITE_RULE_FORM_MODE_EDIT = 'edit' as const;

/**
 * Deep-link query params + anchor used by the priority/category popover to open
 * a specific deterministic rule in Settings (read by
 * `useDeterministicCategoryRulesSectionState`). Prefer the rule ID param; fall
 * back to the category-name param for older links (issue #1789).
 */
export const EDIT_RULE_ID_PARAM = 'openEditRuleId' as const;
export const EDIT_RULE_CATEGORY_PARAM = 'openEditRule' as const;
export const GUIDE_OUR_AI_ANCHOR = 'guide-our-ai' as const;
