# Plan: Prompt Thread Context Audit (Issue #1029)

**Branch:** `openclaw/issue-1029/prompt-thread-audit`
**Issue:** #1029 — Prompts receiving full email threads when they should only receive compact summaries
**Author:** Monk of Modularity (AI planning agent)

---

## Architecture Reminder

Jeremy's intended architecture is simple and explicit:

> **Only the summarisation prompt receives the full email thread.** All other prompts receive only the compact summary output from the summarisation step.

Token savings are significant: a full thread can be 10K+ tokens vs a ~200-token summary.

---

## Audit Findings

### 1. `analyzePriority` (single-email path) — `priority-analysis.service.ts`

**Call site:** `llm-processor.ts` ~line 322, `processPriorityForEmail()`.

**What it currently receives:**

- `body` → ✅ Uses `email.summary` (with fallback to cleaned body) — **correct**
- `threadEmails` param → Receives an array of sibling emails, where each sibling's body is `emailEntry.summary || emailEntry.body` (line ~315)

**Is the `threadEmails` param OK?**  
Partially. The call site does prefer summaries for each thread email body, but the fallback is `emailEntry.body` — raw message content. More critically, the entire `threadEmails` array is passed into `buildThreadContextText()` inside `PriorityAnalysisService`, which embeds up to 5 previous messages in the prompt. Per the architecture, priority analysis should not receive thread history at all — only the summary of the target email.

**Verdict: ❌ Non-compliant.** The `threadEmails` / `threadContext` parameters in `analyzePriority` should be removed from the priority prompt. The email's `body` (already set to `email.summary`) is sufficient.

---

### 2. `analyzePriorityBatch` — `priority-analysis.service.ts`

**Call site:** `llm-processor.ts` ~line 528, `processBatchPriority()`.

**What it currently receives:**

- `body` per email → ✅ Uses `email.summary` (with fallback to cleaned body) — **correct**
- `threadContext` per email → Built by `buildBatchThreadContext()` which processes raw sibling `emailEntry.body` — **❌ WRONG**

**The smoking gun:** The batch prompt header reads:

> "Note: Each email is provided as a compact summary (not the full thread)."

But then `threadContextSection` is appended directly into the per-email block:

```typescript
const threadContextSection = email.threadContext
  ? `\nThread Context (previous messages, chronological):\n${email.threadContext}`
  : "";
```

And `buildBatchThreadContext()` in `llm-processor.ts` fetches siblings using `emailEntry.body` (raw, no summary preference at line ~516).

**Verdict: ❌ Non-compliant.** Two issues:

1. `buildBatchThreadContext()` uses `emailEntry.body` instead of `emailEntry.summary || emailEntry.body`
2. The batch prompt should not receive thread context at all per the architecture — the batch prompt's own header contradicts its behaviour

---

### 3. `extractActionItems` / `extractQAndA` — `llm.service.ts`

**What it receives:**

- `emailBody` parameter — this is a cleaned/truncated body string
- No `threadEmails` or `threadContext` param anywhere in the signature

**Verdict: ✅ Compliant.** The function only receives the body of the email being analysed, cleaned to 2000 chars. No thread context is passed.

---

### 4. `checkTone` — `llm.service.ts`

**What it receives:**

- `text` parameter — the draft text to check (the composed reply)
- No `threadEmails` or `threadContext` param

**Verdict: ✅ Compliant.** Only the draft text is checked; no thread history is included.

---

### 5. `generateReplyDraft` — `llm.service.ts`

**What it receives:**

- `originalEmail.body` — cleaned body of the email being replied to
- No `threadMessages` param (unlike `generateReplyOptions`)

**Verdict: ✅ Compliant.** Simple draft, no thread context.

---

### 6. `generateReplyOptions` — `llm.service.ts`

**What it receives:**

- `originalEmail.body` — cleaned body
- `threadMessages?: Array<{...}>` — **full message bodies from prior thread messages**, cleaned per-message

**Should it?** Yes — **legitimate exception.** Reply generation genuinely needs thread context to write a contextually coherent reply. Knowing what was said earlier in the conversation is essential for composing a response. This is qualitatively different from classification/priority, where you only need the summary of what the current email says.

**Verdict: ✅ Compliant (legitimate exception).** Thread context in reply generation is architecturally justified.

---

### 7. `generateFollowUpDraft` — `llm.service.ts`

**What it receives:**

- `threadMessages: Array<{...}>` — thread history used to compose a follow-up

**Should it?** Yes — same rationale as `generateReplyOptions`. Follow-ups need to reference prior conversation.

**Verdict: ✅ Compliant (legitimate exception).**

---

### 8. `identifyCustomLabels` — `llm.service.ts`

**What it receives:**

- `labels: string[]` — a list of label strings only, no email content at all

**Verdict: ✅ Compliant.** No thread context involved.

---

### 9. `checkIfRecalcNeeded` (incremental priority check) — `incremental-analysis.service.ts`

**What it receives:**

- `existingState` — includes `existingSummary` (the thread summary) — **correct**
- `newEmail.body` — cleaned body of the new email — **correct**
- `threadContext` — built by `formatThreadContextForIncremental()` using raw `emailEntry.body`

**Should it receive thread context?**  
The incremental check is a lightweight "does this new message change the priority?" decision. It receives the existing summary plus the new email's body. Passing additional raw thread messages adds tokens for minimal benefit — the summary already encodes the thread state.

**Verdict: ⚠️ Borderline.** The `threadContext` param uses raw bodies. However, since `formatThreadContextForIncremental()` already limits to 3 messages with short body previews (`SUBSTRING_SNIPPET_LENGTH`), the token impact is small. Recommend replacing the raw body snippets with `emailEntry.summary || emailEntry.body` — low risk, consistent with architecture.

---

## Summary Table

| Prompt / Function       | Receives Thread?                             | Should It?                       | Status               |
| ----------------------- | -------------------------------------------- | -------------------------------- | -------------------- |
| `analyzePriority`       | ✅ `threadEmails` array (body = summary‖raw) | ❌ No                            | **Fix needed**       |
| `analyzePriorityBatch`  | ✅ `threadContext` string (raw bodies)       | ❌ No                            | **Fix needed**       |
| `extractActionItems`    | ❌ body only                                 | ✅ Correct                       | OK                   |
| `checkTone`             | ❌ draft text only                           | ✅ Correct                       | OK                   |
| `generateReplyDraft`    | ❌ body only                                 | ✅ Correct                       | OK                   |
| `generateReplyOptions`  | ✅ `threadMessages`                          | ✅ Yes (reply needs history)     | OK (legit exception) |
| `generateFollowUpDraft` | ✅ `threadMessages`                          | ✅ Yes (follow-up needs history) | OK (legit exception) |
| `identifyCustomLabels`  | ❌ labels only                               | ✅ Correct                       | OK                   |
| `checkIfRecalcNeeded`   | ✅ `threadContext` (raw snippets)            | ⚠️ Prefer summaries              | Minor fix            |

---

## Required Changes

### Fix 1 — `analyzePriority`: Remove thread context from priority prompt

**File:** `server/src/llm/priority-analysis.service.ts`

**Problem:** `analyzePriority` accepts a `threadEmails` param and passes it to `buildThreadContextText()` which embeds raw thread messages into the priority prompt via `{{threadContext}}`.

**Change:**

1. Remove the `threadEmails` parameter from `analyzePriority()`
2. Remove `buildThreadContextText()` call and the `threadContext` variable
3. Remove `threadContext` and `threadInfo` variables from the `renderPrompt()` call (or keep `threadInfo` metadata only — see note)
4. Update the `prioritise-email.md` prompt template to remove the `{{threadContext}}` section

**Note on `threadInfo`:** The `threadInfo` object (days since last reply, who should reply, last reply from) is lightweight metadata — not raw email content. It can be retained if the prompt uses it beneficially. Only raw `threadContext` text should be removed.

**Call site to update:** `llm-processor.ts` ~line 337 — remove the `threadEmailsForLLM` argument from the `analyzePriority()` call and delete the `threadEmailsForLLM` construction block (lines ~309–320).

---

### Fix 2 — `analyzePriorityBatch`: Remove thread context from batch priority prompt

**Files:**

- `server/src/llm/priority-analysis.service.ts`
- `server/src/emails/llm-processor.ts`

**Problem A (`priority-analysis.service.ts`):** The `threadContext` field on each batch email entry is embedded as raw text in the batch prompt, contradicting the prompt's own header.

**Change in `priority-analysis.service.ts`:**

1. Remove the `threadContext` field from the `emails` parameter type of `analyzePriorityBatch()`
2. Remove the `threadContextSection` variable and its insertion into `emailDescriptions`

**Problem B (`llm-processor.ts`):** `buildBatchThreadContext()` fetches sibling bodies from the DB and passes them raw (no summary preference) as `threadContext`.

**Change in `llm-processor.ts`:**

1. Delete the `threadEmailsMap` construction block (~lines 488–525)
2. Delete `buildBatchThreadContext()` method
3. Remove `threadContext` from the `batchEmails` map call (~line 550)

---

### Fix 3 (Minor) — `checkIfRecalcNeeded`: Prefer summaries in thread context

**File:** `server/src/emails/llm-processor.ts`

**Problem:** `formatThreadContextForIncremental()` is called with raw `emailEntry.body`. Sibling emails with summaries should use them.

**Change in `llm-processor.ts`** (~line 1713):

```typescript
// Before:
body: emailEntry.body || "",
// After:
body: emailEntry.summary || emailEntry.body || "",
```

Low-risk, consistent with the architecture principle.

---

## The Correct Pattern

For any non-summarisation, non-reply LLM call:

```
Priority analysis / category classification:
  Input → email.subject + email.summary (NOT email.body, NOT threadEmails)

Action item extraction:
  Input → email.body (already cleaned; this IS the email being analysed)

Tone check:
  Input → draft text only (no email context)

Reply generation (EXCEPTION — needs conversation history):
  Input → email.body + threadMessages (cleaned per-message bodies)

Follow-up generation (EXCEPTION — needs conversation history):
  Input → threadMessages (cleaned per-message bodies)
```

**The summary IS the compact representation.** Once generated, it replaces raw thread content for all classification tasks. The summarisation step exists precisely to produce this compact token-efficient representation for downstream prompts.

---

## Migration Risk

### Low Risk (safe to remove)

- **`analyzePriority` thread context:** The email's `body` is already set to `email.summary` at the call site. Removing `threadEmails` simply removes redundant/contradictory context. Priority scores may marginally improve since the LLM will focus on the summary.
- **`analyzePriorityBatch` thread context:** Same reasoning. The batch prompt's own header already says it doesn't want thread context — removing it makes the prompt internally consistent.

### Very Low Risk

- **`checkIfRecalcNeeded` body preference:** Using `summary || body` for sibling bodies is a pure improvement. If no summary exists, falls back to body — same as today.

### No Risk

- `extractActionItems`, `checkTone`, `generateReplyDraft` — already compliant, no changes needed.
- `generateReplyOptions`, `generateFollowUpDraft` — legitimate exceptions, no changes needed.

### Potential Quality Impact (acknowledged, acceptable)

The priority LLM currently uses thread context as a secondary signal (e.g. "this thread has been going back and forth for 3 days → higher urgency"). After the fix, this signal will only be available through `threadInfo` metadata (days since last reply, who should reply). For most emails, the summary captures thread sentiment adequately. For edge cases, `threadInfo` provides the structural metadata. This is an acceptable trade-off for the token savings and architectural correctness.

---

## Files to Change

| File                                           | Change                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/llm/priority-analysis.service.ts`  | Remove `threadEmails` param + `buildThreadContextText()` from `analyzePriority`; remove `threadContext` field from `analyzePriorityBatch` input type and prompt construction |
| `server/src/emails/llm-processor.ts`           | Remove `threadEmailsForLLM` block from single-email path; remove `threadEmailsMap` + `buildBatchThreadContext()` from batch path; prefer `summary` in incremental check      |
| `server/promptfoo/prompts/prioritise-email.md` | Remove `{{threadContext}}` section from prompt template                                                                                                                      |

---

## References

- Issue: #1029
- Primary offending code: `priority-analysis.service.ts` — `buildThreadContextText()` and `analyzePriorityBatch` `threadContextSection`
- Call sites: `llm-processor.ts` — `processPriorityForEmail()` and `processBatchPriority()`
