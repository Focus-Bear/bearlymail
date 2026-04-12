# Plan: Fix suggested replies hallucinating calendar availability

## Problem

Suggested replies hallucinate specific calendar availability (e.g. "I'm available
tomorrow afternoon or Friday morning AEST — which works for you?") instead of using
the user's configured booking link. The LLM has no access to the user's actual
calendar and is fabricating times.

## Root Cause

In `server/promptfoo/prompts/generate-multiple-replies.md`, the booking link
instruction is wrapped in a conditional:

```
{% if calendarLink %}
SCHEDULING: If either reply option involves suggesting meeting times or discussing
availability, include this calendar booking link instead of proposing specific
times: {{calendarLink}}
{% endif %}
```

**Two problems:**

1. **No booking link configured → no guard at all.** When `calendarLink` is
   empty/null, the LLM receives zero instructions about scheduling. It freely
   invents specific times because nothing tells it not to.

2. **Weak instruction even when link IS configured.** The word "If" makes this a
   soft suggestion. The LLM sometimes ignores it and proposes times anyway.

## Investigation Findings

### Reply generation flow

1. `SuggestedRepliesProcessor.handleGenerateSuggestedRepliesJob()` in
   `server/src/suggested-replies/suggested-replies.processor.ts`
2. Calls `buildReplyContext()` which reads `user.calendarBookingUrl` into
   `userContext.calendarLink`
3. Calls `LLMService.generateReplyOptions()` in `server/src/llm/llm.service.ts`
   (~L1353) which renders the `generate-multiple-replies` prompt template
4. Prompt template: `server/promptfoo/prompts/generate-multiple-replies.md`

### Where booking link is stored

- `User.calendarBookingUrl` column in `server/src/database/entities/user.entity.ts` (L98-104)
- Encrypted at rest, nullable

### Other prompts affected

- `generate-meeting-reply.md` — already handled correctly (has both link and
  no-link paths with explicit "do NOT claim" instructions)
- `generate-follow-up.md` — does NOT include any scheduling guard. Could also
  hallucinate availability if the follow-up is about a meeting.

## Proposed Changes

### File 1: `server/promptfoo/prompts/generate-multiple-replies.md`

**Replace** the conditional scheduling block with an unconditional anti-hallucination
guard plus conditional link inclusion:

```markdown
## Scheduling Rules (ALWAYS APPLY)

NEVER propose specific dates, times, or time ranges for meetings or calls. You have NO
access to the user's calendar and MUST NOT hallucinate availability.

{% if calendarLink %}
When a reply involves scheduling a meeting or call, include this booking link so the
recipient can choose a time: {{calendarLink}}
Example: "Here's my booking link to find a time that works: {{calendarLink}}"
{% else %}
When a reply involves scheduling a meeting or call, ask the recipient to share their
availability or suggest coordinating via email. Do NOT propose specific times.
{% endif %}
```

**Location:** Replace lines 38-40 (the existing `{% if calendarLink %}...{% endif %}` block).

### File 2: `server/promptfoo/prompts/generate-follow-up.md`

**Add** a scheduling guard (this prompt currently has none):

```markdown
NEVER propose specific dates, times, or time ranges for meetings or calls. You have NO
access to the user's calendar. If the follow-up relates to scheduling, ask the recipient
to share their availability.
{% if schedulingLinkUrl %}
If relevant, include this booking link: {{schedulingLinkUrl}}
{% endif %}
```

**Location:** After the existing instructions, before the thread context section.

**Also requires:** Passing `calendarBookingUrl` / `schedulingLinkUrl` through
`generateFollowUpDraft()` in `server/src/llm/llm.service.ts` and the caller in
`suggested-replies.processor.ts`.

### File 3: `server/src/llm/llm.service.ts`

In `generateFollowUpDraft()` (~L1624):

- Add `calendarBookingUrl?: string` parameter
- Pass `schedulingLinkUrl: calendarBookingUrl || ""` to `renderPrompt()`

### File 4: `server/src/suggested-replies/suggested-replies.processor.ts`

In `generateReplySuggestions()`, the follow-up branch (~L218):

- Pass `user.calendarBookingUrl` (via `userContext.calendarLink`) to
  `generateFollowUpDraft()` as the new `calendarBookingUrl` parameter

## Test Plan

1. **Unit test** (`llm.service.spec.ts`): Verify `generateReplyOptions()` renders
   prompt with scheduling guard regardless of whether `calendarLink` is set
2. **Unit test** (`suggested-replies.processor.spec.ts`): Verify booking link flows
   through to both reply and follow-up generation
3. **Promptfoo eval**: Add test cases for scheduling emails with and without booking
   link to ensure no hallucinated times appear in output

## Files Summary

| File                                                          | Change                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `server/promptfoo/prompts/generate-multiple-replies.md`       | Replace conditional scheduling block with unconditional guard |
| `server/promptfoo/prompts/generate-follow-up.md`              | Add scheduling guard                                          |
| `server/src/llm/llm.service.ts`                               | Add `calendarBookingUrl` param to `generateFollowUpDraft()`   |
| `server/src/suggested-replies/suggested-replies.processor.ts` | Pass booking link to follow-up generation                     |

---

_Planned by Monk of Modularity 🧘 via OpenClaw_
