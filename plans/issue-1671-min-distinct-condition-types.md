# Plan: Category rules need at least 3 distinct condition types

**Issue:** #1671
**Problem:** Composite category rules currently allow all conditions to target the same field (e.g., 3 sender domain variants). This produces too many false positives. Rules must require at least 3 **distinct** condition types (sender, subject, body).

---

## Current State

### Data Model (`server/src/database/entities/category-rule.entity.ts`)

Composite rules use `CompositeCategoryRuleSpecV2`:

```ts
type CompositeCategoryRuleSpecV2 = {
  v: 2;
  senderMatchesAny: string[];   // OR within
  subjectContainsAny: string[];  // OR within
  bodyContainsAny: string[];     // OR within
};
```

All three arrays are required by the DTO (`@ArrayMinSize(1)` on each), and the service validates non-empty after trimming. So rules already require **at least one value in each of the 3 fields** (sender, subject, body).

### The Real Problem

Despite requiring all 3 fields, the **legacy auto-generated rules** (`ruleKind: "legacy"`) only match on 1–2 fields (e.g., `sender_domain` alone). These are the rules Jeremy sees as useless — they match based on a single sender domain, leading to false positives.

The issue title says "at least 3 conditions" but the screenshot and description indicate the real ask is:
1. **Legacy rules are too weak** — they match on too few signals.
2. **Composite rules already require all 3 fields** but this isn't clearly communicated.
3. The **auto-generation path** (`generateRuleFromEmail` in `category-rules.service.ts`) creates legacy rules from a single email, using only sender domain and/or subject prefix — never body content.

---

## Plan

### 1. Deprecate auto-generation of weak legacy rules

**File:** `server/src/emails/llm-processor.ts` — `tryGenerateCategoryRule()`
**File:** `server/src/category-rules/category-rules.service.ts` — `generateRuleFromEmail()`

**Change:** Stop auto-generating legacy rules from the LLM processing pipeline. The `tryGenerateCategoryRule` call in `llm-processor.ts` (line ~228) should be removed or gated behind a feature flag (default off).

**Rationale:** These single-signal rules are the source of false positives. Composite rules (which require all 3 fields) are the replacement.

**Migration:** Existing legacy rules remain functional but users should be encouraged to migrate to composite rules. Add a UI indicator (see §4 below).

### 2. Add distinct-field-count validation to composite rule creation (defence in depth)

Composite rules already require all 3 fields (`senderMatchesAny`, `subjectContainsAny`, `bodyContainsAny`) with `@ArrayMinSize(1)`. This already satisfies "3 distinct condition types." However, add an explicit **distinct condition type count** check for future-proofing and clearer error messages.

**File:** `server/src/category-rules/category-rules.service.ts` — `normalizeCompositeSpecDto()`

Add after the existing empty-array checks:

```ts
// Count distinct populated condition types (defence-in-depth)
const populatedFieldCount = [
  senderMatchesAny.length > 0,
  subjectContainsAny.length > 0,
  bodyContainsAny.length > 0,
].filter(Boolean).length;

if (populatedFieldCount < 3) {
  throw new BadRequestException(
    'Composite rules must include conditions for all three fields: sender, subject, and body',
  );
}
```

**File:** `server/src/constants/category-rule-composite.constants.ts`

Add constant:

```ts
/** Minimum number of distinct condition types required for composite rules. */
MIN_DISTINCT_CONDITION_TYPES: 3,
```

### 3. Add client-side validation

**File:** `client/src/components/settings/category-rules/CompositeCategoryRuleFormModal.tsx`

In `handleSubmit`, the current check is:
```ts
if (!categoryName.trim() || senders.length === 0 || subjects.length === 0 || bodyPhrases.length === 0) {
  return;
}
```

This already validates all 3 fields are populated. Enhance with:
- Show inline error messages (not just silent return) when any field is empty.
- Add a tooltip or help text explaining that all 3 condition types are required to reduce false positives.

**File:** `client/src/components/settings/category-rules/CompositeCategoryRuleFormFields.tsx`

Add visual required-field indicators (asterisk or similar) to each field label.

### 4. Mark legacy rules as "weak" in the UI

**File:** `client/src/components/settings/category-rules/DeterministicCategoryRuleRow.tsx`

For rules with `ruleKind === 'legacy'`, show a warning badge/icon indicating the rule uses fewer matching signals and may produce false positives. Include a prompt to "Upgrade to composite rule" that opens the composite form pre-filled with the legacy rule's pattern data.

### 5. Add i18n strings

**File:** Client i18n files (e.g., `client/src/locales/en/translation.json`)

Add keys:
- `settings.deterministicCategoryRules.legacyWeakWarning` — "This rule matches on limited criteria and may produce false positives. Consider creating a composite rule."
- `settings.deterministicCategoryRules.upgradeToComposite` — "Upgrade to composite rule"
- `settings.deterministicCategoryRules.allFieldsRequired` — "All three fields (sender, subject, body) are required."
- `settings.deterministicCategoryRules.fieldRequiredError` — "This field is required. Enter at least one value."

### 6. Update tests

**File:** `server/src/category-rules/category-rules.service.spec.ts`

Add test cases:
- Verify `normalizeCompositeSpecDto` rejects payloads where any of the 3 fields is empty after trimming.
- Verify the distinct-field-count check (once added) rejects rules missing any field.
- Verify legacy rule auto-generation is disabled (if feature-flagged, test both states).

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/emails/llm-processor.ts` | Remove or gate `tryGenerateCategoryRule()` call |
| `server/src/category-rules/category-rules.service.ts` | Add explicit distinct-field-count validation in `normalizeCompositeSpecDto()` |
| `server/src/constants/category-rule-composite.constants.ts` | Add `MIN_DISTINCT_CONDITION_TYPES` constant |
| `server/src/category-rules/category-rules.service.spec.ts` | Add validation test cases |
| `client/src/components/settings/category-rules/CompositeCategoryRuleFormModal.tsx` | Show inline errors instead of silent return |
| `client/src/components/settings/category-rules/CompositeCategoryRuleFormFields.tsx` | Add required-field indicators |
| `client/src/components/settings/category-rules/DeterministicCategoryRuleRow.tsx` | Show "weak rule" warning for legacy rules |
| Client i18n files | Add new translation keys |

## Out of Scope

- **Removing existing legacy rules** — They still work; users can delete them manually. A future migration could batch-disable low-hit-count legacy rules.
- **Adding new condition types** (e.g., recipient, attachment name) — The current 3 fields (sender, subject, body) are sufficient. New types can be added later by extending `CompositeCategoryRuleSpecV2` to v3.
- **LLM-generated composite rules** — There is currently no LLM path that generates composite rules. If one is added later, it must include the same 3-field constraint in the prompt.

## Notes

- The `generateRuleFromEmail` method creates only legacy rules. It does **not** create composite rules. The composite path is user-initiated via the UI (`POST /category-rules`).
- Composite rules already enforce AND logic across all 3 fields (`evaluateComposite` requires `senderOk && subjectOk && bodyOk`). The fix is primarily about preventing weak legacy rules from being auto-generated and making the UI clearer.
