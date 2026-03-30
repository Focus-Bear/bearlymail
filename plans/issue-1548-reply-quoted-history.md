# Plan: Include Quoted Email Chain in Replies (Issue #1548)

**Branch:** `openclaw/issue-1548/reply-quoted-history`  
**Issue:** #1548 — "History not preserved for other people?"  
**Author:** Monk of Modularity (AI planning agent)

---

## Problem Statement

When a user replies to an email via BearlyMail, the outgoing reply message body contains **only the new reply text** (plus the user's email signature). The original email content and any prior conversation chain is **not quoted** in the outgoing message.

This means:
- Other recipients (CC'd parties, or anyone joining the thread later) receive a reply with no conversational context.
- Standard email etiquette and client conventions (Gmail, Outlook, Apple Mail) all include a quoted block below the reply so every participant can see the thread history.
- BearlyMail replies are effectively "orphaned" — they make no sense to recipients who haven't memorised the prior messages.

---

## Current Behaviour (Root Cause)

### Where the reply body is assembled

**`server/src/replies/replies.service.ts` — `buildReplyPayload()`**

```ts
const bodyForSending = isForward
  ? this.buildForwardBody(body, email)   // ← forwards get quoted content
  : body;                                 // ← replies DO NOT
const bodyWithSignature = this.appendSignature(bodyForSending, user.emailSignature);
```

The ternary is asymmetric: **`buildForwardBody()`** exists and correctly prepends a forwarding header + original content to forward emails. But for regular replies, `body` (the user's typed text) is passed through unchanged — no quoted block is appended.

There is **no** equivalent `buildReplyBody()` / `appendQuotedMessage()` function for regular replies.

### Provider-level: no quoted body either

Gmail (`gmail.provider.ts`), Office 365 (`office365-operations.ts`), and Zoho (`zoho-operations.ts`) all send whatever `htmlBody` / `body` they are given. None of them inject quoted content automatically. The `In-Reply-To` / `References` headers used by Gmail thread replies control **threading** in the provider's mailbox, but do not add quoted content visible to recipients of external email clients.

### LLM draft generation: actively strips quoted content

`server/src/llm/email-content-cleaner.ts` and `writing-style-learning.service.ts` both strip "On [date], [name] wrote:" blocks from incoming emails before processing. This is correct behaviour for summarisation/tone learning, but it confirms there is no path that re-injects this content into outgoing replies.

---

## Expected Behaviour

When a user sends a reply (not a forward) via BearlyMail, the outgoing email body should include:

**Plain text format:**
```
<user's new reply text>

---

On <original email date>, <original sender name> <sender@example.com> wrote:

> <original email body>
```

**HTML format:**
```html
<p><user's new reply text></p>

<blockquote style="margin: 0 0 0 0.8ex; border-left: 1px solid #ccc; padding-left: 1ex;">
  <div>On <date>, <sender> wrote:</div>
  <div><original HTML body></div>
</blockquote>
```

This matches the convention used by Gmail, Outlook, and Apple Mail.

---

## Implementation Plan

### Step 1 — Add `buildReplyQuotedBody()` in `replies.service.ts`

Create a private method analogous to the existing `buildForwardBody()`:

```ts
private buildReplyQuotedBody(userText: string, originalEmail: Email): string {
  const fromDisplay = originalEmail.fromName
    ? `${originalEmail.fromName} <${originalEmail.from}>`
    : originalEmail.from;
  const dateStr = originalEmail.receivedAt.toUTCString();

  // Plain-text quoted block
  const quotedHeader = `On ${dateStr}, ${fromDisplay} wrote:`;
  const originalBody = originalEmail.body || '';
  // Indent each line with "> " for plain-text convention
  const quotedBody = originalBody
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');

  return `${userText}\n\n${quotedHeader}\n${quotedBody}`;
}
```

And a companion HTML version for the `htmlBody` path:

```ts
private buildReplyQuotedHtmlBody(userHtml: string, originalEmail: Email): string {
  const fromDisplay = originalEmail.fromName
    ? `${originalEmail.fromName} &lt;${originalEmail.from}&gt;`
    : originalEmail.from;
  const dateStr = originalEmail.receivedAt.toUTCString();

  const originalHtml = originalEmail.htmlBody || originalEmail.body || '';
  const quotedBlock = `
    <br>
    <blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #cccccc;padding-left:1ex">
      <div>On ${dateStr}, ${fromDisplay} wrote:</div>
      ${originalHtml}
    </blockquote>
  `;

  return `${userHtml}${quotedBlock}`;
}
```

### Step 2 — Wire into `buildReplyPayload()` in `replies.service.ts`

The existing ternary:
```ts
const bodyForSending = isForward
  ? this.buildForwardBody(body, email)
  : body;
```

Should become:
```ts
const bodyForSending = isForward
  ? this.buildForwardBody(body, email)
  : this.buildReplyQuotedBody(body, email);
```

And for the HTML body path (used by `dispatchReply → provider.sendReply → options.htmlBody`):  
The `bodyWithSignature` is currently used as both the plain-text `body` and the `htmlBody` in `dispatchReply`. We need to thread the HTML-quoted version through as well.

**Concrete change in `buildReplyPayload()`:**
```ts
const bodyForSending = isForward
  ? this.buildForwardBody(body, email)
  : this.buildReplyQuotedBody(body, email);

const htmlBodyForSending = isForward
  ? this.buildForwardBody(body, email)          // forward body is already plain-text-only; acceptable
  : this.buildReplyQuotedHtmlBody(body, email);  // NEW: HTML quoted version

const bodyWithSignature = this.appendSignature(bodyForSending, user.emailSignature);
const htmlBodyWithSignature = this.appendSignature(htmlBodyForSending, user.emailSignature);
```

Then update `ReplyPayload` type to carry both:
```ts
type ReplyPayload = {
  bodyWithSignature: string;
  htmlBodyWithSignature: string;   // NEW
  replySubject: string;
  replyToAddress: string;
  allAttachments: ReplyAttachment[];
  allInlineImages: InlineImage[];
};
```

And in `dispatchReply()`, pass `htmlBodyWithSignature` as the `htmlBody` option:
```ts
return provider.sendReply(userId, {
  threadId: email.threadId,
  to: replyToAddress,
  subject: replySubject,
  body: bodyWithSignature,
  options: {
    attachments: ...,
    htmlBody: htmlBodyWithSignature,   // ← was: bodyWithSignature (same string used for both)
    cc: cc || undefined,
    bcc: bcc || undefined,
  },
});
```

### Step 3 — User setting: opt-out of quoted history (optional / future)

Many users want quoted history; some prefer clean replies. For now, **always include quoted content** (matching the Gmail default). A future ticket can add a "Include email chain in replies" toggle in Settings if user feedback requests it.

> **Note for Codebeard:** Do not add the toggle in this ticket — keep scope minimal. File a follow-up issue if needed.

### Step 4 — `email-content-cleaner.ts`: no change needed

The cleaner strips quoted content from **incoming** emails before LLM processing. That path is independent of outgoing reply construction. No changes needed here.

---

## Files to Change

| File | Change |
|------|--------|
| `server/src/replies/replies.service.ts` | Add `buildReplyQuotedBody()`, `buildReplyQuotedHtmlBody()`; update `buildReplyPayload()` and `ReplyPayload` type; update `dispatchReply()` to pass `htmlBodyWithSignature` |

> No frontend changes required — the draft body sent by the client is unchanged; the server appends the quoted content before dispatch.

---

## Edge Cases

1. **Original email has no body** — Both plain-text and HTML builders should fall back gracefully to empty string (`''`). The reply sends cleanly with no quoted block.

2. **Very long email chains** — The `originalEmail.body` / `htmlBody` contains the full accumulated chain (as stored in the DB). Including it verbatim may produce large email bodies. For now this is acceptable (matches Gmail behaviour). If performance becomes a concern, truncation can be added later.

3. **Forward replies** — `isForward=true` already uses `buildForwardBody()` which includes the full original. No change needed for that path.

4. **Scheduled replies** — The scheduled send path goes through the same `sendReply()` / `buildReplyPayload()` call chain. The fix applies automatically.

5. **Office 365 replies** — `sendReplyViaOffice365` currently calls `/me/sendMail` (new mail, not `reply` action). It doesn't use the Graph API's native `createReply` endpoint which would auto-quote. Our fix appends the quoted block in the body directly, which works for this implementation. No provider-level changes needed.

6. **Zoho replies** — Same as O365: the quoted body is injected into the `htmlBody` we send. Works correctly.

7. **Auto-responder / workflow replies** — These go through a different code path (not `replies.service.ts`). Quoted content for automated replies is out of scope for this ticket.

---

## Testing Notes

- Unit test: `replies.service.spec.ts` — add tests for `buildReplyQuotedBody()` and `buildReplyQuotedHtmlBody()` with emails that have a body, emails with no body, and emails with HTML body.
- Integration: manually send a reply in staging; verify the received email shows the quoted original beneath the new reply text.
- Verify forwards still work correctly (regression check on `buildForwardBody` path).

---

## Summary

**Root cause:** `buildReplyPayload()` in `replies.service.ts` passes the user's reply body directly to the provider without appending the quoted original message. Forwards already have this logic (`buildForwardBody()`), but regular replies do not.

**Fix:** Add `buildReplyQuotedBody()` (plain text) and `buildReplyQuotedHtmlBody()` (HTML with `<blockquote>`) in `replies.service.ts`, and call them from `buildReplyPayload()` on the reply path (non-forward).

**Scope:** Server-only change. No frontend modifications required.
