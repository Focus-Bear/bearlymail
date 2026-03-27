# Plan: Fix autoresponder ignoring user exclusion config (#1515)

## Problem

The autoresponder has a `customExclusionRules` config where users can specify
free-text rules like "Don't reply to automated emails" or "Skip newsletters".
**This config is being ignored** for automated emails because:

1. **`classification.isAutomated` and `classification.isNewsletter` are computed
   by the email classifier but never used as skip conditions.** Only `isBounce`
   and `isOutOfOffice` trigger skips in `checkClassificationSkip()`.

2. **`checkCustomExclusionRules()` doesn't receive headers or the classification
   result.** The LLM doing the custom exclusion check has to re-derive whether
   an email is automated from just `from`/`subject`/`body` — without
   `List-Unsubscribe`, `X-Mailer`, `Precedence`, or any of the headers that the
   classifier already used to correctly set `isAutomated = true`.

3. **The classification and custom-exclusion checks are decoupled.** The
   classifier runs first and correctly flags `isAutomated`/`isNewsletter`, but
   this knowledge is never passed to the custom-exclusion LLM call. So a user
   rule like "automated emails" has to be re-detected from scratch, without
   headers, and often fails.

## Why PR #1517 was the wrong approach

PR #1517 added hardcoded `isAutomated`/`isNewsletter` skip checks and a new
`Contact.contactType` lookup. Jeremy's feedback: the existing user config
(`customExclusionRules`) should already handle this. The fix should make the
existing config work, not add parallel hardcoded detection.

## Root Cause (one sentence)

`checkCustomExclusionRules()` receives only email body/subject/from — not
headers or the already-computed classification — so it cannot reliably match
user rules about automated emails, newsletters, etc.

## Fix

### 1. Pass classification result to `checkCustomExclusionRules` LLM prompt

**File:** `server/src/auto-responder/email-classifier.service.ts`
(method `checkCustomExclusionRules`)

Add an optional `classification?: EmailClassification` parameter. When provided,
include the classification summary in the LLM prompt so the model knows:
- `isAutomated: true/false`
- `isNewsletter: true/false`
- `isColdOutreach: true/false`
- `isBounce: true/false`
- `isOutOfOffice: true/false`
- `classification.reasons[]`

Prompt addition (after the email content block):
```
PRIOR CLASSIFICATION (from header and content analysis):
- Automated: {{isAutomated}}
- Newsletter: {{isNewsletter}}
- Cold outreach: {{isColdOutreach}}
- Bounce: {{isBounce}}
- Out-of-office: {{isOutOfOffice}}
- Reasons: {{reasons}}

Use this classification context when evaluating rules. For example, if a rule
says "automated emails" and the prior classification shows Automated: true,
that is a match.
```

### 2. Pass headers to `checkCustomExclusionRules` LLM prompt

**File:** `server/src/auto-responder/email-classifier.service.ts`
(method `checkCustomExclusionRules`)

Add an optional `headers?: Record<string, string>` parameter. When provided,
include relevant headers in the prompt so the LLM can match rules that relate
to header-detectable patterns (automated senders, mailing lists, etc.).

Include a curated subset of headers in the prompt:
```
EMAIL HEADERS (relevant subset):
{{#each relevantHeaders}}
{{key}}: {{value}}
{{/each}}
```

Relevant headers to include (when present): `List-Unsubscribe`,
`List-Id`, `Precedence`, `X-Mailer`, `X-Auto-Response-Suppress`,
`Auto-Submitted`, `X-Google-DKIM`, `Feedback-ID`.

### 3. Update `checkCustomExclusionSkip` to pass classification and headers

**File:** `server/src/auto-responder/auto-responder.service.ts`
(method `checkCustomExclusionSkip`)

- Add `classification` and `headers` parameters
- Pass them through to `contextService.checkCustomExclusionRules()`

### 4. Update `checkClassificationSkip` call order

**File:** `server/src/auto-responder/auto-responder.service.ts`
(method `checkClassificationSkip`)

Move the `checkCustomExclusionSkip()` call to AFTER classification (it already
is after classification, but now pass the classification result):

```typescript
// After classification runs and isBounce/isOutOfOffice checks:
const customSkip = await this.checkCustomExclusionSkip(
  logContext,
  config,
  latestEmail,
  classification,  // NEW: pass classification
  headers,         // NEW: pass headers
);
```

### 5. Update `AutoResponderContextService` passthrough

**File:** `server/src/auto-responder/auto-responder-context.service.ts`
(method `checkCustomExclusionRules`)

Add the new optional parameters and pass them through to
`emailClassifierService.checkCustomExclusionRules()`.

### 6. Tests

**File:** `server/src/auto-responder/auto-responder.service.spec.ts`
(or new `auto-responder-custom-exclusion.spec.ts` if line limits are hit)

Add tests:
- Custom rule "automated emails" + `classification.isAutomated = true` → skip
- Custom rule "newsletters" + `classification.isNewsletter = true` → skip
- Custom rule "automated emails" + `classification.isAutomated = false` → no
  match (rule doesn't match just because it mentions automation)
- Custom rule "emails from noreply@" + headers with matching sender → skip
- Existing tests remain unchanged (backward compatible since new params are
  optional)

## Files Changed

| File | Change |
|------|--------|
| `server/src/auto-responder/email-classifier.service.ts` | Add `classification` + `headers` params to `checkCustomExclusionRules`, update LLM prompt |
| `server/src/auto-responder/auto-responder-context.service.ts` | Pass new params through |
| `server/src/auto-responder/auto-responder.service.ts` | Pass `classification` + `headers` to custom exclusion check |
| `server/src/auto-responder/auto-responder.service.spec.ts` (or new file) | New test cases |

## What This Does NOT Do

- Does NOT add hardcoded `isAutomated`/`isNewsletter` skip conditions (that's
  what PR #1517 did wrong)
- Does NOT add `Contact.contactType` lookup (orthogonal concern)
- Does NOT change the classifier or its output format
- Does NOT add new config fields — uses the existing `customExclusionRules`

## Why This Works

Jeremy said "I had automated emails in my list of what it shouldn't fire on but
it ignored it." The custom exclusion LLM check was trying to match "automated
emails" but couldn't because it had no classification context or headers. By
giving it the already-computed `isAutomated: true` flag and the relevant headers,
the match becomes reliable.

---
🧘 *Planned by Monk of Modularity (OpenClaw AI agent)*
