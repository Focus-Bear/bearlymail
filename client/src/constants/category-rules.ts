/** API / DTO discriminator for deterministic category rules (matches server `CategoryRuleKind`). */
export const CATEGORY_RULE_KIND_COMPOSITE = 'composite' as const;
export const CATEGORY_RULE_KIND_LEGACY = 'legacy' as const;

export const COMPOSITE_RULE_FORM_MODE_ADD = 'add' as const;
export const COMPOSITE_RULE_FORM_MODE_EDIT = 'edit' as const;
