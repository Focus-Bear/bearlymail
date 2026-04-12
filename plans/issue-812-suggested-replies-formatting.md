# Plan: Suggested replies formatted poorly and are missing scheduling link

**Issue:** Focus-Bear/BearlyMail#812  
**Priority:** Normal

---

## Problem Summary

Two distinct issues with AI-generated suggested replies:

1. **Formatting:** Suggested replies appear as a wall of text with no line breaks between paragraphs — looks broken
2. **Missing scheduling link:** When the AI suggests a meeting time or availability, it doesn't include the user's calendar booking link (a BearlyMail feature)

---

## Root Cause Analysis

### Issue 1: Formatting

The `generate-multiple-replies.md` prompt **already includes explicit formatting instructions**:

```
CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE EXACTLY:
- Include proper line breaks between paragraphs using actual newline characters (\n)
- Start with a greeting on its own line, followed by TWO newlines
...
```

Despite these instructions, the screenshot in the issue shows all text run together. This suggests:

**A. The prompt instructions are not being followed by the LLM consistently.** Instructions in the middle/end of long prompts are often ignored. The formatting rules may need to be reinforced or restructured.

**B. The reply text is being rendered as-is in a `<pre>` or plain text context** that doesn't translate `\n` to line breaks — but actually the `useReplyDraftGeneration.ts` hook calls `plainTextToHtml()` to convert the text:

```typescript
// Pure helper: converts raw options to HTML and applies them to state.
function applyGeneratedOptions(...)
```

**C. The `plainTextToHtml` conversion may not be handling the newlines correctly.** If the LLM returns `\n` as literal backslash-n (string escape sequence) rather than actual newline characters, `plainTextToHtml` would not convert them to `<br>` tags.

**Most likely cause: The LLM returns escaped `\n` sequences in JSON (`\\n`) rather than real newlines.** When JSON-parsed, `\\n` becomes `\n` (literal 2 chars), but the text renderer may not be substituting these into HTML line breaks.

**D. The `generate-meeting-reply.md` prompt** (used for scheduling requests) does **not** include the formatting rules that the `generate-multiple-replies.md` prompt has. The meeting reply prompt generates a single plain text response without explicit line-break requirements.

### Issue 2: Missing scheduling link

Looking at `generate-meeting-reply.md`:

```
{% if calendarLink %}
You can also book directly on my calendar: {{calendarLink}}
{% endif %}
```

The `calendarLink` template variable exists in the prompt, but it's only used in `generate-meeting-reply.md` (for meeting scheduling replies). However:

1. **`calendarLink` is not passed from the `LLMService.generateReplyOptions()` call** in `suggested-replies.processor.ts` — the processor builds `userContext` but does not include a booking/calendar link
2. **There's no `calendarLink`/`bookingLink` field in `user.entity.ts`** — the user entity doesn't store a calendar booking URL
3. The feature may rely on `SchedulePopup.tsx` / `scheduleUtils.ts` for calendar integration, but this is only invoked for manual compose, not AI-suggested replies

---

## Code Locations

| File                                                          | Relevance                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `server/promptfoo/prompts/generate-multiple-replies.md`       | Prompt for multi-option replies (has formatting rules but they may not be followed) |
| `server/promptfoo/prompts/generate-meeting-reply.md`          | Prompt for meeting replies (has `calendarLink` var but it's never passed)           |
| `server/src/suggested-replies/suggested-replies.processor.ts` | Builds `replyContext` — doesn't include booking link                                |
| `server/src/llm/llm.service.ts`                               | `generateReplyOptions()` — passes `userContext` to prompt                           |
| `client/src/hooks/useReplyDraftGeneration.ts`                 | `applyGeneratedOptions()` — converts text to HTML for display                       |
| `client/src/utils/emailUtils.ts`                              | `plainTextToHtml()` — converts `\n` to `<br>`                                       |
| `server/src/database/entities/user.entity.ts`                 | User profile — no booking link field currently                                      |

---

## Fix Plan

### Fix 1: Resolve the newline/formatting issue

**1a. Verify the actual LLM output format**

Add debug logging (or use the existing `ReplyComposerDebugPanel`) to inspect the raw text returned from the LLM before `plainTextToHtml()` is called. This will confirm whether:

- The LLM returns real `\n` characters, or
- It returns literal `\\n` string sequences in JSON

**1b. Fix `plainTextToHtml` if needed**

In `client/src/utils/emailUtils.ts`, ensure `plainTextToHtml` handles both cases:

```typescript
export function plainTextToHtml(text: string): string {
  // Normalize both real newlines and escaped \n sequences
  const normalized = text.replace(/\\n/g, "\n");
  return normalized
    .split("\n")
    .map((line) => (line === "" ? "<br>" : `<p>${escapeHtml(line)}</p>`))
    .join("");
}
```

**1c. Restructure the prompt to ensure formatting compliance**

Move the formatting rules to the **system prompt** (higher priority for LLMs) rather than the user prompt:

In `generate-multiple-replies.md`, separate system and user instructions clearly. The critical formatting rules should be in the system prompt section:

```markdown
---
system: |
  You are a professional email writing assistant. ALWAYS format emails with proper paragraph breaks.
  Use \n\n between paragraphs. Never run paragraphs together.
---
```

**1d. Add formatting to `generate-meeting-reply.md`**

This prompt lacks the formatting rules entirely. Add the same formatting section as `generate-multiple-replies.md`.

### Fix 2: Add calendar booking link to user profile + replies

**2a. Add `calendarBookingUrl` field to user entity**

```typescript
// server/src/database/entities/user.entity.ts
@Column({
  nullable: true,
  transformer: encryptedColumnTransformer,
  comment: "User's calendar booking link for scheduling replies (encrypted)",
})
calendarBookingUrl: string;
```

Create migration: `<timestamp>-AddCalendarBookingUrlToUsers.ts`

**2b. Add settings UI for booking link**

In `client/src/components/settings/guide-ai/ProfileSettingsSection.tsx` (or a new `SchedulingSettingsSection`), add an input field for the user to enter their calendar booking URL (Calendly, Cal.com, Google Calendar booking link, etc.).

**2c. Pass booking link to LLM when generating replies**

In `suggested-replies.processor.ts`, include `calendarBookingUrl` in the context passed to the LLM:

```typescript
private buildReplyContext(user: User, latestEmail: Email): ReplyContext {
  // ... existing code ...
  return {
    userEmail,
    userSentLast,
    userContext: {
      tone: 'professional',
      userName: user?.displayName || user?.name || 'User',
      userJobTitle: user?.jobTitle || '',
      emailExamples,
      calendarBookingUrl: user?.calendarBookingUrl || null,  // ADD THIS
    },
    emailExamples,
  };
}
```

**2d. Use booking link in prompts**

In `generate-multiple-replies.md`, add a conditional section:

```
{% if calendarBookingUrl %}
IMPORTANT: If the reply involves scheduling or availability, include this booking link: {{calendarBookingUrl}}
{% endif %}
```

In `generate-meeting-reply.md`, ensure `calendarLink` is passed correctly (rename to `calendarBookingUrl` for consistency or map it in the template render call).

---

## Implementation Order

1. **First:** Debug and fix the formatting issue (1a → 1b → 1c) — no DB changes needed
2. **Second:** Add `calendarBookingUrl` to user entity + migration (2a)
3. **Third:** Add settings UI (2b)
4. **Fourth:** Wire booking URL into LLM context + prompts (2c, 2d)

---

## Testing Checklist

- [ ] Suggested reply for a standard email shows properly formatted paragraphs (with line breaks)
- [ ] Meeting scheduling reply includes the user's booking link (if configured in settings)
- [ ] User can set/update their calendar booking URL in settings
- [ ] Booking URL is encrypted at rest (using `encryptedColumnTransformer`)
- [ ] If no booking URL is set, replies still work correctly (no broken template)
- [ ] `generate-meeting-reply.md` flow also formats correctly

---

## Acceptance Criteria (from issue)

- [ ] Line breaks render correctly in suggested replies (no wall-of-text formatting)
- [ ] Scheduling replies include the user's calendar booking link when available
- [ ] AI does not hallucinate availability — uses real booking link instead
