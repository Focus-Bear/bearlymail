# Plan: LLM-backed Phishing Detection (Issue #744)

## Problem

The current `phishing-detection.service.ts` uses pure keyword + domain heuristics. These produce too many false positives on legitimate marketing emails (e.g. the issue screenshot shows a real email incorrectly flagged). PR #752 patches thresholds but doesn't fix the root cause — keyword matching can't reason about context.

## Approach: Piggyback on the Existing Summarisation Call

The email is **already being sent to an LLM for summarisation**. Rather than a separate LLM call for phishing, we extend the summarisation prompt to **always include phishing analysis**. Keyword heuristic findings are passed as context signals to help the LLM reason better — but the LLM always makes the final call, regardless of keyword score.

Flow:
```
Incoming email
    │
    ▼
[1] Heuristic keyword/domain analysis (existing phishing-detection.service.ts)
    │   Returns: keyword signals + domain mismatch info (always runs)
    │   These are passed as CONTEXT to the LLM, not used as a gate
    │
    ▼
[2] LLM summarisation call (already happening — always runs)
    Prompt extended: includes keyword signals as context, requests phishing field
    Output: { summary: "...", phishing: { is_phishing, confidence, reason } | null }
    │
    ├── LLM returns valid phishing result → use it (LLM always wins)
    │
    └── LLM fails / bad JSON → fall back to keyword result (graceful degradation)
```

**Key design decision (Jeremy's feedback)**: Every email goes through LLM phishing analysis. Keyword findings are useful signals — they help the LLM focus attention on the right things — but they are **not a gate**. A low keyword score does NOT mean we skip LLM analysis. The LLM decides.

**Key benefit**: Leverages the existing summarisation call — zero additional LLM API calls. Keyword signals improve LLM accuracy (especially for domain mismatches) without letting them veto the analysis.

---

## Files to Change

### 1. `server/src/summarization/phishing-detection.service.ts`

Export a new `extractPhishingSignals(from, body): PhishingSignals` function that returns structured keyword/domain findings as input context. This replaces `computePhishingScore` (no longer needed since we don't gate on score).

```typescript
export interface PhishingSignals {
  hasDomainMismatch: boolean;
  senderDomain: string | null;
  linkedDomains: string[];
  suspiciousKeywords: string[];    // which keywords triggered, not just a score
  rawScore: number;                // retained for logging/debugging only, NOT used as gate
}

// NEW export — returns structured signals for LLM context injection
export function extractPhishingSignals(
  from: string | undefined,
  body: string,
): PhishingSignals {
  const senderDomain = extractSenderDomain(from);
  const bodyDomains = extractBodyDomains(body);
  const keywords = extractSuspiciousKeywords(body);  // returns matched keyword list
  return {
    hasDomainMismatch: senderDomain ? hasDomainMismatch(senderDomain, bodyDomains) : false,
    senderDomain,
    linkedDomains: bodyDomains,
    suspiciousKeywords: keywords,
    rawScore: computeRawScore(senderDomain, bodyDomains, keywords),
  };
}
```

Keep `detectPhishingSignal` and all existing exports **unchanged** — no regressions.

---

### 2. `server/promptfoo/prompts/summarize-email-tldr.md` (and bullets, actions variants)

Always include the phishing analysis block at the end of each single-email prompt template (no conditional). Keyword signals are injected as context when available.

```markdown
---

PHISHING ANALYSIS (always required):

Return a JSON object (no markdown fences) with exactly these fields:
{
  "summary": "<your normal TL;DR here>",
  "phishing": <null if clearly legitimate, or { "is_phishing": true|false, "confidence": "low"|"medium"|"high", "reason": "<one sentence>" } if suspicious>
}

When evaluating phishing, consider:
- Does the sender domain match the domains linked in the body?
- Is the email pressuring urgent account action (verify/suspend/locked)?
- Are there credential harvesting phrases?
- Does the email look like a legitimate transactional or marketing email?

If you are uncertain, set is_phishing to false and confidence to low.

{% if phishingSignals %}
Keyword analysis context (use as signals, not as a verdict):
- Sender domain: {{ phishingSignals.senderDomain }}
- Domains linked in body: {{ phishingSignals.linkedDomains | join(', ') }}
- Domain mismatch detected: {{ phishingSignals.hasDomainMismatch }}
- Suspicious keywords found: {{ phishingSignals.suspiciousKeywords | join(', ') }}

Note: Many legitimate marketing emails (Mailchimp, SendGrid) send from a different domain than the brand. A domain mismatch alone does NOT mean phishing — use your judgement.
{% endif %}
```

Affected files:
- `server/promptfoo/prompts/summarize-email-tldr.md`
- `server/promptfoo/prompts/summarize-email-bullets.md`
- `server/promptfoo/prompts/summarize-email-actions.md`

---

### 3. `server/promptfoo/prompts/summarize-email-batch.md`

Extend the batch prompt to always include phishing analysis per email. Keyword signals per email are passed in the batch data.

```markdown
For each email, include a "phishing" field in the value.
Return format for each email:
{ "summary": "...", "phishing": { "is_phishing": bool, "confidence": "low"|"medium"|"high", "reason": "..." } | null }

{% if batchPhishingSignals %}
Keyword signal context per email index:
{{ batchPhishingSignals | json }}

Use these as input signals only — the signals may flag legitimate marketing emails. Use judgement.
{% endif %}
```

---

### 4. `server/src/llm/llm-operations.ts`

Add a new operation constant for token usage tracking:

```typescript
// Summarize email + phishing check piggybacked (single email)
export const LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING = "summarize_email_with_phishing_check";
```

Add it to the `LLM_OPERATION_NAMES` map too:
```typescript
[LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING]: "Summarize Email + Phishing Check",
```

---

### 5. `server/src/llm/llm.service.ts`

Replace `summarizeEmail` (single-email path) with `summarizeEmailWithPhishingCheck` — or modify `summarizeEmail` to always include phishing. The cleanest approach is a unified method that always returns `{ summary, phishing }`.

```typescript
/**
 * Summarize an email AND check for phishing in a single LLM call.
 * Phishing analysis always runs. Keyword signals are passed as context to help the LLM.
 * This replaces the old summarizeEmail for the single-email code path.
 */
async summarizeEmailWithPhishingCheck(
  emailBody: string,
  emailSubject: string,
  summaryType: 'tldr' | 'bullet-points' | 'action-items' | 'sender-request' | 'custom',
  phishingSignals: PhishingSignals,
  provider?: LLMProvider,
  userId?: string,
): Promise<{ summary: string; phishing: PhishingLLMResult | null }> {
  const promptId = this.resolveSummaryPromptId(summaryType);
  const promptConfig = getPrompt(promptId);
  if (!promptConfig) { throw new StructuralError(`Prompt not found: ${promptId}`); }

  const cleanedBody = cleanEmailContent(emailBody, null, QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH);
  const isThread = emailBody.includes('[Message') && emailBody.includes('---');
  const prompt = renderPrompt(promptConfig.prompt || '', {
    isThread,
    subject: emailSubject,
    contextNote: isThread ? '...' : '',
    body: cleanedBody,
    phishingSignals,   // ← always injected; template always renders phishing block
  });

  const response = await this.generateText(
    {
      prompt,
      systemPrompt: promptConfig.systemPrompt || '',
      temperature: RATIOS.HALF,
      maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL + 150, // +150 for phishing JSON overhead
      jsonMode: true,
      userId,
    },
    provider,
    userId,
    LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING,
  );

  return this.parseSummaryWithPhishing(response);
}

/** Parse { summary, phishing } JSON from LLM response. Falls back gracefully. */
private parseSummaryWithPhishing(response: string): { summary: string; phishing: PhishingLLMResult | null } {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.summary === 'string') {
        return {
          summary: parsed.summary.trim(),
          phishing: this.validatePhishingLLMResult(parsed.phishing),
        };
      }
    }
  } catch { /* fall through */ }
  // If JSON parse fails, treat entire response as summary; use keyword signal as fallback
  return { summary: response.trim(), phishing: null };
}

private validatePhishingLLMResult(value: unknown): PhishingLLMResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const confidence = validatePhishingConfidence(v.confidence);
  if (typeof v.is_phishing !== 'boolean' || !confidence || typeof v.reason !== 'string') return null;
  return { is_phishing: v.is_phishing, confidence, reason: v.reason };
}

private resolveSummaryPromptId(summaryType: string): string {
  if (summaryType === 'bullet-points') return 'summarize_email_bullets';
  if (summaryType === 'action-items') return 'summarize_email_actions';
  return 'summarize_email_tldr'; // tldr, sender-request, custom
}
```

Also extend `summarizeThreads` to accept `batchPhishingSignals?: PhishingSignals[]` and pass it to the batch prompt renderer. The batch path always processes phishing for all emails.

#### New types

Add to `phishing-detection.service.ts`:
```typescript
export interface PhishingLLMResult {
  is_phishing: boolean;
  confidence: PhishingConfidence;
  reason: string;
}
```

(`PhishingSignals` is defined in section 1 above.)

---

### 6. `server/src/summarization/summarization.service.ts`

**`summarizeEmailWithPhishing` (the core change)**:

```typescript
async summarizeEmailWithPhishing(userId, emailId, rule, prefetchedEmail) {
  // ... existing fetch + thread logic unchanged ...

  // 1. Extract keyword signals across all thread emails (always runs — provides context to LLM)
  let phishingSignals: PhishingSignals = { hasDomainMismatch: false, senderDomain: null, linkedDomains: [], suspiciousKeywords: [], rawScore: 0 };
  let keywordSignal: PhishingSignal | null = null;
  for (const threadEmail of allThreadEmails) {
    const signals = extractPhishingSignals(threadEmail.from, threadEmail.body ?? '');
    // Merge: take domain mismatch if any email in thread has it, accumulate keywords
    phishingSignals = mergePhishingSignals(phishingSignals, signals);
    // Keep keyword signal as fallback (used only if LLM call fails)
    keywordSignal = mergeKeywordPhishingSignal(
      keywordSignal,
      detectPhishingSignal(threadEmail.from, threadEmail.body ?? ''),
    );
  }

  // 2. Check cache
  const cacheKey = this.buildPhishingCacheKey(email.from, email.subject);
  const cached = this.phishingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const summary = await this.generateLLMSummary(/* ... existing args ... */);
    return { summary, phishingSignal: cached.signal };
  }

  // 3. Always call LLM with phishing analysis piggybacked + keyword signals as context
  let summary: string;
  let phishingSignal: PhishingSignal | null;

  try {
    const result = await this.llmService.summarizeEmailWithPhishingCheck(
      emailWithHtml.body,
      subject,
      rule.type === 'custom' ? 'tldr' : rule.type,
      phishingSignals,   // always passed; LLM always decides
      undefined,
      userId,
    );
    summary = result.summary;
    if (result.phishing !== null) {
      // LLM result is authoritative
      phishingSignal = result.phishing.is_phishing
        ? { confidence: result.phishing.confidence, reason: result.phishing.reason }
        : null;  // LLM says safe → no signal (clears any keyword FP)
    } else {
      // LLM returned null phishing field → fall back to keyword signal
      phishingSignal = keywordSignal;
    }
  } catch (err) {
    // Graceful degradation: LLM call failed entirely
    logError('LLM summarization with phishing check failed, falling back', err);
    summary = await this.generateLLMSummary(/* ... existing args ... */);
    phishingSignal = keywordSignal;  // use keyword signal as best-effort fallback
  }

  // 4. Cache the phishing result (1 hour TTL)
  this.phishingCache.set(cacheKey, {
    signal: phishingSignal,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });

  return { summary, phishingSignal };
}
```

**Add cache fields to the class:**
```typescript
private readonly phishingCache = new Map<
  string,
  { signal: PhishingSignal | null; expiresAt: number }
>();

private buildPhishingCacheKey(from: string | undefined, subject: string | undefined): string {
  return `${(from ?? '').slice(0, 40)}::${(subject ?? '').slice(0, 40)}`;
}
```

**`summarizeThreadBatch` (batch path)**:
- Call `extractPhishingSignals` for each thread's latest email during `prepareThreadDataEntry`
- Collect as `batchPhishingSignals: PhishingSignals[]` (one per email, always)
- Pass `batchPhishingSignals` to `this.llmService.summarizeThreads(batchData, ..., batchPhishingSignals)`
- Parse extended response format: each result is always `{ summary: string, phishing: PhishingLLMResult | null }`
- Return type of `summarizeThreadBatch` changes to `Map<emailId, { summary: string, phishingSignal: PhishingSignal | null }>`

> **Note for Codebeard**: Check all callers of `summarizeThreadBatch` before changing the return type signature.

---

## Call Hierarchy (Where Things Change)

```
summarizeEmailWithAutoRule          ← calls summarizeEmailWithPhishing (already does)
summarizeEmailWithPhishing          ← CHANGED: always uses LLM phishing + keyword signals as context
summarizeThreadBatch                ← CHANGED: always passes batchPhishingSignals to LLM

LLMService.summarizeEmailWithPhishingCheck  ← NEW (replaces summarizeEmail for this path)
LLMService.summarizeThreads                 ← CHANGED: batchPhishingSignals param (always present)
LLMService.summarizeEmail                   ← UNCHANGED (still used by other callers)

phishing-detection.service.ts:
  extractPhishingSignals            ← NEW export (structured signals for LLM context)
  detectPhishingSignal              ← UNCHANGED (kept as graceful-degradation fallback)
  mergePhishingSignals              ← UNCHANGED
```

---

## Caching

A simple in-memory `Map` on `SummarizationService` is sufficient for now:
- **Key**: `from (40 chars) + "::" + subject (40 chars)` — cheap, no hashing library needed
- **TTL**: 1 hour — same sender+subject in a short window reuses the LLM result
- **No persistence**: Cache is process-scoped; restarts clear it (acceptable)
- **Scope**: Caches all emails (not just suspicious ones, since all emails now get LLM phishing analysis)

No Redis/external cache needed at this stage.

---

## Graceful Degradation

| Failure Mode | Behaviour |
|---|---|
| LLM call throws | Falls back to `generateLLMSummary` for summary; uses keyword `detectPhishingSignal` for phishing |
| LLM returns invalid JSON | `parseSummaryWithPhishing` returns `{ summary: rawResponse, phishing: null }`; keyword signal used |
| LLM returns `phishing: null` | Keyword signal used as fallback |
| LLM says `is_phishing: false` | Keyword signal suppressed (LLM wins — this is the false-positive fix) |
| LLM says `is_phishing: true` | LLM signal returned with LLM's confidence + reason |

---

## Token Cost Analysis

- **All emails**: ~150 extra output tokens per summarisation call for the phishing JSON.
- **No extra input tokens for keyword-free emails**: The keyword signals block is omitted from the prompt when `phishingSignals` is empty/zero.
- **Batch emails**: ~80 tokens per email for phishing JSON in the shared batch output.
- This is a small constant overhead on the existing LLM call — no additional API calls.

---

## promptfoo Test Cases

The existing promptfoo infrastructure lives in `server/promptfoo/`. Add a new test file:

**`server/promptfoo/summarize-email-phishing.yaml`**

```yaml
description: "Phishing detection accuracy tests for BearlyMail LLM analysis"

providers:
  - id: openai:gpt-5-mini
    config:
      reasoning_effort: low
      temperature: 0

prompts:
  - file://prompts/summarize-email-tldr.md

tests:
  # ─── Known phishing emails — MUST detect ───────────────────────────────────

  - description: "Classic credential phishing — bank account suspended"
    vars:
      isThread: false
      subject: "URGENT: Your account has been suspended"
      contextNote: ""
      body: |
        Dear Customer,

        We have detected suspicious activity on your Commonwealth Bank account.
        Your account has been temporarily suspended.

        To restore access, you must verify your identity immediately:
        https://commbank-secure-verify.xyz/login

        Failure to verify within 24 hours will result in permanent account closure.

        Commonwealth Bank Security Team
      phishingSignals:
        hasDomainMismatch: true
        senderDomain: "commbank-secure-verify.xyz"
        linkedDomains: ["commbank-secure-verify.xyz"]
        suspiciousKeywords: ["suspended", "verify", "urgent", "immediately"]
        rawScore: 8
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (!output.phishing) throw new Error('Expected phishing field in response');
          if (!output.phishing.is_phishing) throw new Error(`Expected is_phishing=true for credential phishing email. Got: ${JSON.stringify(output.phishing)}`);
          if (!['medium', 'high'].includes(output.phishing.confidence)) throw new Error(`Expected medium/high confidence, got: ${output.phishing.confidence}`);
          return true;

  - description: "PayPal phishing — fake payment confirmation with credential link"
    vars:
      isThread: false
      subject: "Your PayPal transaction #8847291 requires confirmation"
      contextNote: ""
      body: |
        Hi there,

        A payment of $847.00 was initiated from your PayPal account.

        If you did not authorise this transaction, click here immediately to cancel:
        https://paypal-support-center.ru/cancel?token=abc123

        Your account will be locked if you don't respond within 2 hours.

        PayPal Fraud Prevention
      phishingSignals:
        hasDomainMismatch: true
        senderDomain: "paypal-support-center.ru"
        linkedDomains: ["paypal-support-center.ru"]
        suspiciousKeywords: ["immediately", "locked", "cancel", "transaction"]
        rawScore: 9
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (!output.phishing) throw new Error('Expected phishing field');
          if (!output.phishing.is_phishing) throw new Error(`Expected is_phishing=true. Got: ${JSON.stringify(output.phishing)}`);
          return true;

  # ─── Legitimate emails with urgency language — must NOT flag ───────────────

  - description: "Legitimate project deadline reminder — urgency language but not phishing"
    vars:
      isThread: false
      subject: "URGENT: Q4 report due tomorrow"
      contextNote: ""
      body: |
        Hi Sarah,

        Just a reminder that the Q4 financial report is due tomorrow at 5pm.
        Please make sure to submit your section by end of day.

        If you have any questions, reply to this email or ping me on Slack.

        Thanks,
        Michael
      phishingSignals:
        hasDomainMismatch: false
        senderDomain: "company.com"
        linkedDomains: []
        suspiciousKeywords: ["urgent"]
        rawScore: 1
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (!output.summary) throw new Error('Expected summary field');
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: legitimate deadline email flagged as phishing. Reason: ${output.phishing?.reason}`);
          }
          return true;

  - description: "Legitimate password reset — real service, user-initiated"
    vars:
      isThread: false
      subject: "Reset your Focus Bear password"
      contextNote: ""
      body: |
        Hi Jeremy,

        We received a request to reset your Focus Bear password.
        Click the link below to set a new password:

        https://app.focusbear.io/reset-password?token=eyJh...

        This link expires in 1 hour. If you didn't request this, you can ignore this email.

        The Focus Bear Team
      phishingSignals:
        hasDomainMismatch: false
        senderDomain: "focusbear.io"
        linkedDomains: ["app.focusbear.io"]
        suspiciousKeywords: ["reset", "expires", "password"]
        rawScore: 3
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: legitimate password reset flagged. Reason: ${output.phishing?.reason}`);
          }
          return true;

  # ─── Legitimate noreply@ emails — must NOT flag ────────────────────────────

  - description: "Legitimate GitHub notification from noreply@"
    vars:
      isThread: false
      subject: "Re: [Focus-Bear/BearlyMail] Fix email parsing bug (PR #752)"
      contextNote: ""
      body: |
        @jeznag approved this pull request.

        https://github.com/Focus-Bear/BearlyMail/pull/752

        --
        You are receiving this because you authored the thread.
        Reply to this email directly or view it on GitHub:
        https://github.com/Focus-Bear/BearlyMail/pull/752#pullrequestreview-123456
      phishingSignals:
        hasDomainMismatch: false
        senderDomain: "github.com"
        linkedDomains: ["github.com"]
        suspiciousKeywords: []
        rawScore: 0
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: GitHub notification flagged. Reason: ${output.phishing?.reason}`);
          }
          return true;

  - description: "Legitimate noreply order confirmation"
    vars:
      isThread: false
      subject: "Your order #ORD-20240315-4821 has shipped"
      contextNote: ""
      body: |
        Hi Jeremy,

        Great news! Your order has shipped.

        Order: #ORD-20240315-4821
        Items: Standing desk mat x1
        Tracking: https://auspost.com.au/track?id=XP123456789AU

        Expected delivery: 2-3 business days.

        noreply@shopstore.com.au
      phishingSignals:
        hasDomainMismatch: false
        senderDomain: "shopstore.com.au"
        linkedDomains: ["auspost.com.au"]
        suspiciousKeywords: []
        rawScore: 0
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: legitimate order confirmation flagged. Reason: ${output.phishing?.reason}`);
          }
          return true;

  # ─── Domain mismatches that are legitimate (Mailchimp/SendGrid) ────────────

  - description: "Mailchimp newsletter — domain mismatch is expected, not phishing"
    vars:
      isThread: false
      subject: "Focus Bear monthly product update — March 2024"
      contextNote: ""
      body: |
        Focus Bear Product Update

        Hi Jeremy,

        Here's what's new in Focus Bear this month:
        • Improved habit streak tracking
        • New daily review templates
        • Bug fixes for calendar sync

        Read the full update: https://focusbear.io/blog/march-2024

        Unsubscribe: https://focusbear.us1.list-manage.com/unsubscribe?u=abc&id=xyz

        Focus Bear | hello@focusbear.io
      phishingSignals:
        hasDomainMismatch: true
        senderDomain: "mcsv.net"
        linkedDomains: ["focusbear.io", "focusbear.us1.list-manage.com"]
        suspiciousKeywords: []
        rawScore: 3
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: Mailchimp newsletter flagged as phishing. Domain mismatch is expected for ESP-sent emails. Reason: ${output.phishing?.reason}`);
          }
          return true;

  - description: "SendGrid transactional email — domain mismatch but legitimate"
    vars:
      isThread: false
      subject: "Your Focus Bear subscription receipt"
      contextNote: ""
      body: |
        Hi Jeremy,

        Thanks for your Focus Bear subscription!

        Plan: Pro Annual
        Amount: $79.99 AUD
        Date: 15 March 2024

        View your account: https://app.focusbear.io/account

        Focus Bear | https://focusbear.io
      phishingSignals:
        hasDomainMismatch: true
        senderDomain: "sendgrid.net"
        linkedDomains: ["app.focusbear.io", "focusbear.io"]
        suspiciousKeywords: []
        rawScore: 3
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: SendGrid receipt flagged. Known ESP domain mismatch. Reason: ${output.phishing?.reason}`);
          }
          return true;

  # ─── Edge cases ─────────────────────────────────────────────────────────────

  - description: "Edge case: phishing email with NO urgency keywords — relies on domain mismatch"
    vars:
      isThread: false
      subject: "Your account"
      contextNote: ""
      body: |
        Hello,

        Please log in to your account to complete setup.

        Click here: https://netflix-accounts-portal.ru/login

        Thank you,
        The Team
      phishingSignals:
        hasDomainMismatch: true
        senderDomain: "netflix-accounts-portal.ru"
        linkedDomains: ["netflix-accounts-portal.ru"]
        suspiciousKeywords: []
        rawScore: 3
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (!output.phishing || !output.phishing.is_phishing) {
            throw new Error(`Expected phishing detection for .ru domain impersonating Netflix. Got: ${JSON.stringify(output.phishing)}`);
          }
          return true;

  - description: "Edge case: internal-looking email with all signals clear — should be safe"
    vars:
      isThread: false
      subject: "Team lunch on Friday?"
      contextNote: ""
      body: |
        Hey everyone,

        Anyone keen for team lunch this Friday? Thinking Thai food around 12:30.

        Let me know!
        Priya
      phishingSignals:
        hasDomainMismatch: false
        senderDomain: "company.com"
        linkedDomains: []
        suspiciousKeywords: []
        rawScore: 0
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          if (output.phishing && output.phishing.is_phishing) {
            throw new Error(`False positive: casual internal email flagged. Reason: ${output.phishing?.reason}`);
          }
          return true;

  - description: "Edge case: ambiguous — financial email from correct domain (should be low confidence at most)"
    vars:
      isThread: false
      subject: "Action required: update your billing details"
      contextNote: ""
      body: |
        Hi Jeremy,

        Your Focus Bear subscription credit card ending in 4242 has expired.

        Please update your payment details to avoid service interruption:
        https://app.focusbear.io/billing

        The Focus Bear Team
      phishingSignals:
        hasDomainMismatch: false
        senderDomain: "focusbear.io"
        linkedDomains: ["app.focusbear.io"]
        suspiciousKeywords: ["action required", "expires", "update"]
        rawScore: 2
    assert:
      - type: javascript
        value: |
          const output = typeof output === 'string' ? JSON.parse(output) : output;
          // Should NOT flag as high-confidence phishing — matching domain + legit link
          if (output.phishing && output.phishing.is_phishing && output.phishing.confidence === 'high') {
            throw new Error(`Over-flagged: legit billing email from matching domain flagged high confidence. Reason: ${output.phishing?.reason}`);
          }
          return true;
```

---

## Testing (Unit + Integration)

- Unit test `extractPhishingSignals` — verify structured output for various from/body combinations
- Unit test `parseSummaryWithPhishing` — test valid JSON, malformed JSON, plain-text fallback
- Unit test `summarizeEmailWithPhishing` — mock LLM returning valid phishing result, null phishing, LLM throwing (graceful degradation)
- Run `promptfoo eval` on `summarize-email-phishing.yaml` — all cases must pass before shipping
- Integration test: send a Mailchimp-style marketing email → confirm phishing signal is null despite domain mismatch
- Integration test: send a credential-phishing email → confirm LLM sets `is_phishing: true`

---

## Open Questions

1. Should `confidence: 'low'` from LLM suppress the UI warning entirely, or still show a low-confidence indicator? (Currently keyword-only does show low-confidence warnings in some cases — check UI treatment before implementing.)
2. The batch path return type change (`Map<string, string>` → `Map<string, { summary, phishingSignal }>`) will touch callers — which controllers/jobs call `summarizeThreadBatch`? Codebeard should audit all callers before changing the signature.
3. Should the phishing cache persist across service restarts? (Redis would solve this but adds infra complexity — defer for now.)
4. Should known ESP sending domains (Mailchimp `mcsv.net`, SendGrid `sendgrid.net`, etc.) be in an allowlist to explicitly suppress domain-mismatch signals before passing to the LLM? Or is the current approach (LLM reasons about it with context) sufficient? Defer to Jeremy.

---

Closes #744
