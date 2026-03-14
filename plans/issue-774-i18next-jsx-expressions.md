# Plan: Issue #774 — Fix ESLint i18next rule to catch inline string literals in JSX expressions + bulk fix

## Context

The current `i18next/no-literal-string` rule uses `markupOnly: true` which means it checks JSX markup but misses string literals inside JSX expression containers (`{...}`). Specifically:

```tsx
{isSaving ? 'saving' : 'save'}
```

The string literals `'saving'` and `'save'` inside the ternary are NOT currently caught. This was spotted by Jeremy in PR #755 (ProtoCategoriesModal sub-components).

## Files to Change

### 1. `client/.eslintrc.js`

The `i18next/no-literal-string` rule configuration needs updating.

**Current config**:
```js
'i18next/no-literal-string': [
  'error',
  {
    markupOnly: true,
    ...
  }
]
```

**Investigation needed**: The `i18next/no-literal-string` rule options vary by plugin version. Check `client/package.json` for the `eslint-plugin-i18next` version. The fix depends on what options are available:

**Option A** (if rule supports `jsxExpressionContainerTextOnly: false` or similar):
Set the appropriate option to also check string literals inside JSX expression containers.

**Option B** (use `no-restricted-syntax` supplement):
Add a `no-restricted-syntax` selector to catch the specific pattern:
```js
{
  selector: "JSXExpressionContainer > ConditionalExpression Literal[value=/^[a-zA-Z ]{2,}$/]",
  message: "String literals in JSX ternary expressions must use t() for i18n."
},
{
  selector: "JSXExpressionContainer > LogicalExpression Literal[value=/^[a-zA-Z ]{2,}$/]",
  message: "String literals in JSX logical expressions must use t() for i18n."
},
```

**Recommended approach**: First try upgrading `eslint-plugin-i18next` to the latest version and checking if `markupOnly: false` or a new option catches these patterns. If not, use the `no-restricted-syntax` supplement.

Also update the `ignoreAttribute` list if needed to not over-catch non-translatable JSX attributes.

### 2. Bulk fix: all `client/src/` `.tsx` files

After tightening the rule, run `npm run lint` to discover all newly flagged violations. Systematically fix them:

**Pattern: ternary in JSX**
```tsx
// Before
{isSaving ? 'saving' : 'save'}

// After
{isSaving ? t('common.saving') : t('common.save')}
```

**Pattern: logical expression in JSX**
```tsx
// Before
{hasError && 'Something went wrong'}

// After
{hasError && t('errors.somethingWentWrong')}
```

**Pattern: direct JSX text** (if still missed):
```tsx
// Before
<button>Save</button>

// After
<button>{t('common.save')}</button>
```

Key files to check (from recent max-lines refactoring batches #746–#761):
- `client/src/components/proto-categories/ProtoCategoriesModal.tsx` (known trigger from Jeremy's review)
- Any other sub-components extracted during the refactoring batches

### 3. `client/public/locales/en/translation.json`

Add all new translation keys. Group them under sensible namespaces:
- `common.saving`, `common.save`, `common.cancel`, `common.loading`, etc. for generic UI strings
- Component-specific keys under their own namespace

### 4. `client/public/locales/es/translation.json`

Add Spanish translations for all new keys. Use consistent Spanish UI terminology already established in the file.

## Approach for Bulk Fix

1. Apply ESLint config change first (commit: "Fix i18next ESLint rule to catch JSX expression string literals")
2. Run `cd client && npm run lint 2>&1 | grep "no-literal-string\|restricted-syntax" | wc -l` to count violations
3. Fix in batches by component area (proto-categories, inbox, settings, etc.)
4. Add all translation keys in one commit to `en/translation.json` and `es/translation.json`
5. Final commit: "Bulk fix: replace all JSX expression inline strings with t() calls"

## Edge Cases

- **Non-translatable strings inside JSX expressions**: Things like `{isLoading ? 'spinner' : 'check'}` where the value is a CSS class name or icon name, not user-facing text. The selector regex should only flag multi-word strings or strings with spaces — single tokens that are clearly class names should be excluded, or moved to constants.
- **Test files**: Already excluded from i18next rule — no changes needed there.
- **Debug files**: Already excluded via `*Debug*.tsx` override — coordinate with #771 which will add proper i18n to those files.
- **Numbers and non-alphabetic strings**: The selector regex `[a-zA-Z ]{2,}` should exclude pure numbers, URLs, etc.
- **Template literals**: `{isSaving ? \`saving\` : \`save\`}` — template literals with no expressions are effectively string literals. The rule or selector should also catch these.
- **Storybook files**: Already excluded from i18next via the stories override in `.eslintrc.js`.

## Test Approach

1. **Verify rule catches the known bad pattern**: Add a test component with `{isSaving ? 'saving' : 'save'}` and confirm lint fails.
2. **Verify legitimate patterns still pass**: CSS class strings, data-testid values, etc. should not trigger.
3. Run `cd client && npm run lint` — exits 0 after all fixes.
4. Run `cd client && npm run test` — exits 0 (no regressions).
5. Visual smoke-test: confirm button labels still display correctly in the UI (i18n keys resolve to correct English text).

## Acceptance Criteria

- ESLint catches `{isSaving ? 'saving' : 'save'}` as a violation in `.tsx` files.
- All existing violations fixed with `t()` calls.
- Both `en/translation.json` and `es/translation.json` contain all new keys.
- `cd client && npm run lint` exits 0.
- `cd client && npm run test` exits 0.
