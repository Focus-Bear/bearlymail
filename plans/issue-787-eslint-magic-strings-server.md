# Plan: Issue #787 — Add ESLint no-restricted-syntax rule to catch magic strings in server code

## Context

The server `.eslintrc.js` already has an extensive `no-magic-numbers` rule, and the comment in that file even calls out the gap: string literals like `"summarize_email_tldr"` are not currently flagged by any lint rule. The client has a `no-restricted-syntax` rule for `captureEvent()` magic strings (added in #777). We need the server-side equivalent.

## Files to Change

### 1. `server/.eslintrc.js`

Add a `no-restricted-syntax` array to the `rules` section (currently absent on the server side).

The selectors should target:
- **Prompt ID string literals**: any `Literal` whose value matches the known prompt ID prefixes
- **General comparison magic strings**: string literals in `===`/`!==` binary comparisons
- **Switch case magic strings**: string literals in switch cases

Suggested rule additions:

```js
'no-restricted-syntax': [
  'error',
  {
    selector: "Literal[value=/^(summarize_email|analyze_|generate_|check_|classify_|extract_|identify_|suggest_|search_|compress_|consolidate_|detect_|validate_|prioritise_|redact_|incremental_)/]",
    message: "Use a named constant from SUMMARY_PROMPT_IDS or PROMPT_FILE_MAP key constants instead of a magic string prompt ID.",
  },
  {
    selector: "BinaryExpression[operator=/^(===|!==|==|!=)$/] > Literal[value=/^[a-zA-Z_][a-zA-Z_]{3,}$/]",
    message: "Avoid magic strings in comparisons — define them as a named constant.",
  },
  {
    selector: "SwitchCase > Literal[value=/^[a-zA-Z_][a-zA-Z_]{3,}$/]",
    message: "Avoid magic strings in switch cases — define them as a named constant.",
  },
],
```

Also add `'no-restricted-syntax': 'off'` inside the existing test file override block to prevent false positives in test fixture strings.

### 2. `server/src/llm/prompts.ts`

Audit for any remaining hardcoded prompt ID strings not already using `SUMMARY_PROMPT_IDS`. The `PROMPT_FILE_MAP` array currently uses raw string keys — these are the source-of-truth definitions themselves, but their *consumers* must use exported constants rather than repeating the strings.

Add additional constant groups:
- `PRIORITY_PROMPT_IDS` — for `analyze_priority`, `analyze_priority_feedback`, `incremental_priority_check`
- `REPLY_PROMPT_IDS` — for `generate_reply`, `generate_multiple_replies`, `generate_meeting_reply`, `generate_follow_up`
- `CLASSIFICATION_PROMPT_IDS` — for `classify_email_type`, `classify_contact_type`
- `CONTEXT_PROMPT_IDS` — for `analyze_email_patterns`, `extract_action_items`, `extract_common_questions`, etc.

Restructure `PROMPT_FILE_MAP` entries to reference the constant values rather than duplicating the string literals, e.g.:

```ts
{ file: 'summarize-email-tldr.md', key: SUMMARY_PROMPT_IDS.TLDR, critical: true },
```

This way `prompts.ts` itself doesn't trigger the lint rule (the Literal values only appear inside the `as const` object, which is the definition site).

### 3. Server service files that call `getPrompt()` or compare against prompt IDs

Run `grep -r 'getPrompt("' server/src/` and `grep -r "getPrompt('" server/src/` to find all call sites. Replace each with the appropriate named constant.

Key files to check:
- `server/src/llm/llm.service.ts`
- `server/src/llm/priority-analysis.service.ts`
- `server/src/emails/emails.service.ts`
- Any service that builds prompt keys dynamically from strings

## Edge Cases

- **`PROMPT_FILE_MAP` definition**: After restructuring to use constants as values, the Literal strings only appear inside the constant declaration — which is fine.
- **Dynamic key construction**: Some services may build prompt IDs with string interpolation (`"summarize_email_" + type`). These should be refactored to use a lookup map: `SUMMARY_PROMPT_IDS[type]` with a `SummaryType` guard.
- **Script files**: The `**/scripts/**` override already exists with relaxed rules. Add `'no-restricted-syntax': 'off'` there too if scripts use prompt ID strings for CLI display.
- **Migration files**: Already ignored, no concern.
- **Test files**: The test override relaxes many rules — add `'no-restricted-syntax': 'off'` to avoid breaking test fixtures that use prompt ID strings directly.

## Test Approach

1. Run `cd server && npm run lint` after adding the rule — all newly flagged violations are fixed before the PR is ready.
2. Run `cd server && npm run test` to confirm no runtime regressions from constant refactoring.
3. No new unit tests needed — this is a static analysis configuration change, not new business logic.

## Acceptance Criteria

- `server/.eslintrc.js` has a `no-restricted-syntax` rule covering at least: prompt ID magic strings, comparison magic strings, and switch-case magic strings.
- All existing consumer call-sites use named constants from `prompts.ts`.
- New constant groups (`PRIORITY_PROMPT_IDS`, `REPLY_PROMPT_IDS`, etc.) are exported from `server/src/llm/prompts.ts`.
- `cd server && npm run lint` exits 0.
- `cd server && npm run test` exits 0.
