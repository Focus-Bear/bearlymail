# Plan: Deterministic Summarisation Rule Matching + Phishing Appended to All Prompts

**Issue:** #781  
**Branch:** `plan/781-deterministic-rules-phishing-append`  
**Status:** Ready for Codebeard

---

## Overview

Two related changes that remove the expensive parallel LLM call for custom prompts and replace heuristic rule matching with deterministic pattern-based matching.

### Change 1: Append phishing footer to ALL prompts (no separate call)

Currently `summarize-email-tldr.md`, `summarize-email-bullets.md`, and `summarize-email-actions.md` already embed a phishing analysis block in their templates. Custom prompts do **not** — instead, `summarizeEmailWithCustomPromptAndPhishing()` fires a separate `checkPhishingOnly()` LLM call in parallel.

The fix: inject the same phishing footer into custom prompts at build time, parse the JSON response, and eliminate the separate call entirely. Delete `check-phishing-only.md` and `checkPhishingOnly()`.

### Change 2: Deterministic rule matching

Currently `matchRuleFast()` parses the free-text `whenToUse` field to extract `@domain` mentions and keywords — fragile heuristics. `matchRuleForEmail()` falls back to an LLM call to pick the rule — expensive and non-deterministic.

The fix: add structured `from_patterns` and `subject_patterns` columns to `summarization_rules`. Rule evaluation becomes a simple in-process loop; no LLM call needed to pick a rule.

---

## Affected Files

### Backend

| File | Change |
|------|--------|
| `server/src/database/entities/summarization-rule.entity.ts` | Add `fromPatterns`, `subjectPatterns`, `priority` columns |
| New migration `~1778000000000-AddMatchPatternsToSummarizationRules.ts` | ALTER TABLE adds three columns |
| `server/src/summarization/summarization.service.ts` | Replace `matchRuleFast()` + `matchRuleForEmail()` with `matchRuleDeterministic()`; remove `summarizeEmailWithCustomPromptAndPhishing()` private method; simplify `summarizeEmailWithPhishing()` |
| `server/src/summarization/summarization.controller.ts` | Update DTOs for create/update to accept `fromPatterns`, `subjectPatterns`, `priority` |
| `server/src/llm/llm.service.ts` | Add `summarizeCustomPromptWithPhishing()`; remove `checkPhishingOnly()` |
| `server/src/llm/prompts.ts` | Remove `check_phishing_only` entry from `PROMPT_FILE_MAP` |
| `server/promptfoo/prompts/check-phishing-only.md` | **DELETE** |
| `server/promptfoo/check-phishing-only.yaml` | **DELETE** |

### Frontend (client)

| File | Change |
|------|--------|
| `client/src/components/settings/guide-ai/SummarizationRuleAddForm.tsx` | Add `fromPatterns` + `subjectPatterns` inputs |
| `client/src/components/settings/guide-ai/SummarizationRuleEditForm.tsx` | Same additions |
| `client/src/components/settings/guide-ai/SummarizationRuleDisplay.tsx` | Show pattern chips in display view |
| `client/src/components/settings/guide-ai/SummarizationRuleItem.tsx` | Update `SummarizationRule` interface |
| `client/src/components/settings/guide-ai/SummarizationRulesSection.tsx` | Update `SummarizationRule` interface + state for new fields |
| `client/src/pages/Settings.tsx` | Update handlers to pass `fromPatterns`, `subjectPatterns`, `priority` to API |
| i18n locale files (e.g. `en.json`) | Add translation keys (see UI section) |

### Promptfoo Tests

| File | Change |
|------|--------|
| `server/promptfoo/summarize-email-tldr.yaml` | Update assertions to validate `{ summary, phishing }` JSON shape |
| `server/promptfoo/summarize-email-bullets.yaml` | Same |
| `server/promptfoo/summarize-email-actions.yaml` | Same |
| `server/promptfoo/summarize-email-phishing.yaml` | Update var declarations if needed |
| New `server/promptfoo/summarize-email-custom-phishing.yaml` | Test that custom prompts return `{ summary, phishing }` JSON |

---

## Detailed Implementation Steps

### Step 1 — DB Migration

Create `server/src/database/migrations/1778000000000-AddMatchPatternsToSummarizationRules.ts`:

```typescript
await queryRunner.addColumn("summarization_rules", new TableColumn({
  name: "from_patterns",
  type: "text",
  isArray: true,
  default: "'{}'",
  isNullable: false,
}));

await queryRunner.addColumn("summarization_rules", new TableColumn({
  name: "subject_patterns",
  type: "text",
  isArray: true,
  default: "'{}'",
  isNullable: false,
}));

await queryRunner.addColumn("summarization_rules", new TableColumn({
  name: "priority",
  type: "integer",
  default: "0",
  isNullable: false,
}));
```

Down migration: drop the three columns.

No data migration needed — existing rules default to `from_patterns = '{}'`, `subject_patterns = '{}'` which means "match everything" (behaves as the default fallback rule with priority 0).

### Step 2 — Entity Update

**`summarization-rule.entity.ts`** — add three columns (NOT encrypted; patterns are not sensitive):

```typescript
@Column("text", { array: true, default: "{}" })
fromPatterns: string[];

@Column("text", { array: true, default: "{}" })
subjectPatterns: string[];

@Column({ type: "int", default: 0 })
priority: number;
```

Keep `whenToUse` as-is — repurpose it as a human-readable "description" label in the UI (the DB column stays; its existing value becomes the rule name).

### Step 3 — Deterministic Rule Matching

#### Pattern Syntax (supported formats)

| Pattern | Meaning |
|---------|---------|
| `*@github.com` | Any address ending in `@github.com` |
| `noreply@linear.app` | Exact email match |
| `*@*.atlassian.net` | Glob: any subdomain of atlassian.net |
| `/\[Pull Request\]/i` | JavaScript regex (delimited by `/`) |
| `invoice` | Case-insensitive substring match (no delimiters) |

#### Matching Logic

A rule matches if **both** conditions hold:

1. `fromPatterns` is empty **OR** at least one pattern matches `email.from`
2. `subjectPatterns` is empty **OR** at least one pattern matches `email.subject`

Empty `fromPatterns` + empty `subjectPatterns` = "match everything" — use this as the default/fallback rule by setting it to the highest `priority` value.

#### Pattern Evaluation Helpers (new file: `server/src/summarization/pattern-matcher.ts`)

```typescript
/**
 * Returns true if `value` matches `pattern`.
 * Supports:
 *  - /regex/flags  → JS RegExp
 *  - *@domain.com  → glob (only * supported as prefix wildcard)
 *  - plain string  → case-insensitive substring
 */
export function matchPattern(value: string, pattern: string): boolean { ... }

/**
 * Returns true if `value` matches any pattern in the array.
 * Empty array → always true (no constraint).
 */
export function matchAny(value: string, patterns: string[]): boolean { ... }
```

#### `matchRuleDeterministic()` in `summarization.service.ts`

Replace both `matchRuleFast()` and `matchRuleForEmail()` with:

```typescript
matchRuleDeterministic(
  email: { from?: string; subject?: string },
  rules: SummarizationRuleEntity[],
): SummarizationRuleEntity | null {
  if (rules.length === 0) return null;

  const sorted = [...rules].sort(
    (a, b) => a.priority - b.priority || a.createdAt.getTime() - b.createdAt.getTime(),
  );

  for (const rule of sorted) {
    const fromOk = matchAny(email.from ?? "", rule.fromPatterns);
    const subjectOk = matchAny(email.subject ?? "", rule.subjectPatterns);
    if (fromOk && subjectOk) return rule;
  }
  return null;
}
```

**Remove:**
- `matchRuleFast()` — entirely replaced
- `matchRuleForEmail()` — LLM-based matching eliminated
- The `POST summarize/match-rule/:id` controller route that called `matchRuleForEmail()` — no longer needed (or repurpose to call `matchRuleDeterministic` for debugging)

**Update `summarizeEmailWithAutoRule()`** and `prepareThreadDataEntry()` to call `matchRuleDeterministic()` instead of `matchRuleFast()`.

### Step 4 — Phishing Footer Injected into Custom Prompts

#### New constant: `PHISHING_FOOTER` (inline string in `llm.service.ts` or a shared constant)

```
---

PHISHING ANALYSIS (always required):

Return a JSON object (no markdown fences) with exactly these fields:
{
  "summary": "<your answer here>",
  "phishing": <null if clearly legitimate, or { "is_phishing": true|false, "confidence": "low"|"medium"|"high", "reason": "<one sentence>" } if suspicious>
}

When evaluating phishing, consider:
- Does the sender domain match the domains linked in the body?
- Is the email pressuring urgent account action (verify/suspend/locked)?
- Are there credential harvesting phrases?
- Does the email look like a legitimate transactional or marketing email?
- Many legitimate marketing emails (Mailchimp, SendGrid) send from a different domain than the brand — a domain mismatch alone does NOT mean phishing.

If you are uncertain, set is_phishing to false and confidence to low.
{% if phishingSignals %}

Keyword analysis context (use as signals to inform your judgement, not as a verdict):
- Sender domain: {{ phishingSignals.senderDomain }}
- Domains linked in body: {{ phishingSignals.linkedDomains | join(', ') }}
- Domain mismatch detected: {{ phishingSignals.hasDomainMismatch }}
- Suspicious keywords found: {{ phishingSignals.suspiciousKeywords | join(', ') }}
{% endif %}
```

#### New LLM method: `summarizeCustomPromptWithPhishing()`

```typescript
async summarizeCustomPromptWithPhishing(
  emailBody: string,
  emailSubject: string,
  customPrompt: string,
  phishingSignals: PhishingSignals,
  provider?: LLMProvider,
  userId?: string,
): Promise<{ summary: string; phishing: PhishingLLMResult | null }> {
  const isThread = emailBody.includes("[Message") && emailBody.includes("---");

  const promptBody = isThread
    ? `Email Thread Subject: ${emailSubject}\n\n...\n\n${customPrompt}`
    : `Email Subject: ${emailSubject}\n\nEmail Body:\n"""\n${cleanedBody}\n"""\n\n${customPrompt}`;

  // Append phishing footer (rendered with phishingSignals via renderPrompt)
  const fullPrompt = promptBody + "\n\n" + renderPrompt(PHISHING_FOOTER_TEMPLATE, { phishingSignals });

  const response = await this.generateText({
    prompt: fullPrompt,
    systemPrompt: "You are a helpful assistant that summarizes email threads according to user instructions.",
    temperature: 0.5,
    maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL + PHISHING_JSON_TOKEN_OVERHEAD,
    jsonMode: true,
    userId,
  }, provider, userId, LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING);

  return this.parseSummaryWithPhishing(response);
}
```

#### Remove from `llm.service.ts`

- `checkPhishingOnly()` method — deleted entirely
- `check_phishing_only` reference from `PROMPT_FILE_MAP` in `prompts.ts`

#### Refactor `summarizeEmailWithPhishing()` in `summarization.service.ts`

Remove the `if (rule.type === 'custom' && rule.customPrompt)` split that called `summarizeEmailWithCustomPromptAndPhishing()`. Instead, route custom prompts through `summarizeEmailWithCombinedPhishing()` which should detect `rule.type === 'custom'` and call `llmService.summarizeCustomPromptWithPhishing()`.

**Delete** `summarizeEmailWithCustomPromptAndPhishing()` private method.

The simplified `summarizeEmailWithPhishing()` flow:

```
summarizeEmailWithPhishing()
  ├── check cache → return early if hit
  └── summarizeEmailWithCombinedPhishing()  (all types including custom)
        ├── rule.type === 'custom'  → llmService.summarizeCustomPromptWithPhishing()
        └── tldr / bullets / actions  → llmService.summarizeEmailWithPhishingCheck()
```

### Step 5 — Controller DTO Updates

Update `summarization.controller.ts`:

```typescript
// POST /summarize/rules
@Body() rule: {
  whenToUse: string;
  howToSummarize: string;
  fromPatterns?: string[];
  subjectPatterns?: string[];
  priority?: number;
}

// PUT /summarize/rules/:id
@Body() updates: {
  whenToUse?: string;
  howToSummarize?: string;
  fromPatterns?: string[];
  subjectPatterns?: string[];
  priority?: number;
}
```

Update `createSummarizationRule()` and `updateSummarizationRule()` in the service to persist these new fields.

### Step 6 — Settings UI

#### New translation keys (i18n locale files)

```json
"settings.fromPatterns": "Sender patterns",
"settings.fromPatternsPlaceholder": "e.g. *@github.com, noreply@linear.app",
"settings.fromPatternsHelp": "Match by sender address. Use * as wildcard, /regex/flags for regex.",
"settings.subjectPatterns": "Subject patterns",
"settings.subjectPatternsPlaceholder": "e.g. [Pull Request], invoice, /URGENT/i",
"settings.subjectPatternsHelp": "Match by subject keywords. Plain text = substring match.",
"settings.priority": "Priority",
"settings.priorityHelp": "Lower number = higher priority. Rules are checked in order."
```

#### `SummarizationRuleAddForm.tsx` additions

Add two new fields below the existing `whenToUse` (now labelled "Description") and `howToSummarize` fields:

- **Sender patterns** — `<input type="text">` with comma-separated placeholder. Parse on save: `value.split(',').map(s => s.trim()).filter(Boolean)`.
- **Subject patterns** — same approach.
- **Priority** — `<input type="number" min={0} defaultValue={0}>`.

#### `SummarizationRuleEditForm.tsx` additions

Mirror the same fields as `SummarizationRuleAddForm`.

#### `SummarizationRuleDisplay.tsx` additions

When `fromPatterns` or `subjectPatterns` are non-empty, show them as chips below the description:

```
📋 GitHub PRs
  From: [*@github.com]
  Subject: [[Pull Request]] [[Issue]]
→ Extract: PR title, author, key decisions...
```

#### Interface changes (all 5 components + Settings.tsx)

Add to the shared `SummarizationRule` interface:

```typescript
fromPatterns: string[];
subjectPatterns: string[];
priority: number;
```

Update all state variables in `Settings.tsx` that track add/edit form values.

### Step 7 — Promptfoo Test Updates

#### Update existing YAML assertions (tldr, bullets, actions)

The prompts already return `{ summary, phishing }` JSON, but the current test assertions only validate the raw text. Update them to:

1. Parse the output as JSON
2. Assert `output.summary` is non-empty and contains expected content
3. Assert `output.phishing === null` for legitimate emails
4. Assert `output.phishing.is_phishing === true` for phishing samples

Example assertion update for `summarize-email-tldr.yaml`:

```javascript
const parsed = typeof output === 'object' ? output : JSON.parse(output);
if (typeof parsed.summary !== 'string' || parsed.summary.length < 10) {
  throw new Error(`Expected summary string, got: ${JSON.stringify(parsed)}`);
}
// phishing field must be null or a valid object
if (parsed.phishing !== null && typeof parsed.phishing !== 'object') {
  throw new Error(`Invalid phishing field: ${JSON.stringify(parsed.phishing)}`);
}
return true;
```

#### New `server/promptfoo/summarize-email-custom-phishing.yaml`

Tests that a custom prompt + phishing footer combination:
1. Returns `{ summary, phishing }` JSON (not plain text)
2. Custom summary respects the user's instructions
3. Detects phishing in phishing samples
4. Returns `phishing: null` for legitimate emails

Uses the tldr prompt as a stand-in (since the actual custom prompt injection happens in code, not in a standalone template). Add a test note explaining this.

#### Delete `server/promptfoo/check-phishing-only.yaml`

No longer used after `checkPhishingOnly()` is removed.

---

## Design Decisions & Open Questions

### Kept: `whenToUse` field

`whenToUse` is kept in the DB as a "description/name" for the rule — existing users already have natural-language descriptions there, and it's displayed as the rule title. We repurpose it as a display label rather than for matching. The matching logic now exclusively uses `fromPatterns` and `subjectPatterns`.

**Open question:** Should we rename the DB column from `whenToUse` to `description` in a follow-up migration, or leave it as-is to minimise churn? Recommendation: leave it; rename later.

### Pattern matching scope

The plan uses simple glob (`*`) and regex (`/pattern/flags`) support. No external library is needed — a small `pattern-matcher.ts` utility handles both.

**Open question:** Should we validate patterns at the API layer (reject invalid regex)? Recommendation: yes — catch `new RegExp(pattern)` at save time and return a 400 with a descriptive message.

### Default rule behaviour

A rule with empty `fromPatterns` AND empty `subjectPatterns` matches every email. This is the "default" behaviour. Users creating a default rule should set `priority` to a high value (e.g., 100) so it runs last.

**Open question:** Should we add a dedicated `isDefault: boolean` column to prevent ambiguity? Recommendation: not for now — empty arrays + high priority covers the use case.

### Phishing footer as shared constant

The phishing footer template currently exists in three separate `.md` files and will now also be injected as a string constant for custom prompts. Consider extracting it to a shared partial file (`prompts/phishing-footer.md`) included by the other templates. Not required for this PR but reduces duplication.

---

## Migration Safety

- The `from_patterns`, `subject_patterns`, and `priority` columns all have safe defaults (`'{}'`, `'{}'`, `0`). No data migration needed.
- Existing rules with empty arrays match all emails — they become a "catch-all" default. Users will need to add specific patterns in Settings to narrow the match scope, but nothing breaks immediately.
- `checkPhishingOnly()` removal: the `summarizeEmailWithCustomPromptAndPhishing()` path was the only caller. Once that private method is deleted, there are no remaining callers.

---

## Test Strategy

1. **Unit tests** — add tests for `matchRuleDeterministic()` covering:
   - Glob patterns (`*@github.com`)
   - Regex patterns (`/\[PR\]/i`)
   - Substring match (`invoice`)
   - Priority ordering (lower number wins)
   - Empty arrays match all
   - No match returns `null`

2. **Unit tests** — `parseSummaryWithPhishing()` graceful degradation for custom prompt responses (already tested for tldr/bullets/actions).

3. **Service tests** — `summarizeEmailWithPhishing()` with `rule.type === 'custom'` now returns `{ summary, phishing }` without calling `checkPhishingOnly`.

4. **Promptfoo** — existing phishing YAML tests validate detection accuracy for tldr/bullets/actions. New `summarize-email-custom-phishing.yaml` covers the custom prompt path.

---

## Rollout Notes

- No feature flag needed — deterministic matching is strictly better than heuristic matching.
- Phishing footer injection for custom prompts is a behaviour change: custom prompt responses will now be JSON `{ summary, phishing }` instead of plain text. Any caller that passes `rule.type === 'custom'` and expects a plain string needs to be updated before this ships (check `summarizeEmail()` calls in batch jobs and the controller).
- The `POST /summarize/match-rule/:id` endpoint changes behaviour: it now calls `matchRuleDeterministic()` instead of the LLM path. This is fine for any client using it for debugging.
