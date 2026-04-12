# Plan: Fix Compose Send Outputs Raw HTML Instead of Rendered Email

## Bug Summary

When sending an email from the compose window, recipients receive raw HTML tags as visible text
(e.g. `<p>Hi Badal,</p><p><strong>Current Performance Issues</strong></p>`) instead of rendered HTML.

## Root Cause

The compose flow sends the TipTap rich text editor's HTML output as `body` to `POST /emails/send`.
The controller passes this to `provider.sendEmail()` as the `body` parameter — but **never sets `htmlBody`**.

In `gmail-send.ts`, `buildEmailContent()` only generates `text/html` MIME parts when `options.htmlBody`
is provided. Without it, the email is sent as `Content-Type: text/plain; charset=UTF-8` with the raw
HTML string as visible body text.

The **reply flow** works correctly because `replies.service.ts` (line 602) passes
`htmlBody: bodyWithSignature` in the options to `sendReply()`.

### Flow trace

```
Compose.tsx:120     → payload = { body: form.body.trim() }   // form.body = HTML from TipTap
                    → POST /emails/send

emails.controller.ts:~490
                    → bodyWithSignature = appendSignature(body.body, user?.emailSignature)
                    → provider.sendEmail(userId, body.to, body.subject, bodyWithSignature, ...)
                                                                         ^^^^^^^^^^^^^^^^
                                                                         This is HTML but passed as `body`

gmail.provider.ts:~270
                    → buildEmailContent({ to, subject, body, cc, bcc, attachments })
                                                       ^^^^
                                                       HTML string, but htmlBody is undefined

gmail-send.ts:buildEmailContent()
                    → hasHtmlBody = !!options.htmlBody  // FALSE — htmlBody never set
                    → falls through to simple text path:
                      Content-Type: text/plain; charset=UTF-8
                      [raw HTML tags visible as text]
```

## Affected Files & Line Numbers

| File                                              | Line(s) | Issue                                                             |
| ------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| `server/src/emails/emails.controller.ts`          | ~490    | `send` endpoint passes body as plain text only                    |
| `server/src/emails/providers/gmail.provider.ts`   | ~270    | `sendEmail()` calls `buildEmailContent()` without `htmlBody`      |
| `server/src/emails/providers/gmail/gmail-send.ts` | ~60-70  | `buildEmailContent()` only emits HTML MIME when `htmlBody` is set |
| `server/src/emails/email-controller.helpers.ts`   | 22-26   | `appendSignature()` concatenates with `\n\n` (not HTML-aware)     |

## Minimal Fix

### 1. `server/src/emails/providers/gmail.provider.ts` — `sendEmail()` (~line 270)

Pass `body` as both plain-text fallback and `htmlBody`:

```typescript
// BEFORE:
const emailContent = buildEmailContent({
  to,
  subject,
  body,
  cc,
  bcc,
  attachments,
});

// AFTER:
const emailContent = buildEmailContent({
  to,
  subject,
  body: stripHtmlTags(body), // plain-text fallback
  htmlBody: body, // HTML content from rich text editor
  cc,
  bcc,
  attachments,
});
```

### 2. Add `stripHtmlTags` utility

Create or use an existing HTML-to-text function that strips tags for the plain-text MIME part.
A simple implementation:

```typescript
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
```

### 3. `server/src/emails/email-controller.helpers.ts` — `appendSignature()` (line 22)

Make signature appending HTML-aware. Currently it uses `\n\n` which breaks HTML structure:

```typescript
// BEFORE:
export const appendSignature = (
  emailBody: string,
  userSignature?: string | null,
): string =>
  `${emailBody}\n\n${userSignature ?? EMAIL_CONTROLLER_DEFAULTS.DEFAULT_SIGNATURE}`;

// AFTER:
export const appendSignature = (
  emailBody: string,
  userSignature?: string | null,
): string => {
  const signature =
    userSignature ?? EMAIL_CONTROLLER_DEFAULTS.DEFAULT_SIGNATURE;
  // If body contains HTML, wrap signature in HTML
  if (emailBody.includes("<") && emailBody.includes(">")) {
    return `${emailBody}<br><br>${signature}`;
  }
  return `${emailBody}\n\n${signature}`;
};
```

### 4. Interface consistency check

The `EmailProvider` interface's `sendEmail()` only accepts a single `body: string`. Consider adding
an optional `htmlBody` parameter for consistency with `sendReply()`, OR document that `body` should
always be treated as HTML for compose flows (matching Office365/Zoho behavior).

## Testing

1. Send a composed email with bold text, lists, links
2. Verify recipient sees rendered HTML, not raw tags
3. Verify plain-text email clients see stripped plain text (not HTML tags)
4. Verify reply flow still works correctly (regression check)
5. Verify scheduled compose emails also work (they store `body` and send later via same path)
6. Verify email signature is properly appended in HTML context

## Risk Assessment

- **Low risk** — the fix is isolated to the send path
- **No schema changes** needed
- **Reply flow unaffected** — it already passes `htmlBody` correctly
- **Office365/Zoho** — already treat body as HTML, so they work but should also get the `appendSignature` HTML fix

---

_Investigated by Monk of Modularity 🧘 via OpenClaw_
